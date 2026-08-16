import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { answerWithRag } from "@/server/rag/query";
import {
  apiError,
  ApiError,
  assertTrustedOrigin,
  parseJson,
  requireUser,
} from "@/server/http";
import prisma from "@/lib/prisma";

const schema = z.object({
  query: z.string().trim().min(3).max(1000),
  topK: z.coerce.number().int().min(1).max(10).default(6),
});

/**
 * Answers a question from the knowledge index. It does not build one.
 *
 * This route used to rebuild the whole index inline whenever it found it empty:
 * every listing re-read, re-chunked and re-embedded before the first answer
 * could be returned. That is a minutes-long job behind a serverless function's
 * timeout, and it ran under whichever user happened to ask the first question
 * after a deploy — so the failure landed on them, as a timeout with no
 * explanation, while the rebuild died halfway and left a partial index behind.
 *
 * Building belongs to `npm run rag:index`. An empty index is now reported as
 * what it is: an operational state, not the user's query returning nothing.
 */
export async function POST(request: NextRequest) {
  try {
    assertTrustedOrigin(request);
    await requireUser();
    const body = await parseJson(request, schema);

    const count = await prisma.knowledgeChunk.count({
      where: { document: { status: "ACTIVE" } },
    });
    if (!count) {
      throw new ApiError(
        503,
        "Marketplace research is unavailable because the knowledge index has not been built yet.",
        "KNOWLEDGE_INDEX_EMPTY",
      );
    }

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
