"use client";

import { useEffect, useMemo, useState } from "react";
import type { ElementType } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  CreditCard,
  Factory,
  FileText,
  Gavel,
  Heart,
  Loader2,
  MapPin,
  MessageCircle,
  Package,
  ShieldCheck,
  ShoppingCart,
  Star,
  Truck,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import ListingImage from "@/components/ListingImage";

interface MaterialListing {
  id: string;
  materialId: string;
  title: string;
  name: string;
  toxicity: string;
  baseElement: string;
  materialDescription?: string;
  category: string;
  subcategory: string;
  producer: string;
  producerId: string;
  sellerUserId: string | null;
  sellerIndustry?: string;
  sellerLocation?: string;
  sellerCarbonRating?: string;
  sellerCapacity?: number;
  location: string;
  area: string;
  city: string;
  state: string;
  country: string;
  imageUrl: string;
  price: number | null;
  currency?: string;
  quantity: number | null;
  unit: string;
  minOrderQuantity: number;
  leadTimeDays: number;
  rating: number;
  responseRate: number;
  verified: boolean;
  tradeAssurance: boolean;
  yearsActive: number;
  ordersCompleted: number;
  description: string;
  packaging: string;
  paymentTerms: string;
  sourceType: string;
  sourceName: string | null;
  sourceUrl: string | null;
  externalId: string | null;
  rawQuantityText: string | null;
  rawLocationText: string | null;
  createdAt: string;
  updatedAt: string;
}

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
  listing: MaterialListing;
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

interface ToastState {
  type: "success" | "error";
  message: string;
}

function formatMoney(value: number | null, unit?: string) {
  if (value == null || value <= 0) return "Ask quote";
  const amount = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
  return unit ? `${amount} / ${unit}` : amount;
}

function displayQuantity(listing: MaterialListing) {
  if (listing.rawQuantityText) return listing.rawQuantityText;
  if (listing.quantity == null) return "Quantity on request";
  return `${listing.quantity.toLocaleString("en-IN")} ${listing.unit}`;
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<ProductResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [isSaved, setIsSaved] = useState(false);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewTitle, setReviewTitle] = useState("");
  const [reviewBody, setReviewBody] = useState("");
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  useEffect(() => {
    async function loadProduct() {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/materials/${params.id}`);
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error || "Unable to load listing.");
        setData(payload);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load listing.");
      } finally {
        setIsLoading(false);
      }
    }
    loadProduct();
  }, [params.id]);

  useEffect(() => {
    async function loadSaved() {
      try {
        const res = await fetch("/api/wishlist");
        if (!res.ok) return;
        const payload = await res.json();
        setIsSaved(Boolean(payload.items?.some((item: any) => item.listingId === params.id)));
      } catch {
        // Saved state is non-blocking.
      }
    }
    loadSaved();
  }, [params.id]);

  const listing = data?.listing;
  const reviewAverage = useMemo(() => {
    if (!data || data.reviews.length === 0) return listing?.rating ?? 0;
    return data.reviews.reduce((sum, review) => sum + review.rating, 0) / data.reviews.length;
  }, [data, listing?.rating]);

  const showToast = (next: ToastState) => {
    setToast(next);
    window.setTimeout(() => setToast(null), 4000);
  };

  const runAction = async (key: string, action: () => Promise<void>) => {
    setPendingAction(key);
    try {
      await action();
    } catch (err) {
      showToast({
        type: "error",
        message: err instanceof Error ? err.message : "Something went wrong.",
      });
    } finally {
      setPendingAction(null);
    }
  };

  const saveListing = () => {
    if (!listing) return;
    runAction("save", async () => {
      const res = await fetch(`/api/wishlist${isSaved ? `?listingId=${listing.id}` : ""}`, {
        method: isSaved ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: isSaved ? undefined : JSON.stringify({ listingId: listing.id }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Unable to update saved products.");
      setIsSaved(!isSaved);
      showToast({ type: "success", message: isSaved ? "Removed from saved products." : "Saved for later." });
    });
  };

  const addToCart = () => {
    if (!listing) return;
    runAction("cart", async () => {
      const res = await fetch("/api/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId: listing.id, quantity }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Unable to add item to cart.");
      showToast({ type: "success", message: "Added to cart." });
    });
  };

  const requestQuote = () => {
    if (!listing) return;
    runAction("quote", async () => {
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
      showToast({ type: "success", message: "RFQ submitted to the seller workspace." });
    });
  };

  const messageSeller = () => {
    if (!listing) return;
    runAction("message", async () => {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId: listing.id,
          subject: `Enquiry for ${listing.title}`,
          body: `Hello, I want to discuss ${displayQuantity(listing)} of ${listing.title}.`,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Unable to message seller.");
      showToast({ type: "success", message: "Message thread created." });
      router.push(`/messages/${payload.threadId}`);
    });
  };

  const buyNow = () => {
    if (!listing) return;
    runAction("buy", async () => {
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
      showToast({ type: "success", message: `Order ${payload.order.orderNumber} created.` });
    });
  };

  const submitReview = () => {
    if (!listing) return;
    runAction("review", async () => {
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
      showToast({ type: "success", message: "Review published." });
      const refreshed = await fetch(`/api/materials/${listing.id}`);
      if (refreshed.ok) setData(await refreshed.json());
    });
  };

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-stone-100 text-stone-950">
        <div className="flex items-center gap-3 rounded-md bg-white px-5 py-4 shadow-sm">
          <Loader2 size={18} className="animate-spin text-orange-500" />
          <span className="text-sm font-semibold">Loading product details</span>
        </div>
      </main>
    );
  }

  if (error || !listing || !data) {
    return (
      <main className="min-h-screen bg-stone-100 px-4 py-10 text-stone-950">
        <div className="mx-auto max-w-3xl rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold">Listing unavailable</h1>
          <p className="mt-2 text-sm text-stone-600">{error || "This listing could not be found."}</p>
          <button
            onClick={() => router.push("/")}
            className="mt-5 inline-flex items-center gap-2 rounded-md bg-stone-950 px-4 py-2 text-sm font-semibold text-white"
          >
            <ArrowLeft size={16} />
            Back to marketplace
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-stone-100 text-stone-950">
      <div className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-stone-700 hover:text-orange-600">
            <ArrowLeft size={16} />
            Marketplace
          </Link>
          <div className="hidden items-center gap-5 text-sm font-medium text-stone-600 md:flex">
            <Link href="/account" className="hover:text-orange-600">Buyer account</Link>
            <Link href="/seller" className="hover:text-orange-600">Seller dashboard</Link>
          </div>
        </div>
      </div>

      {toast && (
        <div
          className={cn(
            "fixed right-4 top-4 z-50 max-w-sm rounded-md px-4 py-3 text-sm font-semibold shadow-lg",
            toast.type === "success" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
          )}
        >
          {toast.message}
        </div>
      )}

      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6">
        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-stone-500">
          <Link href="/" className="hover:text-orange-600">Home</Link>
          <span>/</span>
          <span>{listing.category}</span>
          <span>/</span>
          <span className="text-stone-800">{listing.subcategory || listing.name}</span>
        </div>

        <section className="grid gap-5 lg:grid-cols-[420px_minmax(0,1fr)_320px]">
          <div className="space-y-3">
            <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
              <ListingImage src={listing.imageUrl} alt={listing.title} className="aspect-square w-full object-cover" />
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[listing.imageUrl, listing.imageUrl, listing.imageUrl, listing.imageUrl].map((src, index) => (
                <button
                  key={`${src}-${index}`}
                  className="overflow-hidden rounded-md border border-stone-200 bg-white p-1 hover:border-orange-400"
                  title={`Image ${index + 1}`}
                >
                  <ListingImage src={src} alt="" className="aspect-square w-full rounded-sm object-cover" />
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap gap-2">
              <span className="rounded-sm bg-sky-50 px-2 py-1 text-xs font-bold text-sky-700">
                {listing.sourceName || "Seller source"}
              </span>
              {listing.verified && (
                <span className="inline-flex items-center gap-1 rounded-sm bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">
                  <ShieldCheck size={13} />
                  Verified
                </span>
              )}
              {listing.tradeAssurance && (
                <span className="inline-flex items-center gap-1 rounded-sm bg-orange-50 px-2 py-1 text-xs font-bold text-orange-700">
                  <CheckCircle2 size={13} />
                  Order protection
                </span>
              )}
            </div>

            <h1 className="mt-3 text-2xl font-semibold leading-tight text-stone-950 md:text-3xl">
              {listing.title}
            </h1>
            <p className="mt-2 text-sm text-stone-600">
              {listing.category} · {listing.subcategory || listing.baseElement} · Product ID {listing.id.slice(0, 8).toUpperCase()}
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-4 border-y border-stone-100 py-3 text-sm">
              <span className="inline-flex items-center gap-1 font-semibold text-amber-600">
                <Star size={16} className="fill-amber-400 text-amber-400" />
                {reviewAverage.toFixed(1)}
              </span>
              <span className="text-stone-500">{data.sellerStats.reviewCount} reviews</span>
              <span className="text-stone-500">{listing.ordersCompleted + data.sellerStats.fulfilledOrders} orders referenced</span>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <InfoPanel label="Price" value={formatMoney(listing.price, listing.unit)} />
              <InfoPanel label="Available quantity" value={displayQuantity(listing)} />
              <InfoPanel label="MOQ" value={`${listing.minOrderQuantity.toLocaleString("en-IN")} ${listing.unit}`} />
              <InfoPanel label="Lead time" value={`${listing.leadTimeDays} days`} />
            </div>

            <div className="mt-5 rounded-lg border border-stone-200 p-4">
              <h2 className="text-base font-semibold">Product overview</h2>
              <p className="mt-2 text-sm leading-6 text-stone-600">{listing.description}</p>
              {listing.materialDescription && (
                <p className="mt-3 text-sm leading-6 text-stone-600">{listing.materialDescription}</p>
              )}
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <SpecRow label="Material" value={listing.name} />
              <SpecRow label="Base element" value={listing.baseElement} />
              <SpecRow label="Toxicity level" value={listing.toxicity} />
              <SpecRow label="Packaging" value={listing.packaging} />
              <SpecRow label="Payment terms" value={listing.paymentTerms} />
              <SpecRow label="Source location" value={listing.rawLocationText || `${listing.area}, ${listing.city}, ${listing.state}`} />
            </div>
          </div>

          <aside className="space-y-4">
            <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
              <p className="text-sm text-stone-500">Delivered from</p>
              <div className="mt-1 flex items-start gap-2 text-sm font-semibold">
                <MapPin size={16} className="mt-0.5 text-orange-600" />
                <span>{listing.area}, {listing.city}, {listing.state}</span>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <label className="text-sm font-semibold text-stone-700" htmlFor="quantity">Qty</label>
                <input
                  id="quantity"
                  type="number"
                  min={1}
                  max={listing.quantity || undefined}
                  value={quantity}
                  onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))}
                  className="w-24 rounded-md border border-stone-300 px-3 py-2 text-sm outline-none focus:border-orange-500"
                />
              </div>

              <div className="mt-4 grid gap-2">
                <ActionButton active={pendingAction === "quote"} onClick={requestQuote} icon={Gavel} label="Request quotation" primary />
                <ActionButton active={pendingAction === "cart"} onClick={addToCart} icon={ShoppingCart} label="Add to cart" />
                <ActionButton active={pendingAction === "buy"} onClick={buyNow} icon={CreditCard} label="Buy now" dark />
                <div className="grid grid-cols-2 gap-2">
                  <ActionButton active={pendingAction === "save"} onClick={saveListing} icon={Heart} label={isSaved ? "Saved" : "Save"} compact />
                  <ActionButton active={pendingAction === "message"} onClick={messageSeller} icon={MessageCircle} label="Message" compact />
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold">{listing.producer}</h2>
                  <p className="mt-1 text-sm text-stone-500">{listing.sellerIndustry || "Marketplace seller"}</p>
                </div>
                <Factory size={20} className="text-stone-400" />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <InfoPanel label="Active listings" value={String(data.sellerStats.activeListings)} tight />
                <InfoPanel label="Years active" value={`${listing.yearsActive}`} tight />
                <InfoPanel label="Response" value={`${listing.responseRate}%`} tight />
                <InfoPanel label="Capacity" value={listing.sellerCapacity ? listing.sellerCapacity.toLocaleString("en-IN") : "Source dependent"} tight />
              </div>
              {listing.sourceUrl && (
                <a
                  href={listing.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 flex items-center justify-center gap-2 rounded-md border border-stone-300 px-3 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50"
                >
                  <ArrowUpRight size={15} />
                  Original source
                </a>
              )}
            </div>

            <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
              <h2 className="text-base font-semibold">Trade protections</h2>
              <div className="mt-3 space-y-3 text-sm text-stone-600">
                <IconLine icon={ShieldCheck} text="Seller and source trace visible before purchase" />
                <IconLine icon={Truck} text="Lead time and dispatch estimate shown from listing data" />
                <IconLine icon={FileText} text="GST invoice and purchase order supported at checkout" />
              </div>
            </div>
          </aside>
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-lg font-semibold">Reviews and buyer feedback</h2>
              <button
                onClick={() => setIsReviewOpen(true)}
                className="rounded-md bg-stone-950 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-800"
              >
                Write review
              </button>
            </div>
            {data.reviews.length === 0 ? (
              <div className="mt-5 rounded-md border border-dashed border-stone-300 p-6 text-sm text-stone-500">
                No published buyer reviews yet for this listing.
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                {data.reviews.map((review) => (
                  <article key={review.id} className="border-b border-stone-100 pb-4 last:border-0 last:pb-0">
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      <span className="font-semibold">{review.companyName}</span>
                      <span className="inline-flex items-center gap-1 text-amber-600">
                        <Star size={14} className="fill-amber-400 text-amber-400" />
                        {review.rating}
                      </span>
                      {review.verifiedPurchase && (
                        <span className="rounded-sm bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                          Verified purchase
                        </span>
                      )}
                      <span className="text-xs text-stone-400">{dateLabel(review.createdAt)}</span>
                    </div>
                    {review.title && <h3 className="mt-2 text-sm font-semibold">{review.title}</h3>}
                    <p className="mt-1 text-sm leading-6 text-stone-600">{review.body}</p>
                  </article>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Documents and policies</h2>
            <div className="mt-4 space-y-3 text-sm">
              <Policy label="Shipping" value={`${listing.leadTimeDays} day source lead time before final logistics confirmation.`} />
              <Policy label="Payment" value={listing.paymentTerms} />
              <Policy label="Returns" value="Handled through seller confirmation and order dispute workflow." />
              <Policy label="Compliance" value={`Material toxicity: ${listing.toxicity}. Verify certificates during RFQ.`} />
            </div>
          </div>
        </section>

        <ListingRail title="More from this seller" listings={data.sameSeller} />
        <ListingRail title={`Related ${listing.category} listings`} listings={data.related} />
      </div>

      {isReviewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-lg bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-200 p-5">
              <h2 className="text-lg font-semibold">Write a review</h2>
              <button onClick={() => setIsReviewOpen(false)} className="rounded-md p-1 text-stone-500 hover:bg-stone-100">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-4 p-5">
              <label className="block">
                <span className="text-sm font-semibold text-stone-700">Rating</span>
                <select
                  value={reviewRating}
                  onChange={(event) => setReviewRating(Number(event.target.value))}
                  className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm outline-none focus:border-orange-500"
                >
                  {[5, 4, 3, 2, 1].map((rating) => (
                    <option key={rating} value={rating}>{rating} stars</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-stone-700">Title</span>
                <input
                  value={reviewTitle}
                  onChange={(event) => setReviewTitle(event.target.value)}
                  className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm outline-none focus:border-orange-500"
                  placeholder="Short review title"
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-stone-700">Review</span>
                <textarea
                  value={reviewBody}
                  onChange={(event) => setReviewBody(event.target.value)}
                  rows={5}
                  className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm outline-none focus:border-orange-500"
                  placeholder="Share product quality, dispatch, packaging, and seller experience."
                />
              </label>
              <button
                onClick={submitReview}
                disabled={pendingAction === "review"}
                className="flex w-full items-center justify-center gap-2 rounded-md bg-orange-500 px-4 py-3 text-sm font-bold text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pendingAction === "review" && <Loader2 size={16} className="animate-spin" />}
                Publish review
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function InfoPanel({ label, value, tight = false }: { label: string; value: string; tight?: boolean }) {
  return (
    <div className={cn("rounded-md border border-stone-200 bg-stone-50", tight ? "p-2" : "p-3")}>
      <p className="text-xs text-stone-500">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-stone-950">{value}</p>
    </div>
  );
}

function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-md border border-stone-200 px-3 py-2 text-sm">
      <span className="text-stone-500">{label}</span>
      <span className="max-w-[62%] text-right font-semibold text-stone-900">{value}</span>
    </div>
  );
}

function IconLine({ icon: Icon, text }: { icon: ElementType; text: string }) {
  return (
    <div className="flex items-start gap-2">
      <Icon size={16} className="mt-0.5 shrink-0 text-orange-600" />
      <span>{text}</span>
    </div>
  );
}

function ActionButton({
  active,
  onClick,
  icon: Icon,
  label,
  primary = false,
  dark = false,
  compact = false,
}: {
  active: boolean;
  onClick: () => void;
  icon: ElementType;
  label: string;
  primary?: boolean;
  dark?: boolean;
  compact?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={active}
      className={cn(
        "flex items-center justify-center gap-2 rounded-md px-3 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60",
        compact ? "py-2.5" : "py-3",
        primary && "bg-orange-500 text-white hover:bg-orange-600",
        dark && "bg-stone-950 text-white hover:bg-stone-800",
        !primary && !dark && "border border-stone-300 text-stone-700 hover:bg-stone-50"
      )}
    >
      {active ? <Loader2 size={16} className="animate-spin" /> : <Icon size={16} />}
      {label}
    </button>
  );
}

function Policy({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-stone-200 p-3">
      <p className="font-semibold text-stone-900">{label}</p>
      <p className="mt-1 leading-6 text-stone-600">{value}</p>
    </div>
  );
}

function ListingRail({ title, listings }: { title: string; listings: MaterialListing[] }) {
  if (listings.length === 0) return null;

  return (
    <section className="mt-5 rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {listings.map((listing) => (
          <Link
            key={listing.id}
            href={`/products/${listing.id}`}
            className="group overflow-hidden rounded-lg border border-stone-200 bg-white hover:border-orange-300 hover:shadow-sm"
          >
            <ListingImage src={listing.imageUrl} alt={listing.title} className="aspect-[4/3] w-full object-cover" loading="lazy" />
            <div className="p-3">
              <h3 className="line-clamp-2 text-sm font-semibold text-stone-950 group-hover:text-orange-600">
                {listing.title}
              </h3>
              <p className="mt-2 text-sm font-bold">{formatMoney(listing.price, listing.unit)}</p>
              <p className="mt-1 flex items-center gap-1 text-xs text-stone-500">
                <Package size={13} />
                {displayQuantity(listing)}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
