import { NextResponse } from "next/server";
import { getMarketDataStatus } from "@/lib/market-data/tradingview-cache";

export async function GET() {
  return NextResponse.json(getMarketDataStatus());
}
