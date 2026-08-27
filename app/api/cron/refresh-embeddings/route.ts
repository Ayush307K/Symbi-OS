import { NextResponse } from "next/server";
import {
  integerEnvironment,
  isCronRequestAuthorized,
} from "@/server/cron-auth";
import { rebuildKnowledgeIndex } from "@/server/rag/index";
import { refreshStaleListingEmbeddings } from "@/server/semantic/embedding-maintenance";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isCronRequestAuthorized(request)) {
    return NextResponse.json(
      { error: "Unauthorized cron request.", code: "CRON_UNAUTHORIZED" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const startedAt = new Date();
  try {
    const listings = await refreshStaleListingEmbeddings({
      batchSize: integerEnvironment("DAILY_EMBEDDING_BATCH_SIZE", 50, 1, 500),
      concurrency: integerEnvironment("DAILY_EMBEDDING_CONCURRENCY", 4, 1, 20),
      maxListings: integerEnvironment(
        "DAILY_EMBEDDING_MAX_LISTINGS",
        500,
        1,
        10_000,
      ),
    });
    const rag = await rebuildKnowledgeIndex();
    const providerUnavailable =
      (listings.scanned > 0 &&
        listings.refreshed === 0 &&
        listings.failed > 0) ||
      (rag.documents > 0 &&
        rag.embeddedChunks + rag.reusedEmbeddedChunks === 0 &&
        rag.embeddingFailures.length > 0);
    return NextResponse.json(
      {
        ok: !providerUnavailable,
        degraded:
          listings.failed > 0 ||
          listings.remaining > 0 ||
          rag.embeddingFailures.length > 0,
        job: "daily-embedding-refresh",
        startedAt: startedAt.toISOString(),
        durationMs: Date.now() - startedAt.getTime(),
        listings,
        rag: {
          ...rag,
          embeddingFailureCount: rag.embeddingFailures.length,
          embeddingFailures: rag.embeddingFailures.slice(0, 20),
        },
      },
      {
        status: providerUnavailable ? 503 : 200,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    console.error("[Cron:daily-embedding-refresh]", error);
    return NextResponse.json(
      {
        ok: false,
        job: "daily-embedding-refresh",
        error: "Daily embedding refresh failed.",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
