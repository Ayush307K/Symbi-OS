import "dotenv/config";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { JWTPayload } from "@/lib/auth";
import { createPrismaClient } from "@/lib/prisma";
import { orderInvoiceSnapshot } from "@/server/orders";

const authState = vi.hoisted(() => ({ current: null as JWTPayload | null }));

vi.mock("@/server/http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/http")>();
  return {
    ...actual,
    requireAdmin: vi.fn(async () => {
      if (!authState.current?.isAdmin) {
        throw new actual.ApiError(403, "Admin required", "FORBIDDEN");
      }
      return authState.current;
    }),
  };
});

import { GET as getAdminDisputes } from "@/app/api/admin/disputes/route";
import {
  disputeResolutionSchema,
  resolveDispute,
  type DisputeResolutionInput,
} from "@/server/disputes";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  "postgresql://symbi:symbi_local_dev@localhost:5432/symbi_dev";
const prisma = createPrismaClient({ datasourceUrl: TEST_DATABASE_URL });
const databaseReachable: boolean = await prisma
  .$queryRaw`SELECT 1`
  .then(() => true)
  .catch(() => false);
const suffix = Math.random().toString(36).slice(2, 10);
const companyId = `dispute_company_${suffix}`;
const materialId = `dispute_material_${suffix}`;
const buyerId = `dispute_buyer_${suffix}`;
const sellerId = `dispute_seller_${suffix}`;
const adminId = `dispute_admin_${suffix}`;
const actions = [
  "release",
  "refund",
  "partial",
  "replacement",
  "rejection",
] as const;
type FixtureKey = (typeof actions)[number];
const fixture = new Map<
  FixtureKey,
  { orderId: string; itemId: string; listingId: string; quantityBefore: number }
>();
const replacementListingId = `dispute_replacement_${suffix}`;

const adminAuth: JWTPayload = {
  userId: adminId,
  email: `${adminId}@test.invalid`,
  role: "BUYER",
  companyName: `Dispute Admin ${suffix}`,
  companyId: null,
  sessionId: `admin-${suffix}.secret`,
  tokenVersion: 0,
  isAdmin: true,
};

async function cleanup() {
  await prisma.purchaseOrder.deleteMany({
    where: { id: { in: [...fixture.values()].map((value) => value.orderId) } },
  });
  await prisma.marketplaceListing.deleteMany({
    where: {
      id: {
        in: [
          ...fixture.values().map((value) => value.listingId),
          replacementListingId,
        ],
      },
    },
  });
  await prisma.user.deleteMany({
    where: { id: { in: [buyerId, sellerId, adminId] } },
  });
  await prisma.company.deleteMany({ where: { id: companyId } });
  await prisma.wasteMaterial.deleteMany({ where: { id: materialId } });
}

function listingData(id: string, title: string, quantityAvailable: number) {
  return {
    id,
    slug: id,
    title,
    listingMode: "MANAGED" as const,
    sourceType: "seller_submitted",
    materialId,
    sellerCompanyId: companyId,
    category: "Plastic Scrap",
    subcategory: "HDPE flakes",
    area: "MIDC",
    city: "Pune",
    state: "Maharashtra",
    country: "India",
    pricePerUnit: 500,
    unit: "ton",
    minOrderQuantity: 1,
    lotIncrement: 1,
    quantityAvailable,
    leadTimeDays: 2,
    rating: 0,
    responseRate: 0,
    verified: true,
    yearsActive: 1,
    ordersCompleted: 0,
    description: "Safe HDPE dispute integration fixture.",
    packaging: "Bulk bags",
    paymentTerms: "Sandbox payment",
    status: "ACTIVE",
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  };
}

async function createOrder(key: FixtureKey) {
  const listingId = `dispute_listing_${key}_${suffix}`;
  const quantityBefore = 18;
  await prisma.marketplaceListing.create({
    data: listingData(listingId, `${key} HDPE ${suffix}`, quantityBefore),
  });
  const orderId = `00000000-0000-4000-8000-${String(actions.indexOf(key) + 1).padStart(12, "0")}`;
  const orderNumber = `SYM-DISPUTE-${key.toUpperCase()}-${suffix}`;
  const order = await prisma.purchaseOrder.create({
    data: {
      id: orderId,
      orderNumber,
      buyerUserId: buyerId,
      status: "CONFIRMED",
      paymentStatus: "DISPUTED",
      fulfillmentStatus: "UNFULFILLED",
      disputeStatus: "OPEN",
      subtotal: 1000,
      taxAmount: 0,
      shippingAmount: 0,
      buyerFeeAmount: 10,
      sellerFeeAmount: 20,
      totalAmount: 1010,
      currency: "INR",
      feeVersion: "fees-v1.0",
      taxNote: "Sandbox",
      items: {
        create: {
          listingId,
          sellerCompanyId: companyId,
          title: `${key} HDPE ${suffix}`,
          quantity: 2,
          unit: "ton",
          pricePerUnit: 500,
          lineTotal: 1000,
          status: "CONFIRMED",
        },
      },
    },
    include: { items: true },
  });
  const reservation = await prisma.inventoryReservation.create({
    data: {
      listingId,
      orderId: order.id,
      quantity: 2,
      status: "COMMITTED",
      expiresAt: new Date(),
      committedAt: new Date(),
    },
  });
  await prisma.inventoryMovement.create({
    data: {
      listingId,
      orderId: order.id,
      reservationId: reservation.id,
      quantityChange: -2,
      balanceAfter: quantityBefore,
      reason: "FIXTURE_ORDER_COMMIT",
      idempotencyKey: `dispute-fixture:${order.id}`,
    },
  });
  await prisma.demoPayment.create({
    data: {
      orderId: order.id,
      providerRef: `sandbox_${key}_${suffix}`,
      amount: 1010,
      status: "SUCCEEDED",
      idempotencyKey: `dispute-payment:${key}:${suffix}`,
      confirmedAt: new Date(),
    },
  });
  const snapshot = orderInvoiceSnapshot({
    ...order,
    purchaseOrderNumber: null,
    items: order.items,
  });
  await prisma.invoice.create({
    data: {
      orderId: order.id,
      invoiceNumber: `INV-DISPUTE-${key.toUpperCase()}-${suffix}`,
      snapshotJson: JSON.stringify(snapshot),
    },
  });
  await prisma.orderEvent.createMany({
    data: [
      {
        orderId: order.id,
        actorUserId: buyerId,
        type: "DIRECT_SANDBOX_ORDER_CONFIRMED",
        toStatus: "CONFIRMED",
        snapshotJson: JSON.stringify({ note: "Buyer confirmed sandbox order." }),
      },
      {
        orderId: order.id,
        actorUserId: buyerId,
        type: "DISPUTE_OPENED",
        fromStatus: "NONE",
        toStatus: "OPEN",
        reasonCode: "QUALITY_ISSUE",
        snapshotJson: JSON.stringify({
          schemaVersion: "dispute-open-v1",
          note: `Material contamination reported for ${key}.`,
          evidence: [`Lab report ${key}-${suffix}`, "Message dated 30 Aug"],
          previousPaymentStatus: "PAID",
          previousOrderStatus: "CONFIRMED",
          previousFulfillmentStatus: "UNFULFILLED",
        }),
      },
    ],
  });
  if (key === "refund") {
    await prisma.listingAsset.create({
      data: {
        listingId,
        ownerUserId: sellerId,
        kind: "TEST_REPORT",
        storageKey: `tests/${suffix}/${key}.pdf`,
        originalName: "quality-report.pdf",
        mimeType: "application/pdf",
        sizeBytes: 100,
        checksumSha256: "a".repeat(64),
        visibility: "PRIVATE",
      },
    });
  }
  fixture.set(key, {
    orderId: order.id,
    itemId: order.items[0].id,
    listingId,
    quantityBefore,
  });
}

describe.skipIf(!databaseReachable)("admin dispute operations", () => {
  beforeAll(async () => {
    await cleanup();
    await prisma.company.create({
      data: {
        id: companyId,
        name: `Dispute Seller ${suffix}`,
        industry: "Recycling",
        location: "Pune, Maharashtra",
        carbonRating: "UNRATED",
        latitude: 18.5204,
        longitude: 73.8567,
        capacity: 100,
      },
    });
    await prisma.user.createMany({
      data: [
        {
          id: buyerId,
          email: `${buyerId}@test.invalid`,
          passwordHash: "not-a-real-hash",
          role: "BUYER",
          companyName: `Dispute Buyer ${suffix}`,
        },
        {
          id: sellerId,
          email: `${sellerId}@test.invalid`,
          passwordHash: "not-a-real-hash",
          role: "SELLER",
          companyName: `Dispute Seller ${suffix}`,
          companyId,
        },
        {
          id: adminId,
          email: adminAuth.email,
          passwordHash: "not-a-real-hash",
          role: "BUYER",
          isAdmin: true,
          companyName: adminAuth.companyName,
        },
      ],
    });
    await prisma.wasteMaterial.create({
      data: {
        id: materialId,
        name: `Dispute HDPE ${suffix}`,
        toxicityLevel: "none",
        baseElement: "HDPE",
        category: "Plastic Scrap",
        description: "Dispute integration fixture material.",
      },
    });
    await prisma.marketplaceListing.create({
      data: listingData(
        replacementListingId,
        `Compatible replacement HDPE ${suffix}`,
        12,
      ),
    });
    for (const key of actions) await createOrder(key);
    authState.current = adminAuth;
  }, 30_000);

  afterAll(async () => {
    authState.current = null;
    await cleanup();
    await prisma.$disconnect();
  }, 30_000);

  it("returns the real reason, notes, evidence, timeline and replacement choices", async () => {
    const response = await getAdminDisputes();
    expect(response.status).toBe(200);
    const payload = await response.json();
    const target = payload.orders.find(
      (order: { id: string }) => order.id === fixture.get("refund")!.orderId,
    );
    expect(target).toMatchObject({
      reasonCode: "QUALITY_ISSUE",
      disputeNote: expect.stringContaining("contamination reported"),
      buyer: { companyName: `Dispute Buyer ${suffix}` },
      sellers: [{ name: `Dispute Seller ${suffix}` }],
    });
    expect(target.partyNotes.length).toBeGreaterThanOrEqual(2);
    expect(target.timeline.map((event: { type: string }) => event.type)).toContain(
      "DISPUTE_OPENED",
    );
    expect(target.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "REFERENCE", label: expect.stringContaining("Lab report") }),
        expect.objectContaining({ kind: "INVOICE" }),
        expect.objectContaining({ kind: "TEST_REPORT", label: "quality-report.pdf" }),
      ]),
    );
    expect(target.replacementCandidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ listingId: replacementListingId }),
      ]),
    );
    expect(JSON.stringify(target)).not.toContain("snapshotJson");
    expect(JSON.stringify(target)).not.toContain(`tests/${suffix}`);
  });

  it("releases the sandbox payment to the seller exactly once", async () => {
    const target = fixture.get("release")!;
    const resolved = await resolveDispute(
      target.orderId,
      { action: "RELEASE_TO_SELLER", note: "Evidence supports releasing the seller settlement." },
      adminId,
      prisma,
    );
    expect(resolved).toMatchObject({
      disputeStatus: "RESOLVED_RELEASED",
      paymentStatus: "SETTLED",
    });
    expect(resolved.demoPayments[0].status).toBe("SETTLED");
    await expect(
      resolveDispute(
        target.orderId,
        { action: "REJECT_DISPUTE", note: "A second decision must not be accepted." },
        adminId,
        prisma,
      ),
    ).rejects.toMatchObject({ code: "DISPUTE_ALREADY_RESOLVED" });
  });

  it("fully refunds, restores undispatched inventory and creates a credit note", async () => {
    const target = fixture.get("refund")!;
    const resolved = await resolveDispute(
      target.orderId,
      { action: "REFUND_BUYER", note: "Full refund approved after reviewing the quality report." },
      adminId,
      prisma,
    );
    expect(resolved).toMatchObject({
      status: "CANCELLED",
      paymentStatus: "REFUNDED",
      fulfillmentStatus: "CANCELLED",
      disputeStatus: "RESOLVED_REFUNDED",
    });
    expect(resolved.reservations[0].status).toBe("RELEASED");
    expect(resolved.demoPayments[0].status).toBe("REFUNDED");
    expect(resolved.creditNote?.reasonCode).toBe("REFUND_BUYER");
    const listing = await prisma.marketplaceListing.findUniqueOrThrow({
      where: { id: target.listingId },
    });
    expect(listing.quantityAvailable).toBe(target.quantityBefore + 2);
  });

  it("records a bounded partial refund without changing inventory", async () => {
    const target = fixture.get("partial")!;
    const resolved = await resolveDispute(
      target.orderId,
      { action: "PARTIAL_SETTLEMENT", refundAmount: 250, note: "Buyer accepts a ₹250 sandbox adjustment." },
      adminId,
      prisma,
    );
    expect(resolved).toMatchObject({
      paymentStatus: "PARTIALLY_REFUNDED",
      disputeStatus: "RESOLVED_PARTIAL",
    });
    expect(resolved.demoPayments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: "PARTIAL_REFUND_SUCCEEDED", amount: 250 }),
      ]),
    );
    const credit = JSON.parse(resolved.creditNote!.snapshotJson);
    expect(credit.refundAmount).toBe(250);
    const listing = await prisma.marketplaceListing.findUniqueOrThrow({
      where: { id: target.listingId },
    });
    expect(listing.quantityAvailable).toBe(target.quantityBefore);
  });

  it("moves the order onto compatible replacement stock atomically", async () => {
    const target = fixture.get("replacement")!;
    const before = await prisma.marketplaceListing.findUniqueOrThrow({
      where: { id: replacementListingId },
    });
    const input = disputeResolutionSchema.parse({
      action: "REPLACE_INVENTORY",
      orderItemId: target.itemId,
      replacementListingId,
      note: "Allocate verified compatible HDPE from the same seller.",
    }) as DisputeResolutionInput;
    const resolved = await resolveDispute(target.orderId, input, adminId, prisma);
    expect(resolved).toMatchObject({
      status: "PROCESSING",
      paymentStatus: "PAID",
      fulfillmentStatus: "PROCESSING",
      disputeStatus: "RESOLVED_REPLACED",
    });
    expect(resolved.items[0]).toMatchObject({
      listingId: replacementListingId,
      status: "REPLACEMENT_RESERVED",
    });
    const after = await prisma.marketplaceListing.findUniqueOrThrow({
      where: { id: replacementListingId },
    });
    expect(after.quantityAvailable).toBe(before.quantityAvailable - 2);
    const original = await prisma.marketplaceListing.findUniqueOrThrow({
      where: { id: target.listingId },
    });
    expect(original.quantityAvailable).toBe(target.quantityBefore + 2);
  });

  it("rejects the complaint while restoring the pre-dispute payment state", async () => {
    const target = fixture.get("rejection")!;
    const resolved = await resolveDispute(
      target.orderId,
      { action: "REJECT_DISPUTE", note: "Submitted evidence does not support the complaint." },
      adminId,
      prisma,
    );
    expect(resolved).toMatchObject({
      status: "CONFIRMED",
      paymentStatus: "PAID",
      disputeStatus: "REJECTED",
    });
    const events = resolved.events.filter((event) => event.type === "DISPUTE_RESOLVED");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      actorUserId: adminId,
      reasonCode: "REJECT_DISPUTE",
    });
  });
});
