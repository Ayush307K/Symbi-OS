import "dotenv/config";
import { createPrismaClient } from "@/lib/prisma";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  askMarketplaceAssistant,
  assistantConversationTitle,
  cleanAssistantQuery,
  getAssistantConversation,
  listAssistantConversations,
} from "@/server/assistant";
import {
  ASSISTANT_RESOLUTION,
  ASSISTANT_TOPIC_IDS,
  ASSISTANT_TOPICS,
  assistantTopicContext,
} from "@/lib/assistant-guidance";
import {
  contextualRetrievalQuery,
  type RagAnswerOptions,
} from "@/server/rag/query";
import { answerPlatformHelp } from "@/server/assistant/platform-help";
import { assistantListingPreview } from "@/server/assistant/listing-preview";
import { isAccountHelpQuestion } from "@/server/assistant/account-help";
import { isSupportEscalationQuery } from "@/server/assistant/support";
import {
  answerWithAssistantTool,
  deterministicAssistantToolCall,
} from "@/server/assistant/tools";
import type { GenerationProvider } from "@/server/rag/generation";

describe("assistant query shaping", () => {
  it("normalizes questions and creates bounded conversation titles", () => {
    expect(cleanAssistantQuery("  Find   HDPE\nnear Pune  ")).toBe(
      "Find HDPE near Pune",
    );
    expect(assistantConversationTitle("x".repeat(100))).toHaveLength(62);
    expect(() => cleanAssistantQuery("no")).toThrowError(
      "Ask a marketplace question",
    );
  });

  it("uses recent user questions, never assistant prose, for follow-up retrieval", () => {
    const query = contextualRetrievalQuery("Which is cheapest?", [
      { role: "USER", content: "Show me PET bottle scrap" },
      { role: "ASSISTANT", content: "A previous generated answer" },
    ]);
    expect(query).toContain("Show me PET bottle scrap");
    expect(query).toContain("Which is cheapest?");
    expect(query).not.toContain("previous generated answer");
  });

  it("defines complete, unique guided help topics with actionable replies", () => {
    expect(ASSISTANT_TOPICS.map((topic) => topic.id)).toEqual(
      ASSISTANT_TOPIC_IDS,
    );
    expect(new Set(ASSISTANT_TOPICS.map((topic) => topic.label)).size).toBe(
      ASSISTANT_TOPICS.length,
    );
    for (const topic of ASSISTANT_TOPICS) {
      expect(topic.followUp.length).toBeGreaterThan(10);
      expect(topic.quickReplies).toHaveLength(3);
      expect(topic.quickReplies.every((reply) => reply.query.length >= 3)).toBe(
        true,
      );
      expect(assistantTopicContext(topic.id)).toContain(topic.label);
    }
  });

  it("defines a concise, deterministic post-resolution choice", () => {
    expect(ASSISTANT_RESOLUTION.question).toBe(
      "Can I help with anything else?",
    );
    expect(ASSISTANT_RESOLUTION.continueLabel).toMatch(/^Yes/);
    expect(ASSISTANT_RESOLUTION.finishLabel).toMatch(/^No/);
    expect(ASSISTANT_RESOLUTION.completedMessage.split(/\s+/)).toHaveLength(11);
  });
});

describe("assistant platform help", () => {
  it.each([
    "How do I place a bid?",
    "Where can I make an offer on a listing?",
    "Can I submit a bid to the seller?",
  ])(
    "answers bidding workflow questions without catalogue retrieval: %s",
    (query) => {
      expect(answerPlatformHelp(query)).toMatchObject({
        retrieval: { mode: "platform", resultCount: 3 },
        citations: [
          { sourceType: "PLATFORM_GUIDE", url: "/" },
          { sourceType: "PLATFORM_GUIDE", url: "/account" },
          { sourceType: "PLATFORM_GUIDE", url: "/seller" },
        ],
      });
      expect(answerPlatformHelp(query)?.answer).toContain("Select Place a bid");
    },
  );

  it.each([
    ["hello", "search and compare listings"],
    ["How do I checkout and pay?", "Payments are sandbox-only"],
    ["How can I message the seller?", "Messages tab"],
    ["How do I post an RFQ?", "Use Post RFQ"],
    ["How do I complete seller verification?", "Complete Business"],
    ["How do I create a listing?", "choose New listing"],
    ["Why am I seeing these recommendations?", "Your feed ranks"],
    ["How does location distance work?", "Indian pincode"],
    ["Where are my saved listings?", "Account → Saved"],
    ["Who can leave a review?", "fulfilled or delivered purchase"],
    ["I forgot my password", "Forgot password"],
    ["Is e-waste prohibited?", "Radioactive, biomedical"],
    ["What is an imported TradeIndia listing?", "External source"],
  ])("answers a supported SymbiOS workflow: %s", (query, expected) => {
    const result = answerPlatformHelp(query);
    expect(result?.retrieval.mode).toBe("platform");
    expect(result?.answer).toContain(expected);
    expect(result?.citations.length).toBeGreaterThan(0);
  });

  it("leaves catalogue sourcing questions to RAG", () => {
    expect(
      answerPlatformHelp("Find HDPE scrap suppliers near Pune"),
    ).toBeNull();
    expect(answerPlatformHelp("Can I buy HDPE scrap in Pune?")).toBeNull();
  });

  it.each([
    "How many orders do I have?",
    "What is in my cart?",
    "Show my saved listings",
    "Do I have unread notifications?",
    "How many seller listings are in my account?",
  ])("recognizes authenticated account-data questions: %s", (query) => {
    expect(isAccountHelpQuestion(query)).toBe(true);
  });

  it("does not treat general workflow or catalogue queries as account data", () => {
    expect(isAccountHelpQuestion("How do I place an order?")).toBe(false);
    expect(isAccountHelpQuestion("Find PET bottle scrap")).toBe(false);
  });

  it("responds to a missing KYC constraint instead of repeating onboarding", () => {
    const result = answerPlatformHelp("I don't have KYC details", [
      { role: "USER", content: "How do I complete seller onboarding?" },
      {
        role: "ASSISTANT",
        content: "Complete the six onboarding sections including KYC.",
      },
    ]);
    expect(result?.answer).toContain("KYC cannot be skipped");
    expect(result?.answer).toContain("fictional values");
    expect(result?.answer.split(/\s+/).length).toBeLessThanOrEqual(70);
  });

  it("troubleshoots a failed bid before escalating it", () => {
    const result = answerPlatformHelp("Placing a bid still doesn't work", [
      { role: "USER", content: "How do I place a bid?" },
      { role: "ASSISTANT", content: "Open a listing and select Place a bid." },
    ]);
    expect(result?.answer).toContain("Check these before retrying");
    expect(result?.answer).toContain("exact error");
    expect(result?.retrieval.mode).toBe("platform");
  });

  it.each([
    "Create a support ticket for this",
    "I want to talk to a human agent",
    "Checkout is still not working",
  ])("recognizes a support escalation: %s", (query) => {
    expect(isSupportEscalationQuery(query)).toBe(true);
  });
});

describe("assistant read-only tools", () => {
  it("builds a structured listing preview for table-row rendering", () => {
    expect(
      assistantListingPreview({
        listingMode: "MANAGED",
        material: { name: "HDPE regrind" },
        seller: { name: "Circular Polymers" },
        city: "Pune",
        state: "Maharashtra",
        quantityAvailable: 120,
        unit: "ton",
        priceMode: "FIXED",
        pricePerUnit: 54,
        currency: "INR",
        minOrderQuantity: 5,
        imageUrl: "https://example.test/hdpe.jpg",
        sourceType: "seller_submitted",
        verified: true,
      }),
    ).toEqual({
      listingMode: "MANAGED",
      materialName: "HDPE regrind",
      sellerName: "Circular Polymers",
      location: "Pune, Maharashtra",
      quantityAvailable: 120,
      unit: "ton",
      priceMode: "FIXED",
      pricePerUnit: 54,
      priceBasisUnit: "ton",
      currency: "INR",
      minOrderQuantity: 5,
      imageUrl: "https://example.test/hdpe.jpg",
      verified: true,
    });
  });

  it.each([
    ["Show my latest orders", "get_my_orders"],
    ["How many bids do I have?", "get_my_bids"],
    ["Show my recent messages", "get_my_messages"],
    [
      "What is missing from my seller onboarding?",
      "get_seller_onboarding_status",
    ],
    ["Why is my bid blocked?", "diagnose_my_bid"],
  ])("routes live-data intent: %s", (query, expectedTool) => {
    expect(deterministicAssistantToolCall(query)?.name).toBe(expectedTool);
  });

  it("extracts bounded catalogue filters", () => {
    expect(
      deterministicAssistantToolCall(
        "Find verified HDPE scrap near Pune under ₹55",
      ),
    ).toEqual({
      name: "search_listings",
      args: {
        query: "verified HDPE scrap",
        location: "Pune",
        maxPrice: 55,
        verifiedOnly: true,
        limit: 3,
      },
    });
  });
});

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  "postgresql://symbi:symbi_local_dev@localhost:5432/symbi_dev";
const prisma = createPrismaClient({ datasourceUrl: TEST_DATABASE_URL });
const databaseReachable: boolean = await prisma.$queryRaw`SELECT 1`
  .then(() => true)
  .catch(() => false);
const suffix = Math.random().toString(36).slice(2, 10);
const userId = `assistant_user_${suffix}`;
const otherUserId = `assistant_other_${suffix}`;

async function cleanup() {
  await prisma.assistantConversation.deleteMany({
    where: { userId: { in: [userId, otherUserId] } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: [userId, otherUserId] } },
  });
}

describe.skipIf(!databaseReachable)(
  "assistant conversation integration",
  () => {
    beforeAll(async () => {
      await cleanup();
      await prisma.user.createMany({
        data: [
          {
            id: userId,
            email: `assistant-${suffix}@test.invalid`,
            passwordHash: "not-a-real-hash",
            role: "BUYER",
            companyName: `Assistant Buyer ${suffix}`,
          },
          {
            id: otherUserId,
            email: `assistant-other-${suffix}@test.invalid`,
            passwordHash: "not-a-real-hash",
            role: "BUYER",
            companyName: `Other Assistant Buyer ${suffix}`,
          },
        ],
      });
    });

    afterAll(async () => {
      await cleanup();
      await prisma.$disconnect();
    });

    it("persists a grounded turn and reuses only user context for a follow-up", async () => {
      const answerer = vi.fn(
        async (query: string, _topK: number, _options: RagAnswerOptions) => ({
          answer: `Grounded answer for ${query} [S1]`,
          citations: [
            {
              id: "S1",
              title: "HDPE regrind",
              url: "https://example.com/hdpe",
              sourceType: "LISTING",
              sourceId: "listing-hdpe",
              isEvalOnly: false,
              excerpt: "HDPE listing fixture",
            },
          ],
          retrieval: { mode: "hybrid" as const, resultCount: 1 },
        }),
      );

      const opened = await askMarketplaceAssistant(
        { userId, query: "What grades of HDPE regrind are described?" },
        { db: prisma, answerer },
      );
      expect(opened.userMessage.role).toBe("USER");
      expect(opened.assistantMessage).toMatchObject({
        role: "ASSISTANT",
        citations: [{ id: "S1", sourceId: "listing-hdpe" }],
        retrieval: { mode: "hybrid", resultCount: 1 },
      });

      await askMarketplaceAssistant(
        {
          userId,
          conversationId: opened.conversation.id,
          query: "Which one has the lowest MOQ?",
        },
        { db: prisma, answerer },
      );
      const secondOptions = answerer.mock.calls[1]?.[2];
      expect(secondOptions?.retrievalQuery).toContain(
        "What grades of HDPE regrind are described?",
      );
      expect(secondOptions?.retrievalQuery).toContain(
        "Which one has the lowest MOQ?",
      );
      expect(secondOptions?.retrievalQuery).not.toContain(
        "Grounded answer for",
      );

      const saved = await getAssistantConversation(
        userId,
        opened.conversation.id,
        prisma,
      );
      expect(saved.messages.map((message) => message.role)).toEqual([
        "USER",
        "ASSISTANT",
        "USER",
        "ASSISTANT",
      ]);
      await expect(
        listAssistantConversations(userId, prisma),
      ).resolves.toMatchObject([
        { id: opened.conversation.id, lastMessage: { role: "ASSISTANT" } },
      ]);
    });

    it("uses the selected help topic as retrieval context without saving it as a fake user message", async () => {
      const answerer = vi.fn(
        async (_query: string, _topK: number, _options: RagAnswerOptions) => ({
          answer: "Grounded PET result [S1]",
          citations: [],
          retrieval: { mode: "hybrid" as const, resultCount: 0 },
        }),
      );

      const result = await askMarketplaceAssistant(
        {
          userId,
          topic: "catalogue",
          query: "PET flakes near Pune",
        },
        { db: prisma, answerer },
      );

      const options = answerer.mock.calls[0]?.[2];
      expect(options?.retrievalQuery).toContain("Selected help area");
      expect(options?.retrievalQuery).toContain("Find materials");

      const saved = await getAssistantConversation(
        userId,
        result.conversation.id,
        prisma,
      );
      expect(saved.messages.map((message) => message.content)).toEqual([
        "PET flakes near Pune",
        "Grounded PET result [S1]",
      ]);
    });

    it("persists product help without calling catalogue RAG", async () => {
      const answerer = vi.fn();
      const result = await askMarketplaceAssistant(
        { userId, query: "How do I place a bid?" },
        { db: prisma, answerer },
      );

      expect(answerer).not.toHaveBeenCalled();
      expect(result.assistantMessage).toMatchObject({
        retrieval: { mode: "platform", resultCount: 3 },
      });
      expect(result.assistantMessage.citations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ sourceType: "PLATFORM_GUIDE" }),
        ]),
      );
      expect(result.assistantMessage.content).toContain("Select Place a bid");
    });

    it("uses conversation context for a missing KYC follow-up", async () => {
      const answerer = vi.fn();
      const opened = await askMarketplaceAssistant(
        { userId, query: "How do I complete seller onboarding?" },
        { db: prisma, answerer },
      );
      const followedUp = await askMarketplaceAssistant(
        {
          userId,
          conversationId: opened.conversation.id,
          query: "I don't have KYC details",
        },
        { db: prisma, answerer },
      );

      expect(answerer).not.toHaveBeenCalled();
      expect(followedUp.assistantMessage.content).toContain(
        "KYC cannot be skipped",
      );
      expect(followedUp.assistantMessage.content).not.toBe(
        opened.assistantMessage.content,
      );
    });

    it("answers live account questions through a read-only tool", async () => {
      const answerer = vi.fn();
      const result = await askMarketplaceAssistant(
        { userId, query: "Show my latest orders" },
        { db: prisma, answerer },
      );

      expect(answerer).not.toHaveBeenCalled();
      expect(result.assistantMessage).toMatchObject({
        retrieval: {
          mode: "tool",
          toolName: "get_my_orders",
          resultCount: 0,
        },
        citations: [{ sourceType: "LIVE_ACCOUNT", url: "/account" }],
      });
      expect(result.assistantMessage.content).toContain("no buyer orders");
    });

    it("executes a provider-selected tool but never provider-written account facts", async () => {
      const provider: GenerationProvider = {
        name: "fixture",
        model: "fixture",
        isConfigured: () => true,
        generate: vi.fn(async () => "not used"),
        selectTool: vi.fn(async () => ({
          name: "get_my_orders",
          args: { limit: 1 },
        })),
      };
      const result = await answerWithAssistantTool(
        { userId, query: "What happened with my purchases?", history: [] },
        prisma,
        provider,
      );

      expect(provider.selectTool).toHaveBeenCalledOnce();
      expect(provider.generate).not.toHaveBeenCalled();
      expect(result?.retrieval).toMatchObject({
        mode: "tool",
        toolName: "get_my_orders",
      });
    });

    it("creates one support ticket and appends repeated complaint context", async () => {
      const answerer = vi.fn();
      const opened = await askMarketplaceAssistant(
        {
          userId,
          query: "Create a support ticket because checkout keeps failing",
        },
        { db: prisma, answerer },
      );

      expect(answerer).not.toHaveBeenCalled();
      expect(opened.assistantMessage).toMatchObject({
        retrieval: { mode: "support", resultCount: 1 },
        citations: [{ sourceType: "SUPPORT_TICKET" }],
      });
      const ticket = await prisma.supportTicket.findFirstOrThrow({
        where: { requesterId: userId, category: "ORDER_PAYMENT" },
        include: { events: true },
      });
      expect(ticket.conversationId).toBe(opened.conversation.id);
      expect(ticket.events).toHaveLength(1);

      const followedUp = await askMarketplaceAssistant(
        {
          userId,
          conversationId: opened.conversation.id,
          query: "It is still not working after retrying",
        },
        { db: prisma, answerer },
      );
      expect(followedUp.assistantMessage.content).toContain(
        "open support ticket",
      );
      expect(
        await prisma.supportTicket.count({ where: { requesterId: userId } }),
      ).toBe(1);
      expect(
        await prisma.supportTicketEvent.count({
          where: { ticketId: ticket.id },
        }),
      ).toBe(2);
    });

    it("does not expose one buyer's conversation to another buyer", async () => {
      const conversation = await prisma.assistantConversation.findFirstOrThrow({
        where: { userId },
      });
      await expect(
        getAssistantConversation(otherUserId, conversation.id, prisma),
      ).rejects.toMatchObject({
        status: 404,
        code: "ASSISTANT_CONVERSATION_NOT_FOUND",
      });
    });
  },
);
