"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  MapPin,
  Plus,
  ShieldCheck,
  Truck,
} from "lucide-react";
import { MarketplaceNav } from "@/components/marketplace/MarketplaceNav";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import ListingImage from "@/components/ListingImage";
import { cn } from "@/lib/cn";

interface Address {
  id: string;
  label: string;
  contactName: string;
  phone: string;
  street: string;
  city: string;
  state: string;
  pincode: string;
  latitude: number | null;
  longitude: number | null;
  verificationStatus: string;
  isDefaultShipping: boolean;
}

interface Preview {
  listing: {
    id: string;
    title: string;
    unit: string;
    pricePerUnit: number;
    quantityAvailable: number;
    minOrderQuantity: number;
    leadTimeDays: number;
    city: string;
    state: string;
    imageUrl: string;
    verified: boolean;
    deliveryTerm: string | null;
    seller: { name: string };
  };
  quantity: number;
  fees: {
    subtotal: number;
    buyerFeeAmount: number;
    shippingAmount: number;
    taxAmount: number;
    totalAmount: number;
    taxNote: string;
  } | null;
  blockers: string[];
}

interface FreightDecision {
  quote: {
    id: string;
    amount: number;
    source: "BUYER_ARRANGED" | "INCLUDED_IN_PRICE" | "SANDBOX_ESTIMATOR";
    distanceKm: number | null;
    expiresAt: string;
  };
  fees: NonNullable<Preview["fees"]>;
  delivery: {
    term: string;
    shortLabel: string;
    responsibility: string;
    freightDisposition: string;
  };
  sandbox: boolean;
}

const money = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);

const num = (value: number) => new Intl.NumberFormat("en-IN").format(value);

/**
 * Checkout: address, review, then commit.
 *
 * "Buy now" used to POST straight to /api/checkout, so a buyer either hit
 * "add a shipping address" with nowhere to add one, or committed to an order
 * without ever seeing the total, the fee, or where it was going. Money should
 * never move from a single click with nothing shown.
 */
function CheckoutContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useToast();

  const listingId = params.get("listingId") ?? "";
  // Seeded from the link, then owned here. Checkout is the review step, so the
  // quantity has to be adjustable at the point the total is shown — arriving
  // from a card should not lock a buyer to the minimum order.
  const initialQuantity = Number(params.get("quantity") ?? 0);
  const [quantityInput, setQuantityInput] = useState(
    initialQuantity > 0 ? String(initialQuantity) : "1",
  );
  const quantity = Number(quantityInput);

  const [preview, setPreview] = useState<Preview | null>(null);
  const [addresses, setAddresses] = useState<Address[] | null>(null);
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [pricing, setPricing] = useState(false);
  const [addingAddress, setAddingAddress] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [freight, setFreight] = useState<FreightDecision | null>(null);
  const [freightError, setFreightError] = useState<string | null>(null);
  const [quotingFreight, setQuotingFreight] = useState(false);
  const [draft, setDraft] = useState({
    contactName: "",
    phone: "",
    street: "",
    pincode: "",
    label: "Warehouse",
  });

  const loadAddresses = useCallback(async () => {
    const res = await fetch("/api/addresses", { cache: "no-store" });
    if (!res.ok) return;
    const payload = await res.json();
    const list: Address[] = payload.addresses ?? [];
    setAddresses(list);
    setSelectedAddress(
      (current) =>
        current ?? list.find((a) => a.isDefaultShipping)?.id ?? list[0]?.id ?? null,
    );
  }, []);

  useEffect(() => {
    loadAddresses();
  }, [loadAddresses]);

  useEffect(() => {
    if (!listingId) {
      setLoading(false);
      return;
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      setPricing(false);
      return;
    }
    let cancelled = false;
    // Debounced: the server prices this, and a request per keystroke would both
    // waste calls and let an older total land after a newer one.
    const timer = setTimeout(async () => {
      setPricing(true);
      try {
        const res = await fetch(
          `/api/checkout/preview?listingId=${encodeURIComponent(listingId)}&quantity=${quantity}`,
          { cache: "no-store" },
        );
        if (cancelled) return;
        if (res.ok) setPreview(await res.json());
      } finally {
        if (!cancelled) {
          setLoading(false);
          setPricing(false);
        }
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [listingId, quantity]);

  useEffect(() => {
    if (
      !preview ||
      preview.blockers.length > 0 ||
      !selectedAddress ||
      preview.quantity !== quantity
    ) {
      setFreight(null);
      return;
    }
    let cancelled = false;
    setFreight(null);
    setFreightError(null);
    setQuotingFreight(true);
    const timer = setTimeout(async () => {
      try {
        const response = await fetch("/api/freight/quotes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            listingId,
            shippingAddressId: selectedAddress,
            quantity,
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "Freight could not be quoted.");
        if (!cancelled) setFreight(payload as FreightDecision);
      } catch (error) {
        if (!cancelled) {
          setFreightError(
            error instanceof Error ? error.message : "Freight could not be quoted.",
          );
        }
      } finally {
        if (!cancelled) setQuotingFreight(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [listingId, preview, quantity, selectedAddress]);

  async function saveAddress(event: React.FormEvent) {
    event.preventDefault();
    setSavingAddress(true);
    setAddressError(null);
    try {
      const res = await fetch("/api/addresses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, isDefaultShipping: !addresses?.length }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Could not save the address.");
      await loadAddresses();
      setSelectedAddress(payload.address?.id ?? null);
      setAddingAddress(false);
      setDraft({ contactName: "", phone: "", street: "", pincode: "", label: "Warehouse" });
    } catch (err) {
      setAddressError(err instanceof Error ? err.message : "Could not save the address.");
    } finally {
      setSavingAddress(false);
    }
  }

  async function placeOrder() {
    if (!preview?.fees) return;
    setPlacing(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // One key per attempt, so a retry after a timeout cannot double-charge.
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          listingId,
          quantity,
          shippingAddressId: selectedAddress,
          freightQuoteIds: freight ? [freight.quote.id] : [],
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Checkout failed.");
      toast({
        tone: "success",
        title: `Order ${payload.order.orderNumber} placed`,
        description: "Sandbox settlement — no funds moved.",
      });
      router.push("/account");
    } catch (err) {
      toast({
        tone: "danger",
        title: "Checkout did not complete",
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setPlacing(false);
    }
  }

  if (!listingId) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-16 sm:px-6">
        <EmptyState
          icon={<Info />}
          title="Nothing to check out"
          description="Choose a listing and a quantity from the catalogue first."
          action={
            <Button variant="primary" size="sm" onClick={() => router.push("/")}>
              Browse the catalogue
            </Button>
          }
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto grid w-full max-w-[1100px] gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (!preview) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-16 sm:px-6">
        <EmptyState
          icon={<AlertTriangle />}
          title="This listing cannot be purchased"
          description="It may have sold, been paused, or been withdrawn since you opened it."
          action={
            <Button variant="primary" size="sm" onClick={() => router.push("/")}>
              Back to the catalogue
            </Button>
          }
        />
      </div>
    );
  }

  const { listing, blockers } = preview;
  const fees = freight?.fees ?? preview.fees;
  const address = addresses?.find((a) => a.id === selectedAddress) ?? null;
  const ready =
    Boolean(fees) &&
    Boolean(freight) &&
    blockers.length === 0 &&
    Boolean(address) &&
    // The quote on screen must match the quantity being submitted.
    preview.quantity === quantity;

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-8 sm:px-6">
      <nav aria-label="Breadcrumb" className="mb-5 flex flex-wrap items-center gap-1.5 text-[12.5px] text-ink-500">
        <Link href="/" className="rounded-sm font-medium hover:text-copper-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper-700">
          Marketplace
        </Link>
        <span aria-hidden="true">·</span>
        <Link href={`/products/${listing.id}`} className="max-w-[280px] truncate rounded-sm font-medium hover:text-copper-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper-700">
          {listing.title}
        </Link>
        <span aria-hidden="true">·</span>
        <span className="text-ink-700">Checkout</span>
      </nav>

      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Checkout</h1>

      {blockers.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-2">
          {blockers.map((blocker) => (
            <li
              key={blocker}
              role="alert"
              className="flex items-start gap-2 rounded-control border border-danger-border bg-danger-subtle px-3 py-2.5 text-[13px] text-danger-strong"
            >
              <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
              {blocker}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-6">
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-[13px] font-bold uppercase tracking-wide text-ink-900">
              <MapPin aria-hidden="true" className="h-3.5 w-3.5" /> Deliver to
            </h2>

            {addresses === null ? (
              <Skeleton className="h-24 w-full" />
            ) : addresses.length === 0 && !addingAddress ? (
              <div className="rounded-card border border-dashed border-ink-300 bg-surface-sunken/50 p-5 text-center">
                <p className="text-[13px] text-ink-600">
                  No delivery address yet. Checkout needs one before an order can be placed.
                </p>
                <Button
                  variant="primary"
                  size="sm"
                  className="mt-3"
                  leadingIcon={<Plus className="h-4 w-4" />}
                  onClick={() => setAddingAddress(true)}
                >
                  Add an address
                </Button>
              </div>
            ) : (
              <ul className="flex flex-col gap-2">
                {addresses.map((item) => (
                  <li key={item.id}>
                    <label
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-card border p-4 transition-colors",
                        "focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-copper-700",
                        selectedAddress === item.id
                          ? "border-copper-700 bg-copper-50/40"
                          : "border-ink-200 bg-surface-card hover:border-ink-300",
                      )}
                    >
                      <input
                        type="radio"
                        name="address"
                        checked={selectedAddress === item.id}
                        onChange={() => setSelectedAddress(item.id)}
                        className="mt-1 h-3.5 w-3.5 shrink-0 accent-copper-700"
                      />
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-ink-900">
                            {item.contactName}
                          </span>
                          <Badge tone="neutral">{item.label}</Badge>
                          {item.isDefaultShipping ? (
                            <Badge tone="brand">Default</Badge>
                          ) : null}
                        </span>
                        <span className="mt-0.5 block text-[13px] text-ink-600">
                          {item.street}, {item.city}, {item.state} {item.pincode}
                        </span>
                        <span className="mt-0.5 block text-[12px] text-ink-500">
                          {item.phone} · {item.verificationStatus === "GPS_VERIFIED" ? "GPS verified" : item.latitude !== null && item.longitude !== null ? "Location validated" : "Distance unavailable"}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
                {!addingAddress ? (
                  <li>
                    <Button
                      variant="ghost"
                      size="sm"
                      leadingIcon={<Plus className="h-4 w-4" />}
                      onClick={() => setAddingAddress(true)}
                    >
                      Add another address
                    </Button>
                  </li>
                ) : null}
              </ul>
            )}

            {addingAddress ? (
              <form
                onSubmit={saveAddress}
                className="mt-3 grid gap-3 rounded-card border border-ink-200 bg-surface-card p-4 sm:grid-cols-2"
              >
                {addressError ? (
                  <p role="alert" className="sm:col-span-2 rounded-control border border-danger-border bg-danger-subtle px-3 py-2 text-[13px] text-danger-strong">
                    {addressError}
                  </p>
                ) : null}
                <Input
                  label="Contact name"
                  required
                  value={draft.contactName}
                  onChange={(e) => setDraft({ ...draft, contactName: e.target.value })}
                />
                <Input
                  label="Phone"
                  required
                  inputMode="numeric"
                  value={draft.phone}
                  onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                />
                <Input
                  label="Street"
                  required
                  containerClassName="sm:col-span-2"
                  value={draft.street}
                  onChange={(e) => setDraft({ ...draft, street: e.target.value })}
                />
                <Input
                  label="Pincode"
                  required
                  inputMode="numeric"
                  hint="City and state are derived from this."
                  value={draft.pincode}
                  onChange={(e) => setDraft({ ...draft, pincode: e.target.value })}
                />
                <Input
                  label="Label"
                  value={draft.label}
                  onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                />
                <div className="flex gap-2 sm:col-span-2">
                  <Button type="submit" variant="primary" size="sm" loading={savingAddress}>
                    Save address
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setAddingAddress(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            ) : null}
          </section>

          <section>
            <h2 className="mb-3 text-[13px] font-bold uppercase tracking-wide text-ink-900">
              Order
            </h2>
            <div className="flex gap-4 rounded-card border border-ink-200 bg-surface-card p-4">
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-control border border-ink-200">
                <ListingImage
                  src={listing.imageUrl}
                  alt={listing.title}
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink-900">{listing.title}</p>
                <p className="mt-0.5 truncate text-[13px] text-ink-500">
                  {listing.seller.name} · {listing.city}, {listing.state}
                </p>
                <p className="mt-1.5 text-[13px] text-ink-700">
                  {money(listing.pricePerUnit)} per {listing.unit}
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-[12px] text-ink-500">
                  <Truck aria-hidden="true" className="h-3.5 w-3.5" />
                  Dispatch in {listing.leadTimeDays} days
                </p>
                <p className="mt-1 text-[12px] text-ink-500">
                  {freight?.delivery.shortLabel || "Calculating delivery terms…"}
                </p>
              </div>
            </div>

            {/* Adjustable here, where the total is. Arriving from a card should
                not commit a buyer to the minimum order. */}
            <div className="mt-3 max-w-[220px]">
              <Input
                label="Quantity"
                type="number"
                inputMode="numeric"
                min={listing.minOrderQuantity}
                max={listing.quantityAvailable}
                value={quantityInput}
                suffix={listing.unit}
                onChange={(event) => setQuantityInput(event.target.value)}
                hint={
                  blockers.length
                    ? undefined
                    : `MOQ ${num(listing.minOrderQuantity)} · ${num(listing.quantityAvailable)} available`
                }
              />
            </div>
          </section>
        </div>

        {/* Totals stay in view: nothing about the amount should require scrolling. */}
        <div className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-card border border-ink-200 bg-surface-card p-5 shadow-card">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-ink-900">Summary</h2>
              {pricing ? (
                <span className="text-[12px] text-ink-500">Updating…</span>
              ) : null}
            </div>

            {fees ? (
              <>
                <dl className="mt-4 flex flex-col gap-2 text-[13px]">
                  <Row label="Subtotal" value={money(fees.subtotal)} />
                  <Row label="Buyer fee (1%)" value={money(fees.buyerFeeAmount)} />
                  <Row
                    label="Freight"
                    value={
                      quotingFreight
                        ? "Quoting…"
                        : freight?.quote.source === "BUYER_ARRANGED"
                          ? "Buyer arranged"
                          : freight?.quote.source === "INCLUDED_IN_PRICE"
                            ? "Included"
                            : freight
                              ? money(fees.shippingAmount)
                              : "Quote required"
                    }
                  />
                  <Row label="Tax" value={fees.taxAmount ? money(fees.taxAmount) : "Not calculated"} />
                  <div className="mt-1 flex items-baseline justify-between border-t border-ink-200 pt-3">
                    <dt className="text-sm font-semibold text-ink-900">Total</dt>
                    <dd className="text-xl font-semibold text-ink-900">
                      {money(fees.totalAmount)}
                    </dd>
                  </div>
                </dl>

                <Button
                  variant="primary"
                  size="lg"
                  fullWidth
                  className="mt-5"
                  loading={placing}
                  disabled={!ready || pricing}
                  onClick={placeOrder}
                >
                  Place order
                </Button>

                {!address ? (
                  <p className="mt-2 text-center text-[12px] text-ink-500">
                    Choose a delivery address to continue.
                  </p>
                ) : null}

                {freight ? (
                  <p className="mt-3 rounded-control bg-surface-sunken px-3 py-2 text-[12px] leading-relaxed text-ink-600">
                    <span className="font-semibold text-ink-900">{freight.delivery.shortLabel}.</span>{" "}
                    {freight.delivery.responsibility}
                    {typeof freight.quote.distanceKm === "number"
                      ? ` Estimated road distance: ${freight.quote.distanceKm.toLocaleString("en-IN")} km.`
                      : ""}
                  </p>
                ) : null}
                {freightError ? (
                  <p role="alert" className="mt-3 text-[12px] text-danger-strong">
                    {freightError}
                  </p>
                ) : null}

                {/* The sandbox boundary, stated where the money would move. */}
                <p className="mt-4 flex items-start gap-2 border-t border-ink-200 pt-4 text-[12px] leading-relaxed text-ink-500">
                  <ShieldCheck aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" />
                  Sandbox settlement. No real funds move and this order is not
                  escrow-backed. {fees.taxNote}
                </p>
              </>
            ) : (
              <p className="mt-4 flex items-start gap-2 text-[13px] text-ink-600">
                <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                A total cannot be quoted until the issues above are resolved.
              </p>
            )}
          </div>

          {listing.verified ? (
            <p className="mt-3 flex items-center gap-1.5 text-[12px] text-ink-500">
              <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5 text-brand" />
              Seller verification complete.
            </p>
          ) : (
            <p className="mt-3 flex items-start gap-1.5 text-[12px] text-ink-500">
              <Info aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              This seller has not completed verification.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-ink-500">{label}</dt>
      <dd className="text-ink-900">{value}</dd>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <div className="min-h-screen bg-surface-page text-ink-900">
      <MarketplaceNav />
      <main>
        <Suspense
          fallback={
            <div className="mx-auto w-full max-w-[1100px] px-4 py-8 sm:px-6">
              <Skeleton className="h-64 w-full" />
            </div>
          }
        >
          <CheckoutContent />
        </Suspense>
      </main>
    </div>
  );
}
