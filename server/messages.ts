import prisma, { type ExtendedPrismaClient } from "@/lib/prisma";
import type { JWTPayload } from "@/lib/auth";
import { ApiError } from "@/server/http";
import { publicListingWhere } from "@/server/listings/policy";

export function cleanMessage(value: string, max = 4000) {
  const text = value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();
  if (text.length < 2) {
    throw new ApiError(422, "Message body is required.", "MESSAGE_REQUIRED");
  }
  if (text.length > max) {
    throw new ApiError(
      422,
      `Message must be at most ${max} characters.`,
      "MESSAGE_TOO_LONG",
    );
  }
  return text;
}

export async function requireThreadParticipant(
  threadId: string,
  auth: JWTPayload,
  db: ExtendedPrismaClient = prisma,
) {
  const thread = await db.messageThread.findFirst({
    where: {
      id: threadId,
      OR: [
        { buyerUserId: auth.userId },
        { sellerUserId: auth.userId },
        ...(auth.companyId ? [{ sellerCompanyId: auth.companyId }] : []),
      ],
    },
  });
  if (!thread) {
    throw new ApiError(404, "Message thread not found.", "THREAD_NOT_FOUND");
  }
  return thread;
}

/**
 * Resolve the person who can actually answer on behalf of a company.
 *
 * Imported marketplace suppliers can have a Company row for attribution
 * without owning a SymbiOS account. A buyer-only or disabled user is not a
 * substitute for a seller: neither can legitimately receive seller enquiries.
 */
export async function findEligibleSellerUser(
  companyId: string,
  db: ExtendedPrismaClient = prisma,
) {
  return db.user.findFirst({
    where: {
      companyId,
      accountStatus: "ACTIVE",
      role: { in: ["SELLER", "BOTH"] },
      sellerOnboarding: { is: { status: "APPROVED" } },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, email: true },
  });
}

/** Backwards-compatible ID-only resolver for message and order workflows. */
export async function findActiveSellerUserId(
  companyId: string,
  db: ExtendedPrismaClient = prisma,
) {
  return (await findEligibleSellerUser(companyId, db))?.id ?? null;
}

/**
 * Create a buyer enquiry only when there is a real platform seller on the
 * other side. The source URL is returned in the typed error so API clients can
 * offer the honest external route instead of manufacturing a dead inbox.
 */
export async function createListingMessageThread(
  input: {
    listingId: string;
    buyer: JWTPayload;
    subject?: string;
    body: string;
  },
  db: ExtendedPrismaClient = prisma,
) {
  const listing = await db.marketplaceListing.findFirst({
    where: { id: input.listingId, ...publicListingWhere },
    select: {
      id: true,
      listingMode: true,
      verified: true,
      sellerCompanyId: true,
      sourceName: true,
      sourceUrl: true,
    },
  });
  if (!listing) {
    throw new ApiError(404, "Listing not found.", "LISTING_NOT_FOUND");
  }
  if (listing.sellerCompanyId === input.buyer.companyId) {
    throw new ApiError(
      409,
      "Use an existing buyer thread for your own listing.",
      "SELF_THREAD",
    );
  }

  if (listing.listingMode !== "MANAGED" || !listing.verified) {
    throw new ApiError(
      409,
      listing.listingMode === "EVAL"
        ? "Synthetic demo listings cannot receive messages."
        : "This external supplier is not connected to SymbiOS messaging. Use the original source listing to contact them.",
      "SELLER_NOT_ON_PLATFORM",
      {
        sourceName: listing.sourceName,
        sourceUrl: listing.sourceUrl,
      },
    );
  }

  const sellerUserId = await findActiveSellerUserId(
    listing.sellerCompanyId,
    db,
  );
  if (!sellerUserId) {
    throw new ApiError(
      409,
      "This supplier is not connected to SymbiOS messaging. Use the original source listing to contact them.",
      "SELLER_NOT_ON_PLATFORM",
      {
        sourceName: listing.sourceName,
        sourceUrl: listing.sourceUrl,
      },
    );
  }

  const text = cleanMessage(input.body);
  const thread = await db.messageThread.create({
    data: {
      listingId: listing.id,
      buyerUserId: input.buyer.userId,
      sellerUserId,
      sellerCompanyId: listing.sellerCompanyId,
      subject: input.subject?.trim() || "Marketplace enquiry",
      messages: {
        create: { senderUserId: input.buyer.userId, body: text },
      },
    },
    include: { messages: true },
  });

  return { thread, message: thread.messages[0] };
}

/** Append a reply and touch the thread atomically so inbox ordering is stable. */
export async function appendMessageToThread(
  input: { threadId: string; actor: JWTPayload; body: string },
  db: ExtendedPrismaClient = prisma,
) {
  const thread = await requireThreadParticipant(input.threadId, input.actor, db);
  if (thread.status !== "OPEN") {
    throw new ApiError(
      409,
      "Reopen the thread before replying.",
      "THREAD_NOT_OPEN",
    );
  }
  const text = cleanMessage(input.body);
  const message = await db.$transaction(async (tx) => {
    const created = await tx.message.create({
      data: {
        threadId: thread.id,
        senderUserId: input.actor.userId,
        body: text,
      },
    });
    await tx.messageThread.update({
      where: { id: thread.id },
      data: { updatedAt: new Date() },
    });
    return created;
  });

  return { thread, message };
}

export function threadRecipient(
  thread: {
    buyerUserId: string;
    sellerUserId: string | null;
  },
  actorUserId: string,
) {
  return thread.buyerUserId === actorUserId
    ? thread.sellerUserId
    : thread.buyerUserId;
}
