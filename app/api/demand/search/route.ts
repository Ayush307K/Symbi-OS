import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getAuthFromCookie } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { notifyDemandRegistered } from "@/lib/mailer";

interface DemandSearchBody {
  query: string;
}

export async function POST(request: NextRequest) {
  const auth = await getAuthFromCookie();
  if (!auth) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  let body: DemandSearchBody;
  try {
    body = (await request.json()) as DemandSearchBody;
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

  try {
    const supply = await prisma.wasteMaterial.findMany({
      where: {
        status: "available",
        OR: [
          { name: { contains: query } },
          { description: { contains: query } },
          { category: { contains: query } },
          { baseElement: { contains: query } },
        ],
      },
      include: {
        producers: {
          include: { company: { select: { name: true } } },
        },
      },
      take: 5,
    });

    if (supply.length > 0) {
      return NextResponse.json({
        status: "supply_found",
        message: `Found ${supply.length} matching material(s) in the supply network.`,
        results: supply.map((material) => ({
          id: material.id,
          name: material.name,
          category: material.category,
          toxicity: material.toxicityLevel,
          similarity: -1,
          producers: material.producers.map((edge) => edge.company.name),
        })),
        demandRegistered: false,
      });
    }

    const companyId =
      auth.companyId ?? `company_${randomUUID().slice(0, 8)}`;
    await prisma.company.upsert({
      where: { id: companyId },
      update: {},
      create: {
        id: companyId,
        name: auth.companyName,
        industry: "General",
        location: "Unknown",
        carbonRating: "B",
        latitude: 0,
        longitude: 0,
        capacity: 0,
      },
    });
    await prisma.user.update({
      where: { id: auth.userId },
      data: { companyId: companyId },
    });

    const material = await prisma.wasteMaterial.upsert({
      where: { name: query },
      update: {},
      create: {
        id: `demand_${randomUUID().slice(0, 8)}`,
        name: query,
        status: "requested",
        category: "Requested",
        toxicityLevel: "unknown",
        baseElement: "unknown",
        description: `Demand request: ${query}`,
      },
    });

    await prisma.demand.upsert({
      where: {
        companyId_materialId: {
          companyId,
          materialId: material.id,
        },
      },
      update: {},
      create: {
        companyId,
        materialId: material.id,
        userId: auth.userId,
      },
    });

    notifyDemandRegistered({
      buyerEmail: auth.email,
      materialQuery: query,
    });

    return NextResponse.json({
      status: "demand_registered",
      message: `No current supply found for "${query}". Your demand has been registered.`,
      results: [],
      demandRegistered: true,
      demandDetails: {
        materialName: query,
        companyId,
        ghostNodeId: material.id,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[DemandSearch] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
