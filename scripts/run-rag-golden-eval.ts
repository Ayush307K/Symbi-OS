import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { GOLDEN_SET, type GoldenCase } from "@/eval/golden-set";
import { EVAL_LISTINGS } from "@/eval/fixtures/listings";

type ApiResponse = {
  answer?: string;
  citations?: Array<{
    id: string;
    title: string;
    sourceId: string | null;
    isEvalOnly: boolean;
  }>;
  retrieval?: {
    mode: string;
    resultCount: number;
    degraded?: boolean;
  };
  error?: string;
  code?: string;
};

type CaseResult = {
  id: string;
  scenario: GoldenCase["scenario"];
  targetSource: GoldenCase["targetSource"];
  latencyMs: number;
  status: number;
  retrievedListingIds: string[];
  hitAt1: boolean;
  hitAtK: boolean;
  reciprocalRank: number;
  refused: boolean;
  falseRefusal: boolean;
  noMatchFalsePositive: boolean;
  decoyFalsePositiveAt1: boolean;
  decoyFalsePositiveAtK: boolean;
  adversarialFollowed: boolean;
  degraded: boolean;
  error?: string;
};

const endpoint = new URL(
  "/api/rag/query",
  process.env.RAG_EVAL_BASE_URL || "http://localhost:3000",
).toString();
const evalKey = process.env.RAG_EVAL_KEY?.trim() ?? "";
const topK = Math.min(10, Math.max(1, Number(process.env.RAG_EVAL_TOP_K || 6)));
const concurrency = Math.min(
  12,
  Math.max(1, Number(process.env.RAG_EVAL_CONCURRENCY || 4)),
);
const decoyIds = new Set(
  EVAL_LISTINGS.filter((listing) => listing.tags.includes("decoy")).map(
    (listing) => `eval_listing_${listing.key}`,
  ),
);

if (evalKey.length < 32) {
  throw new Error("RAG_EVAL_KEY must contain at least 32 characters.");
}

function isRefusal(answer: string, resultCount: number) {
  return (
    resultCount === 0 ||
    /could not find|cannot find|insufficient (?:verified )?(?:evidence|information)|no (?:verified )?(?:listing|match|result)|do not have enough/i.test(
      answer,
    )
  );
}

async function runCase(testCase: GoldenCase): Promise<CaseResult> {
  const started = performance.now();
  let status = 0;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-rag-eval-key": evalKey,
      },
      body: JSON.stringify({
        query: testCase.query,
        topK,
        corpus: "real_and_eval",
      }),
    });
    status = response.status;
    const body = (await response.json()) as ApiResponse;
    if (!response.ok) {
      throw new Error(`${body.code || response.status}: ${body.error || "request failed"}`);
    }
    const citations = body.citations ?? [];
    const retrieved = citations.flatMap((citation) =>
      citation.sourceId ? [citation.sourceId] : [],
    );
    const expected = new Set(testCase.expectedListingIds);
    const firstRelevant = retrieved.findIndex((id) => expected.has(id));
    const resultCount = body.retrieval?.resultCount ?? citations.length;
    const refused = isRefusal(body.answer ?? "", resultCount);
    const unexpectedDecoys = new Set(
      [...decoyIds].filter((id) => !expected.has(id)),
    );
    const adversarialFollowed = (testCase.forbiddenOutput ?? []).some((value) =>
      (body.answer ?? "").includes(value),
    );
    return {
      id: testCase.id,
      scenario: testCase.scenario,
      targetSource: testCase.targetSource,
      latencyMs: performance.now() - started,
      status,
      retrievedListingIds: retrieved,
      hitAt1:
        testCase.expectedRefusal === true ? refused : expected.has(retrieved[0] ?? ""),
      hitAtK:
        testCase.expectedRefusal === true ? refused : retrieved.some((id) => expected.has(id)),
      reciprocalRank: firstRelevant >= 0 ? 1 / (firstRelevant + 1) : 0,
      refused,
      falseRefusal: testCase.expectedRefusal !== true && refused,
      noMatchFalsePositive: testCase.expectedRefusal === true && !refused,
      decoyFalsePositiveAt1: unexpectedDecoys.has(retrieved[0] ?? ""),
      decoyFalsePositiveAtK: retrieved.some((id) => unexpectedDecoys.has(id)),
      adversarialFollowed,
      degraded: body.retrieval?.degraded === true,
    };
  } catch (error) {
    return {
      id: testCase.id,
      scenario: testCase.scenario,
      targetSource: testCase.targetSource,
      latencyMs: performance.now() - started,
      status,
      retrievedListingIds: [],
      hitAt1: false,
      hitAtK: false,
      reciprocalRank: 0,
      refused: false,
      falseRefusal: false,
      noMatchFalsePositive: false,
      decoyFalsePositiveAt1: false,
      decoyFalsePositiveAtK: false,
      adversarialFollowed: false,
      degraded: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function parallelMap<T, R>(
  values: T[],
  limit: number,
  task: (value: T) => Promise<R>,
) {
  const results = new Array<R>(values.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, values.length) }, async () => {
      while (cursor < values.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await task(values[index]);
      }
    }),
  );
  return results;
}

function percentile(values: number[], fraction: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

function rate(numerator: number, denominator: number) {
  return denominator ? numerator / denominator : 0;
}

function summarize(results: CaseResult[]) {
  const successful = results.filter((result) => !result.error);
  const matched = successful.filter((result) => result.targetSource !== "none");
  const noMatch = successful.filter((result) => result.targetSource === "none");
  const adversarial = successful.filter((result) => result.scenario === "adversarial");
  const groups = new Map<string, CaseResult[]>();
  for (const result of successful) {
    const key = `${result.scenario}::${result.targetSource}`;
    groups.set(key, [...(groups.get(key) ?? []), result]);
  }
  const breakdown = Object.fromEntries(
    [...groups.entries()].map(([key, rows]) => [
      key,
      {
        cases: rows.length,
        hitAt1: rate(rows.filter((row) => row.hitAt1).length, rows.length),
        hitAtK: rate(rows.filter((row) => row.hitAtK).length, rows.length),
        mrr: rate(
          rows.reduce((sum, row) => sum + row.reciprocalRank, 0),
          rows.filter((row) => row.targetSource !== "none").length,
        ),
      },
    ]),
  );
  return {
    executedAt: new Date().toISOString(),
    endpoint,
    corpus: "real_and_eval",
    topK,
    concurrency,
    cases: results.length,
    successfulRequests: successful.length,
    requestErrors: results.length - successful.length,
    breakdown,
    falseRefusalRate: rate(
      matched.filter((result) => result.falseRefusal).length,
      matched.length,
    ),
    noMatchFalsePositiveRate: rate(
      noMatch.filter((result) => result.noMatchFalsePositive).length,
      noMatch.length,
    ),
    noMatchRefusalRate: rate(
      noMatch.filter((result) => result.refused).length,
      noMatch.length,
    ),
    decoyFalsePositiveAt1Rate: rate(
      matched.filter((result) => result.decoyFalsePositiveAt1).length,
      matched.length,
    ),
    decoyFalsePositiveAtKRate: rate(
      matched.filter((result) => result.decoyFalsePositiveAtK).length,
      matched.length,
    ),
    adversarialFollowRate: rate(
      adversarial.filter((result) => result.adversarialFollowed).length,
      adversarial.length,
    ),
    degradedRetrievalRate: rate(
      successful.filter((result) => result.degraded).length,
      successful.length,
    ),
    latencyMs: {
      p50: percentile(successful.map((result) => result.latencyMs), 0.5),
      p95: percentile(successful.map((result) => result.latencyMs), 0.95),
    },
  };
}

function percent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function markdown(summary: ReturnType<typeof summarize>, results: CaseResult[]) {
  const breakdownRows = Object.entries(summary.breakdown)
    .map(
      ([key, value]) =>
        `| ${key.replace("::", " / ")} | ${value.cases} | ${percent(value.hitAt1)} | ${percent(value.hitAtK)} | ${value.mrr.toFixed(3)} |`,
    )
    .join("\n");
  const failures = results
    .filter((result) => result.error || !result.hitAtK || result.adversarialFollowed)
    .map(
      (result) =>
        `- ${result.id}: ${result.error || `retrieved ${result.retrievedListingIds.join(", ") || "nothing"}`}`,
    )
    .join("\n");
  return `# Symbi-OS RAG golden evaluation\n\n` +
    `Executed: ${summary.executedAt}\n\n` +
    `Endpoint: ${summary.endpoint}\n\n` +
    `Corpus: ${summary.corpus}; topK: ${summary.topK}; concurrency: ${summary.concurrency}\n\n` +
    `## Source/scenario breakdown\n\n` +
    `| Scenario / source | Cases | Hit@1 | Hit@K | MRR |\n|---|---:|---:|---:|---:|\n${breakdownRows}\n\n` +
    `## Safety and refusal metrics\n\n` +
    `- False-refusal rate: ${percent(summary.falseRefusalRate)}\n` +
    `- No-match refusal rate: ${percent(summary.noMatchRefusalRate)}\n` +
    `- No-match false-positive rate: ${percent(summary.noMatchFalsePositiveRate)}\n` +
    `- Decoy false-positive rate @1: ${percent(summary.decoyFalsePositiveAt1Rate)}\n` +
    `- Decoy false-positive rate @K: ${percent(summary.decoyFalsePositiveAtKRate)}\n` +
    `- Adversarial instruction-follow rate: ${percent(summary.adversarialFollowRate)}\n` +
    `- Degraded retrieval rate: ${percent(summary.degradedRetrievalRate)}\n` +
    `- Latency p50/p95: ${summary.latencyMs.p50.toFixed(0)} ms / ${summary.latencyMs.p95.toFixed(0)} ms\n\n` +
    `## Misses and request failures\n\n${failures || "None."}\n`;
}

async function main() {
  const results = await parallelMap(GOLDEN_SET, concurrency, runCase);
  const summary = summarize(results);
  const outputDirectory = resolve(
    process.env.RAG_EVAL_OUTPUT_DIR || ".data/rag-eval",
  );
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    writeFile(
      resolve(outputDirectory, "latest.json"),
      JSON.stringify({ summary, results }, null, 2),
    ),
    writeFile(resolve(outputDirectory, "latest.md"), markdown(summary, results)),
  ]);
  console.log(JSON.stringify(summary, null, 2));
  if (summary.requestErrors > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
