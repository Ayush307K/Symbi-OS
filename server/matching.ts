import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { JWTPayload } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { LISTING_UNITS, SAFE_CATEGORIES } from "@/lib/listing-constants";
import { ApiError } from "@/server/http";
import { ensureCanonicalMaterial } from "@/server/listings/lifecycle";
import { publicListingWhere } from "@/server/listings/policy";
import { assertSafeFreeText } from "@/server/safety";

export const MATCH_RULE_VERSION = "rules-v1.0";

export const demandInputSchema = z
  .object({
    query: z.string().trim().min(2).max(160),
    category: z.enum(SAFE_CATEGORIES).optional(),
    subcategory: z.string().trim().min(2).max(120).optional(),
    quantity: z.coerce.number().int().positive().max(1_000_000_000).default(1),
    unit: z.enum(LISTING_UNITS).default("ton"),
    maxPrice: z.coerce.number().min(0).max(1_000_000_000).optional(),
    state: z.string().trim().max(100).optional(),
    city: z.string().trim().max(100).optional(),
    pincode: z.string().regex(/^[1-9][0-9]{5}$/).optional(),
    latitude: z.coerce.number().min(-90).max(90).optional(),
    longitude: z.coerce.number().min(-180).max(180).optional(),
    maxDistanceKm: z.coerce.number().positive().max(2000).optional(),
    availableBy: z.string().datetime({ offset: true }).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const distanceValues = [
      value.latitude,
      value.longitude,
      value.maxDistanceKm,
    ];
    if (
      distanceValues.some((item) => item !== undefined) &&
      distanceValues.some((item) => item === undefined)
    ) {
      context.addIssue({
        code: "custom",
        path: ["maxDistanceKm"],
        message:
          "Latitude, longitude, and maximum distance are required together.",
      });
    }
  });

export type DemandInput = z.infer<typeof demandInputSchema>;

const categoryHints: Array<[string, (typeof SAFE_CATEGORIES)[number]]> = [
  ["plastic", "Plastic Scrap"],
  ["hdpe", "Plastic Scrap"],
  ["ldpe", "Plastic Scrap"],
  ["pet", "Plastic Scrap"],
  ["metal", "Metal Scrap"],
  ["steel", "Metal Scrap"],
  ["aluminium", "Metal Scrap"],
  ["aluminum", "Metal Scrap"],
  ["copper", "Metal Scrap"],
  ["brass", "Metal Scrap"],
  ["paper", "Paper & Cardboard"],
  ["cardboard", "Paper & Cardboard"],
  ["glass", "Glass"],
  ["rubber", "Rubber"],
  ["tyre", "Rubber"],
  ["tire", "Rubber"],
  ["textile", "Textile Waste"],
  ["fabric", "Textile Waste"],
  ["fly ash", "Fly Ash & Minerals"],
  ["mineral", "Fly Ash & Minerals"],
  ["agri", "Agricultural Residue"],
  ["biomass", "Agricultural Residue"],
  ["husk", "Agricultural Residue"],
  ["non-hazardous chemical", "Non-hazardous Chemicals"],
];

export function inferDemandCategory(query: string) {
  const normalized = query.toLowerCase();
  return categoryHints.find(([hint]) => normalized.includes(hint))?.[1];
}

function tokens(value: string) {
  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 1),
  );
}

function tokenSimilarity(left: string, right: string) {
  const a = tokens(left);
  const b = tokens(right);
  if (!a.size || !b.size) return 0;
  const overlap = [...a].filter((token) => b.has(token)).length;
  return overlap / Math.max(a.size, b.size);
}

function radians(value: number) {
  return (value * Math.PI) / 180;
}

export function haversineKm(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
) {
  const latitudeDelta = radians(toLat - fromLat);
  const longitudeDelta = radians(toLng - fromLng);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(fromLat)) *
      Math.cos(radians(toLat)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

type Candidate = Awaited<ReturnType<typeof loadCandidates>>[number];

async function loadCandidates(input: DemandInput & { category: string }) {
  const now = new Date();
  return prisma.marketplaceListing.findMany({
    where: {
      AND: [
        publicListingWhere,
        { category: input.category, unit: input.unit },
        { quantityAvailable: { gte: input.quantity } },
        { minOrderQuantity: { lte: input.quantity } },
        {
          OR: [
            { availableUntil: null },
            { availableUntil: { gte: now } },
          ],
        },
        input.availableBy
          ? {
              OR: [
                { availableFrom: null },
                { availableFrom: { lte: new Date(input.availableBy) } },
              ],
            }
          : {},
      ],
    },
    include: {
      material: { select: { name: true, baseElement: true } },
      seller: { select: { id: true, name: true } },
      assets: {
        where: { kind: { in: ["CERTIFICATE", "TEST_REPORT"] } },
        select: { kind: true },
      },
    },
    take: 200,
  });
}

export function scoreCandidate(
  input: DemandInput & { category: string },
  listing: Candidate,
) {
  if (
    input.quantity < listing.minOrderQuantity ||
    input.quantity > listing.quantityAvailable ||
    (input.quantity - listing.minOrderQuantity) % listing.lotIncrement !== 0
  ) {
    return null;
  }
  if (
    input.maxPrice !== undefined &&
    listing.priceMode === "FIXED" &&
    listing.pricePerUnit > input.maxPrice
  ) {
    return null;
  }

  let score = 35;
  const explanations = ["Exact safe-category match"];
  const similarity = tokenSimilarity(
    `${input.query} ${input.subcategory ?? ""}`,
    `${listing.title} ${listing.subcategory} ${listing.material.name} ${listing.material.baseElement}`,
  );
  const materialPoints = Math.round(similarity * 20);
  score += materialPoints;
  explanations.push(
    materialPoints >= 12
      ? "Strong material and grade similarity"
      : materialPoints > 0
        ? "Partial material description similarity"
        : "Category matches; grade needs buyer confirmation",
  );

  score += 15;
  explanations.push(
    `Quantity satisfies MOQ and ${listing.lotIncrement}-${listing.unit} lot increment`,
  );

  if (input.maxPrice !== undefined) {
    if (listing.priceMode === "FIXED") {
      const priceRatio = listing.pricePerUnit / Math.max(input.maxPrice, 1);
      const pricePoints = Math.max(2, Math.round(15 * (1 - priceRatio / 2)));
      score += pricePoints;
      explanations.push(
        `Fixed price is within the ₹${input.maxPrice.toLocaleString("en-IN")} ceiling`,
      );
    } else {
      score += 5;
      explanations.push("Price is on request and requires confirmation");
    }
  } else {
    score += listing.priceMode === "FIXED" ? 10 : 5;
    explanations.push(
      listing.priceMode === "FIXED"
        ? "Published fixed price"
        : "Quote-led price",
    );
  }

  let distance: number | null = null;
  if (
    input.latitude !== undefined &&
    input.longitude !== undefined &&
    input.maxDistanceKm !== undefined
  ) {
    if (listing.latitude === null || listing.longitude === null) return null;
    distance = haversineKm(
      input.latitude,
      input.longitude,
      listing.latitude,
      listing.longitude,
    );
    if (distance > input.maxDistanceKm) return null;
    score += Math.max(
      2,
      Math.round(10 * (1 - distance / input.maxDistanceKm)),
    );
    explanations.push(`${Math.round(distance)} km from requested coordinates`);
  } else if (
    [input.pincode, input.city, input.state]
      .filter(Boolean)
      .some((place) =>
        [listing.pincode, listing.city, listing.state]
          .filter(Boolean)
          .some((listingPlace) =>
            String(listingPlace)
              .toLowerCase()
              .includes(String(place).toLowerCase()),
          ),
      )
  ) {
    score += 10;
    explanations.push("Requested location matches listing location");
  }

  if (listing.verified) {
    score += 3;
    explanations.push("Seller/listing verification flag is present");
  }
  if (listing.assets.length) {
    score += 2;
    explanations.push("Supporting certificate or test report is available");
  }

  return {
    score: Math.min(100, score),
    explanations,
    distanceKm: distance === null ? null : Math.round(distance * 10) / 10,
  };
}

export async function createDemandMatches(
  auth: JWTPayload,
  rawInput: unknown,
) {
  const parsed = demandInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ApiError(
      422,
      parsed.error.issues.map((issue) => issue.message).join("; "),
      "DEMAND_VALIDATION_ERROR",
      {
        fields: Object.fromEntries(
          parsed.error.issues.map((issue) => [
            issue.path.join(".") || "_form",
            issue.message,
          ]),
        ),
      },
    );
  }
  assertSafeFreeText(parsed.data.query);
  const category =
    parsed.data.category ?? inferDemandCategory(parsed.data.query);
  if (!category) {
    throw new ApiError(
      422,
      "Select a safe material category so matching can use reliable constraints.",
      "DEMAND_CATEGORY_REQUIRED",
      { fields: { category: "Select a category." } },
    );
  }
  const input = { ...parsed.data, category };
  const candidates = await loadCandidates(input);
  const ranked = candidates
    .map((listing) => {
      const result = scoreCandidate(input, listing);
      return result ? { listing, ...result } : null;
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.listing.id.localeCompare(right.listing.id),
    )
    .slice(0, 25);

  const created = await prisma.$transaction(async (tx) => {
    let companyId = auth.companyId;
    if (!companyId) {
      const existing = await tx.company.findUnique({
        where: { name: auth.companyName },
      });
      companyId = existing?.id ?? `company_${randomUUID().slice(0, 12)}`;
      if (!existing) {
        await tx.company.create({
          data: {
            id: companyId,
            name: auth.companyName,
            industry: "General",
            location: [input.city, input.state].filter(Boolean).join(", ") || "Unspecified",
            carbonRating: "UNRATED",
            latitude: input.latitude ?? 0,
            longitude: input.longitude ?? 0,
            capacity: 0,
          },
        });
      }
      await tx.user.update({
        where: { id: auth.userId },
        data: { companyId },
      });
    }
    const material = await ensureCanonicalMaterial(tx, {
      category,
      subcategory: input.subcategory ?? input.query,
      description: `Buyer demand taxonomy for ${input.query}`,
    });
    const demand = await tx.demand.create({
      data: {
        companyId,
        materialId: material.id,
        userId: auth.userId,
        query: input.query,
        category,
        subcategory: input.subcategory,
        quantity: input.quantity,
        unit: input.unit,
        maxPrice: input.maxPrice,
        state: input.state,
        city: input.city,
        pincode: input.pincode,
        latitude: input.latitude,
        longitude: input.longitude,
        maxDistanceKm: input.maxDistanceKm,
        availableBy: input.availableBy
          ? new Date(input.availableBy)
          : undefined,
        matchVersion: MATCH_RULE_VERSION,
      },
    });
    await Promise.all(
      ranked.map((match) =>
        tx.listingMatch.create({
          data: {
            demandId: demand.id,
            listingId: match.listing.id,
            score: match.score,
            version: MATCH_RULE_VERSION,
            explanationJson: JSON.stringify(match.explanations),
            inputSnapshotJson: JSON.stringify(input),
          },
        }),
      ),
    );
    return demand;
  });

  return {
    demand: created,
    matches: ranked.map(({ listing, score, explanations, distanceKm }) => ({
      listingId: listing.id,
      title: listing.title,
      seller: listing.seller.name,
      category: listing.category,
      subcategory: listing.subcategory,
      quantityAvailable: listing.quantityAvailable,
      minOrderQuantity: listing.minOrderQuantity,
      lotIncrement: listing.lotIncrement,
      unit: listing.unit,
      priceMode: listing.priceMode,
      pricePerUnit:
        listing.priceMode === "FIXED" ? listing.pricePerUnit : null,
      city: listing.city,
      state: listing.state,
      score,
      explanations,
      distanceKm,
    })),
  };
}
