import { describe, expect, it } from "vitest";
import { cosine, lexicalScore } from "@/server/rag/query";
import { canonicalCategory } from "@/server/listings/import";

describe("listing normalization and retrieval", () => {
  it("maps real provider text to a safe canonical category", () => {
    expect(canonicalCategory("washed HDPE plastic regrind granules")).toBe(
      "Plastic Scrap"
    );
    expect(canonicalCategory("discarded computer e-waste boards")).toBeNull();
  });

  it("weights title terms above body-only terms", () => {
    const title = lexicalScore("hdpe flakes", "industrial material", "HDPE flakes");
    const body = lexicalScore("hdpe flakes", "HDPE flakes in stock", "Material");
    expect(title).toBeGreaterThan(body);
  });

  it("computes cosine similarity", () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
  });
});
