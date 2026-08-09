-- pgvector is required by both the listing semantic index and cached buyer
-- demand profiles. IF NOT EXISTS keeps deploys safe when a managed provider
-- has already enabled it at the database level.
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "MarketplaceListing"
ADD COLUMN "embedding" vector(768);

-- HNSW can be created before the backfill and does not require a training
-- phase. NULL embeddings are intentionally omitted by pgvector.
CREATE INDEX "MarketplaceListing_embedding_hnsw_idx"
ON "MarketplaceListing"
USING hnsw ("embedding" vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

CREATE TABLE "buyer_demand_profiles" (
  "user_id" TEXT NOT NULL,
  "profile_text" TEXT NOT NULL,
  "embedding" vector(768),
  "history_event_count" INTEGER NOT NULL DEFAULT 0,
  "source_updated_at" TIMESTAMP(3) NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "buyer_demand_profiles_pkey" PRIMARY KEY ("user_id"),
  CONSTRAINT "buyer_demand_profiles_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "material_edges" (
  "src" TEXT NOT NULL,
  "dst" TEXT NOT NULL,
  "edge_type" TEXT NOT NULL,
  "weight" DOUBLE PRECISION NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "material_edges_pkey" PRIMARY KEY ("src", "dst", "edge_type"),
  CONSTRAINT "material_edges_no_self_loop" CHECK ("src" <> "dst"),
  CONSTRAINT "material_edges_edge_type_check" CHECK (
    "edge_type" IN ('co_purchased', 'substitutable', 'category_affinity')
  ),
  CONSTRAINT "material_edges_weight_check" CHECK (
    "weight" >= 0 AND "weight" <= 1
  ),
  CONSTRAINT "material_edges_src_fkey"
    FOREIGN KEY ("src") REFERENCES "WasteMaterial"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "material_edges_dst_fkey"
    FOREIGN KEY ("dst") REFERENCES "WasteMaterial"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "material_edges_src_edge_type_weight_idx"
ON "material_edges"("src", "edge_type", "weight" DESC);

CREATE INDEX "material_edges_dst_edge_type_weight_idx"
ON "material_edges"("dst", "edge_type", "weight" DESC);
