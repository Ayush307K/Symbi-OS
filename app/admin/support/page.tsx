"use client";

import { useCallback, useEffect, useState } from "react";
import { Headphones, UserRoundCheck } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatusPill } from "@/components/ui/StatusPill";
import { Textarea } from "@/components/ui/Textarea";

interface Ticket {
  id: string;
  ticketNumber: string;
  category: string;
  priority: string;
  status: string;
  subject: string;
  description: string;
  resolutionNote: string | null;
  updatedAt: string;
  requester: { email: string; companyName: string; role: string };
  assignedTo: { companyName: string; email: string } | null;
  events: Array<{
    id: string;
    type: string;
    note: string | null;
    createdAt: string;
  }>;
}

export default function AdminSupportPage() {
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/support", { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(body.error || "Unable to load support queue.");
    setTickets(body.tickets ?? []);
  }, []);

  useEffect(() => {
    load().catch((loadError) => {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load support queue.",
      );
      setTickets([]);
    });
  }, [load]);

  async function update(
    ticket: Ticket,
    payload: {
      status?: string;
      resolutionNote?: string;
      assignToSelf?: boolean;
    },
  ) {
    setBusy(ticket.id);
    setError(null);
    try {
      const response = await fetch(`/api/admin/support/${ticket.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(body.error || "Unable to update support ticket.");
      setNotes((current) => ({ ...current, [ticket.id]: "" }));
      await load();
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Unable to update support ticket.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <AdminShell
      title="Customer support"
      description="Assistant escalations that need a human decision or account-level intervention."
    >
      {error ? (
        <p className="mb-4 rounded-control border border-danger-border bg-danger-subtle p-3 text-sm text-danger-strong">
          {error}
        </p>
      ) : null}

      {tickets === null ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-72" />
          ))}
        </div>
      ) : tickets.length === 0 ? (
        <EmptyState
          icon={<Headphones />}
          title="No support tickets"
          description="Unresolved assistant conversations and explicit human-support requests appear here."
        />
      ) : (
        <ol className="flex flex-col gap-4">
          {tickets.map((ticket) => {
            const note = notes[ticket.id] ?? "";
            return (
              <li
                key={ticket.id}
                className="rounded-card border border-ink-200 bg-surface-card p-5 shadow-card"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-bold text-copper-800">
                        {ticket.ticketNumber}
                      </span>
                      <StatusPill status={ticket.status} size="sm" />
                      <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-medium text-ink-600">
                        {ticket.priority} ·{" "}
                        {ticket.category.replaceAll("_", " ")}
                      </span>
                    </div>
                    <h2 className="mt-2 text-base font-semibold">
                      {ticket.subject}
                    </h2>
                    <p className="mt-1 text-[12px] text-ink-500">
                      {ticket.requester.companyName} · {ticket.requester.email}{" "}
                      · {ticket.requester.role}
                    </p>
                  </div>
                  <p className="text-[11px] text-ink-500">
                    Updated {new Date(ticket.updatedAt).toLocaleString("en-IN")}
                  </p>
                </div>

                <details className="mt-4 rounded-control border border-ink-200 bg-surface-sunken p-3">
                  <summary className="cursor-pointer text-[12px] font-semibold text-ink-700">
                    Attached conversation
                  </summary>
                  <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap font-sans text-[12px] leading-relaxed text-ink-600">
                    {ticket.description}
                  </pre>
                </details>

                {ticket.events.length > 1 ? (
                  <section className="mt-3 rounded-control border border-ink-200 p-3">
                    <h3 className="text-[11px] font-bold uppercase tracking-wide text-ink-500">
                      Case updates
                    </h3>
                    <ol className="mt-2 flex flex-col gap-2">
                      {ticket.events.slice(1).map((event) => (
                        <li key={event.id} className="text-[12px] text-ink-600">
                          <span className="font-semibold text-ink-700">
                            {event.type.replaceAll("_", " ")}
                          </span>{" "}
                          · {new Date(event.createdAt).toLocaleString("en-IN")}
                          {event.note ? (
                            <p className="mt-0.5 whitespace-pre-wrap">
                              {event.note}
                            </p>
                          ) : null}
                        </li>
                      ))}
                    </ol>
                  </section>
                ) : null}

                {ticket.resolutionNote ? (
                  <p className="mt-3 rounded-control border border-success-border bg-success-subtle p-3 text-[13px] text-ink-700">
                    <strong>Latest response:</strong> {ticket.resolutionNote}
                  </p>
                ) : null}

                <div className="mt-4 border-t border-ink-200 pt-4">
                  <Textarea
                    label="Response or resolution note"
                    value={note}
                    rows={3}
                    maxLength={3000}
                    placeholder="Explain what was checked, what changed, or what the user must provide next."
                    onChange={(event) =>
                      setNotes((current) => ({
                        ...current,
                        [ticket.id]: event.target.value,
                      }))
                    }
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      leadingIcon={<UserRoundCheck className="h-4 w-4" />}
                      loading={busy === ticket.id}
                      onClick={() =>
                        void update(ticket, {
                          status: "IN_PROGRESS",
                          assignToSelf: true,
                        })
                      }
                    >
                      Assign to me
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={note.trim().length < 3 || busy === ticket.id}
                      onClick={() =>
                        void update(ticket, {
                          status: "WAITING_ON_USER",
                          resolutionNote: note.trim(),
                          assignToSelf: true,
                        })
                      }
                    >
                      Request information
                    </Button>
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={note.trim().length < 3 || busy === ticket.id}
                      onClick={() =>
                        void update(ticket, {
                          status: "RESOLVED",
                          resolutionNote: note.trim(),
                          assignToSelf: true,
                        })
                      }
                    >
                      Resolve ticket
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </AdminShell>
  );
}
