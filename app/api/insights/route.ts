import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

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

export async function GET(): Promise<
  NextResponse<{ insights: PartnershipInsight[] } | { error: string }>
> {
  try {
    const matches = await prisma.potentialMatch.findMany({
      orderBy: { score: "desc" },
      take: 30,
      include: {
        company1: true,
        company2: true,
      },
    });

    const insights = matches.map((match) => ({
      company1: match.company1.name,
      industry1: match.company1.industry,
      location1: match.company1.location,
      company2: match.company2.name,
      industry2: match.company2.industry,
      location2: match.company2.location,
      score: match.score,
      sharedMaterials: match.sharedMaterials,
      sharedNames: JSON.parse(match.sharedNamesJson) as string[],
    }));

    return NextResponse.json({ insights });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[Insights] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
