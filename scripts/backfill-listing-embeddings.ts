import "dotenv/config";
import prisma from "@/lib/prisma";
import { MARKETPLACE_RANKING_CONFIG } from "@/server/feed/config";
import { refreshStaleListingEmbeddings } from "@/server/semantic/embedding-maintenance";

function integerArg(name: string, fallback: number) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  const value = Number(process.argv[index + 1]);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

async function main() {
  const batchSize = integerArg(
    "--batch-size",
    MARKETPLACE_RANKING_CONFIG.embedding.backfillBatchSize,
  );
  const concurrency = integerArg(
    "--concurrency",
    MARKETPLACE_RANKING_CONFIG.embedding.backfillConcurrency,
  );
  const force = process.argv.includes("--force");
  const includeEval = process.argv.includes("--include-eval");
  if (includeEval && process.env.RAG_EVAL_ENABLED !== "true") {
    throw new Error("--include-eval requires RAG_EVAL_ENABLED=true.");
  }
  const afterIndex = process.argv.indexOf("--after");
  const result = await refreshStaleListingEmbeddings({
    batchSize,
    concurrency,
    after: afterIndex === -1 ? "" : process.argv[afterIndex + 1] || "",
    force,
    includeEval,
  });
  console.log(JSON.stringify(result, null, 2));
  if (result.failed > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
