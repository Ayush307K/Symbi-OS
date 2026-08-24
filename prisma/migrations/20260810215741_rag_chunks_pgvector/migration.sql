-- RAG chunk embeddings move from a JSON text column to pgvector, matching the
-- listing index: same model, same 768 width, same cosine operator class.
--
-- Nothing is migrated across. The column was never populated — 0 of 55 rows
-- locally and 0 of 55 in production — because no embedding provider was
-- configured, so the drop is lossless rather than destructive.

ALTER TABLE "KnowledgeChunk" ADD COLUMN "embedding" vector(768);

-- Matches MarketplaceListing_embedding_hnsw_idx. Cosine, because Gemini
-- vectors are normalised to unit length before they are stored.
CREATE INDEX "KnowledgeChunk_embedding_hnsw_idx"
ON "KnowledgeChunk"
USING hnsw ("embedding" vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

ALTER TABLE "KnowledgeChunk" DROP COLUMN "embeddingJson";
