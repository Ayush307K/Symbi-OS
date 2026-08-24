import { describe, expect, it } from "vitest";
import {
  getEmbeddingProvider,
  normalizeUnitVector,
  validateEmbedding,
} from "@/server/semantic/embedding-provider";
import { MARKETPLACE_RANKING_CONFIG } from "@/server/feed/config";

/**
 * The Gemini embedding path, and the invariant the vector indexes depend on.
 *
 * gemini-embedding-001 is natively 3072-wide and Matryoshka-truncatable. Only
 * the full-width vector comes back unit length; a 768-wide one is not — this
 * project's key returned a norm of 0.587 — and both HNSW indexes use
 * vector_cosine_ops. Storing an unnormalised vector alongside normalised ones
 * silently skews every comparison rather than failing, so the normalisation is
 * load-bearing and tested here rather than assumed.
 */
describe("gemini embedding provider", () => {
  it("is the configured default and matches the column width", () => {
    const provider = getEmbeddingProvider("gemini");
    expect(provider.name).toBe("gemini");
    expect(provider.dimensions).toBe(MARKETPLACE_RANKING_CONFIG.embedding.dimensions);
    expect(provider.dimensions).toBe(
      MARKETPLACE_RANKING_CONFIG.embedding.gemini.outputDimensionality,
    );
  });

  it("requests truncation and then normalises, because truncated vectors are not unit", () => {
    expect(MARKETPLACE_RANKING_CONFIG.embedding.gemini.normalizeAfterTruncation).toBe(true);
  });

  it("embeds documents and queries with different task types", () => {
    const { documentTaskType, queryTaskType } = MARKETPLACE_RANKING_CONFIG.embedding.gemini;
    expect(documentTaskType).toBe("RETRIEVAL_DOCUMENT");
    expect(queryTaskType).toBe("RETRIEVAL_QUERY");
    expect(documentTaskType).not.toBe(queryTaskType);
  });

  it("retries rate limits rather than leaving the corpus half embedded", () => {
    const { maxRetries, baseDelayMs } = MARKETPLACE_RANKING_CONFIG.embedding.gemini.rateLimit;
    expect(maxRetries).toBeGreaterThan(0);
    expect(baseDelayMs).toBeGreaterThan(0);
  });

  it("rejects an unregistered provider by name", () => {
    expect(() => getEmbeddingProvider("does-not-exist")).toThrow(/Unknown embedding provider/);
  });
});

describe("normalizeUnitVector", () => {
  it("scales a non-unit vector to length one", () => {
    const norm = (v: number[]) => Math.sqrt(v.reduce((a, x) => a + x * x, 0));
    const scaled = normalizeUnitVector([3, 4]);
    expect(norm(scaled)).toBeCloseTo(1, 12);
    expect(scaled).toEqual([0.6, 0.8]);
  });

  it("preserves direction, so cosine ordering is unchanged", () => {
    const scaled = normalizeUnitVector([2, 0, 0]);
    expect(scaled).toEqual([1, 0, 0]);
  });

  it("refuses a zero vector instead of producing NaN", () => {
    expect(() => normalizeUnitVector([0, 0, 0])).toThrow(/zero or non-finite/);
  });
});

describe("validateEmbedding guards the column contract", () => {
  const dims = MARKETPLACE_RANKING_CONFIG.embedding.dimensions;

  it("rejects a vector of the wrong width", () => {
    expect(() => validateEmbedding(new Array(dims - 1).fill(0.1))).toThrow(/dimension/);
  });

  it("rejects non-finite values", () => {
    const vector = new Array(dims).fill(0.1);
    vector[0] = Number.NaN;
    expect(() => validateEmbedding(vector)).toThrow(/non-finite/);
  });

  it("accepts a correctly sized unit vector", () => {
    const vector = normalizeUnitVector(new Array(dims).fill(0.1));
    expect(validateEmbedding(vector)).toHaveLength(dims);
  });
});
