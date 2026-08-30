import { Prisma } from "@prisma/client";
import {
  assistantTopicContext,
  type AssistantTopicId,
} from "@/lib/assistant-guidance";
import prisma, { type ExtendedPrismaClient } from "@/lib/prisma";
import type {
  AssistantCitation,
  AssistantConversationSummary,
  AssistantMessageDto,
  AssistantRetrieval,
} from "@/lib/assistant-types";
import { ApiError } from "@/server/http";
import { answerAccountHelp } from "@/server/assistant/account-help";
import { contextualizeHelpAnswer } from "@/server/assistant/help-generation";
import { assistantListingPreview } from "@/server/assistant/listing-preview";
import { answerPlatformHelp } from "@/server/assistant/platform-help";
import { prepareSupportEscalation } from "@/server/assistant/support";
import { answerWithAssistantTool } from "@/server/assistant/tools";
import { publicListingWhere } from "@/server/listings/policy";
import {
  answerWithRag,
  contextualRetrievalQuery,
  type RagAnswerOptions,
  type RagConversationTurn,
} from "@/server/rag/query";

const HISTORY_TURNS = 6;

export function cleanAssistantQuery(value: string) {
  const query = value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (query.length < 3) {
    throw new ApiError(
      422,
      "Ask a marketplace question using at least 3 characters.",
      "ASSISTANT_QUERY_REQUIRED",
    );
  }
  if (query.length > 1000) {
    throw new ApiError(
      422,
      "Assistant questions must be at most 1000 characters.",
      "ASSISTANT_QUERY_TOO_LONG",
    );
  }
  return query;
}

export function assistantConversationTitle(query: string) {
  const clean = cleanAssistantQuery(query);
  return clean.length <= 64 ? clean : `${clean.slice(0, 61).trimEnd()}…`;
}

function citationsFromJson(value: Prisma.JsonValue): AssistantCitation[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item) =>
      item !== null &&
      !Array.isArray(item) &&
      typeof item === "object" &&
      "id" in item &&
      "title" in item,
  ) as unknown as AssistantCitation[];
}

function retrievalFromJson(value: Prisma.JsonValue): AssistantRetrieval | null {
  if (!value || Array.isArray(value) || typeof value !== "object") return null;
  if (
    !("mode" in value) ||
    (value.mode !== "hybrid" &&
      value.mode !== "lexical" &&
      value.mode !== "platform" &&
      value.mode !== "account" &&
      value.mode !== "support" &&
      value.mode !== "tool") ||
    !("resultCount" in value) ||
    typeof value.resultCount !== "number"
  ) {
    return null;
  }
  return {
    mode: value.mode,
    resultCount: value.resultCount,
    ...(value.degraded === true ? { degraded: true } : {}),
    ...(typeof value.toolName === "string" ? { toolName: value.toolName } : {}),
  };
}

export function assistantMessageDto(message: {
  id: string;
  role: string;
  content: string;
  citationsJson: Prisma.JsonValue;
  retrievalJson: Prisma.JsonValue;
  createdAt: Date;
}): AssistantMessageDto {
  return {
    id: message.id,
    role: message.role === "USER" ? "USER" : "ASSISTANT",
    content: message.content,
    citations: citationsFromJson(message.citationsJson),
    retrieval: retrievalFromJson(message.retrievalJson),
    createdAt: message.createdAt.toISOString(),
  };
}

async function hydrateListingCitations(
  messages: AssistantMessageDto[],
  db: ExtendedPrismaClient,
) {
  const listingIds = [
    ...new Set(
      messages.flatMap((message) =>
        message.citations
          .filter(
            (citation) =>
              citation.sourceType === "LISTING" && Boolean(citation.sourceId),
          )
          .map((citation) => citation.sourceId!),
      ),
    ),
  ];
  if (!listingIds.length) return messages;

  const listings = await db.marketplaceListing.findMany({
    where: { id: { in: listingIds }, ...publicListingWhere },
    include: { material: true, seller: true },
  });
  const listingById = new Map(
    listings.map((listing) => [listing.id, assistantListingPreview(listing)]),
  );
  return messages.map((message) => ({
    ...message,
    citations: message.citations.map((citation) => {
      const listing = citation.sourceId
        ? listingById.get(citation.sourceId)
        : null;
      return listing ? { ...citation, listing } : citation;
    }),
  }));
}

export async function listAssistantConversations(
  userId: string,
  db: ExtendedPrismaClient = prisma,
): Promise<AssistantConversationSummary[]> {
  const conversations = await db.assistantConversation.findMany({
    where: { userId, status: "ACTIVE" },
    include: {
      messages: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 1,
      },
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: 20,
  });
  return conversations.map((conversation) => {
    const last = conversation.messages[0];
    return {
      id: conversation.id,
      title: conversation.title,
      createdAt: conversation.createdAt.toISOString(),
      updatedAt: conversation.updatedAt.toISOString(),
      lastMessage: last
        ? {
            id: last.id,
            role: last.role === "USER" ? "USER" : "ASSISTANT",
            content: last.content,
            createdAt: last.createdAt.toISOString(),
          }
        : null,
    };
  });
}

export async function getAssistantConversation(
  userId: string,
  conversationId: string,
  db: ExtendedPrismaClient = prisma,
) {
  const conversation = await db.assistantConversation.findFirst({
    where: { id: conversationId, userId, status: "ACTIVE" },
    include: {
      messages: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 100,
      },
    },
  });
  if (!conversation) {
    throw new ApiError(
      404,
      "Assistant conversation not found.",
      "ASSISTANT_CONVERSATION_NOT_FOUND",
    );
  }
  const messages = await hydrateListingCitations(
    conversation.messages.slice().reverse().map(assistantMessageDto),
    db,
  );
  return {
    conversation: {
      id: conversation.id,
      title: conversation.title,
      createdAt: conversation.createdAt.toISOString(),
      updatedAt: conversation.updatedAt.toISOString(),
    },
    messages,
  };
}

type RagAnswer = Awaited<ReturnType<typeof answerWithRag>>;
type AssistantAnswerer = (
  query: string,
  topK: number,
  options: RagAnswerOptions,
) => Promise<Pick<RagAnswer, "answer" | "citations" | "retrieval">>;

export async function askMarketplaceAssistant(
  input: {
    userId: string;
    conversationId?: string;
    query: string;
    topic?: AssistantTopicId;
  },
  dependencies: {
    db?: ExtendedPrismaClient;
    answerer?: AssistantAnswerer;
  } = {},
) {
  const db = dependencies.db ?? prisma;
  const answerer = dependencies.answerer ?? answerWithRag;
  const query = cleanAssistantQuery(input.query);

  const conversation = input.conversationId
    ? await db.assistantConversation.findFirst({
        where: {
          id: input.conversationId,
          userId: input.userId,
          status: "ACTIVE",
        },
      })
    : null;
  if (input.conversationId && !conversation) {
    throw new ApiError(
      404,
      "Assistant conversation not found.",
      "ASSISTANT_CONVERSATION_NOT_FOUND",
    );
  }

  const storedHistory = conversation
    ? await db.assistantMessage.findMany({
        where: { conversationId: conversation.id },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: HISTORY_TURNS,
      })
    : [];
  const history: RagConversationTurn[] = storedHistory
    .reverse()
    .map((message) => ({
      role: message.role === "USER" ? "USER" : "ASSISTANT",
      content: message.content,
    }));
  const topicContext = input.topic
    ? assistantTopicContext(input.topic)
    : null;
  const guidedHistory: RagConversationTurn[] = topicContext
    ? [{ role: "USER", content: topicContext }, ...history]
    : history;

  const toolAnswer = await answerWithAssistantTool(
    { userId: input.userId, query, history: guidedHistory },
    db,
  );
  const accountAnswer = toolAnswer
    ? null
    : await answerAccountHelp(input.userId, query, db);
  const rawPlatformAnswer = toolAnswer
    ? null
    : answerPlatformHelp(query, guidedHistory);
  const platformAnswer = rawPlatformAnswer
    ? await contextualizeHelpAnswer(query, rawPlatformAnswer, guidedHistory)
    : null;
  const trustedAnswer = toolAnswer ?? accountAnswer ?? platformAnswer;
  const supportAnswer = await prepareSupportEscalation(
    {
      userId: input.userId,
      query,
      history,
      proposedAnswer: trustedAnswer?.answer ?? null,
    },
    db,
  );
  const rag =
    supportAnswer ??
    trustedAnswer ??
    (await answerer(query, 6, {
      corpus: "real",
      conversation: guidedHistory,
      retrievalQuery: contextualRetrievalQuery(query, guidedHistory),
    }));

  const result = await db.$transaction(async (tx) => {
    const activeConversation =
      conversation ??
      (await tx.assistantConversation.create({
        data: {
          userId: input.userId,
          title: assistantConversationTitle(query),
        },
      }));
    if (supportAnswer?.write.kind === "create") {
      await tx.supportTicket.create({
        data: {
          id: supportAnswer.write.id,
          ticketNumber: supportAnswer.write.ticketNumber,
          requesterId: input.userId,
          conversationId: activeConversation.id,
          category: supportAnswer.write.category,
          priority: supportAnswer.write.priority,
          subject: supportAnswer.write.subject,
          description: supportAnswer.write.description,
          events: {
            create: {
              actorUserId: input.userId,
              type: "CREATED_BY_ASSISTANT",
              note: supportAnswer.write.latestNote,
            },
          },
        },
      });
      const admins = await tx.user.findMany({
        where: { isAdmin: true, accountStatus: "ACTIVE" },
        select: { id: true },
      });
      if (admins.length) {
        await tx.notification.createMany({
          data: admins.map((admin) => ({
            userId: admin.id,
            type: "SUPPORT_TICKET_CREATED",
            title: `New ${supportAnswer.write.priority.toLowerCase()} support ticket`,
            body: `${supportAnswer.write.ticketNumber}: ${supportAnswer.write.subject}`,
            actionUrl: `/admin/support?ticket=${supportAnswer.write.id}`,
          })),
        });
      }
    } else if (supportAnswer?.write.kind === "append") {
      await tx.supportTicket.update({
        where: { id: supportAnswer.write.id },
        data: {
          events: {
            create: {
              actorUserId: input.userId,
              type: "USER_FOLLOW_UP",
              note: supportAnswer.write.latestNote,
            },
          },
        },
      });
    }
    const userMessageCreatedAt = new Date();
    const assistantMessageCreatedAt = new Date(
      userMessageCreatedAt.getTime() + 1,
    );
    const userMessage = await tx.assistantMessage.create({
      data: {
        conversationId: activeConversation.id,
        role: "USER",
        content: query,
        citationsJson: [],
        retrievalJson: {},
        createdAt: userMessageCreatedAt,
      },
    });
    const assistantMessage = await tx.assistantMessage.create({
      data: {
        conversationId: activeConversation.id,
        role: "ASSISTANT",
        content: rag.answer,
        citationsJson: rag.citations as unknown as Prisma.InputJsonValue,
        retrievalJson: rag.retrieval as unknown as Prisma.InputJsonValue,
        createdAt: assistantMessageCreatedAt,
      },
    });
    const touched = await tx.assistantConversation.update({
      where: { id: activeConversation.id },
      data: { updatedAt: assistantMessageCreatedAt },
    });
    return { conversation: touched, userMessage, assistantMessage };
  });

  return {
    conversation: {
      id: result.conversation.id,
      title: result.conversation.title,
      createdAt: result.conversation.createdAt.toISOString(),
      updatedAt: result.conversation.updatedAt.toISOString(),
    },
    userMessage: assistantMessageDto(result.userMessage),
    assistantMessage: assistantMessageDto(result.assistantMessage),
  };
}
