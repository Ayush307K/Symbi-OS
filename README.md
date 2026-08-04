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
- `LISTINGS_PROVIDER`: `recycleinme` for the public provider feed or `json` for
  an authenticated listing API.
- `REAL_LISTINGS_API_URL` and `REAL_LISTINGS_API_KEY`: configured JSON API.
- `OPENAI_API_KEY`: enables embeddings and generated RAG answers. Without it,
  the same cited retrieval pipeline returns an extractive answer.
- `OPENAI_RAG_MODEL`: defaults to `gpt-5.6-terra`.
- `OPENAI_EMBEDDING_MODEL`: defaults to `text-embedding-3-small`.

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
`POST /api/rag/query` or use the existing Copilot UI. Responses are grounded in
retrieved chunks and return explicit source citations. Source text is treated
as untrusted data to reduce prompt-injection risk.

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
