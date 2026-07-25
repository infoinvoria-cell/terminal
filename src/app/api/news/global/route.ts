export const runtime = "edge";
import { NextResponse } from "next/server";
import type { NewsResponse, NewsItem } from "@/lib/globe/globe-types";

const NEWS_API_KEY = process.env.NEXT_PUBLIC_NEWS_API_KEY ?? "";

// ── NewsAPI.org (preferred when key present) ────────────────────

type NewsApiArticle = {
  title?: string;
  url?: string;
  source?: { name?: string };
  publishedAt?: string;
  description?: string;
  urlToImage?: string;
};

async function fetchNewsApi(query: string, pageSize = 20): Promise<NewsItem[]> {
  if (!NEWS_API_KEY) return [];
  const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&language=en&sortBy=publishedAt&pageSize=${pageSize}&apiKey=${NEWS_API_KEY}`;
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
  thumbnail?: { resolutions?: Array<{ url?: string }> };
};

async function fetchYahooNews(query: string, count = 20): Promise<YahooNewsItem[]> {
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&newsCount=${count}&quotesCount=0&enableFuzzyQuery=false&enableEnhancedTrivialQuery=true`;
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
  return data?.news ?? [];
}

function yahooToNewsItem(item: YahooNewsItem, idx: number): NewsItem {
  const ts = item.providerPublishTime
    ? new Date(item.providerPublishTime * 1000).toISOString()
    : new Date().toISOString();
  const url = String(item.link ?? "");
  const domain = url ? (() => {
    try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
  })() : "";
  return {
    newsId: item.uuid ?? `gn-${idx}`,
    title: String(item.title ?? ""),
    source: String(item.publisher ?? domain),
    url,
    publishedAt: ts,
    timestamp: ts,
    sourceDomain: domain,
  };
}

const GLOBAL_QUERIES = ["global markets", "economy fed", "commodities oil gold"];
const NEWSAPI_QUERIES = ["global economy markets", "commodities oil gold prices", "geopolitics trade"];

export async function GET() {
  try {
    // Prefer NewsAPI.org
    if (NEWS_API_KEY) {
      const results = await Promise.allSettled(
        NEWSAPI_QUERIES.map((q) => fetchNewsApi(q, 12)),
      );
      const seen = new Set<string>();
      const items: NewsItem[] = [];
      for (const r of results) {
        if (r.status !== "fulfilled") continue;
        for (const item of r.value) {
          const key = item.url || item.title;
          if (seen.has(key)) continue;
          seen.add(key);
          items.push(item);
        }
      }
      if (items.length > 0) {
        items.sort((a, b) => (b.publishedAt ?? "") > (a.publishedAt ?? "") ? 1 : -1);
        const response: NewsResponse = { updatedAt: new Date().toISOString(), items: items.slice(0, 30) };
        return NextResponse.json(response, {
          headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=600" },
        });
      }
    }

    // Fallback: Yahoo Finance
    const results = await Promise.allSettled(
      GLOBAL_QUERIES.map((q) => fetchYahooNews(q, 10)),
    );
    const seen = new Set<string>();
    const items: NewsItem[] = [];
    for (const r of results) {
      if (r.status !== "fulfilled") continue;
      for (const [i, raw] of r.value.entries()) {
        const key = raw.uuid ?? raw.link ?? `${i}`;
        if (!raw.title || seen.has(key)) continue;
        seen.add(key);
        items.push(yahooToNewsItem(raw, items.length));
      }
    }
    items.sort((a, b) => (b.publishedAt ?? "") > (a.publishedAt ?? "") ? 1 : -1);
    const response: NewsResponse = { updatedAt: new Date().toISOString(), items: items.slice(0, 30) };
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
