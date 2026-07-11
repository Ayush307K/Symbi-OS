import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import type {
  GraphData,
  GraphEdge,
  GraphNode,
  GraphRAGRequest,
  GraphRAGResponse,
  GraphRAGErrorResponse,
} from "@/lib/types";

function companyNode(company: {
  id: string;
  name: string;
  industry: string;
  location: string;
  carbonRating: string;
  latitude: number;
  longitude: number;
  capacity: number;
}): GraphNode {
  return {
    id: company.id,
    label: "Company",
    properties: {
      id: company.id,
      name: company.name,
      industry: company.industry,
      location: company.location,
      carbon_rating: company.carbonRating,
      latitude: company.latitude,
      longitude: company.longitude,
      capacity: company.capacity,
    },
  };
}

function materialNode(material: {
  id: string;
  name: string;
  toxicityLevel: string;
  baseElement: string;
  category: string;
  description: string;
}): GraphNode {
  return {
    id: material.id,
    label: "WasteMaterial",
    properties: {
      id: material.id,
      name: material.name,
      toxicity_level: material.toxicityLevel,
      base_element: material.baseElement,
      category: material.category,
      description: material.description,
    },
  };
}

function regulationNode(regulation: {
  id: string;
  code: string;
  description: string;
}): GraphNode {
  return {
    id: regulation.id,
    label: "Regulation",
    properties: {
      id: regulation.id,
      code: regulation.code,
      description: regulation.description,
    },
  };
}

function pushNode(nodes: Map<string, GraphNode>, node: GraphNode) {
  if (!nodes.has(node.id)) nodes.set(node.id, node);
}

function pushEdge(edges: GraphEdge[], edge: GraphEdge) {
  if (!edges.some((e) => e.source === edge.source && e.target === edge.target && e.type === edge.type)) {
    edges.push(edge);
  }
}

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
    return NextResponse.json({ error: "Missing required field: query" }, { status: 400 });
  }

  try {
    const materials = await prisma.wasteMaterial.findMany({
      where: {
        OR: [
          { name: { contains: query } },
          { description: { contains: query } },
          { category: { contains: query } },
          { baseElement: { contains: query } },
        ],
      },
      include: {
        producers: { include: { company: true } },
        upcyclers: { include: { company: true } },
        regulations: { include: { regulation: true } },
      },
      take: 5,
    });

    const fallback =
      materials.length > 0
        ? materials
        : await prisma.wasteMaterial.findMany({
            include: {
              producers: { include: { company: true } },
              upcyclers: { include: { company: true } },
              regulations: { include: { regulation: true } },
            },
            orderBy: { name: "asc" },
            take: 3,
          });

    const nodes = new Map<string, GraphNode>();
    const edges: GraphEdge[] = [];
    const answerLines: string[] = [];

    for (const material of fallback) {
      pushNode(nodes, materialNode(material));
      for (const producer of material.producers.slice(0, 4)) {
        pushNode(nodes, companyNode(producer.company));
        pushEdge(edges, {
          source: producer.company.id,
          target: material.id,
          type: "PRODUCES",
        });
      }
      for (const upcycler of material.upcyclers.slice(0, 5)) {
        pushNode(nodes, companyNode(upcycler.company));
        pushEdge(edges, {
          source: upcycler.company.id,
          target: material.id,
          type: "CAN_UPCYCLE",
        });
      }
      for (const compliance of material.regulations.slice(0, 3)) {
        pushNode(nodes, regulationNode(compliance.regulation));
        pushEdge(edges, {
          source: material.id,
          target: compliance.regulation.id,
          type: "REQUIRES_COMPLIANCE",
        });
      }

      answerLines.push(
        `${material.name}: ${material.category}, ${material.toxicityLevel} risk, based on ${material.baseElement}. ` +
          `${material.producers.length} producer(s), ${material.upcyclers.length} upcycler(s), ` +
          `${material.regulations.length} compliance requirement(s).`
      );
    }

    const graphData: GraphData = {
      nodes: Array.from(nodes.values()),
      edges,
    };

    return NextResponse.json({
      answer:
        fallback.length > 0
          ? answerLines.join("\n")
          : "No matching materials found. Try searching by material, category, element, or industry.",
      cypher: "Prisma relational lookup over companies, waste materials, regulations, and edge tables.",
      graphData,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[GraphRAG] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
