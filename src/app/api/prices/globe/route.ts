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

  try {
    // Yahoo v8 spark: one request, many symbols. The v7 /quote endpoint is
    // rate-limited/blocked from shared edge IPs; v8 spark/chart is reliable.
    const url = `https://query1.finance.yahoo.com/v8/finance/spark?symbols=${symbols.map(encodeURIComponent).join(",")}&range=1d&interval=1d&indicators=close&includeTimestamps=false`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "application/json",
        Referer: "https://finance.yahoo.com/",
      },
      signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined,
    });
    if (!res.ok) throw new Error(`Yahoo ${res.status}`);
    // Spark returns a flat object keyed by symbol:
    // { "GC=F": { close: [..], chartPreviousClose, previousClose }, ... }
    const data = (await res.json()) as Record<string, {
      symbol?: string;
      close?: Array<number | null>;
      chartPreviousClose?: number | null;
      previousClose?: number | null;
    }>;

    const prices: Record<string, number | null> = {};
    const changes: Record<string, number | null> = {};
    for (const [sym, entry] of Object.entries(data ?? {})) {
      if (!entry || typeof entry !== "object") continue;
      const closes = Array.isArray(entry.close) ? entry.close.filter((v): v is number => typeof v === "number" && Number.isFinite(v)) : [];
      const price = closes.length ? closes[closes.length - 1] : null;
      const prevClose = typeof entry.chartPreviousClose === "number" ? entry.chartPreviousClose
        : typeof entry.previousClose === "number" ? entry.previousClose : null;
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
