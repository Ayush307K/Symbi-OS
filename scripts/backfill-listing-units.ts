import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { LISTING_UNITS, normalizeListingUnit } from "@/lib/listing-constants";

/**
 * Rewrite non-canonical listing units onto the enum.
 *
 *   npx tsx scripts/backfill-listing-units.ts          # report only
 *   npx tsx scripts/backfill-listing-units.ts --apply  # write
 *
 * The importer wrote the supplier's own wording ("Tons") straight through,
 * while every other path enforces LISTING_UNITS. Matching compares units by
 * equality, so those rows can never satisfy an RFQ — the demand engine returns
 * nothing and looks broken rather than empty.
 *
 * Dry run by default, and it prints the exact rows it would touch, because this
 * is the kind of write that reaches production data.
 */
const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

const apply = process.argv.includes("--apply");

async function main() {
  let host = "unknown";
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname;
  } catch {
    /* reported as unknown */
  }

  const listings = await prisma.marketplaceListing.findMany({
    where: { unit: { notIn: [...LISTING_UNITS] } },
    select: { id: true, unit: true, title: true },
  });

  console.log(`\n  database: ${host}`);
  console.log(`  mode:     ${apply ? "APPLY (writing)" : "dry run"}`);
  console.log(`  rows with a non-canonical unit: ${listings.length}\n`);

  if (listings.length === 0) {
    console.log("  Nothing to do.\n");
    return;
  }

  const plan = new Map<string, { to: string | null; count: number }>();
  for (const listing of listings) {
    const to = normalizeListingUnit(listing.unit);
    const entry = plan.get(listing.unit) ?? { to, count: 0 };
    entry.count += 1;
    plan.set(listing.unit, entry);
  }

  for (const [from, { to, count }] of plan) {
    console.log(
      to
        ? `    ${String(count).padStart(4)}  "${from}" -> "${to}"`
        : `    ${String(count).padStart(4)}  "${from}" -> UNRECOGNISED, left alone`,
    );
  }

  if (!apply) {
    console.log("\n  Re-run with --apply to write these changes.\n");
    return;
  }

  let updated = 0;
  for (const [from, { to }] of plan) {
    if (!to) continue;
    const result = await prisma.marketplaceListing.updateMany({
      where: { unit: from },
      data: { unit: to },
    });
    updated += result.count;
  }
  console.log(`\n  updated ${updated} listing(s).\n`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
