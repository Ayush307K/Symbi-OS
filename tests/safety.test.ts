import { describe, expect, it } from "vitest";
import { assertSafeMaterial, isSafeMaterial } from "@/server/safety";

describe("material containment", () => {
  it("accepts a clearly non-hazardous listing", () => {
    expect(
      isSafeMaterial({
        name: "Clean HDPE regrind flakes",
        category: "Plastic Scrap",
        description: "Washed post-industrial HDPE flakes without hazardous contamination.",
        toxicity: "none",
      })
    ).toBe(true);
  });

  it.each([
    "Low-level radioactive material",
    "Asbestos insulation boards",
    "Hospital biomedical waste",
    "Lead acid battery scrap",
  ])("rejects prohibited material: %s", (name) => {
    expect(() =>
      assertSafeMaterial({
        name,
        category: "Metal Scrap",
        description: "Material offered for industrial recovery and reuse.",
        toxicity: "none",
      })
    ).toThrow(/non-hazardous/i);
  });

  it("rejects unsupported categories and elevated toxicity", () => {
    expect(
      isSafeMaterial({
        name: "Mixed material",
        category: "E-Waste",
        description: "Unsorted electronic assemblies for processing.",
        toxicity: "high",
      })
    ).toBe(false);
  });
});
