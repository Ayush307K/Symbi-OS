import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export interface StatsResponse {
  matches: number;
  co2Saved: number;
  landfillDiverted: number;
}

export async function GET(): Promise<
  NextResponse<StatsResponse | { error: string }>
> {
  try {
    const [matches, co2Saved, landfillDiverted] = await Promise.all([
      prisma.materialUpcycler.count(),
      prisma.company.count({ where: { carbonRating: { in: ["A", "B"] } } }),
      prisma.wasteMaterial.count(),
    ]);

    return NextResponse.json({ matches, co2Saved, landfillDiverted });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[Stats API] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
