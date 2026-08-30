import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { apiError, ApiError, requireUser } from "@/server/http";
import { calculateFees } from "@/server/fees";
import {
  listingHasExpired,
  transactableListingWhere,
} from "@/server/listings/policy";

const schema = z.object({
  listingId: z.string().min(1),
  quantity: z.coerce.number().int().positive().max(1_000_000_000),
});

/**
 * What this order would cost, before committing to it.
 *
 * Read-only, and deliberately server-side: the buyer must see the same figures
 * the order will be written with, and a client that computed its own fees would
 * eventually disagree with the ledger. It reuses calculateFees rather than
 * restating the arithmetic, so preview and checkout cannot drift.
 *
 * It also answers the questions that make checkout fail late — whether the
 * listing is still purchasable, whether the quantity clears the minimum and the
 * lot increment, and whether the stock is actually there.
 */
export async function GET(request: NextRequest) {
  try {
    await requireUser(["BUYER"]);
    const parsed = schema.safeParse({
      listingId: request.nextUrl.searchParams.get("listingId"),
      quantity: request.nextUrl.searchParams.get("quantity"),
    });
    if (!parsed.success) {
      throw new ApiError(
        422,
        "A listing and quantity are required.",
        "PREVIEW_INVALID",
      );
    }
    const { listingId, quantity } = parsed.data;

    const listing = await prisma.marketplaceListing.findFirst({
      where: { AND: [{ id: listingId }, transactableListingWhere] },
      select: {
        id: true,
        title: true,
        unit: true,
        priceMode: true,
        pricePerUnit: true,
        currency: true,
        quantityAvailable: true,
        minOrderQuantity: true,
        lotIncrement: true,
        leadTimeDays: true,
        city: true,
        state: true,
        imageUrl: true,
        verified: true,
        expiresAt: true,
        deliveryTerm: true,
        latitude: true,
        longitude: true,
        seller: { select: { name: true, displayName: true } },
      },
    });
    if (!listing) {
      throw new ApiError(
        404,
        "This listing is no longer available.",
        "LISTING_UNAVAILABLE",
      );
    }

    // Stated rather than thrown: the buyer should see why a quantity is not
    // acceptable while they can still change it, not after pressing pay.
    const blockers: string[] = [];
    if (listingHasExpired(listing.expiresAt)) {
      blockers.push("This listing has expired.");
    }
    if (listing.priceMode !== "FIXED" || listing.pricePerUnit <= 0) {
      blockers.push(
        "This seller quotes on request. Send an inquiry or place a bid instead.",
      );
    }
    if (!listing.deliveryTerm) {
      blockers.push(
        "The seller has not stated who arranges and pays for freight.",
      );
    }
    if (
      listing.deliveryTerm === "FREIGHT_QUOTE_REQUIRED" &&
      (listing.latitude === null || listing.longitude === null)
    ) {
      blockers.push(
        "The dispatch location must be geocoded before freight can be quoted.",
      );
    }
    if (quantity < listing.minOrderQuantity) {
      blockers.push(
        `Minimum order is ${listing.minOrderQuantity} ${listing.unit}.`,
      );
    }
    if (quantity > listing.quantityAvailable) {
      blockers.push(
        `Only ${listing.quantityAvailable} ${listing.unit} available.`,
      );
    }
    if (listing.lotIncrement > 1 && quantity % listing.lotIncrement !== 0) {
      blockers.push(
        `Quantity must be a multiple of ${listing.lotIncrement} ${listing.unit}.`,
      );
    }

    const fees = blockers.length
      ? null
      : calculateFees(quantity * listing.pricePerUnit);

    return NextResponse.json({
      listing: {
        ...listing,
        seller: {
          name: listing.seller.displayName || listing.seller.name,
        },
      },
      quantity,
      fees,
      blockers,
    });
  } catch (error) {
    return apiError(error);
  }
}
