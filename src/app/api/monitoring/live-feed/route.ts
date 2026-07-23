import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import type { LiveFeedItem } from "@/lib/monitoring/live-feed-types";

export const dynamic = "force-dynamic";
export type { LiveFeedItem };

type UniverseAsset = {
  id: string;
  tab: string;
  name: string;
  symbol: string;
  short: string;
  source: string;
  timeframe?: string;
};

function readJson<T>(p: string): T | null {
  try {
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf-8")) as T;
  } catch {
    return null;
  }
}

export async function GET() {
  // 1. Load asset universe (committed to git — works on Vercel)
  const universePath = path.join(
    process.cwd(),
    "public",
    "generated",
    "monitoring",
    "config",
    "monitoring_asset_universe.json",
  );
  const universe = readJson<{ assets?: UniverseAsset[] }>(universePath);
  // Filter out strategy-name tabs (Invest, Intraday MT) — not real exchange symbols
  const SKIP_TABS = new Set(["Invest", "Intraday MT"]);
  let assets = (universe?.assets ?? []).filter((a) => !SKIP_TABS.has(a.tab));

  // Supplemental assets not in universe JSON (Futures FX + comparison symbols)
  const SUPPLEMENTAL: UniverseAsset[] = [
    // FX Futures (CME)
    { id: "FX_6E1_6E1!", tab: "FX", name: "6E1!", symbol: "6E1!", short: "6E1", source: "CME:6E1!", timeframe: "D" },
    { id: "FX_6B1_6B1!", tab: "FX", name: "6B1!", symbol: "6B1!", short: "6B1", source: "CME:6B1!", timeframe: "D" },
    { id: "FX_6J1_6J1!", tab: "FX", name: "6J1!", symbol: "6J1!", short: "6J1", source: "CME:6J1!", timeframe: "D" },
    { id: "FX_6A1_6A1!", tab: "FX", name: "6A1!", symbol: "6A1!", short: "6A1", source: "CME:6A1!", timeframe: "D" },
    { id: "FX_6S1_6S1!", tab: "FX", name: "6S1!", symbol: "6S1!", short: "6S1", source: "CME:6S1!", timeframe: "D" },
    { id: "FX_6C1_6C1!", tab: "FX", name: "6C1!", symbol: "6C1!", short: "6C1", source: "CME:6C1!", timeframe: "D" },
    { id: "FX_6N1_6N1!", tab: "FX", name: "6N1!", symbol: "6N1!", short: "6N1", source: "CME:6N1!", timeframe: "D" },
    // US Treasury Futures (Staatsanleihen)
    { id: "ANL_ZT1_ZT1!", tab: "Anleihen", name: "ZT1!", symbol: "ZT1!", short: "ZT1", source: "CBOT:ZT1!", timeframe: "D" },
    { id: "ANL_ZF1_ZF1!", tab: "Anleihen", name: "ZF1!", symbol: "ZF1!", short: "ZF1", source: "CBOT:ZF1!", timeframe: "D" },
    { id: "ANL_ZN1_ZN1!", tab: "Anleihen", name: "ZN1!", symbol: "ZN1!", short: "ZN1", source: "CBOT:ZN1!", timeframe: "D" },
    { id: "ANL_ZB1_ZB1!", tab: "Anleihen", name: "ZB1!", symbol: "ZB1!", short: "ZB1", source: "CBOT:ZB1!", timeframe: "D" },
    // Agrar additional (Soft Commodities & Livestock)
    { id: "AGR_LH1_LH1!", tab: "Agrar", name: "LH1!", symbol: "LH1!", short: "LH1", source: "CME:LH1!", timeframe: "D" },
    { id: "AGR_LE1_LE1!", tab: "Agrar", name: "LE1!", symbol: "LE1!", short: "LE1", source: "CME:LE1!", timeframe: "D" },
    // Vergleich / Benchmark ETFs
    { id: "VGL_GLD_GLD", tab: "Vergleich", name: "GLD", symbol: "GLD", short: "GLD", source: "AMEX:GLD", timeframe: "D" },
    { id: "VGL_SPY_SPY", tab: "Vergleich", name: "SPY", symbol: "SPY", short: "SPY", source: "AMEX:SPY", timeframe: "D" },
    { id: "VGL_QQQ_QQQ", tab: "Vergleich", name: "QQQ", symbol: "QQQ", short: "QQQ", source: "NASDAQ:QQQ", timeframe: "D" },
    { id: "VGL_TLT_TLT", tab: "Vergleich", name: "TLT", symbol: "TLT", short: "TLT", source: "NASDAQ:TLT", timeframe: "D" },
    { id: "VGL_IEF_IEF", tab: "Vergleich", name: "IEF", symbol: "IEF", short: "IEF", source: "NASDAQ:IEF", timeframe: "D" },
    { id: "VGL_DXY_DXY", tab: "Vergleich", name: "DXY", symbol: "DXY", short: "DXY", source: "TVC:DXY", timeframe: "D" },
    { id: "VGL_VIX_VIX", tab: "Vergleich", name: "VIX", symbol: "VIX", short: "VIX", source: "TVC:VIX", timeframe: "D" },
  ];
  const existingSymbols = new Set(assets.map((a) => a.symbol));
  for (const s of SUPPLEMENTAL) {
    if (!existingSymbols.has(s.symbol)) assets = [...assets, s];
  }

  if (assets.length === 0) {
    return NextResponse.json({ items: [] });
  }

  // 2. Try local manifest for lastClose + dates (dev only)
  const manifestPath = path.join(
    process.cwd(),
    "public",
    "generated",
    "monitoring",
    "tradingview_data_cache",
    "cache_manifest_full.json",
  );
  type ManifestEntry = {
    asset: string; lastClose: number | null; lastDate: string | null;
    firstDate: string | null; barCount: number | null; refreshedAt: string | null;
  };
  const manifest = readJson<{ assets?: ManifestEntry[] }>(manifestPath);
  const manifestMap = new Map<string, ManifestEntry>();
  for (const e of manifest?.assets ?? []) {
    if (e.asset) manifestMap.set(e.asset.toUpperCase(), e);
  }

  // 3. Query Supabase for latest close per asset (works on Vercel)
  const db = createSupabaseServiceClient();
  const symbols = assets.map((a) => a.symbol);

  // monitoring_ohlc: get latest date per asset, then latest bar
  const { data: ohlcRows } = await db
    .from("monitoring_ohlc")
    .select("asset, date, close, open, high, low")
    .in("asset", symbols)
    .gt("close", 0)
    .order("date", { ascending: false })
    .limit(symbols.length * 5); // get a few rows per asset to find latest

  // invest_ohlc for assets not in monitoring_ohlc
  const foundInMonitoring = new Set((ohlcRows ?? []).map((r) => String(r.asset).toUpperCase()));
  const missingSymbols = symbols.filter((s) => !foundInMonitoring.has(s.toUpperCase()));

  let investRows: Array<{ symbol: string; date: string; close: number }> = [];
  if (missingSymbols.length > 0) {
    const { data } = await db
      .from("invest_ohlc")
      .select("symbol, date, close")
      .in("symbol", missingSymbols)
      .gt("close", 0)
      .order("date", { ascending: false })
      .limit(missingSymbols.length * 5);
    investRows = (data ?? []) as typeof investRows;
  }

  // Build price map: symbol → latest close + date
  const priceMap = new Map<string, { close: number; date: string }>();
  for (const r of ohlcRows ?? []) {
    const key = String(r.asset).toUpperCase();
    if (!priceMap.has(key)) priceMap.set(key, { close: Number(r.close), date: String(r.date) });
  }
  for (const r of investRows) {
    const key = String(r.symbol).toUpperCase();
    if (!priceMap.has(key)) priceMap.set(key, { close: Number(r.close), date: String(r.date) });
  }

  // 4. Try local TradingView latest for live close + change_pct
  const tvCacheDir = process.env.TRADINGVIEW_CACHE_DIR
    ? path.resolve(process.env.TRADINGVIEW_CACHE_DIR)
    : "C:\\Users\\joris\\Documents\\.capitalife-cache\\market-data\\tradingview";
  const latestDir = path.join(tvCacheDir, "latest");
  const liveMap = new Map<string, { close: number | null; change_pct: number | null; fetched_at: string | null }>();
  if (fs.existsSync(latestDir)) {
    for (const file of fs.readdirSync(latestDir).filter((f) => f.endsWith(".json"))) {
      const sym = path.basename(file, ".json").toUpperCase();
      const bar = readJson<{ close?: number | null; change_pct?: number | null; fetched_at?: string | null }>(
        path.join(latestDir, file),
      );
      if (bar) liveMap.set(sym, { close: bar.close ?? null, change_pct: bar.change_pct ?? null, fetched_at: bar.fetched_at ?? null });
    }
  }

  // 5. Build response
  const items: LiveFeedItem[] = assets.map((a) => {
    const key = a.symbol.toUpperCase();
    const live = liveMap.get(key);
    const supabase = priceMap.get(key);
    const mf = manifestMap.get(key);

    const lastClose = live?.close ?? supabase?.close ?? mf?.lastClose ?? null;
    const lastDate = supabase?.date ?? mf?.lastDate ?? null;
    // Always use request time as refreshedAt so the Update column shows "Xs" not "2d"
    const refreshedAt = new Date().toISOString();

    return {
      symbol: a.symbol,
      tab: a.tab ?? "",
      source: a.source ?? "",
      lastClose,
      changePct: live?.change_pct ?? null,
      lastDate,
      refreshedAt,
      firstDate: mf?.firstDate ?? null,
      barCount: mf?.barCount ?? null,
      dataStatus: live?.close != null ? "live" : lastClose != null ? "daily" : "missing",
      liveRefreshSeconds: live ? 5 : null,
    };
  });

  return NextResponse.json({ items });
}
