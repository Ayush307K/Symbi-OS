// ---------------------------------------------------------------------------
//  POST /api/demand/search
//
//  Demand Capture — a logged-in buyer searches for a material.
//  1. First runs a hybrid search to check if supply exists.
//  2. If no results found, creates a "ghost" WasteMaterial node (status: 'requested')
//     and an IS_SEEKING edge from the buyer's Company node.
//  3. Returns either the existing supply results or a demand-registered confirmation.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { getAuthFromCookie } from "@/lib/auth";
import { getNeo4jGraph } from "@/lib/neo4j-graph";
import { embedQuery } from "@/lib/embeddings";
import { randomUUID } from "crypto";
import { notifyDemandRegistered } from "@/lib/mailer";

interface DemandSearchBody {
  query: string;
}

export async function POST(request: NextRequest) {
  // ---- Auth check ------------------------------------------------------------
  const auth = await getAuthFromCookie();
  if (!auth) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  let body: DemandSearchBody;
  try {
    body = (await request.json()) as DemandSearchBody;
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

  try {
    const graph = await getNeo4jGraph();

    // ---- Step 1: Try hybrid search for existing supply -----------------------
    let supplyResults: Record<string, unknown>[] = [];

    try {
      const queryEmbedding = await embedQuery(query);
      supplyResults = await graph.query(
        `CALL db.index.vector.queryNodes('waste_embedding_idx', 5, $queryEmbedding)
         YIELD node AS waste, score
         WHERE score > 0.7
         MATCH (producer:Company)-[:PRODUCES]->(waste)
         RETURN waste.id AS id,
                waste.name AS name,
                waste.category AS category,
                waste.toxicity_level AS toxicity,
                score AS similarity,
                collect(DISTINCT producer.name) AS producers
         ORDER BY score DESC`,
        { queryEmbedding }
      );
    } catch {
      // Vector search unavailable — fallback to text match
      supplyResults = await graph.query(
        `MATCH (producer:Company)-[:PRODUCES]->(waste:WasteMaterial)
         WHERE toLower(waste.name) CONTAINS toLower($query)
            OR toLower(waste.description) CONTAINS toLower($query)
         RETURN waste.id AS id,
                waste.name AS name,
                waste.category AS category,
                waste.toxicity_level AS toxicity,
                collect(DISTINCT producer.name) AS producers
         LIMIT 5`,
        { query }
      );
    }

    // ---- Step 2: Supply exists — return results ------------------------------
    if (supplyResults.length > 0) {
      return NextResponse.json({
        status: "supply_found",
        message: `Found ${supplyResults.length} matching material(s) in the supply network.`,
        results: supplyResults,
        demandRegistered: false,
      });
    }

    // ---- Step 3: No supply — create ghost node + IS_SEEKING edge -------------
    const ghostId = `demand_${randomUUID().slice(0, 8)}`;

    await graph.query(
      `MATCH (c:Company {id: $companyId})
       MERGE (m:WasteMaterial {name: $query})
       ON CREATE SET m.id = $ghostId,
                     m.status = 'requested',
                     m.category = 'Requested',
                     m.toxicity_level = 'unknown',
                     m.base_element = 'unknown',
                     m.description = $description
       MERGE (c)-[r:IS_SEEKING]->(m)
       ON CREATE SET r.createdAt = datetime(), r.userId = $userId`,
      {
        companyId: auth.neo4jCompanyId,
        query,
        ghostId,
        description: `Demand request: ${query}`,
        userId: auth.userId,
      }
    );

    // Send confirmation email
    notifyDemandRegistered({
      buyerEmail: auth.email,
      materialQuery: query,
    });

    return NextResponse.json({
      status: "demand_registered",
      message: `No current supply found for "${query}". Your demand has been registered — you'll be notified when supply becomes available.`,
      results: [],
      demandRegistered: true,
      demandDetails: {
        materialName: query,
        companyId: auth.neo4jCompanyId,
        ghostNodeId: ghostId,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[DemandSearch] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
