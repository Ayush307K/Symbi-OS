import { timingSafeEqual } from "node:crypto";
import { ApiError } from "@/server/http";

export const RAG_EVAL_KEY_HEADER = "x-rag-eval-key";

function secretsMatch(provided: string, expected: string) {
  const providedBytes = Buffer.from(provided, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  return (
    providedBytes.length === expectedBytes.length &&
    timingSafeEqual(providedBytes, expectedBytes)
  );
}

/**
 * Evaluation documents are never reachable through normal buyer auth. The
 * separate key is intended for local/CI regression runners and is disabled
 * unless the deployment opts in explicitly.
 */
export function assertRagEvaluationAccess(request: Request) {
  if (process.env.RAG_EVAL_ENABLED !== "true") {
    throw new ApiError(404, "Evaluation retrieval is not enabled.", "NOT_FOUND");
  }
  const expected = process.env.RAG_EVAL_KEY?.trim() ?? "";
  const provided = request.headers.get(RAG_EVAL_KEY_HEADER)?.trim() ?? "";
  if (expected.length < 32 || !provided || !secretsMatch(provided, expected)) {
    throw new ApiError(403, "Evaluation access denied.", "RAG_EVAL_FORBIDDEN");
  }
}
