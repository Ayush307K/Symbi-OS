-- Listing provenance and marketplace capability are separate concerns. A
-- sourceType records where data came from; listingMode records what SymbiOS is
-- allowed to do with it.
DO $$
BEGIN
  CREATE TYPE "ListingMode" AS ENUM ('MANAGED', 'EXTERNAL_LEAD', 'EVAL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "MarketplaceListing"
ADD COLUMN IF NOT EXISTS "listingMode" "ListingMode";

-- Existing fixtures remain visible but cannot transact. Seller-authored rows
-- enter the managed workflow; every other imported record is a sourcing lead.
UPDATE "MarketplaceListing"
SET "listingMode" = CASE
  WHEN "isEvalOnly" = true THEN 'EVAL'::"ListingMode"
  WHEN "sourceType" = 'seller_submitted' THEN 'MANAGED'::"ListingMode"
  ELSE 'EXTERNAL_LEAD'::"ListingMode"
END
WHERE "listingMode" IS NULL;

ALTER TABLE "MarketplaceListing"
ALTER COLUMN "listingMode" SET DEFAULT 'EXTERNAL_LEAD',
ALTER COLUMN "listingMode" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "MarketplaceListing_listingMode_status_idx"
ON "MarketplaceListing"("listingMode", "status");
