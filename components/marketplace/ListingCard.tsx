"use client";

import Link from "next/link";
import { BadgeCheck, Heart, Info, MapPin, Package, Send } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import ListingImage from "@/components/ListingImage";
import { cn } from "@/lib/cn";
import type { MaterialListing } from "@/lib/marketplace-types";

/**
 * Returns null when there is no published price. The provider feed leaves the
 * price field empty for quote-on-request offers and the importer stores that as
 * 0, so a zero here means "not published" — never "free". Callers render
 * "Ask quote" instead, matching the wording used elsewhere in the product.
 */
function formatMoney(value: number | null) {
  if (value === null || Number.isNaN(value) || value <= 0) return null;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatQuantity(value: number | null) {
  if (value === null || Number.isNaN(value)) return null;
  return new Intl.NumberFormat("en-IN").format(value);
}

export interface ListingCardProps {
  listing: MaterialListing;
  saved: boolean;
  savePending?: boolean;
  onToggleSave: (listing: MaterialListing) => void;
  onInquire: (listing: MaterialListing) => void;
  inquirePending?: boolean;
}

export function ListingCard({
  listing,
  saved,
  savePending = false,
  onToggleSave,
  onInquire,
  inquirePending = false,
}: ListingCardProps) {
  const price = formatMoney(listing.price);
  const quantity = formatQuantity(listing.quantity);
  const place = [listing.city, listing.state].filter(Boolean).join(", ") || listing.location;

  return (
    <Card
      interactive
      className="group flex h-full flex-col overflow-hidden focus-within:border-ink-300"
    >
      <div className="relative">
        <Link
          href={`/products/${listing.id}`}
          className="block overflow-hidden rounded-t-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-copper-700"
        >
          <ListingImage
            src={listing.imageUrl}
            alt={listing.title}
            className="h-40 w-full object-cover transition-transform duration-[240ms] ease-out group-hover:scale-[1.03]"
          />
        </Link>

        {/* Verification is stated either way. A listing carried in from a public
            provider feed is real and attributed, but its seller has not been
            verified — saying nothing would let it read as verified by default. */}
        {listing.verified ? (
          <Badge
            tone="brand"
            icon={<BadgeCheck />}
            className="absolute left-3 top-3 bg-surface-card/95 backdrop-blur-[2px]"
          >
            Verified seller
          </Badge>
        ) : (
          <Badge
            tone="neutral"
            icon={<Info />}
            title={
              listing.sourceName
                ? `Imported from ${listing.sourceName}. The seller has not completed verification.`
                : "The seller has not completed verification."
            }
            className="absolute left-3 top-3 bg-surface-card/95 backdrop-blur-[2px]"
          >
            Unverified source
          </Badge>
        )}

        <button
          type="button"
          onClick={() => onToggleSave(listing)}
          disabled={savePending}
          aria-pressed={saved}
          aria-label={saved ? `Remove ${listing.title} from saved` : `Save ${listing.title}`}
          className={cn(
            "absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full",
            "border border-ink-200 bg-surface-card/95 backdrop-blur-[2px]",
            "transition-colors duration-[120ms] hover:border-ink-300",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper-700",
            "disabled:cursor-not-allowed",
          )}
        >
          {savePending ? (
            <Spinner size="sm" label={null} />
          ) : (
            <Heart
              aria-hidden="true"
              className={cn(
                "h-4 w-4 transition-colors duration-[120ms]",
                saved ? "fill-copper-700 text-copper-700" : "text-ink-500",
              )}
            />
          )}
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="min-w-0">
          <p className="text-[12px] font-medium uppercase tracking-wide text-ink-500">
            {listing.category}
          </p>
          <h3 className="mt-1 line-clamp-2 text-sm font-semibold leading-snug text-ink-900">
            <Link
              href={`/products/${listing.id}`}
              className="rounded-sm hover:text-copper-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper-700"
            >
              {listing.title}
            </Link>
          </h3>
          <p className="mt-1 truncate text-[13px] text-ink-500">{listing.producer}</p>
        </div>

        <div className="flex items-end justify-between gap-2">
          <div>
            <p
              className={cn(
                "font-semibold leading-none",
                price ? "text-lg text-ink-900" : "text-base text-ink-600",
              )}
            >
              {price ?? "Ask quote"}
            </p>
            <p className="mt-1 text-[12px] text-ink-500">
              {price ? `per ${listing.unit}` : "Seller has not published a price"}
            </p>
          </div>
          {quantity ? (
            <p className="text-right text-[13px] text-ink-700">
              {quantity}
              <span className="text-ink-500"> {listing.unit} available</span>
            </p>
          ) : null}
        </div>

        <dl className="flex flex-col gap-1 border-t border-ink-200 pt-3 text-[12px] text-ink-500">
          <div className="flex items-center gap-1.5">
            <Package aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
            <dt className="sr-only">Minimum order</dt>
            <dd>
              MOQ {formatQuantity(listing.minOrderQuantity) ?? 1} {listing.unit}
            </dd>
          </div>
          <div className="flex items-center gap-1.5">
            <MapPin aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
            <dt className="sr-only">Location</dt>
            <dd className="truncate">{place}</dd>
          </div>
        </dl>

        <div className="mt-auto pt-1">
          <Button
            variant="primary"
            size="sm"
            fullWidth
            loading={inquirePending}
            onClick={() => onInquire(listing)}
            leadingIcon={<Send className="h-3.5 w-3.5" />}
          >
            Send inquiry
          </Button>
        </div>
      </div>
    </Card>
  );
}

export default ListingCard;
