export interface AssistantCitation {
  id: string;
  title: string;
  url: string | null;
  sourceType: string;
  sourceId: string | null;
  isEvalOnly: boolean;
  excerpt: string;
}

export interface AssistantRetrieval {
  mode: "hybrid" | "lexical" | "platform" | "account" | "support" | "tool";
  resultCount: number;
  degraded?: boolean;
  toolName?: string;
}

export interface AssistantMessageDto {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  citations: AssistantCitation[];
  retrieval: AssistantRetrieval | null;
  createdAt: string;
}

export interface AssistantConversationSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  lastMessage: Pick<
    AssistantMessageDto,
    "id" | "role" | "content" | "createdAt"
  > | null;
}
