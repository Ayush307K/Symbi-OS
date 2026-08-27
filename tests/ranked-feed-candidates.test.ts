import { describe, expect, it } from "vitest";
import { completeCandidateIds } from "@/server/feed/candidates";

describe("ranked feed candidate completion", () => {
  it("keeps ranked candidates first and appends the catalogue tail", () => {
    const ranked = Array.from({ length: 60 }, (_, index) => `ranked-${index}`);
    const tail = Array.from({ length: 88 }, (_, index) => `tail-${index}`);

    const result = completeCandidateIds(ranked, tail, 240);

    expect(result).toHaveLength(148);
    expect(result.slice(0, 60)).toEqual(ranked);
    expect(result.slice(60)).toEqual(tail);
  });

  it("deduplicates overlap and respects the scoring budget", () => {
    expect(
      completeCandidateIds(["a", "b"], ["b", "c", "d"], 3),
    ).toEqual(["a", "b", "c"]);
  });
});
