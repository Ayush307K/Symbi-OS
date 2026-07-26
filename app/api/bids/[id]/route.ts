import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { notifyBuyerOfBidDecision } from "@/lib/mailer";
import { notify } from "@/lib/marketplace";
import {
  apiError,
  ApiError,
  assertTrustedOrigin,
  parseJson,
  requireUser,
} from "@/server/http";
import { reserveAcceptedBid } from "@/server/orders";
import { releaseExpiredReservations } from "@/server/inventory";

const schema = z
  .object({
    action: z.enum(["ACCEPT", "REJECT", "COUNTER", "WITHDRAW", "CANCEL"]).optional(),
    status: z.enum(["accepted", "rejected"]).optional(),
    quantity: z.coerce.number().int().positive().max(1_000_000_000).optional(),
    pricePerUnit: z.coerce.number().positive().max(1_000_000_000).optional(),
    terms: z.string().trim().max(1000).optional(),
  })
  .strict();

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertTrustedOrigin(request);
    const auth = await requireUser();
    await releaseExpiredReservations();
    const body = await parseJson(request, schema);
    const action =
      body.action ?? (body.status === "accepted" ? "ACCEPT" : "REJECT");
    const { id } = await params;
    const bid = await prisma.bid.findUnique({
      where: { id },
      include: {
        listing: true,
        revisions: { orderBy: { sequence: "desc" }, take: 1 },
      },
    });
    if (!bid) throw new ApiError(404, "Bid not found.", "BID_NOT_FOUND");
    const isBuyer = bid.bidderUserId === auth.userId;
    const isSeller =
      bid.sellerUserId === auth.userId ||
      Boolean(auth.companyId && bid.producerId === auth.companyId);
    if (!isBuyer && !isSeller) {
      throw new ApiError(403, "You cannot modify this negotiation.", "FORBIDDEN");
    }
    if (!["PENDING", "COUNTERED"].includes(bid.status)) {
      throw new ApiError(409, `Bid is already ${bid.status}.`, "INVALID_STATE");
    }
    if (bid.expiresAt && bid.expiresAt <= new Date()) {
      await prisma.$transaction([
        prisma.bid.update({
          where: { id },
          data: { status: "EXPIRED", decisionAt: new Date() },
        }),
        prisma.offerEvent.create({
          data: {
            bidId: id,
            type: "OFFER_EXPIRED",
            fromStatus: bid.status,
            toStatus: "EXPIRED",
            sequence: bid.currentSequence,
          },
        }),
      ]);
      throw new ApiError(409, "Bid has expired.", "BID_EXPIRED");
    }
    const latest = bid.revisions[0];
    if (!latest) {
      throw new ApiError(409, "Offer history is missing.", "OFFER_HISTORY_MISSING");
    }
    const actorCreatedLatest = latest.createdByUserId === auth.userId;
    if (["ACCEPT", "REJECT", "COUNTER"].includes(action) && actorCreatedLatest) {
      throw new ApiError(
        409,
        "Wait for the other party to respond to the current offer.",
        "NOT_OFFER_RECIPIENT",
      );
    }
    if (action === "WITHDRAW" && !isBuyer) {
      throw new ApiError(403, "Only the buyer can withdraw.", "FORBIDDEN");
    }
    if (action === "CANCEL" && !isSeller) {
      throw new ApiError(403, "Only the seller can cancel.", "FORBIDDEN");
    }
    if (action === "ACCEPT" && isSeller) {
      const onboarding = await prisma.sellerOnboarding.findFirst({
        where: {
          userId: auth.userId,
          status: "APPROVED",
        },
      });
      if (!onboarding) {
        throw new ApiError(
          403,
          "Approved seller onboarding is required to accept offers.",
          "SELLER_NOT_VERIFIED",
        );
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (action === "COUNTER") {
        const quantity = body.quantity ?? latest.quantity;
        const pricePerUnit = body.pricePerUnit ?? latest.pricePerUnit;
        const listing = bid.listing;
        if (!listing) {
          throw new ApiError(409, "Listing is unavailable.", "LISTING_UNAVAILABLE");
        }
        if (
          quantity > listing.quantityAvailable ||
          quantity < listing.minOrderQuantity
        ) {
          throw new ApiError(
            422,
            "Counter quantity violates current inventory or MOQ.",
            "COUNTER_QUANTITY_INVALID",
          );
        }
        if (
          (quantity - listing.minOrderQuantity) % listing.lotIncrement !==
          0
        ) {
          throw new ApiError(
            422,
            "Counter quantity violates the listing lot increment.",
            "LOT_INCREMENT_INVALID",
          );
        }
        const sequence = bid.currentSequence + 1;
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        const claimed = await tx.bid.updateMany({
          where: {
            id,
            status: bid.status,
            currentSequence: bid.currentSequence,
          },
          data: {
            status: "COUNTERED",
            currentSequence: sequence,
            quantity,
            pricePerUnit,
            terms: body.terms ?? latest.terms,
            expiresAt,
          },
        });
        if (claimed.count !== 1) {
          throw new ApiError(409, "Offer changed; reload and retry.", "OFFER_CONFLICT");
        }
        await tx.offerRevision.update({
          where: { id: latest.id },
          data: { status: "SUPERSEDED" },
        });
        await tx.offerRevision.create({
          data: {
            bidId: id,
            sequence,
            createdByUserId: auth.userId,
            kind: "COUNTER",
            quantity,
            pricePerUnit,
            currency: bid.currency,
            unit: bid.unit,
            terms: body.terms ?? latest.terms,
            expiresAt,
          },
        });
        await tx.offerEvent.create({
          data: {
            bidId: id,
            actorUserId: auth.userId,
            type: "OFFER_COUNTERED",
            fromStatus: bid.status,
            toStatus: "COUNTERED",
            sequence,
          },
        });
      } else {
        const nextStatus =
          action === "ACCEPT"
            ? "ACCEPTED"
            : action === "REJECT"
              ? "REJECTED"
              : action === "WITHDRAW"
                ? "WITHDRAWN"
                : "CANCELLED";
        const claimed = await tx.bid.updateMany({
          where: {
            id,
            status: bid.status,
            currentSequence: bid.currentSequence,
          },
          data: {
            status: nextStatus,
            acceptedAt: action === "ACCEPT" ? new Date() : null,
            decisionAt: new Date(),
          },
        });
        if (claimed.count !== 1) {
          throw new ApiError(409, "Offer changed; reload and retry.", "OFFER_CONFLICT");
        }
        await tx.offerRevision.update({
          where: { id: latest.id },
          data: { status: nextStatus },
        });
        await tx.offerEvent.create({
          data: {
            bidId: id,
            actorUserId: auth.userId,
            type: `OFFER_${nextStatus}`,
            fromStatus: bid.status,
            toStatus: nextStatus,
            sequence: bid.currentSequence,
          },
        });
        if (action === "ACCEPT") {
          await reserveAcceptedBid(
            tx,
            {
              ...bid,
              quantity: latest.quantity,
              pricePerUnit: latest.pricePerUnit,
              terms: latest.terms,
            },
            auth.userId,
          );
        }
      }
      return tx.bid.findUniqueOrThrow({
        where: { id },
        include: {
          revisions: { orderBy: { sequence: "asc" } },
          events: { orderBy: { createdAt: "asc" } },
          order: true,
          reservation: true,
        },
      });
    });

    const recipientId = isBuyer ? bid.sellerUserId : bid.bidderUserId;
    await notify(
      recipientId,
      `BID_${updated.status}`,
      `Offer ${updated.status.toLowerCase()}`,
      `${updated.quantity} ${updated.unit} at ₹${updated.pricePerUnit.toLocaleString("en-IN")} per ${updated.unit}.`,
      isBuyer ? "/seller" : "/account",
    );
    if (["ACCEPT", "REJECT"].includes(action)) {
      void notifyBuyerOfBidDecision({
        buyerEmail: bid.bidderEmail,
        materialName: bid.materialName,
        sellerCompany: auth.companyName,
        status: action === "ACCEPT" ? "accepted" : "rejected",
      });
    }
    return NextResponse.json({ success: true, bid: updated });
  } catch (error) {
    return apiError(error);
  }
}
