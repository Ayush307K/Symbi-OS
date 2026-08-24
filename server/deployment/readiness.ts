import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";

export const REQUIRED_SCHEMA_MIGRATION =
  "20260824120000_eval_corpus_isolation";

export interface ProductionSchemaState {
  vectorExtension: boolean;
  userEvalOnly: boolean;
  listingEvalOnly: boolean;
  listingScenarioTags: boolean;
  listingClusterId: boolean;
  orderEvalOnly: boolean;
  knowledgeDocumentEvalOnly: boolean;
}

export function isProductionSchemaReady(state: ProductionSchemaState) {
  return Object.values(state).every(Boolean);
}

export async function productionReadiness() {
  try {
    const rows = await prisma.$queryRaw<ProductionSchemaState[]>(
      Prisma.sql`
        SELECT
          EXISTS (
            SELECT 1 FROM pg_extension WHERE extname = 'vector'
          ) AS "vectorExtension",
          EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = 'User'
              AND column_name = 'isEvalOnly'
          ) AS "userEvalOnly",
          EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = 'MarketplaceListing'
              AND column_name = 'isEvalOnly'
          ) AS "listingEvalOnly",
          EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = 'MarketplaceListing'
              AND column_name = 'evalScenarioTags'
          ) AS "listingScenarioTags",
          EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = 'MarketplaceListing'
              AND column_name = 'evalClusterId'
          ) AS "listingClusterId",
          EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = 'PurchaseOrder'
              AND column_name = 'isEvalOnly'
          ) AS "orderEvalOnly",
          EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = 'KnowledgeDocument'
              AND column_name = 'isEvalOnly'
          ) AS "knowledgeDocumentEvalOnly"
      `,
    );
    const state = rows[0];
    return {
      ready: Boolean(state && isProductionSchemaReady(state)),
      migration: REQUIRED_SCHEMA_MIGRATION,
    };
  } catch (error) {
    console.error(
      "[ProductionReadiness] Database or schema check failed:",
      error instanceof Error ? error.message : "Unknown database error",
    );
    return { ready: false, migration: REQUIRED_SCHEMA_MIGRATION };
  }
}
