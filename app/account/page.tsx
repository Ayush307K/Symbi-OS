"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MarketplaceNav } from "@/components/marketplace/MarketplaceNav";
import Link from "next/link";
import {
  Bell,
  Box,
  Building2,
  ChevronRight,
  CreditCard,
  Gavel,
  Heart,
  Loader2,
  MapPin,
  MessageCircle,
  Package,
  RefreshCw,
  ShoppingCart,
} from "lucide-react";
import { cn } from "@/lib/cn";

type Tab = "Overview" | "Orders" | "Cart" | "Saved" | "Addresses" | "Bids" | "Messages";

interface MetricItem {
  label: string;
  value: string | number;
  detail: string;
  icon: React.ElementType;
}

interface SummaryData {
  user: {
    email: string;
    companyName: string;
    role: string;
  };
  stats: Record<string, number>;
  orders: Array<any>;
  cartItems: Array<any>;
  wishlistItems: Array<any>;
  addresses: Array<any>;
  threads: Array<any>;
  notifications: Array<any>;
  bids: Array<any>;
}

const tabs: Array<{ label: Tab; icon: React.ElementType }> = [
  { label: "Overview", icon: Package },
  { label: "Orders", icon: Box },
  { label: "Cart", icon: ShoppingCart },
  { label: "Saved", icon: Heart },
  { label: "Addresses", icon: MapPin },
  { label: "Bids", icon: Gavel },
  { label: "Messages", icon: MessageCircle },
];

function money(value = 0) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function AccountPage() {
  const [data, setData] = useState<SummaryData | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/account/summary", { cache: "no-store" });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Unable to load account.");
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load account.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const cards = useMemo<MetricItem[]>(
    () => [
      { label: "Orders", value: data?.stats.orders ?? 0, detail: "Created orders", icon: Box },
      { label: "Cart", value: data?.stats.cartItems ?? 0, detail: money(data?.stats.cartTotal ?? 0), icon: ShoppingCart },
      { label: "Saved", value: data?.stats.savedProducts ?? 0, detail: "Products saved", icon: Heart },
      { label: "Messages", value: data?.stats.openMessages ?? 0, detail: "Open threads", icon: MessageCircle },
      { label: "Bids", value: data?.stats.activeBids ?? 0, detail: "Pending quotes", icon: Gavel },
      { label: "Notifications", value: data?.stats.unreadNotifications ?? 0, detail: "Unread", icon: Bell },
    ],
    [data]
  );

  return (
    <main className="min-h-screen bg-surface-page text-ink-900">
      <MarketplaceNav />
      <header className="border-b border-ink-200 bg-surface-card">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <Link href="/" className="text-sm font-semibold text-copper-800 hover:text-copper-900">
              Back to marketplace
            </Link>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Buyer account</h1>
            <p className="mt-1 text-sm text-ink-500">
              {data?.user.companyName ?? "Company workspace"} · {data?.user.email ?? "Loading"}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={load}
              className="flex items-center gap-2 rounded-md border border-ink-300 bg-surface-card px-3 py-2 text-sm font-semibold text-ink-700 hover:bg-surface-sunken"
            >
              <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} />
              Refresh
            </button>
            <Link
              href="/seller"
              className="flex items-center gap-2 rounded-md bg-ink-900 px-3 py-2 text-sm font-semibold text-white hover:bg-ink-800"
            >
              <Building2 size={16} />
              Seller dashboard
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
                    ? "bg-copper-50 text-copper-800"
                    : "text-ink-600 hover:bg-surface-sunken hover:text-ink-900"
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
              <Loader2 className="animate-spin text-copper-700" />
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
                      <div key={card.label} className="rounded-lg border border-ink-200 bg-surface-card p-4 shadow-sm">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">
                            {card.label}
                          </p>
                          <Icon size={18} className="text-copper-700" />
                        </div>
                        <p className="mt-3 text-2xl font-semibold">{String(card.value)}</p>
                        <p className="mt-1 text-sm text-ink-500">{card.detail}</p>
                      </div>
                      );
                    })}
                  </div>
                  <Panel title="Recent notifications">
                    <NotificationList items={data.notifications} />
                  </Panel>
                </div>
              )}
              {activeTab === "Orders" && (
                <OrderList orders={data.orders} onChanged={load} />
              )}
              {activeTab === "Cart" && <CartList items={data.cartItems} />}
              {activeTab === "Saved" && <SavedList items={data.wishlistItems} />}
              {activeTab === "Addresses" && <AddressList items={data.addresses} />}
              {activeTab === "Bids" && (
                <BidList items={data.bids} onChanged={load} />
              )}
              {activeTab === "Messages" && <ThreadList items={data.threads} />}
            </>
          )}
        </section>
      </div>
    </main>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
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

function OrderList({
  orders,
  onChanged,
}: {
  orders: Array<any>;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  async function pay(order: any) {
    if (!order.sourceBidId) return;
    setBusy(order.id);
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({ bidId: order.sourceBidId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Payment failed.");
      onChanged();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Payment failed.");
    } finally {
      setBusy(null);
    }
  }
  async function cancel(order: any) {
    const note = window.prompt("Optional cancellation note") ?? "";
    setBusy(order.id);
    try {
      const response = await fetch(`/api/orders/${order.id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "CANCEL",
          reasonCode: "BUYER_CHANGED_REQUIREMENT",
          note: note || undefined,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Cancellation failed.");
      onChanged();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Cancellation failed.");
    } finally {
      setBusy(null);
    }
  }
  async function orderAction(order: any, action: string) {
    const note =
      action === "OPEN_DISPUTE"
        ? window.prompt("Describe the dispute") ?? ""
        : undefined;
    setBusy(order.id);
    try {
      const response = await fetch(`/api/orders/${order.id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          reasonCode: action === "OPEN_DISPUTE" ? "OTHER" : undefined,
          note,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Action failed.");
      onChanged();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Action failed.");
    } finally {
      setBusy(null);
    }
  }
  if (!orders.length) return <Empty label="No orders yet. Use Buy now from any product detail panel." />;
  return (
    <Panel title="Purchase history">
      <div className="divide-y divide-ink-200">
        {orders.map((order) => (
          <div key={order.id} className="py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold">{order.orderNumber}</p>
                <p className="mt-1 text-sm text-ink-500">
                  {order.items.length} item{order.items.length === 1 ? "" : "s"} · {order.status} · {order.paymentStatus}
                </p>
              </div>
              <p className="text-lg font-semibold">{money(order.totalAmount)}</p>
            </div>
            {order.status === "AWAITING_BUYER_CONFIRMATION" && (
              <button
                onClick={() => void pay(order)}
                disabled={busy === order.id}
                className="mt-3 min-h-10 rounded-md bg-copper-700 px-4 text-sm font-semibold text-white disabled:opacity-50"
              >
                Confirm and pay in sandbox
              </button>
            )}
            {order.invoice && (
              <a
                href={`/api/orders/${order.id}/invoice`}
                className="mt-3 inline-flex min-h-10 items-center rounded-md border border-ink-300 px-3 text-sm font-semibold"
              >
                Download sandbox invoice PDF
              </a>
            )}
            {order.invoice && order.paymentStatus === "REFUNDED" && (
              <a
                href={`/api/orders/${order.id}/invoice?document=credit-note`}
                className="ml-2 mt-3 inline-flex min-h-10 items-center rounded-md border border-ink-300 px-3 text-sm font-semibold"
              >
                Download sandbox credit note
              </a>
            )}
            {["AWAITING_BUYER_CONFIRMATION", "CONFIRMED"].includes(
              order.status,
            ) &&
              order.fulfillmentStatus === "UNFULFILLED" && (
                <button
                  onClick={() => void cancel(order)}
                  disabled={busy === order.id}
                  className="ml-2 mt-3 min-h-10 rounded-md border border-red-300 px-3 text-sm font-semibold text-danger-strong disabled:opacity-50"
                >
                  Cancel order
                </button>
              )}
            {order.fulfillmentStatus === "DISPATCHED" && (
              <button
                onClick={() => void orderAction(order, "CONFIRM_DELIVERY")}
                disabled={busy === order.id}
                className="ml-2 mt-3 min-h-10 rounded-md bg-brand px-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                Confirm delivery
              </button>
            )}
            {order.paymentStatus === "PAID" &&
              order.disputeStatus === "NONE" && (
                <button
                  onClick={() => void orderAction(order, "OPEN_DISPUTE")}
                  disabled={busy === order.id}
                  className="ml-2 mt-3 min-h-10 rounded-md border border-amber-300 px-3 text-sm font-semibold text-amber-800 disabled:opacity-50"
                >
                  Open dispute
                </button>
              )}
          </div>
        ))}
      </div>
    </Panel>
  );
}

function CartList({ items }: { items: Array<any> }) {
  if (!items.length) return <Empty label="Your cart is empty." />;
  return (
    <Panel title="Cart">
      <div className="grid gap-3">
        {items.map((item) => (
          <div key={item.id} className="flex gap-3 rounded-md border border-ink-200 p-3">
            <img src={item.listing.imageUrl} alt="" className="h-16 w-16 rounded object-cover" />
            <div className="min-w-0 flex-1">
              <p className="line-clamp-1 font-semibold">{item.listing.title}</p>
              <p className="text-sm text-ink-500">
                Qty {item.quantity} · {money(item.priceSnapshot)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function SavedList({ items }: { items: Array<any> }) {
  if (!items.length) return <Empty label="No saved products yet." />;
  return (
    <Panel title="Saved products">
      <div className="grid gap-3 md:grid-cols-2">
        {items.map((item) => (
          <div key={item.id} className="rounded-md border border-ink-200 p-3">
            <p className="line-clamp-2 font-semibold">{item.listing.title}</p>
            <p className="mt-1 text-sm text-ink-500">{item.listing.city}, {item.listing.state}</p>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function AddressList({ items }: { items: Array<any> }) {
  if (!items.length) return <Empty label="No saved addresses yet. Checkout will save your first address." />;
  return (
    <Panel title="Saved addresses">
      <div className="grid gap-3 md:grid-cols-2">
        {items.map((item) => (
          <div key={item.id} className="rounded-md border border-ink-200 p-4">
            <p className="font-semibold">{item.label}</p>
            <p className="mt-1 text-sm text-ink-600">{item.contactName} · {item.phone}</p>
            <p className="mt-2 text-sm text-ink-500">
              {item.street}, {item.area}, {item.city}, {item.state} - {item.pincode}
            </p>
            <p className="mt-2 text-xs font-semibold text-brand">{item.verificationStatus}</p>
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
  async function act(item: any, action: string) {
    const counter =
      action === "COUNTER"
        ? {
            quantity: Number(
              window.prompt("Counter quantity", String(item.quantity)),
            ),
            pricePerUnit: Number(
              window.prompt("Counter price per unit", String(item.pricePerUnit)),
            ),
          }
        : {};
    if (
      action === "COUNTER" &&
      (!counter.quantity || !counter.pricePerUnit)
    ) {
      return;
    }
    setBusy(item.id);
    try {
      const response = await fetch(`/api/bids/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...counter }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Action failed.");
      onChanged();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Action failed.");
    } finally {
      setBusy(null);
    }
  }
  if (!items.length) return <Empty label="No bids placed yet." />;
  return (
    <Panel title="Buyer bids">
      <div className="divide-y divide-ink-200">
        {items.map((item) => (
          <div key={item.id} className="py-3">
            <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-semibold">{item.materialName}</p>
              <p className="text-sm text-ink-500">
                Qty {item.quantity} {item.unit} · {item.status}
              </p>
            </div>
            <p className="font-semibold">{money(item.pricePerUnit)}</p>
            </div>
            {["PENDING", "COUNTERED"].includes(item.status) && (
              <div className="mt-3 flex flex-wrap gap-2">
                {[
                  ["ACCEPT", "Accept current offer"],
                  ["COUNTER", "Counter"],
                  ["REJECT", "Reject"],
                  ["WITHDRAW", "Withdraw"],
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
            {item.revisions?.length > 1 && (
              <details className="mt-2 text-xs text-ink-500">
                <summary>{item.revisions.length} offer revisions</summary>
                {item.revisions.map((revision: any) => (
                  <p key={revision.id} className="mt-1">
                    #{revision.sequence}: {revision.quantity} {revision.unit} at{" "}
                    {money(revision.pricePerUnit)} · {revision.status}
                  </p>
                ))}
              </details>
            )}
          </div>
        ))}
      </div>
    </Panel>
  );
}

function ThreadList({ items }: { items: Array<any> }) {
  if (!items.length) return <Empty label="No message threads yet." />;
  return (
    <Panel title="Messages">
      <div className="divide-y divide-ink-200">
        {items.map((thread) => (
          <Link key={thread.id} href={`/messages/${thread.id}`} className="block py-3">
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

function NotificationList({ items }: { items: Array<any> }) {
  if (!items.length) return <Empty label="No notifications yet." />;
  return (
    <div className="grid gap-2">
      {items.slice(0, 5).map((item) => (
        <div key={item.id} className="rounded-md border border-ink-200 p-3">
          <p className="font-semibold">{item.title}</p>
          <p className="mt-1 text-sm text-ink-500">{item.body}</p>
        </div>
      ))}
    </div>
  );
}
