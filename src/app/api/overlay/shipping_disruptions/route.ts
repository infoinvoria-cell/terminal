export const runtime = "edge";
import { NextResponse } from "next/server";
import type { ShippingDisruptionsResponse, GeoEventItem, OverlayRouteItem } from "@/lib/globe/globe-types";

const DISRUPTIONS: GeoEventItem[] = [
  { id: "bab-el-mandeb-disruption", type: "news_geo", date: "2024-07-01", location: "Bab-el-Mandeb Strait", severity: "critical", description: "Houthi attacks on commercial shipping", lat: 12.5, lng: 43.3, color: "#ef4444", headline: "⛔ Bab-el-Mandeb — Houthi Threat", label: "⛔ Critical" },
  { id: "red-sea-disruption", type: "news_geo", date: "2024-07-01", location: "Red Sea", severity: "high", description: "Rerouting via Cape of Good Hope", lat: 20.0, lng: 38.0, color: "#f97316", headline: "⛔ Red Sea — Shipping Disruption", label: "⛔ High" },
  { id: "hormuz-tension", type: "news_geo", date: "2024-07-01", location: "Strait of Hormuz", severity: "medium", description: "Iranian tensions affecting transit", lat: 26.5, lng: 56.3, color: "#eab308", headline: "⚠️ Hormuz — Elevated Tension", label: "⚠️ Medium" },
];

const DISRUPTION_ROUTES: OverlayRouteItem[] = [
  { id: "cape-reroute", name: "Cape of Good Hope Reroute", from: "Asia", to: "Europe", path: [{ lat: 1.3, lng: 103.8 }, { lat: -10.0, lng: 50.0 }, { lat: -34.4, lng: 18.5 }, { lat: 37.9, lng: -9.0 }, { lat: 51.9, lng: 4.5 }], color: "#f97316", lineWidth: 2, animationSpeed: 0.7 },
];

export async function GET() {
  const response: ShippingDisruptionsResponse = {
    updatedAt: new Date().toISOString(),
    items: DISRUPTIONS,
    routes: DISRUPTION_ROUTES,
  };
  return NextResponse.json(response, {
    headers: { "Cache-Control": "public, max-age=600, stale-while-revalidate=3600" },
  });
}
