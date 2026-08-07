import { cn } from "@/lib/cn";

export type ScoreBand = "strong" | "workable" | "weak";

export function scoreBand(score: number): ScoreBand {
  if (score >= 80) return "strong";
  if (score >= 60) return "workable";
  return "weak";
}

export const bandLabel: Record<ScoreBand, string> = {
  strong: "Strong match",
  workable: "Workable",
  weak: "Worth a look",
};

// Colour carries meaning here, so it is never the only signal — the numeral and
// the band label say the same thing for anyone who cannot separate the hues.
const bandStroke: Record<ScoreBand, string> = {
  strong: "text-brand",
  workable: "text-copper-600",
  weak: "text-ink-400",
};

const SIZES = {
  sm: { box: 40, stroke: 3.5, text: "text-[13px]" },
  md: { box: 56, stroke: 4, text: "text-base" },
} as const;

export interface MatchScoreProps {
  score: number;
  size?: keyof typeof SIZES;
  className?: string;
}

/**
 * The match score as a dial.
 *
 * A bare "87" invites reading as a percentage of certainty. The ring frames it
 * as a position on a scale instead, which is what the rules actually produce —
 * and the reasons underneath are what the buyer is meant to act on.
 */
export function MatchScore({ score, size = "md", className }: MatchScoreProps) {
  const { box, stroke, text } = SIZES[size];
  const band = scoreBand(score);
  const radius = (box - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = (Math.min(Math.max(score, 0), 100) / 100) * circumference;

  return (
    <div
      className={cn("relative shrink-0", className)}
      style={{ width: box, height: box }}
      role="img"
      aria-label={`Match score ${score} out of 100 — ${bandLabel[band]}`}
    >
      <svg width={box} height={box} className="-rotate-90" aria-hidden="true">
        <circle
          cx={box / 2}
          cy={box / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-ink-200"
        />
        <circle
          cx={box / 2}
          cy={box / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
          className={cn("stroke-current transition-[stroke-dasharray] duration-500", bandStroke[band])}
        />
      </svg>
      <span
        className={cn(
          "absolute inset-0 flex items-center justify-center font-semibold tabular-nums text-ink-900",
          text,
        )}
        aria-hidden="true"
      >
        {score}
      </span>
    </div>
  );
}

export default MatchScore;
