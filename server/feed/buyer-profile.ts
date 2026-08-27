import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { MARKETPLACE_RANKING_CONFIG } from "@/server/feed/config";
import type { BuyerScoringContext } from "@/server/feed/scoring";
import {
  getEmbeddingProvider,
  validateEmbedding,
} from "@/server/semantic/embedding-provider";
import { vectorLiteral } from "@/server/semantic/listing-embeddings";
import {
  buildPreferredCategories,
  type PreferredCategory,
} from "@/server/feed/category-affinity";

export interface BuyerDemandProfile extends BuyerScoringContext {
  profileText: string;
  embedding: number[] | null;
  seedMaterialIds: string[];
  preferredCategories: PreferredCategory[];
  historyEventCount: number;
  sourceUpdatedAt: Date;
}

interface CachedProfileRow {
  profile_text: string;
  embedding_text: string | null;
  source_updated_at: Date;
  updated_at: Date;
}

function numberValue(value: unknown) {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function average(values: Array<number | null>) {
  const valid = values.filter((value): value is number => value !== null && value > 0);
  return valid.length
    ? valid.reduce((sum, value) => sum + value, 0) / valid.length
    : null;
}

function latestDate(values: Date[]) {
  return new Date(Math.max(...values.map((value) => value.getTime())));
}

function parseVector(value: string | null) {
  if (!value) return null;
  const vector = value
    .slice(1, -1)
    .split(",")
    .map(Number);
  return validateEmbedding(vector);
}

function profileSection(label: string, values: string[], repetitions = 1) {
  if (values.length === 0) return "";
  const body = values.join("; ");
  return Array.from({ length: repetitions }, () => `${label}: ${body}`).join("\n");
}

export async function buildBuyerDemandProfile(
  buyerId: string,
): Promise<BuyerDemandProfile> {
  const user = await prisma.user.findUnique({
    where: { id: buyerId },
    select: {
      id: true,
      isEvalOnly: true,
      companyName: true,
      createdAt: true,
      companyId: true,
      company: {
        select: {
          industry: true,
          latitude: true,
          longitude: true,
          updatedAt: true,
        },
      },
      addresses: {
        where: { isDefaultShipping: true },
        select: { latitude: true, longitude: true, city: true, state: true, updatedAt: true },
        take: 1,
      },
    },
  });
  if (!user) throw new Error(`Buyer ${buyerId} does not exist.`);

  const demandWhere = user.companyId
    ? { OR: [{ userId: buyerId }, { companyId: user.companyId }] }
    : { userId: buyerId };
  const [demands, orders, bids, cartItems, wishlistItems] = await Promise.all([
    prisma.demand.findMany({
      where: demandWhere,
      select: {
        query: true,
        category: true,
        subcategory: true,
        materialId: true,
        quantity: true,
        maxPrice: true,
        latitude: true,
        longitude: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 30,
    }),
    prisma.purchaseOrder.findMany({
      where: {
        buyerUserId: buyerId,
        isEvalOnly: user.isEvalOnly,
        NOT: { status: "CANCELLED" },
      },
      select: {
        updatedAt: true,
        items: {
          select: {
            quantity: true,
            pricePerUnit: true,
            listing: {
              select: {
                materialId: true,
                title: true,
                category: true,
                subcategory: true,
              },
            },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 30,
    }),
    prisma.bid.findMany({
      where: { bidderUserId: buyerId },
      select: {
        materialName: true,
        materialId: true,
        quantity: true,
        pricePerUnit: true,
        updatedAt: true,
        listing: {
          select: { materialId: true, category: true, subcategory: true },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 30,
    }),
    prisma.cartItem.findMany({
      where: { userId: buyerId },
      select: {
        quantity: true,
        priceSnapshot: true,
        updatedAt: true,
        listing: {
          select: { materialId: true, title: true, category: true, subcategory: true },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 30,
    }),
    prisma.wishlistItem.findMany({
      where: { userId: buyerId },
      select: {
        createdAt: true,
        listing: {
          select: { materialId: true, title: true, category: true, subcategory: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);

  const orderItems = orders.flatMap((order) => order.items);
  const historyEventCount =
    demands.length + orders.length + bids.length + cartItems.length + wishlistItems.length;
  const preferredCategories = buildPreferredCategories({
    industry: user.company?.industry,
    behavioralCategories: [
      ...demands.map((item) => item.category),
      ...orderItems.map((item) => item.listing.category),
      ...bids.map((item) => item.listing?.category),
      ...cartItems.map((item) => item.listing.category),
      ...wishlistItems.map((item) => item.listing.category),
    ],
    hasHistory: historyEventCount > 0,
  });
  const seedMaterialIds = [
    ...demands.map((item) => item.materialId),
    ...orderItems.map((item) => item.listing.materialId),
    ...bids.map((item) => item.materialId ?? item.listing?.materialId),
    ...cartItems.map((item) => item.listing.materialId),
    ...wishlistItems.map((item) => item.listing.materialId),
  ].filter((id): id is string => Boolean(id));

  const profileText = [
    `Buyer company: ${user.companyName}`,
    `Buyer industry: ${user.company?.industry || "industrial materials"}`,
    profileSection(
      "Explicit demands",
      demands.map((item) =>
        [item.query, item.category, item.subcategory].filter(Boolean).join(" / "),
      ),
      3,
    ),
    profileSection(
      "Purchased materials",
      orderItems.map((item) =>
        [item.listing.title, item.listing.category, item.listing.subcategory]
          .filter(Boolean)
          .join(" / "),
      ),
      3,
    ),
    profileSection(
      "Bid interests",
      bids.map((item) =>
        [item.materialName, item.listing?.category, item.listing?.subcategory]
          .filter(Boolean)
          .join(" / "),
      ),
      2,
    ),
    profileSection(
      "Cart interests",
      cartItems.map((item) =>
        [item.listing.title, item.listing.category, item.listing.subcategory]
          .filter(Boolean)
          .join(" / "),
      ),
    ),
    profileSection(
      "Saved interests",
      wishlistItems.map((item) =>
        [item.listing.title, item.listing.category, item.listing.subcategory]
          .filter(Boolean)
          .join(" / "),
      ),
    ),
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, MARKETPLACE_RANKING_CONFIG.embedding.maxInputCharacters);

  const dates = [
    user.createdAt,
    ...(user.company ? [user.company.updatedAt] : []),
    ...user.addresses.map((item) => item.updatedAt),
    ...demands.map((item) => item.updatedAt),
    ...orders.map((item) => item.updatedAt),
    ...bids.map((item) => item.updatedAt),
    ...cartItems.map((item) => item.updatedAt),
    ...wishlistItems.map((item) => item.createdAt),
  ];
  const sourceUpdatedAt = latestDate(dates);
  const [cached] = await prisma.$queryRaw<CachedProfileRow[]>(
    Prisma.sql`SELECT
                 "profile_text",
                 "embedding"::text AS embedding_text,
                 "source_updated_at",
                 "updated_at"
               FROM "buyer_demand_profiles"
               WHERE "user_id" = ${buyerId}`,
  );

  let embedding =
    cached?.profile_text === profileText ? parseVector(cached.embedding_text) : null;
  const cacheAgeMs = cached
    ? Date.now() - cached.updated_at.getTime()
    : Number.POSITIVE_INFINITY;
  const cacheFresh =
    embedding !== null &&
    cached.profile_text === profileText &&
    cacheAgeMs <
      MARKETPLACE_RANKING_CONFIG.retrieval.profileFreshnessMinutes * 60_000;

  if (!cacheFresh) {
    try {
      const provider = getEmbeddingProvider();
      const [generated] = await provider.embed([profileText]);
      embedding = generated ? validateEmbedding(generated, provider.dimensions) : null;
    } catch (error) {
      console.warn("[BuyerDemandProfile] embedding unavailable", {
        buyerId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      embedding ??= cached ? parseVector(cached.embedding_text) : null;
    }

    const embeddingSql = embedding
      ? Prisma.sql`CAST(${vectorLiteral(embedding)} AS vector)`
      : Prisma.sql`NULL`;
    await prisma.$executeRaw(
      Prisma.sql`INSERT INTO "buyer_demand_profiles" (
                   "user_id", "profile_text", "embedding", "history_event_count",
                   "source_updated_at", "updated_at"
                 ) VALUES (
                   ${buyerId}, ${profileText}, ${embeddingSql}, ${historyEventCount},
                   ${sourceUpdatedAt}, ${new Date()}
                 )
                 ON CONFLICT ("user_id") DO UPDATE SET
                   "profile_text" = EXCLUDED."profile_text",
                   "embedding" = EXCLUDED."embedding",
                   "history_event_count" = EXCLUDED."history_event_count",
                   "source_updated_at" = EXCLUDED."source_updated_at",
                   "updated_at" = EXCLUDED."updated_at"`,
    );
  }

  const latestDemandLocation = demands.find(
    (item) => item.latitude !== null && item.longitude !== null,
  );
  const address = user.addresses[0];
  const companyHasCoordinates =
    user.company &&
    (user.company.latitude !== 0 || user.company.longitude !== 0);

  return {
    buyerId,
    hasHistory: historyEventCount > 0,
    profileText,
    embedding,
    seedMaterialIds: [...new Set(seedMaterialIds)],
    preferredCategories,
    historyEventCount,
    sourceUpdatedAt,
    latitude:
      latestDemandLocation?.latitude ??
      address?.latitude ??
      (companyHasCoordinates ? user.company!.latitude : null),
    longitude:
      latestDemandLocation?.longitude ??
      address?.longitude ??
      (companyHasCoordinates ? user.company!.longitude : null),
    targetPrice: average([
      ...demands.map((item) => numberValue(item.maxPrice)),
      ...orderItems.map((item) => numberValue(item.pricePerUnit)),
      ...bids.map((item) => numberValue(item.pricePerUnit)),
      ...cartItems.map((item) => numberValue(item.priceSnapshot)),
    ]),
    targetQuantity: average([
      ...demands.map((item) => item.quantity),
      ...orderItems.map((item) => item.quantity),
      ...bids.map((item) => item.quantity),
      ...cartItems.map((item) => item.quantity),
    ]),
  };
}
