import { randomUUID } from "node:crypto";
import { z } from "zod";
import prisma, {
  type ExtendedPrismaClient,
  type ExtendedTransactionClient,
} from "@/lib/prisma";
import { ApiError } from "@/server/http";

export const DISPUTE_RESOLUTION_ACTIONS = [
  "RELEASE_TO_SELLER",
  "REFUND_BUYER",
  "REPLACE_INVENTORY",
  "PARTIAL_SETTLEMENT",
  "REJECT_DISPUTE",
] as const;

const resolutionBase = z.object({
  note: z.string().trim().min(5).max(2000),
});

export const disputeResolutionSchema = z.discriminatedUnion("action", [
  resolutionBase.extend({ action: z.literal("RELEASE_TO_SELLER") }).strict(),
  resolutionBase.extend({ action: z.literal("REFUND_BUYER") }).strict(),
  resolutionBase
    .extend({
      action: z.literal("REPLACE_INVENTORY"),
      orderItemId: z.string().uuid(),
      replacementListingId: z.string().min(1).max(200),
    })
    .strict(),
  resolutionBase
    .extend({
      action: z.literal("PARTIAL_SETTLEMENT"),
      refundAmount: z.coerce.number().positive().max(1_000_000_000),
    })
    .strict(),
  resolutionBase.extend({ action: z.literal("REJECT_DISPUTE") }).strict(),
]);

export type DisputeResolutionInput = z.infer<typeof disputeResolutionSchema>;

function safeObject(value: string | null | undefined) {
  if (!value) return {} as Record<string, unknown>;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {} as Record<string, unknown>;
  }
}

async function releaseUndispatchedInventory(
  tx: ExtendedTransactionClient,
  order: {
    id: string;
    fulfillmentStatus: string;
    reservations: Array<{
      id: string;
      listingId: string;
      quantity: number;
      status: string;
    }>;
  },
  reason: string,
) {
  if (order.fulfillmentStatus !== "UNFULFILLED") return [];

  const released: string[] = [];
  for (const reservation of order.reservations) {
    if (!["ACTIVE", "COMMITTED"].includes(reservation.status)) continue;
    const claimed = await tx.inventoryReservation.updateMany({
      where: { id: reservation.id, status: reservation.status },
      data: {
        status: "RELEASED",
        releasedAt: new Date(),
        releaseReason: reason,
      },
    });
    if (claimed.count !== 1) continue;

    const before = await tx.marketplaceListing.findUniqueOrThrow({
      where: { id: reservation.listingId },
      select: { status: true },
    });
    const listing = await tx.marketplaceListing.update({
      where: { id: reservation.listingId },
      data: {
        quantityAvailable: { increment: reservation.quantity },
        ...(["SOLD", "RESERVED"].includes(before.status)
          ? { status: "ACTIVE" }
          : {}),
      },
      select: { quantityAvailable: true },
    });
    await tx.inventoryMovement.create({
      data: {
        listingId: reservation.listingId,
        orderId: order.id,
        reservationId: reservation.id,
        quantityChange: reservation.quantity,
        balanceAfter: listing.quantityAvailable,
        reason,
        idempotencyKey: `dispute:${order.id}:release:${reservation.id}`,
      },
    });
    released.push(reservation.id);
  }
  return released;
}

function creditSnapshot(
  invoiceSnapshot: string,
  action: DisputeResolutionInput["action"],
  refundAmount: number,
) {
  return JSON.stringify({
    ...safeObject(invoiceSnapshot),
    schemaVersion: "credit-note-snapshot-v2",
    resolutionAction: action,
    refundAmount,
  });
}

async function upsertCreditNote(
  tx: ExtendedTransactionClient,
  order: {
    id: string;
    orderNumber: string;
    invoice: { invoiceNumber: string; snapshotJson: string } | null;
  },
  action: DisputeResolutionInput["action"],
  refundAmount: number,
) {
  if (!order.invoice) return null;
  return tx.creditNote.upsert({
    where: { orderId: order.id },
    create: {
      orderId: order.id,
      creditNoteNumber: `CN-${order.orderNumber.replace(/^SYM-/, "")}`,
      invoiceNumber: order.invoice.invoiceNumber,
      reasonCode: action,
      snapshotJson: creditSnapshot(
        order.invoice.snapshotJson,
        action,
        refundAmount,
      ),
    },
    update: {
      reasonCode: action,
      snapshotJson: creditSnapshot(
        order.invoice.snapshotJson,
        action,
        refundAmount,
      ),
      issuedAt: new Date(),
    },
  });
}

/**
 * Resolve an open dispute as one transaction.
 *
 * The temporary RESOLVING state is an optimistic claim: two operators cannot
 * both refund or allocate inventory. It is never committed if validation or a
 * downstream mutation fails because the whole callback rolls back.
 */
export async function resolveDispute(
  orderId: string,
  input: DisputeResolutionInput,
  actorUserId: string,
  client: ExtendedPrismaClient = prisma,
) {
  return client.$transaction(async (tx) => {
    const order = await tx.purchaseOrder.findUnique({
      where: { id: orderId },
      include: {
        items: { include: { listing: true } },
        reservations: true,
        demoPayments: true,
        invoice: true,
        events: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!order) {
      throw new ApiError(404, "Dispute order not found.", "DISPUTE_NOT_FOUND");
    }
    if (order.disputeStatus !== "OPEN" || order.paymentStatus !== "DISPUTED") {
      throw new ApiError(
        409,
        "Only an open disputed order can be resolved.",
        "DISPUTE_ALREADY_RESOLVED",
      );
    }
    if (
      input.action === "PARTIAL_SETTLEMENT" &&
      input.refundAmount >= order.totalAmount
    ) {
      throw new ApiError(
        422,
        "A partial settlement must be below the order total. Use a full refund instead.",
        "PARTIAL_AMOUNT_INVALID",
      );
    }

    const claimed = await tx.purchaseOrder.updateMany({
      where: {
        id: order.id,
        disputeStatus: "OPEN",
        paymentStatus: "DISPUTED",
      },
      data: { disputeStatus: "RESOLVING" },
    });
    if (claimed.count !== 1) {
      throw new ApiError(
        409,
        "Another operator already changed this dispute.",
        "DISPUTE_CONFLICT",
      );
    }

    const opened = order.events.find((event) => event.type === "DISPUTE_OPENED");
    const openedSnapshot = safeObject(opened?.snapshotJson);
    const previousPaymentStatus =
      typeof openedSnapshot.previousPaymentStatus === "string"
        ? openedSnapshot.previousPaymentStatus
        : "PAID";
    const resolutionId = randomUUID();
    let disputeStatus = "RESOLVED";
    let paymentStatus = previousPaymentStatus;
    let status = order.status;
    let fulfillmentStatus = order.fulfillmentStatus;
    let releasedReservations: string[] = [];
    let replacement:
      | {
          orderItemId: string;
          fromListingId: string;
          toListingId: string;
          quantity: number;
        }
      | undefined;
    let refundAmount: number | undefined;

    if (input.action === "RELEASE_TO_SELLER") {
      disputeStatus = "RESOLVED_RELEASED";
      paymentStatus = "SETTLED";
      await tx.demoPayment.updateMany({
        where: { orderId: order.id, status: "SUCCEEDED" },
        data: { status: "SETTLED" },
      });
    } else if (input.action === "REFUND_BUYER") {
      disputeStatus = "RESOLVED_REFUNDED";
      paymentStatus = "REFUNDED";
      const hasNotDispatched = ["UNFULFILLED", "PROCESSING"].includes(
        order.fulfillmentStatus,
      );
      status = hasNotDispatched ? "CANCELLED" : "CLOSED";
      fulfillmentStatus =
        hasNotDispatched
          ? "CANCELLED"
          : order.fulfillmentStatus;
      refundAmount = order.totalAmount;
      releasedReservations = await releaseUndispatchedInventory(
        tx,
        order,
        "DISPUTE_FULL_REFUND",
      );
      await tx.demoPayment.updateMany({
        where: { orderId: order.id, status: { in: ["SUCCEEDED", "SETTLED"] } },
        data: { status: "REFUNDED" },
      });
      await tx.purchaseOrderItem.updateMany({
        where: { orderId: order.id },
        data: { status: "REFUNDED" },
      });
      await upsertCreditNote(tx, order, input.action, refundAmount);
    } else if (input.action === "PARTIAL_SETTLEMENT") {
      disputeStatus = "RESOLVED_PARTIAL";
      paymentStatus = "PARTIALLY_REFUNDED";
      refundAmount = input.refundAmount;
      await tx.demoPayment.create({
        data: {
          orderId: order.id,
          providerRef: `sandbox_refund_${resolutionId}`,
          amount: refundAmount,
          currency: order.currency,
          status: "PARTIAL_REFUND_SUCCEEDED",
          idempotencyKey: `dispute:${order.id}:partial-refund`,
          confirmedAt: new Date(),
        },
      });
      await upsertCreditNote(tx, order, input.action, refundAmount);
    } else if (input.action === "REJECT_DISPUTE") {
      disputeStatus = "REJECTED";
      paymentStatus = previousPaymentStatus;
    } else {
      const item = order.items.find((candidate) => candidate.id === input.orderItemId);
      if (!item) {
        throw new ApiError(
          422,
          "Choose an item from this order.",
          "ORDER_ITEM_INVALID",
        );
      }
      if (item.listingId === input.replacementListingId) {
        throw new ApiError(
          422,
          "Replacement inventory must be a different listing.",
          "REPLACEMENT_LISTING_INVALID",
        );
      }
      const candidate = await tx.marketplaceListing.findFirst({
        where: {
          id: input.replacementListingId,
          listingMode: "MANAGED",
          sellerCompanyId: item.sellerCompanyId,
          category: item.listing.category,
          unit: item.unit,
          verified: true,
          status: { in: ["ACTIVE", "active"] },
          quantityAvailable: { gte: item.quantity },
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      });
      if (!candidate) {
        throw new ApiError(
          422,
          "Choose active, verified replacement stock from the same seller, category, and unit.",
          "REPLACEMENT_LISTING_INVALID",
        );
      }

      const reserved = await tx.marketplaceListing.updateMany({
        where: {
          id: candidate.id,
          status: { in: ["ACTIVE", "active"] },
          quantityAvailable: { gte: item.quantity },
        },
        data: { quantityAvailable: { decrement: item.quantity } },
      });
      if (reserved.count !== 1) {
        throw new ApiError(
          409,
          "Replacement inventory changed; choose another listing.",
          "REPLACEMENT_INVENTORY_CONFLICT",
        );
      }
      const replacementBalance = candidate.quantityAvailable - item.quantity;
      if (replacementBalance === 0) {
        await tx.marketplaceListing.update({
          where: { id: candidate.id },
          data: { status: "SOLD" },
        });
      }
      const reservation = await tx.inventoryReservation.create({
        data: {
          listingId: candidate.id,
          orderId: order.id,
          quantity: item.quantity,
          status: "COMMITTED",
          expiresAt: new Date(),
          committedAt: new Date(),
        },
      });
      await tx.inventoryMovement.create({
        data: {
          listingId: candidate.id,
          orderId: order.id,
          reservationId: reservation.id,
          quantityChange: -item.quantity,
          balanceAfter: replacementBalance,
          reason: "DISPUTE_REPLACEMENT_ALLOCATED",
          idempotencyKey: `dispute:${order.id}:replacement:${item.id}`,
        },
      });
      releasedReservations = await releaseUndispatchedInventory(
        tx,
        order,
        "DISPUTE_REPLACEMENT_RELEASE",
      );
      await tx.purchaseOrderItem.update({
        where: { id: item.id },
        data: {
          listingId: candidate.id,
          sourceBidId: null,
          title: candidate.title,
          status: "REPLACEMENT_RESERVED",
        },
      });
      disputeStatus = "RESOLVED_REPLACED";
      paymentStatus = "PAID";
      status = "PROCESSING";
      fulfillmentStatus = "PROCESSING";
      replacement = {
        orderItemId: item.id,
        fromListingId: item.listingId,
        toListingId: candidate.id,
        quantity: item.quantity,
      };
    }

    await tx.purchaseOrder.update({
      where: { id: order.id },
      data: { disputeStatus, paymentStatus, status, fulfillmentStatus },
    });
    await tx.orderEvent.create({
      data: {
        orderId: order.id,
        actorUserId,
        type: "DISPUTE_RESOLVED",
        fromStatus: "OPEN/DISPUTED",
        toStatus: `${disputeStatus}/${paymentStatus}`,
        reasonCode: input.action,
        snapshotJson: JSON.stringify({
          schemaVersion: "dispute-resolution-v1",
          resolutionId,
          action: input.action,
          note: input.note,
          previousOrderStatus: order.status,
          previousPaymentStatus,
          previousFulfillmentStatus: order.fulfillmentStatus,
          refundAmount,
          replacement,
          releasedReservations,
        }),
      },
    });

    return tx.purchaseOrder.findUniqueOrThrow({
      where: { id: order.id },
      include: {
        items: true,
        reservations: true,
        demoPayments: true,
        creditNote: true,
        events: { orderBy: { createdAt: "asc" } },
      },
    });
  });
}
