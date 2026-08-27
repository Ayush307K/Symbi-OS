export const REAL_CORPUS_BASELINE_TARGETS = {
  "Metal Scrap": 34,
  "Plastic Scrap": 16,
  Rubber: 4,
} as const;

export const REAL_CORPUS_TARGETS = {
  "Metal Scrap": 75,
  "Plastic Scrap": 36,
  Rubber: 9,
} as const;

export type TargetCategory = keyof typeof REAL_CORPUS_TARGETS;
