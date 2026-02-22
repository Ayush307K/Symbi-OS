// ---------------------------------------------------------------------------
//  POST /api/recommendations
//
//  Asymmetric & Complementary Recommendations
//
//  Follows OUTGOING :COMPLEMENTS edges only — strictly directional.
//  "Blast Furnace Slag" → recommends "Basic Oxygen Furnace Slag",
//  but NOT the reverse.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { getNeo4jGraph } from "@/lib/neo4j-graph";

// ---------------------------------------------------------------------------
//  Types
// ---------------------------------------------------------------------------

export interface Recommendation {
  id: string;
  name: string;
  category: string;
  toxicity: string;
  baseElement: string;
  upcyclers: string[];
  producers: string[];
}

interface RecommendationRequest {
  materialName: string;
}

// ---------------------------------------------------------------------------
//  Route Handler
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest
): Promise<NextResponse<{ source: string; recommendations: Recommendation[] } | { error: string }>> {
  let body: RecommendationRequest;
  try {
    body = (await request.json()) as RecommendationRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const materialName = body.materialName?.trim();
  if (!materialName) {
    return NextResponse.json(
      { error: "Missing required field: materialName" },
      { status: 400 }
    );
  }

  try {
    const graph = await getNeo4jGraph();

    // Strictly follow OUTGOING :COMPLEMENTS direction
    const records = await graph.query<{
      id: string;
      name: string;
      category: string;
      toxicity: string;
      baseElement: string;
      upcyclers: string[];
      producers: string[];
    }>(
      `MATCH (source:WasteMaterial {name: $materialName})-[:COMPLEMENTS]->(rec:WasteMaterial)
       OPTIONAL MATCH (upcycler:Company)-[:CAN_UPCYCLE]->(rec)
       OPTIONAL MATCH (producer:Company)-[:PRODUCES]->(rec)
       RETURN rec.id AS id,
              rec.name AS name,
              rec.category AS category,
              rec.toxicity_level AS toxicity,
              rec.base_element AS baseElement,
              collect(DISTINCT upcycler.name)[0..5] AS upcyclers,
              collect(DISTINCT producer.name)[0..3] AS producers
       ORDER BY rec.name`,
      { materialName }
    );

    const recommendations: Recommendation[] = records.map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      toxicity: r.toxicity,
      baseElement: r.baseElement,
      upcyclers: r.upcyclers.filter(Boolean),
      producers: r.producers.filter(Boolean),
    }));

    return NextResponse.json({ source: materialName, recommendations });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[Recommendations] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
