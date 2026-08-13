export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
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

type ChangeEntry = { date: string; summary: string; raw: string };

function parseChangelog(content: string, limit = 20): ChangeEntry[] {
  const entries: ChangeEntry[] = [];
  const lines = content.split("\n");
  let currentDate = "";
  let currentLines: string[] = [];

  const flush = () => {
    if (currentDate && currentLines.length > 0) {
      const raw = currentLines.join("\n").trim();
      const summary = currentLines[0]?.replace(/^[-*#\s]+/, "").slice(0, 120) ?? "";
      entries.push({ date: currentDate, summary, raw: raw.slice(0, 500) });
      currentLines = [];
    }
  };

  for (const line of lines) {
    const dateMatch = line.match(/^##?\s+(\d{4}-\d{2}-\d{2}|\d{1,2}\.\d{1,2}\.\d{4})/);
    if (dateMatch) {
      flush();
      currentDate = dateMatch[1] ?? "";
    } else if (currentDate && line.trim()) {
      currentLines.push(line.trim());
    }
    if (entries.length >= limit) break;
  }
  flush();
  return entries.slice(0, limit);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "10", 10), 50);
  const since = searchParams.get("since") ?? null;

  const changelog = readBrainFile("00_Index/Changelog.md");
  const nextActions = readBrainFile("00_Index/Next Actions.md");

  if (!changelog && !nextActions) {
    return NextResponse.json({
      available: false,
      reason: process.env.CAPITALIFE_BRAIN_PATH?.trim() ? "files_not_found" : "brain_path_not_configured",
      changes: [],
    });
  }

  let changes = changelog ? parseChangelog(changelog, limit) : [];

  if (since) {
    changes = changes.filter((c) => c.date >= since);
  }

  return NextResponse.json({
    available: true,
    changeCount: changes.length,
    changes,
    nextActions: nextActions ? nextActions.split("\n").filter((l) => l.trim() && !l.startsWith("#")).slice(0, 10) : [],
    generatedAt: new Date().toISOString(),
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json() as { since?: string; limit?: number };
  const url = new URL(request.url);
  const syntheticRequest = new Request(url.toString() + "?" + new URLSearchParams({
    since: body.since ?? "",
    limit: String(body.limit ?? 10),
  }), { method: "GET" });
  return GET(new NextRequest(syntheticRequest));
}
