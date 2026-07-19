ALTER TABLE "MarketplaceListing" ADD COLUMN "safetyReviewReason" TEXT;
ALTER TABLE "MarketplaceListing" ADD COLUMN "lastVerifiedAt" DATETIME;
UPDATE "MarketplaceListing"
SET "lastVerifiedAt" = "updatedAt"
WHERE "sourceType" IN ('real_api', 'real_public_provider');

CREATE TABLE "SafetyEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "listingId" TEXT,
    "outcome" TEXT NOT NULL,
    "ruleCode" TEXT NOT NULL,
    "category" TEXT,
    "textHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SafetyEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "SafetyEvent_userId_createdAt_idx" ON "SafetyEvent"("userId", "createdAt");
CREATE INDEX "SafetyEvent_listingId_createdAt_idx" ON "SafetyEvent"("listingId", "createdAt");
CREATE INDEX "SafetyEvent_outcome_idx" ON "SafetyEvent"("outcome");
