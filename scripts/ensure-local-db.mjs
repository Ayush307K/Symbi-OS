import "dotenv/config";

// Preflight for `prisma migrate deploy`. Postgres needs no file to be created,
// but migrations fail in confusing ways when the connection strings are wrong,
// so fail fast with a clear message instead.

const errors = [];
const { DATABASE_URL = "", DIRECT_URL = "" } = process.env;

function isPostgres(url) {
  return url.startsWith("postgresql://") || url.startsWith("postgres://");
}

if (!DATABASE_URL) {
  errors.push("DATABASE_URL is not set. Use the pooled connection string.");
} else if (!isPostgres(DATABASE_URL)) {
  errors.push(
    `DATABASE_URL must be a postgresql:// URL. Received: ${DATABASE_URL.split(":")[0]}:`,
  );
}

if (!DIRECT_URL) {
  errors.push(
    "DIRECT_URL is not set. Migrations bypass the connection pooler and need the direct URL.",
  );
} else if (!isPostgres(DIRECT_URL)) {
  errors.push(
    `DIRECT_URL must be a postgresql:// URL. Received: ${DIRECT_URL.split(":")[0]}:`,
  );
} else if (DIRECT_URL.includes("-pooler") || DIRECT_URL.includes(":6543")) {
  errors.push(
    "DIRECT_URL points at the pooled endpoint. Migrations cannot run through PgBouncer — use the direct host (Neon: drop `-pooler`; Supabase: port 5432).",
  );
}

if (errors.length > 0) {
  console.error("Cannot run migrations:\n");
  for (const error of errors) console.error(`  - ${error}`);
  console.error("\nSee .env.example for the pooled/direct split.\n");
  process.exit(1);
}
