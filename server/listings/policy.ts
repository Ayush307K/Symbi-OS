import type { Prisma } from "@prisma/client";
import { SAFE_CATEGORIES } from "@/server/safety";

export type CatalogSort = "recent" | "price_asc" | "price_desc" | "quantity_desc";

/**
 * Ordering for the public catalogue.
 *
 * Price sorts lead with priceMode so unpriced listings land last in both
 * directions rather than interleaving with real prices — an ON_REQUEST row
 * stores 0, which would otherwise sort as the cheapest listing on the page.
 * "FIXED" precedes "ON_REQUEST" alphabetically, so ascending priceMode puts
 * priced listings first regardless of the price direction that follows.
 *
 * Every ordering ends in id so the sort is total, which cursor pagination
 * requires to avoid skipped or repeated rows.
 */
export function catalogOrderBy(
  sort: CatalogSort,
): Prisma.MarketplaceListingOrderByWithRelationInput[] {
  switch (sort) {
    case "price_asc":
      return [{ priceMode: "asc" }, { pricePerUnit: "asc" }, { id: "asc" }];
    case "price_desc":
      return [{ priceMode: "asc" }, { pricePerUnit: "desc" }, { id: "asc" }];
    case "quantity_desc":
      return [{ quantityAvailable: "desc" }, { id: "asc" }];
    default:
      return [{ updatedAt: "desc" }, { id: "desc" }];
  }
}

/**
 * Price range filters apply only to listings that actually state a price.
 * Without the priceMode clause an ON_REQUEST row, stored as 0, would satisfy
 * any maxPrice and be offered as if it were the cheapest match.
 */
export const fixedPriceOnly = { priceMode: "FIXED" } as const;

export const PUBLIC_LISTING_SOURCE_TYPES = [
  "real_api",
  "real_public_provider",
  "seller_submitted",
] as const;

export const publicListingWhere = {
  status: { in: ["ACTIVE", "active"] },
  sourceType: {
    in: [...PUBLIC_LISTING_SOURCE_TYPES],
  },
  category: { in: [...SAFE_CATEGORIES] },
  material: { toxicityLevel: { in: ["none", "low"] } },
} satisfies Prisma.MarketplaceListingWhereInput;
