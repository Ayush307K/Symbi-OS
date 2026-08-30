import type { ReactNode } from "react";
import Link from "next/link";
import { PackageCheck, ShieldCheck, Store } from "lucide-react";

const POINTS = [
  {
    icon: ShieldCheck,
    title: "Non-hazardous only",
    body: "Radioactive, biomedical, explosive, asbestos, and e-waste categories are rejected at every step.",
  },
  {
    icon: Store,
    title: "Clear source labels",
    body: "Managed sellers, external sourcing leads, and synthetic demo records are identified before you act.",
  },
  {
    icon: PackageCheck,
    title: "Protected transactions",
    body: "Only verified, connected sellers can receive bids, messages, carts, or orders inside SymbiOS.",
  },
];

/**
 * Two-column frame shared by sign-in and registration.
 *
 * The left panel is the reason to hand over an email; it collapses below `lg`
 * so the form is the first thing on a phone rather than something to scroll
 * past. Both screens use it so the two never drift.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="grid min-h-screen bg-surface-page lg:grid-cols-[1fr_minmax(0,520px)]">
      <aside className="hidden flex-col justify-between border-r border-ink-200 bg-surface-card p-10 lg:flex">
        <Link
          href="/"
          className="flex w-fit items-center gap-2 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper-700"
        >
          <span
            aria-hidden="true"
            className="flex h-[30px] w-[30px] items-center justify-center rounded-[7px] bg-copper-700 font-display text-sm font-extrabold text-white"
          >
            S
          </span>
          <span className="font-display text-[15px] font-extrabold tracking-tight text-ink-900">
            Symbi-OS
          </span>
        </Link>

        <div className="max-w-md">
          <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-copper-700">
            Industrial by-products · India
          </p>
          <h2 className="mt-3 text-3xl font-bold leading-tight tracking-tight text-ink-900">
            The scrap one plant discards is another plant&rsquo;s raw material.
          </h2>
          <ul className="mt-8 flex flex-col gap-5">
            {POINTS.map(({ icon: Icon, title: pointTitle, body }) => (
              <li key={pointTitle} className="flex gap-3">
                <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink-900">{pointTitle}</p>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-ink-500">
                    {body}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-[12px] text-ink-500">
          Verification and payments run in sandbox mode for v0.
        </p>
      </aside>

      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <Link
            href="/"
            className="mb-8 flex w-fit items-center gap-2 rounded-sm lg:hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper-700"
          >
            <span
              aria-hidden="true"
              className="flex h-[30px] w-[30px] items-center justify-center rounded-[7px] bg-copper-700 font-display text-sm font-extrabold text-white"
            >
              S
            </span>
            <span className="font-display text-[15px] font-extrabold tracking-tight text-ink-900">
              Symbi-OS
            </span>
          </Link>

          <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
            {title}
          </h1>
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-500">{subtitle}</p>

          <div className="mt-7">{children}</div>

          <div className="mt-6 text-[13px] text-ink-500">{footer}</div>
        </div>
      </main>
    </div>
  );
}

export default AuthShell;
