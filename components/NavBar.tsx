"use client";

import { Activity, Leaf, Recycle, LogOut, User } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

// ---------------------------------------------------------------------------
//  Component
// ---------------------------------------------------------------------------

export default function NavBar() {
  const { user, logout } = useAuth();

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-xl px-5">
      {/* Logo */}
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 shadow-[0_0_12px_rgba(16,185,129,0.25)]">
          <Recycle size={18} className="text-emerald-400" />
        </div>
        <span className="text-lg font-bold tracking-tight text-zinc-100">
          Symbi
          <span className="text-emerald-400">-OS</span>
        </span>
        <span className="ml-1 rounded-full border border-zinc-700 bg-zinc-800/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest text-zinc-400">
          Beta
        </span>
      </div>

      {/* Metrics */}
      <div className="hidden items-center gap-6 md:flex">
        <MetricPill
          icon={<Leaf size={12} />}
          label="CO₂ Saved"
          value="0 t"
          color="emerald"
        />
        <MetricPill
          icon={<Recycle size={12} />}
          label="Landfill Diverted"
          value="0 t"
          color="cyan"
        />
        <MetricPill
          icon={<Activity size={12} />}
          label="Matches"
          value="0"
          color="violet"
        />
      </div>

      {/* User + Logout */}
      {user && (
        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-2 rounded-full border border-zinc-700 bg-zinc-800/60 px-3 py-1 md:flex">
            <User size={12} className="text-emerald-400" />
            <span className="max-w-[140px] truncate text-xs text-zinc-300">
              {user.companyName}
            </span>
            <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-emerald-400">
              {user.role}
            </span>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-200"
          >
            <LogOut size={12} />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      )}
    </header>
  );
}

// ---------------------------------------------------------------------------
//  Sub-component
// ---------------------------------------------------------------------------

function MetricPill({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: "emerald" | "cyan" | "violet";
}) {
  const palette = {
    emerald: "text-emerald-400 border-emerald-500/20 bg-emerald-500/5",
    cyan: "text-cyan-400 border-cyan-500/20 bg-cyan-500/5",
    violet: "text-violet-400 border-violet-500/20 bg-violet-500/5",
  };

  return (
    <div
      className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${palette[color]}`}
    >
      {icon}
      <span className="text-zinc-500">{label}:</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}
