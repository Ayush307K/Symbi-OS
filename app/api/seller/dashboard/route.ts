import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/marketplace";

export async function GET() {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;

  const companyId = guard.auth.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "Company account is required." }, { status: 400 });
  }

  const [listings, bids, onboarding, orderItems, reviews, threads] = await Promise.all([
    prisma.marketplaceListing.findMany({
      where: { sellerCompanyId: companyId },
      orderBy: { updatedAt: "desc" },
      take: 50,
    }),
    prisma.bid.findMany({
      where: {
        OR: [{ sellerUserId: guard.auth.userId }, { producerId: companyId }],
        NOT: { bidderUserId: guard.auth.userId },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.sellerOnboarding.upsert({
      where: { userId: guard.auth.userId },
      update: {},
      create: { userId: guard.auth.userId },
    }),
    prisma.purchaseOrderItem.findMany({
      where: { sellerCompanyId: companyId },
      include: { order: { include: { buyer: true, shippingAddress: true } }, listing: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.review.findMany({
      where: { listing: { sellerCompanyId: companyId } },
      include: { listing: true, user: { select: { companyName: true } } },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.messageThread.findMany({
      where: {
        OR: [{ sellerUserId: guard.auth.userId }, { sellerCompanyId: companyId }],
      },
      include: { messages: { orderBy: { createdAt: "desc" }, take: 1 }, listing: true },
      orderBy: { updatedAt: "desc" },
      take: 30,
    }),
  ]);

  const revenue = orderItems.reduce((sum, item) => sum + item.lineTotal, 0);
  const avgRating =
    reviews.length > 0
      ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
      : 0;

  return NextResponse.json({
    user: guard.auth,
    stats: {
      listings: listings.length,
      activeListings: listings.filter((listing) => listing.status === "active").length,
      incomingBids: bids.length,
      pendingBids: bids.filter((bid) => bid.status === "pending").length,
      orders: orderItems.length,
      revenue,
      reviews: reviews.length,
      avgRating,
      openThreads: threads.filter((thread) => thread.status === "OPEN").length,
    },
    listings,
    bids,
    onboarding,
    orderItems,
    reviews,
    threads,
  });
}
