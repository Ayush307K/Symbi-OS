import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { askMarketplaceAssistant } from "@/server/assistant";
import { isAccountHelpQuestion } from "@/server/assistant/account-help";
import { answerPlatformHelp } from "@/server/assistant/platform-help";
import { isSupportEscalationQuery } from "@/server/assistant/support";
import { isAssistantToolCandidate } from "@/server/assistant/tools";
import {
  apiError,
  ApiError,
  assertTrustedOrigin,
  parseJson,
  requireUser,
} from "@/server/http";
import { enforceRateLimit } from "@/server/rate-limit";

const schema = z
  .object({
    conversationId: z.string().uuid().optional(),
    query: z.string().trim().min(3).max(1000),
  })
  .strict();

export async function POST(request: NextRequest) {
  try {
    const started = performance.now();
    assertTrustedOrigin(request);
    const auth = await requireUser();
    await enforceRateLimit(`assistant:${auth.userId}`, {
      max: 30,
      windowMs: 60 * 60 * 1000,
    });
    const body = await parseJson(request, schema);

    // The assistant must never try to rebuild an index inside a request. This
    // mirrors /api/rag/query and gives the UI a stable operational error.
    if (
      !isAccountHelpQuestion(body.query) &&
      !answerPlatformHelp(body.query) &&
      !isAssistantToolCandidate(body.query) &&
      !isSupportEscalationQuery(body.query)
    ) {
      const knowledgeCount = await prisma.knowledgeChunk.count({
        where: { document: { status: "ACTIVE", isEvalOnly: false } },
      });
      if (!knowledgeCount) {
        throw new ApiError(
          503,
          "Marketplace research is unavailable because the knowledge index has not been built yet.",
          "KNOWLEDGE_INDEX_EMPTY",
        );
      }
    }

    const result = await askMarketplaceAssistant({
      userId: auth.userId,
      conversationId: body.conversationId,
      query: body.query,
    });
    const elapsedMs = Math.round((performance.now() - started) * 10) / 10;
    return NextResponse.json(result, {
      status: 201,
      headers: {
        "Cache-Control": "private, no-store",
        "Server-Timing": `assistant;dur=${elapsedMs}`,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
