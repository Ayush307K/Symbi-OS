import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { SAFE_CATEGORIES } from "@/server/safety";

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

function scoreMaterial(material: {
  name: string;
  category: string;
  baseElement: string;
  description: string;
}, query: string) {
  const q = query.toLowerCase();
  const fields = [
    [material.name, 0.55],
    [material.category, 0.2],
    [material.baseElement, 0.15],
    [material.description, 0.1],
  ] as const;

  let score = 0;
  for (const [value, weight] of fields) {
    const text = value.toLowerCase();
    if (text === q) score += weight;
    else if (text.includes(q)) score += weight * 0.8;
    else {
      const tokens = q.split(/\s+/).filter(Boolean);
      const hits = tokens.filter((token) => text.includes(token)).length;
      if (tokens.length > 0) score += weight * (hits / tokens.length) * 0.55;
    }
  }
  return Math.min(1, Math.round(score * 1000) / 1000);
}

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
    const candidates = await prisma.wasteMaterial.findMany({
      where: {
        toxicityLevel: { in: ["none", "low"] },
        category: { in: [...SAFE_CATEGORIES] },
        listings: {
          some: {
            status: { in: ["ACTIVE", "active"] },
            sourceType: { in: ["real_api", "real_public_provider", "seller_submitted"] },
          },
        },
        OR: [
          { name: { contains: query } },
          { description: { contains: query } },
          { category: { contains: query } },
          { baseElement: { contains: query } },
        ],
      },
      include: {
        producers: { include: { company: { select: { name: true } } } },
        upcyclers: { include: { company: { select: { name: true } } } },
        regulations: { include: { regulation: { select: { code: true } } } },
      },
      take: 100,
    });

    const fallback =
      candidates.length > 0
        ? candidates
        : await prisma.wasteMaterial.findMany({
            where: {
              toxicityLevel: { in: ["none", "low"] },
              category: { in: [...SAFE_CATEGORIES] },
              listings: {
                some: {
                  status: { in: ["ACTIVE", "active"] },
                  sourceType: {
                    in: ["real_api", "real_public_provider", "seller_submitted"],
                  },
                },
              },
            },
            include: {
              producers: { include: { company: { select: { name: true } } } },
              upcyclers: { include: { company: { select: { name: true } } } },
              regulations: { include: { regulation: { select: { code: true } } } },
            },
            take: 100,
          });

    const results = fallback
      .map((material) => ({
        id: material.id,
        name: material.name,
        category: material.category,
        toxicity: material.toxicityLevel,
        baseElement: material.baseElement,
        description: material.description,
        similarity: scoreMaterial(material, query),
        producers: material.producers.map((edge) => edge.company.name),
        upcyclers: material.upcyclers.map((edge) => edge.company.name),
        regulations: material.regulations.map((edge) => edge.regulation.code),
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);

    return NextResponse.json({ results });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[HybridSearch] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
