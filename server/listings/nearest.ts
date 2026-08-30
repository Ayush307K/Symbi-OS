import { haversineDistanceKm } from "@/server/feed/scoring";

export interface GeocodedListing {
  id: string;
  latitude: number | null;
  longitude: number | null;
}

export interface CoordinateOrigin {
  latitude: number;
  longitude: number;
}

export function listingDistanceKm(
  listing: Pick<GeocodedListing, "latitude" | "longitude">,
  origin: CoordinateOrigin,
) {
  if (listing.latitude === null || listing.longitude === null) return null;
  return haversineDistanceKm(
    origin.latitude,
    origin.longitude,
    listing.latitude,
    listing.longitude,
  );
}

/**
 * Stable nearest-first ordering for catalogue pagination.
 *
 * Ungeocoded listings stay discoverable but follow every measurable listing.
 * The id tie-breaker makes equal-distance rows deterministic across pages.
 */
export function sortListingsNearest<T extends GeocodedListing>(
  listings: readonly T[],
  origin: CoordinateOrigin,
) {
  return [...listings].sort((left, right) => {
    const leftDistance = listingDistanceKm(left, origin);
    const rightDistance = listingDistanceKm(right, origin);
    if (leftDistance === null && rightDistance === null) {
      return left.id.localeCompare(right.id);
    }
    if (leftDistance === null) return 1;
    if (rightDistance === null) return -1;
    return leftDistance - rightDistance || left.id.localeCompare(right.id);
  });
}
