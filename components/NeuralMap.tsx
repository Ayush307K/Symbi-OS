"use client";

import { useMemo } from "react";
import type {
  GraphData,
  GraphNode,
  NodeLabel,
  CompanyProperties,
  WasteMaterialProperties,
  RegulationProperties,
} from "@/lib/types";

// ---------------------------------------------------------------------------
//  Props
// ---------------------------------------------------------------------------

interface NeuralMapProps {
  graphData: GraphData;
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------
//  Visual config
// ---------------------------------------------------------------------------

const NODE_COLORS: Record<NodeLabel, string> = {
  Company: "#3b82f6",       // blue-500
  WasteMaterial: "#10b981", // emerald-500
  Regulation: "#ef4444",    // red-500
};

const EDGE_STROKE: Record<string, string> = {
  PRODUCES: "#3b82f6",
  CAN_UPCYCLE: "#10b981",
  REQUIRES_COMPLIANCE: "#ef4444",
};

const CARD_H = 56;
const ROW_GAP = 10;
const HEADER_AREA = 64;

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

function displayName(node: GraphNode): string {
  if ("name" in node.properties) return node.properties.name;
  if ("code" in node.properties) return node.properties.code;
  return node.id;
}

function nodeSubtext(node: GraphNode): string {
  switch (node.label) {
    case "Company":
      return (node.properties as CompanyProperties).location;
    case "WasteMaterial": {
      const p = node.properties as WasteMaterialProperties;
      return p.category ? `${p.category} · ${p.toxicity_level}` : `${p.base_element} · ${p.toxicity_level}`;
    }
    case "Regulation": {
      const d = (node.properties as RegulationProperties).description;
      return d.length > 40 ? d.slice(0, 37) + "…" : d;
    }
  }
  return "";
}

// ---------------------------------------------------------------------------
//  Layout engine
// ---------------------------------------------------------------------------

interface Pos {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface SvgPath {
  key: string;
  d: string;
  stroke: string;
  type: string;
}

function buildLayout(data: GraphData, containerW: number) {
  const companies = data.nodes.filter((n) => n.label === "Company");
  const wastes = data.nodes.filter((n) => n.label === "WasteMaterial");
  const regs = data.nodes.filter((n) => n.label === "Regulation");

  const PAD = 16;
  const GAP = Math.max(24, Math.min(44, (containerW - 360 - PAD * 2) / 2));
  const CW = Math.max(100, Math.floor((containerW - PAD * 2 - GAP * 2) / 3));
  const totalW = CW * 3 + GAP * 2;
  const sx = Math.max(PAD, Math.floor((containerW - totalW) / 2));
  const colX = [sx, sx + CW + GAP, sx + 2 * (CW + GAP)];

  const maxRows = Math.max(companies.length, wastes.length, regs.length, 1);
  const positions = new Map<string, Pos>();

  function placeColumn(nodes: GraphNode[], col: number) {
    const colH = nodes.length * CARD_H + Math.max(0, nodes.length - 1) * ROW_GAP;
    const maxH = maxRows * CARD_H + (maxRows - 1) * ROW_GAP;
    const offset = (maxH - colH) / 2;
    nodes.forEach((n, i) => {
      positions.set(n.id, {
        x: colX[col],
        y: HEADER_AREA + offset + i * (CARD_H + ROW_GAP),
        w: CW,
        h: CARD_H,
      });
    });
  }

  placeColumn(companies, 0);
  placeColumn(wastes, 1);
  placeColumn(regs, 2);

  // Build SVG bezier paths for edges
  const seen = new Set<string>();
  const paths: SvgPath[] = [];

  for (const e of data.edges) {
    const k = `${e.source}-${e.type}-${e.target}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const s = positions.get(e.source);
    const t = positions.get(e.target);
    if (!s || !t) continue;

    const x1 = s.x + s.w;
    const y1 = s.y + s.h / 2;
    const x2 = t.x;
    const y2 = t.y + t.h / 2;
    const mx = (x1 + x2) / 2;

    paths.push({
      key: k,
      d: `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`,
      stroke: EDGE_STROKE[e.type] ?? "#71717a",
      type: e.type,
    });
  }

  const contentH = HEADER_AREA + maxRows * CARD_H + (maxRows - 1) * ROW_GAP + 24;
  return { companies, wastes, regs, positions, paths, colX, CW, contentH };
}

// ---------------------------------------------------------------------------
//  Component
// ---------------------------------------------------------------------------

export default function NeuralMap({ graphData, width, height }: NeuralMapProps) {
  const L = useMemo(() => buildLayout(graphData, width), [graphData, width]);

  if (graphData.nodes.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-zinc-500"
        style={{ width, height }}
      >
        <div className="text-center">
          <div className="mb-2 text-4xl opacity-30">◎</div>
          <p className="text-sm">
            Query the Copilot to visualize the supply chain
          </p>
        </div>
      </div>
    );
  }

  const allNodes = [...L.companies, ...L.wastes, ...L.regs];
  const svgH = Math.max(height, L.contentH);

  return (
    <div className="overflow-auto scrollbar-thin" style={{ width, height }}>
      <div className="relative" style={{ width, minHeight: svgH }}>
        {/* Title + stats */}
        <div className="absolute left-4 top-3 z-10">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-emerald-400/60">
            Neural Map
          </h2>
          <p className="text-[10px] text-zinc-500">
            {graphData.nodes.length} nodes · {graphData.edges.length} edges
          </p>
        </div>

        {/* Column headers (double as legend) */}
        {[
          { label: "Companies", color: NODE_COLORS.Company, col: 0 },
          { label: "Waste Materials", color: NODE_COLORS.WasteMaterial, col: 1 },
          { label: "Regulations", color: NODE_COLORS.Regulation, col: 2 },
        ].map((c) => (
          <div
            key={c.label}
            className="absolute flex items-center gap-1.5"
            style={{ left: L.colX[c.col], top: 44, width: L.CW }}
          >
            <span
              className="h-2 w-2 rounded-full shrink-0"
              style={{ backgroundColor: c.color }}
            />
            <span
              className="text-[10px] font-semibold uppercase tracking-wider truncate"
              style={{ color: c.color, opacity: 0.6 }}
            >
              {c.label}
            </span>
          </div>
        ))}

        {/* SVG connection curves */}
        <svg
          className="absolute inset-0 pointer-events-none"
          width={width}
          height={svgH}
        >
          <defs>
            {Object.entries(EDGE_STROKE).map(([type, color]) => (
              <marker
                key={type}
                id={`arr-${type}`}
                viewBox="0 0 10 6"
                refX="9"
                refY="3"
                markerWidth="7"
                markerHeight="4"
                orient="auto"
              >
                <path d="M0,0 L10,3 L0,6 Z" fill={color} fillOpacity={0.55} />
              </marker>
            ))}
          </defs>
          {L.paths.map((p) => (
            <path
              key={p.key}
              d={p.d}
              fill="none"
              stroke={p.stroke}
              strokeWidth={1.5}
              strokeOpacity={0.35}
              markerEnd={`url(#arr-${p.type})`}
            />
          ))}
        </svg>

        {/* Node cards */}
        {allNodes.map((node) => {
          const pos = L.positions.get(node.id);
          if (!pos) return null;
          const color = NODE_COLORS[node.label];

          return (
            <div
              key={node.id}
              className="absolute rounded-lg border bg-zinc-900/80 backdrop-blur-sm overflow-hidden hover:bg-zinc-800/80 transition-colors"
              style={{
                left: pos.x,
                top: pos.y,
                width: pos.w,
                height: pos.h,
                borderColor: `${color}25`,
                borderLeftWidth: 3,
                borderLeftColor: color,
              }}
            >
              <div className="px-2.5 py-1.5">
                <p className="text-[11px] font-medium text-zinc-100 truncate leading-snug">
                  {displayName(node)}
                </p>
                <p className="text-[9px] text-zinc-500 truncate mt-0.5 leading-snug">
                  {nodeSubtext(node)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
