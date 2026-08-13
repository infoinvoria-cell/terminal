// Read-only Graphify code graph retrieval for Sentinel context
// The graph.json is a code dependency graph of the Capitalife Terminal codebase
import fs from "fs";
import path from "path";

type GraphNode = { id: string; label?: string; type?: string; file?: string; [key: string]: unknown };
type GraphLink = { source: string; target: string; type?: string };
type GraphData = { nodes: GraphNode[]; links?: GraphLink[]; edges?: GraphLink[] };

let graphCache: GraphData | null = null;

function tryPaths(): string[] {
  return [
    path.join(process.cwd(), "graphify-out", "graph.json"),
    path.join(process.cwd(), "..", "graphify-out", "graph.json"),
  ];
}

function loadGraph(): GraphData {
  if (graphCache) return graphCache;
  for (const p of tryPaths()) {
    try {
      if (!fs.existsSync(p)) continue;
      const raw = fs.readFileSync(p, "utf-8");
      const parsed = JSON.parse(raw) as GraphData;
      if (Array.isArray(parsed.nodes)) {
        graphCache = parsed;
        return graphCache;
      }
    } catch { /* try next */ }
  }
  graphCache = { nodes: [], links: [] };
  return graphCache;
}

export type GraphQueryResult = {
  nodes: GraphNode[];
  summary: string;
  tokenEstimate: number;
};

export function queryGraph(opts: {
  query: string;
  maxNodes?: number;
  tokenBudget?: number;
}): GraphQueryResult {
  const { query, maxNodes = 15, tokenBudget = 2000 } = opts;
  const graph = loadGraph();
  const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 1);

  const scored = graph.nodes
    .map((node) => {
      const label = (node.label ?? node.id ?? "").toLowerCase();
      const file = (node.file ?? "").toLowerCase();
      const score = terms.reduce((sum, term) => {
        return sum + (label.includes(term) ? 2 : 0) + (file.includes(term) ? 1 : 0);
      }, 0);
      return { node, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxNodes);

  const nodes = scored.map(({ node }) => node);

  const lines = nodes.map((n) => {
    const name = n.label ?? n.id ?? "?";
    const type = n.type ? ` [${n.type}]` : "";
    const file = n.file ? ` — ${n.file}` : "";
    return `- ${name}${type}${file}`;
  });

  let summary = lines.length > 0
    ? `## Codebase Kontext (${lines.length} Treffer für "${query}")\n${lines.join("\n")}`
    : `## Codebase Kontext\nKeine Treffer für "${query}" im Code-Graph gefunden.`;

  const tokenEstimate = Math.ceil(summary.length / 3.5);
  if (tokenEstimate > tokenBudget) {
    const charBudget = tokenBudget * 3.5;
    summary = summary.slice(0, charBudget) + "\n...[truncated]";
  }

  return { nodes, summary, tokenEstimate: Math.ceil(summary.length / 3.5) };
}

export function getGraphStats(): { nodeCount: number; linkCount: number; available: boolean } {
  try {
    const graph = loadGraph();
    const links = graph.links ?? graph.edges ?? [];
    return {
      nodeCount: graph.nodes.length,
      linkCount: links.length,
      available: graph.nodes.length > 0,
    };
  } catch {
    return { nodeCount: 0, linkCount: 0, available: false };
  }
}

export function getGraphContext(query: string, tokenBudget = 2000): string {
  const { summary } = queryGraph({ query, tokenBudget });
  return summary;
}
