/**
 * Personalization decides order, not visibility. ANN and graph retrieval give
 * us the strongest candidates first; the catalogue tail then fills the
 * remaining bounded scoring budget so a small corpus cannot silently stop at
 * the semantic seed count.
 */
export function completeCandidateIds(
  rankedIds: readonly string[],
  catalogueIds: readonly string[],
  maxCandidates: number,
) {
  return [...new Set([...rankedIds, ...catalogueIds])].slice(0, maxCandidates);
}

