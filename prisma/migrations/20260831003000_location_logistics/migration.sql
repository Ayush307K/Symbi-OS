-- Location provenance, commercial delivery terms, freight quotes, and shipment tracking.
-- Columns are nullable where imported/external data cannot make a truthful claim.

CREATE TYPE "DeliveryTerm" AS ENUM (
  'EX_WORKS',
  'FOB',
  'DELIVERED',
  'FREIGHT_QUOTE_REQUIRED'
);

ALTER TABLE "MarketplaceListing"
  ADD COLUMN "geocodingProvider" TEXT,
  ADD COLUMN "geocodingConfidence" DOUBLE PRECISION,
  ADD COLUMN "geocodingPrecision" TEXT,
  ADD COLUMN "geocodedAt" TIMESTAMP(3),
  ADD COLUMN "deliveryTerm" "DeliveryTerm";

-- Existing managed rows pre-date the explicit commercial-term field. EX_WORKS
-- is the conservative migration default: the buyer remains responsible for
-- arranging freight and checkout never silently charges an invented amount.
UPDATE "MarketplaceListing"
SET "deliveryTerm" = 'EX_WORKS'
WHERE "listingMode" = 'MANAGED' AND "deliveryTerm" IS NULL;

ALTER TABLE "Address"
  ADD COLUMN "geocodingProvider" TEXT,
  ADD COLUMN "geocodingConfidence" DOUBLE PRECISION,
  ADD COLUMN "geocodingPrecision" TEXT,
  ADD COLUMN "geocodedAt" TIMESTAMP(3);

CREATE TABLE "FreightQuote" (
  "id" TEXT NOT NULL,
  "buyerUserId" TEXT NOT NULL,
  "listingId" TEXT NOT NULL,
  "shippingAddressId" TEXT NOT NULL,
  "orderId" TEXT,
  "quantity" INTEGER NOT NULL,
  "unit" TEXT NOT NULL,
  "deliveryTerm" "DeliveryTerm" NOT NULL,
  "distanceKm" DOUBLE PRECISION,
  "amount" DECIMAL(14,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "source" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'QUOTED',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FreightQuote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Shipment" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "sellerCompanyId" TEXT NOT NULL,
  "carrierName" TEXT NOT NULL,
  "serviceLevel" TEXT,
  "trackingNumber" TEXT,
  "vehicleNumber" TEXT,
  "proofOfDispatchReference" TEXT NOT NULL,
  "dispatchedAt" TIMESTAMP(3) NOT NULL,
  "estimatedDeliveryAt" TIMESTAMP(3) NOT NULL,
  "deliveredAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'DISPATCHED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FreightQuote_buyerUserId_status_expiresAt_idx"
  ON "FreightQuote"("buyerUserId", "status", "expiresAt");
CREATE INDEX "FreightQuote_listingId_shippingAddressId_quantity_idx"
  ON "FreightQuote"("listingId", "shippingAddressId", "quantity");
CREATE INDEX "FreightQuote_orderId_idx" ON "FreightQuote"("orderId");
CREATE UNIQUE INDEX "Shipment_orderId_key" ON "Shipment"("orderId");
CREATE INDEX "Shipment_sellerCompanyId_status_idx"
  ON "Shipment"("sellerCompanyId", "status");
CREATE INDEX "Shipment_trackingNumber_idx" ON "Shipment"("trackingNumber");

ALTER TABLE "FreightQuote"
  ADD CONSTRAINT "FreightQuote_buyerUserId_fkey"
  FOREIGN KEY ("buyerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "FreightQuote_listingId_fkey"
  FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "FreightQuote_shippingAddressId_fkey"
  FOREIGN KEY ("shippingAddressId") REFERENCES "Address"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "FreightQuote_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Shipment"
  ADD CONSTRAINT "Shipment_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
