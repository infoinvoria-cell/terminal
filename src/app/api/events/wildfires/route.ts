export const runtime = "edge";
import { NextResponse } from "next/server";
import type { GeoEventsResponse, GeoEventItem } from "@/lib/globe/globe-types";

const NASA_KEY = process.env.NASA_FIRMS_KEY ?? "";
const FIRMS_URL = (key: string) =>
  `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${key}/VIIRS_SNPP_NRT/-180,-90,180,90/1`;

function severityFromBrightness(brightness: number): string {
  if (brightness >= 500) return "critical";
  if (brightness >= 400) return "high";
  if (brightness >= 350) return "medium";
  return "low";
}

function colorFromBrightness(brightness: number): string {
  if (brightness >= 500) return "#ef4444";
  if (brightness >= 400) return "#f97316";
  if (brightness >= 350) return "#fb923c";
  return "#fbbf24";
}

function parseViirsCsv(csv: string): GeoEventItem[] {
  const lines = csv.trim().split("\n");
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const latIdx = header.indexOf("latitude");
  const lngIdx = header.indexOf("longitude");
  const brightIdx = header.indexOf("bright_ti4");
  const dateIdx = header.indexOf("acq_date");

  const items: GeoEventItem[] = [];
  for (let i = 1; i < Math.min(lines.length, 500); i++) {
    const cols = lines[i].split(",");
    const lat = parseFloat(cols[latIdx] ?? "");
    const lng = parseFloat(cols[lngIdx] ?? "");
    const brightness = parseFloat(cols[brightIdx] ?? "0");
    const date = String(cols[dateIdx] ?? new Date().toISOString().slice(0, 10)).trim();
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    items.push({
      id: `fire-${i}-${lat.toFixed(3)}-${lng.toFixed(3)}`,
      type: "wildfire",
      date,
      location: `${lat.toFixed(2)}, ${lng.toFixed(2)}`,
      severity: severityFromBrightness(brightness),
      description: `Brightness: ${brightness.toFixed(0)} K`,
      lat,
      lng,
      color: colorFromBrightness(brightness),
      headline: `🔥 Wildfire — ${date}`,
      label: "🔥",
    });
  }
  return items;
}

export async function GET() {
  if (!NASA_KEY) {
    return NextResponse.json(
      { updatedAt: new Date().toISOString(), layer: "wildfires", items: [] } satisfies GeoEventsResponse,
      { headers: { "Cache-Control": "public, max-age=60" } },
    );
  }

  try {
    const res = await fetch(FIRMS_URL(NASA_KEY), {
      signal: AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined,
    });
    if (!res.ok) throw new Error(`FIRMS ${res.status}`);
    const csv = await res.text();
    const items = parseViirsCsv(csv);
    const response: GeoEventsResponse = {
      updatedAt: new Date().toISOString(),
      layer: "wildfires",
      items,
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
