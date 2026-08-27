/**
 * Shapes returned by GET /api/materials. These mirror the API response exactly
 * — they are not a view model. If the API changes, change it there first.
 */
export interface MaterialListing {
  id: string;
  materialId: string;
  isEvalOnly: boolean;
  evalScenarioTags: string[];
  title: string;
  name: string;
  toxicity: string;
  baseElement: string;
  category: string;
  subcategory: string;
  producer: string;
  producerId: string;
  sellerUserId: string | null;
  location: string;
  area: string;
  city: string;
  state: string;
  country: string;
  imageUrl: string;
  price: number | null;
  quantity: number | null;
  unit: string;
  minOrderQuantity: number;
  leadTimeDays: number;
  rating: number;
  responseRate: number;
  verified: boolean;
  tradeAssurance: boolean;
  yearsActive: number;
  ordersCompleted: number;
  description: string;
  packaging: string;
  paymentTerms: string;
  sourceType: string;
  sourceName: string | null;
  sourceUrl: string | null;
  externalId: string | null;
  rawQuantityText: string | null;
  rawLocationText: string | null;
}

export interface CatalogPageInfo {
  hasMore: boolean;
  nextCursor: string | null;
  limit: number;
}

/**
 * The subset of /api/materials query params the catalog UI drives. Every key
 * here is already accepted by the route's zod schema — this adds no new
 * contract, it only surfaces what the API already supports.
 */
export interface CatalogFilters {
  q: string;
  category: string;
  location: string;
  minPrice: string;
  maxPrice: string;
  minQuantity: string;
  maxQuantity: string;
  verified: boolean;
  sort: CatalogSort;
  /** Radius search needs coordinates; only sent when all three are present. */
  lat: number | null;
  lng: number | null;
  radiusKm: string;
}

export type CatalogSort = "recent" | "price_asc" | "price_desc" | "quantity_desc";

export const SORT_OPTIONS: Array<{ value: CatalogSort; label: string }> = [
  { value: "recent", label: "Most recent" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "quantity_desc", label: "Largest quantity" },
];

export const EMPTY_FILTERS: CatalogFilters = {
  q: "",
  category: "",
  location: "",
  minPrice: "",
  maxPrice: "",
  minQuantity: "",
  maxQuantity: "",
  verified: false,
  sort: "recent",
  lat: null,
  lng: null,
  radiusKm: "",
};

/** Serialises filters into the exact param names the API expects. */
export function filtersToParams(
  filters: CatalogFilters,
  cursor?: string,
): URLSearchParams {
  const params = new URLSearchParams({ limit: "24" });
  if (filters.q) params.set("q", filters.q);
  if (filters.category) params.set("category", filters.category);
  if (filters.location) params.set("location", filters.location);
  if (filters.minPrice) params.set("minPrice", filters.minPrice);
  if (filters.maxPrice) params.set("maxPrice", filters.maxPrice);
  if (filters.minQuantity) params.set("minQuantity", filters.minQuantity);
  if (filters.maxQuantity) params.set("maxQuantity", filters.maxQuantity);
  if (filters.verified) params.set("verified", "true");
  if (filters.sort && filters.sort !== "recent") params.set("sort", filters.sort);
  if (filters.lat !== null && filters.lng !== null && filters.radiusKm) {
    params.set("lat", String(filters.lat));
    params.set("lng", String(filters.lng));
    params.set("radiusKm", filters.radiusKm);
  }
  if (cursor) params.set("cursor", cursor);
  return params;
}

/** The shareable subset, for window.history — omits limit and cursor. */
export function filtersToQueryString(filters: CatalogFilters): string {
  const params = filtersToParams(filters);
  params.delete("limit");
  return params.toString();
}

/**
 * Whether a URL change should make the catalogue refetch.
 *
 * `applied` is null until the first load completes. That distinction is the
 * whole point: an unfiltered catalogue has the signature "", so comparing
 * against a "" starting value made the home page look like it had already
 * loaded the filters it was being asked to load, and it never issued the
 * opening request. Only a URL carrying a filter escaped it.
 */
export function catalogNeedsReload(signature: string, applied: string | null) {
  return applied === null || signature !== applied;
}

export function filtersFromSearchParams(search: string): CatalogFilters {
  const params = new URLSearchParams(search);
  const sort = params.get("sort");
  return {
    ...EMPTY_FILTERS,
    q: params.get("q")?.trim() ?? "",
    category: params.get("category")?.trim() ?? "",
    location: params.get("location")?.trim() ?? "",
    minPrice: params.get("minPrice") ?? "",
    maxPrice: params.get("maxPrice") ?? "",
    minQuantity: params.get("minQuantity") ?? "",
    maxQuantity: params.get("maxQuantity") ?? "",
    verified: params.get("verified") === "true",
    sort: SORT_OPTIONS.some((option) => option.value === sort)
      ? (sort as CatalogSort)
      : "recent",
    lat: params.get("lat") ? Number(params.get("lat")) : null,
    lng: params.get("lng") ? Number(params.get("lng")) : null,
    radiusKm: params.get("radiusKm") ?? "",
  };
}

export function countActiveFilters(filters: CatalogFilters): number {
  let count = 0;
  if (filters.q) count += 1;
  if (filters.category) count += 1;
  if (filters.location) count += 1;
  if (filters.minPrice || filters.maxPrice) count += 1;
  if (filters.minQuantity || filters.maxQuantity) count += 1;
  if (filters.verified) count += 1;
  if (filters.radiusKm && filters.lat !== null) count += 1;
  if (filters.sort !== "recent") count += 1;
  return count;
}
