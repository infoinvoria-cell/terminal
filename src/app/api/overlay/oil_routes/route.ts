export const runtime = "edge";
import { NextResponse } from "next/server";
import type { OverlayRoutesResponse, OverlayRouteItem } from "@/lib/globe/globe-types";

const OIL_ROUTES: OverlayRouteItem[] = [
  {
    id: "hormuz",
    name: "Strait of Hormuz",
    from: "Persian Gulf",
    to: "Arabian Sea",
    path: [{ lat: 26.5, lng: 56.3 }, { lat: 25.5, lng: 57.5 }, { lat: 24.5, lng: 58.0 }],
    color: "#f59e0b",
    lineWidth: 4,
    animationSpeed: 1.5,
  },
  {
    id: "malacca",
    name: "Strait of Malacca",
    from: "South China Sea",
    to: "Indian Ocean",
    path: [{ lat: 1.3, lng: 103.8 }, { lat: 3.5, lng: 102.0 }, { lat: 5.5, lng: 100.3 }],
    color: "#f59e0b",
    lineWidth: 3,
    animationSpeed: 1.2,
  },
  {
    id: "suez",
    name: "Suez Canal",
    from: "Red Sea",
    to: "Mediterranean",
    path: [{ lat: 29.9, lng: 32.5 }, { lat: 30.5, lng: 32.4 }, { lat: 31.2, lng: 32.3 }],
    color: "#f59e0b",
    lineWidth: 3,
    animationSpeed: 1.0,
  },
  {
    id: "bab-el-mandeb",
    name: "Bab-el-Mandeb",
    from: "Red Sea",
    to: "Gulf of Aden",
    path: [{ lat: 12.5, lng: 43.3 }, { lat: 12.0, lng: 43.4 }, { lat: 11.5, lng: 43.5 }],
    color: "#ef4444",
    lineWidth: 3,
    animationSpeed: 1.0,
  },
  {
    id: "turkish-straits",
    name: "Turkish Straits",
    from: "Black Sea",
    to: "Mediterranean",
    path: [{ lat: 41.0, lng: 29.0 }, { lat: 40.9, lng: 28.9 }, { lat: 40.9, lng: 28.7 }],
    color: "#f59e0b",
    lineWidth: 2,
    animationSpeed: 0.8,
  },
  {
    id: "panama",
    name: "Panama Canal",
    from: "Caribbean",
    to: "Pacific",
    path: [{ lat: 8.9, lng: -79.5 }, { lat: 9.1, lng: -79.7 }, { lat: 9.3, lng: -79.9 }],
    color: "#f59e0b",
    lineWidth: 2,
    animationSpeed: 0.8,
  },
  {
    id: "cape-good-hope",
    name: "Cape of Good Hope",
    from: "Atlantic",
    to: "Indian Ocean",
    path: [{ lat: -34.4, lng: 18.5 }, { lat: -34.8, lng: 20.0 }, { lat: -33.9, lng: 26.8 }],
    color: "#a3e635",
    lineWidth: 2,
    animationSpeed: 0.7,
  },
  {
    id: "cape-horn",
    name: "Cape Horn",
    from: "Atlantic",
    to: "Pacific",
    path: [{ lat: -55.9, lng: -67.3 }, { lat: -56.0, lng: -68.5 }, { lat: -56.1, lng: -70.0 }],
    color: "#a3e635",
    lineWidth: 2,
    animationSpeed: 0.6,
  },
  {
    id: "druzhba",
    name: "Druzhba Pipeline",
    from: "Russia",
    to: "Germany",
    path: [{ lat: 54.0, lng: 56.0 }, { lat: 54.0, lng: 40.0 }, { lat: 53.5, lng: 24.0 }, { lat: 52.5, lng: 13.7 }],
    color: "#8b5cf6",
    lineWidth: 2,
    animationSpeed: 0.5,
  },
  {
    id: "trans-arabian",
    name: "Trans-Arabian Pipeline",
    from: "Saudi Arabia",
    to: "Lebanon",
    path: [{ lat: 26.3, lng: 50.0 }, { lat: 28.0, lng: 44.0 }, { lat: 31.0, lng: 37.0 }, { lat: 33.0, lng: 35.5 }],
    color: "#8b5cf6",
    lineWidth: 2,
    animationSpeed: 0.5,
  },
];

export async function GET() {
  const response: OverlayRoutesResponse = {
    updatedAt: new Date().toISOString(),
    items: OIL_ROUTES,
  };
  return NextResponse.json(response, {
    headers: { "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800" },
  });
}
