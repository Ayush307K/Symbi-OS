import { NextRequest, NextResponse } from "next/server";
import { apiError, ApiError, requireUser } from "@/server/http";
import prisma from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireUser(["BUYER", "BOTH"]);
    const { id } = await context.params;
    const demand = await prisma.demand.findFirst({
      where: { id, userId: auth.userId },
      include: {
        matches: {
          orderBy: [{ score: "desc" }, { listingId: "asc" }],
          include: {
            listing: {
              select: {
                id: true,
                title: true,
                slug: true,
                category: true,
                subcategory: true,
                quantityAvailable: true,
                unit: true,
                priceMode: true,
                pricePerUnit: true,
                city: true,
                state: true,
                status: true,
                seller: { select: { name: true } },
              },
            },
          },
        },
      },
    });
    if (!demand) {
      throw new ApiError(404, "Demand not found.", "DEMAND_NOT_FOUND");
    }
    return NextResponse.json({
      demand: {
        id: demand.id,
        query: demand.query,
        category: demand.category,
        quantity: demand.quantity,
        unit: demand.unit,
        status: demand.status,
        matchVersion: demand.matchVersion,
        createdAt: demand.createdAt,
      },
      matches: demand.matches.map((match) => ({
        id: match.id,
        score: match.score,
        version: match.version,
        status: match.status,
        explanations: JSON.parse(match.explanationJson),
        listing: {
          ...match.listing,
          pricePerUnit:
            match.listing.priceMode === "FIXED"
              ? match.listing.pricePerUnit
              : null,
        },
      })),
    });
  } catch (error) {
    return apiError(error);
  }
}
