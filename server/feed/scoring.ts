import { MARKETPLACE_RANKING_CONFIG } from "@/server/feed/config";

export interface BuyerScoringContext {
  buyerId: string;
  hasHistory: boolean;
  latitude: number | null;
  longitude: number | null;
  targetPrice: number | null;
  targetQuantity: number | null;
}

export interface RankableListing {
  id: string;
  semanticFit: number;
  graphSignal: number;
  latitude: number | null;
  longitude: number | null;
  price: number | null;
  quantityAvailable: number;
  minOrderQuantity: number;
  updatedAt: Date;
  sellerReliability: number;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function radians(value: number) {
  return (value * Math.PI) / 180;
}

export function haversineDistanceKm(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
) {
  const latDelta = radians(toLat - fromLat);
  const lngDelta = radians(toLng - fromLng);
  const a =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(radians(fromLat)) *
      Math.cos(radians(toLat)) *
      Math.sin(lngDelta / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

function distanceScore(buyer: BuyerScoringContext, listing: RankableListing) {
  const config = MARKETPLACE_RANKING_CONFIG.scoring.distance;
  if (
    buyer.latitude === null ||
    buyer.longitude === null ||
    listing.latitude === null ||
    listing.longitude === null
  ) {
    return config.unknownScore;
  }
  const distance = haversineDistanceKm(
    buyer.latitude,
    buyer.longitude,
    listing.latitude,
    listing.longitude,
  );
  if (distance <= config.idealKm) return 1;
  return clamp01(
    1 -
      (distance - config.idealKm) /
        (config.maximumUsefulKm - config.idealKm),
  );
}

function priceScore(buyer: BuyerScoringContext, listing: RankableListing) {
  const config = MARKETPLACE_RANKING_CONFIG.scoring.price;
  if (!buyer.targetPrice || listing.price === null) return config.unknownScore;
  const ratio = listing.price / buyer.targetPrice;
  if (ratio <= 1) return 1;
  return clamp01(1 - (ratio - 1) / (config.zeroScoreRatio - 1));
}

function quantityScore(buyer: BuyerScoringContext, listing: RankableListing) {
  const config = MARKETPLACE_RANKING_CONFIG.scoring.quantity;
  if (!buyer.targetQuantity) return config.unknownScore;
  if (buyer.targetQuantity < listing.minOrderQuantity) return 0;
  const ratio = listing.quantityAvailable / buyer.targetQuantity;
  if (ratio >= 1) return 1;
  if (ratio <= config.minimumUsefulRatio) return 0;
  return clamp01(
    (ratio - config.minimumUsefulRatio) / (1 - config.minimumUsefulRatio),
  );
}

export function freshnessScore(updatedAt: Date, now = new Date()) {
  const config = MARKETPLACE_RANKING_CONFIG.scoring.freshness;
  const ageDays = Math.max(0, now.getTime() - updatedAt.getTime()) / 86_400_000;
  return Math.max(
    config.floor,
    Math.exp((-Math.LN2 * ageDays) / config.halfLifeDays),
  );
}

/**
 * Core reusable scorer. `context` is preloaded once for a feed request so this
 * function stays deterministic and does no I/O on the hot loop.
 *
 * The result is a relevance score in [0, 1], not a purchase probability.
 */
export function score(
  buyerId: string,
  listing: RankableListing,
  context: BuyerScoringContext,
  now = new Date(),
) {
  if (buyerId !== context.buyerId) {
    throw new Error("Scoring context does not belong to buyerId.");
  }

  const signals = {
    semanticFit: clamp01(listing.semanticFit),
    graphSignal: clamp01(listing.graphSignal),
    distanceFreight: distanceScore(context, listing),
    priceFit: priceScore(context, listing),
    quantityMatch: quantityScore(context, listing),
    freshness: freshnessScore(listing.updatedAt, now),
    sellerReliability: clamp01(listing.sellerReliability),
  };

  const weights = context.hasHistory
    ? MARKETPLACE_RANKING_CONFIG.scoring.weights
    : MARKETPLACE_RANKING_CONFIG.scoring.coldStartWeights;
  const weighted = Object.entries(weights).reduce(
    (sum, [name, weight]) =>
      sum + signals[name as keyof typeof signals] * weight,
    0,
  );
  const totalWeight = Object.values(weights).reduce((sum, value) => sum + value, 0);
  return clamp01(weighted / totalWeight);
}

export function sellerReliabilityScore(input: {
  reviewAverage: number | null;
  responseRate: number | null;
  fulfilledOrders: number;
  verifiedSeller: boolean;
  hasDocuments: boolean;
}) {
  const config = MARKETPLACE_RANKING_CONFIG.scoring.reliability;
  const review = clamp01((input.reviewAverage ?? 0) / 5);
  const response = clamp01((input.responseRate ?? 0) / 100);
  const orders = 1 - Math.exp(
    -Math.max(0, input.fulfilledOrders) / config.fulfilledOrdersSaturation,
  );
  return clamp01(
    review * config.reviewRating +
      response * config.responseRate +
      orders * config.fulfilledOrders +
      Number(input.verifiedSeller) * config.verifiedSeller +
      Number(input.hasDocuments) * config.supportingDocuments,
  );
}
