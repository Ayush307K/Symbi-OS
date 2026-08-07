import "dotenv/config";
import { createPrismaClient } from "@/lib/prisma";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { reserveAcceptedBid } from "@/server/orders";

// Concurrency integration test against a real PostgreSQL database.
//
// The oversell guard in reserveAcceptedBid is a conditional UPDATE:
//
//   UPDATE "MarketplaceListing"
//      SET "quantityAvailable" = "quantityAvailable" - n
//    WHERE id = ? AND "quantityAvailable" >= n
//
// Correctness depends on the database taking a row lock and re-evaluating that
// WHERE clause against the committed row once the lock is released. PostgreSQL
// does exactly this under READ COMMITTED, so a losing transaction sees
// count === 0 and raises INVENTORY_CONFLICT instead of driving the balance
// negative.
//
// SQLite could never exercise this: it serializes writers at the file level, so
// concurrent reservations were never truly concurrent and the guard was
// untested. This test only means something on PostgreSQL.
//
// It runs against the local docker-compose database, never the application's.
// That keeps the fixtures away from real data, and removes the connection
// pooler: a transaction-mode pooler multiplexes interactive transactions onto
// shared server connections, which would serialize the attempts and make the
// test prove nothing about concurrent access.

const CONCURRENT_ATTEMPTS = 20;
const AVAILABLE_QUANTITY = 5;
const QUANTITY_PER_BID = 1;

// Fewer units than concurrent attempts, so winners and losers are decided by
// genuine row-lock contention rather than by stock running out between waves.
const POOL_SIZE = CONCURRENT_ATTEMPTS + 5;

// Credentials match docker-compose.yml. Override for a different local server.
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  "postgresql://symbi:symbi_local_dev@localhost:5432/symbi_dev";

// Prisma's default pool is sized to the CPU count, which would queue the
// attempts and quietly serialize the race. Widen it so all of them are
// genuinely in flight against the same row at once.
function withPool(url: string) {
  const parsed = new URL(url);
  parsed.searchParams.set("connection_limit", String(POOL_SIZE));
  parsed.searchParams.set("pool_timeout", "60");
  return parsed.toString();
}

const prisma = createPrismaClient({ datasourceUrl: withPool(TEST_DATABASE_URL) });

// Skip rather than fail when the container is not running, so the suite stays
// green for anyone who has not started it. `docker compose up -d` enables it.
const databaseReachable: boolean = await prisma
  .$queryRaw`SELECT 1`
  .then(() => true)
  .catch(() => false);

// A remote database plus 20 interactive transactions needs more headroom than
// the 5s vitest and Prisma defaults allow.
const TEST_TIMEOUT_MS = 120_000;
const TRANSACTION_OPTIONS = { timeout: 30_000, maxWait: 60_000 };

const suffix = Math.random().toString(36).slice(2, 10);
const companyId = `test_company_${suffix}`;
const materialId = `test_material_${suffix}`;
const listingId = `test_listing_${suffix}`;
const buyerId = `test_buyer_${suffix}`;
const bidIds = Array.from(
  { length: CONCURRENT_ATTEMPTS },
  (_, index) => `test_bid_${suffix}_${index}`,
);

async function cleanup() {
  // Deleted child-first; the fixture rows are matched by the run-scoped suffix.
  await prisma.inventoryMovement.deleteMany({ where: { listingId } });
  await prisma.inventoryReservation.deleteMany({ where: { listingId } });
  const orders = await prisma.purchaseOrder.findMany({
    where: { buyerUserId: buyerId },
    select: { id: true },
  });
  const orderIds = orders.map((order) => order.id);
  await prisma.purchaseOrderItem.deleteMany({
    where: { OR: [{ listingId }, { orderId: { in: orderIds } }] },
  });
  await prisma.orderEvent.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.purchaseOrder.deleteMany({ where: { buyerUserId: buyerId } });
  await prisma.offerRevision.deleteMany({ where: { bidId: { in: bidIds } } });
  await prisma.bid.deleteMany({ where: { id: { in: bidIds } } });
  await prisma.marketplaceListing.deleteMany({ where: { id: listingId } });
  await prisma.wasteMaterial.deleteMany({ where: { id: materialId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
  await prisma.user.deleteMany({ where: { id: buyerId } });
}

describe.skipIf(!databaseReachable)(
  "inventory reservation under concurrency",
  () => {
    beforeAll(async () => {
      await cleanup();

      await prisma.company.create({
        data: {
          id: companyId,
          name: `Concurrency Test Seller ${suffix}`,
          industry: "Recycling",
          location: "Bengaluru, Karnataka",
          carbonRating: "B",
          latitude: 12.9716,
          longitude: 77.5946,
          capacity: 1000,
        },
      });

      await prisma.wasteMaterial.create({
        data: {
          id: materialId,
          name: `Concurrency Test Material ${suffix}`,
          toxicityLevel: "none",
          baseElement: "Aluminium",
          category: "Metal Scrap",
          description: "Fixture material for the inventory concurrency test.",
        },
      });

      await prisma.user.create({
        data: {
          id: buyerId,
          email: `concurrency-${suffix}@test.invalid`,
          passwordHash: "not-a-real-hash",
          role: "BUYER",
          companyName: `Concurrency Test Buyer ${suffix}`,
        },
      });

      await prisma.marketplaceListing.create({
        data: {
          id: listingId,
          title: `Concurrency Test Listing ${suffix}`,
          slug: `concurrency-test-listing-${suffix}`,
          sourceType: "seller_submitted",
          materialId,
          sellerCompanyId: companyId,
          category: "Metal Scrap",
          subcategory: "Aluminium",
          area: "Peenya",
          city: "Bengaluru",
          state: "Karnataka",
          country: "India",
          pricePerUnit: 1000,
          minOrderQuantity: 1,
          quantityAvailable: AVAILABLE_QUANTITY,
          leadTimeDays: 3,
          rating: 4.5,
          responseRate: 90,
          yearsActive: 2,
          ordersCompleted: 10,
          description: "Fixture listing for the inventory concurrency test.",
          packaging: "Loose",
          paymentTerms: "Advance",
          status: "ACTIVE",
        },
      });

      await prisma.bid.createMany({
        data: bidIds.map((id) => ({
          id,
          materialName: `Concurrency Test Material ${suffix}`,
          materialId,
          listingId,
          quantity: QUANTITY_PER_BID,
          pricePerUnit: 1000,
          currency: "INR",
          unit: "ton",
          status: "ACCEPTED",
          bidderUserId: buyerId,
          bidderEmail: `concurrency-${suffix}@test.invalid`,
          bidderCompany: `Concurrency Test Buyer ${suffix}`,
        })),
      });
    }, TEST_TIMEOUT_MS);

    afterAll(async () => {
      await cleanup();
      await prisma.$disconnect();
    }, TEST_TIMEOUT_MS);

    it("never oversells and reserves exactly the available quantity", async () => {
      const bids = await prisma.bid.findMany({ where: { id: { in: bidIds } } });
      expect(bids).toHaveLength(CONCURRENT_ATTEMPTS);

      // Fire every reservation at once. Each runs in its own transaction and
      // races the others for the same listing row.
      const outcomes = await Promise.allSettled(
        bids.map((bid) =>
          prisma.$transaction(
            (tx) => reserveAcceptedBid(tx, bid, buyerId),
            TRANSACTION_OPTIONS,
          ),
        ),
      );

      const succeeded = outcomes.filter((o) => o.status === "fulfilled");
      const failed = outcomes.filter((o) => o.status === "rejected");

      const listing = await prisma.marketplaceListing.findUniqueOrThrow({
        where: { id: listingId },
      });

      // The invariant that matters: inventory is never negative.
      expect(listing.quantityAvailable).toBeGreaterThanOrEqual(0);

      // Exactly the available quantity is sold, no more and no less.
      const expectedWinners = AVAILABLE_QUANTITY / QUANTITY_PER_BID;
      expect(succeeded).toHaveLength(expectedWinners);
      expect(failed).toHaveLength(CONCURRENT_ATTEMPTS - expectedWinners);
      expect(listing.quantityAvailable).toBe(0);

      // Losers are rejected deliberately, not by an unexpected crash.
      for (const outcome of failed) {
        const reason = (outcome as PromiseRejectedResult).reason;
        expect(reason).toMatchObject({ status: 409 });
        expect(["INVENTORY_CONFLICT", "LISTING_UNAVAILABLE"]).toContain(
          reason.code,
        );
      }

      // The ledger agrees with the listing: one reservation per winner, and the
      // movements sum to exactly what left the shelf.
      const reservations = await prisma.inventoryReservation.findMany({
        where: { listingId },
      });
      expect(reservations).toHaveLength(expectedWinners);
      expect(reservations.every((r) => r.status === "ACTIVE")).toBe(true);
      expect(reservations.reduce((sum, r) => sum + r.quantity, 0)).toBe(
        AVAILABLE_QUANTITY,
      );

      const movements = await prisma.inventoryMovement.findMany({
        where: { listingId },
      });
      expect(movements.reduce((sum, m) => sum + m.quantityChange, 0)).toBe(
        -AVAILABLE_QUANTITY,
      );

      // One order per winning bid — no duplicate orders against one reservation.
      const orders = await prisma.purchaseOrder.findMany({
        where: { buyerUserId: buyerId },
      });
      expect(orders).toHaveLength(expectedWinners);
    }, TEST_TIMEOUT_MS);
  },
);
