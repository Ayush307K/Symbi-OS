import { z } from "zod";
import { ApiError } from "@/server/http";
import { SAFE_CATEGORIES } from "@/lib/listing-constants";
import { createHash } from "node:crypto";
import prisma from "@/lib/prisma";

export { SAFE_CATEGORIES };

const BLOCKED_TERMS = [
  "radioactive",
  "nuclear",
  "uranium",
  "plutonium",
  "thorium",
  "medical waste",
  "biomedical",
  "infectious",
  "explosive",
  "asbestos",
  "cyanide",
  "mercury",
  "lead acid battery",
  "hazardous waste",
  "toxic waste",
  "pcb waste",
  "e-waste",
];

const AMBIGUOUS_TERMS = [
  "unknown composition",
  "unspecified composition",
  "mixed residue",
  "contaminated",
  "industrial sludge",
  "chemical residue",
  "process waste",
];

export function classifyMaterialSafety(input: {
  name: string;
  category: string;
  description?: string | null;
  toxicity?: string | null;
}) {
  const normalized =
    `${input.name} ${input.category} ${input.description ?? ""}`.toLowerCase();
  const blockedTerm = BLOCKED_TERMS.find((term) => normalized.includes(term));
  const categoryAllowed = (SAFE_CATEGORIES as readonly string[]).includes(
    input.category,
  );
  const toxicity = (input.toxicity ?? "none").toLowerCase();
  if (blockedTerm) {
    return { outcome: "BLOCKED" as const, ruleCode: `BLOCKED_TERM:${blockedTerm}` };
  }
  if (!categoryAllowed) {
    return { outcome: "BLOCKED" as const, ruleCode: "CATEGORY_NOT_ALLOWED" };
  }
  if (!["none", "low"].includes(toxicity)) {
    return { outcome: "BLOCKED" as const, ruleCode: "TOXICITY_NOT_ALLOWED" };
  }
  const ambiguousTerm = AMBIGUOUS_TERMS.find((term) =>
    normalized.includes(term),
  );
  if (ambiguousTerm || input.category === "Non-hazardous Chemicals") {
    return {
      outcome: "MANUAL_REVIEW" as const,
      ruleCode: ambiguousTerm
        ? `AMBIGUOUS_TERM:${ambiguousTerm}`
        : "CHEMICAL_CATEGORY_REVIEW",
    };
  }
  return { outcome: "ALLOWED" as const, ruleCode: "ALLOWLIST_MATCH" };
}

export async function recordSafetyEvent(input: {
  userId?: string | null;
  listingId?: string | null;
  name: string;
  category: string;
  description?: string | null;
  outcome: string;
  ruleCode: string;
}) {
  const textHash = createHash("sha256")
    .update(`${input.name}|${input.category}|${input.description ?? ""}`)
    .digest("hex");
  await prisma.safetyEvent.create({
    data: {
      userId: input.userId,
      listingId: input.listingId,
      outcome: input.outcome,
      ruleCode: input.ruleCode,
      category: input.category,
      textHash,
    },
  });
}

export const listingSafetySchema = z.object({
  name: z.string().trim().min(3).max(160),
  category: z.enum(SAFE_CATEGORIES),
  description: z.string().trim().min(20).max(5000),
  toxicity: z.enum(["none", "low"]).default("none"),
});

export function assertSafeMaterial(input: {
  name: string;
  category: string;
  description?: string | null;
  toxicity?: string | null;
}) {
  const result = classifyMaterialSafety(input);
  if (result.outcome === "BLOCKED") {
    throw new ApiError(
      422,
      "This marketplace only accepts verified, non-hazardous industrial by-products.",
      "MATERIAL_OUT_OF_SCOPE"
    );
  }
}

export function isSafeMaterial(input: Parameters<typeof assertSafeMaterial>[0]) {
  try {
    assertSafeMaterial(input);
    return true;
  } catch {
    return false;
  }
}

export function assertSafeFreeText(value: string) {
  const normalized = value.toLowerCase();
  if (BLOCKED_TERMS.some((term) => normalized.includes(term))) {
    throw new ApiError(
      422,
      "Requests for hazardous or regulated materials are outside this marketplace.",
      "MATERIAL_OUT_OF_SCOPE"
    );
  }
}
