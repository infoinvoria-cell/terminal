import type { OverlayToggleState } from "@/lib/globe/globe-types";

export type GlobeLayerId = keyof OverlayToggleState | "physicalIntel";

export type GlobeLayerDefinition = {
  id: GlobeLayerId;
  label: string;
  category: "MARKETS" | "PHYSICAL" | "EVENTS" | "MAP";
  controlKey: keyof OverlayToggleState | null;
  defaultVisibility: boolean;
  dataSource: string;
  renderer: "marker" | "event" | "route" | "region" | "heatmap" | "mapbox";
  minZoom: number;
  maxZoom: number;
  labelPriority: number;
  freshnessBehavior: "cache" | "source_timestamp" | "provider_tile" | "none";
  availability: "LOCAL" | "OPTIONAL" | "SHADOW_OBSERVATION_ONLY";
};

export const GLOBE_LAYER_REGISTRY: readonly GlobeLayerDefinition[] = [
  { id: "assets", label: "Assets", category: "MARKETS", controlKey: "assets", defaultVisibility: true, dataSource: "/api/assets", renderer: "marker", minZoom: 0, maxZoom: 4, labelPriority: 55, freshnessBehavior: "cache", availability: "LOCAL" },
  { id: "liveSignals", label: "Signals", category: "MARKETS", controlKey: "liveSignals", defaultVisibility: false, dataSource: "internal signal state", renderer: "marker", minZoom: 0, maxZoom: 4, labelPriority: 75, freshnessBehavior: "source_timestamp", availability: "LOCAL" },
  { id: "globalRiskLayer", label: "Risk Layer", category: "MARKETS", controlKey: "globalRiskLayer", defaultVisibility: false, dataSource: "/api/overlay/global_risk", renderer: "region", minZoom: 0, maxZoom: 2, labelPriority: 45, freshnessBehavior: "cache", availability: "OPTIONAL" },
  { id: "globalLiquidityMap", label: "Liquidity Map", category: "MARKETS", controlKey: "globalLiquidityMap", defaultVisibility: false, dataSource: "/api/overlay/global_liquidity", renderer: "region", minZoom: 0, maxZoom: 2, labelPriority: 45, freshnessBehavior: "cache", availability: "OPTIONAL" },
  { id: "physicalIntel", label: "Physical Intel", category: "PHYSICAL", controlKey: null, defaultVisibility: false, dataSource: "/api/white-swan/physical-intelligence", renderer: "region", minZoom: 0, maxZoom: 4, labelPriority: 85, freshnessBehavior: "source_timestamp", availability: "SHADOW_OBSERVATION_ONLY" },
  { id: "commodityRegions", label: "Commodity Regions", category: "PHYSICAL", controlKey: "commodityRegions", defaultVisibility: false, dataSource: "/api/overlay/commodity_regions", renderer: "region", minZoom: 0, maxZoom: 3, labelPriority: 65, freshnessBehavior: "cache", availability: "OPTIONAL" },
  { id: "shipTracking", label: "Ship Tracking", category: "PHYSICAL", controlKey: "shipTracking", defaultVisibility: false, dataSource: "/api/overlay/ships", renderer: "marker", minZoom: 0, maxZoom: 4, labelPriority: 45, freshnessBehavior: "cache", availability: "OPTIONAL" },
  { id: "oilRoutes", label: "Oil Routes", category: "PHYSICAL", controlKey: "oilRoutes", defaultVisibility: false, dataSource: "/api/overlay/oil_routes", renderer: "route", minZoom: 0, maxZoom: 3, labelPriority: 40, freshnessBehavior: "cache", availability: "OPTIONAL" },
  { id: "containerTraffic", label: "Container Traffic", category: "PHYSICAL", controlKey: "containerTraffic", defaultVisibility: false, dataSource: "/api/overlay/container_routes", renderer: "route", minZoom: 0, maxZoom: 3, labelPriority: 40, freshnessBehavior: "cache", availability: "OPTIONAL" },
  { id: "shippingDisruptions", label: "Ship Disruptions", category: "PHYSICAL", controlKey: "shippingDisruptions", defaultVisibility: false, dataSource: "/api/overlay/shipping_disruptions", renderer: "event", minZoom: 0, maxZoom: 3, labelPriority: 80, freshnessBehavior: "cache", availability: "OPTIONAL" },
  { id: "commodityStressMap", label: "Commodity Stress", category: "PHYSICAL", controlKey: "commodityStressMap", defaultVisibility: false, dataSource: "/api/overlay/commodity_stress", renderer: "region", minZoom: 0, maxZoom: 3, labelPriority: 65, freshnessBehavior: "cache", availability: "OPTIONAL" },
  { id: "earthquakes", label: "Earthquakes", category: "EVENTS", controlKey: "earthquakes", defaultVisibility: false, dataSource: "/api/events/earthquakes", renderer: "event", minZoom: 0, maxZoom: 4, labelPriority: 90, freshnessBehavior: "cache", availability: "OPTIONAL" },
  { id: "wildfires", label: "Wildfires", category: "EVENTS", controlKey: "wildfires", defaultVisibility: false, dataSource: "/api/events/wildfires", renderer: "event", minZoom: 0, maxZoom: 4, labelPriority: 90, freshnessBehavior: "cache", availability: "OPTIONAL" },
  { id: "conflicts", label: "Conflicts", category: "EVENTS", controlKey: "conflicts", defaultVisibility: false, dataSource: "/api/events/conflicts", renderer: "event", minZoom: 0, maxZoom: 4, labelPriority: 90, freshnessBehavior: "cache", availability: "OPTIONAL" },
  { id: "newsHeatmap", label: "News Heatmap", category: "EVENTS", controlKey: "newsHeatmap", defaultVisibility: false, dataSource: "/api/overlay/news_heatmap", renderer: "heatmap", minZoom: 0, maxZoom: 3, labelPriority: 35, freshnessBehavior: "cache", availability: "OPTIONAL" },
];

export const GLOBE_OVERLAY_CONTROL_KEYS = GLOBE_LAYER_REGISTRY
  .filter((layer): layer is GlobeLayerDefinition & { controlKey: keyof OverlayToggleState } => layer.controlKey !== null)
  .map((layer) => layer.controlKey);
