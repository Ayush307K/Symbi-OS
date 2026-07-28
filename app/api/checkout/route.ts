import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { notify, orderNumber } from "@/lib/marketplace";
import {
  apiError,
  ApiError,
  assertTrustedOrigin,
  parseJson,
  requireUser,
} from "@/server/http";
import { publicListingWhere } from "@/server/listings/policy";
import { calculateFees } from "@/server/fees";
import {
  invoiceNumber,
  orderInvoiceSnapshot,
} from "@/server/orders";
import { releaseExpiredReservations } from "@/server/inventory";

const schema = z
  .object({
    bidId: z.string().uuid().optional(),
    listingId: z.string().min(1).optional(),
    quantity: z.coerce.number().int().positive().max(1_000_000_000).optional(),
    shippingAddressId: z.string().uuid().optional(),
    billingAddressId: z.string().uuid().optional(),
    purchaseOrderNumber: z.string().trim().max(80).optional(),
    notes: z.string().trim().max(1000).optional(),
  })
  .strict()
  .refine((value) => !(value.bidId && value.listingId), {
    message: "Choose either an accepted offer or direct listing checkout.",
  });

export async function POST(request: NextRequest) {
  try {
    assertTrustedOrigin(request);
    if (process.env.DEMO_PAYMENTS_ENABLED !== "true") {
      throw new ApiError(
        503,
        "The sandbox payment gateway is disabled.",
        "PAYMENTS_DISABLED",
      );
    }
    const auth = await requireUser(["BUYER"]);
    await releaseExpiredReservations();
    const body = await parseJson(request, schema);
    const idempotencyKey = request.headers.get("idempotency-key");
    if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 100) {
      throw new ApiError(
        400,
        "A valid Idempotency-Key header is required.",
        "IDEMPOTENCY_KEY_REQUIRED",
      );
    }
    const existingPayment = await prisma.demoPayment.findUnique({
      where: { idempotencyKey },
      include: {
        order: {
          include: {
            items: true,
            shippingAddress: true,
            invoice: true,
          },
        },
      },
    });
    if (existingPayment) {
      if (existingPayment.order.buyerUserId !== auth.userId) {
        throw new ApiError(409, "Idempotency key is already in use.", "KEY_CONFLICT");
      }
      return NextResponse.json({
        success: true,
        order: existingPayment.order,
        payment: existingPayment,
        idempotentReplay: true,
        paymentMode: "SANDBOX",
      });
    }

    const shippingAddress = body.shippingAddressId
      ? await prisma.address.findFirst({
          where: { id: body.shippingAddressId, userId: auth.userId },
        })
      : await prisma.address.findFirst({
          where: { userId: auth.userId, isDefaultShipping: true },
        });
    if (!shippingAddress) {
      throw new ApiError(
        422,
        "Add a shipping address before checkout.",
        "SHIPPING_ADDRESS_REQUIRED",
      );
    }
    const billingAddress = body.billingAddressId
      ? await prisma.address.findFirst({
          where: { id: body.billingAddressId, userId: auth.userId },
        })
      : shippingAddress;
    if (!billingAddress) {
      throw new ApiError(
        422,
        "Billing address was not found.",
        "BILLING_ADDRESS_REQUIRED",
      );
    }

    const result = body.bidId
      ? await payAcceptedOffer({
          bidId: body.bidId,
          buyerUserId: auth.userId,
          shippingAddressId: shippingAddress.id,
          billingAddressId: billingAddress.id,
          purchaseOrderNumber: body.purchaseOrderNumber,
          notes: body.notes,
          idempotencyKey,
        })
      : await directCheckout({
          buyerUserId: auth.userId,
          buyerCompanyId: auth.companyId,
          listingId: body.listingId,
          quantity: body.quantity,
          shippingAddressId: shippingAddress.id,
          billingAddressId: billingAddress.id,
          purchaseOrderNumber: body.purchaseOrderNumber,
          notes: body.notes,
          idempotencyKey,
        });

    await notify(
      auth.userId,
      "ORDER_CONFIRMED",
      "Sandbox order confirmed",
      `Order ${result.order.orderNumber} was confirmed through the sandbox gateway.`,
      "/account",
    );
    return NextResponse.json(
      {
        success: true,
        ...result,
        paymentMode: "SANDBOX",
        disclosure:
          "No real funds were transferred. Fees, reservation, order, payment, and invoice snapshots are persisted for the demo.",
      },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}

async function payAcceptedOffer(input: {
  bidId: string;
  buyerUserId: string;
  shippingAddressId: string;
  billingAddressId: string;
  purchaseOrderNumber?: string;
  notes?: string;
  idempotencyKey: string;
}) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.purchaseOrder.findFirst({
      where: {
        sourceBidId: input.bidId,
        buyerUserId: input.buyerUserId,
        status: "AWAITING_BUYER_CONFIRMATION",
        paymentStatus: "PENDING",
      },
      include: { items: true, reservations: true },
    });
    if (!order) {
      throw new ApiError(
        409,
        "Accepted offer is unavailable, expired, or already paid.",
        "ACCEPTED_OFFER_UNAVAILABLE",
      );
    }
    const reservation = order.reservations.find(
      (item) => item.status === "ACTIVE",
    );
    if (!reservation || reservation.expiresAt <= new Date()) {
      throw new ApiError(
        409,
        "The inventory reservation has expired.",
        "RESERVATION_EXPIRED",
      );
    }
    const feeQuote = calculateFees(order.subtotal);
    const claimed = await tx.purchaseOrder.updateMany({
      where: {
        id: order.id,
        status: "AWAITING_BUYER_CONFIRMATION",
        paymentStatus: "PENDING",
      },
      data: {
        status: "CONFIRMED",
        paymentStatus: "PAID",
        shippingAddressId: input.shippingAddressId,
        billingAddressId: input.billingAddressId,
        purchaseOrderNumber: input.purchaseOrderNumber,
        notes: input.notes ?? order.notes,
        buyerFeeAmount: feeQuote.buyerFeeAmount,
        sellerFeeAmount: feeQuote.sellerFeeAmount,
        shippingAmount: feeQuote.shippingAmount,
        taxAmount: feeQuote.taxAmount,
        totalAmount: feeQuote.totalAmount,
        feeVersion: feeQuote.feeVersion,
        taxNote: feeQuote.taxNote,
      },
    });
    if (claimed.count !== 1) {
      throw new ApiError(409, "Order changed; reload and retry.", "ORDER_CONFLICT");
    }
    await tx.inventoryReservation.update({
      where: { id: reservation.id },
      data: { status: "COMMITTED", committedAt: new Date() },
    });
    await tx.purchaseOrderItem.updateMany({
      where: { orderId: order.id },
      data: { status: "CONFIRMED" },
    });
    const balance = await tx.marketplaceListing.findUniqueOrThrow({
      where: { id: reservation.listingId },
      select: { quantityAvailable: true },
    });
    if (balance.quantityAvailable === 0) {
      await tx.marketplaceListing.update({
        where: { id: reservation.listingId },
        data: { status: "SOLD" },
      });
    }
    await tx.inventoryMovement.create({
      data: {
        listingId: reservation.listingId,
        orderId: order.id,
        reservationId: reservation.id,
        quantityChange: 0,
        balanceAfter: balance.quantityAvailable,
        reason: "RESERVATION_COMMITTED",
        idempotencyKey: `checkout:${input.idempotencyKey}:commit`,
      },
    });
    const payment = await tx.demoPayment.create({
      data: {
        orderId: order.id,
        providerRef: `sandbox_${randomUUID()}`,
        amount: feeQuote.totalAmount,
        currency: order.currency,
        status: "SUCCEEDED",
        idempotencyKey: input.idempotencyKey,
        confirmedAt: new Date(),
      },
    });
    const updated = await tx.purchaseOrder.findUniqueOrThrow({
      where: { id: order.id },
      include: { items: true, shippingAddress: true },
    });
    const invoice = await tx.invoice.create({
      data: {
        orderId: updated.id,
        invoiceNumber: invoiceNumber(updated.orderNumber),
        snapshotJson: JSON.stringify(orderInvoiceSnapshot(updated)),
      },
    });
    await tx.orderEvent.create({
      data: {
        orderId: order.id,
        actorUserId: input.buyerUserId,
        type: "SANDBOX_PAYMENT_SUCCEEDED",
        fromStatus: order.status,
        toStatus: "CONFIRMED",
        snapshotJson: invoice.snapshotJson,
      },
    });
    return { order: updated, payment, invoice };
  });
}

async function directCheckout(input: {
  buyerUserId: string;
  buyerCompanyId: string | null;
  listingId?: string;
  quantity?: number;
  shippingAddressId: string;
  billingAddressId: string;
  purchaseOrderNumber?: string;
  notes?: string;
  idempotencyKey: string;
}) {
  const cartItems = input.listingId
    ? [{ listingId: input.listingId, quantity: input.quantity ?? 1 }]
    : await prisma.cartItem.findMany({
        where: { userId: input.buyerUserId },
        select: { listingId: true, quantity: true },
      });
  if (!cartItems.length) {
    throw new ApiError(422, "Cart is empty.", "CART_EMPTY");
  }
  return prisma.$transaction(async (tx) => {
    const listings = await tx.marketplaceListing.findMany({
      where: {
        id: { in: cartItems.map((item) => item.listingId) },
        ...publicListingWhere,
      },
    });
    const listingById = new Map(listings.map((listing) => [listing.id, listing]));
    const orderItems = cartItems.map((item) => {
      const listing = listingById.get(item.listingId);
      if (!listing) {
        throw new ApiError(
          409,
          "One or more listings are unavailable.",
          "LISTING_UNAVAILABLE",
        );
      }
      if (listing.sellerCompanyId === input.buyerCompanyId) {
        throw new ApiError(409, "You cannot buy your own listing.", "SELF_PURCHASE");
      }
      if (
        item.quantity > listing.quantityAvailable ||
        item.quantity < listing.minOrderQuantity
      ) {
        throw new ApiError(
          409,
          `${listing.title} does not have a valid quantity for this order.`,
          "INVENTORY_OR_MOQ_CONFLICT",
        );
      }
      if (
        (item.quantity - listing.minOrderQuantity) % listing.lotIncrement !==
        0
      ) {
        throw new ApiError(
          422,
          `${listing.title} requires ${listing.lotIncrement} ${listing.unit} increments from its MOQ.`,
          "LOT_INCREMENT_INVALID",
        );
      }
      if (listing.priceMode !== "FIXED" || listing.pricePerUnit <= 0) {
        throw new ApiError(
          409,
          `${listing.title} requires an accepted offer before checkout.`,
          "QUOTE_REQUIRED",
        );
      }
      return {
        listing,
        quantity: item.quantity,
        pricePerUnit: listing.pricePerUnit,
        lineTotal: listing.pricePerUnit * item.quantity,
      };
    });
    const subtotal = orderItems.reduce((sum, item) => sum + item.lineTotal, 0);
    const fees = calculateFees(subtotal);
    const order = await tx.purchaseOrder.create({
      data: {
        orderNumber: orderNumber(),
        buyerUserId: input.buyerUserId,
        status: "CONFIRMED",
        paymentStatus: "PAID",
        fulfillmentStatus: "UNFULFILLED",
        disputeStatus: "NONE",
        shippingAddressId: input.shippingAddressId,
        billingAddressId: input.billingAddressId,
        subtotal: fees.subtotal,
        buyerFeeAmount: fees.buyerFeeAmount,
        sellerFeeAmount: fees.sellerFeeAmount,
        shippingAmount: fees.shippingAmount,
        taxAmount: fees.taxAmount,
        totalAmount: fees.totalAmount,
        feeVersion: fees.feeVersion,
        taxNote: fees.taxNote,
        purchaseOrderNumber: input.purchaseOrderNumber,
        notes: input.notes,
        items: {
          create: orderItems.map((item) => ({
            listingId: item.listing.id,
            sellerCompanyId: item.listing.sellerCompanyId,
            title: item.listing.title,
            quantity: item.quantity,
            unit: item.listing.unit,
            pricePerUnit: item.pricePerUnit,
            lineTotal: item.lineTotal,
            status: "CONFIRMED",
          })),
        },
      },
      include: { items: true, shippingAddress: true },
    });
    for (const item of orderItems) {
      const changed = await tx.marketplaceListing.updateMany({
        where: {
          id: item.listing.id,
          status: { in: ["ACTIVE", "active"] },
          quantityAvailable: { gte: item.quantity },
        },
        data: { quantityAvailable: { decrement: item.quantity } },
      });
      if (changed.count !== 1) {
        throw new ApiError(
          409,
          `Inventory changed for ${item.listing.title}; retry checkout.`,
          "INVENTORY_CONFLICT",
        );
      }
      const balance = item.listing.quantityAvailable - item.quantity;
      if (balance === 0) {
        await tx.marketplaceListing.update({
          where: { id: item.listing.id },
          data: { status: "SOLD" },
        });
      }
      const reservation = await tx.inventoryReservation.create({
        data: {
          listingId: item.listing.id,
          orderId: order.id,
          quantity: item.quantity,
          status: "COMMITTED",
          expiresAt: new Date(),
          committedAt: new Date(),
        },
      });
      await tx.inventoryMovement.create({
        data: {
          listingId: item.listing.id,
          orderId: order.id,
          reservationId: reservation.id,
          quantityChange: -item.quantity,
          balanceAfter: balance,
          reason: "DIRECT_SANDBOX_ORDER_COMMIT",
          idempotencyKey: `checkout:${input.idempotencyKey}:${item.listing.id}`,
        },
      });
    }
    const payment = await tx.demoPayment.create({
      data: {
        orderId: order.id,
        providerRef: `sandbox_${randomUUID()}`,
        amount: fees.totalAmount,
        currency: order.currency,
        status: "SUCCEEDED",
        idempotencyKey: input.idempotencyKey,
        confirmedAt: new Date(),
      },
    });
    const snapshot = orderInvoiceSnapshot(order);
    const invoice = await tx.invoice.create({
      data: {
        orderId: order.id,
        invoiceNumber: invoiceNumber(order.orderNumber),
        snapshotJson: JSON.stringify(snapshot),
      },
    });
    await tx.orderEvent.create({
      data: {
        orderId: order.id,
        actorUserId: input.buyerUserId,
        type: "DIRECT_SANDBOX_ORDER_CONFIRMED",
        toStatus: "CONFIRMED",
        snapshotJson: invoice.snapshotJson,
      },
    });
    if (!input.listingId) {
      await tx.cartItem.deleteMany({ where: { userId: input.buyerUserId } });
    }
    return { order, payment, invoice };
  });
}
