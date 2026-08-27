import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  "postgresql://symbi:symbi_local_dev@localhost:5432/symbi_dev";
process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.DIRECT_URL = TEST_DATABASE_URL;
process.env.LISTING_EMBEDDING_PROVIDER = "ranked-feed-fixture";

const { default: prisma } = await import("@/lib/prisma");
const { registerEmbeddingProvider } =
  await import("@/server/semantic/embedding-provider");
const { refreshListingEmbedding } =
  await import("@/server/semantic/listing-embeddings");
const { rankBuyerFeed } = await import("@/server/feed/ranked-feed");

registerEmbeddingProvider("ranked-feed-fixture", () => ({
  name: "ranked-feed-fixture",
  dimensions: 768,
  embed: async (inputs: readonly string[]) =>
    inputs.map((input) => {
      const vector = Array(768).fill(0) as number[];
      // Deterministic, non-zero vectors so cosine search exercises the HNSW
      // operator without requiring any external embedding API in tests.
      vector[0] = 1;
      vector[1] = input.toLowerCase().includes("metal") ? 1 : 0.5;
      return vector;
    }),
}));

const databaseReachable = await prisma.$queryRaw`SELECT 1`
  .then(() => true)
  .catch(() => false);

const suffix = Math.random().toString(36).slice(2, 10);
const buyerId = `feed_buyer_${suffix}`;
const companyId = `feed_seller_${suffix}`;
const materialId = `feed_material_${suffix}`;
const listingId = `feed_listing_${suffix}`;
const secondListingId = `feed_listing_second_${suffix}`;

async function cleanup() {
  await prisma.buyerDemandProfile.deleteMany({ where: { userId: buyerId } });
  await prisma.marketplaceListing.deleteMany({
    where: { id: { in: [listingId, secondListingId] } },
  });
  await prisma.wasteMaterial.deleteMany({ where: { id: materialId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
  await prisma.user.deleteMany({ where: { id: buyerId } });
}

describe.skipIf(!databaseReachable)("ranked buyer feed with pgvector", () => {
  beforeAll(async () => {
    await cleanup();
    await prisma.user.create({
      data: {
        id: buyerId,
        email: `feed-${suffix}@test.invalid`,
        passwordHash: "not-a-real-hash",
        role: "BUYER",
        companyName: `Feed Buyer ${suffix}`,
      },
    });
    await prisma.company.create({
      data: {
        id: companyId,
        name: `Feed Seller ${suffix}`,
        industry: "Metal recycling",
        location: "Mumbai, Maharashtra",
        carbonRating: "UNRATED",
        latitude: 19.076,
        longitude: 72.8777,
        capacity: 100,
      },
    });
    await prisma.user.update({
      where: { id: buyerId },
      data: { companyId },
    });
    await prisma.wasteMaterial.create({
      data: {
        id: materialId,
        name: `Copper Feed Material ${suffix}`,
        toxicityLevel: "none",
        baseElement: "Copper",
        category: "Metal Scrap",
        description: "Clean copper turnings",
      },
    });
    await prisma.marketplaceListing.create({
      data: {
        id: listingId,
        title: `Copper turnings ${suffix}`,
        slug: `copper-turnings-${suffix}`,
        sourceType: "real_api",
        sourceName: "Feed fixture",
        externalId: `feed:${suffix}`,
        materialId,
        sellerCompanyId: companyId,
        category: "Metal Scrap",
        subcategory: "Copper turnings",
        area: "Andheri",
        city: "Mumbai",
        state: "Maharashtra",
        country: "India",
        pricePerUnit: 50_000,
        minOrderQuantity: 1,
        quantityAvailable: 20,
        leadTimeDays: 2,
        rating: 0,
        responseRate: 0,
        yearsActive: 0,
        ordersCompleted: 0,
        description: "Clean segregated copper turnings",
        packaging: "Jumbo bags",
        paymentTerms: "On request",
        status: "ACTIVE",
        latitude: 19.076,
        longitude: 72.8777,
      },
    });
    await prisma.marketplaceListing.create({
      data: {
        id: secondListingId,
        title: `Copper wire scrap ${suffix}`,
        slug: `copper-wire-scrap-${suffix}`,
        sourceType: "real_api",
        sourceName: "Feed fixture",
        externalId: `feed:second:${suffix}`,
        materialId,
        sellerCompanyId: companyId,
        category: "Metal Scrap",
        subcategory: "Copper wire",
        area: "Bandra",
        city: "Mumbai",
        state: "Maharashtra",
        country: "India",
        pricePerUnit: 52_000,
        minOrderQuantity: 1,
        quantityAvailable: 15,
        leadTimeDays: 3,
        rating: 0,
        responseRate: 0,
        yearsActive: 0,
        ordersCompleted: 0,
        description: "Segregated copper wire scrap",
        packaging: "Bales",
        paymentTerms: "On request",
        status: "ACTIVE",
        latitude: 19.06,
        longitude: 72.84,
      },
    });
    await refreshListingEmbedding(listingId);
    await refreshListingEmbedding(secondListingId);
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("records when a listing embedding was refreshed", async () => {
    const listing = await prisma.marketplaceListing.findUniqueOrThrow({
      where: { id: listingId },
      select: { embeddingUpdatedAt: true, updatedAt: true },
    });
    expect(listing.embeddingUpdatedAt).toBeInstanceOf(Date);
    expect(listing.embeddingUpdatedAt!.getTime()).toBeGreaterThanOrEqual(
      listing.updatedAt.getTime(),
    );
  });

  it("retrieves and scores a cold-start listing through the pgvector seed path", async () => {
    const result = await rankBuyerFeed(buyerId, { limit: 10 });
    const fixture = result.items.find((item) => item.id === listingId);
    expect(fixture).toBeDefined();
    expect(fixture?.relevanceKind).toBe("relevance");
    expect(fixture?.relevanceScore).toBeGreaterThan(0);
    expect(result.ranking).toMatchObject({
      coldStart: true,
      historyEventCount: 0,
    });
    expect(result.ranking).toMatchObject({
      preferredCategories: ["Metal Scrap"],
    });
  });

  it("uses a stable scoring snapshot across cursor pages", async () => {
    const first = await rankBuyerFeed(buyerId, { limit: 1 });
    expect(first.pageInfo.hasMore).toBe(true);
    expect(first.pageInfo.nextCursor).not.toBeNull();
    const second = await rankBuyerFeed(buyerId, {
      limit: 1,
      cursor: first.pageInfo.nextCursor!,
    });
    expect(second.items[0]?.id).not.toBe(first.items[0]?.id);
    expect(
      second.pageInfo.nextCursor?.asOf ?? first.pageInfo.nextCursor?.asOf,
    ).toBe(first.pageInfo.nextCursor?.asOf);
  });

  it("falls back to recent listings when the profile is embedded before the catalogue", async () => {
    await prisma.$executeRaw`
      UPDATE "MarketplaceListing"
      SET "embedding" = NULL
      WHERE "id" IN (${listingId}, ${secondListingId})
    `;
    await prisma.buyerDemandProfile.deleteMany({ where: { userId: buyerId } });

    try {
      const result = await rankBuyerFeed(buyerId, { limit: 10 });
      expect(result.items.length).toBeGreaterThan(0);
      expect(
        result.items.every((item) => item.category === "Metal Scrap"),
      ).toBe(true);
      expect(result.ranking).toMatchObject({ coldStart: true });
    } finally {
      await refreshListingEmbedding(listingId);
      await refreshListingEmbedding(secondListingId);
    }
  });
});
