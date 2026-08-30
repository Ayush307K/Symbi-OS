import "dotenv/config";
import { createPrismaClient } from "@/lib/prisma";
import type { JWTPayload } from "@/lib/auth";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  appendMessageToThread,
  createListingMessageThread,
  requireThreadParticipant,
} from "@/server/messages";

// This suite uses the local PostgreSQL database because the relationship and
// cascade behavior are part of what it verifies. It skips cleanly when Docker
// is not running, matching the inventory concurrency integration test.
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  "postgresql://symbi:symbi_local_dev@localhost:5432/symbi_dev";
const prisma = createPrismaClient({ datasourceUrl: TEST_DATABASE_URL });
const databaseReachable: boolean = await prisma
  .$queryRaw`SELECT 1`
  .then(() => true)
  .catch(() => false);

const suffix = Math.random().toString(36).slice(2, 10);
const buyerId = `message_buyer_${suffix}`;
const sellerId = `message_seller_${suffix}`;
const sellerCompanyId = `message_seller_company_${suffix}`;
const externalCompanyId = `message_external_company_${suffix}`;
const materialId = `message_material_${suffix}`;
const platformListingId = `message_platform_listing_${suffix}`;
const externalListingId = `message_external_listing_${suffix}`;
const listingIds = [platformListingId, externalListingId];

const buyerAuth: JWTPayload = {
  userId: buyerId,
  email: `message-buyer-${suffix}@test.invalid`,
  role: "BUYER",
  companyName: `Message Buyer ${suffix}`,
  companyId: null,
  sessionId: `message-buyer-session-${suffix}`,
  tokenVersion: 0,
  isAdmin: false,
};
const sellerAuth: JWTPayload = {
  userId: sellerId,
  email: `message-seller-${suffix}@test.invalid`,
  role: "SELLER",
  companyName: `Message Seller ${suffix}`,
  companyId: sellerCompanyId,
  sessionId: `message-seller-session-${suffix}`,
  tokenVersion: 0,
  isAdmin: false,
};

async function cleanup() {
  await prisma.messageThread.deleteMany({
    where: {
      OR: [
        { listingId: { in: listingIds } },
        { buyerUserId: buyerId },
        { sellerUserId: sellerId },
      ],
    },
  });
  await prisma.marketplaceListing.deleteMany({
    where: { id: { in: listingIds } },
  });
  await prisma.wasteMaterial.deleteMany({ where: { id: materialId } });
  await prisma.user.deleteMany({ where: { id: { in: [buyerId, sellerId] } } });
  await prisma.company.deleteMany({
    where: { id: { in: [sellerCompanyId, externalCompanyId] } },
  });
}

describe.skipIf(!databaseReachable)("buyer/seller messaging integration", () => {
  beforeAll(async () => {
    await cleanup();
    await prisma.company.createMany({
      data: [
        {
          id: sellerCompanyId,
          name: `Message Platform Seller ${suffix}`,
          industry: "Recycling",
          location: "Pune, Maharashtra",
          carbonRating: "B",
          latitude: 18.5204,
          longitude: 73.8567,
          capacity: 500,
        },
        {
          id: externalCompanyId,
          name: `Message External Supplier ${suffix}`,
          industry: "Recycling",
          location: "Mumbai, Maharashtra",
          carbonRating: "B",
          latitude: 19.076,
          longitude: 72.8777,
          capacity: 500,
        },
      ],
    });
    await prisma.user.createMany({
      data: [
        {
          id: buyerId,
          email: buyerAuth.email,
          passwordHash: "not-a-real-hash",
          role: "BUYER",
          companyName: buyerAuth.companyName,
        },
        {
          id: sellerId,
          email: sellerAuth.email,
          passwordHash: "not-a-real-hash",
          role: "SELLER",
          companyName: sellerAuth.companyName,
          companyId: sellerCompanyId,
          accountStatus: "ACTIVE",
        },
      ],
    });
    await prisma.sellerOnboarding.create({
      data: {
        userId: sellerId,
        status: "APPROVED",
        currentStep: "COMPLETE",
        verifiedAt: new Date(),
      },
    });
    await prisma.wasteMaterial.create({
      data: {
        id: materialId,
        name: `Message Test Material ${suffix}`,
        toxicityLevel: "none",
        baseElement: "Polyethylene",
        category: "Plastic Scrap",
        description: "Safe fixture material for messaging integration tests.",
      },
    });

    const commonListing = {
      materialId,
      category: "Plastic Scrap",
      subcategory: "HDPE",
      area: "Industrial Estate",
      state: "Maharashtra",
      country: "India",
      pricePerUnit: 40000,
      minOrderQuantity: 1,
      quantityAvailable: 20,
      leadTimeDays: 3,
      rating: 0,
      responseRate: 0,
      yearsActive: 1,
      ordersCompleted: 0,
      description: "Fixture listing for messaging integration tests.",
      packaging: "Bales",
      paymentTerms: "Advance",
      status: "ACTIVE",
    };
    await prisma.marketplaceListing.createMany({
      data: [
        {
          ...commonListing,
          id: platformListingId,
          slug: `message-platform-listing-${suffix}`,
          title: `Platform HDPE Listing ${suffix}`,
          listingMode: "MANAGED",
          sourceType: "seller_submitted",
          verified: true,
          sellerCompanyId,
          city: "Pune",
        },
        {
          ...commonListing,
          id: externalListingId,
          slug: `message-external-listing-${suffix}`,
          title: `External HDPE Listing ${suffix}`,
          listingMode: "EXTERNAL_LEAD",
          sourceType: "tradeindia",
          sourceName: "TradeIndia",
          sourceUrl: `https://example.com/listings/${suffix}`,
          sellerCompanyId: externalCompanyId,
          city: "Mumbai",
        },
      ],
    });
  }, 30_000);

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  }, 30_000);

  it("delivers a buyer enquiry to the seller and the seller reply to the buyer", async () => {
    const opened = await createListingMessageThread(
      {
        listingId: platformListingId,
        buyer: buyerAuth,
        subject: "HDPE availability",
        body: "Please confirm the available quantity.",
      },
      prisma,
    );

    expect(opened.thread).toMatchObject({
      buyerUserId: buyerId,
      sellerUserId: sellerId,
      sellerCompanyId,
      listingId: platformListingId,
    });
    expect(opened.message).toMatchObject({
      senderUserId: buyerId,
      body: "Please confirm the available quantity.",
    });

    await expect(
      requireThreadParticipant(opened.thread.id, sellerAuth, prisma),
    ).resolves.toMatchObject({ id: opened.thread.id });

    const replied = await appendMessageToThread(
      {
        threadId: opened.thread.id,
        actor: sellerAuth,
        body: "Twenty tonnes are available for dispatch.",
      },
      prisma,
    );
    expect(replied.message).toMatchObject({
      senderUserId: sellerId,
      body: "Twenty tonnes are available for dispatch.",
    });

    const messages = await prisma.message.findMany({
      where: { threadId: opened.thread.id },
      orderBy: { createdAt: "asc" },
    });
    expect(messages.map((message) => message.senderUserId)).toEqual([
      buyerId,
      sellerId,
    ]);
  });

  it("rejects an external listing instead of creating a dead thread", async () => {
    await expect(
      createListingMessageThread(
        {
          listingId: externalListingId,
          buyer: buyerAuth,
          body: "Can this supplier reply inside SymbiOS?",
        },
        prisma,
      ),
    ).rejects.toMatchObject({
      status: 409,
      code: "SELLER_NOT_ON_PLATFORM",
      details: {
        sourceName: "TradeIndia",
        sourceUrl: `https://example.com/listings/${suffix}`,
      },
    });

    await expect(
      prisma.messageThread.count({ where: { listingId: externalListingId } }),
    ).resolves.toBe(0);
  });
});
