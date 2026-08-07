"use client";

import Link from "next/link";
import { Check, MapPin, Package } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { MatchScore, bandLabel, scoreBand } from "./MatchScore";

export interface MatchListing {
  id: string;
  title: string;
  seller?: string | null;
  category: string;
  subcategory?: string | null;
  quantityAvailable?: number;
  unit: string;
  priceMode: string;
  pricePerUnit: number | null;
  city?: string | null;
  state?: string | null;
}

export interface MatchCardProps {
  listing: MatchListing;
  score: number;
  explanations: string[];
  distanceKm?: number | null;
  /** Quantity the buyer asked for, used to size the Buy now hand-off. */
  quantity: number;
}

const money = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);

/**
 * One matched listing, with the reasons it matched.
 *
 * The reasons are the product. A score on its own asks the buyer to trust a
 * number from a system they have never met; the rules that produced it are
 * checkable against their own judgement, which is what makes the ranking worth
 * anything in a market where a bad load costs a plant a shift.
 */
export function MatchCard({
  listing,
  score,
  explanations,
  distanceKm,
  quantity,
}: MatchCardProps) {
  const band = scoreBand(score);
  const priced = listing.priceMode === "FIXED" && listing.pricePerUnit !== null;
  const place = [listing.city, listing.state].filter(Boolean).join(", ");

  return (
    <li className="rounded-card border border-ink-200 bg-surface-card shadow-card transition-shadow hover:shadow-raised">
      <div className="flex gap-4 p-4">
        <MatchScore score={score} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
            <div className="min-w-0">
              <Link
                href={`/products/${listing.id}`}
                className="rounded-sm text-[15px] font-semibold text-ink-900 underline-offset-2 hover:text-copper-800 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper-700"
              >
                {listing.title}
              </Link>
              <p className="mt-0.5 truncate text-[13px] text-ink-500">
                {listing.seller ? `${listing.seller} · ` : ""}
                {listing.subcategory || listing.category}
              </p>
            </div>

            <div className="text-right">
              <p className="text-[15px] font-semibold tabular-nums text-ink-900">
                {priced ? `${money(listing.pricePerUnit!)}` : "On request"}
              </p>
              <p className="text-[12px] text-ink-500">
                {priced ? `per ${listing.unit}` : "quote-led"}
              </p>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-ink-500">
            <Badge tone={band === "strong" ? "success" : "neutral"}>
              {bandLabel[band]}
            </Badge>
            {listing.quantityAvailable !== undefined ? (
              <span className="inline-flex items-center gap-1">
                <Package aria-hidden="true" size={13} />
                {listing.quantityAvailable.toLocaleString("en-IN")} {listing.unit} available
              </span>
            ) : null}
            {place ? (
              <span className="inline-flex items-center gap-1">
                <MapPin aria-hidden="true" size={13} />
                {place}
                {typeof distanceKm === "number" ? ` · ${distanceKm} km away` : ""}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="border-t border-ink-200 bg-surface-sunken/60 px-4 py-3">
        <p className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-500">
          Why this matched
        </p>
        <ul className="mt-1.5 grid gap-1 sm:grid-cols-2">
          {explanations.map((reason, index) => (
            <li
              key={`${reason}-${index}`}
              className="flex items-start gap-1.5 text-[13px] leading-snug text-ink-600"
            >
              <Check aria-hidden="true" size={14} className="mt-0.5 shrink-0 text-brand" />
              {reason}
            </li>
          ))}
        </ul>

        <div className="mt-3 flex flex-wrap gap-2">
          {priced ? (
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                window.location.href = `/checkout?listing=${listing.id}&quantity=${quantity}`;
              }}
            >
              Buy {quantity.toLocaleString("en-IN")} {listing.unit}
            </Button>
          ) : null}
          <Link
            href={`/products/${listing.id}`}
            className="inline-flex h-8 items-center rounded-control border border-ink-300 bg-surface-card px-3 text-[13px] font-semibold text-ink-700 hover:bg-surface-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper-700"
          >
            {priced ? "View listing" : "Ask for a quote"}
          </Link>
        </div>
      </div>
    </li>
  );
}

export default MatchCard;
