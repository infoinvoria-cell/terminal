export const runtime = "edge";
import { NextResponse } from "next/server";
import type { NewsItem, NewsResponse } from "@/lib/globe/globe-types";

const QUERIES = ["global financial markets", "commodities oil gold", "central bank inflation"];

async function fetchYahooNews(query: string): Promise<NewsItem[]> {
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=0&newsCount=8&enableFuzzyQuery=false&enableCb=false&enableNavLinks=false&enableEnhancedTrivialQuery=false`;
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
    category: "macro" as const,
  }));
}

export async function GET() {
  try {
    const results = await Promise.allSettled(QUERIES.map(fetchYahooNews));
    const seen = new Set<string>();
    const items: NewsItem[] = [];
    for (const r of results) {
      if (r.status === "fulfilled") {
        for (const item of r.value) {
          if (!seen.has(item.url)) {
            seen.add(item.url);
            items.push(item);
          }
        }
      }
    }
    items.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
    const response: NewsResponse = { updatedAt: new Date().toISOString(), items: items.slice(0, 20) };
    return NextResponse.json(response, {
      headers: { "Cache-Control": "public, max-age=600, stale-while-revalidate=3600" },
    });
  } catch {
    return NextResponse.json({ updatedAt: new Date().toISOString(), items: [] } satisfies NewsResponse);
  }
}
