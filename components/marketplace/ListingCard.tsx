"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { BadgeCheck, Heart, Info, MapPin, MessageSquare, Package, ShoppingCart } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import ListingImage from "@/components/ListingImage";
import { ExternalSourceLink } from "@/components/marketplace/ExternalSourceLink";
import { cn } from "@/lib/cn";
import { listingFallbackImage } from "@/lib/listing-images";
import { listingCapabilities, listingTrustLabel } from "@/lib/listing-mode";
import type { MaterialListing } from "@/lib/marketplace-types";

/**
 * The API maps an ON_REQUEST listing to price: null, so null is the signal for
 * "no published price" — not a zero sentinel. Callers render "Ask quote".
 */
function formatMoney(value: number | null) {
  if (value === null || Number.isNaN(value)) return null;
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
  /** Opens a message thread with the seller. Only offered where there is no price. */
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
  const router = useRouter();
  const price = formatMoney(listing.price);
  const quantity = formatQuantity(listing.quantity);
  const place = [listing.city, listing.state].filter(Boolean).join(", ") || listing.location;
  const capabilities = listingCapabilities(listing);
  const trustLabel = listingTrustLabel(listing.listingMode);

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
            fallbackSrc={listingFallbackImage(listing)}
            alt={listing.title}
            className="h-40 w-full object-cover transition-transform duration-[240ms] ease-out group-hover:scale-[1.03]"
          />
        </Link>

        {/* Verification is stated either way. A listing carried in from a public
            provider feed is real and attributed, but its seller has not been
            verified — saying nothing would let it read as verified by default. */}
        {listing.listingMode === "EVAL" ? (
          <Badge
            tone="neutral"
            icon={<Info />}
            title="Synthetic evaluation listing. It is visible for demo and retrieval testing, but is not a live seller offer."
            className="absolute left-3 top-3 bg-surface-card/95 backdrop-blur-[2px]"
          >
            {trustLabel}
          </Badge>
        ) : listing.listingMode === "MANAGED" && capabilities.canMessage ? (
          <Badge
            tone="brand"
            icon={<BadgeCheck />}
            className="absolute left-3 top-3 bg-surface-card/95 backdrop-blur-[2px]"
          >
            {trustLabel}
          </Badge>
        ) : listing.listingMode === "EXTERNAL_LEAD" ? (
          <Badge
            tone="neutral"
            icon={<Info />}
            title={
              listing.sourceName
                ? `Sourced from ${listing.sourceName}. This supplier is not connected for SymbiOS transactions.`
                : "This supplier is not connected for SymbiOS transactions."
            }
            className="absolute left-3 top-3 bg-surface-card/95 backdrop-blur-[2px]"
          >
            {trustLabel}
          </Badge>
        ) : (
          <Badge
            tone="neutral"
            icon={<Info />}
            title="This SymbiOS seller offer is temporarily unavailable while its seller eligibility is reviewed."
            className="absolute left-3 top-3 bg-surface-card/95 backdrop-blur-[2px]"
          >
            Seller unavailable
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

        {/* The card offers only what the listing supports. Neither buying nor
            bidding can honestly happen in one click — both need a quantity —
            so these lead to the surface that collects it rather than firing an
            action from here. */}
        <div className="mt-auto flex flex-col gap-1.5 pt-1">
          {listing.listingMode === "EVAL" ? (
            <Button variant="secondary" size="sm" fullWidth disabled>
              Evaluation only
            </Button>
          ) : listing.listingMode === "EXTERNAL_LEAD" ? (
            <ExternalSourceLink
              href={listing.sourceUrl}
              sourceName={listing.sourceName}
              variant="primary"
              size="sm"
              fullWidth
            />
          ) : capabilities.canBuy ? (
            <>
              <Button
                variant="primary"
                size="sm"
                fullWidth
                onClick={() =>
                  router.push(
                    `/checkout?listingId=${encodeURIComponent(listing.id)}&quantity=${Math.max(1, listing.minOrderQuantity || 1)}`,
                  )
                }
                leadingIcon={<ShoppingCart className="h-3.5 w-3.5" />}
              >
                Buy now
              </Button>
              <Link
                href={`/products/${listing.id}`}
                className="rounded-sm text-center text-[12px] font-semibold text-ink-600 hover:text-copper-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper-700"
              >
                Place a bid instead →
              </Link>
            </>
          ) : capabilities.canMessage ? (
            <Button
              variant="primary"
              size="sm"
              fullWidth
              loading={inquirePending}
              onClick={() => onInquire(listing)}
              leadingIcon={<MessageSquare className="h-3.5 w-3.5" />}
            >
              Ask quote
            </Button>
          ) : (
            <Button variant="secondary" size="sm" fullWidth disabled>
              Seller unavailable
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

export default ListingCard;
