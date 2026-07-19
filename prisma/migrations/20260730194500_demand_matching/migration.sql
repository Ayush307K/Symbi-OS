PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Demand" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "userId" TEXT,
    "query" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subcategory" TEXT,
    "quantity" INTEGER NOT NULL,
    "unit" TEXT NOT NULL,
    "maxPrice" REAL,
    "state" TEXT,
    "city" TEXT,
    "pincode" TEXT,
    "latitude" REAL,
    "longitude" REAL,
    "maxDistanceKm" REAL,
    "availableBy" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "matchVersion" TEXT NOT NULL DEFAULT 'rules-v1',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Demand_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Demand_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "WasteMaterial" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Demand_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Demand_quantity_check" CHECK ("quantity" > 0),
    CONSTRAINT "Demand_maxPrice_check" CHECK ("maxPrice" IS NULL OR "maxPrice" >= 0),
    CONSTRAINT "Demand_maxDistanceKm_check" CHECK ("maxDistanceKm" IS NULL OR "maxDistanceKm" > 0)
);

INSERT INTO "new_Demand" (
    "id", "companyId", "materialId", "userId", "query", "category",
    "subcategory", "quantity", "unit", "status", "matchVersion",
    "createdAt", "updatedAt"
)
SELECT
    "id", "companyId", "materialId", "userId",
    COALESCE((SELECT "name" FROM "WasteMaterial" WHERE "WasteMaterial"."id" = "Demand"."materialId"), 'Legacy demand'),
    COALESCE((SELECT "category" FROM "WasteMaterial" WHERE "WasteMaterial"."id" = "Demand"."materialId"), 'Plastic Scrap'),
    (SELECT "baseElement" FROM "WasteMaterial" WHERE "WasteMaterial"."id" = "Demand"."materialId"),
    1, 'ton', 'OPEN', 'legacy-v0', "createdAt", "createdAt"
FROM "Demand";

DROP TABLE "Demand";
ALTER TABLE "new_Demand" RENAME TO "Demand";

CREATE TABLE "ListingMatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "demandId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "version" TEXT NOT NULL,
    "explanationJson" TEXT NOT NULL,
    "inputSnapshotJson" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ListingMatch_demandId_fkey" FOREIGN KEY ("demandId") REFERENCES "Demand" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ListingMatch_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ListingMatch_score_check" CHECK ("score" >= 0 AND "score" <= 100)
);

CREATE INDEX "Demand_companyId_status_idx" ON "Demand"("companyId", "status");
CREATE INDEX "Demand_materialId_idx" ON "Demand"("materialId");
CREATE INDEX "Demand_userId_idx" ON "Demand"("userId");
CREATE INDEX "Demand_category_status_idx" ON "Demand"("category", "status");
CREATE UNIQUE INDEX "ListingMatch_demandId_listingId_key" ON "ListingMatch"("demandId", "listingId");
CREATE INDEX "ListingMatch_demandId_score_idx" ON "ListingMatch"("demandId", "score");
CREATE INDEX "ListingMatch_listingId_status_idx" ON "ListingMatch"("listingId", "status");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
