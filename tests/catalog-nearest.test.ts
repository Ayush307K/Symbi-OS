import { describe, expect, it } from "vitest";
import {
  EMPTY_FILTERS,
  filtersFromSearchParams,
  filtersToParams,
} from "@/lib/marketplace-types";
import {
  listingDistanceKm,
  sortListingsNearest,
} from "@/server/listings/nearest";

const MUMBAI = { latitude: 19.076, longitude: 72.8777 };

describe("nearest catalogue sorting", () => {
  it("orders geocoded listings by distance and keeps unknown locations last", () => {
    const rows = sortListingsNearest(
      [
        { id: "unknown", latitude: null, longitude: null },
        { id: "pune", latitude: 18.5204, longitude: 73.8567 },
        { id: "mumbai", latitude: 19.076, longitude: 72.8777 },
      ],
      MUMBAI,
    );

    expect(rows.map((row) => row.id)).toEqual(["mumbai", "pune", "unknown"]);
  });

  it("uses listing id as a deterministic tie-breaker", () => {
    const rows = sortListingsNearest(
      [
        { id: "b", ...MUMBAI },
        { id: "a", ...MUMBAI },
      ],
      MUMBAI,
    );

    expect(rows.map((row) => row.id)).toEqual(["a", "b"]);
    expect(listingDistanceKm(rows[0], MUMBAI)).toBeCloseTo(0, 5);
  });

  it("round-trips nearest through the catalogue URL contract", () => {
    const filters = {
      ...EMPTY_FILTERS,
      sort: "nearest" as const,
      lat: MUMBAI.latitude,
      lng: MUMBAI.longitude,
    };
    const params = filtersToParams(filters);

    expect(params.get("sort")).toBe("nearest");
    expect(params.get("lat")).toBe(String(MUMBAI.latitude));
    expect(params.get("lng")).toBe(String(MUMBAI.longitude));
    expect(params.has("radiusKm")).toBe(false);
    expect(filtersFromSearchParams(params.toString()).sort).toBe("nearest");
  });
});
