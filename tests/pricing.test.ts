import { describe, expect, it } from "vitest";
import { listingDraftSchema, submissionErrors } from "@/server/listings/lifecycle";

/**
 * FIXED means "here is a price a buyer can act on". Zero is not such a price —
 * it is the absence of one, and must be declared ON_REQUEST instead. These
 * cover the guard that stops a FIXED ₹0 row ever being written.
 */
describe("a FIXED listing must carry a positive price", () => {
  it("rejects FIXED with a zero price at the API boundary", () => {
    const result = listingDraftSchema.safeParse({
      priceMode: "FIXED",
      pricePerUnit: 0,
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["pricePerUnit"]);
  });

  it("rejects FIXED with a negative price", () => {
    expect(
      listingDraftSchema.safeParse({ priceMode: "FIXED", pricePerUnit: -1 }).success,
    ).toBe(false);
  });

  it("accepts FIXED with a positive price", () => {
    expect(
      listingDraftSchema.safeParse({ priceMode: "FIXED", pricePerUnit: 540 }).success,
    ).toBe(true);
  });

  it("accepts ON_REQUEST with no price", () => {
    expect(
      listingDraftSchema.safeParse({ priceMode: "ON_REQUEST", pricePerUnit: 0 }).success,
    ).toBe(true);
  });

  it("still accepts a partial draft that omits the price", () => {
    // Drafts save incrementally, so the rule can only fire when the request
    // actually carries both fields.
    expect(listingDraftSchema.safeParse({ priceMode: "FIXED" }).success).toBe(true);
  });

  it("refuses submission of a FIXED listing priced at zero", () => {
    const fields = submissionErrors(baseListing({ priceMode: "FIXED", pricePerUnit: 0 }));
    expect(fields.pricePerUnit).toBe("Add a positive price or choose price on request.");
  });

  it("does not demand a price from an ON_REQUEST listing", () => {
    const fields = submissionErrors(
      baseListing({ priceMode: "ON_REQUEST", pricePerUnit: 0 }),
    );
    expect(fields.pricePerUnit).toBeUndefined();
  });
});

function baseListing(overrides: Partial<Parameters<typeof submissionErrors>[0]> = {}) {
  return {
    title: "Washed HDPE regrind",
    category: "Plastic Scrap",
    subcategory: "HDPE flakes",
    description: "Post-industrial, uncontaminated, baled and ready for dispatch.",
    priceMode: "FIXED",
    pricePerUnit: 540,
    quantityAvailable: 100,
    unit: "ton",
    minOrderQuantity: 5,
    lotIncrement: 1,
    packaging: "Bales",
    handlingRequirements: "None",
    pincode: "560058",
    availableFrom: new Date("2026-08-01"),
    availableUntil: new Date("2026-12-01"),
    safetyDeclaration: true,
    qualityDeclaration: true,
    ownershipDeclaration: true,
    authorityDeclaration: true,
    assets: [{ kind: "PHOTO" }],
    ...overrides,
  };
}
