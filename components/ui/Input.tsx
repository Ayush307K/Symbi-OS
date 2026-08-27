"use client";

import { forwardRef } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Field, controlBorder, controlClasses } from "./Field";

export interface InputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "size"
> {
  label?: string;
  hint?: string;
  error?: string;
  /** Rendered inside the control, before the text. Decorative only. */
  leadingIcon?: ReactNode;
  /** Trailing unit or suffix, e.g. "ton" or "₹". */
  suffix?: string;
  /** Interactive control rendered at the trailing edge of the input. */
  trailingAction?: ReactNode;
  containerClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    label,
    hint,
    error,
    leadingIcon,
    suffix,
    trailingAction,
    required,
    className,
    containerClassName,
    ...props
  },
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
          {leadingIcon ? (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-3 flex text-ink-400 [&>svg]:h-4 [&>svg]:w-4"
            >
              {leadingIcon}
            </span>
          ) : null}
          <input
            ref={ref}
            id={id}
            required={required}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            className={cn(
              controlClasses,
              controlBorder(invalid),
              "h-10",
              leadingIcon && "pl-9",
              (suffix || trailingAction) && "pr-12",
              className,
            )}
            {...props}
          />
          {trailingAction ? (
            <span className="absolute right-1 flex items-center">
              {trailingAction}
            </span>
          ) : suffix ? (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute right-3 text-[13px] font-medium text-ink-500"
            >
              {suffix}
            </span>
          ) : null}
        </div>
      )}
    </Field>
  );
});

export default Input;
