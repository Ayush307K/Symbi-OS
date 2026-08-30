"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, PackageCheck, Search, ShieldCheck, Store } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export interface HeroProps {
  /** Runs the catalogue search below. Does not navigate. */
  onSearch: (query: string) => void;
  /** Live catalogue size, so the claim is measured rather than marketing. */
  listingCount: number;
  isAuthenticated: boolean;
}

/**
 * The public landing. Unauthenticated visitors previously went straight to
 * registration, which asks for a commitment before showing anything worth
 * committing to. This states what the marketplace is, splits the two audiences,
 * and puts the catalogue one search away — no account required to browse.
 */
export function Hero({ onSearch, listingCount, isAuthenticated }: HeroProps) {
  const [query, setQuery] = useState("");
  const router = useRouter();

  return (
    <section className="border-b border-ink-200 bg-surface-card">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-copper-700">
          Industrial by-product discovery · India
        </p>

        <h1 className="mt-3 max-w-3xl text-4xl font-bold leading-[1.1] tracking-tight text-ink-900 sm:text-5xl">
          The scrap one plant discards is another plant&rsquo;s raw material.
        </h1>

        <p className="mt-4 max-w-2xl text-base leading-relaxed text-ink-600">
          Explore verified SymbiOS seller offers and clearly labelled external
          sourcing leads. Marketplace transactions are available only when an
          approved seller is connected, and hazardous material is rejected.
        </p>

        <form
          className="mt-8 flex max-w-2xl flex-col gap-2 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            onSearch(query.trim());
          }}
        >
          <Input
            aria-label="Search materials"
            placeholder="Aluminium scrap, HDPE regrind, fly ash…"
            leadingIcon={<Search />}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            containerClassName="flex-1"
          />
          <Button type="submit" variant="primary" size="lg">
            Search catalogue
          </Button>
        </form>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          <div className="rounded-card border border-ink-200 bg-surface-sunken/60 p-5">
            <div className="flex items-center gap-2">
              <Store aria-hidden="true" className="h-4 w-4 text-brand" />
              <h2 className="text-[15px] font-semibold text-ink-900">I&rsquo;m selling</h2>
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-ink-600">
              List a by-product with quantity, grade, and location. Seller
              verification and moderation gate managed marketplace offers.
            </p>
            <div className="mt-4">
              <Button
                variant="secondary"
                size="sm"
                trailingIcon={<ArrowRight className="h-4 w-4" />}
                onClick={() =>
                  router.push(isAuthenticated ? "/seller/listings/new" : "/register")
                }
              >
                {isAuthenticated ? "Create a listing" : "Start selling"}
              </Button>
            </div>
          </div>

          <div className="rounded-card border border-ink-200 bg-surface-sunken/60 p-5">
            <div className="flex items-center gap-2">
              <PackageCheck aria-hidden="true" className="h-4 w-4 text-brand" />
              <h2 className="text-[15px] font-semibold text-ink-900">I&rsquo;m buying</h2>
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-ink-600">
              Filter {listingCount > 0 ? `${listingCount} live listings` : "the catalogue"} by
              material, quantity, price, and distance. Transact with connected
              sellers or follow a clearly labelled external source.
            </p>
            <div className="mt-4">
              <Button
                variant="secondary"
                size="sm"
                trailingIcon={<ArrowRight className="h-4 w-4" />}
                onClick={() => onSearch("")}
              >
                Browse the catalogue
              </Button>
            </div>
          </div>
        </div>

        <p className="mt-8 flex items-center gap-2 text-[13px] text-ink-500">
          <ShieldCheck aria-hidden="true" className="h-4 w-4 shrink-0 text-brand" />
          Radioactive, biomedical, explosive, asbestos, and e-waste categories are
          rejected at ingestion, listing, search, and checkout.
        </p>

        {!isAuthenticated ? (
          <p className="mt-3 text-[13px] text-ink-500">
            Browsing is open.{" "}
            <Link
              href="/register"
              className="font-medium text-copper-700 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper-700"
            >
              Create an account
            </Link>{" "}
            to save listings and contact eligible SymbiOS sellers.
          </p>
        ) : null}
      </div>
    </section>
  );
}

export default Hero;
