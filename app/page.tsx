"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import NavBar from "@/components/NavBar";
import MarketplaceFeed from "@/components/MarketplaceFeed";
import CopilotChat from "@/components/CopilotChat";
import ProactiveInsights from "@/components/ProactiveInsights";
import MultiHopExplorer from "@/components/MultiHopExplorer";
import BidManager from "@/components/BidManager";
import type { GraphData } from "@/lib/types";

// Dynamically import NeuralMap with SSR disabled.
const NeuralMap = dynamic(() => import("@/components/NeuralMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-zinc-600 text-sm">
      Initializing Neural Map…
    </div>
  ),
});

// ---------------------------------------------------------------------------
//  Tab config for right panel
// ---------------------------------------------------------------------------

type RightTab = "graph" | "insights" | "routes" | "bids";

const TABS: { key: RightTab; label: string; color: string }[] = [
  { key: "graph", label: "Neural Map", color: "emerald" },
  { key: "insights", label: "Insights", color: "violet" },
  { key: "routes", label: "Supply Routes", color: "cyan" },
  { key: "bids", label: "Bids", color: "amber" },
];

const TAB_COLORS: Record<string, { active: string; inactive: string }> = {
  emerald: {
    active: "text-emerald-400 border-emerald-400",
    inactive: "text-zinc-500 border-transparent hover:text-zinc-300",
  },
  violet: {
    active: "text-violet-400 border-violet-400",
    inactive: "text-zinc-500 border-transparent hover:text-zinc-300",
  },
  cyan: {
    active: "text-cyan-400 border-cyan-400",
    inactive: "text-zinc-500 border-transparent hover:text-zinc-300",
  },
  amber: {
    active: "text-amber-400 border-amber-400",
    inactive: "text-zinc-500 border-transparent hover:text-zinc-300",
  },
};

// ---------------------------------------------------------------------------
//  Page
// ---------------------------------------------------------------------------

export default function Home() {
  const [graphData, setGraphData] = useState<GraphData>({
    nodes: [],
    edges: [],
  });
  const [pendingQuery, setPendingQuery] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<RightTab>("graph");

  // Track the right panel dimensions for the graph canvas.
  const rightPanelRef = useRef<HTMLDivElement>(null);
  const [panelSize, setPanelSize] = useState({ width: 600, height: 600 });

  useEffect(() => {
    function measure() {
      if (rightPanelRef.current) {
        setPanelSize({
          width: rightPanelRef.current.clientWidth,
          height: rightPanelRef.current.clientHeight,
        });
      }
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const handleGraphData = useCallback((data: GraphData) => {
    setGraphData(data);
    setActiveTab("graph"); // switch to graph tab when new data arrives
  }, []);

  const handleAnalyze = useCallback((materialName: string) => {
    setPendingQuery(
      `Find upcycle pathways and compliance regulations for ${materialName}`
    );
  }, []);

  const handlePendingConsumed = useCallback(() => {
    setPendingQuery(null);
  }, []);

  return (
    <div className="flex h-screen flex-col bg-zinc-950 text-zinc-100">
      <NavBar />

      <main className="flex min-h-0 flex-1">
        {/* Column 1 — Marketplace Feed (25%) */}
        <aside className="w-[25%] shrink-0 border-r border-zinc-800 overflow-hidden">
          <MarketplaceFeed onAnalyze={handleAnalyze} />
        </aside>

        {/* Column 2 — AI Copilot (30%) */}
        <section className="w-[30%] shrink-0 border-r border-zinc-800 overflow-hidden">
          <CopilotChat
            onGraphData={handleGraphData}
            pendingQuery={pendingQuery}
            onPendingConsumed={handlePendingConsumed}
          />
        </section>

        {/* Column 3 — Tabbed Panel (45%) */}
        <section className="relative flex-1 flex flex-col overflow-hidden">
          {/* Tab bar */}
          <div className="shrink-0 flex border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-sm">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.key;
              const colors = TAB_COLORS[tab.color];
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex-1 py-2.5 text-[11px] font-semibold uppercase tracking-wider border-b-2 transition-colors ${
                    isActive ? colors.active : colors.inactive
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          <div ref={rightPanelRef} className="relative flex-1 overflow-hidden">
            {/* Subtle grid background */}
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.03]"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(16,185,129,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(16,185,129,0.3) 1px, transparent 1px)",
                backgroundSize: "40px 40px",
              }}
            />

            {activeTab === "graph" && (
              <NeuralMap
                graphData={graphData}
                width={panelSize.width}
                height={panelSize.height}
              />
            )}

            {activeTab === "insights" && <ProactiveInsights />}

            {activeTab === "routes" && <MultiHopExplorer />}

            {activeTab === "bids" && <BidManager />}
          </div>
        </section>
      </main>
    </div>
  );
}
