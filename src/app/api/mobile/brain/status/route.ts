import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import type { MobileBrainStatus } from "@/lib/mobile/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse<MobileBrainStatus>> {
  const brainPath = process.env.CAPITALIFE_BRAIN_PATH?.trim() || null;

  if (!brainPath) {
    return NextResponse.json({
      available: false,
      pathConfigured: false,
      nodeCount: null,
      linkCount: null,
      lastUpdated: null,
      graphifyStatus: "missing",
    });
  }

  const graphPath = path.join(brainPath, "graphify-out", "graph.json");
  let nodeCount: number | null = null;
  let linkCount: number | null = null;
  let lastUpdated: string | null = null;
  let graphifyStatus: "available" | "partial" | "missing" = "missing";

  try {
    if (fs.existsSync(graphPath)) {
      const stat = fs.statSync(graphPath);
      lastUpdated = stat.mtime.toISOString();
      const raw = fs.readFileSync(graphPath, "utf-8");
      const graph = JSON.parse(raw) as { nodes?: unknown[]; links?: unknown[] };
      nodeCount = Array.isArray(graph.nodes) ? graph.nodes.length : null;
      linkCount = Array.isArray(graph.links) ? graph.links.length : null;
      graphifyStatus = nodeCount && nodeCount > 0 ? "available" : "partial";
    }
  } catch {
    graphifyStatus = "partial";
  }

  return NextResponse.json({
    available: graphifyStatus === "available",
    pathConfigured: true,
    nodeCount,
    linkCount,
    lastUpdated,
    graphifyStatus,
  });
}
