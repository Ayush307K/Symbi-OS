import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { notify, requireAuth } from "@/lib/marketplace";

export async function GET() {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;

  const threads = await prisma.messageThread.findMany({
    where: {
      OR: [{ buyerUserId: guard.auth.userId }, { sellerUserId: guard.auth.userId }],
    },
    include: { messages: { orderBy: { createdAt: "asc" } }, listing: true },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json({ threads });
}

export async function POST(request: NextRequest) {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;

  const body = await request.json().catch(() => null);
  const text = String(body?.body || "").trim();
  if (text.length < 2) {
    return NextResponse.json({ error: "Message body is required." }, { status: 400 });
  }

  let threadId = body?.threadId ? String(body.threadId) : null;
  let sellerUserId = body?.sellerUserId ? String(body.sellerUserId) : null;
  let sellerCompanyId = body?.sellerCompanyId ? String(body.sellerCompanyId) : null;
  const listingId = body?.listingId ? String(body.listingId) : null;

  if (!threadId && listingId) {
    const listing = await prisma.marketplaceListing.findUnique({ where: { id: listingId } });
    if (!listing) return NextResponse.json({ error: "Listing not found." }, { status: 404 });
    sellerCompanyId = listing.sellerCompanyId;
    const seller = await prisma.user.findFirst({ where: { companyId: listing.sellerCompanyId } });
    sellerUserId = seller?.id ?? null;
  }

  if (!threadId) {
    const thread = await prisma.messageThread.create({
      data: {
        listingId,
        buyerUserId: guard.auth.userId,
        sellerUserId,
        sellerCompanyId,
        subject: String(body?.subject || "Marketplace enquiry").trim(),
      },
    });
    threadId = thread.id;
  }

  const thread = await prisma.messageThread.findFirst({
    where: {
      id: threadId,
      OR: [{ buyerUserId: guard.auth.userId }, { sellerUserId: guard.auth.userId }],
    },
  });
  if (!thread) return NextResponse.json({ error: "Thread not found." }, { status: 404 });

  const message = await prisma.message.create({
    data: {
      threadId,
      senderUserId: guard.auth.userId,
      body: text,
      attachmentsJson: body?.attachments ? JSON.stringify(body.attachments) : null,
    },
  });

  await prisma.messageThread.update({ where: { id: threadId }, data: { updatedAt: new Date() } });
  const recipientId = thread.buyerUserId === guard.auth.userId ? thread.sellerUserId : thread.buyerUserId;
  await notify(recipientId, "MESSAGE", "New marketplace message", text.slice(0, 140), "/");

  return NextResponse.json({ success: true, threadId, message });
}
