import { Buffer } from "node:buffer";
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { LISTING_UNITS, SAFE_CATEGORIES } from "@/lib/listing-constants";
import { apiError, ApiError } from "@/server/http";
import { expireListings } from "@/server/listings/lifecycle";
import { publicListingWhere } from "@/server/listings/policy";

const querySchema = z.object({
  q: z.string().trim().max(160).optional(),
  category: z.enum(SAFE_CATEGORIES).optional(),
  subtype: z.string().trim().max(120).optional(),
  location: z.string().trim().max(160).optional(),
  state: z.string().trim().max(100).optional(),
  city: z.string().trim().max(100).optional(),
  pincode: z.string().regex(/^[1-9][0-9]{5}$/).optional(),
  minQuantity: z.coerce.number().int().min(0).optional(),
  maxQuantity: z.coerce.number().int().min(0).optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  unit: z.enum(LISTING_UNITS).optional(),
  availableOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  verified: z.enum(["true", "false"]).optional(),
  hasDocuments: z.enum(["true", "false"]).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().positive().max(2000).optional(),
  sort: z
    .enum(["recent", "price_asc", "price_desc", "quantity_desc"])
    .default("recent"),
  limit: z.coerce.number().int().min(1).max(50).default(24),
  cursor: z.string().max(500).optional(),
});

function decodeCursor(cursor?: string) {
  if (!cursor) return undefined;
  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as { id?: string };
    if (!parsed.id || typeof parsed.id !== "string") throw new Error();
    return parsed.id;
  } catch {
    throw new ApiError(400, "Invalid pagination cursor.", "CURSOR_INVALID");
  }
}

function encodeCursor(id: string) {
  return Buffer.from(JSON.stringify({ id }), "utf8").toString("base64url");
}

function radians(value: number) {
  return (value * Math.PI) / 180;
}

function distanceKm(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
) {
  const earthRadiusKm = 6371;
  const latDelta = radians(toLat - fromLat);
  const lngDelta = radians(toLng - fromLng);
  const a =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(radians(fromLat)) *
      Math.cos(radians(toLat)) *
      Math.sin(lngDelta / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(a));
}

export async function GET(request: NextRequest) {
  const started = performance.now();
  try {
    await expireListings();
    const raw = Object.fromEntries(request.nextUrl.searchParams.entries());
    const parsed = querySchema.safeParse(raw);
    if (!parsed.success) {
      throw new ApiError(
        422,
        "One or more marketplace filters are invalid.",
        "FILTER_VALIDATION_ERROR",
        {
          fields: Object.fromEntries(
            parsed.error.issues.map((issue) => [
              issue.path.join("."),
              issue.message,
            ]),
          ),
        },
      );
    }
    const filters = parsed.data;
    if (
      filters.minQuantity !== undefined &&
      filters.maxQuantity !== undefined &&
      filters.minQuantity > filters.maxQuantity
    ) {
      throw new ApiError(
        422,
        "Minimum quantity cannot exceed maximum quantity.",
        "QUANTITY_RANGE_INVALID",
      );
    }
    if (
      filters.minPrice !== undefined &&
      filters.maxPrice !== undefined &&
      filters.minPrice > filters.maxPrice
    ) {
      throw new ApiError(
        422,
        "Minimum price cannot exceed maximum price.",
        "PRICE_RANGE_INVALID",
      );
    }
    const hasDistance =
      filters.lat !== undefined ||
      filters.lng !== undefined ||
      filters.radiusKm !== undefined;
    if (
      hasDistance &&
      (filters.lat === undefined ||
        filters.lng === undefined ||
        filters.radiusKm === undefined)
    ) {
      throw new ApiError(
        422,
        "Latitude, longitude, and radius are required together.",
        "DISTANCE_FILTER_INCOMPLETE",
      );
    }

    const availableOn = filters.availableOn
      ? new Date(`${filters.availableOn}T23:59:59.999Z`)
      : undefined;
    const where: Prisma.MarketplaceListingWhereInput = {
      AND: [
        publicListingWhere,
        filters.category ? { category: filters.category } : {},
        filters.subtype
          ? { subcategory: { contains: filters.subtype, mode: "insensitive" } }
          : {},
        filters.location
          ? {
              OR: [
                { area: { contains: filters.location, mode: "insensitive" } },
                { city: { contains: filters.location, mode: "insensitive" } },
                { state: { contains: filters.location, mode: "insensitive" } },
                { pincode: { contains: filters.location, mode: "insensitive" } },
                {
                  rawLocationText: {
                    contains: filters.location,
                    mode: "insensitive",
                  },
                },
              ],
            }
          : {},
        filters.state
          ? { state: { contains: filters.state, mode: "insensitive" } }
          : {},
        filters.city
          ? { city: { contains: filters.city, mode: "insensitive" } }
          : {},
        filters.pincode ? { pincode: filters.pincode } : {},
        filters.unit ? { unit: filters.unit } : {},
        filters.verified
          ? { verified: filters.verified === "true" }
          : {},
        filters.hasDocuments
          ? filters.hasDocuments === "true"
            ? {
                assets: {
                  some: { kind: { in: ["CERTIFICATE", "TEST_REPORT"] } },
                },
              }
            : {
                assets: {
                  none: { kind: { in: ["CERTIFICATE", "TEST_REPORT"] } },
                },
              }
          : {},
        filters.minQuantity !== undefined ||
        filters.maxQuantity !== undefined
          ? {
              quantityAvailable: {
                gte: filters.minQuantity,
                lte: filters.maxQuantity,
              },
            }
          : {},
        filters.minPrice !== undefined || filters.maxPrice !== undefined
          ? {
              priceMode: "FIXED",
              pricePerUnit: {
                gte: filters.minPrice,
                lte: filters.maxPrice,
              },
            }
          : {},
        availableOn
          ? {
              AND: [
                {
                  OR: [
                    { availableFrom: null },
                    { availableFrom: { lte: availableOn } },
                  ],
                },
                {
                  OR: [
                    { availableUntil: null },
                    { availableUntil: { gte: availableOn } },
                  ],
                },
              ],
            }
          : {},
        filters.q
          ? {
              OR: [
                { title: { contains: filters.q, mode: "insensitive" } },
                { description: { contains: filters.q, mode: "insensitive" } },
                { subcategory: { contains: filters.q, mode: "insensitive" } },
                {
                  seller: {
                    name: { contains: filters.q, mode: "insensitive" },
                  },
                },
                {
                  material: {
                    name: { contains: filters.q, mode: "insensitive" },
                  },
                },
                {
                  material: {
                    description: { contains: filters.q, mode: "insensitive" },
                  },
                },
              ],
            }
          : {},
        hasDistance
          ? {
              latitude: {
                gte: filters.lat! - filters.radiusKm! / 111,
                lte: filters.lat! + filters.radiusKm! / 111,
              },
              longitude: {
                gte:
                  filters.lng! -
                  filters.radiusKm! /
                    (111 * Math.max(0.1, Math.cos(radians(filters.lat!)))),
                lte:
                  filters.lng! +
                  filters.radiusKm! /
                    (111 * Math.max(0.1, Math.cos(radians(filters.lat!)))),
              },
            }
          : {},
      ],
    };
    const orderBy: Prisma.MarketplaceListingOrderByWithRelationInput[] =
      filters.sort === "price_asc"
        ? [{ pricePerUnit: "asc" }, { id: "asc" }]
        : filters.sort === "price_desc"
          ? [{ pricePerUnit: "desc" }, { id: "asc" }]
          : filters.sort === "quantity_desc"
            ? [{ quantityAvailable: "desc" }, { id: "asc" }]
            : [{ updatedAt: "desc" }, { id: "desc" }];
    const cursorId = decodeCursor(filters.cursor);

    const rows = await prisma.marketplaceListing.findMany({
      where,
      select: {
        id: true,
        materialId: true,
        title: true,
        slug: true,
        category: true,
        subcategory: true,
        area: true,
        city: true,
        state: true,
        country: true,
        pincode: true,
        latitude: true,
        longitude: true,
        imageUrl: true,
        priceMode: true,
        pricePerUnit: true,
        currency: true,
        quantityAvailable: true,
        unit: true,
        minOrderQuantity: true,
        lotIncrement: true,
        leadTimeDays: true,
        rating: true,
        responseRate: true,
        verified: true,
        tradeAssurance: true,
        yearsActive: true,
        ordersCompleted: true,
        updatedAt: true,
        lastVerifiedAt: true,
        description: true,
        packaging: true,
        handlingRequirements: true,
        paymentTerms: true,
        availableFrom: true,
        availableUntil: true,
        sourceType: true,
        sourceName: true,
        sourceUrl: true,
        externalId: true,
        rawQuantityText: true,
        rawLocationText: true,
        material: {
          select: {
            name: true,
            toxicityLevel: true,
            baseElement: true,
          },
        },
        seller: { select: { id: true, name: true } },
        assets: {
          where: { kind: { in: ["CERTIFICATE", "TEST_REPORT"] } },
          select: { kind: true },
        },
      },
      orderBy,
      cursor: cursorId ? { id: cursorId } : undefined,
      skip: cursorId ? 1 : 0,
      take: filters.limit + 1,
    });
    const distanceFiltered = hasDistance
      ? rows.filter(
          (row) =>
            row.latitude !== null &&
            row.longitude !== null &&
            distanceKm(
              filters.lat!,
              filters.lng!,
              row.latitude,
              row.longitude,
            ) <= filters.radiusKm!,
        )
      : rows;
    const hasMore = distanceFiltered.length > filters.limit;
    const pageRows = distanceFiltered.slice(0, filters.limit);
    const companyIds = [...new Set(pageRows.map((row) => row.seller.id))];
    const sellerUsers = companyIds.length
      ? await prisma.user.findMany({
          where: { companyId: { in: companyIds } },
          select: { id: true, companyId: true },
        })
      : [];
    const sellerUserByCompany = new Map(
      sellerUsers.map((user) => [user.companyId, user.id]),
    );
    const listingIds = pageRows.map((row) => row.id);
    const [reviewStats, completedOrderStats, threads, approvedOnboardings] =
      await Promise.all([
        prisma.review.groupBy({
          by: ["listingId"],
          where: { listingId: { in: listingIds }, status: "PUBLISHED" },
          _avg: { rating: true },
          _count: { _all: true },
        }),
        prisma.purchaseOrderItem.groupBy({
          by: ["listingId"],
          where: {
            listingId: { in: listingIds },
            status: { in: ["FULFILLED", "DELIVERED"] },
            order: {
              fulfillmentStatus: { in: ["FULFILLED", "DELIVERED"] },
            },
          },
          _count: { _all: true },
        }),
        prisma.messageThread.findMany({
          where: { listingId: { in: listingIds } },
          select: {
            listingId: true,
            buyerUserId: true,
            messages: { select: { senderUserId: true } },
          },
        }),
        prisma.sellerOnboarding.findMany({
          where: {
            status: "APPROVED",
            user: { companyId: { in: companyIds } },
          },
          select: { user: { select: { companyId: true } } },
        }),
      ]);
    const reviewByListing = new Map(
      reviewStats.map((item) => [item.listingId, item]),
    );
    const ordersByListing = new Map(
      completedOrderStats.map((item) => [item.listingId, item._count._all]),
    );
    const responseByListing = new Map<
      string,
      { total: number; replied: number }
    >();
    for (const thread of threads) {
      if (!thread.listingId) continue;
      const current = responseByListing.get(thread.listingId) ?? {
        total: 0,
        replied: 0,
      };
      current.total += 1;
      if (
        thread.messages.some(
          (message) => message.senderUserId !== thread.buyerUserId,
        )
      ) {
        current.replied += 1;
      }
      responseByListing.set(thread.listingId, current);
    }
    const approvedSellerCompanies = new Set(
      approvedOnboardings
        .map((item) => item.user.companyId)
        .filter((id): id is string => Boolean(id)),
    );
    const items = pageRows.map((row) => ({
      id: row.id,
      materialId: row.materialId,
      slug: row.slug,
      title: row.title,
      name: row.material.name,
      toxicity: row.material.toxicityLevel,
      baseElement: row.material.baseElement,
      category: row.category,
      subcategory: row.subcategory,
      producer: row.seller.name,
      producerId: row.seller.id,
      sellerUserId: sellerUserByCompany.get(row.seller.id) ?? null,
      location: `${row.area}, ${row.city}`,
      area: row.area,
      city: row.city,
      state: row.state,
      country: row.country,
      pincode: row.pincode,
      distanceKm:
        hasDistance && row.latitude !== null && row.longitude !== null
          ? Math.round(
              distanceKm(
                filters.lat!,
                filters.lng!,
                row.latitude,
                row.longitude,
              ) * 10,
            ) / 10
          : null,
      imageUrl: row.imageUrl,
      priceMode: row.priceMode,
      price: row.priceMode === "ON_REQUEST" ? null : row.pricePerUnit,
      currency: row.currency,
      quantity: row.quantityAvailable,
      unit: row.unit,
      minOrderQuantity: row.minOrderQuantity,
      lotIncrement: row.lotIncrement,
      leadTimeDays: row.leadTimeDays,
      rating: reviewByListing.get(row.id)?._avg.rating ?? 0,
      reviewCount: reviewByListing.get(row.id)?._count._all ?? 0,
      responseRate: responseByListing.get(row.id)?.total
        ? Math.round(
            (responseByListing.get(row.id)!.replied /
              responseByListing.get(row.id)!.total) *
              100,
          )
        : 0,
      verified:
        row.sourceType === "seller_submitted" &&
        approvedSellerCompanies.has(row.seller.id),
      tradeAssurance: false,
      yearsActive: row.yearsActive,
      ordersCompleted: ordersByListing.get(row.id) ?? 0,
      description: row.description.slice(0, 360),
      packaging: row.packaging,
      handlingRequirements: row.handlingRequirements,
      paymentTerms: row.paymentTerms,
      availableFrom: row.availableFrom,
      availableUntil: row.availableUntil,
      hasDocuments: row.assets.length > 0,
      documentKinds: [...new Set(row.assets.map((asset) => asset.kind))],
      sourceType: row.sourceType,
      sourceName: row.sourceName,
      sourceUrl: row.sourceUrl,
      externalId: row.externalId,
      rawQuantityText: row.rawQuantityText,
      rawLocationText: row.rawLocationText,
      lastVerifiedAt: row.lastVerifiedAt ?? row.updatedAt,
    }));
    const elapsedMs = Math.round((performance.now() - started) * 10) / 10;
    const payload = {
      items,
      pageInfo: {
        hasMore,
        nextCursor:
          hasMore && items.length
            ? encodeCursor(items[items.length - 1].id)
            : null,
        limit: filters.limit,
      },
      appliedFilters: filters,
    };
    const payloadBytes = Buffer.byteLength(JSON.stringify(payload));
    if (elapsedMs > 500 || payloadBytes > 256 * 1024) {
      console.warn("[MarketplaceQueryBudget]", {
        elapsedMs,
        payloadBytes,
        filters,
      });
    }
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "private, max-age=15, stale-while-revalidate=30",
        "Server-Timing": `marketplace;dur=${elapsedMs}`,
        "X-SymbiOS-Page-Limit": String(filters.limit),
        "X-SymbiOS-Payload-Bytes": String(payloadBytes),
        "X-SymbiOS-Performance-Budget": "500ms;262144bytes",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
