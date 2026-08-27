"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  ClipboardCheck,
  Headphones,
  Package,
  ShieldQuestion,
} from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";

interface Summary {
  queues: {
    pendingModeration: number;
    pendingVerification: number;
    openDisputes: number;
    openSupport: number;
  };
  marketplace: {
    activeListings: number;
    unverifiedActiveListings: number;
    awaitingConfirmation: number;
  };
}

export default function AdminOverviewPage() {
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/summary", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((payload) => !cancelled && setData(payload))
      .catch(() => undefined)
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const queues = [
    {
      label: "Listings awaiting moderation",
      href: "/admin/moderation",
      icon: ClipboardCheck,
      count: data?.queues.pendingModeration,
      note: "A submitted listing stays invisible until it is approved.",
    },
    {
      label: "Sellers awaiting verification",
      href: "/admin/sellers",
      icon: BadgeCheck,
      count: data?.queues.pendingVerification,
      note: "Verification gates a seller's ability to publish at all.",
    },
    {
      label: "Open support tickets",
      href: "/admin/support",
      icon: Headphones,
      count: data?.queues.openSupport,
      note: "Assistant escalations waiting for a human response.",
    },
    {
      label: "Open disputes",
      href: "/admin/disputes",
      icon: AlertTriangle,
      count: data?.queues.openDisputes,
      note: "Orders where the buyer or seller has raised a conflict.",
      danger: true,
    },
  ];

  return (
    <AdminShell
      title="Operations overview"
      description="What is waiting on an operator right now."
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {queues.map((queue) => (
          <Link
            key={queue.href}
            href={queue.href}
            className={cn(
              "group flex flex-col rounded-card border bg-surface-card p-5 shadow-card transition-all",
              "hover:border-ink-300 hover:shadow-raised",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper-700",
              queue.danger && queue.count
                ? "border-danger-border"
                : "border-ink-200",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <queue.icon
                aria-hidden="true"
                className={cn(
                  "h-4 w-4",
                  queue.danger && queue.count ? "text-danger" : "text-ink-500",
                )}
              />
              <ArrowRight
                aria-hidden="true"
                className="h-4 w-4 text-ink-400 transition-transform group-hover:translate-x-0.5"
              />
            </div>

            {loading ? (
              <Skeleton className="mt-4 h-9 w-16" />
            ) : (
              <p
                className={cn(
                  "mt-4 text-4xl font-bold leading-none",
                  queue.danger && queue.count ? "text-danger" : "text-ink-900",
                )}
              >
                {queue.count ?? "—"}
              </p>
            )}

            <p className="mt-2 text-sm font-semibold text-ink-900">
              {queue.label}
            </p>
            <p className="mt-1 text-[12px] leading-relaxed text-ink-500">
              {queue.note}
            </p>
          </Link>
        ))}
      </div>

      <section className="mt-8">
        <h2 className="text-[13px] font-bold uppercase tracking-wide text-ink-900">
          Marketplace state
        </h2>
        <dl className="mt-3 grid gap-px overflow-hidden rounded-card border border-ink-200 bg-ink-200 sm:grid-cols-3">
          <Stat
            icon={Package}
            label="Active listings"
            value={data?.marketplace.activeListings}
            loading={loading}
          />
          <Stat
            icon={ShieldQuestion}
            label="Active but unverified"
            value={data?.marketplace.unverifiedActiveListings}
            loading={loading}
            note="Imported supply whose seller has not been verified."
          />
          <Stat
            icon={ClipboardCheck}
            label="Orders awaiting buyer"
            value={data?.marketplace.awaitingConfirmation}
            loading={loading}
          />
        </dl>
      </section>
    </AdminShell>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  loading,
  note,
}: {
  icon: typeof Package;
  label: string;
  value?: number;
  loading: boolean;
  note?: string;
}) {
  return (
    <div className="bg-surface-card px-5 py-4">
      <dt className="flex items-center gap-1.5 text-[12px] uppercase tracking-wide text-ink-500">
        <Icon aria-hidden="true" className="h-3.5 w-3.5" />
        {label}
      </dt>
      {loading ? (
        <Skeleton className="mt-2 h-7 w-14" />
      ) : (
        <dd className="mt-1 text-2xl font-semibold text-ink-900">
          {value ?? "—"}
        </dd>
      )}
      {note ? <p className="mt-1 text-[12px] text-ink-500">{note}</p> : null}
    </div>
  );
}
