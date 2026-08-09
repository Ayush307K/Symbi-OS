import { describe, expect, it } from "vitest";
import { score, type BuyerScoringContext, type RankableListing } from "@/server/feed/scoring";

describe("ranked-feed scoring concurrency sanity", () => {
  it("scores concurrent bounded candidate sets within the hot-path budget", async () => {
    const buyer: BuyerScoringContext = {
      buyerId: "perf-buyer",
      hasHistory: true,
      latitude: 19.076,
      longitude: 72.8777,
      targetPrice: 50_000,
      targetQuantity: 25,
    };
    const listings: RankableListing[] = Array.from({ length: 240 }, (_, index) => ({
      id: `perf-listing-${index}`,
      semanticFit: (index % 100) / 100,
      graphSignal: (index % 50) / 50,
      latitude: 18 + (index % 20) / 10,
      longitude: 72 + (index % 20) / 10,
      price: 35_000 + index * 100,
      quantityAvailable: 10 + index,
      minOrderQuantity: 5,
      updatedAt: new Date(Date.now() - index * 86_400_000),
      sellerReliability: (index % 10) / 10,
    }));

    const started = performance.now();
    const scoringNow = new Date("2026-08-09T12:00:00.000Z");
    const results = await Promise.all(
      Array.from({ length: 50 }, async () =>
        listings.map((listing) => score(buyer.buyerId, listing, buyer, scoringNow)),
      ),
    );
    const elapsedMs = performance.now() - started;

    expect(results).toHaveLength(50);
    expect(results.every((batch) => batch.length === 240)).toBe(true);
    expect(results[0]).toEqual(results[49]);
    expect(elapsedMs).toBeLessThan(500);
  });
});
