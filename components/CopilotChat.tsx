"use client";

import { useState, useRef, useEffect, useCallback, type FormEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Bot, User, Loader2, Code, Bell, X } from "lucide-react";
import { cn } from "@/lib/cn";
import type { GraphData, GraphRAGResponse } from "@/lib/types";

// ---------------------------------------------------------------------------
//  Message types
// ---------------------------------------------------------------------------

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  cypher?: string;
  timestamp: Date;
  /** If true, the "no results" demand prompt was already handled */
  demandHandled?: boolean;
}

// ---------------------------------------------------------------------------
//  Props
// ---------------------------------------------------------------------------

interface CopilotChatProps {
  onGraphData: (data: GraphData) => void;
  pendingQuery: string | null;
  onPendingConsumed: () => void;
}

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

const NO_RESULTS_PREFIX = "No matching data found";

/** Find the user message right before a given assistant message */
function findPrecedingUserQuery(
  messages: Message[],
  assistantMsgId: string
): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].id === assistantMsgId) {
      // Walk backwards to find the closest user message
      for (let j = i - 1; j >= 0; j--) {
        if (messages[j].role === "user") return messages[j].content;
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
//  Component
// ---------------------------------------------------------------------------

export default function CopilotChat({
  onGraphData,
  pendingQuery,
  onPendingConsumed,
}: CopilotChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [expandedCypher, setExpandedCypher] = useState<string | null>(null);
  const [demandLoading, setDemandLoading] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, isLoading]);

  // Handle pending query from marketplace "Analyze Match" button
  useEffect(() => {
    if (pendingQuery && !isLoading) {
      setInput(pendingQuery);
      onPendingConsumed();
      // Submit after a short delay so the user sees the populated input
      const timer = setTimeout(() => {
        submitQuery(pendingQuery);
      }, 300);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingQuery]);

  async function submitQuery(queryText: string) {
    const trimmed = queryText.trim();
    if (!trimmed || isLoading) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/graphrag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "API request failed");
      }

      const data: GraphRAGResponse = await res.json();

      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.answer || "No answer returned.",
        cypher: data.cypher || undefined,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMsg]);
      onGraphData(data.graphData);
    } catch (err: unknown) {
      const errorText =
        err instanceof Error ? err.message : "Something went wrong.";

      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `Error: ${errorText}`,
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  // Register demand for a material
  const handleRegisterDemand = useCallback(
    async (msgId: string) => {
      const userQuery = findPrecedingUserQuery(messages, msgId);
      if (!userQuery) return;

      setDemandLoading(msgId);
      try {
        const res = await fetch("/api/demand/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: userQuery }),
        });
        const data = await res.json();

        // Mark the message as handled
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId ? { ...m, demandHandled: true } : m
          )
        );

        // Add confirmation message
        const confirmMsg: Message = {
          id: crypto.randomUUID(),
          role: "assistant",
          content:
            data.status === "demand_registered"
              ? `Demand registered for "${userQuery}"! You'll be notified when a seller lists this material.`
              : data.status === "supply_found"
                ? `Good news — we found ${data.results?.length ?? 0} matching material(s) in the network! Try searching in the Marketplace Feed.`
                : "Demand registered! We'll keep looking for you.",
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, confirmMsg]);
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: "Failed to register demand. Please try again.",
            timestamp: new Date(),
          },
        ]);
      } finally {
        setDemandLoading(null);
      }
    },
    [messages]
  );

  const handleDismissDemand = useCallback((msgId: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId ? { ...m, demandHandled: true } : m
      )
    );
  }, []);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    submitQuery(input);
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-zinc-800 px-4 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-cyan-400">
          AI Copilot
        </h2>
        <p className="mt-0.5 text-xs text-zinc-500">
          Ask about supply chain pathways
        </p>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-4 scrollbar-thin"
      >
        {messages.length === 0 && !isLoading && (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <Bot size={32} className="mx-auto mb-3 text-zinc-600" />
              <p className="text-sm text-zinc-500">
                Ask me about upcycling pathways, <br />
                regulations, or supply chain matches.
              </p>
            </div>
          </div>
        )}

        <AnimatePresence mode="popLayout">
          {messages.map((msg) => {
            const isNoResults =
              msg.role === "assistant" &&
              msg.content.startsWith(NO_RESULTS_PREFIX) &&
              !msg.demandHandled;

            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className={cn(
                  "flex gap-2.5",
                  msg.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                {msg.role === "assistant" && (
                  <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cyan-500/15 text-cyan-400">
                    <Bot size={14} />
                  </div>
                )}

                <div
                  className={cn(
                    "max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed",
                    msg.role === "user"
                      ? "bg-emerald-500/15 text-emerald-100 border border-emerald-500/20"
                      : "bg-zinc-800/60 text-zinc-200 border border-zinc-700/50"
                  )}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>

                  {/* Demand registration prompt */}
                  {isNoResults && (
                    <div className="mt-2.5 rounded-md border border-amber-500/20 bg-amber-500/5 p-2.5">
                      <p className="text-xs text-amber-300/90 mb-2">
                        Would you like to register demand for this material?
                        We&apos;ll notify you when a seller lists it.
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleRegisterDemand(msg.id)}
                          disabled={demandLoading === msg.id}
                          className={cn(
                            "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                            "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
                            "hover:bg-emerald-500/25",
                            "disabled:opacity-50 disabled:cursor-not-allowed"
                          )}
                        >
                          {demandLoading === msg.id ? (
                            <Loader2 size={10} className="animate-spin" />
                          ) : (
                            <Bell size={10} />
                          )}
                          Yes, notify me
                        </button>
                        <button
                          onClick={() => handleDismissDemand(msg.id)}
                          className="flex items-center gap-1 rounded-md px-3 py-1.5 text-xs text-zinc-500 border border-zinc-700 hover:text-zinc-300 hover:border-zinc-600 transition-colors"
                        >
                          <X size={10} />
                          No thanks
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Cypher toggle */}
                  {msg.cypher && (
                    <div className="mt-2">
                      <button
                        onClick={() =>
                          setExpandedCypher(
                            expandedCypher === msg.id ? null : msg.id
                          )
                        }
                        className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-zinc-500 hover:text-zinc-300 transition-colors"
                      >
                        <Code size={10} />
                        {expandedCypher === msg.id
                          ? "Hide Cypher"
                          : "View Cypher"}
                      </button>
                      {expandedCypher === msg.id && (
                        <motion.pre
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          className="mt-1.5 overflow-x-auto rounded bg-black/50 p-2 text-[11px] text-emerald-300/80 border border-zinc-700/40"
                        >
                          {msg.cypher}
                        </motion.pre>
                      )}
                    </div>
                  )}
                </div>

                {msg.role === "user" && (
                  <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
                    <User size={14} />
                  </div>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* Loading indicator */}
        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2 text-sm text-zinc-500"
          >
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-cyan-500/15 text-cyan-400">
              <Loader2 size={14} className="animate-spin" />
            </div>
            <span>Analyzing supply chain…</span>
          </motion.div>
        )}
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="border-t border-zinc-800 px-3 py-3"
      >
        <div
          className={cn(
            "flex items-center gap-2 rounded-lg border px-3 py-2",
            "bg-zinc-900/60 backdrop-blur-sm transition-all duration-200",
            "border-zinc-700/50 focus-within:border-emerald-500/50",
            "focus-within:shadow-[0_0_15px_rgba(16,185,129,0.12)]"
          )}
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about upcycling pathways…"
            disabled={isLoading}
            className="flex-1 bg-transparent text-sm text-zinc-100 placeholder:text-zinc-600 outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-all",
              "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30",
              "hover:bg-emerald-500/30 hover:shadow-[0_0_10px_rgba(16,185,129,0.3)]",
              "disabled:opacity-30 disabled:hover:bg-emerald-500/20 disabled:hover:shadow-none"
            )}
          >
            <Send size={14} />
          </button>
        </div>
      </form>
    </div>
  );
}
