export const runtime = "edge";
import { NextResponse } from "next/server";
import type { GeoEventsResponse, GeoEventItem } from "@/lib/globe/globe-types";

// NASA EONET is keyless and reliable; FIRMS requires a key and is rate/transaction
// limited (often returns empty). Use EONET as the primary wildfire source.
const EONET_URL = "https://eonet.gsfc.nasa.gov/api/v3/events?category=wildfires&status=open&limit=200";

function severityFromAcres(acres: number): string {
  if (acres >= 50000) return "critical";
  if (acres >= 10000) return "high";
  if (acres >= 1000) return "medium";
  return "low";
}

function colorFromAcres(acres: number): string {
  if (acres >= 50000) return "#FF3333";
  if (acres >= 10000) return "#f97316";
  if (acres >= 1000) return "#fb923c";
  return "#fbbf24";
}

type EonetGeometry = { date?: string; coordinates?: number[]; magnitudeValue?: number; magnitudeUnit?: string; type?: string };
type EonetEvent = { id?: string; title?: string; geometry?: EonetGeometry[]; sources?: Array<{ url?: string }> };

export async function GET() {
  try {
    const res = await fetch(EONET_URL, {
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined,
    });
    if (!res.ok) throw new Error(`EONET ${res.status}`);
    const data = await res.json() as { events?: EonetEvent[] };
    const events = data?.events ?? [];

    const items: GeoEventItem[] = [];
    for (const ev of events) {
      // latest geometry point for the event
      const geoms = (ev.geometry ?? []).filter((g) => Array.isArray(g.coordinates) && g.coordinates.length >= 2);
      const g = geoms[geoms.length - 1];
      if (!g?.coordinates) continue;
      const lng = Number(g.coordinates[0]);
      const lat = Number(g.coordinates[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const acres = g.magnitudeUnit === "acres" && Number.isFinite(Number(g.magnitudeValue)) ? Number(g.magnitudeValue) : 0;
      const date = String(g.date ?? new Date().toISOString()).slice(0, 10);
      const title = String(ev.title ?? "Wildfire");
      items.push({
        id: `fire-${ev.id ?? `${lat.toFixed(3)}-${lng.toFixed(3)}`}`,
        type: "wildfire",
        date,
        location: title,
        severity: severityFromAcres(acres),
        description: acres > 0 ? `${acres.toLocaleString("en-US")} acres` : "Active wildfire",
        lat,
        lng,
        color: colorFromAcres(acres),
        headline: `🔥 ${title}`,
        url: ev.sources?.[0]?.url ?? "",
        label: "🔥",
      });
    }

    const response: GeoEventsResponse = {
      updatedAt: new Date().toISOString(),
      layer: "wildfires",
      items: items.slice(0, 200),
    };
    return NextResponse.json(response, {
      headers: { "Cache-Control": "public, max-age=1800, stale-while-revalidate=3600" },
    });
  } catch {
    return NextResponse.json(
      { updatedAt: new Date().toISOString(), layer: "wildfires", items: [] } satisfies GeoEventsResponse,
      { headers: { "Cache-Control": "public, max-age=60" } },
    );
  }
}
