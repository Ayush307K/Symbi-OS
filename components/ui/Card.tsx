import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Sunken reads as a well — filters, summaries, nested panels. */
  tone?: "card" | "sunken";
  /** Adds hover elevation. Only for cards that are themselves a link/button. */
  interactive?: boolean;
}

export function Card({
  tone = "card",
  interactive = false,
  className,
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        "rounded-card border border-ink-200 shadow-card",
        tone === "card" ? "bg-surface-card" : "bg-surface-sunken",
        interactive &&
          "transition-[box-shadow,border-color] duration-[180ms] ease-out hover:border-ink-300 hover:shadow-raised",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  action,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4 border-b border-ink-200 px-5 py-4",
        className,
      )}
      {...props}
    >
      <div className="min-w-0">
        <h3 className="truncate text-[15px] font-semibold text-ink-900">
          {title}
        </h3>
        {description ? (
          <p className="mt-0.5 text-[13px] text-ink-500">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function CardBody({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 py-4", className)} {...props} />;
}

export function CardFooter({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-center justify-end gap-2 border-t border-ink-200 bg-surface-sunken/60 px-5 py-3",
        className,
      )}
      {...props}
    />
  );
}

export default Card;
