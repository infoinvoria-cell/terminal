export const runtime = "edge";
import { NextResponse } from "next/server";
import { detectEventRegion, EVENT_IMPACT_MAP, REGION_LABELS } from "@/lib/globe/eventImpactMap";

// Lightweight globe pattern detector. The client POSTs the current geo-events
// (it already holds them) and this returns pattern alerts with a confidence
// score. Stateless + self-contained: no external API calls, no keys.

type InEvent = {
  id?: string;
  type?: string;
  event_type?: string;
  severity?: string;
  date?: string;
  timestamp?: string;
  lat?: number;
  latitude?: number;
  lng?: number;
  longitude?: number;
  location?: string;
  headline?: string;
};

export type GlobePattern = {
  id: string;
  pattern: string;
  confidence: number;
  affectedAssets: string[];
  action: "watch" | "alert";
  lat: number;
  lng: number;
  region: string | null;
  count: number;
};

function isType(e: InEvent, needle: string): boolean {
  return new RegExp(needle, "i").test(String(e.type || e.event_type || ""));
}
function isSevere(e: InEvent): boolean {
  return /(high|critical|severe|major)/i.test(String(e.severity || ""));
}
function evLat(e: InEvent): number {
  return Number(e.lat ?? e.latitude ?? NaN);
}
function evLng(e: InEvent): number {
  return Number(e.lng ?? e.longitude ?? NaN);
}
function centroid(list: InEvent[]): { lat: number; lng: number } {
  const n = list.length || 1;
  return {
    lat: list.reduce((s, e) => s + evLat(e), 0) / n,
    lng: list.reduce((s, e) => s + evLng(e), 0) / n,
  };
}

function clusterByRegionOrGrid(events: InEvent[]): Map<string, InEvent[]> {
  const groups = new Map<string, InEvent[]>();
  for (const e of events) {
    const lat = evLat(e);
    const lng = evLng(e);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const region = detectEventRegion(lat, lng);
    // Named region, else a coarse 5°x5° grid cell so unnamed clusters still surface.
    const key = region ?? `grid:${Math.floor(lat / 5) * 5},${Math.floor(lng / 5) * 5}`;
    const arr = groups.get(key) ?? [];
    arr.push(e);
    groups.set(key, arr);
  }
  return groups;
}

function POST_impl(events: InEvent[]): GlobePattern[] {
  const patterns: GlobePattern[] = [];

  // 1. Earthquake clusters — >3 in the same region/grid cell.
  const quakes = events.filter((e) => isType(e, "earthquake"));
  for (const [key, list] of clusterByRegionOrGrid(quakes)) {
    if (list.length < 3) continue;
    const region = key.startsWith("grid:") ? null : key;
    const c = centroid(list);
    patterns.push({
      id: `quake-cluster:${key}`,
      pattern: `Erdbebencluster ${region ? REGION_LABELS[region] ?? region : `${c.lat.toFixed(0)},${c.lng.toFixed(0)}`}`,
      confidence: Math.min(0.5 + list.length * 0.1, 0.95),
      affectedAssets: region ? EVENT_IMPACT_MAP[region]?.assets ?? [] : [],
      action: list.length >= 5 ? "alert" : "watch",
      lat: c.lat,
      lng: c.lng,
      region,
      count: list.length,
    });
  }

  // 2. Conflict density — >=3 conflicts in a named region.
  const conflicts = events.filter((e) => isType(e, "conflict"));
  for (const [key, list] of clusterByRegionOrGrid(conflicts)) {
    if (list.length < 3 || key.startsWith("grid:")) continue;
    const region = key;
    const c = centroid(list);
    patterns.push({
      id: `conflict-density:${region}`,
      pattern: `Konflikt-Häufung ${REGION_LABELS[region] ?? region}`,
      confidence: Math.min(0.55 + list.length * 0.08, 0.92),
      affectedAssets: EVENT_IMPACT_MAP[region]?.assets ?? [],
      action: list.length >= 5 ? "alert" : "watch",
      lat: c.lat,
      lng: c.lng,
      region,
      count: list.length,
    });
  }

  // 3. Severe single events in a mapped region → direct asset-risk flag.
  for (const e of events) {
    if (!isSevere(e)) continue;
    const lat = evLat(e);
    const lng = evLng(e);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const region = detectEventRegion(lat, lng);
    if (!region || !EVENT_IMPACT_MAP[region]) continue;
    patterns.push({
      id: `severe:${e.id ?? `${lat.toFixed(2)},${lng.toFixed(2)}`}`,
      pattern: `Schweres Ereignis · ${REGION_LABELS[region] ?? region}`,
      confidence: 0.7,
      affectedAssets: EVENT_IMPACT_MAP[region].assets,
      action: "alert",
      lat,
      lng,
      region,
      count: 1,
    });
  }

  // Highest confidence first, cap output.
  return patterns.sort((a, b) => b.confidence - a.confidence).slice(0, 8);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { events?: InEvent[] };
    const events = Array.isArray(body?.events) ? body.events : [];
    const patterns = POST_impl(events);
    return NextResponse.json({ updatedAt: new Date().toISOString(), count: patterns.length, patterns });
  } catch {
    return NextResponse.json({ updatedAt: new Date().toISOString(), count: 0, patterns: [] });
  }
}

export async function GET() {
  return NextResponse.json({ status: "ok", usage: "POST { events: GeoEventItem[] } → { patterns }" });
}
