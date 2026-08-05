"use client";

import { use } from "react";
import { MarketplaceNav } from "@/components/marketplace/MarketplaceNav";
import { ListingDetailPanel } from "@/components/marketplace/ListingDetailPanel";

/**
 * Full-page product detail. Sits under the same marketplace chrome as the
 * catalogue so moving between them changes only the content, never the frame.
 */
export default function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  return (
    <div className="min-h-screen bg-surface-page text-ink-900">
      <MarketplaceNav />
      <main>
        <ListingDetailPanel listingId={id} />
      </main>
    </div>
  );
}
