"use client";

import { useState } from "react";
import { Loader2, Route, MapPin, Factory, Gauge, Search } from "lucide-react";
import { cn } from "@/lib/cn";

// ---------------------------------------------------------------------------
//  Types
// ---------------------------------------------------------------------------

interface SupplyRoute {
  producer: string;
  producerLocation: string;
  producerIndustry: string;
  material: string;
  materialCategory: string;
  materialToxicity: string;
  upcycler: string;
  upcyclerLocation: string;
  upcyclerIndustry: string;
  distanceKm: number;
  upcyclerCapacity: number;
  alsoUpcycles: string[];
}

// ---------------------------------------------------------------------------
//  Component
// ---------------------------------------------------------------------------

export default function MultiHopExplorer() {
  const [material, setMaterial] = useState("");
  const [maxDistance, setMaxDistance] = useState(5000);
  const [routes, setRoutes] = useState<SupplyRoute[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  async function handleSearch() {
    if (!material.trim()) return;
    setIsLoading(true);
    setSearched(true);
    try {
      const res = await fetch("/api/multi-hop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          material: material.trim(),
          maxDistanceKm: maxDistance,
        }),
      });
      const data = await res.json();
      setRoutes(data.routes ?? []);
    } catch {
      setRoutes([]);
    } finally {
      setIsLoading(false);
    }
  }

  const TOXICITY_COLORS: Record<string, string> = {
    low: "text-emerald-400",
    medium: "text-amber-400",
    high: "text-red-400",
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="shrink-0 border-b border-zinc-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <Route size={14} className="text-cyan-400" />
          <h2 className="text-sm font-semibold uppercase tracking-widest text-cyan-400/80">
            Supply Routes
          </h2>
        </div>
        <p className="mt-0.5 text-[10px] text-zinc-500">
          Multi-hop constraint solving with geospatial filtering
        </p>
      </div>

      {/* Search controls */}
      <div className="shrink-0 border-b border-zinc-800 px-3 py-2.5 space-y-2">
        <div className="flex gap-2">
          <input
            type="text"
            value={material}
            onChange={(e) => setMaterial(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Waste material name…"
            className="flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-cyan-500/50"
          />
          <button
            onClick={handleSearch}
            disabled={isLoading || !material.trim()}
            className={cn(
              "flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium",
              "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30",
              "hover:bg-cyan-500/25 transition-colors",
              "disabled:opacity-40 disabled:cursor-not-allowed"
            )}
          >
            {isLoading ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Search size={12} />
            )}
            Find
          </button>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[10px] text-zinc-500 shrink-0">Max distance:</label>
          <input
            type="range"
            min={500}
            max={15000}
            step={500}
            value={maxDistance}
            onChange={(e) => setMaxDistance(Number(e.target.value))}
            className="flex-1 accent-cyan-500"
          />
          <span className="text-[10px] text-zinc-400 w-16 text-right tabular-nums">
            {maxDistance.toLocaleString()} km
          </span>
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 scrollbar-thin">
        {!searched && (
          <div className="flex h-32 items-center justify-center text-zinc-600 text-xs">
            Search for a waste material to discover supply chain routes
          </div>
        )}

        {searched && !isLoading && routes.length === 0 && (
          <div className="flex h-32 items-center justify-center text-zinc-600 text-xs">
            No routes found. Try a different material or increase max distance.
          </div>
        )}

        {routes.map((route, i) => (
          <div
            key={`${route.producer}-${route.upcycler}-${i}`}
            className={cn(
              "rounded-lg border border-zinc-800 bg-zinc-900/50 p-3",
              "hover:border-cyan-500/30 transition-colors"
            )}
          >
            {/* Route header: distance + capacity */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <MapPin size={10} className="text-cyan-400" />
                <span className="text-[10px] font-bold text-cyan-400 tabular-nums">
                  {route.distanceKm.toLocaleString()} km
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Gauge size={10} className="text-zinc-500" />
                <span className="text-[10px] text-zinc-500 tabular-nums">
                  {route.upcyclerCapacity.toLocaleString()} t/yr
                </span>
                <span
                  className={cn(
                    "text-[9px] font-semibold uppercase",
                    TOXICITY_COLORS[route.materialToxicity] ?? "text-zinc-400"
                  )}
                >
                  {route.materialToxicity}
                </span>
              </div>
            </div>

            {/* Route visualization */}
            <div className="space-y-1">
              {/* Producer */}
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-blue-500 shrink-0" />
                <div className="min-w-0">
                  <span className="text-[11px] font-medium text-zinc-200">
                    {route.producer}
                  </span>
                  <span className="text-[9px] text-zinc-500 ml-1.5">
                    {route.producerLocation}
                  </span>
                </div>
              </div>

              {/* Arrow */}
              <div className="flex items-center gap-2 pl-0.5">
                <div className="w-1 flex flex-col items-center">
                  <div className="h-2 w-px bg-zinc-600" />
                  <div className="text-zinc-600 text-[8px] leading-none">▼</div>
                </div>
                <span className="text-[9px] text-emerald-400/70 font-medium">
                  {route.material}
                </span>
              </div>

              {/* Upcycler */}
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                <div className="min-w-0">
                  <span className="text-[11px] font-medium text-zinc-200">
                    {route.upcycler}
                  </span>
                  <span className="text-[9px] text-zinc-500 ml-1.5">
                    {route.upcyclerLocation}
                  </span>
                </div>
              </div>
            </div>

            {/* Also upcycles */}
            {route.alsoUpcycles.length > 0 && (
              <p className="mt-1.5 text-[9px] text-zinc-600">
                Also handles: {route.alsoUpcycles.join(", ")}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
