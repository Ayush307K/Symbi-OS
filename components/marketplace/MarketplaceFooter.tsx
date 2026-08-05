import Link from "next/link";

const COLUMNS = [
  {
    title: "Marketplace",
    links: [
      { label: "Browse listings", href: "/" },
      { label: "Sell a by-product", href: "/seller" },
      { label: "Your account", href: "/account" },
    ],
  },
  {
    title: "Safety",
    links: [
      { label: "Accepted categories", href: "/" },
      { label: "Verification", href: "/seller" },
    ],
  },
];

/**
 * One footer for every buyer-facing screen. Deliberately short: it states the
 * sandbox boundary, which is the only thing here a user must not misread.
 */
export function MarketplaceFooter() {
  return (
    <footer className="mt-auto border-t border-ink-200 bg-surface-card">
      <div className="mx-auto grid max-w-[1440px] gap-8 px-4 py-10 sm:px-6 md:grid-cols-[minmax(0,1.5fr)_repeat(2,minmax(0,1fr))]">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="flex h-7 w-7 items-center justify-center rounded-[6px] bg-copper-700 font-display text-[13px] font-extrabold text-white"
            >
              S
            </span>
            <span className="font-display text-sm font-extrabold tracking-tight text-ink-900">
              Symbi-OS
            </span>
          </div>
          <p className="mt-3 max-w-sm text-[13px] leading-relaxed text-ink-500">
            Verified non-hazardous industrial by-products. Radioactive,
            biomedical, explosive, asbestos, and e-waste categories are rejected
            at ingestion, listing, search, and checkout.
          </p>
        </div>

        {COLUMNS.map((column) => (
          <nav key={column.title} aria-label={column.title} className="min-w-0">
            <h2 className="text-[12px] font-bold uppercase tracking-wide text-ink-900">
              {column.title}
            </h2>
            <ul className="mt-3 flex flex-col gap-2">
              {column.links.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="rounded-sm text-[13px] text-ink-600 hover:text-copper-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper-700"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="border-t border-ink-200">
        <p className="mx-auto max-w-[1440px] px-4 py-4 text-[12px] text-ink-500 sm:px-6">
          Verification and payments run in sandbox mode for v0. No real funds
          move, and no listing is presented as escrow-backed.
        </p>
      </div>
    </footer>
  );
}

export default MarketplaceFooter;
