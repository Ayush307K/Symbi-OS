// ---------------------------------------------------------------------------
//  PATCH /api/bids/[id] — seller accepts or rejects a bid
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { getAuthFromCookie } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { notifyBuyerOfBidDecision } from "@/lib/mailer";

interface PatchBody {
  status: "accepted" | "rejected";
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthFromCookie();
  if (!auth) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { id: bidId } = await params;

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!["accepted", "rejected"].includes(body.status)) {
    return NextResponse.json({ error: "Status must be 'accepted' or 'rejected'." }, { status: 400 });
  }

  try {
    const bid = await prisma.bid.findUnique({ where: { id: bidId } });
    if (!bid) {
      return NextResponse.json({ error: "Bid not found." }, { status: 404 });
    }
    // Seller is authorized if their userId matches OR their Company matches producerId
    const isSellerByUserId = bid.sellerUserId === auth.userId;
    const isSellerByCompany = bid.producerId != null && bid.producerId === auth.companyId;
    if (!isSellerByUserId && !isSellerByCompany) {
      return NextResponse.json({ error: "Only the seller can accept/reject this bid." }, { status: 403 });
    }
    if (bid.status !== "pending") {
      return NextResponse.json({ error: `Bid already ${bid.status}.` }, { status: 400 });
    }

    // Update bid status
    const updated = await prisma.bid.update({
      where: { id: bidId },
      data: { status: body.status },
    });

    // If accepted, decrement quantity in the marketplace database.
    if (body.status === "accepted" && bid.materialId) {
      try {
        const material = await prisma.wasteMaterial.findUnique({
          where: { id: bid.materialId },
          select: { quantity: true },
        });
        if (material?.quantity != null) {
          await prisma.wasteMaterial.update({
            where: { id: bid.materialId },
            data: { quantity: Math.max(0, material.quantity - bid.quantity) },
          });
        }
      } catch (e) {
        console.error("[Bids PATCH] Quantity decrement failed:", e);
      }
    }

    // Email buyer about decision
    notifyBuyerOfBidDecision({
      buyerEmail: bid.bidderEmail,
      materialName: bid.materialName,
      sellerCompany: auth.companyName,
      status: body.status,
    });

    return NextResponse.json({ success: true, bid: updated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[Bids PATCH] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
