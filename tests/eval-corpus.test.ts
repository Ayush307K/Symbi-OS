import { afterEach, describe, expect, it, vi } from "vitest";
import { GOLDEN_SET } from "@/eval/golden-set";
import { EVAL_LISTINGS } from "@/eval/fixtures/listings";
import { publicListingWhere } from "@/server/listings/policy";
import { isTradeIndiaScrapProduct } from "@/server/listings/providers";
import { assertRagEvaluationAccess } from "@/server/rag/eval-access";

afterEach(() => vi.unstubAllEnvs());

describe("evaluation corpus definition", () => {
  it("keeps every synthetic listing explicitly evaluation-only by policy", () => {
    expect(publicListingWhere).toMatchObject({ isEvalOnly: false });
    expect(EVAL_LISTINGS).toHaveLength(28);
    expect(EVAL_LISTINGS.some((listing) => listing.category === ("Glass" as never))).toBe(
      false,
    );
    expect(
      EVAL_LISTINGS.filter((listing) => listing.tags.includes("near_duplicate")),
    ).toHaveLength(16);
    expect(EVAL_LISTINGS.filter((listing) => listing.tags.includes("decoy"))).toHaveLength(
      8,
    );
    expect(
      EVAL_LISTINGS.filter((listing) => listing.tags.includes("adversarial")),
    ).toHaveLength(4);
  });

  it("contains 18 cases for each golden scenario", () => {
    expect(GOLDEN_SET).toHaveLength(90);
    const counts = GOLDEN_SET.reduce<Record<string, number>>((result, testCase) => {
      result[testCase.scenario] = (result[testCase.scenario] ?? 0) + 1;
      return result;
    }, {});
    expect(counts).toEqual({
      exact_match: 18,
      semantic_zero_overlap: 18,
      ambiguous_multi_candidate: 18,
      no_match_refuse: 18,
      adversarial: 18,
    });
  });
});

describe("TradeIndia quality gate", () => {
  it("accepts scrap offers and rejects adjacent equipment", () => {
    expect(isTradeIndiaScrapProduct("HDPE Blue Drum Regrind Scrap")).toBe(true);
    expect(isTradeIndiaScrapProduct("Copper Wire Scrap - Bare Bright")).toBe(true);
    expect(isTradeIndiaScrapProduct("Rubber Scrap Processing System")).toBe(false);
    expect(isTradeIndiaScrapProduct("PET Bottle Shredder")).toBe(false);
    expect(isTradeIndiaScrapProduct("Goods Lift Stainless Steel")).toBe(false);
  });
});

describe("RAG evaluation access", () => {
  const key = "0123456789abcdef0123456789abcdef"; // gitleaks:allow -- deterministic test value

  it("is unavailable unless explicitly enabled", () => {
    vi.stubEnv("RAG_EVAL_ENABLED", "false");
    vi.stubEnv("RAG_EVAL_KEY", key);
    expect(() =>
      assertRagEvaluationAccess(
        new Request("http://localhost/api/rag/query", {
          headers: { "x-rag-eval-key": key },
        }),
      ),
    ).toThrow("not enabled");
  });

  it("rejects a wrong key and accepts the configured key", () => {
    vi.stubEnv("RAG_EVAL_ENABLED", "true");
    vi.stubEnv("RAG_EVAL_KEY", key);
    expect(() =>
      assertRagEvaluationAccess(
        new Request("http://localhost/api/rag/query", {
          headers: { "x-rag-eval-key": "fedcba9876543210fedcba9876543210" }, // gitleaks:allow -- deterministic test value
        }),
      ),
    ).toThrow("denied");
    expect(() =>
      assertRagEvaluationAccess(
        new Request("http://localhost/api/rag/query", {
          headers: { "x-rag-eval-key": key },
        }),
      ),
    ).not.toThrow();
  });
});
