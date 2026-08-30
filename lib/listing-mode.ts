export const LISTING_MODES = ["MANAGED", "EXTERNAL_LEAD", "EVAL"] as const;

export type ListingMode = (typeof LISTING_MODES)[number];

export interface ListingCapabilitiesInput {
  listingMode: ListingMode;
  verified: boolean;
  sellerUserId: string | null;
  priceMode?: string;
  price?: number | null;
}

/**
 * Capabilities are intentionally derived from explicit marketplace state, not
 * from incidental fields such as source URL or a Company attribution row.
 * Server policies remain authoritative; this keeps client CTAs honest.
 */
export function listingCapabilities(input: ListingCapabilitiesInput) {
  const managed =
    input.listingMode === "MANAGED" && input.verified && Boolean(input.sellerUserId);
  const priced =
    input.priceMode === "FIXED" && typeof input.price === "number" && input.price > 0;
  return {
    canBid: managed,
    canMessage: managed,
    canBuy: managed && priced,
    canAddToCart: managed && priced,
    canViewSource: input.listingMode === "EXTERNAL_LEAD",
  };
}

export function listingTrustLabel(mode: ListingMode) {
  if (mode === "MANAGED") return "Verified SymbiOS seller";
  if (mode === "EVAL") return "Synthetic demo listing";
  return "External source";
}
