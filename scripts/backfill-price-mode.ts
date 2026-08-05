import "dotenv/config";
import { PrismaClient } from "@prisma/client";

// Connect directly rather than through the application's pooled URL. A one-off
// bulk update should not compete for the pooler's client slots with the running
// app, and DIRECT_URL is the connection intended for exactly this kind of
// maintenance work.
const prisma = new PrismaClient({
  datasourceUrl: process.env.DIRECT_URL || process.env.DATABASE_URL,
});

/**
 * One-off backfill.
 *
 * The importer used to leave priceMode at its schema default of FIXED, so every
 * listing whose source published no price was stored as a fixed price of ₹0.
 * Those rows are indistinguishable from a genuine free listing: they sorted to
 * the top of price ascending, passed a maxPrice filter, and rendered as "₹0".
 *
 * FIXED with a non-positive price is not a meaningful state, so every such row
 * is really ON_REQUEST. Safe to re-run: the WHERE clause matches nothing once
 * the rows are converted.
 */
async function main() {
  const candidates = await prisma.marketplaceListing.count({
    where: { priceMode: "FIXED", pricePerUnit: { lte: 0 } },
  });

  if (candidates === 0) {
    console.log("Nothing to backfill: no FIXED listing has a non-positive price.");
    return;
  }

  const result = await prisma.marketplaceListing.updateMany({
    where: { priceMode: "FIXED", pricePerUnit: { lte: 0 } },
    data: { priceMode: "ON_REQUEST" },
  });

  const remaining = await prisma.marketplaceListing.count({
    where: { priceMode: "FIXED", pricePerUnit: { lte: 0 } },
  });

  console.log(
    JSON.stringify(
      {
        candidates,
        updated: result.count,
        remainingInvalid: remaining,
        priceModeCounts: await counts(),
      },
      null,
      2,
    ),
  );

  if (remaining > 0) {
    throw new Error(`${remaining} listings still hold FIXED with a non-positive price.`);
  }
}

async function counts() {
  const grouped = await prisma.marketplaceListing.groupBy({
    by: ["priceMode"],
    _count: { _all: true },
  });
  return Object.fromEntries(
    grouped.map((row) => [row.priceMode, row._count._all]),
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
