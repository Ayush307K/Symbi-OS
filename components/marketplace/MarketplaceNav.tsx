"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MapPin, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/context/AuthContext";
import { AccountMenu } from "./AccountMenu";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { cn } from "@/lib/cn";

export interface MarketplaceNavProps {
  /** Current applied query, so the field reflects the results below. */
  query?: string;
  locationLabel?: string;
  onSearch?: (query: string) => void;
}

/**
 * The shared marketplace chrome: identity, delivery location, and search. Every buyer-facing screen sits under this, so the search field is
 * the one place a query is entered and nothing below repeats it.
 *
 * Search is a query, not a filter. Category belongs to the catalogue's own
 * sidebar and lives there alone: a scope selector here was a second control
 * for the same state, and since no screen passed the applied category back
 * down, it reset itself to "Raw materials" after every search while the
 * sidebar still showed the truth. It also offered all nine safe categories
 * when only three have listings, so most choices returned an empty grid and
 * read as broken.
 */
export function MarketplaceNav({
  query = "",
  locationLabel = "All India",
  onSearch,
}: MarketplaceNavProps) {
  const router = useRouter();
  // Read auth here rather than take a prop: every screen mounts this nav, and a
  // page that forgot to pass the flag would show a signed-in user "Sign in".
  const { user } = useAuth();
  const isAuthenticated = Boolean(user);
  const [draft, setDraft] = useState(query);

  useEffect(() => setDraft(query), [query]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (onSearch) onSearch(draft.trim());
    else {
      const params = new URLSearchParams();
      if (draft.trim()) params.set("q", draft.trim());
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

        <form onSubmit={submit} className="order-last flex h-[42px] w-full min-w-0 flex-1 sm:order-none sm:w-auto">
          <label className="sr-only" htmlFor="marketplace-search">
            Search materials
          </label>
          <input
            id="marketplace-search"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Search carbon black, HDPE, PET, textiles…"
            className="h-full min-w-0 flex-1 rounded-l-control border-y border-l border-ink-200 bg-surface-card px-3 text-sm text-ink-900 placeholder:text-ink-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-copper-700"
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
