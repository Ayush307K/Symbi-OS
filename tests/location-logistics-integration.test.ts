import "dotenv/config";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { JWTPayload } from "@/lib/auth";
import { createPrismaClient } from "@/lib/prisma";

const authState = vi.hoisted(() => ({ current: null as JWTPayload | null }));

vi.mock("@/server/http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/http")>();
  return {
    ...actual,
    requireUser: vi.fn(async (roles?: string[]) => {
      if (!authState.current) {
        throw new actual.ApiError(401, "Unauthenticated", "UNAUTHORIZED");
      }
      if (roles?.length && !roles.includes(authState.current.role)) {
        throw new actual.ApiError(403, "Forbidden", "FORBIDDEN");
      }
      return authState.current;
    }),
  };
});

import { POST as createFreightQuote } from "@/app/api/freight/quotes/route";
import { POST as checkout } from "@/app/api/checkout/route";
import { POST as sellerOrderAction } from "@/app/api/seller/orders/[id]/actions/route";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  "postgresql://symbi:symbi_local_dev@localhost:5432/symbi_dev";
const prisma = createPrismaClient({ datasourceUrl: TEST_DATABASE_URL });
const databaseReachable: boolean = await prisma
  .$queryRaw`SELECT 1`
  .then(() => true)
  .catch(() => false);

const suffix = Math.random().toString(36).slice(2, 10);
const companyId = `log_company_${suffix}`;
const materialId = `log_material_${suffix}`;
const listingId = `log_listing_${suffix}`;
const buyerId = `log_buyer_${suffix}`;
const sellerId = `log_seller_${suffix}`;
let addressId = "";
let orderId = "";

const buyerAuth: JWTPayload = {
  userId: buyerId,
  email: `${buyerId}@test.invalid`,
  role: "BUYER",
  companyName: `Logistics Buyer ${suffix}`,
  companyId: null,
  sessionId: `buyer-${suffix}.secret`,
  tokenVersion: 0,
  isAdmin: false,
};

const sellerAuth: JWTPayload = {
  userId: sellerId,
  email: `${sellerId}@test.invalid`,
  role: "SELLER",
  companyName: `Logistics Seller ${suffix}`,
  companyId,
  sessionId: `seller-${suffix}.secret`,
  tokenVersion: 0,
  isAdmin: false,
};

function request(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost:3000${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

async function cleanup() {
  if (orderId) await prisma.purchaseOrder.deleteMany({ where: { id: orderId } });
  await prisma.marketplaceListing.deleteMany({ where: { id: listingId } });
  await prisma.address.deleteMany({ where: { userId: buyerId } });
  await prisma.user.deleteMany({ where: { id: { in: [buyerId, sellerId] } } });
  await prisma.company.deleteMany({ where: { id: companyId } });
  await prisma.wasteMaterial.deleteMany({ where: { id: materialId } });
}

describe.skipIf(!databaseReachable)("location-aware checkout and accountable dispatch", () => {
  beforeAll(async () => {
    await cleanup();
    process.env.DEMO_PAYMENTS_ENABLED = "true";
    await prisma.company.create({
      data: {
        id: companyId,
        name: `Logistics Seller ${suffix}`,
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
          companyId,
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
        name: `Logistics HDPE ${suffix}`,
        toxicityLevel: "none",
        baseElement: "HDPE",
        category: "Plastic Scrap",
        description: "Safe logistics integration fixture.",
      },
    });
    await prisma.marketplaceListing.create({
      data: {
        id: listingId,
        slug: listingId,
        title: `Washed HDPE logistics ${suffix}`,
        listingMode: "MANAGED",
        sourceType: "seller_submitted",
        materialId,
        sellerCompanyId: companyId,
        category: "Plastic Scrap",
        subcategory: "HDPE flakes",
        area: "MIDC",
        city: "Pune",
        state: "Maharashtra",
        country: "India",
        pincode: "411001",
        latitude: 18.5204,
        longitude: 73.8567,
        geocodingProvider: "seller-supplied-gps",
        geocodingConfidence: 1,
        geocodingPrecision: "MANUAL",
        geocodedAt: new Date(),
        deliveryTerm: "FREIGHT_QUOTE_REQUIRED",
        pricePerUnit: 20_000,
        priceMode: "FIXED",
        unit: "ton",
        minOrderQuantity: 1,
        lotIncrement: 1,
        quantityAvailable: 8,
        leadTimeDays: 2,
        rating: 4.5,
        responseRate: 95,
        verified: true,
        yearsActive: 2,
        ordersCompleted: 10,
        description: "Washed non-hazardous HDPE with an explicit freight quote.",
        packaging: "Bulk bags",
        paymentTerms: "Sandbox settlement",
        status: "ACTIVE",
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000),
      },
    });
    const address = await prisma.address.create({
      data: {
        userId: buyerId,
        label: "Mumbai plant",
        contactName: "Buyer Operations",
        phone: "+919999999999",
        state: "Maharashtra",
        city: "Mumbai",
        street: "Industrial estate",
        pincode: "400001",
        latitude: 19.076,
        longitude: 72.8777,
        geocodingProvider: "seller-supplied-gps",
        geocodingConfidence: 1,
        geocodingPrecision: "MANUAL",
        geocodedAt: new Date(),
        isDefaultShipping: true,
        verificationStatus: "GPS_VERIFIED",
      },
    });
    addressId = address.id;
  }, 30_000);

  afterAll(async () => {
    authState.current = null;
    await cleanup();
    await prisma.$disconnect();
  }, 30_000);

  it("requires and persists the freight decision before sandbox payment", async () => {
    authState.current = buyerAuth;
    const quoteResponse = await createFreightQuote(
      request("/api/freight/quotes", {
        listingId,
        shippingAddressId: addressId,
        quantity: 2,
      }),
    );
    expect(quoteResponse.status).toBe(200);
    const quotePayload = await quoteResponse.json();
    expect(quotePayload).toMatchObject({
      quote: {
        listingId,
        shippingAddressId: addressId,
        source: "SANDBOX_ESTIMATOR",
        status: "QUOTED",
      },
      delivery: { term: "FREIGHT_QUOTE_REQUIRED" },
      sandbox: true,
    });
    expect(Number(quotePayload.quote.amount)).toBeGreaterThan(0);

    const bypassResponse = await checkout(
      request(
        "/api/checkout",
        { listingId, quantity: 2, shippingAddressId: addressId },
        { "Idempotency-Key": randomUUID() },
      ),
    );
    expect(bypassResponse.status).toBe(422);

    const checkoutResponse = await checkout(
      request(
        "/api/checkout",
        {
          listingId,
          quantity: 2,
          shippingAddressId: addressId,
          freightQuoteIds: [quotePayload.quote.id],
        },
        { "Idempotency-Key": randomUUID() },
      ),
    );
    expect(checkoutResponse.status).toBe(201);
    const checkoutPayload = await checkoutResponse.json();
    orderId = checkoutPayload.order.id;
    expect(checkoutPayload.order.freightQuotes).toEqual([
      expect.objectContaining({
        id: quotePayload.quote.id,
        status: "ACCEPTED",
        orderId,
      }),
    ]);
    expect(Number(checkoutPayload.order.shippingAmount)).toBe(
      Number(quotePayload.quote.amount),
    );
  });

  it("requires structured dispatch information and exposes the resulting shipment", async () => {
    authState.current = sellerAuth;
    const accepted = await sellerOrderAction(
      request(`/api/seller/orders/${orderId}/actions`, { action: "ACCEPT_ORDER" }),
      { params: Promise.resolve({ id: orderId }) },
    );
    expect(accepted.status).toBe(200);

    const incomplete = await sellerOrderAction(
      request(`/api/seller/orders/${orderId}/actions`, {
        action: "MARK_DISPATCHED",
        carrierName: "Circular Freight",
      }),
      { params: Promise.resolve({ id: orderId }) },
    );
    expect(incomplete.status).toBe(422);

    const dispatchedAt = new Date(Date.now() - 60_000);
    const estimatedDeliveryAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1_000);
    const dispatched = await sellerOrderAction(
      request(`/api/seller/orders/${orderId}/actions`, {
        action: "MARK_DISPATCHED",
        carrierName: "Circular Freight",
        serviceLevel: "Dedicated truck",
        vehicleNumber: "MH12AB1234",
        proofOfDispatchReference: "LR-2026-0001",
        dispatchedAt: dispatchedAt.toISOString(),
        estimatedDeliveryAt: estimatedDeliveryAt.toISOString(),
        note: "Sealed load departed the Pune warehouse.",
      }),
      { params: Promise.resolve({ id: orderId }) },
    );
    expect(dispatched.status).toBe(200);
    const payload = await dispatched.json();
    expect(payload.order).toMatchObject({
      fulfillmentStatus: "DISPATCHED",
      shipment: {
        carrierName: "Circular Freight",
        vehicleNumber: "MH12AB1234",
        proofOfDispatchReference: "LR-2026-0001",
        status: "DISPATCHED",
      },
    });

    await expect(prisma.shipment.findUnique({ where: { orderId } })).resolves.toMatchObject({
      sellerCompanyId: companyId,
      carrierName: "Circular Freight",
      vehicleNumber: "MH12AB1234",
    });
  });
});
