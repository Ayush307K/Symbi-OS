"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FlaskConical, MapPin, Zap, Loader2, Tag, ChevronDown,
  Search, X, Sparkles, ArrowRight, Plus, Package, Check, Users,
  DollarSign, Hash, Gavel,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useAuth } from "@/context/AuthContext";

// ---------------------------------------------------------------------------
//  Types
// ---------------------------------------------------------------------------

interface MaterialListing {
  id: string;
  name: string;
  toxicity: string;
  baseElement: string;
  category: string;
  producer: string;
  producerId: string;
  sellerUserId: string | null;
  location: string;
  price: number | null;
  quantity: number | null;
}

interface SemanticResult {
  id: string;
  name: string;
  category: string;
  toxicity: string;
  baseElement: string;
  similarity: number;
  producers: string[];
}

interface Recommendation {
  id: string;
  name: string;
  category: string;
  toxicity: string;
}

// ---------------------------------------------------------------------------
//  Constants
// ---------------------------------------------------------------------------

const TOXICITY_STYLES: Record<string, string> = {
  low: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  medium: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  high: "bg-red-500/15 text-red-400 border-red-500/30",
};

// ---------------------------------------------------------------------------
//  Props
// ---------------------------------------------------------------------------

interface MarketplaceFeedProps {
  onAnalyze: (materialName: string) => void;
}

// ---------------------------------------------------------------------------
//  Component
// ---------------------------------------------------------------------------

export default function MarketplaceFeed({ onAnalyze }: MarketplaceFeedProps) {
  const { user } = useAuth();
  const [listings, setListings] = useState<MaterialListing[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("All");

  // Hybrid semantic search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SemanticResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchMode, setSearchMode] = useState(false);

  // Recommendations state
  const [expandedRecs, setExpandedRecs] = useState<string | null>(null);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [isLoadingRecs, setIsLoadingRecs] = useState(false);

  // Sell form state
  const [showSellForm, setShowSellForm] = useState(false);
  const [sellName, setSellName] = useState("");
  const [sellCategory, setSellCategory] = useState("Uncategorized");
  const [sellToxicity, setSellToxicity] = useState("low");
  const [sellDescription, setSellDescription] = useState("");
  const [sellPrice, setSellPrice] = useState("");
  const [sellQuantity, setSellQuantity] = useState("");
  const [isSelling, setIsSelling] = useState(false);
  const [sellResult, setSellResult] = useState<{
    success: boolean;
    message: string;
    matchedBuyers: { companyName: string }[];
  } | null>(null);

  // Bid modal state
  const [bidTarget, setBidTarget] = useState<MaterialListing | null>(null);
  const [bidQty, setBidQty] = useState("");
  const [bidPrice, setBidPrice] = useState("");
  const [isBidding, setIsBidding] = useState(false);
  const [bidResult, setBidResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleSellSubmit = useCallback(async () => {
    if (!sellName.trim()) return;
    setIsSelling(true);
    setSellResult(null);
    try {
      const res = await fetch("/api/materials/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: sellName.trim(),
          category: sellCategory,
          toxicity: sellToxicity,
          description: sellDescription.trim() || undefined,
          price: sellPrice ? parseFloat(sellPrice) : undefined,
          quantity: sellQuantity ? parseInt(sellQuantity) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to list material");
      setSellResult({
        success: true,
        message: data.message,
        matchedBuyers: data.matchedBuyers ?? [],
      });
      setSellName("");
      setSellDescription("");
      setSellPrice("");
      setSellQuantity("");
      const matRes = await fetch("/api/materials");
      if (matRes.ok) {
        const matData: MaterialListing[] = await matRes.json();
        setListings(matData);
      }
    } catch (err: unknown) {
      setSellResult({
        success: false,
        message: err instanceof Error ? err.message : "Failed to list material",
        matchedBuyers: [],
      });
    } finally {
      setIsSelling(false);
    }
  }, [sellName, sellCategory, sellToxicity, sellDescription, sellPrice, sellQuantity]);

  const handleBidSubmit = useCallback(async () => {
    if (!bidTarget || !bidQty || !bidPrice) return;
    setIsBidding(true);
    setBidResult(null);
    try {
      const res = await fetch("/api/bids", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          materialName: bidTarget.name,
          materialId: bidTarget.id,
          quantity: parseInt(bidQty),
          pricePerUnit: parseFloat(bidPrice),
          sellerUserId: bidTarget.sellerUserId || undefined,
          producerId: bidTarget.producerId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to place bid");
      setBidResult({ success: true, message: "Bid placed successfully! The seller will be notified." });
      setBidQty("");
      setBidPrice("");
    } catch (err: unknown) {
      setBidResult({
        success: false,
        message: err instanceof Error ? err.message : "Failed to place bid",
      });
    } finally {
      setIsBidding(false);
    }
  }, [bidTarget, bidQty, bidPrice]);

  useEffect(() => {
    async function fetchMaterials() {
      try {
        const res = await fetch("/api/materials");
        if (!res.ok) throw new Error("Failed to fetch materials");
        const data: MaterialListing[] = await res.json();
        setListings(data);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setIsLoading(false);
      }
    }
    fetchMaterials();
  }, []);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      setSearchMode(false);
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    setSearchMode(true);
    try {
      const res = await fetch("/api/hybrid-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery.trim(), topK: 15 }),
      });
      const data = await res.json();
      setSearchResults(data.results ?? []);
    } catch {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery]);

  const fetchRecs = useCallback(async (materialName: string) => {
    if (expandedRecs === materialName) {
      setExpandedRecs(null);
      return;
    }
    setExpandedRecs(materialName);
    setIsLoadingRecs(true);
    try {
      const res = await fetch("/api/recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ materialName }),
      });
      const data = await res.json();
      setRecs(data.recommendations ?? []);
    } catch {
      setRecs([]);
    } finally {
      setIsLoadingRecs(false);
    }
  }, [expandedRecs]);

  const categories = [
    "All",
    ...Array.from(new Set(listings.map((l) => l.category).filter(Boolean))).sort(),
  ];
  const filtered =
    selectedCategory === "All"
      ? listings
      : listings.filter((l) => l.category === selectedCategory);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="shrink-0 border-b border-zinc-800 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-widest text-emerald-400">
              Marketplace Feed
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              {isLoading
                ? "Loading…"
                : searchMode
                  ? `${searchResults.length} semantic matches`
                  : `${filtered.length} of ${listings.length} materials`}
            </p>
          </div>
          <button
            onClick={() => {
              setShowSellForm(!showSellForm);
              setSellResult(null);
            }}
            className={cn(
              "flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[10px] font-semibold transition-all",
              showSellForm
                ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                : "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25"
            )}
          >
            {showSellForm ? <X size={10} /> : <Plus size={10} />}
            {showSellForm ? "Close" : "List Material"}
          </button>
        </div>
      </div>

      {/* Sell Form */}
      <AnimatePresence>
        {showSellForm && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="shrink-0 overflow-hidden border-b border-zinc-800"
          >
            <div className="px-3 py-3 space-y-2">
              <div className="flex items-center gap-1.5 mb-1">
                <Package size={12} className="text-amber-400" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-400/80">
                  List a Material for Sale
                </span>
              </div>

              <input
                type="text"
                value={sellName}
                onChange={(e) => setSellName(e.target.value)}
                placeholder="Material name…"
                className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-amber-500/50"
              />

              <div className="flex gap-2">
                <select
                  value={sellCategory}
                  onChange={(e) => setSellCategory(e.target.value)}
                  className="flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-300 outline-none focus:border-amber-500/50"
                >
                  <option value="Uncategorized">Category…</option>
                  <option value="Metals & Alloys">Metals & Alloys</option>
                  <option value="Polymers & Plastics">Polymers & Plastics</option>
                  <option value="Chemicals">Chemicals</option>
                  <option value="E-Waste">E-Waste</option>
                  <option value="Energy Materials">Energy Materials</option>
                  <option value="Bio-Materials">Bio-Materials</option>
                  <option value="Textiles">Textiles</option>
                  <option value="Construction">Construction</option>
                </select>
                <select
                  value={sellToxicity}
                  onChange={(e) => setSellToxicity(e.target.value)}
                  className="w-24 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-300 outline-none focus:border-amber-500/50"
                >
                  <option value="low">Low tox</option>
                  <option value="medium">Medium tox</option>
                  <option value="high">High tox</option>
                </select>
              </div>

              <div className="flex gap-2">
                <div className="relative flex-1">
                  <DollarSign size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <input
                    type="number"
                    value={sellPrice}
                    onChange={(e) => setSellPrice(e.target.value)}
                    placeholder="Price/unit"
                    min="0"
                    step="0.01"
                    className="w-full rounded-md border border-zinc-700 bg-zinc-900 pl-6 pr-2 py-1.5 text-xs text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-amber-500/50"
                  />
                </div>
                <div className="relative flex-1">
                  <Hash size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <input
                    type="number"
                    value={sellQuantity}
                    onChange={(e) => setSellQuantity(e.target.value)}
                    placeholder="Quantity"
                    min="1"
                    className="w-full rounded-md border border-zinc-700 bg-zinc-900 pl-6 pr-2 py-1.5 text-xs text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-amber-500/50"
                  />
                </div>
              </div>

              <input
                type="text"
                value={sellDescription}
                onChange={(e) => setSellDescription(e.target.value)}
                placeholder="Brief description (optional)…"
                className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-amber-500/50"
              />

              <button
                onClick={handleSellSubmit}
                disabled={isSelling || !sellName.trim()}
                className={cn(
                  "flex w-full items-center justify-center gap-1.5 rounded-md py-1.5",
                  "bg-amber-500/15 text-xs font-semibold text-amber-400",
                  "border border-amber-500/30 hover:bg-amber-500/25 transition-all",
                  "disabled:opacity-40 disabled:cursor-not-allowed"
                )}
              >
                {isSelling ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Package size={12} />
                )}
                {isSelling ? "Listing…" : "List for Sale"}
              </button>

              {/* Sell result / matched buyers */}
              {sellResult && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    "rounded-md border p-2.5 text-xs",
                    sellResult.success
                      ? "border-emerald-500/20 bg-emerald-500/5"
                      : "border-red-500/20 bg-red-500/5"
                  )}
                >
                  <div className="flex items-start gap-1.5">
                    {sellResult.success ? (
                      <Check size={12} className="mt-0.5 shrink-0 text-emerald-400" />
                    ) : (
                      <X size={12} className="mt-0.5 shrink-0 text-red-400" />
                    )}
                    <p className={sellResult.success ? "text-emerald-400" : "text-red-400"}>
                      {sellResult.message}
                    </p>
                  </div>

                  {sellResult.matchedBuyers.length > 0 && (
                    <div className="mt-2 border-t border-emerald-500/10 pt-2">
                      <div className="flex items-center gap-1 mb-1">
                        <Users size={10} className="text-amber-400" />
                        <span className="text-[10px] font-semibold text-amber-400">
                          Buyers waiting for this material:
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {sellResult.matchedBuyers.map((b, i) => (
                          <span
                            key={i}
                            className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-300"
                          >
                            {b.companyName}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bid Modal */}
      <AnimatePresence>
        {bidTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => { setBidTarget(null); setBidResult(null); }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-[340px] rounded-xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Gavel size={16} className="text-amber-400" />
                  <h3 className="text-sm font-semibold text-zinc-100">Place a Bid</h3>
                </div>
                <button
                  onClick={() => { setBidTarget(null); setBidResult(null); }}
                  className="text-zinc-500 hover:text-zinc-300"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="mb-4 rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
                <p className="text-xs font-medium text-zinc-200">{bidTarget.name}</p>
                <p className="text-[10px] text-zinc-500 mt-0.5">
                  Seller: {bidTarget.producer}
                  {bidTarget.price != null && ` · Listed at $${bidTarget.price.toFixed(2)}/unit`}
                  {bidTarget.quantity != null && ` · ${bidTarget.quantity} available`}
                </p>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-medium text-zinc-400 mb-1">Quantity</label>
                  <div className="relative">
                    <Hash size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                    <input
                      type="number"
                      value={bidQty}
                      onChange={(e) => setBidQty(e.target.value)}
                      placeholder="How many units?"
                      min="1"
                      className="w-full rounded-md border border-zinc-700 bg-zinc-950 pl-7 pr-3 py-2 text-xs text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-amber-500/50"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-zinc-400 mb-1">Your Price Per Unit</label>
                  <div className="relative">
                    <DollarSign size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                    <input
                      type="number"
                      value={bidPrice}
                      onChange={(e) => setBidPrice(e.target.value)}
                      placeholder="Your offer per unit"
                      min="0"
                      step="0.01"
                      className="w-full rounded-md border border-zinc-700 bg-zinc-950 pl-7 pr-3 py-2 text-xs text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-amber-500/50"
                    />
                  </div>
                </div>
              </div>

              <button
                onClick={handleBidSubmit}
                disabled={isBidding || !bidQty || !bidPrice}
                className={cn(
                  "mt-4 flex w-full items-center justify-center gap-1.5 rounded-md py-2",
                  "bg-amber-500/15 text-xs font-semibold text-amber-400",
                  "border border-amber-500/30 hover:bg-amber-500/25 transition-all",
                  "disabled:opacity-40 disabled:cursor-not-allowed"
                )}
              >
                {isBidding ? <Loader2 size={12} className="animate-spin" /> : <Gavel size={12} />}
                {isBidding ? "Placing Bid…" : "Place Bid"}
              </button>

              {bidResult && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className={cn(
                    "mt-3 text-xs text-center",
                    bidResult.success ? "text-emerald-400" : "text-red-400"
                  )}
                >
                  {bidResult.message}
                </motion.p>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hybrid Search */}
      <div className="shrink-0 border-b border-zinc-800 px-3 py-2">
        <div className="flex gap-1.5">
          <div className="relative flex-1">
            <Search
              size={12}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="AI semantic search…"
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 pl-7 pr-7 py-1.5 text-xs text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-emerald-500/50"
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery("");
                  setSearchMode(false);
                  setSearchResults([]);
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
              >
                <X size={12} />
              </button>
            )}
          </div>
          <button
            onClick={handleSearch}
            disabled={isSearching || !searchQuery.trim()}
            className={cn(
              "flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[10px] font-medium",
              "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
              "hover:bg-emerald-500/25 transition-colors",
              "disabled:opacity-40 disabled:cursor-not-allowed"
            )}
          >
            {isSearching ? (
              <Loader2 size={10} className="animate-spin" />
            ) : (
              <Sparkles size={10} />
            )}
          </button>
        </div>
      </div>

      {/* Category filter (hidden during search) */}
      {!searchMode && !isLoading && listings.length > 0 && (
        <div className="shrink-0 border-b border-zinc-800 px-3 py-2">
          <div className="relative">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full appearance-none rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 pr-8 text-xs text-zinc-300 outline-none focus:border-emerald-500/50"
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat === "All" ? "All Categories" : cat}
                </option>
              ))}
            </select>
            <ChevronDown
              size={12}
              className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500"
            />
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 scrollbar-thin">
        {isLoading && (
          <div className="flex h-32 items-center justify-center text-zinc-500">
            <Loader2 size={20} className="animate-spin" />
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-400">
            {error}
          </div>
        )}

        {/* Semantic search results */}
        {searchMode &&
          searchResults.map((item, i) => (
            <motion.div
              key={`search-${item.id}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03, duration: 0.25 }}
              className={cn(
                "rounded-lg border border-zinc-800 bg-zinc-900/50 p-3",
                "hover:border-emerald-500/40 transition-colors"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-medium text-zinc-100 leading-tight">
                  {item.name}
                </h3>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 text-[9px] font-bold text-emerald-400 tabular-nums">
                    {item.similarity > 0
                      ? `${Math.round(item.similarity * 100)}%`
                      : "text"}
                  </span>
                  <span
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase",
                      TOXICITY_STYLES[item.toxicity] ?? TOXICITY_STYLES["medium"]
                    )}
                  >
                    {item.toxicity}
                  </span>
                </div>
              </div>
              <div className="mt-1.5 space-y-1 text-xs text-zinc-400">
                <div className="flex items-center gap-1.5">
                  <Tag size={11} className="text-zinc-500" />
                  <span className="text-zinc-300">{item.category}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <FlaskConical size={11} className="text-zinc-500" />
                  <span>{item.baseElement}</span>
                </div>
                {item.producers.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <MapPin size={11} className="text-zinc-500" />
                    <span className="truncate">{item.producers.slice(0, 2).join(", ")}</span>
                  </div>
                )}
              </div>
              <button
                onClick={() => onAnalyze(item.name)}
                className={cn(
                  "mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-md py-1.5",
                  "bg-emerald-500/10 text-xs font-semibold text-emerald-400",
                  "border border-emerald-500/20 hover:bg-emerald-500/20 active:scale-[0.98] transition-all"
                )}
              >
                <Zap size={12} />
                Analyze Match
              </button>
            </motion.div>
          ))}

        {/* Regular marketplace listings */}
        {!searchMode &&
          filtered.map((item, i) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, duration: 0.3 }}
              className={cn(
                "group rounded-lg border border-zinc-800 bg-zinc-900/50 p-3",
                "backdrop-blur-md transition-all duration-200",
                "hover:border-emerald-500/40 hover:shadow-[0_0_20px_rgba(16,185,129,0.08)]"
              )}
            >
              {/* Title + badge */}
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-medium text-zinc-100 leading-tight">
                  {item.name}
                </h3>
                <span
                  className={cn(
                    "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase",
                    TOXICITY_STYLES[item.toxicity] ?? TOXICITY_STYLES["medium"]
                  )}
                >
                  {item.toxicity}
                </span>
              </div>

              {/* Price + Quantity row */}
              <div className="mt-1.5 flex items-center gap-3">
                {item.price != null && (
                  <div className="flex items-center gap-1 text-xs">
                    <DollarSign size={11} className="text-emerald-500" />
                    <span className="font-semibold text-emerald-400">${item.price.toFixed(2)}</span>
                    <span className="text-zinc-600">/unit</span>
                  </div>
                )}
                {item.quantity != null && (
                  <div className="flex items-center gap-1 text-xs">
                    <Hash size={11} className="text-cyan-500" />
                    <span className="font-semibold text-cyan-400">{item.quantity}</span>
                    <span className="text-zinc-600">avail</span>
                  </div>
                )}
              </div>

              {/* Meta */}
              <div className="mt-2 space-y-1 text-xs text-zinc-400">
                {item.category && (
                  <div className="flex items-center gap-1.5">
                    <Tag size={12} className="text-zinc-500" />
                    <span className="text-zinc-300">{item.category}</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5">
                  <FlaskConical size={12} className="text-zinc-500" />
                  <span>{item.baseElement}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <MapPin size={12} className="text-zinc-500" />
                  <span>
                    {item.producer} — {item.location}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => onAnalyze(item.name)}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5",
                    "bg-emerald-500/10 text-xs font-semibold text-emerald-400",
                    "border border-emerald-500/20 hover:bg-emerald-500/20 active:scale-[0.98] transition-all"
                  )}
                >
                  <Zap size={12} />
                  Analyze
                </button>
                {item.sellerUserId !== user?.id && (
                  <button
                    onClick={() => {
                      setBidTarget(item);
                      setBidResult(null);
                      setBidQty("");
                      setBidPrice(item.price != null ? item.price.toFixed(2) : "");
                    }}
                    className={cn(
                      "flex items-center gap-1 rounded-md px-2.5 py-1.5",
                      "text-[10px] font-medium transition-all",
                      "bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/25"
                    )}
                  >
                    <Gavel size={10} />
                    Bid
                  </button>
                )}
                <button
                  onClick={() => fetchRecs(item.name)}
                  className={cn(
                    "flex items-center gap-1 rounded-md px-2.5 py-1.5",
                    "text-[10px] font-medium transition-all",
                    expandedRecs === item.name
                      ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                      : "bg-zinc-800 text-zinc-400 border border-zinc-700 hover:border-amber-500/30 hover:text-amber-400"
                  )}
                >
                  <ArrowRight size={10} />
                  Related
                </button>
              </div>

              {/* Recommendations carousel */}
              <AnimatePresence>
                {expandedRecs === item.name && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-2.5 pt-2.5 border-t border-zinc-800">
                      <p className="text-[10px] font-semibold text-amber-400/70 uppercase tracking-wider mb-1.5">
                        Frequently Required With
                      </p>
                      {isLoadingRecs ? (
                        <Loader2
                          size={14}
                          className="animate-spin text-zinc-500 mx-auto my-2"
                        />
                      ) : recs.length === 0 ? (
                        <p className="text-[10px] text-zinc-600">
                          No complementary materials found.
                        </p>
                      ) : (
                        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
                          {recs.map((rec) => (
                            <button
                              key={rec.id}
                              onClick={() => onAnalyze(rec.name)}
                              className={cn(
                                "shrink-0 rounded-md border border-zinc-700 bg-zinc-800/80 px-2.5 py-1.5",
                                "hover:border-amber-500/40 transition-colors text-left"
                              )}
                            >
                              <p className="text-[10px] font-medium text-zinc-200 whitespace-nowrap">
                                {rec.name}
                              </p>
                              <p className="text-[8px] text-zinc-500">
                                {rec.category}
                              </p>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
      </div>
    </div>
  );
}
