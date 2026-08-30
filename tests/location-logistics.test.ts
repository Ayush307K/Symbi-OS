import { describe, expect, it } from "vitest";
import {
  geocodeLocation,
  IndiaCityGeocodingProvider,
  type GeocodingProvider,
} from "@/server/geocoding";
import { calculateFreightQuote } from "@/server/logistics/freight";

describe("location confidence and provenance", () => {
  it("resolves a known Indian city without pretending it is rooftop-precise", async () => {
    const result = await geocodeLocation(
      { city: "Pune", state: "Maharashtra", pincode: "411001" },
      new IndiaCityGeocodingProvider(),
    );

    expect(result).toMatchObject({
      provider: "india-city-centroid-v1",
      precision: "POSTCODE",
      normalizedCity: "Pune",
      normalizedState: "Maharashtra",
    });
    expect(result?.confidence).toBeGreaterThan(0.5);
    expect(result?.confidence).toBeLessThan(1);
  });

  it("accepts valid seller GPS as exact provenance and rejects coordinates outside India", async () => {
    await expect(
      geocodeLocation({
        city: "Pune",
        latitude: 18.5204,
        longitude: 73.8567,
      }),
    ).resolves.toMatchObject({
      provider: "seller-supplied-gps",
      precision: "MANUAL",
      confidence: 1,
    });

    await expect(
      geocodeLocation({ latitude: 51.5072, longitude: -0.1276 }),
    ).resolves.toBeNull();
  });

  it("falls back truthfully when the configured remote geocoder is unavailable", async () => {
    const unavailable: GeocodingProvider = {
      name: "nominatim:test.invalid",
      geocode: async () => {
        throw new Error("provider offline");
      },
    };

    await expect(
      geocodeLocation(
        { city: "Mumbai", state: "Maharashtra", pincode: "400001" },
        unavailable,
      ),
    ).resolves.toMatchObject({
      provider: "india-city-centroid-v1",
      precision: "POSTCODE",
      confidence: 0.72,
    });
  });
});

describe("explicit freight decisions", () => {
  const locations = {
    listingLatitude: 18.5204,
    listingLongitude: 73.8567,
    destinationLatitude: 19.076,
    destinationLongitude: 72.8777,
  };

  it("creates a separately itemised freight quote when the term requires one", () => {
    const result = calculateFreightQuote({
      deliveryTerm: "FREIGHT_QUOTE_REQUIRED",
      quantity: 2,
      unit: "ton",
      ...locations,
      now: new Date("2026-08-31T00:00:00.000Z"),
    });

    expect(result.source).toBe("SANDBOX_ESTIMATOR");
    expect(result.distanceKm).toBeGreaterThan(100);
    expect(result.amount).toBeGreaterThanOrEqual(1_500);
    expect(result.configVersion).toBe("freight-sandbox-v1");
    expect(result.expiresAt.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it.each([
    ["EX_WORKS", "BUYER_ARRANGED"],
    ["FOB", "BUYER_ARRANGED"],
    ["DELIVERED", "INCLUDED_IN_PRICE"],
  ] as const)("makes %s responsibility explicit without inventing a platform charge", (term, source) => {
    const result = calculateFreightQuote({
      deliveryTerm: term,
      quantity: 4,
      unit: "ton",
      ...locations,
    });

    expect(result).toMatchObject({ amount: 0, source });
  });

  it("refuses a freight-required checkout when distance cannot be calculated", () => {
    expect(() =>
      calculateFreightQuote({
        deliveryTerm: "FREIGHT_QUOTE_REQUIRED",
        quantity: 1,
        unit: "ton",
        listingLatitude: null,
        listingLongitude: null,
        destinationLatitude: 19.076,
        destinationLongitude: 72.8777,
      }),
    ).toThrow(/cannot be quoted/i);
  });
});
