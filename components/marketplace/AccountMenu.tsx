"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Building2,
  ChevronDown,
  Gavel,
  Heart,
  LogOut,
  Package,
  ShieldCheck,
  ShoppingCart,
  Store,
  UserRound,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/cn";

interface Item {
  label: string;
  href: string;
  icon: typeof Package;
}

const BUYER: Item[] = [
  { label: "Account overview", href: "/account", icon: UserRound },
  { label: "Orders", href: "/account", icon: Package },
  { label: "Cart", href: "/account", icon: ShoppingCart },
  { label: "Saved listings", href: "/account", icon: Heart },
  { label: "Your bids", href: "/account", icon: Gavel },
];

const SELLER: Item[] = [{ label: "Seller dashboard", href: "/seller", icon: Store }];

const ADMIN: Item[] = [
  { label: "Listing moderation", href: "/admin/moderation", icon: ShieldCheck },
  { label: "Seller verification", href: "/admin/sellers", icon: ShieldCheck },
];

/**
 * Identity, the workspaces this user can reach, and sign-out.
 *
 * A menu rather than a row of links: the buyer, seller, and admin surfaces are
 * different jobs, and putting them all in the header at once is what made the
 * old bar unreadable. Closes on Escape, outside click, and navigation.
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

  const canSell = user.role === "SELLER" || user.role === "BOTH";
  const isAdmin = user.role === "ADMIN";

  const groups: Array<{ key: string; items: Item[] }> = [
    { key: "buyer", items: BUYER },
    ...(canSell ? [{ key: "seller", items: SELLER }] : []),
    ...(isAdmin ? [{ key: "admin", items: ADMIN }] : []),
  ];

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
          </div>

          {groups.map((group, index) => (
            <div
              key={group.key}
              className={cn("py-1", index > 0 && "border-t border-ink-200")}
            >
              {group.items.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  role="menuitem"
                  onClick={close}
                  className="flex items-center gap-2.5 px-3 py-2 text-[13px] text-ink-700 hover:bg-ink-50 hover:text-ink-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-copper-700"
                >
                  <item.icon aria-hidden="true" className="h-4 w-4 shrink-0 text-ink-500" />
                  {item.label}
                </Link>
              ))}
            </div>
          ))}

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
