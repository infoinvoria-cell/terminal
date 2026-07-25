export const runtime = "edge";
import { NextResponse } from "next/server";
import type { NewsResponse, NewsItem } from "@/lib/globe/globe-types";

const NEWS_API_KEY = process.env.NEXT_PUBLIC_NEWS_API_KEY ?? "";

const ASSET_QUERIES: Record<string, string> = {
  gc1: "gold futures GC1",
  gld_etf: "GLD gold ETF",
  gld_ci: "GLD gold ETF",
  ym1: "Dow Jones YM futures",
  nq1: "Nasdaq NQ futures",
  ct1: "cotton CT1 futures",
  ukx: "FTSE 100 UK index",
  eurusd_30m: "EUR USD euro dollar forex",
  dax_1h: "DAX Germany index",
  dax_2h: "DAX Germany index",
  gbpusd_30m: "GBP USD pound forex",
  qqq: "QQQ Nasdaq ETF",
  spmo: "momentum ETF SPMO",
  spy: "SPY S&P 500 ETF",
  hg1: "copper HG futures",
  "6s1": "Swiss franc USD CHF",
  glgg: "clean water ETF GLGG",
  fiw: "FIW water infrastructure ETF",
  btcusd: "Bitcoin BTC cryptocurrency",
  ethusd: "Ethereum ETH crypto",
  dxy: "US dollar index DXY",
  vix: "VIX volatility fear index",
  tnx: "10-year Treasury yield TNX bond",
  crude: "crude oil WTI CL futures",
  brent: "brent oil UK price",
  natgas: "natural gas NG futures",
  silver: "silver SI futures price",
  gold: "gold price",
  copper: "copper HG price",
  sp500: "S&P 500 index",
  nasdaq: "Nasdaq 100 index",
  dax: "DAX Germany",
  eurusd: "EUR USD forex",
  gbpusd: "GBP USD forex",
  btc: "Bitcoin BTC",
  eth: "Ethereum ETH",
  usdchf: "Swiss franc CHF",
  corn: "corn grain futures",
  wheat: "wheat grain futures",
  soybeans: "soybeans grain futures",
  coffee: "coffee KC futures",
  cocoa: "cocoa CC futures",
  sugar: "sugar SB futures",
  ftse: "FTSE 100 UK",
  dow: "Dow Jones DJIA",
};

// ── NewsAPI.org ─────────────────────────────────────────────────

type NewsApiArticle = {
  title?: string;
  url?: string;
  source?: { name?: string };
  publishedAt?: string;
};

async function fetchNewsApiAsset(query: string): Promise<NewsItem[]> {
  if (!NEWS_API_KEY) return [];
  const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&language=en&sortBy=publishedAt&pageSize=15&apiKey=${NEWS_API_KEY}`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined,
  });
  if (!res.ok) return [];
  const data = await res.json() as { articles?: NewsApiArticle[] };
  return (data?.articles ?? [])
    .filter((a) => a.title && a.title !== "[Removed]")
    .map((a, i) => {
      const articleUrl = String(a.url ?? "");
      const domain = articleUrl ? (() => {
        try { return new URL(articleUrl).hostname.replace(/^www\./, ""); } catch { return ""; }
      })() : "";
      return {
        newsId: `na-${i}`,
        title: String(a.title ?? ""),
        source: String(a.source?.name ?? domain),
        url: articleUrl,
        publishedAt: a.publishedAt ?? new Date().toISOString(),
        timestamp: a.publishedAt ?? new Date().toISOString(),
        sourceDomain: domain,
      };
    });
}

// ── Yahoo Finance fallback ──────────────────────────────────────

type YahooNewsItem = {
  uuid?: string;
  title?: string;
  link?: string;
  publisher?: string;
  providerPublishTime?: number;
};

function yahooToNewsItem(item: YahooNewsItem, idx: number): NewsItem {
  const ts = item.providerPublishTime
    ? new Date(item.providerPublishTime * 1000).toISOString()
    : new Date().toISOString();
  const url = String(item.link ?? "");
  const domain = url ? (() => {
    try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
  })() : "";
  return {
    newsId: item.uuid ?? `an-${idx}`,
    title: String(item.title ?? ""),
    source: String(item.publisher ?? domain),
    url,
    publishedAt: ts,
    timestamp: ts,
    sourceDomain: domain,
  };
}

export async function GET(_req: Request, { params }: { params: Promise<{ assetId: string }> }) {
  const { assetId: rawId } = await params;
  const assetId = String(rawId ?? "").toLowerCase().trim();
  const query = ASSET_QUERIES[assetId] ?? assetId.replace(/_/g, " ");

  try {
    // Prefer NewsAPI.org
    if (NEWS_API_KEY) {
      const items = await fetchNewsApiAsset(query);
      if (items.length > 0) {
        const response: NewsResponse = { updatedAt: new Date().toISOString(), items: items.slice(0, 15) };
        return NextResponse.json(response, {
          headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=600" },
        });
      }
    }

    // Fallback: Yahoo Finance
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&newsCount=15&quotesCount=0&enableFuzzyQuery=false`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json",
        "Referer": "https://finance.yahoo.com/",
      },
      signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined,
    });
    if (!res.ok) throw new Error(`Yahoo ${res.status}`);
    const data = await res.json() as { news?: YahooNewsItem[] };
    const items: NewsItem[] = (data?.news ?? [])
      .filter((n) => n.title)
      .map((n, i) => yahooToNewsItem(n, i))
      .slice(0, 15);
    const response: NewsResponse = { updatedAt: new Date().toISOString(), items };
    return NextResponse.json(response, {
      headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=600" },
    });
  } catch {
    return NextResponse.json(
      { updatedAt: new Date().toISOString(), items: [] } satisfies NewsResponse,
      { headers: { "Cache-Control": "public, max-age=60" } },
    );
  }
}
