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
