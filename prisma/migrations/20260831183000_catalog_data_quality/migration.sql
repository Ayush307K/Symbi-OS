-- Catalogue data-quality controls. Raw supplier values remain immutable audit
-- evidence; normalized fields power public display, filtering, and ranking.

ALTER TABLE "Company"
  ADD COLUMN "displayName" TEXT;

UPDATE "Company"
SET "displayName" = regexp_replace("name", ' \([0-9a-f]{6}\)$', '')
WHERE "name" ~ ' \([0-9a-f]{6}\)$';

ALTER TABLE "MarketplaceListing"
  ADD COLUMN "rawPriceText" TEXT,
  ADD COLUMN "rawUnitText" TEXT,
  ADD COLUMN "priceBasisUnit" TEXT,
  ADD COLUMN "normalizedPricePerKg" DECIMAL(14,4),
  ADD COLUMN "dataQualityStatus" TEXT NOT NULL DEFAULT 'VALID',
  ADD COLUMN "dataQualityIssues" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "dataNormalizedAt" TIMESTAMP(3);

-- Existing rows used one canonical unit for both quantity and price. Preserve
-- that value as the initial basis; the idempotent normalizer refines imported
-- rows from their raw supplier text after deployment.
UPDATE "MarketplaceListing"
SET
  "priceBasisUnit" = CASE
    WHEN "priceMode" = 'FIXED' THEN "unit"
    ELSE NULL
  END,
  "rawUnitText" = "unit",
  "rawPriceText" = CASE
    WHEN "priceMode" = 'FIXED' THEN "pricePerUnit"::TEXT
    ELSE NULL
  END,
  "normalizedPricePerKg" = CASE
    WHEN "priceMode" <> 'FIXED' THEN NULL
    WHEN "unit" = 'kg' THEN "pricePerUnit"
    WHEN "unit" = 'ton' THEN "pricePerUnit" / 1000
    ELSE NULL
  END,
  "dataNormalizedAt" = CURRENT_TIMESTAMP;

ALTER TABLE "ListingImportRun"
  ADD COLUMN "recordsQuarantined" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "MarketplaceListing_status_priceBasisUnit_normalizedPricePerKg_idx"
  ON "MarketplaceListing"("status", "priceBasisUnit", "normalizedPricePerKg");
CREATE INDEX "MarketplaceListing_dataQualityStatus_status_idx"
  ON "MarketplaceListing"("dataQualityStatus", "status");
