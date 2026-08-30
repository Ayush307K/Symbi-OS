import { createHash, randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import prisma, {
  type ExtendedPrismaClient,
  type ExtendedTransactionClient,
} from "@/lib/prisma";
import type { JWTPayload } from "@/lib/auth";
import {
  LISTING_UNITS,
  SAFE_CATEGORIES,
} from "@/lib/listing-constants";
import { DELIVERY_TERMS } from "@/lib/logistics";
import { ApiError } from "@/server/http";
import { assertSafeMaterial } from "@/server/safety";

export const LISTING_STATUSES = [
  "DRAFT",
  "PENDING_MODERATION",
  "ACTIVE",
  "PAUSED",
  "RESERVED",
  "SOLD",
  "EXPIRED",
  "REJECTED",
  "ARCHIVED",
] as const;

const dateString = z
  .string()
  .datetime({ offset: true })
  .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/));

export const listingDraftSchema = z
  .object({
    title: z.string().trim().min(3).max(160).optional(),
    category: z.enum(SAFE_CATEGORIES).optional(),
    subcategory: z.string().trim().min(2).max(120).optional(),
    description: z.string().trim().max(5000).optional(),
    priceMode: z.enum(["FIXED", "ON_REQUEST"]).optional(),
    pricePerUnit: z.coerce.number().min(0).max(1_000_000_000).optional(),
    quantityAvailable: z.coerce.number().int().min(0).max(1_000_000_000).optional(),
    unit: z.enum(LISTING_UNITS).optional(),
    minOrderQuantity: z.coerce.number().int().positive().max(1_000_000_000).optional(),
    lotIncrement: z.coerce.number().int().positive().max(1_000_000_000).optional(),
    leadTimeDays: z.coerce.number().int().min(0).max(365).optional(),
    packaging: z.string().trim().max(500).optional(),
    handlingRequirements: z.string().trim().max(1000).optional(),
    paymentTerms: z.string().trim().max(500).optional(),
    deliveryTerm: z.enum(DELIVERY_TERMS).optional(),
    availableFrom: dateString.nullable().optional(),
    availableUntil: dateString.nullable().optional(),
    pincode: z.string().regex(/^[1-9][0-9]{5}$/).nullable().optional(),
    latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
    longitude: z.coerce.number().min(-180).max(180).nullable().optional(),
    safetyDeclaration: z.boolean().optional(),
    qualityDeclaration: z.boolean().optional(),
    ownershipDeclaration: z.boolean().optional(),
    authorityDeclaration: z.boolean().optional(),
    version: z.coerce.number().int().positive().optional(),
  })
  .strict()
  // A FIXED listing states a price a buyer can act on, so zero is not a valid
  // fixed price — it is the absence of one, and must be declared ON_REQUEST
  // instead. Submission already refused this combination, but only at the end;
  // rejecting it here stops the row ever being written. Drafts send partial
  // bodies, so this fires only when the request carries both fields.
  .superRefine((input, ctx) => {
    if (
      input.priceMode === "FIXED" &&
      input.pricePerUnit !== undefined &&
      input.pricePerUnit <= 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["pricePerUnit"],
        message: "Add a positive price or choose price on request.",
      });
    }
  });

export type ListingDraftInput = z.infer<typeof listingDraftSchema>;

/**
 * A listing edit is the draft contract plus the optimistic-lock version.
 *
 * `listingDraftSchema` has a `superRefine`, so Zod deliberately refuses a
 * normal `.extend()` at runtime. `safeExtend()` preserves that refinement;
 * keeping the schema here also makes create and update validation impossible
 * to drift apart.
 */
export const listingUpdateSchema = listingDraftSchema.safeExtend({
  version: z.coerce.number().int().positive(),
});

function parsedDate(value: string | null | undefined) {
  return value ? new Date(value) : value === null ? null : undefined;
}

export function listingUpdateData(
  input: ListingDraftInput,
): Prisma.MarketplaceListingUpdateInput {
  return {
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.category !== undefined ? { category: input.category } : {}),
    ...(input.subcategory !== undefined
      ? { subcategory: input.subcategory }
      : {}),
    ...(input.description !== undefined
      ? { description: input.description }
      : {}),
    ...(input.priceMode !== undefined ? { priceMode: input.priceMode } : {}),
    ...(input.pricePerUnit !== undefined
      ? { pricePerUnit: input.pricePerUnit }
      : {}),
    ...(input.quantityAvailable !== undefined
      ? { quantityAvailable: input.quantityAvailable }
      : {}),
    ...(input.unit !== undefined ? { unit: input.unit } : {}),
    ...(input.minOrderQuantity !== undefined
      ? { minOrderQuantity: input.minOrderQuantity }
      : {}),
    ...(input.lotIncrement !== undefined
      ? { lotIncrement: input.lotIncrement }
      : {}),
    ...(input.leadTimeDays !== undefined
      ? { leadTimeDays: input.leadTimeDays }
      : {}),
    ...(input.packaging !== undefined ? { packaging: input.packaging } : {}),
    ...(input.handlingRequirements !== undefined
      ? { handlingRequirements: input.handlingRequirements }
      : {}),
    ...(input.paymentTerms !== undefined
      ? { paymentTerms: input.paymentTerms }
      : {}),
    ...(input.deliveryTerm !== undefined
      ? { deliveryTerm: input.deliveryTerm }
      : {}),
    ...(input.availableFrom !== undefined
      ? { availableFrom: parsedDate(input.availableFrom) }
      : {}),
    ...(input.availableUntil !== undefined
      ? { availableUntil: parsedDate(input.availableUntil) }
      : {}),
    ...(input.pincode !== undefined ? { pincode: input.pincode } : {}),
    ...(input.latitude !== undefined ? { latitude: input.latitude } : {}),
    ...(input.longitude !== undefined ? { longitude: input.longitude } : {}),
    ...(input.safetyDeclaration !== undefined
      ? { safetyDeclaration: input.safetyDeclaration }
      : {}),
    ...(input.qualityDeclaration !== undefined
      ? { qualityDeclaration: input.qualityDeclaration }
      : {}),
    ...(input.ownershipDeclaration !== undefined
      ? { ownershipDeclaration: input.ownershipDeclaration }
      : {}),
    ...(input.authorityDeclaration !== undefined
      ? { authorityDeclaration: input.authorityDeclaration }
      : {}),
  };
}

export function slugify(text: string) {
  return (
    text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "listing"
  );
}

function canonicalMaterialId(category: string, subcategory: string) {
  return `tax_${createHash("sha256")
    .update(`${category}:${subcategory}`.toLowerCase())
    .digest("hex")
    .slice(0, 24)}`;
}

export async function ensureCanonicalMaterial(
  tx: ExtendedTransactionClient,
  input: {
    category: string;
    subcategory: string;
    description?: string;
  },
) {
  const id = canonicalMaterialId(input.category, input.subcategory);
  const name = `${input.category}: ${input.subcategory}`;
  return tx.wasteMaterial.upsert({
    where: { id },
    create: {
      id,
      name,
      toxicityLevel: "none",
      baseElement: input.subcategory,
      category: input.category,
      description:
        input.description || `Canonical ${input.subcategory} taxonomy record.`,
    },
    update: {
      toxicityLevel: "none",
      baseElement: input.subcategory,
      category: input.category,
    },
  });
}

export async function requireOwnedListing(
  listingId: string,
  auth: JWTPayload,
  options?: { includeAssets?: boolean },
) {
  const listing = await prisma.marketplaceListing.findUnique({
    where: { id: listingId },
    include: options?.includeAssets
      ? { assets: { orderBy: [{ kind: "asc" }, { sortOrder: "asc" }] } }
      : undefined,
  });
  if (!listing) {
    throw new ApiError(404, "Listing not found.", "LISTING_NOT_FOUND");
  }
  if (!auth.companyId || listing.sellerCompanyId !== auth.companyId) {
    throw new ApiError(403, "You do not own this listing.", "FORBIDDEN");
  }
  return listing;
}

export function listingSnapshot(listing: Record<string, unknown>) {
  const allowed = [
    "id",
    "title",
    "category",
    "subcategory",
    "priceMode",
    "pricePerUnit",
    "currency",
    "unit",
    "minOrderQuantity",
    "lotIncrement",
    "quantityAvailable",
    "leadTimeDays",
    "description",
    "packaging",
    "handlingRequirements",
    "paymentTerms",
    "deliveryTerm",
    "pincode",
    "geocodingProvider",
    "geocodingConfidence",
    "geocodingPrecision",
    "availableFrom",
    "availableUntil",
    "status",
    "version",
  ];
  return JSON.stringify(
    Object.fromEntries(
      allowed
        .filter((key) => key in listing)
        .map((key) => [key, listing[key]]),
    ),
  );
}

export async function recordListingEvent(
  tx: ExtendedTransactionClient,
  input: {
    listingId: string;
    actorUserId?: string | null;
    type: string;
    fromStatus?: string | null;
    toStatus?: string | null;
    version: number;
    snapshotJson?: string | null;
    note?: string | null;
  },
) {
  await tx.listingEvent.create({ data: input });
}

export function submissionErrors(listing: {
  title: string;
  category: string;
  subcategory: string;
  description: string;
  priceMode: string;
  pricePerUnit: number;
  quantityAvailable: number;
  unit: string;
  minOrderQuantity: number;
  lotIncrement: number;
  packaging: string;
  handlingRequirements: string;
  pincode: string | null;
  latitude?: number | null;
  longitude?: number | null;
  geocodingConfidence?: number | null;
  deliveryTerm?: string | null;
  availableFrom: Date | null;
  availableUntil: Date | null;
  safetyDeclaration: boolean;
  qualityDeclaration: boolean;
  ownershipDeclaration: boolean;
  authorityDeclaration: boolean;
  assets: Array<{ kind: string }>;
}) {
  const fields: Record<string, string> = {};
  if (listing.title.trim().length < 3) fields.title = "Add a listing title.";
  if (!(SAFE_CATEGORIES as readonly string[]).includes(listing.category)) {
    fields.category = "Choose an approved v0 category.";
  }
  if (listing.subcategory.trim().length < 2) {
    fields.subcategory = "Add a subtype, grade, or specification.";
  }
  if (listing.description.trim().length < 20) {
    fields.description = "Add at least 20 characters of material detail.";
  }
  if (listing.quantityAvailable <= 0) {
    fields.quantityAvailable = "Available quantity must be positive.";
  }
  if (!(LISTING_UNITS as readonly string[]).includes(listing.unit)) {
    fields.unit = "Choose a supported unit.";
  }
  if (listing.minOrderQuantity <= 0) {
    fields.minOrderQuantity = "MOQ must be positive.";
  }
  if (listing.minOrderQuantity > listing.quantityAvailable) {
    fields.minOrderQuantity = "MOQ cannot exceed available quantity.";
  }
  if (listing.lotIncrement <= 0) {
    fields.lotIncrement = "Lot increment must be positive.";
  }
  if (listing.quantityAvailable % listing.lotIncrement !== 0) {
    fields.lotIncrement = "Quantity must be divisible by the lot increment.";
  }
  if (listing.priceMode === "FIXED" && listing.pricePerUnit <= 0) {
    fields.pricePerUnit = "Add a positive price or choose price on request.";
  }
  if (!listing.availableFrom) {
    fields.availableFrom = "Choose an availability date.";
  }
  if (
    listing.availableFrom &&
    listing.availableUntil &&
    listing.availableUntil <= listing.availableFrom
  ) {
    fields.availableUntil = "End date must be after the availability date.";
  }
  if (!listing.pincode) fields.pincode = "Add a dispatch pincode.";
  if (listing.latitude == null || listing.longitude == null) {
    fields.pincode = "Add a dispatch location that can be geocoded.";
  }
  if (
    listing.geocodingConfidence != null &&
    listing.geocodingConfidence < 0.55
  ) {
    fields.pincode = "Confirm a more precise dispatch location.";
  }
  if (!(DELIVERY_TERMS as readonly string[]).includes(listing.deliveryTerm || "")) {
    fields.deliveryTerm = "Choose who arranges and pays for freight.";
  }
  if (!listing.packaging.trim()) fields.packaging = "Describe the packaging.";
  if (!listing.handlingRequirements.trim()) {
    fields.handlingRequirements = "Describe safe handling requirements.";
  }
  if (!listing.safetyDeclaration) {
    fields.safetyDeclaration = "Confirm the material is non-hazardous.";
  }
  if (!listing.qualityDeclaration) {
    fields.qualityDeclaration = "Confirm the quality information is accurate.";
  }
  if (!listing.ownershipDeclaration) {
    fields.ownershipDeclaration = "Confirm ownership of the material.";
  }
  if (!listing.authorityDeclaration) {
    fields.authorityDeclaration = "Confirm authority to sell the material.";
  }
  const photoCount = listing.assets.filter((asset) => asset.kind === "PHOTO").length;
  if (photoCount < 1 || photoCount > 5) {
    fields.photos = "Upload between 1 and 5 listing photos.";
  }
  return fields;
}

export function assertListingSafe(listing: {
  title: string;
  category: string;
  description: string;
}) {
  assertSafeMaterial({
    name: listing.title,
    category: listing.category,
    description: listing.description,
    toxicity: "none",
  });
}

export async function expireListings(client: ExtendedPrismaClient = prisma) {
  const now = new Date();
  const expired = await client.marketplaceListing.findMany({
    where: {
      status: { in: ["ACTIVE", "PAUSED", "active"] },
      OR: [
        { expiresAt: { lte: now } },
        { availableUntil: { lte: now } },
      ],
    },
    select: { id: true, status: true, version: true },
    take: 100,
  });
  for (const listing of expired) {
    await client.$transaction(async (tx) => {
      const updated = await tx.marketplaceListing.updateMany({
        where: { id: listing.id, version: listing.version },
        data: { status: "EXPIRED", version: { increment: 1 } },
      });
      if (updated.count) {
        await recordListingEvent(tx, {
          listingId: listing.id,
          type: "LISTING_EXPIRED",
          fromStatus: listing.status,
          toStatus: "EXPIRED",
          version: listing.version + 1,
        });
      }
    });
  }
  return expired.length;
}

export function newListingId() {
  return `listing_${randomUUID().replaceAll("-", "")}`;
}
