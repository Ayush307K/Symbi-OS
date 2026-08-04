"use client";

import { forwardRef } from "react";
import type { TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { Field, controlBorder, controlClasses } from "./Field";

export interface TextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
  containerClassName?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea(
    { label, hint, error, required, className, containerClassName, rows = 4, ...props },
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
          <textarea
            ref={ref}
            id={id}
            rows={rows}
            required={required}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            className={cn(
              controlClasses,
              controlBorder(invalid),
              // Long-form copy reads better with proportional figures.
              "prose-numerals resize-y py-2.5 leading-relaxed",
              className,
            )}
            {...props}
          />
        )}
      </Field>
    );
  },
);

export default Textarea;
