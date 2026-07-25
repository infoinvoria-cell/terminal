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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ assetId: string }> },
) {
  const { assetId } = await params;
  const tf = (req.nextUrl.searchParams.get("tf") ?? "D").toUpperCase();

  const origin = req.nextUrl.origin;
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
