import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { apiError, requireAdmin } from "@/server/http";

/**
 * Queue depths for the admin index.
 *
 * Counts only — the queues themselves own their records. The point is to answer
 * "is anything waiting on me" without loading three screens to find out.
 */
export async function GET() {
  try {
    await requireAdmin();

    const [
      pendingModeration,
      pendingVerification,
      openDisputes,
      openSupport,
      activeListings,
      awaitingConfirmation,
      unverifiedActiveListings,
    ] = await Promise.all([
      prisma.marketplaceListing.count({
        where: { status: "PENDING_MODERATION" },
      }),
      prisma.sellerOnboarding.count({
        where: { status: { in: ["SUBMITTED", "UNDER_REVIEW"] } },
      }),
      prisma.purchaseOrder.count({ where: { disputeStatus: "OPEN" } }),
      prisma.supportTicket.count({
        where: { status: { in: ["OPEN", "IN_PROGRESS", "WAITING_ON_USER"] } },
      }),
      prisma.marketplaceListing.count({
        where: { status: { in: ["ACTIVE", "active"] } },
      }),
      prisma.purchaseOrder.count({
        where: { status: "AWAITING_BUYER_CONFIRMATION" },
      }),
      // Surfaced because it is the gap between "listings exist" and "buyers can
      // trust them" — the catalogue is mostly imported, unverified supply.
      prisma.marketplaceListing.count({
        where: { status: { in: ["ACTIVE", "active"] }, verified: false },
      }),
    ]);

    return NextResponse.json({
      queues: {
        pendingModeration,
        pendingVerification,
        openDisputes,
        openSupport,
      },
      marketplace: {
        activeListings,
        unverifiedActiveListings,
        awaitingConfirmation,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
