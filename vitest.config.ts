import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    // Several integration suites deliberately share the local PostgreSQL
    // database. Running files in parallel lets one suite delete its temporary
    // company while the ranked feed is hydrating public candidates from
    // another, which creates nondeterministic required-relation failures.
    // Individual tests can still exercise concurrency explicitly.
    fileParallelism: false,
  },
});
