export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { queryGraph, getGraphStats } from "@/lib/sentinel/graphify-retrieval";
import path from "path";
import fs from "fs";

function readBrainFile(relPath: string): string | null {
  const brainPath = process.env.CAPITALIFE_BRAIN_PATH?.trim();
  if (!brainPath) return null;
  try {
    const full = path.join(brainPath, relPath);
    if (!fs.existsSync(full)) return null;
    return fs.readFileSync(full, "utf-8");
  } catch {
    return null;
  }
}

const BRAIN_SEARCH_FILES = [
  "09_AI/AI_PROJECT_BRAIN_CURRENT.md",
  "00_Index/Open Issues.md",
  "00_Index/Next Actions.md",
  "00_Index/Changelog.md",
  "09_AI/Live_Track_Record.md",
];

function searchBrainFiles(query: string, maxResults = 5): { file: string; snippet: string; score: number }[] {
  const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
  const results: { file: string; snippet: string; score: number }[] = [];

  for (const relPath of BRAIN_SEARCH_FILES) {
    const content = readBrainFile(relPath);
    if (!content) continue;

    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!.toLowerCase();
      const matchCount = terms.filter((t) => line.includes(t)).length;
      if (matchCount === 0) continue;

      const start = Math.max(0, i - 1);
      const end = Math.min(lines.length - 1, i + 2);
      const snippet = lines.slice(start, end + 1).join("\n").slice(0, 300);
      results.push({ file: relPath, snippet, score: matchCount / terms.length });
    }
  }

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query") ?? searchParams.get("q") ?? "";
  const maxNodes = parseInt(searchParams.get("maxNodes") ?? "10", 10);

  if (!query.trim()) {
    const stats = getGraphStats();
    return NextResponse.json({
      message: "Pass ?query= to search the graph and Brain",
      graphStats: stats,
      brainAvailable: !!process.env.CAPITALIFE_BRAIN_PATH?.trim(),
    });
  }

  const [graphResult, brainResults] = await Promise.all([
    Promise.resolve(queryGraph({ query, maxNodes })),
    Promise.resolve(searchBrainFiles(query)),
  ]);

  return NextResponse.json({
    query,
    graph: {
      nodeCount: graphResult.nodes.length,
      summary: graphResult.summary,
      tokenEstimate: graphResult.tokenEstimate,
    },
    brain: {
      resultCount: brainResults.length,
      results: brainResults,
    },
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json() as { query?: string; maxNodes?: number };
  const query = body.query ?? "";
  const maxNodes = body.maxNodes ?? 10;

  if (!query.trim()) {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }

  const graphResult = queryGraph({ query, maxNodes });
  const brainResults = searchBrainFiles(query);

  return NextResponse.json({
    query,
    graph: {
      nodeCount: graphResult.nodes.length,
      summary: graphResult.summary,
      tokenEstimate: graphResult.tokenEstimate,
      nodes: graphResult.nodes.slice(0, maxNodes),
    },
    brain: {
      resultCount: brainResults.length,
      results: brainResults,
    },
  });
}
