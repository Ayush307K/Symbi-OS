"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { PromptDialog } from "@/components/ui/PromptDialog";
import Link from "next/link";
import { Loader2 } from "lucide-react";

export default function SellerVerificationAdminPage() {
  const [items, setItems] = useState<any[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/sellers/verification", {
      cache: "no-store",
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "Unable to load queue.");
    setItems(payload.items ?? []);
  }, []);

  useEffect(() => {
    load().catch((cause) =>
      setError(cause instanceof Error ? cause.message : "Unable to load queue."),
    );
  }, [load]);

  // The note is collected in a dialog, then this re-enters with it.
  const [pendingDecision, setPendingDecision] = useState<{ item: any; decision: string } | null>(null);

  async function decide(item: any, decision: string, note?: string) {
    if (note === undefined) {
      setPendingDecision({ item, decision });
      return;
    }
    if (decision !== "APPROVE" && !note.trim()) return;
    setBusy(item.id);
    try {
      const response = await fetch("/api/admin/sellers/verification", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          onboardingId: item.id,
          decision,
          note: note || undefined,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Decision failed.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Decision failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <AdminShell
      title="Seller verification queue"
      description="Private documents are available only to their seller and to platform operators."
    >
        {error && <p className="mb-4 rounded-md bg-danger-subtle p-3 text-red-800">{error}</p>}
        <div className="grid gap-4">
          {items.map((item) => (
            <article key={item.id} className="rounded-lg border border-ink-200 bg-surface-card p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold">{item.user.companyName}</h2>
                  <p className="text-sm text-ink-500">{item.user.email} · {item.status}</p>
                  {item.undecryptableFields?.length ? (
                    <p className="mt-1 rounded-control border border-warning-border bg-warning-subtle px-2 py-1 text-[12px] text-warning-strong">
                      Encrypted fields unreadable ({item.undecryptableFields.join(", ")}).
                      This deployment&rsquo;s FIELD_ENCRYPTION_KEY does not match the
                      key these records were written with.
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs text-ink-500">
                    {item.completion.percentage}% complete
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {["APPROVE", "CHANGES_REQUIRED", "REJECT"].map((decision) => (
                    <button
                      key={decision}
                      disabled={busy === item.id}
                      onClick={() => void decide(item, decision)}
                      className="min-h-10 rounded-md border border-ink-300 px-3 text-xs font-semibold disabled:opacity-50"
                    >
                      {busy === item.id ? <Loader2 size={14} className="animate-spin" /> : decision.replaceAll("_", " ")}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {item.documents.map((document: any) => (
                  <a
                    key={document.id}
                    href={document.url}
                    className="rounded-md bg-surface-page px-3 py-2 text-xs font-semibold"
                  >
                    {document.kind}: {document.originalName}
                  </a>
                ))}
              </div>
              {item.events.length > 0 && (
                <details className="mt-3 text-xs text-ink-500">
                  <summary>Audit history ({item.events.length})</summary>
                  {item.events.map((event: any) => (
                    <p key={event.id} className="mt-1">
                      {new Date(event.createdAt).toLocaleString()} · {event.type} · {event.fromStatus ?? "—"} → {event.toStatus}
                    </p>
                  ))}
                </details>
              )}
            </article>
          ))}
          {!items.length && !error && (
            <p className="rounded-lg border border-ink-200 bg-surface-card p-8 text-center text-ink-500">
              No seller verifications are awaiting review.
            </p>
          )}
        </div>
      <PromptDialog
        open={Boolean(pendingDecision)}
        title={
          pendingDecision?.decision === "APPROVE"
            ? "Approve this seller"
            : "Explain the decision"
        }
        description={pendingDecision?.item?.user?.companyName}
        label={pendingDecision?.decision === "APPROVE" ? "Approval note" : "Explanation for the seller"}
        placeholder={
          pendingDecision?.decision === "APPROVE"
            ? "Anything worth recording about this approval."
            : "What the seller must change before resubmitting."
        }
        required={pendingDecision?.decision !== "APPROVE"}
        confirmLabel={pendingDecision?.decision === "APPROVE" ? "Approve" : "Send decision"}
        tone={pendingDecision?.decision === "APPROVE" ? "primary" : "danger"}
        submitting={busy === pendingDecision?.item?.id}
        onClose={() => setPendingDecision(null)}
        onSubmit={(note) => {
          const target = pendingDecision;
          setPendingDecision(null);
          if (target) void decide(target.item, target.decision, note);
        }}
      />
    </AdminShell>
  );
}
