import { Buffer } from "node:buffer";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { MARKETPLACE_RANKING_CONFIG } from "@/server/feed/config";
import {
  rankBuyerFeed,
  type RankedFeedCursor,
} from "@/server/feed/ranked-feed";
import { apiError, ApiError, requireUser } from "@/server/http";
import { expireListings } from "@/server/listings/lifecycle";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(24),
  cursor: z.string().max(500).optional(),
  deliveryAddressId: z.string().uuid().optional(),
});

function decodeCursor(cursor?: string): RankedFeedCursor | undefined {
  if (!cursor) return undefined;
  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as Partial<RankedFeedCursor>;
    if (
      typeof parsed.id !== "string" ||
      !parsed.id ||
      typeof parsed.score !== "number" ||
      !Number.isFinite(parsed.score) ||
      parsed.score < 0 ||
      parsed.score > 1 ||
      typeof parsed.asOf !== "number" ||
      !Number.isFinite(parsed.asOf) ||
      parsed.asOf > Date.now() + 60_000 ||
      parsed.asOf < Date.now() - 24 * 60 * 60 * 1_000
    ) {
      throw new Error("Invalid cursor payload");
    }
    return { id: parsed.id, score: parsed.score, asOf: parsed.asOf };
  } catch {
    throw new ApiError(400, "Invalid pagination cursor.", "CURSOR_INVALID");
  }
}

function encodeCursor(cursor: RankedFeedCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export async function GET(request: NextRequest) {
  const started = performance.now();
  try {
    const auth = await requireUser(["BUYER"]);
    const parsed = querySchema.safeParse(
      Object.fromEntries(request.nextUrl.searchParams.entries()),
    );
    if (!parsed.success) {
      throw new ApiError(
        422,
        "One or more feed parameters are invalid.",
        "FEED_VALIDATION_ERROR",
        {
          fields: Object.fromEntries(
            parsed.error.issues.map((issue) => [issue.path.join("."), issue.message]),
          ),
        },
      );
    }
    await expireListings();
    const selectedAddress = parsed.data.deliveryAddressId
      ? await prisma.address.findFirst({
          where: { id: parsed.data.deliveryAddressId, userId: auth.userId },
          select: {
            id: true,
            label: true,
            city: true,
            state: true,
            latitude: true,
            longitude: true,
          },
        })
      : null;
    if (parsed.data.deliveryAddressId && !selectedAddress) {
      throw new ApiError(404, "Delivery location was not found.", "DELIVERY_LOCATION_NOT_FOUND");
    }
    if (
      selectedAddress &&
      (selectedAddress.latitude === null || selectedAddress.longitude === null)
    ) {
      throw new ApiError(
        422,
        "This delivery location must be geocoded before it can rank listings.",
        "DELIVERY_LOCATION_UNAVAILABLE",
      );
    }
    const result = await rankBuyerFeed(auth.userId, {
      limit: parsed.data.limit,
      cursor: decodeCursor(parsed.data.cursor),
      deliveryLocation: selectedAddress
        ? {
            id: selectedAddress.id,
            label: selectedAddress.label,
            city: selectedAddress.city,
            state: selectedAddress.state,
            latitude: selectedAddress.latitude!,
            longitude: selectedAddress.longitude!,
          }
        : undefined,
    });
    const payload = {
      ...result,
      pageInfo: {
        ...result.pageInfo,
        nextCursor: result.pageInfo.nextCursor
          ? encodeCursor(result.pageInfo.nextCursor)
          : null,
      },
    };
    const elapsedMs = Math.round((performance.now() - started) * 10) / 10;
    const payloadBytes = Buffer.byteLength(JSON.stringify(payload));
    if (
      elapsedMs > MARKETPLACE_RANKING_CONFIG.retrieval.performanceBudgetMs ||
      payloadBytes > 256 * 1024
    ) {
      console.warn("[RankedFeedBudget]", {
        buyerId: auth.userId,
        elapsedMs,
        payloadBytes,
      });
    }
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "private, no-store",
        "Server-Timing": `ranked-feed;dur=${elapsedMs}`,
        "X-SymbiOS-Page-Limit": String(parsed.data.limit),
        "X-SymbiOS-Payload-Bytes": String(payloadBytes),
        "X-SymbiOS-Performance-Budget": `${MARKETPLACE_RANKING_CONFIG.retrieval.performanceBudgetMs}ms;262144bytes`,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
