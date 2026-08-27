import { Prisma, type PrismaClient } from "@prisma/client";
import prisma from "@/lib/prisma";
import { MARKETPLACE_RANKING_CONFIG } from "@/server/feed/config";
import {
  getEmbeddingProvider,
  validateEmbedding,
  type EmbeddingProvider,
} from "@/server/semantic/embedding-provider";

export interface ListingEmbeddingInput {
  materialName: string;
  description: string;
  category: string;
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function listingEmbeddingText(input: ListingEmbeddingInput) {
  return [
    `Material: ${normalizeText(input.materialName)}`,
    `Category: ${normalizeText(input.category)}`,
    `Description: ${normalizeText(input.description)}`,
  ]
    .join("\n")
    .slice(0, MARKETPLACE_RANKING_CONFIG.embedding.maxInputCharacters);
}

export async function embedListing(
  input: ListingEmbeddingInput,
  provider: EmbeddingProvider = getEmbeddingProvider(),
) {
  const [vector] = await provider.embed([listingEmbeddingText(input)]);
  if (!vector)
    throw new Error("Embedding provider returned no listing vector.");
  return validateEmbedding(vector, provider.dimensions);
}

export function vectorLiteral(vector: readonly number[]) {
  const valid = validateEmbedding(vector);
  return `[${valid.join(",")}]`;
}

export async function writeListingEmbedding(
  listingId: string,
  vector: readonly number[],
  client: Pick<PrismaClient, "$executeRaw"> = prisma,
) {
  const literal = vectorLiteral(vector);
  await client.$executeRaw(
    Prisma.sql`UPDATE "MarketplaceListing"
               SET "embedding" = CAST(${literal} AS vector),
                   "embeddingUpdatedAt" = CURRENT_TIMESTAMP
               WHERE "id" = ${listingId}`,
  );
}

export async function refreshListingEmbedding(
  listingId: string,
  provider: EmbeddingProvider = getEmbeddingProvider(),
) {
  const listing = await prisma.marketplaceListing.findUniqueOrThrow({
    where: { id: listingId },
    select: {
      id: true,
      category: true,
      description: true,
      material: { select: { name: true } },
    },
  });
  const vector = await embedListing(
    {
      materialName: listing.material.name,
      description: listing.description,
      category: listing.category,
    },
    provider,
  );
  await writeListingEmbedding(listing.id, vector);
  return vector;
}

/**
 * Listing persistence must not become unavailable when an embedding vendor is
 * degraded. The write hook therefore attempts the vector synchronously, leaves
 * the nullable column empty on failure, and relies on the resumable backfill.
 */
export async function tryRefreshListingEmbedding(listingId: string) {
  try {
    await refreshListingEmbedding(listingId);
    return true;
  } catch (error) {
    console.warn("[ListingEmbedding] refresh deferred", {
      listingId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return false;
  }
}
