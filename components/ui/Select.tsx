"use client";

import { forwardRef } from "react";
import type { SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { Field, controlBorder, controlClasses } from "./Field";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string;
  containerClassName?: string;
}

/**
 * A native <select>. Deliberate: it is keyboard- and screen-reader-correct for
 * free, and renders as the platform picker on mobile — which matters for the
 * Android-first buyer flows.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, required, className, containerClassName, children, ...props },
  ref,
) {
  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      required={required}
      className={containerClassName}
    >
      {({ id, describedBy, invalid }) => (
        <div className="relative flex items-center">
          <select
            ref={ref}
            id={id}
            required={required}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            className={cn(
              controlClasses,
              controlBorder(invalid),
              "h-10 cursor-pointer appearance-none pr-9",
              className,
            )}
            {...props}
          >
            {children}
          </select>
          <ChevronDown
            aria-hidden="true"
            className="pointer-events-none absolute right-3 h-4 w-4 text-ink-500"
          />
        </div>
      )}
    </Field>
  );
});

export default Select;
