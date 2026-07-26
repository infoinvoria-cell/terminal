export const runtime = "edge";
import { NextRequest, NextResponse } from "next/server";

const ASSET_TV_MAP: Record<string, string> = {
  gld_etf: "NYSE:GLD",
  gld_ci: "NYSE:GLD",
  gc1: "COMEX:GC1!",
  ym1: "CME_MINI:YM1!",
  nq1: "CME_MINI:NQ1!",
  ct1: "ICEEUR:CT1!",
  ukx: "TVC:UKX",
  eurusd_30m: "OANDA:EURUSD",
  dax_1h: "EUREX:FDAX1!",
  gbpusd_30m: "OANDA:GBPUSD",
  dax_2h: "EUREX:FDAX1!",
  qqq: "BATS:SPY",
  spmo: "BATS:SPY",
  spy: "BATS:SPY",
  hg1: "COMEX:HG1!",
  "6s1": "CME:6S1!",
  glgg: "BATS:SPY",
  fiw: "BATS:SPY",
  btcusd: "BATS:SPY",
  ethusd: "BATS:SPY",
  dxy: "TVC:DXY",
  vix: "TVC:VIX",
  tnx: "TVC:US10Y",
  crude: "NYMEX:CL1!",
  brent: "NYMEX:BB1!",
  natgas: "NYMEX:NG1!",
  silver: "COMEX:SI1!",
  // Legacy
  gold: "COMEX:GC1!",
  copper: "COMEX:HG1!",
  sp500: "CME_MINI:ES1!",
  nasdaq: "CME_MINI:NQ1!",
  dax: "EUREX:FDAX1!",
  eurusd: "OANDA:EURUSD",
  gbpusd: "OANDA:GBPUSD",
  usdchf: "OANDA:USDCHF",
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

// Yahoo Finance ticker per asset (for on-demand assets not in local cache)
const ASSET_YAHOO_MAP: Record<string, string> = {
  // White Swan Portfolio
  gld_etf: "GLD", gld_ci: "GLD", gc1: "GC=F", ym1: "YM=F", nq1: "NQ=F", ct1: "CT=F", ukx: "^FTSE",
  // Intraday MT
  eurusd_30m: "EURUSD=X", gbpusd_30m: "GBPUSD=X", dax_1h: "^GDAXI", dax_2h: "^GDAXI",
  // Core Invest
  qqq: "QQQ", spmo: "SPMO", spy: "SPY", hg1: "HG=F", "6s1": "CHF=X", glgg: "GLGG.L", fiw: "FIW",
  // Crypto
  btcusd: "BTC-USD", ethusd: "ETH-USD", xrpusd: "XRP-USD", solusd: "SOL-USD", adausd: "ADA-USD", dogeusd: "DOGE-USD",
  // Macro
  dxy: "DX-Y.NYB", vix: "^VIX", tnx: "^TNX", us2y: "^IRX",
  // Major FX
  usdjpy: "JPY=X", audusd: "AUDUSD=X", usdcad: "CAD=X", nzdusd: "NZDUSD=X", usdchf_fx: "CHF=X",
  // Cross Pairs
  eurgbp_fx: "EURGBP=X", eurjpy_fx: "EURJPY=X", gbpjpy_fx: "GBPJPY=X",
  audcad_fx: "AUDCAD=X", eurchf_fx: "EURCHF=X", usdmxn_fx: "MXN=X", usdzar_fx: "ZAR=X", usdtry_fx: "TRY=X",
  // Equities indices
  sp500_idx: "^GSPC", nasdaq_idx: "^IXIC", dow_idx: "^DJI", russell2k: "^RUT",
  dax_idx: "^GDAXI", cac40_idx: "^FCHI", eurostoxx_idx: "^STOXX50E",
  nikkei_idx: "^N225", hsi_idx: "^HSI", asx200_idx: "^AXJO", ibex_idx: "^IBEX", mib_idx: "FTSEMIB.MI",
  // Stocks
  aapl: "AAPL", msft: "MSFT", nvda: "NVDA", tsla: "TSLA",
  meta_s: "META", amzn: "AMZN", googl: "GOOGL", jpm: "JPM",
  bac: "BAC", gs: "GS", xom: "XOM", cvx: "CVX", tsm: "TSM", sap_de: "SAP",
  // Metals
  silver: "SI=F", platinum: "PL=F", palladium: "PA=F", copper_spot: "HG=F",
  // Energy
  crude: "CL=F", brent: "BZ=F", natgas: "NG=F", heating_oil: "HO=F", gasoline: "RB=F", uranium: "URA",
  // Agriculture
  corn_f: "ZC=F", wheat_f: "ZW=F", soybean_f: "ZS=F", coffee_f: "KC=F", cocoa_f: "CC=F",
  sugar_f: "SB=F", oj_f: "OJ=F", cattle_f: "LE=F", hogs_f: "HE=F", lumber_f: "LBS=F",
  // Bonds
  zb1: "ZB=F", zn1: "ZN=F",
  // Legacy
  gold: "GC=F", copper: "HG=F", sp500: "ES=F", nasdaq: "NQ=F", dax: "^GDAXI",
  eurusd: "EURUSD=X", gbpusd: "GBPUSD=X", usdchf: "CHF=X",
};

const YAHOO_RANGE: Record<string, string> = { D: "2y", W: "5y", M: "10y", "4H": "60d", "1H": "30d" };
const YAHOO_INTERVAL: Record<string, string> = { D: "1d", W: "1wk", M: "1mo", "4H": "1h", "1H": "1h" };

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

async function tryYahooOhlc(assetId: string, tf: string): Promise<LocalBar[] | null> {
  // Custom on-demand assets carry their Yahoo ticker in the id: custom_AAPL → AAPL
  const lower = assetId.toLowerCase();
  const sym = lower.startsWith("custom_")
    ? assetId.slice("custom_".length)
    : ASSET_YAHOO_MAP[lower];
  if (!sym) return null;
  const range = YAHOO_RANGE[tf] ?? "2y";
  const interval = YAHOO_INTERVAL[tf] ?? "1d";
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=${range}&interval=${interval}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
      signal: AbortSignal.timeout?.(6000),
    });
    if (!res.ok) return null;
    const data = await res.json() as {
      chart?: { result?: Array<{ timestamp?: number[]; indicators?: { quote?: Array<{ open?: number[]; high?: number[]; low?: number[]; close?: number[]; volume?: number[] }> } }> };
    };
    const r = data?.chart?.result?.[0];
    const ts = r?.timestamp ?? [];
    const q = r?.indicators?.quote?.[0];
    if (!ts.length || !q) return null;
    const bars: LocalBar[] = [];
    for (let i = 0; i < ts.length; i++) {
      const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i];
      if (o == null || h == null || l == null || c == null) continue;
      bars.push({ time: ts[i], open: o, high: h, low: l, close: c, volume: q.volume?.[i] ?? 0 });
    }
    return bars.length ? bars.slice(-500) : null;
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

  // Priority chain: local cache → Supabase monitoring_ohlc → Yahoo Finance → synthetic
  const localBars = await tryLocalOhlc(assetId, tf, origin);
  if (localBars?.length) {
    const tail = localBars.slice(-500);
    return NextResponse.json({
      assetId,
      symbol: assetId.toUpperCase(),
      source: "local_cache",
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
      updatedAt: new Date().toISOString(),
      ohlcv: supabaseBars.map(barToOhlcv),
      supplyDemand: { demand: [], supply: [] },
    }, {
      headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=600" },
    });
  }

  const yahooBars = await tryYahooOhlc(assetId, tf);
  if (yahooBars?.length) {
    return NextResponse.json({
      assetId,
      symbol: assetId.toUpperCase(),
      source: "yahoo_finance",
      updatedAt: new Date().toISOString(),
      ohlcv: yahooBars.map(barToOhlcv),
      supplyDemand: { demand: [], supply: [] },
    }, {
      headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=600" },
    });
  }

  // Fallback: return empty with 80 synthetic bars so the chart isn't blank
  const points = [];
  let price = 100 + Math.random() * 900;
  const now = Date.now();
  for (let i = 79; i >= 0; i--) {
    const t = new Date(now - i * 24 * 60 * 60 * 1000).toISOString();
    const change = (Math.random() - 0.49) * price * 0.018;
    const open = price;
    const close = Math.max(price + change, 1);
    const high = Math.max(open, close) * (1 + Math.random() * 0.008);
    const low = Math.min(open, close) * (1 - Math.random() * 0.008);
    const volume = Math.round(10000 + Math.random() * 90000);
    points.push({ t, open: +open.toFixed(4), high: +high.toFixed(4), low: +low.toFixed(4), close: +close.toFixed(4), volume });
    price = close;
  }

  return NextResponse.json({
    assetId,
    symbol: assetId.toUpperCase(),
    source: "fallback_synthetic",
    updatedAt: new Date().toISOString(),
    ohlcv: points,
    supplyDemand: { demand: [], supply: [] },
  }, {
    headers: { "Cache-Control": "public, max-age=60" },
  });
}
