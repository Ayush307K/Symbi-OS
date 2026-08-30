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
 * Owns the catalog's data, its cursor pagination, and the
 * URL query string that makes a result set shareable.
 *
 * The request and response handling is carried over from app/page.tsx
 * unchanged — same endpoint, same params, same `{ items, pageInfo }` shape.
 * What is new is only that filters round-trip through the URL and that
 * "load more" appends using the cursor the API already returned.
 */
export function useCatalog(
  options: {
    syncUrl?: boolean;
    personalized?: boolean;
    deliveryAddressId?: string | null;
  } = {},
) {
  const { syncUrl = true, personalized = false, deliveryAddressId = null } = options;
  const searchParams = useSearchParams();
  const router = useRouter();

  const [listings, setListings] = useState<MaterialListing[]>([]);
  const [filters, setFilters] = useState<CatalogFilters>(EMPTY_FILTERS);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState<number | null>(null);

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
  // A personalized request may fall back to the public catalogue. Remember
  // which endpoint produced its cursor so "load more" cannot send a catalogue
  // cursor to the ranked-feed decoder.
  const paginationEndpointRef = useRef<"/api/feed" | "/api/materials">(
    "/api/materials",
  );

  // Personalization decides which endpoint a given filter set is fetched from,
  // so it belongs in the applied signature. It resolves after the first render
  // — auth is still loading then — and without it here the flip from false to
  // true reads as "same filters, already applied" and the personalized feed is
  // never requested at all.
  const signatureFor = useCallback(
    (query: string) =>
      `${personalized ? "feed" : "catalog"}|${deliveryAddressId || "all-india"}|${query}`,
    [deliveryAddressId, personalized],
  );

  const load = useCallback(
    async (next: CatalogFilters, cursor?: string) => {
      const id = ++requestId.current;
      if (cursor) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
        // A new result set has its own pagination. Holding the previous cursor
        // while a fresh request is in flight leaves a live "load more" pointing
        // into the old result set — today the grid hides it behind the loading
        // state, so this is the guard rather than the symptom.
        setNextCursor(null);
        setHasMore(false);
        setTotalCount(null);
      }
      setError(null);

      try {
        // Personalization owns only the unfiltered buyer feed. Any explicit
        // query/filter stays on /api/materials, so this does not silently turn
        // into the search-ranking feature that is intentionally out of scope.
        const preferredEndpoint = cursor
          ? paginationEndpointRef.current
          : personalized && filtersToQueryString(next) === ""
            ? "/api/feed"
            : "/api/materials";
        const params = filtersToParams(next, cursor);
        if (preferredEndpoint === "/api/feed" && deliveryAddressId) {
          params.set("deliveryAddressId", deliveryAddressId);
        }
        let effectiveEndpoint = preferredEndpoint;
        let res = await fetch(`${preferredEndpoint}?${params}`);
        let payload = res.ok ? await res.json() : null;

        // Personalization is an enhancement, never an availability gate. If
        // the first ranked page is unavailable or empty, render the canonical
        // catalogue instead. Cursor pages stay on their originating endpoint.
        if (
          !cursor &&
          preferredEndpoint === "/api/feed" &&
          (!res.ok || !Array.isArray(payload?.items) || payload.items.length === 0)
        ) {
          effectiveEndpoint = "/api/materials";
          res = await fetch(`/api/materials?${filtersToParams(next)}`);
          payload = res.ok ? await res.json() : null;
        }
        if (!res.ok || !payload) {
          throw new Error("Failed to fetch marketplace listings");
        }
        if (id !== requestId.current) return;

        const data: MaterialListing[] = Array.isArray(payload)
          ? payload
          : payload.items || [];
        setListings((current) => (cursor ? [...current, ...data] : data));
        setNextCursor(payload.pageInfo?.nextCursor ?? null);
        setHasMore(Boolean(payload.pageInfo?.hasMore));
        setTotalCount(
          typeof payload.pageInfo?.total === "number"
            ? payload.pageInfo.total
            : null,
        );
        if (!cursor) paginationEndpointRef.current = effectiveEndpoint;
      } catch (err) {
        if (id !== requestId.current) return;
        if (!cursor) {
          setListings([]);
          // These filters were recorded as applied before the request was known
          // to have worked. Left standing, a return to this same URL reads as
          // already-loaded and is never retried — the error would survive a
          // Back/Forward round trip with only the retry button to clear it.
          appliedRef.current = null;
        }
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
    [deliveryAddressId, personalized],
  );

  // The URL is the single source of truth, watched through Next's own
  // searchParams rather than window.location. A router.push does not fire
  // popstate and does not remount a page you are already on, so listening for
  // popstate alone meant a category link changed the address bar and nothing
  // else until a manual refresh.
  const search = searchParams.toString();
  useEffect(() => {
    const next = filtersFromSearchParams(search);
    const signature = signatureFor(filtersToQueryString(next));
    // Params the catalogue does not own can change without affecting results.
    if (!catalogNeedsReload(signature, appliedRef.current)) return;
    appliedRef.current = signature;
    setFilters(next);
    load(next);
  }, [search, load, signatureFor]);

  const applyFilters = useCallback(
    (next: CatalogFilters) => {
      setFilters(next);
      appliedRef.current = signatureFor(filtersToQueryString(next));
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
    [load, router, signatureFor, syncUrl],
  );

  // There is deliberately no updateFilter here. One existed, unused: it wrote
  // `filters` without touching appliedRef, so anything adopting it would have
  // desynced the two — loadMore and refresh would silently request filters the
  // user had typed but not applied, and the URL effect's comparison would run
  // against a set that was never loaded. FilterSidebar already owns its own
  // draft state and applies in one call, which is the right split.

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
    totalCount,
    applyFilters,
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

  return { savedIds, pendingIds, toggle };
}
