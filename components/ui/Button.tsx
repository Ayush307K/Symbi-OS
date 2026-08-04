"use client";

import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Spinner } from "./Spinner";

const variants = {
  // Copper is the commit action: submit, accept, publish, pay. One per view.
  primary:
    "bg-copper-700 text-white border border-copper-700 hover:bg-copper-800 hover:border-copper-800 active:bg-copper-900 disabled:bg-copper-700/40 disabled:border-transparent",
  // The default for everything that is not the single commit action.
  secondary:
    "bg-surface-card text-ink-900 border border-ink-200 hover:bg-ink-50 hover:border-ink-300 active:bg-ink-100",
  // Tertiary. Toolbars, table row actions, dismissals.
  ghost:
    "bg-transparent text-ink-700 border border-transparent hover:bg-ink-100 hover:text-ink-900 active:bg-ink-200",
  // Destructive and irreversible only: cancel an order, reject, delete.
  danger:
    "bg-danger text-white border border-danger hover:bg-danger-strong hover:border-danger-strong active:bg-danger-strong disabled:bg-danger/40 disabled:border-transparent",
} as const;

const sizes = {
  sm: "h-8 px-3 text-[13px] gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-[15px] gap-2",
} as const;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  /** Shows a spinner and blocks interaction. Width is held to avoid reflow. */
  loading?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "secondary",
      size = "md",
      loading = false,
      leadingIcon,
      trailingIcon,
      fullWidth,
      className,
      children,
      disabled,
      type = "button",
      ...props
    },
    ref,
  ) {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        aria-busy={loading || undefined}
        className={cn(
          "inline-flex select-none items-center justify-center rounded-control font-medium",
          "transition-colors duration-[120ms] ease-out",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper-700",
          "disabled:cursor-not-allowed disabled:opacity-60",
          variants[variant],
          sizes[size],
          fullWidth && "w-full",
          className,
        )}
        {...props}
      >
        {loading ? (
          <Spinner size={size === "lg" ? "md" : "sm"} label={null} />
        ) : (
          leadingIcon
        )}
        {children}
        {!loading && trailingIcon}
      </button>
    );
  },
);

/**
 * Square button for a single icon. `label` is required and becomes the
 * accessible name — an icon alone never conveys the action to a screen reader.
 */
export interface IconButtonProps extends Omit<ButtonProps, "children" | "leadingIcon" | "trailingIcon" | "fullWidth"> {
  icon: ReactNode;
  label: string;
}

const iconSizes = {
  sm: "h-8 w-8",
  md: "h-10 w-10",
  lg: "h-12 w-12",
} as const;

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton({ icon, label, size = "md", className, ...props }, ref) {
    return (
      <Button
        ref={ref}
        size={size}
        aria-label={label}
        title={label}
        className={cn("px-0", iconSizes[size], className)}
        {...props}
      >
        {icon}
      </Button>
    );
  },
);

export default Button;
