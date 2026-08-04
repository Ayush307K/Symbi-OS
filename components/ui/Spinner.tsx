import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

const sizes = {
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
  lg: "h-6 w-6",
} as const;

export interface SpinnerProps {
  size?: keyof typeof sizes;
  className?: string;
  /** Announced to assistive tech. Pass null when a parent already labels it. */
  label?: string | null;
}

export function Spinner({ size = "md", className, label = "Loading" }: SpinnerProps) {
  return (
    <>
      <Loader2
        aria-hidden="true"
        className={cn("animate-spin text-current", sizes[size], className)}
      />
      {label ? <span className="sr-only">{label}</span> : null}
    </>
  );
}

export default Spinner;
