import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { publicListingWhere } from "@/server/listings/policy";

export async function GET() {
  try {
    const [matches, confirmedOrders] = await Promise.all([
      prisma.marketplaceListing.count({ where: publicListingWhere }),
      prisma.purchaseOrder.count({
        where: { status: "CONFIRMED", paymentStatus: "PAID" },
      }),
    ]);
    return NextResponse.json({
      matches,
      co2Saved: 0,
      landfillDiverted: 0,
      confirmedOrders,
      methodology:
        "Impact values remain zero until a verified unit-normalized measurement pipeline is configured.",
    });
  } catch (error) {
    console.error("[Stats API]", error);
    return NextResponse.json(
      { error: "Unable to load marketplace metrics." },
      { status: 500 }
    );
  }
}
