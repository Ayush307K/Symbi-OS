// ---------------------------------------------------------------------------
//  POST /api/multi-hop
//
//  Multi-Hop Constraint Solving — "The Middleman Problem"
//
//  Finds supply chain routes:
//    Producer → (PRODUCES) → WasteMaterial → (CAN_UPCYCLE) ← Upcycler
//
//  With geospatial distance constraints and capacity filtering.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { getNeo4jGraph } from "@/lib/neo4j-graph";

// ---------------------------------------------------------------------------
//  Types
// ---------------------------------------------------------------------------

export interface SupplyRoute {
  producer: string;
  producerLocation: string;
  producerIndustry: string;
  material: string;
  materialCategory: string;
  materialToxicity: string;
  upcycler: string;
  upcyclerLocation: string;
  upcyclerIndustry: string;
  distanceKm: number;
  upcyclerCapacity: number;
  alsoUpcycles: string[];
}

interface MultiHopRequest {
  material: string;
  maxDistanceKm?: number;
  minCapacity?: number;
}

// ---------------------------------------------------------------------------
//  Route Handler
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest
): Promise<NextResponse<{ routes: SupplyRoute[] } | { error: string }>> {
  let body: MultiHopRequest;
  try {
    body = (await request.json()) as MultiHopRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const material = body.material?.trim();
  if (!material) {
    return NextResponse.json(
      { error: "Missing required field: material" },
      { status: 400 }
    );
  }

  const maxDistanceKm = body.maxDistanceKm ?? 5000;
  const minCapacity = body.minCapacity ?? 0;

  try {
    const graph = await getNeo4jGraph();

    const records = await graph.query<{
      producer: string;
      producerLocation: string;
      producerIndustry: string;
      material: string;
      materialCategory: string;
      materialToxicity: string;
      upcycler: string;
      upcyclerLocation: string;
      upcyclerIndustry: string;
      distanceKm: number;
      upcyclerCapacity: number;
      alsoUpcycles: string[];
    }>(
      `MATCH (producer:Company)-[:PRODUCES]->(w:WasteMaterial)<-[:CAN_UPCYCLE]-(upcycler:Company)
       WHERE w.name = $material
         AND producer <> upcycler
         AND producer.latitude IS NOT NULL
         AND upcycler.latitude IS NOT NULL
         AND upcycler.capacity >= $minCapacity
       WITH producer, w, upcycler,
            point.distance(
              point({latitude: producer.latitude, longitude: producer.longitude}),
              point({latitude: upcycler.latitude, longitude: upcycler.longitude})
            ) / 1000.0 AS distKm
       WHERE distKm <= $maxDistanceKm
       OPTIONAL MATCH (upcycler)-[:CAN_UPCYCLE]->(other:WasteMaterial)
       WHERE other <> w
       WITH producer, w, upcycler, distKm,
            collect(DISTINCT other.name)[0..5] AS alsoUpcycles
       RETURN producer.name AS producer,
              producer.location AS producerLocation,
              producer.industry AS producerIndustry,
              w.name AS material,
              w.category AS materialCategory,
              w.toxicity_level AS materialToxicity,
              upcycler.name AS upcycler,
              upcycler.location AS upcyclerLocation,
              upcycler.industry AS upcyclerIndustry,
              round(distKm) AS distanceKm,
              upcycler.capacity AS upcyclerCapacity,
              alsoUpcycles
       ORDER BY distKm ASC
       LIMIT 20`,
      { material, maxDistanceKm, minCapacity }
    );

    const routes: SupplyRoute[] = records.map((r) => ({
      producer: r.producer,
      producerLocation: r.producerLocation,
      producerIndustry: r.producerIndustry,
      material: r.material,
      materialCategory: r.materialCategory,
      materialToxicity: r.materialToxicity,
      upcycler: r.upcycler,
      upcyclerLocation: r.upcyclerLocation,
      upcyclerIndustry: r.upcyclerIndustry,
      distanceKm: typeof r.distanceKm === "object"
        ? (r.distanceKm as unknown as { low: number }).low ?? Number(r.distanceKm)
        : Number(r.distanceKm),
      upcyclerCapacity: typeof r.upcyclerCapacity === "object"
        ? (r.upcyclerCapacity as unknown as { low: number }).low ?? Number(r.upcyclerCapacity)
        : Number(r.upcyclerCapacity),
      alsoUpcycles: r.alsoUpcycles ?? [],
    }));

    return NextResponse.json({ routes });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[MultiHop] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
