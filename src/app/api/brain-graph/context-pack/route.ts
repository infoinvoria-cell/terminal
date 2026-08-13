export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const BRAIN_FILES = [
  { relPath: "09_AI/AI_PROJECT_BRAIN_CURRENT.md", label: "AI Project Brain", maxChars: 8000 },
  { relPath: "09_AI/dashboard_snapshot.json", label: "Dashboard Snapshot", maxChars: 6000 },
  { relPath: "00_Index/Open Issues.md", label: "Offene Issues", maxChars: 3000 },
  { relPath: "00_Index/Next Actions.md", label: "Nächste Aktionen", maxChars: 3000 },
  { relPath: "09_AI/Live_Track_Record.md", label: "Live Track Record", maxChars: 3000 },
];

function readSafe(filePath: string, maxChars: number): string | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, "utf-8");
    return content.length > maxChars ? content.slice(0, maxChars) + "\n...[truncated]" : content;
  } catch {
    return null;
  }
}

function relevanceScore(content: string, terms: string[]): number {
  const lower = content.toLowerCase();
  return terms.reduce((sum, term) => {
    const count = (lower.match(new RegExp(term.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length;
    return sum + count;
  }, 0);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { query?: string; maxTokens?: number };
    const query = body.query ?? "";
    const maxTokens = body.maxTokens ?? 4000;
    const maxChars = maxTokens * 3.5;

    const brainPath = process.env.CAPITALIFE_BRAIN_PATH?.trim();
    if (!brainPath) {
      return NextResponse.json({ error: "Brain path not configured", context: "", sources: [], tokenEstimate: 0 }, { status: 503 });
    }

    const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
    const parts: { label: string; content: string; score: number }[] = [];

    for (const { relPath, label, maxChars: fileMaxChars } of BRAIN_FILES) {
      const content = readSafe(path.join(brainPath, relPath), fileMaxChars);
      if (!content?.trim()) continue;
      const score = terms.length > 0 ? relevanceScore(content, terms) : 1;
      parts.push({ label, content, score });
    }

    parts.sort((a, b) => b.score - a.score);

    const sources: string[] = [];
    let contextParts: string[] = [];
    let totalChars = 0;

    for (const { label, content } of parts) {
      if (totalChars + content.length > maxChars) break;
      contextParts.push(`### ${label}\n${content}`);
      sources.push(label);
      totalChars += content.length;
    }

    const context = contextParts.join("\n\n---\n\n");
    return NextResponse.json({ context, sources, tokenEstimate: Math.ceil(context.length / 3.5) });
  } catch {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }
}

export async function GET() {
  return NextResponse.json({ error: "Use POST with { query, maxTokens }" }, { status: 405 });
}
