import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/marketplace";

export async function GET() {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;

  const [orders, cartItems, wishlistItems, addresses, threads, notifications, bids] =
    await Promise.all([
      prisma.purchaseOrder.findMany({
        where: { buyerUserId: guard.auth.userId },
        include: { items: true, shippingAddress: true },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.cartItem.findMany({
        where: { userId: guard.auth.userId },
        include: { listing: true },
        orderBy: { updatedAt: "desc" },
        take: 20,
      }),
      prisma.wishlistItem.findMany({
        where: { userId: guard.auth.userId },
        include: { listing: true },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.address.findMany({
        where: { userId: guard.auth.userId },
        orderBy: [{ isDefaultShipping: "desc" }, { updatedAt: "desc" }],
      }),
      prisma.messageThread.findMany({
        where: {
          OR: [{ buyerUserId: guard.auth.userId }, { sellerUserId: guard.auth.userId }],
        },
        include: { messages: { orderBy: { createdAt: "desc" }, take: 1 }, listing: true },
        orderBy: { updatedAt: "desc" },
        take: 20,
      }),
      prisma.notification.findMany({
        where: { userId: guard.auth.userId },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.bid.findMany({
        where: { bidderUserId: guard.auth.userId },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    ]);

  const cartTotal = cartItems.reduce(
    (sum, item) => sum + item.priceSnapshot * item.quantity,
    0
  );
  const orderTotal = orders.reduce((sum, order) => sum + order.totalAmount, 0);

  return NextResponse.json({
    user: guard.auth,
    stats: {
      orders: orders.length,
      cartItems: cartItems.length,
      savedProducts: wishlistItems.length,
      addresses: addresses.length,
      openMessages: threads.filter((thread) => thread.status === "OPEN").length,
      unreadNotifications: notifications.filter((item) => !item.readAt).length,
      activeBids: bids.filter((bid) => bid.status === "pending").length,
      cartTotal,
      orderTotal,
    },
    orders,
    cartItems,
    wishlistItems,
    addresses,
    threads,
    notifications,
    bids,
  });
}
