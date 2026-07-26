export const runtime = "edge";
import { NextRequest, NextResponse } from "next/server";

export interface CountryGeoSnapshot {
  iso: string;
  updatedAt: string;
  index: { symbol: string; price: number | null; changePercent: number | null } | null;
  currency: { pair: string; price: number | null; changePercent: number | null } | null;
  news: Array<{ title: string; url: string; source: string; publishedAt: string }>;
}

async function fetchYahoo(sym: string): Promise<{ price: number | null; changePercent: number | null }> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=1d&interval=1d`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
      signal: AbortSignal.timeout ? AbortSignal.timeout(6000) : undefined,
    });
    if (!res.ok) return { price: null, changePercent: null };
    const data = await res.json() as {
      chart?: { result?: Array<{ meta?: { regularMarketPrice?: number; chartPreviousClose?: number; previousClose?: number } }> };
    };
    const meta = data?.chart?.result?.[0]?.meta;
    const price = typeof meta?.regularMarketPrice === "number" ? meta.regularMarketPrice : null;
    const prev = typeof meta?.chartPreviousClose === "number" ? meta.chartPreviousClose
      : typeof meta?.previousClose === "number" ? meta.previousClose : null;
    const changePercent = price != null && prev != null && prev !== 0
      ? ((price - prev) / prev) * 100 : null;
    return { price, changePercent };
  } catch {
    return { price: null, changePercent: null };
  }
}

async function fetchNews(country: string, apiKey: string): Promise<CountryGeoSnapshot["news"]> {
  if (!apiKey) return [];
  try {
    const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(country)}&language=en&sortBy=publishedAt&pageSize=5&apiKey=${apiKey}`;
    const res = await fetch(url, { signal: AbortSignal.timeout ? AbortSignal.timeout(6000) : undefined });
    if (!res.ok) return [];
    const data = await res.json() as {
      articles?: Array<{ title?: string; url?: string; source?: { name?: string }; publishedAt?: string }>;
    };
    return (data?.articles ?? []).slice(0, 4).map((a) => ({
      title: String(a.title ?? "").slice(0, 120),
      url: String(a.url ?? ""),
      source: String(a.source?.name ?? ""),
      publishedAt: String(a.publishedAt ?? ""),
    }));
  } catch {
    return [];
  }
}

// ISO → { indexSymbol, currencySymbol, countryName }
const COUNTRY_META: Record<string, { indexSym?: string; fxSym?: string; name: string }> = {
  US: { indexSym: "^GSPC",      name: "United States" },
  GB: { indexSym: "^FTSE",      fxSym: "GBPUSD=X",   name: "United Kingdom" },
  DE: { indexSym: "^GDAXI",     fxSym: "EURUSD=X",   name: "Germany" },
  FR: { indexSym: "^FCHI",      fxSym: "EURUSD=X",   name: "France" },
  JP: { indexSym: "^N225",      fxSym: "JPY=X",       name: "Japan" },
  CN: { indexSym: "000001.SS",  fxSym: "CNY=X",       name: "China" },
  IN: { indexSym: "^BSESN",     fxSym: "INR=X",       name: "India" },
  BR: { indexSym: "^BVSP",      fxSym: "BRL=X",       name: "Brazil" },
  CA: { indexSym: "^GSPTSE",    fxSym: "CAD=X",       name: "Canada" },
  AU: { indexSym: "^AXJO",      fxSym: "AUDUSD=X",   name: "Australia" },
  KR: { indexSym: "^KS11",      fxSym: "KRW=X",       name: "South Korea" },
  RU: { indexSym: "IMOEX.ME",   fxSym: "RUB=X",       name: "Russia" },
  MX: { indexSym: "^MXX",       fxSym: "MXN=X",       name: "Mexico" },
  IT: { indexSym: "FTSEMIB.MI", fxSym: "EURUSD=X",   name: "Italy" },
  ES: { indexSym: "^IBEX",      fxSym: "EURUSD=X",   name: "Spain" },
  NL: { indexSym: "^AEX",       fxSym: "EURUSD=X",   name: "Netherlands" },
  CH: { indexSym: "^SSMI",      fxSym: "CHF=X",       name: "Switzerland" },
  SE: { indexSym: "^OMX",       fxSym: "SEK=X",       name: "Sweden" },
  NO: { fxSym: "NOK=X",                               name: "Norway" },
  PL: { indexSym: "^WIG20",     fxSym: "PLN=X",       name: "Poland" },
  TR: { indexSym: "XU100.IS",   fxSym: "TRY=X",       name: "Turkey" },
  ZA: { indexSym: "^JN0U.JO",   fxSym: "ZAR=X",       name: "South Africa" },
  TW: { indexSym: "^TWII",      fxSym: "TWD=X",       name: "Taiwan" },
  SG: { indexSym: "^STI",       fxSym: "SGD=X",       name: "Singapore" },
  HK: { indexSym: "^HSI",                              name: "Hong Kong" },
  ID: { indexSym: "^JKSE",      fxSym: "IDR=X",       name: "Indonesia" },
  TH: { fxSym: "THB=X",                               name: "Thailand" },
  IL: { indexSym: "^TA35",      fxSym: "ILS=X",       name: "Israel" },
  AR: { indexSym: "^MERV",                             name: "Argentina" },
  SA: { indexSym: "^TASI.SR",                          name: "Saudi Arabia" },
  AE: { indexSym: "^DFMGI",                            name: "UAE" },
  AT: { fxSym: "EURUSD=X",                            name: "Austria" },
  BE: { fxSym: "EURUSD=X",                            name: "Belgium" },
  DK: { fxSym: "DKK=X",                               name: "Denmark" },
  PT: { fxSym: "EURUSD=X",                            name: "Portugal" },
  GR: { fxSym: "EURUSD=X",                            name: "Greece" },
  EG: {                                                name: "Egypt" },
  NG: {                                                name: "Nigeria" },
  UA: {                                                name: "Ukraine" },
  IR: {                                                name: "Iran" },
  PK: {                                                name: "Pakistan" },
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ iso: string }> },
) {
  const { iso } = await params;
  const upper = iso.toUpperCase();
  const meta = COUNTRY_META[upper];
  if (!meta) {
    return NextResponse.json({ error: "Unknown ISO" }, { status: 404 });
  }

  const NEWS_API_KEY = process.env.NEXT_PUBLIC_NEWS_API_KEY ?? "";

  const [indexData, fxData, news] = await Promise.all([
    meta.indexSym ? fetchYahoo(meta.indexSym) : Promise.resolve({ price: null, changePercent: null }),
    meta.fxSym   ? fetchYahoo(meta.fxSym)    : Promise.resolve({ price: null, changePercent: null }),
    fetchNews(meta.name, NEWS_API_KEY),
  ]);

  const snapshot: CountryGeoSnapshot = {
    iso: upper,
    updatedAt: new Date().toISOString(),
    index: meta.indexSym ? { symbol: meta.indexSym, ...indexData } : null,
    currency: meta.fxSym ? { pair: meta.fxSym, ...fxData } : null,
    news,
  };

  return NextResponse.json(snapshot, {
    headers: { "Cache-Control": "public, max-age=120, stale-while-revalidate=300" },
  });
}
