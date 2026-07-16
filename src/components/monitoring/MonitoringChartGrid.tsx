"use client";

import { memo } from "react";
import MonitoringChartCard, { type MonitoringChartCardItem } from "@/components/monitoring/MonitoringChartCard";
import type { ManualTradeLevels, TradeMode } from "@/lib/trading/types";
import type { AgriStrategyKind } from "@/lib/agri/agri-v2-registry";

type MonitoringLoadStatus = "loading" | "loaded" | "no_data" | "load_error" | "invalid_data" | "missing_candles";

type GridItem = {
  key: string;
  code: string;
  [key: string]: any;
};

type MonitoringChartGridProps = {
  tabId: string;
  assets: GridItem[];
  activeChartId: string | null;
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
  selectedTradeId?: string | null;
  agriAvailableKindsBySymbol?: Record<string, { valuation: boolean; seasonal: boolean; macro: boolean }>;
  agriActiveKindsBySymbol?: Record<string, AgriStrategyKind[]>;
  onAgriKindToggle?: (symbol: string, kind: AgriStrategyKind) => void;
};

const GRID_SLOTS = 8;

function MonitoringChartGridInner({
  tabId,
  assets,
  activeChartId,
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
  selectedTradeId = null,
  agriAvailableKindsBySymbol,
  agriActiveKindsBySymbol,
  onAgriKindToggle,
}: MonitoringChartGridProps) {
  return (
    <div className="monitoring-grid monitoring-chart-grid" data-tab-id={tabId}>
      {Array.from({ length: GRID_SLOTS }).map((_, idx) => {
        const item = assets[idx] ?? null;
        const isActive = !!item && activeChartId === item.key;
        return (
          <MonitoringChartCard
            key={`${tabId}-slot-${idx}`}
            item={item as MonitoringChartCardItem | null}
            isActive={isActive}
            variant="large"
            missingBuild={missingBuild}
            loadStatus={item ? (loadStatusBySymbol[item.code]?.status ?? "loading") : "no_data"}
            strategyEventsByFile={strategyEventsByFile}
            tradingViewTradesBySource={tradingViewTradesBySource}
            onCardClick={() => {
              if (!item) return;
              onChartSelect(item);
            }}
            onIndicatorClick={() => {
              if (!item) return;
              onIndicatorOpen?.(item);
            }}
            onOpenFullscreen={item && onOpenFullscreen ? () => onOpenFullscreen(item) : undefined}
            agriAvailableKinds={item ? agriAvailableKindsBySymbol?.[item.code] : undefined}
            agriActiveKinds={item ? (agriActiveKindsBySymbol?.[item.code] ?? []) : []}
            onAgriKindToggle={item && onAgriKindToggle ? (kind) => onAgriKindToggle(item.code, kind) : undefined}
            showManualLevels={Boolean(item && isTradeExecutionOpen && tradeMode === "manual" && activeChartId === item.key)}
            manualLevels={item ? (manualLevelsBySymbol[item.code] ?? null) : null}
            onManualLevelsChange={(levels) => {
              if (!item || !onManualLevelsChange) return;
              onManualLevelsChange(item.code, levels);
            }}
            selectedTradeId={isActive ? selectedTradeId : null}
          />
        );
      })}
    </div>
  );
}

export default memo(MonitoringChartGridInner);
