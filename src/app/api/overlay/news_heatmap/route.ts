export const runtime = "edge";
import { NextResponse } from "next/server";

const NEWS_API_KEY = process.env.NEXT_PUBLIC_NEWS_API_KEY ?? "";

export type NewsHeatmapEntry = {
  country: string;
  negativeCount: number;
  score: number;
};

export type NewsHeatmapResponse = {
  updatedAt: string;
  source: string;
  countries: NewsHeatmapEntry[];
};

// Country / city → normalized name (matches MiniWorldMap + GlobeCanvas normalizeCountryName)
const COUNTRY_ALIASES: Record<string, string> = {
  "united states": "united states", "u.s.": "united states", "usa": "united states", "america": "united states", "washington": "united states",
  "united kingdom": "united kingdom", " uk ": "united kingdom", "britain": "united kingdom", "london": "united kingdom",
  "russia": "russia", "moscow": "russia", "kremlin": "russia",
  "china": "china", "beijing": "china",
  "germany": "germany", "berlin": "germany",
  "france": "france", "paris": "france",
  "japan": "japan", "tokyo": "japan",
  "india": "india", "delhi": "india",
  "brazil": "brazil",
  "australia": "australia",
  "canada": "canada",
  "south korea": "south korea", "seoul": "south korea",
  "north korea": "north korea", "pyongyang": "north korea",
  "mexico": "mexico",
  "turkey": "turkey", "ankara": "turkey",
  "iran": "iran", "tehran": "iran",
  "iraq": "iraq", "baghdad": "iraq",
  "ukraine": "ukraine", "kyiv": "ukraine", "kiev": "ukraine",
  "israel": "israel", "jerusalem": "israel", "gaza": "israel",
  "saudi arabia": "saudi arabia", "riyadh": "saudi arabia",
  "egypt": "egypt", "cairo": "egypt",
  "south africa": "south africa",
  "nigeria": "nigeria",
  "indonesia": "indonesia",
  "pakistan": "pakistan",
  "taiwan": "taiwan", "taipei": "taiwan",
  "italy": "italy", "rome": "italy",
  "spain": "spain", "madrid": "spain",
  "poland": "poland", "warsaw": "poland",
  "netherlands": "netherlands",
  "switzerland": "switzerland",
  "sweden": "sweden",
  "norway": "norway",
  "venezuela": "venezuela",
  "argentina": "argentina",
  "yemen": "yemen",
  "syria": "syria",
  "lebanon": "lebanon",
};

const NEGATIVE_WORDS = ["crisis", "war", "conflict", "attack", "sanction", "recession", "crash", "collapse", "threat", "tension", "strike", "protest", "disaster", "warn", "fear", "plunge", "tariff", "invasion", "military"];

function extractCountries(text: string): string[] {
  const lower = ` ${text.toLowerCase()} `;
  const hits = new Set<string>();
  for (const [key, val] of Object.entries(COUNTRY_ALIASES)) {
    if (lower.includes(key)) hits.add(val);
  }
  return [...hits];
}

function negativeWeight(text: string): number {
  const lower = text.toLowerCase();
  let w = 0;
  for (const word of NEGATIVE_WORDS) if (lower.includes(word)) w += 1;
  return w;
}

type NewsApiArticle = { title?: string; description?: string };

async function fetchNewsApi(query: string): Promise<NewsApiArticle[]> {
  if (!NEWS_API_KEY) return [];
  const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&language=en&sortBy=publishedAt&pageSize=100&apiKey=${NEWS_API_KEY}`;
  const res = await fetch(url, { signal: AbortSignal.timeout ? AbortSignal.timeout(9000) : undefined });
  if (!res.ok) return [];
  const data = await res.json() as { articles?: NewsApiArticle[] };
  return data?.articles ?? [];
}

export async function GET() {
  try {
    const articles = await fetchNewsApi("crisis OR war OR conflict OR sanctions OR recession OR geopolitics");
    const countryWeight: Record<string, number> = {};

    for (const a of articles) {
      const text = `${a.title ?? ""} ${a.description ?? ""}`;
      const neg = negativeWeight(text);
      if (neg <= 0) continue;
      for (const country of extractCountries(text)) {
        countryWeight[country] = (countryWeight[country] ?? 0) + neg;
      }
    }

    const maxWeight = Math.max(1, ...Object.values(countryWeight));
    const countries: NewsHeatmapEntry[] = Object.entries(countryWeight)
      .map(([country, weight]) => ({
        country,
        negativeCount: weight,
        score: weight / maxWeight,
      }))
      .sort((a, b) => b.negativeCount - a.negativeCount);

    return NextResponse.json(
      { updatedAt: new Date().toISOString(), source: "newsapi", countries } satisfies NewsHeatmapResponse,
      { headers: { "Cache-Control": "public, max-age=1800, stale-while-revalidate=3600" } },
    );
  } catch {
    return NextResponse.json(
      { updatedAt: new Date().toISOString(), source: "error", countries: [] } satisfies NewsHeatmapResponse,
      { headers: { "Cache-Control": "public, max-age=60" } },
    );
  }
}
