"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatusPill } from "@/components/ui/StatusPill";

interface DisputeOrder {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  disputeStatus: string;
  totalAmount: number;
  currency: string;
  updatedAt: string;
  items: Array<{
    title: string;
    quantity: number;
    unit: string;
    pricePerUnit: number;
    status: string;
    listingId: string | null;
  }>;
  events: Array<{ type: string; reasonCode: string | null; createdAt: string }>;
}

function money(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function AdminDisputesPage() {
  const [orders, setOrders] = useState<DisputeOrder[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/disputes", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((payload) => !cancelled && setOrders(payload?.orders ?? []))
      .catch(() => !cancelled && setOrders([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AdminShell
      title="Disputes & conflicts"
      description="Orders where a buyer or seller has raised a conflict, or where inventory could not be honoured."
    >
      {/* The conflict this product is most likely to produce, explained once so
          an operator reading it for the first time knows what already happened
          automatically and what is left for them to do. */}
      <div className="mb-6 rounded-card border border-ink-200 bg-surface-card p-5">
        <div className="flex items-start gap-3">
          <ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-ink-900">
              How an <code className="text-copper-800">INVENTORY_CONFLICT</code> resolves
            </h2>
            <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-ink-600">
              When two accepted bids claim the same stock, the second reservation
              is refused inside the transaction — the quantity is never
              oversold and no sandbox funds move. Nothing here needs undoing;
              what remains is deciding whether to re-allocate replacement
              inventory or release the buyer&rsquo;s hold.
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-28 w-full" />
          ))}
        </div>
      ) : orders && orders.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {orders.map((order) => (
            <li
              key={order.id}
              className="rounded-card border border-danger-border bg-surface-card p-5 shadow-card"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="danger" icon={<AlertTriangle />}>
                      {order.events[0]?.reasonCode ?? order.disputeStatus}
                    </Badge>
                    <StatusPill status={order.status} size="sm" />
                    <StatusPill status={order.paymentStatus} size="sm" />
                  </div>
                  <p className="mt-2 font-semibold text-ink-900">
                    Order {order.orderNumber}
                  </p>
                  <ul className="mt-1 flex flex-col gap-0.5 text-[13px] text-ink-600">
                    {order.items.map((item, index) => (
                      <li key={index} className="truncate">
                        {item.quantity} {item.unit} · {item.title} @{" "}
                        {money(item.pricePerUnit)}
                        {item.listingId ? (
                          <>
                            {" · "}
                            <Link
                              href={`/products/${item.listingId}`}
                              className="rounded-sm font-medium text-copper-700 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper-700"
                            >
                              listing
                            </Link>
                          </>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="text-right">
                  <p className="text-lg font-semibold text-ink-900">
                    {money(order.totalAmount)}
                  </p>
                  <p className="mt-0.5 text-[12px] text-ink-500">
                    Raised {new Date(order.updatedAt).toLocaleDateString("en-IN")}
                  </p>
                </div>
              </div>

              {/* Resolution runs through the order's own action endpoints, so
                  the order state machine stays the only thing that moves it. */}
              <div className="mt-4 flex flex-wrap gap-2 border-t border-ink-200 pt-4">
                <Button variant="secondary" size="sm" disabled>
                  Re-allocate inventory
                </Button>
                <Button variant="secondary" size="sm" disabled>
                  Release sandbox hold
                </Button>
                <p className="self-center text-[12px] text-ink-500">
                  Resolution actions are not wired yet — settlement and refunds
                  are still sandbox stubs.
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={<ShieldCheck />}
          title="No open disputes"
          description="Nothing is contested. Conflicts appear here when a buyer or seller raises one, or when an order cannot be honoured against available inventory."
        />
      )}
    </AdminShell>
  );
}
