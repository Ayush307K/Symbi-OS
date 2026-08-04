import { cn } from "@/lib/cn";

type Tone = "neutral" | "success" | "warning" | "danger";

/**
 * The single source of truth for lifecycle colour across listings, offers,
 * orders, payments, and onboarding. Add new states here rather than colouring
 * them at a call site, or the same status ends up two colours in two places.
 *
 * Keys are the literal status strings the API returns. Legacy lowercase values
 * still exist in older listing rows, so lookup is case-insensitive.
 */
const STATUS_TONES: Record<string, Tone> = {
  // Settled and good.
  ACTIVE: "success",
  APPROVED: "success",
  ACCEPTED: "success",
  CONFIRMED: "success",
  PAID: "success",
  FULFILLED: "success",
  DELIVERED: "success",
  PUBLISHED: "success",
  VERIFIED: "success",

  // In flight: someone still owes an action.
  DRAFT: "neutral",
  OPEN: "warning",
  PENDING: "warning",
  PENDING_REVIEW: "warning",
  SUBMITTED: "warning",
  AWAITING_BUYER_CONFIRMATION: "warning",
  COUNTERED: "warning",
  RESERVED: "warning",
  UNFULFILLED: "warning",
  PAUSED: "warning",
  EXPIRED: "warning",

  // Failed, refused, or contested.
  REJECTED: "danger",
  CANCELLED: "danger",
  DISPUTED: "danger",
  FAILED: "danger",
  LOCKED: "danger",
  DISABLED: "danger",
  INVENTORY_CONFLICT: "danger",

  // Closed without incident.
  ARCHIVED: "neutral",
  CLOSED: "neutral",
  WITHDRAWN: "neutral",
  RELEASED: "neutral",
  NONE: "neutral",
};

const tones: Record<Tone, string> = {
  neutral: "bg-ink-100 text-ink-700 border-ink-200",
  success: "bg-success-subtle text-success-strong border-success-border",
  warning: "bg-warning-subtle text-warning-strong border-warning-border",
  danger: "bg-danger-subtle text-danger-strong border-danger-border",
};

const dots: Record<Tone, string> = {
  neutral: "bg-ink-400",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

export function statusTone(status: string): Tone {
  return STATUS_TONES[status?.toUpperCase?.() ?? ""] ?? "neutral";
}

/** AWAITING_BUYER_CONFIRMATION -> Awaiting buyer confirmation */
export function statusLabel(status: string): string {
  const words = String(status ?? "").replace(/_/g, " ").toLowerCase().trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "Unknown";
}

export interface StatusPillProps {
  status: string;
  /** Override the rendered text; the tone still derives from `status`. */
  children?: string;
  size?: "sm" | "md";
  className?: string;
}

export function StatusPill({
  status,
  children,
  size = "md",
  className,
}: StatusPillProps) {
  const tone = statusTone(status);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-medium",
        size === "sm"
          ? "px-2 py-0.5 text-[11px] leading-4"
          : "px-2.5 py-0.5 text-[12px] leading-5",
        tones[tone],
        className,
      )}
    >
      {/* Colour is never the only signal — the label always states the status,
          and the dot gives a second, non-chromatic cue. */}
      <span
        aria-hidden="true"
        className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dots[tone])}
      />
      {children ?? statusLabel(status)}
    </span>
  );
}

export default StatusPill;
