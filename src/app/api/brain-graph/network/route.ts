import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";

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

export async function GET() {
  try {
    const db = createSupabaseServiceClient();

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
        { error: nodesRes.error.message, nodes: [], links: [] },
        { status: 200 },
      );
    }

    const rawNodes = (nodesRes.data ?? []) as BrainNodeRow[];
    if (rawNodes.length === 0) {
      return NextResponse.json({
        nodes: [],
        links: [],
        source: "supabase",
        message: "Brain-Graph noch nicht synchronisiert (0 Nodes in Supabase).",
      });
    }

    const nodes = rawNodes.map((n) => ({
      id: n.id,
      label: n.label ?? n.id,
      folder: n.folder ?? "",
      preview: n.preview ?? "",
      degree: Number(n.degree ?? 0),
      community: n.community ?? null,
      source: "brain" as const,
    }));

    // Only keep links whose endpoints both survived the node cap.
    const keep = new Set(nodes.map((n) => n.id));
    const links = ((linksRes.data ?? []) as BrainLinkRow[])
      .filter((l) => keep.has(l.source) && keep.has(l.target));

    return NextResponse.json({
      nodes,
      links,
      source: "supabase",
    });
  } catch (err) {
    return NextResponse.json(
      { error: String(err), nodes: [], links: [] },
      { status: 200 },
    );
  }
}

export async function POST() {
  return NextResponse.json({ error: "read only" }, { status: 405 });
}
