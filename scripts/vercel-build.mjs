import { spawnSync } from "node:child_process";

function runNpmScript(name) {
  const executable = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(executable, ["run", name], {
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function isKnownPooler(raw) {
  try {
    const url = new URL(raw);
    return (
      url.hostname.toLowerCase().includes("pooler") ||
      url.port === "6543" ||
      url.searchParams.get("pgbouncer") === "true"
    );
  } catch {
    return true;
  }
}

function configureDirectMigrationUrl() {
  if (process.env.DIRECT_URL?.trim()) return;

  const integrationDirectUrl = process.env.POSTGRES_URL_NON_POOLING?.trim();
  if (integrationDirectUrl && !isKnownPooler(integrationDirectUrl)) {
    process.env.DIRECT_URL = integrationDirectUrl;
    console.log(
      "[VercelBuild] Using the integration-provided non-pooling migration URL.",
    );
    return;
  }

  const runtimeUrl = process.env.DATABASE_URL?.trim();
  if (runtimeUrl && !isKnownPooler(runtimeUrl)) {
    // Older deployments used one direct URL for both runtime and migrations.
    // Preserve that valid configuration without printing the credential. A
    // known pooler is never silently promoted to DIRECT_URL.
    process.env.DIRECT_URL = runtimeUrl;
    console.log(
      "[VercelBuild] DATABASE_URL is direct; reusing it for migrations.",
    );
    return;
  }

  console.error(
    "[VercelBuild] A direct database connection is required. Configure DIRECT_URL " +
      "or POSTGRES_URL_NON_POOLING; pooled DATABASE_URL values are not safe for migrations.",
  );
  process.exit(1);
}

// Preview builds must never mutate the production-shaped database. Production
// builds, however, are not allowed to publish a Prisma client newer than the
// schema it will query. Prisma's migration lock makes repeated production
// builds safe; ensure-local-db validates that DIRECT_URL bypasses the pooler.
if (process.env.VERCEL_ENV === "production") {
  console.log("[VercelBuild] Applying production database migrations.");
  configureDirectMigrationUrl();
  runNpmScript("db:deploy");
} else {
  console.log(
    `[VercelBuild] Skipping database migrations for ${process.env.VERCEL_ENV || "local"} build.`,
  );
}

runNpmScript("build");
