export const runtime = "edge";
import { NextResponse } from "next/server";
import { buildComponentsCache } from "@/lib/components/components-data";

// Serializes the static component groups + layout for the JSON cache.
// Used to (re)generate public/data/components-cache.json and as a live fallback.
export const revalidate = 3600;

export function GET() {
  return NextResponse.json(buildComponentsCache());
}
