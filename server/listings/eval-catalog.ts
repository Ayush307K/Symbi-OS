import prisma from "@/lib/prisma";
import { EVAL_LISTINGS, EVAL_LISTING_ID } from "@/eval/fixtures/listings";
import { tryRefreshListingEmbedding } from "@/server/semantic/listing-embeddings";

const DEFAULT_REFERENCE_DATE = new Date("2026-08-24T00:00:00.000Z");

function listingCompanyId(key: string) {
  return `eval_seller_company_${key}`;
}

function listingMaterialId(key: string) {
  return `eval_material_${key}`;
}

/**
 * Upserts only the synthetic catalogue rows. It deliberately does not create
 * evaluation buyers, orders, carts, or graph signals, so exposing the demo
 * corpus cannot pollute production marketplace behavior.
 */
export async function seedEvaluationCatalog(options: {
  referenceDate?: Date;
  refreshEmbeddings?: boolean;
} = {}) {
  const referenceDate = options.referenceDate ?? DEFAULT_REFERENCE_DATE;
  for (const listing of EVAL_LISTINGS) {
    const companyId = listingCompanyId(listing.key);
    const materialId = listingMaterialId(listing.key);
    const listingId = EVAL_LISTING_ID(listing.key);
    await prisma.$transaction(async (tx) => {
      await tx.company.upsert({
        where: { id: companyId },
        create: {
          id: companyId,
          name: `Eval Seller ${listing.key}`,
          industry: listing.category,
          location: `${listing.city}, ${listing.state}, India`,
          carbonRating: "Evaluation only",
          latitude: 0,
          longitude: 0,
          capacity: listing.quantity,
        },
        update: {
          industry: listing.category,
          location: `${listing.city}, ${listing.state}, India`,
          capacity: listing.quantity,
        },
      });
      await tx.wasteMaterial.upsert({
        where: { id: materialId },
        create: {
          id: materialId,
          name: listing.title,
          toxicityLevel: "none",
          baseElement: listing.subcategory,
          category: listing.category,
          description: listing.description,
        },
        update: {
          name: listing.title,
          toxicityLevel: "none",
          baseElement: listing.subcategory,
          category: listing.category,
          description: listing.description,
        },
      });
      await tx.materialProducer.upsert({
        where: { companyId_materialId: { companyId, materialId } },
        create: { companyId, materialId },
        update: {},
      });
      await tx.marketplaceListing.upsert({
        where: { id: listingId },
        create: {
          id: listingId,
          title: listing.title,
          slug: `eval-${listing.key}`,
          sourceType: "synthetic",
          sourceName: "Symbi-OS ISRI-grounded evaluation fixture",
          externalId: `eval:${listing.key}`,
          isEvalOnly: true,
          evalScenarioTags: listing.tags,
          evalClusterId: listing.clusterId,
          materialId,
          sellerCompanyId: companyId,
          category: listing.category,
          subcategory: listing.subcategory,
          area: listing.city,
          city: listing.city,
          state: listing.state,
          country: "India",
          pricePerUnit: listing.price,
          priceMode: "FIXED",
          currency: "INR",
          unit: "ton",
          minOrderQuantity: 10,
          lotIncrement: 5,
          quantityAvailable: listing.quantity,
          leadTimeDays: 7,
          rating: 0,
          responseRate: 0,
          verified: false,
          tradeAssurance: false,
          yearsActive: 0,
          ordersCompleted: 0,
          description: listing.description,
          packaging: "As stated in the evaluation specification",
          paymentTerms: "Evaluation fixture; no transaction permitted",
          safetyDeclaration: true,
          qualityDeclaration: true,
          ownershipDeclaration: true,
          authorityDeclaration: true,
          status: "ACTIVE",
          activatedAt: referenceDate,
          lastVerifiedAt: referenceDate,
        },
        update: {
          title: listing.title,
          sourceType: "synthetic",
          sourceName: "Symbi-OS ISRI-grounded evaluation fixture",
          isEvalOnly: true,
          evalScenarioTags: listing.tags,
          evalClusterId: listing.clusterId,
          category: listing.category,
          subcategory: listing.subcategory,
          area: listing.city,
          city: listing.city,
          state: listing.state,
          pricePerUnit: listing.price,
          quantityAvailable: listing.quantity,
          description: listing.description,
          status: "ACTIVE",
          archivedAt: null,
          lastVerifiedAt: referenceDate,
        },
      });
    });
  }

  let embedded = 0;
  if (options.refreshEmbeddings !== false) {
    for (let index = 0; index < EVAL_LISTINGS.length; index += 4) {
      const batch = EVAL_LISTINGS.slice(index, index + 4);
      const results = await Promise.all(
        batch.map((listing) =>
          tryRefreshListingEmbedding(EVAL_LISTING_ID(listing.key)),
        ),
      );
      embedded += results.filter(Boolean).length;
    }
  }
  return { listings: EVAL_LISTINGS.length, embedded };
}
