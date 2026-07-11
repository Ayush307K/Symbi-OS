"use client";

import {
  Bell,
  Building2,
  ChevronDown,
  Grid3X3,
  LogOut,
  MapPin,
  Recycle,
  Search,
  ShieldCheck,
  Store,
  X,
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";

const CATEGORIES = [
  "Metals",
  "Chemicals",
  "Polymers",
  "Minerals",
  "E-Waste",
  "Textiles",
  "Energy",
  "RFQ",
];

const LOCATION_PRESETS = [
  {
    label: "All India",
    query: "",
    detail: "Show every supplier and industrial cluster",
  },
  {
    label: "Bengaluru, Karnataka",
    query: "Bengaluru Karnataka",
    detail: "Electronic City, Peenya, Whitefield belt",
  },
  {
    label: "Electronic City",
    query: "Electronic City",
    detail: "High-density chemical and electronics supply",
  },
  {
    label: "Peenya Industrial Area",
    query: "Peenya",
    detail: "Metals, machining, polymers, fabrication",
  },
  {
    label: "Mumbai, Maharashtra",
    query: "Mumbai Maharashtra",
    detail: "Port-linked commodity and recycling suppliers",
  },
  {
    label: "Chennai, Tamil Nadu",
    query: "Chennai Tamil Nadu",
    detail: "Automotive, chemicals, textiles, logistics",
  },
  {
    label: "Delhi NCR",
    query: "Delhi NCR",
    detail: "North India sourcing and resale hubs",
  },
];

interface NavBarProps {
  query: string;
  locationLabel: string;
  onQueryChange: (query: string) => void;
  onCategorySelect: (category: string) => void;
  onLocationChange: (location: { label: string; query: string }) => void;
  onPostRfq: () => void;
  onSell: () => void;
  onHelp: () => void;
}

export default function NavBar({
  query,
  locationLabel,
  onQueryChange,
  onCategorySelect,
  onLocationChange,
  onPostRfq,
  onSell,
  onHelp,
}: NavBarProps) {
  const { user, logout } = useAuth();
  const [isLocationOpen, setIsLocationOpen] = useState(false);
  const [customLocation, setCustomLocation] = useState("");

  const submitSearch = () => {
    document.getElementById("marketplace-listings")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const applyLocation = (location: { label: string; query: string }) => {
    onLocationChange(location);
    setIsLocationOpen(false);
    setCustomLocation("");
    document.getElementById("marketplace-listings")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const submitCustomLocation = () => {
    const value = customLocation.trim();
    if (!value) return;
    applyLocation({ label: value, query: value });
  };

  return (
    <header className="sticky top-0 z-40 border-b border-slate-900 bg-slate-950 text-white shadow-sm">
      <div className="flex h-12 items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-orange-500 text-white">
              <Recycle size={18} />
            </div>
            <div className="text-lg font-bold tracking-tight">Symbi-OS</div>
          </div>
          <button
            onClick={() => setIsLocationOpen(true)}
            className="hidden max-w-[260px] items-center gap-1.5 text-left text-xs text-slate-200 hover:text-white md:flex"
          >
            <MapPin size={14} />
            <span className="min-w-0">
              <span className="block text-[11px] text-slate-400">Deliver to</span>
              <span className="block truncate font-semibold">{locationLabel}</span>
            </span>
          </button>
        </div>

        <div className="hidden items-center gap-5 text-xs font-medium text-slate-200 lg:flex">
          <button onClick={() => onCategorySelect("Verified")} className="hover:text-white">
            Buyer Protection
          </button>
          <button onClick={onSell} className="hover:text-white">
            Sell on Symbi-OS
          </button>
          <button onClick={onPostRfq} className="hover:text-white">
            Bulk RFQ
          </button>
          <button onClick={onHelp} className="hover:text-white">
            Help
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onQueryChange("high demand")}
            className="flex h-8 w-8 items-center justify-center rounded-sm text-slate-200 hover:bg-slate-800 hover:text-white"
            title="Show demand alerts"
          >
            <Bell size={16} />
          </button>
          {user && (
            <>
              <button className="hidden items-center gap-2 rounded-sm px-2 py-1 text-xs font-semibold text-slate-100 hover:bg-slate-800 sm:flex">
                <Building2 size={15} className="text-orange-400" />
                <span className="max-w-[140px] truncate">{user.companyName}</span>
                <ChevronDown size={13} />
              </button>
              <button
                onClick={logout}
                className="flex h-8 w-8 items-center justify-center rounded-sm text-slate-200 hover:bg-slate-800 hover:text-white"
                title="Sign out"
              >
                <LogOut size={16} />
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 bg-slate-900 px-4 py-2 sm:px-6">
        <button
          onClick={() => setIsLocationOpen(true)}
          className="flex h-10 min-w-[126px] items-center gap-2 rounded-sm bg-slate-800 px-3 text-left text-xs font-semibold text-white hover:bg-slate-700 md:hidden"
        >
          <MapPin size={15} />
          <span className="truncate">{locationLabel}</span>
        </button>

        <button
          onClick={() => onCategorySelect("All")}
          className="hidden h-10 items-center gap-2 rounded-sm bg-slate-800 px-3 text-sm font-semibold text-white hover:bg-slate-700 md:flex"
        >
          <Grid3X3 size={16} />
          All categories
        </button>

        <div className="flex h-10 min-w-0 flex-1 overflow-hidden rounded-sm bg-white text-stone-900 ring-2 ring-orange-500">
          <button
            onClick={() => onCategorySelect("All")}
            className="hidden items-center gap-1 border-r border-stone-200 bg-stone-100 px-3 text-sm text-stone-700 md:flex"
          >
            Raw materials
            <ChevronDown size={14} />
          </button>
          <input
            value={query ?? ""}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submitSearch();
            }}
            placeholder="Search 10,000 wholesale listings: slag, PCB scrap, HDPE regrind..."
            className="min-w-0 flex-1 px-3 text-sm outline-none"
          />
          <button
            onClick={submitSearch}
            className="flex w-12 items-center justify-center bg-orange-500 text-white hover:bg-orange-600"
          >
            <Search size={18} />
          </button>
        </div>

        <button
          onClick={onPostRfq}
          className="hidden h-10 items-center gap-2 rounded-sm bg-orange-500 px-4 text-sm font-bold text-white hover:bg-orange-600 lg:flex"
        >
          <Store size={16} />
          Post RFQ
        </button>
      </div>

      <div className="flex h-9 items-center gap-5 overflow-x-auto border-t border-slate-800 bg-slate-800 px-4 text-xs font-semibold text-slate-100 sm:px-6">
        <span className="flex shrink-0 items-center gap-1 text-orange-300">
          <ShieldCheck size={14} />
          Verified industrial suppliers
        </span>
        {CATEGORIES.map((category) => (
          <button
            key={category}
            onClick={() =>
              category === "RFQ" ? onPostRfq() : onCategorySelect(category)
            }
            className="shrink-0 hover:text-orange-300"
          >
            {category}
          </button>
        ))}
      </div>

      {isLocationOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/45 px-4 pt-20 backdrop-blur-sm">
          <div className="mx-auto max-w-lg overflow-hidden rounded-md bg-white text-stone-950 shadow-2xl">
            <div className="flex items-start justify-between border-b border-stone-200 p-5">
              <div>
                <h2 className="text-lg font-semibold">Choose delivery location</h2>
                <p className="mt-1 text-sm text-stone-500">
                  Filter suppliers by city, state, or industrial area.
                </p>
              </div>
              <button
                onClick={() => setIsLocationOpen(false)}
                className="rounded-md p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5">
              <div className="flex overflow-hidden rounded-md border border-stone-300 focus-within:border-orange-500 focus-within:ring-2 focus-within:ring-orange-500/15">
                <input
                  value={customLocation}
                  onChange={(event) => setCustomLocation(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") submitCustomLocation();
                  }}
                  placeholder="Enter city, state, pincode, or industrial area"
                  className="min-w-0 flex-1 px-3 py-2.5 text-sm outline-none"
                />
                <button
                  onClick={submitCustomLocation}
                  disabled={!customLocation.trim()}
                  className="bg-orange-500 px-4 text-sm font-bold text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Apply
                </button>
              </div>

              <div className="mt-4 grid gap-2">
                {LOCATION_PRESETS.map((location) => (
                  <button
                    key={location.label}
                    onClick={() => applyLocation(location)}
                    className="flex items-start gap-3 rounded-md border border-stone-200 p-3 text-left hover:border-orange-300 hover:bg-orange-50"
                  >
                    <MapPin size={16} className="mt-0.5 shrink-0 text-orange-600" />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-stone-900">
                        {location.label}
                      </span>
                      <span className="mt-0.5 block text-xs text-stone-500">
                        {location.detail}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
