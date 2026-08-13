import { NextResponse } from "next/server";
import { buildSystemGraph } from "@/lib/brain-graph/system-graph";
import { getEntityHref } from "@/lib/navigation/entity-resolver";

/**
 * GET /api/system-graph
 *
 * Returns the Capitalife system entity graph for Sentinel and other consumers.
 * Sentinel must use this endpoint — NOT scrape the rendered Brain UI.
 *
 * Response shape:
 *   nodes[]      — canonical system entities with navigationActions, metadata, health
 *   links[]      — structured lineage / relationship edges
 *   resolver     — spot-check of canonical entity → surface URL mappings
 *   nodeIndex    — Record<nodeId, node> for O(1) lookup
 */
export async function GET() {
  const graph = buildSystemGraph();

  // Build a flat index for fast Sentinel lookup
  const nodeIndex = Object.fromEntries(graph.nodes.map((n) => [n.id, n]));

  // Resolver spot-check: prove canonical entities resolve correctly
  const resolverCheck = {
    "DAX2H → ENGINE":                     getEntityHref("DAX2H", "ENGINE"),
    "DAX1H → ENGINE":                     getEntityHref("DAX1H", "ENGINE"),
    "EUR30M → ENGINE":                    getEntityHref("EUR30M", "ENGINE"),
    "trend_momentum_dax_2h → ENGINE":   getEntityHref("trend_momentum_dax_2h", "ENGINE"),
    "mt_dax_1h → ENGINE":              getEntityHref("mt_dax_1h", "ENGINE"),
    "eurusd_mt_30m → ENGINE":          getEntityHref("eurusd_mt_30m", "ENGINE"),
    "trend_momentum_dax_2h → SIGNALS":  getEntityHref("trend_momentum_dax_2h", "SIGNALS"),
    "eurusd_mt_30m → MONITORING":      getEntityHref("eurusd_mt_30m", "MONITORING"),
    "white_swan → ANALYTICS":          getEntityHref("white_swan", "ANALYTICS"),
    "core_invest → ANALYTICS":         getEntityHref("core_invest", "ANALYTICS"),
  };

  return NextResponse.json({
    contractVersion: "2026-08-11.system-graph.v2",
    nodeCount: graph.nodes.length,
    linkCount: graph.links.length,
    nodes: graph.nodes,
    links: graph.links,
    nodeIndex,
    resolverCheck,
    meta: {
      source: "system-graph",
      supabasePollution: false,
      description: "Capitalife canonical system entity graph — use this endpoint for Sentinel access. Do not scrape Brain UI.",
      supportsStructuredAgentQueries: true,
    },
  });
}

export async function POST() {
  return NextResponse.json({ error: "read only" }, { status: 405 });
}
