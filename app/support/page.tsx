"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Headphones, MessageSquareText } from "lucide-react";
import { MarketplaceNav } from "@/components/marketplace/MarketplaceNav";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatusPill } from "@/components/ui/StatusPill";
import { cn } from "@/lib/cn";

interface SupportTicket {
  id: string;
  ticketNumber: string;
  category: string;
  priority: string;
  status: string;
  subject: string;
  description: string;
  resolutionNote: string | null;
  createdAt: string;
  updatedAt: string;
  assignedTo: { companyName: string } | null;
  events: Array<{
    id: string;
    type: string;
    note: string | null;
    createdAt: string;
  }>;
}

function SupportContent() {
  const router = useRouter();
  const params = useSearchParams();
  const [tickets, setTickets] = useState<SupportTicket[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestedId = params.get("ticket");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/support/tickets", { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401) {
          router.push("/login?next=/support");
          return null;
        }
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error || "Unable to load support tickets.");
        return body;
      })
      .then((body) => {
        if (!cancelled && body) setTickets(body.tickets ?? []);
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load support tickets.",
          );
          setTickets([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  const selected = useMemo(
    () =>
      tickets?.find((ticket) => ticket.id === requestedId) ??
      tickets?.[0] ??
      null,
    [requestedId, tickets],
  );

  return (
    <div className="min-h-screen bg-surface-page text-ink-900">
      <MarketplaceNav />
      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-control bg-copper-700 text-white">
            <Headphones aria-hidden="true" className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold">Support</h1>
            <p className="mt-1 text-[13px] text-ink-500">
              Track issues escalated by Symbi and read the support team&rsquo;s
              resolution.
            </p>
          </div>
        </div>

        {error ? (
          <p className="mt-6 rounded-control border border-danger-border bg-danger-subtle p-3 text-sm text-danger-strong">
            {error}
          </p>
        ) : null}

        {tickets === null ? (
          <div className="mt-7 grid gap-4 lg:grid-cols-[320px_1fr]">
            <Skeleton className="h-72" />
            <Skeleton className="h-96" />
          </div>
        ) : tickets.length === 0 ? (
          <div className="mt-8">
            <EmptyState
              icon={<Headphones />}
              title="No support tickets"
              description="Ask Symbi for help first. If an issue cannot be resolved in chat, it can create a ticket with the conversation attached."
            />
          </div>
        ) : (
          <div className="mt-7 grid gap-4 lg:grid-cols-[320px_1fr]">
            <nav aria-label="Support tickets" className="flex flex-col gap-2">
              {tickets.map((ticket) => (
                <Link
                  key={ticket.id}
                  href={`/support?ticket=${ticket.id}`}
                  className={cn(
                    "rounded-card border p-4 transition-colors",
                    selected?.id === ticket.id
                      ? "border-copper-700 bg-copper-50"
                      : "border-ink-200 bg-surface-card hover:border-ink-300",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-copper-800">
                      {ticket.ticketNumber}
                    </span>
                    <StatusPill status={ticket.status} size="sm" />
                  </div>
                  <p className="mt-2 line-clamp-2 text-[13px] font-semibold">
                    {ticket.subject}
                  </p>
                  <p className="mt-1 text-[11px] text-ink-500">
                    Updated {new Date(ticket.updatedAt).toLocaleString("en-IN")}
                  </p>
                </Link>
              ))}
            </nav>

            {selected ? (
              <article className="rounded-card border border-ink-200 bg-surface-card p-5 shadow-card sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-copper-800">
                      {selected.category.replaceAll("_", " ")} ·{" "}
                      {selected.priority} priority
                    </p>
                    <h2 className="mt-1 text-lg font-semibold">
                      {selected.subject}
                    </h2>
                  </div>
                  <StatusPill status={selected.status} />
                </div>

                <section className="mt-6">
                  <h3 className="text-[12px] font-bold uppercase tracking-wide text-ink-500">
                    Conversation sent to support
                  </h3>
                  <pre className="scrollbar-thin mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-control bg-surface-sunken p-4 font-sans text-[13px] leading-relaxed text-ink-700">
                    {selected.description}
                  </pre>
                </section>

                {selected.resolutionNote ? (
                  <section className="mt-5 rounded-control border border-success-border bg-success-subtle p-4">
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-success-strong">
                      <MessageSquareText
                        aria-hidden="true"
                        className="h-4 w-4"
                      />
                      Support response
                    </h3>
                    <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-ink-700">
                      {selected.resolutionNote}
                    </p>
                  </section>
                ) : (
                  <p className="mt-5 rounded-control border border-ink-200 bg-surface-sunken p-4 text-[13px] text-ink-600">
                    No human response yet. Continue the same Symbi conversation
                    if you have more context; it will be added to the open
                    ticket.
                  </p>
                )}

                {selected.events.length > 1 ? (
                  <section className="mt-5 border-t border-ink-200 pt-4">
                    <h3 className="text-[11px] font-bold uppercase tracking-wide text-ink-500">
                      Case activity
                    </h3>
                    <ol className="mt-2 flex flex-col gap-2">
                      {selected.events.slice(1).map((event) => (
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
              </article>
            ) : null}
          </div>
        )}
      </main>
    </div>
  );
}

export default function SupportPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-surface-page" />}>
      <SupportContent />
    </Suspense>
  );
}
