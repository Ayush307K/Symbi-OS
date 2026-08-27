import "dotenv/config";
import prisma from "@/lib/prisma";
import { EVAL_LISTINGS, EVAL_LISTING_ID } from "@/eval/fixtures/listings";
import {
  REAL_CORPUS_BASELINE_TARGETS,
  REAL_CORPUS_TARGETS,
} from "@/server/listings/corpus-targets";
import { seedEvaluationCatalog } from "@/server/listings/eval-catalog";
import { importRealListings } from "@/server/listings/import";
import { publicListingWhere } from "@/server/listings/policy";
import {
  RecycleInMeProvider,
  TradeIndiaProvider,
} from "@/server/listings/providers";

const activeStatus = { in: ["ACTIVE", "active"] };
const evalListingIds = EVAL_LISTINGS.map((listing) => EVAL_LISTING_ID(listing.key));

async function realCounts() {
  const rows = await prisma.marketplaceListing.groupBy({
    by: ["category"],
    where: {
      isEvalOnly: false,
      status: activeStatus,
      sourceType: { in: ["real_api", "real_public_provider", "seller_submitted"] },
      category: { in: Object.keys(REAL_CORPUS_TARGETS) },
    },
    _count: { _all: true },
  });
  return Object.fromEntries(rows.map((row) => [row.category, row._count._all]));
}

function hasShortfall(
  counts: Record<string, number>,
  targets: Record<string, number>,
) {
  return Object.entries(targets).some(
    ([category, target]) => (counts[category] ?? 0) < target,
  );
}

async function main() {
  const beforeReal = await realCounts();
  const beforeEval = await prisma.marketplaceListing.count({
    where: { id: { in: evalListingIds }, isEvalOnly: true, status: activeStatus },
  });

  const baselineImport = hasShortfall(beforeReal, REAL_CORPUS_BASELINE_TARGETS)
    ? await importRealListings(new RecycleInMeProvider(), {
        targets: REAL_CORPUS_BASELINE_TARGETS,
        refreshEmbeddings: false,
      })
    : { skipped: true, reason: "baseline corpus already meets every category target" };
  const afterBaseline = await realCounts();
  const expansionImport = hasShortfall(afterBaseline, REAL_CORPUS_TARGETS)
    ? await importRealListings(new TradeIndiaProvider(), {
        targets: REAL_CORPUS_TARGETS,
        // Deployment must not wait on dozens of external embedding requests.
        // The normal backfill job can populate these vectors independently.
        refreshEmbeddings: false,
      })
    : { skipped: true, reason: "real corpus already meets every category target" };

  const evalSeed =
    beforeEval < EVAL_LISTINGS.length
      ? await seedEvaluationCatalog({ refreshEmbeddings: false })
      : { listings: beforeEval, embedded: 0, skipped: true };

  const afterReal = await realCounts();
  const afterEval = await prisma.marketplaceListing.count({
    where: { id: { in: evalListingIds }, isEvalOnly: true, status: activeStatus },
  });
  const visible = await prisma.marketplaceListing.count({ where: publicListingWhere });

  if (hasShortfall(afterReal, REAL_CORPUS_TARGETS) || afterEval !== EVAL_LISTINGS.length) {
    throw new Error(
      `Catalogue synchronization was incomplete: real=${JSON.stringify(afterReal)}, ` +
        `synthetic=${afterEval}/${EVAL_LISTINGS.length}.`,
    );
  }

  console.log(
    JSON.stringify(
      {
        before: { realByCategory: beforeReal, synthetic: beforeEval },
        operations: { baselineImport, expansionImport, evalSeed },
        after: { realByCategory: afterReal, synthetic: afterEval, visible },
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
