"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  Heart,
  Info,
  LayoutList,
  MapPin,
  MessageSquare,
  Package,
  ShoppingCart,
  Star,
  Truck,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/Toast";
import ListingImage from "@/components/ListingImage";
import { cn } from "@/lib/cn";
import type { MaterialListing } from "@/lib/marketplace-types";

interface ListingReview {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  verifiedPurchase: boolean;
  helpfulCount: number;
  companyName: string;
  createdAt: string;
}

interface ProductResponse {
  listing: MaterialListing & { createdAt: string; updatedAt: string };
  reviews: ListingReview[];
  sellerStats: {
    activeListings: number;
    categoryListings: number;
    fulfilledOrders: number;
    reviewAverage: number | null;
    reviewCount: number;
  };
  related: MaterialListing[];
  sameSeller: MaterialListing[];
}

function money(value: number | null) {
  // ON_REQUEST arrives as null. A zero is never rendered as a price.
  if (value === null || Number.isNaN(value)) return null;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function num(value: number | null) {
  if (value === null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-IN").format(value);
}

export interface ListingDetailPanelProps {
  listingId: string;
}

export function ListingDetailPanel({ listingId }: ListingDetailPanelProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [data, setData] = useState<ProductResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [pending, setPending] = useState<string | null>(null);
  const [isSpecsOpen, setIsSpecsOpen] = useState(false);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewTitle, setReviewTitle] = useState("");
  const [reviewBody, setReviewBody] = useState("");

  const listing = data?.listing ?? null;

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch(`/api/materials/${listingId}`);
        if (!res.ok) throw new Error("This listing is no longer available.");
        const payload = await res.json();
        if (cancelled) return;
        setData(payload);
        setQuantity(Math.max(1, payload.listing?.minOrderQuantity || 1));
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unable to load this listing.");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [listingId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/wishlist");
        if (!res.ok) return;
        const payload = await res.json();
        if (cancelled) return;
        setIsSaved(
          (payload.items ?? []).some(
            (item: { listingId: string }) => item.listingId === listingId,
          ),
        );
      } catch {
        // Non-critical.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [listingId]);

  const run = useCallback(
    async (key: string, action: () => Promise<void>) => {
      setPending(key);
      try {
        await action();
      } catch (err) {
        toast({
          tone: "danger",
          title: "That did not go through",
          description: err instanceof Error ? err.message : "Something went wrong.",
        });
      } finally {
        setPending(null);
      }
    },
    [toast],
  );

  const saveListing = () =>
    listing &&
    run("save", async () => {
      const res = await fetch(
        `/api/wishlist${isSaved ? `?listingId=${listing.id}` : ""}`,
        {
          method: isSaved ? "DELETE" : "POST",
          headers: { "Content-Type": "application/json" },
          body: isSaved ? undefined : JSON.stringify({ listingId: listing.id }),
        },
      );
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Unable to update saved products.");
      setIsSaved(!isSaved);
      toast({ tone: "success", title: isSaved ? "Removed from saved" : "Saved for later" });
    });

  const addToCart = () =>
    listing &&
    run("cart", async () => {
      const res = await fetch("/api/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId: listing.id, quantity }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Unable to add item to cart.");
      toast({ tone: "success", title: "Added to cart" });
    });

  const requestQuote = () =>
    listing &&
    run("quote", async () => {
      const res = await fetch("/api/bids", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          listingId: listing.id,
          quantity,
          pricePerUnit: listing.price && listing.price > 0 ? listing.price : 1,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Unable to submit RFQ.");
      toast({ tone: "success", title: "RFQ submitted to the seller" });
    });

  const messageSeller = () =>
    listing &&
    run("message", async () => {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId: listing.id,
          subject: `Enquiry for ${listing.title}`,
          body: `Hello, I want to discuss ${num(listing.quantity)} ${listing.unit} of ${listing.title}.`,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Unable to message seller.");
      toast({ tone: "success", title: "Message thread created" });
      router.push(`/messages/${payload.threadId}`);
    });

  const buyNow = () =>
    listing &&
    run("buy", async () => {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({ listingId: listing.id, quantity }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Checkout failed.");
      toast({
        tone: "success",
        title: `Order ${payload.order.orderNumber} created`,
        description: "Sandbox settlement — no funds moved.",
      });
    });

  const submitReview = () =>
    listing &&
    run("review", async () => {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId: listing.id,
          rating: reviewRating,
          title: reviewTitle,
          body: reviewBody,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Unable to publish review.");
      setIsReviewOpen(false);
      setReviewTitle("");
      setReviewBody("");
      toast({ tone: "success", title: "Review published" });
      const refreshed = await fetch(`/api/materials/${listing.id}`);
      if (refreshed.ok) setData(await refreshed.json());
    });

  if (isLoading) {
    return (
      <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-5">
          <Skeleton className="aspect-[4/3] w-full" />
          <Skeleton className="h-7 w-2/3" />
          <Skeleton className="h-4 w-1/3" />
        </div>
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  if (error || !listing) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-16 sm:px-6">
        <EmptyState
          icon={<Info />}
          title="This listing is unavailable"
          description={error ?? "It may have been sold, paused, or withdrawn by the seller."}
          action={
            <Button variant="primary" size="sm" onClick={() => router.push("/")}>
              Back to the catalogue
            </Button>
          }
        />
      </div>
    );
  }

  const price = money(listing.price);
  const place = [listing.city, listing.state].filter(Boolean).join(", ") || listing.location;
  const stats = data?.sellerStats;

  // Everything the API knows, for the overview overlay. Kept out of the page so
  // the buying decision is not buried under a specification table.
  const specs: Array<[string, string]> = [
    ["Category", listing.category],
    ["Grade / subtype", listing.subcategory || "—"],
    ["Base element", listing.baseElement || "—"],
    ["Toxicity", listing.toxicity || "none"],
    ["Available quantity", `${num(listing.quantity)} ${listing.unit}`],
    ["Minimum order", `${num(listing.minOrderQuantity)} ${listing.unit}`],
    ["Lead time", `${listing.leadTimeDays} days`],
    ["Packaging", listing.packaging || "—"],
    ["Payment terms", listing.paymentTerms || "—"],
    ["Location", place],
    ["Country", listing.country || "India"],
    ["Seller", listing.producer],
    ["Years active", num(listing.yearsActive)],
    ["Orders completed", num(listing.ordersCompleted)],
    ["Response rate", `${num(listing.responseRate)}%`],
    ["Source", listing.sourceName || "Seller submitted"],
  ];

  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6">
      {/* Breadcrumb: where this sits, and the way back. */}
      <nav aria-label="Breadcrumb" className="mb-5 flex flex-wrap items-center gap-1.5 text-[12.5px] text-ink-500">
        <Link href="/" className="rounded-sm font-medium hover:text-copper-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper-700">
          Marketplace
        </Link>
        <span aria-hidden="true">·</span>
        <Link href={`/?category=${encodeURIComponent(listing.category)}`} className="rounded-sm font-medium hover:text-copper-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper-700">
          {listing.category}
        </Link>
        <span aria-hidden="true">·</span>
        <span className="truncate text-ink-700">{listing.title}</span>
      </nav>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Left rail: the material itself. */}
        <div className="flex min-w-0 flex-col gap-6">
          <div className="overflow-hidden rounded-card border border-ink-200 bg-surface-card">
            <ListingImage
              src={listing.imageUrl}
              alt={listing.title}
              className="aspect-[4/3] w-full object-cover"
            />
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12px] font-medium uppercase tracking-wide text-ink-500">
                {listing.category}
              </span>
              {listing.verified ? (
                <Badge tone="brand" icon={<BadgeCheck />}>
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
                >
                  Unverified source
                </Badge>
              )}
            </div>

            <h1 className="mt-2 text-[26px] font-semibold leading-tight tracking-tight text-ink-900 sm:text-3xl">
              {listing.title}
            </h1>
            <p className="mt-1.5 text-sm text-ink-500">{listing.producer}</p>
          </div>

          {/* At a glance — hairlines, not another box. Four facts, no scroll. */}
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-ink-200 bg-ink-200 sm:grid-cols-4">
            <Glance label="Available" value={`${num(listing.quantity)} ${listing.unit}`} />
            <Glance label="Min order" value={`${num(listing.minOrderQuantity)} ${listing.unit}`} />
            <Glance label="Lead time" value={`${listing.leadTimeDays} days`} />
            <Glance label="Location" value={place} />
          </dl>

          {listing.description ? (
            <p className="prose-numerals max-w-2xl text-sm leading-relaxed text-ink-700">
              {listing.description}
            </p>
          ) : null}

          {/* The overview opens over the page rather than extending it. */}
          <div>
            <Button
              variant="secondary"
              leadingIcon={<LayoutList className="h-4 w-4" />}
              onClick={() => setIsSpecsOpen(true)}
              aria-haspopup="dialog"
            >
              Product overview
            </Button>
            <p className="mt-2 text-[13px] text-ink-500">
              Full specification, seller record, and provenance.
            </p>
          </div>

          {data?.reviews?.length ? (
            <section className="border-t border-ink-200 pt-6">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-[15px] font-semibold text-ink-900">
                  Reviews
                  {stats?.reviewAverage ? (
                    <span className="ml-2 font-normal text-ink-500">
                      {stats.reviewAverage.toFixed(1)} average · {stats.reviewCount}
                    </span>
                  ) : null}
                </h2>
                <Button variant="ghost" size="sm" onClick={() => setIsReviewOpen(true)}>
                  Write a review
                </Button>
              </div>
              <ul className="mt-4 flex flex-col gap-5">
                {data.reviews.map((review) => (
                  <li key={review.id} className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Stars rating={review.rating} />
                      <span className="text-[13px] font-medium text-ink-900">
                        {review.companyName}
                      </span>
                      {review.verifiedPurchase ? (
                        <Badge tone="success">Verified purchase</Badge>
                      ) : null}
                    </div>
                    {review.title ? (
                      <p className="mt-1.5 text-sm font-medium text-ink-900">{review.title}</p>
                    ) : null}
                    <p className="prose-numerals mt-1 text-[13px] leading-relaxed text-ink-600">
                      {review.body}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        {/* Right rail: the decision. The only panel on the page, and it stays
            in view — the buyer should never scroll to find the action. */}
        <div className="lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-card border border-ink-200 bg-surface-card p-5 shadow-card">
            <p
              className={cn(
                "font-semibold leading-none",
                price ? "text-3xl text-ink-900" : "text-xl text-ink-600",
              )}
            >
              {price ?? "Ask quote"}
            </p>
            <p className="mt-1.5 text-[13px] text-ink-500">
              {price ? `per ${listing.unit}` : "Seller has not published a price"}
            </p>

            <div className="mt-5">
              <Input
                label="Quantity"
                type="number"
                min={listing.minOrderQuantity || 1}
                value={quantity}
                suffix={listing.unit}
                onChange={(event) => setQuantity(Number(event.target.value) || 1)}
              />
            </div>

            <div className="mt-4 flex flex-col gap-2">
              {price ? (
                <Button variant="primary" fullWidth loading={pending === "buy"} onClick={buyNow}>
                  Buy now
                </Button>
              ) : null}
              <Button
                variant={price ? "secondary" : "primary"}
                fullWidth
                loading={pending === "quote"}
                onClick={requestQuote}
              >
                Request a quote
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="ghost"
                  leadingIcon={<ShoppingCart className="h-4 w-4" />}
                  loading={pending === "cart"}
                  onClick={addToCart}
                >
                  Cart
                </Button>
                <Button
                  variant="ghost"
                  leadingIcon={<MessageSquare className="h-4 w-4" />}
                  loading={pending === "message"}
                  onClick={messageSeller}
                >
                  Message
                </Button>
              </div>
              <Button
                variant="ghost"
                fullWidth
                aria-pressed={isSaved}
                leadingIcon={
                  <Heart className={cn("h-4 w-4", isSaved && "fill-copper-700 text-copper-700")} />
                }
                loading={pending === "save"}
                onClick={saveListing}
              >
                {isSaved ? "Saved" : "Save for later"}
              </Button>
            </div>

            <dl className="mt-5 flex flex-col gap-2 border-t border-ink-200 pt-4 text-[13px] text-ink-500">
              <Meta icon={MapPin} text={place} />
              <Meta icon={Package} text={`${num(listing.quantity)} ${listing.unit} available`} />
              <Meta icon={Truck} text={`Dispatch in ${listing.leadTimeDays} days`} />
            </dl>

            {stats ? (
              <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-ink-200 pt-4">
                <Glance flat label="Seller listings" value={num(stats.activeListings)} />
                <Glance flat label="Fulfilled" value={num(stats.fulfilledOrders)} />
              </dl>
            ) : null}
          </div>
        </div>
      </div>

      <Modal
        open={isSpecsOpen}
        onClose={() => setIsSpecsOpen(false)}
        title="Product overview"
        description={listing.title}
        size="lg"
      >
        <dl className="grid gap-x-8 gap-y-0 sm:grid-cols-2">
          {specs.map(([label, value]) => (
            <div
              key={label}
              className="flex items-baseline justify-between gap-4 border-b border-ink-200 py-2.5 last:border-0"
            >
              <dt className="shrink-0 text-[13px] text-ink-500">{label}</dt>
              <dd className="min-w-0 truncate text-right text-[13px] font-medium text-ink-900">
                {value}
              </dd>
            </div>
          ))}
        </dl>
        {listing.sourceUrl ? (
          <p className="mt-4 text-[13px] text-ink-500">
            Provenance:{" "}
            <a
              href={listing.sourceUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="font-medium text-copper-700 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper-700"
            >
              view the original listing
            </a>
          </p>
        ) : null}
      </Modal>

      <Modal
        open={isReviewOpen}
        onClose={() => setIsReviewOpen(false)}
        title="Write a review"
        description="Only buyers with a fulfilled order are marked as verified purchases."
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsReviewOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" loading={pending === "review"} onClick={submitReview}>
              Publish review
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Input
            label="Rating"
            type="number"
            min={1}
            max={5}
            value={reviewRating}
            onChange={(event) => setReviewRating(Number(event.target.value) || 5)}
          />
          <Input
            label="Title"
            value={reviewTitle}
            onChange={(event) => setReviewTitle(event.target.value)}
          />
          <Textarea
            label="Your review"
            value={reviewBody}
            onChange={(event) => setReviewBody(event.target.value)}
          />
        </div>
      </Modal>
    </div>
  );
}

function Glance({
  label,
  value,
  flat = false,
}: {
  label: string;
  value: string;
  flat?: boolean;
}) {
  return (
    <div className={cn("min-w-0", flat ? "" : "bg-surface-card px-4 py-3")}>
      <dt className="truncate text-[12px] uppercase tracking-wide text-ink-500">
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-sm font-semibold text-ink-900">{value}</dd>
    </div>
  );
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`${rating} out of 5`}>
      {Array.from({ length: 5 }).map((_, index) => (
        <Star
          key={index}
          aria-hidden="true"
          className={cn(
            "h-3.5 w-3.5",
            index < rating ? "fill-warning text-warning" : "text-ink-300",
          )}
        />
      ))}
    </span>
  );
}

function Meta({ icon: Icon, text }: { icon: typeof MapPin; text: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{text}</span>
    </div>
  );
}

export default ListingDetailPanel;
