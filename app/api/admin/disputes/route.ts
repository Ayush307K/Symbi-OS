import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { apiError, requireAdmin } from "@/server/http";

/**
 * Orders with an open dispute, newest first, with the context an operator needs
 * to act: what was ordered, from whom, and the event that raised it.
 *
 * Read-only. Resolution runs through the existing order-action endpoints rather
 * than a second write path, so the order state machine stays the only thing
 * that can move an order.
 */
export async function GET() {
  try {
    await requireAdmin();

    const orders = await prisma.purchaseOrder.findMany({
      where: { disputeStatus: { not: "NONE" } },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        paymentStatus: true,
        disputeStatus: true,
        totalAmount: true,
        currency: true,
        updatedAt: true,
        buyerUserId: true,
        items: {
          select: {
            title: true,
            quantity: true,
            unit: true,
            pricePerUnit: true,
            status: true,
            listingId: true,
          },
        },
        events: {
          where: { type: { in: ["DISPUTE_OPENED", "RESERVATION_EXPIRED"] } },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { type: true, reasonCode: true, createdAt: true },
        },
      },
    });

    return NextResponse.json({ orders });
  } catch (error) {
    return apiError(error);
  }
}
