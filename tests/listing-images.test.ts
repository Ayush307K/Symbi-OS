import { describe, expect, it } from "vitest";
import { listingFallbackImage } from "@/lib/listing-images";

describe("listing image fallbacks", () => {
  it("uses honest category artwork for evaluation listings", () => {
    expect(listingFallbackImage({ category: "Metal Scrap", isEvalOnly: true })).toBe(
      "/listing-demo-metal.svg",
    );
    expect(listingFallbackImage({ category: "Plastic Scrap", isEvalOnly: true })).toBe(
      "/listing-demo-plastic.svg",
    );
    expect(listingFallbackImage({ category: "Rubber", isEvalOnly: true })).toBe(
      "/listing-demo-rubber.svg",
    );
  });

  it("does not disguise a missing real-provider image as synthetic artwork", () => {
    expect(listingFallbackImage({ category: "Metal Scrap", isEvalOnly: false })).toBe(
      "/listing-placeholder.svg",
    );
  });
});
