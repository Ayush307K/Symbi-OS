"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useCatalog, useWishlist } from "@/hooks/useCatalog";
import { useToast } from "@/components/ui/Toast";
import { SearchHeader } from "./SearchHeader";
import { FilterBar } from "./FilterBar";
import { CatalogGrid } from "./CatalogGrid";
import {
  type CatalogFilters,
  type MaterialListing,
  EMPTY_FILTERS,
  countActiveFilters,
} from "@/lib/marketplace-types";

/** Kept in step with SAFE_CATEGORIES on the server; used only to seed the picker. */
const SELLER_SAFE_CATEGORIES = [
  "Construction & Demolition",
  "Fly Ash & Minerals",
  "Glass",
  "Metal Scrap",
  "Non-hazardous Chemicals",
  "Paper & Cardboard",
  "Plastic Scrap",
  "Rubber",
  "Textile Waste",
];

export interface CatalogSectionProps {
  isAuthenticated: boolean;
  /** Lets the parent mirror the live count, e.g. into the hero. */
  onCountChange?: (count: number) => void;
}

export function CatalogSection({ isAuthenticated, onCountChange }: CatalogSectionProps) {
  const router = useRouter();
  const { toast } = useToast();
  const catalog = useCatalog();
  const wishlist = useWishlist();
  const [inquiryPendingId, setInquiryPendingId] = useState<string | null>(null);

  // Lets the hero quote a live figure rather than a hardcoded claim.
  useEffect(() => {
    onCountChange?.(catalog.listings.length);
  }, [catalog.listings.length, onCountChange]);

  const categories = useMemo(
    () =>
      Array.from(
        new Set([
          ...SELLER_SAFE_CATEGORIES,
          ...catalog.listings.map((item) => item.category),
        ]),
      )
        .filter(Boolean)
        .sort(),
    [catalog.listings],
  );

  const handleToggleSave = useCallback(
    async (listing: MaterialListing) => {
      if (!isAuthenticated) {
        toast({
          tone: "info",
          title: "Sign in to save listings",
          description: "Saved products are kept against your account.",
        });
        return;
      }
      const result = await wishlist.toggle(listing.id);
      if (!result.ok) {
        toast({ tone: "danger", title: "Could not update saved products", description: result.error });
      }
    },
    [isAuthenticated, toast, wishlist],
  );

  // Same POST /api/messages contract the page used before — subject and body
  // unchanged, so existing threads stay consistent.
  const handleInquire = useCallback(
    async (listing: MaterialListing) => {
      if (!isAuthenticated) {
        toast({
          tone: "info",
          title: "Sign in to send an inquiry",
          description: "Inquiries open a message thread with the seller.",
        });
        router.push("/register");
        return;
      }
      setInquiryPendingId(listing.id);
      try {
        const res = await fetch("/api/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            listingId: listing.id,
            subject: `Enquiry for ${listing.title}`,
            body: `Hi, I am interested in ${listing.title}. Please share availability, latest price, MOQ, dispatch timeline, and GST invoice terms.`,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Unable to message seller");
        toast({ tone: "success", title: "Inquiry sent", description: "A message thread is open with the seller." });
        router.push(`/messages/${data.threadId}`);
      } catch (err) {
        toast({
          tone: "danger",
          title: "Could not send the inquiry",
          description: err instanceof Error ? err.message : "Please try again.",
        });
      } finally {
        setInquiryPendingId(null);
      }
    },
    [isAuthenticated, router, toast],
  );

  const applySearch = useCallback(
    (q: string) => catalog.applyFilters({ ...catalog.filters, q }),
    [catalog],
  );

  const hasActiveFilters = countActiveFilters(catalog.filters) > 0;

  return (
    <section id="catalogue" className="mx-auto w-full max-w-6xl px-4 sm:px-6">
      <SearchHeader
        value={catalog.filters.q}
        resultCount={catalog.listings.length}
        isLoading={catalog.isLoading}
        onSearch={applySearch}
      />

      <FilterBar
        filters={catalog.filters}
        categories={categories}
        resultCount={catalog.listings.length}
        isLoading={catalog.isLoading}
        onApply={(next: CatalogFilters) => catalog.applyFilters(next)}
      />

      <div className="pt-6">
        <CatalogGrid
          listings={catalog.listings}
          isLoading={catalog.isLoading}
          isLoadingMore={catalog.isLoadingMore}
          error={catalog.error}
          hasMore={catalog.hasMore}
          hasActiveFilters={hasActiveFilters}
          savedIds={wishlist.savedIds}
          pendingSaveIds={wishlist.pendingIds}
          inquiryPendingId={inquiryPendingId}
          onToggleSave={handleToggleSave}
          onInquire={handleInquire}
          onLoadMore={catalog.loadMore}
          onClearFilters={() => catalog.applyFilters(EMPTY_FILTERS)}
          onRetry={() => catalog.applyFilters(catalog.filters)}
        />
      </div>
    </section>
  );
}

export default CatalogSection;
