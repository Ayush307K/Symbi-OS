import type { Prisma } from "@prisma/client";
import { orderNumber } from "@/lib/marketplace";
import { ApiError } from "@/server/http";
import { calculateFees } from "@/server/fees";

export function invoiceNumber(orderNumberValue: string) {
  return `INV-${orderNumberValue.replace(/^SYM-/, "")}`;
}

export async function reserveAcceptedBid(
  tx: Prisma.TransactionClient,
  bid: {
    id: string;
    listingId: string | null;
    bidderUserId: string;
    quantity: number;
    pricePerUnit: number;
    currency: string;
    unit: string;
    terms: string | null;
    currentSequence: number;
  },
  actorUserId: string,
) {
  if (!bid.listingId) {
    throw new ApiError(409, "Bid is not linked to a listing.", "LISTING_REQUIRED");
  }
  const existing = await tx.purchaseOrder.findUnique({
    where: { sourceBidId: bid.id },
    include: { items: true },
  });
  if (existing) return existing;

  const listing = await tx.marketplaceListing.findUnique({
    where: { id: bid.listingId },
  });
  if (!listing || !["ACTIVE", "active"].includes(listing.status)) {
    throw new ApiError(409, "Listing is unavailable.", "LISTING_UNAVAILABLE");
  }
  const result = await tx.marketplaceListing.updateMany({
    where: {
      id: listing.id,
      status: { in: ["ACTIVE", "active"] },
      quantityAvailable: { gte: bid.quantity },
    },
    data: { quantityAvailable: { decrement: bid.quantity } },
  });
  if (result.count !== 1) {
    throw new ApiError(
      409,
      "Inventory changed; the offer cannot be accepted.",
      "INVENTORY_CONFLICT",
    );
  }
  const balance = listing.quantityAvailable - bid.quantity;
  if (balance === 0) {
    await tx.marketplaceListing.update({
      where: { id: listing.id },
      data: { status: "RESERVED" },
    });
  }
  const feeQuote = calculateFees(bid.quantity * bid.pricePerUnit);
  const order = await tx.purchaseOrder.create({
    data: {
      orderNumber: orderNumber(),
      buyerUserId: bid.bidderUserId,
      sourceBidId: bid.id,
      status: "AWAITING_BUYER_CONFIRMATION",
      paymentStatus: "PENDING",
      fulfillmentStatus: "UNFULFILLED",
      disputeStatus: "NONE",
      subtotal: feeQuote.subtotal,
      buyerFeeAmount: feeQuote.buyerFeeAmount,
      sellerFeeAmount: feeQuote.sellerFeeAmount,
      shippingAmount: feeQuote.shippingAmount,
      taxAmount: feeQuote.taxAmount,
      totalAmount: feeQuote.totalAmount,
      currency: bid.currency,
      feeVersion: feeQuote.feeVersion,
      taxNote: feeQuote.taxNote,
      notes: bid.terms,
      items: {
        create: {
          listingId: listing.id,
          sourceBidId: bid.id,
          sellerCompanyId: listing.sellerCompanyId,
          title: listing.title,
          quantity: bid.quantity,
          unit: bid.unit,
          pricePerUnit: bid.pricePerUnit,
          lineTotal: feeQuote.subtotal,
          status: "RESERVED",
        },
      },
    },
    include: { items: true },
  });
  const reservation = await tx.inventoryReservation.create({
    data: {
      listingId: listing.id,
      bidId: bid.id,
      orderId: order.id,
      quantity: bid.quantity,
      status: "ACTIVE",
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
    },
  });
  await tx.inventoryMovement.create({
    data: {
      listingId: listing.id,
      orderId: order.id,
      reservationId: reservation.id,
      quantityChange: -bid.quantity,
      balanceAfter: balance,
      reason: "OFFER_ACCEPTED_RESERVATION",
      idempotencyKey: `offer:${bid.id}:reserve`,
    },
  });
  await tx.orderEvent.create({
    data: {
      orderId: order.id,
      actorUserId,
      type: "ORDER_CREATED_FROM_ACCEPTED_OFFER",
      toStatus: order.status,
      snapshotJson: JSON.stringify({
        bidId: bid.id,
        offerSequence: bid.currentSequence,
        quantity: bid.quantity,
        unit: bid.unit,
        pricePerUnit: bid.pricePerUnit,
        currency: bid.currency,
        terms: bid.terms,
        fees: feeQuote,
      }),
    },
  });
  await tx.listingMatch.updateMany({
    where: {
      listingId: listing.id,
      status: "PROPOSED",
      demand: { userId: bid.bidderUserId },
    },
    data: {
      status: "CONVERTED",
      convertedOrderId: order.id,
    },
  });
  return order;
}

export function orderInvoiceSnapshot(order: {
  id: string;
  orderNumber: string;
  buyerUserId: string;
  subtotal: number;
  buyerFeeAmount: number;
  sellerFeeAmount: number;
  taxAmount: number;
  shippingAmount: number;
  totalAmount: number;
  currency: string;
  feeVersion: string;
  taxNote: string;
  purchaseOrderNumber: string | null;
  items: Array<{
    title: string;
    quantity: number;
    unit: string;
    pricePerUnit: number;
    lineTotal: number;
    sellerCompanyId: string;
  }>;
}) {
  return {
    schemaVersion: "invoice-snapshot-v1",
    orderId: order.id,
    orderNumber: order.orderNumber,
    buyerUserId: order.buyerUserId,
    purchaseOrderNumber: order.purchaseOrderNumber,
    currency: order.currency,
    items: order.items,
    subtotal: order.subtotal,
    buyerFeeAmount: order.buyerFeeAmount,
    sellerFeeAmount: order.sellerFeeAmount,
    shippingAmount: order.shippingAmount,
    taxAmount: order.taxAmount,
    totalAmount: order.totalAmount,
    feeVersion: order.feeVersion,
    taxNote: order.taxNote,
  };
}
