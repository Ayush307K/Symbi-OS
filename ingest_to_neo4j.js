/**
 * Symbi-OS — Neo4j Ingestion Pipeline
 *
 * Reads supply_chain_graph.json and pushes all nodes + edges into
 * a Neo4j AuraDB (or any Neo4j 5.x instance).
 *
 * Env vars required (loaded via .env):
 *   NEO4J_URI       — bolt+s://xxxx.databases.neo4j.io
 *   NEO4J_USERNAME  — neo4j
 *   NEO4J_PASSWORD  — your-password
 *
 * Run:  node ingest_to_neo4j.js
 */

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const neo4j = require("neo4j-driver");

// ---------------------------------------------------------------------------
//  CONFIG
// ---------------------------------------------------------------------------

const NEO4J_URI = process.env.NEO4J_URI;
const NEO4J_USERNAME = process.env.NEO4J_USERNAME;
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD;

if (!NEO4J_URI || !NEO4J_USERNAME || !NEO4J_PASSWORD) {
  console.error(
    "ERROR: Missing one or more required env vars: NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD"
  );
  console.error("Create a .env file in the project root. See .env.example.");
  process.exit(1);
}

const DATA_PATH = path.join(__dirname, "supply_chain_graph.json");

// ---------------------------------------------------------------------------
//  HELPERS
// ---------------------------------------------------------------------------

/**
 * Batches an array into chunks of a given size.
 * Prevents overwhelming Neo4j with thousands of individual transactions.
 */
function batch(arr, size) {
  const batches = [];
  for (let i = 0; i < arr.length; i += size) {
    batches.push(arr.slice(i, i + size));
  }
  return batches;
}

/**
 * Builds a Cypher MERGE statement for a node.
 *
 * Neo4j does NOT support parameterized labels, so we interpolate the label
 * directly (it comes from our own trusted dataset, not user input).
 * All property values are passed as parameters to prevent injection.
 */
function buildNodeCypher(node) {
  const label = node.type; // Company | WasteMaterial | Regulation
  const query = `MERGE (n:${label} {id: $id}) SET n += $props`;
  const params = { id: node.id, props: node.properties };
  return { query, params };
}

/**
 * Builds a Cypher MERGE statement for a relationship.
 *
 * Same label-interpolation caveat as above — edge.type comes from our own
 * dataset (PRODUCES | CAN_UPCYCLE | REQUIRES_COMPLIANCE).
 */
function buildEdgeCypher(edge) {
  const relType = edge.type;
  const query = `
    MATCH (src {id: $srcId})
    MATCH (tgt {id: $tgtId})
    MERGE (src)-[r:${relType}]->(tgt)
    SET r += $props
  `;
  const params = {
    srcId: edge.source,
    tgtId: edge.target,
    props: edge.properties,
  };
  return { query, params };
}

// ---------------------------------------------------------------------------
//  MAIN
// ---------------------------------------------------------------------------

async function main() {
  // ---- 1. Read dataset ----------------------------------------------------
  console.log("Reading dataset…");

  if (!fs.existsSync(DATA_PATH)) {
    console.error(`ERROR: Dataset not found at ${DATA_PATH}`);
    console.error("Run  node generate_dataset.js  first.");
    process.exit(1);
  }

  const graph = JSON.parse(fs.readFileSync(DATA_PATH, "utf-8"));
  console.log(
    `  Loaded ${graph.nodes.length} nodes and ${graph.edges.length} edges.\n`
  );

  // ---- 2. Connect to Neo4j -----------------------------------------------
  console.log(`Connecting to Neo4j at ${NEO4J_URI}…`);

  const driver = neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USERNAME, NEO4J_PASSWORD)
  );

  // Verify connectivity before proceeding
  try {
    await driver.verifyConnectivity();
    console.log("  Connected successfully.\n");
  } catch (err) {
    console.error("ERROR: Failed to connect to Neo4j.");
    console.error(err.message);
    await driver.close();
    process.exit(1);
  }

  const session = driver.session();

  try {
    // ---- 3. Wipe existing data --------------------------------------------
    console.log("Wiping existing data (DETACH DELETE)…");
    const deleteResult = await session.run("MATCH (n) DETACH DELETE n");
    console.log(
      `  Deleted ${deleteResult.summary.counters.updates().nodesDeleted} nodes ` +
        `and ${deleteResult.summary.counters.updates().relationshipsDeleted} relationships.\n`
    );

    // ---- 4. Create constraint indexes for fast MERGE lookups ---------------
    console.log("Creating uniqueness constraints…");

    const constraints = [
      "CREATE CONSTRAINT IF NOT EXISTS FOR (c:Company)       REQUIRE c.id IS UNIQUE",
      "CREATE CONSTRAINT IF NOT EXISTS FOR (w:WasteMaterial) REQUIRE w.id IS UNIQUE",
      "CREATE CONSTRAINT IF NOT EXISTS FOR (r:Regulation)    REQUIRE r.id IS UNIQUE",
    ];

    for (const stmt of constraints) {
      await session.run(stmt);
    }
    console.log("  Constraints ensured for Company, WasteMaterial, Regulation.\n");

    // ---- 5. Ingest nodes in batches ----------------------------------------
    console.log("Ingesting nodes…");

    const NODE_BATCH_SIZE = 25;
    const nodeBatches = batch(graph.nodes, NODE_BATCH_SIZE);
    let nodesIngested = 0;

    for (const chunk of nodeBatches) {
      const tx = session.beginTransaction();
      try {
        for (const node of chunk) {
          const { query, params } = buildNodeCypher(node);
          await tx.run(query, params);
        }
        await tx.commit();
        nodesIngested += chunk.length;
        console.log(`  Nodes: ${nodesIngested} / ${graph.nodes.length}`);
      } catch (err) {
        await tx.rollback();
        console.error(`  ERROR ingesting node batch at offset ${nodesIngested}:`);
        console.error(`  ${err.message}`);
        throw err;
      }
    }

    console.log(`  All ${nodesIngested} nodes ingested.\n`);

    // ---- 6. Ingest edges in batches ----------------------------------------
    console.log("Ingesting edges…");

    const EDGE_BATCH_SIZE = 25;
    const edgeBatches = batch(graph.edges, EDGE_BATCH_SIZE);
    let edgesIngested = 0;

    for (const chunk of edgeBatches) {
      const tx = session.beginTransaction();
      try {
        for (const edge of chunk) {
          const { query, params } = buildEdgeCypher(edge);
          await tx.run(query, params);
        }
        await tx.commit();
        edgesIngested += chunk.length;
        console.log(`  Edges: ${edgesIngested} / ${graph.edges.length}`);
      } catch (err) {
        await tx.rollback();
        console.error(`  ERROR ingesting edge batch at offset ${edgesIngested}:`);
        console.error(`  ${err.message}`);
        throw err;
      }
    }

    console.log(`  All ${edgesIngested} edges ingested.\n`);

    // ---- 7. Verification query --------------------------------------------
    console.log("Running verification query…");

    const verification = await session.run(`
      MATCH (n)
      WITH labels(n)[0] AS label, count(n) AS cnt
      RETURN label, cnt
      ORDER BY cnt DESC
    `);

    console.log("  Node counts in Neo4j:");
    for (const record of verification.records) {
      console.log(`    ${record.get("label")}: ${record.get("cnt").toNumber()}`);
    }

    const relVerification = await session.run(`
      MATCH ()-[r]->()
      WITH type(r) AS relType, count(r) AS cnt
      RETURN relType, cnt
      ORDER BY cnt DESC
    `);

    console.log("  Relationship counts in Neo4j:");
    for (const record of relVerification.records) {
      console.log(
        `    ${record.get("relType")}: ${record.get("cnt").toNumber()}`
      );
    }

    console.log("\n=== Ingestion Complete ===");
  } catch (err) {
    console.error("\nFATAL: Ingestion failed.");
    console.error(err);
    process.exit(1);
  } finally {
    await session.close();
    await driver.close();
    console.log("Neo4j connection closed.");
  }
}

main();
