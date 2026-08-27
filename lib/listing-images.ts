import type { MaterialListing } from "@/lib/marketplace-types";

const DEFAULT_LISTING_IMAGE = "/listing-placeholder.svg";

const EVALUATION_IMAGES: Record<string, string> = {
  "Metal Scrap": "/listing-demo-metal.svg",
  "Plastic Scrap": "/listing-demo-plastic.svg",
  Rubber: "/listing-demo-rubber.svg",
};

/**
 * Evaluation listings do not represent a photographed physical lot. Give them
 * honest category artwork instead of borrowing a real seller's product photo.
 */
export function listingFallbackImage(
  listing: Pick<MaterialListing, "category" | "isEvalOnly">,
) {
  if (!listing.isEvalOnly) return DEFAULT_LISTING_IMAGE;
  return EVALUATION_IMAGES[listing.category] ?? DEFAULT_LISTING_IMAGE;
}

