"use client";

import { lazy, useCallback, useEffect, useMemo, useRef, useState, Suspense } from "react";
import Image from "next/image";
import { Maximize2, Minimize2, Play, Pause } from "lucide-react";

import { GlobeCanvas } from "@/components/globe/GlobeCanvas";
import { GeoContextPanel } from "@/components/globe/GeoContextPanel";
import { MapboxSatelliteView } from "@/components/globe/MapboxSatelliteView";
import { WORLD_CITIES } from "@/data/globe/world-cities";
import { lookupCountryByName } from "@/data/globe/country-data";
import { WORLD_PORTS } from "@/data/globe/world-ports";
import { KpiGrid } from "@/components/globe/KpiGrid";
import { MacroFundamentalsPanel } from "@/components/globe/MacroFundamentalsPanel";
import { MiniWorldMap } from "@/components/globe/MiniWorldMap";
import { NewsColumns } from "@/components/globe/NewsColumns";
import { SettingsPanel } from "@/components/globe/SettingsPanel";
import ImpactPanel, { type ImpactPanelData } from "@/components/globe/ImpactPanel";
import GlobeTimeline from "@/components/globe/GlobeTimeline";
import GlobeSentinelChat from "@/components/globe/GlobeSentinelChat";
import GlobePatternAlerts from "@/components/globe/GlobePatternAlerts";
import type { GlobePattern } from "@/app/api/globe/pattern-detection/route";
import { EVENT_IMPACT_MAP, REGION_LABELS, IMPACT_SYMBOL_TO_ID, detectEventRegion, impactAssetIds } from "@/lib/globe/eventImpactMap";
import { AssetHeatmapPanel } from "@/components/globe/AssetHeatmapPanel";
import { GlobeAnalyticsPanel } from "@/components/globe/GlobeAnalyticsPanel";
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
const GOLD_PRIMARY = "#c8c8c8";
const noop = () => {};

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
  newsHeatmap: 10 * 60 * 1000,
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
  "newsHeatmap",
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
  newsHeatmap: false,
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
  newsHeatmap: "Loading news heatmap...",
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
  if (key === "newsHeatmap") return "news_heatmap";
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

// Source domain → flag/emoji
const DOMAIN_FLAGS: Record<string, string> = {
  "finance.yahoo.com": "🇺🇸", "fortune.com": "🇺🇸", "cnbc.com": "🇺🇸",
  "wsj.com": "🇺🇸", "marketwatch.com": "🇺🇸", "bloomberg.com": "🇺🇸",
  "reuters.com": "🌐", "biztoc.com": "🌐", "apnews.com": "🌐", "investing.com": "🌐",
  "ft.com": "🇬🇧", "bbc.com": "🇬🇧", "theguardian.com": "🇬🇧", "economist.com": "🇬🇧",
  "handelsblatt.com": "🇩🇪", "spiegel.de": "🇩🇪", "faz.net": "🇩🇪",
  "financialpost.com": "🇨🇦", "thejournal.ie": "🇮🇪",
  "scmp.com": "🇭🇰", "nikkei.com": "🇯🇵",
};

// Headline keyword → asset icon
const NEWS_ASSET_KEYWORDS: Array<[RegExp, string]> = [
  [/\bgold\b/i, "🥇"], [/\bsilver\b/i, "🥈"],
  [/\b(oil|crude|brent|wti)\b/i, "🛢"], [/\b(gas|lng)\b/i, "🔥"],
  [/\b(nasdaq|s&p|dow|equit|stocks?)\b/i, "📈"],
  [/\b(bitcoin|btc|crypto|ethereum|eth)\b/i, "₿"],
  [/\b(tariff|trade war|sanction)\b/i, "🏛"],
  [/\b(fed|ecb|central bank|rate hike|rate cut)\b/i, "🏛"],
  [/\b(inflation|cpi|ppi)\b/i, "📊"],
  [/\b(dollar|usd|euro|yen|forex|currency)\b/i, "💵"],
  [/\b(copper|metal|commodit)\b/i, "🔩"],
  [/\b(wheat|corn|soy|coffee|cocoa|sugar)\b/i, "🌾"],
];

// Priority scoring (0-10) — critical macro/geopolitics rank highest
const NEWS_EXCLUDE_RE = /\b(bitcoin|crypto|ethereum|btc|eth|nft|blockchain|defi|solana|dogecoin|cardano|xrp|ripple|altcoin|stablecoin|coinbase|binance|memecoin)\b/i;
// Obvious non-finance noise (sports / entertainment / lifestyle). Only dropped
// when the headline carries no finance signal (score <= 1).
const NEWS_NOISE_RE = /\b(semifinal|quarterfinal|highlights?|elite|\d+U\b|nba|nfl|nhl|mlb|ncaa|premier league|la liga|soccer|touchdown|playoffs?|recipe|horoscope|zodiac|celebrity|red carpet|box office|movie|film|tv show|series premiere|episode|season \d|gaming|playstation|xbox|nintendo|kardashian|taylor swift|concert|album|trailer|prince harry|royal family|dating|weight loss|streaming service)\b/i;
const NEWS_CRITICAL_RE = /\b(fed|rate hike|rate cut|war|sanction|crash|crisis|default|recession|collapse|contagion|bank run)\b/i; // 10
const NEWS_HIGH_RE = /\b(inflation|gdp|earnings|tariff|opec|fomc|ecb|boj|cpi|ppi|unemployment|jobs report|payrolls)\b/i; // 7
const NEWS_MEDIUM_RE = /\b(oil|gold|dollar|euro|yen|trade|supply|demand|yield|treasury|bond|stocks?|equit|nasdaq|s&p|dow)\b/i; // 4
const NEWS_MACRO_RE = /\b(inflation|cpi|ppi|gdp|unemployment|fed|ecb|boj|rate|yield|recession|debt ceiling|fiscal|monetary|central bank|treasury|fomc)\b/i;
const NEWS_MARKET_RE = /\b(nasdaq|s&p|dow|equit|stocks?|earnings|ipo|dividend|buyback|market cap|rally|selloff|correction|bull|bear)\b/i;

type NewsFilter = "all" | "breaking" | "markets" | "macro";
type NewsSort = "score" | "newest";

function newsAssetIcon(title: string, description?: string): string {
  const text = `${title} ${description ?? ""}`;
  for (const [re, icon] of NEWS_ASSET_KEYWORDS) {
    if (re.test(text)) return icon;
  }
  return "";
}

function newsScore(title: string, description?: string): number {
  const text = `${title} ${description ?? ""}`;
  if (NEWS_CRITICAL_RE.test(text)) return 10;
  if (NEWS_HIGH_RE.test(text)) return 7;
  if (NEWS_MEDIUM_RE.test(text)) return 4;
  return 1;
}

function GlobeNewsColumn({ items }: GlobeNewsColumnProps) {
  const [filter, setFilter] = useState<NewsFilter>("all");
  const [sort, setSort] = useState<NewsSort>("score");

  const filtered = useMemo(() => {
    // Drop crypto headlines + non-finance noise (sports/entertainment with no finance signal)
    let list = items.filter((item) => {
      const text = `${item.title ?? ""} ${item.description ?? ""}`;
      if (NEWS_EXCLUDE_RE.test(text)) return false;
      if (NEWS_NOISE_RE.test(text) && newsScore(item.title ?? "", item.description) <= 1) return false;
      return true;
    });
    if (filter !== "all") {
      list = list.filter((item) => {
        const text = `${item.title ?? ""} ${item.description ?? ""}`;
        if (filter === "breaking") return newsScore(item.title ?? "", item.description) >= 8;
        if (filter === "macro") return NEWS_MACRO_RE.test(text);
        if (filter === "markets") return NEWS_MARKET_RE.test(text);
        return true;
      });
    }
    if (sort === "score") {
      list = [...list].sort(
        (a, b) => newsScore(b.title ?? "", b.description) - newsScore(a.title ?? "", a.description),
      );
    }
    return list;
  }, [items, filter, sort]);

  const FILTER_TABS: Array<{ id: NewsFilter; label: string }> = [
    { id: "all", label: "All" },
    { id: "breaking", label: "🔴 Break" },
    { id: "markets", label: "📊 Mkt" },
    { id: "macro", label: "🌍 Macro" },
  ];

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      {/* Filter bar */}
      <div className="flex shrink-0 items-center gap-1 px-2 py-1.5 border-b border-white/5">
        <div className="flex gap-0.5 overflow-x-auto no-scrollbar">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className="shrink-0 rounded px-1.5 py-[2px] text-[8.5px] font-semibold transition"
              style={{
                background: filter === tab.id ? "rgba(255,255,255,0.12)" : "transparent",
                color: filter === tab.id ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.35)",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setSort(sort === "score" ? "newest" : "score")}
          className="ml-auto shrink-0 rounded px-1.5 py-[2px] text-[8px] transition"
          style={{ color: "rgba(255,255,255,0.30)", background: "transparent" }}
          title={sort === "score" ? "Sort: Priority" : "Sort: Newest"}
        >
          {sort === "score" ? "★ Prio" : "↓ New"}
        </button>
      </div>
      <div className="no-scrollbar min-h-0 flex-1 space-y-[3px] overflow-y-auto overflow-x-hidden px-2 pt-1 pb-8">
        {filtered.length === 0 && (
          <div className="pt-6 text-center text-[11px] text-white/20">No news</div>
        )}
        {filtered.map((item, i) => {
          const ago = timeAgo(item.publishedAt ?? item.timestamp);
          const domain = item.sourceDomain ?? item.source?.split(" ")[0] ?? "";
          const flag = DOMAIN_FLAGS[domain.toLowerCase()] ?? "🌐";
          const assetIcon = newsAssetIcon(item.title ?? "", item.description);
          const score = newsScore(item.title ?? "", item.description);
          const dot = score >= 8 ? "🔴" : score >= 5 ? "🟡" : "";
          return (
            <a
              key={String(item.newsId || item.url || i)}
              href={item.url || "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="group block rounded-[10px] px-2.5 py-2 transition-colors"
              style={{ background: score >= 8 ? "rgba(255,60,60,0.06)" : "rgba(255,255,255,0.025)" }}
            >
              <div className="mb-1 flex items-center gap-1.5">
                <span className="text-[11px] leading-none">{flag}</span>
                {dot && <span className="text-[9px] leading-none">{dot}</span>}
                {assetIcon && <span className="text-[10px] leading-none">{assetIcon}</span>}
                {domain && (
                  <span className="rounded-[4px] px-1.5 py-[1px] text-[9px] font-semibold uppercase tracking-wide"
                    style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.5)" }}>
                    {domain}
                  </span>
                )}
                {ago && (
                  <span className="ml-auto text-[9px] text-white/25">{ago}</span>
                )}
              </div>
              <p className="text-[11px] font-medium leading-snug text-white/80 group-hover:text-white line-clamp-2">
                {item.title}
              </p>
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
  newsHeatmap: "📰",
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
  newsHeatmap: "News Heatmap",
};
const OVERLAY_DESC: Record<string, string> = {
  liveSignals: "Aktive Trade-Signale",
  locations: "Asset-Standorte",
  assets: "Markt-Pins",
  earthquakes: "Beben M>4.5",
  conflicts: "Konfliktzonen",
  wildfires: "Aktive Brände",
  shipTracking: "Live AIS-Schiffe",
  oilRoutes: "Öl-Handelsrouten",
  containerTraffic: "Container-Routen",
  commodityRegions: "Rohstoff-Regionen",
  globalRiskLayer: "Länder-Risiko",
  globalLiquidityMap: "Liquiditäts-Karte",
  shippingDisruptions: "Hafen-Störungen",
  commodityStressMap: "Rohstoff-Stress",
  regionalAssetHighlight: "Asset-Regionen",
  newsHeatmap: "News-Heatmap",
};
type GlobeOverlayControlProps = {
  overlayState: import("@/lib/globe/globe-types").OverlayToggleState;
  overlayLoadingState: Partial<Record<keyof import("@/lib/globe/globe-types").OverlayToggleState, boolean>>;
  onToggleOverlay: (key: keyof import("@/lib/globe/globe-types").OverlayToggleState) => void;
};
function GlobeOverlayControl({ overlayState, overlayLoadingState, onToggleOverlay }: GlobeOverlayControlProps) {
  const keys = Object.keys(OVERLAY_LABELS) as Array<keyof import("@/lib/globe/globe-types").OverlayToggleState>;
  return (
    <div className="no-scrollbar h-full overflow-y-auto p-2">
      <div className="grid gap-1.5" style={{ gridTemplateColumns: "1fr 1fr" }}>
        {keys.map((key) => {
          const active = Boolean(overlayState[key]);
          const loading = Boolean(overlayLoadingState?.[key]);
          return (
            <button
              key={key}
              type="button"
              onClick={() => onToggleOverlay(key)}
              aria-pressed={active}
              title={OVERLAY_DESC[key] ?? OVERLAY_LABELS[key] ?? key}
              className="flex items-center gap-2 rounded-[8px] px-2.5 py-2 text-left transition"
              style={{
                background: active ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.03)",
                border: `1px solid ${active ? "rgba(200,200,208,0.50)" : "rgba(255,255,255,0.07)"}`,
              }}
            >
              <span style={{ fontSize: 15, lineHeight: 1, flexShrink: 0, opacity: active ? 1 : 0.45 }}>
                {OVERLAY_EMOJI[key] ?? "◦"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[10px] font-semibold leading-snug"
                  style={{ color: active ? "#ffffff" : "rgba(255,255,255,0.65)" }}>
                  {OVERLAY_LABELS[key] ?? key}{loading ? " …" : ""}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function GlobeApp({ mobileMode = false }: { mobileMode?: boolean } = {}) {
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
  const customAssetsRef = useRef<AssetItem[]>((() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem("clf_globe_custom_assets_v1");
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch { return []; }
  })());
  useEffect(() => { assetsRef.current = assets; }, [assets]);
  const [globalNews, setGlobalNews] = useState<NewsItem[]>([]);
  const [assetNews, setAssetNews] = useState<NewsItem[]>([]);

  const [selectedAssetId, setSelectedAssetId] = useState(initialPersisted.selectedAssetId || "");
  const [focusAssetId, setFocusAssetId] = useState<string | null>(null);
  const [focusLocation, setFocusLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [chartTimeframe, setChartTimeframe] = useState<"M" | "W" | "D" | "4H" | "1H">("D");
  const [globePrices, setGlobePrices] = useState<Record<string, number>>({});
  const [globeChanges, setGlobeChanges] = useState<Record<string, number>>({});
  const [bottomPanelTab, setBottomPanelTab] = useState<"chart" | "analytics">("chart");
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
  const [selectedGeoEntity, setSelectedGeoEntity] = useState<import("@/components/globe/GeoContextPanel").SelectedGeoEntity | null>(null);
  const [satelliteMode, setSatelliteMode] = useState(false);
  const [mapMode, setMapMode] = useState<"globe" | "satellite">("globe");
  const [showContNav, setShowContNav] = useState(false);
  const [impactPanel, setImpactPanel] = useState<ImpactPanelData | null>(null);
  const [highlightedAssetIds, setHighlightedAssetIds] = useState<string[]>([]);
  const [showTimeline, setShowTimeline] = useState(false);
  const [timelineDay, setTimelineDay] = useState<string | null>(null);
  const [showSentinel, setShowSentinel] = useState(false);
  const [patternAlerts, setPatternAlerts] = useState<GlobePattern[]>([]);
  const [dismissedPatternIds, setDismissedPatternIds] = useState<string[]>([]);
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
  const [newsHeatmapScores, setNewsHeatmapScores] = useState<Record<string, number>>({});
  const [liveSignalItems, setLiveSignalItems] = useState<Array<{ symbol: string; direction: string; inPosition: boolean; strategyId: string | null }>>([]);
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
          setAssets([...(assetsRes.value.items ?? []), ...customAssetsRef.current]);
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
    if (!isPageActive) return;
    let cancelled = false;
    const fetchPrices = () => {
      fetch("/api/prices/globe")
        .then((r) => r.ok ? r.json() : null)
        .then((d: { prices?: Record<string, number | null>; changes?: Record<string, number | null> } | null) => {
          if (cancelled || !d?.prices) return;
          const clean: Record<string, number> = {};
          for (const [id, p] of Object.entries(d.prices)) {
            if (typeof p === "number" && Number.isFinite(p)) clean[id] = p;
          }
          setGlobePrices(clean);
          if (d.changes) {
            const chg: Record<string, number> = {};
            for (const [id, c] of Object.entries(d.changes)) {
              if (typeof c === "number" && Number.isFinite(c)) chg[id] = c;
            }
            setGlobeChanges(chg);
          }
        })
        .catch(() => {/* ignore */});
    };
    fetchPrices();
    const interval = setInterval(fetchPrices, 60_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [isPageActive]);

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
      if (overlayState.liveSignals && isStale(overlayLastUpdatedAtRef.current.liveSignals, overlayCacheMs("liveSignals"))) {
        withOverlayLoad("liveSignals", fetch("/api/signals/live")
          .then((r) => r.ok ? r.json() : null)
          .then((d: { items?: Array<{ symbol: string; direction: string; inPosition: boolean; strategyId: string | null }> } | null) => {
            if (!d?.items) return;
            setLiveSignalItems(d.items);
            overlayLastUpdatedAtRef.current.liveSignals = Date.now();
          }))
          .catch(() => {
            // no-op
          });
      }
      if (overlayState.newsHeatmap && isStale(overlayLastUpdatedAtRef.current.newsHeatmap, overlayCacheMs("newsHeatmap"))) {
        withOverlayLoad("newsHeatmap", fetch("/api/overlay/news_heatmap")
          .then((r) => r.ok ? r.json() : null)
          .then((d: { countries?: Array<{ country: string; score: number }> } | null) => {
            if (!d?.countries) return;
            const scores: Record<string, number> = {};
            for (const c of d.countries) scores[c.country] = c.score;
            setNewsHeatmapScores(scores);
            overlayLastUpdatedAtRef.current.newsHeatmap = Date.now();
          }))
          .catch(() => {
            // no-op
          });
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
    overlayState.liveSignals,
    overlayState.newsHeatmap,
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
    overlayState.newsHeatmap,
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
  const EXCHANGE_MARKERS = useMemo(() => [
    { id: "__exch_nyse__",  name: "NYSE",   lat: 40.71,  lng: -74.01,  country: "US" },
    { id: "__exch_cme__",   name: "CME",    lat: 41.88,  lng: -87.63,  country: "US" },
    { id: "__exch_comex__", name: "COMEX",  lat: 40.71,  lng: -74.01,  country: "US" },
    { id: "__exch_cbot__",  name: "CBOT",   lat: 41.88,  lng: -87.63,  country: "US" },
    { id: "__exch_nymex__", name: "NYMEX",  lat: 40.71,  lng: -74.00,  country: "US" },
    { id: "__exch_iceus__", name: "ICE US", lat: 40.71,  lng: -73.98,  country: "US" },
    { id: "__exch_nas__",   name: "NASDAQ", lat: 40.76,  lng: -73.98,  country: "US" },
    { id: "__exch_lse__",   name: "LSE",    lat: 51.51,  lng: -0.10,   country: "GB" },
    { id: "__exch_eurex__", name: "EUREX",  lat: 50.11,  lng: 8.68,    country: "DE" },
    { id: "__exch_xetra__", name: "XETRA",  lat: 50.11,  lng: 8.68,    country: "DE" },
    { id: "__exch_euronx__",name: "Euronext",lat: 48.86, lng: 2.35,    country: "FR" },
    { id: "__exch_tse__",   name: "TSE",    lat: 35.68,  lng: 139.69,  country: "JP" },
    { id: "__exch_hkex__",  name: "HKEX",   lat: 22.32,  lng: 114.17,  country: "HK" },
    { id: "__exch_sse__",   name: "SSE",    lat: 31.23,  lng: 121.47,  country: "CN" },
    { id: "__exch_sgx__",   name: "SGX",    lat: 1.35,   lng: 103.82,  country: "SG" },
    { id: "__exch_asx__",   name: "ASX",    lat: -33.87, lng: 151.21,  country: "AU" },
    { id: "__exch_bse__",   name: "BSE",    lat: 19.08,  lng: 72.88,   country: "IN" },
    { id: "__exch_krx__",   name: "KRX",    lat: 37.57,  lng: 126.98,  country: "KR" },
    { id: "__exch_bmv__",   name: "BMV",    lat: 19.43,  lng: -99.13,  country: "MX" },
    { id: "__exch_b3__",    name: "B3",     lat: -23.55, lng: -46.63,  country: "BR" },
    { id: "__exch_jse__",   name: "JSE",    lat: -26.20, lng: 28.04,   country: "ZA" },
  ].map((ex) => ({
    ...ex,
    color: "#a0a0a0",
    category: "Locations",
    iconKey: "exchange",
    symbol: "",
    tvSource: "",
    defaultEnabled: true,
    showOnGlobe: true,
    locations: [],
    score: 1,
    size: 7,
    pulse: false,
    labelVisible: true,
    isCluster: false,
    assetIds: [],
    clusterCount: 0,
    aiScore: 0.5,
    macroSensitivity: "",
    shortName: ex.name,
    locationLabel: ex.country,
    label: ex.name,
    icon: "EX",
    kind: "location",
  })), []);
  const signalMarkers = useMemo(() => {
    if (!overlayState.liveSignals || !liveSignalItems.length || !assets.length) return [] as MarkerPoint[];
    const bySymbol = new Map<string, AssetItem>();
    for (const a of assets) {
      const tv = String(a.tvSource || "");
      const sym = tv.includes(":") ? tv.split(":").pop()! : tv;
      if (sym) bySymbol.set(sym.toUpperCase(), a);
      if (a.symbol) bySymbol.set(String(a.symbol).toUpperCase(), a);
    }
    const out: MarkerPoint[] = [];
    for (const sig of liveSignalItems) {
      const asset = bySymbol.get(String(sig.symbol).toUpperCase());
      if (!asset) continue;
      const dir = sig.direction.toUpperCase();
      const color = !sig.inPosition ? "#FFFFFF" : dir === "SHORT" ? "#FF3333" : "#c8c8c8";
      const price = globePrices[asset.id];
      const priceStr = typeof price === "number" && Number.isFinite(price)
        ? (price >= 1000 ? price.toLocaleString("en-US", { maximumFractionDigits: 0 }) : price.toFixed(2))
        : "";
      const dirLabel = dir === "SHORT" ? "SHORT" : dir === "LONG" ? "LONG" : "PENDING";
      out.push({
        id: `signal-${asset.id}`,
        assetId: asset.id,
        assetIds: [asset.id],
        isCluster: false,
        name: asset.name,
        shortName: sig.symbol,
        category: asset.category,
        country: asset.country,
        locationLabel: asset.country,
        icon: asset.iconKey,
        color,
        lat: asset.lat,
        lng: asset.lng,
        label: `${sig.symbol} ${dirLabel}${priceStr ? ` · ${priceStr}` : ""}`,
        clusterCount: 0,
        aiScore: 0,
        macroSensitivity: "",
        kind: "signal",
        signalDirection: dirLabel,
        signalInPosition: sig.inPosition,
        signalPrice: priceStr,
        eventDescription: `${dirLabel}${sig.strategyId ? ` · ${sig.strategyId}` : ""}`,
      } as MarkerPoint);
    }
    return out;
  }, [overlayState.liveSignals, liveSignalItems, assets, globePrices]);

  // City markers — visible when zoomed in (altitude < 1.6), scaled by weight
  const cityMarkers = useMemo((): MarkerPoint[] => {
    const alt = Number(camera?.altitude ?? 1.8);
    if (alt > 1.6) return [];
    const minWeight = alt > 1.0 ? 0.75 : alt > 0.6 ? 0.45 : 0.0;
    return WORLD_CITIES.filter((c) => c.weight >= minWeight).map((c) => ({
      id: `city:${c.id}`,
      assetId: "",
      assetIds: [],
      isCluster: false,
      name: c.name,
      shortName: c.name,
      category: "City",
      country: c.countryName,
      locationLabel: `${c.name}, ${c.countryName}`,
      icon: "●",
      color: c.weight >= 0.85 ? "#c8c8c8" : "rgba(200,200,210,0.7)",
      lat: c.lat,
      lng: c.lng,
      label: c.name,
      clusterCount: 0,
      aiScore: c.weight,
      macroSensitivity: "medium",
      kind: "city" as const,
    }));
  }, [camera?.altitude]);

  // Port markers — visible at zoom < 1.2 when satellite mode is on
  const portMarkers = useMemo((): MarkerPoint[] => {
    if (!satelliteMode) return [];
    const alt = Number(camera?.altitude ?? 1.8);
    if (alt > 1.2) return [];
    const minType = alt > 0.7 ? "mega" : "major";
    const allowed = minType === "mega" ? ["mega"] : ["mega", "major", "regional"];
    return WORLD_PORTS.filter((p) => allowed.includes(p.type)).map((p) => ({
      id: `port:${p.id}`,
      assetId: "",
      assetIds: [],
      isCluster: false,
      name: p.name,
      shortName: p.name,
      category: "Port",
      country: p.countryIso,
      locationLabel: `${p.name} Port`,
      icon: "⚓",
      color: p.type === "mega" ? "#38bdf8" : "rgba(100,180,220,0.7)",
      lat: p.lat,
      lng: p.lng,
      label: p.name,
      clusterCount: 0,
      aiScore: p.type === "mega" ? 1 : p.type === "major" ? 0.6 : 0.3,
      macroSensitivity: "high",
      kind: "commodity" as const,
    }));
  }, [satelliteMode, camera?.altitude]);

  const visibleMarkers = useMemo(
    () => {
      const base = overlayState.assets ? markers : [];
      const withHq = overlayState.locations ? [...base, ...(EXCHANGE_MARKERS as never[])] : base;
      const withSignals = signalMarkers.length ? [...withHq, ...(signalMarkers as never[])] : withHq;
      const withCities = cityMarkers.length ? [...withSignals, ...(cityMarkers as never[])] : withSignals;
      return portMarkers.length ? [...withCities, ...(portMarkers as never[])] : withCities;
    },
    [markers, overlayState.assets, overlayState.locations, EXCHANGE_MARKERS, signalMarkers, cityMarkers, portMarkers],
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

  const onCountryClick = useCallback((countryName: string, lat: number, lng: number) => {
    const entry = lookupCountryByName(countryName);
    setSelectedGeoEntity({
      kind: "country",
      id: entry?.iso ?? countryName,
      iso: entry?.iso,
      name: entry?.name ?? countryName,
      lat,
      lng,
    });
  }, []);

  const onCityMarkerClick = useCallback((markerId: string) => {
    const cityId = markerId.replace(/^city:/, "");
    const city = WORLD_CITIES.find((c) => c.id === cityId);
    if (!city) return;
    setSelectedGeoEntity({
      kind: "city",
      id: cityId,
      iso: city.countryIso,
      name: city.name,
      lat: city.lat,
      lng: city.lng,
    });
  }, []);

  const [geoFocusTarget, setGeoFocusTarget] = useState<{ lat: number; lng: number; altitude: number } | null>(null);
  const onGeoZoomTo = useCallback((lat: number, lng: number, altitude: number) => {
    setGeoFocusTarget({ lat, lng, altitude });
  }, []);

  // ── Event → Asset Impact correlation ──
  const impactTimerRef = useRef<number | null>(null);
  const handleEventClick = useCallback((event: { name: string; lat: number; lng: number; type: string }) => {
    const region = detectEventRegion(event.lat, event.lng);
    if (!region || !EVENT_IMPACT_MAP[region]) {
      setImpactPanel(null);
      setHighlightedAssetIds([]);
      return;
    }
    const impact = EVENT_IMPACT_MAP[region];
    setHighlightedAssetIds(impactAssetIds(impact.assets));
    setImpactPanel({
      event: event.name,
      region,
      regionLabel: REGION_LABELS[region] ?? region,
      assets: impact.assets,
      direction: impact.direction,
      reason: impact.reason,
    });
    if (impactTimerRef.current) window.clearTimeout(impactTimerRef.current);
    impactTimerRef.current = window.setTimeout(() => {
      setImpactPanel(null);
      setHighlightedAssetIds([]);
    }, 30000);
  }, []);

  const closeImpactPanel = useCallback(() => {
    if (impactTimerRef.current) window.clearTimeout(impactTimerRef.current);
    setImpactPanel(null);
    setHighlightedAssetIds([]);
  }, []);

  const handleImpactOpenChart = useCallback((ticker: string) => {
    const id = impactAssetIds([ticker])[0];
    if (!id) return;
    setSelectedAssetId(id);
    setBottomPanelTab("chart");
    setEnabledAssets((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);

  // ── Timeline: today (client) + optional day-scrub filter on globe events ──
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const displayGeoEvents = useMemo(
    () =>
      timelineDay
        ? geoEvents.filter((e) => String(e.date || e.timestamp || "").slice(0, 10) === timelineDay)
        : geoEvents,
    [geoEvents, timelineDay],
  );

  // ── Pattern detection: poll every 5 min with current events ──
  const geoEventsRef = useRef<GeoEventItem[]>(geoEvents);
  useEffect(() => {
    geoEventsRef.current = geoEvents;
  }, [geoEvents]);
  useEffect(() => {
    let cancelled = false;
    const runDetection = async () => {
      const events = geoEventsRef.current;
      if (!events || events.length === 0) return;
      try {
        const res = await fetch("/api/globe/pattern-detection", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ events }),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data?.patterns)) setPatternAlerts(data.patterns as GlobePattern[]);
      } catch {
        /* ignore — best-effort */
      }
    };
    const t0 = window.setTimeout(runDetection, 8000);
    const iv = window.setInterval(runDetection, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearTimeout(t0);
      window.clearInterval(iv);
    };
  }, []);
  const visiblePatternAlerts = useMemo(
    () => patternAlerts.filter((p) => !dismissedPatternIds.includes(p.id)),
    [patternAlerts, dismissedPatternIds],
  );
  const onPatternFocus = useCallback(
    (p: GlobePattern) => {
      onGeoZoomTo(p.lat, p.lng, 1.5);
      if (p.region && EVENT_IMPACT_MAP[p.region]) {
        handleEventClick({ name: p.pattern, lat: p.lat, lng: p.lng, type: "pattern" });
      } else if (p.affectedAssets.length) {
        setHighlightedAssetIds(impactAssetIds(p.affectedAssets));
      }
    },
    [onGeoZoomTo, handleEventClick],
  );
  const onPatternDismiss = useCallback((id: string) => {
    setDismissedPatternIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);

  // Live quotes for the assets shown in the impact panel (keyed by display ticker).
  const impactQuotes = useMemo(() => {
    if (!impactPanel) return {} as Record<string, { price: number; change: number }>;
    const out: Record<string, { price: number; change: number }> = {};
    for (const t of impactPanel.assets) {
      const id = IMPACT_SYMBOL_TO_ID[t];
      if (id && globePrices[id] != null) out[t] = { price: globePrices[id], change: globeChanges[id] ?? 0 };
    }
    return out;
  }, [impactPanel, globePrices, globeChanges]);

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

  const onAddSymbol = useCallback((raw: string) => {
    const ticker = String(raw || "").trim().toUpperCase();
    if (!ticker) return;
    const id = `custom_${ticker.replace(/[^A-Z0-9.=-]/g, "_")}`;
    // De-dupe: if already present, just select it
    if (assetsRef.current.some((a) => a.id === id)) {
      setSelectedAssetId(id);
      return;
    }
    const custom: AssetItem = {
      id,
      name: ticker,
      category: "Custom",
      iconKey: "custom",
      tvSource: ticker,
      symbol: ticker,
      lat: 40.71,
      lng: -74.01,
      country: "—",
      color: "#c8c8c8",
      defaultEnabled: true,
      showOnGlobe: true,
      locations: [],
    };
    customAssetsRef.current = [...customAssetsRef.current.filter((a) => a.id !== id), custom];
    try {
      window.localStorage.setItem("clf_globe_custom_assets_v1", JSON.stringify(customAssetsRef.current));
    } catch { /* ignore */ }
    setAssets((prev) => [...prev, custom]);
    setEnabledAssets((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setSelectedAssetId(id);
    activateSection("valuation");
    activateSection("seasonality");
  }, [activateSection]);

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
    // NOTE: setSharedTimeRange intentionally removed — state was never read by any consumer,
    // calling it triggered GlobeApp re-renders on every chart scroll → render loop.
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
  const onCameraChange = useCallback((cam: import("@/lib/globe/globe-types").GlobeCameraState) => {
    setCamera(cam);
    const alt = Number(cam.altitude ?? 2);
    // Auto-switch: very deep zoom → satellite, zoom back out → globe
    if (alt < 0.22) {
      setMapMode("satellite");
    } else if (alt > 0.55) {
      setMapMode("globe");
    }
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
  const neutralAccent = goldThemeEnabled ? GOLD_PRIMARY : "#9a9a9a";
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
    geoEvents: displayGeoEvents,
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
    goldThemeEnabled,
    globePrices,
    newsHeatmapScores,
    onCameraChange,
    onSelectAsset: onGlobeSelectAsset,
    onFocusHandled,
    onFocusLocationHandled,
    onCountryClick,
    onCityMarkerClick,
    onEventClick: handleEventClick,
    highlightedAssetIds,
    geoFocusTarget,
    onGeoFocusHandled: () => setGeoFocusTarget(null),
    satelliteMode,
  };

  // ── MOBILE LAYOUT ─────────────────────────────────────────────────────────
  if (mobileMode) {
    const overlayKeys = Object.keys(OVERLAY_LABELS) as Array<keyof OverlayToggleState>;
    return (
      <div
        className="no-scrollbar"
        style={{
          height: "100%",
          overflowY: "auto",
          overflowX: "hidden",
          background: "#06070a",
          color: "#fff",
          display: "flex",
          flexDirection: "column",
          gap: 0,
        }}
      >
        {/* ① Overlay Control — horizontal single-row swipe strip */}
        <div
          className="no-scrollbar"
          style={{
            display: "flex",
            gap: 6,
            padding: "8px 12px",
            overflowX: "auto",
            flexShrink: 0,
            borderBottom: "1px solid rgba(255,255,255,0.05)",
          }}
        >
          {overlayKeys.map((key) => {
            const active = Boolean(overlayState[key]);
            const loading = Boolean(overlayLoadingState?.[key]);
            return (
              <button
                key={key}
                type="button"
                onClick={() => onToggleOverlay(key)}
                aria-pressed={active}
                style={{
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "5px 10px",
                  borderRadius: 20,
                  border: active ? "1px solid rgba(200,200,200,0.55)" : "1px solid rgba(255,255,255,0.08)",
                  background: active ? "rgba(200,200,200,0.12)" : "rgba(255,255,255,0.03)",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                <span style={{ fontSize: 12 }}>{OVERLAY_EMOJI[key] ?? "◦"}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: active ? "#c8c8c8" : "rgba(255,255,255,0.45)" }}>
                  {OVERLAY_LABELS[key] ?? key}{loading ? " …" : ""}
                </span>
              </button>
            );
          })}
        </div>

        {/* ② Globe / Satellite-Map */}
        <div
          ref={globeShellRef}
          className="globe-stage relative shrink-0 overflow-hidden"
          style={{ height: "56vw", minHeight: 240, maxHeight: 380 }}
        >
          {mapMode === "globe"
            ? <GlobeCanvas {...globeCanvasProps} />
            : (
              <MapboxSatelliteView
                initialLat={Number(camera?.lat ?? 30)}
                initialLng={Number(camera?.lng ?? 20)}
                initialZoom={2}
                geoEvents={geoEvents}
                ships={activeShipTracking}
                overlayRoutes={activeRouteOverlays}
                markers={visibleMarkers}
                showPorts
                showAirports
                showMilitary
                showShips={overlayState.shipTracking}
                showEvents={overlayState.earthquakes || overlayState.conflicts || overlayState.wildfires}
              />
            )
          }
          {/* Globe / Satellite toggle pills */}
          <div className="absolute left-2 top-2 z-30 flex gap-1">
            <button
              type="button"
              onClick={() => setMapMode("globe")}
              style={{
                padding: "3px 8px", borderRadius: 14, fontSize: 10, fontWeight: 700, cursor: "pointer",
                border: mapMode === "globe" ? "1px solid rgba(200,200,200,0.6)" : "1px solid rgba(255,255,255,0.12)",
                background: mapMode === "globe" ? "rgba(200,200,200,0.15)" : "rgba(6,7,10,0.7)",
                color: mapMode === "globe" ? "#c8c8c8" : "rgba(255,255,255,0.4)",
              }}
            >🌍 Globe</button>
            <button
              type="button"
              onClick={() => setMapMode("satellite")}
              style={{
                padding: "3px 8px", borderRadius: 14, fontSize: 10, fontWeight: 700, cursor: "pointer",
                border: mapMode === "satellite" ? "1px solid rgba(220,220,228,0.6)" : "1px solid rgba(255,255,255,0.12)",
                background: mapMode === "satellite" ? "rgba(220,220,228,0.15)" : "rgba(6,7,10,0.7)",
                color: mapMode === "satellite" ? "#dcdce4" : "rgba(255,255,255,0.4)",
              }}
            >🛰 SAT</button>
          </div>
          {/* Satellite texture toggle (Globe mode only) */}
          {mapMode === "globe" && <button
            type="button"
            onClick={() => setSatelliteMode((v) => !v)}
            className={`absolute right-2 top-2 z-30 flex h-7 w-7 items-center justify-center rounded-md border transition ${
              satelliteMode
                ? "border-[#dcdce4]/80 text-[#dcdce4] bg-[rgba(220,220,228,0.12)]"
                : "border-white/15 text-white/50"
            }`}
            title={satelliteMode ? "Dark globe" : "Satellite texture"}
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.2"/>
              <ellipse cx="6.5" cy="6.5" rx="2" ry="4.5" stroke="currentColor" strokeWidth="1"/>
              <line x1="2" y1="6.5" x2="11" y2="6.5" stroke="currentColor" strokeWidth="1"/>
            </svg>
          </button>}
          {/* Play/Pause — Globe mode only */}
          {mapMode === "globe" && <button
            type="button"
            onClick={() => setGlobeRotateMode((m) => m === "off" ? "slow" : "off")}
            className={`absolute right-10 top-2 z-30 flex h-7 w-7 items-center justify-center rounded-md border transition ${
              globeRotateMode !== "off" ? "border-[#c8c8c8]/70 text-[#c8c8c8]" : "border-white/15 text-white/50"
            }`}
          >
            {globeRotateMode !== "off" ? <Pause size={12} strokeWidth={2} /> : <Play size={12} strokeWidth={2} />}
          </button>}
          {/* Continent nav toggle + buttons */}
          <button
            type="button"
            onClick={() => setShowContNav((v) => !v)}
            className="absolute bottom-2 right-2 z-30 rounded border px-1.5 py-0.5 text-[8px] font-semibold tracking-[0.06em] backdrop-blur-sm transition"
            style={{
              border: showContNav ? "1px solid rgba(200,200,200,0.4)" : "1px solid rgba(255,255,255,0.1)",
              background: "rgba(10,10,14,0.75)",
              color: showContNav ? "rgba(200,200,200,0.8)" : "rgba(255,255,255,0.35)",
            }}
          >
            ◎ Nav
          </button>
          {showContNav && (
            <div className="absolute bottom-2 left-1/2 z-30 flex -translate-x-1/2 gap-1">
              {([
                { label: "NA", lat: 40, lng: -100, alt: 2.2 },
                { label: "SA", lat: -15, lng: -60, alt: 2.0 },
                { label: "EU", lat: 50, lng: 15, alt: 1.8 },
                { label: "AF", lat: 5, lng: 22, alt: 2.0 },
                { label: "ME", lat: 27, lng: 45, alt: 1.6 },
                { label: "AS", lat: 35, lng: 105, alt: 2.2 },
                { label: "OC", lat: -25, lng: 135, alt: 2.0 },
              ] as const).map((c) => (
                <button
                  key={c.label}
                  type="button"
                  onClick={() => onGeoZoomTo(c.lat, c.lng, c.alt)}
                  className="rounded border border-white/15 bg-[rgba(10,10,14,0.75)] px-1.5 py-0.5 text-[8px] font-semibold tracking-[0.06em] text-white/50 backdrop-blur-sm"
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ③ 2D Mini Map */}
        <div className="shrink-0 overflow-hidden" style={{ height: "34vw", minHeight: 140, maxHeight: 240 }}>
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
            goldThemeEnabled={goldThemeEnabled}
            assetUsage={assetUsage}
            newsHeatmapScores={newsHeatmapScores}
            newsHeatmapActive={overlayState.newsHeatmap}
            focusLat={Number(camera?.lat)}
            focusLng={Number(camera?.lng)}
            onSelectPoint={onSelectPointFromMiniMap}
          />
        </div>

        {/* ④ Watchlist */}
        <div
          className="shrink-0"
          style={{ borderTop: "1px solid rgba(255,255,255,0.05)", padding: "8px 0 0" }}
        >
          <div style={{ padding: "0 12px 6px", fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.35)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Watchlist
          </div>
          <div className="no-scrollbar" style={{ height: 220, overflowY: "auto" }}>
            <SettingsPanel
              assets={assets}
              enabledSet={enabledSet}
              categoryEnabled={categoryEnabled}
              selectedAssetId={selectedAssetId}
              goldThemeEnabled={goldThemeEnabled}
              highlightedAssetIds={highlightedAssetIds}
              onSelectAsset={onSelectAssetFromWatchlist}
              onToggleAsset={onToggleAsset}
              onToggleCategory={onToggleCategory}
              onAllOn={onAllOn}
              onAllOff={onAllOff}
              onRefreshData={onRefreshData}
              onAddSymbol={onAddSymbol}
              overlayState={overlayState}
              overlayLoadingState={overlayLoadingState}
              onToggleOverlay={onToggleOverlay}
              hideOverlayControls
            />
          </div>
        </div>

        {/* ⑤ Global News */}
        <div
          className="shrink-0"
          style={{ borderTop: "1px solid rgba(255,255,255,0.05)", padding: "8px 0 0" }}
        >
          <div style={{ padding: "0 12px 6px", fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.35)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Global News
          </div>
          <div className="no-scrollbar" style={{ height: 260, overflowY: "auto" }}>
            <GlobeNewsColumn
              items={globalNews}
              title="Global News"
              goldThemeEnabled={goldThemeEnabled}
            />
          </div>
        </div>

        {/* ⑥ Asset News */}
        <div
          className="shrink-0"
          style={{ borderTop: "1px solid rgba(255,255,255,0.05)", padding: "8px 0 0" }}
        >
          <div style={{ padding: "0 12px 6px", fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.35)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            {selectedAsset?.name ?? "Asset"} News
          </div>
          <div className="no-scrollbar" style={{ height: 260, overflowY: "auto" }}>
            <GlobeNewsColumn
              items={assetNews}
              title={`${selectedAsset?.name ?? "Asset"} News`}
              goldThemeEnabled={goldThemeEnabled}
            />
          </div>
        </div>

        {/* ⑦ Candle Chart */}
        <div
          className="shrink-0"
          style={{ borderTop: "1px solid rgba(255,255,255,0.05)", padding: "8px 0 0" }}
        >
          <div style={{ padding: "0 12px 6px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.35)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Chart — {chartHeaderLabel}
            </span>
            <div style={{ display: "flex", gap: 4 }}>
              {(["D", "4H", "W"] as const).map((tf) => (
                <button
                  key={tf}
                  type="button"
                  onClick={() => setChartTimeframe(tf)}
                  style={{
                    padding: "2px 7px", borderRadius: 4, fontSize: 10, fontWeight: 600, cursor: "pointer",
                    border: chartTimeframe === tf ? "1px solid rgba(255,255,255,0.3)" : "1px solid rgba(255,255,255,0.08)",
                    background: chartTimeframe === tf ? "rgba(255,255,255,0.1)" : "transparent",
                    color: chartTimeframe === tf ? "#fff" : "rgba(255,255,255,0.4)",
                  }}
                >
                  {tf === "D" ? "1D" : tf === "4H" ? "4H" : "1W"}
                </button>
              ))}
            </div>
          </div>
          <div style={{ height: 300 }}>
            <Suspense fallback={<div style={{ display: "grid", height: "100%", placeItems: "center", fontSize: 12, color: "rgba(255,255,255,0.3)" }}>Loading chart…</div>}>
              <CandleChart
                payload={timeseries}
                evaluation={evaluation}
                seasonality={seasonality}
                dataSource={dataSource}
                title={chartHeaderLabel}
                sourceLabel={chartSourceLabel}
                goldThemeEnabled={goldThemeEnabled}
                themePrimary={GOLD_PRIMARY}
                isPanelLoading={panelLoading}
                isFullscreen={false}
                active={isPageActive}
                onToggleFullscreen={noop}
                loopReplayTick={visualLoopTick}
                onTimeRangeChange={onSharedTimeRangeChange}
                onRecentSignalChange={setRecentSignal}
                onTimeframeChange={setChartTimeframe}
                hideBuiltinChartToolbar
                suppressTitleOverlay
              />
            </Suspense>
          </div>
        </div>

        {/* bottom breathing room for nav bar */}
        <div style={{ height: 16, flexShrink: 0 }} />
      </div>
    );
  }
  // ── END MOBILE LAYOUT ─────────────────────────────────────────────────────

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#06070a] text-white">
      <div
        className="grid h-full w-full p-3"
        style={mobileMode
          ? { gridTemplateColumns: "100%", gridTemplateRows: "100%", gap: 0, padding: 0 }
          : { gridTemplateColumns: "20% 50% 30%", gridTemplateRows: "100%", gap: 12 }}
      >

        {/* ── LEFT: Watchlist + Overlay Control ── */}
        <div className="flex min-h-0 flex-col gap-3 overflow-hidden" style={mobileMode ? { display: "none" } : undefined}>
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
                goldThemeEnabled={goldThemeEnabled}
                highlightedAssetIds={highlightedAssetIds}
                onSelectAsset={onSelectAssetFromWatchlist}
                onToggleAsset={onToggleAsset}
                onToggleCategory={onToggleCategory}
                onAllOn={onAllOn}
                onAllOff={onAllOff}
                onRefreshData={onRefreshData}
                onAddSymbol={onAddSymbol}
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
                {/* Globe / Satellite-Map mode toggle */}
                <div className="absolute left-3 top-3 z-30 flex gap-1">
                  <button
                    type="button"
                    onClick={() => setMapMode("globe")}
                    className={`flex h-7 items-center gap-1 rounded-md border px-2 text-[10px] font-semibold transition ${
                      mapMode === "globe"
                        ? "border-[#c8c8c8]/70 bg-[rgba(200,200,200,0.12)] text-[#c8c8c8]"
                        : "border-white/15 text-white/40 hover:text-white/70"
                    }`}
                    title="3D Globe view"
                  >
                    🌍 Globe
                  </button>
                  <button
                    type="button"
                    onClick={() => setMapMode("satellite")}
                    className={`flex h-7 items-center gap-1 rounded-md border px-2 text-[10px] font-semibold transition ${
                      mapMode === "satellite"
                        ? "border-[#dcdce4]/70 bg-[rgba(220,220,228,0.12)] text-[#dcdce4]"
                        : "border-white/15 text-white/40 hover:text-white/70"
                    }`}
                    title="Satellite map (Google Earth zoom)"
                  >
                    🛰 Satellite
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowTimeline((v) => !v)}
                    className={`flex h-7 items-center gap-1 rounded-md border px-2 text-[10px] font-semibold transition ${
                      showTimeline
                        ? "border-[#D4AF37]/70 bg-[rgba(212,175,55,0.12)] text-[#D4AF37]"
                        : "border-white/15 text-white/40 hover:text-white/70"
                    }`}
                    title="Event timeline (last 30 days)"
                  >
                    ⏱ Timeline
                  </button>
                </div>
                {/* Sentinel Globe Intel chat */}
                <button
                  type="button"
                  onClick={() => setShowSentinel((v) => !v)}
                  className={`absolute right-[2.75rem] top-3 z-40 flex h-7 w-7 items-center justify-center rounded-md border text-[13px] transition ${
                    showSentinel ? "border-[#D4AF37]/70 bg-[rgba(212,175,55,0.14)]" : "border-white/15 hover:border-white/50"
                  }`}
                  title="Sentinel Globe Intel"
                  aria-label="Sentinel Globe Intel"
                >
                  🛰
                </button>
                {/* Fullscreen */}
                <button
                  type="button"
                  onClick={onToggleGlobeFullscreen}
                  className="absolute right-3 top-3 z-30 flex h-7 w-7 items-center justify-center rounded-md border border-white/15 text-white hover:border-white"
                  title="Fullscreen"
                  aria-label="Fullscreen"
                >
                  <Maximize2 size={14} strokeWidth={1.9} />
                </button>
                {/* Satellite texture toggle — only in Globe mode */}
                {mapMode === "globe" && <button
                  type="button"
                  onClick={() => setSatelliteMode((v) => !v)}
                  className={`absolute right-12 top-3 z-30 flex h-7 w-7 items-center justify-center rounded-md border transition ${
                    satelliteMode
                      ? "border-[#dcdce4]/80 text-[#dcdce4] bg-[rgba(220,220,228,0.12)]"
                      : "border-white/15 text-white/50 hover:border-white/40 hover:text-white"
                  }`}
                  title={satelliteMode ? "Dark globe" : "Satellite view"}
                  aria-label="Toggle satellite"
                >
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                    <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.2"/>
                    <ellipse cx="6.5" cy="6.5" rx="2" ry="4.5" stroke="currentColor" strokeWidth="1"/>
                    <line x1="2" y1="6.5" x2="11" y2="6.5" stroke="currentColor" strokeWidth="1"/>
                  </svg>
                </button>}
                {/* Auto-rotate play/pause — Globe mode only */}
                {mapMode === "globe" && <button
                  type="button"
                  onClick={() => setGlobeRotateMode((m) => m === "off" ? "slow" : "off")}
                  className={`absolute right-[5.5rem] top-3 z-30 flex h-7 w-7 items-center justify-center rounded-md border transition ${
                    globeRotateMode !== "off"
                      ? "border-[#c8c8c8]/70 text-[#c8c8c8]"
                      : "border-white/15 text-white hover:border-white/40"
                  }`}
                  title={globeRotateMode !== "off" ? "Stop rotation" : "Auto-rotate globe"}
                  aria-label={globeRotateMode !== "off" ? "Stop rotation" : "Auto-rotate globe"}
                >
                  {globeRotateMode !== "off"
                    ? <Pause size={12} strokeWidth={2} />
                    : <Play size={12} strokeWidth={2} />}
                </button>}
                {/* Continent quick-nav — Globe mode only, toggle-gated */}
                {mapMode === "globe" && (
                  <button
                    type="button"
                    onClick={() => setShowContNav((v) => !v)}
                    className="absolute bottom-3 right-2 z-30 rounded border px-1.5 py-0.5 text-[8px] font-semibold tracking-[0.06em] backdrop-blur-sm transition"
                    style={{
                      border: showContNav ? "1px solid rgba(200,200,200,0.4)" : "1px solid rgba(255,255,255,0.1)",
                      background: "rgba(10,10,14,0.75)",
                      color: showContNav ? "rgba(200,200,200,0.8)" : "rgba(255,255,255,0.35)",
                    }}
                  >
                    ◎ Nav
                  </button>
                )}
                {mapMode === "globe" && showContNav && (
                  <div className="absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 gap-1">
                    {([
                      { label: "NA", lat: 40, lng: -100, alt: 2.2 },
                      { label: "SA", lat: -15, lng: -60, alt: 2.0 },
                      { label: "EU", lat: 50, lng: 15, alt: 1.8 },
                      { label: "AF", lat: 5, lng: 22, alt: 2.0 },
                      { label: "ME", lat: 27, lng: 45, alt: 1.6 },
                      { label: "AS", lat: 35, lng: 105, alt: 2.2 },
                      { label: "OC", lat: -25, lng: 135, alt: 2.0 },
                    ] as const).map((c) => (
                      <button
                        key={c.label}
                        type="button"
                        onClick={() => onGeoZoomTo(c.lat, c.lng, c.alt)}
                        className="rounded border border-white/15 bg-[rgba(10,10,14,0.75)] px-1.5 py-0.5 text-[8px] font-semibold tracking-[0.06em] text-white/50 transition hover:border-[#c8c8c8]/50 hover:text-[#c8c8c8] backdrop-blur-sm"
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                )}
                {/* MapboxSatelliteView — Satellite mode */}
                {mapMode === "satellite" && (
                  <MapboxSatelliteView
                    initialLat={Number(camera?.lat ?? 30)}
                    initialLng={Number(camera?.lng ?? 20)}
                    initialZoom={2}
                    geoEvents={geoEvents}
                    ships={activeShipTracking}
                    overlayRoutes={activeRouteOverlays}
                    markers={visibleMarkers}
                    showPorts
                    showAirports
                    showMilitary
                    showShips={overlayState.shipTracking}
                    showEvents={overlayState.earthquakes || overlayState.conflicts || overlayState.wildfires}
                  />
                )}
                {/* Globe canvas — Globe mode only */}
                {mapMode === "globe" && <GlobeCanvas {...globeCanvasProps} />}
                {impactPanel && (
                  <ImpactPanel
                    data={impactPanel}
                    onClose={closeImpactPanel}
                    onOpenChart={handleImpactOpenChart}
                    quotes={impactQuotes}
                  />
                )}
                {showTimeline && (
                  <GlobeTimeline
                    geoEvents={geoEvents}
                    selectedDay={timelineDay}
                    onSelectDay={setTimelineDay}
                    onClose={() => { setShowTimeline(false); setTimelineDay(null); }}
                    todayIso={todayIso}
                  />
                )}
                {showSentinel && (
                  <GlobeSentinelChat
                    geoEvents={geoEvents}
                    overlayState={overlayState}
                    assets={assets}
                    enabledAssets={enabledAssets}
                    prices={globePrices}
                    onClose={() => setShowSentinel(false)}
                  />
                )}
                <GlobePatternAlerts
                  patterns={visiblePatternAlerts}
                  onFocus={onPatternFocus}
                  onDismiss={onPatternDismiss}
                />
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
              goldThemeEnabled={goldThemeEnabled}
              assetUsage={assetUsage}
              newsHeatmapScores={newsHeatmapScores}
              newsHeatmapActive={overlayState.newsHeatmap}
              focusLat={Number(camera?.lat)}
              focusLng={Number(camera?.lng)}
              onSelectPoint={onSelectPointFromMiniMap}
            />
          </div>
        </div>

        {/* ── RIGHT: Asset News (30%) → Global News (flex) → Chart (30%) ── */}
        <div className="flex min-h-0 flex-col gap-3 overflow-hidden" style={mobileMode ? { display: "none" } : undefined}>
          {/* Asset News card — 30% */}
          <div className={CARD} style={{ ...CARD_BORDER, flex: "0 0 30%" }}>
            <div className={CARD_HEADER}>
              <span className={CARD_LABEL}>{selectedAsset?.name ?? "Asset"} News</span>
            </div>
            <div className="relative min-h-0 flex-1 overflow-hidden">
              <GlobeNewsColumn
                items={assetNews}
                title={`${selectedAsset?.name ?? "Asset"} News`}
                goldThemeEnabled={goldThemeEnabled}
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
                goldThemeEnabled={goldThemeEnabled}
              />
            </div>
          </div>
          {/* Chart / Analytics card — 30% (bottom right) */}
          <div className={CARD} style={{ ...CARD_BORDER, flex: "0 0 30%" }}>
            {/* Tab header */}
            <div className="shrink-0 flex items-center justify-between border-b border-white/[0.06] px-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                {/* Tab switcher */}
                <div className="flex items-center gap-0.5 rounded-md border border-white/[0.08] bg-white/[0.03] p-0.5">
                  {(["chart", "analytics"] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setBottomPanelTab(tab)}
                      className={`rounded px-2 py-[2px] text-[9px] font-semibold transition ${
                        bottomPanelTab === tab
                          ? "bg-white/10 text-white"
                          : "text-white/40 hover:text-white/60"
                      }`}
                    >
                      {tab === "chart" ? "Chart" : "Analytics"}
                    </button>
                  ))}
                </div>
                {bottomPanelTab === "chart" && (
                  <>
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
                  </>
                )}
              </div>
              {/* Timeframe pills — only visible in chart mode */}
              {bottomPanelTab === "chart" && (
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
                    {([["1H","1H"],["4H","4H"],["D","1D"],["W","1W"],["M","1M"]] as [typeof chartTimeframe, string][]).map(([key, label]) => (
                      <option key={key} value={key} style={{ background: "#14151a" }}>{label}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div key={bottomPanelTab} className="clf-panel-fade min-h-0 flex-1 overflow-hidden">
              {bottomPanelTab === "chart" ? (
                <Suspense fallback={<div className="grid h-full place-items-center text-xs text-white/40">Loading chart...</div>}>
                  <CandleChart
                    payload={timeseries}
                    evaluation={evaluation}
                    seasonality={seasonality}
                    dataSource={dataSource}
                    title={chartHeaderLabel}
                    sourceLabel={chartSourceLabel}
                    goldThemeEnabled={goldThemeEnabled}
                    themePrimary={GOLD_PRIMARY}
                    isPanelLoading={panelLoading}
                    isFullscreen={false}
                    active={isPageActive}
                    onToggleFullscreen={noop}
                    loopReplayTick={visualLoopTick}
                    onTimeRangeChange={onSharedTimeRangeChange}
                    onRecentSignalChange={setRecentSignal}
                    onTimeframeChange={setChartTimeframe}
                    hideBuiltinChartToolbar
                    suppressTitleOverlay
                  />
                </Suspense>
              ) : (
                <GlobeAnalyticsPanel
                  assets={assets}
                  priceData={{ prices: globePrices, changes: globeChanges }}
                  conflictEvents={conflictEvents}
                  earthquakeEvents={earthquakeEvents}
                  commodityStressRegions={commodityStressRegions}
                  shippingDisruptionEvents={shippingDisruptionEvents}
                  globalNews={globalNews}
                  onSelectAsset={(id) => { setSelectedAssetId(id); setBottomPanelTab("chart"); }}
                />
              )}
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
          <button
            type="button"
            onClick={() => setGlobeRotateMode((m) => m === "off" ? "slow" : "off")}
            className={`absolute left-4 top-4 z-30 flex h-8 w-8 items-center justify-center rounded-md border transition ${
              globeRotateMode !== "off"
                ? "border-[#c8c8c8]/70 text-[#c8c8c8]"
                : "border-white/15 text-white hover:border-white/40"
            }`}
            title={globeRotateMode !== "off" ? "Stop rotation" : "Auto-rotate globe"}
            aria-label={globeRotateMode !== "off" ? "Stop rotation" : "Auto-rotate globe"}
          >
            {globeRotateMode !== "off"
              ? <Pause size={13} strokeWidth={2} />
              : <Play size={13} strokeWidth={2} />}
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
                  borderColor: "rgba(200,200,200,0.2)",
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

export default GlobeApp;
