export const runtime = "edge";
import { NextResponse } from "next/server";
import type { ShipTrackingResponse } from "@/lib/globe/globe-types";

const AIS_KEY = process.env.AIS_API_KEY ?? process.env.NEXT_PUBLIC_AIS_KEY ?? "";

export async function GET() {
  if (!AIS_KEY) {
    return NextResponse.json(
      { updatedAt: new Date().toISOString(), items: [] } satisfies ShipTrackingResponse,
      { headers: { "Cache-Control": "public, max-age=60" } },
    );
  }

  try {
    const res = await fetch("https://api.aisstream.io/v0/ships?boundingBox=-90,-180,90,180&limit=500", {
      headers: { "Authorization": `Bearer ${AIS_KEY}`, "Accept": "application/json" },
      signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined,
    });
    if (!res.ok) throw new Error(`AIS ${res.status}`);
    const data = await res.json();
    const items = Array.isArray(data?.ships) ? data.ships : (Array.isArray(data) ? data : []);
    return NextResponse.json(
      { updatedAt: new Date().toISOString(), items } satisfies ShipTrackingResponse,
      { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=600" } },
    );
  } catch {
    return NextResponse.json(
      { updatedAt: new Date().toISOString(), items: [] } satisfies ShipTrackingResponse,
      { headers: { "Cache-Control": "public, max-age=60" } },
    );
  }
}
