// ---------------------------------------------------------------------------
//  POST /api/materials/add
//
//  Seller Listing + Demand Matchmaker
//  1. A logged-in seller lists a new waste material.
//  2. Creates/updates the WasteMaterial node + PRODUCES edge in Neo4j.
//  3. Checks for IS_SEEKING buyers — returns matched demand alerts.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { getAuthFromCookie } from "@/lib/auth";
import { getNeo4jGraph } from "@/lib/neo4j-graph";
import { randomUUID } from "crypto";
import prisma from "@/lib/prisma";
import { notifySeekerOfNewSupply } from "@/lib/mailer";

interface AddMaterialBody {
  name: string;
  category?: string;
  toxicity?: string;
  baseElement?: string;
  description?: string;
  price?: number;
  quantity?: number;
}

interface MatchedBuyer {
  companyId: string;
  companyName: string;
  seekingSince: string | null;
}

export async function POST(request: NextRequest) {
  // ---- Auth check ---------------------------------------------------------------
  const auth = await getAuthFromCookie();
  if (!auth) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  let body: AddMaterialBody;
  try {
    body = (await request.json()) as AddMaterialBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json(
      { error: "Missing required field: name" },
      { status: 400 }
    );
  }

  const category = body.category ?? "Uncategorized";
  const toxicity = body.toxicity ?? "medium";
  const baseElement = body.baseElement ?? "Unknown";
  const description = body.description ?? `${name} — listed by seller`;
  const price = body.price ?? null;
  const quantity = body.quantity ?? null;

  try {
    const graph = await getNeo4jGraph();
    const materialId = `mat_${randomUUID().slice(0, 8)}`;

    // ---- Step 1: MERGE material + PRODUCES edge ------------------------------
    await graph.query(
      `MATCH (seller:Company {id: $companyId})
       MERGE (m:WasteMaterial {name: $name})
       ON CREATE SET m.id = $materialId,
                     m.category = $category,
                     m.toxicity_level = $toxicity,
                     m.base_element = $baseElement,
                     m.description = $description,
                     m.status = 'available',
                     m.price = $price,
                     m.quantity = $quantity
       ON MATCH SET  m.status = 'available',
                     m.category = CASE WHEN m.category = 'Requested' THEN $category ELSE m.category END,
                     m.toxicity_level = CASE WHEN m.toxicity_level = 'unknown' THEN $toxicity ELSE m.toxicity_level END,
                     m.base_element = CASE WHEN m.base_element = 'unknown' THEN $baseElement ELSE m.base_element END,
                     m.description = CASE WHEN m.description STARTS WITH 'Demand request:' THEN $description ELSE m.description END,
                     m.price = CASE WHEN $price IS NOT NULL THEN $price ELSE m.price END,
                     m.quantity = CASE WHEN $quantity IS NOT NULL THEN $quantity ELSE m.quantity END
       MERGE (seller)-[:PRODUCES]->(m)`,
      { companyId: auth.neo4jCompanyId, name, materialId, category, toxicity, baseElement, description, price, quantity }
    );

    // ---- Step 2: Check for IS_SEEKING buyers (Demand Matchmaker) -------------
    const seekingRecords = await graph.query<{
      companyId: string;
      companyName: string;
      seekingSince: string | null;
    }>(
      `MATCH (buyer:Company)-[r:IS_SEEKING]->(m:WasteMaterial {name: $name})
       RETURN buyer.id AS companyId,
              buyer.name AS companyName,
              toString(r.createdAt) AS seekingSince`,
      { name }
    );

    const matchedBuyers: MatchedBuyer[] = seekingRecords.map((r) => ({
      companyId: r.companyId,
      companyName: r.companyName,
      seekingSince: r.seekingSince,
    }));

    // ---- Step 3: Email seekers about new supply --------------------------------
    if (matchedBuyers.length > 0) {
      // Look up seeker emails from Prisma by matching neo4jCompanyId
      const seekerCompanyIds = matchedBuyers.map((b) => b.companyId);
      const seekerUsers = await prisma.user.findMany({
        where: { neo4jCompanyId: { in: seekerCompanyIds } },
        select: { email: true },
      });
      for (const u of seekerUsers) {
        notifySeekerOfNewSupply({
          seekerEmail: u.email,
          materialName: name,
          sellerCompany: auth.companyName,
        });
      }
    }

    return NextResponse.json({
      success: true,
      material: { name, category, toxicity, baseElement, description, price, quantity },
      matchedBuyers,
      matchCount: matchedBuyers.length,
      message:
        matchedBuyers.length > 0
          ? `Material listed! ${matchedBuyers.length} buyer(s) are seeking this material.`
          : "Material listed successfully. No pending demand yet.",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[MaterialsAdd] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
