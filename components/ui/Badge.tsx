import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

const tones = {
  neutral: "bg-ink-100 text-ink-700 border-ink-200",
  brand: "bg-brand-50 text-brand-800 border-brand-200",
  success: "bg-success-subtle text-success-strong border-success-border",
  warning: "bg-warning-subtle text-warning-strong border-warning-border",
  danger: "bg-danger-subtle text-danger-strong border-danger-border",
  // Copper reads as "action needed by you", not as a status of record.
  copper: "bg-copper-50 text-copper-800 border-copper-200",
} as const;

export type BadgeTone = keyof typeof tones;

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  icon?: ReactNode;
}

/**
 * A compact, non-interactive label for a fact about a record — verified,
 * counts, categories. For lifecycle state use StatusPill instead, so status
 * colour stays consistent across the product.
 */
export function Badge({
  tone = "neutral",
  icon,
  className,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5",
        "text-[12px] font-medium leading-5 [&>svg]:h-3 [&>svg]:w-3",
        tones[tone],
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </span>
  );
}

export default Badge;
