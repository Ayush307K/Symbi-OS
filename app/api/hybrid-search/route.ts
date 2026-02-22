// ---------------------------------------------------------------------------
//  POST /api/hybrid-search
//
//  Hybrid Semantic Routing — bridges the "vocabulary gap" by combining:
//    1. Vector similarity search (OpenAI embeddings in Neo4j)
//    2. Graph relationship traversal (producers, upcyclers, regulations)
//
//  A user searching "clear polymer" will match "Polycarbonate Scrap" even
//  though the exact phrase never appears in the node properties.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { embedQuery } from "@/lib/embeddings";
import { getNeo4jGraph } from "@/lib/neo4j-graph";

// ---------------------------------------------------------------------------
//  Types
// ---------------------------------------------------------------------------

export interface HybridSearchResult {
  id: string;
  name: string;
  category: string;
  toxicity: string;
  baseElement: string;
  description: string;
  similarity: number;
  producers: string[];
  upcyclers: string[];
  regulations: string[];
}

interface HybridSearchRequest {
  query: string;
  topK?: number;
}

// ---------------------------------------------------------------------------
//  Route Handler
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest
): Promise<NextResponse<{ results: HybridSearchResult[] } | { error: string }>> {
  let body: HybridSearchRequest;
  try {
    body = (await request.json()) as HybridSearchRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const query = body.query?.trim();
  if (!query) {
    return NextResponse.json(
      { error: "Missing required field: query" },
      { status: 400 }
    );
  }

  const topK = Math.min(Math.max(body.topK ?? 10, 1), 50);

  try {
    // ---- Step 1: Embed the user query ----------------------------------------
    const queryEmbedding = await embedQuery(query);

    // ---- Step 2: Vector search + graph traversal -----------------------------
    const graph = await getNeo4jGraph();

    let results: HybridSearchResult[];

    try {
      // Try vector index search first
      const records = await graph.query<{
        id: string;
        name: string;
        category: string;
        toxicity: string;
        baseElement: string;
        description: string;
        similarity: number;
        producers: string[];
        upcyclers: string[];
        regulations: string[];
      }>(
        `CALL db.index.vector.queryNodes('waste_embedding_idx', $topK, $queryEmbedding)
         YIELD node AS waste, score
         MATCH (producer:Company)-[:PRODUCES]->(waste)
         OPTIONAL MATCH (upcycler:Company)-[:CAN_UPCYCLE]->(waste)
         OPTIONAL MATCH (waste)-[:REQUIRES_COMPLIANCE]->(reg:Regulation)
         RETURN waste.id AS id,
                waste.name AS name,
                waste.category AS category,
                waste.toxicity_level AS toxicity,
                waste.base_element AS baseElement,
                waste.description AS description,
                score AS similarity,
                collect(DISTINCT producer.name) AS producers,
                collect(DISTINCT upcycler.name) AS upcyclers,
                collect(DISTINCT reg.code) AS regulations
         ORDER BY score DESC`,
        { topK, queryEmbedding }
      );

      results = records.map((r) => ({
        id: r.id,
        name: r.name,
        category: r.category,
        toxicity: r.toxicity,
        baseElement: r.baseElement,
        description: r.description,
        similarity: Math.round(r.similarity * 1000) / 1000,
        producers: r.producers.filter(Boolean),
        upcyclers: r.upcyclers.filter(Boolean),
        regulations: r.regulations.filter(Boolean),
      }));
    } catch (vectorErr: unknown) {
      // Fallback: if vector index isn't available, do text-based search
      const msg =
        vectorErr instanceof Error ? vectorErr.message : String(vectorErr);
      console.warn("[HybridSearch] Vector search failed, using fallback:", msg);

      const records = await graph.query<{
        id: string;
        name: string;
        category: string;
        toxicity: string;
        baseElement: string;
        description: string;
        producers: string[];
        upcyclers: string[];
        regulations: string[];
      }>(
        `MATCH (producer:Company)-[:PRODUCES]->(waste:WasteMaterial)
         WHERE toLower(waste.name) CONTAINS toLower($query)
            OR toLower(waste.description) CONTAINS toLower($query)
            OR toLower(waste.category) CONTAINS toLower($query)
            OR toLower(waste.base_element) CONTAINS toLower($query)
         OPTIONAL MATCH (upcycler:Company)-[:CAN_UPCYCLE]->(waste)
         OPTIONAL MATCH (waste)-[:REQUIRES_COMPLIANCE]->(reg:Regulation)
         RETURN waste.id AS id,
                waste.name AS name,
                waste.category AS category,
                waste.toxicity_level AS toxicity,
                waste.base_element AS baseElement,
                waste.description AS description,
                collect(DISTINCT producer.name) AS producers,
                collect(DISTINCT upcycler.name) AS upcyclers,
                collect(DISTINCT reg.code) AS regulations
         LIMIT $topK`,
        { query, topK }
      );

      results = records.map((r) => ({
        id: r.id,
        name: r.name,
        category: r.category,
        toxicity: r.toxicity,
        baseElement: r.baseElement,
        description: r.description,
        similarity: -1, // indicates fallback was used
        producers: r.producers.filter(Boolean),
        upcyclers: r.upcyclers.filter(Boolean),
        regulations: r.regulations.filter(Boolean),
      }));
    }

    return NextResponse.json({ results });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[HybridSearch] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
