"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
    <main className="min-h-screen bg-[#f4f2ed] text-stone-950">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <Link href="/" className="text-sm font-semibold text-orange-700 hover:text-orange-800">
              Back to marketplace
            </Link>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Buyer account</h1>
            <p className="mt-1 text-sm text-stone-500">
              {data?.user.companyName ?? "Company workspace"} · {data?.user.email ?? "Loading"}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={load}
              className="flex items-center gap-2 rounded-md border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50"
            >
              <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} />
              Refresh
            </button>
            <Link
              href="/seller"
              className="flex items-center gap-2 rounded-md bg-stone-950 px-3 py-2 text-sm font-semibold text-white hover:bg-stone-800"
            >
              <Building2 size={16} />
              Seller dashboard
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="rounded-lg border border-stone-200 bg-white p-3 shadow-sm">
          <nav className="space-y-1">
            {tabs.map((tab) => (
              <button
                key={tab.label}
                onClick={() => setActiveTab(tab.label)}
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-medium",
                  activeTab === tab.label
                    ? "bg-orange-50 text-orange-800"
                    : "text-stone-600 hover:bg-stone-50 hover:text-stone-950"
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
            <div className="flex h-80 items-center justify-center rounded-lg border border-stone-200 bg-white">
              <Loader2 className="animate-spin text-orange-600" />
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
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
                      <div key={card.label} className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
                            {card.label}
                          </p>
                          <Icon size={18} className="text-orange-600" />
                        </div>
                        <p className="mt-3 text-2xl font-semibold">{String(card.value)}</p>
                        <p className="mt-1 text-sm text-stone-500">{card.detail}</p>
                      </div>
                      );
                    })}
                  </div>
                  <Panel title="Recent notifications">
                    <NotificationList items={data.notifications} />
                  </Panel>
                </div>
              )}
              {activeTab === "Orders" && <OrderList orders={data.orders} />}
              {activeTab === "Cart" && <CartList items={data.cartItems} />}
              {activeTab === "Saved" && <SavedList items={data.wishlistItems} />}
              {activeTab === "Addresses" && <AddressList items={data.addresses} />}
              {activeTab === "Bids" && <BidList items={data.bids} />}
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
    <section className="rounded-lg border border-stone-200 bg-white shadow-sm">
      <div className="border-b border-stone-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-stone-900">{title}</h2>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <div className="rounded-md border border-dashed border-stone-300 bg-stone-50 p-6 text-center text-sm text-stone-500">
      {label}
    </div>
  );
}

function OrderList({ orders }: { orders: Array<any> }) {
  if (!orders.length) return <Empty label="No orders yet. Use Buy now from any product detail panel." />;
  return (
    <Panel title="Purchase history">
      <div className="divide-y divide-stone-100">
        {orders.map((order) => (
          <div key={order.id} className="py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold">{order.orderNumber}</p>
                <p className="mt-1 text-sm text-stone-500">
                  {order.items.length} item{order.items.length === 1 ? "" : "s"} · {order.status} · {order.paymentStatus}
                </p>
              </div>
              <p className="text-lg font-semibold">{money(order.totalAmount)}</p>
            </div>
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
          <div key={item.id} className="flex gap-3 rounded-md border border-stone-200 p-3">
            <img src={item.listing.imageUrl} alt="" className="h-16 w-16 rounded object-cover" />
            <div className="min-w-0 flex-1">
              <p className="line-clamp-1 font-semibold">{item.listing.title}</p>
              <p className="text-sm text-stone-500">
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
          <div key={item.id} className="rounded-md border border-stone-200 p-3">
            <p className="line-clamp-2 font-semibold">{item.listing.title}</p>
            <p className="mt-1 text-sm text-stone-500">{item.listing.city}, {item.listing.state}</p>
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
          <div key={item.id} className="rounded-md border border-stone-200 p-4">
            <p className="font-semibold">{item.label}</p>
            <p className="mt-1 text-sm text-stone-600">{item.contactName} · {item.phone}</p>
            <p className="mt-2 text-sm text-stone-500">
              {item.street}, {item.area}, {item.city}, {item.state} - {item.pincode}
            </p>
            <p className="mt-2 text-xs font-semibold text-emerald-700">{item.verificationStatus}</p>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function BidList({ items }: { items: Array<any> }) {
  if (!items.length) return <Empty label="No bids placed yet." />;
  return (
    <Panel title="Buyer bids">
      <div className="divide-y divide-stone-100">
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-3 py-3">
            <div>
              <p className="font-semibold">{item.materialName}</p>
              <p className="text-sm text-stone-500">Qty {item.quantity} · {item.status}</p>
            </div>
            <p className="font-semibold">{money(item.pricePerUnit)}</p>
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
      <div className="divide-y divide-stone-100">
        {items.map((thread) => (
          <div key={thread.id} className="py-3">
            <p className="font-semibold">{thread.subject}</p>
            <p className="mt-1 line-clamp-1 text-sm text-stone-500">
              {thread.messages[0]?.body ?? "No messages yet"}
            </p>
          </div>
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
        <div key={item.id} className="rounded-md border border-stone-200 p-3">
          <p className="font-semibold">{item.title}</p>
          <p className="mt-1 text-sm text-stone-500">{item.body}</p>
        </div>
      ))}
    </div>
  );
}
