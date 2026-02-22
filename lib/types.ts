// ---------------------------------------------------------------------------
//  Symbi-OS — Shared TypeScript Interfaces
// ---------------------------------------------------------------------------

/** Node categories stored in Neo4j. */
export type NodeLabel = "Company" | "WasteMaterial" | "Regulation";

/** Relationship types stored in Neo4j. */
export type RelationshipType =
  | "PRODUCES"
  | "CAN_UPCYCLE"
  | "REQUIRES_COMPLIANCE"
  | "COMPLEMENTS"
  | "POTENTIAL_MATCH"
  | "IS_SEEKING";

// ---------------------------------------------------------------------------
//  Node property shapes (one per label)
// ---------------------------------------------------------------------------

export interface CompanyProperties {
  id: string;
  name: string;
  industry: string;
  location: string;
  carbon_rating: string;
  latitude: number;
  longitude: number;
  capacity: number;
}

export interface WasteMaterialProperties {
  id: string;
  name: string;
  toxicity_level: string;
  base_element: string;
  category: string;
  description: string;
  price?: number;
  quantity?: number;
}

export interface RegulationProperties {
  id: string;
  code: string;
  description: string;
}

/** Union of all possible node property shapes. */
export type NodeProperties =
  | CompanyProperties
  | WasteMaterialProperties
  | RegulationProperties;

// ---------------------------------------------------------------------------
//  Graph payload returned by the API (used by the frontend for 3D viz)
// ---------------------------------------------------------------------------

/** A single node in the subgraph response. */
export interface GraphNode {
  id: string;
  label: NodeLabel;
  properties: NodeProperties;
}

/** A single edge in the subgraph response. */
export interface GraphEdge {
  source: string;
  target: string;
  type: RelationshipType;
}

/** The full graph data payload sent to the frontend. */
export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// ---------------------------------------------------------------------------
//  API request / response shapes
// ---------------------------------------------------------------------------

/** POST body for /api/graphrag */
export interface GraphRAGRequest {
  query: string;
}

/** Successful response from /api/graphrag */
export interface GraphRAGResponse {
  answer: string;
  cypher: string;
  graphData: GraphData;
}

/** Error response from /api/graphrag */
export interface GraphRAGErrorResponse {
  error: string;
  details?: string;
}

// ---------------------------------------------------------------------------
//  Auth types
// ---------------------------------------------------------------------------

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  companyName: string;
  neo4jCompanyId: string | null;
}
