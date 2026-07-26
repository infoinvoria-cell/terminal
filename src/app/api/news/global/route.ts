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

// ── RSS aggregation (keyless, multi-source) ─────────────────────

// Free finance/markets RSS feeds. allSettled tolerates any that block/fail.
const RSS_FEEDS = [
  "https://feeds.marketwatch.com/marketwatch/topstories/",
  "https://feeds.marketwatch.com/marketwatch/marketpulse/",
  "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114",
  "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=15839069",
  "https://www.investing.com/rss/news.rss",
  "https://www.nasdaq.com/feed/rssoutbound?category=Markets",
  "https://finance.yahoo.com/news/rssindex",
  "https://www.handelsblatt.com/contentexport/feed/finanzen",
];

function decodeXml(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .trim();
}
function xmlTag(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decodeXml(m[1]) : "";
}
function domainOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}
function safeIso(raw: string): string {
  if (!raw) return new Date().toISOString();
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

async function fetchRss(feedUrl: string): Promise<NewsItem[]> {
  try {
    const res = await fetch(feedUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "application/rss+xml, application/xml, text/xml, */*",
      },
      signal: AbortSignal.timeout ? AbortSignal.timeout(7000) : undefined,
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const blocks = xml.match(/<item[\s\S]*?<\/item>|<entry[\s\S]*?<\/entry>/gi) ?? [];
    const out: NewsItem[] = [];
    for (const b of blocks) {
      const title = xmlTag(b, "title");
      if (!title) continue;
      let link = xmlTag(b, "link");
      if (!link) {
        const m = b.match(/<link[^>]*href="([^"]+)"/i);
        link = m ? m[1] : "";
      }
      const dateRaw = xmlTag(b, "pubDate") || xmlTag(b, "published") || xmlTag(b, "updated") || xmlTag(b, "dc:date");
      const ts = safeIso(dateRaw);
      const domain = domainOf(link);
      out.push({
        newsId: link || title,
        title,
        source: domain,
        url: link,
        publishedAt: ts,
        timestamp: ts,
        sourceDomain: domain,
        description: xmlTag(b, "description") || xmlTag(b, "summary"),
      });
    }
    return out;
  } catch {
    return [];
  }
}

const NEWSAPI_QUERIES = ["global economy markets", "commodities oil gold prices", "geopolitics trade"];

function normKey(item: NewsItem): string {
  return (item.url || item.title || "").toLowerCase().replace(/[?#].*$/, "").trim();
}

export async function GET() {
  try {
    // Fetch every source in parallel — NewsAPI (if key), all RSS feeds, Yahoo.
    const tasks: Promise<NewsItem[]>[] = [];
    if (NEWS_API_KEY) tasks.push(...NEWSAPI_QUERIES.map((q) => fetchNewsApi(q, 10)));
    tasks.push(...RSS_FEEDS.map((f) => fetchRss(f)));
    tasks.push(
      fetchYahooNews("global markets economy", 12)
        .then((list) => list.filter((r) => r.title).map((r, i) => yahooToNewsItem(r, i)))
        .catch(() => []),
    );

    const results = await Promise.allSettled(tasks);
    const seen = new Set<string>();
    const items: NewsItem[] = [];
    for (const r of results) {
      if (r.status !== "fulfilled") continue;
      for (const item of r.value) {
        if (!item.title) continue;
        const key = normKey(item);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        items.push(item);
      }
    }

    // Newest first.
    items.sort((a, b) => String(b.publishedAt ?? "").localeCompare(String(a.publishedAt ?? "")));

    // Cap per source so no single feed (e.g. Yahoo's index) drowns the others,
    // keeping the mix diverse while preserving newest-first order.
    const MAX_PER_SOURCE = 6;
    const perSource = new Map<string, number>();
    const balanced: NewsItem[] = [];
    for (const item of items) {
      const dom = String(item.sourceDomain || item.source || "other");
      const n = perSource.get(dom) ?? 0;
      if (n >= MAX_PER_SOURCE) continue;
      perSource.set(dom, n + 1);
      balanced.push(item);
      if (balanced.length >= 40) break;
    }

    const response: NewsResponse = { updatedAt: new Date().toISOString(), items: balanced };
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
