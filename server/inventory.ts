import prisma from "@/lib/prisma";

export async function releaseExpiredReservations(now = new Date()) {
  const expired = await prisma.inventoryReservation.findMany({
    where: { status: "ACTIVE", expiresAt: { lte: now } },
    take: 100,
  });
  let released = 0;
  for (const reservation of expired) {
    const didRelease = await prisma.$transaction(async (tx) => {
      const claimed = await tx.inventoryReservation.updateMany({
        where: {
          id: reservation.id,
          status: "ACTIVE",
          expiresAt: { lte: now },
        },
        data: {
          status: "RELEASED",
          releasedAt: now,
          releaseReason: "RESERVATION_EXPIRED",
        },
      });
      if (claimed.count !== 1) return false;
      const listing = await tx.marketplaceListing.update({
        where: { id: reservation.listingId },
        data: {
          quantityAvailable: { increment: reservation.quantity },
          status: "ACTIVE",
        },
      });
      await tx.inventoryMovement.create({
        data: {
          listingId: reservation.listingId,
          orderId: reservation.orderId,
          reservationId: reservation.id,
          quantityChange: reservation.quantity,
          balanceAfter: listing.quantityAvailable,
          reason: "RESERVATION_EXPIRED_RELEASE",
          idempotencyKey: `reservation:${reservation.id}:release`,
        },
      });
      if (reservation.bidId) {
        await tx.bid.updateMany({
          where: { id: reservation.bidId, status: "ACCEPTED" },
          data: { status: "EXPIRED", decisionAt: now },
        });
      }
      if (reservation.orderId) {
        const order = await tx.purchaseOrder.findUnique({
          where: { id: reservation.orderId },
        });
        if (order && order.paymentStatus !== "PAID") {
          await tx.purchaseOrder.update({
            where: { id: order.id },
            data: { status: "EXPIRED", paymentStatus: "EXPIRED" },
          });
          await tx.purchaseOrderItem.updateMany({
            where: { orderId: order.id },
            data: { status: "RELEASED" },
          });
          await tx.orderEvent.create({
            data: {
              orderId: order.id,
              type: "RESERVATION_EXPIRED",
              fromStatus: order.status,
              toStatus: "EXPIRED",
              reasonCode: "PAYMENT_WINDOW_EXPIRED",
              snapshotJson: JSON.stringify({
                reservationId: reservation.id,
                quantityReleased: reservation.quantity,
              }),
            },
          });
        }
      }
      return true;
    });
    if (didRelease) released += 1;
  }
  return released;
}
