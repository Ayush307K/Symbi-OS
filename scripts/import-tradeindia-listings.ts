import "dotenv/config";
import { importRealListings } from "@/server/listings/import";
import { REAL_CORPUS_TARGETS } from "@/server/listings/corpus-targets";
import { TradeIndiaProvider } from "@/server/listings/providers";

const dryRun = process.argv.includes("--dry-run");

importRealListings(new TradeIndiaProvider(), {
  dryRun,
  targets: REAL_CORPUS_TARGETS,
})
  .then((result) => console.log(JSON.stringify(result, null, 2)))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
