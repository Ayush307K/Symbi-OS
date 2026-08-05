"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { PackageSearch, SearchX } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { ListingCard } from "./ListingCard";
import type { MaterialListing } from "@/lib/marketplace-types";

export interface CatalogGridProps {
  listings: MaterialListing[];
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  hasActiveFilters: boolean;
  savedIds: Set<string>;
  pendingSaveIds: Set<string>;
  inquiryPendingId: string | null;
  onToggleSave: (listing: MaterialListing) => void;
  onInquire: (listing: MaterialListing) => void;
  onLoadMore: () => void;
  onClearFilters: () => void;
  onRetry: () => void;
}

// auto-fill rather than fixed breakpoints: the rail already claims 230px, so
// the grid must reflow against whatever width is left, not against the viewport.
const GRID = "grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(210px,1fr))]";

export function CatalogGrid({
  listings,
  isLoading,
  isLoadingMore,
  error,
  hasMore,
  hasActiveFilters,
  savedIds,
  pendingSaveIds,
  inquiryPendingId,
  onToggleSave,
  onInquire,
  onLoadMore,
  onClearFilters,
  onRetry,
}: CatalogGridProps) {
  const reduceMotion = useReducedMotion();

  if (isLoading) {
    return (
      <div className={GRID} aria-busy="true" aria-label="Loading listings">
        {Array.from({ length: 8 }).map((_, index) => (
          <SkeletonCard key={index} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={<SearchX />}
        title="The catalogue could not be loaded"
        description={error}
        action={
          <Button variant="primary" size="sm" onClick={onRetry}>
            Try again
          </Button>
        }
      />
    );
  }

  if (listings.length === 0) {
    return hasActiveFilters ? (
      <EmptyState
        icon={<SearchX />}
        title="No listings match these filters"
        description="Nothing in the catalogue fits every filter at once. Widening the price or quantity range usually surfaces the most results."
        action={
          <Button variant="primary" size="sm" onClick={onClearFilters}>
            Clear all filters
          </Button>
        }
      />
    ) : (
      <EmptyState
        icon={<PackageSearch />}
        title="The catalogue is empty"
        description="No listings have been published yet. Once sellers publish verified non-hazardous material, it appears here."
      />
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <motion.ul
        className={GRID}
        initial={reduceMotion ? false : "hidden"}
        animate="visible"
        variants={{
          hidden: {},
          // Stagger reveals reading order rather than decorating: cards land
          // left-to-right as the eye would scan them.
          visible: { transition: { staggerChildren: reduceMotion ? 0 : 0.035 } },
        }}
      >
        <AnimatePresence initial={false}>
          {listings.map((listing) => (
            <motion.li
              key={listing.id}
              layout={!reduceMotion}
              variants={{
                hidden: reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 },
                visible: reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 },
              }}
              transition={{
                duration: reduceMotion ? 0 : 0.24,
                ease: [0.16, 1, 0.3, 1],
              }}
              className="list-none"
            >
              <ListingCard
                listing={listing}
                saved={savedIds.has(listing.id)}
                savePending={pendingSaveIds.has(listing.id)}
                onToggleSave={onToggleSave}
                onInquire={onInquire}
                inquirePending={inquiryPendingId === listing.id}
              />
            </motion.li>
          ))}
        </AnimatePresence>
      </motion.ul>

      {isLoadingMore ? (
        <div className={GRID} aria-hidden="true">
          {Array.from({ length: 4 }).map((_, index) => (
            <SkeletonCard key={index} />
          ))}
        </div>
      ) : null}

      <div className="flex flex-col items-center gap-2 pb-4">
        {hasMore ? (
          <Button
            variant="secondary"
            size="lg"
            loading={isLoadingMore}
            onClick={onLoadMore}
          >
            Load more listings
          </Button>
        ) : (
          <p className="text-[13px] text-ink-500">
            You have reached the end of the catalogue.
          </p>
        )}
        {/* Announced for screen readers as the list grows. */}
        <p aria-live="polite" className="text-[12px] text-ink-400">
          Showing {listings.length} listing{listings.length === 1 ? "" : "s"}
        </p>
      </div>
    </div>
  );
}

export default CatalogGrid;
