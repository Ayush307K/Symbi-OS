export const SAFE_CATEGORIES = [
  "Agricultural Residue",
  "Fly Ash & Minerals",
  "Glass",
  "Metal Scrap",
  "Non-hazardous Chemicals",
  "Paper & Cardboard",
  "Plastic Scrap",
  "Rubber",
  "Textile Waste",
] as const;

export const LISTING_UNITS = ["kg", "ton", "lot"] as const;

export type ListingUnit = (typeof LISTING_UNITS)[number];

/**
 * Map a supplier's free-text unit onto the canonical enum.
 *
 * Matching compares units by equality, so an imported "Tons" and a buyer's
 * "ton" are different materials as far as the database is concerned — every
 * RFQ against such a listing returns nothing, silently and forever. Sources
 * write "MT", "Metric Ton", "Kgs", "Truck Load"; only the enum may be stored.
 *
 * Returns null when the text is not recognised, so callers decide whether to
 * fall back or reject rather than having a wrong unit guessed for them.
 */
export function normalizeListingUnit(raw: string | null | undefined): ListingUnit | null {
  const value = (raw ?? "").trim().toLowerCase().replace(/[.\s_-]+/g, "");
  if (!value) return null;
  if (["kg", "kgs", "kilo", "kilos", "kilogram", "kilograms"].includes(value)) return "kg";
  if (
    ["ton", "tons", "tonne", "tonnes", "mt", "metricton", "metrictons", "metrictonne", "metrictonnes", "t"].includes(
      value,
    )
  ) {
    return "ton";
  }
  if (["lot", "lots", "load", "loads", "truckload", "truckloads", "container", "containers", "unit", "units", "piece", "pieces", "pcs", "nos"].includes(value)) {
    return "lot";
  }
  return null;
}
