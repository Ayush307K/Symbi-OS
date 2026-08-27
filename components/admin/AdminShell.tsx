"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { MarketplaceNav } from "@/components/marketplace/MarketplaceNav";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/cn";

const TABS = [
  { label: "Overview", href: "/admin" },
  { label: "Listing moderation", href: "/admin/moderation" },
  { label: "Seller verification", href: "/admin/sellers" },
  { label: "Support", href: "/admin/support" },
  { label: "Disputes", href: "/admin/disputes" },
];

export interface AdminShellProps {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}

/**
 * Frame and authorization guard for every admin screen.
 *
 * The APIs enforce administration on their own, but without a client guard a
 * non-admin got the full page, a failed request, and a generic error string —
 * which reads as a broken product rather than a closed door. This states the
 * reason plainly instead.
 */
export function AdminShell({
  title,
  description,
  action,
  children,
}: AdminShellProps) {
  const { user, isLoading } = useAuth();
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-surface-page text-ink-900">
      <MarketplaceNav />

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-24 text-ink-500">
          <Spinner size="md" />
          <span className="text-sm">Checking access…</span>
        </div>
      ) : !user?.isAdmin ? (
        <main className="mx-auto w-full max-w-2xl px-4 py-20 sm:px-6">
          <EmptyState
            icon={<ShieldAlert />}
            title="Administration access required"
            description={
              user
                ? "This area is for platform operators. Your account does not carry administration, and market role does not grant it."
                : "Sign in with a platform operator account to reach this area."
            }
            action={
              <Button
                variant="primary"
                size="sm"
                onClick={() => (window.location.href = "/")}
              >
                Back to the marketplace
              </Button>
            }
          />
        </main>
      ) : (
        <>
          <div className="border-b border-ink-200 bg-surface-card">
            <div className="mx-auto max-w-[1440px] px-4 pt-5 sm:px-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide text-brand">
                    <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5" />
                    Platform operations
                  </p>
                  <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink-900">
                    {title}
                  </h1>
                  {description ? (
                    <p className="mt-1 text-[13px] text-ink-500">
                      {description}
                    </p>
                  ) : null}
                </div>
                {action ? <div className="shrink-0">{action}</div> : null}
              </div>

              <nav
                aria-label="Admin sections"
                className="scrollbar-thin -mb-px mt-4 flex gap-1 overflow-x-auto"
              >
                {TABS.map((tab) => {
                  const active =
                    tab.href === "/admin"
                      ? pathname === "/admin"
                      : pathname.startsWith(tab.href);
                  return (
                    <Link
                      key={tab.href}
                      href={tab.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] font-semibold transition-colors",
                        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-copper-700",
                        active
                          ? "border-copper-700 text-copper-800"
                          : "border-transparent text-ink-600 hover:text-ink-900",
                      )}
                    >
                      {tab.label}
                    </Link>
                  );
                })}
              </nav>
            </div>
          </div>

          <main className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6">
            {children}
          </main>
        </>
      )}
    </div>
  );
}

export default AdminShell;
