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
};

type YahooQuoteResponse = {
  quoteResponse?: { result?: YahooQuoteResult[] };
};

export async function GET() {
  // Deduplicate symbols and build a symbol→assetId reverse map
  const symbolToIds: Record<string, string[]> = {};
  for (const [id, sym] of Object.entries(ASSET_SYMBOL_MAP)) {
    if (!symbolToIds[sym]) symbolToIds[sym] = [];
    symbolToIds[sym].push(id);
  }
  const symbols = Object.keys(symbolToIds);

  try {
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols.map(encodeURIComponent).join(",")}&fields=regularMarketPrice&formatted=false`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json",
        "Referer": "https://finance.yahoo.com/",
      },
      signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined,
    });
    if (!res.ok) throw new Error(`Yahoo ${res.status}`);
    const data = await res.json() as YahooQuoteResponse;
    const results = data?.quoteResponse?.result ?? [];

    const prices: Record<string, number | null> = {};
    for (const q of results) {
      const sym = q.symbol ?? "";
      const price = typeof q.regularMarketPrice === "number" ? q.regularMarketPrice : null;
      for (const id of (symbolToIds[sym] ?? [])) {
        prices[id] = price;
      }
    }
    // Ensure all asset IDs are represented (null if not fetched)
    for (const id of Object.keys(ASSET_SYMBOL_MAP)) {
      if (!(id in prices)) prices[id] = null;
    }

    return NextResponse.json(
      { updatedAt: new Date().toISOString(), prices },
      { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=120" } },
    );
  } catch {
    const prices: Record<string, null> = {};
    for (const id of Object.keys(ASSET_SYMBOL_MAP)) prices[id] = null;
    return NextResponse.json(
      { updatedAt: new Date().toISOString(), prices },
      { headers: { "Cache-Control": "public, max-age=30" } },
    );
  }
}
