export const runtime = "edge";
import { NextResponse } from "next/server";
import type { CommodityRegionsResponse, CommodityRegionItem } from "@/lib/globe/globe-types";

const REGIONS: CommodityRegionItem[] = [
  { id: "gold-usa", commodity: "Gold", region: "North America", lat: 40.7, lng: -74.0, icon: "🥇", description: "COMEX Gold Futures (GC1!) — New York" },
  { id: "gold-uk", commodity: "Gold", region: "Europe", lat: 51.5, lng: -0.1, icon: "🥇", description: "LBMA Gold — London" },
  { id: "oil-ksa", commodity: "Oil", region: "Middle East", lat: 26.3, lng: 50.1, icon: "🛢️", description: "Saudi Aramco — Dhahran" },
  { id: "oil-russia", commodity: "Oil", region: "Eurasia", lat: 56.0, lng: 60.0, icon: "🛢️", description: "Urals Blend — Russia" },
  { id: "oil-norway", commodity: "Oil", region: "North Sea", lat: 61.0, lng: 2.0, icon: "🛢️", description: "Brent Crude — North Sea" },
  { id: "copper-chile", commodity: "Copper", region: "South America", lat: -33.5, lng: -70.7, icon: "🔩", description: "CODELCO — Santiago" },
  { id: "copper-peru", commodity: "Copper", region: "South America", lat: -12.0, lng: -77.0, icon: "🔩", description: "Cerro Verde — Peru" },
  { id: "cotton-usa", commodity: "Cotton", region: "North America", lat: 34.0, lng: -81.0, icon: "🌱", description: "US Cotton Belt — Southeast USA" },
  { id: "natgas-usa", commodity: "Natural Gas", region: "North America", lat: 29.7, lng: -95.4, icon: "⚡", description: "Henry Hub — Louisiana" },
  { id: "silver-mexico", commodity: "Silver", region: "North America", lat: 19.4, lng: -99.1, icon: "⚪", description: "Mexico City — World's top silver producer" },
  { id: "wheat-ukraine", commodity: "Wheat", region: "Eastern Europe", lat: 50.5, lng: 30.5, icon: "🌾", description: "Kyiv — Black Sea grain corridor" },
  { id: "cocoa-ivory", commodity: "Cocoa", region: "West Africa", lat: 5.4, lng: -4.0, icon: "🍫", description: "Abidjan — World's top cocoa producer" },
];

export async function GET() {
  const response: CommodityRegionsResponse = {
    updatedAt: new Date().toISOString(),
    items: REGIONS,
  };
  return NextResponse.json(response, {
    headers: { "Cache-Control": "public, max-age=86400" },
  });
}
