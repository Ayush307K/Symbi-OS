/**
 * Symbi-OS — Waste Material Embedding Pipeline
 *
 * 1. Reads all WasteMaterial descriptions from Neo4j
 * 2. Generates 1536-d embeddings via OpenAI text-embedding-3-small
 * 3. Stores embeddings back on each WasteMaterial node
 * 4. Creates a vector index for similarity search
 *
 * Env vars required (loaded via .env):
 *   OPENAI_API_KEY  — sk-...
 *   NEO4J_URI       — neo4j+s://xxxx.databases.neo4j.io
 *   NEO4J_USERNAME  — neo4j
 *   NEO4J_PASSWORD  — your-password
 *
 * Run:  node scripts/embed_materials.js
 */

require("dotenv").config();

const neo4j = require("neo4j-driver");
const OpenAI = require("openai").default;

// ---------------------------------------------------------------------------
//  Config
// ---------------------------------------------------------------------------

const NEO4J_URI = process.env.NEO4J_URI;
const NEO4J_USERNAME = process.env.NEO4J_USERNAME;
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!NEO4J_URI || !NEO4J_USERNAME || !NEO4J_PASSWORD) {
  console.error("ERROR: Missing Neo4j env vars.");
  process.exit(1);
}
if (!OPENAI_API_KEY) {
  console.error("ERROR: Missing OPENAI_API_KEY.");
  process.exit(1);
}

const EMBEDDING_MODEL = "text-embedding-3-small";
const VECTOR_DIMENSIONS = 1536;
const INDEX_NAME = "waste_embedding_idx";
const BATCH_SIZE = 50; // OpenAI allows up to 2048 per batch

// ---------------------------------------------------------------------------
//  Main
// ---------------------------------------------------------------------------

async function main() {
  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

  console.log(`Connecting to Neo4j at ${NEO4J_URI}…`);
  const driver = neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USERNAME, NEO4J_PASSWORD)
  );
  await driver.verifyConnectivity();
  console.log("  Connected.\n");

  const session = driver.session();

  try {
    // ---- Step 1: Read all WasteMaterial descriptions -------------------------
    console.log("Reading WasteMaterial descriptions from Neo4j…");
    const result = await session.run(
      `MATCH (w:WasteMaterial)
       WHERE w.description IS NOT NULL
       RETURN w.id AS id, w.name AS name, w.description AS description
       ORDER BY w.id`
    );

    const materials = result.records.map((r) => ({
      id: r.get("id"),
      name: r.get("name"),
      description: r.get("description"),
    }));

    console.log(`  Found ${materials.length} materials with descriptions.\n`);

    if (materials.length === 0) {
      console.log("No materials found. Run generate_dataset.js + ingest_to_neo4j.js first.");
      return;
    }

    // ---- Step 2: Generate embeddings in batches ------------------------------
    console.log(`Generating embeddings (model: ${EMBEDDING_MODEL})…`);
    const allEmbeddings = [];

    for (let i = 0; i < materials.length; i += BATCH_SIZE) {
      const batch = materials.slice(i, i + BATCH_SIZE);
      const texts = batch.map((m) => m.description);

      const response = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: texts,
      });

      for (const item of response.data) {
        allEmbeddings.push(item.embedding);
      }

      console.log(
        `  Embedded ${Math.min(i + BATCH_SIZE, materials.length)} / ${materials.length}`
      );
    }

    console.log(`  All ${allEmbeddings.length} embeddings generated.\n`);

    // ---- Step 3: Store embeddings on Neo4j nodes -----------------------------
    console.log("Storing embeddings on WasteMaterial nodes…");

    for (let i = 0; i < materials.length; i++) {
      await session.run(
        `MATCH (w:WasteMaterial {id: $id})
         SET w.embedding = $embedding`,
        { id: materials[i].id, embedding: allEmbeddings[i] }
      );

      if ((i + 1) % 25 === 0 || i === materials.length - 1) {
        console.log(`  Stored ${i + 1} / ${materials.length}`);
      }
    }

    console.log("  All embeddings stored.\n");

    // ---- Step 4: Create vector index -----------------------------------------
    console.log(`Creating vector index '${INDEX_NAME}'…`);

    try {
      await session.run(
        `CREATE VECTOR INDEX ${INDEX_NAME} IF NOT EXISTS
         FOR (w:WasteMaterial)
         ON (w.embedding)
         OPTIONS {
           indexConfig: {
             \`vector.dimensions\`: ${VECTOR_DIMENSIONS},
             \`vector.similarity_function\`: 'cosine'
           }
         }`
      );
      console.log("  Vector index created (or already exists).\n");
    } catch (err) {
      if (err.message.includes("equivalent index already exists")) {
        console.log("  Vector index already exists — skipping.\n");
      } else {
        console.error("  WARNING: Could not create vector index:", err.message);
        console.error("  Your Neo4j instance may not support vector indexes (requires 5.11+).");
        console.error("  The hybrid search API will fall back to non-vector mode.\n");
      }
    }

    // ---- Step 5: Verify -------------------------------------------------------
    console.log("Verifying…");
    const verifyResult = await session.run(
      `MATCH (w:WasteMaterial)
       WHERE w.embedding IS NOT NULL
       RETURN count(w) AS embedded`
    );
    const embedded = verifyResult.records[0].get("embedded").toNumber();
    console.log(`  ${embedded} / ${materials.length} materials have embeddings.`);

    // Check if vector index is online
    try {
      const indexResult = await session.run(
        `SHOW INDEXES
         WHERE name = '${INDEX_NAME}'`
      );
      if (indexResult.records.length > 0) {
        const state = indexResult.records[0].get("state");
        console.log(`  Vector index '${INDEX_NAME}' state: ${state}`);
      }
    } catch {
      console.log("  (Could not verify index state)");
    }

    console.log("\n=== Embedding Pipeline Complete ===");
  } finally {
    await session.close();
    await driver.close();
    console.log("Neo4j connection closed.");
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
