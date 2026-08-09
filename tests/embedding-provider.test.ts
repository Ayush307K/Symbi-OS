import { describe, expect, it } from "vitest";
import {
  getEmbeddingProvider,
  registerEmbeddingProvider,
} from "@/server/semantic/embedding-provider";
import {
  embedListing,
  listingEmbeddingText,
} from "@/server/semantic/listing-embeddings";

describe("listing embedding provider boundary", () => {
  it("composes material name, description, and category", () => {
    expect(
      listingEmbeddingText({
        materialName: "HDPE regrind",
        description: "Hot washed natural flakes",
        category: "Plastic Scrap",
      }),
    ).toBe(
      "Material: HDPE regrind\nCategory: Plastic Scrap\nDescription: Hot washed natural flakes",
    );
  });

  it("allows a provider to be swapped without changing listing code", async () => {
    registerEmbeddingProvider("fixture", () => ({
      name: "fixture",
      dimensions: 768,
      embed: async (inputs) => inputs.map(() => Array(768).fill(0.125)),
    }));
    const vector = await embedListing(
      {
        materialName: "Copper turnings",
        description: "Clean machine-shop scrap",
        category: "Metal Scrap",
      },
      getEmbeddingProvider("fixture"),
    );
    expect(vector).toHaveLength(768);
    expect(vector[0]).toBe(0.125);
  });
});
