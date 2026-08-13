import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { buildSystemGraph } from "@/lib/brain-graph/system-graph";
import { getFailureRequestId, shouldInjectFailure } from "@/lib/server/capitalife-failure-injection";
import { logServerFailure } from "@/lib/runtime/capitalife-errors";

// Node metadata is synced into Supabase by scripts/sync-brain-to-supabase.mjs
// (labels, folder, degree, community, preview snippet — no raw file content).
type BrainNodeRow = {
  id: string;
  label: string | null;
  folder: string | null;
  preview: string | null;
  degree: number | null;
  community: number | null;
};

type BrainLinkRow = { source: string; target: string };

const NODE_CAP = 5000;
const LINK_CAP = 12000;

export async function GET(request: NextRequest) {
  try {
    if (shouldInjectFailure(request, "brain-api")) {
      throw new Error("BRAIN_API_FAILURE");
    }
    const db = createSupabaseServiceClient();
    const systemGraph = buildSystemGraph();

    const [nodesRes, linksRes] = await Promise.all([
      db.from("brain_nodes")
        .select("id,label,folder,preview,degree,community")
        .order("degree", { ascending: false })
        .limit(NODE_CAP),
      db.from("brain_links")
        .select("source,target")
        .limit(LINK_CAP),
    ]);

    if (nodesRes.error) {
      return NextResponse.json(
        {
          error: nodesRes.error.message,
          contractVersion: "2026-08-11.system-graph.v2",
          nodes: [],
          links: [],
        },
        { status: 200 },
      );
    }
    const rawNodes = (nodesRes.data ?? []) as BrainNodeRow[];

    if (rawNodes.length === 0) {
      // No user Brain data — return system graph only
      return NextResponse.json({
        contractVersion: "2026-08-11.system-graph.v2",
        nodes: systemGraph.nodes,
        links: systemGraph.links,
        source: "system-only",
        meta: {
          systemNodeCount: systemGraph.nodes.length,
          systemLinkCount: systemGraph.links.length,
          mergedUserBrain: false,
        },
        message: "Brain-Graph noch nicht synchronisiert. Zeige Capitalife System-Entities.",
      });
    }

    const brainNodes = rawNodes.map((n) => ({
      id: n.id,
      label: n.label ?? n.id,
      folder: n.folder ?? "",
      preview: n.preview ?? "",
      degree: Number(n.degree ?? 0),
      community: n.community ?? null,
      source: "brain" as const,
    }));

    // Merge: user brain nodes first, then system nodes (system nodes have namespaced IDs — no collisions)
    const allNodes = [...brainNodes, ...systemGraph.nodes];

    // Brain links: only keep those whose endpoints survived the node cap
    const brainIds = new Set(brainNodes.map((n) => n.id));
    const allIds = new Set(allNodes.map((n) => n.id));
    const brainLinks = ((linksRes.data ?? []) as BrainLinkRow[])
      .filter((l) => brainIds.has(l.source) && brainIds.has(l.target));
    const systemLinks = systemGraph.links.filter((l) => allIds.has(l.source) && allIds.has(l.target));

    return NextResponse.json({
      contractVersion: "2026-08-11.system-graph.v2",
      nodes: allNodes,
      links: [...brainLinks, ...systemLinks],
      source: "supabase",
      meta: {
        systemNodeCount: systemGraph.nodes.length,
        systemLinkCount: systemGraph.links.length,
        mergedUserBrain: true,
      },
    });
  } catch (err) {
    logServerFailure({
      route: "/api/brain-graph/network",
      module: "brain-graph-network",
      error: err,
      errorCode: "BRAIN_API_FAILURE",
      requestId: getFailureRequestId(request),
    });
    return NextResponse.json(
      {
        error: String(err),
        contractVersion: "2026-08-11.system-graph.v2",
        nodes: [],
        links: [],
      },
      { status: 200 },
    );
  }
}

export async function POST() {
  return NextResponse.json({ error: "read only" }, { status: 405 });
}
