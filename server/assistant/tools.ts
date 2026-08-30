import { z } from "zod";
import type { ExtendedPrismaClient } from "@/lib/prisma";
import type {
  AssistantCitation,
  AssistantRetrieval,
} from "@/lib/assistant-types";
import { SAFE_CATEGORIES } from "@/lib/listing-constants";
import { publicListingWhere } from "@/server/listings/policy";
import type { PlatformHelpAnswer } from "@/server/assistant/platform-help";
import { assistantListingPreview } from "@/server/assistant/listing-preview";
import type { RagConversationTurn } from "@/server/rag/query";
import { lexicalScore, retrieveKnowledge } from "@/server/rag/query";
import {
  getGenerationProvider,
  type GenerationProvider,
  type GenerationToolDefinition,
} from "@/server/rag/generation";

export const ASSISTANT_READ_TOOL_NAMES = [
  "search_listings",
  "get_listing_details",
  "get_my_orders",
  "get_my_bids",
  "diagnose_my_bid",
  "get_my_messages",
  "get_seller_onboarding_status",
  "get_my_support_tickets",
] as const;

export type AssistantReadToolName = (typeof ASSISTANT_READ_TOOL_NAMES)[number];

interface ToolContext {
  userId: string;
  db: ExtendedPrismaClient;
}

interface ToolRegistration<TSchema extends z.ZodType> {
  declaration: GenerationToolDefinition;
  schema: TSchema;
  execute(
    context: ToolContext,
    input: z.output<TSchema>,
  ): Promise<PlatformHelpAnswer>;
}

interface ErasedToolRegistration {
  declaration: GenerationToolDefinition;
  schema: z.ZodType;
  execute(context: ToolContext, input: unknown): Promise<PlatformHelpAnswer>;
}

function eraseTool<TSchema extends z.ZodType>(
  registration: ToolRegistration<TSchema>,
): ErasedToolRegistration {
  return {
    declaration: registration.declaration,
    schema: registration.schema,
    execute: (context, input) =>
      registration.execute(context, input as z.output<TSchema>),
  };
}

function toolRetrieval(
  toolName: AssistantReadToolName,
  resultCount: number,
): AssistantRetrieval {
  return { mode: "tool", toolName, resultCount };
}

function accountCitation(
  title: string,
  url: string,
  excerpt: string,
): AssistantCitation {
  return {
    id: "S1",
    title,
    url,
    sourceType: "LIVE_ACCOUNT",
    sourceId: null,
    isEvalOnly: false,
    excerpt,
  };
}

function formatMoney(value: number, currency = "INR") {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: Date | null | undefined) {
  return value
    ? new Intl.DateTimeFormat("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(value)
    : "not set";
}

const searchSchema = z
  .object({
    query: z.string().trim().min(2).max(160),
    location: z.string().trim().min(2).max(100).optional(),
    category: z.string().trim().min(2).max(80).optional(),
    maxPrice: z.coerce.number().positive().max(1_000_000_000).optional(),
    minQuantity: z.coerce
      .number()
      .int()
      .positive()
      .max(1_000_000_000)
      .optional(),
    verifiedOnly: z.boolean().optional(),
    limit: z.coerce.number().int().min(1).max(3).default(3),
  })
  .strict();

const stopWords = new Set([
  "available",
  "compare",
  "find",
  "for",
  "from",
  "listings",
  "material",
  "near",
  "need",
  "options",
  "please",
  "scrap",
  "search",
  "show",
  "suppliers",
  "the",
  "with",
]);

function searchTerms(value: string) {
  return [...new Set(value.toLowerCase().split(/[^a-z0-9]+/))]
    .filter((term) => term.length > 2 && !stopWords.has(term))
    .slice(0, 5);
}

function resolvedCategory(value?: string) {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  return SAFE_CATEGORIES.find(
    (category) =>
      category.toLowerCase() === normalized ||
      category.toLowerCase().includes(normalized) ||
      normalized.includes(category.toLowerCase()),
  );
}

const searchListings: ToolRegistration<typeof searchSchema> = {
  declaration: {
    name: "search_listings",
    description:
      "Search the live SymbiOS catalogue when a buyer asks to find, source, compare, or check availability of a material.",
    parametersJsonSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        query: {
          type: "string",
          description:
            "Only the material, grade, or specification being sourced.",
        },
        location: {
          type: "string",
          description: "Optional Indian city or state explicitly requested.",
        },
        category: {
          type: "string",
          description: "Optional marketplace category.",
        },
        maxPrice: {
          type: "number",
          description: "Optional maximum unit price.",
        },
        minQuantity: {
          type: "integer",
          description: "Optional minimum available quantity.",
        },
        verifiedOnly: {
          type: "boolean",
          description:
            "True only when the user explicitly asks for verified sellers.",
        },
        limit: { type: "integer", minimum: 1, maximum: 3 },
      },
      required: ["query"],
    },
  },
  schema: searchSchema,
  async execute({ db }, input) {
    const semantic = await retrieveKnowledge(input.query, 10, {
      corpus: "real_and_eval",
    });
    const semanticListingIds = semantic.chunks
      .filter(
        (chunk) =>
          chunk.document.sourceType === "LISTING" &&
          Boolean(chunk.document.sourceId),
      )
      .map((chunk) => chunk.document.sourceId!)
      .filter((id, index, ids) => ids.indexOf(id) === index);
    const semanticRank = new Map(
      semanticListingIds.map((id, index) => [
        id,
        semanticListingIds.length - index,
      ]),
    );
    const terms = searchTerms(input.query);
    const category = resolvedCategory(input.category);
    const textConditions = terms.flatMap((term) => [
      { title: { contains: term, mode: "insensitive" as const } },
      { description: { contains: term, mode: "insensitive" as const } },
      { subcategory: { contains: term, mode: "insensitive" as const } },
      { material: { name: { contains: term, mode: "insensitive" as const } } },
    ]);
    const listings = await db.marketplaceListing.findMany({
      where: {
        AND: [
          publicListingWhere,
          semanticListingIds.length || textConditions.length
            ? {
                OR: [
                  ...(semanticListingIds.length
                    ? [{ id: { in: semanticListingIds } }]
                    : []),
                  ...textConditions,
                ],
              }
            : {},
          input.location
            ? {
                OR: [
                  { city: { contains: input.location, mode: "insensitive" } },
                  { state: { contains: input.location, mode: "insensitive" } },
                  { area: { contains: input.location, mode: "insensitive" } },
                  {
                    rawLocationText: {
                      contains: input.location,
                      mode: "insensitive",
                    },
                  },
                ],
              }
            : {},
          category ? { category } : {},
          input.maxPrice
            ? { priceMode: "FIXED", pricePerUnit: { lte: input.maxPrice } }
            : {},
          input.minQuantity
            ? { quantityAvailable: { gte: input.minQuantity } }
            : {},
          input.verifiedOnly
            ? {
                sourceType: "seller_submitted",
                seller: {
                  users: {
                    some: { sellerOnboarding: { is: { status: "APPROVED" } } },
                  },
                },
              }
            : {},
        ],
      },
      include: { material: true, seller: true },
      orderBy: { updatedAt: "desc" },
      take: 40,
    });
    const ranked = listings
      .map((listing) => ({
        listing,
        score:
          (semanticRank.get(listing.id) ?? 0) * 2 +
          lexicalScore(
            input.query,
            `${listing.material.name} ${listing.subcategory} ${listing.description}`,
            listing.title,
          ),
      }))
      .sort(
        (left, right) =>
          right.score - left.score ||
          right.listing.updatedAt.getTime() - left.listing.updatedAt.getTime(),
      )
      .slice(0, input.limit)
      .map(({ listing }) => listing);

    if (!ranked.length) {
      return {
        answer: `No current listing matches “${input.query}”${input.location ? ` near ${input.location}` : ""}. Try a broader material name or post an RFQ.`,
        citations: [
          accountCitation(
            "Post an RFQ",
            "/rfq",
            "Create a standing demand when the catalogue has no suitable supply.",
          ),
        ],
        retrieval: toolRetrieval("search_listings", 0),
      };
    }

    const citations = ranked.map((listing, index): AssistantCitation => ({
      id: `S${index + 1}`,
      title: listing.title,
      url: `/products/${listing.id}`,
      sourceType: "LISTING",
      sourceId: listing.id,
      isEvalOnly: listing.isEvalOnly,
      excerpt: `${listing.seller.name} · ${listing.city}, ${listing.state} · ${listing.quantityAvailable} ${listing.unit} available`,
      listing: assistantListingPreview(listing),
    }));
    return {
      answer: `I found ${ranked.length} relevant listing${ranked.length === 1 ? "" : "s"}. Compare price, stock and location below.`,
      citations,
      retrieval: toolRetrieval("search_listings", ranked.length),
    };
  },
};

const listingDetailsSchema = z
  .object({ listingId: z.string().trim().min(1).max(200) })
  .strict();

const getListingDetails: ToolRegistration<typeof listingDetailsSchema> = {
  declaration: {
    name: "get_listing_details",
    description:
      "Load one public listing by its exact listing id or slug when the user asks about that specific listing.",
    parametersJsonSchema: {
      type: "object",
      additionalProperties: false,
      properties: { listingId: { type: "string" } },
      required: ["listingId"],
    },
  },
  schema: listingDetailsSchema,
  async execute({ db }, input) {
    const listing = await db.marketplaceListing.findFirst({
      where: {
        OR: [
          { id: input.listingId },
          { slug: input.listingId },
          { externalId: input.listingId },
        ],
        ...publicListingWhere,
      },
      include: { material: true, seller: true },
    });
    if (!listing) {
      return {
        answer: "That listing is unavailable or no longer public.",
        citations: [],
        retrieval: toolRetrieval("get_listing_details", 0),
      };
    }
    const price =
      listing.priceMode === "ON_REQUEST"
        ? "Price on request"
        : `${formatMoney(listing.pricePerUnit, listing.currency)} per ${listing.unit}`;
    return {
      answer:
        `${listing.title}\n` +
        `- ${price}; MOQ ${listing.minOrderQuantity} ${listing.unit}\n` +
        `- ${listing.quantityAvailable} ${listing.unit} available in ${listing.city}, ${listing.state}\n` +
        `- Lead time: ${listing.leadTimeDays} days`,
      citations: [
        {
          id: "S1",
          title: listing.title,
          url: `/products/${listing.id}`,
          sourceType: "LISTING",
          sourceId: listing.id,
          isEvalOnly: listing.isEvalOnly,
          excerpt: listing.description.slice(0, 240),
          listing: assistantListingPreview(listing),
        },
      ],
      retrieval: toolRetrieval("get_listing_details", 1),
    };
  },
};

const limitSchema = z
  .object({ limit: z.coerce.number().int().min(1).max(3).default(3) })
  .strict();

const getMyOrders: ToolRegistration<typeof limitSchema> = {
  declaration: {
    name: "get_my_orders",
    description:
      "Read the signed-in buyer's latest orders, payment state, totals, and items.",
    parametersJsonSchema: {
      type: "object",
      additionalProperties: false,
      properties: { limit: { type: "integer", minimum: 1, maximum: 3 } },
    },
  },
  schema: limitSchema,
  async execute({ db, userId }, input) {
    const orders = await db.purchaseOrder.findMany({
      where: { buyerUserId: userId },
      include: { items: { take: 1 } },
      orderBy: { createdAt: "desc" },
      take: input.limit,
    });
    return {
      answer: orders.length
        ? `Your latest orders:\n${orders
            .map(
              (order) =>
                `- ${order.orderNumber}: ${order.status.replaceAll("_", " ").toLowerCase()}, ${formatMoney(order.totalAmount, order.currency)}${order.items[0] ? ` — ${order.items[0].title}` : ""}`,
            )
            .join("\n")}`
        : "You have no buyer orders yet.",
      citations: [
        accountCitation(
          "Open buyer orders",
          "/account",
          "Review order, fulfillment, invoice, and address details.",
        ),
      ],
      retrieval: toolRetrieval("get_my_orders", orders.length),
    };
  },
};

const getMyBids: ToolRegistration<typeof limitSchema> = {
  declaration: {
    name: "get_my_bids",
    description:
      "Read the signed-in buyer's latest bids, prices, quantities, status, and expiry.",
    parametersJsonSchema: {
      type: "object",
      additionalProperties: false,
      properties: { limit: { type: "integer", minimum: 1, maximum: 3 } },
    },
  },
  schema: limitSchema,
  async execute({ db, userId }, input) {
    const bids = await db.bid.findMany({
      where: { bidderUserId: userId },
      orderBy: { createdAt: "desc" },
      take: input.limit,
    });
    return {
      answer: bids.length
        ? `Your latest bids:\n${bids
            .map(
              (bid) =>
                `- ${bid.materialName}: ${bid.status.toLowerCase()}, ${bid.quantity} ${bid.unit} at ${formatMoney(bid.pricePerUnit, bid.currency)}/${bid.unit}`,
            )
            .join("\n")}`
        : "You have not placed any bids yet.",
      citations: [
        accountCitation(
          "Open buyer bids",
          "/account",
          "Review, counter, accept, or withdraw eligible bids.",
        ),
      ],
      retrieval: toolRetrieval("get_my_bids", bids.length),
    };
  },
};

const diagnoseBidSchema = z
  .object({ bidId: z.string().trim().min(1).max(200).optional() })
  .strict();

const diagnoseMyBid: ToolRegistration<typeof diagnoseBidSchema> = {
  declaration: {
    name: "diagnose_my_bid",
    description:
      "Inspect the signed-in user's own bid when they ask why it failed, is blocked, expired, or cannot be changed.",
    parametersJsonSchema: {
      type: "object",
      additionalProperties: false,
      properties: { bidId: { type: "string" } },
    },
  },
  schema: diagnoseBidSchema,
  async execute({ db, userId }, input) {
    const bid = await db.bid.findFirst({
      where: {
        bidderUserId: userId,
        ...(input.bidId ? { id: input.bidId } : {}),
      },
      include: { listing: true, reservation: true, order: true },
      orderBy: { updatedAt: "desc" },
    });
    if (!bid) {
      return {
        answer: "I could not find a buyer bid in your account to inspect.",
        citations: [
          accountCitation(
            "Open buyer bids",
            "/account",
            "Review your buyer bids.",
          ),
        ],
        retrieval: toolRetrieval("diagnose_my_bid", 0),
      };
    }
    const reasons: string[] = [];
    if (bid.expiresAt && bid.expiresAt <= new Date())
      reasons.push("the offer expired");
    if (["DECLINED", "WITHDRAWN", "EXPIRED"].includes(bid.status)) {
      reasons.push(`the bid is already ${bid.status.toLowerCase()}`);
    }
    if (!bid.listing)
      reasons.push("the original listing is no longer available");
    else if (!["ACTIVE", "active"].includes(bid.listing.status)) {
      reasons.push(`the listing is ${bid.listing.status.toLowerCase()}`);
    }
    if (bid.order)
      reasons.push(`it already created order ${bid.order.orderNumber}`);
    const diagnosis = reasons.length
      ? `Likely reason: ${reasons.join("; ")}.`
      : `No blocking state is recorded. The bid is ${bid.status.toLowerCase()} and expires ${formatDate(bid.expiresAt)}.`;
    return {
      answer: `${bid.materialName}: ${diagnosis}`,
      citations: [
        accountCitation(
          "Open the diagnosed bid",
          "/account",
          "Review the bid timeline and available actions.",
        ),
      ],
      retrieval: toolRetrieval("diagnose_my_bid", 1),
    };
  },
};

const getMyMessages: ToolRegistration<typeof limitSchema> = {
  declaration: {
    name: "get_my_messages",
    description:
      "Read the signed-in user's latest buyer or seller message threads and last message.",
    parametersJsonSchema: {
      type: "object",
      additionalProperties: false,
      properties: { limit: { type: "integer", minimum: 1, maximum: 3 } },
    },
  },
  schema: limitSchema,
  async execute({ db, userId }, input) {
    const threads = await db.messageThread.findMany({
      where: { OR: [{ buyerUserId: userId }, { sellerUserId: userId }] },
      include: {
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { updatedAt: "desc" },
      take: input.limit,
    });
    return {
      answer: threads.length
        ? `Your latest conversations:\n${threads
            .map(
              (thread) =>
                `- ${thread.subject} — ${thread.status.toLowerCase()}${thread.messages[0] ? `: ${thread.messages[0].body.slice(0, 80)}` : ""}`,
            )
            .join("\n")}`
        : "You have no marketplace conversations yet.",
      citations: [
        accountCitation(
          "Open messages",
          "/account",
          "Read and reply to buyer or seller conversations.",
        ),
      ],
      retrieval: toolRetrieval("get_my_messages", threads.length),
    };
  },
};

const emptySchema = z.object({}).strict();

const getSellerOnboardingStatus: ToolRegistration<typeof emptySchema> = {
  declaration: {
    name: "get_seller_onboarding_status",
    description:
      "Read the signed-in seller's onboarding status, current step, completed sections, and uploaded document kinds.",
    parametersJsonSchema: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
  },
  schema: emptySchema,
  async execute({ db, userId }) {
    const onboarding = await db.sellerOnboarding.findUnique({
      where: { userId },
      include: { documents: { select: { kind: true, status: true } } },
    });
    if (!onboarding) {
      return {
        answer:
          "Seller onboarding has not been started. Open the Seller dashboard to begin.",
        citations: [
          accountCitation(
            "Start seller onboarding",
            "/seller",
            "Complete seller verification before publishing supply.",
          ),
        ],
        retrieval: toolRetrieval("get_seller_onboarding_status", 0),
      };
    }
    const sections = [
      ["Business", onboarding.businessJson],
      ["Tax", onboarding.taxJson],
      ["Bank", onboarding.bankJson],
      ["KYC", onboarding.kycJson],
      ["Warehouse", onboarding.warehouseJson],
      ["Policy", onboarding.policyJson],
    ] as const;
    const missing = sections
      .filter(([, value]) => !value)
      .map(([name]) => name);
    const documentKinds = onboarding.documents
      .filter((document) => document.status === "READY")
      .map((document) => document.kind.replaceAll("_", " "));
    return {
      answer:
        `Onboarding is ${onboarding.status.toLowerCase().replaceAll("_", " ")}. ` +
        `${missing.length ? `Missing sections: ${missing.join(", ")}.` : "All six sections are saved."}` +
        `${documentKinds.length ? ` Uploaded: ${documentKinds.join(", ")}.` : " No documents are ready."}`,
      citations: [
        accountCitation(
          "Continue seller onboarding",
          "/seller",
          "Complete missing sections, documents, and submission.",
        ),
      ],
      retrieval: toolRetrieval("get_seller_onboarding_status", 1),
    };
  },
};

const getMySupportTickets: ToolRegistration<typeof limitSchema> = {
  declaration: {
    name: "get_my_support_tickets",
    description:
      "Read the signed-in user's latest support ticket status and support response.",
    parametersJsonSchema: {
      type: "object",
      additionalProperties: false,
      properties: { limit: { type: "integer", minimum: 1, maximum: 3 } },
    },
  },
  schema: limitSchema,
  async execute({ db, userId }, input) {
    const tickets = await db.supportTicket.findMany({
      where: { requesterId: userId },
      orderBy: { updatedAt: "desc" },
      take: input.limit,
    });
    return {
      answer: tickets.length
        ? `Your latest support cases:\n${tickets
            .map(
              (ticket) =>
                `- ${ticket.ticketNumber}: ${ticket.status.toLowerCase().replaceAll("_", " ")}${ticket.resolutionNote ? ` — ${ticket.resolutionNote.slice(0, 100)}` : ""}`,
            )
            .join("\n")}`
        : "You have no support tickets.",
      citations: [
        accountCitation(
          "Open Support",
          "/support",
          "Track ticket activity and support responses.",
        ),
      ],
      retrieval: toolRetrieval("get_my_support_tickets", tickets.length),
    };
  },
};

const registrations = {
  search_listings: eraseTool(searchListings),
  get_listing_details: eraseTool(getListingDetails),
  get_my_orders: eraseTool(getMyOrders),
  get_my_bids: eraseTool(getMyBids),
  diagnose_my_bid: eraseTool(diagnoseMyBid),
  get_my_messages: eraseTool(getMyMessages),
  get_seller_onboarding_status: eraseTool(getSellerOnboardingStatus),
  get_my_support_tickets: eraseTool(getMySupportTickets),
} satisfies Record<AssistantReadToolName, ErasedToolRegistration>;

export const ASSISTANT_READ_TOOL_DECLARATIONS = Object.values(
  registrations,
).map((registration) => registration.declaration);

function normalized(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9₹]+/g, " ")
    .trim();
}

function numberAfter(value: string, pattern: RegExp) {
  const match = value.match(pattern)?.[1]?.replaceAll(",", "");
  const parsed = match ? Number(match) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function deterministicAssistantToolCall(
  query: string,
): { name: AssistantReadToolName; args: Record<string, unknown> } | null {
  const value = normalized(query);
  if (
    /\b(my|mine|i have|do i have)\b.*\borders?\b|\borders?\b.*\b(my|mine|i have|do i have)\b|\b(latest|recent) order\b/.test(
      value,
    )
  ) {
    return { name: "get_my_orders", args: { limit: 3 } };
  }
  if (
    /\b(my|mine|i have|do i have)\b.*\b(bids?|offers?)\b|\b(bids?|offers?)\b.*\b(my|mine|i have|do i have)\b/.test(
      value,
    ) &&
    !/\b(why|diagnose|issue|problem|failed|blocked|expired|not working)\b/.test(
      value,
    )
  ) {
    return { name: "get_my_bids", args: { limit: 3 } };
  }
  if (
    /\b(my|latest|recent)\b.*\b(messages?|threads?|conversations?)\b/.test(
      value,
    )
  ) {
    return { name: "get_my_messages", args: { limit: 3 } };
  }
  if (
    /\b(my|mine)\b.*\b(support tickets?|support cases?|complaints?)\b/.test(
      value,
    )
  ) {
    return { name: "get_my_support_tickets", args: { limit: 3 } };
  }
  if (
    /\b(my|seller)\b.*\b(onboarding|verification|kyc)\b.*\b(status|progress|missing|complete|left)\b|\bwhat.*missing.*onboarding\b/.test(
      value,
    )
  ) {
    return { name: "get_seller_onboarding_status", args: {} };
  }
  if (
    /\b(why|diagnose|issue|problem|failed|blocked|expired|not working)\b.*\b(my )?(bid|offer)\b|\b(my )?(bid|offer)\b.*\b(failed|blocked|expired|not working)\b/.test(
      value,
    )
  ) {
    return { name: "diagnose_my_bid", args: {} };
  }
  if (
    /\b(find|show|search|source|compare|looking for|need)\b/.test(value) &&
    /\b(scrap|plastic|metal|glass|rubber|paper|cardboard|textile|ash|chemical|hdpe|ldpe|pet|pvc|aluminium|aluminum|copper|steel)\b/.test(
      value,
    )
  ) {
    const location = query.match(
      /\b(?:near|around|in)\s+([A-Za-z][A-Za-z .-]{1,40}?)(?=\s+(?:under|below|within|for|with)|[,.?!]|$)/i,
    )?.[1];
    return {
      name: "search_listings",
      args: {
        query: query
          .replace(
            /\b(?:find|show|search|source|compare|looking for|i need|need)\b/gi,
            " ",
          )
          .replace(
            /\b(?:near|around|in)\s+[A-Za-z][A-Za-z .-]{1,40}?(?=\s+(?:under|below|within|for|with)|[,.?!]|$)/i,
            " ",
          )
          .replace(
            /\b(?:under|below|max(?:imum)?)\s*₹?\s*[0-9,]+(?:\.[0-9]+)?/gi,
            " ",
          )
          .replace(/\s+/g, " ")
          .trim(),
        ...(location ? { location: location.trim() } : {}),
        ...(numberAfter(
          value,
          /\b(?:under|below|max(?:imum)?)\s*₹?\s*([0-9,]+(?:\.[0-9]+)?)/,
        )
          ? {
              maxPrice: numberAfter(
                value,
                /\b(?:under|below|max(?:imum)?)\s*₹?\s*([0-9,]+(?:\.[0-9]+)?)/,
              ),
            }
          : {}),
        verifiedOnly: /\bverified\b/.test(value),
        limit: 3,
      },
    };
  }
  return null;
}

export function isAssistantToolCandidate(query: string) {
  if (deterministicAssistantToolCall(query)) return true;
  return /\b(my|mine|latest|recent|status|track|find|show|search|source|compare|available|missing)\b/.test(
    normalized(query),
  );
}

async function selectToolCall(
  query: string,
  history: RagConversationTurn[],
  provider: GenerationProvider,
) {
  const deterministic = deterministicAssistantToolCall(query);
  if (deterministic) return deterministic;
  if (
    provider.isConfigured() &&
    provider.selectTool &&
    isAssistantToolCandidate(query)
  ) {
    try {
      const selected = await provider.selectTool({
        instructions:
          "Select at most one read-only SymbiOS tool only when live catalogue or signed-in account data is required. Do not call a tool for general how-to questions. Never invent an id. If no tool applies, return a normal response without a function call.",
        prompt: `Recent conversation:\n${JSON.stringify(history.slice(-4))}\n\nCurrent message:\n${query}`,
        tools: ASSISTANT_READ_TOOL_DECLARATIONS,
      });
      if (
        selected &&
        ASSISTANT_READ_TOOL_NAMES.includes(
          selected.name as AssistantReadToolName,
        )
      ) {
        return {
          name: selected.name as AssistantReadToolName,
          args: selected.args,
        };
      }
    } catch (error) {
      console.warn(
        "[assistant] tool selection unavailable:",
        error instanceof Error ? error.message : "unknown provider error",
      );
    }
  }
  return null;
}

export async function answerWithAssistantTool(
  input: {
    userId: string;
    query: string;
    history: RagConversationTurn[];
  },
  db: ExtendedPrismaClient,
  provider: GenerationProvider = getGenerationProvider(),
): Promise<PlatformHelpAnswer | null> {
  const call = await selectToolCall(input.query, input.history, provider);
  if (!call) return null;
  const registration = registrations[call.name];
  const parsed = registration.schema.safeParse(call.args);
  if (!parsed.success) {
    console.warn("[assistant] rejected invalid tool arguments", {
      tool: call.name,
      issues: parsed.error.issues.map((issue) => issue.message),
    });
    const fallback = deterministicAssistantToolCall(input.query);
    if (!fallback) return null;
    const fallbackRegistration = registrations[fallback.name];
    const fallbackParsed = fallbackRegistration.schema.safeParse(fallback.args);
    if (!fallbackParsed.success) return null;
    return fallbackRegistration.execute(
      { userId: input.userId, db },
      fallbackParsed.data,
    );
  }
  return registration.execute({ userId: input.userId, db }, parsed.data);
}
