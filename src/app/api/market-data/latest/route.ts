import { NextResponse } from "next/server";
import { getTradingViewLatest } from "@/lib/market-data/tradingview-cache";

export async function GET() {
  return NextResponse.json({
    mode: "delayed_near_live",
    items: getTradingViewLatest(),
  });
}
