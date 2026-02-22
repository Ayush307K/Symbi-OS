// ---------------------------------------------------------------------------
//  /api/bids — POST (place bid) + GET (list bids)
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { getAuthFromCookie } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { notifySellerOfNewBid } from "@/lib/mailer";

interface PlaceBidBody {
  materialName: string;
  materialId?: string;
  quantity: number;
  pricePerUnit: number;
  sellerUserId?: string | null;
  producerId?: string;
}

// POST — buyer places a bid
export async function POST(request: NextRequest) {
  const auth = await getAuthFromCookie();
  if (!auth) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  let body: PlaceBidBody;
  try {
    body = (await request.json()) as PlaceBidBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { materialName, materialId, quantity, pricePerUnit, producerId } = body;
  let { sellerUserId } = body;

  if (!materialName || !quantity || !pricePerUnit) {
    return NextResponse.json(
      { error: "Missing required fields: materialName, quantity, pricePerUnit" },
      { status: 400 }
    );
  }

  // If no sellerUserId provided, try to look up by producerId (Neo4j company id)
  if (!sellerUserId && producerId) {
    const sellerUser = await prisma.user.findFirst({
      where: { neo4jCompanyId: producerId },
      select: { id: true },
    });
    if (sellerUser) sellerUserId = sellerUser.id;
  }

  if (sellerUserId && sellerUserId === auth.userId) {
    return NextResponse.json({ error: "Cannot bid on your own listing." }, { status: 400 });
  }

  try {
    const bid = await prisma.bid.create({
      data: {
        materialName,
        materialId: materialId ?? null,
        quantity,
        pricePerUnit,
        bidderUserId: auth.userId,
        bidderEmail: auth.email,
        bidderCompany: auth.companyName,
        sellerUserId: sellerUserId ?? null,
        producerId: producerId ?? null,
      },
    });

    // Email seller about new bid (only if real user)
    if (sellerUserId) {
      const seller = await prisma.user.findUnique({ where: { id: sellerUserId } });
      if (seller) {
        notifySellerOfNewBid({
          sellerEmail: seller.email,
          materialName,
          bidderCompany: auth.companyName,
          quantity,
          pricePerUnit,
        });
      }
    }

    return NextResponse.json({ success: true, bid });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[Bids POST] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// GET — list bids (incoming or outgoing)
export async function GET(request: NextRequest) {
  const auth = await getAuthFromCookie();
  if (!auth) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const role = request.nextUrl.searchParams.get("role") ?? "buyer";

  try {
    let bids;
    if (role === "seller") {
      // Match bids where this user is seller BY userId OR by producerId (neo4j company)
      bids = await prisma.bid.findMany({
        where: {
          OR: [
            { sellerUserId: auth.userId },
            ...(auth.neo4jCompanyId
              ? [{ producerId: auth.neo4jCompanyId }]
              : []),
          ],
          // Exclude bids placed by the same user
          NOT: { bidderUserId: auth.userId },
        },
        orderBy: { createdAt: "desc" },
      });
    } else {
      bids = await prisma.bid.findMany({
        where: { bidderUserId: auth.userId },
        orderBy: { createdAt: "desc" },
      });
    }

    return NextResponse.json(bids);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[Bids GET] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
