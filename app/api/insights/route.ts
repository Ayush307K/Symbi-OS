// ---------------------------------------------------------------------------
//  GET /api/insights
//
//  Proactive Insights — "The Blind Spot Matchmaker"
//
//  Fetches POTENTIAL_MATCH edges computed by scripts/compute_matches.js
//  Returns cross-industry company pairs with highest Jaccard similarity.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { getNeo4jGraph } from "@/lib/neo4j-graph";

// ---------------------------------------------------------------------------
//  Types
// ---------------------------------------------------------------------------

export interface PartnershipInsight {
  company1: string;
  industry1: string;
  location1: string;
  company2: string;
  industry2: string;
  location2: string;
  score: number;
  sharedMaterials: number;
  sharedNames: string[];
}

// ---------------------------------------------------------------------------
//  Route Handler
// ---------------------------------------------------------------------------

export async function GET(): Promise<
  NextResponse<{ insights: PartnershipInsight[] } | { error: string }>
> {
  try {
    const graph = await getNeo4jGraph();

    const records = await graph.query<{
      company1: string;
      industry1: string;
      location1: string;
      company2: string;
      industry2: string;
      location2: string;
      score: number;
      sharedMaterials: number;
      sharedNames: string[];
    }>(
      `MATCH (c1:Company)-[r:POTENTIAL_MATCH]->(c2:Company)
       RETURN c1.name AS company1,
              c1.industry AS industry1,
              c1.location AS location1,
              c2.name AS company2,
              c2.industry AS industry2,
              c2.location AS location2,
              r.score AS score,
              r.shared_materials AS sharedMaterials,
              r.shared_names AS sharedNames
       ORDER BY r.score DESC
       LIMIT 30`
    );

    const insights: PartnershipInsight[] = records.map((r) => ({
      company1: r.company1,
      industry1: r.industry1,
      location1: r.location1,
      company2: r.company2,
      industry2: r.industry2,
      location2: r.location2,
      score:
        typeof r.score === "object"
          ? (r.score as unknown as { low: number }).low ?? Number(r.score)
          : Number(r.score),
      sharedMaterials:
        typeof r.sharedMaterials === "object"
          ? (r.sharedMaterials as unknown as { low: number }).low ??
            Number(r.sharedMaterials)
          : Number(r.sharedMaterials),
      sharedNames: r.sharedNames ?? [],
    }));

    return NextResponse.json({ insights });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[Insights] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
