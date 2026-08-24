export const REAL_CORPUS_TARGETS = {
  "Metal Scrap": 75,
  "Plastic Scrap": 36,
  Rubber: 9,
} as const;

export type TargetCategory = keyof typeof REAL_CORPUS_TARGETS;
