export const runtime = "edge";
import { NextResponse } from "next/server";

// Brain equity requires CAPITALIFE_BRAIN_PATH to be mounted locally.
// Returns a structured UNAVAILABLE response — not a 503 error and not a false HEALTHY.
// The client checks `available` and renders an UNAVAILABLE state instead of silently hiding the gap.
const UNAVAILABLE_RESPONSE = {
  available: false,
  status: "UNAVAILABLE",
  points: [],
  pts: [],   // backwards-compat alias used by existing client code
  reason: "CAPITALIFE_BRAIN_PATH not mounted in this environment",
};

export async function GET(request: Request) {
  const key = new URL(request.url).searchParams.get("key") ?? "(unknown)";
  console.warn(`[brain-equity] UNAVAILABLE: key=${key} — Brain path not mounted`);
  return NextResponse.json(UNAVAILABLE_RESPONSE);
}
export async function POST() {
  console.warn(`[brain-equity] UNAVAILABLE: POST — Brain path not mounted`);
  return NextResponse.json(UNAVAILABLE_RESPONSE);
}
