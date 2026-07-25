import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { answerWithRag } from "@/server/rag/query";
import { rebuildKnowledgeIndex } from "@/server/rag/index";
import { apiError, assertTrustedOrigin, parseJson, requireUser } from "@/server/http";
import prisma from "@/lib/prisma";

const schema = z.object({
  query: z.string().trim().min(3).max(1000),
  topK: z.coerce.number().int().min(1).max(10).default(6),
});

export async function POST(request: NextRequest) {
  try {
    assertTrustedOrigin(request);
    await requireUser();
    const body = await parseJson(request, schema);
    const count = await prisma.knowledgeChunk.count({
      where: { document: { status: "ACTIVE" } },
    });
    if (!count) await rebuildKnowledgeIndex();
    const result = await answerWithRag(body.query, body.topK);
    return NextResponse.json({
      answer: result.answer,
      citations: result.citations,
      retrieval: result.retrieval,
    });
  } catch (error) {
    return apiError(error);
  }
}
