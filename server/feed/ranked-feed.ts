import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { SAFE_CATEGORIES } from "@/lib/listing-constants";
import { buildBuyerDemandProfile } from "@/server/feed/buyer-profile";
import { completeCandidateIds } from "@/server/feed/candidates";
import { MARKETPLACE_RANKING_CONFIG } from "@/server/feed/config";
import {
  applyCategoryAffinity,
  type PreferredCategory,
} from "@/server/feed/category-affinity";
import {
  haversineDistanceKm,
  score,
  sellerReliabilityScore,
} from "@/server/feed/scoring";
import { publicListingWhere } from "@/server/listings/policy";
import { vectorLiteral } from "@/server/semantic/listing-embeddings";

interface SemanticSeedRow {
  id: string;
  material_id: string;
  semantic_fit: number;
}

interface GraphMaterialRow {
  material_id: string;
  graph_signal: number;
}

interface SimilarityRow {
  id: string;
  semantic_fit: number;
}

export interface RankedFeedCursor {
  score: number;
  id: string;
  asOf: number;
}

export interface FeedDeliveryLocation {
  id: string;
  label: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
}

function lexicalSimilarity(left: string, right: string) {
  const tokenize = (value: string) =>
    new Set(value.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2));
  const a = tokenize(left);
  const b = tokenize(right);
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return intersection / Math.sqrt(a.size * b.size);
}

async function preferredCategorySeeds(
  limit: number,
  preferredCategories: readonly PreferredCategory[] = [],
) {
  if (!preferredCategories.length || limit <= 0) return [];
  return prisma.marketplaceListing.findMany({
    where: {
      AND: [
        publicListingWhere,
        { category: { in: [...preferredCategories] } },
      ],
    },
    select: { id: true, materialId: true },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    take: limit,
  });
}

async function recentSeeds(
  limit: number,
  preferredCategories: readonly PreferredCategory[] = [],
) {
  const preferred = await preferredCategorySeeds(limit, preferredCategories);
  const remaining = Math.max(0, limit - preferred.length);
  const recent = remaining
    ? await prisma.marketplaceListing.findMany({
        where: {
          AND: [
            publicListingWhere,
            preferred.length
              ? { id: { notIn: preferred.map((item) => item.id) } }
              : {},
          ],
        },
        select: { id: true, materialId: true },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        take: remaining,
      })
    : [];
  return [...preferred, ...recent].map((item) => ({
    id: item.id,
    material_id: item.materialId,
    semantic_fit: 0,
  }));
}

async function semanticSeeds(
  profileEmbedding: number[] | null,
  preferredCategories: readonly PreferredCategory[],
) {
  const limit = MARKETPLACE_RANKING_CONFIG.retrieval.semanticSeedCount;
  if (!profileEmbedding) {
    return recentSeeds(limit, preferredCategories);
  }

  const semantic = await prisma.$transaction(async (tx) => {
    // ef_search defaults below our top-k and filtered ANN queries can return
    // too few rows. Keep both settings transaction-local for pooled/serverless
    // connections so they cannot leak into an unrelated request.
    await tx.$queryRaw(
      Prisma.sql`SELECT
                   set_config(
                     'hnsw.ef_search',
                     ${String(MARKETPLACE_RANKING_CONFIG.retrieval.hnswEfSearch)},
                     true
                   ),
                   set_config('hnsw.iterative_scan', 'strict_order', true)`,
    );
    return tx.$queryRaw<SemanticSeedRow[]>(
      Prisma.sql`SELECT
                   listing."id",
                   listing."materialId" AS material_id,
                   1 - (listing."embedding" <=> CAST(${vectorLiteral(profileEmbedding)} AS vector))
                     AS semantic_fit
                 FROM "MarketplaceListing" listing
                 JOIN "WasteMaterial" material ON material."id" = listing."materialId"
                 WHERE listing."embedding" IS NOT NULL
                   AND listing."status" IN ('ACTIVE', 'active')
                   AND listing."category" IN (${Prisma.join([...SAFE_CATEGORIES])})
                   AND material."toxicityLevel" IN ('none', 'low')
                 ORDER BY listing."embedding" <=> CAST(${vectorLiteral(profileEmbedding)} AS vector)
                 LIMIT ${limit}`,
    );
  });

  const affinity = await preferredCategorySeeds(
    MARKETPLACE_RANKING_CONFIG.retrieval.categoryAffinitySeedCount,
    preferredCategories,
  );
  const semanticIds = new Set(semantic.map((item) => item.id));
  const affinityRows: SemanticSeedRow[] = affinity
    .filter((item) => !semanticIds.has(item.id))
    .map((item) => ({
      id: item.id,
      material_id: item.materialId,
      semantic_fit: 0,
    }));

  // A buyer profile can be embedded before the catalogue backfill has run.
  // ANN retrieval then returns zero (or only a partial old corpus), which must
  // not turn a healthy marketplace into an empty homepage. Fill the remaining
  // candidate budget with industry/category-aware active listings and keep
  // semantic rows first.
  if (semantic.length >= limit) return [...semantic, ...affinityRows];
  const selectedIds = new Set([
    ...semantic.map((item) => item.id),
    ...affinityRows.map((item) => item.id),
  ]);
  const recent = await recentSeeds(limit, preferredCategories);
  return [
    ...semantic,
    ...affinityRows,
    ...recent.filter((item) => !selectedIds.has(item.id)),
  ].slice(
    0,
    limit + MARKETPLACE_RANKING_CONFIG.retrieval.categoryAffinitySeedCount,
  );
}

async function expandMaterials(seedMaterialIds: string[]) {
  if (seedMaterialIds.length === 0) return [];
  const config = MARKETPLACE_RANKING_CONFIG;
  const seeds = seedMaterialIds.slice(0, config.retrieval.maxSeedMaterials);
  const seedValues = Prisma.join(seeds.map((id) => Prisma.sql`(${id})`));
  const edgeWeights = config.graph.edgeTypeWeights;

  return prisma.$queryRaw<GraphMaterialRow[]>(
    Prisma.sql`
      WITH seed_materials(material_id) AS (VALUES ${seedValues}),
      ranked_one_hop AS (
        SELECT
          edge."src",
          edge."dst",
          edge."weight" * CASE edge."edge_type"
            WHEN 'co_purchased' THEN ${edgeWeights.co_purchased}
            WHEN 'substitutable' THEN ${edgeWeights.substitutable}
            ELSE ${edgeWeights.category_affinity}
          END AS path_weight,
          ROW_NUMBER() OVER (
            PARTITION BY edge."src"
            ORDER BY edge."weight" DESC, edge."dst" ASC
          ) AS neighbor_rank
        FROM "material_edges" edge
        JOIN seed_materials seed ON seed.material_id = edge."src"
      ),
      one_hop AS (
        SELECT "src", "dst", path_weight
        FROM ranked_one_hop
        WHERE neighbor_rank <= ${config.retrieval.graphNeighborsPerHop}
      ),
      ranked_two_hop AS (
        SELECT
          first."src",
          second."dst",
          first.path_weight * second."weight" *
            CASE second."edge_type"
              WHEN 'co_purchased' THEN ${edgeWeights.co_purchased}
              WHEN 'substitutable' THEN ${edgeWeights.substitutable}
              ELSE ${edgeWeights.category_affinity}
            END * ${config.retrieval.secondHopPenalty} AS path_weight,
          ROW_NUMBER() OVER (
            PARTITION BY first."src"
            ORDER BY first.path_weight * second."weight" DESC, second."dst" ASC
          ) AS neighbor_rank
        FROM one_hop first
        JOIN "material_edges" second ON second."src" = first."dst"
        WHERE second."dst" <> first."src"
      ),
      paths AS (
        SELECT "dst" AS material_id, path_weight FROM one_hop
        UNION ALL
        SELECT "dst", path_weight
        FROM ranked_two_hop
        WHERE neighbor_rank <= ${config.retrieval.graphNeighborsPerHop}
      )
      SELECT material_id, MAX(path_weight) AS graph_signal
      FROM paths
      GROUP BY material_id
      ORDER BY graph_signal DESC, material_id ASC
      LIMIT ${config.retrieval.maxCandidates}
    `,
  );
}

async function semanticScores(candidateIds: string[], embedding: number[] | null) {
  if (!embedding || candidateIds.length === 0) return new Map<string, number>();
  const rows = await prisma.$queryRaw<SimilarityRow[]>(
    Prisma.sql`SELECT
                 "id",
                 1 - ("embedding" <=> CAST(${vectorLiteral(embedding)} AS vector)) AS semantic_fit
               FROM "MarketplaceListing"
               WHERE "id" IN (${Prisma.join(candidateIds)})
                 AND "embedding" IS NOT NULL`,
  );
  return new Map(rows.map((row) => [row.id, Number(row.semantic_fit)]));
}

export async function rankBuyerFeed(
  buyerId: string,
  options: {
    limit?: number;
    cursor?: RankedFeedCursor;
    deliveryLocation?: FeedDeliveryLocation;
  } = {},
) {
  const config = MARKETPLACE_RANKING_CONFIG.retrieval;
  const limit = Math.min(
    config.maxPageSize,
    Math.max(1, options.limit ?? config.defaultPageSize),
  );
  const baseProfile = await buildBuyerDemandProfile(buyerId);
  const profile = options.deliveryLocation
    ? {
        ...baseProfile,
        latitude: options.deliveryLocation.latitude,
        longitude: options.deliveryLocation.longitude,
      }
    : baseProfile;
  const seeds = await semanticSeeds(profile.embedding, profile.preferredCategories);
  const seedMaterialIds = [
    ...profile.seedMaterialIds,
    ...seeds.map((seed) => seed.material_id),
  ].filter((id, index, all) => all.indexOf(id) === index);
  const graphMaterials = await expandMaterials(seedMaterialIds);
  const graphByMaterial = new Map(
    graphMaterials.map((item) => [item.material_id, Number(item.graph_signal)]),
  );

  const semanticSeedIds = seeds.map((item) => item.id);
  const graphCandidateBudget = Math.max(0, config.maxCandidates - semanticSeedIds.length);
  const graphListingRows = graphCandidateBudget
    ? await prisma.marketplaceListing.findMany({
        where: {
          ...publicListingWhere,
          materialId: { in: graphMaterials.map((item) => item.material_id) },
        },
        select: { id: true },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        take: graphCandidateBudget,
      })
    : [];
  const rankedCandidateIds = completeCandidateIds(
    semanticSeedIds,
    graphListingRows.map((row) => row.id),
    config.maxCandidates,
  );
  const catalogueTailBudget = Math.max(0, config.maxCandidates - rankedCandidateIds.length);
  const catalogueTail = catalogueTailBudget
    ? await prisma.marketplaceListing.findMany({
        where: {
          AND: [
            publicListingWhere,
            rankedCandidateIds.length ? { id: { notIn: rankedCandidateIds } } : {},
          ],
        },
        select: { id: true },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        take: catalogueTailBudget,
      })
    : [];
  const candidateIds = completeCandidateIds(
    rankedCandidateIds,
    catalogueTail.map((row) => row.id),
    config.maxCandidates,
  );

  if (candidateIds.length === 0) {
    return { items: [], pageInfo: { hasMore: false, nextCursor: null, limit } };
  }

  const listings = await prisma.marketplaceListing.findMany({
    where: { ...publicListingWhere, id: { in: candidateIds } },
    select: {
      id: true,
      materialId: true,
      title: true,
      slug: true,
      listingMode: true,
      isEvalOnly: true,
      evalScenarioTags: true,
      category: true,
      subcategory: true,
      area: true,
      city: true,
      state: true,
      country: true,
      pincode: true,
      latitude: true,
      longitude: true,
      geocodingProvider: true,
      geocodingConfidence: true,
      geocodingPrecision: true,
      deliveryTerm: true,
      imageUrl: true,
      priceMode: true,
      pricePerUnit: true,
      currency: true,
      quantityAvailable: true,
      unit: true,
      minOrderQuantity: true,
      lotIncrement: true,
      leadTimeDays: true,
      verified: true,
      yearsActive: true,
      description: true,
      packaging: true,
      handlingRequirements: true,
      paymentTerms: true,
      availableFrom: true,
      availableUntil: true,
      sourceType: true,
      sourceName: true,
      sourceUrl: true,
      externalId: true,
      rawQuantityText: true,
      rawLocationText: true,
      lastVerifiedAt: true,
      updatedAt: true,
      material: {
        select: { name: true, toxicityLevel: true, baseElement: true },
      },
      seller: { select: { id: true, name: true } },
      assets: {
        where: { kind: { in: ["CERTIFICATE", "TEST_REPORT"] } },
        select: { kind: true },
      },
    },
  });
  const listingIds = listings.map((listing) => listing.id);
  const companyIds = [...new Set(listings.map((listing) => listing.seller.id))];
  const [similarityById, reviews, fulfilledOrders, threads, onboardings, sellerUsers] =
    await Promise.all([
      semanticScores(listingIds, profile.embedding),
      prisma.review.groupBy({
        by: ["listingId"],
        where: { listingId: { in: listingIds }, status: "PUBLISHED" },
        _avg: { rating: true },
        _count: { _all: true },
      }),
      prisma.purchaseOrderItem.groupBy({
        by: ["sellerCompanyId"],
        where: {
          sellerCompanyId: { in: companyIds },
          status: { in: ["FULFILLED", "DELIVERED"] },
          order: { fulfillmentStatus: { in: ["FULFILLED", "DELIVERED"] } },
        },
        _count: { _all: true },
      }),
      prisma.messageThread.findMany({
        where: { listingId: { in: listingIds } },
        select: {
          listingId: true,
          buyerUserId: true,
          messages: { select: { senderUserId: true } },
        },
      }),
      prisma.sellerOnboarding.findMany({
        where: { status: "APPROVED", user: { companyId: { in: companyIds } } },
        select: { user: { select: { companyId: true } } },
      }),
      prisma.user.findMany({
        where: {
          companyId: { in: companyIds },
          accountStatus: "ACTIVE",
          role: { in: ["SELLER", "BOTH"] },
          sellerOnboarding: { is: { status: "APPROVED" } },
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true, companyId: true },
      }),
    ]);

  const reviewByListing = new Map(reviews.map((item) => [item.listingId, item]));
  const ordersByCompany = new Map(
    fulfilledOrders.map((item) => [item.sellerCompanyId, item._count._all]),
  );
  const approvedCompanies = new Set(
    onboardings
      .map((item) => item.user.companyId)
      .filter((id): id is string => Boolean(id)),
  );
  const sellerUserByCompany = new Map<string, string>();
  for (const user of sellerUsers) {
    if (user.companyId && !sellerUserByCompany.has(user.companyId)) {
      sellerUserByCompany.set(user.companyId, user.id);
    }
  }
  const responseByListing = new Map<string, { total: number; replied: number }>();
  for (const thread of threads) {
    if (!thread.listingId) continue;
    const current = responseByListing.get(thread.listingId) ?? { total: 0, replied: 0 };
    current.total += 1;
    if (thread.messages.some((message) => message.senderUserId !== thread.buyerUserId)) {
      current.replied += 1;
    }
    responseByListing.set(thread.listingId, current);
  }

  // One timestamp for the entire batch keeps freshness comparisons and cursor
  // ordering deterministic even when the scoring loop crosses a millisecond.
  const scoringNow = new Date(options.cursor?.asOf ?? Date.now());
  const scored = listings.map((listing) => {
    const review = reviewByListing.get(listing.id);
    const response = responseByListing.get(listing.id);
    const responseRate = response?.total ? (response.replied / response.total) * 100 : 0;
    const verified =
      listing.listingMode === "MANAGED" &&
      listing.verified &&
      approvedCompanies.has(listing.seller.id);
    const ordersCompleted = ordersByCompany.get(listing.seller.id) ?? 0;
    const baseSemanticFit =
      similarityById.get(listing.id) ??
      lexicalSimilarity(
        profile.profileText,
        `${listing.title} ${listing.category} ${listing.subcategory} ${listing.material.name}`,
      );
    const semanticFit = applyCategoryAffinity(
      baseSemanticFit,
      listing.category,
      profile.preferredCategories,
      profile.hasHistory,
    );
    const graphSignal = graphByMaterial.get(listing.materialId) ?? 0;
    const reliability = sellerReliabilityScore({
      reviewAverage: review?._avg.rating ?? null,
      responseRate,
      fulfilledOrders: ordersCompleted,
      verifiedSeller: verified,
      hasDocuments: listing.assets.length > 0,
    });
    const relevance = score(
      buyerId,
      {
        id: listing.id,
        semanticFit,
        graphSignal,
        latitude: listing.latitude,
        longitude: listing.longitude,
        price: listing.priceMode === "FIXED" ? listing.pricePerUnit : null,
        quantityAvailable: listing.quantityAvailable,
        minOrderQuantity: listing.minOrderQuantity,
        updatedAt: listing.updatedAt,
        sellerReliability: reliability,
      },
      profile,
      scoringNow,
    );
    const distanceKm =
      profile.latitude !== null &&
      profile.longitude !== null &&
      listing.latitude !== null &&
      listing.longitude !== null
        ? Math.round(
            haversineDistanceKm(
              profile.latitude,
              profile.longitude,
              listing.latitude,
              listing.longitude,
            ) * 10,
          ) / 10
        : null;
    return {
      relevance,
      item: {
        id: listing.id,
        materialId: listing.materialId,
        slug: listing.slug,
        listingMode: listing.listingMode,
        isEvalOnly: listing.isEvalOnly,
        evalScenarioTags: listing.evalScenarioTags,
        title: listing.title,
        name: listing.material.name,
        toxicity: listing.material.toxicityLevel,
        baseElement: listing.material.baseElement,
        category: listing.category,
        subcategory: listing.subcategory,
        producer: listing.seller.name,
        producerId: listing.seller.id,
        sellerUserId: sellerUserByCompany.get(listing.seller.id) ?? null,
        location: `${listing.area}, ${listing.city}`,
        area: listing.area,
        city: listing.city,
        state: listing.state,
        country: listing.country,
        pincode: listing.pincode,
        distanceKm,
        distanceStatus:
          profile.latitude === null || profile.longitude === null
            ? "NOT_REQUESTED"
            : distanceKm === null
              ? "UNAVAILABLE"
              : "AVAILABLE",
        geocodingPrecision: listing.geocodingPrecision,
        geocodingConfidence: listing.geocodingConfidence,
        deliveryTerm: listing.deliveryTerm,
        imageUrl: listing.imageUrl,
        priceMode: listing.priceMode,
        price: listing.priceMode === "ON_REQUEST" ? null : listing.pricePerUnit,
        currency: listing.currency,
        quantity: listing.quantityAvailable,
        unit: listing.unit,
        minOrderQuantity: listing.minOrderQuantity,
        lotIncrement: listing.lotIncrement,
        leadTimeDays: listing.leadTimeDays,
        rating: review?._avg.rating ?? 0,
        reviewCount: review?._count._all ?? 0,
        responseRate: Math.round(responseRate),
        verified,
        tradeAssurance: false,
        yearsActive: listing.yearsActive,
        ordersCompleted,
        description: listing.description.slice(0, 360),
        packaging: listing.packaging,
        handlingRequirements: listing.handlingRequirements,
        paymentTerms: listing.paymentTerms,
        availableFrom: listing.availableFrom,
        availableUntil: listing.availableUntil,
        hasDocuments: listing.assets.length > 0,
        documentKinds: [...new Set(listing.assets.map((asset) => asset.kind))],
        sourceType: listing.sourceType,
        sourceName: listing.sourceName,
        sourceUrl: listing.sourceUrl,
        externalId: listing.externalId,
        rawQuantityText: listing.rawQuantityText,
        rawLocationText: listing.rawLocationText,
        lastVerifiedAt: listing.lastVerifiedAt ?? listing.updatedAt,
        relevanceScore: Math.round(relevance * 1_000) / 10,
        relevanceKind: "relevance" as const,
      },
    };
  });

  scored.sort(
    (left, right) => right.relevance - left.relevance || left.item.id.localeCompare(right.item.id),
  );
  const afterCursor = options.cursor
    ? scored.filter(
        (entry) =>
          entry.relevance < options.cursor!.score ||
          (entry.relevance === options.cursor!.score && entry.item.id > options.cursor!.id),
      )
    : scored;
  const page = afterCursor.slice(0, limit + 1);
  const hasMore = page.length > limit;
  const visible = page.slice(0, limit);
  const last = visible[visible.length - 1];
  return {
    items: visible.map((entry) => entry.item),
    pageInfo: {
      hasMore,
      nextCursor:
        hasMore && last
          ? { score: last.relevance, id: last.item.id, asOf: scoringNow.getTime() }
          : null,
      limit,
      total: scored.length,
    },
    ranking: {
      kind: "relevance" as const,
      version: "buyer-feed-v1",
      historyEventCount: profile.historyEventCount,
      coldStart: !profile.hasHistory,
      preferredCategories: profile.preferredCategories,
      deliveryLocation: options.deliveryLocation
        ? {
            id: options.deliveryLocation.id,
            label: options.deliveryLocation.label,
            city: options.deliveryLocation.city,
            state: options.deliveryLocation.state,
          }
        : null,
    },
  };
}
