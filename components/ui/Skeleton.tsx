import { cn } from "@/lib/cn";

export interface SkeletonProps {
  className?: string;
  /** Render as a circle — avatars, logos. */
  circle?: boolean;
}

/**
 * A placeholder with the same footprint as the content it replaces, so the
 * layout does not jump on load. The sheen is suppressed under
 * prefers-reduced-motion by the global rule in globals.css.
 */
export function Skeleton({ className, circle }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative overflow-hidden bg-ink-200/70",
        circle ? "rounded-full" : "rounded-control",
        "after:absolute after:inset-0 after:-translate-x-full after:animate-shimmer",
        "after:bg-gradient-to-r after:from-transparent after:via-white/45 after:to-transparent",
        className,
      )}
    />
  );
}

/** Matching placeholder for a listing card in the marketplace grid. */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-card border border-ink-200 bg-surface-card p-4",
        className,
      )}
    >
      <Skeleton className="mb-4 h-32 w-full" />
      <Skeleton className="mb-2 h-4 w-3/4" />
      <Skeleton className="mb-4 h-3 w-1/2" />
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-20" />
        <Skeleton className="h-6 w-16" />
      </div>
    </div>
  );
}

/** Rows for a loading table. `columns` should match the real header count. */
export function SkeletonRows({
  rows = 5,
  columns = 4,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <div className="flex flex-col gap-px bg-ink-200">
      {Array.from({ length: rows }).map((_, row) => (
        <div
          key={row}
          className="grid gap-4 bg-surface-card px-4 py-3"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: columns }).map((__, column) => (
            <Skeleton key={column} className="h-4" />
          ))}
        </div>
      ))}
    </div>
  );
}

export default Skeleton;
