# RAG evaluation corpus and regression workflow

## Corpus inventory

The original local corpus contained 54 active RecycleInMe records. Its category
mix was 34 Metal Scrap (63.0%), 16 Plastic Scrap (29.6%), and 4 Rubber (7.4%).
Descriptions ranged from 1,169 to 2,432 characters and were long supplier
narratives followed by specifications, shipping/payment terms, and contact
language. Only 2 of 54 listings published a price. No listing had coordinates
or a postal code, and several city/state combinations were inconsistent.

The real corpus target is 120 listings. The quota-controlled TradeIndia import
adds exactly 41 metal, 20 plastic, and 5 rubber listings, resulting in:

| Category | Existing | Added | Active real total |
|---|---:|---:|---:|
| Metal Scrap | 34 | 41 | 75 |
| Plastic Scrap | 16 | 20 | 36 |
| Rubber | 4 | 5 | 9 |
| **Total** | **54** | **66** | **120** |

The provider reads TradeIndia's structured page data, preserves source URLs,
supplier descriptions, specifications, prices/currencies, MOQ, and location,
deduplicates by external ID, and rejects adjacent equipment. It fails before
writing if a category cannot meet its quota; another category is never used to
hide a shortfall.

## Synthetic isolation

Synthetic listings stay in `MarketplaceListing` so evaluation exercises the
real persistence and retrieval path. They are marked `sourceType=synthetic`
and `isEvalOnly=true`, with `evalScenarioTags` and optional `evalClusterId`.
The derived `KnowledgeDocument` repeats `isEvalOnly` because RAG retrieves from
documents rather than listings.

Buyer-visible policy always requires `MarketplaceListing.isEvalOnly=false`.
Normal RAG retrieval always requires `KnowledgeDocument.isEvalOnly=false`.
Evaluation corpora require both an explicit environment opt-in and secret
header. Synthetic users are disabled and their users/orders are flagged.
Production material-edge refreshes exclude flagged users, orders, and listings.

Evaluation seeding is intentionally refused for non-local database hosts.

## Synthetic scenarios

The 28 listings contain:

- four four-item near-duplicate clusters: aluminum extrusion, copper wire, PE
  clear film, and HDPE bottles/regrind;
- eight same-category decoys that differ on material or grade;
- four descriptions containing unique prompt-injection canaries.

Glass has zero real and zero synthetic listings and is used for genuine
no-match tests. ISRI/ReMA designations and public grade names are used where
applicable, while detailed wording is original and evaluation-only.

## Buyers and material graph

Ten disabled evaluation buyers cover cold start, metal-heavy, plastic-heavy,
rubber-only, same-order co-purchase, separate-order category affinity, stale
history, repeat frequency, local/price-sensitive behavior, and cart/wishlist
intent without purchases. The fixtures create 17 flagged orders. A fixed
`EVAL_REFERENCE_DATE` keeps recency decay reproducible.

Production edge refresh remains real-only. `--include-eval` requires
`RAG_EVAL_ENABLED=true` and should only run in the dedicated local evaluation
database.

## Golden set and metrics

`eval/golden-set.ts` contains 90 cases, 18 per scenario:

- `exact_match`
- `semantic_zero_overlap`
- `ambiguous_multi_candidate`
- `no_match_refuse`
- `adversarial`

Every case carries its target source (`real`, `synthetic`, or `none`) and
acceptable listing IDs. Adversarial cases carry forbidden canaries. The HTTP
runner calls `/api/rag/query` with bounded concurrency and reports metrics by
both source and scenario rather than blending engineered and realistic data.

An adversarial description may appear in a citation excerpt without implying
that it was followed. The safety metric inspects the generated answer only.

## Baseline procedure

Run the data migration/import/seed/index steps without changing retrieval
weights, score thresholds, Gemini models, or the generation prompt. Then run
the golden set and preserve its JSON/Markdown output with the code commit and
environment configuration. If any request reports degraded lexical retrieval,
label that run as a fallback diagnostic and repeat after Gemini embeddings are
successfully written.

For the evaluation database, pass `--include-eval` to both listing backfill and
RAG indexing. Normal listing backfill now embeds active real listings only; it
does not spend provider quota on archived or evaluation-only rows.
