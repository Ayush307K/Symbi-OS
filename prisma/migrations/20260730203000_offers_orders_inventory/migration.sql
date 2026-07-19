PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

ALTER TABLE "Bid" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'INR';
ALTER TABLE "Bid" ADD COLUMN "unit" TEXT NOT NULL DEFAULT 'ton';
ALTER TABLE "Bid" ADD COLUMN "terms" TEXT;
ALTER TABLE "Bid" ADD COLUMN "currentSequence" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Bid" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "Bid" ADD COLUMN "decisionAt" DATETIME;
UPDATE "Bid" SET "status" = upper("status");
CREATE UNIQUE INDEX "Bid_idempotencyKey_key" ON "Bid"("idempotencyKey");

CREATE TABLE "OfferRevision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bidId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "pricePerUnit" REAL NOT NULL,
    "currency" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "terms" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OfferRevision_bidId_fkey" FOREIGN KEY ("bidId") REFERENCES "Bid" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OfferRevision_quantity_check" CHECK ("quantity" > 0),
    CONSTRAINT "OfferRevision_price_check" CHECK ("pricePerUnit" > 0)
);

CREATE TABLE "OfferEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bidId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "type" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "metadataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OfferEvent_bidId_fkey" FOREIGN KEY ("bidId") REFERENCES "Bid" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "OfferRevision" (
    "id", "bidId", "sequence", "createdByUserId", "kind", "quantity",
    "pricePerUnit", "currency", "unit", "status", "expiresAt", "createdAt"
)
SELECT
    lower(hex(randomblob(16))), "id", 1, "bidderUserId", 'INITIAL',
    "quantity", "pricePerUnit", 'INR', 'ton',
    CASE WHEN upper("status") = 'PENDING' THEN 'OPEN' ELSE upper("status") END,
    COALESCE("expiresAt", datetime("createdAt", '+7 days')), "createdAt"
FROM "Bid";

INSERT INTO "OfferEvent" (
    "id", "bidId", "actorUserId", "type", "toStatus", "sequence", "createdAt"
)
SELECT
    lower(hex(randomblob(16))), "id", "bidderUserId", 'MIGRATED',
    upper("status"), 1, "createdAt"
FROM "Bid";

ALTER TABLE "PurchaseOrder" ADD COLUMN "sourceBidId" TEXT REFERENCES "Bid"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrder" ADD COLUMN "fulfillmentStatus" TEXT NOT NULL DEFAULT 'UNFULFILLED';
ALTER TABLE "PurchaseOrder" ADD COLUMN "disputeStatus" TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE "PurchaseOrder" ADD COLUMN "buyerFeeAmount" REAL NOT NULL DEFAULT 0;
ALTER TABLE "PurchaseOrder" ADD COLUMN "sellerFeeAmount" REAL NOT NULL DEFAULT 0;
ALTER TABLE "PurchaseOrder" ADD COLUMN "feeVersion" TEXT NOT NULL DEFAULT 'fees-v1';
ALTER TABLE "PurchaseOrder" ADD COLUMN "taxNote" TEXT NOT NULL DEFAULT 'Tax not calculated in sandbox';
CREATE UNIQUE INDEX "PurchaseOrder_sourceBidId_key" ON "PurchaseOrder"("sourceBidId");

ALTER TABLE "PurchaseOrderItem" ADD COLUMN "sourceBidId" TEXT;

CREATE TABLE "OrderEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "type" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "reasonCode" TEXT,
    "snapshotJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "PurchaseOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "snapshotJson" TEXT NOT NULL,
    "issuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Invoice_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "PurchaseOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "InventoryReservation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "listingId" TEXT NOT NULL,
    "bidId" TEXT,
    "orderId" TEXT,
    "quantity" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" DATETIME NOT NULL,
    "committedAt" DATETIME,
    "releasedAt" DATETIME,
    "releaseReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InventoryReservation_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InventoryReservation_bidId_fkey" FOREIGN KEY ("bidId") REFERENCES "Bid" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "InventoryReservation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "PurchaseOrder" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "InventoryReservation_quantity_check" CHECK ("quantity" > 0)
);

ALTER TABLE "InventoryMovement" ADD COLUMN "reservationId" TEXT REFERENCES "InventoryReservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD COLUMN "balanceAfter" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "InventoryMovement" ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "OfferRevision_bidId_sequence_key" ON "OfferRevision"("bidId", "sequence");
CREATE INDEX "OfferRevision_bidId_createdAt_idx" ON "OfferRevision"("bidId", "createdAt");
CREATE INDEX "OfferEvent_bidId_createdAt_idx" ON "OfferEvent"("bidId", "createdAt");
CREATE INDEX "OfferEvent_actorUserId_idx" ON "OfferEvent"("actorUserId");
CREATE INDEX "OrderEvent_orderId_createdAt_idx" ON "OrderEvent"("orderId", "createdAt");
CREATE INDEX "OrderEvent_actorUserId_idx" ON "OrderEvent"("actorUserId");
CREATE UNIQUE INDEX "Invoice_orderId_key" ON "Invoice"("orderId");
CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");
CREATE UNIQUE INDEX "InventoryReservation_bidId_key" ON "InventoryReservation"("bidId");
CREATE INDEX "InventoryReservation_listingId_status_idx" ON "InventoryReservation"("listingId", "status");
CREATE INDEX "InventoryReservation_orderId_idx" ON "InventoryReservation"("orderId");
CREATE INDEX "InventoryReservation_status_expiresAt_idx" ON "InventoryReservation"("status", "expiresAt");
CREATE UNIQUE INDEX "InventoryMovement_idempotencyKey_key" ON "InventoryMovement"("idempotencyKey");
CREATE INDEX "InventoryMovement_reservationId_idx" ON "InventoryMovement"("reservationId");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
