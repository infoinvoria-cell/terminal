import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), "node_modules", "globe.gl", "example", "datasets", "ne_110m_admin_0_countries.geojson");
    const payload = JSON.parse(await readFile(filePath, "utf8")) as { features?: unknown[] };
    return NextResponse.json({ type: "FeatureCollection", features: payload.features ?? [] }, { headers: { "Cache-Control": "public, max-age=86400" } });
  } catch {
    return NextResponse.json({ error: "local world data unavailable" }, { status: 503 });
  }
}
