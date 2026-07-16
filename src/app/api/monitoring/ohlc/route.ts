import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const MANIFEST_PATH = path.join(
  process.cwd(),
  "public",
  "generated",
  "monitoring",
  "tradingview_data_cache",
  "cache_manifest_full.json",
);

const PUBLIC_DIR = path.join(process.cwd(), "public");

type ManifestAsset = {
  asset?: string;
  source?: string;
  tab?: string;
  timeframe?: string;
  status?: string;
  cachePath?: string;
  legacyCachePath?: string;
  barCount?: number;
  firstDate?: string | null;
  lastDate?: string | null;
  lastClose?: number | null;
  stale?: boolean;
};

type CacheBar = {
  time?: string | number | null;
  date?: string | null;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  close?: number | null;
  volume?: number | null;
};

function normalizeTimeframe(tf: string): string {
  const t = String(tf || "D").trim().toUpperCase();
  if (t === "1D" || t === "DAY" || t === "DAILY") return "D";
  return t;
}

function normalizeDay(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/u.test(d) ? d : null;
}

function parseBars(rawBars: CacheBar[]): Array<{ time: string; open: number; high: number; low: number; close: number; volume?: number }> {
  const out = [];
  for (const row of rawBars) {
    const time = normalizeDay(row?.date ?? null) ?? normalizeDay(String(row?.time ?? ""));
    const open = Number(row?.open);
    const high = Number(row?.high);
    const low = Number(row?.low);
    const close = Number(row?.close);
    if (!time || !Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) continue;
    const entry: { time: string; open: number; high: number; low: number; close: number; volume?: number } = { time, open, high, low, close };
    if (row?.volume != null && Number.isFinite(Number(row.volume))) entry.volume = Number(row.volume);
    out.push(entry);
  }
  return out.sort((a, b) => a.time.localeCompare(b.time));
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const rawSymbol = searchParams.get("symbol") ?? "";
  const rawTimeframe = searchParams.get("timeframe") ?? "D";
  const maxBarsParam = searchParams.get("maxBars");

  if (!rawSymbol) {
    return NextResponse.json({ error: "Missing required parameter: symbol" }, { status: 400 });
  }

  const symbolUpper = rawSymbol.trim().toUpperCase();
  const tf = normalizeTimeframe(rawTimeframe);
  const maxBars = maxBarsParam ? Math.max(1, Math.min(10000, parseInt(maxBarsParam, 10) || 5000)) : 5000;

  if (!fs.existsSync(MANIFEST_PATH)) {
    return NextResponse.json({ error: "Cache manifest not found", symbol: symbolUpper, timeframe: tf }, { status: 503 });
  }

  let manifestAsset: ManifestAsset | null = null;
  try {
    const manifestRaw = fs.readFileSync(MANIFEST_PATH, "utf-8");
    const manifest = JSON.parse(manifestRaw) as { assets?: ManifestAsset[] };
    const assets = Array.isArray(manifest?.assets) ? manifest.assets : [];
    // Prefer real tab entries over Dependency entries (same asset key, different source/tab)
    const realFirst = [...assets.filter((a) => a.tab !== "Dependency"), ...assets.filter((a) => a.tab === "Dependency")];
    manifestAsset = realFirst.find((a) =>
      (String(a.asset || "").toUpperCase() === symbolUpper || String(a.source || "").toUpperCase().endsWith(`:${symbolUpper}`))
      && normalizeTimeframe(String(a.timeframe || "D")) === tf,
    ) ?? null;
  } catch {
    return NextResponse.json({ error: "Failed to parse manifest", symbol: symbolUpper, timeframe: tf }, { status: 500 });
  }

  if (!manifestAsset) {
    return NextResponse.json({ error: "Symbol not found in manifest", symbol: symbolUpper, timeframe: tf, status: "not_found" }, { status: 404 });
  }

  // Try primary cachePath, then legacyCachePath
  const candidates = [manifestAsset.cachePath, manifestAsset.legacyCachePath].filter(Boolean) as string[];
  let cacheFilePath: string | null = null;
  for (const candidate of candidates) {
    const cleanPath = candidate.startsWith("public/") ? candidate.slice("public/".length) : candidate;
    const abs = path.join(PUBLIC_DIR, cleanPath);
    if (fs.existsSync(abs)) {
      cacheFilePath = abs;
      break;
    }
  }

  if (!cacheFilePath) {
    return NextResponse.json({
      error: "Cache file not on disk",
      symbol: symbolUpper,
      timeframe: tf,
      status: "missing_file",
      triedPaths: candidates,
    }, { status: 404 });
  }

  let allBars;
  try {
    const raw = fs.readFileSync(cacheFilePath, "utf-8");
    const cacheJson = JSON.parse(raw) as { bars?: CacheBar[] };
    allBars = parseBars(Array.isArray(cacheJson.bars) ? cacheJson.bars : []);
  } catch {
    return NextResponse.json({ error: "Failed to parse cache file", symbol: symbolUpper, timeframe: tf }, { status: 500 });
  }

  const bars = maxBars > 0 ? allBars.slice(-maxBars) : allBars;

  return NextResponse.json({
    symbol: symbolUpper,
    source: manifestAsset.source ?? null,
    timeframe: tf,
    barCount: bars.length,
    firstDate: bars[0]?.time ?? null,
    lastDate: bars[bars.length - 1]?.time ?? null,
    lastClose: bars[bars.length - 1]?.close ?? null,
    stale: Boolean(manifestAsset.stale),
    manifestStatus: manifestAsset.status ?? null,
    bars,
  });
}
