export const runtime = "edge";
import { NextResponse } from "next/server";
import type { OverlayRoutesResponse, OverlayRouteItem } from "@/lib/globe/globe-types";

const CONTAINER_ROUTES: OverlayRouteItem[] = [
  { id: "asia-europe", name: "Asia–Europe", from: "Shanghai", to: "Rotterdam", path: [{ lat: 31.2, lng: 121.5 }, { lat: 22.3, lng: 114.2 }, { lat: 1.3, lng: 103.8 }, { lat: 12.8, lng: 45.0 }, { lat: 29.9, lng: 32.5 }, { lat: 36.0, lng: 14.5 }, { lat: 37.9, lng: -9.0 }, { lat: 51.9, lng: 4.5 }], color: "#3b82f6", lineWidth: 3, animationSpeed: 1.0 },
  { id: "transpacific", name: "Transpacific", from: "Shanghai", to: "Los Angeles", path: [{ lat: 31.2, lng: 121.5 }, { lat: 35.0, lng: 139.7 }, { lat: 47.0, lng: 175.0 }, { lat: 37.5, lng: -122.5 }, { lat: 33.7, lng: -118.3 }], color: "#3b82f6", lineWidth: 3, animationSpeed: 1.0 },
  { id: "transatlantic", name: "Transatlantic", from: "New York", to: "Rotterdam", path: [{ lat: 40.7, lng: -74.0 }, { lat: 43.0, lng: -50.0 }, { lat: 47.0, lng: -25.0 }, { lat: 51.9, lng: 4.5 }], color: "#3b82f6", lineWidth: 2, animationSpeed: 0.8 },
  { id: "asia-us-east", name: "Asia–US East Coast", from: "Singapore", to: "New York", path: [{ lat: 1.3, lng: 103.8 }, { lat: 12.8, lng: 45.0 }, { lat: 29.9, lng: 32.5 }, { lat: 36.0, lng: -6.0 }, { lat: 40.7, lng: -74.0 }], color: "#22c55e", lineWidth: 2, animationSpeed: 0.8 },
];

export async function GET() {
  const response: OverlayRoutesResponse = {
    updatedAt: new Date().toISOString(),
    items: CONTAINER_ROUTES,
  };
  return NextResponse.json(response, {
    headers: { "Cache-Control": "public, max-age=86400" },
  });
}
