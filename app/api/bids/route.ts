import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { notifySellerOfNewBid } from "@/lib/mailer";
import { notify } from "@/lib/marketplace";
import {
  apiError,
  ApiError,
  assertTrustedOrigin,
  parseJson,
  requireUser,
} from "@/server/http";
import {
  listingHasExpired,
  managedListingWhere,
} from "@/server/listings/policy";
import { findEligibleSellerUser } from "@/server/messages";
import { enforceRateLimit } from "@/server/rate-limit";
import { releaseExpiredReservations } from "@/server/inventory";

const schema = z
  .object({
    listingId: z.string().min(1),
    quantity: z.coerce.number().int().positive().max(1_000_000_000),
    pricePerUnit: z.coerce.number().positive().max(1_000_000_000),
    terms: z.string().trim().max(1000).optional(),
  })
  .strict();

export async function POST(request: NextRequest) {
  try {
    assertTrustedOrigin(request);
    const auth = await requireUser(["BUYER"]);
    await releaseExpiredReservations();
    await enforceRateLimit(`bid:${auth.userId}`, {
      max: 20,
      windowMs: 60 * 60 * 1000,
    });
    const idempotencyKey = request.headers.get("idempotency-key");
    if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 100) {
      throw new ApiError(
        400,
        "A valid Idempotency-Key header is required.",
        "IDEMPOTENCY_KEY_REQUIRED",
      );
    }
    const body = await parseJson(request, schema);
    const existing = await prisma.bid.findUnique({
      where: { idempotencyKey },
      include: { revisions: { orderBy: { sequence: "asc" } } },
    });
    if (existing) {
      if (existing.bidderUserId !== auth.userId) {
        throw new ApiError(409, "Idempotency key is already in use.", "KEY_CONFLICT");
      }
      return NextResponse.json({
        success: true,
        bid: existing,
        idempotentReplay: true,
      });
    }

    const listing = await prisma.marketplaceListing.findFirst({
      where: { id: body.listingId, ...managedListingWhere },
      include: { material: true, seller: true },
    });
    if (!listing) {
      throw new ApiError(404, "Listing is unavailable.", "LISTING_UNAVAILABLE");
    }
    if (listingHasExpired(listing.expiresAt)) {
      throw new ApiError(409, "Listing has expired.", "LISTING_EXPIRED");
    }
    if (body.quantity > listing.quantityAvailable) {
      throw new ApiError(
        409,
        `Only ${listing.quantityAvailable} ${listing.unit} is available.`,
        "INSUFFICIENT_INVENTORY",
      );
    }
    if (body.quantity < listing.minOrderQuantity) {
      throw new ApiError(
        422,
        `Minimum order quantity is ${listing.minOrderQuantity} ${listing.unit}.`,
        "MOQ_NOT_MET",
      );
    }
    if (
      (body.quantity - listing.minOrderQuantity) % listing.lotIncrement !==
      0
    ) {
      throw new ApiError(
        422,
        `Quantity must follow ${listing.lotIncrement} ${listing.unit} increments from the MOQ.`,
        "LOT_INCREMENT_INVALID",
      );
    }
    if (listing.sellerCompanyId === auth.companyId) {
      throw new ApiError(409, "You cannot bid on your own listing.", "SELF_BID");
    }
    const seller = await findEligibleSellerUser(listing.sellerCompanyId);
    if (!seller) {
      throw new ApiError(
        409,
        "This listing does not have an eligible seller to receive the bid.",
        "SELLER_NOT_CONNECTED",
      );
    }
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const bid = await prisma.$transaction(async (tx) => {
      const created = await tx.bid.create({
        data: {
          listingId: listing.id,
          materialName: listing.material.name,
          materialId: listing.materialId,
          quantity: body.quantity,
          pricePerUnit: body.pricePerUnit,
          currency: listing.currency,
          unit: listing.unit,
          terms: body.terms,
          status: "PENDING",
          currentSequence: 1,
          idempotencyKey,
          bidderUserId: auth.userId,
          bidderEmail: auth.email,
          bidderCompany: auth.companyName,
          sellerUserId: seller.id,
          producerId: listing.sellerCompanyId,
          expiresAt,
        },
      });
      await tx.offerRevision.create({
        data: {
          bidId: created.id,
          sequence: 1,
          createdByUserId: auth.userId,
          kind: "INITIAL",
          quantity: body.quantity,
          pricePerUnit: body.pricePerUnit,
          currency: listing.currency,
          unit: listing.unit,
          terms: body.terms,
          expiresAt,
        },
      });
      await tx.offerEvent.create({
        data: {
          bidId: created.id,
          actorUserId: auth.userId,
          type: "OFFER_CREATED",
          toStatus: "PENDING",
          sequence: 1,
          metadataJson: JSON.stringify({ idempotencyKey }),
        },
      });
      return created;
    });
    await notify(
      seller.id,
      "BID_CREATED",
      "New offer received",
      `${auth.companyName} offered ₹${body.pricePerUnit.toLocaleString("en-IN")} per ${listing.unit} for ${body.quantity} ${listing.unit}.`,
      "/seller",
    );
    void notifySellerOfNewBid({
      sellerEmail: seller.email,
      materialName: listing.material.name,
      bidderCompany: auth.companyName,
      quantity: body.quantity,
      pricePerUnit: body.pricePerUnit,
    });
    return NextResponse.json({ success: true, bid }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser();
    await releaseExpiredReservations();
    const role =
      request.nextUrl.searchParams.get("role") === "seller"
        ? "seller"
        : "buyer";
    const ownership =
      role === "seller"
        ? {
            OR: [
              { sellerUserId: auth.userId },
              ...(auth.companyId ? [{ producerId: auth.companyId }] : []),
            ],
            NOT: { bidderUserId: auth.userId },
          }
        : { bidderUserId: auth.userId };
    const bids = await prisma.bid.findMany({
      where: ownership,
      include: {
        revisions: { orderBy: { sequence: "asc" } },
        events: { orderBy: { createdAt: "asc" } },
        order: { select: { id: true, orderNumber: true, status: true } },
        reservation: {
          select: { status: true, expiresAt: true, quantity: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return NextResponse.json(bids);
  } catch (error) {
    return apiError(error);
  }
}
