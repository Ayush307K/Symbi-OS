import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { notify } from "@/lib/marketplace";
import {
  apiError,
  ApiError,
  assertTrustedOrigin,
  parseJson,
  requireUser,
} from "@/server/http";
import { enforceRateLimit } from "@/server/rate-limit";
import {
  appendMessageToThread,
  cleanMessage,
  createListingMessageThread,
  findActiveSellerUserId,
  threadRecipient,
} from "@/server/messages";

const createSchema = z
  .object({
    threadId: z.string().uuid().optional(),
    listingId: z.string().min(1).optional(),
    bidId: z.string().uuid().optional(),
    orderId: z.string().uuid().optional(),
    subject: z.string().trim().min(2).max(160).optional(),
    body: z.string().min(1).max(5000),
  })
  .strict();

export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser();
    const limit = Math.min(
      50,
      Math.max(1, Number(request.nextUrl.searchParams.get("limit") ?? 20)),
    );
    const cursor = request.nextUrl.searchParams.get("cursor");
    const threads = await prisma.messageThread.findMany({
      where: {
        OR: [
          { buyerUserId: auth.userId },
          { sellerUserId: auth.userId },
          ...(auth.companyId ? [{ sellerCompanyId: auth.companyId }] : []),
        ],
      },
      include: {
        listing: { select: { id: true, slug: true, title: true } },
        bid: { select: { id: true, status: true } },
        order: { select: { id: true, orderNumber: true, status: true } },
        buyer: { select: { id: true, companyName: true } },
        seller: { select: { id: true, companyName: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
        _count: {
          select: {
            messages: {
              where: {
                senderUserId: { not: auth.userId },
                readAt: null,
              },
            },
          },
        },
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      take: limit + 1,
    });
    const hasMore = threads.length > limit;
    const items = threads.slice(0, limit);
    return NextResponse.json({
      items,
      pageInfo: {
        hasMore,
        nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertTrustedOrigin(request);
    const auth = await requireUser();
    await enforceRateLimit(`message:${auth.userId}`, {
      max: 60,
      windowMs: 60 * 60 * 1000,
    });
    const body = await parseJson(request, createSchema);
    const text = cleanMessage(body.body);
    if (body.threadId) {
      const { thread, message } = await appendMessageToThread({
        threadId: body.threadId,
        actor: auth,
        body: text,
      });
      const recipient = threadRecipient(thread, auth.userId);
      await notify(
        recipient,
        "MESSAGE",
        "New marketplace message",
        text.slice(0, 140),
        `/messages/${thread.id}`,
      );
      return NextResponse.json(
        { success: true, threadId: thread.id, message },
        { status: 201 },
      );
    }

    // Listing-only enquiries use the guarded domain service. Imported source
    // listings have attribution Company rows but no platform seller; those
    // return SELLER_NOT_ON_PLATFORM rather than creating an unreadable thread.
    if (body.listingId && !body.bidId && !body.orderId) {
      const { thread, message } = await createListingMessageThread({
        listingId: body.listingId,
        buyer: auth,
        subject: body.subject,
        body: text,
      });
      await notify(
        thread.sellerUserId,
        "MESSAGE",
        "New marketplace message",
        text.slice(0, 140),
        `/messages/${thread.id}`,
      );
      return NextResponse.json(
        { success: true, threadId: thread.id, message },
        { status: 201 },
      );
    }

    let listingId: string | null = null;
    let bidId = body.bidId ?? null;
    let orderId = body.orderId ?? null;
    let buyerUserId = auth.userId;
    let sellerUserId: string | null = null;
    let sellerCompanyId: string | null = null;

    if (bidId) {
      const bid = await prisma.bid.findFirst({
        where: {
          id: bidId,
          OR: [
            { bidderUserId: auth.userId },
            { sellerUserId: auth.userId },
            ...(auth.companyId ? [{ producerId: auth.companyId }] : []),
          ],
        },
      });
      if (!bid) throw new ApiError(404, "Bid not found.", "BID_NOT_FOUND");
      buyerUserId = bid.bidderUserId;
      sellerUserId = bid.sellerUserId;
      sellerCompanyId = bid.producerId ?? null;
      listingId = bid.listingId;
    } else if (orderId) {
      const order = await prisma.purchaseOrder.findFirst({
        where: {
          id: orderId,
          OR: [
            { buyerUserId: auth.userId },
            ...(auth.companyId
              ? [{ items: { some: { sellerCompanyId: auth.companyId } } }]
              : []),
          ],
        },
        include: { items: { take: 1 } },
      });
      if (!order) throw new ApiError(404, "Order not found.", "ORDER_NOT_FOUND");
      buyerUserId = order.buyerUserId;
      sellerCompanyId = order.items[0]?.sellerCompanyId ?? null;
      sellerUserId = sellerCompanyId
        ? await findActiveSellerUserId(sellerCompanyId)
        : null;
      listingId = order.items[0]?.listingId ?? null;
    } else {
      throw new ApiError(
        422,
        "A listing, bid, or order is required for a new thread.",
        "THREAD_CONTEXT_REQUIRED",
      );
    }
    if (!sellerUserId) {
      throw new ApiError(
        409,
        "This seller is not connected to SymbiOS messaging.",
        "SELLER_NOT_ON_PLATFORM",
      );
    }
    if (auth.userId !== buyerUserId && auth.userId !== sellerUserId) {
      throw new ApiError(403, "You cannot create this thread.", "FORBIDDEN");
    }
    const thread = await prisma.messageThread.create({
      data: {
        listingId,
        bidId,
        orderId,
        buyerUserId,
        sellerUserId,
        sellerCompanyId,
        subject: body.subject?.trim() || "Marketplace enquiry",
        messages: {
          create: { senderUserId: auth.userId, body: text },
        },
      },
      include: { messages: true },
    });
    const recipient = threadRecipient(thread, auth.userId);
    await notify(
      recipient,
      "MESSAGE",
      "New marketplace message",
      text.slice(0, 140),
      `/messages/${thread.id}`,
    );
    return NextResponse.json(
      {
        success: true,
        threadId: thread.id,
        message: thread.messages[0],
      },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
