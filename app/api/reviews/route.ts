import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/marketplace";

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
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;

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

  const verifiedPurchase = Boolean(
    await prisma.purchaseOrderItem.findFirst({
      where: { listingId, order: { buyerUserId: guard.auth.userId, status: { in: ["CONFIRMED", "DELIVERED", "CREATED"] } } },
      select: { id: true },
    })
  );

  const review = await prisma.review.create({
    data: {
      userId: guard.auth.userId,
      listingId,
      rating,
      title: body?.title ? String(body.title).trim() : null,
      body: reviewBody,
      mediaJson: body?.media ? JSON.stringify(body.media) : null,
      verifiedPurchase,
    },
  });

  return NextResponse.json({ success: true, review });
}
