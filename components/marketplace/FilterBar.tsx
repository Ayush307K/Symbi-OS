"use client";

import { useEffect, useId, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { BadgeCheck, LocateFixed, SlidersHorizontal, X } from "lucide-react";
import { Button, IconButton } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Tag } from "@/components/ui/Tag";
import { cn } from "@/lib/cn";
import {
  type CatalogFilters,
  EMPTY_FILTERS,
  SORT_OPTIONS,
  countActiveFilters,
} from "@/lib/marketplace-types";

export interface FilterBarProps {
  filters: CatalogFilters;
  categories: string[];
  resultCount: number;
  isLoading: boolean;
  onApply: (filters: CatalogFilters) => void;
}

interface Chip {
  key: string;
  label: string;
  clear: (filters: CatalogFilters) => CatalogFilters;
}

function activeChips(filters: CatalogFilters): Chip[] {
  const chips: Chip[] = [];
  if (filters.q) {
    chips.push({
      key: "q",
      label: `“${filters.q}”`,
      clear: (f) => ({ ...f, q: "" }),
    });
  }
  if (filters.category) {
    chips.push({
      key: "category",
      label: filters.category,
      clear: (f) => ({ ...f, category: "" }),
    });
  }
  if (filters.location) {
    chips.push({
      key: "location",
      label: filters.location,
      clear: (f) => ({ ...f, location: "" }),
    });
  }
  if (filters.minPrice || filters.maxPrice) {
    chips.push({
      key: "price",
      label: `₹${filters.minPrice || "0"}–${filters.maxPrice || "any"}`,
      clear: (f) => ({ ...f, minPrice: "", maxPrice: "" }),
    });
  }
  if (filters.minQuantity || filters.maxQuantity) {
    chips.push({
      key: "quantity",
      label: `Qty ${filters.minQuantity || "0"}–${filters.maxQuantity || "any"}`,
      clear: (f) => ({ ...f, minQuantity: "", maxQuantity: "" }),
    });
  }
  if (filters.verified) {
    chips.push({
      key: "verified",
      label: "Verified only",
      clear: (f) => ({ ...f, verified: false }),
    });
  }
  if (filters.radiusKm && filters.lat !== null) {
    chips.push({
      key: "radius",
      label: `Within ${filters.radiusKm} km`,
      clear: (f) => ({ ...f, radiusKm: "", lat: null, lng: null }),
    });
  }
  if (filters.sort !== "recent") {
    const option = SORT_OPTIONS.find((item) => item.value === filters.sort);
    chips.push({
      key: "sort",
      label: option?.label ?? filters.sort,
      clear: (f) => ({ ...f, sort: "recent" as const }),
    });
  }
  return chips;
}

export function FilterBar({
  filters,
  categories,
  resultCount,
  isLoading,
  onApply,
}: FilterBarProps) {
  // Local draft so typing in a range field does not refetch on every keystroke;
  // committed on submit, or immediately for the single-click controls.
  const [draft, setDraft] = useState<CatalogFilters>(filters);
  const [expanded, setExpanded] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const reduceMotion = useReducedMotion();
  const panelId = useId();

  useEffect(() => setDraft(filters), [filters]);

  const chips = activeChips(filters);
  const activeCount = countActiveFilters(filters);

  function set<K extends keyof CatalogFilters>(key: K, value: CatalogFilters[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function requestLocation() {
    if (!("geolocation" in navigator)) {
      setLocationError("This browser cannot share a location.");
      return;
    }
    setLocating(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        onApply({
          ...draft,
          lat: Number(position.coords.latitude.toFixed(4)),
          lng: Number(position.coords.longitude.toFixed(4)),
          radiusKm: draft.radiusKm || "100",
        });
      },
      () => {
        setLocating(false);
        setLocationError("Location permission was declined.");
      },
      { timeout: 10_000 },
    );
  }

  return (
    <div className="sticky top-16 z-30 -mx-4 border-b border-ink-200 bg-surface-page/95 px-4 py-3 backdrop-blur-sm sm:-mx-6 sm:px-6">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          aria-label="Category"
          value={draft.category}
          onChange={(event) => onApply({ ...draft, category: event.target.value })}
          containerClassName="w-full sm:w-52"
        >
          <option value="">All categories</option>
          {categories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </Select>

        <Select
          aria-label="Sort listings"
          value={draft.sort}
          onChange={(event) =>
            onApply({ ...draft, sort: event.target.value as CatalogFilters["sort"] })
          }
          containerClassName="w-full sm:w-48"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>

        <Button
          variant={filters.verified ? "primary" : "secondary"}
          size="md"
          aria-pressed={filters.verified}
          leadingIcon={<BadgeCheck className="h-4 w-4" />}
          onClick={() => onApply({ ...draft, verified: !draft.verified })}
        >
          Verified only
        </Button>

        <Button
          variant="secondary"
          size="md"
          aria-expanded={expanded}
          aria-controls={panelId}
          leadingIcon={<SlidersHorizontal className="h-4 w-4" />}
          onClick={() => setExpanded((value) => !value)}
        >
          More filters
          {activeCount > 0 ? (
            <span className="ml-1 rounded-full bg-copper-700 px-1.5 text-[11px] font-semibold leading-4 text-white">
              {activeCount}
            </span>
          ) : null}
        </Button>

        <p className="ml-auto text-[13px] text-ink-500" aria-live="polite">
          {isLoading ? "Loading…" : `${resultCount} shown`}
        </p>
      </div>

      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            id={panelId}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, height: "auto" }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <form
              className="grid gap-3 pt-3 sm:grid-cols-2 lg:grid-cols-4"
              onSubmit={(event) => {
                event.preventDefault();
                onApply(draft);
              }}
            >
              <Input
                label="Location"
                placeholder="City or state"
                value={draft.location}
                onChange={(event) => set("location", event.target.value)}
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  label="Min price"
                  type="number"
                  min={0}
                  suffix="₹"
                  value={draft.minPrice}
                  onChange={(event) => set("minPrice", event.target.value)}
                />
                <Input
                  label="Max price"
                  type="number"
                  min={0}
                  suffix="₹"
                  value={draft.maxPrice}
                  onChange={(event) => set("maxPrice", event.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  label="Min qty"
                  type="number"
                  min={0}
                  value={draft.minQuantity}
                  onChange={(event) => set("minQuantity", event.target.value)}
                />
                <Input
                  label="Max qty"
                  type="number"
                  min={0}
                  value={draft.maxQuantity}
                  onChange={(event) => set("maxQuantity", event.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium leading-none text-ink-700">
                  Distance
                </span>
                <div className="flex gap-2">
                  <Input
                    aria-label="Radius in kilometres"
                    type="number"
                    min={1}
                    max={2000}
                    placeholder="100"
                    suffix="km"
                    value={draft.radiusKm}
                    onChange={(event) => set("radiusKm", event.target.value)}
                    containerClassName="flex-1"
                  />
                  <IconButton
                    variant={draft.lat !== null ? "primary" : "secondary"}
                    icon={<LocateFixed className="h-4 w-4" />}
                    label="Use my current location"
                    loading={locating}
                    onClick={requestLocation}
                  />
                </div>
                {locationError ? (
                  <p role="alert" className="text-[12px] text-danger">
                    {locationError}
                  </p>
                ) : (
                  <p className="text-[12px] text-ink-500">
                    Radius needs your location.
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-4">
                <Button type="submit" variant="primary" size="sm">
                  Apply filters
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onApply(EMPTY_FILTERS)}
                >
                  Reset
                </Button>
              </div>
            </form>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {chips.length > 0 ? (
        <div className={cn("flex flex-wrap items-center gap-2 pt-3")}>
          <span className="text-[12px] font-medium uppercase tracking-wide text-ink-500">
            Active
          </span>
          {chips.map((chip) => (
            <Tag
              key={chip.key}
              label={chip.label}
              onRemove={() => onApply(chip.clear(filters))}
            >
              {chip.label}
            </Tag>
          ))}
          <button
            type="button"
            onClick={() => onApply(EMPTY_FILTERS)}
            className="inline-flex items-center gap-1 rounded-sm text-[12px] font-medium text-ink-500 underline-offset-2 hover:text-copper-800 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper-700"
          >
            <X aria-hidden="true" className="h-3 w-3" />
            Clear all
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default FilterBar;
