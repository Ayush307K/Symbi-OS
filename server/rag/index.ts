import { createHash } from "crypto";
import prisma from "@/lib/prisma";
import { embedDocuments } from "@/lib/embeddings";
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

export async function rebuildKnowledgeIndex() {
  const listings = await prisma.marketplaceListing.findMany({
    where: {
      status: { in: ["ACTIVE", "active"] },
      sourceType: { in: ["real_api", "real_public_provider", "seller_submitted"] },
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
      content,
    };
  });

  let documentCount = 0;
  let chunkCount = 0;
  for (const document of documents) {
    const contentHash = hash(document.content);
    const record = await prisma.knowledgeDocument.upsert({
      where: { contentHash },
      create: {
        sourceType: document.sourceType,
        sourceId: document.sourceId,
        sourceUrl: document.sourceUrl,
        title: document.title,
        contentHash,
      },
      update: {
        sourceType: document.sourceType,
        sourceId: document.sourceId,
        sourceUrl: document.sourceUrl,
        title: document.title,
        status: "ACTIVE",
      },
    });
    const contentChunks = chunks(document.content);
    const embeddings = process.env.OPENAI_API_KEY
      ? await embedDocuments(contentChunks)
      : contentChunks.map(() => null);
    await prisma.$transaction([
      prisma.knowledgeChunk.deleteMany({ where: { documentId: record.id } }),
      ...contentChunks.map((content, index) =>
        prisma.knowledgeChunk.create({
          data: {
            documentId: record.id,
            chunkIndex: index,
            content,
            embeddingJson: embeddings[index]
              ? JSON.stringify(embeddings[index])
              : null,
            tokenEstimate: tokenEstimate(content),
          },
        })
      ),
    ]);
    documentCount += 1;
    chunkCount += contentChunks.length;
  }

  const activeHashes = documents.map((document) => hash(document.content));
  await prisma.knowledgeDocument.updateMany({
    where: { contentHash: { notIn: activeHashes }, sourceType: "LISTING" },
    data: { status: "STALE" },
  });
  return {
    documents: documentCount,
    chunks: chunkCount,
    embeddings: Boolean(process.env.OPENAI_API_KEY),
  };
}
