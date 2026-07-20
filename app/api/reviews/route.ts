import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/marketplace";
import { assertTrustedOrigin } from "@/server/http";
import { hasRole } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const listingId = request.nextUrl.searchParams.get("listingId");
  if (!listingId) return NextResponse.json({ error: "listingId is required." }, { status: 400 });

  const reviews = await prisma.review.findMany({
    where: { listingId, status: "PUBLISHED" },
    include: { user: { select: { companyName: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ reviews });
}

export async function POST(request: NextRequest) {
  assertTrustedOrigin(request);
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;
  if (!hasRole(guard.auth, "BUYER")) {
    return NextResponse.json(
      { error: "Buyer access is required." },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => null);
  const listingId = String(body?.listingId || "");
  const rating = Number(body?.rating);
  const reviewBody = String(body?.body || "").trim();
  if (!listingId) return NextResponse.json({ error: "listingId is required." }, { status: 400 });
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: "Rating must be between 1 and 5." }, { status: 400 });
  }
  if (reviewBody.length < 10) {
    return NextResponse.json({ error: "Review must be at least 10 characters." }, { status: 400 });
  }

  const verifiedPurchase = await prisma.purchaseOrderItem.findFirst({
      where: {
        listingId,
        status: { in: ["FULFILLED", "DELIVERED"] },
        order: {
          buyerUserId: guard.auth.userId,
          fulfillmentStatus: { in: ["FULFILLED", "DELIVERED"] },
        },
      },
      select: { id: true },
    });
  if (!verifiedPurchase) {
    return NextResponse.json(
      { error: "A fulfilled purchase is required before reviewing this listing." },
      { status: 403 },
    );
  }

  const review = await prisma.review.upsert({
    where: {
      userId_listingId: { userId: guard.auth.userId, listingId },
    },
    update: {
      rating,
      title: body?.title ? String(body.title).trim().slice(0, 160) : null,
      body: reviewBody.slice(0, 3000),
      verifiedPurchase: true,
      status: "PUBLISHED",
    },
    create: {
      userId: guard.auth.userId,
      listingId,
      rating,
      title: body?.title ? String(body.title).trim().slice(0, 160) : null,
      body: reviewBody.slice(0, 3000),
      mediaJson: null,
      verifiedPurchase: true,
    },
  });

  return NextResponse.json({ success: true, review });
}
