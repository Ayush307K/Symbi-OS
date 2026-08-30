import { normalizeListingUnit } from "@/lib/listing-constants";
import prisma from "@/lib/prisma";
import { isSafeMaterial } from "@/server/safety";
import {
  configuredProvider,
  stableId,
  type ListingProvider,
  type ProviderListing,
} from "@/server/listings/providers";
import { tryRefreshListingEmbedding } from "@/server/semantic/listing-embeddings";
import {
  REAL_CORPUS_TARGETS,
  type TargetCategory,
} from "@/server/listings/corpus-targets";
import { geocodeData, geocodeLocation } from "@/server/geocoding";

export function canonicalCategory(text: string) {
  const value = text.toLowerCase();
  if (
    /aluminium|aluminum|copper|brass|metal|steel|iron|ingot|hms|ubc/.test(value)
  )
    return "Metal Scrap";
  if (/ldpe|hdpe|pet|plastic|polymer|granule|polypropylene|film/.test(value))
    return "Plastic Scrap";
  if (/paper|cardboard|kraft|carton/.test(value)) return "Paper & Cardboard";
  if (/textile|cloth|clothing|fabric|fiber|fibre/.test(value))
    return "Textile Waste";
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

async function upsertListing(
  provider: ListingProvider,
  row: ProviderListing,
  refreshEmbedding: boolean,
) {
  const category = importableCategory(row);
  if (!category) return false;

  const companyId = stableId(
    "provider_company",
    `${provider.name}:${row.companyName}`,
  );
  const materialId = stableId("provider_material", row.externalId);
  const listingId = stableId("provider_listing", row.externalId);
  const geocode = await geocodeLocation({
    city: row.city,
    state: row.state,
    country: row.country,
  });
  await prisma.$transaction(async (tx) => {
    await tx.company.upsert({
      where: { id: companyId },
      create: {
        id: companyId,
        name: `${row.companyName} (${companyId.slice(-6)})`,
        industry: category,
        location: `${geocode?.normalizedCity || row.city}, ${geocode?.normalizedState || row.state}, India`,
        carbonRating: "Unrated",
        latitude: geocode?.latitude ?? 0,
        longitude: geocode?.longitude ?? 0,
        capacity: row.quantity,
      },
      update: {
        industry: category,
        location: `${geocode?.normalizedCity || row.city}, ${geocode?.normalizedState || row.state}, India`,
        latitude: geocode?.latitude ?? 0,
        longitude: geocode?.longitude ?? 0,
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
        listingMode: "EXTERNAL_LEAD",
        sourceType: provider.sourceType,
        isEvalOnly: false,
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
        city: geocode?.normalizedCity || row.city,
        state: geocode?.normalizedState || row.state,
        country: "India",
        ...geocodeData(geocode),
        imageUrl: row.imageUrl,
        pricePerUnit: row.price,
        // A source that publishes no price is not selling at zero — it is
        // quoting on request. Recording that as FIXED would make an absent
        // price indistinguishable from a real one of ₹0.
        priceMode: row.price > 0 ? "FIXED" : "ON_REQUEST",
        currency: row.currency || "INR",
        // Free text from the source is mapped onto the canonical enum here;
        // storing "Tons" makes the listing invisible to every RFQ for "ton".
        unit: normalizeListingUnit(row.unit) ?? "lot",
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
        archivedAt: null,
        lastVerifiedAt: new Date(),
        safetyDeclaration: true,
        qualityDeclaration: true,
        ownershipDeclaration: true,
        authorityDeclaration: true,
        activatedAt: new Date(),
      },
      update: {
        title: row.title,
        listingMode: "EXTERNAL_LEAD",
        sourceType: provider.sourceType,
        isEvalOnly: false,
        sourceName: row.sourceName,
        sourceUrl: row.sourceUrl,
        rawQuantityText: row.rawQuantity,
        rawLocationText: `${row.city}, ${row.state}, India`,
        category,
        subcategory: row.subcategory || category,
        city: geocode?.normalizedCity || row.city,
        state: geocode?.normalizedState || row.state,
        ...geocodeData(geocode),
        imageUrl: row.imageUrl,
        pricePerUnit: row.price,
        // A source that publishes no price is not selling at zero — it is
        // quoting on request. Recording that as FIXED would make an absent
        // price indistinguishable from a real one of ₹0.
        priceMode: row.price > 0 ? "FIXED" : "ON_REQUEST",
        currency: row.currency || "INR",
        // Free text from the source is mapped onto the canonical enum here;
        // storing "Tons" makes the listing invisible to every RFQ for "ton".
        unit: normalizeListingUnit(row.unit) ?? "lot",
        quantityAvailable: row.quantity,
        description: row.description,
        status: "ACTIVE",
        archivedAt: null,
        lastVerifiedAt: new Date(),
        activatedAt: new Date(),
      },
    });
  });
  if (refreshEmbedding) await tryRefreshListingEmbedding(listingId);
  return true;
}

export interface RealListingImportOptions {
  dryRun?: boolean;
  targets?: Partial<Record<TargetCategory, number>>;
  /** Hard bound for scheduled imports; providers should return newest rows first. */
  maxRows?: number;
  /** Disable only on deployment hot paths; run the embedding backfill later. */
  refreshEmbeddings?: boolean;
}

function importableCategory(row: ProviderListing) {
  const category = canonicalCategory(
    `${row.categoryText} ${row.title} ${row.description}`,
  );
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
    return null;
  }
  return category;
}

async function selectToTargets(
  rows: ProviderListing[],
  targets: Partial<Record<TargetCategory, number>>,
) {
  const categories = Object.keys(targets) as TargetCategory[];
  const counts = await prisma.marketplaceListing.groupBy({
    by: ["category"],
    where: {
      isEvalOnly: false,
      status: { in: ["ACTIVE", "active"] },
      category: { in: categories },
      sourceType: {
        in: ["real_api", "real_public_provider", "seller_submitted"],
      },
    },
    _count: { _all: true },
  });
  const current = new Map(counts.map((row) => [row.category, row._count._all]));
  const existing = new Map(
    (
      await prisma.marketplaceListing.findMany({
        where: {
          externalId: { in: rows.map((row) => row.externalId) },
          isEvalOnly: false,
          status: { in: ["ACTIVE", "active"] },
        },
        select: { externalId: true, category: true },
      })
    ).flatMap((row) =>
      row.externalId ? ([[row.externalId, row.category]] as const) : [],
    ),
  );
  const selected: ProviderListing[] = [];
  const selection = {} as Record<
    TargetCategory,
    { current: number; needed: number; added: number; refreshed: number }
  >;
  for (const category of categories) {
    const count = current.get(category) ?? 0;
    const needed = Math.max(0, (targets[category] ?? count) - count);
    const categoryRows = rows.filter(
      (row) => importableCategory(row) === category,
    );
    const refreshes = categoryRows.filter(
      (row) => existing.get(row.externalId) === category,
    );
    const candidates = categoryRows
      .filter((row) => !existing.has(row.externalId))
      .sort((left, right) => left.externalId.localeCompare(right.externalId));
    if (candidates.length < needed) {
      throw new Error(
        `${category} needs ${needed} new real listings but the provider supplied only ${candidates.length}. ` +
          "No other category was used to hide the shortfall.",
      );
    }
    selected.push(...refreshes, ...candidates.slice(0, needed));
    selection[category] = {
      current: count,
      needed,
      added: needed,
      refreshed: refreshes.length,
    };
  }
  return { selected, selection };
}

export async function importRealListings(
  provider = configuredProvider(),
  options: RealListingImportOptions = {},
) {
  const fetched = await provider.fetch();
  if (fetched.length === 0) {
    throw new Error(
      `${provider.name} returned no listings. The import was rejected to avoid a false successful run.`,
    );
  }
  const targetResult = options.targets
    ? await selectToTargets(fetched, options.targets)
    : { selected: fetched, selection: undefined };
  const maxRows = options.maxRows;
  if (
    maxRows !== undefined &&
    (!Number.isInteger(maxRows) || maxRows < 1 || maxRows > 2_000)
  ) {
    throw new Error("maxRows must be an integer from 1 to 2000.");
  }
  const selected =
    maxRows === undefined
      ? targetResult.selected
      : targetResult.selected.slice(0, maxRows);
  if (options.dryRun) {
    return {
      provider: provider.name,
      dryRun: true,
      seen: fetched.length,
      selected: selected.length,
      truncated: selected.length < targetResult.selected.length,
      categories: targetResult.selection,
      upserted: 0,
      rejected: 0,
    };
  }
  const run = await prisma.listingImportRun.create({
    data: { provider: provider.name },
  });
  try {
    const rows = selected;
    let upserted = 0;
    let rejected = 0;
    for (const row of rows) {
      if (
        await upsertListing(provider, row, options.refreshEmbeddings !== false)
      ) {
        upserted += 1;
      } else rejected += 1;
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
    return {
      provider: provider.name,
      dryRun: false,
      seen: fetched.length,
      selected: rows.length,
      truncated: rows.length < targetResult.selected.length,
      categories: targetResult.selection,
      upserted,
      rejected,
    };
  } catch (error) {
    await prisma.listingImportRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        errorSummary:
          error instanceof Error
            ? error.message.slice(0, 1000)
            : "Unknown error",
        finishedAt: new Date(),
      },
    });
    throw error;
  }
}
