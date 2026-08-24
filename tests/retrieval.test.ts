import { describe, expect, it } from "vitest";
import { cosine, lexicalScore } from "@/server/rag/query";
import { canonicalCategory } from "@/server/listings/import";
import { MARKETPLACE_RANKING_CONFIG } from "@/server/feed/config";

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

/**
 * Retrieval scored substrings, not words. "ash" sits inside "washed", so a
 * query about fly ash ranked hot-washed HDPE above real fly-ash listings. The
 * same flaw matched "pet" inside "carpet" and "lead" inside "leader" — in a
 * catalogue where lead is regulated and PET is a category, those are wrong
 * answers rather than imprecise ones.
 */
describe("lexical retrieval matches words, not substrings", () => {
  it("does not match a query term hidden inside a longer word", () => {
    expect(
      lexicalScore("fly ash", "Mixed-Color Hot Washed HDPE Regrinds", "Hot Washed HDPE"),
    ).toBe(0);
  });

  it("ranks the real fly-ash listing above the plastics one", () => {
    const plastics = lexicalScore(
      "fly ash hazardous",
      "Mixed-Color Hot Washed HDPE Regrinds ready for export",
      "Mixed-Color Hot Washed HDPE Regrinds",
    );
    const flyAsh = lexicalScore(
      "fly ash hazardous",
      "Fly ash from thermal power plant, class F",
      "Fly Ash Class F",
    );
    expect(flyAsh).toBeGreaterThan(plastics);
    expect(plastics).toBe(0);
  });

  it("keeps the other collisions out", () => {
    expect(lexicalScore("pet flakes", "carpet offcuts", "Carpet")).toBe(0);
    expect(lexicalScore("lead scrap", "market leader in steel", "Leader Steel")).toBe(0);
    expect(lexicalScore("ton", "carton board bales", "Carton Board")).toBe(0);
  });

  it("still matches across singular and plural", () => {
    expect(lexicalScore("pet flake", "PET flakes in stock", "PET Flakes")).toBeGreaterThan(0);
    expect(lexicalScore("hdpe regrinds", "HDPE regrind natural", "HDPE Regrind")).toBeGreaterThan(0);
  });

  it("does not fold words ending in a double s", () => {
    // "glass" must not become "glas", which would match nothing.
    expect(lexicalScore("glass cullet", "Mixed glass cullet, flint", "Glass Cullet")).toBeGreaterThan(0);
    expect(lexicalScore("brass scrap", "Brass turnings honey grade", "Brass Turnings")).toBeGreaterThan(0);
  });

  it("still weights title terms above body-only terms", () => {
    const title = lexicalScore("hdpe flakes", "industrial material", "HDPE flakes");
    const body = lexicalScore("hdpe flakes", "HDPE flakes in stock", "Material");
    expect(title).toBeGreaterThan(body);
  });
});

/**
 * Relevance floors, one per retrieval path.
 *
 * Embedding similarity has a high baseline — unrelated text still scores around
 * 0.35 against this catalogue — so cosine never reaches zero and "no results"
 * has to be an explicit decision. Measured before the floors were chosen:
 *
 *   hybrid   real 0.49–0.82   irrelevant 0.32–0.47
 *   lexical  real 0.33–0.78   incidental 0.11–0.17
 *
 * A single shared floor would be wrong for one of the two paths, which is why
 * there are two.
 */
describe("rag relevance floors", () => {
  const floors = MARKETPLACE_RANKING_CONFIG.rag.minScore;

  it("keeps the weakest real hybrid answer measured", () => {
    expect(0.491).toBeGreaterThanOrEqual(floors.hybrid);
    expect(0.572).toBeGreaterThanOrEqual(floors.hybrid);
  });

  it("drops questions this catalogue cannot answer", () => {
    // "how do I bake sourdough bread" and "what is the capital of France".
    expect(0.356).toBeLessThan(floors.hybrid);
    expect(0.375).toBeLessThan(floors.hybrid);
    // "is fly ash hazardous" — nothing in the catalogue is fly ash.
    expect(0.404).toBeLessThan(floors.hybrid);
  });

  it("keeps real lexical matches while dropping incidental token overlap", () => {
    expect(0.333).toBeGreaterThanOrEqual(floors.lexical);
    expect(0.778).toBeGreaterThanOrEqual(floors.lexical);
    expect(0.167).toBeLessThan(floors.lexical);
    expect(0.111).toBeLessThan(floors.lexical);
  });

  it("uses a separate floor per path, because the scales differ", () => {
    expect(floors.hybrid).toBeGreaterThan(floors.lexical);
    // A shared floor at the hybrid value would delete real lexical results.
    expect(0.333).toBeLessThan(floors.hybrid);
  });
});
