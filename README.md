# Symbi-OS

Symbi-OS is a modular-monolith B2B marketplace for verified, non-hazardous
industrial by-products. The Next.js application contains the web UI, thin Route
Handlers, domain services, Prisma persistence, real listing-provider adapters,
grounded RAG, seller onboarding, bids, and sandbox transactions in one
deployable unit.

## Safety boundary

The v0 marketplace rejects radioactive, nuclear, biomedical, infectious,
explosive, asbestos, heavy-metal battery, e-waste, and other hazardous
materials. Only canonical non-hazardous categories are accepted. The same
policy runs during provider ingestion, seller listing creation, search, RAG
indexing, bids, and checkout.

Synthetic listings are not returned by production APIs and are not part of the
default ingestion workflow. A database file must never be committed.

## Architecture

| Layer | Location | Responsibility |
| --- | --- | --- |
| Web UI | `app/`, `components/` | Marketplace and account workflows |
| HTTP boundary | `app/api/`, `server/http.ts` | Authentication, origin checks, validation, safe errors |
| Domains | `server/auth`, `server/listings`, `server/rag` | Business rules and provider integrations |
| Persistence | `prisma/` | Versioned schema and migrations |
| Background/CLI | `scripts/` | Real listing ingestion and RAG indexing |

This is intentionally not a microservice system. Domain modules have clear
boundaries but share one process and one database for v0.

## Local setup

Requirements: Node.js 20.9 through 25.x and npm. Node.js 26 is not yet in the
declared support range of the pinned Prisma toolchain. Docker is required for
the local database.

Local development runs the same PostgreSQL 16 that production uses, so schema
behaviour, transaction semantics, and query plans match.

```bash
docker compose up -d
npm install
cp .env.example .env
openssl rand -base64 48
```

Paste the generated value into `JWT_SECRET`, then replace the two connection
strings in `.env` with the local database:

```bash
DATABASE_URL=postgresql://symbi:symbi_local_dev@localhost:5432/symbi_dev
DIRECT_URL=postgresql://symbi:symbi_local_dev@localhost:5432/symbi_dev
```

Both are identical locally. There is no connection pooler in front of the
container, so the pooled and direct endpoints are the same host. They diverge
only on managed providers — see `.env.example` for why the split exists.

Configure the remaining environment variables, then:

```bash
npm run db:deploy
npm run ingest:real
npm run rag:index
npm run dev
```

Open `http://localhost:3000`.

The database persists in the `symbi-postgres-data` volume across restarts. To
start from an empty database:

```bash
docker compose down -v && docker compose up -d && npm run db:deploy
```

If port 5432 is already taken, change the host side of the mapping in
`docker-compose.yml` (for example `5434:5432`) and update both URLs to match.
Note that a native PostgreSQL bound to `127.0.0.1:5432` silently wins over a
container published on `*:5432`: connections reach the native server instead,
and the failure looks like an authentication error rather than a port clash.

### Integration tests

`tests/inventory-concurrency.test.ts` runs against this container rather than
the application database, so its fixtures never touch real data. It defaults to
the `docker-compose.yml` credentials; set `TEST_DATABASE_URL` to point at a
different local server. Apply the schema before the first run:

```bash
DATABASE_URL=postgresql://symbi:symbi_local_dev@localhost:5432/symbi_dev \
DIRECT_URL=postgresql://symbi:symbi_local_dev@localhost:5432/symbi_dev \
npx prisma migrate deploy
```

The test skips itself when the container is not running, so `npm test` stays
green without Docker.

## Environments

Local development and production are deliberately separate. They were not, and
every serious incident on this project came from that: a test harness wrote
accounts into the live product, an encryption key diverged so a deployment
could not read its own records, and a migration landed on one database and not
the other.

| | Database | Secrets | Data |
| --- | --- | --- | --- |
| Local dev | docker-compose PostgreSQL | `.env`, generated locally | Real listings via `npm run ingest:real` |
| Tests | the same docker database | test values | Fixtures each run, cleaned up after |
| Production | Supabase | Vercel dashboard | Live |

Rules that follow from that split:

- **`.env` must point at localhost.** `npm run check:env` fails loudly if it
  does not. Nothing you run locally should be able to reach production.
- **Secrets are per-environment and never copied between them.** Vercel is the
  source of truth for production; `.env.production.local` holds only the
  connection strings, so there is nothing to drift.
- **`FIELD_ENCRYPTION_KEY` cannot be rotated casually.** Seller tax, bank, and
  KYC data is AES-GCM encrypted, which authenticates: a different key does not
  decode to nonsense, it throws. There is no re-encryption path, so changing it
  makes existing records permanently unreadable.
- **Migrations must be applied to every database.** `npm run db:deploy` targets
  whatever `.env` points at; CI runs it against its own service container.
  Vercel production builds run the same command before compiling the app and
  fail closed if the direct database connection is missing or a migration
  fails. Preview builds never run migrations.

Run `npm run check:env` after any environment change. It is the first step of
`npm run verify`, so a misconfiguration fails in a second rather than after a
full build.

To rebuild local data from scratch:

```bash
npm run db:reset
```

To run a one-off against production deliberately — a backfill, say — pass the
production values explicitly rather than editing `.env`:

```bash
env $(grep -v "^#" .env.production.local | xargs) npx tsx scripts/backfill-price-mode.ts
```

### Production deployment

Vercel uses `npm run vercel:build`. When `VERCEL_ENV=production`, that command
first runs `npm run db:deploy` through `DIRECT_URL`, then starts `next build`.
This ordering prevents a generated Prisma client from reaching production
before its required columns exist. Vercel must define both connection strings:

- `DATABASE_URL`: pooled runtime connection.
- `DIRECT_URL`: direct, non-pooler migration connection.

For older installations where `DATABASE_URL` itself is a direct connection,
the production build can safely reuse it. It refuses known pooler hosts, port
`6543`, and URLs carrying `pgbouncer=true`; those deployments must configure
`DIRECT_URL` (or an integration-provided `POSTGRES_URL_NON_POOLING`) explicitly.

After deployment, `GET /api/health/ready` checks database connectivity, the
pgvector extension, and the auth/evaluation-isolation schema required by the
current release. It returns `503 DATABASE_SCHEMA_NOT_READY` rather than a false
healthy response when production is behind. GitHub's production deployment
smoke workflow calls this endpoint after Vercel reports success.


## Environment

The complete template is in `.env.example`.

- `DATABASE_URL`: PostgreSQL. The pooled connection string on managed
  providers; the container URL locally. Used by the running application.
- `DIRECT_URL`: PostgreSQL direct connection, bypassing the pooler. Used only
  by `prisma migrate`. Identical to `DATABASE_URL` locally.
- `JWT_SECRET`: required, random, at least 32 characters.
- `IP_HASH_PEPPER`: independent secret used to pseudonymize IP addresses.
- `FIELD_ENCRYPTION_KEY`: independent secret used to encrypt seller tax, bank,
  and KYC payloads with AES-256-GCM.
- `DEMO_VERIFICATION_ENABLED`: exposes deterministic onboarding verification
  only when explicitly set to `true`.
- `DEMO_PAYMENTS_ENABLED`: enables the sandbox payment transaction.
- `LISTINGS_PROVIDER`: `tradeindia` for the quota-controlled TradeIndia public
  catalogue adapter, `recycleinme` for the legacy public feed, or `json` for an
  authenticated listing API.
- `REAL_LISTINGS_API_URL` and `REAL_LISTINGS_API_KEY`: configured JSON API.
- `GEMINI_API_KEY`: enables embeddings and generated RAG answers. Without it,
  the same cited retrieval pipeline returns an extractive answer from lexical
  retrieval. Server-side only — never prefix it with `NEXT_PUBLIC_`.
  Keep it in `.env`, not `.env.production.local`: the latter is read only when
  `NODE_ENV=production`, so `next dev` and the `tsx` scripts never see it.
  Vercel needs it set in the dashboard, since `.env.*` is gitignored.
- `LISTING_EMBEDDING_PROVIDER`: embedding adapter for both the ranked feed and
  RAG; defaults to `gemini` and can be replaced through the provider registry
  (`registerEmbeddingProvider`). An `openai` adapter is also registered.
- `LISTING_EMBEDDING_MODEL`: overrides the adapter's model.
- `RAG_GENERATION_PROVIDER`: answer-generation adapter; defaults to `gemini`.
- `GEMINI_RAG_MODEL`: overrides the generation model.
- `RAG_EVAL_ENABLED`: opt-in gate for evaluation-only retrieval. Leave `false`
  in buyer-facing deployments.
- `RAG_EVAL_KEY`: independent secret of at least 32 characters required by the
  HTTP golden-set runner. It does not replace normal buyer authentication.

### Embedding model and dimension

Both pipelines share one vector store, so they must share one model and width.

| | |
| --- | --- |
| Embedding model | `gemini-embedding-001` |
| Dimension | 768 (`MarketplaceListing.embedding`, `KnowledgeChunk.embedding`, `BuyerDemandProfile.embedding`) |
| Index | HNSW, `vector_cosine_ops`, `m=16`, `ef_construction=64` |
| Generation model | `gemini-flash-latest` |

`gemini-embedding-001` is natively 3072-wide and Matryoshka-truncatable, so 768
is requested to match the columns. **Truncated vectors are not unit length** —
measured 0.587 — and the indexes are cosine, so vectors are L2-normalised before
they are stored. Changing the dimension means rebuilding both columns and both
indexes; they cannot be changed independently.

Documents are embedded with `RETRIEVAL_DOCUMENT` and queries with
`RETRIEVAL_QUERY`, because retrieval is asymmetric.

## RAG corpus evaluation

Synthetic evaluation listings use the same listing, document, chunk, and RAG
code path as real records. Isolation is explicit and default-deny:

- `MarketplaceListing.isEvalOnly` prevents marketplace, cart, bid, checkout,
  messaging, matching, statistics, and ranked-feed visibility.
- `KnowledgeDocument.isEvalOnly` makes normal RAG queries real-only even when
  evaluation chunks are indexed.
- `User.isEvalOnly` and `PurchaseOrder.isEvalOnly` prevent evaluation buyer
  history from entering production edge refreshes.
- Evaluation retrieval additionally requires `RAG_EVAL_ENABLED=true` and a
  timing-safe comparison against `RAG_EVAL_KEY`.

The deterministic suite contains 28 synthetic listings: 16 near-duplicates,
8 decoys, and 4 descriptions containing prompt-injection canaries. Glass is
deliberately absent. The golden set contains 90 queries—18 each for exact
match, semantic paraphrase, ambiguous match, genuine no-match, and adversarial
retrieval. Synthetic material names follow the public [ISRI specifications](https://www.isrispecs.org/)
where applicable; explanatory text is paraphrased rather than copied.

Use a dedicated local/test database:

```bash
npm run db:deploy
npm run ingest:tradeindia -- --dry-run
npm run ingest:tradeindia
RAG_EVAL_ENABLED=true npm run rag:eval:seed
RAG_EVAL_ENABLED=true npm run feed:backfill-embeddings -- --include-eval
RAG_EVAL_ENABLED=true npm run rag:index -- --include-eval
RAG_EVAL_KEY="$(openssl rand -hex 32)" RAG_EVAL_ENABLED=true npm run dev
# Supply the same key in a second shell:
RAG_EVAL_KEY="..." npm run rag:eval:run
```

The runner writes `.data/rag-eval/latest.json` and `latest.md`, broken down by
real/synthetic source and scenario. It reports hit@1, hit@K, MRR, false
refusals, no-match false positives, decoy false positives, adversarial
instruction following, degraded retrieval, and p50/p95 latency. A run with
`degradedRetrievalRate > 0` is a fallback diagnostic, not the Gemini semantic
baseline.

Note: `gemini-2.5-flash` returns 404 "no longer available to new users" on
recently issued keys. `gemini-flash-latest` is the supported alias.

### JSON listing API contract

The configured API may return an array or an object containing `items`, `data`,
`results`, or `listings`. Each row should provide:

```json
{
  "id": "supplier-record-id",
  "title": "Washed HDPE regrind",
  "description": "Post-industrial, uncontaminated material...",
  "category": "plastic",
  "subcategory": "HDPE",
  "companyName": "Example Supplier",
  "city": "Bengaluru",
  "state": "Karnataka",
  "country": "India",
  "quantity": 25,
  "unit": "ton",
  "price": 42000,
  "currency": "INR",
  "url": "https://provider.example/listings/123",
  "imageUrl": "https://provider.example/images/123.jpg"
}
```

Rows outside India, with unsupported categories, missing provenance, or
containing prohibited material terms are rejected and counted in
`ListingImportRun`.

## Working demo flows

### Seller

1. Register as Seller or Buyer and Seller.
2. In demo mode, email verification is completed using the one-time sandbox
   token returned by registration.
3. Complete all six onboarding steps.
4. Submit and run the clearly labelled sandbox verification.
5. Publish a non-hazardous listing.
6. Review and accept valid, inventory-bounded bids.

### Buyer and transaction

1. Add a verified address.
2. Place a quantity- and price-validated bid, or buy a priced listing.
3. Checkout sends an `Idempotency-Key`.
4. The sandbox payment, order, inventory decrement, and inventory movement are
   committed atomically. No real funds are moved.

### RAG

`npm run rag:index` turns approved real/seller listings and their connected
compliance/upcycler data into versioned knowledge documents and chunks. Query
`POST /api/rag/query`. Responses are grounded in retrieved chunks and return
explicit source citations. Source text is treated as untrusted data to reduce
prompt-injection risk.

The query route only queries. It does not build the index: rebuilding is a
minutes-long job and running it inside a serverless request timed out and left
a partial index behind. An unbuilt index returns `503 KNOWLEDGE_INDEX_EMPTY`.

Retrieval ranks in Postgres against the HNSW index and blends the cosine score
with a lexical one (0.7 / 0.3). Results below a relevance floor are dropped —
0.45 for the hybrid path, 0.2 for the lexical fallback. The floors differ
because the paths score on different scales, and embedding similarity has a
high baseline: unrelated text still scores about 0.35, so "no results" has to be
a decision rather than an absence.

When the embedding provider is unreachable, retrieval falls back to lexical and
reports `degraded: true` rather than silently looking healthy.

### Ranked buyer feed

Authenticated buyers receive the ranked feed from `GET /api/feed`; signed-out
catalogue traffic and every explicit search/filter continue to use
`GET /api/materials`. The response keeps the catalogue's cursor-paginated
`{ items, pageInfo }` contract. `relevanceScore` is a relevance score, not a
calibrated probability of purchase.

Retrieval is deliberately bounded for the hot path:

1. Look up or refresh the buyer demand-profile embedding.
2. Retrieve the top 60 listing seeds with pgvector cosine distance.
3. Expand their material IDs through `material_edges` with ordinary SQL joins,
   limited to one or two hops.
4. Load at most 240 candidates, calculate the signals in batches, score, and
   sort by relevance with a deterministic ID tie-break.

The scorer blends these signals:

- semantic fit between the cached buyer profile and listing embedding;
- `co_purchased`, `substitutable`, and `category_affinity` graph edges;
- freight/location distance, price fit, quantity match, listing freshness, and
  seller reliability (reviews, response rate, fulfilled orders, approved
  onboarding, and supporting documents).

For scrap, the business signals intentionally contribute 70% of the normal
score. A buyer with no behavioral history uses only semantic fit, location,
and freshness. All weights, normalization thresholds, retrieval limits, and
graph-decay settings live in the single documented object in
`server/feed/config.ts`; tune that object rather than introducing constants in
queries or routes.

Material edges are refreshed with:

```bash
npm run feed:refresh-edges
```

Co-purchase edges use material pairs in confirmed/paid/fulfilled orders.
Category-affinity edges use materials purchased by the same buyer across
orders. Substitution edges use the existing material taxonomy and active
listing supply. Behavioral evidence is weighted as
`exp(-ln(2) * ageDays / halfLifeDays)`, accumulated by frequency, and bounded
with `1 - exp(-signal / saturation)`; taxonomy edges also vary with supply
frequency and freshness. The half-life and saturation are tunable in the same
config object. Schedule this command after order ingestion or as a periodic
job; the refresh is atomic and removes stale edges from the previous run.

Listings created or edited through seller APIs, and listings updated by the
real-provider importer, attempt a 768-dimensional embedding on write. Provider
failure does not block the listing transaction; missing vectors are resumable
with:

```bash
npm run feed:backfill-embeddings
# Optional controls:
npm run feed:backfill-embeddings -- --batch-size 100 --concurrency 6 --after <listing-id>
```

`LISTING_EMBEDDING_PROVIDER` selects an adapter registered through the
`EmbeddingProvider` interface. The built-in `openai` adapter uses
`LISTING_EMBEDDING_MODEL=text-embedding-3-small` and requests 768 dimensions;
another provider can be registered without changing listing or feed code.

## Quality commands

```bash
npm run security:scan
npm run typecheck
npm test
npm run build
npm audit --omit=dev
```

`npm run verify` runs all five checks. The sensitive-file scan rejects tracked
databases, environment files other than `.env.example`, private-key bundles,
credential bundles, and common high-confidence secret formats.

The GitHub Actions workflow repeats these checks on pull requests and pushes to
`main`. Its security job rejects forbidden filenames anywhere in Git history
and runs Gitleaks against the complete history. Actions are pinned to immutable
commit SHAs and run with read-only repository permissions. Run
`npm run security:scan:history` locally from a full clone to perform the
filename portion of that historical check.

> Removing a secret from the current branch does not remove it from Git history.
> Rotate exposed credentials first, then perform a coordinated history rewrite
> and require every contributor to re-clone.

## Important production boundaries

The verification and payment providers are deliberately sandboxed for v0.
Production launch still requires contracted GST/PAN/KYC/bank providers, a real
payment/escrow integration, secrets management, backups, monitoring, legal
review, and a managed production database. The code does not label sandbox
results as government- or bank-verified.
