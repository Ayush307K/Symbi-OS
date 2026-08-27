import { NextResponse } from "next/server";
import {
  integerEnvironment,
  isCronRequestAuthorized,
} from "@/server/cron-auth";
import { syncDailyListings } from "@/server/listings/daily-sync";

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
    const result = await syncDailyListings({
      maxRowsPerProvider: integerEnvironment(
        "DAILY_LISTING_MAX_ROWS_PER_PROVIDER",
        500,
        1,
        2_000,
      ),
      staleAfterDays: integerEnvironment(
        "IMPORTED_LISTING_STALE_DAYS",
        14,
        1,
        365,
      ),
    });
    if (result.completed === 0) {
      return NextResponse.json(
        {
          ok: false,
          job: "daily-listing-sync",
          startedAt: startedAt.toISOString(),
          durationMs: Date.now() - startedAt.getTime(),
          ...result,
        },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      {
        ok: true,
        job: "daily-listing-sync",
        startedAt: startedAt.toISOString(),
        durationMs: Date.now() - startedAt.getTime(),
        ...result,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[Cron:daily-listing-sync]", error);
    return NextResponse.json(
      {
        ok: false,
        job: "daily-listing-sync",
        error: "Daily listing synchronization failed.",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
