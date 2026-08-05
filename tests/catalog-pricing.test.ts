import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { catalogOrderBy, fixedPriceOnly } from "@/server/listings/policy";

/**
 * Ordering and filtering of unpriced listings, against a real PostgreSQL.
 *
 * An ON_REQUEST listing stores pricePerUnit 0 because there is no price to
 * store. Sorted naively that makes it the cheapest row on the page, and a
 * maxPrice filter matches it. Both would present "no price" as "free".
 *
 * The route and these tests share catalogOrderBy and fixedPriceOnly, so this
 * exercises the real definitions rather than a copy of them.
 *
 * Runs against the docker-compose database, never the application's. Skips
 * itself when the container is not running.
 */
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  "postgresql://symbi:symbi_local_dev@localhost:5432/symbi_dev";

const prisma = new PrismaClient({ datasourceUrl: TEST_DATABASE_URL });

const databaseReachable: boolean = await prisma
  .$queryRaw`SELECT 1`
  .then(() => true)
  .catch(() => false);

const suffix = Math.random().toString(36).slice(2, 10);
const companyId = `test_company_${suffix}`;
const materialId = `test_material_${suffix}`;

const CHEAP = `test_listing_${suffix}_cheap`;
const DEAR = `test_listing_${suffix}_dear`;
const UNPRICED = `test_listing_${suffix}_unpriced`;

async function cleanup() {
  await prisma.marketplaceListing.deleteMany({
    where: { id: { in: [CHEAP, DEAR, UNPRICED] } },
  });
  await prisma.wasteMaterial.deleteMany({ where: { id: materialId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
}

function listing(id: string, priceMode: string, pricePerUnit: number) {
  return {
    id,
    title: `Concurrency pricing fixture ${id}`,
    slug: id,
    sourceType: "seller_submitted",
    materialId,
    sellerCompanyId: companyId,
    category: "Metal Scrap",
    subcategory: "Aluminium",
    area: "Peenya",
    city: "Bengaluru",
    state: "Karnataka",
    country: "India",
    priceMode,
    pricePerUnit,
    minOrderQuantity: 1,
    quantityAvailable: 100,
    leadTimeDays: 3,
    rating: 4,
    responseRate: 90,
    yearsActive: 1,
    ordersCompleted: 1,
    description: "Fixture listing for the pricing tests.",
    packaging: "Loose",
    paymentTerms: "Advance",
    status: "ACTIVE",
  };
}

/** Restricts each query to this run's fixtures. */
const onlyFixtures = { id: { in: [CHEAP, DEAR, UNPRICED] } };

describe.skipIf(!databaseReachable)("unpriced listings in the catalogue", () => {
  beforeAll(async () => {
    await cleanup();
    await prisma.company.create({
      data: {
        id: companyId,
        name: `Pricing Test Seller ${suffix}`,
        industry: "Recycling",
        location: "Bengaluru, Karnataka",
        carbonRating: "B",
        latitude: 12.9716,
        longitude: 77.5946,
        capacity: 100,
      },
    });
    await prisma.wasteMaterial.create({
      data: {
        id: materialId,
        name: `Pricing Test Material ${suffix}`,
        toxicityLevel: "none",
        baseElement: "Aluminium",
        category: "Metal Scrap",
        description: "Fixture material for the pricing tests.",
      },
    });
    await prisma.marketplaceListing.createMany({
      data: [
        listing(CHEAP, "FIXED", 100),
        listing(DEAR, "FIXED", 900),
        // No price to state, so it stores 0 — the value the sort must not trust.
        listing(UNPRICED, "ON_REQUEST", 0),
      ],
    });
  }, 60_000);

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  }, 60_000);

  it("does not surface an unpriced listing at the top of price ascending", async () => {
    const rows = await prisma.marketplaceListing.findMany({
      where: onlyFixtures,
      orderBy: catalogOrderBy("price_asc"),
      select: { id: true },
    });
    // Naive ordering would put the ON_REQUEST row first at ₹0.
    expect(rows.map((row) => row.id)).toEqual([CHEAP, DEAR, UNPRICED]);
    expect(rows[0].id).not.toBe(UNPRICED);
  });

  it("keeps the unpriced listing last in price descending too", async () => {
    const rows = await prisma.marketplaceListing.findMany({
      where: onlyFixtures,
      orderBy: catalogOrderBy("price_desc"),
      select: { id: true },
    });
    expect(rows.map((row) => row.id)).toEqual([DEAR, CHEAP, UNPRICED]);
  });

  it("never interleaves unpriced listings with priced ones", async () => {
    for (const sort of ["price_asc", "price_desc"] as const) {
      const rows = await prisma.marketplaceListing.findMany({
        where: onlyFixtures,
        orderBy: catalogOrderBy(sort),
        select: { priceMode: true },
      });
      const lastFixed = rows.map((r) => r.priceMode).lastIndexOf("FIXED");
      const firstOnRequest = rows.map((r) => r.priceMode).indexOf("ON_REQUEST");
      expect(firstOnRequest).toBeGreaterThan(lastFixed);
    }
  });

  it("excludes unpriced listings from a maxPrice filter", async () => {
    const rows = await prisma.marketplaceListing.findMany({
      where: {
        AND: [onlyFixtures, fixedPriceOnly, { pricePerUnit: { lte: 500 } }],
      },
      select: { id: true },
    });
    // Without the priceMode clause the ₹0 row would match any maxPrice.
    expect(rows.map((row) => row.id)).toEqual([CHEAP]);
  });

  it("excludes unpriced listings from a minPrice filter", async () => {
    const rows = await prisma.marketplaceListing.findMany({
      where: {
        AND: [onlyFixtures, fixedPriceOnly, { pricePerUnit: { gte: 0 } }],
      },
      select: { id: true },
    });
    expect(rows.map((row) => row.id).sort()).toEqual([CHEAP, DEAR].sort());
  });
});
