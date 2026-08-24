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

// Preview builds must never mutate the production-shaped database. Production
// builds, however, are not allowed to publish a Prisma client newer than the
// schema it will query. Prisma's migration lock makes repeated production
// builds safe; ensure-local-db validates that DIRECT_URL bypasses the pooler.
if (process.env.VERCEL_ENV === "production") {
  console.log("[VercelBuild] Applying production database migrations.");
  runNpmScript("db:deploy");
} else {
  console.log(
    `[VercelBuild] Skipping database migrations for ${process.env.VERCEL_ENV || "local"} build.`,
  );
}

runNpmScript("build");
