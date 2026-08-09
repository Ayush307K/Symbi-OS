import "dotenv/config";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { MARKETPLACE_RANKING_CONFIG } from "@/server/feed/config";
import { getEmbeddingProvider } from "@/server/semantic/embedding-provider";
import { refreshListingEmbedding } from "@/server/semantic/listing-embeddings";

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
  const afterIndex = process.argv.indexOf("--after");
  let after = afterIndex === -1 ? "" : process.argv[afterIndex + 1] || "";
  let completed = 0;
  let failed = 0;
  const provider = getEmbeddingProvider();

  for (;;) {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT "id"
                 FROM "MarketplaceListing"
                 WHERE "id" > ${after}
                   ${force ? Prisma.empty : Prisma.sql`AND "embedding" IS NULL`}
                 ORDER BY "id" ASC
                 LIMIT ${batchSize}`,
    );
    if (rows.length === 0) break;

    for (let index = 0; index < rows.length; index += concurrency) {
      const chunk = rows.slice(index, index + concurrency);
      const results = await Promise.allSettled(
        chunk.map((row) => refreshListingEmbedding(row.id, provider)),
      );
      for (const [offset, result] of results.entries()) {
        if (result.status === "fulfilled") completed += 1;
        else {
          failed += 1;
          console.error("[EmbeddingBackfill] failed", {
            listingId: chunk[offset].id,
            error: result.reason instanceof Error ? result.reason.message : result.reason,
          });
        }
      }
    }
    after = rows[rows.length - 1].id;
    console.log(`[EmbeddingBackfill] completed=${completed} failed=${failed} after=${after}`);
  }

  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
