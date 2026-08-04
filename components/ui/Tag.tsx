"use client";

import type { HTMLAttributes } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

export interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  /** Renders a remove affordance. Omit for a static tag. */
  onRemove?: () => void;
  /** Names the tag for the remove button's accessible label. */
  label?: string;
}

/**
 * A user-controlled token: an applied search facet, a selected category, a
 * chosen material. Distinct from Badge, which is system-authored and read-only.
 */
export function Tag({
  onRemove,
  label,
  className,
  children,
  ...props
}: TagProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-ink-200 bg-surface-card",
        "py-0.5 pl-2.5 text-[12px] font-medium leading-5 text-ink-700",
        onRemove ? "pr-1" : "pr-2.5",
        className,
      )}
      {...props}
    >
      {children}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${label ?? "filter"}`}
          className={cn(
            "flex h-4 w-4 items-center justify-center rounded-full text-ink-500",
            "transition-colors duration-[120ms] hover:bg-ink-200 hover:text-ink-900",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-copper-700",
          )}
        >
          <X aria-hidden="true" className="h-3 w-3" />
        </button>
      ) : null}
    </span>
  );
}

export default Tag;
