"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { GeoEventItem, MarkerPoint, OverlayRouteItem, ShipTrackingItem } from "@/lib/globe/globe-types";
import { WORLD_PORTS } from "@/data/globe/world-ports";

// ── Static landmark data ────────────────────────────────────────────────────

const AIRPORTS = [
  { id: "jfk",  name: "JFK",            lat: 40.6413, lng: -73.7781, country: "US" },
  { id: "lhr",  name: "Heathrow",        lat: 51.4700, lng: -0.4543,  country: "GB" },
  { id: "fra",  name: "Frankfurt",       lat: 50.0379, lng: 8.5622,   country: "DE" },
  { id: "dxb",  name: "Dubai",           lat: 25.2532, lng: 55.3657,  country: "AE" },
  { id: "sin",  name: "Changi",          lat: 1.3644,  lng: 103.9915, country: "SG" },
  { id: "hkg",  name: "Hong Kong",       lat: 22.3080, lng: 113.9185, country: "HK" },
  { id: "nrt",  name: "Narita",          lat: 35.7720, lng: 140.3929, country: "JP" },
  { id: "lax",  name: "LAX",             lat: 33.9425, lng: -118.408, country: "US" },
  { id: "cdg",  name: "Charles de Gaulle",lat: 49.0097,lng: 2.5479,  country: "FR" },
  { id: "ams",  name: "Schiphol",        lat: 52.3086, lng: 4.7639,   country: "NL" },
  { id: "ist",  name: "Istanbul",        lat: 41.2606, lng: 28.7418,  country: "TR" },
  { id: "pek",  name: "Beijing Capital", lat: 40.0799, lng: 116.6031, country: "CN" },
  { id: "syd",  name: "Sydney Kingsford",lat: -33.946, lng: 151.1772, country: "AU" },
  { id: "gru",  name: "São Paulo Guarulhos",lat:-23.435,lng:-46.473,  country: "BR" },
  { id: "jnb",  name: "OR Tambo",        lat: -26.134, lng: 28.246,   country: "ZA" },
];

const MILITARY_BASES = [
  { id: "raf-lakenheath", name: "RAF Lakenheath",      lat: 52.409, lng: 0.561,    nation: "US/NATO" },
  { id: "ramstein",       name: "Ramstein AB",          lat: 49.436, lng: 7.601,    nation: "US/NATO" },
  { id: "kadena",         name: "Kadena AB",            lat: 26.358, lng: 127.768,  nation: "US" },
  { id: "andersen",       name: "Andersen AFB (Guam)",  lat: 13.584, lng: 144.930,  nation: "US" },
  { id: "diego-garcia",   name: "Diego Garcia",         lat: -7.320, lng: 72.423,   nation: "US/UK" },
  { id: "al-udeid",       name: "Al Udeid AB",          lat: 25.117, lng: 51.315,   nation: "US" },
  { id: "incirlik",       name: "Incirlik AB",          lat: 37.002, lng: 35.426,   nation: "US/NATO" },
  { id: "yokosuka",       name: "Yokosuka Naval",       lat: 35.290, lng: 139.667,  nation: "US" },
  { id: "hmeimim",        name: "Hmeimim AB (RU)",      lat: 35.401, lng: 35.948,   nation: "RU" },
  { id: "tartus",         name: "Tartus Naval (RU)",    lat: 34.892, lng: 35.887,   nation: "RU" },
  { id: "djibouti-cn",    name: "Djibouti Support (CN)",lat: 11.555, lng: 43.154,   nation: "CN" },
  { id: "sanya",          name: "Sanya Naval (CN)",     lat: 18.239, lng: 109.504,  nation: "CN" },
  { id: "norfolk",        name: "Norfolk Naval",        lat: 36.937, lng: -76.289,  nation: "US" },
  { id: "pearl-harbor",   name: "Pearl Harbor",         lat: 21.366, lng: -157.975, nation: "US" },
];

const NATION_COLOR: Record<string, string> = {
  "US": "#d4af37",
  "US/NATO": "#d4af37",
  "US/UK": "#d4af37",
  "RU": "#ef4444",
  "CN": "#f97316",
  "NATO": "#ffffff",
};

// ── Component ───────────────────────────────────────────────────────────────

export interface MapboxSatelliteViewProps {
  initialLat?: number;
  initialLng?: number;
  initialZoom?: number;
  geoEvents?: GeoEventItem[];
  ships?: ShipTrackingItem[];
  overlayRoutes?: OverlayRouteItem[];
  markers?: MarkerPoint[];
  showPorts?: boolean;
  showAirports?: boolean;
  showMilitary?: boolean;
  showShips?: boolean;
  showEvents?: boolean;
  onShipClick?: (ship: ShipTrackingItem) => void;
}

interface PopupInfo {
  lng: number;
  lat: number;
  html: string;
}

export function MapboxSatelliteView({
  initialLat = 30,
  initialLng = 20,
  initialZoom = 2,
  geoEvents = [],
  ships = [],
  overlayRoutes = [],
  markers = [],
  showPorts = true,
  showAirports = true,
  showMilitary = true,
  showShips = true,
  showEvents = true,
}: MapboxSatelliteViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const popupsRef = useRef<mapboxgl.Popup[]>([]);

  const [zoom, setZoom] = useState(initialZoom);
  const [popup, setPopup] = useState<PopupInfo | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [tokenMissing, setTokenMissing] = useState(false);

  // ── Initialize map ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) {
      setTokenMissing(true);
      return;
    }

    mapboxgl.accessToken = token;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      projection: "globe",
      center: [initialLng, initialLat],
      zoom: initialZoom,
      minZoom: 1,
      maxZoom: 22,
      attributionControl: false,
    });

    // Atmosphere for globe mode
    map.on("style.load", () => {
      map.setFog({
        color: "rgba(10, 11, 14, 1)",
        "high-color": "rgba(20, 40, 80, 1)",
        "horizon-blend": 0.04,
        "space-color": "#06070a",
        "star-intensity": 0.6,
      });
      setMapReady(true);
    });

    map.on("zoom", () => setZoom(map.getZoom()));
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");

    mapRef.current = map;
    return () => {
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Helper: create styled HTML marker ───────────────────────────────────
  const createMarkerEl = useCallback((emoji: string, color: string, size = 24) => {
    const el = document.createElement("div");
    el.style.cssText = `
      width:${size}px;height:${size}px;border-radius:50%;
      background:${color};border:2px solid rgba(255,255,255,0.8);
      display:flex;align-items:center;justify-content:center;
      font-size:${size * 0.55}px;cursor:pointer;
      box-shadow:0 0 8px ${color}88;
    `;
    el.textContent = emoji;
    return el;
  }, []);

  // ── Add all markers when map is ready ───────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    // Clear existing
    markersRef.current.forEach(m => m.remove());
    popupsRef.current.forEach(p => p.remove());
    markersRef.current = [];
    popupsRef.current = [];

    const add = (el: HTMLElement, lng: number, lat: number, popupHtml: string) => {
      const popup = new mapboxgl.Popup({
        closeButton: true,
        closeOnClick: false,
        className: "clf-mapbox-popup",
        maxWidth: "240px",
      }).setHTML(popupHtml);

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([lng, lat])
        .setPopup(popup)
        .addTo(map);

      markersRef.current.push(marker);
      popupsRef.current.push(popup);
    };

    // Ports
    if (showPorts) {
      for (const p of WORLD_PORTS) {
        const size = p.type === "mega" ? 20 : p.type === "major" ? 16 : 12;
        const el = createMarkerEl("⚓", "rgba(96,165,250,0.85)", size);
        add(el, p.lng, p.lat, `
          <div style="font-family:sans-serif;font-size:12px;">
            <b style="color:#60a5fa">⚓ ${p.name}</b><br/>
            <span style="color:#9ca3af">${p.countryIso} · ${p.type.charAt(0).toUpperCase() + p.type.slice(1)} Port</span>
            ${p.teu ? `<br/><span style="color:#d4af37">${p.teu}M TEU/yr</span>` : ""}
          </div>`);
      }
    }

    // Airports
    if (showAirports) {
      for (const a of AIRPORTS) {
        const el = createMarkerEl("✈", "rgba(52,211,153,0.85)", 18);
        add(el, a.lng, a.lat, `
          <div style="font-family:sans-serif;font-size:12px;">
            <b style="color:#34d399">✈ ${a.name}</b><br/>
            <span style="color:#9ca3af">${a.country} · Major Hub</span>
          </div>`);
      }
    }

    // Military bases
    if (showMilitary) {
      for (const b of MILITARY_BASES) {
        const color = NATION_COLOR[b.nation] ?? "#ffffff";
        const el = createMarkerEl("▲", `${color}cc`, 16);
        el.title = b.name;
        add(el, b.lng, b.lat, `
          <div style="font-family:sans-serif;font-size:12px;">
            <b style="color:${color}">▲ ${b.name}</b><br/>
            <span style="color:#9ca3af">${b.nation} Military Base</span>
          </div>`);
      }
    }

    // Ships (live AIS)
    if (showShips && ships.length > 0) {
      for (const s of ships) {
        const el = createMarkerEl("🚢", "rgba(147,51,234,0.85)", 16);
        const speed = typeof s.speed === "number" ? `${s.speed.toFixed(1)} kn` : "—";
        const dest = s.destination || "—";
        add(el, s.lng, s.lat, `
          <div style="font-family:sans-serif;font-size:12px;">
            <b style="color:#a855f7">🚢 ${s.name}</b><br/>
            <span style="color:#9ca3af">${s.shipType}</span><br/>
            <span style="color:#d4af37">Speed: ${speed}</span><br/>
            <span style="color:#9ca3af">Dest: ${dest}</span>
          </div>`);
      }
    }

    // Geo events (earthquakes, conflicts, wildfires)
    if (showEvents && geoEvents.length > 0) {
      for (const e of geoEvents) {
        const emoji = e.type === "earthquake" ? "🌋" : e.type === "conflict" ? "⚔️" : e.type === "wildfire" ? "🔥" : "📍";
        const color = e.color ?? (e.type === "earthquake" ? "#f97316" : e.type === "conflict" ? "#ef4444" : "#f59e0b");
        const el = createMarkerEl(emoji, `${color}cc`, 14);
        add(el, e.lng, e.lat, `
          <div style="font-family:sans-serif;font-size:12px;">
            <b style="color:${color}">${emoji} ${e.location}</b><br/>
            <span style="color:#9ca3af">${e.type} · ${e.severity}</span>
            ${e.headline ? `<br/><span style="color:#e5e7eb;font-size:11px">${e.headline.slice(0, 80)}…</span>` : ""}
          </div>`);
      }
    }

    // Asset markers from Globe
    for (const m of markers.filter(mk => mk.kind === "asset" || mk.kind === "region")) {
      const el = createMarkerEl("📍", "rgba(212,175,55,0.85)", 14);
      add(el, m.lng, m.lat, `
        <div style="font-family:sans-serif;font-size:12px;">
          <b style="color:#d4af37">${m.label ?? m.name}</b><br/>
          <span style="color:#9ca3af">${m.category ?? ""}</span>
        </div>`);
    }
  }, [mapReady, showPorts, showAirports, showMilitary, showShips, showEvents, ships, geoEvents, markers, createMarkerEl]);

  // ── Overlay routes as Mapbox line layers ─────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || overlayRoutes.length === 0) return;

    const SOURCE = "clf-routes";
    if (map.getSource(SOURCE)) {
      (map.getSource(SOURCE) as mapboxgl.GeoJSONSource).setData({
        type: "FeatureCollection",
        features: overlayRoutes.map(r => ({
          type: "Feature" as const,
          properties: { name: r.name, color: r.color ?? "#d4af37" },
          geometry: {
            type: "LineString" as const,
            coordinates: r.path.map(pt => [pt.lng, pt.lat]),
          },
        })),
      });
      return;
    }

    map.addSource(SOURCE, {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: overlayRoutes.map(r => ({
          type: "Feature" as const,
          properties: { name: r.name, color: r.color ?? "#d4af37" },
          geometry: {
            type: "LineString" as const,
            coordinates: r.path.map(pt => [pt.lng, pt.lat]),
          },
        })),
      },
    });

    map.addLayer({
      id: "clf-routes-line",
      type: "line",
      source: SOURCE,
      paint: {
        "line-color": ["get", "color"],
        "line-width": 1.5,
        "line-opacity": 0.7,
      },
    });
  }, [mapReady, overlayRoutes]);

  // ── Token missing state ──────────────────────────────────────────────────
  if (tokenMissing) {
    return (
      <div style={{
        height: "100%", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        background: "#06070a", color: "#fff", padding: 24, textAlign: "center",
      }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🛰</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#d4af37", marginBottom: 8 }}>
          Mapbox Token erforderlich
        </div>
        <div style={{ fontSize: 13, color: "#9ca3af", maxWidth: 300, lineHeight: 1.6 }}>
          Füge deinen Mapbox-Token als <code style={{ color: "#60a5fa" }}>NEXT_PUBLIC_MAPBOX_TOKEN</code> in{" "}
          <code style={{ color: "#60a5fa" }}>.env.local</code> ein.
          <br /><br />
          Kostenlosen Token bei{" "}
          <span style={{ color: "#d4af37" }}>mapbox.com</span> holen
          (50.000 loads/Monat free).
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "relative", height: "100%", width: "100%", background: "#06070a" }}>
      {/* Mapbox container */}
      <div ref={containerRef} style={{ height: "100%", width: "100%" }} />

      {/* Zoom indicator */}
      <div style={{
        position: "absolute", bottom: 8, left: 8, zIndex: 10,
        background: "rgba(6,7,10,0.8)",
        border: "1px solid rgba(212,175,55,0.2)",
        borderRadius: 6, padding: "3px 8px",
        fontSize: 11, color: "rgba(255,255,255,0.5)", fontVariantNumeric: "tabular-nums",
      }}>
        z{zoom.toFixed(1)}
      </div>

      {/* Legend */}
      <div style={{
        position: "absolute", top: 8, left: 8, zIndex: 10,
        background: "rgba(6,7,10,0.85)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 8, padding: "8px 10px",
        display: "flex", flexDirection: "column", gap: 4,
        fontSize: 11, color: "rgba(255,255,255,0.7)",
      }}>
        {showPorts     && <div>⚓ <span style={{ color: "#60a5fa" }}>Ports</span></div>}
        {showAirports  && <div>✈ <span style={{ color: "#34d399" }}>Airports</span></div>}
        {showMilitary  && <div>▲ <span style={{ color: "#d4af37" }}>Military</span></div>}
        {showShips && ships.length > 0 && <div>🚢 <span style={{ color: "#a855f7" }}>Ships ({ships.length})</span></div>}
        {showEvents && geoEvents.length > 0 && <div>⚡ <span style={{ color: "#f59e0b" }}>Events</span></div>}
      </div>

      {/* Mapbox popup CSS injection */}
      <style>{`
        .clf-mapbox-popup .mapboxgl-popup-content {
          background: rgba(10,11,14,0.95) !important;
          border: 1px solid rgba(212,175,55,0.25) !important;
          border-radius: 8px !important;
          padding: 10px 12px !important;
          color: #e5e7eb;
          box-shadow: 0 4px 24px rgba(0,0,0,0.7) !important;
        }
        .clf-mapbox-popup .mapboxgl-popup-close-button {
          color: rgba(255,255,255,0.4);
          font-size: 16px;
          padding: 2px 6px;
        }
        .clf-mapbox-popup .mapboxgl-popup-tip { display: none; }
        .mapboxgl-ctrl-group {
          background: rgba(10,11,14,0.9) !important;
          border: 1px solid rgba(255,255,255,0.1) !important;
        }
        .mapboxgl-ctrl-group button {
          background: transparent !important;
          color: #fff !important;
        }
        .mapboxgl-ctrl-group button:hover { background: rgba(255,255,255,0.1) !important; }
        .mapboxgl-ctrl-attrib { display: none; }
      `}</style>
    </div>
  );
}
