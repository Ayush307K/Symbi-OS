import { locateCity } from "@/lib/geo/india-cities";
import {
  normalizeListingUnit,
  type ListingUnit,
} from "@/lib/listing-constants";
import type { GeocodeResult } from "@/server/geocoding";

const MOJIBAKE_REPLACEMENTS: ReadonlyArray<readonly [RegExp, string]> = [
  [/Â°C/g, "°C"],
  [/Â°F/g, "°F"],
  [/mÂ³/g, "m³"],
  [/cmÂ³/g, "cm³"],
  [/mÂ²/g, "m²"],
  [/cmÂ²/g, "cm²"],
  [/â€“/g, "–"],
  [/â€”/g, "—"],
  [/â€™/g, "’"],
  [/â€˜/g, "‘"],
  [/â€œ/g, "“"],
  [/â€/g, "”"],
  [/â€¢/g, "•"],
  [/â€¦/g, "…"],
  [/Â(?=[°²³%])/g, ""],
];

const ENCODING_ARTIFACT = /(?:Â|â€|â€™|â€œ|â€¢|�)/;

/**
 * Repair known UTF-8-as-Latin-1 artefacts without re-encoding otherwise valid
 * Unicode. The conservative replacement table avoids corrupting legitimate
 * Indian-language names or measurement symbols.
 */
export function normalizeImportedText(value: unknown) {
  let text = String(value ?? "")
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
  for (const [pattern, replacement] of MOJIBAKE_REPLACEMENTS) {
    text = text.replace(pattern, replacement);
  }
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function hasEncodingArtifacts(value: unknown) {
  return ENCODING_ARTIFACT.test(String(value ?? ""));
}

/** Extract the first recognizable unit from a supplier's compound label. */
export function extractListingUnit(
  ...values: Array<string | null | undefined>
): ListingUnit | null {
  for (const raw of values) {
    if (!raw) continue;
    const direct = normalizeListingUnit(raw);
    if (direct) return direct;
    const fragments = raw.split(/[,;|/()]+/);
    for (const fragment of fragments) {
      const normalized = normalizeListingUnit(fragment);
      if (normalized) return normalized;
    }
    const match = raw.match(
      /\b(kilograms?|kgs?|kilos?|metric\s*tonnes?|metric\s*tons?|tonnes?|tons?|mt|lots?|truck\s*loads?|containers?|pieces?|pcs|units?|nos)\b/i,
    );
    const normalized = normalizeListingUnit(match?.[0]);
    if (normalized) return normalized;
  }
  return null;
}

export function publishedPriceFromDescription(description: string) {
  const match = description.match(
    /Published price:\s*([^\n]+?)(?:\s+per\s+([^\n.]+))?\.?\s*(?:\n|$)/i,
  );
  return {
    rawPrice: match?.[1]?.trim() || null,
    rawUnit: match?.[2]?.trim() || null,
  };
}

export interface CommercialNormalizationInput {
  price: number;
  currency?: string | null;
  rawPrice?: string | null;
  rawQuantity?: string | null;
  quantityUnit?: string | null;
  priceUnit?: string | null;
  description?: string | null;
}

export interface NormalizedCommercials {
  priceMode: "FIXED" | "ON_REQUEST";
  pricePerUnit: number;
  currency: string;
  unit: ListingUnit;
  priceBasisUnit: ListingUnit | null;
  normalizedPricePerKg: number | null;
  rawPriceText: string | null;
  rawUnitText: string | null;
  issues: string[];
  valid: boolean;
}

/**
 * Normalize quantity and price independently. A tonne price is stored in its
 * original form and also as ₹/kg for comparison; lot prices are deliberately
 * not converted because the lot mass is unknown.
 */
export function normalizeCommercials(
  input: CommercialNormalizationInput,
): NormalizedCommercials {
  const descriptionPrice = publishedPriceFromDescription(
    normalizeImportedText(input.description),
  );
  const price = Number.isFinite(input.price) ? Math.max(0, input.price) : 0;
  const priceMode = price > 0 ? "FIXED" : "ON_REQUEST";
  const currency = normalizeImportedText(input.currency || "INR").toUpperCase();
  const unit =
    extractListingUnit(
      input.rawQuantity,
      input.quantityUnit,
      input.priceUnit,
    ) ?? "lot";
  const priceBasisUnit =
    priceMode === "FIXED"
      ? extractListingUnit(
          input.priceUnit,
          descriptionPrice.rawUnit,
          input.quantityUnit,
        )
      : null;
  const issues: string[] = [];
  if (
    !extractListingUnit(input.rawQuantity, input.quantityUnit, input.priceUnit)
  ) {
    issues.push("QUANTITY_UNIT_DEFAULTED_TO_LOT");
  }
  if (priceMode === "FIXED" && !priceBasisUnit) {
    issues.push("PRICE_BASIS_UNIT_UNRECOGNIZED");
  }
  if (!/^[A-Z]{3}$/.test(currency)) issues.push("CURRENCY_INVALID");
  const normalizedPricePerKg =
    priceMode !== "FIXED" || currency !== "INR"
      ? null
      : priceBasisUnit === "kg"
        ? price
        : priceBasisUnit === "ton"
          ? price / 1000
          : null;

  return {
    priceMode,
    pricePerUnit: price,
    currency,
    unit,
    priceBasisUnit,
    normalizedPricePerKg,
    rawPriceText:
      normalizeImportedText(input.rawPrice || descriptionPrice.rawPrice) ||
      null,
    rawUnitText:
      [input.quantityUnit, input.priceUnit]
        .map(normalizeImportedText)
        .filter(Boolean)
        .filter((value, index, values) => values.indexOf(value) === index)
        .join(" · ") || null,
    issues,
    valid:
      !issues.includes("PRICE_BASIS_UNIT_UNRECOGNIZED") &&
      !issues.includes("CURRENCY_INVALID"),
  };
}

function locationKey(value: string | null | undefined) {
  return normalizeImportedText(value).toLowerCase().replace(/\s+/g, " ");
}

export interface ImportedLocationQuality {
  valid: boolean;
  city: string;
  state: string;
  country: string;
  issues: string[];
}

/**
 * Known city/state mismatches are repaired deterministically. Unknown cities
 * require a successful India geocode; unresolved locations are quarantined.
 */
export function validateImportedLocation(
  input: {
    city?: string | null;
    state?: string | null;
    country?: string | null;
  },
  geocode: GeocodeResult | null,
): ImportedLocationQuality {
  const rawCity = normalizeImportedText(input.city);
  const rawState = normalizeImportedText(input.state);
  const rawCountry = normalizeImportedText(input.country || "India");
  const issues: string[] = [];
  if (locationKey(rawCountry) !== "india") {
    return {
      valid: false,
      city: rawCity,
      state: rawState,
      country: rawCountry,
      issues: ["COUNTRY_OUTSIDE_INDIA"],
    };
  }

  const known = locateCity(rawCity);
  if (known) {
    if (
      rawState &&
      locationKey(rawState) !== "india" &&
      locationKey(rawState) !== locationKey(known.state)
    ) {
      issues.push("CITY_STATE_COMBINATION_REPAIRED");
    }
    return {
      valid: true,
      city: known.city,
      state: known.state,
      country: "India",
      issues,
    };
  }

  if (geocode?.normalizedCity && geocode.normalizedState) {
    return {
      valid: true,
      city: normalizeImportedText(geocode.normalizedCity),
      state: normalizeImportedText(geocode.normalizedState),
      country: "India",
      issues,
    };
  }

  return {
    valid: false,
    city: rawCity || "Unresolved",
    state: rawState || "Unresolved",
    country: "India",
    issues: ["LOCATION_UNRESOLVED"],
  };
}

export function cleanImportedSellerName(value: string) {
  return normalizeImportedText(value)
    .replace(/ \([0-9a-f]{6}\)$/i, "")
    .trim();
}
