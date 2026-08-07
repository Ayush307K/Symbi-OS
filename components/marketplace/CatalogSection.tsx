"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useCatalog, useWishlist } from "@/hooks/useCatalog";
import { useToast } from "@/components/ui/Toast";
import { FilterSidebar } from "./FilterSidebar";
import { CatalogGrid } from "./CatalogGrid";
import {
  type CatalogFilters,
  type MaterialListing,
  SORT_OPTIONS,
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
    <section id="catalogue" className="mx-auto w-full max-w-[1440px] px-4 sm:px-6">
      <div className="flex gap-8 py-6">
        <FilterSidebar
          filters={catalog.filters}
          categories={categories}
          onApply={(next: CatalogFilters) => catalog.applyFilters(next)}
        />

        <div className="min-w-0 flex-1">
          {/* Result context and sort share one line, per the wireframe: what is
              being shown, and the only control that reorders it. */}
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-[13px] text-ink-600" aria-live="polite">
              {catalog.isLoading ? (
                "Loading listings…"
              ) : (
                <>
                  <span className="font-semibold text-ink-900">
                    {catalog.listings.length}
                  </span>{" "}
                  listing{catalog.listings.length === 1 ? "" : "s"}
                  {catalog.filters.category ? ` · ${catalog.filters.category}` : ""}
                  {catalog.filters.location ? ` · ${catalog.filters.location}` : ""}
                  {catalog.filters.q ? ` · “${catalog.filters.q}”` : ""}
                </>
              )}
            </p>

            <label className="flex items-center gap-2 text-[13px] text-ink-500">
              <span className="hidden sm:inline">Sort</span>
              <select
                value={catalog.filters.sort}
                onChange={(event) =>
                  catalog.applyFilters({
                    ...catalog.filters,
                    sort: event.target.value as CatalogFilters["sort"],
                  })
                }
                aria-label="Sort listings"
                className="h-9 cursor-pointer rounded-control border border-ink-200 bg-surface-card px-2.5 pr-7 text-[13px] font-medium text-ink-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper-700"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

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
            onClearFilters={catalog.reset}
            onRetry={catalog.refresh}
          />
        </div>
      </div>
    </section>
  );
}

export default CatalogSection;
