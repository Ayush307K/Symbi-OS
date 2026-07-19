ALTER TABLE "MessageThread" ADD COLUMN "bidId" TEXT REFERENCES "Bid"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MessageThread" ADD COLUMN "orderId" TEXT REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "MessageReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "threadId" TEXT NOT NULL,
    "reporterUserId" TEXT NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "details" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MessageReport_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "MessageThread" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "MessageThread_bidId_idx" ON "MessageThread"("bidId");
CREATE INDEX "MessageThread_orderId_idx" ON "MessageThread"("orderId");
CREATE INDEX "MessageReport_threadId_idx" ON "MessageReport"("threadId");
CREATE INDEX "MessageReport_reporterUserId_status_idx" ON "MessageReport"("reporterUserId", "status");
