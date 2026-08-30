import type { DeliveryTerm } from "@/lib/logistics";
import { haversineDistanceKm } from "@/server/feed/scoring";
import { ApiError } from "@/server/http";

const FREIGHT_CONFIG = {
  roadDistanceFactor: 1.18,
  ratePerTonneKm: 4.5,
  minimumQuote: 1_500,
  quoteValidityHours: 24,
} as const;

export interface FreightQuoteInput {
  deliveryTerm: DeliveryTerm;
  quantity: number;
  unit: string;
  listingLatitude: number | null;
  listingLongitude: number | null;
  destinationLatitude: number | null;
  destinationLongitude: number | null;
  now?: Date;
}

function roundedMoney(value: number) {
  return Math.round(value / 10) * 10;
}

function chargeableTonnes(quantity: number, unit: string) {
  if (unit === "kg") return Math.max(0.001, quantity / 1_000);
  // A source-defined lot has no canonical weight in v0. The sandbox estimator
  // therefore treats one lot as one chargeable tonne and labels its source;
  // production replaces this adapter with a seller/carrier quote.
  return Math.max(0.001, quantity);
}

export function calculateFreightQuote(input: FreightQuoteInput) {
  const now = input.now ?? new Date();
  const hasDistance =
    input.listingLatitude !== null &&
    input.listingLongitude !== null &&
    input.destinationLatitude !== null &&
    input.destinationLongitude !== null;
  const straightLineDistanceKm = hasDistance
    ? haversineDistanceKm(
        input.listingLatitude!,
        input.listingLongitude!,
        input.destinationLatitude!,
        input.destinationLongitude!,
      )
    : null;
  const distanceKm =
    straightLineDistanceKm === null
      ? null
      : Math.round(straightLineDistanceKm * FREIGHT_CONFIG.roadDistanceFactor * 10) / 10;

  if (input.deliveryTerm === "FREIGHT_QUOTE_REQUIRED" && distanceKm === null) {
    throw new ApiError(
      422,
      "Freight cannot be quoted until both dispatch and delivery locations are geocoded.",
      "FREIGHT_DISTANCE_UNAVAILABLE",
    );
  }

  let amount = 0;
  let source: "BUYER_ARRANGED" | "INCLUDED_IN_PRICE" | "SANDBOX_ESTIMATOR";
  if (input.deliveryTerm === "DELIVERED") {
    source = "INCLUDED_IN_PRICE";
  } else if (["EX_WORKS", "FOB"].includes(input.deliveryTerm)) {
    source = "BUYER_ARRANGED";
  } else {
    source = "SANDBOX_ESTIMATOR";
    amount = roundedMoney(
      Math.max(
        FREIGHT_CONFIG.minimumQuote,
        distanceKm! * chargeableTonnes(input.quantity, input.unit) * FREIGHT_CONFIG.ratePerTonneKm,
      ),
    );
  }

  return {
    distanceKm,
    amount,
    source,
    expiresAt: new Date(now.getTime() + FREIGHT_CONFIG.quoteValidityHours * 60 * 60 * 1_000),
    configVersion: "freight-sandbox-v1",
  };
}
