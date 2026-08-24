import "dotenv/config";
import prisma from "@/lib/prisma";
import { refreshMaterialEdges } from "@/server/feed/material-edges";

const includeEval = process.argv.includes("--include-eval");
if (includeEval && process.env.RAG_EVAL_ENABLED !== "true") {
  throw new Error("--include-eval requires RAG_EVAL_ENABLED=true.");
}

refreshMaterialEdges(prisma, new Date(), { includeEval })
  .then((counts) => console.log("[MaterialEdges] refresh complete", counts))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
