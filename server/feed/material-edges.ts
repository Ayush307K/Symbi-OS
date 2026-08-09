import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { MARKETPLACE_RANKING_CONFIG } from "@/server/feed/config";

export type MaterialEdgeType =
  | "co_purchased"
  | "substitutable"
  | "category_affinity";

/** Exponential time decay: after one half-life an event contributes 0.5. */
export function recencyDecay(ageDays: number, halfLifeDays: number) {
  if (halfLifeDays <= 0) throw new Error("halfLifeDays must be positive.");
  return Math.exp((-Math.LN2 * Math.max(0, ageDays)) / halfLifeDays);
}

/**
 * Converts a sum of frequency × recency signals into a bounded edge weight.
 * `saturation` controls how quickly repeated events approach one.
 */
export function decayedFrequencyWeight(
  events: ReadonlyArray<{ ageDays: number; frequency?: number }>,
  options: { halfLifeDays?: number; saturation?: number; eventWeight?: number } = {},
) {
  const halfLifeDays =
    options.halfLifeDays ?? MARKETPLACE_RANKING_CONFIG.graph.recencyHalfLifeDays;
  const saturation =
    options.saturation ?? MARKETPLACE_RANKING_CONFIG.graph.frequencySaturation;
  const eventWeight = options.eventWeight ?? 1;
  if (saturation <= 0) throw new Error("saturation must be positive.");
  const signal = events.reduce(
    (sum, event) =>
      sum +
      Math.max(0, event.frequency ?? 1) *
        recencyDecay(event.ageDays, halfLifeDays) *
        eventWeight,
    0,
  );
  return 1 - Math.exp(-signal / saturation);
}

export async function refreshMaterialEdges(
  client: typeof prisma = prisma,
  now = new Date(),
) {
  const config = MARKETPLACE_RANKING_CONFIG.graph;
  const halfLife = config.recencyHalfLifeDays;
  const frequencySaturation = config.frequencySaturation;

  await client.$transaction(async (tx) => {
    // Same-order material pairs are the strongest behavioral relationship.
    await tx.$executeRaw(
      Prisma.sql`
        WITH order_materials AS (
          SELECT DISTINCT
            po."id" AS order_id,
            ml."materialId" AS material_id,
            po."createdAt" AS occurred_at
          FROM "PurchaseOrder" po
          JOIN "PurchaseOrderItem" poi ON poi."orderId" = po."id"
          JOIN "MarketplaceListing" ml ON ml."id" = poi."listingId"
          WHERE po."status" IN ('CONFIRMED', 'CLOSED')
             OR po."paymentStatus" = 'PAID'
             OR po."fulfillmentStatus" IN ('FULFILLED', 'DELIVERED')
        ), pair_signal AS (
          SELECT
            source.material_id AS src,
            target.material_id AS dst,
            SUM(
              EXP(
                -LN(2) *
                GREATEST(0, EXTRACT(EPOCH FROM (${now}::timestamp - source.occurred_at)) / 86400) /
                ${halfLife}
              ) * ${config.coPurchaseEventWeight}
            ) AS signal
          FROM order_materials source
          JOIN order_materials target
            ON target.order_id = source.order_id
           AND target.material_id <> source.material_id
          GROUP BY source.material_id, target.material_id
        )
        INSERT INTO "material_edges" ("src", "dst", "edge_type", "weight", "updated_at")
        SELECT
          src,
          dst,
          'co_purchased',
          1 - EXP(-signal / ${frequencySaturation}),
          ${now}
        FROM pair_signal
        ON CONFLICT ("src", "dst", "edge_type") DO UPDATE SET
          "weight" = EXCLUDED."weight",
          "updated_at" = EXCLUDED."updated_at"
      `,
    );

    // Materials bought by the same buyer in separate transactions form a
    // broader category-affinity signal. Frequency and the newer event's age
    // both contribute, so this is not a binary edge.
    await tx.$executeRaw(
      Prisma.sql`
        WITH purchase_events AS (
          SELECT DISTINCT
            po."buyerUserId" AS buyer_id,
            ml."materialId" AS material_id,
            po."createdAt" AS occurred_at
          FROM "PurchaseOrder" po
          JOIN "PurchaseOrderItem" poi ON poi."orderId" = po."id"
          JOIN "MarketplaceListing" ml ON ml."id" = poi."listingId"
          WHERE po."status" IN ('CONFIRMED', 'CLOSED')
             OR po."paymentStatus" = 'PAID'
             OR po."fulfillmentStatus" IN ('FULFILLED', 'DELIVERED')
        ), pair_signal AS (
          SELECT
            source.material_id AS src,
            target.material_id AS dst,
            SUM(
              EXP(
                -LN(2) *
                GREATEST(
                  0,
                  EXTRACT(EPOCH FROM (
                    ${now}::timestamp - GREATEST(source.occurred_at, target.occurred_at)
                  )) / 86400
                ) /
                ${halfLife}
              ) * ${config.sameBuyerAffinityWeight}
            ) AS signal
          FROM purchase_events source
          JOIN purchase_events target
            ON target.buyer_id = source.buyer_id
           AND target.material_id <> source.material_id
          GROUP BY source.material_id, target.material_id
        )
        INSERT INTO "material_edges" ("src", "dst", "edge_type", "weight", "updated_at")
        SELECT
          src,
          dst,
          'category_affinity',
          1 - EXP(-signal / ${frequencySaturation}),
          ${now}
        FROM pair_signal
        ON CONFLICT ("src", "dst", "edge_type") DO UPDATE SET
          "weight" = EXCLUDED."weight",
          "updated_at" = EXCLUDED."updated_at"
      `,
    );

    // Substitution starts with the existing taxonomy, then is made continuous
    // with current supply frequency and recency. Exact base-element peers are
    // stronger than category-only peers, while stale/scarce supply contributes
    // less than frequently refreshed supply.
    await tx.$executeRaw(
      Prisma.sql`
        WITH supply AS (
          SELECT
            wm."id" AS material_id,
            wm."category" AS category,
            LOWER(TRIM(wm."baseElement")) AS base_element,
            COUNT(ml."id") FILTER (
              WHERE ml."status" IN ('ACTIVE', 'active')
            ) AS active_listings,
            MAX(ml."updatedAt") FILTER (
              WHERE ml."status" IN ('ACTIVE', 'active')
            ) AS freshest_listing
          FROM "WasteMaterial" wm
          LEFT JOIN "MarketplaceListing" ml ON ml."materialId" = wm."id"
          GROUP BY wm."id", wm."category", wm."baseElement"
        ), substitutes AS (
          SELECT
            source.material_id AS src,
            target.material_id AS dst,
            CASE
              WHEN source.base_element = target.base_element
                THEN ${config.exactBaseElementWeight}
              ELSE ${config.sameCategoryWeight}
            END AS taxonomy_strength,
            SQRT(
              source.active_listings::double precision *
              target.active_listings::double precision
            ) AS supply_frequency,
            GREATEST(source.freshest_listing, target.freshest_listing) AS freshest_listing
          FROM supply source
          JOIN supply target
            ON target.category = source.category
           AND target.material_id <> source.material_id
          WHERE source.active_listings > 0 AND target.active_listings > 0
        )
        INSERT INTO "material_edges" ("src", "dst", "edge_type", "weight", "updated_at")
        SELECT
          src,
          dst,
          'substitutable',
          LEAST(
            1,
            taxonomy_strength *
            (1 - EXP(-supply_frequency / ${config.supplyFrequencySaturation})) *
            (
              0.5 + 0.5 * EXP(
                -LN(2) *
                GREATEST(0, EXTRACT(EPOCH FROM (${now}::timestamp - freshest_listing)) / 86400) /
                ${halfLife}
              )
            )
          ),
          ${now}
        FROM substitutes
        WHERE freshest_listing IS NOT NULL
        ON CONFLICT ("src", "dst", "edge_type") DO UPDATE SET
          "weight" = EXCLUDED."weight",
          "updated_at" = EXCLUDED."updated_at"
      `,
    );

    // Remove relationships no longer produced by this run, without exposing a
    // half-refreshed graph to readers outside the transaction.
    await tx.materialEdge.deleteMany({ where: { updatedAt: { lt: now } } });
  });

  const counts = await client.materialEdge.groupBy({
    by: ["edgeType"],
    _count: { _all: true },
  });
  return Object.fromEntries(
    counts.map((item) => [item.edgeType as MaterialEdgeType, item._count._all]),
  ) as Partial<Record<MaterialEdgeType, number>>;
}
