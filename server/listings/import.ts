import prisma from "@/lib/prisma";
import { isSafeMaterial } from "@/server/safety";
import {
  configuredProvider,
  stableId,
  type ListingProvider,
  type ProviderListing,
} from "@/server/listings/providers";

export function canonicalCategory(text: string) {
  const value = text.toLowerCase();
  if (/aluminium|aluminum|copper|brass|metal|steel|iron|ingot|hms|ubc/.test(value))
    return "Metal Scrap";
  if (/ldpe|hdpe|pet|plastic|polymer|granule|polypropylene|film/.test(value))
    return "Plastic Scrap";
  if (/paper|cardboard|kraft|carton/.test(value)) return "Paper & Cardboard";
  if (/textile|cloth|clothing|fabric|fiber|fibre/.test(value)) return "Textile Waste";
  if (/rubber|crumb|tyre|tire/.test(value)) return "Rubber";
  if (/glass|cullet/.test(value)) return "Glass";
  if (/fly ash|slag|mineral|cement|construction|gypsum/.test(value))
    return "Fly Ash & Minerals";
  if (/agri|biomass|bagasse|rice husk|straw/.test(value))
    return "Agricultural Residue";
  return null;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

async function upsertListing(provider: ListingProvider, row: ProviderListing) {
  const category = canonicalCategory(`${row.categoryText} ${row.title} ${row.description}`);
  if (
    !category ||
    !row.title ||
    !row.sourceUrl ||
    row.country.toLowerCase() !== "india" ||
    !isSafeMaterial({
      name: row.title,
      category,
      description: row.description,
      toxicity: "none",
    })
  ) {
    return false;
  }

  const companyId = stableId("provider_company", `${provider.name}:${row.companyName}`);
  const materialId = stableId("provider_material", row.externalId);
  const listingId = stableId("provider_listing", row.externalId);
  await prisma.$transaction(async (tx) => {
    await tx.company.upsert({
      where: { id: companyId },
      create: {
        id: companyId,
        name: `${row.companyName} (${companyId.slice(-6)})`,
        industry: category,
        location: `${row.city}, ${row.state}, India`,
        carbonRating: "Unrated",
        latitude: 0,
        longitude: 0,
        capacity: row.quantity,
      },
      update: {
        industry: category,
        location: `${row.city}, ${row.state}, India`,
        capacity: row.quantity,
      },
    });
    await tx.wasteMaterial.upsert({
      where: { id: materialId },
      create: {
        id: materialId,
        name: `${row.title} (${materialId.slice(-6)})`,
        toxicityLevel: "none",
        baseElement: row.subcategory || category,
        category,
        description: row.description,
      },
      update: {
        toxicityLevel: "none",
        baseElement: row.subcategory || category,
        category,
        description: row.description,
      },
    });
    await tx.materialProducer.upsert({
      where: { companyId_materialId: { companyId, materialId } },
      create: { companyId, materialId },
      update: {},
    });
    await tx.marketplaceListing.upsert({
      where: { externalId: row.externalId },
      create: {
        id: listingId,
        title: row.title,
        slug: `${slugify(row.title)}-${listingId.slice(-8)}`,
        sourceType: provider.sourceType,
        sourceName: row.sourceName,
        sourceUrl: row.sourceUrl,
        externalId: row.externalId,
        rawQuantityText: row.rawQuantity,
        rawLocationText: `${row.city}, ${row.state}, India`,
        materialId,
        sellerCompanyId: companyId,
        category,
        subcategory: row.subcategory || category,
        area: row.city,
        city: row.city,
        state: row.state,
        country: "India",
        imageUrl: row.imageUrl,
        pricePerUnit: row.price,
        currency: row.currency || "INR",
        unit: row.unit || "lot",
        minOrderQuantity: 1,
        quantityAvailable: row.quantity,
        leadTimeDays: 0,
        rating: 0,
        responseRate: 0,
        verified: false,
        tradeAssurance: false,
        yearsActive: 0,
        ordersCompleted: 0,
        description: row.description,
        packaging: "As described by source provider",
        paymentTerms: "Contact source provider",
        status: "ACTIVE",
        lastVerifiedAt: new Date(),
        safetyDeclaration: true,
        qualityDeclaration: true,
        ownershipDeclaration: true,
        authorityDeclaration: true,
        activatedAt: new Date(),
      },
      update: {
        title: row.title,
        sourceType: provider.sourceType,
        sourceName: row.sourceName,
        sourceUrl: row.sourceUrl,
        rawQuantityText: row.rawQuantity,
        rawLocationText: `${row.city}, ${row.state}, India`,
        category,
        subcategory: row.subcategory || category,
        city: row.city,
        state: row.state,
        imageUrl: row.imageUrl,
        pricePerUnit: row.price,
        currency: row.currency || "INR",
        unit: row.unit || "lot",
        quantityAvailable: row.quantity,
        description: row.description,
        status: "ACTIVE",
        lastVerifiedAt: new Date(),
        activatedAt: new Date(),
      },
    });
  });
  return true;
}

export async function importRealListings(provider = configuredProvider()) {
  const run = await prisma.listingImportRun.create({
    data: { provider: provider.name },
  });
  try {
    const rows = await provider.fetch();
    if (rows.length === 0) {
      throw new Error(
        `${provider.name} returned no listings. The import was rejected to avoid a false successful run.`,
      );
    }
    let upserted = 0;
    let rejected = 0;
    for (const row of rows) {
      if (await upsertListing(provider, row)) upserted += 1;
      else rejected += 1;
    }
    await prisma.listingImportRun.update({
      where: { id: run.id },
      data: {
        status: "COMPLETED",
        recordsSeen: rows.length,
        recordsUpserted: upserted,
        recordsRejected: rejected,
        finishedAt: new Date(),
      },
    });
    return { provider: provider.name, seen: rows.length, upserted, rejected };
  } catch (error) {
    await prisma.listingImportRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        errorSummary: error instanceof Error ? error.message.slice(0, 1000) : "Unknown error",
        finishedAt: new Date(),
      },
    });
    throw error;
  }
}
