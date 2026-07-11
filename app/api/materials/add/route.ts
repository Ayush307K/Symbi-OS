import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getAuthFromCookie } from "@/lib/auth";
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

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1504917595217-d4dc5ebe6122?auto=format&fit=crop&w=900&q=80";

export async function POST(request: NextRequest) {
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
  const description = body.description ?? `${name} - listed by seller`;
  const price = body.price ?? null;
  const quantity = body.quantity ?? null;

  try {
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
      where: { name },
      update: {
        status: "available",
        category,
        toxicityLevel: toxicity,
        baseElement,
        description,
        price,
        quantity,
      },
      create: {
        id: `mat_${randomUUID().slice(0, 8)}`,
        name,
        category,
        toxicityLevel: toxicity,
        baseElement,
        description,
        price,
        quantity,
        status: "available",
      },
    });

    await prisma.materialProducer.upsert({
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
      },
    });

    const listingId = `listing_${randomUUID().slice(0, 10)}`;
    await prisma.marketplaceListing.create({
      data: {
        id: listingId,
        title: `Seller listed ${name} available for bulk sourcing`,
        slug: `${slugify(name)}-${listingId}`,
        materialId: material.id,
        sellerCompanyId: companyId,
        category,
        subcategory: baseElement,
        area: "Seller location",
        city: "Unknown",
        state: "Unknown",
        country: "India",
        imageUrl: FALLBACK_IMAGE,
        pricePerUnit: price ?? 0,
        currency: "INR",
        unit: "ton",
        minOrderQuantity: 1,
        quantityAvailable: quantity ?? 1,
        leadTimeDays: 7,
        rating: 4.1,
        responseRate: 85,
        verified: true,
        tradeAssurance: true,
        yearsActive: 1,
        ordersCompleted: 0,
        description,
        packaging: "Seller specified",
        paymentTerms: "Escrow supported",
        status: "active",
      },
    });

    const demands = await prisma.demand.findMany({
      where: { materialId: material.id },
      include: { company: true },
    });

    const matchedBuyers = demands.map((demand) => ({
      companyId: demand.company.id,
      companyName: demand.company.name,
      seekingSince: demand.createdAt.toISOString(),
    }));

    if (matchedBuyers.length > 0) {
      const seekerUsers = await prisma.user.findMany({
        where: { companyId: { in: matchedBuyers.map((b) => b.companyId) } },
        select: { email: true },
      });

      for (const user of seekerUsers) {
        notifySeekerOfNewSupply({
          seekerEmail: user.email,
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
