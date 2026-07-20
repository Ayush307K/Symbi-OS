import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/marketplace";
import { publicListingWhere } from "@/server/listings/policy";
import { assertTrustedOrigin } from "@/server/http";
import { hasRole } from "@/lib/auth";

function buyerOnly(auth: Parameters<typeof hasRole>[0]) {
  return hasRole(auth, "BUYER")
    ? null
    : NextResponse.json({ error: "Buyer access is required." }, { status: 403 });
}

export async function GET() {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;
  const forbidden = buyerOnly(guard.auth);
  if (forbidden) return forbidden;

  const items = await prisma.wishlistItem.findMany({
    where: { userId: guard.auth.userId, listing: publicListingWhere },
    include: { listing: true },
    orderBy: { createdAt: "desc" },
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
  if (!listingId) return NextResponse.json({ error: "listingId is required." }, { status: 400 });

  const listing = await prisma.marketplaceListing.findFirst({
    where: { id: listingId, ...publicListingWhere },
  });
  if (!listing) return NextResponse.json({ error: "Listing not found." }, { status: 404 });

  const item = await prisma.wishlistItem.upsert({
    where: { userId_listingId: { userId: guard.auth.userId, listingId } },
    update: {},
    create: { userId: guard.auth.userId, listingId },
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
  if (!listingId) return NextResponse.json({ error: "listingId is required." }, { status: 400 });

  await prisma.wishlistItem.deleteMany({ where: { userId: guard.auth.userId, listingId } });
  return NextResponse.json({ success: true });
}
