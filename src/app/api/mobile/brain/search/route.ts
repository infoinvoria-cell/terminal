import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import type { MobileBrainSearchResult } from "@/lib/mobile/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Vault file list cache (5-minute TTL)
let vaultCache: string[] | null = null;
let vaultCacheAt = 0;
const CACHE_TTL = 5 * 60 * 1000;

function walkMarkdown(dir: string, brainPath: string, out: string[]) {
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walkMarkdown(full, brainPath, out);
    else if (e.isFile() && e.name.endsWith(".md"))
      out.push(path.relative(brainPath, full).replace(/\\/g, "/"));
  }
}

function getVaultFiles(brainPath: string): string[] {
  const now = Date.now();
  if (vaultCache && now - vaultCacheAt < CACHE_TTL) return vaultCache;
  const files: string[] = [];
  walkMarkdown(brainPath, brainPath, files);
  vaultCache = files;
  vaultCacheAt = now;
  return files;
}

function searchVault(brainPath: string, query: string, maxResults: number) {
  const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
  if (!terms.length) return [];
  const results: { file: string; snippet: string; score: number }[] = [];

  for (const relPath of getVaultFiles(brainPath)) {
    let content: string;
    try {
      content = fs.readFileSync(path.join(brainPath, relPath), "utf-8");
    } catch { continue; }

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

  return results.sort((a, b) => b.score - a.score).slice(0, maxResults);
}

export async function GET(request: NextRequest): Promise<NextResponse<MobileBrainSearchResult | { error: string }>> {
  const query = request.nextUrl.searchParams.get("q") ?? request.nextUrl.searchParams.get("query") ?? "";
  const maxResults = Math.min(parseInt(request.nextUrl.searchParams.get("max") ?? "8", 10), 20);

  if (!query.trim()) {
    return NextResponse.json({ error: "Pass ?q=<query>" }, { status: 400 });
  }

  const brainPath = process.env.CAPITALIFE_BRAIN_PATH?.trim() || null;
  if (!brainPath) {
    return NextResponse.json({ query, resultCount: 0, results: [] });
  }

  const results = searchVault(brainPath, query.trim(), maxResults);
  return NextResponse.json({ query, resultCount: results.length, results });
}

export async function POST(request: NextRequest): Promise<NextResponse<MobileBrainSearchResult | { error: string }>> {
  const body = await request.json().catch(() => ({})) as { q?: string; query?: string; max?: number };
  const query = body.q ?? body.query ?? "";
  const maxResults = Math.min(body.max ?? 8, 20);

  if (!query.trim()) {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }

  const brainPath = process.env.CAPITALIFE_BRAIN_PATH?.trim() || null;
  if (!brainPath) {
    return NextResponse.json({ query, resultCount: 0, results: [] });
  }

  const results = searchVault(brainPath, query.trim(), maxResults);
  return NextResponse.json({ query, resultCount: results.length, results });
}
