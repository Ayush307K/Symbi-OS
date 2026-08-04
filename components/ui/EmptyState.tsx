import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  /** Say why it is empty and what to do next — never just "No results". */
  description?: string;
  action?: ReactNode;
  /** Secondary escape hatch, e.g. "Clear filters". */
  secondaryAction?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-card border border-dashed border-ink-300",
        "bg-surface-sunken/50 px-6 py-12 text-center",
        className,
      )}
    >
      {icon ? (
        <div
          aria-hidden="true"
          className="mb-4 flex h-11 w-11 items-center justify-center rounded-full border border-ink-200 bg-surface-card text-ink-500 [&>svg]:h-5 [&>svg]:w-5"
        >
          {icon}
        </div>
      ) : null}
      <h3 className="text-[15px] font-semibold text-ink-900">{title}</h3>
      {description ? (
        <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-ink-500">
          {description}
        </p>
      ) : null}
      {action || secondaryAction ? (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondaryAction}
        </div>
      ) : null}
    </div>
  );
}

export default EmptyState;
