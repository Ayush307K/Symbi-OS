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
    defaultProvider: "openai",
    defaultModel: "text-embedding-3-small",
    maxInputCharacters: 8_000,
    backfillBatchSize: 50,
    backfillConcurrency: 4,
  },
  retrieval: {
    semanticSeedCount: 60,
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
