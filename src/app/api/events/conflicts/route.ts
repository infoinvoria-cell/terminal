export const runtime = "edge";
import { NextResponse } from "next/server";
import type { GeoEventsResponse, GeoEventItem } from "@/lib/globe/globe-types";

const GDELT_URL =
  "https://api.gdeltproject.org/api/v2/geo/geo?query=conflict%20violence%20war%20attack%20military&mode=pointdata&format=json&timespan=7d&maxrecords=250";

function colorFromTone(tone: number): string {
  if (tone < -5) return "#ef4444";
  if (tone < -2) return "#f97316";
  return "#eab308";
}

function severityFromTone(tone: number): string {
  if (tone < -5) return "high";
  if (tone < -2) return "medium";
  return "low";
}

function labelFromTone(tone: number): string {
  if (tone < -5) return "Conflict";
  if (tone < -2) return "Tension";
  return "Protest";
}

type GdeltFeature = {
  lat?: number;
  lon?: number;
  name?: string;
  title?: string;
  url?: string;
  tone?: number | string;
  date?: string;
  LATITUDE?: number;
  LONGITUDE?: number;
  NAME?: string;
  TITLE?: string;
  URL?: string;
  TONE?: number | string;
  DATE?: string;
};

export async function GET() {
  try {
    const res = await fetch(GDELT_URL, {
      headers: { "Accept": "application/json", "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined,
    });
    if (!res.ok) throw new Error(`GDELT ${res.status}`);

    const raw = await res.json();
    const features: GdeltFeature[] = Array.isArray(raw) ? raw : (raw?.features ?? raw?.articles ?? []);

    const items: GeoEventItem[] = features
      .filter((f) => {
        const lat = Number(f.lat ?? f.LATITUDE ?? 0);
        const lng = Number(f.lon ?? f.LONGITUDE ?? 0);
        return Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0);
      })
      .map((f, i) => {
        const lat = Number(f.lat ?? f.LATITUDE ?? 0);
        const lng = Number(f.lon ?? f.LONGITUDE ?? 0);
        const tone = Number(f.tone ?? f.TONE ?? -3);
        const name = String(f.name ?? f.NAME ?? "Unknown location");
        const title = String(f.title ?? f.TITLE ?? name);
        const url = String(f.url ?? f.URL ?? "");
        const dateRaw = String(f.date ?? f.DATE ?? "");
        const date = dateRaw.length >= 8
          ? `${dateRaw.slice(0, 4)}-${dateRaw.slice(4, 6)}-${dateRaw.slice(6, 8)}`
          : new Date().toISOString().slice(0, 10);
        return {
          id: `gdelt-${i}-${lat}-${lng}`,
          type: "conflict",
          date,
          location: name,
          severity: severityFromTone(tone),
          description: labelFromTone(tone),
          lat,
          lng,
          color: colorFromTone(tone),
          headline: title.length > 120 ? title.slice(0, 120) + "…" : title,
          url,
          label: labelFromTone(tone),
          confidence: Math.min(1, Math.max(0, (Math.abs(tone) / 10))),
        } satisfies GeoEventItem;
      })
      .slice(0, 200);

    const response: GeoEventsResponse = {
      updatedAt: new Date().toISOString(),
      layer: "conflicts",
      items,
    };
    return NextResponse.json(response, {
      headers: { "Cache-Control": "public, max-age=7200, stale-while-revalidate=14400" },
    });
  } catch {
    return NextResponse.json(
      { updatedAt: new Date().toISOString(), layer: "conflicts", items: [] } satisfies GeoEventsResponse,
      { headers: { "Cache-Control": "public, max-age=60" } },
    );
  }
}
