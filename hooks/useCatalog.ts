"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  type CatalogFilters,
  type MaterialListing,
  catalogNeedsReload,
  EMPTY_FILTERS,
  filtersFromSearchParams,
  filtersToParams,
  filtersToQueryString,
} from "@/lib/marketplace-types";

/**
 * Owns the catalog's data: GET /api/materials, its cursor pagination, and the
 * URL query string that makes a result set shareable.
 *
 * The request and response handling is carried over from app/page.tsx
 * unchanged — same endpoint, same params, same `{ items, pageInfo }` shape.
 * What is new is only that filters round-trip through the URL and that
 * "load more" appends using the cursor the API already returned.
 */
export function useCatalog(options: { syncUrl?: boolean } = {}) {
  const { syncUrl = true } = options;
  const searchParams = useSearchParams();
  const router = useRouter();

  const [listings, setListings] = useState<MaterialListing[]>([]);
  const [filters, setFilters] = useState<CatalogFilters>(EMPTY_FILTERS);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  // Guards against an older in-flight request overwriting a newer one when the
  // user changes filters quickly.
  const requestId = useRef(0);

  // The filter set currently rendered, as a query string. Used to tell a real
  // filter change from a URL change the catalogue does not own.
  //
  // null, not "", because "" is the signature of an unfiltered catalogue — the
  // home page. Starting at "" made the first effect run believe those filters
  // were already applied, so the opening request was never sent and the page
  // sat on its skeletons forever. Any URL carrying a filter masked it.
  const appliedRef = useRef<string | null>(null);

  const load = useCallback(
    async (next: CatalogFilters, cursor?: string) => {
      const id = ++requestId.current;
      if (cursor) setIsLoadingMore(true);
      else setIsLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/materials?${filtersToParams(next, cursor)}`);
        if (!res.ok) throw new Error("Failed to fetch marketplace listings");
        const payload = await res.json();
        if (id !== requestId.current) return;

        const data: MaterialListing[] = Array.isArray(payload)
          ? payload
          : payload.items || [];
        setListings((current) => (cursor ? [...current, ...data] : data));
        setNextCursor(payload.pageInfo?.nextCursor ?? null);
        setHasMore(Boolean(payload.pageInfo?.hasMore));
      } catch (err) {
        if (id !== requestId.current) return;
        if (!cursor) setListings([]);
        setError(
          err instanceof Error
            ? err.message
            : "Unable to load the marketplace catalogue.",
        );
      } finally {
        if (id === requestId.current) {
          setIsLoading(false);
          setIsLoadingMore(false);
        }
      }
    },
    [],
  );

  // The URL is the single source of truth, watched through Next's own
  // searchParams rather than window.location. A router.push does not fire
  // popstate and does not remount a page you are already on, so listening for
  // popstate alone meant a category link changed the address bar and nothing
  // else until a manual refresh.
  const search = searchParams.toString();
  useEffect(() => {
    const next = filtersFromSearchParams(search);
    const signature = filtersToQueryString(next);
    // Params the catalogue does not own can change without affecting results.
    if (!catalogNeedsReload(signature, appliedRef.current)) return;
    appliedRef.current = signature;
    setFilters(next);
    load(next);
  }, [search, load]);

  const applyFilters = useCallback(
    (next: CatalogFilters) => {
      setFilters(next);
      appliedRef.current = filtersToQueryString(next);
      if (syncUrl) {
        const query = filtersToQueryString(next);
        // Through the router, not history.pushState: raw history writes are
        // invisible to Next's searchParams, which would leave the URL and the
        // hook watching it permanently out of step. appliedRef is already set
        // above, so the effect sees no change and does not load a second time.
        router.push(query ? `/?${query}` : "/", { scroll: false });
      }
      load(next);
    },
    [load, router, syncUrl],
  );

  const updateFilter = useCallback(
    <K extends keyof CatalogFilters>(key: K, value: CatalogFilters[K]) => {
      setFilters((current) => ({ ...current, [key]: value }));
    },
    [],
  );

  const loadMore = useCallback(() => {
    if (!nextCursor || isLoadingMore) return;
    load(filters, nextCursor);
  }, [filters, isLoadingMore, load, nextCursor]);

  const reset = useCallback(() => applyFilters(EMPTY_FILTERS), [applyFilters]);

  /** Re-requests the current filters unconditionally, for retry after an error. */
  const refresh = useCallback(() => load(filters), [filters, load]);

  return {
    listings,
    filters,
    isLoading,
    isLoadingMore,
    error,
    hasMore,
    applyFilters,
    updateFilter,
    loadMore,
    reset,
    refresh,
  };
}

/**
 * Saved listings, with an optimistic toggle. Carries over the existing
 * /api/wishlist calls verbatim; on failure the local state rolls back.
 */
export function useWishlist() {
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    async function fetchWishlist() {
      try {
        const res = await fetch("/api/wishlist");
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setSavedIds(
          new Set(
            (data.items ?? []).map((item: { listingId: string }) => item.listingId),
          ),
        );
      } catch {
        // Non-critical: the rest of the catalogue still works signed out.
      }
    }
    fetchWishlist();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = useCallback(
    async (listingId: string): Promise<{ ok: boolean; saved: boolean; error?: string }> => {
      const wasSaved = savedIds.has(listingId);

      // Optimistic: flip immediately, roll back if the request fails.
      setSavedIds((current) => {
        const next = new Set(current);
        if (wasSaved) next.delete(listingId);
        else next.add(listingId);
        return next;
      });
      setPendingIds((current) => new Set(current).add(listingId));

      try {
        const res = await fetch(
          wasSaved
            ? `/api/wishlist?listingId=${encodeURIComponent(listingId)}`
            : "/api/wishlist",
          {
            method: wasSaved ? "DELETE" : "POST",
            headers: wasSaved ? undefined : { "Content-Type": "application/json" },
            body: wasSaved ? undefined : JSON.stringify({ listingId }),
          },
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Unable to update saved products");
        return { ok: true, saved: !wasSaved };
      } catch (err) {
        setSavedIds((current) => {
          const next = new Set(current);
          if (wasSaved) next.add(listingId);
          else next.delete(listingId);
          return next;
        });
        return {
          ok: false,
          saved: wasSaved,
          error: err instanceof Error ? err.message : "Unable to update saved products.",
        };
      } finally {
        setPendingIds((current) => {
          const next = new Set(current);
          next.delete(listingId);
          return next;
        });
      }
    },
    [savedIds],
  );

  return { savedIds, pendingIds, toggle, setSavedIds };
}
