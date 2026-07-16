"use client";

import { memo, useMemo } from "react";
import MonitoringRadarMosaic from "@/components/monitoring/MonitoringRadarMosaic";
import MonitoringChartCard, { type MonitoringChartCardItem } from "@/components/monitoring/MonitoringChartCard";
import type { RankedAllTile } from "@/lib/monitoring/rankAllMonitoringTiles";
import type { AgriAssetStatusSummary } from "@/lib/monitoring/agriFinalStatusTypes";
import { MONITORING_CHART_BACKGROUND } from "@/lib/monitoring/monitoringChartTheme";
import type { MonitoringUiPrefs } from "@/lib/monitoring/monitoringUiPrefs";
import type { ManualTradeLevels, TradeMode } from "@/lib/trading/types";
import type { AgriStrategyKind } from "@/lib/agri/agri-v2-registry";

type MonitoringLoadStatus = "loading" | "loaded" | "no_data" | "load_error" | "invalid_data" | "missing_candles";

type GridItem = {
  key: string;
  code: string;
  universeGroup?: string;
  [key: string]: any;
};

type Placement = {
  gridColumn: string;
  gridRow: string;
};

type MonitoringFlexibleGridProps = {
  tabId: string;
  assets: GridItem[];
  activeChartId: string | null;
  selectedStrategySymbols?: string[];
  preferredDensity?: "compact" | "balanced" | "spacious";
  onChartSelect: (item: any) => void;
  onIndicatorOpen?: (item: any) => void;
  onOpenFullscreen?: (item: any) => void;
  loadStatusBySymbol?: Record<string, { status: MonitoringLoadStatus }>;
  strategyEventsByFile: Record<string, any>;
  tradingViewTradesBySource?: Record<string, any[]>;
  missingBuild?: boolean;
  isTradeExecutionOpen?: boolean;
  tradeMode?: TradeMode;
  manualLevelsBySymbol?: Record<string, ManualTradeLevels>;
  onManualLevelsChange?: (symbol: string, levels: ManualTradeLevels) => void;
  preparedTradesByItemKey?: Record<string, any[]>;
  selectedTradeId?: string | null;
  uiPrefs?: MonitoringUiPrefs;
  agriAuditBySymbol?: Record<string, AgriAssetStatusSummary>;
  agriLiveStateBySymbol?: Record<string, {
    tradeStatus?: "open" | "closed" | "none";
    positionDirection?: "long" | "short" | null;
    entryPrice?: number | null;
    stopLoss?: number | null;
    takeProfit?: number | null;
    latestTimestamp?: string | null;
  }>;
  liveChartAutoView?: boolean;
  /** Per-item live-signal state for the All-tab radar ranking. */
  radarSignalState?: Record<string, { activeSignal: boolean; hasOpenTrade?: boolean; isClosedSignal?: boolean; lastSignalMs: number | null }>;
  /** Optional per-item source provenance (Live tab only). */
  radarSourceByKey?: Record<string, string>;
  /** Agrar v2.0: available strategy kinds per symbol */
  agriAvailableKindsBySymbol?: Record<string, { valuation: boolean; seasonal: boolean; macro: boolean }>;
  /** Agrar v2.0: active strategy kinds per symbol */
  agriActiveKindsBySymbol?: Record<string, AgriStrategyKind[]>;
  /** Agrar v2.0: toggle callback */
  onAgriKindToggle?: (symbol: string, kind: AgriStrategyKind) => void;
};

const MAX_GRID_CHARTS = 8;

// Stable empty object — passed as strategyEventsByFile when preparedTrades already covers
// the item, so unrelated events file updates don't re-render all 25 chart cards.
const EMPTY_STRATEGY_EVENTS: Record<string, never> = {};

function getLayout(countRaw: number, preferredDensity: "compact" | "balanced" | "spacious", tabId?: string) {
  const count = Math.max(0, Math.min(MAX_GRID_CHARTS, countRaw));
  if (count === 5) {
    if (tabId === "indizes") {
      // Indizes target grid: 3 charts top (YM1!/UKX!/NQ1!), 2 bottom (FDAX1!/ES1!).
      // Items are placed in their provided order, controlled by the asset sort.
      return {
        gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
        gridTemplateRows: "repeat(2, minmax(0, 1fr))",
        placements: [
          { gridColumn: "1 / span 2", gridRow: "1" },
          { gridColumn: "3 / span 2", gridRow: "1" },
          { gridColumn: "5 / span 2", gridRow: "1" },
          { gridColumn: "1 / span 3", gridRow: "2" },
          { gridColumn: "4 / span 3", gridRow: "2" },
        ] as Placement[],
      };
    }
    // Default 5-item layout (e.g. Metalle+Energie): 2 charts top, 3 bottom. Unchanged.
    return {
      gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
      gridTemplateRows: "repeat(2, minmax(0, 1fr))",
      placements: [
        { gridColumn: "1 / span 3", gridRow: "1" },
        { gridColumn: "4 / span 3", gridRow: "1" },
        { gridColumn: "1 / span 2", gridRow: "2" },
        { gridColumn: "3 / span 2", gridRow: "2" },
        { gridColumn: "5 / span 2", gridRow: "2" },
      ] as Placement[],
    };
  }
  if (count === 6) {
    return {
      gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
      gridTemplateRows: "repeat(2, minmax(0, 1fr))",
      placements: [] as Placement[],
    };
  }
  if (count >= 7) {
    return {
      gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
      gridTemplateRows: "repeat(2, minmax(0, 1fr))",
      placements: [] as Placement[],
    };
  }
  if (count === 4) {
    return {
      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
      gridTemplateRows: "repeat(2, minmax(0, 1fr))",
      placements: [] as Placement[],
    };
  }
  if (count === 3) {
    return {
      gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
      gridTemplateRows: "1fr",
      placements: [] as Placement[],
    };
  }
  if (count === 2) {
    return {
      gridTemplateColumns: preferredDensity === "spacious" ? "repeat(2, minmax(0, 1fr))" : "repeat(2, minmax(0, 1fr))",
      gridTemplateRows: "1fr",
      placements: [] as Placement[],
    };
  }
  if (count <= 1) {
    return {
      gridTemplateColumns: "1fr",
      gridTemplateRows: "1fr",
      placements: [] as Placement[],
    };
  }
  return {
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gridTemplateRows: "repeat(2, minmax(0, 1fr))",
    placements: [] as Placement[],
  };
}

function MonitoringFlexibleGridInner({
  tabId,
  assets,
  activeChartId,
  selectedStrategySymbols = [],
  preferredDensity = "balanced",
  onChartSelect,
  onIndicatorOpen,
  onOpenFullscreen,
  loadStatusBySymbol = {},
  strategyEventsByFile,
  tradingViewTradesBySource = {},
  missingBuild = false,
  isTradeExecutionOpen = false,
  tradeMode = "signal",
  manualLevelsBySymbol = {},
  onManualLevelsChange,
  preparedTradesByItemKey = {},
  selectedTradeId = null,
  uiPrefs,
  agriAuditBySymbol = {},
  agriLiveStateBySymbol = {},
  liveChartAutoView = false,
  radarSignalState = {},
  radarSourceByKey,
  agriAvailableKindsBySymbol,
  agriActiveKindsBySymbol,
  onAgriKindToggle,
}: MonitoringFlexibleGridProps) {
  const selectedStrategySymbolSet = useMemo(() => new Set(selectedStrategySymbols), [selectedStrategySymbols]);
  const isAllStrategiesTab = tabId === "all" || tabId === "live";
  const visibleAssets = useMemo(
    () => (isAllStrategiesTab ? assets : assets.slice(0, MAX_GRID_CHARTS)),
    [assets, isAllStrategiesTab],
  );
  const layout = useMemo(
    () => getLayout(visibleAssets.length, preferredDensity, tabId),
    [preferredDensity, visibleAssets.length, tabId],
  );

  const renderCard = (item: GridItem, idx: number, placement: Placement | null, ranked?: RankedAllTile) => {
    const isActive = activeChartId === item.key;
    const preparedTrades = preparedTradesByItemKey[item.key] ?? null;
    // When preparedTrades is already computed for this item, pass an empty stable object
    // instead of the full strategyEventsByFile record — this prevents all 25 chart cards
    // from re-rendering whenever any single asset's events file finishes loading.
    const eventsForCard = Array.isArray(preparedTrades) ? EMPTY_STRATEGY_EVENTS : strategyEventsByFile;
    const card = (
      <MonitoringChartCard
        item={item as MonitoringChartCardItem}
        isActive={isActive}
        isSelected={selectedStrategySymbolSet.has(item.code)}
        variant={isAllStrategiesTab ? "compact" : "large"}
        layoutMode={isAllStrategiesTab ? "all-strategies" : "default"}
        missingBuild={missingBuild}
        loadStatus={loadStatusBySymbol[item.code]?.status ?? "loading"}
        strategyEventsByFile={eventsForCard}
        tradingViewTradesBySource={tradingViewTradesBySource}
        onCardClick={() => onChartSelect(item)}
        onIndicatorClick={() => onIndicatorOpen?.(item)}
        onOpenFullscreen={onOpenFullscreen ? () => onOpenFullscreen(item) : undefined}
        showManualLevels={Boolean(isTradeExecutionOpen && tradeMode === "manual" && activeChartId === item.key)}
        manualLevels={manualLevelsBySymbol[item.code] ?? null}
        preparedTrades={preparedTrades}
        onManualLevelsChange={(levels) => {
          if (!onManualLevelsChange) return;
          onManualLevelsChange(item.code, levels);
        }}
        selectedTradeId={isActive ? selectedTradeId : null}
        uiPrefs={uiPrefs}
        agriAudit={agriAuditBySymbol[item.code] ?? null}
        liveState={agriLiveStateBySymbol[item.code] ?? null}
        liveChartAutoView={liveChartAutoView}
        agriAvailableKinds={agriAvailableKindsBySymbol?.[item.code]}
        agriActiveKinds={agriActiveKindsBySymbol?.[item.code] ?? []}
        onAgriKindToggle={onAgriKindToggle ? (kind) => onAgriKindToggle(item.code, kind) : undefined}
        radarTileSize={ranked?.tileSize}
        radarActiveSignal={ranked?.activeSignal ?? false}
      />
    );
    // Radar tiles render the card directly (the mosaic cell is the wrapper).
    if (ranked) return card;
    return (
      <div
        key={`${tabId}-slot-${item.key}-${idx}`}
        className={isAllStrategiesTab ? "monitoring-all-strategies-chart-cell" : undefined}
        style={placement ?? undefined}
      >
        {card}
      </div>
    );
  };

  if (isAllStrategiesTab) {
    if (!visibleAssets.length) {
      return (
        <div
          className="monitoring-grid-empty"
          style={{
            width: "100%",
            height: "calc(100vh - var(--monitoring-tabbar-height))",
            display: "grid",
            placeItems: "center",
            background: uiPrefs?.backgroundColor ?? MONITORING_CHART_BACKGROUND,
            color: "rgba(255,255,255,0.58)",
            padding: 24,
            textAlign: "center",
          }}
        >
          <div>
            <div style={{ fontSize: 13, letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.6 }}>Monitoring</div>
            <div style={{ fontSize: 16, marginTop: 8 }}>Keine Assets verfuegbar</div>
            <div style={{ fontSize: 13, marginTop: 6, opacity: 0.7 }}>Datenquelle leer oder noch nicht geladen.</div>
          </div>
        </div>
      );
    }
    return (
      <MonitoringRadarMosaic
        assets={visibleAssets as Array<{ key: string; code: string; universeGroup?: string; payload?: { bars?: unknown[] | null } | null }>}
        signalState={radarSignalState}
        sourceByKey={radarSourceByKey}
        backgroundColor={uiPrefs?.backgroundColor ?? MONITORING_CHART_BACKGROUND}
        renderTile={(item, ranked) => renderCard(item as GridItem, ranked.rank, null, ranked)}
      />
    );
  }

  if (!visibleAssets.length) {
    return (
      <div
        className="monitoring-grid-empty"
        style={{
          width: "100%",
          height: "calc(100vh - var(--monitoring-tabbar-height))",
          display: "grid",
          placeItems: "center",
          background: uiPrefs?.backgroundColor ?? MONITORING_CHART_BACKGROUND,
          color: "rgba(255,255,255,0.58)",
          padding: 24,
          textAlign: "center",
        }}
      >
        <div>
          <div style={{ fontSize: 13, letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.6 }}>Monitoring</div>
          <div style={{ fontSize: 16, marginTop: 8 }}>Keine Assets verfuegbar</div>
          <div style={{ fontSize: 13, marginTop: 6, opacity: 0.7 }}>Datenquelle leer oder noch nicht geladen.</div>
        </div>
      </div>
    );
  }

  const gridBackgroundColor = uiPrefs?.backgroundColor ?? MONITORING_CHART_BACKGROUND;
  return (
    <div
      className="monitoring-grid monitoring-flexible-grid"
      data-tab-id={tabId}
      style={{
        width: "100%",
        height: "calc(100vh - var(--monitoring-tabbar-height))",
        minHeight: 0,
        display: "grid",
        gridTemplateColumns: layout.gridTemplateColumns,
        gridTemplateRows: layout.gridTemplateRows,
        gap: 6,
        padding: "4px 4px 4px 4px",
        boxSizing: "border-box",
        background: gridBackgroundColor,
      }}
    >
      {visibleAssets.map((item, idx) => {
        const placement = layout.placements[idx] ?? null;
        return renderCard(item, idx, placement);
      })}
    </div>
  );
}

export default memo(MonitoringFlexibleGridInner);
