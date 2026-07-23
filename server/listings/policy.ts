import type { Prisma } from "@prisma/client";
import { SAFE_CATEGORIES } from "@/server/safety";

export const publicListingWhere = {
  status: { in: ["ACTIVE", "active"] },
  sourceType: {
    in: ["real_api", "real_public_provider", "seller_submitted"],
  },
  category: { in: [...SAFE_CATEGORIES] },
  material: { toxicityLevel: { in: ["none", "low"] } },
} satisfies Prisma.MarketplaceListingWhereInput;
