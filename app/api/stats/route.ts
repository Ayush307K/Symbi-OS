// ---------------------------------------------------------------------------
//  GET /api/stats
//
//  Returns live metrics from Neo4j for the NavBar:
//    - matches:  count of CAN_UPCYCLE relationships (symbiotic matches)
//    - co2Saved: count of companies with carbon_rating "A" or "B" (green-rated)
//    - landfillDiverted: count of distinct WasteMaterial nodes
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { getNeo4jGraph } from "@/lib/neo4j-graph";

export interface StatsResponse {
  matches: number;
  co2Saved: number;
  landfillDiverted: number;
}

export async function GET(): Promise<NextResponse<StatsResponse | { error: string }>> {
  try {
    const graph = await getNeo4jGraph();

    const [matchRows, co2Rows, wasteRows] = await Promise.all([
      graph.query<{ count: number }>(
        `MATCH ()-[r:CAN_UPCYCLE]->() RETURN count(r) AS count`
      ),
      graph.query<{ count: number }>(
        `MATCH (c:Company) WHERE c.carbon_rating IN ['A', 'B'] RETURN count(c) AS count`
      ),
      graph.query<{ count: number }>(
        `MATCH (w:WasteMaterial) RETURN count(w) AS count`
      ),
    ]);

    return NextResponse.json({
      matches: matchRows[0]?.count ?? 0,
      co2Saved: co2Rows[0]?.count ?? 0,
      landfillDiverted: wasteRows[0]?.count ?? 0,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[Stats API] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
