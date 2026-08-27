import { describe, expect, it } from "vitest";
import type { BuyerScoringContext, RankableListing } from "@/server/feed/scoring";
import {
  freshnessScore,
  score,
  sellerReliabilityScore,
} from "@/server/feed/scoring";
import {
  applyCategoryAffinity,
  buildPreferredCategories,
  inferIndustryCategories,
} from "@/server/feed/category-affinity";

const now = new Date("2026-08-09T12:00:00.000Z");

const buyer: BuyerScoringContext = {
  buyerId: "buyer-with-history",
  hasHistory: true,
  latitude: 19.076,
  longitude: 72.8777,
  targetPrice: 40_000,
  targetQuantity: 20,
};

const listing: RankableListing = {
  id: "listing-near",
  semanticFit: 0.78,
  graphSignal: 0.65,
  latitude: 19.12,
  longitude: 72.9,
  price: 38_000,
  quantityAvailable: 25,
  minOrderQuantity: 5,
  updatedAt: new Date("2026-08-08T12:00:00.000Z"),
  sellerReliability: 0.86,
};

describe("ranked marketplace scorer", () => {
  it("returns a bounded relevance score", () => {
    const relevance = score(buyer.buyerId, listing, buyer, now);
    expect(relevance).toBeGreaterThan(0);
    expect(relevance).toBeLessThanOrEqual(1);
  });

  it("lets scrap business signals dominate an otherwise excellent semantic match", () => {
    const semanticallyPerfectButImpractical: RankableListing = {
      ...listing,
      id: "listing-impractical",
      semanticFit: 1,
      graphSignal: 1,
      latitude: 12.9716,
      longitude: 77.5946,
      price: 78_000,
      quantityAvailable: 3,
      updatedAt: new Date("2025-08-09T12:00:00.000Z"),
      sellerReliability: 0.05,
    };
    const practical = { ...listing, semanticFit: 0.58, graphSignal: 0.25 };
    expect(score(buyer.buyerId, practical, buyer, now)).toBeGreaterThan(
      score(buyer.buyerId, semanticallyPerfectButImpractical, buyer, now),
    );
  });

  it("handles cold start using semantic, distance, and freshness only", () => {
    const coldBuyer = { ...buyer, buyerId: "cold", hasHistory: false };
    const baseline = score(coldBuyer.buyerId, listing, coldBuyer, now);
    const changedIgnoredSignals = score(
      coldBuyer.buyerId,
      {
        ...listing,
        graphSignal: 0,
        price: 1_000_000,
        quantityAvailable: 1,
        sellerReliability: 0,
      },
      coldBuyer,
      now,
    );
    expect(changedIgnoredSignals).toBeCloseTo(baseline, 12);
  });

  it("ranks a nearby, fresh listing above a distant, stale one for cold start", () => {
    const coldBuyer = { ...buyer, buyerId: "cold", hasHistory: false };
    const farAndStale = {
      ...listing,
      id: "far-stale",
      latitude: 12.9716,
      longitude: 77.5946,
      updatedAt: new Date("2025-08-09T12:00:00.000Z"),
    };
    expect(score(coldBuyer.buyerId, listing, coldBuyer, now)).toBeGreaterThan(
      score(coldBuyer.buyerId, farAndStale, coldBuyer, now),
    );
  });

  it("rejects a context belonging to another buyer", () => {
    expect(() => score("another-buyer", listing, buyer, now)).toThrow(
      /does not belong/,
    );
  });
});

describe("business signal normalization", () => {
  it("decays freshness monotonically", () => {
    const recent = freshnessScore(new Date("2026-08-08T12:00:00.000Z"), now);
    const old = freshnessScore(new Date("2026-02-01T12:00:00.000Z"), now);
    expect(recent).toBeGreaterThan(old);
    expect(old).toBeGreaterThan(0);
  });

  it("rewards reliable sellers without exceeding one", () => {
    const reliable = sellerReliabilityScore({
      reviewAverage: 4.8,
      responseRate: 95,
      fulfilledOrders: 100,
      verifiedSeller: true,
      hasDocuments: true,
    });
    const unknown = sellerReliabilityScore({
      reviewAverage: null,
      responseRate: null,
      fulfilledOrders: 0,
      verifiedSeller: false,
      hasDocuments: false,
    });
    expect(reliable).toBeGreaterThan(unknown);
    expect(reliable).toBeLessThanOrEqual(1);
  });
});

describe("company-industry cold start", () => {
  it("maps specific company industries onto marketplace categories", () => {
    expect(inferIndustryCategories("Plastic packaging factory")).toContain(
      "Plastic Scrap",
    );
    expect(inferIndustryCategories("Steel fabrication and foundry")).toContain(
      "Metal Scrap",
    );
    expect(inferIndustryCategories("General manufacturing")).toEqual([]);
  });

  it("puts industry first when the buyer has no behavioral history", () => {
    expect(
      buildPreferredCategories({
        industry: "Plastic polymer manufacturing",
        behavioralCategories: [],
        hasHistory: false,
      }),
    ).toEqual(["Plastic Scrap"]);
  });

  it("gives a matching cold-start category a strong semantic floor", () => {
    const preferred = ["Plastic Scrap"] as const;
    expect(
      applyCategoryAffinity(0.1, "Plastic Scrap", preferred, false),
    ).toBeGreaterThan(
      applyCategoryAffinity(0.1, "Metal Scrap", preferred, false),
    );
  });
});
