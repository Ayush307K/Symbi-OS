import { z } from "zod";
import { ApiError } from "@/server/http";
import { decryptJson, encryptJson } from "@/server/crypto";
import { createHash } from "node:crypto";

const gst = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const pan = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const ifsc = /^[A-Z]{4}0[A-Z0-9]{6}$/;

export const onboardingSteps = [
  "BUSINESS",
  "TAX",
  "BANK",
  "KYC",
  "WAREHOUSE",
  "POLICY",
] as const;

export const requiredOnboardingDocuments = [
  "REGISTRATION",
  "GST_CERTIFICATE",
  "KYC_ID",
  "BANK_PROOF",
] as const;

export function sensitiveValueHash(value: string) {
  const pepper =
    process.env.FIELD_ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!pepper) throw new Error("A server encryption key is required.");
  return createHash("sha256")
    .update(`${pepper}:${value.trim().toUpperCase()}`)
    .digest("hex");
}

const schemas = {
  BUSINESS: z.object({
    legalName: z.string().trim().min(2).max(160),
    entityType: z.enum([
      "PROPRIETORSHIP",
      "PARTNERSHIP",
      "LLP",
      "PRIVATE_LIMITED",
      "PUBLIC_LIMITED",
    ]),
    registrationNumber: z.string().trim().min(5).max(40),
    phone: z.string().regex(/^[6-9][0-9]{9}$/, "Enter a valid Indian mobile number."),
  }),
  TAX: z
    .object({
      gst: z.string().trim().toUpperCase().regex(gst, "Invalid GSTIN format."),
      pan: z.string().trim().toUpperCase().regex(pan, "Invalid PAN format."),
    })
    .superRefine((value, context) => {
      const stateCode = Number(value.gst.slice(0, 2));
      if (stateCode < 1 || stateCode > 38) {
        context.addIssue({
          code: "custom",
          path: ["gst"],
          message: "GSTIN state code is invalid.",
        });
      }
      if (value.gst.slice(2, 12) !== value.pan) {
        context.addIssue({
          code: "custom",
          path: ["pan"],
          message: "PAN must match the PAN embedded in the GSTIN.",
        });
      }
    }),
  BANK: z.object({
    accountHolder: z.string().trim().min(2).max(160),
    accountNumber: z.string().regex(/^[0-9]{9,18}$/, "Invalid bank account number."),
    ifsc: z.string().trim().toUpperCase().regex(ifsc, "Invalid IFSC format."),
    consent: z.literal(true, {
      message: "Consent is required for sandbox bank verification.",
    }),
  }),
  KYC: z.object({
    authorizedSignatory: z.string().trim().min(2).max(160),
    designation: z.string().trim().min(2).max(120),
    documentType: z.enum(["PAN", "AADHAAR_LAST4", "PASSPORT"]),
    documentReference: z.string().trim().min(4).max(40),
  }),
  WAREHOUSE: z.object({
    addressLine: z.string().trim().min(8).max(240),
    city: z.string().trim().min(2).max(100),
    state: z.string().trim().min(2).max(100),
    pincode: z.string().regex(/^[1-9][0-9]{5}$/, "Invalid pincode."),
  }),
  POLICY: z.object({
    acceptsMarketplaceTerms: z.literal(true, {
      message: "Marketplace terms must be accepted.",
    }),
    confirmsNonHazardousOnly: z.literal(true, {
      message: "You must confirm that only non-hazardous materials will be listed.",
    }),
    acceptsSandboxVerification: z.literal(true, {
      message: "Sandbox verification disclosure must be accepted.",
    }),
  }),
} satisfies Record<(typeof onboardingSteps)[number], z.ZodType>;

export const onboardingRequestSchema = z.object({
  step: z.enum(onboardingSteps),
  payload: z.record(z.string(), z.unknown()),
  submit: z.boolean().optional().default(false),
});

export function validateOnboardingStep(
  step: (typeof onboardingSteps)[number],
  payload: unknown
) {
  return schemas[step].parse(payload);
}

export function onboardingJsonField(step: (typeof onboardingSteps)[number]) {
  return {
    BUSINESS: "businessJson",
    TAX: "taxJson",
    BANK: "bankJson",
    KYC: "kycJson",
    WAREHOUSE: "warehouseJson",
    POLICY: "policyJson",
  }[step] as
    | "businessJson"
    | "taxJson"
    | "bankJson"
    | "kycJson"
    | "warehouseJson"
    | "policyJson";
}

export function assertCompleteOnboarding(record: {
  businessJson: string | null;
  taxJson: string | null;
  bankJson: string | null;
  kycJson: string | null;
  warehouseJson: string | null;
  policyJson: string | null;
}) {
  const missing = onboardingSteps.filter((step) => {
    const field = onboardingJsonField(step);
    return !record[field];
  });
  if (missing.length) {
    throw new ApiError(
      422,
      `Complete these onboarding steps before submission: ${missing.join(", ")}.`,
      "ONBOARDING_INCOMPLETE"
    );
  }
  for (const step of onboardingSteps) {
    validateOnboardingStep(
      step,
      decryptJson(record[onboardingJsonField(step)]!)
    );
  }
}

export function onboardingCompletion(
  record: Parameters<typeof assertCompleteOnboarding>[0],
  documentKinds: string[],
) {
  const missingSteps = onboardingSteps.filter(
    (step) => !record[onboardingJsonField(step)],
  );
  const presentDocuments = new Set(documentKinds);
  const missingDocuments = requiredOnboardingDocuments.filter(
    (kind) => !presentDocuments.has(kind),
  );
  const complete =
    onboardingSteps.length +
    requiredOnboardingDocuments.length -
    missingSteps.length -
    missingDocuments.length;
  const total =
    onboardingSteps.length + requiredOnboardingDocuments.length;
  return {
    percentage: Math.round((complete / total) * 100),
    missingSteps,
    missingDocuments,
  };
}

export function serializeOnboardingPayload(
  step: (typeof onboardingSteps)[number],
  payload: unknown
) {
  return ["TAX", "BANK", "KYC"].includes(step)
    ? encryptJson(payload)
    : JSON.stringify(payload);
}

/**
 * Decrypt one field, or report that it could not be read.
 *
 * AES-GCM authenticates, so a key that does not match the one used to encrypt
 * throws rather than returning nonsense. That is the right behaviour for a
 * single field and the wrong behaviour for a queue: one unreadable record
 * should not take down the entire verification list, which is exactly what it
 * did in production when the deployed FIELD_ENCRYPTION_KEY differed from the
 * key the records were written with.
 */
function decryptField(value: string | null | undefined, field: string) {
  if (!value) return { data: null as Record<string, unknown> | null, failed: false };
  try {
    return { data: decryptJson<Record<string, unknown>>(value), failed: false };
  } catch {
    console.error(`[onboarding] could not decrypt ${field}; check FIELD_ENCRYPTION_KEY`);
    return { data: null as Record<string, unknown> | null, failed: true };
  }
}

export function maskOnboarding<
  T extends {
    bankJson: string | null;
    taxJson?: string | null;
    kycJson?: string | null;
  },
>(record: T) {
  const bankResult = decryptField(record.bankJson, "bankJson");
  const taxResult = decryptField(record.taxJson, "taxJson");
  const kycResult = decryptField(record.kycJson, "kycJson");
  const bank = bankResult.data;
  const tax = taxResult.data;
  const kyc = kycResult.data;
  // Surfaced so an operator sees "this record is unreadable" rather than a
  // record that looks merely incomplete.
  const undecryptable = [
    bankResult.failed ? "bank" : null,
    taxResult.failed ? "tax" : null,
    kycResult.failed ? "kyc" : null,
  ].filter(Boolean) as string[];
  const account = String(bank?.accountNumber ?? "");
  return {
    ...record,
    undecryptableFields: undecryptable,
    bankJson: bank
      ? JSON.stringify({
          accountHolder: bank.accountHolder,
          accountNumber: account ? `••••${account.slice(-4)}` : "",
          ifsc: bank.ifsc,
          consent: Boolean(bank.consent),
        })
      : null,
    ...(tax
      ? {
          taxJson: JSON.stringify({
            gst: `••••${String(tax.gst ?? "").slice(-4)}`,
            pan: `••••${String(tax.pan ?? "").slice(-4)}`,
          }),
        }
      : {}),
    ...(kyc
      ? {
          kycJson: JSON.stringify({
            authorizedSignatory: kyc.authorizedSignatory,
            designation: kyc.designation,
            documentType: kyc.documentType,
            documentReference: `••••${String(kyc.documentReference ?? "").slice(-4)}`,
          }),
        }
      : {}),
  };
}
