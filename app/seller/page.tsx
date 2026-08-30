"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MarketplaceNav } from "@/components/marketplace/MarketplaceNav";
import { useToast } from "@/components/ui/Toast";
import { CounterOfferDialog } from "@/components/marketplace/CounterOfferDialog";
import Link from "next/link";
import {
  BadgeCheck,
  BarChart2,
  Box,
  Building2,
  ChevronRight,
  ClipboardCheck,
  Factory,
  Gavel,
  Loader2,
  MessageCircle,
  Package,
  RefreshCw,
  Star,
} from "lucide-react";
import { cn } from "@/lib/cn";

type Tab =
  | "Overview"
  | "Listings"
  | "Orders"
  | "Bids"
  | "Onboarding"
  | "Reviews"
  | "Messages";

interface MetricItem {
  label: string;
  value: string | number;
  detail: string;
  icon: React.ElementType;
}

interface SellerData {
  user: { companyName: string; email: string; role: string };
  stats: Record<string, number>;
  listings: Array<any>;
  bids: Array<any>;
  onboarding: any;
  orderItems: Array<any>;
  reviews: Array<any>;
  threads: Array<any>;
}

const tabs: Array<{ label: Tab; icon: React.ElementType }> = [
  { label: "Overview", icon: BarChart2 },
  { label: "Listings", icon: Package },
  { label: "Orders", icon: Box },
  { label: "Bids", icon: Gavel },
  { label: "Onboarding", icon: ClipboardCheck },
  { label: "Reviews", icon: Star },
  { label: "Messages", icon: MessageCircle },
];

function money(value = 0) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function SellerPage() {
  const [data, setData] = useState<SellerData | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/seller/dashboard", { cache: "no-store" });
      const payload = await res.json();
      if (!res.ok)
        throw new Error(payload.error ?? "Unable to load seller dashboard.");
      setData(payload);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to load seller dashboard.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const cards = useMemo<MetricItem[]>(
    () => [
      {
        label: "Active listings",
        value: data?.stats.activeListings ?? 0,
        detail: "Live supply records",
        icon: Package,
      },
      {
        label: "Incoming bids",
        value: data?.stats.pendingBids ?? 0,
        detail: "Pending buyer quotes",
        icon: Gavel,
      },
      {
        label: "Orders",
        value: data?.stats.orders ?? 0,
        detail: money(data?.stats.revenue ?? 0),
        icon: Box,
      },
      {
        label: "Reviews",
        value: data?.stats.reviews ?? 0,
        detail: `${(data?.stats.avgRating ?? 0).toFixed(1)} avg rating`,
        icon: Star,
      },
      {
        label: "Open messages",
        value: data?.stats.openThreads ?? 0,
        detail: "Buyer threads",
        icon: MessageCircle,
      },
      {
        label: "Onboarding",
        value: data?.onboarding?.status ?? "DRAFT",
        detail: data?.onboarding?.journey?.currentStep ?? "BUSINESS",
        icon: BadgeCheck,
      },
    ],
    [data],
  );

  return (
    <main className="min-h-screen bg-surface-page text-ink-900">
      <MarketplaceNav />
      <header className="border-b border-ink-200 bg-surface-card">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <Link
              href="/"
              className="text-sm font-semibold text-copper-800 hover:text-copper-900"
            >
              Back to marketplace
            </Link>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Seller dashboard
            </h1>
            <p className="mt-1 text-sm text-ink-500">
              {data?.user.companyName ?? "Company workspace"} · seller
              operations
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/seller/listings/new"
              className="flex items-center gap-2 rounded-md bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand"
            >
              <Package size={16} />
              New listing
            </Link>
            <button
              onClick={load}
              className="flex items-center gap-2 rounded-md border border-ink-300 bg-surface-card px-3 py-2 text-sm font-semibold text-ink-700 hover:bg-surface-sunken"
            >
              <RefreshCw
                size={16}
                className={isLoading ? "animate-spin" : ""}
              />
              Refresh
            </button>
            <Link
              href="/account"
              className="flex items-center gap-2 rounded-md bg-ink-900 px-3 py-2 text-sm font-semibold text-white hover:bg-ink-800"
            >
              <Building2 size={16} />
              Buyer account
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1440px] gap-5 px-4 py-6 sm:px-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="rounded-lg border border-ink-200 bg-surface-card p-3 shadow-sm">
          <nav className="space-y-1">
            {tabs.map((tab) => (
              <button
                key={tab.label}
                onClick={() => setActiveTab(tab.label)}
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-medium",
                  activeTab === tab.label
                    ? "bg-brand-50 text-brand"
                    : "text-ink-600 hover:bg-surface-sunken hover:text-ink-900",
                )}
              >
                <span className="flex items-center gap-2">
                  <tab.icon size={16} />
                  {tab.label}
                </span>
                <ChevronRight size={14} />
              </button>
            ))}
          </nav>
        </aside>

        <section className="min-w-0">
          {isLoading && (
            <div className="flex h-80 items-center justify-center rounded-lg border border-ink-200 bg-surface-card">
              <Loader2 className="animate-spin text-brand" />
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-danger-border bg-danger-subtle p-4 text-sm text-danger-strong">
              {error}
            </div>
          )}
          {!isLoading && data && (
            <>
              {activeTab === "Overview" && (
                <div className="space-y-5">
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {cards.map((card) => {
                      const Icon = card.icon;
                      return (
                        <div
                          key={card.label}
                          className="rounded-lg border border-ink-200 bg-surface-card p-4 shadow-sm"
                        >
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-medium uppercase tracking-wide text-ink-500">
                              {card.label}
                            </p>
                            <Icon size={18} className="text-brand" />
                          </div>
                          <p className="mt-3 text-2xl font-semibold">
                            {String(card.value)}
                          </p>
                          <p className="mt-1 text-sm text-ink-500">
                            {card.detail}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                  <Panel title="Seller readiness">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="font-semibold">
                          Onboarding status: {data.onboarding.status}
                        </p>
                        <p className="mt-1 text-sm text-ink-500">
                          Current step:{" "}
                          {data.onboarding.journey?.currentStep ??
                            data.onboarding.currentStep}
                        </p>
                      </div>
                      <Link
                        href="/seller/onboarding"
                        className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand"
                      >
                        {data.onboarding.status === "APPROVED"
                          ? "View verification"
                          : "Continue onboarding"}
                      </Link>
                    </div>
                  </Panel>
                </div>
              )}
              {activeTab === "Listings" && (
                <ListingList items={data.listings} onChanged={load} />
              )}
              {activeTab === "Orders" && (
                <OrderItemList items={data.orderItems} onChanged={load} />
              )}
              {activeTab === "Bids" && (
                <BidList items={data.bids} onChanged={load} />
              )}
              {activeTab === "Onboarding" && (
                <Panel title="Seller onboarding">
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold">
                        {data.onboarding.journey?.percentage ??
                          data.onboarding.completion?.percentage ??
                          0}
                        % complete
                      </p>
                      <p className="mt-1 text-sm text-ink-500">
                        Complete the guided business-verification journey one
                        step at a time.
                      </p>
                      <p className="mt-2 text-xs font-medium uppercase tracking-wide text-ink-500">
                        Next:{" "}
                        {data.onboarding.journey?.currentStep ??
                          data.onboarding.currentStep}
                      </p>
                    </div>
                    <Link
                      href="/seller/onboarding"
                      className="rounded-md bg-brand px-4 py-2 text-center text-sm font-semibold text-white hover:bg-brand"
                    >
                      {data.onboarding.status === "APPROVED"
                        ? "View application"
                        : "Open onboarding"}
                    </Link>
                  </div>
                </Panel>
              )}
              {activeTab === "Reviews" && <ReviewList items={data.reviews} />}
              {activeTab === "Messages" && <ThreadList items={data.threads} />}
            </>
          )}
        </section>
      </div>
    </main>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-ink-200 bg-surface-card shadow-sm">
      <div className="border-b border-ink-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-ink-900">{title}</h2>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <div className="rounded-md border border-dashed border-ink-300 bg-surface-sunken p-6 text-center text-sm text-ink-500">
      {label}
    </div>
  );
}

function ListingList({
  items,
  onChanged,
}: {
  items: Array<any>;
  onChanged: () => Promise<void>;
}) {
  const [message, setMessage] = useState("");
  const act = async (
    item: any,
    action: "PAUSE" | "RESUME" | "CLOSE" | "ARCHIVE" | "RENEW",
  ) => {
    const response = await fetch(`/api/listings/${item.id}/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, version: item.version }),
    });
    const payload = await response.json();
    setMessage(
      response.ok
        ? `${item.title} is now ${payload.listing.status.toLowerCase()}.`
        : payload.error || "Unable to update listing.",
    );
    if (response.ok) await onChanged();
  };
  if (!items.length) {
    return (
      <Panel title="Seller listings">
        <Empty label="No seller-owned listings yet." />
        <Link
          href="/seller/listings/new"
          className="mt-3 flex min-h-11 items-center justify-center rounded-md bg-brand px-4 text-sm font-semibold text-white"
        >
          Create your first listing
        </Link>
      </Panel>
    );
  }
  return (
    <Panel title="Seller listings">
      {message && (
        <div className="mb-3 rounded-md bg-surface-page p-3 text-sm text-ink-700">
          {message}
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {items.map((item) => (
          <div key={item.id} className="rounded-md border border-ink-200 p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="line-clamp-2 font-semibold">{item.title}</p>
              <span className="rounded-full bg-surface-page px-2 py-1 text-[11px] font-semibold">
                {item.status}
              </span>
            </div>
            <p className="mt-1 text-sm text-ink-500">
              {item.category} · {item.city}, {item.state}
            </p>
            <p className="mt-2 text-sm font-semibold">
              {item.priceMode === "ON_REQUEST"
                ? "Price on request"
                : money(item.pricePerUnit)}{" "}
              · Qty {item.quantityAvailable}
            </p>
            {item.moderationNote && (
              <p className="mt-2 rounded-md bg-amber-50 p-2 text-xs text-amber-900">
                Moderator: {item.moderationNote}
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {["ACTIVE", "active"].includes(item.status) && (
                <>
                  <Link
                    href={`/products/${item.slug}`}
                    className="flex min-h-10 items-center rounded-md border border-ink-300 px-3 text-xs font-semibold"
                  >
                    View/share
                  </Link>
                  <button
                    onClick={() => act(item, "PAUSE")}
                    className="min-h-10 rounded-md border border-ink-300 px-3 text-xs font-semibold"
                  >
                    Pause
                  </button>
                  <button
                    onClick={() => act(item, "CLOSE")}
                    className="min-h-10 rounded-md border border-ink-300 px-3 text-xs font-semibold"
                  >
                    Close
                  </button>
                  <Link
                    href={`/seller/listings/new?id=${item.id}`}
                    className="flex min-h-10 items-center rounded-md border border-ink-300 px-3 text-xs font-semibold"
                  >
                    Edit
                  </Link>
                  <button
                    onClick={() => act(item, "ARCHIVE")}
                    className="min-h-10 rounded-md border border-red-300 px-3 text-xs font-semibold text-danger-strong"
                  >
                    Archive
                  </button>
                </>
              )}
              {item.status === "PAUSED" && (
                <>
                  <Link
                    href={`/seller/listings/new?id=${item.id}`}
                    className="flex min-h-10 items-center rounded-md border border-ink-300 px-3 text-xs font-semibold"
                  >
                    Edit
                  </Link>
                  <button
                    onClick={() => act(item, "RESUME")}
                    className="min-h-10 rounded-md bg-brand px-3 text-xs font-semibold text-white"
                  >
                    Resume
                  </button>
                  <button
                    onClick={() => act(item, "ARCHIVE")}
                    className="min-h-10 rounded-md border border-ink-300 px-3 text-xs font-semibold"
                  >
                    Archive
                  </button>
                </>
              )}
              {item.status === "EXPIRED" && (
                <button
                  onClick={() => act(item, "RENEW")}
                  className="min-h-10 rounded-md bg-brand px-3 text-xs font-semibold text-white"
                >
                  Renew
                </button>
              )}
              {["DRAFT", "REJECTED"].includes(item.status) && (
                <Link
                  href={`/seller/listings/new?id=${item.id}`}
                  className="flex min-h-10 items-center rounded-md border border-ink-300 px-3 text-xs font-semibold"
                >
                  Continue draft
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function OrderItemList({
  items,
  onChanged,
}: {
  items: Array<any>;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  async function act(orderId: string, action: string) {
    setBusy(orderId);
    try {
      const response = await fetch(`/api/seller/orders/${orderId}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Action failed.");
      onChanged();
    } catch (error) {
      toast({
        tone: "danger",
        title: "Action failed.",
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(null);
    }
  }
  if (!items.length) return <Empty label="No seller orders yet." />;
  return (
    <Panel title="Seller order items">
      <div className="divide-y divide-ink-200">
        {items.map((item) => (
          <div key={item.id} className="py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold">{item.title}</p>
                <p className="mt-1 text-sm text-ink-500">
                  {item.order.orderNumber} · {item.order.buyer.companyName} ·{" "}
                  {item.status}
                </p>
              </div>
              <p className="font-semibold">{money(item.lineTotal)}</p>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {item.order.status === "CONFIRMED" &&
                item.order.fulfillmentStatus === "UNFULFILLED" && (
                  <button
                    disabled={busy === item.order.id}
                    onClick={() => void act(item.order.id, "ACCEPT_ORDER")}
                    className="min-h-10 rounded-md bg-brand px-3 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    Accept order
                  </button>
                )}
              {item.order.status === "PROCESSING" &&
                item.order.fulfillmentStatus === "PROCESSING" && (
                  <button
                    disabled={busy === item.order.id}
                    onClick={() => void act(item.order.id, "MARK_DISPATCHED")}
                    className="min-h-10 rounded-md border border-ink-300 px-3 text-xs font-semibold disabled:opacity-50"
                  >
                    Mark dispatched
                  </button>
                )}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function BidList({
  items,
  onChanged,
}: {
  items: Array<any>;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [counterTarget, setCounterTarget] = useState<any>(null);

  async function act(
    item: any,
    action: string,
    counter: { quantity?: number; pricePerUnit?: number; terms?: string } = {},
  ) {
    if (action === "COUNTER" && !Object.keys(counter).length) {
      // Collected in a dialog, then re-entered here with the values.
      setCounterTarget(item);
      return;
    }
    setBusy(item.id);
    setMessage(null);
    try {
      const response = await fetch(`/api/bids/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...counter }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Action failed.");
      setMessage(`Offer ${payload.bid.status.toLowerCase()}.`);
      onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action failed.");
    } finally {
      setBusy(null);
    }
  }
  if (!items.length) return <Empty label="No incoming bids yet." />;
  return (
    <>
      <Panel title="Incoming bids">
        {message && (
          <p className="mb-3 rounded-md bg-surface-page p-2 text-sm">
            {message}
          </p>
        )}
        <div className="divide-y divide-ink-200">
          {items.map((item) => (
            <div key={item.id} className="py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">{item.materialName}</p>
                  <p className="text-sm text-ink-500">
                    {item.bidderCompany} · Qty {item.quantity} {item.unit} ·{" "}
                    {item.status}
                  </p>
                </div>
                <p className="font-semibold">{money(item.pricePerUnit)}</p>
              </div>
              {["PENDING", "COUNTERED"].includes(item.status) && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {[
                    ["ACCEPT", "Accept"],
                    ["COUNTER", "Counter"],
                    ["REJECT", "Reject"],
                    ["CANCEL", "Cancel"],
                  ].map(([action, label]) => (
                    <button
                      key={action}
                      disabled={busy === item.id}
                      onClick={() => void act(item, action)}
                      className="min-h-10 rounded-md border border-ink-300 px-3 text-xs font-semibold disabled:opacity-50"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
              {item.order && (
                <p className="mt-2 text-xs text-brand">
                  Order {item.order.orderNumber} · {item.order.status}
                </p>
              )}
              {item.revisions?.length > 1 && (
                <details className="mt-2 text-xs text-ink-500">
                  <summary>{item.revisions.length} offer revisions</summary>
                  {item.revisions.map((revision: any) => (
                    <p key={revision.id} className="mt-1">
                      #{revision.sequence}: {revision.quantity} {revision.unit}{" "}
                      at {money(revision.pricePerUnit)} · {revision.status}
                    </p>
                  ))}
                </details>
              )}
            </div>
          ))}
        </div>
      </Panel>
      <CounterOfferDialog
        open={Boolean(counterTarget)}
        onClose={() => setCounterTarget(null)}
        submitting={busy === counterTarget?.id}
        current={
          counterTarget
            ? {
                quantity: counterTarget.quantity,
                pricePerUnit: counterTarget.pricePerUnit,
                unit: counterTarget.unit,
                title: counterTarget.materialName,
              }
            : null
        }
        onSubmit={(counter) => {
          const target = counterTarget;
          setCounterTarget(null);
          if (target) void act(target, "COUNTER", counter);
        }}
      />
    </>
  );
}

function ReviewList({ items }: { items: Array<any> }) {
  if (!items.length) return <Empty label="No reviews yet." />;
  return (
    <Panel title="Reviews">
      <div className="grid gap-3">
        {items.map((item) => (
          <div key={item.id} className="rounded-md border border-ink-200 p-3">
            <p className="font-semibold">
              {item.rating}/5 · {item.user.companyName}
            </p>
            <p className="mt-1 text-sm text-ink-500">{item.body}</p>
            <p className="mt-2 text-xs text-ink-400">{item.listing.title}</p>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function ThreadList({ items }: { items: Array<any> }) {
  if (!items.length) return <Empty label="No seller message threads yet." />;
  return (
    <Panel title="Messages">
      <div className="divide-y divide-ink-200">
        {items.map((thread) => (
          <Link
            key={thread.id}
            href={`/messages/${thread.id}`}
            className="block py-3"
          >
            <p className="font-semibold">{thread.subject}</p>
            <p className="mt-1 line-clamp-1 text-sm text-ink-500">
              {thread.messages[0]?.body ?? "No messages yet"}
            </p>
          </Link>
        ))}
      </div>
    </Panel>
  );
}
