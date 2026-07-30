import { describe, expect, it } from "vitest";
import { calculateFees } from "@/server/fees";
import {
  haversineKm,
  inferDemandCategory,
  scoreCandidate,
} from "@/server/matching";
import { orderInvoiceSnapshot } from "@/server/orders";

const baseInput = {
  query: "washed HDPE blue flakes",
  category: "Plastic Scrap" as const,
  subcategory: "HDPE flakes",
  quantity: 10,
  unit: "ton" as const,
  maxPrice: 30_000,
};

const candidate = {
  id: "listing-1",
  title: "Washed blue HDPE flakes",
  category: "Plastic Scrap",
  subcategory: "HDPE flakes",
  quantityAvailable: 50,
  minOrderQuantity: 5,
  lotIncrement: 5,
  priceMode: "FIXED",
  pricePerUnit: 25_000,
  unit: "ton",
  latitude: 12.9716,
  longitude: 77.5946,
  verified: true,
  material: { name: "Plastic Scrap: HDPE flakes", baseElement: "HDPE" },
  seller: { id: "seller-1", name: "Circular Plastics" },
  assets: [{ kind: "TEST_REPORT" }],
};

describe("P0 transaction rules", () => {
  it("calculates versioned fees only from authoritative subtotal", () => {
    expect(calculateFees(100_000)).toEqual({
      subtotal: 100_000,
      buyerFeeAmount: 1_000,
      sellerFeeAmount: 2_000,
      shippingAmount: 0,
      taxAmount: 0,
      totalAmount: 101_000,
      feeVersion: "fees-v1.0",
      taxNote: expect.stringContaining("GST/TDS"),
    });
  });

  it("produces an immutable invoice-shaped snapshot", () => {
    const snapshot = orderInvoiceSnapshot({
      id: "order-1",
      orderNumber: "SYM-1",
      buyerUserId: "buyer-1",
      subtotal: 100,
      buyerFeeAmount: 1,
      sellerFeeAmount: 2,
      taxAmount: 0,
      shippingAmount: 0,
      totalAmount: 101,
      currency: "INR",
      feeVersion: "fees-v1.0",
      taxNote: "Sandbox",
      purchaseOrderNumber: "PO-1",
      items: [
        {
          title: "HDPE",
          quantity: 1,
          unit: "ton",
          pricePerUnit: 100,
          lineTotal: 100,
          sellerCompanyId: "seller-1",
        },
      ],
    });
    expect(snapshot).toMatchObject({
      schemaVersion: "invoice-snapshot-v1",
      orderNumber: "SYM-1",
      totalAmount: 101,
      feeVersion: "fees-v1.0",
    });
  });
});

describe("P0 deterministic matching", () => {
  it("infers controlled categories without creating taxonomy from raw text", () => {
    expect(inferDemandCategory("Need copper cable scrap")).toBe("Metal Scrap");
    expect(inferDemandCategory("Need an unknown thing")).toBeUndefined();
  });

  it("scores an exact compatible match with explanations", () => {
    const result = scoreCandidate(baseInput, candidate as never);
    expect(result?.score).toBeGreaterThanOrEqual(75);
    expect(result?.explanations).toContain("Exact safe-category match");
  });

  it("rejects MOQ/lot and price-incompatible candidates", () => {
    expect(
      scoreCandidate(
        { ...baseInput, quantity: 11 },
        candidate as never,
      ),
    ).toBeNull();
    expect(
      scoreCandidate(
        { ...baseInput, maxPrice: 20_000 },
        candidate as never,
      ),
    ).toBeNull();
  });

  it("applies a real geographic radius", () => {
    expect(haversineKm(12.9716, 77.5946, 13.0827, 80.2707)).toBeGreaterThan(
      280,
    );
    expect(
      scoreCandidate(
        {
          ...baseInput,
          latitude: 12.9716,
          longitude: 77.5946,
          maxDistanceKm: 10,
        },
        candidate as never,
      )?.distanceKm,
    ).toBe(0);
  });
});
