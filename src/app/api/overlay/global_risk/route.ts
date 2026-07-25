export const runtime = "edge";
import { NextResponse } from "next/server";
import type { GlobalRiskLayerResponse, GlobalRiskRegionItem } from "@/lib/globe/globe-types";

const RISK_REGIONS: GlobalRiskRegionItem[] = [
  { id: "mideast", name: "Middle East", lat: 26.0, lng: 44.0, score: 82, signal: "risk_off", severity: "high", countries: ["IQ", "SY", "YE", "IR", "LB"], components: { riskOnOff: 80, inflation: 60, shipping: 90, commodity: 75 } },
  { id: "eastern-europe", name: "Eastern Europe", lat: 50.0, lng: 30.0, score: 75, signal: "risk_off", severity: "high", countries: ["UA", "RU", "BY"], components: { riskOnOff: 75, inflation: 65, shipping: 50, commodity: 80 } },
  { id: "west-africa", name: "West Africa", lat: 8.0, lng: 2.0, score: 65, signal: "risk_off", severity: "medium", countries: ["NG", "ML", "BF", "NE", "GN"], components: { riskOnOff: 65, inflation: 70, shipping: 20, commodity: 55 } },
  { id: "sahel", name: "Sahel", lat: 14.0, lng: 18.0, score: 70, signal: "risk_off", severity: "high", countries: ["ML", "NE", "TD", "SD"], components: { riskOnOff: 70, inflation: 60, shipping: 10, commodity: 45 } },
  { id: "south-asia", name: "South Asia", lat: 28.0, lng: 69.0, score: 55, signal: "neutral", severity: "medium", countries: ["PK", "AF", "IN"], components: { riskOnOff: 55, inflation: 65, shipping: 30, commodity: 50 } },
  { id: "north-america", name: "North America", lat: 45.0, lng: -100.0, score: 20, signal: "risk_on", severity: "low", countries: ["US", "CA", "MX"], components: { riskOnOff: 20, inflation: 25, shipping: 10, commodity: 15 } },
  { id: "western-europe", name: "Western Europe", lat: 50.0, lng: 10.0, score: 25, signal: "risk_on", severity: "low", countries: ["DE", "FR", "GB", "IT", "ES"], components: { riskOnOff: 25, inflation: 30, shipping: 15, commodity: 20 } },
  { id: "east-asia", name: "East Asia", lat: 35.0, lng: 120.0, score: 45, signal: "neutral", severity: "medium", countries: ["CN", "JP", "KR", "TW"], components: { riskOnOff: 45, inflation: 35, shipping: 40, commodity: 50 } },
  { id: "latam", name: "Latin America", lat: -10.0, lng: -60.0, score: 50, signal: "neutral", severity: "medium", countries: ["BR", "AR", "CO", "VE"], components: { riskOnOff: 50, inflation: 70, shipping: 20, commodity: 45 } },
  { id: "southeast-asia", name: "Southeast Asia", lat: 5.0, lng: 110.0, score: 35, signal: "risk_on", severity: "low", countries: ["SG", "MY", "TH", "ID", "PH"], components: { riskOnOff: 35, inflation: 40, shipping: 45, commodity: 30 } },
];

export async function GET() {
  const response: GlobalRiskLayerResponse = {
    updatedAt: new Date().toISOString(),
    indicators: {
      riskOnOff: { US: 20, DE: 25, JP: 40, CN: 50, RU: 80, IQ: 85, UA: 75 },
      inflationHotspots: { NG: 70, AR: 75, TR: 65, BR: 55, DE: 28 },
      shippingDisruptions: { YE: 90, IR: 80, RU: 55, SY: 75 },
      commodityStress: { UA: 80, RU: 75, NG: 55, IQ: 70 },
    },
    regions: RISK_REGIONS,
  };
  return NextResponse.json(response, {
    headers: { "Cache-Control": "public, max-age=10800, stale-while-revalidate=21600" },
  });
}
