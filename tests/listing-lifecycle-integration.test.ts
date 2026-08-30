import "dotenv/config";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { JWTPayload } from "@/lib/auth";
import { createPrismaClient } from "@/lib/prisma";
import {
  resetStorageConfigForTests,
  setLocalStorageRootForTests,
} from "@/server/listings/storage";

const authState = vi.hoisted(() => ({ current: null as JWTPayload | null }));

vi.mock("@/server/http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/http")>();
  return {
    ...actual,
    requireUser: vi.fn(async () => {
      if (!authState.current) throw new actual.ApiError(401, "Unauthenticated", "UNAUTHORIZED");
      return authState.current;
    }),
    requireAdmin: vi.fn(async () => {
      if (!authState.current?.isAdmin) {
        throw new actual.ApiError(403, "Admin required", "FORBIDDEN");
      }
      return authState.current;
    }),
  };
});

vi.mock("@/server/semantic/listing-embeddings", () => ({
  tryRefreshListingEmbedding: vi.fn(async () => true),
}));

vi.mock("@/server/matching", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/matching")>();
  return { ...actual, matchListingToOpenDemands: vi.fn(async () => []) };
});

import { POST as createListing } from "@/app/api/listings/route";
import { PATCH as updateListing } from "@/app/api/listings/[id]/route";
import { POST as uploadAsset } from "@/app/api/listings/[id]/assets/route";
import { POST as submitListing } from "@/app/api/listings/[id]/submit/route";
import { PATCH as moderateListing } from "@/app/api/admin/listings/moderation/route";
import { POST as listingAction } from "@/app/api/listings/[id]/actions/route";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  "postgresql://symbi:symbi_local_dev@localhost:5432/symbi_dev";
const prisma = createPrismaClient({ datasourceUrl: TEST_DATABASE_URL });
const databaseReachable: boolean = await prisma
  .$queryRaw`SELECT 1`
  .then(() => true)
  .catch(() => false);
const suffix = Math.random().toString(36).slice(2, 10);
const sellerCompanyId = `lifecycle_company_${suffix}`;
const sellerId = `lifecycle_seller_${suffix}`;
const adminId = `lifecycle_admin_${suffix}`;
let listingId = "";
let storageRoot = "";

const sellerAuth: JWTPayload = {
  userId: sellerId,
  email: `${sellerId}@test.invalid`,
  role: "SELLER",
  companyName: `Lifecycle Seller ${suffix}`,
  companyId: sellerCompanyId,
  sessionId: `seller-session-${suffix}.secret`,
  tokenVersion: 0,
  isAdmin: false,
};
const adminAuth: JWTPayload = {
  userId: adminId,
  email: `${adminId}@test.invalid`,
  role: "BUYER",
  companyName: `Lifecycle Admin ${suffix}`,
  companyId: null,
  sessionId: `admin-session-${suffix}.secret`,
  tokenVersion: 0,
  isAdmin: true,
};

function request(method: string, path: string, body?: unknown) {
  return new NextRequest(`http://localhost:3000${path}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function json(response: Response) {
  const payload = await response.json();
  expect(response.status, JSON.stringify(payload)).toBeLessThan(400);
  return payload;
}

async function cleanup() {
  const listings = await prisma.marketplaceListing.findMany({
    where: { sellerCompanyId },
    select: { id: true, materialId: true },
  });
  const ids = listings.map((listing) => listing.id);
  const materialIds = listings.map((listing) => listing.materialId);
  if (ids.length) await prisma.marketplaceListing.deleteMany({ where: { id: { in: ids } } });
  await prisma.materialProducer.deleteMany({ where: { companyId: sellerCompanyId } });
  await prisma.user.deleteMany({ where: { id: { in: [sellerId, adminId] } } });
  await prisma.company.deleteMany({ where: { id: sellerCompanyId } });
  if (materialIds.length) {
    await prisma.wasteMaterial.deleteMany({
      where: { id: { in: materialIds }, listings: { none: {} } },
    });
  }
}

describe.skipIf(!databaseReachable)("seller listing lifecycle integration", () => {
  beforeAll(async () => {
    await cleanup();
    storageRoot = await mkdtemp(join(tmpdir(), "symbios-lifecycle-"));
    process.env.OBJECT_STORAGE_PROVIDER = "local";
    setLocalStorageRootForTests(storageRoot);
    await prisma.company.create({
      data: {
        id: sellerCompanyId,
        name: `Lifecycle Seller ${suffix}`,
        industry: "Recycling",
        location: "Pune, Maharashtra",
        carbonRating: "UNRATED",
        latitude: 18.5204,
        longitude: 73.8567,
        capacity: 100,
      },
    });
    await prisma.user.createMany({
      data: [
        {
          id: sellerId,
          email: sellerAuth.email,
          passwordHash: "not-a-real-hash",
          role: "SELLER",
          companyName: sellerAuth.companyName,
          companyId: sellerCompanyId,
        },
        {
          id: adminId,
          email: adminAuth.email,
          passwordHash: "not-a-real-hash",
          role: "BUYER",
          isAdmin: true,
          companyName: adminAuth.companyName,
        },
      ],
    });
    await prisma.sellerOnboarding.create({
      data: {
        userId: sellerId,
        status: "APPROVED",
        currentStep: "COMPLETE",
        verifiedAt: new Date(),
        warehouseJson: JSON.stringify({
          addressLine: "MIDC",
          city: "Pune",
          state: "Maharashtra",
          pincode: "411001",
        }),
      },
    });
  });

  afterAll(async () => {
    authState.current = null;
    await cleanup();
    resetStorageConfigForTests();
    if (storageRoot) await rm(storageRoot, { recursive: true, force: true });
    await prisma.$disconnect();
  });

  it("creates, edits every allowed state, moderates, pauses, resumes and archives", async () => {
    authState.current = sellerAuth;
    const created = await json(
      await createListing(
        request("POST", "/api/listings", {
          title: `Lifecycle HDPE ${suffix}`,
          category: "Plastic Scrap",
          subcategory: `HDPE lifecycle ${suffix}`,
        }),
      ),
    );
    listingId = created.listing.id;
    expect(created.listing).toMatchObject({ status: "DRAFT", version: 1 });

    const from = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const until = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000);
    const saved = await json(
      await updateListing(
        request("PATCH", `/api/listings/${listingId}`, {
          title: `Washed HDPE flakes ${suffix}`,
          category: "Plastic Scrap",
          subcategory: `HDPE lifecycle ${suffix}`,
          description: "Clean washed HDPE flakes with a documented moisture and contamination check.",
          priceMode: "FIXED",
          pricePerUnit: 42_000,
          quantityAvailable: 20,
          unit: "ton",
          minOrderQuantity: 2,
          lotIncrement: 2,
          leadTimeDays: 3,
          packaging: "Sealed one-ton bulk bags",
          handlingRequirements: "Keep dry and load with a forklift.",
          paymentTerms: "Sandbox settlement after confirmation",
          pincode: "411001",
          availableFrom: from.toISOString(),
          availableUntil: until.toISOString(),
          safetyDeclaration: true,
          qualityDeclaration: true,
          ownershipDeclaration: true,
          authorityDeclaration: true,
          version: created.listing.version,
        }),
        { params: Promise.resolve({ id: listingId }) },
      ),
    );
    expect(saved.listing.status).toBe("DRAFT");

    const image = await sharp({
      create: {
        width: 800,
        height: 600,
        channels: 3,
        background: "#1f7a5c",
      },
    }).jpeg().toBuffer();
    const form = new FormData();
    form.set("kind", "PHOTO");
    form.set("file", new File([new Uint8Array(image)], "hdpe.jpg", { type: "image/jpeg" }));
    const uploadResponse = await uploadAsset(
      new NextRequest(`http://localhost:3000/api/listings/${listingId}/assets`, {
        method: "POST",
        body: form,
      }),
      { params: Promise.resolve({ id: listingId }) },
    );
    const uploaded = await json(uploadResponse);
    expect(uploaded.asset.kind).toBe("PHOTO");

    const submitted = await json(
      await submitListing(
        request("POST", `/api/listings/${listingId}/submit`),
        { params: Promise.resolve({ id: listingId }) },
      ),
    );
    expect(submitted.listing.status).toBe("PENDING_MODERATION");

    authState.current = adminAuth;
    const rejected = await json(
      await moderateListing(
        request("PATCH", "/api/admin/listings/moderation", {
          listingId,
          version: submitted.listing.version,
          decision: "REJECT",
          note: "Clarify contamination controls before approval.",
        }),
      ),
    );
    expect(rejected.listing.status).toBe("REJECTED");

    authState.current = sellerAuth;
    const corrected = await json(
      await updateListing(
        request("PATCH", `/api/listings/${listingId}`, {
          description: "Clean washed HDPE flakes with documented moisture, contamination, and colour checks.",
          version: rejected.listing.version,
        }),
        { params: Promise.resolve({ id: listingId }) },
      ),
    );
    expect(corrected.listing.status).toBe("REJECTED");
    const resubmitted = await json(
      await submitListing(
        request("POST", `/api/listings/${listingId}/submit`),
        { params: Promise.resolve({ id: listingId }) },
      ),
    );

    authState.current = adminAuth;
    const approved = await json(
      await moderateListing(
        request("PATCH", "/api/admin/listings/moderation", {
          listingId,
          version: resubmitted.listing.version,
          decision: "APPROVE",
          note: "Safety and listing evidence verified.",
        }),
      ),
    );
    expect(approved.listing.status).toBe("ACTIVE");

    authState.current = sellerAuth;
    const activeEdit = await json(
      await updateListing(
        request("PATCH", `/api/listings/${listingId}`, {
          pricePerUnit: 41_500,
          version: approved.listing.version,
        }),
        { params: Promise.resolve({ id: listingId }) },
      ),
    );
    expect(activeEdit.listing.status).toBe("PENDING_MODERATION");

    authState.current = adminAuth;
    const reapproved = await json(
      await moderateListing(
        request("PATCH", "/api/admin/listings/moderation", {
          listingId,
          version: activeEdit.listing.version,
          decision: "APPROVE",
          note: "Commercial edit reviewed.",
        }),
      ),
    );

    authState.current = sellerAuth;
    const paused = await json(
      await listingAction(
        request("POST", `/api/listings/${listingId}/actions`, {
          action: "PAUSE",
          version: reapproved.listing.version,
        }),
        { params: Promise.resolve({ id: listingId }) },
      ),
    );
    expect(paused.listing.status).toBe("PAUSED");
    const pausedEdit = await json(
      await updateListing(
        request("PATCH", `/api/listings/${listingId}`, {
          quantityAvailable: 24,
          lotIncrement: 2,
          version: paused.listing.version,
        }),
        { params: Promise.resolve({ id: listingId }) },
      ),
    );
    expect(pausedEdit.listing).toMatchObject({ status: "PAUSED", quantityAvailable: 24 });

    const resumed = await json(
      await listingAction(
        request("POST", `/api/listings/${listingId}/actions`, {
          action: "RESUME",
          version: pausedEdit.listing.version,
        }),
        { params: Promise.resolve({ id: listingId }) },
      ),
    );
    expect(resumed.listing.status).toBe("ACTIVE");
    const archived = await json(
      await listingAction(
        request("POST", `/api/listings/${listingId}/actions`, {
          action: "ARCHIVE",
          version: resumed.listing.version,
        }),
        { params: Promise.resolve({ id: listingId }) },
      ),
    );
    expect(archived.listing.status).toBe("ARCHIVED");

    const events = await prisma.listingEvent.findMany({
      where: { listingId },
      orderBy: { createdAt: "asc" },
      select: { type: true, fromStatus: true, toStatus: true },
    });
    expect(events.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "LISTING_DRAFT_CREATED",
        "PHOTO_UPLOADED",
        "LISTING_SUBMITTED",
        "MODERATION_REJECT",
        "MODERATION_APPROVE",
        "ACTIVE_LISTING_EDITED",
        "LISTING_PAUSE",
        "LISTING_RESUME",
        "LISTING_ARCHIVE",
      ]),
    );
  }, 60_000);
});
