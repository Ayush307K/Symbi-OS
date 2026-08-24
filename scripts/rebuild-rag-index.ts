import { rebuildKnowledgeIndex } from "../server/rag/index";

const includeEval = process.argv.includes("--include-eval");
if (includeEval && process.env.RAG_EVAL_ENABLED !== "true") {
  throw new Error("--include-eval requires RAG_EVAL_ENABLED=true.");
}

rebuildKnowledgeIndex({ includeEval })
  .then((result) => {
    const verbose = process.argv.includes("--verbose");
    console.log(
      JSON.stringify(
        {
          ...result,
          embeddingFailureCount: result.embeddingFailures.length,
          embeddingFailures: verbose
            ? result.embeddingFailures
            : result.embeddingFailures.slice(0, 5),
        },
        null,
        2,
      ),
    );
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
