"use client";

import { useState } from "react";
import Link from "next/link";
import { Recycle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Hero } from "./Hero";
import { CatalogSection } from "./CatalogSection";

/**
 * What an unauthenticated visitor sees at `/`. Previously they were redirected
 * straight to registration; now the catalogue is browsable first and the
 * account prompt comes at the point it is actually needed — saving, inquiring,
 * or bidding.
 */
export function PublicLanding() {
  const [listingCount, setListingCount] = useState(0);

  function scrollToCatalogue() {
    document
      .getElementById("catalogue")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="min-h-screen bg-surface-page text-ink-900">
      <header className="sticky top-0 z-40 border-b border-ink-200 bg-surface-card/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link
            href="/"
            className="flex items-center gap-2 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper-700"
          >
            <span
              aria-hidden="true"
              className="flex h-8 w-8 items-center justify-center rounded-control bg-brand text-white"
            >
              <Recycle className="h-4 w-4" />
            </span>
            <span className="font-display text-[15px] font-bold tracking-tight">
              Symbi-OS
            </span>
          </Link>

          <nav className="flex items-center gap-2" aria-label="Account">
            <Button variant="ghost" size="sm" onClick={scrollToCatalogue}>
              Browse
            </Button>
            <Link href="/login" tabIndex={-1}>
              <Button variant="secondary" size="sm">
                Sign in
              </Button>
            </Link>
            <Link href="/register" tabIndex={-1}>
              <Button variant="primary" size="sm">
                Create account
              </Button>
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <Hero
          onSearch={(query) => {
            scrollToCatalogue();
            // The catalogue owns its own URL state; pushing the query here lets
            // it pick the search up through the same popstate path a shared
            // link would use.
            const params = new URLSearchParams(window.location.search);
            if (query) params.set("q", query);
            else params.delete("q");
            window.history.pushState(null, "", params.size ? `/?${params}` : "/");
            window.dispatchEvent(new PopStateEvent("popstate"));
          }}
          listingCount={listingCount}
          isAuthenticated={false}
        />

        <div className="pb-16">
          <CatalogSection isAuthenticated={false} onCountChange={setListingCount} />
        </div>
      </main>

      <footer className="border-t border-ink-200 bg-surface-card">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-[13px] text-ink-500 sm:px-6">
          <p className="font-medium text-ink-700">
            Symbi-OS — verified non-hazardous industrial by-products
          </p>
          <p>
            Verification and payments run in sandbox mode for v0. No real funds
            move, and no listing is presented as escrow-backed.
          </p>
        </div>
      </footer>
    </div>
  );
}

export default PublicLanding;
