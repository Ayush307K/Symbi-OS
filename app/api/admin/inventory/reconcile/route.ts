import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { apiError, requireUser, requireAdmin } from "@/server/http";
import { releaseExpiredReservations } from "@/server/inventory";

export async function GET() {
  try {
    await requireAdmin();
    const releasedExpired = await releaseExpiredReservations();
    const listings = await prisma.marketplaceListing.findMany({
      select: {
        id: true,
        title: true,
        quantityAvailable: true,
        reservations: {
          where: { status: "ACTIVE" },
          select: { quantity: true, expiresAt: true },
        },
        inventoryMoves: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { balanceAfter: true, createdAt: true },
        },
      },
      take: 5000,
    });
    const issues = listings.flatMap((listing) => {
      const reasons: string[] = [];
      if (listing.quantityAvailable < 0) reasons.push("NEGATIVE_AVAILABLE");
      const lastBalance = listing.inventoryMoves[0]?.balanceAfter;
      if (
        lastBalance !== undefined &&
        lastBalance !== listing.quantityAvailable
      ) {
        reasons.push("LEDGER_BALANCE_MISMATCH");
      }
      if (!reasons.length) return [];
      return [
        {
          listingId: listing.id,
          title: listing.title,
          quantityAvailable: listing.quantityAvailable,
          activeReserved: listing.reservations.reduce(
            (sum, item) => sum + item.quantity,
            0,
          ),
          lastLedgerBalance: lastBalance ?? null,
          reasons,
        },
      ];
    });
    return NextResponse.json({
      checked: listings.length,
      releasedExpired,
      issueCount: issues.length,
      issues,
      healthy: issues.length === 0,
    });
  } catch (error) {
    return apiError(error);
  }
}
