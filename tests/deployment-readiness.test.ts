import { describe, expect, it } from "vitest";
import {
  isProductionSchemaReady,
  type ProductionSchemaState,
} from "@/server/deployment/readiness";

const readyState: ProductionSchemaState = {
  vectorExtension: true,
  userEvalOnly: true,
  listingEvalOnly: true,
  listingMode: true,
  listingDeliveryTerm: true,
  listingGeocoding: true,
  freightQuotes: true,
  shipments: true,
  listingScenarioTags: true,
  listingClusterId: true,
  orderEvalOnly: true,
  knowledgeDocumentEvalOnly: true,
};

describe("production schema readiness", () => {
  it("accepts a fully migrated database", () => {
    expect(isProductionSchemaReady(readyState)).toBe(true);
  });

  it.each(Object.keys(readyState) as Array<keyof ProductionSchemaState>)(
    "rejects a database missing %s",
    (field) => {
      expect(
        isProductionSchemaReady({ ...readyState, [field]: false }),
      ).toBe(false);
    },
  );
});
