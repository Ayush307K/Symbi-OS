"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldCheck, Store, Tag } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/cn";

interface Workspace {
  label: string;
  href: string;
  icon: typeof Tag;
  /** Section prefixes that count as "inside" this workspace. */
  matches: string[];
}

/**
 * Moves between the three jobs a person does here — buying, selling, and
 * operating the platform — without touching the address bar.
 *
 * These are top-level contexts, not menu items, so they sit in the header
 * rather than inside the account dropdown: switching from selling to
 * moderating is a change of role, and burying it two clicks deep made the
 * dashboards feel like separate products you had to know the URLs for.
 *
 * Only the workspaces a user can actually enter are rendered — a buyer never
 * sees an Admin tab that would refuse them.
 */
export function WorkspaceSwitcher() {
  const { user } = useAuth();
  const pathname = usePathname();

  if (!user) return null;

  const canSell = user.role === "SELLER" || user.role === "BOTH";

  const workspaces: Workspace[] = [
    { label: "Buying", href: "/account", icon: Tag, matches: ["/account"] },
    ...(canSell
      ? [{ label: "Selling", href: "/seller", icon: Store, matches: ["/seller"] }]
      : []),
    ...(user.isAdmin
      ? [{ label: "Admin", href: "/admin", icon: ShieldCheck, matches: ["/admin"] }]
      : []),
  ];

  // A lone tab is not a choice; the account menu already covers that case.
  if (workspaces.length < 2) return null;

  return (
    <nav
      aria-label="Workspace"
      className="flex shrink-0 items-center gap-0.5 rounded-control bg-surface-sunken p-0.5"
    >
      {workspaces.map((workspace) => {
        const active = workspace.matches.some((prefix) =>
          pathname.startsWith(prefix),
        );
        return (
          <Link
            key={workspace.href}
            href={workspace.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-1.5 rounded-[6px] px-2.5 py-1.5 text-[12.5px] font-semibold transition-colors",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper-700",
              active
                ? "bg-surface-card text-ink-900 shadow-card"
                : "text-ink-600 hover:text-ink-900",
            )}
          >
            <workspace.icon aria-hidden="true" className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{workspace.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export default WorkspaceSwitcher;
