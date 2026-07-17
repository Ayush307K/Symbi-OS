import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { parsePositiveInt, requireAuth } from "@/lib/marketplace";

export async function GET() {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;

  const items = await prisma.cartItem.findMany({
    where: { userId: guard.auth.userId },
    include: { listing: { include: { seller: true } } },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json({ items });
}

export async function POST(request: NextRequest) {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;

  const body = await request.json().catch(() => null);
  const listingId = String(body?.listingId || "");
  const quantity = parsePositiveInt(body?.quantity, 1);
  if (!listingId) return NextResponse.json({ error: "listingId is required." }, { status: 400 });

  const listing = await prisma.marketplaceListing.findUnique({ where: { id: listingId } });
  if (!listing || listing.status !== "active") {
    return NextResponse.json({ error: "Listing is unavailable." }, { status: 404 });
  }

  const maxQuantity = Math.max(1, listing.quantityAvailable || 1);
  const safeQuantity = Math.min(quantity, maxQuantity);
  const item = await prisma.cartItem.upsert({
    where: { userId_listingId: { userId: guard.auth.userId, listingId } },
    update: { quantity: safeQuantity, priceSnapshot: listing.pricePerUnit },
    create: {
      userId: guard.auth.userId,
      listingId,
      quantity: safeQuantity,
      priceSnapshot: listing.pricePerUnit,
    },
  });

  return NextResponse.json({ success: true, item });
}

export async function PATCH(request: NextRequest) {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;

  const body = await request.json().catch(() => null);
  const listingId = String(body?.listingId || "");
  const quantity = parsePositiveInt(body?.quantity, 1);
  if (!listingId) return NextResponse.json({ error: "listingId is required." }, { status: 400 });

  const item = await prisma.cartItem.update({
    where: { userId_listingId: { userId: guard.auth.userId, listingId } },
    data: { quantity },
  });
  return NextResponse.json({ success: true, item });
}

export async function DELETE(request: NextRequest) {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;

  const listingId = request.nextUrl.searchParams.get("listingId");
  if (!listingId) {
    await prisma.cartItem.deleteMany({ where: { userId: guard.auth.userId } });
    return NextResponse.json({ success: true });
  }

  await prisma.cartItem.deleteMany({ where: { userId: guard.auth.userId, listingId } });
  return NextResponse.json({ success: true });
}
