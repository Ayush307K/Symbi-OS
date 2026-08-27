import { SAFE_CATEGORIES } from "@/lib/listing-constants";
import { MARKETPLACE_RANKING_CONFIG } from "@/server/feed/config";

export type PreferredCategory = (typeof SAFE_CATEGORIES)[number];

const INDUSTRY_RULES: Array<{
  category: PreferredCategory;
  pattern: RegExp;
}> = [
  { category: "Plastic Scrap", pattern: /\b(plastic|polymer|resin|pet|hdpe|ldpe|polypropylene)\b/i },
  { category: "Metal Scrap", pattern: /\b(metal|steel|iron|aluminium|aluminum|copper|brass|foundry|fabrication)\b/i },
  { category: "Rubber", pattern: /\b(rubber|tyre|tire|elastomer)\b/i },
  { category: "Glass", pattern: /\b(glass|glazing|bottle)\b/i },
  { category: "Paper & Cardboard", pattern: /\b(paper|cardboard|carton|pulp|printing)\b/i },
  { category: "Textile Waste", pattern: /\b(textile|garment|fabric|apparel|spinning|weaving)\b/i },
  { category: "Agricultural Residue", pattern: /\b(agriculture|agricultural|biomass|rice|sugar|food processing)\b/i },
  { category: "Fly Ash & Minerals", pattern: /\b(cement|mineral|ceramic|thermal power|construction material)\b/i },
  { category: "Non-hazardous Chemicals", pattern: /\b(chemical|pharma|pharmaceutical)\b/i },
];

const safeCategorySet = new Set<string>(SAFE_CATEGORIES);

/** Maps free-text registration industries onto the marketplace taxonomy. */
export function inferIndustryCategories(industry: string | null | undefined) {
  if (!industry?.trim()) return [];
  return INDUSTRY_RULES.filter((rule) => rule.pattern.test(industry)).map(
    (rule) => rule.category,
  );
}

export function buildPreferredCategories(input: {
  industry: string | null | undefined;
  behavioralCategories: Array<string | null | undefined>;
  hasHistory: boolean;
}) {
  const industry = inferIndustryCategories(input.industry);
  const behavioral = input.behavioralCategories.filter(
    (category): category is PreferredCategory =>
      Boolean(category && safeCategorySet.has(category)),
  );
  const ordered = input.hasHistory
    ? [...behavioral, ...industry]
    : [...industry, ...behavioral];
  return [...new Set(ordered)];
}

/**
 * Industry/category affinity is a floor on semantic relevance, not a separate
 * magic weight. This keeps the reusable scorer unchanged while guaranteeing
 * that a strong explicit taxonomy match survives missing listing embeddings.
 */
export function applyCategoryAffinity(
  semanticFit: number,
  listingCategory: string,
  preferredCategories: readonly PreferredCategory[],
  hasHistory: boolean,
) {
  if (!preferredCategories.includes(listingCategory as PreferredCategory)) {
    return semanticFit;
  }
  const floor = hasHistory
    ? MARKETPLACE_RANKING_CONFIG.scoring.categoryAffinityFloor.behavioral
    : MARKETPLACE_RANKING_CONFIG.scoring.categoryAffinityFloor.coldStart;
  return Math.max(semanticFit, floor);
}
