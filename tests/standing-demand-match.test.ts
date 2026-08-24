import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "@/lib/prisma";
import { matchListingToOpenDemands } from "@/server/matching";

/**
 * The standing half of an RFQ, against a real database.
 *
 * A buyer told "your request stays open and we will tell you when something
 * fits" is owed a match that means what their original search meant. The path
 * this replaces selected demands by `materialId` equality, which consulted none
 * of their constraints and — because demand and listing material IDs come from
 * different generators — selected nobody at all.
 *
 * These cases are the constraints a buyer would be angry to see ignored.
 */
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  "postgresql://symbi:symbi_local_dev@localhost:5432/symbi_dev";

const prisma = createPrismaClient({ datasourceUrl: TEST_DATABASE_URL });

// Skip rather than fail when the container is not running.
const databaseReachable: boolean = await prisma
  .$queryRaw`SELECT 1`
  .then(() => true)
  .catch(() => false);

const suffix = Math.random().toString(36).slice(2, 10);
const companyId = `sdm_company_${suffix}`;
const materialId = `sdm_material_${suffix}`;
const listingId = `sdm_listing_${suffix}`;
const demandIds: string[] = [];

// Pune, and a point ~120 km away, to exercise the distance filter for real.
const PUNE = { latitude: 18.5204, longitude: 73.8567 };

async function cleanup() {
  await prisma.listingMatch.deleteMany({ where: { listingId } });
  await prisma.demand.deleteMany({ where: { companyId } });
  await prisma.marketplaceListing.deleteMany({ where: { id: listingId } });
  await prisma.wasteMaterial.deleteMany({ where: { id: materialId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
}

async function makeDemand(overrides: Record<string, unknown>) {
  const demand = await prisma.demand.create({
    data: {
      companyId,
      materialId,
      query: "HDPE regrind",
      category: "Plastic Scrap",
      quantity: 50,
      unit: "ton",
      status: "OPEN",
      matchVersion: "rules-v1.0",
      ...overrides,
    },
  });
  demandIds.push(demand.id);
  return demand.id;
}

describe.skipIf(!databaseReachable)("standing demand matching", () => {
  beforeAll(async () => {
    await cleanup();
    await prisma.company.create({
      data: {
        id: companyId,
        name: `SDM Buyer ${suffix}`,
        industry: "Recycling",
        location: "Pune, Maharashtra",
        carbonRating: "B",
        latitude: PUNE.latitude,
        longitude: PUNE.longitude,
        capacity: 1000,
      },
    });
    await prisma.wasteMaterial.create({
      data: {
        id: materialId,
        name: `Plastic Scrap: HDPE regrind ${suffix}`,
        toxicityLevel: "none",
        baseElement: "HDPE regrind",
        category: "Plastic Scrap",
        description: "Fixture taxonomy record.",
      },
    });
    await prisma.marketplaceListing.create({
      data: {
        id: listingId,
        title: `Hot washed HDPE regrind, natural ${suffix}`,
        slug: `sdm-listing-${suffix}`,
        sourceType: "seller_submitted",
        materialId,
        sellerCompanyId: companyId,
        category: "Plastic Scrap",
        subcategory: "HDPE regrind",
        area: "Bhosari",
        city: "Pune",
        state: "Maharashtra",
        country: "India",
        latitude: PUNE.latitude,
        longitude: PUNE.longitude,
        priceMode: "FIXED",
        pricePerUnit: 500,
        currency: "INR",
        unit: "ton",
        minOrderQuantity: 10,
        lotIncrement: 5,
        quantityAvailable: 200,
        leadTimeDays: 3,
        rating: 4.5,
        responseRate: 90,
        yearsActive: 2,
        ordersCompleted: 10,
        description: "Fixture listing for standing demand matching.",
        packaging: "Loose",
        paymentTerms: "Advance",
        status: "ACTIVE",
      },
    });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("matches a demand posted before the listing existed", async () => {
    const id = await makeDemand({});
    const matches = await matchListingToOpenDemands(listingId);
    const mine = matches.find((match) => match.demandId === id);
    expect(mine).toBeDefined();
    expect(mine!.score).toBeGreaterThan(0);
    expect(mine!.explanations.length).toBeGreaterThan(2);
  });

  it("writes a ListingMatch row, so the RFQ page agrees with the notification", async () => {
    const id = await makeDemand({ query: "HDPE regrind persisted" });
    await matchListingToOpenDemands(listingId);
    const row = await prisma.listingMatch.findUnique({
      where: { demandId_listingId: { demandId: id, listingId } },
    });
    expect(row).not.toBeNull();
    expect(row!.version).toBe("rules-v1.0");
    expect(JSON.parse(row!.explanationJson).length).toBeGreaterThan(2);
  });

  it("is idempotent — re-approval updates rather than duplicating", async () => {
    const id = await makeDemand({ query: "HDPE regrind idempotent" });
    await matchListingToOpenDemands(listingId);
    await matchListingToOpenDemands(listingId);
    const rows = await prisma.listingMatch.findMany({
      where: { demandId: id, listingId },
    });
    expect(rows).toHaveLength(1);
  });

  it("respects the buyer's price ceiling", async () => {
    const id = await makeDemand({ query: "HDPE cheap", maxPrice: 100 });
    const matches = await matchListingToOpenDemands(listingId);
    expect(matches.find((match) => match.demandId === id)).toBeUndefined();
  });

  it("respects the seller's MOQ and the listing's stock", async () => {
    const tooSmall = await makeDemand({ query: "HDPE small", quantity: 5 });
    const tooLarge = await makeDemand({ query: "HDPE huge", quantity: 5000 });
    const matches = await matchListingToOpenDemands(listingId);
    const ids = matches.map((match) => match.demandId);
    expect(ids).not.toContain(tooSmall);
    expect(ids).not.toContain(tooLarge);
  });

  it("respects the lot increment", async () => {
    // MOQ 10 with a 5-ton increment permits 10, 15, 20 — not 12.
    const id = await makeDemand({ query: "HDPE off-lot", quantity: 12 });
    const matches = await matchListingToOpenDemands(listingId);
    expect(matches.find((match) => match.demandId === id)).toBeUndefined();
  });

  it("respects the requested radius", async () => {
    const near = await makeDemand({
      query: "HDPE near",
      latitude: PUNE.latitude,
      longitude: PUNE.longitude,
      maxDistanceKm: 50,
    });
    const far = await makeDemand({
      query: "HDPE far",
      latitude: 28.6139, // New Delhi, ~1,170 km from Pune
      longitude: 77.209,
      maxDistanceKm: 50,
    });
    const ids = (await matchListingToOpenDemands(listingId)).map((m) => m.demandId);
    expect(ids).toContain(near);
    expect(ids).not.toContain(far);
  });

  it("ignores demands in another category or unit", async () => {
    const otherCategory = await makeDemand({
      query: "steel scrap",
      category: "Metal Scrap",
    });
    const otherUnit = await makeDemand({ query: "HDPE by kg", unit: "kg" });
    const ids = (await matchListingToOpenDemands(listingId)).map((m) => m.demandId);
    expect(ids).not.toContain(otherCategory);
    expect(ids).not.toContain(otherUnit);
  });

  it("ignores demands that are no longer open", async () => {
    const closed = await makeDemand({ query: "HDPE closed", status: "CLOSED" });
    const ids = (await matchListingToOpenDemands(listingId)).map((m) => m.demandId);
    expect(ids).not.toContain(closed);
  });

  it("returns nothing for a listing that is not public", async () => {
    await makeDemand({ query: "HDPE hidden" });
    await prisma.marketplaceListing.update({
      where: { id: listingId },
      data: { status: "PENDING_REVIEW" },
    });
    expect(await matchListingToOpenDemands(listingId)).toEqual([]);
    await prisma.marketplaceListing.update({
      where: { id: listingId },
      data: { status: "ACTIVE" },
    });
  });

  it("returns best score first", async () => {
    await makeDemand({ query: "HDPE regrind natural hot washed" });
    await makeDemand({ query: "plastic" });
    const matches = await matchListingToOpenDemands(listingId);
    const scores = matches.map((match) => match.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });
});
