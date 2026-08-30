import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "@/lib/prisma";
import {
  listingCapabilities,
  listingTrustLabel,
} from "@/lib/listing-mode";
import {
  listingHasExpired,
  managedListingWhere,
  publicListingWhere,
  transactableListingWhere,
} from "@/server/listings/policy";

describe("marketplace listing capabilities", () => {
  it("keeps external and evaluation records visible without transaction actions", () => {
    expect(
      listingCapabilities({
        listingMode: "EXTERNAL_LEAD",
        verified: false,
        sellerUserId: null,
        priceMode: "FIXED",
        price: 100,
      }),
    ).toEqual({
      canBid: false,
      canMessage: false,
      canBuy: false,
      canAddToCart: false,
      canViewSource: true,
    });
    expect(
      listingCapabilities({
        listingMode: "EVAL",
        verified: false,
        sellerUserId: null,
        priceMode: "FIXED",
        price: 100,
      }),
    ).toMatchObject({
      canBid: false,
      canMessage: false,
      canBuy: false,
      canAddToCart: false,
      canViewSource: false,
    });
  });

  it("offers managed actions only when verification and seller routing exist", () => {
    expect(
      listingCapabilities({
        listingMode: "MANAGED",
        verified: true,
        sellerUserId: "seller-1",
        priceMode: "FIXED",
        price: 100,
      }),
    ).toMatchObject({ canBid: true, canMessage: true, canBuy: true });
    expect(
      listingCapabilities({
        listingMode: "MANAGED",
        verified: true,
        sellerUserId: "seller-1",
        priceMode: "ON_REQUEST",
        price: null,
      }),
    ).toMatchObject({ canBid: true, canMessage: true, canBuy: false });
  });

  it("uses the three explicit trust labels", () => {
    expect(listingTrustLabel("MANAGED")).toBe("Verified SymbiOS seller");
    expect(listingTrustLabel("EXTERNAL_LEAD")).toBe("External source");
    expect(listingTrustLabel("EVAL")).toBe("Synthetic demo listing");
  });

  it("treats the expiry boundary as unavailable", () => {
    const now = new Date("2026-08-30T12:00:00.000Z");
    expect(listingHasExpired(null, now)).toBe(false);
    expect(listingHasExpired(new Date("2026-08-30T12:00:00.000Z"), now)).toBe(true);
    expect(listingHasExpired(new Date("2026-08-30T12:00:01.000Z"), now)).toBe(false);
  });
});

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  "postgresql://symbi:symbi_local_dev@localhost:5432/symbi_dev";
const prisma = createPrismaClient({ datasourceUrl: TEST_DATABASE_URL });
const databaseReachable: boolean = await prisma
  .$queryRaw`SELECT 1`
  .then(() => true)
  .catch(() => false);
const suffix = Math.random().toString(36).slice(2, 10);
const materialId = `mkt_material_${suffix}`;
const sellerCompanyId = `mkt_seller_company_${suffix}`;
const ownerlessCompanyId = `mkt_ownerless_company_${suffix}`;
const sellerId = `mkt_seller_${suffix}`;
const ids = {
  managedFixed: `mkt_managed_fixed_${suffix}`,
  managedQuote: `mkt_managed_quote_${suffix}`,
  external: `mkt_external_${suffix}`,
  evaluation: `mkt_eval_${suffix}`,
  ownerless: `mkt_ownerless_${suffix}`,
  unverified: `mkt_unverified_${suffix}`,
};
const listingIds = Object.values(ids);

async function cleanup() {
  await prisma.marketplaceListing.deleteMany({ where: { id: { in: listingIds } } });
  await prisma.wasteMaterial.deleteMany({ where: { id: materialId } });
  await prisma.user.deleteMany({ where: { id: sellerId } });
  await prisma.company.deleteMany({
    where: { id: { in: [sellerCompanyId, ownerlessCompanyId] } },
  });
}

describe.skipIf(!databaseReachable)("marketplace transaction policy integration", () => {
  beforeAll(async () => {
    await cleanup();
    await prisma.company.createMany({
      data: [
        {
          id: sellerCompanyId,
          name: `MKT Managed Seller ${suffix}`,
          industry: "Recycling",
          location: "Pune, Maharashtra",
          carbonRating: "UNRATED",
          latitude: 18.5204,
          longitude: 73.8567,
          capacity: 100,
        },
        {
          id: ownerlessCompanyId,
          name: `MKT External Source ${suffix}`,
          industry: "Recycling",
          location: "Mumbai, Maharashtra",
          carbonRating: "UNRATED",
          latitude: 19.076,
          longitude: 72.8777,
          capacity: 100,
        },
      ],
    });
    await prisma.user.create({
      data: {
        id: sellerId,
        email: `${sellerId}@test.invalid`,
        passwordHash: "not-a-real-hash",
        role: "SELLER",
        accountStatus: "ACTIVE",
        companyName: `MKT Managed Seller ${suffix}`,
        companyId: sellerCompanyId,
        sellerOnboarding: {
          create: {
            status: "APPROVED",
            currentStep: "COMPLETE",
            verifiedAt: new Date(),
          },
        },
      },
    });
    await prisma.wasteMaterial.create({
      data: {
        id: materialId,
        name: `MKT HDPE ${suffix}`,
        toxicityLevel: "none",
        baseElement: "HDPE",
        category: "Plastic Scrap",
        description: "Marketplace integrity fixture.",
      },
    });
    const common = {
      materialId,
      category: "Plastic Scrap",
      subcategory: "HDPE",
      area: "Industrial Estate",
      city: "Pune",
      state: "Maharashtra",
      country: "India",
      pricePerUnit: 100,
      minOrderQuantity: 1,
      quantityAvailable: 10,
      leadTimeDays: 2,
      rating: 0,
      responseRate: 0,
      yearsActive: 1,
      ordersCompleted: 0,
      description: "Marketplace integrity fixture.",
      packaging: "Bales",
      paymentTerms: "Advance",
      status: "ACTIVE",
    };
    await prisma.marketplaceListing.createMany({
      data: [
        {
          ...common,
          id: ids.managedFixed,
          slug: ids.managedFixed,
          title: "Managed fixed listing",
          listingMode: "MANAGED",
          sourceType: "seller_submitted",
          sellerCompanyId,
          verified: true,
          priceMode: "FIXED",
        },
        {
          ...common,
          id: ids.managedQuote,
          slug: ids.managedQuote,
          title: "Managed quote listing",
          listingMode: "MANAGED",
          sourceType: "seller_submitted",
          sellerCompanyId,
          verified: true,
          priceMode: "ON_REQUEST",
          pricePerUnit: 0,
        },
        {
          ...common,
          id: ids.external,
          slug: ids.external,
          title: "External listing",
          listingMode: "EXTERNAL_LEAD",
          sourceType: "tradeindia",
          sellerCompanyId: ownerlessCompanyId,
          verified: false,
        },
        {
          ...common,
          id: ids.evaluation,
          slug: ids.evaluation,
          title: "Evaluation listing",
          listingMode: "EVAL",
          sourceType: "synthetic",
          sellerCompanyId: ownerlessCompanyId,
          isEvalOnly: true,
          verified: false,
        },
        {
          ...common,
          id: ids.ownerless,
          slug: ids.ownerless,
          title: "Ownerless managed listing",
          listingMode: "MANAGED",
          sourceType: "seller_submitted",
          sellerCompanyId: ownerlessCompanyId,
          verified: true,
        },
        {
          ...common,
          id: ids.unverified,
          slug: ids.unverified,
          title: "Unverified managed listing",
          listingMode: "MANAGED",
          sourceType: "seller_submitted",
          sellerCompanyId,
          verified: false,
        },
      ],
    });
  }, 30_000);

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  }, 30_000);

  it("keeps every active fixture in the public catalogue", async () => {
    const rows = await prisma.marketplaceListing.findMany({
      where: { id: { in: listingIds }, ...publicListingWhere },
      select: { id: true },
    });
    expect(rows).toHaveLength(listingIds.length);
  });

  it("allows bids only for verified managed listings with an eligible seller", async () => {
    const rows = await prisma.marketplaceListing.findMany({
      where: { id: { in: listingIds }, ...managedListingWhere },
      select: { id: true },
    });
    expect(rows.map((row) => row.id).sort()).toEqual(
      [ids.managedFixed, ids.managedQuote].sort(),
    );
  });

  it("allows cart and checkout only for fixed-price managed listings", async () => {
    const rows = await prisma.marketplaceListing.findMany({
      where: { id: { in: listingIds }, ...transactableListingWhere },
      select: { id: true },
    });
    expect(rows.map((row) => row.id)).toEqual([ids.managedFixed]);
  });
});
