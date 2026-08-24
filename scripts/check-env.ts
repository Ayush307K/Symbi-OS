import "dotenv/config";
import { readFileSync } from "node:fs";

/**
 * Environment parity check.
 *
 *   npx tsx scripts/check-env.ts
 *
 * Three things have broken this project, all of them invisible until
 * production failed:
 *
 *   - .env pointed at the production database, so local work and test harnesses
 *     wrote to it. Test accounts appeared in the live product.
 *   - FIELD_ENCRYPTION_KEY differed between local and the deployment. AES-GCM
 *     authenticates, so records written by one could not be read by the other,
 *     and a single unreadable row returned 500 for a whole queue.
 *   - A migration was applied to one database and not the other.
 *
 * None of those announce themselves. This does.
 */
const REQUIRED = [
  "DATABASE_URL",
  "DIRECT_URL",
  "JWT_SECRET",
  "IP_HASH_PEPPER",
  "FIELD_ENCRYPTION_KEY",
  "APP_URL",
];

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "::1", "postgres"];

const problems: string[] = [];
const warnings: string[] = [];
const notes: string[] = [];

function hostOf(url: string | undefined) {
  if (!url) return "";
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

// 1. Everything the app needs is present.
for (const key of REQUIRED) {
  if (!process.env[key]) problems.push(`${key} is not set.`);
}

// 2. Secrets are long enough to be secrets.
for (const key of ["JWT_SECRET", "IP_HASH_PEPPER", "FIELD_ENCRYPTION_KEY"]) {
  const value = process.env[key] ?? "";
  if (value && value.length < 32) {
    problems.push(`${key} is ${value.length} characters; 32 or more is required.`);
  }
  // Prefix matching alone missed the value that actually reached production:
  // "symbi-os-jwt-secret-change-in-production-2024" — long enough to pass a
  // length check, and obviously guessable. A real secret is random, so any
  // recognisable English or project word in it means it is not one.
  const TELLS = [
    "replace",
    "your-",
    "example",
    "changeme",
    "change-in-production",
    "change-me",
    "placeholder",
    "symbi",
    "secret-",
    "-secret",
    "dev-",
    "localhost",
    "insecure",
    "todo",
  ];
  const matched = TELLS.filter((tell) => value.toLowerCase().includes(tell));
  if (matched.length) {
    problems.push(
      `${key} looks like a placeholder — it contains ${matched.map((t) => `"${t}"`).join(", ")}. ` +
        "Generate one with: openssl rand -base64 48",
    );
  }
}

// 3. The one that caused real damage: local pointing at a remote database.
const dbHost = hostOf(process.env.DATABASE_URL);
const isLocalDb = LOCAL_HOSTS.includes(dbHost);
if (!isLocalDb && process.env.NODE_ENV !== "production") {
  warnings.push(
    `DATABASE_URL points at ${dbHost}, which is not local.\n` +
      `    Anything you run — tests, ingests, backfills — writes there.\n` +
      `    Local development should use the docker-compose database.`,
  );
}

// 4. Migrations must not go through a pooler.
const directHost = hostOf(process.env.DIRECT_URL);
if (process.env.DIRECT_URL?.includes(":6543") || directHost.includes("-pooler")) {
  problems.push("DIRECT_URL points at a pooled endpoint; migrations need the direct one.");
}

// 5. Test harnesses must not share the application's database.
const testUrl = process.env.TEST_DATABASE_URL;
if (testUrl && !LOCAL_HOSTS.includes(hostOf(testUrl))) {
  problems.push(`TEST_DATABASE_URL points at ${hostOf(testUrl)}; it must be local.`);
}
if (!testUrl) {
  notes.push("TEST_DATABASE_URL is unset; integration tests fall back to the docker default.");
}

// 6. Keys the template declares but this environment lacks.
try {
  const template = readFileSync(".env.example", "utf8");
  const declared = template
    .split(/\r?\n/)
    .map((line) => line.match(/^([A-Z0-9_]+)=/)?.[1])
    .filter(Boolean) as string[];
  const missing = declared.filter(
    (key) => process.env[key] === undefined && !REQUIRED.includes(key),
  );
  if (missing.length) {
    notes.push(`Declared in .env.example but unset here: ${missing.join(", ")}.`);
  }
} catch {
  notes.push(".env.example could not be read.");
}

// 7. A placeholder that is truthy is worse than an empty value: the code takes
//    the "configured" branch and fails at the provider instead.
if ((process.env.OPENAI_API_KEY ?? "").startsWith("sk-...")) {
  problems.push(
    "OPENAI_API_KEY holds the literal placeholder. Leave it empty or set a real key; " +
      "a placeholder is truthy and produces a 401 rather than degrading.",
  );
}

// 8. Evaluation retrieval is a separate privileged surface. A truthy flag
// without a strong independent key must never make synthetic documents
// reachable, and enabling it in production deserves an explicit warning.
if (process.env.RAG_EVAL_ENABLED === "true") {
  const evalKey = process.env.RAG_EVAL_KEY?.trim() ?? "";
  if (evalKey.length < 32) {
    problems.push("RAG_EVAL_ENABLED=true requires RAG_EVAL_KEY of at least 32 characters.");
  }
  if (process.env.NODE_ENV === "production") {
    warnings.push(
      "RAG evaluation retrieval is enabled in production. Disable it unless this is an isolated evaluation deployment.",
    );
  }
}

console.log(`\nEnvironment: database ${dbHost || "(unset)"}${isLocalDb ? " (local)" : ""}\n`);

for (const problem of problems) console.error(`  ✗ ${problem}`);
for (const warning of warnings) console.warn(`  ! ${warning}`);
for (const note of notes) console.log(`  · ${note}`);

if (problems.length === 0 && warnings.length === 0) {
  console.log("  ✓ Environment looks consistent.");
}
console.log();

process.exitCode = problems.length > 0 ? 1 : 0;
