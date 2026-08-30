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

const schema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("ACCEPT_ORDER"),
      note: z.string().trim().max(500).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("MARK_DISPATCHED"),
      carrierName: z.string().trim().min(2).max(120),
      serviceLevel: z.string().trim().max(120).optional(),
      trackingNumber: z.string().trim().max(120).optional(),
      vehicleNumber: z.string().trim().max(40).optional(),
      proofOfDispatchReference: z.string().trim().min(3).max(500),
      dispatchedAt: z.string().datetime({ offset: true }),
      estimatedDeliveryAt: z.string().datetime({ offset: true }),
      note: z.string().trim().max(500).optional(),
    })
    .strict()
    .refine((value) => Boolean(value.trackingNumber || value.vehicleNumber), {
      message: "Add a tracking number or vehicle number.",
      path: ["trackingNumber"],
    }),
]);

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
      include: { items: true, shipment: true },
    });
    if (!order) throw new ApiError(404, "Order not found.", "ORDER_NOT_FOUND");
    if (order.items.some((item) => item.sellerCompanyId !== auth.companyId)) {
      throw new ApiError(
        409,
        "This legacy multi-seller order must be split by an operator before dispatch.",
        "MULTI_SELLER_FULFILMENT_UNSUPPORTED",
      );
    }
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
    if (body.action === "MARK_DISPATCHED") {
      if (order.shipment) {
        throw new ApiError(409, "Dispatch information already exists.", "SHIPMENT_EXISTS");
      }
      const dispatchedAt = new Date(body.dispatchedAt);
      const estimatedDeliveryAt = new Date(body.estimatedDeliveryAt);
      if (estimatedDeliveryAt <= dispatchedAt) {
        throw new ApiError(
          422,
          "Estimated delivery must be after dispatch.",
          "DELIVERY_DATE_INVALID",
        );
      }
    }
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
          snapshotJson: JSON.stringify(
            body.action === "MARK_DISPATCHED"
              ? {
                  note: body.note,
                  carrierName: body.carrierName,
                  serviceLevel: body.serviceLevel,
                  trackingNumber: body.trackingNumber,
                  vehicleNumber: body.vehicleNumber,
                  proofOfDispatchReference: body.proofOfDispatchReference,
                  dispatchedAt: body.dispatchedAt,
                  estimatedDeliveryAt: body.estimatedDeliveryAt,
                }
              : { note: body.note },
          ),
        },
      });
      if (body.action === "MARK_DISPATCHED") {
        await tx.shipment.create({
          data: {
            orderId: order.id,
            sellerCompanyId: auth.companyId!,
            carrierName: body.carrierName,
            serviceLevel: body.serviceLevel,
            trackingNumber: body.trackingNumber,
            vehicleNumber: body.vehicleNumber,
            proofOfDispatchReference: body.proofOfDispatchReference,
            dispatchedAt: new Date(body.dispatchedAt),
            estimatedDeliveryAt: new Date(body.estimatedDeliveryAt),
          },
        });
      }
      return tx.purchaseOrder.findUniqueOrThrow({
        where: { id: order.id },
        include: { items: true, shipment: true },
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
        : `${order.orderNumber} is on its way with ${body.action === "MARK_DISPATCHED" ? body.carrierName : auth.companyName}. Confirm delivery once it arrives.`,
      "/account",
    );

    return NextResponse.json({ success: true, order: updated });
  } catch (error) {
    return apiError(error);
  }
}
