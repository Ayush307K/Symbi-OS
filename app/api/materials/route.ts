import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export interface MaterialListing {
  id: string;
  materialId: string;
  title: string;
  name: string;
  toxicity: string;
  baseElement: string;
  category: string;
  subcategory: string;
  producer: string;
  producerId: string;
  sellerUserId: string | null;
  location: string;
  area: string;
  city: string;
  state: string;
  country: string;
  imageUrl: string;
  price: number | null;
  quantity: number | null;
  unit: string;
  minOrderQuantity: number;
  leadTimeDays: number;
  rating: number;
  responseRate: number;
  verified: boolean;
  tradeAssurance: boolean;
  yearsActive: number;
  ordersCompleted: number;
  description: string;
  packaging: string;
  paymentTerms: string;
  sourceType: string;
  sourceName: string | null;
  sourceUrl: string | null;
  externalId: string | null;
  rawQuantityText: string | null;
  rawLocationText: string | null;
}

export async function GET(): Promise<
  NextResponse<MaterialListing[] | { error: string }>
> {
  try {
    const listings = await prisma.marketplaceListing.findMany({
      where: { status: "active" },
      include: {
        material: true,
        seller: true,
      },
      orderBy: [{ tradeAssurance: "desc" }, { rating: "desc" }, { ordersCompleted: "desc" }],
    });

    const producerIds = [...new Set(listings.map((listing) => listing.sellerCompanyId))];

    const users =
      producerIds.length > 0
        ? await prisma.user.findMany({
            where: { companyId: { in: producerIds } },
            select: { id: true, companyId: true },
          })
        : [];
    const companyToUser = new Map(users.map((u) => [u.companyId, u.id]));

    return NextResponse.json(
      listings.map((listing) => ({
        id: listing.id,
        materialId: listing.material.id,
        title: listing.title,
        name: listing.material.name,
        toxicity: listing.material.toxicityLevel,
        baseElement: listing.material.baseElement,
        category: listing.category,
        subcategory: listing.subcategory,
        producer: listing.seller.name,
        producerId: listing.seller.id,
        sellerUserId: companyToUser.get(listing.seller.id) ?? null,
        location: `${listing.area}, ${listing.city}`,
        area: listing.area,
        city: listing.city,
        state: listing.state,
        country: listing.country,
        imageUrl: listing.imageUrl,
        price: listing.pricePerUnit,
        quantity: listing.quantityAvailable,
        unit: listing.unit,
        minOrderQuantity: listing.minOrderQuantity,
        leadTimeDays: listing.leadTimeDays,
        rating: listing.rating,
        responseRate: listing.responseRate,
        verified: listing.verified,
        tradeAssurance: listing.tradeAssurance,
        yearsActive: listing.yearsActive,
        ordersCompleted: listing.ordersCompleted,
        description: listing.description,
        packaging: listing.packaging,
        paymentTerms: listing.paymentTerms,
        sourceType: listing.sourceType,
        sourceName: listing.sourceName,
        sourceUrl: listing.sourceUrl,
        externalId: listing.externalId,
        rawQuantityText: listing.rawQuantityText,
        rawLocationText: listing.rawLocationText,
      }))
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[Materials API] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
