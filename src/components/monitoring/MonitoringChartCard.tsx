"use client";

import { memo, useMemo } from "react";
import MonitoringChart, { type MonitoringChartData } from "@/components/monitoring/MonitoringChart";
import type { AgriAssetStatusSummary } from "@/lib/monitoring/agriFinalStatusTypes";
import { getMonitoringAssetIconUrl } from "@/lib/monitoring/monitoringAssetIcons";
import { formatMonitoringChartCardLabel } from "@/lib/monitoring/monitoringChartLabels";
import { mergeTradesFromEventsPayload } from "@/lib/monitoring/tradeSetupFromEvents";
import { normalizeTradeVisualLevels, type TradeVisualLevelSource } from "@/lib/monitoring/tradeVisualNormalizer";
import type { MonitoringUiPrefs } from "@/lib/monitoring/monitoringUiPrefs";
import type { AllTileSize } from "@/lib/monitoring/rankAllMonitoringTiles";
import type { ManualTradeLevels } from "@/lib/trading/types";
import AgriStrategyKindButtons from "@/components/agri/AgriStrategyKindButtons";
import type { AgriStrategyKind } from "@/lib/agri/agri-v2-registry";

// Indizes Macro Valuation Alpha V1 trend EMAs (tradingview_strategy.pine: trendFastLen=200,
// trendSlowLen=280, showTrendPlots=true; Fast=orange, Slow=purple). Subtle, TradingView-like.
const INDICES_TREND_EMAS = [
  { key: "emaFast", len: 200, color: "rgba(255, 152, 0, 0.55)" },
  { key: "emaSlow", len: 280, color: "rgba(168, 85, 247, 0.5)" },
];

type StrategyEventType =
  | "long_entry"
  | "short_entry"
  | "long_exit"
  | "short_exit"
  | "sl_hit"
  | "tp_hit"
  | "be_active"
  | "trail_update"
  | "trend_exit"
  | "opposite_valuation_exit";

type StrategyEventsPayload = {
  symbol: string;
  tvSymbol: string;
  strategyName: string;
  hasStrategy: boolean;
  source?: string;
  openTrade?: boolean;
  openTradeRow?: {
    direction: "long" | "short";
    entryTime: string;
    exitTime?: string | null;
    entry: number;
    sl?: number | null;
    tp?: number | null;
    exit?: number | null;
    exitReason?: string;
  } | null;
  events: Array<{
    time: string;
    barIndex: number;
    type: StrategyEventType;
    price?: number | null;
    entry?: number | null;
    sl?: number | null;
    tp?: number | null;
    reason?: string;
  }>;
  signalEvents?: Array<{
    id?: string;
    time: string;
    barIndex?: number;
    type: StrategyEventType | string;
    direction?: "long" | "short" | null;
    price?: number | null;
    entry?: number | null;
    sl?: number | null;
    tp?: number | null;
    reason?: string;
  }>;
  trades: Array<{
    direction: "long" | "short";
    entryTime: string;
    exitTime?: string | null;
    entry: number;
    sl?: number | null;
    tp?: number | null;
    exit?: number | null;
    exitReason?: string;
  }>;
};

type MonitoringPayload = {
  metadata: {
    badge?: string | null;
    badgeTooltip?: string | null;
    hasStrategy?: boolean;
    strategyEventsFile?: string | null;
    strategyEventsFallbackFile?: string | null;
    strategyEventsFallbackCandidates?: string[] | null;
    strategyEventsSourceMode?: string | null;
  };
  bars: MonitoringChartData["bars"];
  signals: MonitoringChartData["signals"];
  boxes: MonitoringChartData["boxes"];
};

export type MonitoringChartCardItem = {
  key: string;
  code: string;
  short?: string;
  name: string;
  strategy?: string;
  tv?: string;
  assetId?: string;
  payload: MonitoringPayload | null;
  variant: "large" | "compact";
  dataMismatch?: boolean;
  timeframe?: string;
  universeGroup?: string;
};

type MonitoringChartCardLiveState = {
  tradeStatus?: "open" | "closed" | "none";
  positionDirection?: "long" | "short" | null;
  entryPrice?: number | null;
  stopLoss?: number | null;
  takeProfit?: number | null;
  latestTimestamp?: string | null;
};

type MonitoringChartCardProps = {
  item: MonitoringChartCardItem | null;
  isActive: boolean;
  isSelected?: boolean;
  variant: "large" | "compact";
  layoutMode?: "default" | "all-strategies";
  missingBuild: boolean;
  loadStatus?: "loading" | "loaded" | "no_data" | "load_error" | "invalid_data" | "missing_candles";
  strategyEventsByFile: Record<string, StrategyEventsPayload>;
  tradingViewTradesBySource?: Record<string, StrategyEventsPayload["trades"]>;
  onCardClick: () => void;
  onIndicatorClick: () => void;
  onOpenFullscreen?: () => void;
  showManualLevels?: boolean;
  manualLevels?: ManualTradeLevels | null;
  onManualLevelsChange?: (levels: ManualTradeLevels) => void;
  preparedTrades?: StrategyEventsPayload["trades"] | null;
  selectedTradeId?: string | null;
  uiPrefs?: MonitoringUiPrefs;
  agriAudit?: AgriAssetStatusSummary | null;
  liveState?: MonitoringChartCardLiveState | null;
  liveChartAutoView?: boolean;
  /** All-tab radar mosaic: scales icon/name/visible-window per tile size. */
  radarTileSize?: AllTileSize;
  radarActiveSignal?: boolean;
  /** Agrar v2.0: available strategy kinds for this asset (undefined = not an agri asset) */
  agriAvailableKinds?: { valuation: boolean; seasonal: boolean; macro: boolean };
  /** Agrar v2.0: currently active strategy kinds */
  agriActiveKinds?: AgriStrategyKind[];
  /** Agrar v2.0: callback when a kind button is toggled */
  onAgriKindToggle?: (kind: AgriStrategyKind) => void;
};

function normalizeSourceKey(value: string | null | undefined): string {
  return String(value || "").trim().toUpperCase();
}

function intradayInitialVisibleBars(trades: Array<{ exitTime?: string | null; exit?: number | null }>): number {
  const hasOpen = trades.some((t) => !t.exitTime || t.exit == null);
  return hasOpen ? 15 : 20;
}

// Indizes: macro-valuation trades are sparse (weeks–months apart). Anchor the initial view to
// the most recent trade so its reconstructed entry/SL/TP bracket is visible — narrow for
// frequently-trading assets (ES1!), wider for currently-flat ones (UKX!). Returns undefined
// (chart default) when there are no trades.
function indicesInitialVisibleBars(trades: Array<Record<string, unknown>>): number | undefined {
  if (!trades.length) return undefined;
  const dateOf = (t: Record<string, unknown>): string | null => {
    for (const k of ["entryTime", "entryDate", "time", "exitTime", "exitDate"]) {
      const v = t[k];
      if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
      if (typeof v === "number" && v > 1e9) return new Date(v < 1e12 ? v * 1000 : v).toISOString().slice(0, 10);
    }
    return null;
  };
  let last: string | null = null;
  for (const t of trades) { const d = dateOf(t); if (d && (!last || d > last)) last = d; }
  if (!last) return undefined;
  const entryMs = Date.parse(`${last}T00:00:00Z`);
  if (!Number.isFinite(entryMs)) return undefined;
  const calDays = (Date.now() - entryMs) / 86_400_000;
  const tradingDays = Math.max(0, calDays) * (5 / 7);
  return Math.min(170, Math.max(28, Math.round(tradingDays) + 18));
}

// All-tab radar: for a tile with an open signal, show the full trade context (entry →
// current → SL/TP), not just the latest candles — otherwise the entry of a multi-day open
// swing falls off-screen. Anchored to the open trade's entry (fresh entries stay tight).
function radarOpenSignalVisibleBars(trades: Array<Record<string, unknown>>): number {
  const isOpen = (t: Record<string, unknown>) => {
    const ex = t.exitTime ?? t.exitDate;
    const exP = t.exit ?? t.exitPrice;
    return !ex || exP == null;
  };
  const ref = trades.find(isOpen) ?? trades[trades.length - 1];
  if (!ref) return 12;
  const raw = ref.entryTime ?? ref.entryDate ?? ref.time;
  let ms = NaN;
  if (typeof raw === "string" && /^\d{4}-\d{2}-\d{2}/.test(raw)) ms = Date.parse(`${raw.slice(0, 10)}T00:00:00Z`);
  else if (typeof raw === "number") ms = raw < 1e12 ? raw * 1000 : raw;
  if (!Number.isFinite(ms)) return 14;
  const calDays = (Date.now() - ms) / 86_400_000;
  const bars = Math.round(Math.max(0, calDays) * (5 / 7)) + 8;
  return Math.min(110, Math.max(10, bars));
}

function getBadge(payload: MonitoringPayload | null): string {
  if (!payload) return "DATA WARN";
  const raw = String(payload.metadata.badge ?? "").trim();
  return raw || "OK";
}

function hasStrategy(payload: MonitoringPayload | null, badge: string): boolean {
  if (!payload) return false;
  if (
    badge === "NO STRAT"
    || badge === "MISSING MAP"
    || badge === "DATA MISMATCH"
    || badge === "CANDLE SOURCE MISMATCH"
    || badge === "CANDLE SOURCE FAIL"
    || badge === "PARAMETER FAIL"
    || badge === "CHART ONLY"
    || badge === "DATA STUB"
  ) return false;
  // PARITY FAIL: badge visible but signals still shown if engine has data
  return payload.metadata.hasStrategy ?? true;
}

function badgeClassName(badge: string): string {
  return `badge-${badge.replace(/\s+/g, "-").toLowerCase()}`;
}

function inferEventsSourceFromFile(file: string): "csv_reference" | "hybrid_csv_engine" | "engine" | "missing" {
  const f = String(file || "").trim().toLowerCase();
  if (!f) return "missing";
  if (f.includes("reference_events")) return "csv_reference";
  if (f.includes("_hybrid_events")) return "hybrid_csv_engine";
  return "engine";
}

function sourceFromEventsFile(file: string): TradeVisualLevelSource {
  const normalized = String(file || "").trim().toLowerCase();
  if (!normalized) return "generated_monitoring_event_direct";
  if (normalized.includes("reference_events")) return "reference_event_direct";
  if (normalized.includes("hybrid_events")) return "hybrid_event_direct";
  if (normalized.includes("/strategies/") || normalized.startsWith("strategies/")) return "original_strategy_event_direct";
  return "generated_monitoring_event_direct";
}

function NoDataCell({ text }: { text: string }) {
  return <div style={{ height: "100%", display: "grid", placeItems: "center", color: "#7B8088", fontSize: 11, fontWeight: 600 }}>{text}</div>;
}

function formatCompactNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "-";
  return Number(value).toFixed(2);
}

function shortHealthLabel(status: AgriAssetStatusSummary["dataHealth"]["overallStatus"] | null | undefined): string | null {
  if (!status) return null;
  if (status === "fresh") return "Fresh";
  if (status === "stale") return "Stale";
  if (status === "provisional") return "Prov";
  if (status === "invalid_scale") return "Invalid";
  if (status === "missing") return "Missing";
  return status;
}

function shortReadinessLabel(status: AgriAssetStatusSummary["liveReadiness"]["status"] | null | undefined): string | null {
  if (!status) return null;
  if (status === "READY") return "Ready";
  if (status === "PROVISIONAL_ONLY") return "Provisional";
  if (status === "DATA_STALE") return "Data stale";
  if (status === "INVALID_OHLC") return "Invalid OHLC";
  if (status === "MISSING_COMPARISON_SYMBOL") return "Missing ref";
  if (status === "INVALID_RISK_LEVELS") return "Risk blocked";
  if (status === "CONFIG_INCOMPLETE") return "Config";
  return status;
}

function chipStyle(kind: "signal" | "pass" | "warn" | "fail" | "base") {
  if (kind === "signal") {
    return {
      background: "rgba(255,255,255,0.08)",
      border: "1px solid rgba(255,255,255,0.12)",
      color: "#f4f7fb",
    };
  }
  if (kind === "pass") {
    return {
      background: "rgba(255,255,255,0.08)",
      border: "1px solid rgba(255,255,255,0.12)",
      color: "#eef2f8",
    };
  }
  if (kind === "warn") {
    return {
      background: "rgba(198,165,88,0.14)",
      border: "1px solid rgba(198,165,88,0.2)",
      color: "#dbc594",
    };
  }
  if (kind === "fail") {
    return {
      background: "rgba(255,123,132,0.12)",
      border: "1px solid rgba(255,123,132,0.18)",
      color: "#ff9ba4",
    };
  }
  return {
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.08)",
    color: "#cfd5de",
  };
}

function MonitoringChartCardInner({
  item,
  isActive,
  isSelected = false,
  variant,
  layoutMode = "default",
  missingBuild,
  loadStatus = "loading",
  strategyEventsByFile,
  tradingViewTradesBySource = {},
  onCardClick,
  onIndicatorClick,
  onOpenFullscreen,
  showManualLevels = false,
  manualLevels = null,
  onManualLevelsChange,
  preparedTrades = null,
  selectedTradeId = null,
  uiPrefs,
  agriAudit = null,
  liveState = null,
  liveChartAutoView = false,
  radarTileSize,
  radarActiveSignal = false,
  agriAvailableKinds,
  agriActiveKinds = [],
  onAgriKindToggle,
}: MonitoringChartCardProps) {
  const payload = item?.payload ?? null;
  const hasBars = !!payload?.bars?.length;
  const badge = item?.dataMismatch ? "DATA MISMATCH" : getBadge(payload);
  const badgeTooltip = String(payload?.metadata?.badgeTooltip || "").trim();
  const strategyActive = hasStrategy(payload, badge);
  const showWarningBadge = loadStatus === "loaded"
    && badge !== "OK"
    && badge !== "NO STRAT"
    && badge !== "MISSING MAP"
    && badge !== "PARITY FAIL"
    && badge !== "RECENT PASS"
    && badge !== "RECENT WARN"
    && badge !== "OVERLAP WARN";
  const strategyEventsFile = String(payload?.metadata?.strategyEventsFile || "").trim();
  const strategyEventsFallbackFile = String(payload?.metadata?.strategyEventsFallbackFile || "").trim();
  const strategyEventsFallbackCandidates = Array.isArray(payload?.metadata?.strategyEventsFallbackCandidates)
    ? payload?.metadata?.strategyEventsFallbackCandidates.filter((v): v is string => Boolean(String(v || "").trim()))
    : [];
  const strategyEventsSourceMode = String(payload?.metadata?.strategyEventsSourceMode || "").trim();
  const primaryEventsPayload = strategyEventsFile ? strategyEventsByFile[strategyEventsFile] : undefined;
  const fallbackEventsPayload = strategyEventsFallbackFile ? strategyEventsByFile[strategyEventsFallbackFile] : undefined;
  const sourceKey = normalizeSourceKey(item?.tv ?? item?.code ?? null);
  const sourceFallbackTrades = sourceKey ? (tradingViewTradesBySource[sourceKey] ?? []) : [];
  const strategyTrades = useMemo(
    () => {
      if (Array.isArray(preparedTrades)) return preparedTrades;
      if (!strategyEventsFile) return [];
      const timeframeKey = String(item?.timeframe || "").trim().toUpperCase();
      const strictPrimaryOnly = String(primaryEventsPayload?.source || "").trim().toLowerCase() === "engine"
        && (timeframeKey === "30M" || timeframeKey === "1H" || timeframeKey === "2H");
      const primary = mergeTradesFromEventsPayload(strategyEventsByFile[strategyEventsFile]);
      const fallbackGroups: Array<{ source: TradeVisualLevelSource; rows: StrategyEventsPayload["trades"] }> = [];
      if (!strictPrimaryOnly && strategyEventsFallbackFile && strategyEventsFallbackFile !== strategyEventsFile) {
        fallbackGroups.push({
          source: sourceFromEventsFile(strategyEventsFallbackFile),
          rows: mergeTradesFromEventsPayload(strategyEventsByFile[strategyEventsFallbackFile]),
        });
      }
      for (const file of strictPrimaryOnly ? [] : strategyEventsFallbackCandidates) {
        if (!file || file === strategyEventsFile || file === strategyEventsFallbackFile) continue;
        fallbackGroups.push({
          source: sourceFromEventsFile(file),
          rows: mergeTradesFromEventsPayload(strategyEventsByFile[file]),
        });
      }
      if (!strictPrimaryOnly && sourceFallbackTrades.length) {
        fallbackGroups.push({
          source: "generated_monitoring_event_direct",
          rows: sourceFallbackTrades,
        });
      }
      return normalizeTradeVisualLevels({
        primaryTrades: primary,
        fallbackSources: fallbackGroups,
      }).normalizedTrades;
    },
    [item?.timeframe, preparedTrades, primaryEventsPayload?.source, sourceFallbackTrades, strategyEventsByFile, strategyEventsFallbackCandidates, strategyEventsFallbackFile, strategyEventsFile],
  );
  const rawEventsCount = Array.isArray(primaryEventsPayload?.events) ? primaryEventsPayload.events.length : 0;
  const normalizedTradeCount = Array.isArray(primaryEventsPayload?.trades) ? primaryEventsPayload.trades.length : 0;
  const fallbackTradeCount = Array.isArray(fallbackEventsPayload?.trades) ? fallbackEventsPayload.trades.length : 0;
  const eventsSource = strategyEventsSourceMode || inferEventsSourceFromFile(strategyEventsFile);
  // Overlay source = executedTrades only (no raw signalEvents / setup markers).
  const cardLabel = useMemo(
    () =>
      formatMonitoringChartCardLabel({
        symbol: item?.code ?? "-",
        name: item?.name,
        timeframe: item?.timeframe,
        universeGroup: item?.universeGroup,
        assetId: item?.assetId,
      }),
    [item?.assetId, item?.code, item?.name, item?.timeframe, item?.universeGroup],
  );

  const assetIconUrl = useMemo(
    () =>
      getMonitoringAssetIconUrl({
        code: cardLabel.symbol,
        assetId: item?.assetId,
        name: cardLabel.term,
        source: item?.tv,
        tv: item?.tv,
        displaySymbol: item?.code,
      }),
    [cardLabel.symbol, cardLabel.term, item?.assetId, item?.code, item?.tv],
  );

  const chartData = useMemo(() => {
    const chartTrades = strategyActive ? strategyTrades : [];
    return {
      displaySymbol: item?.code ?? "-",
      displayName: item?.name ?? "-",
      tvSymbol: item?.tv,
      badge,
      bars: payload?.bars ?? [],
      signals: [],
      trades: chartTrades,
      boxes: strategyActive ? [] : (payload?.boxes ?? []),
      variant,
      timeframe: item?.timeframe ?? "D",
    } satisfies MonitoringChartData;
  }, [badge, item?.code, item?.name, item?.timeframe, item?.tv, payload?.bars, payload?.boxes, strategyActive, strategyTrades, variant]);

  const fallbackText = loadStatus === "loading"
    ? "LOADING"
    : loadStatus === "no_data"
      ? "NO DATA"
      : loadStatus === "load_error"
        ? "LOAD ERROR"
        : loadStatus === "invalid_data"
          ? "INVALID DATA"
          : loadStatus === "missing_candles"
            ? "MISSING CANDLES"
          : (missingBuild ? "NO DATA" : "NO DATA");

  const isAllStrategiesMini = layoutMode === "all-strategies" || variant === "compact";
  const isDashboardMini = layoutMode === "all-strategies";
  // Radar mosaic: scale icon + text + visible window per tile size. Kept deliberately
  // small so tiny tiles aren't overloaded by icon/symbol/name.
  const radar = radarTileSize != null;
  // Small radar tiles: icon must stay small (~16px) and not dominate the chart. NOTE:
  // the CSS rule .monitoring-card-asset-icon hard-codes 32px, so the size has to be
  // applied via inline style (below) to actually take effect.
  const radarIconSize = radarTileSize === "XL" ? 22 : radarTileSize === "L" ? 16 : radarTileSize === "M" ? 12 : radarTileSize === "S" ? 11 : 0;
  const radarSymbolFont = radarTileSize === "XL" ? 13 : radarTileSize === "L" ? 11 : radarTileSize === "M" ? 10 : 10;
  const radarShowName = radarTileSize === "XL";
  const radarShowSymbol = radarTileSize !== "XS";
  const iconSize = radar ? radarIconSize : (isDashboardMini ? 17 : isAllStrategiesMini ? 24 : 32);
  const signalLabel = liveState?.positionDirection ? liveState.positionDirection.toUpperCase() : liveState?.tradeStatus === "closed" ? "FLAT" : liveState?.tradeStatus === "none" ? "IDLE" : null;
  const healthLabel = shortHealthLabel(agriAudit?.dataHealth.overallStatus);
  const readinessLabel = shortReadinessLabel(agriAudit?.liveReadiness.status);
  const parityLabel = agriAudit?.parity.status ?? null;
  const pricingLine = liveState && (liveState.entryPrice != null || liveState.stopLoss != null || liveState.takeProfit != null)
    ? `E ${formatCompactNumber(liveState.entryPrice)}  SL ${formatCompactNumber(liveState.stopLoss)}  TP ${formatCompactNumber(liveState.takeProfit)}`
    : null;
  const barLine = liveState?.latestTimestamp ? `Bar ${String(liveState.latestTimestamp).slice(0, 10)}` : agriAudit?.dataHealth.lastBarDate ? `Bar ${agriAudit.dataHealth.lastBarDate}` : null;

  return (
    <div
      className={`chartCard monitoring-card ${isActive ? "is-active" : ""} ${isSelected ? "is-selected" : ""} ${isAllStrategiesMini ? "monitoring-card--all-strategies" : ""}`}
      onClick={onCardClick}
      style={isSelected && !isActive ? {
        outline: "1px solid rgba(240,244,250,0.22)",
        boxShadow: "0 0 0 1px rgba(240,244,250,0.08), inset 0 0 0 1px rgba(240,244,250,0.06)",
      } : undefined}
      data-chart-symbol={item?.code ?? ""}
      data-strategy-id={item?.key ?? ""}
      data-chart-name={item?.name ?? ""}
      data-chart-timeframe={item?.timeframe ?? ""}
      data-chart-source={item?.tv ?? ""}
      data-chart-group={item?.universeGroup ?? ""}
      data-events-file={strategyEventsFile}
      data-fallback-file={strategyEventsFallbackFile}
      data-fallback-candidates={strategyEventsFallbackCandidates.join(",")}
      data-events-source={eventsSource}
      data-raw-events={String(rawEventsCount)}
      data-normalized-trades={String(normalizedTradeCount)}
      data-strategy-trades={String(strategyTrades.length)}
      data-fallback-trades={String(fallbackTradeCount)}
      data-source-fallback-trades={String(sourceFallbackTrades.length)}
      data-bars={String(payload?.bars?.length ?? 0)}
    >
      {item && hasBars ? (
        <MonitoringChart
          data={chartData}
          maxBars={radar ? 160 : (isDashboardMini ? 500 : isAllStrategiesMini ? 800 : (item?.universeGroup === "Intraday MT" ? 600 : 2500))}
          initialVisibleBars={radar ? (radarActiveSignal ? radarOpenSignalVisibleBars(strategyTrades) : 18) : (isDashboardMini ? 20 : (item?.universeGroup === "Intraday MT" ? intradayInitialVisibleBars(strategyTrades) : (item?.universeGroup === "Indizes" ? indicesInitialVisibleBars(strategyTrades) : undefined)))}
          allDashboardMode={isDashboardMini || radar}
          showFullscreenControl
          onFullscreenRequest={onOpenFullscreen}
          showManualLevels={showManualLevels}
          manualLevels={manualLevels}
          onManualLevelsChange={onManualLevelsChange}
          selectedTradeId={selectedTradeId}
          uiPrefs={uiPrefs}
          liveChartAutoView={liveChartAutoView && !isDashboardMini}
          trendEmas={item?.universeGroup === "Indizes" ? INDICES_TREND_EMAS : undefined}
        />
      ) : (
        <NoDataCell text={fallbackText} />
      )}

      <div className="assetOverlay monitoring-card-label" data-radar-size={radarTileSize ?? undefined}>
        <div className="monitoring-card-label-head">
          {assetIconUrl && iconSize > 0 ? (
            <img
              src={assetIconUrl}
              alt=""
              className={`monitoring-card-asset-icon ${isAllStrategiesMini ? "monitoring-card-asset-icon--mini" : ""}`}
              width={iconSize}
              height={iconSize}
              // Radar tiles override the hard-coded 32px CSS so small tiles get small icons.
              // Non-radar (Agrar/Intraday dashboards) keep their CSS sizing untouched.
              style={radar ? { width: iconSize, height: iconSize } : undefined}
              decoding="async"
              draggable={false}
            />
          ) : null}
          <div className="monitoring-card-label-text">
            {(!radar || radarShowSymbol) ? (
              <div className="assetTopLine">
                <span className="assetSymbol monitoring-card-symbol" style={radar ? { fontSize: radarSymbolFont, lineHeight: 1.1 } : undefined}>{item?.short ?? cardLabel.symbol}</span>
              </div>
            ) : null}
            {(!radar || radarShowName) ? (
              <div className="assetDesc monitoring-card-desc" style={radar ? { fontSize: 8, lineHeight: 1.1 } : undefined}>{item?.name ?? cardLabel.term}</div>
            ) : null}
          </div>
        </div>
      </div>

      {(signalLabel || healthLabel || readinessLabel || parityLabel || pricingLine || barLine) ? (
        <div
          style={{
            position: "absolute",
            left: isDashboardMini ? 8 : 10,
            right: isDashboardMini ? 8 : 10,
            bottom: isDashboardMini ? 8 : 10,
            display: "grid",
            gap: 4,
            pointerEvents: "none",
          }}
        >
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {signalLabel ? (
              <span style={{ ...chipStyle("signal"), height: 18, borderRadius: 999, padding: "0 7px", fontSize: 9, fontWeight: 700, display: "inline-flex", alignItems: "center", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {signalLabel}
              </span>
            ) : null}
            {readinessLabel ? (
              <span style={{ ...(agriAudit?.liveReadiness.status === "READY" ? chipStyle("pass") : agriAudit?.liveReadiness.status === "PROVISIONAL_ONLY" ? chipStyle("warn") : chipStyle("fail")), height: 18, borderRadius: 999, padding: "0 7px", fontSize: 9, fontWeight: 700, display: "inline-flex", alignItems: "center" }}>
                {readinessLabel}
              </span>
            ) : null}
            {healthLabel ? (
              <span style={{ ...(agriAudit?.dataHealth.overallStatus === "fresh" ? chipStyle("pass") : agriAudit?.dataHealth.overallStatus === "provisional" || agriAudit?.dataHealth.overallStatus === "stale" ? chipStyle("warn") : chipStyle("fail")), height: 18, borderRadius: 999, padding: "0 7px", fontSize: 9, fontWeight: 700, display: "inline-flex", alignItems: "center" }}>
                {healthLabel}
              </span>
            ) : null}
            {parityLabel ? (
              <span style={{ ...(parityLabel === "MATCH" ? chipStyle("pass") : parityLabel === "CLOSE" ? chipStyle("warn") : chipStyle("fail")), height: 18, borderRadius: 999, padding: "0 7px", fontSize: 9, fontWeight: 700, display: "inline-flex", alignItems: "center" }}>
                {parityLabel}
              </span>
            ) : null}
          </div>
          {pricingLine ? (
            <div style={{ fontSize: 10, color: "#eef2f7", background: "rgba(4,4,6,0.68)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "4px 6px", fontFamily: "monospace" }}>
              {pricingLine}
            </div>
          ) : null}
          {barLine ? (
            <div style={{ fontSize: 9, color: "#9aa3af", textShadow: "0 1px 2px rgba(0,0,0,0.45)" }}>
              {barLine}
            </div>
          ) : null}
        </div>
      ) : null}

      {agriAvailableKinds && onAgriKindToggle && !radar ? (
        <AgriStrategyKindButtons
          availableKinds={agriAvailableKinds}
          activeKinds={agriActiveKinds}
          onToggle={onAgriKindToggle}
        />
      ) : null}
      {showWarningBadge ? (
        <div
          className={`chartBadge monitoring-card-badge ${badgeClassName(badge)}`}
          title={badgeTooltip || undefined}
        >
          {badge}
        </div>
      ) : null}
      {isSelected ? (
        <div
          style={{
            position: "absolute",
            top: showWarningBadge ? 34 : 10,
            right: 10,
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.14)",
            background: isActive ? "rgba(244,247,251,0.16)" : "rgba(255,255,255,0.08)",
            color: "#f4f7fb",
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            padding: "3px 8px",
            pointerEvents: "none",
          }}
        >
          {isActive ? "Focused" : "Selected"}
        </div>
      ) : null}
    </div>
  );
}

export default memo(MonitoringChartCardInner);
