// ---------------------------------------------------------------------------
//  Symbi-OS — Neo4jGraph Singleton
//
//  Lazy-initializes a single Neo4jGraph instance per server cold-start.
//  All API routes share this connection so we avoid re-introspecting the
//  schema on every request.
// ---------------------------------------------------------------------------

import { Neo4jGraph } from "@langchain/community/graphs/neo4j_graph";

let instance: Neo4jGraph | null = null;

/**
 * Returns a connected, schema-aware Neo4jGraph instance.
 *
 * On first call it will:
 *   1. Create the driver (bolt connection)
 *   2. Verify connectivity
 *   3. Introspect the graph schema via APOC
 *
 * Subsequent calls return the cached instance.
 */
export async function getNeo4jGraph(): Promise<Neo4jGraph> {
  if (instance) return instance;

  const url = process.env.NEO4J_URI;
  const username = process.env.NEO4J_USERNAME;
  const password = process.env.NEO4J_PASSWORD;

  if (!url || !username || !password) {
    throw new Error(
      "Missing Neo4j credentials. Set NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD in .env"
    );
  }

  // AuraDB Free uses the default database (not "neo4j"), so we must pass
  // an empty string to avoid the "database does not exist" routing error.
  const database = process.env.NEO4J_DATABASE || "";

  instance = await Neo4jGraph.initialize({ url, username, password, database });
  return instance;
}
