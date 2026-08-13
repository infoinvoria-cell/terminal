// Node runtime: AISstream is WebSocket-only, so we open a short-lived socket,
// collect position reports + static data for a few seconds, then return them.
// (Edge runtime and plain REST fetch cannot talk to aisstream.io.)
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

import { NextResponse } from "next/server";
import type { ShipTrackingResponse, ShipTrackingItem } from "@/lib/globe/globe-types";

const AIS_KEY = process.env.AIS_API_KEY ?? "";

type AisMessage = {
  MessageType?: string;
  MetaData?: { MMSI?: number; ShipName?: string; latitude?: number; longitude?: number };
  Message?: {
    PositionReport?: { Latitude?: number; Longitude?: number; Sog?: number; Cog?: number; TrueHeading?: number };
    ShipStaticData?: {
      Destination?: string;
      Type?: number;
      MaximumStaticDraught?: number;
      Dimension?: { A?: number; B?: number; C?: number; D?: number };
      ImoNumber?: number;
      CallSign?: string;
    };
  };
};

// AIS ship type codes → readable category
// https://api.vtexplorer.com/docs/ref-aistypes.html
function shipTypeFromCode(code: number): string {
  if (code >= 80 && code <= 89) return "oil_tanker";      // tankers
  if (code >= 70 && code <= 79) return "container";        // cargo
  if (code >= 60 && code <= 69) return "passenger";
  if (code >= 40 && code <= 49) return "high_speed";
  if (code >= 30 && code <= 39) return "fishing";
  if (code === 30) return "fishing";
  if (code >= 50 && code <= 59) return "special";          // tugs, dredgers, etc.
  return "vessel";
}

function classifyByName(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("tanker") || n.includes("crude") || n.includes("oil") || n.includes("lng") || n.includes("gas")) return "oil_tanker";
  if (n.includes("express") || n.includes("maersk") || n.includes("msc") || n.includes("cma") || n.includes("cargo") || n.includes("container")) return "container";
  if (n.includes("navy") || n.includes("warship") || n.includes("naval")) return "military";
  return "vessel";
}

async function collectShips(key: string, budgetMs = 6500, maxShips = 400): Promise<ShipTrackingItem[]> {
  return new Promise((resolve) => {
    const byMmsi = new Map<number, ShipTrackingItem>();
    const staticByMmsi = new Map<number, { destination: string; typeCode: number; draught: number }>();
    let settled = false;
    let ws: WebSocket;

    const merge = (): ShipTrackingItem[] => {
      const out: ShipTrackingItem[] = [];
      for (const [mmsi, ship] of byMmsi) {
        const meta = staticByMmsi.get(mmsi);
        if (meta) {
          out.push({
            ...ship,
            destination: meta.destination || ship.destination,
            shipType: meta.typeCode > 0 ? shipTypeFromCode(meta.typeCode) : ship.shipType,
          });
        } else {
          out.push(ship);
        }
      }
      return out.slice(0, maxShips);
    };

    const done = () => {
      if (settled) return;
      settled = true;
      try { ws?.close(); } catch { /* ignore */ }
      resolve(merge());
    };
    const timer = setTimeout(done, budgetMs);
    try {
      ws = new WebSocket("wss://stream.aisstream.io/v0/stream");
      ws.binaryType = "arraybuffer";
    } catch {
      clearTimeout(timer);
      resolve([]);
      return;
    }
    ws.onopen = () => {
      ws.send(JSON.stringify({
        APIKey: key,
        BoundingBoxes: [[[-90, -180], [90, 180]]],
        FilterMessageTypes: ["PositionReport", "ShipStaticData"],
      }));
    };
    ws.onmessage = (ev: MessageEvent) => {
      try {
        const rawStr = typeof ev.data === "string"
          ? ev.data
          : new TextDecoder().decode(ev.data as ArrayBuffer);
        const data = JSON.parse(rawStr) as AisMessage;
        const meta = data.MetaData ?? {};
        const mmsi = Number(meta.MMSI);
        if (!Number.isFinite(mmsi)) return;

        if (data.MessageType === "PositionReport") {
          const pr = data.Message?.PositionReport ?? {};
          const lat = Number(pr.Latitude ?? meta.latitude);
          const lng = Number(pr.Longitude ?? meta.longitude);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
          const name = String(meta.ShipName ?? "").trim() || `MMSI ${mmsi}`;
          byMmsi.set(mmsi, {
            id: `ship-${mmsi}`,
            name,
            shipType: classifyByName(name),
            speed: Number(pr.Sog ?? 0),
            heading: Number(pr.TrueHeading ?? pr.Cog ?? 0),
            destination: "",
            routeId: "ais-live",
            lat,
            lng,
          });
        } else if (data.MessageType === "ShipStaticData") {
          const sd = data.Message?.ShipStaticData ?? {};
          staticByMmsi.set(mmsi, {
            destination: String(sd.Destination ?? "").trim(),
            typeCode: Number(sd.Type ?? 0),
            draught: Number(sd.MaximumStaticDraught ?? 0),
          });
        }

        if (byMmsi.size >= maxShips) { clearTimeout(timer); done(); }
      } catch { /* ignore malformed */ }
    };
    ws.onerror = () => { clearTimeout(timer); done(); };
    ws.onclose = () => { clearTimeout(timer); done(); };
  });
}

export async function GET() {
  if (!AIS_KEY || typeof WebSocket === "undefined") {
    return NextResponse.json(
      { updatedAt: new Date().toISOString(), items: [] } satisfies ShipTrackingResponse,
      { headers: { "Cache-Control": "public, max-age=60" } },
    );
  }

  try {
    const items = await collectShips(AIS_KEY);
    return NextResponse.json(
      { updatedAt: new Date().toISOString(), items } satisfies ShipTrackingResponse,
      { headers: { "Cache-Control": "public, max-age=120, stale-while-revalidate=300" } },
    );
  } catch {
    return NextResponse.json(
      { updatedAt: new Date().toISOString(), items: [] } satisfies ShipTrackingResponse,
      { headers: { "Cache-Control": "public, max-age=60" } },
    );
  }
}
