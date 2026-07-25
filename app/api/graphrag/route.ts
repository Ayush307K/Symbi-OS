import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { answerWithRag } from "@/server/rag/query";
import { rebuildKnowledgeIndex } from "@/server/rag/index";
import { apiError, assertTrustedOrigin, parseJson, requireUser } from "@/server/http";

const schema = z.object({
  query: z.string().trim().min(3).max(1000),
});

export async function POST(request: NextRequest) {
  try {
    assertTrustedOrigin(request);
    await requireUser();
    const { query } = await parseJson(request, schema);
    const count = await prisma.knowledgeChunk.count({
      where: { document: { status: "ACTIVE" } },
    });
    if (!count) await rebuildKnowledgeIndex();
    const rag = await answerWithRag(query, 6);
    const listingIds = [
      ...new Set(
        rag.chunks
          .map((chunk) => chunk.document.sourceId)
          .filter((value): value is string => Boolean(value))
      ),
    ];
    const listings = await prisma.marketplaceListing.findMany({
      where: { id: { in: listingIds } },
      include: { material: true, seller: true },
    });
    const nodes = listings.flatMap((listing) => [
      {
        id: listing.seller.id,
        label: "Company",
        properties: {
          id: listing.seller.id,
          name: listing.seller.name,
          industry: listing.seller.industry,
          location: listing.seller.location,
        },
      },
      {
        id: listing.material.id,
        label: "WasteMaterial",
        properties: {
          id: listing.material.id,
          name: listing.material.name,
          category: listing.material.category,
          toxicity_level: listing.material.toxicityLevel,
          description: listing.material.description,
        },
      },
    ]);
    const uniqueNodes = [...new Map(nodes.map((node) => [node.id, node])).values()];
    return NextResponse.json({
      answer: rag.answer,
      citations: rag.citations,
      retrieval: rag.retrieval,
      cypher: "Grounded hybrid retrieval over approved listing knowledge chunks.",
      graphData: {
        nodes: uniqueNodes,
        edges: listings.map((listing) => ({
          source: listing.seller.id,
          target: listing.material.id,
          type: "PRODUCES",
        })),
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
