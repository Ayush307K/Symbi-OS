import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

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

export async function POST(
  request: NextRequest
): Promise<
  NextResponse<{ source: string; recommendations: Recommendation[] } | { error: string }>
> {
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
    const source = await prisma.wasteMaterial.findUnique({
      where: { name: materialName },
      include: {
        complements: {
          include: {
            target: {
              include: {
                upcyclers: { include: { company: { select: { name: true } } } },
                producers: { include: { company: { select: { name: true } } } },
              },
            },
          },
        },
      },
    });

    const recommendations =
      source?.complements.map((edge) => ({
        id: edge.target.id,
        name: edge.target.name,
        category: edge.target.category,
        toxicity: edge.target.toxicityLevel,
        baseElement: edge.target.baseElement,
        upcyclers: edge.target.upcyclers.map((u) => u.company.name).slice(0, 5),
        producers: edge.target.producers.map((p) => p.company.name).slice(0, 3),
      })) ?? [];

    return NextResponse.json({ source: materialName, recommendations });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[Recommendations] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
