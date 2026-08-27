/**
 * The ranked feed's complete tuning surface.
 *
 * Keep ranking and graph constants here. Scores are relevance scores in [0, 1],
 * not calibrated purchase probabilities. Changing these values should be
 * accompanied by fixture/evaluation updates once real interaction data exists.
 */
export const MARKETPLACE_RANKING_CONFIG = {
  embedding: {
    dimensions: 768,
    defaultProvider: "gemini",
    defaultModel: "text-embedding-3-small",
    maxInputCharacters: 8_000,
    backfillBatchSize: 50,
    backfillConcurrency: 4,
    gemini: {
      model: "gemini-embedding-001",
      // gemini-embedding-001 is natively 3072-wide and uses Matryoshka
      // representation learning, so it can be asked for a shorter prefix. 768
      // is requested because that is the width of the vector columns and their
      // HNSW indexes; changing one without the other invalidates the index.
      outputDimensionality: 768,
      // Only the full-width vector comes back unit length. A truncated one does
      // not — measured at 0.587 for a 768-wide sample — and the indexes are
      // built with vector_cosine_ops, so vectors must be normalised before they
      // are stored or compared. See normalizeUnitVector.
      normalizeAfterTruncation: true,
      // Retrieval quality is asymmetric: the same text embedded as a document
      // and as a query lands in different places. Gemini exposes that directly.
      documentTaskType: "RETRIEVAL_DOCUMENT",
      queryTaskType: "RETRIEVAL_QUERY",
      // Requests carrying more than this many inputs are split.
      maxBatchSize: 100,
      rateLimit: {
        // The free tier caps requests per minute; a full backfill exceeds it.
        maxRetries: 5,
        baseDelayMs: 2_000,
      },
    },
  },
  /**
   * Grounded answer generation for RAG.
   *
   * gemini-2.5-flash is documented widely but returns 404 "no longer available
   * to new users" on a newly issued key; gemini-flash-latest is the supported
   * alias and was verified against this project's key. Override with
   * GEMINI_RAG_MODEL if a specific pinned version is needed.
   */
  generation: {
    defaultProvider: "gemini",
    gemini: {
      model: "gemini-flash-latest",
      temperature: 0.2,
      maxOutputTokens: 2_048,
    },
  },
  /**
   * RAG retrieval. Shares the vector store and embedding model with the feed;
   * only the blend and pool sizes are its own.
   */
  rag: {
    // Wider than a page, because the lexical blend reorders the pool and a
    // narrower cut would drop rows that finish higher.
    candidatePoolSize: 60,
    semanticWeight: 0.7,
    lexicalWeight: 0.3,
    // Only reached when nothing is embedded yet. Bounded so a lexical fallback
    // cannot turn into an unbounded table read.
    lexicalScanLimit: 2_000,
    /**
     * Relevance floors, one per retrieval path, because the two produce
     * different score distributions and a single number would be wrong for one
     * of them. Measured against this catalogue:
     *
     *   hybrid   real 0.49–0.82   irrelevant 0.32–0.47
     *   lexical  real 0.33–0.78   incidental 0.11–0.17
     *
     * Embedding similarity has a high floor — unrelated text still scores ~0.35
     * — so cosine alone never reaches zero and "no results" has to be a
     * decision rather than an absence.
     *
     * hybrid sits at 0.45: comfortably below the weakest real answer measured
     * (0.491) and above every irrelevant one. It is deliberately not tightened
     * to 0.48, which would separate the last marginal case ("titanium
     * turnings", 0.467, nothing in the catalogue) at the cost of leaving only
     * 0.011 of headroom under a genuine answer. Dropping a real result is worse
     * than passing a weak one, which the grounding instruction already makes
     * the model hedge rather than answer.
     */
    minScore: {
      hybrid: 0.45,
      lexical: 0.2,
    },
  },
  retrieval: {
    semanticSeedCount: 60,
    // Reserve deterministic candidates for inferred industry/category fit;
    // ANN still provides the semantic pool, but cannot erase cold-start intent.
    categoryAffinitySeedCount: 20,
    // Higher than top-k so filtered HNSW queries have enough dynamic candidates.
    hnswEfSearch: 100,
    maxSeedMaterials: 40,
    graphNeighborsPerHop: 12,
    secondHopPenalty: 0.72,
    maxCandidates: 240,
    defaultPageSize: 24,
    maxPageSize: 50,
    performanceBudgetMs: 500,
    profileFreshnessMinutes: 15,
  },
  graph: {
    // A 90-day half-life means a signal contributes half as much every 90 days.
    recencyHalfLifeDays: 90,
    // Converts accumulated decayed events into [0, 1]: 1 - exp(-signal / scale).
    frequencySaturation: 4,
    coPurchaseEventWeight: 1,
    sameBuyerAffinityWeight: 0.7,
    edgeTypeWeights: {
      co_purchased: 1,
      substitutable: 0.85,
      category_affinity: 0.7,
    },
    // Taxonomy/supply edges stay useful before the first completed transaction.
    exactBaseElementWeight: 0.82,
    sameCategoryWeight: 0.38,
    supplyFrequencySaturation: 6,
  },
  scoring: {
    // A taxonomy match inferred from company industry/history is treated as a
    // minimum semantic relevance. Cold-start buyers lean on it more strongly;
    // behavioral buyers still let vector and graph evidence differentiate.
    categoryAffinityFloor: {
      coldStart: 0.9,
      behavioral: 0.72,
    },
    // Scrap is logistics-heavy, so business signals deliberately total 70%.
    weights: {
      semanticFit: 0.2,
      graphSignal: 0.1,
      distanceFreight: 0.22,
      priceFit: 0.14,
      quantityMatch: 0.12,
      freshness: 0.09,
      sellerReliability: 0.13,
    },
    // With no behavioral history, only these defensible signals participate.
    coldStartWeights: {
      semanticFit: 0.38,
      distanceFreight: 0.4,
      freshness: 0.22,
    },
    distance: {
      idealKm: 75,
      maximumUsefulKm: 2_000,
      unknownScore: 0.35,
    },
    price: {
      unknownScore: 0.45,
      // Listings at twice the buyer's observed target price score zero.
      zeroScoreRatio: 2,
    },
    quantity: {
      unknownScore: 0.45,
      // Supply at or above target scores best; severe under-supply decays smoothly.
      minimumUsefulRatio: 0.1,
    },
    freshness: {
      halfLifeDays: 30,
      floor: 0.08,
    },
    reliability: {
      reviewRating: 0.35,
      responseRate: 0.25,
      fulfilledOrders: 0.2,
      verifiedSeller: 0.15,
      supportingDocuments: 0.05,
      fulfilledOrdersSaturation: 25,
    },
  },
} as const;

export type MarketplaceRankingConfig = typeof MARKETPLACE_RANKING_CONFIG;
