import { describe, expect, it } from "vitest";
import {
  cleanImportedSellerName,
  extractListingUnit,
  hasEncodingArtifacts,
  normalizeCommercials,
  normalizeImportedText,
  validateImportedLocation,
} from "@/server/listings/data-quality";
import { listingFreshness } from "@/lib/listing-freshness";

describe("catalogue data quality", () => {
  it("repairs known UTF-8 mojibake without flattening valid symbols", () => {
    const repaired = normalizeImportedText(
      "Melting point 121Â°C and density 7.13 kg/mÂ³",
    );
    expect(repaired).toBe("Melting point 121°C and density 7.13 kg/m³");
    expect(hasEncodingArtifacts(repaired)).toBe(false);
  });

  it("normalizes compound supplier units in source order", () => {
    expect(extractListingUnit("Kilograms/Kilograms")).toBe("kg");
    expect(extractListingUnit("Ton/Tons")).toBe("ton");
    expect(
      extractListingUnit("Piece/Pieces, Piece/Pieces, Kilograms/Kilograms"),
    ).toBe("lot");
  });

  it("keeps source price and computes a comparable mass price", () => {
    const result = normalizeCommercials({
      price: 42_000,
      currency: "INR",
      rawPrice: "INR 42,000",
      rawQuantity: "20 MT",
      quantityUnit: "Metric Tons",
      priceUnit: "Ton/Tons",
    });
    expect(result).toMatchObject({
      valid: true,
      unit: "ton",
      priceBasisUnit: "ton",
      normalizedPricePerKg: 42,
      rawPriceText: "INR 42,000",
    });
  });

  it("quarantines a fixed price whose basis cannot be understood", () => {
    const result = normalizeCommercials({
      price: 500,
      currency: "INR",
      quantityUnit: "bundle-ish",
      priceUnit: "mystery measure",
    });
    expect(result.valid).toBe(false);
    expect(result.issues).toContain("PRICE_BASIS_UNIT_UNRECOGNIZED");
  });

  it("repairs a known city/state mismatch and rejects unknown locations", () => {
    expect(
      validateImportedLocation(
        { city: "Mumbai", state: "Rajasthan", country: "India" },
        null,
      ),
    ).toMatchObject({
      valid: true,
      city: "Mumbai",
      state: "Maharashtra",
      issues: ["CITY_STATE_COMBINATION_REPAIRED"],
    });
    expect(
      validateImportedLocation(
        { city: "Somewhere", state: "Unknown", country: "India" },
        null,
      ).valid,
    ).toBe(false);
  });

  it("removes internal provider hashes from public seller names", () => {
    expect(cleanImportedSellerName("Acme Recycling (f7ff4e)")).toBe(
      "Acme Recycling",
    );
  });

  it("labels catalogue freshness at the configured boundaries", () => {
    const now = new Date("2026-08-31T00:00:00.000Z");
    expect(listingFreshness("2026-08-31T00:00:00.000Z", now).status).toBe(
      "FRESH",
    );
    expect(listingFreshness("2026-08-21T00:00:00.000Z", now).status).toBe(
      "AGING",
    );
    expect(listingFreshness("2026-08-10T00:00:00.000Z", now).status).toBe(
      "STALE",
    );
  });
});
