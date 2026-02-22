"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Gavel, Loader2, Check, X, Clock, DollarSign, Hash,
  ArrowDownLeft, ArrowUpRight,
} from "lucide-react";
import { cn } from "@/lib/cn";

// ---------------------------------------------------------------------------
//  Types
// ---------------------------------------------------------------------------

interface Bid {
  id: string;
  materialName: string;
  materialId: string | null;
  quantity: number;
  pricePerUnit: number;
  status: string;
  bidderUserId: string;
  bidderEmail: string;
  bidderCompany: string;
  sellerUserId: string;
  createdAt: string;
}

type TabKey = "incoming" | "outgoing";

// ---------------------------------------------------------------------------
//  Component
// ---------------------------------------------------------------------------

export default function BidManager() {
  const [tab, setTab] = useState<TabKey>("incoming");
  const [bids, setBids] = useState<Bid[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchBids = useCallback(async (role: "seller" | "buyer") => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/bids?role=${role}`);
      if (res.ok) {
        const data: Bid[] = await res.json();
        setBids(data);
      }
    } catch {
      setBids([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBids(tab === "incoming" ? "seller" : "buyer");
  }, [tab, fetchBids]);

  const handleDecision = useCallback(
    async (bidId: string, decision: "accepted" | "rejected") => {
      setActionLoading(bidId);
      try {
        const res = await fetch(`/api/bids/${bidId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: decision }),
        });
        if (res.ok) {
          setBids((prev) =>
            prev.map((b) => (b.id === bidId ? { ...b, status: decision } : b))
          );
        }
      } catch {
        // ignore
      } finally {
        setActionLoading(null);
      }
    },
    []
  );

  const statusBadge = (status: string) => {
    switch (status) {
      case "accepted":
        return (
          <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
            <Check size={9} /> Accepted
          </span>
        );
      case "rejected":
        return (
          <span className="flex items-center gap-1 rounded-full bg-red-500/15 border border-red-500/30 px-2 py-0.5 text-[10px] font-semibold text-red-400">
            <X size={9} /> Rejected
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[10px] font-semibold text-amber-400">
            <Clock size={9} /> Pending
          </span>
        );
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Tab bar */}
      <div className="shrink-0 flex border-b border-zinc-800">
        <button
          onClick={() => setTab("incoming")}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-semibold uppercase tracking-wider border-b-2 transition-colors",
            tab === "incoming"
              ? "text-amber-400 border-amber-400"
              : "text-zinc-500 border-transparent hover:text-zinc-300"
          )}
        >
          <ArrowDownLeft size={12} />
          Incoming Bids
        </button>
        <button
          onClick={() => setTab("outgoing")}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-semibold uppercase tracking-wider border-b-2 transition-colors",
            tab === "outgoing"
              ? "text-cyan-400 border-cyan-400"
              : "text-zinc-500 border-transparent hover:text-zinc-300"
          )}
        >
          <ArrowUpRight size={12} />
          My Bids
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 scrollbar-thin">
        {isLoading && (
          <div className="flex h-32 items-center justify-center">
            <Loader2 size={20} className="animate-spin text-zinc-500" />
          </div>
        )}

        {!isLoading && bids.length === 0 && (
          <div className="flex h-32 items-center justify-center text-center">
            <div>
              <Gavel size={28} className="mx-auto mb-2 text-zinc-700" />
              <p className="text-xs text-zinc-500">
                {tab === "incoming"
                  ? "No incoming bids yet. List materials to receive bids."
                  : "No bids placed yet. Browse the marketplace to bid on materials."}
              </p>
            </div>
          </div>
        )}

        <AnimatePresence mode="popLayout">
          {bids.map((bid, i) => (
            <motion.div
              key={bid.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ delay: i * 0.03, duration: 0.25 }}
              className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h4 className="text-sm font-medium text-zinc-100">{bid.materialName}</h4>
                  <p className="text-[10px] text-zinc-500 mt-0.5">
                    {tab === "incoming"
                      ? `From: ${bid.bidderCompany}`
                      : `Bid placed ${new Date(bid.createdAt).toLocaleDateString()}`}
                  </p>
                </div>
                {statusBadge(bid.status)}
              </div>

              <div className="mt-2 flex items-center gap-4">
                <div className="flex items-center gap-1 text-xs">
                  <DollarSign size={11} className="text-emerald-500" />
                  <span className="font-semibold text-emerald-400">
                    ${bid.pricePerUnit.toFixed(2)}
                  </span>
                  <span className="text-zinc-600">/unit</span>
                </div>
                <div className="flex items-center gap-1 text-xs">
                  <Hash size={11} className="text-cyan-500" />
                  <span className="font-semibold text-cyan-400">{bid.quantity}</span>
                  <span className="text-zinc-600">units</span>
                </div>
                <div className="text-xs text-zinc-500">
                  Total: <span className="text-zinc-300 font-medium">${(bid.pricePerUnit * bid.quantity).toFixed(2)}</span>
                </div>
              </div>

              {/* Accept / Reject buttons for incoming pending bids */}
              {tab === "incoming" && bid.status === "pending" && (
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => handleDecision(bid.id, "accepted")}
                    disabled={actionLoading === bid.id}
                    className={cn(
                      "flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5",
                      "bg-emerald-500/15 text-xs font-semibold text-emerald-400",
                      "border border-emerald-500/30 hover:bg-emerald-500/25 transition-all",
                      "disabled:opacity-40 disabled:cursor-not-allowed"
                    )}
                  >
                    {actionLoading === bid.id ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Check size={12} />
                    )}
                    Accept
                  </button>
                  <button
                    onClick={() => handleDecision(bid.id, "rejected")}
                    disabled={actionLoading === bid.id}
                    className={cn(
                      "flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5",
                      "bg-red-500/10 text-xs font-semibold text-red-400",
                      "border border-red-500/20 hover:bg-red-500/20 transition-all",
                      "disabled:opacity-40 disabled:cursor-not-allowed"
                    )}
                  >
                    <X size={12} />
                    Reject
                  </button>
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
