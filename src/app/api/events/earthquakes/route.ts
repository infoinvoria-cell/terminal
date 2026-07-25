export const runtime = "edge";
import { NextResponse } from "next/server";
import type { GeoEventsResponse, GeoEventItem } from "@/lib/globe/globe-types";

const USGS_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson";

function severityFromMag(mag: number): string {
  if (mag >= 7) return "critical";
  if (mag >= 6) return "high";
  if (mag >= 5) return "medium";
  return "low";
}

function colorFromMag(mag: number): string {
  if (mag >= 7) return "#FF3333"; // M>7 red
  if (mag >= 6) return "#f97316"; // M5-7 orange
  if (mag >= 5) return "#f97316"; // M5-7 orange
  return "#D4AF37"; // M<5 gold
}

export async function GET() {
  try {
    const res = await fetch(USGS_URL, {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined,
    });
    if (!res.ok) throw new Error(`USGS ${res.status}`);

    const data = await res.json() as {
      features: Array<{
        id: string;
        properties: { mag: number; place: string; time: number; url: string; title: string };
        geometry: { coordinates: [number, number, number] };
      }>;
    };

    const items: GeoEventItem[] = (data.features ?? [])
      .filter((f) => f.geometry?.coordinates?.length >= 2)
      .map((f) => {
        const mag = Number(f.properties?.mag ?? 0);
        const [lng, lat] = f.geometry.coordinates;
        const ts = new Date(f.properties?.time ?? Date.now()).toISOString();
        return {
          id: String(f.id || `eq-${lat}-${lng}`),
          type: "earthquake",
          date: ts.slice(0, 10),
          timestamp: ts,
          location: String(f.properties?.place ?? "Unknown"),
          severity: severityFromMag(mag),
          description: `Magnitude ${mag.toFixed(1)}`,
          lat: Number(lat),
          lng: Number(lng),
          color: colorFromMag(mag),
          headline: String(f.properties?.title ?? `M${mag} Earthquake`),
          url: String(f.properties?.url ?? ""),
          label: `M${mag.toFixed(1)}`,
        } satisfies GeoEventItem;
      })
      .slice(0, 200);

    const response: GeoEventsResponse = {
      updatedAt: new Date().toISOString(),
      layer: "earthquakes",
      items,
    };
    return NextResponse.json(response, {
      headers: { "Cache-Control": "public, max-age=600, stale-while-revalidate=1800" },
    });
  } catch {
    return NextResponse.json(
      { updatedAt: new Date().toISOString(), layer: "earthquakes", items: [] } satisfies GeoEventsResponse,
      { headers: { "Cache-Control": "public, max-age=60" } },
    );
  }
}
