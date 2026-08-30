import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { parsePositiveInt, requireAuth } from "@/lib/marketplace";
import {
  publicListingWhere,
  listingHasExpired,
  transactableListingWhere,
} from "@/server/listings/policy";
import { assertTrustedOrigin } from "@/server/http";
import { hasRole } from "@/lib/auth";

function buyerOnly(role: Parameters<typeof hasRole>[0]) {
  return hasRole(role, "BUYER")
    ? null
    : NextResponse.json({ error: "Buyer access is required." }, { status: 403 });
}

export async function GET() {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;
  const forbidden = buyerOnly(guard.auth);
  if (forbidden) return forbidden;

  const items = await prisma.cartItem.findMany({
    where: { userId: guard.auth.userId, listing: publicListingWhere },
    include: { listing: { include: { seller: true } } },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json({ items });
}

export async function POST(request: NextRequest) {
  assertTrustedOrigin(request);
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;
  const forbidden = buyerOnly(guard.auth);
  if (forbidden) return forbidden;

  const body = await request.json().catch(() => null);
  const listingId = String(body?.listingId || "");
  const quantity = parsePositiveInt(body?.quantity, 1);
  if (!listingId) return NextResponse.json({ error: "listingId is required." }, { status: 400 });

  const listing = await prisma.marketplaceListing.findFirst({
    where: { id: listingId, ...transactableListingWhere },
  });
  if (!listing) {
    return NextResponse.json({ error: "Listing is unavailable." }, { status: 404 });
  }
  if (listingHasExpired(listing.expiresAt)) {
    return NextResponse.json({ error: "Listing has expired." }, { status: 409 });
  }

  if (
    quantity < listing.minOrderQuantity ||
    quantity > listing.quantityAvailable ||
    (quantity - listing.minOrderQuantity) % listing.lotIncrement !== 0
  ) {
    return NextResponse.json(
      {
        error: `Quantity must be between ${listing.minOrderQuantity} and ${listing.quantityAvailable} ${listing.unit}, in ${listing.lotIncrement}-${listing.unit} increments from the MOQ.`,
      },
      { status: 422 },
    );
  }
  const item = await prisma.cartItem.upsert({
    where: { userId_listingId: { userId: guard.auth.userId, listingId } },
    update: { quantity, priceSnapshot: listing.pricePerUnit },
    create: {
      userId: guard.auth.userId,
      listingId,
      quantity,
      priceSnapshot: listing.pricePerUnit,
    },
  });

  return NextResponse.json({ success: true, item });
}

export async function PATCH(request: NextRequest) {
  assertTrustedOrigin(request);
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;
  const forbidden = buyerOnly(guard.auth);
  if (forbidden) return forbidden;

  const body = await request.json().catch(() => null);
  const listingId = String(body?.listingId || "");
  const quantity = parsePositiveInt(body?.quantity, 1);
  if (!listingId) return NextResponse.json({ error: "listingId is required." }, { status: 400 });

  const listing = await prisma.marketplaceListing.findFirst({
    where: { id: listingId, ...transactableListingWhere },
  });
  if (
    !listing ||
    listingHasExpired(listing.expiresAt) ||
    quantity < listing.minOrderQuantity ||
    quantity > listing.quantityAvailable ||
    (quantity - listing.minOrderQuantity) % listing.lotIncrement !== 0
  ) {
    return NextResponse.json(
      { error: "Quantity violates listing MOQ, lot increment, or availability." },
      { status: 422 },
    );
  }
  const item = await prisma.cartItem.update({
    where: { userId_listingId: { userId: guard.auth.userId, listingId } },
    data: { quantity },
  });
  return NextResponse.json({ success: true, item });
}

export async function DELETE(request: NextRequest) {
  assertTrustedOrigin(request);
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;
  const forbidden = buyerOnly(guard.auth);
  if (forbidden) return forbidden;

  const listingId = request.nextUrl.searchParams.get("listingId");
  if (!listingId) {
    await prisma.cartItem.deleteMany({ where: { userId: guard.auth.userId } });
    return NextResponse.json({ success: true });
  }

  await prisma.cartItem.deleteMany({ where: { userId: guard.auth.userId, listingId } });
  return NextResponse.json({ success: true });
}
