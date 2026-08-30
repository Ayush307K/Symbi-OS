import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import {
  DELIVERY_TERM_DETAILS,
  type DeliveryTerm,
} from "@/lib/logistics";
import { calculateFees } from "@/server/fees";
import { calculateFreightQuote } from "@/server/logistics/freight";
import {
  apiError,
  ApiError,
  assertTrustedOrigin,
  parseJson,
  requireUser,
} from "@/server/http";
import {
  listingHasExpired,
  transactableListingWhere,
} from "@/server/listings/policy";

const schema = z
  .object({
    listingId: z.string().min(1),
    shippingAddressId: z.string().uuid(),
    quantity: z.coerce.number().int().positive().max(1_000_000_000),
  })
  .strict();

export async function POST(request: NextRequest) {
  try {
    assertTrustedOrigin(request);
    const auth = await requireUser(["BUYER"]);
    const body = await parseJson(request, schema);
    const [listing, address] = await Promise.all([
      prisma.marketplaceListing.findFirst({
        where: { AND: [{ id: body.listingId }, transactableListingWhere] },
      }),
      prisma.address.findFirst({
        where: { id: body.shippingAddressId, userId: auth.userId },
      }),
    ]);
    if (!listing) {
      throw new ApiError(404, "This listing is no longer available.", "LISTING_UNAVAILABLE");
    }
    if (!address) {
      throw new ApiError(404, "Delivery address was not found.", "DELIVERY_ADDRESS_NOT_FOUND");
    }
    if (!listing.deliveryTerm) {
      throw new ApiError(
        409,
        "The seller must state delivery terms before this listing can be purchased.",
        "DELIVERY_TERM_REQUIRED",
      );
    }
    if (listingHasExpired(listing.expiresAt)) {
      throw new ApiError(409, "This listing has expired.", "LISTING_EXPIRED");
    }
    if (listing.priceMode !== "FIXED" || listing.pricePerUnit <= 0) {
      throw new ApiError(409, "An accepted material offer is required first.", "MATERIAL_QUOTE_REQUIRED");
    }
    if (
      body.quantity < listing.minOrderQuantity ||
      body.quantity > listing.quantityAvailable ||
      (body.quantity - listing.minOrderQuantity) % listing.lotIncrement !== 0
    ) {
      throw new ApiError(422, "Quantity does not meet stock, MOQ, or lot rules.", "QUANTITY_INVALID");
    }

    const quoteValues = calculateFreightQuote({
      deliveryTerm: listing.deliveryTerm as DeliveryTerm,
      quantity: body.quantity,
      unit: listing.unit,
      listingLatitude: listing.latitude,
      listingLongitude: listing.longitude,
      destinationLatitude: address.latitude,
      destinationLongitude: address.longitude,
    });
    const existing = await prisma.freightQuote.findFirst({
      where: {
        buyerUserId: auth.userId,
        listingId: listing.id,
        shippingAddressId: address.id,
        quantity: body.quantity,
        deliveryTerm: listing.deliveryTerm,
        source: quoteValues.source,
        amount: quoteValues.amount,
        status: "QUOTED",
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });
    const quote =
      existing ||
      (await prisma.freightQuote.create({
        data: {
          buyerUserId: auth.userId,
          listingId: listing.id,
          shippingAddressId: address.id,
          quantity: body.quantity,
          unit: listing.unit,
          deliveryTerm: listing.deliveryTerm,
          distanceKm: quoteValues.distanceKm,
          amount: quoteValues.amount,
          source: quoteValues.source,
          expiresAt: quoteValues.expiresAt,
        },
      }));
    const fees = calculateFees(
      Number(listing.pricePerUnit) * body.quantity,
      { shippingAmount: Number(quote.amount) },
    );
    return NextResponse.json({
      quote,
      fees,
      delivery: {
        term: listing.deliveryTerm,
        ...DELIVERY_TERM_DETAILS[listing.deliveryTerm as DeliveryTerm],
        freightDisposition:
          quote.source === "BUYER_ARRANGED"
            ? "Buyer arranged; not charged by SymbiOS"
            : quote.source === "INCLUDED_IN_PRICE"
              ? "Included in the material price"
              : "Quoted separately in this checkout",
      },
      sandbox: quote.source === "SANDBOX_ESTIMATOR",
    });
  } catch (error) {
    return apiError(error);
  }
}
