// ---------------------------------------------------------------------------
//  GET /api/materials
//
//  Fetches all WasteMaterial nodes from Neo4j along with one producer
//  company for each, to populate the Marketplace Feed.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { getNeo4jGraph } from "@/lib/neo4j-graph";
import prisma from "@/lib/prisma";

export interface MaterialListing {
  id: string;
  name: string;
  toxicity: string;
  baseElement: string;
  category: string;
  producer: string;
  producerId: string;
  sellerUserId: string | null;
  location: string;
  price: number | null;
  quantity: number | null;
}

export async function GET(): Promise<NextResponse<MaterialListing[] | { error: string }>> {
  try {
    const graph = await getNeo4jGraph();

    const records = await graph.query<{
      wasteId: string;
      name: string;
      toxicity: string;
      baseElement: string;
      category: string;
      producer: string;
      producerId: string;
      location: string;
      price: unknown;
      quantity: unknown;
    }>(
      `MATCH (c:Company)-[:PRODUCES]->(w:WasteMaterial)
       WITH w, c ORDER BY w.name, c.name
       WITH w, collect(c)[0] AS firstProducer
       RETURN w.id AS wasteId,
              w.name AS name,
              w.toxicity_level AS toxicity,
              w.base_element AS baseElement,
              w.category AS category,
              firstProducer.name AS producer,
              firstProducer.id AS producerId,
              firstProducer.location AS location,
              w.price AS price,
              w.quantity AS quantity
       ORDER BY w.name`
    );

    const toNum = (v: unknown): number | null => {
      if (v == null) return null;
      if (typeof v === "number") return v;
      if (typeof v === "object" && v !== null && "low" in v) return (v as { low: number }).low;
      return Number(v) || null;
    };

    // Build a map of neo4jCompanyId → userId for seller lookup
    const producerIds = [...new Set(records.map((r) => r.producerId).filter(Boolean))];
    const users = producerIds.length > 0
      ? await prisma.user.findMany({
          where: { neo4jCompanyId: { in: producerIds } },
          select: { id: true, neo4jCompanyId: true },
        })
      : [];
    const companyToUser = new Map(users.map((u) => [u.neo4jCompanyId, u.id]));

    const listings: MaterialListing[] = records.map((r) => ({
      id: r.wasteId,
      name: r.name,
      toxicity: r.toxicity,
      baseElement: r.baseElement,
      category: r.category,
      producer: r.producer,
      producerId: r.producerId,
      sellerUserId: companyToUser.get(r.producerId) ?? null,
      location: r.location,
      price: toNum(r.price),
      quantity: toNum(r.quantity),
    }));

    return NextResponse.json(listings);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[Materials API] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
