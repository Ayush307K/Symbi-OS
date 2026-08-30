import type { MaterialListing } from "@/lib/marketplace-types";

const DEFAULT_LISTING_IMAGE = "/listing-placeholder.svg";

const CATEGORY_IMAGES: Record<string, string> = {
  "Agricultural Residue": "/listing-fallback-agricultural.svg",
  "Construction & Demolition": "/listing-fallback-minerals.svg",
  "Fly Ash & Minerals": "/listing-fallback-minerals.svg",
  Glass: "/listing-fallback-glass.svg",
  "Metal Scrap": "/listing-demo-metal.svg",
  "Non-hazardous Chemicals": "/listing-fallback-chemicals.svg",
  "Paper & Cardboard": "/listing-fallback-paper.svg",
  "Plastic Scrap": "/listing-demo-plastic.svg",
  Rubber: "/listing-demo-rubber.svg",
  "Textile Waste": "/listing-fallback-textile.svg",
};

/**
 * Evaluation listings do not represent a photographed physical lot. Give them
 * honest category artwork instead of borrowing a real seller's product photo.
 */
export function listingFallbackImage(
  listing: Pick<MaterialListing, "category" | "isEvalOnly">,
) {
  return CATEGORY_IMAGES[listing.category] ?? DEFAULT_LISTING_IMAGE;
}
