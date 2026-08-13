export const runtime = "edge";
import { NextRequest, NextResponse } from "next/server";
// Symbol map sourced from the unified asset registry — no local copy needed.
// NOTE: edge runtime cannot import from asset-registry.ts (Node-only deps),
// so we maintain a minimal edge-safe copy here that mirrors the registry.
// When adding assets, update both asset-registry.ts AND this map.
const ASSET_TV_MAP: Record<string, string> = {
  // Intraday MT
  eurusd_30m: "CME:6E1!",   gbpusd_30m: "CME:6B1!",
  dax_1h: "EUREX:FDAX1!",   dax_2h: "EUREX:FDAX1!",
  // White Swan
  gld_etf: "NYSE:GLD",      gld_ci: "NYSE:GLD",
  gc1: "COMEX:GC1!",        ym1: "CME_MINI:YM1!",
  nq1: "CME_MINI:NQ1!",     ct1: "ICEEUR:CT1!",
  ukx: "TVC:UKX",
  // Core Invest
  qqq: "BATS:QQQ",          spmo: "BATS:SPMO",
  spy: "BATS:SPY",           hg1: "COMEX:HG1!",
  "6s1": "CME:6S1!",        glgg: "LSE:GLGG",    fiw: "BATS:FIW",
  // CME Forex Futures
  "6e1": "CME:6E1!",        "6b1": "CME:6B1!",
  "6j1": "CME:6J1!",        "6s1_fx": "CME:6S1!",
  "6a1": "CME:6A1!",        "6c1": "CME:6C1!",
  // Macro
  dxy: "TVC:DXY",           vix: "TVC:VIX",
  tnx: "TVC:US10Y",         us2y: "TVC:US02Y",
  // Major FX
  usdjpy: "OANDA:USDJPY",   audusd: "OANDA:AUDUSD",
  usdcad: "OANDA:USDCAD",   nzdusd: "OANDA:NZDUSD",
  usdchf_fx: "OANDA:USDCHF",
  // Cross Pairs
  eurgbp_fx: "OANDA:EURGBP", eurjpy_fx: "OANDA:EURJPY",
  gbpjpy_fx: "OANDA:GBPJPY", audcad_fx: "OANDA:AUDCAD",
  eurchf_fx: "OANDA:EURCHF", usdmxn_fx: "OANDA:USDMXN",
  usdzar_fx: "OANDA:USDZAR", usdtry_fx: "OANDA:USDTRY",
  // Indices
  sp500_idx: "CME_MINI:ES1!", nasdaq_idx: "CME_MINI:NQ1!",
  dow_idx: "CME_MINI:YM1!",  russell2k: "CME_MINI:RTY1!",
  dax_idx: "EUREX:FDAX1!",   cac40_idx: "EURONEXT:CAC40",
  eurostoxx_idx: "EUREX:FESX1!", nikkei_idx: "OSE:NK225",
  hsi_idx: "HKEX:HSI",       asx200_idx: "ASX:XJO",
  // Stocks
  aapl: "BATS:AAPL",         msft: "BATS:MSFT",
  nvda: "BATS:NVDA",         tsla: "BATS:TSLA",
  meta_s: "BATS:META",       amzn: "BATS:AMZN",
  googl: "BATS:GOOGL",       jpm: "NYSE:JPM",
  bac: "NYSE:BAC",           gs: "NYSE:GS",
  xom: "NYSE:XOM",           cvx: "NYSE:CVX",
  tsm: "NYSE:TSM",           sap_de: "XETR:SAP",
  // Metals
  silver: "COMEX:SI1!",      platinum: "NYMEX:PL1!",
  palladium: "NYMEX:PA1!",   copper_spot: "COMEX:HG1!",
  // Energy
  crude: "NYMEX:CL1!",       brent: "NYMEX:BB1!",
  natgas: "NYMEX:NG1!",      heating_oil: "NYMEX:HO1!",
  gasoline: "NYMEX:RB1!",    uranium: "NYSE:URA",
  // Agriculture
  corn_f: "CBOT:ZC1!",       wheat_f: "CBOT:ZW1!",
  soybean_f: "CBOT:ZS1!",    coffee_f: "ICEUS:KC1!",
  cocoa_f: "ICEUS:CC1!",     sugar_f: "ICEUS:SB1!",
  oj_f: "ICEUS:OJ1!",        cattle_f: "CME:LE1!",
  hogs_f: "CME:HE1!",        lumber_f: "CME:LBS1!",
  // Bonds
  zb1: "CBOT:ZB1!",          zn1: "CBOT:ZN1!",
  // Legacy aliases
  gold: "COMEX:GC1!",        copper: "COMEX:HG1!",
  sp500: "CME_MINI:ES1!",    nasdaq: "CME_MINI:NQ1!",
  dax: "EUREX:FDAX1!",       eurusd: "CME:6E1!",
  gbpusd: "CME:6B1!",        usdchf: "OANDA:USDCHF",
};

const INTRADAY_TF_MAP: Record<string, Record<string, string>> = {
  eurusd_30m: { "1H": "OANDA_EURUSD_30M", "4H": "OANDA_EURUSD_30M" },
  gbpusd_30m: { "1H": "OANDA_GBPUSD_30M", "4H": "OANDA_GBPUSD_30M" },
  dax_1h: { "1H": "OANDA_DE30EUR_1H", "4H": "OANDA_DE30EUR_1H" },
  dax_2h: { "1H": "OANDA_DE30EUR_2H", "4H": "OANDA_DE30EUR_2H" },
};

function tvSourceToFilename(tvSource: string, tf: string): string {
  const cleaned = tvSource.replace(/!/g, "").replace(/:/g, "_");
  return `${cleaned}_${tf}.json`;
}

type LocalBar = {
  time?: number | null;
  date?: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

type LocalCacheFile = {
  bars?: LocalBar[];
};

function barToOhlcv(bar: LocalBar) {
  const t = bar.date
    ? new Date(bar.date).toISOString()
    : bar.time
      ? new Date(bar.time * 1000).toISOString()
      : new Date().toISOString();
  return {
    t,
    open: +Number(bar.open).toFixed(4),
    high: +Number(bar.high).toFixed(4),
    low: +Number(bar.low).toFixed(4),
    close: +Number(bar.close).toFixed(4),
    volume: Math.round(Number(bar.volume ?? 0)),
  };
}

async function tryLocalOhlc(assetId: string, tf: string, baseUrl: string) {
  const intradayOverride = INTRADAY_TF_MAP[assetId]?.[tf];
  if (intradayOverride) {
    const url = `${baseUrl}/generated/monitoring/tradingview_data_cache/${tf}/${intradayOverride}.json`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout?.(3000) });
      if (res.ok) {
        const data = (await res.json()) as LocalCacheFile;
        if (data?.bars?.length) return data.bars;
      }
    } catch { /* fallthrough */ }
  }

  const tvSource = ASSET_TV_MAP[assetId.toLowerCase()];
  if (!tvSource) return null;

  const filename = tvSourceToFilename(tvSource, tf);
  const url = `${baseUrl}/generated/monitoring/tradingview_data_cache/${tf}/${filename}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout?.(3000) });
    if (!res.ok) return null;
    const data = (await res.json()) as LocalCacheFile;
    return data?.bars?.length ? data.bars : null;
  } catch {
    return null;
  }
}

async function trySupabaseOhlc(assetId: string, tf: string): Promise<LocalBar[] | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (!url.startsWith("https://") || !key) return null;
  const tvSource = ASSET_TV_MAP[assetId.toLowerCase()];
  const sym = tvSource ? (tvSource.includes(":") ? tvSource.split(":").pop()! : tvSource) : assetId.toUpperCase();
  try {
    const q = `${url}/rest/v1/monitoring_ohlc?asset=eq.${encodeURIComponent(sym)}&timeframe=eq.${encodeURIComponent(tf)}&select=date,open,high,low,close,volume&order=date.asc&limit=500`;
    const res = await fetch(q, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout?.(4000),
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as LocalBar[];
    return Array.isArray(rows) && rows.length ? rows : null;
  } catch {
    return null;
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ assetId: string }> },
) {
  const { assetId } = await params;
  const tf = (req.nextUrl.searchParams.get("tf") ?? "D").toUpperCase();

  const origin = req.nextUrl.origin;

  // Priority chain: local TV cache → Supabase monitoring_ohlc
  // Yahoo Finance is NOT used — no external third-party price data.
  const localBars = await tryLocalOhlc(assetId, tf, origin);
  if (localBars?.length) {
    const tail = localBars.slice(-500);
    return NextResponse.json({
      assetId,
      symbol: assetId.toUpperCase(),
      source: "local_cache",
      status: "delayed",
      delayMinutes: 15,
      updatedAt: new Date().toISOString(),
      ohlcv: tail.map(barToOhlcv),
      supplyDemand: { demand: [], supply: [] },
    }, {
      headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=600" },
    });
  }

  const supabaseBars = await trySupabaseOhlc(assetId, tf);
  if (supabaseBars?.length) {
    return NextResponse.json({
      assetId,
      symbol: assetId.toUpperCase(),
      source: "supabase_ohlc",
      status: "delayed",
      delayMinutes: 15,
      updatedAt: new Date().toISOString(),
      ohlcv: supabaseBars.map(barToOhlcv),
      supplyDemand: { demand: [], supply: [] },
    }, {
      headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=600" },
    });
  }

  // No data available — return empty, never synthetic/fabricated prices.
  return NextResponse.json({
    assetId,
    symbol: assetId.toUpperCase(),
    source: "unavailable",
    status: "unavailable",
    delayMinutes: null,
    updatedAt: new Date().toISOString(),
    ohlcv: [],
    supplyDemand: { demand: [], supply: [] },
  }, {
    status: 200,
    headers: { "Cache-Control": "public, max-age=30" },
  });
}
