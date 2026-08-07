"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, MapPin, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/context/AuthContext";
import { AccountMenu } from "./AccountMenu";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { cn } from "@/lib/cn";
import { SAFE_CATEGORIES } from "@/lib/listing-constants";

export interface MarketplaceNavProps {
  /** Current applied query, so the field reflects the results below. */
  query?: string;
  category?: string;
  locationLabel?: string;
  onSearch?: (query: string, category: string) => void;
}

/**
 * The shared marketplace chrome: identity, delivery location, and scoped
 * search. Every buyer-facing screen sits under this, so the search field is
 * the one place a query is entered and nothing below repeats it.
 *
 * There is no category rail. Category is a filter, and the catalogue's own
 * sidebar owns it — two controls for one piece of state have to be kept in
 * agreement forever, and the header copy was redundant on the only page where
 * filtering happens.
 */
export function MarketplaceNav({
  query = "",
  category = "",
  locationLabel = "All India",
  onSearch,
}: MarketplaceNavProps) {
  const router = useRouter();
  // Read auth here rather than take a prop: every screen mounts this nav, and a
  // page that forgot to pass the flag would show a signed-in user "Sign in".
  const { user } = useAuth();
  const isAuthenticated = Boolean(user);
  const [draft, setDraft] = useState(query);
  const [scope, setScope] = useState(category);

  useEffect(() => setDraft(query), [query]);
  useEffect(() => setScope(category), [category]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (onSearch) onSearch(draft.trim(), scope);
    else {
      const params = new URLSearchParams();
      if (draft.trim()) params.set("q", draft.trim());
      if (scope) params.set("category", scope);
      router.push(params.size ? `/?${params}` : "/");
    }
  }

  return (
    <header className="sticky top-0 z-40 border-b border-ink-200 bg-surface-card">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 sm:px-6">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper-700"
        >
          <span
            aria-hidden="true"
            className="flex h-[30px] w-[30px] items-center justify-center rounded-[7px] bg-copper-700 font-display text-sm font-extrabold text-white"
          >
            S
          </span>
          <span className="font-display text-[15px] font-extrabold tracking-tight text-ink-900">
            Symbi-OS
          </span>
        </Link>

        <div className="hidden shrink-0 flex-col leading-tight md:flex">
          <span className="text-[11px] text-ink-500">Deliver to</span>
          <span className="flex items-center gap-1 text-[12.5px] font-semibold text-ink-900">
            <MapPin aria-hidden="true" className="h-3.5 w-3.5 text-copper-700" />
            {locationLabel}
          </span>
        </div>

        {/* Scoped search: category selector fused to the field, one action. */}
        <form onSubmit={submit} className="order-last flex h-[42px] w-full min-w-0 flex-1 sm:order-none sm:w-auto">
          <label className="sr-only" htmlFor="marketplace-scope">
            Search category
          </label>
          <div className="relative flex shrink-0">
            <select
              id="marketplace-scope"
              value={scope}
              onChange={(event) => setScope(event.target.value)}
              className="h-full cursor-pointer appearance-none rounded-l-control border border-r-0 border-ink-200 bg-surface-sunken pl-3 pr-8 text-[12.5px] font-semibold text-ink-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-copper-700"
            >
              <option value="">Raw materials</option>
              {SAFE_CATEGORIES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <ChevronDown
              aria-hidden="true"
              className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-500"
            />
          </div>
          <label className="sr-only" htmlFor="marketplace-search">
            Search materials
          </label>
          <input
            id="marketplace-search"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Search carbon black, HDPE, PET, textiles…"
            className="h-full min-w-0 flex-1 border-y border-ink-200 bg-surface-card px-3 text-sm text-ink-900 placeholder:text-ink-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-copper-700"
          />
          <button
            type="submit"
            className="flex h-full shrink-0 items-center gap-1.5 rounded-r-control bg-copper-700 px-4 text-[12.5px] font-bold text-white transition-colors hover:bg-copper-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper-700"
          >
            <Search aria-hidden="true" className="h-4 w-4" />
            <span className="hidden sm:inline">Search</span>
          </button>
        </form>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <WorkspaceSwitcher />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => router.push(isAuthenticated ? "/rfq" : "/register?next=/rfq")}
          >
            Post RFQ
          </Button>
          {isAuthenticated ? (
            <AccountMenu />
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={() => router.push("/login")}>
                Sign in
              </Button>
              <Button variant="primary" size="sm" onClick={() => router.push("/register")}>
                Create account
              </Button>
            </>
          )}
        </div>
      </div>

    </header>
  );
}

export default MarketplaceNav;
