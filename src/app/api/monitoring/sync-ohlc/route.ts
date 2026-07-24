import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { createSupabaseServiceClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min — Vercel Pro limit

// ── Constants ────────────────────────────────────────────────────────────────

const MANIFEST_PATH = path.join(
  process.cwd(),
  "public",
  "generated",
  "monitoring",
  "tradingview_data_cache",
  "cache_manifest_full.json",
);
const PUBLIC_DIR = path.join(process.cwd(), "public");
const UPSERT_CHUNK = 500;

// Data source: TradingView CSV cache only (no Yahoo Finance).

// ── Types ─────────────────────────────────────────────────────────────────────

type ManifestAsset = {
  asset?: string;
  source?: string;
  tab?: string;
  timeframe?: string;
  status?: string;
  cachePath?: string;
  legacyCachePath?: string;
  lastDate?: string | null;
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

type OhlcRow = {
  asset: string;
  timeframe: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number | null;
};

// Extra entries not in the gitignored manifest. Each points a new symbol to an
// existing TVC cache file (FX futures use spot FX as proxy; ZB1! has its own file).
const EXTRA_MANIFEST_ENTRIES: ManifestAsset[] = [
  { asset: "6E1!", tab: "FX", timeframe: "D", cachePath: "public/generated/monitoring/tradingview_data_cache/D/OANDA_EURUSD_D.json" },
  { asset: "6B1!", tab: "FX", timeframe: "D", cachePath: "public/generated/monitoring/tradingview_data_cache/D/OANDA_GBPUSD_D.json" },
  { asset: "6S1!", tab: "FX", timeframe: "D", cachePath: "public/generated/monitoring/tradingview_data_cache/D/OANDA_USDCHF_D.json" },
  { asset: "ZB1!", tab: "Anleihen", timeframe: "D", cachePath: "public/generated/monitoring/tradingview_data_cache/D/CBOT_ZB1_D.json" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeDay(value: string | number | null | undefined): string | null {
  if (value == null) return null;
  const s = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function parseTvcBars(raw: CacheBar[], asset: string, tf: string, afterDate?: string): OhlcRow[] {
  const out: OhlcRow[] = [];
  for (const r of raw) {
    const date = normalizeDay(r.date ?? r.time);
    if (!date) continue;
    if (afterDate && date <= afterDate) continue;
    const open = Number(r.open);
    const high = Number(r.high);
    const low = Number(r.low);
    const close = Number(r.close);
    if (!Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) continue;
    if (close <= 0 || open <= 0) continue;
    const row: OhlcRow = { asset, timeframe: tf, date, open, high, low, close };
    if (r.volume != null && Number.isFinite(Number(r.volume))) row.volume = Number(r.volume);
    out.push(row);
  }
  return out;
}

async function upsertRows(db: ReturnType<typeof createSupabaseServiceClient>, rows: OhlcRow[]): Promise<number> {
  if (!rows.length) return 0;
  let total = 0;
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK);
    const { error } = await db
      .from("monitoring_ohlc")
      .upsert(chunk, { onConflict: "asset,timeframe,date" });
    if (!error) total += chunk.length;
  }
  return total;
}

async function getLastDate(db: ReturnType<typeof createSupabaseServiceClient>, asset: string, tf: string): Promise<string | null> {
  const { data } = await db
    .from("monitoring_ohlc")
    .select("date")
    .eq("asset", asset)
    .eq("timeframe", tf)
    .order("date", { ascending: false })
    .limit(1);
  return (data as Array<{ date: string }> | null)?.[0]?.date?.slice(0, 10) ?? null;
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  return handleSync(req);
}

export async function POST(req: NextRequest) {
  return handleSync(req);
}

async function handleSync(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = req.nextUrl;
  const dryRun = searchParams.get("dry") === "1";
  const onlyAsset = searchParams.get("asset")?.toUpperCase() ?? null;

  if (!fs.existsSync(MANIFEST_PATH)) {
    return NextResponse.json({ error: "cache_manifest_full.json not found — run TVC refresh first" }, { status: 500 });
  }

  let manifest: { assets?: ManifestAsset[] };
  try {
    manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf-8")) as { assets?: ManifestAsset[] };
  } catch {
    return NextResponse.json({ error: "Failed to parse manifest" }, { status: 500 });
  }

  const manifestAssets = (manifest.assets ?? []).filter(
    (a) => a.tab !== "Dependency" && String(a.timeframe || "D").toUpperCase() === "D",
  );
  // Merge extra entries, deduplicating by asset key (manifest wins if same key)
  const manifestKeys = new Set(manifestAssets.map((a) => String(a.asset || "").toUpperCase()));
  const assets = [
    ...manifestAssets,
    ...EXTRA_MANIFEST_ENTRIES.filter((e) => !manifestKeys.has(String(e.asset || "").toUpperCase())),
  ];

  const db = createSupabaseServiceClient();
  const results: Array<{
    asset: string;
    tvcBarsAdded: number;
    lastDate: string | null;
    error?: string;
  }> = [];

  let totalAdded = 0;

  for (const entry of assets) {
    const assetKey = String(entry.asset || "").toUpperCase();
    if (!assetKey) continue;
    if (onlyAsset && assetKey !== onlyAsset) continue;

    let tvcAdded = 0;
    let entryError: string | undefined;

    try {
      // TVC cache sync (only source — no Yahoo Finance)
      const candidates = [entry.cachePath, entry.legacyCachePath].filter(Boolean) as string[];
      let cacheFilePath: string | null = null;
      for (const c of candidates) {
        const clean = c.startsWith("public/") ? c.slice(7) : c;
        const abs = path.join(PUBLIC_DIR, clean);
        if (fs.existsSync(abs)) { cacheFilePath = abs; break; }
      }

      const lastDate = await getLastDate(db, assetKey, "D");

      if (cacheFilePath) {
        const raw = JSON.parse(fs.readFileSync(cacheFilePath, "utf-8")) as { bars?: CacheBar[] };
        const newBars = parseTvcBars(Array.isArray(raw.bars) ? raw.bars : [], assetKey, "D", lastDate ?? undefined);
        if (!dryRun && newBars.length) {
          tvcAdded = await upsertRows(db, newBars);
        } else {
          tvcAdded = newBars.length;
        }
      }

      const finalLastDate = await getLastDate(db, assetKey, "D");
      totalAdded += tvcAdded;
      results.push({ asset: assetKey, tvcBarsAdded: tvcAdded, lastDate: finalLastDate });
    } catch (e) {
      entryError = String(e);
      results.push({ asset: assetKey, tvcBarsAdded: tvcAdded, lastDate: null, error: entryError });
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const upToDate = results.filter((r) => r.lastDate === today);
  const stale = results.filter((r) => r.lastDate && r.lastDate < today);
  const missing = results.filter((r) => !r.lastDate);

  return NextResponse.json({
    ok: true,
    dryRun,
    syncedAt: new Date().toISOString(),
    totalBarsAdded: totalAdded,
    assetsProcessed: results.length,
    upToDate: upToDate.length,
    stale: stale.length,
    missing: missing.length,
    summary: results.map((r) => ({
      asset: r.asset,
      tvc: r.tvcBarsAdded,
      latest: r.lastDate,
      ok: r.lastDate === today,
      error: r.error,
    })),
  });
}
