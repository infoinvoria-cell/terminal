export const runtime = "edge";
import { NextResponse } from "next/server";
import type { NewsItem, NewsResponse } from "@/lib/globe/globe-types";

// Map globe asset IDs to good Yahoo Finance search terms
const ASSET_QUERY_MAP: Record<string, string> = {
  gold: "gold price XAU",
  silver: "silver price XAG",
  copper: "copper price commodity",
  platinum: "platinum price",
  palladium: "palladium price",
  crude: "crude oil WTI price",
  brent: "brent oil price",
  natgas: "natural gas price",
  corn: "corn price grain",
  wheat: "wheat price grain",
  soybeans: "soybean price",
  cocoa: "cocoa price commodity",
  coffee: "coffee price commodity",
  sugar: "sugar price commodity",
  cotton: "cotton price commodity",
  btcusd: "Bitcoin BTC",
  ethusd: "Ethereum ETH",
  solusd: "Solana SOL",
  xrpusd: "XRP Ripple",
  eurusd: "EUR USD euro dollar",
  gbpusd: "GBP USD pound dollar",
  usdjpy: "USD JPY yen dollar",
  usdchf: "USD CHF Swiss franc",
  sp500: "S&P 500 stock market",
  nasdaq: "Nasdaq 100 tech stocks",
  dax: "DAX Germany stocks",
  nikkei: "Nikkei Japan stocks",
  us10y: "US Treasury 10 year yield",
  aapl: "Apple AAPL",
  nvda: "NVIDIA NVDA",
  msft: "Microsoft MSFT",
  tsla: "Tesla TSLA",
};

async function fetchYahooNews(query: string): Promise<NewsItem[]> {
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=0&newsCount=10&enableFuzzyQuery=false&enableCb=false&enableNavLinks=false`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
    next: { revalidate: 600 },
  });
  if (!res.ok) return [];
  const json = (await res.json()) as { news?: Array<{ uuid: string; title: string; publisher: string; link: string; providerPublishTime: number }> };
  return (json.news ?? []).map((n) => ({
    newsId: n.uuid,
    title: n.title,
    source: n.publisher,
    url: n.link,
    publishedAt: new Date(n.providerPublishTime * 1000).toISOString(),
  }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await params;
  const query = ASSET_QUERY_MAP[assetId] ?? assetId;
  try {
    const items = await fetchYahooNews(query);
    items.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
    const response: NewsResponse = { updatedAt: new Date().toISOString(), items: items.slice(0, 12) };
    return NextResponse.json(response, {
      headers: { "Cache-Control": "public, max-age=600, stale-while-revalidate=3600" },
    });
  } catch {
    return NextResponse.json({ updatedAt: new Date().toISOString(), items: [] } satisfies NewsResponse);
  }
}
