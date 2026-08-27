-- Persistent buyer-assistant conversations. The assistant continues to use
-- the existing real-only RAG index; these tables store product state, not a
-- second retrieval corpus.
CREATE TABLE "AssistantConversation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssistantConversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AssistantMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "citationsJson" JSONB NOT NULL,
    "retrievalJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistantMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AssistantConversation_userId_status_updatedAt_idx"
ON "AssistantConversation"("userId", "status", "updatedAt");

CREATE INDEX "AssistantMessage_conversationId_createdAt_idx"
ON "AssistantMessage"("conversationId", "createdAt");

ALTER TABLE "AssistantConversation"
ADD CONSTRAINT "AssistantConversation_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AssistantMessage"
ADD CONSTRAINT "AssistantMessage_conversationId_fkey"
FOREIGN KEY ("conversationId") REFERENCES "AssistantConversation"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
