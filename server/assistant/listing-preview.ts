import type { AssistantListingPreview } from "@/lib/assistant-types";

interface ListingPreviewSource {
  material: { name: string };
  seller: { name: string };
  city: string;
  state: string;
  quantityAvailable: number;
  unit: string;
  priceMode: string;
  pricePerUnit: { toString(): string } | number;
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
    materialName: listing.material.name,
    sellerName: listing.seller.name,
    location,
    quantityAvailable: listing.quantityAvailable,
    unit: listing.unit,
    priceMode: listing.priceMode,
    pricePerUnit: Number(listing.pricePerUnit),
    currency: listing.currency,
    minOrderQuantity: listing.minOrderQuantity,
    imageUrl: listing.imageUrl.trim() || null,
    verified: listing.sourceType === "seller_submitted" && listing.verified,
  };
}
