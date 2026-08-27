"use client";

import { Eye, EyeOff } from "lucide-react";
import { forwardRef, useState, type MouseEvent } from "react";
import { cn } from "@/lib/cn";
import { Input, type InputProps } from "./Input";

export type PasswordInputProps = Omit<
  InputProps,
  "type" | "suffix" | "trailingAction"
>;

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput({ disabled, ...props }, ref) {
    const [visible, setVisible] = useState(false);
    const actionLabel = visible ? "Hide password" : "Show password";

    function keepInputFocused(event: MouseEvent<HTMLButtonElement>) {
      event.preventDefault();
    }

    return (
      <Input
        {...props}
        ref={ref}
        type={visible ? "text" : "password"}
        disabled={disabled}
        trailingAction={
          <button
            type="button"
            aria-label={actionLabel}
            aria-pressed={visible}
            title={actionLabel}
            disabled={disabled}
            onMouseDown={keepInputFocused}
            onClick={() => setVisible((current) => !current)}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-control text-ink-500",
              "transition-colors hover:bg-ink-50 hover:text-ink-900",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-copper-700",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            {visible ? (
              <EyeOff aria-hidden="true" className="h-4 w-4" />
            ) : (
              <Eye aria-hidden="true" className="h-4 w-4" />
            )}
          </button>
        }
      />
    );
  },
);

export default PasswordInput;
