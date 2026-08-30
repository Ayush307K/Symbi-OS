import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  prepareDocument,
  preparePhoto,
} from "@/server/listings/assets";
import {
  listingDraftSchema,
  listingUpdateSchema,
  submissionErrors,
} from "@/server/listings/lifecycle";
import {
  getObject,
  resetStorageConfigForTests,
  setLocalStorageRootForTests,
} from "@/server/listings/storage";

let storageRoot = "";

beforeEach(async () => {
  storageRoot = await mkdtemp(join(tmpdir(), "symbios-listing-assets-"));
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("OBJECT_STORAGE_PROVIDER", "local");
  setLocalStorageRootForTests(storageRoot);
});

afterEach(async () => {
  resetStorageConfigForTests();
  vi.unstubAllEnvs();
  await rm(storageRoot, { recursive: true, force: true });
});

describe("listing asset processing", () => {
  it("verifies, sanitizes, stores, and thumbnails a real JPEG", async () => {
    const input = await sharp({
      create: {
        width: 1200,
        height: 800,
        channels: 3,
        background: "#16805d",
      },
    })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();
    const file = new File([new Uint8Array(input)], "material.jpg", {
      type: "image/png",
    });

    const asset = await preparePhoto("listing_test", file);
    expect(asset.kind).toBe("PHOTO");
    expect(asset.mimeType).toBe("image/jpeg");
    expect(asset.visibility).toBe("PUBLIC");
    expect(asset.width).toBe(800);
    expect(asset.height).toBe(1200);
    expect(asset.thumbnailKey).toBeTruthy();

    const stored = await getObject(asset.storageKey);
    const metadata = await sharp(stored.body).metadata();
    expect(metadata.exif).toBeUndefined();
    expect(metadata.icc).toBeUndefined();

    const thumbnail = await getObject(asset.thumbnailKey!);
    const thumbMetadata = await sharp(thumbnail.body).metadata();
    expect(thumbMetadata.width).toBeLessThanOrEqual(640);
    expect(thumbMetadata.height).toBeLessThanOrEqual(480);
  });

  it("rejects extension and MIME spoofing when bytes are not an image", async () => {
    const file = new File(
      [new TextEncoder().encode("not really an image")],
      "spoofed.jpg",
      { type: "image/jpeg" },
    );
    await expect(preparePhoto("listing_test", file)).rejects.toMatchObject({
      code: "PHOTO_TYPE_INVALID",
    });
  });

  it("keeps genuine PDF reports private and rejects fake PDFs", async () => {
    const pdf = new File(
      [new TextEncoder().encode("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF")],
      "test-report.pdf",
      { type: "application/pdf" },
    );
    const report = await prepareDocument(
      "listing_test",
      pdf,
      "TEST_REPORT",
    );
    expect(report.visibility).toBe("PRIVATE");
    expect(report.mimeType).toBe("application/pdf");

    const fake = new File(
      [new TextEncoder().encode("<script>alert(1)</script>")],
      "certificate.pdf",
      { type: "application/pdf" },
    );
    await expect(
      prepareDocument("listing_test", fake, "CERTIFICATE"),
    ).rejects.toMatchObject({ code: "DOCUMENT_TYPE_INVALID" });
  });
});

describe("listing validation", () => {
  it("returns field-specific submission failures", () => {
    const errors = submissionErrors({
      title: "x",
      category: "Plastic Scrap",
      subcategory: "",
      description: "short",
      priceMode: "FIXED",
      pricePerUnit: 0,
      quantityAvailable: 5,
      unit: "ton",
      minOrderQuantity: 6,
      lotIncrement: 2,
      packaging: "",
      handlingRequirements: "",
      pincode: null,
      availableFrom: null,
      availableUntil: null,
      safetyDeclaration: false,
      qualityDeclaration: false,
      ownershipDeclaration: false,
      authorityDeclaration: false,
      assets: [],
    });
    expect(errors).toMatchObject({
      title: expect.any(String),
      subcategory: expect.any(String),
      pricePerUnit: expect.any(String),
      minOrderQuantity: expect.any(String),
      lotIncrement: expect.any(String),
      photos: expect.any(String),
      safetyDeclaration: expect.any(String),
    });
  });

  it("accepts a complete moderated-listing contract", () => {
    const availableFrom = new Date("2026-08-01T00:00:00.000Z");
    expect(
      submissionErrors({
        title: "Washed HDPE regrind",
        category: "Plastic Scrap",
        subcategory: "Injection grade",
        description:
          "Clean post-industrial HDPE regrind with documented moisture checks.",
        priceMode: "FIXED",
        pricePerUnit: 42_000,
        quantityAvailable: 20,
        unit: "ton",
        minOrderQuantity: 2,
        lotIncrement: 2,
        packaging: "Sealed one-ton bulk bags",
        handlingRequirements: "Keep dry and load using a forklift.",
        pincode: "560001",
        availableFrom,
        availableUntil: new Date("2026-09-01T00:00:00.000Z"),
        safetyDeclaration: true,
        qualityDeclaration: true,
        ownershipDeclaration: true,
        authorityDeclaration: true,
        assets: [{ kind: "PHOTO" }],
      }),
    ).toEqual({});
  });

  it("rejects unexpected draft keys", () => {
    expect(
      listingDraftSchema.safeParse({
        title: "A valid material",
        status: "ACTIVE",
      }).success,
    ).toBe(false);
  });

  it("preserves draft refinements when validating a versioned update", () => {
    expect(
      listingUpdateSchema.safeParse({
        title: "Updated HDPE listing",
        priceMode: "FIXED",
        pricePerUnit: 0,
        version: 2,
      }).success,
    ).toBe(false);
    expect(
      listingUpdateSchema.safeParse({
        title: "Updated HDPE listing",
        priceMode: "FIXED",
        pricePerUnit: 42_000,
        version: 2,
      }).success,
    ).toBe(true);
  });
});
