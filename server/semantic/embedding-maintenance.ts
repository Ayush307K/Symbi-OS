import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { MARKETPLACE_RANKING_CONFIG } from "@/server/feed/config";
import {
  getEmbeddingProvider,
  validateEmbedding,
} from "@/server/semantic/embedding-provider";
import {
  listingEmbeddingText,
  writeListingEmbedding,
} from "@/server/semantic/listing-embeddings";

export interface ListingEmbeddingRefreshOptions {
  batchSize?: number;
  concurrency?: number;
  maxListings?: number;
  after?: string;
  force?: boolean;
  includeEval?: boolean;
}

function positiveInteger(
  value: number | undefined,
  fallback: number,
  max: number,
) {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new Error(`Expected an integer from 1 to ${max}; received ${value}.`);
  }
  return value;
}

function stalePredicate(force: boolean) {
  return force
    ? Prisma.empty
    : Prisma.sql`AND (
        "embedding" IS NULL
        OR "embeddingUpdatedAt" IS NULL
        OR "embeddingUpdatedAt" < "updatedAt"
      )`;
}

/**
 * Refresh only missing or stale listing vectors.
 *
 * The cursor and hard cap keep this safe inside a serverless cron invocation.
 * Failed rows stay stale and are retried on the next run; successful rows move
 * themselves out of the query by advancing embeddingUpdatedAt.
 */
export async function refreshStaleListingEmbeddings(
  options: ListingEmbeddingRefreshOptions = {},
) {
  const batchSize = positiveInteger(
    options.batchSize,
    MARKETPLACE_RANKING_CONFIG.embedding.backfillBatchSize,
    500,
  );
  const concurrency = positiveInteger(
    options.concurrency,
    MARKETPLACE_RANKING_CONFIG.embedding.backfillConcurrency,
    20,
  );
  const maxListings = positiveInteger(options.maxListings, 10_000, 10_000);
  const includeEval = options.includeEval ?? false;
  const force = options.force ?? false;
  const provider = getEmbeddingProvider();
  const failures: Array<{ listingId: string; error: string }> = [];
  let cursor = options.after ?? "";
  let scanned = 0;
  let refreshed = 0;

  while (scanned < maxListings) {
    const take = Math.min(batchSize, maxListings - scanned);
    const rows = await prisma.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT "id"
                 FROM "MarketplaceListing"
                 WHERE "id" > ${cursor}
                   AND "status" IN ('ACTIVE', 'active')
                   ${includeEval ? Prisma.empty : Prisma.sql`AND "isEvalOnly" = false`}
                   ${stalePredicate(force)}
                 ORDER BY "id" ASC
                 LIMIT ${take}`,
    );
    if (!rows.length) break;

    const listings = await prisma.marketplaceListing.findMany({
      where: { id: { in: rows.map((row) => row.id) } },
      select: {
        id: true,
        category: true,
        description: true,
        material: { select: { name: true } },
      },
    });
    const listingById = new Map(
      listings.map((listing) => [listing.id, listing]),
    );
    const orderedListings = rows.flatMap((row) => {
      const listing = listingById.get(row.id);
      if (!listing) {
        failures.push({
          listingId: row.id,
          error: "Listing disappeared before it could be embedded.",
        });
        return [];
      }
      return [listing];
    });

    try {
      // Providers receive a whole batch here. Gemini splits only when its own
      // request limit is reached, avoiding one paid network call per listing.
      const vectors = await provider.embed(
        orderedListings.map((listing) =>
          listingEmbeddingText({
            materialName: listing.material.name,
            description: listing.description,
            category: listing.category,
          }),
        ),
        "document",
      );
      if (vectors.length !== orderedListings.length) {
        throw new Error(
          `${provider.name} returned ${vectors.length} vectors for ${orderedListings.length} listings.`,
        );
      }

      for (
        let index = 0;
        index < orderedListings.length;
        index += concurrency
      ) {
        const listingChunk = orderedListings.slice(index, index + concurrency);
        const vectorChunk = vectors.slice(index, index + concurrency);
        const results = await Promise.allSettled(
          listingChunk.map((listing, offset) =>
            writeListingEmbedding(
              listing.id,
              validateEmbedding(vectorChunk[offset], provider.dimensions),
            ),
          ),
        );
        for (const [offset, result] of results.entries()) {
          if (result.status === "fulfilled") {
            refreshed += 1;
          } else {
            failures.push({
              listingId: listingChunk[offset].id,
              error:
                result.reason instanceof Error
                  ? result.reason.message.slice(0, 300)
                  : String(result.reason).slice(0, 300),
            });
          }
        }
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message.slice(0, 300)
          : String(error).slice(0, 300);
      failures.push(
        ...orderedListings.map((listing) => ({
          listingId: listing.id,
          error: message,
        })),
      );
    }

    scanned += rows.length;
    cursor = rows[rows.length - 1].id;
    if (rows.length < take) break;
  }

  const [remaining] = await prisma.$queryRaw<Array<{ count: number }>>(
    Prisma.sql`SELECT COUNT(*)::int AS "count"
               FROM "MarketplaceListing"
               WHERE "status" IN ('ACTIVE', 'active')
                 ${includeEval ? Prisma.empty : Prisma.sql`AND "isEvalOnly" = false`}
                 ${stalePredicate(false)}`,
  );

  return {
    provider: provider.name,
    scanned,
    refreshed,
    failed: failures.length,
    failures: failures.slice(0, 20),
    remaining: remaining?.count ?? 0,
    cursor: cursor || null,
  };
}
