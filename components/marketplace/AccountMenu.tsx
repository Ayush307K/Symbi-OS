"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Building2, ChevronDown, LogOut, UserRound } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/cn";

/**
 * Identity and sign-out.
 *
 * Moving between workspaces is the header's switcher, not this menu — and the
 * account sub-pages are tabs within /account with no URLs of their own, so
 * listing them here would be five links to the same place.
 */
export function AccountMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) close();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  if (!user) return null;

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "flex h-9 items-center gap-2 rounded-control border px-2.5 text-[12.5px] font-semibold transition-colors",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper-700",
          open
            ? "border-ink-300 bg-ink-50 text-ink-900"
            : "border-ink-200 bg-surface-card text-ink-700 hover:border-ink-300",
        )}
      >
        <Building2 aria-hidden="true" className="h-4 w-4 text-copper-700" />
        <span className="hidden max-w-[140px] truncate sm:inline">
          {user.companyName}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")}
        />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+6px)] z-50 w-60 overflow-hidden rounded-card border border-ink-200 bg-surface-card shadow-overlay"
        >
          <div className="border-b border-ink-200 px-3 py-2.5">
            <p className="truncate text-[13px] font-semibold text-ink-900">
              {user.companyName}
            </p>
            <p className="truncate text-[12px] text-ink-500">{user.email}</p>
            <p className="mt-1 text-[11px] uppercase tracking-wide text-ink-400">
              {user.role}
              {user.isAdmin ? " · operator" : ""}
            </p>
          </div>

          <div className="py-1">
            <Link
              href="/account"
              role="menuitem"
              onClick={close}
              className="flex items-center gap-2.5 px-3 py-2 text-[13px] text-ink-700 hover:bg-ink-50 hover:text-ink-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-copper-700"
            >
              <UserRound aria-hidden="true" className="h-4 w-4 shrink-0 text-ink-500" />
              Account &amp; orders
            </Link>
          </div>

          <div className="border-t border-ink-200 py-1">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                close();
                logout();
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-[13px] font-medium text-danger hover:bg-danger-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-copper-700"
            >
              <LogOut aria-hidden="true" className="h-4 w-4 shrink-0" />
              Sign out
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default AccountMenu;
