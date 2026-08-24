-- Synthetic evaluation records stay in the production-shaped tables so the
-- test path is real, but every buyer-facing query can exclude them explicitly.
ALTER TABLE "User"
  ADD COLUMN "isEvalOnly" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "MarketplaceListing"
  ADD COLUMN "isEvalOnly" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "evalScenarioTags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "evalClusterId" TEXT;

ALTER TABLE "PurchaseOrder"
  ADD COLUMN "isEvalOnly" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "KnowledgeDocument"
  ADD COLUMN "isEvalOnly" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "User_isEvalOnly_idx" ON "User"("isEvalOnly");
CREATE INDEX "MarketplaceListing_isEvalOnly_status_idx"
  ON "MarketplaceListing"("isEvalOnly", "status");
CREATE INDEX "MarketplaceListing_evalClusterId_idx"
  ON "MarketplaceListing"("evalClusterId");
CREATE INDEX "PurchaseOrder_isEvalOnly_createdAt_idx"
  ON "PurchaseOrder"("isEvalOnly", "createdAt");
CREATE INDEX "KnowledgeDocument_isEvalOnly_status_idx"
  ON "KnowledgeDocument"("isEvalOnly", "status");
