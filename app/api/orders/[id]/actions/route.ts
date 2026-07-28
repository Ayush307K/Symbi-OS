import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import {
  apiError,
  ApiError,
  assertTrustedOrigin,
  parseJson,
  requireUser,
} from "@/server/http";

const schema = z
  .object({
    action: z.enum(["CANCEL", "CONFIRM_DELIVERY", "OPEN_DISPUTE"]),
    reasonCode: z.enum([
      "BUYER_CHANGED_REQUIREMENT",
      "ADDRESS_ISSUE",
      "PAYMENT_ISSUE",
      "MUTUAL_AGREEMENT",
      "OTHER",
    ]).optional(),
    note: z.string().trim().max(500).optional(),
  })
  .strict()
  .refine(
    (value) => value.action !== "CANCEL" || Boolean(value.reasonCode),
    { path: ["reasonCode"], message: "Cancellation reason is required." },
  );

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertTrustedOrigin(request);
    const auth = await requireUser(["BUYER"]);
    const body = await parseJson(request, schema);
    const { id } = await context.params;
    const order = await prisma.purchaseOrder.findFirst({
      where: { id, buyerUserId: auth.userId },
      include: { reservations: true, items: true, invoice: true },
    });
    if (!order) {
      throw new ApiError(404, "Order not found.", "ORDER_NOT_FOUND");
    }
    if (body.action === "CONFIRM_DELIVERY") {
      if (order.fulfillmentStatus !== "DISPATCHED") {
        throw new ApiError(
          409,
          "Only a dispatched order can be confirmed delivered.",
          "INVALID_STATE",
        );
      }
      const delivered = await prisma.$transaction(async (tx) => {
        const claimed = await tx.purchaseOrder.updateMany({
          where: { id: order.id, fulfillmentStatus: "DISPATCHED" },
          data: { status: "CLOSED", fulfillmentStatus: "DELIVERED" },
        });
        if (claimed.count !== 1) {
          throw new ApiError(409, "Order changed; reload and retry.", "ORDER_CONFLICT");
        }
        await tx.purchaseOrderItem.updateMany({
          where: { orderId: order.id },
          data: { status: "DELIVERED" },
        });
        await tx.orderEvent.create({
          data: {
            orderId: order.id,
            actorUserId: auth.userId,
            type: "BUYER_CONFIRMED_DELIVERY",
            fromStatus: `${order.status}/${order.fulfillmentStatus}`,
            toStatus: "CLOSED/DELIVERED",
            snapshotJson: JSON.stringify({ note: body.note }),
          },
        });
        return tx.purchaseOrder.findUniqueOrThrow({
          where: { id: order.id },
          include: { items: true },
        });
      });
      return NextResponse.json({ success: true, order: delivered });
    }
    if (body.action === "OPEN_DISPUTE") {
      if (!["PAID", "REFUNDED"].includes(order.paymentStatus)) {
        throw new ApiError(
          409,
          "A paid order is required to open a dispute.",
          "INVALID_STATE",
        );
      }
      const disputed = await prisma.$transaction(async (tx) => {
        const record = await tx.purchaseOrder.update({
          where: { id: order.id },
          data: { disputeStatus: "OPEN", paymentStatus: "DISPUTED" },
        });
        await tx.orderEvent.create({
          data: {
            orderId: order.id,
            actorUserId: auth.userId,
            type: "DISPUTE_OPENED",
            fromStatus: order.disputeStatus,
            toStatus: "OPEN",
            reasonCode: body.reasonCode,
            snapshotJson: JSON.stringify({ note: body.note }),
          },
        });
        return record;
      });
      return NextResponse.json({ success: true, order: disputed });
    }
    if (
      !["AWAITING_BUYER_CONFIRMATION", "CONFIRMED"].includes(order.status) ||
      order.fulfillmentStatus !== "UNFULFILLED"
    ) {
      throw new ApiError(
        409,
        "This order can no longer be cancelled through self-service.",
        "CANCELLATION_NOT_ALLOWED",
      );
    }
    const updated = await prisma.$transaction(async (tx) => {
      const claimed = await tx.purchaseOrder.updateMany({
        where: {
          id: order.id,
          status: order.status,
          fulfillmentStatus: "UNFULFILLED",
        },
        data: {
          status: "CANCELLED",
          paymentStatus:
            order.paymentStatus === "PAID" ? "REFUNDED" : "CANCELLED",
        },
      });
      if (claimed.count !== 1) {
        throw new ApiError(409, "Order changed; reload and retry.", "ORDER_CONFLICT");
      }
      for (const reservation of order.reservations.filter((item) =>
        ["ACTIVE", "COMMITTED"].includes(item.status),
      )) {
        const released = await tx.inventoryReservation.updateMany({
          where: { id: reservation.id, status: reservation.status },
          data: {
            status: "RELEASED",
            releasedAt: new Date(),
            releaseReason: body.reasonCode!,
          },
        });
        if (released.count !== 1) continue;
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
            orderId: order.id,
            reservationId: reservation.id,
            quantityChange: reservation.quantity,
            balanceAfter: listing.quantityAvailable,
            reason: "ORDER_CANCELLED_RELEASE",
            idempotencyKey: `order:${order.id}:cancel:${reservation.id}`,
          },
        });
      }
      await tx.purchaseOrderItem.updateMany({
        where: { orderId: order.id },
        data: { status: "CANCELLED" },
      });
      if (order.paymentStatus === "PAID") {
        await tx.demoPayment.updateMany({
          where: { orderId: order.id, status: "SUCCEEDED" },
          data: { status: "REFUNDED" },
        });
        if (order.invoice) {
          await tx.creditNote.upsert({
            where: { orderId: order.id },
            create: {
              orderId: order.id,
              creditNoteNumber: `CN-${order.orderNumber.replace(/^SYM-/, "")}`,
              invoiceNumber: order.invoice.invoiceNumber,
              reasonCode: body.reasonCode!,
              snapshotJson: order.invoice.snapshotJson,
            },
            update: {},
          });
        }
      }
      if (order.sourceBidId) {
        await tx.bid.updateMany({
          where: { id: order.sourceBidId, status: "ACCEPTED" },
          data: { status: "CANCELLED", decisionAt: new Date() },
        });
      }
      await tx.orderEvent.create({
        data: {
          orderId: order.id,
          actorUserId: auth.userId,
          type: "ORDER_CANCELLED",
          fromStatus: order.status,
          toStatus: "CANCELLED",
          reasonCode: body.reasonCode!,
          snapshotJson: JSON.stringify({
            note: body.note,
            previousPaymentStatus: order.paymentStatus,
            releasedReservations: order.reservations.map((item) => item.id),
          }),
        },
      });
      return tx.purchaseOrder.findUniqueOrThrow({
        where: { id: order.id },
        include: { items: true, reservations: true },
      });
    });
    return NextResponse.json({ success: true, order: updated });
  } catch (error) {
    return apiError(error);
  }
}
