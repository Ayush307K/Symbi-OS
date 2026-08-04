"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export interface SearchHeaderProps {
  /** The query currently applied to the results below. */
  value: string;
  resultCount: number;
  isLoading: boolean;
  onSearch: (query: string) => void;
}

/**
 * The heading for the catalogue section: what is being shown, and the control
 * that changes it. Kept separate from FilterBar so the sticky bar stays short.
 */
export function SearchHeader({
  value,
  resultCount,
  isLoading,
  onSearch,
}: SearchHeaderProps) {
  const [draft, setDraft] = useState(value);

  // Keep in step when the query changes elsewhere — hero search, a removed
  // chip, or the back button.
  useEffect(() => setDraft(value), [value]);

  return (
    <div className="flex flex-col gap-4 pb-4 pt-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h2 className="text-2xl font-semibold tracking-tight text-ink-900">
          {value ? `Results for “${value}”` : "Live catalogue"}
        </h2>
        <p className="mt-1 text-[13px] text-ink-500">
          {isLoading
            ? "Loading listings…"
            : `${resultCount} verified listing${resultCount === 1 ? "" : "s"} available now`}
        </p>
      </div>

      <form
        className="flex w-full gap-2 sm:w-auto"
        onSubmit={(event) => {
          event.preventDefault();
          onSearch(draft.trim());
        }}
      >
        <Input
          aria-label="Search the catalogue"
          placeholder="Search materials, grades, sellers"
          leadingIcon={<Search />}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          containerClassName="w-full sm:w-72"
        />
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>
    </div>
  );
}

export default SearchHeader;
