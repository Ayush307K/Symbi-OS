"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type CatalogFilters,
  type MaterialListing,
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

  // Hydrate from the URL on mount so a shared link opens the same result set.
  useEffect(() => {
    const initial = filtersFromSearchParams(window.location.search);
    setFilters(initial);
    load(initial);
  }, [load]);

  // Back/forward should restore the result set, not just the address bar.
  useEffect(() => {
    if (!syncUrl) return;
    function onPopState() {
      const restored = filtersFromSearchParams(window.location.search);
      setFilters(restored);
      load(restored);
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [load, syncUrl]);

  const applyFilters = useCallback(
    (next: CatalogFilters) => {
      setFilters(next);
      if (syncUrl) {
        const query = filtersToQueryString(next);
        // pushState, not replaceState: each applied filter set is a place the
        // back button should return to.
        window.history.pushState(null, "", query ? `/?${query}` : "/");
      }
      load(next);
    },
    [load, syncUrl],
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
