import { locateCity } from "@/lib/geo/india-cities";
import { serviceabilityForPincode } from "@/lib/marketplace";

export type GeocodingPrecision = "ROOFTOP" | "POSTCODE" | "CITY" | "MANUAL";

export interface GeocodeInput {
  addressLine?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface GeocodeResult {
  latitude: number;
  longitude: number;
  provider: string;
  confidence: number;
  precision: GeocodingPrecision;
  normalizedCity: string | null;
  normalizedState: string | null;
  geocodedAt: Date;
}

export interface GeocodingProvider {
  readonly name: string;
  geocode(input: GeocodeInput): Promise<GeocodeResult | null>;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function isCoordinatePair(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
) {
  return (
    typeof latitude === "number" &&
    Number.isFinite(latitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    typeof longitude === "number" &&
    Number.isFinite(longitude) &&
    longitude >= -180 &&
    longitude <= 180
  );
}

/** India bounding box used only to reject obvious geocoder/provider mistakes. */
export function isCoordinateInIndia(latitude: number, longitude: number) {
  return latitude >= 6 && latitude <= 38 && longitude >= 68 && longitude <= 98;
}

/**
 * Offline fallback for development, imports, and degraded production mode.
 * It deliberately reports CITY precision and moderate confidence: a city
 * centroid is useful for discovery/freight ranking, never for truck routing.
 */
export class IndiaCityGeocodingProvider implements GeocodingProvider {
  readonly name = "india-city-centroid-v1";

  async geocode(input: GeocodeInput): Promise<GeocodeResult | null> {
    const pincodeRegion = input.pincode
      ? serviceabilityForPincode(input.pincode)
      : null;
    const point =
      locateCity(input.city) ||
      (pincodeRegion?.serviceable ? locateCity(pincodeRegion.city) : null);
    if (!point) return null;
    return {
      latitude: point.latitude,
      longitude: point.longitude,
      provider: this.name,
      confidence: input.pincode ? 0.72 : 0.62,
      precision: input.pincode ? "POSTCODE" : "CITY",
      normalizedCity: point.city,
      normalizedState: point.state,
      geocodedAt: new Date(),
    };
  }
}

type NominatimRow = {
  lat?: string;
  lon?: string;
  importance?: number;
  addresstype?: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    state?: string;
    postcode?: string;
    country_code?: string;
  };
};

/**
 * Adapter for a self-hosted or commercial Nominatim-compatible endpoint.
 * The public OSM endpoint is intentionally not a default: regular/bulk jobs
 * must use a provider whose terms and capacity permit them.
 */
export class NominatimGeocodingProvider implements GeocodingProvider {
  readonly name: string;

  constructor(
    private readonly baseUrl: string,
    private readonly userAgent: string,
  ) {
    this.name = `nominatim:${new URL(baseUrl).host}`;
  }

  async geocode(input: GeocodeInput): Promise<GeocodeResult | null> {
    const url = new URL("search", this.baseUrl.endsWith("/") ? this.baseUrl : `${this.baseUrl}/`);
    if (input.addressLine) url.searchParams.set("street", input.addressLine);
    if (input.city) url.searchParams.set("city", input.city);
    if (input.state) url.searchParams.set("state", input.state);
    if (input.pincode) url.searchParams.set("postalcode", input.pincode);
    url.searchParams.set("country", input.country || "India");
    url.searchParams.set("countrycodes", "in");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("limit", "1");

    const response = await fetch(url, {
      headers: { "User-Agent": this.userAgent, Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`Geocoder returned ${response.status}.`);
    const [row] = (await response.json()) as NominatimRow[];
    const latitude = Number(row?.lat);
    const longitude = Number(row?.lon);
    if (
      !row ||
      !isCoordinatePair(latitude, longitude) ||
      !isCoordinateInIndia(latitude, longitude) ||
      row.address?.country_code?.toLowerCase() !== "in"
    ) {
      return null;
    }
    const precision: GeocodingPrecision = input.addressLine
      ? "ROOFTOP"
      : input.pincode
        ? "POSTCODE"
        : "CITY";
    return {
      latitude,
      longitude,
      provider: this.name,
      confidence: clamp(0.55 + Number(row.importance || 0) * 0.4, 0.55, 0.98),
      precision,
      normalizedCity:
        row.address?.city || row.address?.town || row.address?.village || input.city || null,
      normalizedState: row.address?.state || input.state || null,
      geocodedAt: new Date(),
    };
  }
}

export function configuredGeocodingProvider(): GeocodingProvider {
  const baseUrl = process.env.GEOCODING_API_URL?.trim();
  if (baseUrl) {
    return new NominatimGeocodingProvider(
      baseUrl,
      process.env.GEOCODING_USER_AGENT || "SymbiOS/1.0 (operations@symbios.invalid)",
    );
  }
  return new IndiaCityGeocodingProvider();
}

export async function geocodeLocation(
  input: GeocodeInput,
  provider: GeocodingProvider = configuredGeocodingProvider(),
): Promise<GeocodeResult | null> {
  if (isCoordinatePair(input.latitude, input.longitude)) {
    if (!isCoordinateInIndia(input.latitude!, input.longitude!)) return null;
    return {
      latitude: input.latitude!,
      longitude: input.longitude!,
      provider: "seller-supplied-gps",
      confidence: 1,
      precision: "MANUAL",
      normalizedCity: input.city || null,
      normalizedState: input.state || null,
      geocodedAt: new Date(),
    };
  }

  try {
    return await provider.geocode(input);
  } catch (error) {
    console.warn("[Geocoding] provider unavailable; using city fallback", {
      provider: provider.name,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    if (provider instanceof IndiaCityGeocodingProvider) return null;
    return new IndiaCityGeocodingProvider().geocode(input);
  }
}

export function geocodeData(result: GeocodeResult | null) {
  return result
    ? {
        latitude: result.latitude,
        longitude: result.longitude,
        geocodingProvider: result.provider,
        geocodingConfidence: result.confidence,
        geocodingPrecision: result.precision,
        geocodedAt: result.geocodedAt,
      }
    : {
        latitude: null,
        longitude: null,
        geocodingProvider: null,
        geocodingConfidence: null,
        geocodingPrecision: null,
        geocodedAt: null,
      };
}
