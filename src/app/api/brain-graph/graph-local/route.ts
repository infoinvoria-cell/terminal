export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { queryGraph, getGraphStats } from "@/lib/sentinel/graphify-retrieval";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query") ?? "";
  const maxNodes = parseInt(searchParams.get("maxNodes") ?? "15", 10);

  if (!query.trim()) {
    const stats = getGraphStats();
    return NextResponse.json({ stats, message: "Pass ?query= to search the graph" });
  }

  const result = queryGraph({ query, maxNodes });
  return NextResponse.json({
    query,
    nodeCount: result.nodes.length,
    summary: result.summary,
    tokenEstimate: result.tokenEstimate,
  });
}
