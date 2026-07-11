# Symbi-OS

AI-assisted B2B marketplace for industrial by-products, scrap, and secondary raw materials.

Symbi-OS connects industrial waste generators with verified buyers and upcyclers. The current implementation uses a marketplace-first UI backed by a Prisma-managed SQLite database seeded from the generated supply-chain dataset.

## Current Stack

| Layer | Technology |
| --- | --- |
| App | Next.js 15, React 19, TypeScript |
| UI | Tailwind CSS, lucide-react |
| Database | SQLite via Prisma |
| Auth | JWT + HttpOnly cookies + bcrypt |
| Optional AI | OpenAI embeddings stored on material rows |
| Email | Nodemailer SMTP |

## Data Model

The generated industrial graph is stored relationally:

- `Company`
- `WasteMaterial`
- `Regulation`
- `MaterialProducer`
- `MaterialUpcycler`
- `MaterialRegulation`
- `MaterialComplement`
- `PotentialMatch`
- `MarketplaceListing`
- `Demand`
- `User`
- `Bid`

The seed dataset contains:

- 140 companies
- 100 waste materials
- 18 regulations
- 472 producer edges
- 1,094 upcycler edges
- 156 compliance edges
- 56 complement edges
- 10,000 marketplace listings with category, region, supplier, price, MOQ, lead time, ratings, wholesale terms, and image URLs

## Getting Started

```bash
npm install
npx prisma db push
npm run ingest
node scripts/compute_matches.js
npm run dev
```

The app runs at:

```text
http://localhost:3000
```

## Environment

Create `.env`:

```env
DATABASE_URL=file:./placeholder.db
TURSO_AUTH_TOKEN=
JWT_SECRET=dev-secret-change-me
OPENAI_API_KEY=
SMTP_USER=
SMTP_PASS=
```

For Vercel, set `DATABASE_URL` to a hosted libSQL/Turso URL and set
`TURSO_AUTH_TOKEN`. The local SQLite file under `prisma/` is intentionally not
committed and is only for local development.

`OPENAI_API_KEY` is optional unless you run:

```bash
npm run embed
```

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run generate` | Regenerate `supply_chain_graph.json` |
| `npm run ingest` | Seed Prisma tables from `supply_chain_graph.json` |
| `node scripts/compute_matches.js` | Compute latent company partnerships |
| `npm run embed` | Generate optional OpenAI embeddings into Prisma |
| `npm run dev` | Start local dev server |
| `npm run build` | Production build |

## API Surface

| Endpoint | Description |
| --- | --- |
| `/api/materials` | Marketplace listings |
| `/api/materials/add` | Seller listing creation |
| `/api/bids` | Place/list bids |
| `/api/bids/[id]` | Accept/reject bids |
| `/api/demand/search` | Demand capture |
| `/api/hybrid-search` | Text-ranked material search |
| `/api/multi-hop` | Producer-to-upcycler route discovery |
| `/api/insights` | Latent partnership suggestions |
| `/api/recommendations` | Complementary materials |
| `/api/graphrag` | Lightweight analyst response + graph payload |
| `/api/stats` | Dashboard metrics |
