import { describe, expect, it } from "vitest";
import {
  assertCompleteOnboarding,
  assertOnboardingStepAccessible,
  maskOnboarding,
  onboardingJourney,
  serializeOnboardingPayload,
  validateOnboardingStep,
} from "@/server/onboarding";
import { decryptJson } from "@/server/crypto";

describe("seller onboarding", () => {
  process.env.FIELD_ENCRYPTION_KEY =
    "test-field-encryption-key-longer-than-32-characters";

  it("validates the tax step", () => {
    const result = validateOnboardingStep("TAX", {
      gst: "29ABCDE1234F1Z5",
      pan: "ABCDE1234F",
    });
    expect(result).toEqual({ gst: "29ABCDE1234F1Z5", pan: "ABCDE1234F" });
  });

  it("requires every step before submission", () => {
    expect(() =>
      assertCompleteOnboarding({
        businessJson: "{}",
        taxJson: null,
        bankJson: null,
        kycJson: null,
        warehouseJson: null,
        policyJson: null,
      }),
    ).toThrow(/Complete these onboarding steps/i);
  });

  it("builds a sequential journey from details and required documents", () => {
    const record = {
      businessJson: JSON.stringify({
        legalName: "Example Circular",
        entityType: "PRIVATE_LIMITED",
        registrationNumber: "REG-12345",
        phone: "9876543210",
      }),
      taxJson: null,
      bankJson: null,
      kycJson: null,
      warehouseJson: null,
      policyJson: null,
    };

    expect(onboardingJourney(record, []).currentStep).toBe("BUSINESS");
    expect(onboardingJourney(record, ["REGISTRATION"])).toMatchObject({
      currentStep: "TAX",
      completedSteps: ["BUSINESS"],
      percentage: 17,
    });
  });

  it("blocks later steps until all earlier details and documents exist", () => {
    const record = {
      businessJson: JSON.stringify({
        legalName: "Example Circular",
        entityType: "PRIVATE_LIMITED",
        registrationNumber: "REG-12345",
        phone: "9876543210",
      }),
      taxJson: null,
      bankJson: null,
      kycJson: null,
      warehouseJson: null,
      policyJson: null,
    };

    expect(() => assertOnboardingStepAccessible(record, [], "TAX")).toThrow(
      /complete business/i,
    );
    expect(() =>
      assertOnboardingStepAccessible(record, ["REGISTRATION"], "TAX"),
    ).not.toThrow();
    expect(() =>
      assertOnboardingStepAccessible(record, ["REGISTRATION"], "BANK"),
    ).toThrow(/complete tax/i);
  });

  it("does not unlock later steps for malformed stored data", () => {
    const record = {
      businessJson: JSON.stringify({ legalName: "Incomplete legacy record" }),
      taxJson: null,
      bankJson: null,
      kycJson: null,
      warehouseJson: null,
      policyJson: null,
    };

    expect(onboardingJourney(record, ["REGISTRATION"]).currentStep).toBe(
      "BUSINESS",
    );
    expect(() =>
      assertOnboardingStepAccessible(record, ["REGISTRATION"], "TAX"),
    ).toThrow(/complete business/i);
  });

  it("returns field-level validation errors instead of an internal error", () => {
    expect(() =>
      validateOnboardingStep("BUSINESS", {
        legalName: "A",
        entityType: "PROPRIETORSHIP",
        registrationNumber: "12",
        phone: "123",
      }),
    ).toThrow(/valid Indian mobile|too small/i);
  });

  it("masks bank account numbers in API output", () => {
    const masked = maskOnboarding({
      bankJson: JSON.stringify({
        accountHolder: "Example Circular",
        accountNumber: "123456789012",
        ifsc: "HDFC0001234",
        consent: true,
      }),
    });
    expect(masked.bankJson).toContain("••••9012");
    expect(masked.bankJson).not.toContain("123456789012");
  });

  it("encrypts sensitive onboarding payloads at rest", () => {
    const encrypted = serializeOnboardingPayload("BANK", {
      accountHolder: "Example Circular",
      accountNumber: "123456789012",
      ifsc: "HDFC0001234",
      consent: true,
    });
    expect(encrypted).toMatch(/^enc:v1:/);
    expect(encrypted).not.toContain("123456789012");
    expect(decryptJson<Record<string, unknown>>(encrypted).accountNumber).toBe(
      "123456789012",
    );
  });

  it("degrades instead of throwing when a field cannot be decrypted", () => {
    // AES-GCM authenticates, so a record written under a different key throws
    // on decrypt. In production that took down the whole verification queue,
    // because one unreadable record aborted the request that listed all of
    // them. A single bad record must cost only that record.
    const unreadable = maskOnboarding({
      bankJson: "enc:v1:AAAAAAAAAAAAAAAA:BBBBBBBBBBBBBBBBBBBBBBBB:CCCCCCCC",
      taxJson: null as string | null,
      kycJson: null as string | null,
    });

    expect(unreadable.undecryptableFields).toEqual(["bank"]);
    expect(unreadable.bankJson).toBeNull();
  });

  it("never returns unreadable encrypted tax or KYC payloads", () => {
    const ciphertext =
      "enc:v1:AAAAAAAAAAAAAAAA:BBBBBBBBBBBBBBBBBBBBBBBB:CCCCCCCC";
    const unreadable = maskOnboarding({
      bankJson: null,
      taxJson: ciphertext,
      kycJson: ciphertext,
    });

    expect(unreadable.undecryptableFields).toEqual(["tax", "kyc"]);
    expect(unreadable.taxJson).toBeNull();
    expect(unreadable.kycJson).toBeNull();
  });

  it("reports nothing undecryptable when the key matches", () => {
    const masked = maskOnboarding({
      bankJson: serializeOnboardingPayload("BANK", {
        accountHolder: "Smoke Seller",
        accountNumber: "123456789012",
        ifsc: "HDFC0001234",
        consent: true,
      }),
      taxJson: null as string | null,
      kycJson: null as string | null,
    });

    expect(masked.undecryptableFields).toEqual([]);
    expect(JSON.parse(masked.bankJson!).accountNumber).toBe("••••9012");
  });
});
