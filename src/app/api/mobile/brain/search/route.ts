import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import type { MobileBrainSearchResult, MobileBrainSearchHit, MobileBrainProjectionManifest, MobileBrainProjectionDoc } from "@/lib/mobile/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── Vault search (local only) ─────────────────────────────────────────────────

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

function searchVault(brainPath: string, query: string, maxResults: number): MobileBrainSearchHit[] {
  const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
  if (!terms.length) return [];
  const raw: { file: string; snippet: string; score: number }[] = [];

  for (const relPath of getVaultFiles(brainPath)) {
    let content: string;
    try { content = fs.readFileSync(path.join(brainPath, relPath), "utf-8"); } catch { continue; }

    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!.toLowerCase();
      const matchCount = terms.filter((t) => line.includes(t)).length;
      if (matchCount === 0) continue;
      const start = Math.max(0, i - 1);
      const end = Math.min(lines.length - 1, i + 2);
      const snippet = lines.slice(start, end + 1).join("\n").slice(0, 300);
      raw.push({ file: relPath, snippet, score: matchCount / terms.length });
    }
  }

  return raw
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map((r) => ({
      id: r.file,
      title: path.basename(r.file, ".md"),
      category: r.file.split("/")[0] ?? "vault",
      snippet: r.snippet,
      score: r.score,
      source: "vault" as const,
    }));
}

// ── Projection search (Vercel-safe) ──────────────────────────────────────────

function searchProjection(query: string, maxResults: number): MobileBrainSearchHit[] {
  const projDir = path.join(process.cwd(), "public", "data", "mobile-brain");
  const manifestPath = path.join(projDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) return [];

  let manifest: MobileBrainProjectionManifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as MobileBrainProjectionManifest;
  } catch { return []; }

  const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
  if (!terms.length) return [];

  const results: MobileBrainSearchHit[] = [];

  for (const entry of manifest.documents) {
    const docPath = path.join(projDir, `${entry.id}.json`);
    if (!fs.existsSync(docPath)) continue;
    let doc: MobileBrainProjectionDoc;
    try { doc = JSON.parse(fs.readFileSync(docPath, "utf-8")) as MobileBrainProjectionDoc; } catch { continue; }

    const lines = doc.content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!.toLowerCase();
      const matchCount = terms.filter((t) => line.includes(t)).length;
      if (matchCount === 0) continue;
      const start = Math.max(0, i - 1);
      const end = Math.min(lines.length - 1, i + 2);
      const snippet = lines.slice(start, end + 1).join("\n").slice(0, 300);
      results.push({
        id: doc.id,
        title: doc.title,
        category: doc.category,
        snippet,
        score: matchCount / terms.length,
        source: "projection",
      });
      break; // one hit per doc in projection search
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, maxResults);
}

// ── Handler ───────────────────────────────────────────────────────────────────

function runSearch(query: string, maxResults: number): MobileBrainSearchResult {
  const brainPath = process.env.CAPITALIFE_BRAIN_PATH?.trim() || null;

  if (brainPath && fs.existsSync(brainPath)) {
    const results = searchVault(brainPath, query, maxResults);
    return { query, resultCount: results.length, source: "vault", results };
  }

  // Vercel / no local vault: search projection
  const results = searchProjection(query, maxResults);
  if (results.length > 0) {
    return { query, resultCount: results.length, source: "projection", results };
  }

  return { query, resultCount: 0, source: "none", results: [] };
}

export async function GET(request: NextRequest): Promise<NextResponse<MobileBrainSearchResult | { error: string }>> {
  const query = request.nextUrl.searchParams.get("q") ?? request.nextUrl.searchParams.get("query") ?? "";
  const maxResults = Math.min(parseInt(request.nextUrl.searchParams.get("max") ?? "8", 10), 20);
  if (!query.trim()) return NextResponse.json({ error: "Pass ?q=<query>" }, { status: 400 });
  return NextResponse.json(runSearch(query.trim(), maxResults));
}

export async function POST(request: NextRequest): Promise<NextResponse<MobileBrainSearchResult | { error: string }>> {
  const body = await request.json().catch(() => ({})) as { q?: string; query?: string; max?: number };
  const query = body.q ?? body.query ?? "";
  const maxResults = Math.min(body.max ?? 8, 20);
  if (!query.trim()) return NextResponse.json({ error: "query is required" }, { status: 400 });
  return NextResponse.json(runSearch(query.trim(), maxResults));
}
