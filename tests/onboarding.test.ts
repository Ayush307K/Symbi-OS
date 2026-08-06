import { describe, expect, it } from "vitest";
import {
  assertCompleteOnboarding,
  maskOnboarding,
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
      })
    ).toThrow(/Complete these onboarding steps/i);
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
      "123456789012"
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
