# Symbi-OS

### AI-Powered Circular Supply Chain Analyst Dashboard

> A Hybrid Intelligence Engine that transforms industrial waste into opportunity by connecting producers, upcyclers, and regulators through graph-powered AI.

---

## Links

- **Presentation**: [View Slides](https://app.presentations.ai/view/8EDahpGT0G)
- **Video Demo**: [Watch on Google Drive](https://drive.google.com/file/d/186KeWJJMmXc-WFoKegMRwn1QO5OjW4TF/view?usp=sharing)

---

## Problem Statement

Every year, **billions of tons** of industrial waste are landfilled, incinerated, or dumped — not because they lack value, but because the systems to connect waste producers with potential upcyclers simply don't exist at scale.

The core challenges:

1. **Fragmented Information** — Companies generating waste (steel slag, e-waste, chemical byproducts) have no efficient way to discover who could repurpose their output.
2. **No Intelligent Matching** — Traditional marketplaces rely on keyword search. A textile manufacturer looking for "cellulose fiber" won't find a paper mill producing "kraft pulp residue," even though they're chemically complementary.
3. **Regulatory Blind Spots** — Cross-industry material exchange is governed by complex, overlapping regulations (RCRA, Basel Convention, REACH). Non-compliance kills deals and creates legal risk.
4. **Multi-Hop Complexity** — Real supply chains aren't point-to-point. A viable circular route may require traversing multiple companies, materials, and compliance constraints — a problem too complex for spreadsheets or simple search.
5. **Latent Opportunities Are Invisible** — Cross-industry partnerships that *could* exist (a semiconductor fab's gallium arsenide waste feeding a solar panel manufacturer) are never discovered because no one looks across industry boundaries.

**Symbi-OS solves all five problems** by combining a knowledge graph (Neo4j), vector embeddings (OpenAI), and an LLM-powered copilot into a single analyst dashboard — turning industrial waste data into a navigable, queryable, intelligent network.

---

## What Symbi-OS Does

Symbi-OS is a **full-stack AI-powered marketplace and analyst tool** for circular supply chains. It ingests industrial waste data into a knowledge graph, enriches it with vector embeddings and similarity scores, and exposes five core intelligence features through a real-time dashboard.

### Core Features

| # | Feature | What It Does |
|---|---------|-------------|
| 1 | **Hybrid Semantic Search** | Finds waste materials using vector similarity (not just keywords). Searching "metal shavings" will surface "titanium machining residue" and "aluminum alloy scrap" based on meaning. |
| 2 | **GraphRAG Copilot** | A conversational AI that translates natural language questions into Cypher queries, executes them against the knowledge graph, and returns plain-English answers with interactive graph visualizations. |
| 3 | **Multi-Hop Constraint Solving** | Discovers Producer → Material → Upcycler supply routes filtered by geospatial distance and facility capacity — solving logistics constraints that keyword search cannot. |
| 4 | **Latent Link Prediction** | Uses Jaccard similarity to surface cross-industry company partnerships that don't yet exist but *should*, based on shared material profiles. |
| 5 | **Asymmetric Recommendations** | Follows directional `COMPLEMENTS` edges to suggest alternative or complementary waste materials, enabling diversified sourcing. |

### Additional Features

- **Demand Capture** — When a buyer searches for a material that doesn't exist in the marketplace, the system auto-creates a "ghost" demand node in the graph and notifies relevant sellers when supply appears.
- **Bidding System** — Buyers can place bids on waste materials; sellers can accept or reject bids with email notifications at every step.
- **3D Neural Map** — Interactive graph visualization rendering companies, materials, and regulations as a navigable network.
- **Email Notifications** — Automated alerts for bids, demand matches, and supply availability via Gmail SMTP.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend                             │
│  ┌──────────┐  ┌──────────────┐  ┌────────────────────────┐│
│  │Marketplace│  │ Copilot Chat │  │  Neural Map / Insights ││
│  │   Feed    │  │  (GraphRAG)  │  │  / Supply Routes /Bids ││
│  │   (25%)   │  │    (30%)     │  │        (45%)           ││
│  └──────────┘  └──────────────┘  └────────────────────────┘│
└────────────────────────┬────────────────────────────────────┘
                         │ REST API
┌────────────────────────┴────────────────────────────────────┐
│                    Next.js API Routes                        │
│  /api/graphrag  /api/hybrid-search  /api/multi-hop          │
│  /api/insights  /api/recommendations  /api/bids             │
│  /api/demand/search  /api/auth/*  /api/materials            │
└───────┬──────────────────┬──────────────────┬───────────────┘
        │                  │                  │
   ┌────▼────┐      ┌─────▼─────┐     ┌──────▼──────┐
   │  Neo4j  │      │  OpenAI   │     │   SQLite    │
   │ AuraDB  │      │ GPT-4o-m  │     │  (Prisma)   │
   │ (Graph) │      │ Embeddings│     │ Users/Bids  │
   └─────────┘      └───────────┘     └─────────────┘
```

### Knowledge Graph Schema

**258 nodes, 1,778+ edges**

| Node Type | Count | Key Properties |
|-----------|-------|---------------|
| Company | ~140 | name, industry, location, lat/lng, capacity, carbon_rating |
| WasteMaterial | ~100 | name, description, category, toxicity_level, embedding (1536-d) |
| Regulation | 18 | code, description |

| Relationship | Description |
|-------------|-------------|
| `PRODUCES` | Company → WasteMaterial |
| `CAN_UPCYCLE` | Company → WasteMaterial |
| `REQUIRES_COMPLIANCE` | WasteMaterial → Regulation |
| `COMPLEMENTS` | WasteMaterial → WasteMaterial (directional) |
| `POTENTIAL_MATCH` | Company ↔ Company (Jaccard similarity ≥ 0.12) |
| `IS_SEEKING` | Company → WasteMaterial (demand capture) |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router) + React 19 + TypeScript |
| Styling | Tailwind CSS v3 + Framer Motion |
| Graph Database | Neo4j AuraDB (vector index + geospatial queries) |
| Relational DB | SQLite via Prisma (users, bids) |
| AI / LLM | OpenAI GPT-4o-mini (Cypher generation + answer synthesis) |
| Embeddings | OpenAI text-embedding-3-small (1536 dimensions) |
| LLM Framework | LangChain (prompt templates, Neo4j schema introspection) |
| Authentication | JWT + HttpOnly cookies + bcrypt |
| Email | Nodemailer (Gmail SMTP) |
| Visualization | react-force-graph-3d |

---

## Getting Started

### Prerequisites

- **Node.js 18+**
- **Neo4j AuraDB** instance (free tier works)
- **OpenAI API key**
- Gmail account for SMTP notifications (optional)

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/Symbi-OS.git
cd Symbi-OS

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Fill in your Neo4j, OpenAI, JWT, and SMTP credentials

# Initialize the SQLite database
npx prisma generate
npx prisma db push

# Generate the synthetic dataset
npm run generate

# Ingest data into Neo4j
npm run ingest

# Generate vector embeddings
npm run embed

# Compute Jaccard similarity matches
node scripts/compute_matches.js

# Start the development server
npm run dev
```

The app will be available at **http://localhost:3000**.

### Environment Variables

```env
NEO4J_URI=neo4j+s://xxxxx.databases.neo4j.io
NEO4J_USERNAME=your-username
NEO4J_PASSWORD=your-password
OPENAI_API_KEY=sk-...
JWT_SECRET=your-secret-key
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

---

## Data Pipeline

The project includes a 4-step data pipeline that builds the knowledge graph from scratch:

```
generate_dataset.js  →  ingest_to_neo4j.js  →  embed_materials.js  →  compute_matches.js
   (258 nodes,            (wipe + reingest       (1536-d vectors,       (Jaccard similarity,
    1778 edges)            to AuraDB)              cosine index)          939 POTENTIAL_MATCH)
```

1. **`npm run generate`** — Creates a realistic synthetic dataset of 30 industries, ~140 companies, ~100 waste materials, and 18 regulations with geospatial coordinates spanning 80+ global locations.

2. **`npm run ingest`** — Wipes the existing Neo4j graph and batch-ingests all nodes and relationships from the generated JSON.

3. **`npm run embed`** — Generates 1536-dimensional vector embeddings for every waste material description using OpenAI's `text-embedding-3-small` and creates a cosine similarity vector index in Neo4j.

4. **`node scripts/compute_matches.js`** — Computes Jaccard similarity between all cross-industry company pairs based on shared material profiles, creating `POTENTIAL_MATCH` edges for pairs above the 0.12 threshold.

---

## API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/register` | POST | Register user + create Company node in Neo4j |
| `/api/auth/login` | POST | Authenticate and issue JWT |
| `/api/auth/me` | GET | Get current user from JWT |
| `/api/auth/logout` | POST | Clear auth cookie |
| `/api/graphrag` | POST | Natural language → Cypher → Answer + Graph visualization |
| `/api/hybrid-search` | POST | Vector similarity search for waste materials |
| `/api/multi-hop` | POST | Distance & capacity-constrained supply route discovery |
| `/api/insights` | GET | Proactive cross-industry partnership suggestions |
| `/api/recommendations` | POST | Complementary material recommendations |
| `/api/materials` | GET | List all waste materials |
| `/api/materials/add` | POST | Add a new waste material to the graph |
| `/api/demand/search` | POST | Search supply or auto-register unmet demand |
| `/api/bids` | GET/POST | List or place bids on materials |
| `/api/bids/[id]` | PUT | Accept or reject a bid |
| `/api/stats` | GET | Dashboard metrics |

---

## Project Structure

```
Symbi-OS/
├── app/
│   ├── page.tsx                 # Main 3-column dashboard
│   ├── layout.tsx               # Root layout with auth provider
│   ├── login/page.tsx           # Login page
│   ├── register/page.tsx        # Registration page
│   └── api/
│       ├── graphrag/            # GraphRAG conversational AI
│       ├── hybrid-search/       # Vector similarity search
│       ├── multi-hop/           # Constraint-based route finding
│       ├── insights/            # Latent link prediction
│       ├── recommendations/     # Complementary materials
│       ├── materials/           # CRUD for waste materials
│       ├── demand/              # Demand capture system
│       ├── bids/                # Bidding system
│       ├── auth/                # Authentication endpoints
│       └── stats/               # Dashboard metrics
├── components/
│   ├── NavBar.tsx               # Header with live metrics
│   ├── MarketplaceFeed.tsx      # Material listings + search
│   ├── CopilotChat.tsx          # AI-powered graph Q&A
│   ├── NeuralMap.tsx            # 3D graph visualization
│   ├── ProactiveInsights.tsx    # Partnership discovery
│   ├── MultiHopExplorer.tsx     # Supply route explorer
│   └── BidManager.tsx           # Bid management interface
├── lib/
│   ├── neo4j.ts                 # Neo4j driver singleton
│   ├── auth.ts                  # JWT utilities
│   ├── embeddings.ts            # OpenAI embedding helper
│   ├── mailer.ts                # Email notification service
│   └── types.ts                 # TypeScript interfaces
├── context/
│   └── AuthContext.tsx           # Authentication React context
├── scripts/
│   ├── embed_materials.js       # Vector embedding pipeline
│   └── compute_matches.js       # Jaccard similarity computation
├── prisma/
│   └── schema.prisma            # SQLite schema (users, bids)
├── generate_dataset.js          # Synthetic data generator
├── ingest_to_neo4j.js           # Neo4j data ingestion
└── supply_chain_graph.json      # Generated dataset
```

---

## License

This project is built for educational and research purposes.
