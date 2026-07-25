export const runtime = "edge";
import { NextResponse } from "next/server";
import type { GlobalLiquidityMapResponse, GlobalLiquidityRegionItem } from "@/lib/globe/globe-types";

const LIQUIDITY_REGIONS: GlobalLiquidityRegionItem[] = [
  { id: "usa", name: "United States", lat: 38.9, lng: -77.0, score: 72, signal: "high_liquidity", severity: "low", countries: ["US"], components: { centralBankLiquidity: 75, usdFundingStress: 25, capitalFlows: 80 } },
  { id: "eurozone", name: "Eurozone", lat: 50.1, lng: 8.7, score: 60, signal: "tightening", severity: "medium", countries: ["DE", "FR", "IT", "ES"], components: { centralBankLiquidity: 60, usdFundingStress: 40, capitalFlows: 55 } },
  { id: "japan", name: "Japan", lat: 35.7, lng: 139.7, score: 80, signal: "high_liquidity", severity: "low", countries: ["JP"], components: { centralBankLiquidity: 85, usdFundingStress: 20, capitalFlows: 70 } },
  { id: "china", name: "China", lat: 39.9, lng: 116.4, score: 55, signal: "neutral", severity: "medium", countries: ["CN"], components: { centralBankLiquidity: 60, usdFundingStress: 45, capitalFlows: 50 } },
  { id: "emerging-markets", name: "Emerging Markets", lat: 0.0, lng: 20.0, score: 35, signal: "tightening", severity: "high", countries: [], components: { centralBankLiquidity: 35, usdFundingStress: 70, capitalFlows: 30 } },
];

export async function GET() {
  const response: GlobalLiquidityMapResponse = {
    updatedAt: new Date().toISOString(),
    indicators: {
      centralBankLiquidity: { US: 75, JP: 85, EU: 60, CN: 60 },
      usdFundingStress: { EM: 70, EU: 40, JP: 20, US: 25 },
      globalCapitalFlows: { US: 80, JP: 70, EU: 55, CN: 50 },
    },
    regions: LIQUIDITY_REGIONS,
  };
  return NextResponse.json(response, {
    headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=7200" },
  });
}
