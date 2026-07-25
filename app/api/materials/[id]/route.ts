import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { publicListingWhere } from "@/server/listings/policy";

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
    price: listing.priceMode === "ON_REQUEST" ? null : listing.pricePerUnit,
    priceMode: listing.priceMode,
    currency: listing.currency,
    quantity: listing.quantityAvailable,
    unit: listing.unit,
    minOrderQuantity: listing.minOrderQuantity,
    leadTimeDays: listing.leadTimeDays,
    rating: 0,
    responseRate: 0,
    verified: false,
    tradeAssurance: false,
    yearsActive: listing.yearsActive,
    ordersCompleted: 0,
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
    lastVerifiedAt: listing.lastVerifiedAt ?? listing.updatedAt,
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
        ...publicListingWhere,
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

    const [sellerUser, sellerListingCount, categoryListingCount, fulfilledOrders, related, sameSeller, sellerOnboarding, messageThreads] =
      await Promise.all([
        prisma.user.findFirst({
          where: { companyId: listing.sellerCompanyId },
          select: { id: true },
        }),
        prisma.marketplaceListing.count({
          where: { sellerCompanyId: listing.sellerCompanyId, ...publicListingWhere },
        }),
        prisma.marketplaceListing.count({
          where: { ...publicListingWhere, category: listing.category },
        }),
        prisma.purchaseOrderItem.count({
          where: {
            sellerCompanyId: listing.sellerCompanyId,
            status: { in: ["FULFILLED", "DELIVERED"] },
            order: {
              fulfillmentStatus: { in: ["FULFILLED", "DELIVERED"] },
            },
          },
        }),
        prisma.marketplaceListing.findMany({
          where: {
            id: { not: listing.id },
            ...publicListingWhere,
            category: listing.category,
          },
          include: { material: true, seller: true },
          orderBy: [{ rating: "desc" }, { updatedAt: "desc" }],
          take: 8,
        }),
        prisma.marketplaceListing.findMany({
          where: {
            id: { not: listing.id },
            sellerCompanyId: listing.sellerCompanyId,
            ...publicListingWhere,
          },
          include: { material: true, seller: true },
          orderBy: [{ updatedAt: "desc" }],
          take: 8,
        }),
        prisma.sellerOnboarding.findFirst({
          where: {
            status: "APPROVED",
            user: { companyId: listing.sellerCompanyId },
          },
          select: { verifiedAt: true },
        }),
        prisma.messageThread.findMany({
          where: { listingId: listing.id },
          select: {
            buyerUserId: true,
            messages: { select: { senderUserId: true } },
          },
        }),
      ]);

    const reviewAverage =
      listing.reviews.length === 0
        ? null
        : listing.reviews.reduce((sum, review) => sum + review.rating, 0) / listing.reviews.length;

    return NextResponse.json({
      listing: {
        ...mapListing(listing),
        sellerUserId: sellerUser?.id ?? null,
        rating: reviewAverage ?? 0,
        responseRate: messageThreads.length
          ? Math.round(
              (messageThreads.filter((thread) =>
                thread.messages.some(
                  (message) => message.senderUserId !== thread.buyerUserId,
                ),
              ).length /
                messageThreads.length) *
                100,
            )
          : 0,
        verified:
          listing.sourceType === "seller_submitted" &&
          Boolean(sellerOnboarding),
        ordersCompleted: fulfilledOrders,
      },
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
