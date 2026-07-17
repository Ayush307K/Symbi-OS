import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

function mapListing(listing: any) {
  return {
    id: listing.id,
    materialId: listing.material.id,
    title: listing.title,
    name: listing.material.name,
    toxicity: listing.material.toxicityLevel,
    baseElement: listing.material.baseElement,
    materialDescription: listing.material.description,
    category: listing.category,
    subcategory: listing.subcategory,
    producer: listing.seller.name,
    producerId: listing.seller.id,
    sellerUserId: null,
    sellerIndustry: listing.seller.industry,
    sellerLocation: listing.seller.location,
    sellerCarbonRating: listing.seller.carbonRating,
    sellerCapacity: listing.seller.capacity,
    location: `${listing.area}, ${listing.city}`,
    area: listing.area,
    city: listing.city,
    state: listing.state,
    country: listing.country,
    imageUrl: listing.imageUrl,
    price: listing.pricePerUnit,
    currency: listing.currency,
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
    createdAt: listing.createdAt,
    updatedAt: listing.updatedAt,
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const listing = await prisma.marketplaceListing.findFirst({
      where: {
        OR: [{ id }, { slug: id }, { externalId: id }],
        status: "active",
      },
      include: {
        material: true,
        seller: true,
        reviews: {
          where: { status: "PUBLISHED" },
          include: { user: { select: { companyName: true } } },
          orderBy: { createdAt: "desc" },
          take: 20,
        },
      },
    });

    if (!listing) {
      return NextResponse.json({ error: "Listing not found." }, { status: 404 });
    }

    const [sellerUser, sellerListingCount, categoryListingCount, fulfilledOrders, related, sameSeller] =
      await Promise.all([
        prisma.user.findFirst({
          where: { companyId: listing.sellerCompanyId },
          select: { id: true },
        }),
        prisma.marketplaceListing.count({
          where: { sellerCompanyId: listing.sellerCompanyId, status: "active" },
        }),
        prisma.marketplaceListing.count({
          where: { category: listing.category, status: "active" },
        }),
        prisma.purchaseOrderItem.count({
          where: {
            sellerCompanyId: listing.sellerCompanyId,
            status: { in: ["CONFIRMED", "SHIPPED", "DELIVERED"] },
          },
        }),
        prisma.marketplaceListing.findMany({
          where: {
            id: { not: listing.id },
            category: listing.category,
            status: "active",
          },
          include: { material: true, seller: true },
          orderBy: [{ rating: "desc" }, { updatedAt: "desc" }],
          take: 8,
        }),
        prisma.marketplaceListing.findMany({
          where: {
            id: { not: listing.id },
            sellerCompanyId: listing.sellerCompanyId,
            status: "active",
          },
          include: { material: true, seller: true },
          orderBy: [{ updatedAt: "desc" }],
          take: 8,
        }),
      ]);

    const reviewAverage =
      listing.reviews.length === 0
        ? null
        : listing.reviews.reduce((sum, review) => sum + review.rating, 0) / listing.reviews.length;

    return NextResponse.json({
      listing: { ...mapListing(listing), sellerUserId: sellerUser?.id ?? null },
      reviews: listing.reviews.map((review) => ({
        id: review.id,
        rating: review.rating,
        title: review.title,
        body: review.body,
        verifiedPurchase: review.verifiedPurchase,
        helpfulCount: review.helpfulCount,
        companyName: review.user.companyName,
        createdAt: review.createdAt,
      })),
      sellerStats: {
        activeListings: sellerListingCount,
        categoryListings: categoryListingCount,
        fulfilledOrders,
        reviewAverage,
        reviewCount: listing.reviews.length,
      },
      related: related.map(mapListing),
      sameSeller: sameSeller.map(mapListing),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[Material Detail API] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
