-- CreateTable
CREATE TABLE "ListingAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "listingId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "thumbnailKey" TEXT,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksumSha256" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "visibility" TEXT NOT NULL DEFAULT 'PRIVATE',
    "status" TEXT NOT NULL DEFAULT 'READY',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ListingAsset_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ListingAsset_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ListingAsset_sizeBytes_check" CHECK ("sizeBytes" > 0)
);

-- CreateTable
CREATE TABLE "ListingEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "listingId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "type" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "version" INTEGER NOT NULL,
    "snapshotJson" TEXT,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ListingEvent_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ListingEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ListingEvent_version_check" CHECK ("version" > 0)
);

-- RedefineTable
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_MarketplaceListing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'synthetic',
    "sourceName" TEXT,
    "sourceUrl" TEXT,
    "externalId" TEXT,
    "rawQuantityText" TEXT,
    "rawLocationText" TEXT,
    "materialId" TEXT NOT NULL,
    "sellerCompanyId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subcategory" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL DEFAULT '',
    "pricePerUnit" REAL NOT NULL,
    "priceMode" TEXT NOT NULL DEFAULT 'FIXED',
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "unit" TEXT NOT NULL DEFAULT 'ton',
    "minOrderQuantity" INTEGER NOT NULL,
    "lotIncrement" INTEGER NOT NULL DEFAULT 1,
    "quantityAvailable" INTEGER NOT NULL,
    "leadTimeDays" INTEGER NOT NULL,
    "rating" REAL NOT NULL,
    "responseRate" INTEGER NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT true,
    "tradeAssurance" BOOLEAN NOT NULL DEFAULT true,
    "yearsActive" INTEGER NOT NULL,
    "ordersCompleted" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "packaging" TEXT NOT NULL,
    "handlingRequirements" TEXT NOT NULL DEFAULT '',
    "paymentTerms" TEXT NOT NULL,
    "pincode" TEXT,
    "latitude" REAL,
    "longitude" REAL,
    "availableFrom" DATETIME,
    "availableUntil" DATETIME,
    "safetyDeclaration" BOOLEAN NOT NULL DEFAULT false,
    "qualityDeclaration" BOOLEAN NOT NULL DEFAULT false,
    "ownershipDeclaration" BOOLEAN NOT NULL DEFAULT false,
    "authorityDeclaration" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "submittedAt" DATETIME,
    "moderatedAt" DATETIME,
    "moderatedByUserId" TEXT,
    "moderationNote" TEXT,
    "activatedAt" DATETIME,
    "expiresAt" DATETIME,
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MarketplaceListing_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "WasteMaterial" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MarketplaceListing_sellerCompanyId_fkey" FOREIGN KEY ("sellerCompanyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MarketplaceListing_price_check" CHECK ("pricePerUnit" >= 0),
    CONSTRAINT "MarketplaceListing_quantity_check" CHECK ("quantityAvailable" >= 0),
    CONSTRAINT "MarketplaceListing_moq_check" CHECK ("minOrderQuantity" > 0),
    CONSTRAINT "MarketplaceListing_lot_increment_check" CHECK ("lotIncrement" > 0),
    CONSTRAINT "MarketplaceListing_version_check" CHECK ("version" > 0)
);
INSERT INTO "new_MarketplaceListing" (
    "area", "category", "city", "country", "createdAt", "currency",
    "description", "externalId", "id", "imageUrl", "leadTimeDays",
    "materialId", "minOrderQuantity", "ordersCompleted", "packaging",
    "paymentTerms", "pricePerUnit", "quantityAvailable", "rating",
    "rawLocationText", "rawQuantityText", "responseRate", "sellerCompanyId",
    "slug", "sourceName", "sourceType", "sourceUrl", "state", "status",
    "subcategory", "title", "tradeAssurance", "unit", "updatedAt",
    "verified", "yearsActive", "safetyDeclaration", "qualityDeclaration",
    "ownershipDeclaration", "authorityDeclaration", "activatedAt"
)
SELECT
    "area", "category", "city", "country", "createdAt", "currency",
    "description", "externalId", "id", "imageUrl", "leadTimeDays",
    "materialId", "minOrderQuantity", "ordersCompleted", "packaging",
    "paymentTerms", "pricePerUnit", "quantityAvailable", "rating",
    "rawLocationText", "rawQuantityText", "responseRate", "sellerCompanyId",
    "slug", "sourceName", "sourceType", "sourceUrl", "state",
    CASE WHEN lower("status") = 'active' THEN 'ACTIVE' ELSE upper("status") END,
    "subcategory", "title", "tradeAssurance", "unit", "updatedAt",
    "verified", "yearsActive",
    CASE WHEN "sourceType" IN ('real_api', 'real_public_provider', 'seller_submitted') THEN 1 ELSE 0 END,
    CASE WHEN "sourceType" IN ('real_api', 'real_public_provider', 'seller_submitted') THEN 1 ELSE 0 END,
    CASE WHEN "sourceType" IN ('real_api', 'real_public_provider', 'seller_submitted') THEN 1 ELSE 0 END,
    CASE WHEN "sourceType" IN ('real_api', 'real_public_provider', 'seller_submitted') THEN 1 ELSE 0 END,
    CASE WHEN lower("status") = 'active' THEN "createdAt" ELSE NULL END
FROM "MarketplaceListing";
DROP TABLE "MarketplaceListing";
ALTER TABLE "new_MarketplaceListing" RENAME TO "MarketplaceListing";
CREATE UNIQUE INDEX "MarketplaceListing_slug_key" ON "MarketplaceListing"("slug");
CREATE UNIQUE INDEX "MarketplaceListing_externalId_key" ON "MarketplaceListing"("externalId");
CREATE INDEX "MarketplaceListing_category_idx" ON "MarketplaceListing"("category");
CREATE INDEX "MarketplaceListing_category_subcategory_idx" ON "MarketplaceListing"("category", "subcategory");
CREATE INDEX "MarketplaceListing_state_idx" ON "MarketplaceListing"("state");
CREATE INDEX "MarketplaceListing_state_city_pincode_idx" ON "MarketplaceListing"("state", "city", "pincode");
CREATE INDEX "MarketplaceListing_country_idx" ON "MarketplaceListing"("country");
CREATE INDEX "MarketplaceListing_sourceType_idx" ON "MarketplaceListing"("sourceType");
CREATE INDEX "MarketplaceListing_sourceName_idx" ON "MarketplaceListing"("sourceName");
CREATE INDEX "MarketplaceListing_materialId_idx" ON "MarketplaceListing"("materialId");
CREATE INDEX "MarketplaceListing_sellerCompanyId_idx" ON "MarketplaceListing"("sellerCompanyId");
CREATE INDEX "MarketplaceListing_status_updatedAt_idx" ON "MarketplaceListing"("status", "updatedAt");
CREATE INDEX "MarketplaceListing_status_pricePerUnit_idx" ON "MarketplaceListing"("status", "pricePerUnit");
CREATE INDEX "MarketplaceListing_status_quantityAvailable_idx" ON "MarketplaceListing"("status", "quantityAvailable");
CREATE INDEX "MarketplaceListing_status_availableFrom_availableUntil_idx" ON "MarketplaceListing"("status", "availableFrom", "availableUntil");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "ListingAsset_storageKey_key" ON "ListingAsset"("storageKey");
CREATE INDEX "ListingAsset_listingId_kind_sortOrder_idx" ON "ListingAsset"("listingId", "kind", "sortOrder");
CREATE INDEX "ListingAsset_ownerUserId_idx" ON "ListingAsset"("ownerUserId");
CREATE INDEX "ListingEvent_listingId_createdAt_idx" ON "ListingEvent"("listingId", "createdAt");
CREATE INDEX "ListingEvent_actorUserId_idx" ON "ListingEvent"("actorUserId");
CREATE INDEX "ListingEvent_type_idx" ON "ListingEvent"("type");
