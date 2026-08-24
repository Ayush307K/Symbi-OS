import { createHash } from "crypto";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { getEmbeddingProvider } from "@/server/semantic/embedding-provider";
import { vectorLiteral } from "@/server/semantic/listing-embeddings";
import { SAFE_CATEGORIES } from "@/server/safety";

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function tokenEstimate(value: string) {
  return Math.ceil(value.length / 4);
}

function chunks(value: string, maxChars = 2800) {
  const paragraphs = value.split(/\n+/).filter(Boolean);
  const result: string[] = [];
  let current = "";
  for (const paragraph of paragraphs) {
    if (current && current.length + paragraph.length + 1 > maxChars) {
      result.push(current);
      current = "";
    }
    current += `${current ? "\n" : ""}${paragraph}`;
  }
  if (current) result.push(current);
  return result;
}

export async function rebuildKnowledgeIndex(
  options: { includeEval?: boolean } = {},
) {
  const includeEval = options.includeEval ?? false;
  const listings = await prisma.marketplaceListing.findMany({
    where: {
      OR: [
        {
          isEvalOnly: false,
          sourceType: { in: ["real_api", "real_public_provider", "seller_submitted"] },
        },
        ...(includeEval ? [{ isEvalOnly: true }] : []),
      ],
      status: { in: ["ACTIVE", "active"] },
      category: { in: [...SAFE_CATEGORIES] },
      material: { toxicityLevel: { in: ["none", "low"] } },
    },
    include: {
      material: {
        include: {
          regulations: { include: { regulation: true } },
          upcyclers: { include: { company: true } },
        },
      },
      seller: true,
    },
    take: 2000,
  });
  const documents = listings.map((listing) => {
    const content = [
      `Listing: ${listing.title}`,
      `Material: ${listing.material.name}`,
      `Category: ${listing.category}; subcategory: ${listing.subcategory}`,
      `Safety classification: ${listing.material.toxicityLevel}`,
      `Description: ${listing.description}`,
      `Seller: ${listing.seller.name}`,
      `Location: ${listing.city}, ${listing.state}, ${listing.country}`,
      `Quantity: ${listing.quantityAvailable} ${listing.unit}`,
      `Price: ${listing.pricePerUnit} ${listing.currency} per ${listing.unit}`,
      `Minimum order: ${listing.minOrderQuantity} ${listing.unit}`,
      `Source: ${listing.sourceName ?? listing.sourceType}`,
      ...listing.material.regulations.map(
        ({ regulation }) => `Regulation ${regulation.code}: ${regulation.description}`
      ),
      ...listing.material.upcyclers.map(
        ({ company }) => `Potential upcycler: ${company.name}, ${company.location}`
      ),
    ].join("\n");
    return {
      sourceType: "LISTING",
      sourceId: listing.id,
      sourceUrl: listing.sourceUrl,
      title: listing.title,
      isEvalOnly: listing.isEvalOnly,
      content,
    };
  });

  let documentCount = 0;
  let chunkCount = 0;
  let embeddedChunkCount = 0;
  const embeddingFailures: string[] = [];
  for (const document of documents) {
    const contentHash = hash(
      `${document.sourceType}:${document.sourceId}:${document.isEvalOnly}:${document.content}`,
    );
    const record = await prisma.knowledgeDocument.upsert({
      where: { contentHash },
      create: {
        sourceType: document.sourceType,
        isEvalOnly: document.isEvalOnly,
        sourceId: document.sourceId,
        sourceUrl: document.sourceUrl,
        title: document.title,
        contentHash,
      },
      update: {
        sourceType: document.sourceType,
        isEvalOnly: document.isEvalOnly,
        sourceId: document.sourceId,
        sourceUrl: document.sourceUrl,
        title: document.title,
        status: "ACTIVE",
      },
    });
    const contentChunks = chunks(document.content);

    // Indexed with the document task type, matching how a query is embedded at
    // read time — retrieval is asymmetric. A provider failure leaves the chunks
    // in place without vectors, so retrieval still answers lexically instead of
    // the whole rebuild aborting.
    let embeddings: (number[] | null)[] = contentChunks.map(() => null);
    try {
      embeddings = await getEmbeddingProvider().embed(contentChunks, "document");
      embeddedChunkCount += embeddings.length;
    } catch (error) {
      embeddingFailures.push(
        `${document.title}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.knowledgeChunk.deleteMany({ where: { documentId: record.id } });
      for (const [index, content] of contentChunks.entries()) {
        const created = await tx.knowledgeChunk.create({
          data: {
            documentId: record.id,
            chunkIndex: index,
            content,
            tokenEstimate: tokenEstimate(content),
          },
        });
        const vector = embeddings[index];
        // Prisma cannot type a pgvector column, so the vector is written by a
        // second statement inside the same transaction.
        if (vector) {
          await tx.$executeRaw(
            Prisma.sql`UPDATE "KnowledgeChunk"
                       SET "embedding" = CAST(${vectorLiteral(vector)} AS vector)
                       WHERE "id" = ${created.id}`,
          );
        }
      }
    });
    documentCount += 1;
    chunkCount += contentChunks.length;
  }

  const activeHashes = documents.map((document) =>
    hash(`${document.sourceType}:${document.sourceId}:${document.isEvalOnly}:${document.content}`),
  );
  await prisma.knowledgeDocument.updateMany({
    where: {
      contentHash: { notIn: activeHashes },
      sourceType: "LISTING",
      ...(includeEval ? {} : { isEvalOnly: false }),
    },
    data: { status: "STALE" },
  });

  // Reclaim the chunks under stale documents.
  //
  // Documents are keyed by content hash, so any edit to a listing mints a new
  // document and retires the old one — but retiring only flipped a status, and
  // the old chunks stayed. One unrelated change to how listings render (units
  // moving from "Tons" to "ton") doubled this table: 54 stale documents still
  // holding 55 chunks and their 768-float vectors. Retrieval was unaffected,
  // since it filters on ACTIVE, so nothing would have surfaced this until the
  // index outgrew its usefulness.
  //
  // The document rows stay as tombstones; only their content and vectors go.
  const purged = await prisma.knowledgeChunk.deleteMany({
    where: { document: { status: "STALE" } },
  });
  return {
    documents: documentCount,
    chunks: chunkCount,
    embeddedChunks: embeddedChunkCount,
    provider: getEmbeddingProvider().name,
    purgedStaleChunks: purged.count,
    // Reported rather than thrown: a partially embedded index still answers,
    // and the caller needs to know which half it got.
    embeddingFailures,
  };
}
