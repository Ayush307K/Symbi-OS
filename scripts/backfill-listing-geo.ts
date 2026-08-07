import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { locateCity } from "@/lib/geo/india-cities";

/**
 * Give listings the coordinates that distance matching requires.
 *
 *   npx tsx scripts/backfill-listing-geo.ts          # report only
 *   npx tsx scripts/backfill-listing-geo.ts --apply  # write
 *
 * scoreCandidate drops any listing without a latitude when the buyer asks for a
 * radius, so with none of them geocoded the distance filter could only ever
 * return nothing. Coordinates are taken from the listing's own stated city.
 *
 * The scraped state column is separately unreliable — "Mumbai / Rajasthan",
 * "Mundra / Hamburg" — and location scoring compares against it, so a known
 * city also corrects a contradicting state. Cities we do not recognise are left
 * exactly as they are rather than guessed at.
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
    where: { OR: [{ latitude: null }, { longitude: null }] },
    select: { id: true, city: true, state: true },
  });

  console.log(`\n  database: ${host}`);
  console.log(`  mode:     ${apply ? "APPLY (writing)" : "dry run"}`);
  console.log(`  listings missing coordinates: ${listings.length}\n`);

  const plan: Array<{
    id: string;
    city: string;
    latitude: number;
    longitude: number;
    stateFrom: string | null;
    stateTo: string | null;
  }> = [];
  const unknown = new Map<string, number>();

  for (const listing of listings) {
    const point = locateCity(listing.city);
    if (!point) {
      const label = listing.city || "(no city)";
      unknown.set(label, (unknown.get(label) ?? 0) + 1);
      continue;
    }
    plan.push({
      id: listing.id,
      city: point.city,
      latitude: point.latitude,
      longitude: point.longitude,
      stateFrom: listing.state,
      stateTo: listing.state === point.state ? null : point.state,
    });
  }

  const byCity = new Map<string, { total: number; restated: number }>();
  for (const item of plan) {
    const entry = byCity.get(item.city) ?? { total: 0, restated: 0 };
    entry.total += 1;
    if (item.stateTo) entry.restated += 1;
    byCity.set(item.city, entry);
  }

  console.log(`  geocodable: ${plan.length}`);
  for (const [city, { total, restated }] of [...byCity].sort((a, b) => b[1].total - a[1].total)) {
    console.log(
      `    ${String(total).padStart(4)}  ${city}${restated ? `  (${restated} with a contradicting state)` : ""}`,
    );
  }

  if (unknown.size) {
    console.log(`\n  not in the gazetteer, left alone:`);
    for (const [city, count] of unknown) console.log(`    ${String(count).padStart(4)}  ${city}`);
  }

  if (!apply) {
    console.log("\n  Re-run with --apply to write these changes.\n");
    return;
  }

  let updated = 0;
  for (const item of plan) {
    await prisma.marketplaceListing.update({
      where: { id: item.id },
      data: {
        latitude: item.latitude,
        longitude: item.longitude,
        ...(item.stateTo ? { state: item.stateTo } : {}),
      },
    });
    updated += 1;
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
