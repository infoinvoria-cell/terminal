// Node runtime: AISstream is WebSocket-only, so we open a short-lived socket,
// collect position reports for a few seconds, then return them. (Edge runtime
// and plain REST fetch cannot talk to aisstream.io.)
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

import { NextResponse } from "next/server";
import type { ShipTrackingResponse, ShipTrackingItem } from "@/lib/globe/globe-types";

const AIS_KEY = process.env.AIS_API_KEY ?? process.env.NEXT_PUBLIC_AIS_KEY ?? "";

type AisMessage = {
  MessageType?: string;
  MetaData?: { MMSI?: number; ShipName?: string; latitude?: number; longitude?: number };
  Message?: {
    PositionReport?: { Latitude?: number; Longitude?: number; Sog?: number; Cog?: number; TrueHeading?: number };
  };
};

function classifyType(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("tanker") || n.includes("crude") || n.includes("oil")) return "oil_tanker";
  if (n.includes("express") || n.includes("maersk") || n.includes("msc") || n.includes("cma")) return "container";
  return "vessel";
}

const diag: { opened: boolean; error: string; firstMsg: string } = { opened: false, error: "", firstMsg: "" };

async function collectShips(key: string, budgetMs = 5500, maxShips = 250): Promise<ShipTrackingItem[]> {
  return new Promise((resolve) => {
    const byMmsi = new Map<number, ShipTrackingItem>();
    let settled = false;
    let ws: WebSocket;
    const done = () => {
      if (settled) return;
      settled = true;
      try { ws?.close(); } catch { /* ignore */ }
      resolve(Array.from(byMmsi.values()).slice(0, maxShips));
    };
    const timer = setTimeout(done, budgetMs);
    try {
      ws = new WebSocket("wss://stream.aisstream.io/v0/stream");
      ws.binaryType = "arraybuffer";
    } catch (e) {
      diag.error = `ctor:${String((e as Error)?.message ?? e)}`;
      clearTimeout(timer);
      resolve([]);
      return;
    }
    ws.onopen = () => {
      diag.opened = true;
      ws.send(JSON.stringify({
        APIKey: key,
        BoundingBoxes: [[[-90, -180], [90, 180]]],
      }));
    };
    ws.onmessage = (ev: MessageEvent) => {
      try {
        const rawStr = typeof ev.data === "string"
          ? ev.data
          : new TextDecoder().decode(ev.data as ArrayBuffer);
        if (!diag.firstMsg) diag.firstMsg = rawStr.slice(0, 200);
        const data = JSON.parse(rawStr) as AisMessage;
        if (data.MessageType !== "PositionReport") return;
        const meta = data.MetaData ?? {};
        const pr = data.Message?.PositionReport ?? {};
        const mmsi = Number(meta.MMSI);
        const lat = Number(pr.Latitude ?? meta.latitude);
        const lng = Number(pr.Longitude ?? meta.longitude);
        if (!Number.isFinite(mmsi) || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
        const name = String(meta.ShipName ?? "").trim() || `MMSI ${mmsi}`;
        byMmsi.set(mmsi, {
          id: `ship-${mmsi}`,
          name,
          shipType: classifyType(name),
          speed: Number(pr.Sog ?? 0),
          heading: Number(pr.TrueHeading ?? pr.Cog ?? 0),
          destination: "",
          routeId: "ais-live",
          lat,
          lng,
        });
        if (byMmsi.size >= maxShips) { clearTimeout(timer); done(); }
      } catch { /* ignore malformed */ }
    };
    ws.onerror = (e: Event) => { diag.error = `ws:${String((e as unknown as { message?: string })?.message ?? "error")}`; clearTimeout(timer); done(); };
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
      { updatedAt: new Date().toISOString(), items, _diag: diag } as ShipTrackingResponse & { _diag: unknown },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { updatedAt: new Date().toISOString(), items: [] } satisfies ShipTrackingResponse,
      { headers: { "Cache-Control": "public, max-age=60" } },
    );
  }
}
