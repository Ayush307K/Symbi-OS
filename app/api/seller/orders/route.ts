import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/marketplace";
import { hasRole } from "@/lib/auth";

export async function GET() {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;
  if (!hasRole(guard.auth, "SELLER")) {
    return NextResponse.json(
      { error: "Seller access is required." },
      { status: 403 },
    );
  }

  if (!guard.auth.companyId) {
    return NextResponse.json({ error: "Company account is required." }, { status: 400 });
  }

  const items = await prisma.purchaseOrderItem.findMany({
    where: { sellerCompanyId: guard.auth.companyId },
    include: {
      order: { include: { buyer: true, shippingAddress: true } },
      listing: true,
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ items });
}
