"use client";

import { useEffect, useState } from "react";
import { Loader2, Handshake, Factory, MapPin, Layers } from "lucide-react";
import { cn } from "@/lib/cn";

// ---------------------------------------------------------------------------
//  Types
// ---------------------------------------------------------------------------

interface PartnershipInsight {
  company1: string;
  industry1: string;
  location1: string;
  company2: string;
  industry2: string;
  location2: string;
  score: number;
  sharedMaterials: number;
  sharedNames: string[];
}

// ---------------------------------------------------------------------------
//  Component
// ---------------------------------------------------------------------------

export default function ProactiveInsights() {
  const [insights, setInsights] = useState<PartnershipInsight[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchInsights() {
      try {
        const res = await fetch("/api/insights");
        if (!res.ok) throw new Error("Failed to fetch insights");
        const data = await res.json();
        setInsights(data.insights ?? []);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setIsLoading(false);
      }
    }
    fetchInsights();
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-zinc-500">
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-xs text-red-400">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="shrink-0 border-b border-zinc-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <Handshake size={14} className="text-violet-400" />
          <h2 className="text-sm font-semibold uppercase tracking-widest text-violet-400/80">
            Proactive Insights
          </h2>
        </div>
        <p className="mt-0.5 text-[10px] text-zinc-500">
          {insights.length} AI-discovered B2B partnership opportunities
        </p>
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5 scrollbar-thin">
        {insights.map((insight, i) => {
          const pct = Math.round(insight.score * 100);
          return (
            <div
              key={`${insight.company1}-${insight.company2}-${i}`}
              className={cn(
                "rounded-lg border border-zinc-800 bg-zinc-900/50 p-3",
                "hover:border-violet-500/30 transition-colors"
              )}
            >
              {/* Score badge */}
              <div className="flex items-center justify-between mb-2">
                <span className="rounded-full bg-violet-500/15 border border-violet-500/30 px-2 py-0.5 text-[10px] font-bold text-violet-400">
                  {pct}% match
                </span>
                <span className="text-[10px] text-zinc-600">
                  {insight.sharedMaterials} shared materials
                </span>
              </div>

              {/* Company pair */}
              <div className="space-y-1.5">
                <div className="flex items-start gap-2">
                  <Factory size={12} className="mt-0.5 shrink-0 text-blue-400" />
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium text-zinc-100 truncate">
                      {insight.company1}
                    </p>
                    <p className="text-[9px] text-zinc-500 truncate">
                      {insight.industry1} · {insight.location1}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 pl-1">
                  <div className="h-3 w-px bg-violet-500/30" />
                  <Handshake size={8} className="text-violet-400/50" />
                  <div className="h-3 w-px bg-violet-500/30" />
                </div>

                <div className="flex items-start gap-2">
                  <Factory size={12} className="mt-0.5 shrink-0 text-emerald-400" />
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium text-zinc-100 truncate">
                      {insight.company2}
                    </p>
                    <p className="text-[9px] text-zinc-500 truncate">
                      {insight.industry2} · {insight.location2}
                    </p>
                  </div>
                </div>
              </div>

              {/* Shared materials */}
              {insight.sharedNames.length > 0 && (
                <div className="mt-2 flex items-start gap-1.5">
                  <Layers size={10} className="mt-0.5 shrink-0 text-zinc-500" />
                  <p className="text-[9px] text-zinc-500 leading-relaxed">
                    {insight.sharedNames.join(", ")}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
