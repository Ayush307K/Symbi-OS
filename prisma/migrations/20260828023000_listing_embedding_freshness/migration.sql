-- Track vector freshness separately from listing freshness. A provider import
-- can deliberately skip embedding calls, and a nullable timestamp lets the
-- daily job distinguish missing/stale vectors from unchanged ones.
ALTER TABLE "MarketplaceListing"
ADD COLUMN "embeddingUpdatedAt" TIMESTAMP(3);

-- Existing vectors predate freshness tracking. Mark them for one controlled
-- refresh rather than pretending they reflect the current listing content.
CREATE INDEX "MarketplaceListing_status_isEvalOnly_embeddingUpdatedAt_idx"
ON "MarketplaceListing"("status", "isEvalOnly", "embeddingUpdatedAt");
