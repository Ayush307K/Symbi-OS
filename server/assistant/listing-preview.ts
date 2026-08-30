import type { AssistantListingPreview } from "@/lib/assistant-types";

interface ListingPreviewSource {
  listingMode: "MANAGED" | "EXTERNAL_LEAD" | "EVAL";
  material: { name: string };
  seller: { name: string; displayName?: string | null };
  city: string;
  state: string;
  quantityAvailable: number;
  unit: string;
  priceMode: string;
  pricePerUnit: { toString(): string } | number;
  priceBasisUnit?: string | null;
  currency: string;
  minOrderQuantity: number;
  imageUrl: string;
  sourceType: string;
  verified: boolean;
}

/** Build the safe, compact listing payload rendered by the assistant UI. */
export function assistantListingPreview(
  listing: ListingPreviewSource,
): AssistantListingPreview {
  const location = [listing.city, listing.state].filter(Boolean).join(", ");
  return {
    listingMode: listing.listingMode,
    materialName: listing.material.name,
    sellerName: listing.seller.displayName || listing.seller.name,
    location,
    quantityAvailable: listing.quantityAvailable,
    unit: listing.unit,
    priceMode: listing.priceMode,
    pricePerUnit: Number(listing.pricePerUnit),
    priceBasisUnit: listing.priceBasisUnit || listing.unit,
    currency: listing.currency,
    minOrderQuantity: listing.minOrderQuantity,
    imageUrl: listing.imageUrl.trim() || null,
    verified: listing.listingMode === "MANAGED" && listing.verified,
  };
}
