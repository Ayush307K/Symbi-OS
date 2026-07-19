ALTER TABLE "SellerOnboarding" ADD COLUMN "gstinHash" TEXT;
ALTER TABLE "SellerOnboarding" ADD COLUMN "verificationProvider" TEXT;
ALTER TABLE "SellerOnboarding" ADD COLUMN "verificationReference" TEXT;
ALTER TABLE "SellerOnboarding" ADD COLUMN "verifiedAt" DATETIME;
CREATE UNIQUE INDEX "SellerOnboarding_gstinHash_key" ON "SellerOnboarding"("gstinHash");

CREATE TABLE "OnboardingDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "onboardingId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksumSha256" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'READY',
    "retentionUntil" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OnboardingDocument_onboardingId_fkey" FOREIGN KEY ("onboardingId") REFERENCES "SellerOnboarding" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OnboardingDocument_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OnboardingDocument_sizeBytes_check" CHECK ("sizeBytes" > 0)
);

CREATE TABLE "VerificationEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "onboardingId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "type" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "note" TEXT,
    "provider" TEXT,
    "reference" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VerificationEvent_onboardingId_fkey" FOREIGN KEY ("onboardingId") REFERENCES "SellerOnboarding" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "OnboardingDocument_storageKey_key" ON "OnboardingDocument"("storageKey");
CREATE UNIQUE INDEX "OnboardingDocument_onboardingId_kind_key" ON "OnboardingDocument"("onboardingId", "kind");
CREATE INDEX "OnboardingDocument_ownerUserId_idx" ON "OnboardingDocument"("ownerUserId");
CREATE INDEX "OnboardingDocument_retentionUntil_idx" ON "OnboardingDocument"("retentionUntil");
CREATE INDEX "VerificationEvent_onboardingId_createdAt_idx" ON "VerificationEvent"("onboardingId", "createdAt");
CREATE INDEX "VerificationEvent_actorUserId_idx" ON "VerificationEvent"("actorUserId");
