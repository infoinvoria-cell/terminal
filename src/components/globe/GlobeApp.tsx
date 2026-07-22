"use client";

import { lazy, useCallback, useEffect, useMemo, useRef, useState, startTransition, Suspense } from "react";
import Image from "next/image";
import { Maximize2, Minimize2 } from "lucide-react";

import { GlobeCanvas } from "@/components/globe/GlobeCanvas";
import { KpiGrid } from "@/components/globe/KpiGrid";
import { MacroFundamentalsPanel } from "@/components/globe/MacroFundamentalsPanel";
import { MiniWorldMap } from "@/components/globe/MiniWorldMap";
import { NewsColumns } from "@/components/globe/NewsColumns";
import { SettingsPanel } from "@/components/globe/SettingsPanel";
import { AssetHeatmapPanel } from "@/components/globe/AssetHeatmapPanel";
import { SignalDetailPanel } from "@/components/globe/SignalDetailPanel";
import { GlobeApi, subscribeApiLoading } from "@/lib/globe/api";
import { designTokens } from "@/lib/globe/designTokens";
import { buildGlobeSeasonalityAnalysis } from "@/lib/globe/globeSeasonality";
import { iconUrlForAsset } from "@/lib/globe/icons";
import { buildDisplayMarkers } from "@/lib/globe/markers";
import { DEFAULT_GLOBE_STATE, hasPersistedGlobeState, loadInitialGlobeState, persistGlobeState } from "@/lib/globe/state";
import type {
  AssetRegionHighlightResponse,
  AssetSignalDetailResponse,
  AssetItem,
  CommodityRegionItem,
  CrossPairPath,
  EvaluationResponse,
  GeoEventItem,
  GlobalLiquidityRegionItem,
  GlobalRiskRegionItem,
  MarkerPoint,
  NewsItem,
  OverlayMode,
  OverlayRouteItem,
  OverlayToggleState,
  PolicyRateCountryEntry,
  SeasonalityResponse,
  ShipTrackingItem,
  TimeseriesResponse,
} from "@/lib/globe/globe-types";

const CandleChart = lazy(() => import("@/components/globe/charts/CandleChart"));
const EvaluationChart = lazy(() => import("@/components/globe/charts/EvaluationChart"));
const GlobeSeasonalityChart = lazy(() => import("@/components/globe/charts/GlobeSeasonalityChart"));
const ASSET_USAGE_STORAGE_KEY = "clf_globe_asset_usage_v1";
const DATA_SOURCE_STORAGE_KEY = "clf_globe_data_source_v2";
const GOLD_THEME_STORAGE_KEY = "clf_globe_gold_theme_v1";
const GOLD_PRIMARY = "#e2ca7a";

const GLOBE_ICON_MAP: Record<string, string> = {
  gold: "gold.png", silver: "silver.png", copper: "Kupfer.webp",
  palladium: "palladium.png", platinum: "platinum.png",
  oil: "crude_oil.png", gas: "crude_oil.png",
  corn: "corn.png", wheat: "wheat.webp", cocoa: "cocoa.webp",
  soy: "soybeans.png", coffee: "coffee.png", sugar: "sugar.png",
  cotton: "cotton.png", oj: "orange_juice.jpg",
  us: "es_s&p.png", de: "dax.png", gb: "gbpusd.png",
  eu: "eurusd.png", jp: "jpy.png", au: "aud.png",
  ca: "cad.png", ch: "chf.png",
  btc: "bitcoin.png", eth: "ethereum.png",
  aapl: "apple.png", msft: "microsoft.png", nvda: "nvidia.png",
  meta: "meta.png", amzn: "amazon.png", googl: "google.png",
};
const ALLOWED_OVERLAYS: OverlayMode[] = [
  "none",
  "geo_events",
  "news_geo",
  "conflicts",
  "wildfires",
  "earthquakes",
  "ship_tracking",
  "oil_routes",
  "container_traffic",
  "commodity_regions",
  "global_risk_layer",
  "global_liquidity_map",
  "shipping_disruptions",
  "commodity_stress_map",
  "regional_asset_highlight",
];
const OVERLAY_CACHE_MS: Record<keyof OverlayToggleState, number> = {
  assets: 12 * 60 * 60 * 1000,
  earthquakes: 10 * 60 * 1000,
  conflicts: 60 * 60 * 1000,
  wildfires: 30 * 60 * 1000,
  shipTracking: 5 * 60 * 1000,
  oilRoutes: 3 * 60 * 60 * 1000,
  containerTraffic: 3 * 60 * 60 * 1000,
  commodityRegions: 24 * 60 * 60 * 1000,
  globalRiskLayer: 3 * 60 * 60 * 1000,
  globalLiquidityMap: 60 * 60 * 1000,
  shippingDisruptions: 10 * 60 * 1000,
  commodityStressMap: 2 * 60 * 60 * 1000,
  regionalAssetHighlight: 2 * 60 * 60 * 1000,
  locations: 24 * 60 * 60 * 1000,
  liveSignals: 5 * 60 * 1000,
};
const MARKET_CACHE_MS = 40 * 60 * 1000;
const NEWS_CACHE_MS = 10 * 60 * 1000;
const VALUATION_CACHE_MS = 40 * 60 * 1000;
const SEASONALITY_CACHE_MS = 10 * 365 * 24 * 60 * 60 * 1000;
const SHELL_REFRESH_MS = 40 * 60 * 1000;
const CHART_REFRESH_MS = 5 * 60 * 1000;
const GLOBE_MARKER_UPDATE_MS = 30 * 1000;
const GLOBE_TIMER_TICK_MS = 30 * 1000;
const OVERLAY_ACTIVATION_PRIORITY: Array<keyof OverlayToggleState> = [
  "globalLiquidityMap",
  "globalRiskLayer",
  "shippingDisruptions",
  "commodityStressMap",
  "regionalAssetHighlight",
  "shipTracking",
  "oilRoutes",
  "containerTraffic",
  "commodityRegions",
  "earthquakes",
  "conflicts",
  "wildfires",
];

function usePageActive() { return true; }

type DeferredSections = {
  news: boolean;
  valuation: boolean;
  seasonality: boolean;
  heatmap: boolean;
  macro: boolean;
};
const DEFAULT_OVERLAY_STATE: OverlayToggleState = {
  assets: true,
  earthquakes: false,
  conflicts: false,
  wildfires: false,
  shipTracking: false,
  oilRoutes: false,
  containerTraffic: false,
  commodityRegions: false,
  globalRiskLayer: false,
  globalLiquidityMap: false,
  shippingDisruptions: false,
  commodityStressMap: false,
  regionalAssetHighlight: false,
  liveSignals: false,
  locations: false,
};
const OVERLAY_LOADING_KEYS: Array<keyof OverlayToggleState> = [
  "assets",
  "earthquakes",
  "conflicts",
  "wildfires",
  "shipTracking",
  "oilRoutes",
  "containerTraffic",
  "commodityRegions",
  "globalRiskLayer",
  "globalLiquidityMap",
  "shippingDisruptions",
  "commodityStressMap",
  "regionalAssetHighlight",
];
const OVERLAY_LOADING_LABELS: Record<keyof OverlayToggleState, string> = {
  assets: "Loading assets overlay...",
  earthquakes: "Loading earthquakes...",
  conflicts: "Loading conflicts...",
  wildfires: "Loading wildfires...",
  shipTracking: "Loading ship tracking...",
  oilRoutes: "Loading oil routes...",
  containerTraffic: "Loading container traffic...",
  commodityRegions: "Loading commodity regions...",
  globalRiskLayer: "Loading risk layer...",
  globalLiquidityMap: "Loading liquidity map...",
  shippingDisruptions: "Loading shipping disruptions...",
  commodityStressMap: "Loading commodity stress map...",
  regionalAssetHighlight: "Loading regional highlight...",
  locations: "Loading locations...",
  liveSignals: "Loading live signals...",
};

function defaultEnabledIds(assets: AssetItem[]): string[] {
  return assets
    .filter((a) => a.category !== "Cross Pairs" && a.showOnGlobe !== false && a.defaultEnabled !== false)
    .map((a) => a.id);
}

function normalizeEnabledIds(ids: string[], assets: AssetItem[], hasPersisted: boolean): string[] {
  if (!assets.length) return [];
  const valid = new Set(assets.map((a) => a.id));
  const filtered = ids.filter((id) => valid.has(id));
  if (filtered.length) return filtered;
  const defaults = defaultEnabledIds(assets);
  if (defaults.length) return defaults;
  if (hasPersisted && !filtered.length) return defaults;
  return defaults;
}

type SharedTimeRange = {
  visibleSpan: number;
  rightOffset: number;
};
type GlobeRotateMode = "off" | "slow" | "normal";
type DataSource = "tradingview" | "dukascopy" | "yahoo";
type RecentSignal = {
  direction: "bullish" | "bearish";
  lines: string[];
  ageBars: number;
} | null;

function clampNum(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Number(v)));
}

function finiteOr(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function currentUtcDayOfYear(): number {
  const now = new Date();
  const start = Date.UTC(now.getUTCFullYear(), 0, 1);
  const current = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor((current - start) / 86_400_000) + 1;
}

function formatSeasonDay(day: number): string {
  const base = new Date(Date.UTC(2024, 0, 1));
  base.setUTCDate(Math.max(1, Math.min(366, Math.round(day))));
  return base.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = String(hex || "").replace("#", "");
  const norm = clean.length === 3
    ? clean.split("").map((c) => `${c}${c}`).join("")
    : clean.padEnd(6, "0").slice(0, 6);
  const r = parseInt(norm.slice(0, 2), 16);
  const g = parseInt(norm.slice(2, 4), 16);
  const b = parseInt(norm.slice(4, 6), 16);
  return [Number.isFinite(r) ? r : 0, Number.isFinite(g) ? g : 0, Number.isFinite(b) ? b : 0];
}

function mixHex(a: string, b: string, t: number): string {
  const x = clampNum(t, 0, 1);
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const r = Math.round(ar + (br - ar) * x);
  const g = Math.round(ag + (bg - ag) * x);
  const bch = Math.round(ab + (bb - ab) * x);
  return `rgb(${r}, ${g}, ${bch})`;
}

function buildMiniSparkPaths(values: number[]): { line: string; area: string } {
  const clean = values.filter((value) => Number.isFinite(value));
  if (clean.length < 2) return { line: "", area: "" };

  const width = 100;
  const height = 28;
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const range = Math.max(1e-6, max - min);
  const points = clean.map((value, index) => {
    const x = (index / Math.max(1, clean.length - 1)) * width;
    const y = height - ((value - min) / range) * height;
    return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
  });
  const line = points.join(" ");
  return {
    line,
    area: `${line} L${width} ${height} L0 ${height} Z`,
  };
}

function isStale(ts: number | null | undefined, ttlMs: number): boolean {
  if (!Number.isFinite(Number(ts))) return true;
  return Date.now() - Number(ts) > ttlMs;
}

function mapOverlayKeyToMode(key: keyof OverlayToggleState): OverlayMode {
  if (key === "earthquakes") return "earthquakes";
  if (key === "conflicts") return "conflicts";
  if (key === "wildfires") return "wildfires";
  if (key === "shipTracking") return "ship_tracking";
  if (key === "oilRoutes") return "oil_routes";
  if (key === "containerTraffic") return "container_traffic";
  if (key === "commodityRegions") return "commodity_regions";
  if (key === "globalRiskLayer") return "global_risk_layer";
  if (key === "globalLiquidityMap") return "global_liquidity_map";
  if (key === "shippingDisruptions") return "shipping_disruptions";
  if (key === "commodityStressMap") return "commodity_stress_map";
  if (key === "regionalAssetHighlight") return "regional_asset_highlight";
  return "none";
}

function overlayCacheMs(key: keyof OverlayToggleState): number {
  return OVERLAY_CACHE_MS[key] ?? (30 * 60 * 1000);
}

// Suppress unused variable warnings for unused constants
void MARKET_CACHE_MS;
void mixHex;

// ── Slim news column ────────────────────────────────────────────
type GlobeNewsColumnProps = { items: import("@/lib/globe/globe-types").NewsItem[]; title: string; goldThemeEnabled?: boolean };

function timeAgo(iso: string | undefined): string {
  if (!iso) return "";
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diff < 1) return "now";
  if (diff < 60) return `${diff}m`;
  if (diff < 1440) return `${Math.floor(diff / 60)}h`;
  return `${Math.floor(diff / 1440)}d`;
}

function GlobeNewsColumn({ items }: GlobeNewsColumnProps) {
  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <div className="no-scrollbar min-h-0 flex-1 space-y-[3px] overflow-y-auto overflow-x-hidden px-2 pt-1 pb-8">
        {items.length === 0 && (
          <div className="pt-6 text-center text-[11px] text-white/20">No news</div>
        )}
        {items.map((item, i) => {
          const ago = timeAgo(item.publishedAt ?? item.timestamp);
          const domain = item.sourceDomain ?? item.source?.split(" ")[0] ?? "";
          return (
            <a
              key={String(item.newsId || item.url || i)}
              href={item.url || "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="group block rounded-[10px] px-2.5 py-2 transition-colors"
              style={{ background: "rgba(255,255,255,0.025)" }}
            >
              <div className="mb-1 flex items-center gap-1.5">
                {domain && (
                  <span className="rounded-[4px] px-1.5 py-[1px] text-[9px] font-semibold uppercase tracking-wide"
                    style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.5)" }}>
                    {domain}
                  </span>
                )}
                {item.country && (
                  <span className="text-[9px] text-white/30">{item.country}</span>
                )}
                {ago && (
                  <span className="ml-auto text-[9px] text-white/25">{ago}</span>
                )}
              </div>
              <p className="text-[11px] font-medium leading-snug text-white/80 group-hover:text-white line-clamp-2">
                {item.title}
              </p>
              {item.description && (
                <p className="mt-0.5 text-[10px] leading-snug text-white/35 line-clamp-2">
                  {item.description}
                </p>
              )}
            </a>
          );
        })}
      </div>
      {/* Black fade at bottom instead of scrollbar */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8"
        style={{ background: "linear-gradient(to bottom, transparent, #06070a)" }} />
    </div>
  );
}

// ── Overlay control panel ────────────────────────────────────────
const OVERLAY_EMOJI: Record<string, string> = {
  liveSignals: "⚡",
  locations: "📌",
  assets: "📍",
  earthquakes: "🌋",
  conflicts: "⚔️",
  wildfires: "🔥",
  shipTracking: "🚢",
  oilRoutes: "🛢️",
  containerTraffic: "📦",
  commodityRegions: "🌾",
  globalRiskLayer: "⚠️",
  globalLiquidityMap: "💧",
  shippingDisruptions: "⛔",
  commodityStressMap: "📈",
  regionalAssetHighlight: "🗺️",
};
const OVERLAY_LABELS: Record<string, string> = {
  liveSignals: "Live Signale",
  locations: "Standorte",
  assets: "Assets",
  earthquakes: "Earthquakes",
  conflicts: "Conflicts",
  wildfires: "Wildfires",
  shipTracking: "Ship Tracking",
  oilRoutes: "Oil Routes",
  containerTraffic: "Container Traffic",
  commodityRegions: "Commodity Regions",
  globalRiskLayer: "Risk Layer",
  globalLiquidityMap: "Liquidity Map",
  shippingDisruptions: "Ship Disruptions",
  commodityStressMap: "Commodity Stress",
  regionalAssetHighlight: "Regional Highlight",
};
type GlobeOverlayControlProps = {
  overlayState: import("@/lib/globe/globe-types").OverlayToggleState;
  overlayLoadingState: Partial<Record<keyof import("@/lib/globe/globe-types").OverlayToggleState, boolean>>;
  onToggleOverlay: (key: keyof import("@/lib/globe/globe-types").OverlayToggleState) => void;
};
function GlobeOverlayControl({ overlayState, overlayLoadingState, onToggleOverlay }: GlobeOverlayControlProps) {
  const keys = Object.keys(OVERLAY_LABELS) as Array<keyof import("@/lib/globe/globe-types").OverlayToggleState>;
  return (
    <div className="h-full overflow-y-auto p-1.5"
      style={{ scrollbarWidth: "none" }}>
      <div className="grid gap-1" style={{ gridTemplateColumns: "1fr 1fr" }}>
        {keys.map((key) => {
          const active = Boolean(overlayState[key]);
          const loading = Boolean(overlayLoadingState?.[key]);
          return (
            <button
              key={key}
              type="button"
              onClick={() => onToggleOverlay(key)}
              aria-pressed={active}
              className="flex flex-col items-start gap-0.5 rounded-[8px] px-1.5 py-1.5 text-left transition"
              style={{
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
                background: active ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.03)",
                border: `1px solid ${active ? "rgba(255,255,255,0.20)" : "rgba(255,255,255,0.05)"}`,
              }}
            >
              <span style={{ fontSize: 11, lineHeight: 1 }}>{OVERLAY_EMOJI[key] ?? "◦"}</span>
              <span className="mt-0.5 w-full truncate text-[9px] font-medium leading-tight"
                style={{ color: active ? "#ffffff" : "rgba(255,255,255,0.38)" }}>
                {OVERLAY_LABELS[key] ?? key}
              </span>
              {loading && <span className="text-[8px] text-white/25">…</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function GlobeApp() {
  const isPageActive = usePageActive();
  const initialPersisted = useMemo(loadInitialGlobeState, []);
  const hasPersisted = useMemo(hasPersistedGlobeState, []);
  const isEmbedded = useMemo(() => {
    if (typeof window === "undefined") return true;
    try {
      const params = new URLSearchParams(window.location.search || "");
      return params.get("embedded") === "1";
    } catch (_err) {
      return true;
    }
  }, []);
  const defaultsAppliedRef = useRef(false);
  const initialOverlay = useMemo<OverlayMode>(() => {
    const candidate = initialPersisted.selectedOverlay;
    return ALLOWED_OVERLAYS.includes(candidate) ? candidate : "none";
  }, [initialPersisted.selectedOverlay]);
  const initialOverlayState = useMemo<OverlayToggleState>(() => {
    const base = { ...DEFAULT_OVERLAY_STATE };
    if (initialOverlay === "conflicts") base.conflicts = true;
    if (initialOverlay === "wildfires") base.wildfires = true;
    if (initialOverlay === "earthquakes") base.earthquakes = true;
    if (initialOverlay === "ship_tracking") base.shipTracking = true;
    if (initialOverlay === "oil_routes") base.oilRoutes = true;
    if (initialOverlay === "container_traffic") base.containerTraffic = true;
    if (initialOverlay === "commodity_regions") base.commodityRegions = true;
    if (initialOverlay === "global_risk_layer") base.globalRiskLayer = true;
    if (initialOverlay === "global_liquidity_map") base.globalLiquidityMap = true;
    if (initialOverlay === "shipping_disruptions") base.shippingDisruptions = true;
    if (initialOverlay === "commodity_stress_map") base.commodityStressMap = true;
    if (initialOverlay === "regional_asset_highlight") base.regionalAssetHighlight = true;
    return base;
  }, [initialOverlay]);

  const [assets, setAssets] = useState<AssetItem[]>([]);
  const assetsRef = useRef<AssetItem[]>([]);
  useEffect(() => { assetsRef.current = assets; }, [assets]);
  const [globalNews, setGlobalNews] = useState<NewsItem[]>([]);
  const [assetNews, setAssetNews] = useState<NewsItem[]>([]);

  const [selectedAssetId, setSelectedAssetId] = useState(initialPersisted.selectedAssetId || "");
  const [focusAssetId, setFocusAssetId] = useState<string | null>(null);
  const [focusLocation, setFocusLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [sharedTimeRange, setSharedTimeRange] = useState<SharedTimeRange | null>(null);
  const [chartTimeframe, setChartTimeframe] = useState<"M" | "W" | "D" | "4H" | "1H">("D");
  const [enabledAssets, setEnabledAssets] = useState<string[]>(initialPersisted.enabledAssets ?? []);
  const [overlayState, setOverlayState] = useState<OverlayToggleState>(initialOverlayState);
  const [selectedOverlay, setSelectedOverlay] = useState<OverlayMode>(initialOverlay);
  const [camera, setCamera] = useState(initialPersisted.camera ?? DEFAULT_GLOBE_STATE.camera);
  const [markerZoomLevel, setMarkerZoomLevel] = useState<number>(() => {
    const altitude = Number(initialPersisted.camera?.altitude ?? DEFAULT_GLOBE_STATE.camera.altitude ?? 1.8);
    return Math.round(altitude * 3) / 3;
  });
  const markerAltitudeRef = useRef<number>(Number(initialPersisted.camera?.altitude ?? DEFAULT_GLOBE_STATE.camera.altitude ?? 1.8));
  const [globeRotateMode, setGlobeRotateMode] = useState<GlobeRotateMode>("off");
  const [visualLoopEnabled, setVisualLoopEnabled] = useState(false);
  const [visualLoopTick, setVisualLoopTick] = useState(0);
  const [dataSource, setDataSource] = useState<DataSource>(() => {
    if (typeof window === "undefined") return "tradingview";
    try {
      const raw = (window.localStorage.getItem(DATA_SOURCE_STORAGE_KEY) ?? "").trim().toLowerCase();
      if (raw === "tradingview" || raw === "yahoo" || raw === "dukascopy") {
        return raw;
      }
    } catch (_err) {
      // no-op
    }
    return "tradingview";
  });
  const [goldThemeEnabled, setGoldThemeEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      const params = new URLSearchParams(window.location.search || "");
      const qpTheme = String(params.get("theme") || "").trim().toLowerCase();
      if (qpTheme === "black" || qpTheme === "gold") return true;
      if (qpTheme === "blue") return false;
    } catch (_err) {
      // no-op
    }
    try {
      return window.localStorage.getItem(GOLD_THEME_STORAGE_KEY) === "1";
    } catch (_err) {
      return false;
    }
  });
  const [categoryEnabled, setCategoryEnabled] = useState<Record<string, boolean>>({});

  const [timeseries, setTimeseries] = useState<TimeseriesResponse | null>(null);
  const [evaluation, setEvaluation] = useState<EvaluationResponse | null>(null);
  const [seasonality, setSeasonality] = useState<SeasonalityResponse | null>(null);
  const [signalDetail, setSignalDetail] = useState<AssetSignalDetailResponse | null>(null);
  const [geoEvents, setGeoEvents] = useState<GeoEventItem[]>([]);
  const [conflictEvents, setConflictEvents] = useState<GeoEventItem[]>([]);
  const [wildfireEvents, setWildfireEvents] = useState<GeoEventItem[]>([]);
  const [earthquakeEvents, setEarthquakeEvents] = useState<GeoEventItem[]>([]);
  const [shipTracking, setShipTracking] = useState<ShipTrackingItem[]>([]);
  const [oilRoutes, setOilRoutes] = useState<OverlayRouteItem[]>([]);
  const [containerRoutes, setContainerRoutes] = useState<OverlayRouteItem[]>([]);
  const [commodityRegions, setCommodityRegions] = useState<CommodityRegionItem[]>([]);
  const [globalRiskRegions, setGlobalRiskRegions] = useState<GlobalRiskRegionItem[]>([]);
  const [globalLiquidityRegions, setGlobalLiquidityRegions] = useState<GlobalLiquidityRegionItem[]>([]);
  const [shippingDisruptionEvents, setShippingDisruptionEvents] = useState<GeoEventItem[]>([]);
  const [shippingDisruptionRoutes, setShippingDisruptionRoutes] = useState<OverlayRouteItem[]>([]);
  const [commodityStressRegions, setCommodityStressRegions] = useState<CommodityRegionItem[]>([]);
  const [regionHighlight, setRegionHighlight] = useState<AssetRegionHighlightResponse | null>(null);
  const [recentSignal, setRecentSignal] = useState<RecentSignal>(null);
  const [deferredSections, setDeferredSections] = useState<DeferredSections>({
    news: true,
    valuation: true,
    seasonality: true,
    heatmap: false,
    macro: true,
  });
  const sharedTimeRangeRef = useRef<SharedTimeRange | null>(null);
  const panelCacheRef = useRef<Record<string, {
    timeseries: TimeseriesResponse | null;
    evaluation: EvaluationResponse | null;
    seasonality: SeasonalityResponse | null;
    assetNews: NewsItem[];
    signalDetail: AssetSignalDetailResponse | null;
    timeseriesUpdatedAt: number;
    evaluationUpdatedAt: number;
    seasonalityUpdatedAt: number;
    assetNewsUpdatedAt: number;
    signalDetailUpdatedAt: number;
  }>>({});
  const globalNewsCacheRef = useRef<{ items: NewsItem[]; updatedAt: number } | null>(null);
  const overlayLastUpdatedAtRef = useRef<Record<string, number>>({});
  const overlayLoadingCountRef = useRef<Record<string, number>>({});
  const assetRegionCacheRef = useRef<Record<string, { updatedAt: number; payload: AssetRegionHighlightResponse }>>({});
  const panelRequestTokenRef = useRef(0);
  const shellLastUpdatedRef = useRef<{ assets: number }>({ assets: 0 });

  const [shellLoading, setShellLoading] = useState(true);
  const [panelLoading, setPanelLoading] = useState(false);
  const [apiLoading, setApiLoading] = useState<{ active: boolean; count: number; labels: string[] }>({
    active: false,
    count: 0,
    labels: [],
  });
  const [overlayLoadingState, setOverlayLoadingState] = useState<Partial<Record<keyof OverlayToggleState, boolean>>>({});
  const [isGlobeFullscreen, setIsGlobeFullscreen] = useState(false);
  const [isChartStackFullscreen, setIsChartStackFullscreen] = useState(false);
  const globeShellRef = useRef<HTMLDivElement | null>(null);
  const [assetUsage, setAssetUsage] = useState<Record<string, number>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = window.localStorage.getItem(ASSET_USAGE_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      if (parsed && typeof parsed === "object") return parsed as Record<string, number>;
    } catch (_err) {
      // no-op
    }
    return {};
  });

  const markAssetUsage = useCallback((assetId: string) => {
    const key = String(assetId || "").trim().toLowerCase();
    if (!key) return;
    setAssetUsage((prev) => {
      const next = { ...prev, [key]: Number(prev[key] ?? 0) + 1 };
      try {
        window.localStorage.setItem(ASSET_USAGE_STORAGE_KEY, JSON.stringify(next));
      } catch (_err) {
        // no-op
      }
      return next;
    });
  }, []);

  const beginOverlayLoad = useCallback((key: keyof OverlayToggleState) => {
    const name = String(key);
    const current = Number(overlayLoadingCountRef.current[name] ?? 0);
    overlayLoadingCountRef.current[name] = current + 1;
    if (current === 0) {
      setOverlayLoadingState((prev) => ({ ...prev, [key]: true }));
    }
  }, []);

  const endOverlayLoad = useCallback((key: keyof OverlayToggleState) => {
    const name = String(key);
    const current = Number(overlayLoadingCountRef.current[name] ?? 0);
    const nextCount = Math.max(0, current - 1);
    overlayLoadingCountRef.current[name] = nextCount;
    if (nextCount === 0) {
      setOverlayLoadingState((prev) => ({ ...prev, [key]: false }));
    }
  }, []);

  const withOverlayLoad = useCallback(
    (key: keyof OverlayToggleState, job: Promise<void>): Promise<void> => {
      beginOverlayLoad(key);
      return job.finally(() => {
        endOverlayLoad(key);
      });
    },
    [beginOverlayLoad, endOverlayLoad],
  );

  const activateSection = useCallback((key: keyof DeferredSections) => {
    setDeferredSections((prev) => (prev[key] ? prev : { ...prev, [key]: true }));
  }, []);

  const refreshShellData = useCallback((setLoading = false) => {
    if (setLoading) setShellLoading(true);
    return Promise.allSettled([GlobeApi.getAssets()])
      .then(([assetsRes]) => {
        if (assetsRes.status === "fulfilled") {
          setAssets(assetsRes.value.items ?? []);
          shellLastUpdatedRef.current.assets = Date.now();
          return;
        }
        // eslint-disable-next-line no-console
        console.error("Assets load failed:", assetsRes.reason);
      })
      .finally(() => {
        if (setLoading) setShellLoading(false);
      });
  }, []);

  const loadGlobalNews = useCallback((force = false) => {
    const cached = globalNewsCacheRef.current;
    if (!force && cached && !isStale(cached.updatedAt, NEWS_CACHE_MS)) {
      setGlobalNews(cached.items);
      return Promise.resolve();
    }
    return GlobeApi.getGlobalNews()
      .then((res) => {
        const items = res.items ?? [];
        setGlobalNews(items);
        globalNewsCacheRef.current = {
          items,
          updatedAt: Date.now(),
        };
      })
      .catch((err: unknown) => {
        // eslint-disable-next-line no-console
        console.error("Global news load failed:", err);
      });
  }, []);

  type PanelLoadFlags = {
    force?: boolean;
    forceTimeseriesRefresh?: boolean;
    includeEvaluation?: boolean;
    includeSeasonality?: boolean;
    includeAssetNews?: boolean;
    includeSignalDetail?: boolean;
  };

  const loadPanelData = useCallback((assetId: string, source: DataSource, flags: PanelLoadFlags = {}) => {
    const safeAssetId = String(assetId || "").trim();
    if (!safeAssetId) return Promise.resolve();
    const cacheKey = `${source}:${safeAssetId.toLowerCase()}`;
    const cached = panelCacheRef.current[cacheKey];
    const force = Boolean(flags.force);
    const includeEvaluation = Boolean(flags.includeEvaluation);
    const includeSeasonality = Boolean(flags.includeSeasonality);
    const includeAssetNews = Boolean(flags.includeAssetNews);
    const includeSignalDetail = Boolean(flags.includeSignalDetail);
    const forceTimeseriesRefresh = Boolean(flags.forceTimeseriesRefresh);

    const timeseriesStale = force || forceTimeseriesRefresh || !cached || !cached.timeseries || isStale(cached.timeseriesUpdatedAt, CHART_REFRESH_MS);
    const evaluationStale = includeEvaluation && (force || !cached || !cached.evaluation || isStale(cached.evaluationUpdatedAt, VALUATION_CACHE_MS));
    const seasonalityStale = includeSeasonality && (force || !cached || !cached.seasonality || isStale(cached.seasonalityUpdatedAt, SEASONALITY_CACHE_MS));
    const assetNewsStale = includeAssetNews && (force || !cached || !cached.assetNews?.length || isStale(cached.assetNewsUpdatedAt, NEWS_CACHE_MS));
    const signalDetailStale = includeSignalDetail && (force || !cached || !cached.signalDetail || isStale(cached.signalDetailUpdatedAt, VALUATION_CACHE_MS));

    if (!timeseriesStale && !evaluationStale && !seasonalityStale && !assetNewsStale && !signalDetailStale) {
      if (cached) {
        setTimeseries(cached.timeseries ?? null);
        if (includeEvaluation) setEvaluation(cached.evaluation ?? null);
        if (includeSeasonality) setSeasonality(cached.seasonality ?? null);
        if (includeAssetNews) setAssetNews(cached.assetNews ?? []);
        if (includeSignalDetail) setSignalDetail(cached.signalDetail ?? null);
      }
      return Promise.resolve();
    }

    const selectedMeta = assetsRef.current.find((a) => a.id === safeAssetId);
    const shouldLoadSignalDetail = includeSignalDetail && selectedMeta?.category !== "Cross Pairs";
    const token = panelRequestTokenRef.current + 1;
    panelRequestTokenRef.current = token;
    const hasPanelWork = timeseriesStale || evaluationStale || seasonalityStale || signalDetailStale;
    if (hasPanelWork) setPanelLoading(true);
    const refreshBucket = forceTimeseriesRefresh ? Math.floor(Date.now() / CHART_REFRESH_MS) : undefined;

    return Promise.allSettled([
      timeseriesStale
        ? GlobeApi.getTimeseries(safeAssetId, "D", source, "regular", refreshBucket)
        : Promise.resolve(cached?.timeseries ?? null),
      evaluationStale
        ? GlobeApi.getEvaluation(safeAssetId, source)
        : Promise.resolve(cached?.evaluation ?? null),
      seasonalityStale
        ? GlobeApi.getSeasonality(safeAssetId, source)
        : Promise.resolve(cached?.seasonality ?? null),
      assetNewsStale
        ? GlobeApi.getAssetNews(safeAssetId)
        : Promise.resolve({ items: cached?.assetNews ?? [] }),
      shouldLoadSignalDetail && signalDetailStale
        ? GlobeApi.getAssetSignalDetail(safeAssetId, source)
        : Promise.resolve(cached?.signalDetail ?? null),
    ])
      .then(([tsRes, evalRes, seasRes, newsRes, signalRes]) => {
        if (token !== panelRequestTokenRef.current) return;

        const nextTimeseries =
          tsRes.status === "fulfilled"
            ? tsRes.value
            : (cached?.timeseries ?? null);
        const nextEvaluation =
          evalRes.status === "fulfilled"
            ? evalRes.value
            : (cached?.evaluation ?? null);
        const nextSeasonality =
          seasRes.status === "fulfilled"
            ? seasRes.value
            : (cached?.seasonality ?? null);
        const nextAssetNews =
          newsRes.status === "fulfilled"
            ? (newsRes.value.items ?? [])
            : (cached?.assetNews ?? []);
        const nextSignalDetail =
          signalRes.status === "fulfilled" && signalRes.value
            ? signalRes.value
            : (cached?.signalDetail ?? null);

        if (timeseriesStale && tsRes.status === "rejected") {
          // eslint-disable-next-line no-console
          console.error("Timeseries load failed:", tsRes.reason);
        }
        if (evaluationStale && evalRes.status === "rejected") {
          // eslint-disable-next-line no-console
          console.error("Evaluation load failed:", evalRes.reason);
        }
        if (seasonalityStale && seasRes.status === "rejected") {
          // eslint-disable-next-line no-console
          console.error("Seasonality load failed:", seasRes.reason);
        }
        if (assetNewsStale && newsRes.status === "rejected") {
          // eslint-disable-next-line no-console
          console.error("Asset news load failed:", newsRes.reason);
        }
        if (signalDetailStale && signalRes.status === "rejected" && shouldLoadSignalDetail) {
          // eslint-disable-next-line no-console
          console.error("Asset signal detail load failed:", signalRes.reason);
        }

        setTimeseries(nextTimeseries);
        if (includeEvaluation) setEvaluation(nextEvaluation);
        if (includeSeasonality) setSeasonality(nextSeasonality);
        if (includeAssetNews) setAssetNews(nextAssetNews);
        if (includeSignalDetail) setSignalDetail(nextSignalDetail);

        const now = Date.now();
        panelCacheRef.current[cacheKey] = {
          timeseries: nextTimeseries,
          evaluation: nextEvaluation,
          seasonality: nextSeasonality,
          assetNews: nextAssetNews,
          signalDetail: nextSignalDetail,
          timeseriesUpdatedAt: timeseriesStale ? now : Number(cached?.timeseriesUpdatedAt || 0),
          evaluationUpdatedAt: evaluationStale ? now : Number(cached?.evaluationUpdatedAt || 0),
          seasonalityUpdatedAt: seasonalityStale ? now : Number(cached?.seasonalityUpdatedAt || 0),
          assetNewsUpdatedAt: assetNewsStale ? now : Number(cached?.assetNewsUpdatedAt || 0),
          signalDetailUpdatedAt: signalDetailStale ? now : Number(cached?.signalDetailUpdatedAt || 0),
        };
      })
      .catch((err: unknown) => {
        // eslint-disable-next-line no-console
        console.error("Globe panel error:", err);
      })
      .finally(() => {
        if (hasPanelWork && token === panelRequestTokenRef.current) {
          setPanelLoading(false);
        }
      });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const body = window.document.body;
    const root = window.document.documentElement;
    if (isEmbedded) {
      body.classList.add("ivq-embedded");
      root.classList.add("ivq-embedded");
    } else {
      body.classList.remove("ivq-embedded");
      root.classList.remove("ivq-embedded");
    }
    if (goldThemeEnabled) {
      body.classList.add("ivq-theme-gold");
      root.classList.add("ivq-theme-gold");
    } else {
      body.classList.remove("ivq-theme-gold");
      root.classList.remove("ivq-theme-gold");
    }
    try {
      window.localStorage.setItem(GOLD_THEME_STORAGE_KEY, goldThemeEnabled ? "1" : "0");
    } catch (_err) {
      // no-op
    }
    return () => {
      body.classList.remove("ivq-embedded");
      root.classList.remove("ivq-embedded");
      body.classList.remove("ivq-theme-gold");
      root.classList.remove("ivq-theme-gold");
    };
  }, [goldThemeEnabled, isEmbedded]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onThemeMessage = (event: MessageEvent) => {
      const payload = event?.data as { type?: string; theme?: string; themeCanonical?: string } | null;
      if (!payload || typeof payload !== "object") return;
      if (payload.type !== "invoria-parent-theme") return;
      const canonical = String(payload.themeCanonical || "").toLowerCase();
      const legacy = String(payload.theme || "").toLowerCase();
      const isBlack = canonical === "black" || legacy === "gold" || legacy === "black";
      setGoldThemeEnabled(isBlack);
    };
    const onLocalThemeEvent = (event: Event) => {
      const custom = event as CustomEvent<{ theme?: string; themeCanonical?: string }>;
      const detail = custom?.detail ?? {};
      const canonical = String(detail.themeCanonical || "").toLowerCase();
      const legacy = String(detail.theme || "").toLowerCase();
      const isBlack = canonical === "black" || legacy === "gold" || legacy === "black";
      setGoldThemeEnabled(isBlack);
    };

    window.addEventListener("message", onThemeMessage);
    window.addEventListener("invoria-theme-set", onLocalThemeEvent as EventListener);
    try {
      window.parent?.postMessage({ type: "invoria-theme-request" }, "*");
    } catch (_err) {
      // no-op
    }

    return () => {
      window.removeEventListener("message", onThemeMessage);
      window.removeEventListener("invoria-theme-set", onLocalThemeEvent as EventListener);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Height reporting is only needed when embedded in an iframe parent.
    // Running this as a full SPA page causes layout thrashing: the MutationObserver
    // fires on every react-globe.gl DOM label update, forcing layout reads on each frame.
    if (!isEmbedded) return;
    let raf = 0;

    const postHeight = () => {
      try {
        const doc = window.document.documentElement;
        const body = window.document.body;
        const height = Math.max(
          Number(doc?.scrollHeight || 0),
          Number(doc?.offsetHeight || 0),
          Number(body?.scrollHeight || 0),
          Number(body?.offsetHeight || 0),
        );
        window.parent?.postMessage({ type: "invoria-globe-height", height }, "*");
      } catch (_err) {
        // no-op
      }
    };

    const schedulePostHeight = () => {
      window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(postHeight);
    };

    const resizeObserver = new ResizeObserver(schedulePostHeight);
    const mutationObserver = new MutationObserver(schedulePostHeight);
    if (window.document.documentElement) resizeObserver.observe(window.document.documentElement);
    if (window.document.body) {
      resizeObserver.observe(window.document.body);
      mutationObserver.observe(window.document.body, {
        subtree: false,
        childList: true,
        attributes: false,
      });
    }

    const intervalId = window.setInterval(schedulePostHeight, 5000);
    window.addEventListener("resize", schedulePostHeight);
    schedulePostHeight();

    return () => {
      window.cancelAnimationFrame(raf);
      window.clearInterval(intervalId);
      window.removeEventListener("resize", schedulePostHeight);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [isEmbedded]);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsGlobeFullscreen(document.fullscreenElement === globeShellRef.current);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, []);

  const onToggleGlobeFullscreen = () => {
    const node = globeShellRef.current;
    if (!node) return;
    if (document.fullscreenElement === node) {
      document.exitFullscreen().catch(() => {
        // no-op
      });
      return;
    }
    node.requestFullscreen().catch(() => {
      // no-op
    });
  };

  useEffect(() => {
    if (!visualLoopEnabled || !isPageActive) return;
    const timer = window.setInterval(() => {
      setVisualLoopTick((v) => v + 1);
    }, 6500);
    return () => {
      window.clearInterval(timer);
    };
  }, [isPageActive, visualLoopEnabled]);

  useEffect(() => {
    if (!isChartStackFullscreen) return undefined;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsChartStackFullscreen(false);
      }
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isChartStackFullscreen]);

  useEffect(() => {
    markerAltitudeRef.current = Number(camera?.altitude ?? 1.8);
  }, [camera?.altitude]);

  useEffect(() => {
    if (!isPageActive) return undefined;
    const updateZoom = () => {
      const next = Math.round(Number(markerAltitudeRef.current || 1.8) * 3) / 3;
      setMarkerZoomLevel((prev) => (prev === next ? prev : next));
    };
    updateZoom();
    const timer = window.setInterval(updateZoom, GLOBE_MARKER_UPDATE_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [isPageActive]);

  useEffect(() => {
    const unsubscribe = subscribeApiLoading((state) => {
      setApiLoading({
        active: Boolean(state.active),
        count: Math.max(0, Number(state.count || 0)),
        labels: Array.isArray(state.labels) ? state.labels.slice(0, 4) : [],
      });
    });
    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isPageActive) return undefined;
    refreshShellData(true).catch((err: unknown) => {
      // eslint-disable-next-line no-console
      console.error("Globe boot error:", err);
      setShellLoading(false);
    });
  }, [isPageActive, refreshShellData]);

  useEffect(() => {
    if (!assets.length) return;
    const defaults = defaultEnabledIds(assets);

    if (!defaultsAppliedRef.current) {
      setEnabledAssets(defaults);
      const categories: Record<string, boolean> = {};
      for (const asset of assets) {
        categories[asset.category] = true;
      }
      setCategoryEnabled(categories);
      defaultsAppliedRef.current = true;
    } else {
      setEnabledAssets((prev) => normalizeEnabledIds(prev, assets, hasPersisted));
      setCategoryEnabled((prev) => {
        const next = { ...prev };
        for (const asset of assets) {
          if (next[asset.category] === undefined) {
            next[asset.category] = true;
          }
        }
        return next;
      });
    }

    setSelectedAssetId((prev) => {
      if (prev && assets.some((a) => a.id === prev)) return prev;
      const firstEnabled = normalizeEnabledIds(initialPersisted.enabledAssets ?? [], assets, hasPersisted)[0];
      const fallback = defaults[0] ?? assets.find((a) => a.category !== "Cross Pairs")?.id ?? assets[0]?.id;
      return firstEnabled || fallback || "";
    });
  }, [assets, hasPersisted, initialPersisted.enabledAssets]);

  useEffect(() => {
    if (!enabledAssets.length) return;
    const selected = assets.find((a) => a.id === selectedAssetId);
    if (selectedAssetId && (enabledAssets.includes(selectedAssetId) || selected?.category === "Cross Pairs")) return;
    setSelectedAssetId(enabledAssets[0]);
  }, [assets, enabledAssets, selectedAssetId]);

  useEffect(() => {
    setOverlayLoadingState((prev) => {
      let changed = false;
      const next: Partial<Record<keyof OverlayToggleState, boolean>> = { ...prev };
      for (const key of OVERLAY_LOADING_KEYS) {
        if (!overlayState[key] && prev[key]) {
          changed = true;
          next[key] = false;
          overlayLoadingCountRef.current[String(key)] = 0;
        }
      }
      return changed ? next : prev;
    });
  }, [overlayState]);

  useEffect(() => {
    if (!isPageActive) return;
    if (!selectedAssetId) return;
    loadPanelData(selectedAssetId, dataSource, {
      includeEvaluation: deferredSections.valuation,
      includeSeasonality: deferredSections.seasonality,
      includeAssetNews: deferredSections.news,
      includeSignalDetail: deferredSections.valuation,
    });
  }, [dataSource, deferredSections.news, deferredSections.seasonality, deferredSections.valuation, isPageActive, selectedAssetId, loadPanelData]);

  useEffect(() => {
    if (!isPageActive) return;
    if (!deferredSections.news) return;
    loadGlobalNews(false);
  }, [deferredSections.news, isPageActive, loadGlobalNews]);

  useEffect(() => {
    if (!isPageActive) return undefined;
    let cancelled = false;
    const jobs: Array<Promise<void>> = [];

    const loadLayer = (
      key: "conflicts" | "wildfires" | "earthquakes",
      setter: (rows: GeoEventItem[]) => void,
    ) => {
      if (!overlayState[key]) return;
      const stampKey = `geo:${key}`;
      if (!isStale(overlayLastUpdatedAtRef.current[stampKey], overlayCacheMs(key))) return;
      jobs.push(
        withOverlayLoad(key, GlobeApi.getGeoEvents(key)
          .then((res) => {
            if (cancelled) return;
            setter(res.items ?? []);
            overlayLastUpdatedAtRef.current[stampKey] = Date.now();
          })
          .catch((err: unknown) => {
            // eslint-disable-next-line no-console
            console.error(`Geo events load failed (${key}):`, err);
          })),
      );
    };

    if (overlayState.shipTracking && isStale(overlayLastUpdatedAtRef.current.ships, overlayCacheMs("shipTracking"))) {
      jobs.push(
        withOverlayLoad("shipTracking", GlobeApi.getShipTracking()
          .then((res) => {
            if (cancelled) return;
            setShipTracking(res.items ?? []);
            overlayLastUpdatedAtRef.current.ships = Date.now();
          })
          .catch((err: unknown) => {
            // eslint-disable-next-line no-console
            console.error("Ship tracking load failed:", err);
          })),
      );
    }

    if (overlayState.oilRoutes && isStale(overlayLastUpdatedAtRef.current.oilRoutes, overlayCacheMs("oilRoutes"))) {
      jobs.push(
        withOverlayLoad("oilRoutes", GlobeApi.getOilRoutes()
          .then((res) => {
            if (cancelled) return;
            setOilRoutes(res.items ?? []);
            overlayLastUpdatedAtRef.current.oilRoutes = Date.now();
          })
          .catch((err: unknown) => {
            // eslint-disable-next-line no-console
            console.error("Oil routes load failed:", err);
          })),
      );
    }

    if (overlayState.containerTraffic && isStale(overlayLastUpdatedAtRef.current.containerRoutes, overlayCacheMs("containerTraffic"))) {
      jobs.push(
        withOverlayLoad("containerTraffic", GlobeApi.getContainerRoutes()
          .then((res) => {
            if (cancelled) return;
            setContainerRoutes(res.items ?? []);
            overlayLastUpdatedAtRef.current.containerRoutes = Date.now();
          })
          .catch((err: unknown) => {
            // eslint-disable-next-line no-console
            console.error("Container routes load failed:", err);
          })),
      );
    }

    if (overlayState.commodityRegions && isStale(overlayLastUpdatedAtRef.current.commodityRegions, overlayCacheMs("commodityRegions"))) {
      jobs.push(
        withOverlayLoad("commodityRegions", GlobeApi.getCommodityRegions()
          .then((res) => {
            if (cancelled) return;
            setCommodityRegions(res.items ?? []);
            overlayLastUpdatedAtRef.current.commodityRegions = Date.now();
          })
          .catch((err: unknown) => {
            // eslint-disable-next-line no-console
            console.error("Commodity regions load failed:", err);
          })),
      );
    }

    if (overlayState.globalRiskLayer && isStale(overlayLastUpdatedAtRef.current.globalRiskLayer, overlayCacheMs("globalRiskLayer"))) {
      jobs.push(
        withOverlayLoad("globalRiskLayer", GlobeApi.getGlobalRiskLayer()
          .then((res) => {
            if (cancelled) return;
            setGlobalRiskRegions(res.regions ?? []);
            overlayLastUpdatedAtRef.current.globalRiskLayer = Date.now();
          })
          .catch((err: unknown) => {
            // eslint-disable-next-line no-console
            console.error("Global risk layer load failed:", err);
          })),
      );
    }

    if (overlayState.globalLiquidityMap && isStale(overlayLastUpdatedAtRef.current.globalLiquidityMap, overlayCacheMs("globalLiquidityMap"))) {
      jobs.push(
        withOverlayLoad("globalLiquidityMap", GlobeApi.getGlobalLiquidityMap()
          .then((res) => {
            if (cancelled) return;
            setGlobalLiquidityRegions(res.regions ?? []);
            overlayLastUpdatedAtRef.current.globalLiquidityMap = Date.now();
          })
          .catch((err: unknown) => {
            // eslint-disable-next-line no-console
            console.error("Global liquidity map load failed:", err);
          })),
      );
    }

    if (overlayState.shippingDisruptions && isStale(overlayLastUpdatedAtRef.current.shippingDisruptions, overlayCacheMs("shippingDisruptions"))) {
      jobs.push(
        withOverlayLoad("shippingDisruptions", GlobeApi.getShippingDisruptions()
          .then((res) => {
            if (cancelled) return;
            setShippingDisruptionEvents(res.items ?? []);
            setShippingDisruptionRoutes(res.routes ?? []);
            overlayLastUpdatedAtRef.current.shippingDisruptions = Date.now();
          })
          .catch((err: unknown) => {
            // eslint-disable-next-line no-console
            console.error("Shipping disruptions load failed:", err);
          })),
      );
    }

    if (overlayState.commodityStressMap && isStale(overlayLastUpdatedAtRef.current.commodityStressMap, overlayCacheMs("commodityStressMap"))) {
      jobs.push(
        withOverlayLoad("commodityStressMap", GlobeApi.getCommodityStressMap()
          .then((res) => {
            if (cancelled) return;
            setCommodityStressRegions((res.items ?? []).map((row) => ({ ...row })));
            overlayLastUpdatedAtRef.current.commodityStressMap = Date.now();
          })
          .catch((err: unknown) => {
            // eslint-disable-next-line no-console
            console.error("Commodity stress map load failed:", err);
          })),
      );
    }

    if (overlayState.regionalAssetHighlight && selectedAssetId) {
      const assetKey = String(selectedAssetId || "").trim().toLowerCase();
      const stampKey = `assetRegion:${assetKey}`;
      const cached = assetRegionCacheRef.current[assetKey];
      if (cached && !isStale(cached.updatedAt, overlayCacheMs("regionalAssetHighlight"))) {
        setRegionHighlight(cached.payload);
        overlayLastUpdatedAtRef.current[stampKey] = cached.updatedAt;
      } else if (isStale(overlayLastUpdatedAtRef.current[stampKey], overlayCacheMs("regionalAssetHighlight"))) {
        setRegionHighlight(null);
        jobs.push(
          withOverlayLoad("regionalAssetHighlight", GlobeApi.getAssetRegions(assetKey)
            .then((res) => {
              if (cancelled) return;
              const now = Date.now();
              setRegionHighlight(res);
              assetRegionCacheRef.current[assetKey] = { payload: res, updatedAt: now };
              overlayLastUpdatedAtRef.current[stampKey] = now;
            })
            .catch((err: unknown) => {
              // eslint-disable-next-line no-console
              console.error("Asset region highlight load failed:", err);
            })),
        );
      }
    }

    loadLayer("conflicts", setConflictEvents);
    loadLayer("wildfires", setWildfireEvents);
    loadLayer("earthquakes", setEarthquakeEvents);

    if (jobs.length) {
      Promise.allSettled(jobs).catch(() => {
        // no-op
      });
    }

    return () => {
      cancelled = true;
    };
  }, [
    overlayState.commodityStressMap,
    overlayState.commodityRegions,
    overlayState.conflicts,
    overlayState.containerTraffic,
    overlayState.earthquakes,
    overlayState.globalLiquidityMap,
    overlayState.globalRiskLayer,
    overlayState.oilRoutes,
    overlayState.regionalAssetHighlight,
    overlayState.shipTracking,
    overlayState.shippingDisruptions,
    overlayState.wildfires,
    isPageActive,
    selectedAssetId,
    withOverlayLoad,
  ]);

  useEffect(() => {
    const merged: GeoEventItem[] = [];
    if (overlayState.conflicts) merged.push(...conflictEvents);
    if (overlayState.wildfires) merged.push(...wildfireEvents);
    if (overlayState.earthquakes) merged.push(...earthquakeEvents);
    if (overlayState.shippingDisruptions) merged.push(...shippingDisruptionEvents);
    setGeoEvents(merged);
  }, [
    conflictEvents,
    earthquakeEvents,
    overlayState.conflicts,
    overlayState.earthquakes,
    overlayState.shippingDisruptions,
    overlayState.wildfires,
    shippingDisruptionEvents,
    wildfireEvents,
  ]);

  useEffect(() => {
    if (!isPageActive) return undefined;
    const timer = window.setInterval(() => {
      const shellStamp = shellLastUpdatedRef.current.assets || 0;
      if (isStale(shellStamp, SHELL_REFRESH_MS)) {
        refreshShellData(false).catch(() => {
          // no-op
        });
      }

      if (selectedAssetId) {
        const key = `${dataSource}:${selectedAssetId.toLowerCase()}`;
        const cached = panelCacheRef.current[key];
        const tsStamp = Number(cached?.timeseriesUpdatedAt || 0);
        if (isStale(tsStamp, CHART_REFRESH_MS)) {
          loadPanelData(selectedAssetId, dataSource, {
            forceTimeseriesRefresh: true,
            includeEvaluation: deferredSections.valuation,
            includeSeasonality: deferredSections.seasonality,
            includeAssetNews: deferredSections.news,
            includeSignalDetail: deferredSections.valuation,
          });
        } else {
          if (deferredSections.valuation && isStale(Number(cached?.evaluationUpdatedAt || 0), VALUATION_CACHE_MS)) {
            loadPanelData(selectedAssetId, dataSource, {
              includeEvaluation: true,
              includeSignalDetail: true,
            });
          }
          if (deferredSections.news && isStale(Number(cached?.assetNewsUpdatedAt || 0), NEWS_CACHE_MS)) {
            loadPanelData(selectedAssetId, dataSource, {
              includeAssetNews: true,
            });
          }
        }
      }

      if (deferredSections.news && isStale(globalNewsCacheRef.current?.updatedAt, NEWS_CACHE_MS)) {
        loadGlobalNews(false);
      }

      if (overlayState.conflicts && isStale(overlayLastUpdatedAtRef.current["geo:conflicts"], overlayCacheMs("conflicts"))) {
        withOverlayLoad("conflicts", GlobeApi.getGeoEvents("conflicts")
          .then((res) => {
            setConflictEvents(res.items ?? []);
            overlayLastUpdatedAtRef.current["geo:conflicts"] = Date.now();
          }))
          .catch(() => {
            // no-op
          });
      }
      if (overlayState.wildfires && isStale(overlayLastUpdatedAtRef.current["geo:wildfires"], overlayCacheMs("wildfires"))) {
        withOverlayLoad("wildfires", GlobeApi.getGeoEvents("wildfires")
          .then((res) => {
            setWildfireEvents(res.items ?? []);
            overlayLastUpdatedAtRef.current["geo:wildfires"] = Date.now();
          }))
          .catch(() => {
            // no-op
          });
      }
      if (overlayState.earthquakes && isStale(overlayLastUpdatedAtRef.current["geo:earthquakes"], overlayCacheMs("earthquakes"))) {
        withOverlayLoad("earthquakes", GlobeApi.getGeoEvents("earthquakes")
          .then((res) => {
            setEarthquakeEvents(res.items ?? []);
            overlayLastUpdatedAtRef.current["geo:earthquakes"] = Date.now();
          }))
          .catch(() => {
            // no-op
          });
      }
      if (overlayState.shipTracking && isStale(overlayLastUpdatedAtRef.current.ships, overlayCacheMs("shipTracking"))) {
        withOverlayLoad("shipTracking", GlobeApi.getShipTracking()
          .then((res) => {
            setShipTracking(res.items ?? []);
            overlayLastUpdatedAtRef.current.ships = Date.now();
          }))
          .catch(() => {
            // no-op
          });
      }
      if (overlayState.oilRoutes && isStale(overlayLastUpdatedAtRef.current.oilRoutes, overlayCacheMs("oilRoutes"))) {
        withOverlayLoad("oilRoutes", GlobeApi.getOilRoutes()
          .then((res) => {
            setOilRoutes(res.items ?? []);
            overlayLastUpdatedAtRef.current.oilRoutes = Date.now();
          }))
          .catch(() => {
            // no-op
          });
      }
      if (overlayState.containerTraffic && isStale(overlayLastUpdatedAtRef.current.containerRoutes, overlayCacheMs("containerTraffic"))) {
        withOverlayLoad("containerTraffic", GlobeApi.getContainerRoutes()
          .then((res) => {
            setContainerRoutes(res.items ?? []);
            overlayLastUpdatedAtRef.current.containerRoutes = Date.now();
          }))
          .catch(() => {
            // no-op
          });
      }
      if (overlayState.commodityRegions && isStale(overlayLastUpdatedAtRef.current.commodityRegions, overlayCacheMs("commodityRegions"))) {
        withOverlayLoad("commodityRegions", GlobeApi.getCommodityRegions()
          .then((res) => {
            setCommodityRegions(res.items ?? []);
            overlayLastUpdatedAtRef.current.commodityRegions = Date.now();
          }))
          .catch(() => {
            // no-op
          });
      }
      if (overlayState.globalRiskLayer && isStale(overlayLastUpdatedAtRef.current.globalRiskLayer, overlayCacheMs("globalRiskLayer"))) {
        withOverlayLoad("globalRiskLayer", GlobeApi.getGlobalRiskLayer()
          .then((res) => {
            setGlobalRiskRegions(res.regions ?? []);
            overlayLastUpdatedAtRef.current.globalRiskLayer = Date.now();
          }))
          .catch(() => {
            // no-op
          });
      }
      if (overlayState.globalLiquidityMap && isStale(overlayLastUpdatedAtRef.current.globalLiquidityMap, overlayCacheMs("globalLiquidityMap"))) {
        withOverlayLoad("globalLiquidityMap", GlobeApi.getGlobalLiquidityMap()
          .then((res) => {
            setGlobalLiquidityRegions(res.regions ?? []);
            overlayLastUpdatedAtRef.current.globalLiquidityMap = Date.now();
          }))
          .catch(() => {
            // no-op
          });
      }
      if (overlayState.shippingDisruptions && isStale(overlayLastUpdatedAtRef.current.shippingDisruptions, overlayCacheMs("shippingDisruptions"))) {
        withOverlayLoad("shippingDisruptions", GlobeApi.getShippingDisruptions()
          .then((res) => {
            setShippingDisruptionEvents(res.items ?? []);
            setShippingDisruptionRoutes(res.routes ?? []);
            overlayLastUpdatedAtRef.current.shippingDisruptions = Date.now();
          }))
          .catch(() => {
            // no-op
          });
      }
      if (overlayState.commodityStressMap && isStale(overlayLastUpdatedAtRef.current.commodityStressMap, overlayCacheMs("commodityStressMap"))) {
        withOverlayLoad("commodityStressMap", GlobeApi.getCommodityStressMap()
          .then((res) => {
            setCommodityStressRegions((res.items ?? []).map((row) => ({ ...row })));
            overlayLastUpdatedAtRef.current.commodityStressMap = Date.now();
          }))
          .catch(() => {
            // no-op
          });
      }
      if (overlayState.regionalAssetHighlight && selectedAssetId) {
        const assetKey = String(selectedAssetId || "").trim().toLowerCase();
        const stampKey = `assetRegion:${assetKey}`;
        if (isStale(overlayLastUpdatedAtRef.current[stampKey], overlayCacheMs("regionalAssetHighlight"))) {
          withOverlayLoad("regionalAssetHighlight", GlobeApi.getAssetRegions(assetKey)
            .then((res) => {
              const now = Date.now();
              setRegionHighlight(res);
              assetRegionCacheRef.current[assetKey] = { payload: res, updatedAt: now };
              overlayLastUpdatedAtRef.current[stampKey] = now;
            }))
            .catch(() => {
              // no-op
            });
        } else {
          const cached = assetRegionCacheRef.current[assetKey];
          if (cached) {
            setRegionHighlight(cached.payload);
          }
        }
      }
    }, GLOBE_TIMER_TICK_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [
    dataSource,
    deferredSections.news,
    deferredSections.seasonality,
    deferredSections.valuation,
    overlayState.commodityStressMap,
    overlayState.conflicts,
    overlayState.containerTraffic,
    overlayState.commodityRegions,
    overlayState.earthquakes,
    overlayState.globalLiquidityMap,
    overlayState.globalRiskLayer,
    overlayState.oilRoutes,
    overlayState.regionalAssetHighlight,
    overlayState.shipTracking,
    overlayState.shippingDisruptions,
    overlayState.wildfires,
    isPageActive,
    selectedAssetId,
    withOverlayLoad,
    refreshShellData,
    loadPanelData,
    loadGlobalNews,
  ]);

  useEffect(() => {
    const active = OVERLAY_ACTIVATION_PRIORITY.find((key) => overlayState[key]);
    setSelectedOverlay(active ? mapOverlayKeyToMode(active) : "none");
  }, [
    overlayState.commodityStressMap,
    overlayState.commodityRegions,
    overlayState.conflicts,
    overlayState.containerTraffic,
    overlayState.earthquakes,
    overlayState.globalLiquidityMap,
    overlayState.globalRiskLayer,
    overlayState.oilRoutes,
    overlayState.regionalAssetHighlight,
    overlayState.shipTracking,
    overlayState.shippingDisruptions,
    overlayState.wildfires,
  ]);

  useEffect(() => {
    persistGlobeState({
      selectedAssetId,
      enabledAssets,
      selectedOverlay,
      camera,
    });
  }, [selectedAssetId, enabledAssets, selectedOverlay, camera]);

  useEffect(() => {
    if (!timeseries) return;
    // eslint-disable-next-line no-console
    console.info("[Globe][Data]", {
      asset: timeseries.assetId,
      timeframe: timeseries.diagnostics?.timeframe,
      bars: timeseries.diagnostics?.bars,
      start: timeseries.diagnostics?.start,
      end: timeseries.diagnostics?.end,
      sourceRequested: timeseries.sourceRequested,
      sourceUsed: timeseries.sourceUsed || timeseries.source,
      fallbackReason: timeseries.fallbackReason ?? "",
      continuousMode: timeseries.continuousMode ?? "backadjusted",
    });
  }, [timeseries]);

  useEffect(() => {
    try {
      window.localStorage.setItem(DATA_SOURCE_STORAGE_KEY, dataSource);
    } catch (_err) {
      // no-op
    }
  }, [dataSource]);

  const selectedAsset = useMemo(
    () => assets.find((a) => a.id === selectedAssetId) ?? assets[0] ?? null,
    [assets, selectedAssetId],
  );
  const emptyLocations = useMemo<Array<{ lat: number; lng: number; label: string }>>(() => [], []);
  const selectedAssetLocations = useMemo(
    () => selectedAsset?.locations ?? emptyLocations,
    [emptyLocations, selectedAsset?.locations],
  );
  const emptyInflationByCountry = useMemo<Record<string, number>>(() => ({}), []);
  const emptyPolicyRateByCountry = useMemo<Record<string, PolicyRateCountryEntry>>(() => ({}), []);
  const emptyCommodityRegionScores = useMemo<Record<string, number>>(() => ({}), []);

  const selectedCrossPair = useMemo(
    () => (selectedAsset?.category === "Cross Pairs" ? selectedAsset : null),
    [selectedAsset],
  );

  const crossPairPath = useMemo<CrossPairPath | null>(() => {
    if (!selectedCrossPair) return null;
    const [a, b] = selectedCrossPair.locations ?? [];
    if (!a || !b) return null;
    const direction = String(seasonality?.stats?.direction ?? "LONG").toUpperCase();
    const routeColor = direction === "SHORT" ? designTokens.signal.bear : designTokens.signal.bull;
    const raw = String(selectedCrossPair.name || "").toUpperCase().replace(/[^A-Z/]/g, "");
    const [base, quote] = raw.includes("/") ? raw.split("/") : [raw.slice(0, 3), raw.slice(3, 6)];
    return {
      assetId: selectedCrossPair.id,
      name: selectedCrossPair.name,
      from: {
        code: String(base || "A").slice(0, 3),
        label: String(a.label || "From"),
        lat: Number(a.lat),
        lng: Number(a.lng),
      },
      to: {
        code: String(quote || "B").slice(0, 3),
        label: String(b.label || "To"),
        lat: Number(b.lat),
        lng: Number(b.lng),
      },
      color: routeColor,
    };
  }, [seasonality?.stats?.direction, selectedCrossPair]);

  const enabledSet = useMemo(() => new Set(enabledAssets), [enabledAssets]);

  const markerScores = useMemo<Record<string, number>>(() => {
    const out: Record<string, number> = {};
    out[selectedAssetId] = Number(timeseries?.aiScore?.total ?? 50);
    return out;
  }, [selectedAssetId, timeseries?.aiScore?.total]);

  const autoRotateEnabled = globeRotateMode !== "off";
  const autoRotateSpeed = globeRotateMode === "normal" ? 0.7 : 0.35;
  const effectiveAutoRotateEnabled = autoRotateEnabled || visualLoopEnabled;
  const effectiveAutoRotateSpeed = visualLoopEnabled
    ? Math.max(autoRotateSpeed, 0.8)
    : autoRotateSpeed;

  const markers = useMemo(
    () => buildDisplayMarkers(assets, enabledAssets, categoryEnabled, markerScores, markerZoomLevel),
    [assets, enabledAssets, categoryEnabled, markerScores, markerZoomLevel],
  );
  const HQ_MARKER = useMemo(
    () => ({
      id: "__capitalife_hq__",
      name: "Capitalife HQ",
      lat: 50.11,
      lng: 8.68,
      color: "#e2ca7a",
      category: "Locations",
      iconKey: "hq",
      symbol: "",
      tvSource: "",
      country: "Germany",
      defaultEnabled: true,
      showOnGlobe: true,
      locations: [],
      score: 1,
      size: 8,
      pulse: false,
      labelVisible: true,
    }),
    [],
  );
  const visibleMarkers = useMemo(
    () => {
      const base = overlayState.assets ? markers : [];
      return overlayState.locations ? [...base, HQ_MARKER as never] : base;
    },
    [markers, overlayState.assets, overlayState.locations, HQ_MARKER],
  );
  const activeShipTracking = useMemo(
    () => (overlayState.shipTracking ? shipTracking : []),
    [overlayState.shipTracking, shipTracking],
  );
  const activeCommodityRegions = useMemo(() => {
    const out: CommodityRegionItem[] = [];
    if (overlayState.commodityRegions) out.push(...commodityRegions);
    if (overlayState.commodityStressMap) out.push(...commodityStressRegions);
    return out;
  }, [commodityRegions, commodityStressRegions, overlayState.commodityRegions, overlayState.commodityStressMap]);
  const activeGlobalRiskRegions = useMemo(
    () => (overlayState.globalRiskLayer ? globalRiskRegions : []),
    [globalRiskRegions, overlayState.globalRiskLayer],
  );
  const activeGlobalLiquidityRegions = useMemo(
    () => (overlayState.globalLiquidityMap ? globalLiquidityRegions : []),
    [globalLiquidityRegions, overlayState.globalLiquidityMap],
  );
  const activeRegionHighlight = useMemo(
    () => (overlayState.regionalAssetHighlight ? regionHighlight : null),
    [overlayState.regionalAssetHighlight, regionHighlight],
  );
  const activeRouteOverlays = useMemo(() => {
    const out: OverlayRouteItem[] = [];
    if (overlayState.oilRoutes) out.push(...oilRoutes);
    if (overlayState.containerTraffic) out.push(...containerRoutes);
    if (overlayState.shippingDisruptions) out.push(...shippingDisruptionRoutes);
    if (overlayState.shipTracking) {
      for (const ship of shipTracking) {
        const path = Array.isArray(ship.route) ? ship.route : [];
        if (path.length < 2) continue;
        out.push({
          id: `ship-route:${ship.id}`,
          name: `${ship.name} path`,
          from: String(path[0]?.lat ?? ""),
          to: String(path[path.length - 1]?.lat ?? ""),
          path: path.map((pt) => ({ lat: Number(pt.lat), lng: Number(pt.lng) })),
          color: ship.shipType === "oil_tanker" ? "rgba(90,170,255,0.26)" : "rgba(150,210,255,0.24)",
          lineWidth: 0.32,
          animationSpeed: 0.36,
        });
      }
    }
    return out;
  }, [
    containerRoutes,
    oilRoutes,
    overlayState.containerTraffic,
    overlayState.oilRoutes,
    overlayState.shipTracking,
    overlayState.shippingDisruptions,
    shipTracking,
    shippingDisruptionRoutes,
  ]);

  const onToggleAsset = useCallback((assetId: string) => {
    setEnabledAssets((prev) => {
      const has = prev.includes(assetId);
      if (has) {
        const next = prev.filter((id) => id !== assetId);
        if (assetId === selectedAssetId && next.length) {
          setSelectedAssetId(next[0]);
        }
        return next;
      }
      return [...prev, assetId];
    });
  }, [selectedAssetId]);

  const onToggleCategory = useCallback((category: string) => {
    setCategoryEnabled((prev) => ({ ...prev, [category]: prev[category] === false }));
  }, []);

  const onAllOn = useCallback(() => {
    setEnabledAssets(assets.filter((asset) => asset.showOnGlobe !== false).map((asset) => asset.id));
  }, [assets]);

  const onAllOff = useCallback(() => {
    setEnabledAssets([]);
  }, []);

  const onRefreshData = useCallback(() => {
    globalNewsCacheRef.current = null;
    panelCacheRef.current = {};
    overlayLastUpdatedAtRef.current = {};
    assetRegionCacheRef.current = {};
    GlobeApi.clearCache();
    refreshShellData(true).catch(() => {
      // no-op
    });
    if (selectedAssetId) {
      loadPanelData(selectedAssetId, dataSource, {
        force: true,
        forceTimeseriesRefresh: true,
        includeEvaluation: deferredSections.valuation,
        includeSeasonality: deferredSections.seasonality,
        includeAssetNews: deferredSections.news,
        includeSignalDetail: deferredSections.valuation,
      }).catch(() => {
        // no-op
      });
    }
  }, [dataSource, deferredSections.news, deferredSections.seasonality, deferredSections.valuation, loadPanelData, refreshShellData, selectedAssetId]);

  const onToggleOverlay = useCallback((key: keyof OverlayToggleState) => {
    setOverlayState((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const onSelectAssetFromWatchlist = useCallback((assetId: string) => {
    setSelectedAssetId(assetId);
    activateSection("valuation");
    activateSection("seasonality");
    markAssetUsage(assetId);
    setFocusAssetId(assetId);
  }, [activateSection, markAssetUsage]);

  const onSelectAssetAnywhere = useCallback((assetId: string) => {
    if (!assetId) return;
    setSelectedAssetId(assetId);
    activateSection("valuation");
    activateSection("seasonality");
    markAssetUsage(assetId);
    setFocusAssetId(assetId);
  }, [activateSection, markAssetUsage]);

  const onSelectPointFromMiniMap = useCallback((point: MarkerPoint) => {
    if (point.kind !== "event" && point.kind !== "ship" && point.kind !== "commodity" && point.kind !== "region" && point.assetId) {
      setSelectedAssetId(point.assetId);
      activateSection("valuation");
      activateSection("seasonality");
      markAssetUsage(point.assetId);
    }
    setFocusLocation({ lat: Number(point.lat), lng: Number(point.lng) });
  }, [activateSection, markAssetUsage]);

  const onSharedTimeRangeChange = useCallback((next: SharedTimeRange | null) => {
    if (!next) return;
    sharedTimeRangeRef.current = next;
    setSharedTimeRange((prev) => {
      if (!prev) return next;
      const spanDelta = Math.abs(Number(prev.visibleSpan || 0) - Number(next.visibleSpan || 0));
      const offDelta = Math.abs(Number(prev.rightOffset || 0) - Number(next.rightOffset || 0));
      if (spanDelta < 0.001 && offDelta < 0.001) return prev;
      return next;
    });
  }, []);
  const onGlobeSelectAsset = useCallback((assetId: string) => {
    onSelectAssetAnywhere(assetId);
  }, [onSelectAssetAnywhere]);
  const onFocusHandled = useCallback(() => {
    setFocusAssetId(null);
  }, []);
  const onFocusLocationHandled = useCallback(() => {
    setFocusLocation(null);
  }, []);

  const seasonalityResearch = useMemo(
    () => buildGlobeSeasonalityAnalysis(timeseries?.ohlcv ?? [], seasonality),
    [seasonality, timeseries?.ohlcv],
  );

  const seasonStats = seasonalityResearch.stats;
  const avgReturn = seasonStats.averageReturnPct;
  const hitRate = clampNum(seasonStats.winRatePct, 0, 100);
  const seasonDirection = seasonStats.direction;
  const seasonSharpe = seasonStats.sharpeRatio;
  const seasonSortino = seasonStats.sortinoRatio;
  const seasonHorizon = seasonStats.bestHorizonDays;
  const seasonEdgeTone = seasonStats.interpretation === "Strong seasonal bias"
    ? designTokens.signal.bull
    : seasonStats.interpretation === "Weak seasonal bias"
      ? "#facc15"
      : designTokens.signal.bear;
  const winrateColor = hitRate < 58
    ? seasonEdgeTone
    : seasonDirection === "LONG"
      ? designTokens.signal.bull
      : seasonDirection === "SHORT"
        ? designTokens.signal.bear
        : seasonEdgeTone;
  const winrateArc = `conic-gradient(${winrateColor} ${hitRate.toFixed(2)}%, rgba(71,85,105,0.28) 0)`;
  const seasonWinrateSpark = useMemo(() => {
    const curve = seasonalityResearch.curve.map((point) => Number(point.y));
    return buildMiniSparkPaths(curve);
  }, [seasonalityResearch.curve]);
  const currentSeasonPattern = useMemo(() => {
    const holdDays = Math.max(10, Math.min(20, Math.round(finiteOr(seasonHorizon, 12))));
    const today = currentUtcDayOfYear();
    const endDay = Math.min(366, today + holdDays);
    const curve = seasonalityResearch.curve
      .map((point) => ({
        x: Number(point.x),
        y: Number(point.y),
      }))
      .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
      .sort((left, right) => left.x - right.x);
    const startValue = curve.find((point) => point.x >= 0)?.y ?? 0;
    const endValue = curve.find((point) => point.x >= holdDays)?.y ?? curve[curve.length - 1]?.y ?? finiteOr(avgReturn, 0);
    const delta = finiteOr(endValue, 0) - finiteOr(startValue, 0);
    const direction = delta >= 0 ? "LONG" as const : "SHORT" as const;

    if (!curve.length) {
      return {
        label: `${formatSeasonDay(today)} - ${formatSeasonDay(endDay)}`,
        holdLabel: `${holdDays} Tage`,
        direction,
        avgReturnPct: finiteOr(avgReturn, 0),
      };
    }

    return {
      label: `${formatSeasonDay(today)} - ${formatSeasonDay(endDay)}`,
      holdLabel: `${holdDays} Tage`,
      direction,
      avgReturnPct: delta,
    };
  }, [avgReturn, seasonHorizon, seasonalityResearch.curve]);
  const seasonHorizonLabel = `${Math.max(10, Math.min(20, Math.round(finiteOr(seasonHorizon, 12))))} Tage`;
  const avgReturnLabel = `${finiteOr(avgReturn, 0).toFixed(2)}%`;
  const hitRateLabel = `${hitRate.toFixed(0)}%`;
  const sharpeLabel = finiteOr(seasonSharpe, 0).toFixed(2);
  const sortinoLabel = finiteOr(seasonSortino, 0).toFixed(2);
  const avgReturnPct = Math.max(0, Math.min(100, Math.abs(finiteOr(avgReturn, 0)) * 18));
  const sharpePct = Math.max(0, Math.min(100, Math.abs(finiteOr(seasonSharpe, 0)) * 32));
  const sortinoPct = Math.max(0, Math.min(100, Math.abs(finiteOr(seasonSortino, 0)) * 24));
  const neutralAccent = goldThemeEnabled ? GOLD_PRIMARY : "#4d87fe";
  const colorizeRiskMetric = (value: number): string => {
    const v = Math.abs(finiteOr(value, 0));
    if (seasonStats.interpretation === "No seasonal edge") return designTokens.signal.bear;
    if (seasonStats.interpretation === "Weak seasonal bias") return "#facc15";
    if (v < 0.35) return neutralAccent;
    return designTokens.signal.bull;
  };
  const sharpeColor = colorizeRiskMetric(seasonSharpe);
  const currentPatternColor = seasonEdgeTone;
  const currentPatternStateLabel = seasonDirection === "LONG" ? "Bullish" : seasonDirection === "SHORT" ? "Bearish" : "Neutral";
  const currentPatternReturnLabel = `${finiteOr(currentSeasonPattern.avgReturnPct, 0) >= 0 ? "+" : ""}${finiteOr(currentSeasonPattern.avgReturnPct, 0).toFixed(2)}%`;
  const seasonInterpretation = seasonStats.interpretation;
  const latestValuation = useMemo(() => {
    const combined = evaluation?.series?.find((series) => String(series.id || "").toLowerCase() === "combined")
      ?? evaluation?.series?.[0];
    const latest = [...(combined?.points ?? [])]
      .reverse()
      .find((point) => Number.isFinite(Number(point.v10)) || Number.isFinite(Number(point.v20)));
    return {
      v10: Number.isFinite(Number(latest?.v10)) ? Number(latest?.v10) : null,
      v20: Number.isFinite(Number(latest?.v20)) ? Number(latest?.v20) : null,
    };
  }, [evaluation?.series]);
  const chartHeaderLabel = useMemo(() => {
    if (!selectedAsset) return "Asset";
    if (selectedAsset.id === "dax40") return "DAX 40";
    if (selectedAsset.id === "sp500") return "S&P 500";
    if (selectedAsset.id === "nasdaq100") return "Nasdaq 100";
    if (selectedAsset.id === "dowjones") return "Dow Jones";
    if (selectedAsset.id === "russell2000") return "Russell 2000";
    return selectedAsset.name;
  }, [selectedAsset]);
  const chartSourceLabel = useMemo(
    () => `${String(timeseries?.sourceUsed || timeseries?.source || dataSource).replace(/^./, (s) => s.toUpperCase())}`,
    [dataSource, timeseries?.source, timeseries?.sourceUsed],
  );
  const globeGridLayoutClass = isGlobeFullscreen
    ? "h-full"
    : "min-h-0 grid-cols-1 grid-rows-[minmax(320px,42vh)_auto_minmax(180px,24vh)] min-[769px]:h-[760px] min-[769px]:grid-cols-[286px_minmax(0,1fr)] min-[769px]:grid-rows-[minmax(0,1.62fr)_minmax(0,0.66fr)]";
  const globeGridLayoutStyle = isGlobeFullscreen
    ? {
        gridTemplateColumns: "minmax(460px, 48%) minmax(0, 52%)",
        gridTemplateRows: "minmax(0, 1.18fr) minmax(0, 0.82fr)",
      }
    : undefined;
  const overlayLoadingLabels = useMemo(() => {
    const labels: string[] = [];
    for (const key of OVERLAY_LOADING_KEYS) {
      if (overlayLoadingState[key]) {
        labels.push(OVERLAY_LOADING_LABELS[key]);
      }
    }
    return labels;
  }, [overlayLoadingState]);
  const dashboardLoadingLabels = useMemo(() => {
    const combined = [
      ...apiLoading.labels,
      ...overlayLoadingLabels,
      ...(panelLoading ? ["Loading chart + valuation + seasonality..."] : []),
      ...(shellLoading ? ["Loading dashboard shell..."] : []),
    ];
    return Array.from(new Set(combined)).slice(0, 5);
  }, [apiLoading.labels, overlayLoadingLabels, panelLoading, shellLoading]);
  const dashboardLoadingActive = Boolean(shellLoading || panelLoading || apiLoading.active || overlayLoadingLabels.length > 0);
  const dashboardLoadingHeadline = dashboardLoadingLabels[0] || "Loading data...";

  // Shared Analytics-style card styles
  const CARD = "flex min-h-0 flex-col overflow-hidden rounded-[18px] border shadow-[0_18px_45px_rgba(0,0,0,0.50)]";
  const CARD_BORDER = { borderColor: "rgba(255,255,255,0.06)", background: "rgba(12,13,18,0.72)", backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)" } as const;
  const CARD_HEADER = "shrink-0 border-b border-white/[0.06] px-4 py-2.5";
  const CARD_LABEL = "text-[11px] font-medium tracking-[0.05em] text-[#8d8f98] uppercase";

  const globeCanvasProps = {
    markers: visibleMarkers,
    selectedAssetId,
    selectedAssetCategory: selectedAsset?.category ?? "",
    selectedAssetLocations,
    crossPairPath,
    focusAssetId,
    focusLocation,
    selectedOverlay,
    inflationByCountry: emptyInflationByCountry,
    policyRateByCountry: emptyPolicyRateByCountry,
    volatilityScore: 50,
    volatilityRegime: "Neutral",
    commodityRegionScores: emptyCommodityRegionScores,
    commodityMode: "Normal",
    geoEvents,
    shipTracking: activeShipTracking,
    overlayRoutes: activeRouteOverlays,
    commodityRegions: activeCommodityRegions,
    globalRiskRegions: activeGlobalRiskRegions,
    globalLiquidityRegions: activeGlobalLiquidityRegions,
    regionHighlight: activeRegionHighlight,
    overlayState,
    camera,
    active: isPageActive,
    autoRotateEnabled: isPageActive && effectiveAutoRotateEnabled,
    autoRotateSpeed: effectiveAutoRotateSpeed,
    goldThemeEnabled: false,
    onCameraChange: (cam: import("@/lib/globe/globe-types").GlobeCameraState) => startTransition(() => setCamera(cam)),
    onSelectAsset: onGlobeSelectAsset,
    onFocusHandled,
    onFocusLocationHandled,
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#06070a] text-white">
      <div
        className="grid h-full w-full p-3"
        style={{ gridTemplateColumns: "20% 50% 30%", gridTemplateRows: "100%", gap: 12 }}
      >

        {/* ── LEFT: Watchlist + Overlay Control ── */}
        <div className="flex min-h-0 flex-col gap-3 overflow-hidden">
          {/* Watchlist card — 60% */}
          <div className={CARD} style={{ ...CARD_BORDER, flex: "0 0 60%" }}>
            <div className={CARD_HEADER}>
              <span className={CARD_LABEL}>Watchlist</span>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
              <SettingsPanel
                assets={assets}
                enabledSet={enabledSet}
                categoryEnabled={categoryEnabled}
                selectedAssetId={selectedAssetId}
                goldThemeEnabled={false}
                onSelectAsset={onSelectAssetFromWatchlist}
                onToggleAsset={onToggleAsset}
                onToggleCategory={onToggleCategory}
                onAllOn={onAllOn}
                onAllOff={onAllOff}
                onRefreshData={onRefreshData}
                overlayState={overlayState}
                overlayLoadingState={overlayLoadingState}
                onToggleOverlay={onToggleOverlay}
                hideOverlayControls
              />
            </div>
          </div>
          {/* Overlay Control card — remaining */}
          <div className={CARD} style={{ ...CARD_BORDER, flex: "1 1 0" }}>
            <div className={CARD_HEADER}>
              <span className={CARD_LABEL}>Overlay Control</span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <GlobeOverlayControl
                overlayState={overlayState}
                overlayLoadingState={overlayLoadingState}
                onToggleOverlay={onToggleOverlay}
              />
            </div>
          </div>
        </div>

        {/* ── CENTER: Globe + 2D Map — no card, floats on background ── */}
        <div className="flex min-h-0 flex-col overflow-hidden">
          {/* Globe — 68% */}
          <div
            ref={globeShellRef}
            className="relative min-h-0 overflow-hidden"
            style={{ flex: "0 0 68%" }}
          >
            {!isGlobeFullscreen && (
              <>
                <button
                  type="button"
                  onClick={onToggleGlobeFullscreen}
                  className="absolute right-3 top-3 z-30 flex h-7 w-7 items-center justify-center rounded-md border border-white/15 text-white hover:border-white"
                  title="Fullscreen"
                  aria-label="Fullscreen"
                >
                  <Maximize2 size={14} strokeWidth={1.9} />
                </button>
                <GlobeCanvas {...globeCanvasProps} />
              </>
            )}
          </div>
          {/* Subtle divider between globe and 2D map */}
          <div className="shrink-0 border-t border-white/[0.03]" />
          {/* 2D Map — remaining 32% */}
          <div className="min-h-0 flex-1 overflow-hidden">
            <MiniWorldMap
              markers={visibleMarkers}
              selectedAssetId={selectedAssetId}
              selectedAssetCategory={selectedAsset?.category ?? ""}
              selectedAssetLocations={selectedAssetLocations}
              crossPairColor={crossPairPath?.color ?? null}
              geoEvents={geoEvents}
              shipTracking={activeShipTracking}
              overlayRoutes={activeRouteOverlays}
              commodityRegions={activeCommodityRegions}
              globalRiskRegions={activeGlobalRiskRegions}
              globalLiquidityRegions={activeGlobalLiquidityRegions}
              regionHighlight={activeRegionHighlight}
              selectedOverlay={selectedOverlay}
              cameraAltitude={Number(camera?.altitude ?? 1.8)}
              goldThemeEnabled={false}
              assetUsage={assetUsage}
              onSelectPoint={onSelectPointFromMiniMap}
            />
          </div>
        </div>

        {/* ── RIGHT: Asset News (30%) → Global News (flex) → Chart (30%) ── */}
        <div className="flex min-h-0 flex-col gap-3 overflow-hidden">
          {/* Asset News card — 30% */}
          <div className={CARD} style={{ ...CARD_BORDER, flex: "0 0 30%" }}>
            <div className={CARD_HEADER}>
              <span className={CARD_LABEL}>{selectedAsset?.name ?? "Asset"} News</span>
            </div>
            <div className="relative min-h-0 flex-1 overflow-hidden">
              <GlobeNewsColumn
                items={assetNews}
                title={`${selectedAsset?.name ?? "Asset"} News`}
                goldThemeEnabled={false}
              />
            </div>
          </div>
          {/* Global News card — flex */}
          <div className={CARD} style={{ ...CARD_BORDER, flex: "1 1 0" }}>
            <div className={CARD_HEADER}>
              <span className={CARD_LABEL}>Global News</span>
            </div>
            <div className="relative min-h-0 flex-1 overflow-hidden">
              <GlobeNewsColumn
                items={globalNews}
                title="Global News"
                goldThemeEnabled={false}
              />
            </div>
          </div>
          {/* Candle chart card — 30% (bottom right) */}
          <div className={CARD} style={{ ...CARD_BORDER, flex: "0 0 30%" }}>
            {/* Chart header: icon + name + timeframe dropdown */}
            <div className="shrink-0 flex items-center justify-between border-b border-white/[0.06] px-3 py-2">
              <div className="flex items-center gap-1.5 min-w-0">
                {selectedAsset?.iconKey && (
                  <img
                    src={`/asset-icons/${GLOBE_ICON_MAP[selectedAsset.iconKey] ?? `${selectedAsset.iconKey}.png`}`}
                    alt=""
                    width={16}
                    height={16}
                    className="shrink-0 rounded-sm object-contain"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                  />
                )}
                <span className="truncate text-[11px] font-medium text-white/70">{chartHeaderLabel}</span>
              </div>
              {/* Timeframe: top-3 pills + dropdown */}
              <div className="flex shrink-0 items-center gap-1">
                {(["D", "4H", "W"] as const).map((tf) => (
                  <button
                    key={tf}
                    type="button"
                    onClick={() => setChartTimeframe(tf)}
                    className={`rounded px-1.5 py-[2px] text-[9px] font-semibold transition ${
                      chartTimeframe === tf
                        ? "border border-white/30 bg-white/10 text-white"
                        : "border border-white/10 bg-transparent text-white/40 hover:text-white/60"
                    }`}
                  >
                    {tf === "D" ? "1d" : tf === "4H" ? "4h" : "1w"}
                  </button>
                ))}
                <select
                  value={chartTimeframe}
                  onChange={(e) => setChartTimeframe(e.target.value as typeof chartTimeframe)}
                  className="rounded border border-white/10 bg-transparent px-1 py-[2px] text-[9px] text-white/40 outline-none hover:text-white/60"
                  style={{ background: "rgba(20,21,25,0.9)" }}
                >
                  {([["D","1d"],["4H","4h"],["W","1w"],["M","1M"],["1H","1h"]] as [typeof chartTimeframe, string][]).map(([key, label]) => (
                    <option key={key} value={key} style={{ background: "#14151a" }}>{label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
              <Suspense fallback={<div className="grid h-full place-items-center text-xs text-white/40">Loading chart...</div>}>
                <CandleChart
                  payload={timeseries}
                  evaluation={evaluation}
                  seasonality={seasonality}
                  dataSource={dataSource}
                  title={chartHeaderLabel}
                  sourceLabel={chartSourceLabel}
                  goldThemeEnabled={false}
                  themePrimary={GOLD_PRIMARY}
                  isPanelLoading={panelLoading}
                  isFullscreen={false}
                  active={isPageActive}
                  onToggleFullscreen={() => {}}
                  loopReplayTick={0}
                  onTimeRangeChange={onSharedTimeRangeChange}
                  onRecentSignalChange={setRecentSignal}
                  onTimeframeChange={setChartTimeframe}
                  hideBuiltinChartToolbar
                  suppressTitleOverlay
                />
              </Suspense>
            </div>
          </div>
        </div>

      </div>

      {/* ── Globe fullscreen overlay — absolute so it stays within content area (no sidebar bleed) ── */}
      {isGlobeFullscreen && (
        <div className="absolute inset-0 z-[70] overflow-hidden bg-[#0c0d10]">
          <button
            type="button"
            onClick={onToggleGlobeFullscreen}
            className="absolute right-4 top-4 z-30 flex h-8 w-8 items-center justify-center rounded-md border border-white/15 text-white hover:border-white"
            title="Exit fullscreen"
            aria-label="Exit fullscreen"
          >
            <Minimize2 size={15} strokeWidth={1.9} />
          </button>
          <GlobeCanvas {...globeCanvasProps} />
        </div>
      )}

      {/* ── Loading overlay ── */}
      {dashboardLoadingActive ? (
        <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center bg-[rgba(12,13,16,0.35)]">
          <div className="rounded-xl border border-white/[0.08] bg-[rgba(28,29,32,0.95)] px-5 py-4 shadow-[0_14px_34px_rgba(0,0,0,0.6)]">
            <div className="flex items-center gap-3">
              <div
                className="h-8 w-8 animate-spin rounded-full border-2"
                style={{
                  borderColor: "rgba(226,202,122,0.2)",
                  borderTopColor: GOLD_PRIMARY,
                }}
              />
              <div className="flex min-w-[200px] flex-col gap-0.5">
                <span className="text-[11px] font-semibold tracking-[0.05em] text-white">{dashboardLoadingHeadline}</span>
                <span className="text-[10px] text-white/40">
                  {dashboardLoadingLabels.length > 1
                    ? `${dashboardLoadingLabels.length} datasets loading`
                    : "Fetching latest dataset"}
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
