DELETE FROM "Review"
WHERE rowid NOT IN (
  SELECT MIN(rowid)
  FROM "Review"
  GROUP BY "userId", "listingId"
);
CREATE UNIQUE INDEX "Review_userId_listingId_key" ON "Review"("userId", "listingId");
ALTER TABLE "ListingMatch" ADD COLUMN "convertedOrderId" TEXT;
CREATE INDEX "ListingMatch_convertedOrderId_idx" ON "ListingMatch"("convertedOrderId");
