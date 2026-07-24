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

// Yahoo Finance ticker map — asset key → YF symbol
const YF_TICKER: Record<string, string> = {
  // Stocks
  AAPL: "AAPL", MSFT: "MSFT", GOOGL: "GOOGL", AMZN: "AMZN",
  NVDA: "NVDA", META: "META",
  // Futures
  "GC1!": "GC=F", "SI1!": "SI=F", "PL1!": "PL=F", "PA1!": "PA=F",
  "CL1!": "CL=F", "NG1!": "NG=F", "HG1!": "HG=F", "RB1!": "RB=F",
  "ES1!": "ES=F", "NQ1!": "NQ=F", "YM1!": "YM=F", "FDAX1!": "FDAX1=F",
  "ZC1!": "ZC=F", "ZW1!": "ZW=F", "ZS1!": "ZS=F",
  "CC1!": "CC=F", "KC1!": "KC=F", "SB1!": "SB=F", "CT1!": "CT=F",
  "OJ1!": "OJ=F",
  // FX
  EURUSD: "EURUSD=X", GBPUSD: "GBPUSD=X", USDCHF: "CHF=X",
  EURGBP: "EURGBP=X", GBPJPY: "GBPJPY=X",
  ZARUSD: "ZAR=X", MXNUSD: "MXN=X", SEKUSD: "SEK=X",
  BRLUSD: "BRL=X", CLPUSD: "CLP=X",
};

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

// ── Yahoo Finance gap-fill ────────────────────────────────────────────────────

async function fetchYahooFinanceBars(
  yfTicker: string,
  afterDate: string,
): Promise<Array<{ date: string; open: number; high: number; low: number; close: number }>> {
  try {
    const afterTs = Math.floor(new Date(`${afterDate}T00:00:00Z`).getTime() / 1000) + 86400;
    const nowTs = Math.floor(Date.now() / 1000);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yfTicker)}?interval=1d&period1=${afterTs}&period2=${nowTs}&includePrePost=false`;
    const resp = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) return [];
    const json = await resp.json() as {
      chart?: {
        result?: Array<{
          timestamp?: number[];
          indicators?: {
            quote?: Array<{
              open?: (number | null)[];
              high?: (number | null)[];
              low?: (number | null)[];
              close?: (number | null)[];
            }>;
          };
        }>;
      };
    };
    const result = json?.chart?.result?.[0];
    const timestamps = result?.timestamp ?? [];
    const q = result?.indicators?.quote?.[0];
    if (!timestamps.length || !q) return [];
    const bars = [];
    for (let i = 0; i < timestamps.length; i++) {
      const ts = timestamps[i];
      if (!ts) continue;
      const date = new Date(ts * 1000).toISOString().slice(0, 10);
      const open = q.open?.[i] ?? null;
      const high = q.high?.[i] ?? null;
      const low = q.low?.[i] ?? null;
      const close = q.close?.[i] ?? null;
      if (!date || open == null || high == null || low == null || close == null) continue;
      if (close <= 0 || open <= 0) continue;
      bars.push({ date, open, high, low, close });
    }
    return bars;
  } catch {
    return [];
  }
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

  const assets = (manifest.assets ?? []).filter(
    (a) => a.tab !== "Dependency" && String(a.timeframe || "D").toUpperCase() === "D",
  );

  const db = createSupabaseServiceClient();
  const results: Array<{
    asset: string;
    tvcBarsAdded: number;
    yfBarsAdded: number;
    lastDate: string | null;
    error?: string;
  }> = [];

  let totalAdded = 0;

  for (const entry of assets) {
    const assetKey = String(entry.asset || "").toUpperCase();
    if (!assetKey) continue;
    if (onlyAsset && assetKey !== onlyAsset) continue;

    let tvcAdded = 0;
    let yfAdded = 0;
    let entryError: string | undefined;

    try {
      // ── Phase 1: TVC cache sync ───────────────────────────────────────────
      const candidates = [entry.cachePath, entry.legacyCachePath].filter(Boolean) as string[];
      let cacheFilePath: string | null = null;
      for (const c of candidates) {
        const clean = c.startsWith("public/") ? c.slice(7) : c;
        const abs = path.join(PUBLIC_DIR, clean);
        if (fs.existsSync(abs)) { cacheFilePath = abs; break; }
      }

      let lastDate = await getLastDate(db, assetKey, "D");

      if (cacheFilePath) {
        const raw = JSON.parse(fs.readFileSync(cacheFilePath, "utf-8")) as { bars?: CacheBar[] };
        const newBars = parseTvcBars(Array.isArray(raw.bars) ? raw.bars : [], assetKey, "D", lastDate ?? undefined);
        if (!dryRun && newBars.length) {
          tvcAdded = await upsertRows(db, newBars);
          if (newBars.length) {
            const newest = newBars[newBars.length - 1]?.date;
            if (newest && (!lastDate || newest > lastDate)) lastDate = newest;
          }
        } else {
          tvcAdded = newBars.length;
        }
      }

      // ── Phase 2: Yahoo Finance gap-fill ──────────────────────────────────
      const yfTicker = YF_TICKER[assetKey] ?? null;
      if (yfTicker && lastDate) {
        const today = new Date().toISOString().slice(0, 10);
        // Only fetch if cache is more than 1 day behind today
        if (lastDate < today) {
          const yfBars = await fetchYahooFinanceBars(yfTicker, lastDate);
          if (!dryRun && yfBars.length) {
            const rows: OhlcRow[] = yfBars.map((b) => ({ asset: assetKey, timeframe: "D", ...b }));
            yfAdded = await upsertRows(db, rows);
          } else {
            yfAdded = yfBars.length;
          }
        }
      }

      // Re-read last date after upserts
      const finalLastDate = await getLastDate(db, assetKey, "D");
      totalAdded += tvcAdded + yfAdded;
      results.push({ asset: assetKey, tvcBarsAdded: tvcAdded, yfBarsAdded: yfAdded, lastDate: finalLastDate });
    } catch (e) {
      entryError = String(e);
      results.push({ asset: assetKey, tvcBarsAdded: tvcAdded, yfBarsAdded: yfAdded, lastDate: null, error: entryError });
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
      yf: r.yfBarsAdded,
      latest: r.lastDate,
      ok: r.lastDate === today,
      error: r.error,
    })),
  });
}
