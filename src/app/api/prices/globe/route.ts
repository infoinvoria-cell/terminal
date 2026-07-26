export const runtime = "edge";
import { NextResponse } from "next/server";

const ASSET_SYMBOL_MAP: Record<string, string> = {
  // White Swan Portfolio
  gld_etf: "GLD", gld_ci: "GLD", gc1: "GC=F", ym1: "YM=F", nq1: "NQ=F",
  ct1: "CT=F", ukx: "^FTSE",
  // Intraday MT
  eurusd_30m: "EURUSD=X", gbpusd_30m: "GBPUSD=X", dax_1h: "^GDAXI", dax_2h: "^GDAXI",
  // Core Invest
  qqq: "QQQ", spmo: "SPMO", spy: "SPY", hg1: "HG=F", "6s1": "CHF=X",
  glgg: "GLGG.L", fiw: "FIW",
  // Crypto
  btcusd: "BTC-USD", ethusd: "ETH-USD", xrpusd: "XRP-USD",
  solusd: "SOL-USD", adausd: "ADA-USD", dogeusd: "DOGE-USD",
  // Macro
  dxy: "DX-Y.NYB", vix: "^VIX", tnx: "^TNX", us2y: "^IRX",
  // Major FX
  usdjpy: "JPY=X", audusd: "AUDUSD=X", usdcad: "CAD=X",
  nzdusd: "NZDUSD=X", usdchf_fx: "CHF=X",
  // Cross Pairs
  eurgbp_fx: "EURGBP=X", eurjpy_fx: "EURJPY=X", gbpjpy_fx: "GBPJPY=X",
  audcad_fx: "AUDCAD=X", eurchf_fx: "EURCHF=X",
  usdmxn_fx: "MXN=X", usdzar_fx: "ZAR=X", usdtry_fx: "TRY=X",
  // Equities indices
  sp500_idx: "^GSPC", nasdaq_idx: "^IXIC", dow_idx: "^DJI",
  russell2k: "^RUT", dax_idx: "^GDAXI", cac40_idx: "^FCHI",
  eurostoxx_idx: "^STOXX50E", nikkei_idx: "^N225", hsi_idx: "^HSI",
  asx200_idx: "^AXJO", ibex_idx: "^IBEX", mib_idx: "FTSEMIB.MI",
  // Stocks
  aapl: "AAPL", msft: "MSFT", nvda: "NVDA", tsla: "TSLA",
  meta_s: "META", amzn: "AMZN", googl: "GOOGL", jpm: "JPM",
  bac: "BAC", gs: "GS", xom: "XOM", cvx: "CVX", tsm: "TSM", sap_de: "SAP",
  // Metals
  silver: "SI=F", platinum: "PL=F", palladium: "PA=F", copper_spot: "HG=F",
  // Energy
  crude: "CL=F", brent: "BZ=F", natgas: "NG=F",
  heating_oil: "HO=F", gasoline: "RB=F", uranium: "URA",
  // Agriculture
  corn_f: "ZC=F", wheat_f: "ZW=F", soybean_f: "ZS=F",
  coffee_f: "KC=F", cocoa_f: "CC=F", sugar_f: "SB=F",
  oj_f: "OJ=F", cattle_f: "LE=F", hogs_f: "HE=F", lumber_f: "LBS=F",
  // Bonds
  zb1: "ZB=F", zn1: "ZN=F", bund_f: "FGBL=F",
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

  // Yahoo v8 chart per symbol — spark & v7/quote are blocked from shared edge IPs
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
