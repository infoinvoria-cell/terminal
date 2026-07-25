export const runtime = "edge";
import { NextResponse } from "next/server";

export type NewsHeatmapEntry = {
  country: string;
  negativeCount: number;
  score: number;
};

export type NewsHeatmapResponse = {
  updatedAt: string;
  countries: NewsHeatmapEntry[];
};

type GdeltFeature = {
  name?: string;
  tone?: number | string;
  NAME?: string;
  TONE?: number | string;
};

const COUNTRY_ALIASES: Record<string, string> = {
  "united states": "united states",
  "us": "united states",
  "usa": "united states",
  "uk": "united kingdom",
  "britain": "united kingdom",
  "russia": "russia",
  "china": "china",
  "germany": "germany",
  "france": "france",
  "japan": "japan",
  "india": "india",
  "brazil": "brazil",
  "australia": "australia",
  "canada": "canada",
  "south korea": "south korea",
  "korea": "south korea",
  "mexico": "mexico",
  "turkey": "turkey",
  "iran": "iran",
  "iraq": "iraq",
  "ukraine": "ukraine",
  "israel": "israel",
  "saudi arabia": "saudi arabia",
  "egypt": "egypt",
  "south africa": "south africa",
  "nigeria": "nigeria",
  "indonesia": "indonesia",
  "pakistan": "pakistan",
  "taiwan": "taiwan",
  "italy": "italy",
  "spain": "spain",
  "poland": "poland",
  "netherlands": "netherlands",
  "switzerland": "switzerland",
  "sweden": "sweden",
  "norway": "norway",
};

function extractCountry(name: string): string | null {
  const lower = name.toLowerCase().trim();
  for (const [key, val] of Object.entries(COUNTRY_ALIASES)) {
    if (lower.includes(key)) return val;
  }
  return null;
}

export async function GET() {
  try {
    const url = "https://api.gdeltproject.org/api/v2/geo/geo?query=crisis%20conflict%20war%20disaster%20economic%20sanctions&mode=pointdata&format=json&timespan=3d&maxrecords=500";
    const res = await fetch(url, {
      headers: { "Accept": "application/json", "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined,
    });
    if (!res.ok) throw new Error(`GDELT ${res.status}`);

    const raw = await res.json();
    const features: GdeltFeature[] = Array.isArray(raw) ? raw : (raw?.features ?? raw?.articles ?? []);

    const countryNeg: Record<string, number> = {};
    for (const f of features) {
      const name = String(f.name ?? f.NAME ?? "");
      const tone = Number(f.tone ?? f.TONE ?? 0);
      if (tone >= -1) continue;
      const country = extractCountry(name);
      if (!country) continue;
      countryNeg[country] = (countryNeg[country] ?? 0) + 1;
    }

    const maxCount = Math.max(1, ...Object.values(countryNeg));
    const countries: NewsHeatmapEntry[] = Object.entries(countryNeg)
      .map(([country, negativeCount]) => ({
        country,
        negativeCount,
        score: negativeCount / maxCount,
      }))
      .sort((a, b) => b.negativeCount - a.negativeCount);

    const response: NewsHeatmapResponse = {
      updatedAt: new Date().toISOString(),
      countries,
    };
    return NextResponse.json(response, {
      headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=7200" },
    });
  } catch {
    return NextResponse.json(
      { updatedAt: new Date().toISOString(), countries: [] } satisfies NewsHeatmapResponse,
      { headers: { "Cache-Control": "public, max-age=60" } },
    );
  }
}
