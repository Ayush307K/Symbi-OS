import { randomUUID } from "node:crypto";
import type { ExtendedPrismaClient } from "@/lib/prisma";
import type {
  AssistantCitation,
  AssistantRetrieval,
} from "@/lib/assistant-types";
import type { RagConversationTurn } from "@/server/rag/query";

const OPEN_STATUSES = ["OPEN", "IN_PROGRESS", "WAITING_ON_USER"];

export interface SupportTicketWrite {
  kind: "create" | "append";
  id: string;
  ticketNumber: string;
  category: string;
  priority: string;
  subject: string;
  description: string;
  latestNote: string;
}

export interface SupportEscalationAnswer {
  answer: string;
  citations: AssistantCitation[];
  retrieval: AssistantRetrieval;
  write: SupportTicketWrite;
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const explicitEscalation =
  /\b(create|open|raise|submit|file|make).*(support )?(ticket|complaint|case)\b|\b(contact support|support team|human support|human agent|talk to (?:a )?(?:human|person|agent)|escalate|escalation)\b/;
const unresolvedFailure =
  /\b(still|again|already tried|tried that|same answer|keeps failing|not working|doesn t work|didn t work|cannot|can t|failed|broken|stuck|blocked)\b/;

export function isSupportEscalationQuery(query: string) {
  const value = normalize(query);
  return explicitEscalation.test(value) || unresolvedFailure.test(value);
}

function categoryFor(value: string) {
  if (/\b(login|sign in|password|account|email|otp)\b/.test(value))
    return "ACCOUNT_ACCESS";
  if (
    /\b(kyc|verification|onboarding|gst|pan|bank proof|document)\b/.test(value)
  ) {
    return "SELLER_VERIFICATION";
  }
  if (/\b(bid|offer|counter)\b/.test(value)) return "BIDDING";
  if (/\b(order|checkout|payment|invoice|refund|cart)\b/.test(value))
    return "ORDER_PAYMENT";
  if (/\b(message|chat|seller contact|conversation)\b/.test(value))
    return "MESSAGING";
  if (/\b(listing|catalogue|catalog|image|search|feed)\b/.test(value))
    return "LISTING_DISCOVERY";
  if (/\b(rfq|demand|match)\b/.test(value)) return "RFQ_MATCHING";
  if (/\b(safety|hazardous|prohibited|report seller|fraud)\b/.test(value))
    return "TRUST_SAFETY";
  return "GENERAL_SUPPORT";
}

function priorityFor(value: string) {
  if (
    /\b(fraud|security|unauthori[sz]ed|charged|payment taken|data leak)\b/.test(
      value,
    )
  ) {
    return "URGENT";
  }
  if (
    /\b(payment|checkout|account locked|cannot sign in|can t sign in|blocked)\b/.test(
      value,
    )
  ) {
    return "HIGH";
  }
  return "NORMAL";
}

function transcript(query: string, history: RagConversationTurn[]) {
  return [...history.slice(-8), { role: "USER" as const, content: query }]
    .map(
      (turn) =>
        `${turn.role === "USER" ? "User" : "Symbi"}: ${turn.content.slice(0, 1500)}`,
    )
    .join("\n\n")
    .slice(0, 10_000);
}

function ticketCitation(id: string, ticketNumber: string): AssistantCitation {
  return {
    id: "S1",
    title: `Support ticket ${ticketNumber}`,
    url: `/support?ticket=${encodeURIComponent(id)}`,
    sourceType: "SUPPORT_TICKET",
    sourceId: null,
    isEvalOnly: false,
    excerpt: "Track the issue and read the support team resolution.",
  };
}

function sameAnswerWasRepeated(
  proposedAnswer: string | null,
  history: RagConversationTurn[],
) {
  if (!proposedAnswer) return false;
  const lastAssistant = [...history]
    .reverse()
    .find((turn) => turn.role === "ASSISTANT")?.content;
  return Boolean(
    lastAssistant && normalize(lastAssistant) === normalize(proposedAnswer),
  );
}

/**
 * Escalate on an explicit request, a repeated self-service answer, or a clear
 * failure for which no trusted diagnostic is available. Known failures receive
 * troubleshooting once before the assistant creates a case.
 */
export async function prepareSupportEscalation(
  input: {
    userId: string;
    query: string;
    history: RagConversationTurn[];
    proposedAnswer: string | null;
  },
  db: ExtendedPrismaClient,
): Promise<SupportEscalationAnswer | null> {
  const value = normalize(input.query);
  const explicit = explicitEscalation.test(value);
  const repeated = sameAnswerWasRepeated(input.proposedAnswer, input.history);
  const failed =
    unresolvedFailure.test(value) &&
    input.history.some((turn) => turn.role === "ASSISTANT");
  const failedWithoutSelfService = failed && !input.proposedAnswer;
  if (!explicit && !failed && !repeated) return null;

  const context = `${input.history.map((turn) => turn.content).join(" ")} ${input.query}`;
  const category = categoryFor(normalize(context));
  const existing = await db.supportTicket.findFirst({
    where: {
      requesterId: input.userId,
      category,
      status: { in: OPEN_STATUSES },
    },
    orderBy: { updatedAt: "desc" },
  });

  if (existing) {
    return {
      answer: `I won’t repeat the same instructions. Your open support ticket ${existing.ticketNumber} already covers this ${category.toLowerCase().replaceAll("_", " ")} issue. I’ve added your latest message to it so the support team has the new context. Track the response from the Support page.`,
      citations: [ticketCitation(existing.id, existing.ticketNumber)],
      retrieval: { mode: "support", resultCount: 1 },
      write: {
        kind: "append",
        id: existing.id,
        ticketNumber: existing.ticketNumber,
        category,
        priority: existing.priority,
        subject: existing.subject,
        description: existing.description,
        latestNote: input.query,
      },
    };
  }

  if (!explicit && !failedWithoutSelfService && !repeated) return null;

  const id = randomUUID();
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const ticketNumber = `SUP-${date}-${id.slice(0, 6).toUpperCase()}`;
  const subject = input.query.replace(/\s+/g, " ").trim().slice(0, 120);
  const priority = priorityFor(value);
  return {
    answer: `I’ve created support ticket ${ticketNumber} instead of sending another generic answer. The recent conversation and your latest message are attached, and the issue is classified as ${category.toLowerCase().replaceAll("_", " ")}. You can track its status and the support team’s resolution from the Support page.`,
    citations: [ticketCitation(id, ticketNumber)],
    retrieval: { mode: "support", resultCount: 1 },
    write: {
      kind: "create",
      id,
      ticketNumber,
      category,
      priority,
      subject: subject || "SymbiOS support request",
      description: transcript(input.query, input.history),
      latestNote: input.query,
    },
  };
}
