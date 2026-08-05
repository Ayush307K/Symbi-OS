"use client";

import { useAuth } from "@/context/AuthContext";
import { MarketplaceNav } from "@/components/marketplace/MarketplaceNav";
import { CatalogSection } from "@/components/marketplace/CatalogSection";
import { Hero } from "@/components/marketplace/Hero";
import { MarketplaceFooter } from "@/components/marketplace/MarketplaceFooter";

/**
 * The marketplace, for everyone.
 *
 * This replaced a 2,200-line console that wrapped the catalogue in a sidebar of
 * views — three of which (Match Engine, Compliance, Logistics) had no
 * implementation and fell through to a placeholder panel. Its cart, orders,
 * bids, and address flows all duplicated /account, and its buy and bid flows
 * now live on the listing detail panel, so nothing was lost by removing it.
 *
 * Signed-out visitors get the hero first, since they need to know what this is
 * before they can judge the listings. Signed-in buyers go straight to stock.
 */
export default function Home() {
  const { user } = useAuth();

  return (
    <div className="flex min-h-screen flex-col bg-surface-page text-ink-900">
      <MarketplaceNav />

      <main className="flex-1">
        {!user ? (
          <Hero
            listingCount={0}
            isAuthenticated={false}
            onSearch={(query) => {
              const params = new URLSearchParams(window.location.search);
              if (query) params.set("q", query);
              else params.delete("q");
              window.history.pushState(null, "", params.size ? `/?${params}` : "/");
              window.dispatchEvent(new PopStateEvent("popstate"));
              document
                .getElementById("catalogue")
                ?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          />
        ) : null}

        <CatalogSection isAuthenticated={Boolean(user)} />
      </main>

      <MarketplaceFooter />
    </div>
  );
}
