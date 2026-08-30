"use client";

import { useEffect, useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/cn";
import {
  type CatalogFilters,
  EMPTY_FILTERS,
  countActiveFilters,
} from "@/lib/marketplace-types";

export interface FilterSidebarProps {
  filters: CatalogFilters;
  categories: string[];
  onApply: (filters: CatalogFilters) => void;
}

/**
 * Persistent filter rail, per the wireframe. A fixed-width column rather than a
 * sticky bar over the grid: filters stay legible and the results keep the full
 * remaining width, so nothing reflows as the panel opens and closes.
 *
 * Below `lg` the same controls move into a dialog — a 230px rail would leave
 * the grid unusable on a phone, and this is an Android-first buyer flow.
 */
export function FilterSidebar({ filters, categories, onApply }: FilterSidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const activeCount = countActiveFilters(filters);

  return (
    <>
      <aside className="hidden w-[230px] shrink-0 lg:block">
        <div className="sticky top-[132px] max-h-[calc(100vh-148px)] overflow-y-auto pr-1 scrollbar-thin">
          <Controls filters={filters} categories={categories} onApply={onApply} />
        </div>
      </aside>

      <div className="lg:hidden">
        <Button
          variant="secondary"
          size="sm"
          leadingIcon={<SlidersHorizontal className="h-4 w-4" />}
          onClick={() => setMobileOpen(true)}
        >
          Filters
          {activeCount > 0 ? (
            <span className="ml-1 rounded-full bg-copper-700 px-1.5 text-[11px] font-semibold leading-4 text-white">
              {activeCount}
            </span>
          ) : null}
        </Button>
        <Modal
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          title="Filters"
          size="sm"
          footer={
            <>
              <Button variant="ghost" onClick={() => onApply(EMPTY_FILTERS)}>
                Reset
              </Button>
              <Button variant="primary" onClick={() => setMobileOpen(false)}>
                Show results
              </Button>
            </>
          }
        >
          <Controls
            filters={filters}
            categories={categories}
            onApply={onApply}
          />
        </Modal>
      </div>
    </>
  );
}

function Controls({
  filters,
  categories,
  onApply,
}: {
  filters: CatalogFilters;
  categories: string[];
  onApply: (filters: CatalogFilters) => void;
}) {
  const [draft, setDraft] = useState(filters);
  useEffect(() => setDraft(filters), [filters]);

  function set<K extends keyof CatalogFilters>(key: K, value: CatalogFilters[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="flex flex-col gap-6">
      <Group title="Category">
        <ul className="flex flex-col">
          {categories.map((item) => {
            const checked = filters.category === item;
            return (
              <li key={item}>
                <label
                  className={cn(
                    "flex cursor-pointer items-center gap-2.5 py-1.5 text-[13px]",
                    checked ? "font-semibold text-ink-900" : "text-ink-600",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      onApply({ ...filters, category: checked ? "" : item })
                    }
                    className="h-3.5 w-3.5 shrink-0 accent-copper-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper-700"
                  />
                  <span className="truncate">{item}</span>
                </label>
              </li>
            );
          })}
        </ul>
      </Group>

      <Group title="Price per unit">
        <div className="grid grid-cols-2 gap-2">
          <Input
            aria-label="Minimum price"
            type="number"
            min={0}
            placeholder="Min"
            suffix="₹"
            value={draft.minPrice}
            onChange={(event) => set("minPrice", event.target.value)}
          />
          <Input
            aria-label="Maximum price"
            type="number"
            min={0}
            placeholder="Max"
            suffix="₹"
            value={draft.maxPrice}
            onChange={(event) => set("maxPrice", event.target.value)}
          />
        </div>
      </Group>

      <Group title="Quantity">
        <div className="grid grid-cols-2 gap-2">
          <Input
            aria-label="Minimum quantity"
            type="number"
            min={0}
            placeholder="Min"
            value={draft.minQuantity}
            onChange={(event) => set("minQuantity", event.target.value)}
          />
          <Input
            aria-label="Maximum quantity"
            type="number"
            min={0}
            placeholder="Max"
            value={draft.maxQuantity}
            onChange={(event) => set("maxQuantity", event.target.value)}
          />
        </div>
      </Group>

      <Group title="Location">
        <Input
          aria-label="City or state"
          placeholder="City or state"
          value={draft.location}
          onChange={(event) => set("location", event.target.value)}
        />
      </Group>

      <label className="flex cursor-pointer items-center gap-2.5 text-[13px] font-medium text-ink-700">
        <input
          type="checkbox"
          checked={filters.verified}
          onChange={() => onApply({ ...filters, verified: !filters.verified })}
          className="h-3.5 w-3.5 shrink-0 accent-copper-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper-700"
        />
        Verified SymbiOS sellers only
      </label>

      <div className="flex flex-col gap-2 border-t border-ink-200 pt-4">
        <Button variant="primary" size="sm" fullWidth onClick={() => onApply(draft)}>
          Apply filters
        </Button>
        {countActiveFilters(filters) > 0 ? (
          <button
            type="button"
            onClick={() => onApply(EMPTY_FILTERS)}
            className="inline-flex items-center justify-center gap-1 rounded-sm text-[12px] font-medium text-ink-500 underline-offset-2 hover:text-copper-800 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper-700"
          >
            <X aria-hidden="true" className="h-3 w-3" />
            Clear all
          </button>
        ) : null}
      </div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-[12px] font-bold uppercase tracking-wide text-ink-900">
        {title}
      </h3>
      {children}
    </section>
  );
}

export default FilterSidebar;
