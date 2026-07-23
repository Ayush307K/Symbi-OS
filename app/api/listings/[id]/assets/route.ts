import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import {
  apiError,
  ApiError,
  assertTrustedOrigin,
  parseJson,
  requireUser,
} from "@/server/http";
import {
  MAX_LISTING_PHOTOS,
  prepareDocument,
  preparePhoto,
} from "@/server/listings/assets";
import {
  recordListingEvent,
  requireOwnedListing,
} from "@/server/listings/lifecycle";
import { deleteObject } from "@/server/listings/storage";

const reorderSchema = z.object({
  photoIds: z.array(z.string().uuid()).min(1).max(MAX_LISTING_PHOTOS),
  version: z.coerce.number().int().positive(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let prepared:
    | Awaited<ReturnType<typeof preparePhoto>>
    | Awaited<ReturnType<typeof prepareDocument>>
    | undefined;
  try {
    assertTrustedOrigin(request);
    const auth = await requireUser(["SELLER"]);
    const { id } = await params;
    const listing = await requireOwnedListing(id, auth);
    if (!["DRAFT", "REJECTED", "PAUSED"].includes(listing.status)) {
      throw new ApiError(
        409,
        "Assets can only be changed while a listing is editable.",
        "INVALID_LISTING_STATE",
      );
    }

    const form = await request.formData();
    const file = form.get("file");
    const kind = String(form.get("kind") || "PHOTO").toUpperCase();
    if (!(file instanceof File)) {
      throw new ApiError(422, "Choose a file to upload.", "FILE_REQUIRED");
    }
    if (!["PHOTO", "CERTIFICATE", "TEST_REPORT"].includes(kind)) {
      throw new ApiError(422, "Unsupported asset kind.", "ASSET_KIND_INVALID");
    }
    if (kind === "PHOTO") {
      const photoCount = await prisma.listingAsset.count({
        where: { listingId: listing.id, kind: "PHOTO" },
      });
      if (photoCount >= MAX_LISTING_PHOTOS) {
        throw new ApiError(
          409,
          "A listing can contain at most five photos.",
          "PHOTO_LIMIT_REACHED",
        );
      }
      prepared = await preparePhoto(listing.id, file);
    } else {
      prepared = await prepareDocument(
        listing.id,
        file,
        kind as "CERTIFICATE" | "TEST_REPORT",
      );
    }

    const asset = await prisma.$transaction(async (tx) => {
      const sortOrder =
        prepared!.kind === "PHOTO"
          ? await tx.listingAsset.count({
              where: { listingId: listing.id, kind: "PHOTO" },
            })
          : 0;
      const created = await tx.listingAsset.create({
        data: {
          ...prepared!,
          listingId: listing.id,
          ownerUserId: auth.userId,
          sortOrder,
        },
      });
      await recordListingEvent(tx, {
        listingId: listing.id,
        actorUserId: auth.userId,
        type: `${prepared!.kind}_UPLOADED`,
        version: listing.version,
        note: prepared!.originalName,
      });
      return created;
    });

    return NextResponse.json(
      {
        asset: {
          id: asset.id,
          kind: asset.kind,
          originalName: asset.originalName,
          mimeType: asset.mimeType,
          sizeBytes: asset.sizeBytes,
          sortOrder: asset.sortOrder,
          url: `/api/listings/${listing.id}/assets/${asset.id}`,
          thumbnailUrl:
            asset.kind === "PHOTO"
              ? `/api/listings/${listing.id}/assets/${asset.id}?variant=thumbnail`
              : null,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (prepared) {
      await Promise.all([
        deleteObject(prepared.storageKey).catch(() => undefined),
        prepared.thumbnailKey
          ? deleteObject(prepared.thumbnailKey).catch(() => undefined)
          : Promise.resolve(),
      ]);
    }
    return apiError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertTrustedOrigin(request);
    const auth = await requireUser(["SELLER"]);
    const { id } = await params;
    const body = await parseJson(request, reorderSchema);
    const listing = await requireOwnedListing(id, auth);
    if (body.version !== listing.version) {
      throw new ApiError(
        409,
        "This listing changed in another session. Reload and retry.",
        "LISTING_VERSION_CONFLICT",
      );
    }
    const photos = await prisma.listingAsset.findMany({
      where: { listingId: listing.id, kind: "PHOTO" },
      select: { id: true },
    });
    const actual = new Set(photos.map((photo) => photo.id));
    if (
      actual.size !== body.photoIds.length ||
      body.photoIds.some((photoId) => !actual.has(photoId))
    ) {
      throw new ApiError(
        422,
        "Photo order must contain every current photo exactly once.",
        "PHOTO_ORDER_INVALID",
      );
    }
    await prisma.$transaction(async (tx) => {
      for (const [sortOrder, photoId] of body.photoIds.entries()) {
        await tx.listingAsset.update({
          where: { id: photoId },
          data: { sortOrder },
        });
      }
      await recordListingEvent(tx, {
        listingId: listing.id,
        actorUserId: auth.userId,
        type: "PHOTOS_REORDERED",
        version: listing.version,
      });
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
