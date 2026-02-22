/**
 * Symbi-OS — Latent Link Prediction (Company Similarity)
 *
 * Computes Jaccard similarity between companies based on their shared
 * waste material profiles (PRODUCES + CAN_UPCYCLE overlap).
 * Writes POTENTIAL_MATCH edges for pairs above the threshold.
 *
 * Uses pure Cypher (no GDS library required — works on AuraDB Free).
 *
 * Run:  node scripts/compute_matches.js
 */

require("dotenv").config();

const neo4j = require("neo4j-driver");

const NEO4J_URI = process.env.NEO4J_URI;
const NEO4J_USERNAME = process.env.NEO4J_USERNAME;
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD;

if (!NEO4J_URI || !NEO4J_USERNAME || !NEO4J_PASSWORD) {
  console.error("ERROR: Missing Neo4j env vars.");
  process.exit(1);
}

const JACCARD_THRESHOLD = 0.12; // Minimum similarity for a match

async function main() {
  console.log(`Connecting to Neo4j at ${NEO4J_URI}…`);
  const driver = neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USERNAME, NEO4J_PASSWORD)
  );
  await driver.verifyConnectivity();
  console.log("  Connected.\n");

  const session = driver.session();

  try {
    // ---- Step 1: Clear old POTENTIAL_MATCH edges -----------------------------
    console.log("Clearing existing POTENTIAL_MATCH edges…");
    const delResult = await session.run(
      `MATCH ()-[r:POTENTIAL_MATCH]->() DELETE r RETURN count(r) AS deleted`
    );
    const deleted = delResult.records[0].get("deleted").toNumber();
    console.log(`  Removed ${deleted} old matches.\n`);

    // ---- Step 2: Compute Jaccard similarity ----------------------------------
    console.log(`Computing Jaccard similarity (threshold >= ${JACCARD_THRESHOLD})…`);

    const result = await session.run(
      `// Find shared waste materials between company pairs
       MATCH (c1:Company)-[:PRODUCES|CAN_UPCYCLE]->(w:WasteMaterial)<-[:PRODUCES|CAN_UPCYCLE]-(c2:Company)
       WHERE c1.id < c2.id
         AND c1.industry <> c2.industry
       WITH c1, c2, count(DISTINCT w) AS shared, collect(DISTINCT w.name) AS sharedNames
       // Count total materials for each company
       WITH c1, c2, shared, sharedNames,
            size([(c1)-[:PRODUCES|CAN_UPCYCLE]->(w1:WasteMaterial) | w1]) AS c1Total,
            size([(c2)-[:PRODUCES|CAN_UPCYCLE]->(w2:WasteMaterial) | w2]) AS c2Total
       WITH c1, c2, shared, sharedNames, c1Total, c2Total,
            toFloat(shared) / (c1Total + c2Total - shared) AS jaccard
       WHERE jaccard >= $threshold
       MERGE (c1)-[r:POTENTIAL_MATCH]->(c2)
       SET r.score = round(jaccard * 1000) / 1000.0,
           r.shared_materials = shared,
           r.shared_names = sharedNames[0..5],
           r.computed_at = datetime()
       RETURN c1.name AS company1, c1.industry AS industry1,
              c2.name AS company2, c2.industry AS industry2,
              r.score AS score, r.shared_materials AS shared
       ORDER BY score DESC`,
      { threshold: JACCARD_THRESHOLD }
    );

    const matches = result.records;
    console.log(`  Found ${matches.length} potential partnerships.\n`);

    if (matches.length > 0) {
      console.log("  Top 10 matches:");
      for (const rec of matches.slice(0, 10)) {
        const c1 = rec.get("company1");
        const c2 = rec.get("company2");
        const i1 = rec.get("industry1");
        const i2 = rec.get("industry2");
        const score = typeof rec.get("score") === "object"
          ? rec.get("score").toNumber()
          : rec.get("score");
        const shared = typeof rec.get("shared") === "object"
          ? rec.get("shared").toNumber()
          : rec.get("shared");
        console.log(`    [${score.toFixed(3)}] ${c1} (${i1}) ↔ ${c2} (${i2}) — ${shared} shared materials`);
      }
    }

    // ---- Step 3: Verify -------------------------------------------------------
    console.log("\nVerifying…");
    const verifyResult = await session.run(
      `MATCH ()-[r:POTENTIAL_MATCH]->()
       RETURN count(r) AS total, avg(r.score) AS avgScore`
    );
    const total = verifyResult.records[0].get("total").toNumber();
    const avgScore = verifyResult.records[0].get("avgScore");
    console.log(`  ${total} POTENTIAL_MATCH edges in graph (avg score: ${
      typeof avgScore === "object" ? avgScore.toNumber().toFixed(3) : Number(avgScore).toFixed(3)
    })`);

    console.log("\n=== Link Prediction Complete ===");
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
