import { describe, expect, it } from "vitest";
import {
  decayedFrequencyWeight,
  recencyDecay,
} from "@/server/feed/material-edges";

describe("material-edge weighting", () => {
  it("halves an event after one configured half-life", () => {
    expect(recencyDecay(90, 90)).toBeCloseTo(0.5, 10);
  });

  it("weights frequent recent evidence above old or one-off evidence", () => {
    const frequentRecent = decayedFrequencyWeight([
      { ageDays: 1 },
      { ageDays: 2 },
      { ageDays: 3 },
    ]);
    const oneRecent = decayedFrequencyWeight([{ ageDays: 1 }]);
    const frequentOld = decayedFrequencyWeight([
      { ageDays: 365 },
      { ageDays: 400 },
      { ageDays: 450 },
    ]);
    expect(frequentRecent).toBeGreaterThan(oneRecent);
    expect(frequentRecent).toBeGreaterThan(frequentOld);
  });

  it("stays bounded instead of treating relationships as binary", () => {
    const weak = decayedFrequencyWeight([{ ageDays: 30 }]);
    const strong = decayedFrequencyWeight(
      Array.from({ length: 100 }, () => ({ ageDays: 0 })),
    );
    expect(weak).toBeGreaterThan(0);
    expect(weak).toBeLessThan(1);
    expect(strong).toBeGreaterThan(weak);
    expect(strong).toBeLessThanOrEqual(1);
  });
});
