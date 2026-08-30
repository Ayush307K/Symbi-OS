import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { notify } from "@/lib/marketplace";
import {
  apiError,
  ApiError,
  assertTrustedOrigin,
  parseJson,
  requireUser,
} from "@/server/http";

const schema = z
  .object({
    action: z.enum(["ACCEPT_ORDER", "MARK_DISPATCHED"]),
    note: z.string().trim().max(500).optional(),
  })
  .strict();

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertTrustedOrigin(request);
    const auth = await requireUser(["SELLER"]);
    if (!auth.companyId) {
      throw new ApiError(403, "Seller company is required.", "FORBIDDEN");
    }
    const body = await parseJson(request, schema);
    const { id } = await context.params;
    const order = await prisma.purchaseOrder.findFirst({
      where: {
        id,
        items: { some: { sellerCompanyId: auth.companyId } },
      },
      include: { items: true },
    });
    if (!order) throw new ApiError(404, "Order not found.", "ORDER_NOT_FOUND");
    if (
      !["PAID", "SETTLED", "PARTIALLY_REFUNDED"].includes(
        order.paymentStatus,
      )
    ) {
      throw new ApiError(409, "Payment is not confirmed.", "PAYMENT_NOT_CONFIRMED");
    }
    const expectedStatus =
      body.action === "ACCEPT_ORDER" ? "CONFIRMED" : "PROCESSING";
    const expectedFulfillment =
      body.action === "ACCEPT_ORDER" ? "UNFULFILLED" : "PROCESSING";
    if (
      order.status !== expectedStatus ||
      order.fulfillmentStatus !== expectedFulfillment
    ) {
      throw new ApiError(
        409,
        "Order is not in the required state for this action.",
        "INVALID_STATE",
      );
    }
    const nextStatus =
      body.action === "ACCEPT_ORDER" ? "PROCESSING" : order.status;
    const nextFulfillment =
      body.action === "ACCEPT_ORDER" ? "PROCESSING" : "DISPATCHED";
    const updated = await prisma.$transaction(async (tx) => {
      const claimed = await tx.purchaseOrder.updateMany({
        where: {
          id: order.id,
          status: expectedStatus,
          fulfillmentStatus: expectedFulfillment,
        },
        data: {
          status: nextStatus,
          fulfillmentStatus: nextFulfillment,
        },
      });
      if (claimed.count !== 1) {
        throw new ApiError(409, "Order changed; reload and retry.", "ORDER_CONFLICT");
      }
      await tx.purchaseOrderItem.updateMany({
        where: {
          orderId: order.id,
          sellerCompanyId: auth.companyId!,
        },
        data: {
          status:
            body.action === "ACCEPT_ORDER" ? "PROCESSING" : "DISPATCHED",
        },
      });
      await tx.orderEvent.create({
        data: {
          orderId: order.id,
          actorUserId: auth.userId,
          type: body.action,
          fromStatus: `${order.status}/${order.fulfillmentStatus}`,
          toStatus: `${nextStatus}/${nextFulfillment}`,
          snapshotJson: JSON.stringify({ note: body.note }),
        },
      });
      return tx.purchaseOrder.findUniqueOrThrow({
        where: { id: order.id },
        include: { items: true },
      });
    });

    // Outside the transaction: the buyer needs to know their order moved, but a
    // failed nudge must not roll back a fulfilment that already happened.
    const accepted = body.action === "ACCEPT_ORDER";
    await notify(
      order.buyerUserId,
      accepted ? "ORDER_CONFIRMED" : "ORDER_DISPATCHED",
      accepted ? "Seller confirmed your order" : "Your order has been dispatched",
      accepted
        ? `${order.orderNumber} is being prepared by ${auth.companyName}.`
        : `${order.orderNumber} is on its way. Confirm delivery once it arrives.`,
      "/account",
    );

    return NextResponse.json({ success: true, order: updated });
  } catch (error) {
    return apiError(error);
  }
}
