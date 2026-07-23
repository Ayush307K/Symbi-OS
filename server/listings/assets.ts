import { createHash, randomUUID } from "node:crypto";
import sharp, { type Sharp } from "sharp";
import { ApiError } from "@/server/http";
import { putObject } from "@/server/listings/storage";

export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;
export const MAX_LISTING_PHOTOS = 5;

export type PreparedAsset = {
  id: string;
  kind: "PHOTO" | "CERTIFICATE" | "TEST_REPORT";
  storageKey: string;
  thumbnailKey: string | null;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string;
  width: number | null;
  height: number | null;
  visibility: "PUBLIC" | "PRIVATE";
};

function hasPrefix(buffer: Buffer, prefix: number[]) {
  return prefix.every((value, index) => buffer[index] === value);
}

function detectPhotoMime(buffer: Buffer) {
  if (hasPrefix(buffer, [0xff, 0xd8, 0xff])) return "image/jpeg" as const;
  if (hasPrefix(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png" as const;
  }
  return null;
}

function safeOriginalName(name: string) {
  return name
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}._ -]/gu, "_")
    .slice(0, 180);
}

function checksum(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

export async function preparePhoto(
  listingId: string,
  file: File,
): Promise<PreparedAsset> {
  if (file.size <= 0 || file.size > MAX_PHOTO_BYTES) {
    throw new ApiError(
      422,
      "Each photo must be between 1 byte and 10 MB.",
      "PHOTO_SIZE_INVALID",
    );
  }
  const input = Buffer.from(await file.arrayBuffer());
  const detected = detectPhotoMime(input);
  if (!detected) {
    throw new ApiError(
      422,
      "Only genuine JPG and PNG photos are accepted.",
      "PHOTO_TYPE_INVALID",
    );
  }

  let image: Sharp;
  try {
    image = sharp(input, { failOn: "error", limitInputPixels: 40_000_000 }).rotate();
    await image.metadata();
  } catch {
    throw new ApiError(422, "The photo is corrupt or unsafe.", "PHOTO_DECODE_FAILED");
  }

  const id = randomUUID();
  const extension = detected === "image/jpeg" ? "jpg" : "png";
  const storageKey = `listings/${listingId}/photos/${id}.${extension}`;
  const thumbnailKey = `listings/${listingId}/photos/${id}.thumb.jpg`;
  const sanitized =
    detected === "image/jpeg"
      ? await image.clone().jpeg({ quality: 88, mozjpeg: true }).toBuffer()
      : await image.clone().png({ compressionLevel: 9 }).toBuffer();
  const thumbnail = await image
    .clone()
    .resize({ width: 640, height: 480, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
  const metadata = await sharp(sanitized).metadata();

  await Promise.all([
    putObject(storageKey, sanitized, detected),
    putObject(thumbnailKey, thumbnail, "image/jpeg"),
  ]);

  return {
    id,
    kind: "PHOTO",
    storageKey,
    thumbnailKey,
    originalName: safeOriginalName(file.name || `photo.${extension}`),
    mimeType: detected,
    sizeBytes: sanitized.length,
    checksumSha256: checksum(sanitized),
    width: metadata.width ?? null,
    height: metadata.height ?? null,
    visibility: "PUBLIC",
  };
}

export async function prepareDocument(
  listingId: string,
  file: File,
  kind: "CERTIFICATE" | "TEST_REPORT",
): Promise<PreparedAsset> {
  return preparePrivatePdf(
    `listings/${listingId}/documents`,
    file,
    kind,
  );
}

export async function preparePrivatePdf(
  storagePrefix: string,
  file: File,
  kind: "CERTIFICATE" | "TEST_REPORT" | "ONBOARDING_DOCUMENT",
): Promise<PreparedAsset> {
  if (file.size <= 0 || file.size > MAX_DOCUMENT_BYTES) {
    throw new ApiError(
      422,
      "Each document must be between 1 byte and 15 MB.",
      "DOCUMENT_SIZE_INVALID",
    );
  }
  const body = Buffer.from(await file.arrayBuffer());
  if (!hasPrefix(body, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
    throw new ApiError(
      422,
      "Only genuine PDF documents are accepted.",
      "DOCUMENT_TYPE_INVALID",
    );
  }
  const searchable = body
    .subarray(0, Math.min(body.length, 2_000_000))
    .toString("latin1");
  if (
    /\/(?:JavaScript|JS|Launch|EmbeddedFile|OpenAction)\b/i.test(searchable)
  ) {
    throw new ApiError(
      422,
      "PDFs containing scripts, launch actions, or embedded files are not accepted.",
      "DOCUMENT_ACTIVE_CONTENT_REJECTED",
    );
  }
  const id = randomUUID();
  const storageKey = `${storagePrefix.replace(/\/+$/, "")}/${id}.pdf`;
  await putObject(storageKey, body, "application/pdf");
  return {
    id,
    kind: kind === "ONBOARDING_DOCUMENT" ? "CERTIFICATE" : kind,
    storageKey,
    thumbnailKey: null,
    originalName: safeOriginalName(file.name || "document.pdf"),
    mimeType: "application/pdf",
    sizeBytes: body.length,
    checksumSha256: checksum(body),
    width: null,
    height: null,
    visibility: "PRIVATE",
  };
}
