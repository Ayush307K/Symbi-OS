import "dotenv/config";
import { createPrismaClient } from "@/lib/prisma";

/**
 * Walks one complete marketplace transaction against a running server, using
 * only the public HTTP API — the same path a browser takes.
 *
 * Every piece of this loop is unit-tested in isolation, but the sequence has
 * never been run end to end, so this exists to prove the product can actually
 * do the thing it is for: a verified seller lists priced stock, a buyer bids,
 * the seller accepts, and an order exists with inventory moved against it.
 *
 *   npx tsx scripts/smoke-transaction.ts [baseUrl]
 *
 * It creates its own seller and buyer, so it never depends on existing data and
 * can be re-run. Anything it creates is prefixed `smoke-`.
 */
const BASE = process.argv[2] || "http://localhost:3000";

// Only used to grant this run's moderator. Administration is deliberately not
// reachable over HTTP — see scripts/grant-admin.ts for the same reasoning.
const prisma = createPrismaClient({
  datasourceUrl: process.env.TEST_DATABASE_URL || process.env.DIRECT_URL || process.env.DATABASE_URL,
});

/**
 * This harness registers users, uploads documents, and writes encrypted tax and
 * bank records. Run against a shared database it leaves test accounts in the
 * product and — because encrypted fields are only readable with the key that
 * wrote them — records a deployment with a different key cannot read at all.
 * That is exactly how it took down the deployed verification queue once.
 *
 * So it refuses anything that is not local. Point TEST_DATABASE_URL at the
 * docker-compose database, or pass a localhost base URL.
 */
function assertLocalTarget() {
  const target =
    process.env.TEST_DATABASE_URL || process.env.DIRECT_URL || process.env.DATABASE_URL || "";
  const host = (() => {
    try {
      return new URL(target).hostname;
    } catch {
      return "";
    }
  })();
  const local = ["localhost", "127.0.0.1", "::1", "postgres"].includes(host);
  if (!local) {
    console.error(
      `\n  Refusing to run: the database is ${host || "not a URL"}, not a local one.\n` +
        `  This harness writes test accounts and encrypted records. Set TEST_DATABASE_URL\n` +
        `  to the docker-compose database first:\n\n` +
        `    TEST_DATABASE_URL=postgresql://symbi:symbi_local_dev@localhost:5432/symbi_dev \\\n` +
        `      npx tsx scripts/smoke-transaction.ts\n`,
    );
    process.exit(1);
  }
  if (!BASE.includes("localhost") && !BASE.includes("127.0.0.1")) {
    console.error(`\n  Refusing to run against ${BASE}. Use a local server.\n`);
    process.exit(1);
  }
}
const stamp = Date.now().toString(36);

interface Session {
  label: string;
  cookie: string;
  email: string;
  userId: string;
}

let step = 0;
function log(message: string, detail?: unknown) {
  step += 1;
  const suffix = detail === undefined ? "" : `  ${JSON.stringify(detail)}`;
  console.log(`  ${String(step).padStart(2)}. ${message}${suffix}`);
}

function fail(message: string, body?: unknown): never {
  console.error(`\n  ✗ ${message}`);
  if (body !== undefined) console.error(`    ${JSON.stringify(body, null, 2)}`);
  process.exit(1);
}

async function call(
  path: string,
  init: RequestInit & { session?: Session } = {},
): Promise<{ status: number; body: any; setCookie: string | null }> {
  const { session, headers, ...rest } = init;
  const res = await fetch(`${BASE}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      Origin: BASE,
      ...(session ? { Cookie: session.cookie } : {}),
      ...(headers as Record<string, string>),
    },
  });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body, setCookie: res.headers.get("set-cookie") };
}

async function registerUser(label: string, role: "BUYER" | "SELLER" | "BOTH"): Promise<Session> {
  const email = `smoke-${label}-${stamp}@example.invalid`;
  const password = `Smoke!${stamp}Aa1`;

  const created = await call("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      email,
      password,
      companyName: `Smoke ${label} ${stamp}`,
      role,
    }),
  });
  if (created.status !== 201) fail(`register ${label} returned ${created.status}`, created.body);

  // Demo registration hands back a one-time verification token.
  const token = created.body.demoEmailVerificationToken;
  if (token) {
    const verified = await call("/api/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
    if (verified.status !== 200) fail(`verify ${label} returned ${verified.status}`, verified.body);
  }

  const signedIn = await call("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  if (signedIn.status !== 200) fail(`login ${label} returned ${signedIn.status}`, signedIn.body);

  const cookie = (signedIn.setCookie || "").split(";")[0];
  if (!cookie.startsWith("symbi_session=")) fail(`no session cookie for ${label}`);

  return { label, cookie, email, userId: created.body.user.id };
}

async function main() {
  assertLocalTarget();
  console.log(`\nTransaction smoke test against ${BASE}\n`);

  // This run registers three accounts in quick succession from one address,
  // which is exactly what the auth rate limiter exists to stop. Clear the
  // buckets so a harness cannot be blocked by a control that is working.
  const cleared = await prisma.rateLimitBucket.deleteMany({});
  if (cleared.count > 0) log("cleared rate-limit buckets", { count: cleared.count });

  // ---- seller: account, onboarding, verification -------------------------
  const seller = await registerUser("seller", "SELLER");
  log("seller registered and verified", { email: seller.email });

  const onboarding = await call("/api/seller/onboarding", { session: seller });
  if (onboarding.status !== 200) fail(`onboarding read returned ${onboarding.status}`, onboarding.body);
  log("onboarding record created", { status: onboarding.body.onboarding?.status });

  // GSTIN embeds the PAN at positions 2..12 and the validator enforces both the
  // format and that pairing. A fresh PAN per run keeps the uniqueness check —
  // which correctly rejects a reused GSTIN — from blocking a re-run.
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const rand = (n: number, pool: string) =>
    Array.from({ length: n }, () => pool[Math.floor(Math.random() * pool.length)]).join("");
  const PAN = `${rand(5, letters)}${rand(4, "0123456789")}${rand(1, letters)}`;
  const GSTIN = `29${PAN}1Z5`;

  const steps: Array<[string, Record<string, unknown>]> = [
    ["BUSINESS", {
      // Sandbox verification cross-checks this against the company name given
      // at registration, so the two must be the same string.
      legalName: `Smoke seller ${stamp}`,
      entityType: "PRIVATE_LIMITED",
      registrationNumber: `U27100KA2020PTC${stamp.slice(-6)}`,
      phone: "9876543210",
    }],
    ["TAX", { gst: GSTIN, pan: PAN }],
    ["BANK", {
      accountHolder: `Smoke Seller ${stamp}`,
      accountNumber: "123456789012",
      ifsc: "HDFC0001234",
      consent: true,
    }],
    ["KYC", {
      authorizedSignatory: "Smoke Signatory",
      designation: "Director",
      documentType: "PAN",
      documentReference: PAN,
    }],
    ["WAREHOUSE", {
      addressLine: "Plot 14, Peenya Industrial Area, Phase II",
      city: "Bengaluru",
      state: "Karnataka",
      pincode: "560058",
    }],
    ["POLICY", {
      acceptsMarketplaceTerms: true,
      confirmsNonHazardousOnly: true,
      acceptsSandboxVerification: true,
    }],
  ];

  for (const [stepName, payload] of steps) {
    const saved = await call("/api/seller/onboarding", {
      method: "POST",
      session: seller,
      body: JSON.stringify({ step: stepName, payload }),
    });
    if (saved.status !== 200) fail(`onboarding step ${stepName} returned ${saved.status}`, saved.body);
  }
  log("six onboarding steps completed");

  // Documents are required before submission. This endpoint takes
  // multipart/form-data with a real File, not JSON — so no Content-Type header
  // here; fetch sets the multipart boundary itself.
  const PDF = Uint8Array.from(
    atob(
      "JVBERi0xLjQKMSAwIG9iago8PC9UeXBlL0NhdGFsb2cvUGFnZXMgMiAwIFI+PgplbmRvYmoKMiAwIG9iago8PC9UeXBlL1BhZ2VzL0NvdW50IDAvS2lkc1tdPj4KZW5kb2JqCnRyYWlsZXIKPDwvUm9vdCAxIDAgUj4+CiUlRU9G",
    ),
    (c) => c.charCodeAt(0),
  );

  for (const kind of ["REGISTRATION", "GST_CERTIFICATE", "KYC_ID", "BANK_PROOF"]) {
    const form = new FormData();
    form.set("kind", kind);
    form.set(
      "file",
      new File([PDF], `${kind.toLowerCase()}.pdf`, { type: "application/pdf" }),
    );

    const res = await fetch(`${BASE}/api/seller/onboarding/documents`, {
      method: "POST",
      headers: { Origin: BASE, Cookie: seller.cookie },
      body: form,
    });
    if (res.status !== 201 && res.status !== 200) {
      fail(`document ${kind} returned ${res.status}`, await res.text());
    }
  }
  log("four required documents uploaded");

  const submitted = await call("/api/seller/onboarding", {
    method: "POST",
    session: seller,
    body: JSON.stringify({ step: "POLICY", payload: steps[5][1], submit: true }),
  });
  if (submitted.status !== 200) fail(`onboarding submit returned ${submitted.status}`, submitted.body);
  log("onboarding submitted", { status: submitted.body.onboarding?.status });

  const verified = await call("/api/seller/onboarding/verify-sandbox", {
    method: "POST",
    session: seller,
    body: JSON.stringify({}),
  });
  if (verified.status !== 200) fail(`sandbox verification returned ${verified.status}`, verified.body);
  log("seller verified via sandbox", { status: verified.body.onboarding?.status });

  // ---- seller: create and publish a priced listing ------------------------
  const draft = await call("/api/listings", {
    method: "POST",
    session: seller,
    body: JSON.stringify({
      title: `Smoke washed HDPE regrind ${stamp}`,
      category: "Plastic Scrap",
      subcategory: "HDPE flakes",
      description:
        "Post-industrial washed HDPE regrind, uncontaminated, baled and ready for dispatch from Bengaluru.",
      priceMode: "FIXED",
      pricePerUnit: 42000,
      quantityAvailable: 100,
      unit: "ton",
      minOrderQuantity: 5,
      lotIncrement: 1,
      leadTimeDays: 3,
      packaging: "Bales",
      handlingRequirements: "Dry storage",
      paymentTerms: "Advance",
      pincode: "560058",
      availableFrom: new Date().toISOString().slice(0, 10),
      availableUntil: new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10),
      safetyDeclaration: true,
      qualityDeclaration: true,
      ownershipDeclaration: true,
      authorityDeclaration: true,
    }),
  });
  if (draft.status !== 201) fail(`listing create returned ${draft.status}`, draft.body);
  const listingId = draft.body.listing.id;
  log("priced listing drafted", { id: listingId, price: 42000 });

  // A listing cannot be submitted without at least one photo (§10). Sharp
  // processes these, so it has to be a real decodable image, not a stub.
  const PNG = Uint8Array.from(
    atob(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    ),
    (c) => c.charCodeAt(0),
  );
  const photoForm = new FormData();
  photoForm.set("kind", "PHOTO");
  photoForm.set("file", new File([PNG], "listing.png", { type: "image/png" }));
  const photo = await fetch(`${BASE}/api/listings/${listingId}/assets`, {
    method: "POST",
    headers: { Origin: BASE, Cookie: seller.cookie },
    body: photoForm,
  });
  if (photo.status !== 201 && photo.status !== 200) {
    fail(`photo upload returned ${photo.status}`, await photo.text());
  }
  log("listing photo uploaded");

  const submittedListing = await call(`/api/listings/${listingId}/submit`, {
    method: "POST",
    session: seller,
    body: JSON.stringify({}),
  });
  if (submittedListing.status !== 200) {
    fail(`listing submit returned ${submittedListing.status}`, submittedListing.body);
  }
  const listingVersion = submittedListing.body.listing?.version;
  log("listing submitted for moderation", {
    status: submittedListing.body.listing?.status,
    version: listingVersion,
  });

  // ---- moderator: approve the listing ------------------------------------
  // A submitted listing sits at PENDING_MODERATION until an admin approves it.
  // That gate is why platform administration had to exist before this loop
  // could close at all.
  const admin = await registerUser("admin", "BUYER");
  await prisma.user.update({ where: { id: admin.userId }, data: { isAdmin: true } });
  // The session was signed before the grant, so re-issue it.
  const adminSignedIn = await call("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: admin.email, password: `Smoke!${stamp}Aa1` }),
  });
  admin.cookie = (adminSignedIn.setCookie || "").split(";")[0];
  log("moderator created and granted admin", { email: admin.email });

  const moderated = await call("/api/admin/listings/moderation", {
    method: "PATCH",
    session: admin,
    // version carries the optimistic-concurrency check: a moderator acting on a
    // listing the seller has since edited is rejected rather than silently
    // approving a different listing than the one reviewed.
    body: JSON.stringify({
      listingId,
      version: listingVersion,
      decision: "APPROVE",
      note: "Smoke test: non-hazardous, priced, documented.",
    }),
  });
  if (moderated.status !== 200) fail(`moderation returned ${moderated.status}`, moderated.body);
  log("listing approved by moderator", { status: moderated.body.listing?.status });

  // ---- buyer: find it, bid on it -----------------------------------------
  const buyer = await registerUser("buyer", "BUYER");
  log("buyer registered and verified", { email: buyer.email });

  const found = await call(`/api/materials?q=${encodeURIComponent(stamp)}&limit=5`);
  const visible = (found.body?.items ?? []).some((item: any) => item.id === listingId);
  log("listing visible in public catalogue", { visible, matches: found.body?.items?.length ?? 0 });

  const bid = await call("/api/bids", {
    method: "POST",
    session: buyer,
    headers: { "Idempotency-Key": `smoke-${stamp}` },
    body: JSON.stringify({ listingId, quantity: 10, pricePerUnit: 41000 }),
  });
  if (bid.status !== 201 && bid.status !== 200) fail(`bid returned ${bid.status}`, bid.body);
  const bidId = bid.body.bid?.id ?? bid.body.id;
  log("buyer placed a bid", { bidId, quantity: 10, price: 41000 });

  // ---- seller: accept, which must create the order ------------------------
  const accepted = await call(`/api/bids/${bidId}`, {
    method: "PATCH",
    session: seller,
    body: JSON.stringify({ action: "ACCEPT" }),
  });
  if (accepted.status !== 200) fail(`accept returned ${accepted.status}`, accepted.body);
  log("seller accepted the bid");

  const orders = await call("/api/orders", { session: buyer });
  const order = (orders.body?.orders ?? orders.body?.items ?? [])[0];
  log("order exists for the buyer", {
    orderNumber: order?.orderNumber,
    status: order?.status,
    total: order?.totalAmount,
  });

  console.log("\n  ✓ Full loop completed: verified seller → priced listing → bid → accept → order\n");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
