import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { getCapitalifeBrainPath } from "@/lib/brain/brain-path";

const DASHBOARD_ROOT = process.cwd();

type RawNode = {
  id: string;
  label: string;
  file_type?: string;
  source_file?: string;
  source_location?: string;
  community?: number;
};

type RawLink = {
  source: string;
  target: string;
};

type GraphData = {
  nodes?: RawNode[];
  links?: RawLink[];
};

type NetworkNode = {
  id: string;
  label: string;
  fileType: string | null;
  sourceFile: string | null;
  sourceLocation: string | null;
  degree: number;
  community: number | null;
  source: "brain" | "dashboard";
  x: number;
  y: number;
};

type RankedNode = Omit<NetworkNode, "x" | "y"> & {
  originalId: string;
};

const PRIORITY_TERMS = [
  "ai_project_brain_current",
  "dashboard_snapshot",
  "strategy registry",
  "monitoring",
  "analytics",
  "signal",
  "sentinel",
  "components",
  "komponenten",
  "core invest",
  "white swan",
  "agrar",
  "graphify",
  "brain",
];

function loadGraph(root: string, source: "brain" | "dashboard"): { nodes: RankedNode[]; links: RawLink[] } {
  const graphPath = path.join(root, "graphify-out", "graph.json");
  if (!fs.existsSync(graphPath)) return { nodes: [], links: [] };

  const parsed = JSON.parse(fs.readFileSync(graphPath, "utf8")) as GraphData;
  const nodes = parsed.nodes ?? [];
  const links = parsed.links ?? [];
  const degreeMap = new Map<string, number>();
  for (const link of links) {
    degreeMap.set(link.source, (degreeMap.get(link.source) ?? 0) + 1);
    degreeMap.set(link.target, (degreeMap.get(link.target) ?? 0) + 1);
  }

  const isRelevantNode = (node: RawNode) => {
    const sourceFile = (node.source_file ?? "").replace(/\\/g, "/").toLowerCase();
    if (!sourceFile) return false;
    if (source === "dashboard") {
      return sourceFile.startsWith("src/") || sourceFile.startsWith("docs/");
    }
    if (sourceFile.includes("/.venv") || sourceFile.includes("/node_modules/") || sourceFile.includes("/jupyter/")) {
      return false;
    }
    return (
      sourceFile.includes("/04_strategies/") ||
      sourceFile.includes("/07_technology/") ||
      sourceFile.includes("/09_ai/") ||
      sourceFile.includes("/00_index/")
    );
  };

  const rankedPool: RankedNode[] = nodes
    .filter((node) => isRelevantNode(node))
    .map((node) => ({
      id: `${source}:${node.id}`,
      originalId: node.id,
      label: node.label,
      fileType: node.file_type ?? null,
      sourceFile: node.source_file ?? null,
      sourceLocation: node.source_location ?? null,
      degree: degreeMap.get(node.id) ?? 0,
      community: node.community ?? null,
      source,
    }))
    .filter((node) => node.degree > 0);

  const byId = new Map(rankedPool.map((node) => [node.originalId, node]));
  const neighbors = new Map<string, Set<string>>();
  for (const link of links) {
    if (!neighbors.has(link.source)) neighbors.set(link.source, new Set());
    if (!neighbors.has(link.target)) neighbors.set(link.target, new Set());
    neighbors.get(link.source)!.add(link.target);
    neighbors.get(link.target)!.add(link.source);
  }

  const scoreNode = (node: RankedNode) => {
    const file = (node.sourceFile ?? "").toLowerCase();
    const label = node.label.toLowerCase();
    let score = node.degree * 3;
    for (const term of PRIORITY_TERMS) {
      if (file.includes(term) || label.includes(term)) score += 120;
    }
    if (source === "brain") score += 18;
    if (file.includes("09_ai") || file.includes("07_technology") || file.includes("04_strategies")) score += 32;
    if (file.includes("src/") || file.includes("components/") || file.includes("api/")) score += 24;
    return score;
  };

  const seeds = [...rankedPool]
    .sort((a, b) => scoreNode(b) - scoreNode(a))
    .slice(0, source === "brain" ? 130 : 95);

  const selected = new Map<string, RankedNode>(seeds.map((node) => [node.originalId, node]));

  for (const seed of seeds) {
    const nearby = [...(neighbors.get(seed.originalId) ?? [])]
      .map((id) => byId.get(id))
      .filter((node): node is RankedNode => Boolean(node))
      .sort((a, b) => scoreNode(b) - scoreNode(a))
      .slice(0, seed.degree >= 20 ? 5 : 2);
    for (const neighbor of nearby) selected.set(neighbor.originalId, neighbor);
  }

  const filtered = [...selected.values()]
    .sort((a, b) => scoreNode(b) - scoreNode(a))
    .slice(0, source === "brain" ? 430 : 240);

  const included = new Set(filtered.map((node) => node.originalId));
  const scopedLinks = links.filter((link) => included.has(link.source) && included.has(link.target)).slice(0, source === "brain" ? 1200 : 680);

  return {
    nodes: filtered,
    links: scopedLinks,
  };
}

function positionNodes(nodes: RankedNode[]): NetworkNode[] {
  const sorted = [...nodes].sort((a, b) => b.degree - a.degree);
  const centerX = 800;
  const centerY = 540;
  const maxRadius = 430;
  const golden = Math.PI * (3 - Math.sqrt(5));

  const hash = (value: string) => {
    let result = 0;
    for (let index = 0; index < value.length; index += 1) {
      result = (result * 31 + value.charCodeAt(index)) % 9973;
    }
    return result;
  };

  return sorted.map((node, index) => {
    const normalized = index / Math.max(sorted.length - 1, 1);
    const communityOffset = ((node.community ?? 0) % 11) * 0.12;
    const angle = index * golden + communityOffset;
    const radiusBase = Math.pow(normalized, 0.72) * maxRadius;
    const jitter = (hash(node.id) % 35) - 17;
    const hubPull = Math.min(150, node.degree * 2.1);
    const radius = Math.max(14, radiusBase + jitter - hubPull * 0.34);
    const stretch = 0.90 + ((hash(node.label) % 11) * 0.014);
    const { originalId: _originalId, ...rest } = node;
    return {
      ...rest,
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius * stretch,
    };
  });
}

export const dynamic = "force-dynamic";

export function GET() {
  const brainRoot = getCapitalifeBrainPath();
  if (!brainRoot) {
    return NextResponse.json({ nodes: [], links: [], message: "CAPITALIFE_BRAIN_PATH missing" });
  }
  const brain = loadGraph(brainRoot, "brain");
  const dashboard = loadGraph(DASHBOARD_ROOT, "dashboard");
  const rankedNodes: RankedNode[] = [...brain.nodes, ...dashboard.nodes];
  const nodes = positionNodes(rankedNodes);

  const nodeLookup = new Map(
    rankedNodes.map((node) => [node.originalId, node.id]),
  );

  const links = [...brain.links, ...dashboard.links].map((link) => ({
    source: nodeLookup.get(link.source) ?? link.source,
    target: nodeLookup.get(link.target) ?? link.target,
  }));

  return NextResponse.json({ nodes, links });
}
