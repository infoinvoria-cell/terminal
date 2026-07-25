export const runtime = "edge";
import { NextResponse } from "next/server";

const ASSET_SYMBOL_MAP: Record<string, string> = {
  gld_etf: "GLD",
  gld_ci: "GLD",
  gc1: "GC=F",
  ym1: "YM=F",
  nq1: "NQ=F",
  ct1: "CT=F",
  ukx: "^FTSE",
  eurusd_30m: "EURUSD=X",
  gbpusd_30m: "GBPUSD=X",
  dax_1h: "^GDAXI",
  dax_2h: "^GDAXI",
  qqq: "QQQ",
  spmo: "SPMO",
  spy: "SPY",
  hg1: "HG=F",
  "6s1": "CHF=X",
  glgg: "GLGG.L",
  fiw: "FIW",
  btcusd: "BTC-USD",
  ethusd: "ETH-USD",
  dxy: "DX-Y.NYB",
  vix: "^VIX",
  tnx: "^TNX",
  crude: "CL=F",
  brent: "BZ=F",
  natgas: "NG=F",
  silver: "SI=F",
};

type YahooQuoteResult = {
  symbol?: string;
  regularMarketPrice?: number;
  regularMarketChangePercent?: number;
  regularMarketPreviousClose?: number;
};

type YahooQuoteResponse = {
  quoteResponse?: { result?: YahooQuoteResult[] };
};

export type GlobePriceEntry = {
  price: number | null;
  changePercent: number | null;
};

export async function GET() {
  const symbolToIds: Record<string, string[]> = {};
  for (const [id, sym] of Object.entries(ASSET_SYMBOL_MAP)) {
    if (!symbolToIds[sym]) symbolToIds[sym] = [];
    symbolToIds[sym].push(id);
  }
  const symbols = Object.keys(symbolToIds);

  // Yahoo v8 chart per symbol — spark & v7/quote are blocked from shared edge
  // IPs, but the v8 chart endpoint is reliable. Fetch each symbol in parallel.
  async function fetchOne(sym: string): Promise<{ sym: string; price: number | null; prevClose: number | null }> {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=1d&interval=1d`;
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
        signal: AbortSignal.timeout ? AbortSignal.timeout(7000) : undefined,
      });
      if (!res.ok) return { sym, price: null, prevClose: null };
      const data = await res.json() as {
        chart?: { result?: Array<{ meta?: { regularMarketPrice?: number; chartPreviousClose?: number; previousClose?: number } }> };
      };
      const meta = data?.chart?.result?.[0]?.meta;
      const price = typeof meta?.regularMarketPrice === "number" ? meta.regularMarketPrice : null;
      const prevClose = typeof meta?.chartPreviousClose === "number" ? meta.chartPreviousClose
        : typeof meta?.previousClose === "number" ? meta.previousClose : null;
      return { sym, price, prevClose };
    } catch {
      return { sym, price: null, prevClose: null };
    }
  }

  try {
    const settled = await Promise.allSettled(symbols.map(fetchOne));

    const prices: Record<string, number | null> = {};
    const changes: Record<string, number | null> = {};
    for (const s of settled) {
      if (s.status !== "fulfilled") continue;
      const { sym, price, prevClose } = s.value;
      const changePct = price != null && prevClose != null && prevClose !== 0
        ? ((price - prevClose) / prevClose) * 100 : null;
      for (const id of symbolToIds[sym] ?? []) {
        prices[id] = price;
        changes[id] = changePct;
      }
    }
    for (const id of Object.keys(ASSET_SYMBOL_MAP)) {
      if (!(id in prices)) prices[id] = null;
      if (!(id in changes)) changes[id] = null;
    }

    return NextResponse.json(
      { updatedAt: new Date().toISOString(), prices, changes },
      { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=120" } },
    );
  } catch {
    const prices: Record<string, null> = {};
    const changes: Record<string, null> = {};
    for (const id of Object.keys(ASSET_SYMBOL_MAP)) {
      prices[id] = null;
      changes[id] = null;
    }
    return NextResponse.json(
      { updatedAt: new Date().toISOString(), prices, changes },
      { headers: { "Cache-Control": "public, max-age=30" } },
    );
  }
}
