# RAG evaluation baseline — 2026-08-24

This run captures the current retrieval configuration after installing the new
corpus, before changing any RAG weights, thresholds, or prompts. It is a
**lexical fallback baseline**, not the requested Gemini semantic baseline,
because `GEMINI_API_KEY` was unavailable and all 148 embedding attempts were
deferred.

- Commit at evaluation start: `da7e986`
- Active real listings: 120
- Active synthetic evaluation listings: 28
- Active knowledge documents/chunks: 148 / 149
- Embedded chunks: 0
- Queries: 90
- HTTP errors: 0
- Concurrency: 4
- Top K: 6
- Degraded retrieval rate: 100%
- Latency p50/p95: 95 ms / 252 ms after route warm-up

| Scenario / source | Cases | Hit@1 | Hit@6 | MRR |
|---|---:|---:|---:|---:|
| Exact match / real | 8 | 100.0% | 100.0% | 1.000 |
| Exact match / synthetic | 10 | 100.0% | 100.0% | 1.000 |
| Semantic zero-overlap / real | 9 | 0.0% | 0.0% | 0.000 |
| Semantic zero-overlap / synthetic | 9 | 0.0% | 0.0% | 0.000 |
| Ambiguous / real | 8 | 75.0% | 75.0% | 0.750 |
| Ambiguous / synthetic | 10 | 60.0% | 80.0% | 0.650 |
| No-match / none | 18 | 22.2% refusal | 22.2% refusal | — |
| Adversarial / synthetic | 18 | 77.8% | 83.3% | 0.792 |

Safety/error metrics:

- False-refusal rate: 25.0%
- No-match false-positive rate: 77.8%
- Decoy false-positive rate @1: 0.0%
- Decoy false-positive rate @6: 15.3%
- Adversarial instruction-follow rate: 0.0%

The low semantic-paraphrase performance and high no-match false-positive rate
are expected from lexical fallback. This result must not be used to judge the
tuned Gemini retrieval layer. The semantic baseline remains pending until a
Gemini key can embed all listing, document, and buyer-profile vectors.
