export const runtime = "edge";
import { NextResponse } from "next/server";
import type { NewsResponse } from "@/lib/globe/globe-types";

export async function GET() {
  return NextResponse.json({ updatedAt: new Date().toISOString(), items: [] } satisfies NewsResponse);
}
