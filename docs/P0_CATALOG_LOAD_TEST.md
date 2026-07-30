# P0 catalog load-test evidence

Date: 30 July 2026

- Fresh database deployed through all reviewed Prisma migrations.
- Exercised 12,000 active, safe listing rows linked to canonical taxonomy and
  provider companies; 11,980 rows matched the selected `Metal Scrap` filter.
- Ran the catalog card query with active-status, category, deterministic
  `updatedAt`/`id` ordering, and a 25-row page.
- SQLite query planning uses
  `MarketplaceListing_status_category_updatedAt_id_idx`.
- Warm local execution reported below the timer's 10 ms display resolution.
- The HTTP endpoint separately enforces a 50-row maximum, emits `Server-Timing`,
  records payload bytes, and warns if the 500 ms or 256 KiB budget is exceeded.

This is a local database/load acceptance test, not a substitute for production
traffic testing against the selected production database and object store.
