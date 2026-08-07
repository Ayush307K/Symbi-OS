import { describe, expect, it } from "vitest";
import { LISTING_UNITS, normalizeListingUnit } from "@/lib/listing-constants";
import { locateCity } from "@/lib/geo/india-cities";
import { haversineKm, inferDemandCategory, scoreCandidate } from "@/server/matching";

/**
 * These guard a failure mode that produces no error at all: matching compares
 * units and coordinates by equality, so a listing stored as "Tons" or with a
 * null latitude is simply never returned. The engine looks like it works and
 * every RFQ comes back empty.
 */
describe("listing unit normalisation", () => {
  it("maps the wordings suppliers actually send onto the enum", () => {
    for (const raw of ["Tons", "TONNE", "  mt ", "Metric Ton", "metric-tonnes", "t"]) {
      expect(normalizeListingUnit(raw)).toBe("ton");
    }
    for (const raw of ["Kgs", "kilogram", "KG"]) {
      expect(normalizeListingUnit(raw)).toBe("kg");
    }
    for (const raw of ["Truck Load", "containers", "PCS"]) {
      expect(normalizeListingUnit(raw)).toBe("lot");
    }
  });

  it("returns null rather than guessing at unrecognised text", () => {
    expect(normalizeListingUnit("barrels")).toBeNull();
    expect(normalizeListingUnit("")).toBeNull();
    expect(normalizeListingUnit(null)).toBeNull();
  });

  it("only ever produces a member of LISTING_UNITS", () => {
    const outputs = ["Tons", "kgs", "lots", "MT"].map(normalizeListingUnit);
    for (const output of outputs) {
      expect(LISTING_UNITS).toContain(output);
    }
  });
});

describe("city geocoding", () => {
  it("resolves the cities present in listing data", () => {
    expect(locateCity("Mundra")).toMatchObject({ state: "Gujarat" });
    expect(locateCity("bengaluru")?.latitude).toBeCloseTo(12.9716, 3);
  });

  it("accepts the older names still used by suppliers", () => {
    expect(locateCity("Bangalore")?.city).toBe("Bengaluru");
    expect(locateCity("Bombay")?.city).toBe("Mumbai");
  });

  it("returns null for anything unknown", () => {
    expect(locateCity("Atlantis")).toBeNull();
    expect(locateCity(null)).toBeNull();
  });
});

describe("haversine distance", () => {
  it("measures a known intercity distance", () => {
    // Bengaluru to Chennai is ~290 km great-circle.
    const km = haversineKm(12.9716, 77.5946, 13.0827, 80.2707);
    expect(km).toBeGreaterThan(280);
    expect(km).toBeLessThan(300);
  });

  it("is zero for a point against itself", () => {
    expect(haversineKm(19.076, 72.8777, 19.076, 72.8777)).toBeCloseTo(0, 5);
  });
});

const listing = {
  id: "listing-1",
  title: "Hot washed HDPE regrind, natural",
  category: "Plastic Scrap",
  subcategory: "HDPE regrind",
  material: { name: "HDPE", baseElement: "Polyethylene" },
  quantityAvailable: 200,
  minOrderQuantity: 10,
  lotIncrement: 5,
  unit: "ton",
  priceMode: "FIXED",
  pricePerUnit: 500,
  city: "Mundra",
  state: "Gujarat",
  pincode: null,
  latitude: 22.8394,
  longitude: 69.7219,
  verified: true,
  assets: [],
  seller: { name: "Acme Polymers" },
} as unknown as Parameters<typeof scoreCandidate>[1];

const demand = {
  query: "HDPE regrind",
  category: "Plastic Scrap" as const,
  quantity: 50,
  unit: "ton" as const,
};

describe("scoreCandidate hard filters", () => {
  it("excludes a quantity below the seller's MOQ", () => {
    expect(scoreCandidate({ ...demand, quantity: 5 }, listing)).toBeNull();
  });

  it("excludes a quantity above what is available", () => {
    expect(scoreCandidate({ ...demand, quantity: 5_000 }, listing)).toBeNull();
  });

  it("excludes a quantity that does not land on a lot boundary", () => {
    // MOQ 10 with a 5-ton increment permits 10, 15, 20 — not 12.
    expect(scoreCandidate({ ...demand, quantity: 12 }, listing)).toBeNull();
  });

  it("excludes a priced listing above the buyer's ceiling", () => {
    expect(scoreCandidate({ ...demand, maxPrice: 100 }, listing)).toBeNull();
  });

  it("keeps an unpriced listing the ceiling cannot judge", () => {
    const onRequest = { ...listing, priceMode: "ON_REQUEST" };
    expect(scoreCandidate({ ...demand, maxPrice: 100 }, onRequest)).not.toBeNull();
  });

  it("excludes anything beyond the requested radius", () => {
    const far = {
      ...demand,
      latitude: 12.9716,
      longitude: 77.5946,
      maxDistanceKm: 100,
    };
    expect(scoreCandidate(far, listing)).toBeNull();
  });

  it("excludes a listing with no coordinates once a radius is asked for", () => {
    const unlocatable = { ...listing, latitude: null, longitude: null };
    const withRadius = {
      ...demand,
      latitude: 22.8394,
      longitude: 69.7219,
      maxDistanceKm: 50,
    };
    expect(scoreCandidate(withRadius, unlocatable)).toBeNull();
  });
});

describe("scoreCandidate scoring", () => {
  it("scores within bounds and explains every match", () => {
    const result = scoreCandidate(demand, listing);
    expect(result).not.toBeNull();
    expect(result!.score).toBeGreaterThan(0);
    expect(result!.score).toBeLessThanOrEqual(100);
    expect(result!.explanations.length).toBeGreaterThan(2);
  });

  it("ranks a nearer listing above an identical distant one", () => {
    const near = scoreCandidate(
      { ...demand, latitude: 22.84, longitude: 69.72, maxDistanceKm: 1500 },
      listing,
    );
    const far = scoreCandidate(
      { ...demand, latitude: 12.9716, longitude: 77.5946, maxDistanceKm: 1500 },
      listing,
    );
    expect(near!.score).toBeGreaterThan(far!.score);
    expect(near!.distanceKm).toBeLessThan(far!.distanceKm!);
  });

  it("reports the distance it used", () => {
    const result = scoreCandidate(
      { ...demand, latitude: 12.9716, longitude: 77.5946, maxDistanceKm: 2000 },
      listing,
    );
    expect(result!.distanceKm).toBeGreaterThan(1000);
  });
});

describe("category inference", () => {
  it("infers a safe category from ordinary buyer wording", () => {
    expect(inferDemandCategory("HDPE regrind")).toBe("Plastic Scrap");
    expect(inferDemandCategory("mild steel scrap")).toBe("Metal Scrap");
  });
});
