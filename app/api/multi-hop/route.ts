import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

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

function distanceKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const radius = 6371;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return Math.round(radius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
}

export async function POST(
  request: NextRequest
): Promise<NextResponse<{ routes: SupplyRoute[] } | { error: string }>> {
  let body: MultiHopRequest;
  try {
    body = (await request.json()) as MultiHopRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const materialName = body.material?.trim();
  if (!materialName) {
    return NextResponse.json(
      { error: "Missing required field: material" },
      { status: 400 }
    );
  }

  const maxDistanceKm = body.maxDistanceKm ?? 5000;
  const minCapacity = body.minCapacity ?? 0;

  try {
    const material = await prisma.wasteMaterial.findUnique({
      where: { name: materialName },
      include: {
        producers: { include: { company: true } },
        upcyclers: {
          include: {
            company: {
              include: {
                upcycles: {
                  include: { material: { select: { name: true } } },
                  take: 6,
                },
              },
            },
          },
        },
      },
    });

    if (!material) return NextResponse.json({ routes: [] });

    const routes: SupplyRoute[] = [];
    for (const producerEdge of material.producers) {
      for (const upcyclerEdge of material.upcyclers) {
        const producer = producerEdge.company;
        const upcycler = upcyclerEdge.company;
        if (producer.id === upcycler.id) continue;
        if (upcycler.capacity < minCapacity) continue;
        const dist = distanceKm(producer, upcycler);
        if (dist > maxDistanceKm) continue;

        routes.push({
          producer: producer.name,
          producerLocation: producer.location,
          producerIndustry: producer.industry,
          material: material.name,
          materialCategory: material.category,
          materialToxicity: material.toxicityLevel,
          upcycler: upcycler.name,
          upcyclerLocation: upcycler.location,
          upcyclerIndustry: upcycler.industry,
          distanceKm: dist,
          upcyclerCapacity: upcycler.capacity,
          alsoUpcycles: upcycler.upcycles
            .map((edge) => edge.material.name)
            .filter((name) => name !== material.name)
            .slice(0, 5),
        });
      }
    }

    return NextResponse.json({
      routes: routes.sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 20),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[MultiHop] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
