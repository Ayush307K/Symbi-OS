"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

type Tab = "Overview" | "Listings" | "Orders" | "Bids" | "Onboarding" | "Reviews" | "Messages";

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
  const [onboardingMessage, setOnboardingMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/seller/dashboard", { cache: "no-store" });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Unable to load seller dashboard.");
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load seller dashboard.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const cards = useMemo<MetricItem[]>(
    () => [
      { label: "Active listings", value: data?.stats.activeListings ?? 0, detail: "Live supply records", icon: Package },
      { label: "Incoming bids", value: data?.stats.pendingBids ?? 0, detail: "Pending buyer quotes", icon: Gavel },
      { label: "Orders", value: data?.stats.orders ?? 0, detail: money(data?.stats.revenue ?? 0), icon: Box },
      { label: "Reviews", value: data?.stats.reviews ?? 0, detail: `${(data?.stats.avgRating ?? 0).toFixed(1)} avg rating`, icon: Star },
      { label: "Open messages", value: data?.stats.openThreads ?? 0, detail: "Buyer threads", icon: MessageCircle },
      { label: "Onboarding", value: data?.onboarding?.status ?? "DRAFT", detail: data?.onboarding?.currentStep ?? "BUSINESS", icon: BadgeCheck },
    ],
    [data]
  );

  async function submitOnboarding() {
    setOnboardingMessage(null);
    try {
      const res = await fetch("/api/seller/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "BUSINESS",
          submit: true,
          payload: {
            companyName: data?.user.companyName,
            natureOfBusiness: "Industrial secondary materials marketplace seller",
            submittedFrom: "seller-dashboard",
          },
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Unable to submit onboarding.");
      setOnboardingMessage("Seller onboarding submitted for review.");
      await load();
    } catch (err) {
      setOnboardingMessage(err instanceof Error ? err.message : "Unable to submit onboarding.");
    }
  }

  return (
    <main className="min-h-screen bg-[#f4f2ed] text-stone-950">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <Link href="/" className="text-sm font-semibold text-orange-700 hover:text-orange-800">
              Back to marketplace
            </Link>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Seller dashboard</h1>
            <p className="mt-1 text-sm text-stone-500">
              {data?.user.companyName ?? "Company workspace"} · seller operations
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
              href="/account"
              className="flex items-center gap-2 rounded-md bg-stone-950 px-3 py-2 text-sm font-semibold text-white hover:bg-stone-800"
            >
              <Building2 size={16} />
              Buyer account
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
                    ? "bg-emerald-50 text-emerald-800"
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
              <Loader2 className="animate-spin text-emerald-700" />
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
                          <p className="text-xs font-medium uppercase tracking-wide text-stone-500">{card.label}</p>
                          <Icon size={18} className="text-emerald-700" />
                        </div>
                        <p className="mt-3 text-2xl font-semibold">{String(card.value)}</p>
                        <p className="mt-1 text-sm text-stone-500">{card.detail}</p>
                      </div>
                      );
                    })}
                  </div>
                  <Panel title="Seller readiness">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="font-semibold">Onboarding status: {data.onboarding.status}</p>
                        <p className="mt-1 text-sm text-stone-500">Current step: {data.onboarding.currentStep}</p>
                      </div>
                      <button
                        onClick={submitOnboarding}
                        className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
                      >
                        Submit for review
                      </button>
                    </div>
                    {onboardingMessage && <p className="mt-3 text-sm text-emerald-700">{onboardingMessage}</p>}
                  </Panel>
                </div>
              )}
              {activeTab === "Listings" && <ListingList items={data.listings} />}
              {activeTab === "Orders" && <OrderItemList items={data.orderItems} />}
              {activeTab === "Bids" && <BidList items={data.bids} />}
              {activeTab === "Onboarding" && (
                <Panel title="Seller onboarding">
                  <pre className="overflow-auto rounded-md bg-stone-950 p-4 text-xs text-stone-100">
                    {JSON.stringify(data.onboarding, null, 2)}
                  </pre>
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

function ListingList({ items }: { items: Array<any> }) {
  if (!items.length) return <Empty label="No seller-owned listings yet. Use Create listing from the marketplace." />;
  return (
    <Panel title="Seller listings">
      <div className="grid gap-3 md:grid-cols-2">
        {items.map((item) => (
          <div key={item.id} className="rounded-md border border-stone-200 p-3">
            <p className="line-clamp-2 font-semibold">{item.title}</p>
            <p className="mt-1 text-sm text-stone-500">{item.category} · {item.city}, {item.state}</p>
            <p className="mt-2 text-sm font-semibold">{money(item.pricePerUnit)} · Qty {item.quantityAvailable}</p>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function OrderItemList({ items }: { items: Array<any> }) {
  if (!items.length) return <Empty label="No seller orders yet." />;
  return (
    <Panel title="Seller order items">
      <div className="divide-y divide-stone-100">
        {items.map((item) => (
          <div key={item.id} className="py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold">{item.title}</p>
                <p className="mt-1 text-sm text-stone-500">
                  {item.order.orderNumber} · {item.order.buyer.companyName} · {item.status}
                </p>
              </div>
              <p className="font-semibold">{money(item.lineTotal)}</p>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function BidList({ items }: { items: Array<any> }) {
  if (!items.length) return <Empty label="No incoming bids yet." />;
  return (
    <Panel title="Incoming bids">
      <div className="divide-y divide-stone-100">
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-3 py-3">
            <div>
              <p className="font-semibold">{item.materialName}</p>
              <p className="text-sm text-stone-500">{item.bidderCompany} · Qty {item.quantity} · {item.status}</p>
            </div>
            <p className="font-semibold">{money(item.pricePerUnit)}</p>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function ReviewList({ items }: { items: Array<any> }) {
  if (!items.length) return <Empty label="No reviews yet." />;
  return (
    <Panel title="Reviews">
      <div className="grid gap-3">
        {items.map((item) => (
          <div key={item.id} className="rounded-md border border-stone-200 p-3">
            <p className="font-semibold">{item.rating}/5 · {item.user.companyName}</p>
            <p className="mt-1 text-sm text-stone-500">{item.body}</p>
            <p className="mt-2 text-xs text-stone-400">{item.listing.title}</p>
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
