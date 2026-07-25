export const runtime = "edge";
import { NextResponse } from "next/server";
import type { AssetRegionHighlightResponse } from "@/lib/globe/globe-types";

export async function GET(_req: Request, { params }: { params: Promise<{ assetId: string }> }) {
  const { assetId: rawId } = await params;
  const assetId = String(rawId ?? "").toLowerCase();

  const response: AssetRegionHighlightResponse = {
    assetId,
    updatedAt: new Date().toISOString(),
    bias: "neutral",
    score: 50,
    regions: [],
    assetRegionMap: {},
  };
  return NextResponse.json(response, {
    headers: { "Cache-Control": "public, max-age=1800" },
  });
}
