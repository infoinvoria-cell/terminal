export const runtime = "edge";
import { NextResponse } from "next/server";
import type { GeoEventsResponse, GeoEventItem } from "@/lib/globe/globe-types";

// GDELT geo endpoint (/api/v2/geo/geo) returns 404 (removed) and the DOC API is
// hard rate-limited from shared edge IPs. We use known conflict hotspots with
// live intensity derived from NewsAPI.org (a single request, proven reliable).
const NEWS_API_KEY = process.env.NEXT_PUBLIC_NEWS_API_KEY ?? "";

type ConflictRegion = {
  name: string;
  lat: number;
  lng: number;
  aliases: string[];
};

const CONFLICT_REGIONS: ConflictRegion[] = [
  { name: "Ukraine", lat: 49.0, lng: 32.0, aliases: ["ukraine", "kyiv", "kiev", "donbas", "zaporizhzhia"] },
  { name: "Gaza / Israel", lat: 31.5, lng: 34.5, aliases: ["gaza", "israel", "hamas", "west bank", "idf"] },
  { name: "Lebanon", lat: 33.9, lng: 35.5, aliases: ["lebanon", "beirut", "hezbollah"] },
  { name: "Sudan", lat: 15.5, lng: 32.5, aliases: ["sudan", "khartoum", "darfur"] },
  { name: "Myanmar", lat: 19.0, lng: 96.0, aliases: ["myanmar", "burma", "rakhine"] },
  { name: "Sahel", lat: 14.0, lng: 2.0, aliases: ["sahel", "mali", "niger", "burkina faso"] },
  { name: "Yemen", lat: 15.5, lng: 48.0, aliases: ["yemen", "houthi", "sanaa"] },
  { name: "Somalia", lat: 5.0, lng: 46.0, aliases: ["somalia", "mogadishu", "al-shabaab", "al shabaab"] },
  { name: "Syria", lat: 35.0, lng: 38.5, aliases: ["syria", "damascus", "aleppo"] },
  { name: "Red Sea / Bab-el-Mandeb", lat: 13.5, lng: 43.3, aliases: ["red sea", "bab-el-mandeb", "bab el mandeb"] },
];

const NEGATIVE_WORDS = ["war", "conflict", "attack", "strike", "killed", "clash", "sanction", "invasion", "offensive", "shelling", "airstrike", "militant", "crisis", "escalat", "troops", "missile", "drone"];

function negativeWeight(text: string): number {
  const lower = text.toLowerCase();
  let w = 0;
  for (const word of NEGATIVE_WORDS) if (lower.includes(word)) w += 1;
  return w;
}

function colorFromScore(score: number): string {
  if (score >= 0.66) return "#FF3333"; // high — red
  if (score >= 0.33) return "#f97316"; // medium — orange
  return "#eab308"; // low — yellow
}

function severityFromScore(score: number): string {
  if (score >= 0.66) return "high";
  if (score >= 0.33) return "medium";
  return "low";
}

type NewsApiArticle = { title?: string; description?: string; url?: string; publishedAt?: string };

async function fetchConflictNews(): Promise<NewsApiArticle[]> {
  if (!NEWS_API_KEY) return [];
  const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent("war OR conflict OR attack OR military OR sanctions OR ceasefire")}&language=en&sortBy=publishedAt&pageSize=100&apiKey=${NEWS_API_KEY}`;
  const res = await fetch(url, { signal: AbortSignal.timeout ? AbortSignal.timeout(9000) : undefined });
  if (!res.ok) return [];
  const data = await res.json() as { articles?: NewsApiArticle[] };
  return data?.articles ?? [];
}

export async function GET() {
  try {
    const articles = await fetchConflictNews();

    const today = new Date().toISOString().slice(0, 10);
    const perRegion: Array<{ region: ConflictRegion; weight: number; headline: string; url: string }> = [];

    for (const region of CONFLICT_REGIONS) {
      let weight = 0;
      let headline = "";
      let url = "";
      for (const a of articles) {
        const text = `${a.title ?? ""} ${a.description ?? ""}`.toLowerCase();
        if (!region.aliases.some((alias) => text.includes(alias))) continue;
        const neg = negativeWeight(text);
        if (neg <= 0) continue;
        weight += neg;
        if (!headline) { headline = String(a.title ?? ""); url = String(a.url ?? ""); }
      }
      if (weight > 0) perRegion.push({ region, weight, headline, url });
    }

    const maxWeight = Math.max(1, ...perRegion.map((r) => r.weight));

    const items: GeoEventItem[] = perRegion.map(({ region, weight, headline, url }) => {
      const score = weight / maxWeight;
      return {
        id: `conflict-${region.name.toLowerCase().replace(/[^a-z]/g, "-")}`,
        type: "conflict",
        date: today,
        location: region.name,
        severity: severityFromScore(score),
        description: `${weight} conflict-related headlines`,
        lat: region.lat,
        lng: region.lng,
        color: colorFromScore(score),
        headline: headline || `${region.name} — active conflict coverage`,
        url,
        label: region.name,
        confidence: Math.min(1, score),
      } satisfies GeoEventItem;
    });

    const response: GeoEventsResponse = {
      updatedAt: new Date().toISOString(),
      layer: "conflicts",
      items,
    };
    return NextResponse.json(response, {
      headers: { "Cache-Control": "public, max-age=1800, stale-while-revalidate=3600" },
    });
  } catch {
    return NextResponse.json(
      { updatedAt: new Date().toISOString(), layer: "conflicts", items: [] } satisfies GeoEventsResponse,
      { headers: { "Cache-Control": "public, max-age=60" } },
    );
  }
}
