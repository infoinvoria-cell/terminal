import fs from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { getCapitalifeBrainPath } from "@/lib/brain/brain-path";

const DASHBOARD_ROOT = process.cwd();
const GRAPH_CACHE_TTL_MS = 5 * 60 * 1000;
let _graphCache: { nodes: GraphNode[]; root: string; ts: number } | null = null;

type GraphNode = {
  id: string;
  label: string;
  file_type?: string;
  source_file?: string;
  source_location?: string;
  community?: number;
  norm_label?: string;
  degree?: number;
};

type GraphData = {
  nodes?: GraphNode[];
  links?: Array<{ source: string; target: string; relation?: string }>;
};

function loadGraph(root: string): GraphNode[] {
  const now = Date.now();
  if (_graphCache && _graphCache.root === root && now - _graphCache.ts < GRAPH_CACHE_TTL_MS) {
    return _graphCache.nodes;
  }
  const p = path.join(root, "graphify-out", "graph.json");
  if (!fs.existsSync(p)) return [];
  try {
    const g = JSON.parse(fs.readFileSync(p, "utf8")) as GraphData;
    const nodes = g.nodes ?? [];
    const links = g.links ?? [];
    const degMap = new Map<string, number>();
    for (const link of links) {
      degMap.set(link.source, (degMap.get(link.source) ?? 0) + 1);
      degMap.set(link.target, (degMap.get(link.target) ?? 0) + 1);
    }
    const result = nodes.map((n) => ({ ...n, degree: degMap.get(n.id) ?? 0 }));
    _graphCache = { nodes: result, root, ts: now };
    return result;
  } catch {
    return [];
  }
}

function scoreMatch(node: GraphNode, q: string): number {
  const lower = q.toLowerCase();
  const label = (node.label ?? "").toLowerCase();
  const src = (node.source_file ?? "").toLowerCase();
  if (label === lower) return 100;
  if (label.startsWith(lower)) return 80;
  if (label.includes(lower)) return 60;
  if (src.includes(lower)) return 40;
  return 0;
}

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim().slice(0, 100);
  const source = searchParams.get("source") ?? "dashboard";

  if (!q) return NextResponse.json({ results: [] });

  const brainRoot = getCapitalifeBrainPath();
  if (source === "brain" && !brainRoot) {
    return NextResponse.json({ results: [], message: "CAPITALIFE_BRAIN_PATH missing" });
  }
  const root = source === "brain" ? brainRoot! : DASHBOARD_ROOT;
  const nodes = loadGraph(root);

  const scored = nodes
    .map((n) => ({ node: n, score: scoreMatch(n, q) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || (b.node.degree ?? 0) - (a.node.degree ?? 0))
    .slice(0, 20);

  return NextResponse.json({
    results: scored.map(({ node, score }) => ({
      id: node.id,
      label: node.label,
      sourceFile: node.source_file ?? null,
      sourceLocation: node.source_location ?? null,
      fileType: node.file_type ?? null,
      community: node.community ?? null,
      degree: node.degree ?? 0,
      score,
    })),
  });
}
