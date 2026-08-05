"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { MarketplaceNav } from "@/components/marketplace/MarketplaceNav";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Loader2, Send, ShieldAlert } from "lucide-react";

interface MessageItem {
  id: string;
  senderUserId: string;
  body: string;
  createdAt: string;
  readAt: string | null;
  sender: { id: string; companyName: string };
}

export default function MessageThreadPage() {
  const params = useParams<{ id: string }>();
  const threadId = params.id;
  const [thread, setThread] = useState<any>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const load = useCallback(
    async (cursor?: string) => {
      const response = await fetch(
        `/api/messages/${threadId}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
        { cache: "no-store" },
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to load thread.");
      setThread(payload.thread);
      setMessages((current) =>
        cursor ? [...payload.messages, ...current] : payload.messages,
      );
      setNextCursor(payload.pageInfo.nextCursor);
      if (!cursor) {
        await fetch(`/api/messages/${threadId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "MARK_READ" }),
        });
      }
    },
    [threadId],
  );

  useEffect(() => {
    Promise.all([
      fetch("/api/auth/me").then((response) => response.json()),
      load(),
    ])
      .then(([me]) => setCurrentUserId(me.user?.id ?? ""))
      .catch((cause) =>
        setError(cause instanceof Error ? cause.message : "Unable to load thread."),
      );
  }, [load]);

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, body }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to send.");
      setBody("");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to send.");
    } finally {
      setBusy(false);
    }
  }

  async function action(
    value: "CLOSE" | "REOPEN" | "BLOCK" | "REPORT",
  ) {
    const details =
      value === "REPORT"
        ? window.prompt("Describe the issue for moderation") ?? ""
        : undefined;
    const response = await fetch(`/api/messages/${threadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: value,
        reasonCode: value === "REPORT" ? "OTHER" : undefined,
        details,
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error ?? "Unable to update thread.");
      return;
    }
    await load();
  }

  return (
    <main className="min-h-screen bg-surface-page p-4 sm:p-6">
      <MarketplaceNav />
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-4xl flex-col overflow-hidden rounded-xl border border-ink-200 bg-surface-card shadow-sm">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-200 p-4">
          <div className="flex items-center gap-3">
            <Link
              href="/account"
              className="flex min-h-10 min-w-10 items-center justify-center rounded-md border border-ink-300"
              aria-label="Back to account"
            >
              <ArrowLeft size={18} />
            </Link>
            <div>
              <h1 className="font-semibold text-ink-900">
                {thread?.subject ?? "Marketplace message"}
              </h1>
              <p className="text-xs text-ink-500">
                {thread?.status ?? "Loading"} · timestamps shown in your locale
              </p>
            </div>
          </div>
          {thread && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() =>
                  void action(thread.status === "CLOSED" ? "REOPEN" : "CLOSE")
                }
                className="min-h-10 rounded-md border border-ink-300 px-3 text-xs font-semibold"
              >
                {thread.status === "CLOSED" ? "Reopen" : "Close"}
              </button>
              <button
                onClick={() => void action("REPORT")}
                className="min-h-10 rounded-md border border-amber-300 px-3 text-xs font-semibold text-amber-800"
              >
                Report
              </button>
              <button
                onClick={() => void action("BLOCK")}
                className="min-h-10 rounded-md border border-red-300 px-3 text-xs font-semibold text-danger-strong"
              >
                Block
              </button>
            </div>
          )}
        </header>
        {nextCursor && (
          <button
            onClick={() => void load(nextCursor)}
            className="mx-auto mt-3 rounded-md border border-ink-300 px-3 py-2 text-xs font-semibold"
          >
            Load older messages
          </button>
        )}
        <section
          aria-live="polite"
          className="flex-1 space-y-3 overflow-y-auto p-4"
        >
          {messages.map((message) => {
            const own = message.senderUserId === currentUserId;
            return (
              <article
                key={message.id}
                className={`max-w-[85%] rounded-xl p-3 ${
                  own
                    ? "ml-auto bg-brand text-white"
                    : "bg-surface-page text-ink-900"
                }`}
              >
                <p className="text-xs font-semibold opacity-75">
                  {message.sender.companyName}
                </p>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm">
                  {message.body}
                </p>
                <time className="mt-2 block text-[11px] opacity-70">
                  {new Date(message.createdAt).toLocaleString()}
                  {own && message.readAt ? " · Read" : ""}
                </time>
              </article>
            );
          })}
        </section>
        {error && (
          <div className="mx-4 mb-2 flex items-center gap-2 rounded-md bg-danger-subtle p-3 text-sm text-red-800">
            <ShieldAlert size={16} />
            {error}
          </div>
        )}
        <form onSubmit={send} className="border-t border-ink-200 p-4">
          <div className="flex gap-2">
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              maxLength={4000}
              disabled={thread?.status !== "OPEN" || busy}
              placeholder={
                thread?.status === "OPEN"
                  ? "Write a message…"
                  : "Reopen the thread to reply."
              }
              className="min-h-12 flex-1 resize-none rounded-md border border-ink-300 p-3 text-sm outline-none focus:border-emerald-700"
            />
            <button
              disabled={
                busy || !body.trim() || thread?.status !== "OPEN"
              }
              className="flex min-h-12 min-w-12 items-center justify-center rounded-md bg-brand text-white disabled:opacity-50"
              aria-label="Send message"
            >
              {busy ? <Loader2 className="animate-spin" /> : <Send />}
            </button>
          </div>
          <p className="mt-1 text-right text-xs text-ink-400">
            {body.length}/4000 · attachments are disabled in v0
          </p>
        </form>
      </div>
    </main>
  );
}
