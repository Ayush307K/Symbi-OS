"use client";

import { useId } from "react";
import type { ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Shared label/hint/error scaffolding for Input, Select, and Textarea.
 *
 * The control is wired to its label, hint, and error via ids rather than
 * placement, so the association survives any layout change. Errors are
 * announced politely: they appear after a submit attempt, not mid-typing.
 */
export interface FieldProps {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: (ids: {
    id: string;
    describedBy: string | undefined;
    invalid: boolean;
  }) => ReactNode;
}

export function Field({
  label,
  hint,
  error,
  required,
  className,
  children,
}: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy =
    [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") ||
    undefined;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label ? (
        <label
          htmlFor={id}
          className="text-[13px] font-medium leading-none text-ink-700"
        >
          {label}
          {required ? (
            <span className="ml-1 text-danger" aria-hidden="true">
              *
            </span>
          ) : null}
        </label>
      ) : null}

      {children({ id, describedBy, invalid: Boolean(error) })}

      {error ? (
        <p
          id={errorId}
          role="alert"
          className="flex items-start gap-1.5 text-[13px] text-danger"
        >
          <AlertCircle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-[13px] text-ink-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Shared visual treatment so the three controls stay identical. */
export const controlClasses = cn(
  "w-full rounded-control border bg-surface-card px-3 text-sm text-ink-900",
  "placeholder:text-ink-400",
  "transition-colors duration-[120ms] ease-out",
  "hover:border-ink-300",
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper-700",
  "disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-500",
);

export const controlBorder = (invalid: boolean) =>
  invalid ? "border-danger" : "border-ink-200";

export default Field;
