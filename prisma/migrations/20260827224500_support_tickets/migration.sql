-- A support escalation must become an owned, trackable product record rather
-- than a dead-end sentence in assistant history.
CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL,
    "ticketNumber" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "conversationId" TEXT,
    "assignedToId" TEXT,
    "category" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "resolutionNote" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupportTicketEvent" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "type" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportTicketEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SupportTicket_ticketNumber_key" ON "SupportTicket"("ticketNumber");
CREATE INDEX "SupportTicket_requesterId_status_updatedAt_idx" ON "SupportTicket"("requesterId", "status", "updatedAt");
CREATE INDEX "SupportTicket_status_priority_createdAt_idx" ON "SupportTicket"("status", "priority", "createdAt");
CREATE INDEX "SupportTicket_assignedToId_status_idx" ON "SupportTicket"("assignedToId", "status");
CREATE INDEX "SupportTicket_conversationId_idx" ON "SupportTicket"("conversationId");
CREATE INDEX "SupportTicketEvent_ticketId_createdAt_idx" ON "SupportTicketEvent"("ticketId", "createdAt");
CREATE INDEX "SupportTicketEvent_actorUserId_idx" ON "SupportTicketEvent"("actorUserId");

ALTER TABLE "SupportTicket"
ADD CONSTRAINT "SupportTicket_requesterId_fkey"
FOREIGN KEY ("requesterId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SupportTicket"
ADD CONSTRAINT "SupportTicket_conversationId_fkey"
FOREIGN KEY ("conversationId") REFERENCES "AssistantConversation"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SupportTicket"
ADD CONSTRAINT "SupportTicket_assignedToId_fkey"
FOREIGN KEY ("assignedToId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SupportTicketEvent"
ADD CONSTRAINT "SupportTicketEvent_ticketId_fkey"
FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SupportTicketEvent"
ADD CONSTRAINT "SupportTicketEvent_actorUserId_fkey"
FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
