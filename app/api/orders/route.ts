import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/marketplace";

export async function GET() {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;

  const orders = await prisma.purchaseOrder.findMany({
    where: { buyerUserId: guard.auth.userId },
    include: { items: true, shippingAddress: true, billingAddress: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ orders });
}
