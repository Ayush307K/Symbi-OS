"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FileText,
  MessageSquareText,
  ShieldCheck,
} from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatusPill } from "@/components/ui/StatusPill";
import { Textarea } from "@/components/ui/Textarea";

type ResolutionAction =
  | "RELEASE_TO_SELLER"
  | "REFUND_BUYER"
  | "REPLACE_INVENTORY"
  | "PARTIAL_SETTLEMENT"
  | "REJECT_DISPUTE";

interface TimelineEvent {
  id: string;
  type: string;
  fromStatus: string | null;
  toStatus: string;
  reasonCode: string | null;
  createdAt: string;
  actor: { id: string; name: string; role: string } | null;
  note: string | null;
  action: string | null;
  refundAmount: number | null;
}

interface DisputeOrder {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  disputeStatus: string;
  totalAmount: number;
  currency: string;
  updatedAt: string;
  reasonCode: string;
  disputeNote: string;
  buyer: { id: string; companyName: string; email: string };
  sellers: Array<{ id: string; name: string }>;
  items: Array<{
    id: string;
    title: string;
    quantity: number;
    unit: string;
    pricePerUnit: number;
    status: string;
    listingId: string;
    sellerCompanyId: string;
  }>;
  partyNotes: TimelineEvent[];
  evidence: Array<{
    id: string;
    kind: string;
    label: string;
    url: string | null;
  }>;
  timeline: TimelineEvent[];
  replacementCandidates: Array<{
    orderItemId: string;
    listingId: string;
    title: string;
    quantityAvailable: number;
    requiredQuantity: number;
    unit: string;
  }>;
}

function money(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function words(value: string) {
  return value.replaceAll("_", " ").toLowerCase();
}

function ResolutionForm({
  order,
  onResolved,
}: {
  order: DisputeOrder;
  onResolved: () => Promise<void>;
}) {
  const [action, setAction] = useState<ResolutionAction | "">("");
  const [note, setNote] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [replacementIndex, setReplacementIndex] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const selectedReplacement =
    replacementIndex === ""
      ? null
      : order.replacementCandidates[Number(replacementIndex)] ?? null;
  const valid =
    action !== "" &&
    note.trim().length >= 5 &&
    (action !== "PARTIAL_SETTLEMENT" ||
      (Number(refundAmount) > 0 && Number(refundAmount) < order.totalAmount)) &&
    (action !== "REPLACE_INVENTORY" || Boolean(selectedReplacement));

  async function submit() {
    if (!action || !valid) return;
    setBusy(true);
    setMessage("");
    try {
      const body: Record<string, unknown> = { action, note: note.trim() };
      if (action === "PARTIAL_SETTLEMENT") {
        body.refundAmount = Number(refundAmount);
      }
      if (action === "REPLACE_INVENTORY" && selectedReplacement) {
        body.orderItemId = selectedReplacement.orderItemId;
        body.replacementListingId = selectedReplacement.listingId;
      }
      const response = await fetch(`/api/admin/disputes/${order.id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Resolution failed.");
      setMessage(payload.resolution?.label ?? "Dispute resolved.");
      await onResolved();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Resolution failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-5 rounded-control border border-ink-200 bg-surface-page p-4">
      <h3 className="text-sm font-semibold text-ink-900">Resolve dispute</h3>
      <p className="mt-1 text-xs text-ink-500">
        Sandbox only: the action persists order, payment and inventory state,
        but moves no real funds.
      </p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <Select
          label="Resolution"
          required
          value={action}
          onChange={(event) => {
            setAction(event.target.value as ResolutionAction | "");
            setMessage("");
          }}
        >
          <option value="">Choose an outcome</option>
          <option value="RELEASE_TO_SELLER">Release payment to seller</option>
          <option value="REFUND_BUYER">Full refund to buyer</option>
          <option value="REPLACE_INVENTORY">Allocate replacement inventory</option>
          <option value="PARTIAL_SETTLEMENT">Partial settlement</option>
          <option value="REJECT_DISPUTE">Reject dispute</option>
        </Select>
        {action === "PARTIAL_SETTLEMENT" ? (
          <Input
            label="Refund amount"
            type="number"
            min="0.01"
            max={Math.max(0, order.totalAmount - 0.01)}
            step="0.01"
            required
            value={refundAmount}
            onChange={(event) => setRefundAmount(event.target.value)}
            hint={`Must be below ${money(order.totalAmount)}.`}
          />
        ) : null}
        {action === "REPLACE_INVENTORY" ? (
          <Select
            label="Replacement stock"
            required
            value={replacementIndex}
            onChange={(event) => setReplacementIndex(event.target.value)}
            hint={
              order.replacementCandidates.length
                ? "Only compatible stock from the same seller is shown."
                : "No compatible replacement stock is currently available."
            }
          >
            <option value="">Choose replacement stock</option>
            {order.replacementCandidates.map((candidate, index) => (
              <option key={`${candidate.orderItemId}:${candidate.listingId}`} value={index}>
                {candidate.title} · {candidate.quantityAvailable} {candidate.unit} available
              </option>
            ))}
          </Select>
        ) : null}
      </div>
      <Textarea
        containerClassName="mt-3"
        label="Decision rationale"
        required
        rows={3}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        hint="This becomes an immutable audit event visible to both parties."
      />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button
          variant={action === "REJECT_DISPUTE" ? "danger" : "primary"}
          size="sm"
          loading={busy}
          disabled={!valid}
          onClick={() => void submit()}
        >
          Confirm resolution
        </Button>
        {message ? (
          <p role="status" className="text-xs font-medium text-ink-700">
            {message}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export default function AdminDisputesPage() {
  const [orders, setOrders] = useState<DisputeOrder[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/disputes", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to load disputes.");
      setOrders(payload.orders ?? []);
    } catch (loadError) {
      setOrders([]);
      setError(
        loadError instanceof Error ? loadError.message : "Unable to load disputes.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AdminShell
      title="Disputes & conflicts"
      description="Review the complaint, evidence and complete order history before choosing an audited sandbox resolution."
    >
      <div className="mb-6 rounded-card border border-ink-200 bg-surface-card p-5">
        <div className="flex items-start gap-3">
          <ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
          <div>
            <h2 className="text-sm font-semibold text-ink-900">Operator guardrails</h2>
            <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-ink-600">
              Inventory and sandbox payments change in one database transaction.
              If any validation fails, the whole resolution rolls back and the
              dispute remains open.
            </p>
          </div>
        </div>
      </div>

      {error ? (
        <div role="alert" className="mb-4 rounded-control border border-danger-border bg-danger-subtle p-3 text-sm text-danger-strong">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-44 w-full" />
          ))}
        </div>
      ) : orders && orders.length > 0 ? (
        <ul className="flex flex-col gap-4">
          {orders.map((order) => (
            <li key={order.id} className="rounded-card border border-ink-200 bg-surface-card p-5 shadow-card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={order.disputeStatus === "OPEN" ? "danger" : "success"} icon={order.disputeStatus === "OPEN" ? <AlertTriangle /> : <CheckCircle2 />}>
                      {words(order.reasonCode)}
                    </Badge>
                    <StatusPill status={order.disputeStatus} size="sm" />
                    <StatusPill status={order.paymentStatus} size="sm" />
                  </div>
                  <p className="mt-2 font-semibold text-ink-900">Order {order.orderNumber}</p>
                  <p className="mt-1 text-sm text-ink-600">
                    {order.buyer.companyName} · {order.buyer.email} → {order.sellers.map((seller) => seller.name).join(", ")}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold text-ink-900">{money(order.totalAmount)}</p>
                  <p className="mt-0.5 text-xs text-ink-500">Updated {new Date(order.updatedAt).toLocaleString("en-IN")}</p>
                </div>
              </div>

              <div className="mt-4 rounded-control border border-danger-border bg-danger-subtle p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-danger-strong">Complaint</p>
                <p className="mt-1 text-sm leading-relaxed text-ink-800">{order.disputeNote}</p>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <section>
                  <h3 className="flex items-center gap-2 text-sm font-semibold"><MessageSquareText className="h-4 w-4" /> Party notes</h3>
                  <div className="mt-2 space-y-2">
                    {order.partyNotes.length ? order.partyNotes.map((event) => (
                      <div key={event.id} className="rounded-control border border-ink-200 p-3 text-sm">
                        <p className="font-medium text-ink-800">{event.actor?.name ?? "System"} <span className="text-xs font-normal text-ink-500">· {event.actor?.role ?? "SYSTEM"}</span></p>
                        <p className="mt-1 text-ink-600">{event.note}</p>
                      </div>
                    )) : <p className="text-sm text-ink-500">No party notes were submitted.</p>}
                  </div>
                </section>
                <section>
                  <h3 className="flex items-center gap-2 text-sm font-semibold"><FileText className="h-4 w-4" /> Evidence</h3>
                  <ul className="mt-2 space-y-2 text-sm">
                    {order.evidence.length ? order.evidence.map((item) => (
                      <li key={item.id} className="rounded-control border border-ink-200 px-3 py-2">
                        <span className="mr-2 text-xs font-semibold text-ink-500">{words(item.kind)}</span>
                        {item.url ? <a href={item.url} className="font-medium text-copper-700 hover:underline">{item.label}</a> : <span>{item.label}</span>}
                      </li>
                    )) : <li className="text-ink-500">No evidence is attached.</li>}
                  </ul>
                </section>
              </div>

              <section className="mt-4 border-t border-ink-200 pt-4">
                <h3 className="flex items-center gap-2 text-sm font-semibold"><Clock3 className="h-4 w-4" /> Order timeline</h3>
                <ol className="mt-2 space-y-2">
                  {order.timeline.map((event) => (
                    <li key={event.id} className="flex gap-3 text-sm">
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-copper-600" />
                      <div>
                        <p className="font-medium text-ink-800">{words(event.type)} <span className="font-normal text-ink-500">· {event.actor?.name ?? "System"}</span></p>
                        <p className="text-xs text-ink-500">{new Date(event.createdAt).toLocaleString("en-IN")} · {event.fromStatus ?? "start"} → {event.toStatus}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>

              <ul className="mt-4 flex flex-col gap-1 border-t border-ink-200 pt-4 text-sm text-ink-600">
                {order.items.map((item) => (
                  <li key={item.id}>
                    {item.quantity} {item.unit} · {item.title} @ {money(item.pricePerUnit)} · <Link href={`/products/${item.listingId}`} className="font-medium text-copper-700 hover:underline">listing</Link>
                  </li>
                ))}
              </ul>

              {order.disputeStatus === "OPEN" ? (
                <ResolutionForm order={order} onResolved={load} />
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={<ShieldCheck />}
          title="No disputes"
          description="Open and resolved disputes appear here with their evidence, timeline and audited outcome."
        />
      )}
    </AdminShell>
  );
}
