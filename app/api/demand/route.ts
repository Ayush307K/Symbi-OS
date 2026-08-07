import { NextResponse } from "next/server";
import { apiError, requireUser } from "@/server/http";
import prisma from "@/lib/prisma";

/**
 * The buyer's own RFQs, newest first.
 *
 * Matching already had a create path and a per-demand read path, but nothing
 * that answered "what have I asked for?" — so a posted RFQ became unreachable
 * the moment the results page was closed.
 *
 * The match count and best score are aggregated here rather than shipping every
 * match to the client: the list only needs to say whether an RFQ found anything
 * and how strong the best answer was.
 */
export async function GET() {
  try {
    const auth = await requireUser(["BUYER", "BOTH"]);
    const demands = await prisma.demand.findMany({
      where: { userId: auth.userId },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        matches: {
          orderBy: { score: "desc" },
          take: 1,
          select: { score: true },
        },
        _count: { select: { matches: true } },
      },
    });

    return NextResponse.json({
      demands: demands.map((demand) => ({
        id: demand.id,
        query: demand.query,
        category: demand.category,
        subcategory: demand.subcategory,
        quantity: demand.quantity,
        unit: demand.unit,
        maxPrice: demand.maxPrice,
        city: demand.city,
        state: demand.state,
        availableBy: demand.availableBy,
        status: demand.status,
        matchVersion: demand.matchVersion,
        createdAt: demand.createdAt,
        matchCount: demand._count.matches,
        topScore: demand.matches[0]?.score ?? null,
      })),
    });
  } catch (error) {
    return apiError(error);
  }
}
