import type { ExtendedPrismaClient } from "@/lib/prisma";
import type { AssistantCitation } from "@/lib/assistant-types";
import type { PlatformHelpAnswer } from "@/server/assistant/platform-help";

type AccountMetric =
  | "orders"
  | "bids"
  | "cart"
  | "saved"
  | "messages"
  | "notifications"
  | "addresses"
  | "support"
  | "listings"
  | "incoming-bids";

function normalizedQuery(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function accountMetric(query: string): AccountMetric | null {
  const value = normalizedQuery(query);
  const asksForOwnData =
    /\b(my|mine|i have|do i have|for me|account)\b/.test(value) ||
    /\bhow many\b/.test(value);
  if (!asksForOwnData) return null;
  if (/\b(incoming|seller) bids?\b/.test(value)) return "incoming-bids";
  if (/\b(support tickets?|support cases?|complaints?)\b/.test(value)) return "support";
  if (/\bsaved|wishlist|wish list|favorites?\b/.test(value)) return "saved";
  if (/\b(?:my |seller )?listings?\b/.test(value)) return "listings";
  if (/\borders?\b/.test(value)) return "orders";
  if (/\bbids?|offers?\b/.test(value)) return "bids";
  if (/\bcart\b/.test(value)) return "cart";
  if (/\bmessages?|threads?|conversations?\b/.test(value)) return "messages";
  if (/\bnotifications?|alerts?\b/.test(value)) return "notifications";
  if (/\baddresses?|warehouses?\b/.test(value)) return "addresses";
  return null;
}

export function isAccountHelpQuestion(query: string) {
  return accountMetric(query) !== null;
}

function accountCitation(path: "/account" | "/seller" | "/support"): AssistantCitation {
  return {
    id: "S1",
    title:
      path === "/seller"
        ? "Open Seller dashboard"
        : path === "/support"
          ? "Open Support"
          : "Open your account",
    url: path,
    sourceType: "ACCOUNT_DATA",
    sourceId: null,
    isEvalOnly: false,
    excerpt:
      path === "/seller"
        ? "View current seller listings, bids, orders, reviews, and messages."
        : path === "/support"
          ? "Track support ticket status and read the support team response."
        : "View current buyer orders, bids, cart, saved listings, addresses, and messages.",
  };
}

function resolved(
  answer: string,
  path: "/account" | "/seller" | "/support",
): PlatformHelpAnswer {
  return {
    answer,
    citations: [accountCitation(path)],
    retrieval: { mode: "account", resultCount: 1 },
  };
}

/** Resolve authenticated, user-specific summary questions without an LLM. */
export async function answerAccountHelp(
  userId: string,
  query: string,
  db: ExtendedPrismaClient,
): Promise<PlatformHelpAnswer | null> {
  const metric = accountMetric(query);
  if (!metric) return null;

  if (metric === "orders") {
    const [total, active] = await Promise.all([
      db.purchaseOrder.count({ where: { buyerUserId: userId } }),
      db.purchaseOrder.count({
        where: {
          buyerUserId: userId,
          status: { in: ["AWAITING_BUYER_CONFIRMATION", "CONFIRMED", "PROCESSING"] },
        },
      }),
    ]);
    return resolved(
      `You have ${total} buyer order${total === 1 ? "" : "s"}, including ${active} currently awaiting confirmation or in progress. Open Account → Orders for order, fulfillment, address, and invoice details.`,
      "/account",
    );
  }

  if (metric === "bids") {
    const [total, active] = await Promise.all([
      db.bid.count({ where: { bidderUserId: userId } }),
      db.bid.count({
        where: { bidderUserId: userId, status: { in: ["PENDING", "COUNTERED"] } },
      }),
    ]);
    return resolved(
      `You have ${total} buyer bid${total === 1 ? "" : "s"}; ${active} ${active === 1 ? "is" : "are"} currently pending or countered. Open Account → Bids to review or respond.`,
      "/account",
    );
  }

  if (metric === "cart") {
    const items = await db.cartItem.findMany({
      where: { userId },
      select: { quantity: true, priceSnapshot: true },
    });
    const total = items.reduce(
      (sum, item) => sum + item.quantity * item.priceSnapshot,
      0,
    );
    const formatted = new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(total);
    return resolved(
      `Your cart contains ${items.length} item${items.length === 1 ? "" : "s"} with a saved-price subtotal of ${formatted}. Checkout recalculates availability, fees, shipping, and the final total.`,
      "/account",
    );
  }

  if (metric === "saved") {
    const total = await db.wishlistItem.count({ where: { userId } });
    return resolved(
      `You have ${total} saved listing${total === 1 ? "" : "s"}. Open Account → Saved to review them. Saving does not reserve stock or lock a price.`,
      "/account",
    );
  }

  if (metric === "messages") {
    const where = { OR: [{ buyerUserId: userId }, { sellerUserId: userId }] };
    const [total, open] = await Promise.all([
      db.messageThread.count({ where }),
      db.messageThread.count({ where: { ...where, status: "OPEN" } }),
    ]);
    return resolved(
      `You have ${total} message thread${total === 1 ? "" : "s"}, with ${open} currently open. Open Account → Messages or Seller dashboard → Messages to reply.`,
      "/account",
    );
  }

  if (metric === "notifications") {
    const [total, unread] = await Promise.all([
      db.notification.count({ where: { userId } }),
      db.notification.count({ where: { userId, readAt: null } }),
    ]);
    return resolved(
      `You have ${total} notification${total === 1 ? "" : "s"}, including ${unread} unread. Recent notifications appear in your account overview.`,
      "/account",
    );
  }

  if (metric === "addresses") {
    const total = await db.address.count({ where: { userId } });
    return resolved(
      `You have ${total} saved address${total === 1 ? "" : "es"}. Manage them under Account → Addresses or add one during checkout.`,
      "/account",
    );
  }

  if (metric === "support") {
    const tickets = await db.supportTicket.findMany({
      where: { requesterId: userId },
      orderBy: { updatedAt: "desc" },
      take: 50,
    });
    const open = tickets.filter((ticket) =>
      ["OPEN", "IN_PROGRESS", "WAITING_ON_USER"].includes(ticket.status),
    ).length;
    const latest = tickets[0];
    return resolved(
      latest
        ? `You have ${tickets.length} support ticket${tickets.length === 1 ? "" : "s"}, with ${open} still open. The latest is ${latest.ticketNumber} (${latest.status.toLowerCase().replaceAll("_", " ")}).${latest.resolutionNote ? ` Support replied: ${latest.resolutionNote}` : " No support response has been posted yet."}`
        : "You do not have any support tickets yet. Ask me to create one if a SymbiOS issue cannot be resolved in chat.",
      "/support",
    );
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { companyId: true },
  });
  if (!user?.companyId) {
    return resolved(
      "Your account is not connected to a seller company yet. Complete seller onboarding before managing seller listings or incoming bids.",
      "/seller",
    );
  }

  if (metric === "listings") {
    const [total, active] = await Promise.all([
      db.marketplaceListing.count({ where: { sellerCompanyId: user.companyId } }),
      db.marketplaceListing.count({
        where: {
          sellerCompanyId: user.companyId,
          status: { in: ["ACTIVE", "active"] },
        },
      }),
    ]);
    return resolved(
      `Your seller company has ${total} listing${total === 1 ? "" : "s"}, with ${active} currently active. Open Seller dashboard → Listings to manage them.`,
      "/seller",
    );
  }

  const [total, active] = await Promise.all([
    db.bid.count({ where: { producerId: user.companyId } }),
    db.bid.count({
      where: {
        producerId: user.companyId,
        status: { in: ["PENDING", "COUNTERED"] },
      },
    }),
  ]);
  return resolved(
    `Your seller company has received ${total} bid${total === 1 ? "" : "s"}; ${active} ${active === 1 ? "is" : "are"} pending or countered. Open Seller dashboard → Bids to respond.`,
    "/seller",
  );
}
