export const runtime = "edge";
import { NextResponse } from "next/server";
import type { CommodityStressMapResponse, CommodityStressRegionItem } from "@/lib/globe/globe-types";

const STRESS_ITEMS: CommodityStressRegionItem[] = [
  { id: "oil-mideast", commodity: "Oil", region: "Middle East", lat: 26.0, lng: 50.0, icon: "🛢️", description: "OPEC+ cuts + Houthi disruptions", stressScore: 78, stressLevel: "high", glow: true },
  { id: "wheat-ukraine", commodity: "Wheat", region: "Eastern Europe", lat: 49.0, lng: 32.0, icon: "🌾", description: "War disrupting Black Sea grain corridor", stressScore: 72, stressLevel: "high", glow: true },
  { id: "copper-chile", commodity: "Copper", region: "South America", lat: -30.0, lng: -71.0, icon: "🔩", description: "Drought reducing ore output in Chile", stressScore: 55, stressLevel: "medium", glow: false },
  { id: "natgas-europe", commodity: "Natural Gas", region: "Europe", lat: 52.0, lng: 10.0, icon: "⚡", description: "LNG import dependency elevated", stressScore: 60, stressLevel: "medium", glow: false },
  { id: "cotton-india", commodity: "Cotton", region: "South Asia", lat: 22.0, lng: 79.0, icon: "🌱", description: "Monsoon variability affecting output", stressScore: 45, stressLevel: "medium", glow: false },
];

export async function GET() {
  const response: CommodityStressMapResponse = {
    updatedAt: new Date().toISOString(),
    mode: "live",
    regionScores: { oil: 78, wheat: 72, copper: 55, natgas: 60, cotton: 45 },
    items: STRESS_ITEMS,
  };
  return NextResponse.json(response, {
    headers: { "Cache-Control": "public, max-age=7200, stale-while-revalidate=14400" },
  });
}
