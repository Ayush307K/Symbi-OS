// ---------------------------------------------------------------------------
//  POST /api/graphrag
//
//  Manual GraphRAG pipeline:
//    1. LLM generates Cypher from the user question + Neo4j schema
//    2. We clean the Cypher (strip code fences / language tags)
//    3. We execute the cleaned Cypher against Neo4j
//    4. LLM synthesizes a reasoned plain-text answer
//    5. We fetch the visualization subgraph (with bridge-node discovery)
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { ChatOpenAI } from "@langchain/openai";
import { PromptTemplate } from "@langchain/core/prompts";
import { getNeo4jGraph } from "@/lib/neo4j-graph";
import type {
  GraphRAGRequest,
  GraphRAGResponse,
  GraphRAGErrorResponse,
  GraphNode,
  GraphEdge,
  NodeLabel,
  RelationshipType,
} from "@/lib/types";

// ---------------------------------------------------------------------------
//  Prompts
// ---------------------------------------------------------------------------

const CYPHER_PROMPT = PromptTemplate.fromTemplate(
  `You are a Neo4j Cypher expert. Given a user question and the graph schema below, generate a single valid Cypher statement that answers the question.

Rules:
- Use ONLY the node labels, relationship types, and properties shown in the schema.
- Return ONLY the raw Cypher statement. No explanations, no apologies.
- NEVER wrap the Cypher in markdown code fences or backticks.
- Do NOT prefix the output with "cypher" or any language identifier.
- In RETURN clauses, prefer returning specific properties (e.g., c.name, c.industry, w.name) rather than returning full node variables (e.g., RETURN c). This makes results more readable.
- ALWAYS include the WasteMaterial name (w.name) in RETURN clauses when the query pattern traverses through a WasteMaterial node. WasteMaterial is the bridge between Company and Regulation, so it must be returned for visualization.
- CRITICAL: Follow the relationship directions EXACTLY as shown in the schema. The ONLY valid patterns are:
    (Company)-[:PRODUCES]->(WasteMaterial)
    (Company)-[:CAN_UPCYCLE]->(WasteMaterial)
    (WasteMaterial)-[:REQUIRES_COMPLIANCE]->(Regulation)
  Do NOT invent other patterns. For example, there is NO direct relationship between Company and Regulation.

Example Cypher queries for this schema:

Q: "Find upcycle pathways and regulations for Blast Furnace Slag"
A: MATCH (c:Company)-[:CAN_UPCYCLE]->(w:WasteMaterial {{name: 'Blast Furnace Slag'}})-[:REQUIRES_COMPLIANCE]->(r:Regulation) RETURN c.name AS company, c.industry AS industry, c.location AS location, w.name AS waste_material, r.code AS regulation_code, r.description AS regulation_desc

Q: "What does TexWeave Industries produce?"
A: MATCH (c:Company {{name: 'TexWeave Industries'}})-[:PRODUCES]->(w:WasteMaterial) RETURN c.name AS company, w.name AS waste_material, w.toxicity_level AS toxicity, w.base_element AS element

Q: "Which companies produce Chemical Dye Runoff and who can upcycle it?"
A: MATCH (producer:Company)-[:PRODUCES]->(w:WasteMaterial {{name: 'Chemical Dye Runoff'}})<-[:CAN_UPCYCLE]-(upcycler:Company) RETURN producer.name AS producer, w.name AS waste_material, upcycler.name AS upcycler, upcycler.industry AS industry

Schema:
{schema}

Question: {question}
Cypher:`
);

const QA_PROMPT = PromptTemplate.fromTemplate(
  `You are a helpful circular-economy supply chain analyst.
Based on the database query results below, provide a clear, well-structured answer to the user's question.
If the results are empty, say you found no matching data and suggest the user rephrase.
Be specific — mention company names, locations, waste materials, and regulation codes from the data.

IMPORTANT formatting rules:
- Do NOT use markdown formatting. No **bold**, no ## headers, no backticks.
- Use plain text only.
- Use line breaks to separate sections.
- Use dashes (-) for bullet lists if needed.
- Keep the answer concise but thorough.

Question: {question}

Query Results:
{context}

Answer:`
);

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

/** Strips markdown code fences and language identifiers from LLM output. */
function cleanCypher(raw: string): string {
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^```(?:cypher)?\s*/i, "").replace(/\s*```$/i, "");
  cleaned = cleaned.replace(/^cypher\s*\n/i, "");
  return cleaned.trim();
}

const VALID_NODE_LABELS = new Set<string>(["Company", "WasteMaterial", "Regulation"]);
const VALID_REL_TYPES = new Set<string>(["PRODUCES", "CAN_UPCYCLE", "REQUIRES_COMPLIANCE", "COMPLEMENTS", "POTENTIAL_MATCH", "IS_SEEKING"]);

/** Keys whose values are metadata, not entity identifiers. */
const SKIP_KEYS = new Set([
  "toxicity_level", "base_element", "carbon_rating",
  "industry", "location", "description",
  "toxicity", "element", "regulation_desc", "category",
  "waste_description",
]);

/** Extracts entity names / regulation codes from Neo4j query results. */
function extractEntityIdentifiers(
  context: Record<string, unknown>[]
): string[] {
  const ids = new Set<string>();

  function extractFromValue(key: string, value: unknown): void {
    if (typeof value === "string" && value.length > 0) {
      if (SKIP_KEYS.has(key.toLowerCase())) return;
      ids.add(value);
    } else if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        extractFromValue(k, v);
      }
    }
  }

  for (const record of context) {
    for (const [key, value] of Object.entries(record)) {
      extractFromValue(key, value);
    }
  }

  return Array.from(ids);
}

/** Extracts entity names from Cypher {name: 'X'} patterns as extra identifiers. */
function extractNamesFromCypher(cypher: string): string[] {
  const names: string[] = [];
  const regex = /\{[^}]*name:\s*'([^']+)'/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(cypher)) !== null) {
    names.push(match[1]);
  }
  return names;
}

/** Helper to build typed node from a Neo4j record. */
function buildGraphNode(
  label: string,
  props: Record<string, string>
): GraphNode | null {
  const id = props.id;
  if (!id || !VALID_NODE_LABELS.has(label)) return null;

  let properties: GraphNode["properties"];
  switch (label) {
    case "Company":
      properties = {
        id: props.id, name: props.name, industry: props.industry,
        location: props.location, carbon_rating: props.carbon_rating,
        latitude: parseFloat(props.latitude) || 0,
        longitude: parseFloat(props.longitude) || 0,
        capacity: parseInt(props.capacity) || 0,
      };
      break;
    case "WasteMaterial":
      properties = {
        id: props.id, name: props.name,
        toxicity_level: props.toxicity_level, base_element: props.base_element,
        category: props.category, description: props.description,
      };
      break;
    case "Regulation":
      properties = {
        id: props.id, code: props.code, description: props.description,
      };
      break;
    default:
      return null;
  }
  return { id, label: label as NodeLabel, properties };
}

/**
 * Fetches the visualization subgraph, including bridge-node discovery.
 *
 * After finding initially-matched nodes, it discovers WasteMaterial bridge
 * nodes that connect Company ↔ Regulation so that edges can render.
 */
async function fetchSubgraph(
  entityIdentifiers: string[]
): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
  if (entityIdentifiers.length === 0) {
    return { nodes: [], edges: [] };
  }

  const graph = await getNeo4jGraph();
  const nodeIdSet = new Set<string>();
  const nodes: GraphNode[] = [];

  // ---- Step 1: Fetch nodes matching the identifiers -----------------------

  const nodeRecords = await graph.query<{
    label: string;
    props: Record<string, unknown>;
  }>(
    `MATCH (n)
     WHERE n.name IN $ids OR n.code IN $ids
     RETURN labels(n)[0] AS label, properties(n) AS props`,
    { ids: entityIdentifiers }
  );

  for (const rec of nodeRecords) {
    const id = (rec.props as Record<string, string>).id;
    if (!id || nodeIdSet.has(id)) continue;
    const node = buildGraphNode(rec.label, rec.props as Record<string, string>);
    if (!node) continue;
    nodeIdSet.add(id);
    nodes.push(node);
  }

  if (nodes.length === 0) return { nodes: [], edges: [] };

  // ---- Step 3: Fetch all relationships between found nodes ----------------

  const edgeRecords = await graph.query<{
    source: string; target: string; relType: string;
  }>(
    `MATCH (a)-[r]->(b)
     WHERE a.id IN $nodeIds AND b.id IN $nodeIds
     RETURN DISTINCT a.id AS source, b.id AS target, type(r) AS relType`,
    { nodeIds: Array.from(nodeIdSet) }
  );

  const edges: GraphEdge[] = [];
  const edgeKeySet = new Set<string>();

  for (const rec of edgeRecords) {
    if (!VALID_REL_TYPES.has(rec.relType)) continue;
    const key = `${rec.source}-${rec.relType}-${rec.target}`;
    if (edgeKeySet.has(key)) continue;
    edgeKeySet.add(key);
    edges.push({
      source: rec.source, target: rec.target,
      type: rec.relType as RelationshipType,
    });
  }

  return { nodes, edges };
}

// ---------------------------------------------------------------------------
//  Route Handler
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest
): Promise<NextResponse<GraphRAGResponse | GraphRAGErrorResponse>> {
  let body: GraphRAGRequest;
  try {
    body = (await request.json()) as GraphRAGRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const query = body.query?.trim();
  if (!query) {
    return NextResponse.json(
      { error: "Missing required field: query" },
      { status: 400 }
    );
  }

  try {
    const graph = await getNeo4jGraph();
    const schema = graph.getSchema();
    const llm = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0 });

    // ---- Generate Cypher ----------------------------------------------------

    const cypherPromptText = await CYPHER_PROMPT.format({ schema, question: query });
    const cypherResponse = await llm.invoke(cypherPromptText);
    const rawCypher =
      typeof cypherResponse.content === "string"
        ? cypherResponse.content
        : String(cypherResponse.content);
    const cypher = cleanCypher(rawCypher);

    console.log("[GraphRAG] Generated Cypher:", cypher);

    // ---- Execute Cypher -----------------------------------------------------

    let context: Record<string, unknown>[] = [];

    try {
      const results = await graph.query<Record<string, unknown>>(cypher);
      if (Array.isArray(results)) context = results;
    } catch (cypherErr: unknown) {
      const msg = cypherErr instanceof Error ? cypherErr.message : String(cypherErr);
      console.warn("[GraphRAG] Cypher execution failed:", msg);
    }

    console.log("[GraphRAG] Neo4j returned", context.length, "records.");

    // ---- Synthesize answer --------------------------------------------------

    let answer: string;

    if (context.length === 0) {
      answer = "No matching data found for this query. Try rephrasing your question or using different terms.";
    } else {
      const qaPromptText = await QA_PROMPT.format({
        question: query,
        context: JSON.stringify(context, null, 2),
      });
      const qaResponse = await llm.invoke(qaPromptText);
      answer =
        typeof qaResponse.content === "string"
          ? qaResponse.content
          : String(qaResponse.content);
    }

    // ---- Fetch visualization subgraph ---------------------------------------

    let graphData: { nodes: GraphNode[]; edges: GraphEdge[] } = {
      nodes: [],
      edges: [],
    };

    try {
      // Combine identifiers from context + names parsed from Cypher
      const identifiers = extractEntityIdentifiers(context);
      const cypherNames = extractNamesFromCypher(cypher);
      for (const name of cypherNames) {
        if (!identifiers.includes(name)) identifiers.push(name);
      }

      graphData = await fetchSubgraph(identifiers);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.warn("[GraphRAG] Subgraph fetch warning:", message);
    }

    return NextResponse.json({ answer, cypher, graphData });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[GraphRAG] Fatal error:", message);
    return NextResponse.json(
      {
        error: "The AI could not process this query. Try rephrasing your question.",
        details: message,
      },
      { status: 500 }
    );
  }
}
