"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Activity, BarChart3, Bell, RotateCw, Settings } from "lucide-react";
import MonitoringChart, { type MonitoringChartData } from "@/components/monitoring/MonitoringChart";
import LiveSignalsPanel from "@/components/monitoring/LiveSignalsPanel";
import SentinelErrorBoundary from "@/components/monitoring/SentinelErrorBoundary";
// Dynamic import with ssr:false — Sentinel uses browser APIs (localStorage, speechSynthesis, AudioContext, createPortal)
// that must never run during SSR. This also means a crash in SentinelPanel cannot propagate to the page.
const SentinelPanel = dynamic(() => import("@/components/monitoring/SentinelPanel"), {
  ssr: false,
  loading: () => <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "#060709", color: "rgba(255,255,255,0.3)", fontSize: 12 }}>Sentinel lädt…</div>,
});
import MonitoringChartCard, { type MonitoringChartCardItem } from "@/components/monitoring/MonitoringChartCard";
import MonitoringFlexibleGrid from "@/components/monitoring/MonitoringFlexibleGrid";
import CoreInvestMonitoringGrid from "@/components/core-invest/CoreInvestMonitoringGrid";
import MonitoringSettingsModal from "@/components/monitoring/MonitoringSettingsModal";
import MonitoringStrategyWorkspace from "@/components/monitoring/MonitoringStrategyWorkspace";
import { MonitoringTabIcon } from "@/components/monitoring/monitoringTabPresentation";
import { monitoringFeatureFlags } from "@/config/monitoringFeatureFlags";
import {
  getMonitoringTabConfig,
  MONITORING_TAB_CONFIG,
  type MonitoringPrimaryTabId,
} from "@/config/monitoringTabConfig";
import {
  isActiveMonitoringAgrarSymbol,
  isExcludedMonitoringAsset,
  MONITORING_ACTIVE_AGRAR_SYMBOLS,
} from "@/lib/monitoring/monitoringAssetIcons";
import { applyMonitoringChartLabel } from "@/lib/monitoring/monitoringChartLabels";
import {
  clearMonitoringSignalJump,
  readMonitoringSignalJump,
} from "@/lib/monitoring/monitoringSignalJump";
import type { AgriFinalStatusResponse } from "@/lib/monitoring/agriFinalStatusTypes";
import { LiveQuotesProvider } from "@/contexts/LiveQuotesContext";
import {
  DEFAULT_MONITORING_UI_PREFS,
  loadMonitoringUiPrefs,
  saveMonitoringUiPrefs,
  translateMonitoringTerm,
  type MonitoringUiPrefs,
} from "@/lib/monitoring/monitoringUiPrefs";
import { calculateStrategyPerformance } from "@/lib/monitoring/backtest/calculateStrategyPerformance";
import { clearCandles as clearMonitoringCandleCache, clearInactive as clearInactiveMonitoringDataCache } from "@/lib/monitoring/data/monitoringDataCache";
import { fetchMonitoringJson } from "@/lib/monitoring/fetchMonitoringJson";
import {
  loadMonitoringCandles,
  type MonitoringLoadStatus,
  type MonitoringTabLabel,
} from "@/lib/monitoring/loadMonitoringCandles";
import { loadMonitoringTradeEvents } from "@/lib/monitoring/loadMonitoringTradeEvents";
import {
  freezeInactiveTabs,
  getMonitoringRuntimeReport,
  markTabLoaded,
  pauseMonitoringRuntime,
  registerMonitoringFetch,
  registerMonitoringInterval,
  registerMonitoringTimeout,
  resumeMonitoringRuntime,
  setAllStrategiesMounted,
  setStrategyTesterMounted,
  setTradeExecutionMounted,
  startMonitoringRuntime,
  stopMonitoringRuntime,
} from "@/lib/monitoring/runtime/monitoringRuntimeController";
import {
  findAgrarSnapshotAsset,
  isAgrarLiveSnapshotFresh,
  loadAgrarLiveSnapshot,
  type AgrarLiveSnapshot,
  type AgrarSnapshotAsset,
} from "@/lib/monitoring/loadAgrarLiveSnapshot";
import { mergeLiveSnapshot } from "@/lib/monitoring/mergeLiveSnapshot";
import { loadFullHistoryForAsset } from "@/lib/monitoring/loadFullHistoryForAsset";
import { activeSetupFromEventsPayload, mergeTradesFromEventsPayload } from "@/lib/monitoring/tradeSetupFromEvents";
import { type LiveSignalRow } from "@/lib/monitoring/liveSignalsFeed";
import { buildLiveSignalsFeedFromLifecycle } from "@/lib/monitoring/trades/tradeLifecycleLiveSignals";
import { applyManualVerifiedOverrides, type ManualVerifiedPayload } from "@/lib/monitoring/manualVerifiedLiveSignals";
import {
  loadWave1Groups,
  type Wave1GroupData,
  type Wave1GroupId,
  type Wave1StrategyRecord,
} from "@/lib/monitoring/wave1Data";
import type {
  MonitoringStrategyTestResult,
} from "@/lib/monitoring/strategyTester/types";
import {
  buildTradeLifecycleFromRows,
  lifecycleFromLiveStateRow,
  lifecycleToNormalizedVisualLevel,
  lifecycleToTradeRow,
  mergeLifecycleTrades,
  type TradeLifecycle,
  type TradeLifecycleSource,
} from "@/lib/monitoring/trades/tradeLifecycleModel";
import type { MonitoringCandle, MonitoringTrade, StrategyPerformanceResult } from "@/lib/monitoring/types";
import type { ExecutionParityStatus, ManualTradeLevels, TradeDirection, TradeMode } from "@/lib/trading/types";
import type { TimeseriesResponse } from "@/types";
import { useAgriStrategySelection } from "@/hooks/useAgriStrategySelection";
import { getAllAgriAssets, getAgriKindsForAsset } from "@/lib/agri/agri-v2-registry";
import AgriStrategyKindButtons from "@/components/agri/AgriStrategyKindButtons";

const SecondaryPanelLoader = ({ label }: { label: string }) => (
  <div className="st-empty st-empty-loading">{label}</div>
);

// Live-signal column: user-resizable + persisted width.
const LIVE_PANEL_WIDTH_KEY = "invoria:monitoring:live-panel-width:v1";
const LIVE_PANEL_WIDTH_MIN = 320;
const LIVE_PANEL_WIDTH_MAX = 620;
const LIVE_PANEL_WIDTH_DEFAULT = 404;
function clampLivePanelWidth(w: number): number {
  const viewportCap = typeof window !== "undefined" ? Math.round(window.innerWidth * 0.45) : LIVE_PANEL_WIDTH_MAX;
  const max = Math.max(LIVE_PANEL_WIDTH_MIN, Math.min(LIVE_PANEL_WIDTH_MAX, viewportCap));
  return Math.round(Math.min(max, Math.max(LIVE_PANEL_WIDTH_MIN, w)));
}

function buildExecCols(kpiW: number, paramsW: number, paramsVis: boolean, hasLive: boolean): string {
  const kpiPart = `6px ${kpiW}px`;
  const paramsPart = paramsVis ? ` 6px ${paramsW}px` : "";
  if (hasLive) return `minmax(0, 1fr) clamp(360px, 24vw, 440px) ${kpiPart}${paramsPart}`; // live panel width (matches CSS .show-live-signals-panel)
  return `minmax(0, 1fr) ${kpiPart}${paramsPart}`;
}

const StrategyTesterEquityChart = dynamic(() => import("@/components/monitoring/StrategyTesterEquityChart"), {
  loading: () => <SecondaryPanelLoader label="Loading equity chart..." />,
});

const StrategyTesterDrawdownChart = dynamic(() => import("@/components/monitoring/StrategyTesterDrawdownChart"), {
  loading: () => <SecondaryPanelLoader label="Loading drawdown chart..." />,
});

const StrategyTesterPanel = dynamic(() => import("@/components/monitoring/StrategyTesterPanel"), {
  loading: () => <SecondaryPanelLoader label="Loading strategy panel..." />,
});

const TradeExecutionPanel = dynamic(() => import("@/components/monitoring/TradeExecutionPanel"), {
  loading: () => <SecondaryPanelLoader label="Loading execution panel..." />,
});

type TabId = MonitoringPrimaryTabId;
type ActivePanel = null | "tradeExecution";
type StrategyTesterRuntimeConfig = { equityMode?: string; compounding?: boolean; timeRangeFrom?: string | null };
type StrategyTesterDataMode = "engine" | "csv_reference";

type MonitoringHeaderTabItem =
  | {
      key: string;
      kind: "tab";
      tabId: MonitoringPrimaryTabId;
      title: string;
    }
  | {
      key: string;
      kind: "placeholder";
      title: string;
    };

const MONITORING_HEADER_TABS: MonitoringHeaderTabItem[] = [
  { key: "agrar", kind: "tab", tabId: "agrar", title: "Agrar" },
  { key: "metals", kind: "tab", tabId: "metalle_energie", title: "Metals/En" },
  { key: "indices", kind: "tab", tabId: "indizes", title: "Indices" },
  { key: "aktien", kind: "tab", tabId: "aktien", title: "Aktien" },
  { key: "invest", kind: "tab", tabId: "invest", title: "Invest" },
  { key: "forex", kind: "tab", tabId: "fx", title: "Forex" },
  { key: "anomaly", kind: "tab", tabId: "anomaly", title: "Anomaly" },
  { key: "intraday", kind: "tab", tabId: "intraday_mt", title: "Intraday" },
  { key: "live", kind: "tab", tabId: "live", title: "Live" },
  { key: "all", kind: "tab", tabId: "all", title: "All" },
];

const FALLBACK_AKTIEN_UNIVERSE_ITEMS: UniverseAssetItem[] = [
  { tab: "Aktien", symbol: "AAPL", requestSymbol: "AAPL", source: "NASDAQ:AAPL", name: "AAPL", timeframe: "D", hasData: true, hasStrategy: true, strategyStatus: "mapped", buildable: true },
  { tab: "Aktien", symbol: "MSFT", requestSymbol: "MSFT", source: "NASDAQ:MSFT", name: "MSFT", timeframe: "D", hasData: true, hasStrategy: true, strategyStatus: "mapped", buildable: true },
  { tab: "Aktien", symbol: "NVDA", requestSymbol: "NVDA", source: "NASDAQ:NVDA", name: "NVDA", timeframe: "D", hasData: true, hasStrategy: true, strategyStatus: "mapped", buildable: true },
  { tab: "Aktien", symbol: "GOOGL", requestSymbol: "GOOGL", source: "NASDAQ:GOOGL", name: "GOOGL", timeframe: "D", hasData: true, hasStrategy: true, strategyStatus: "mapped", buildable: true },
  { tab: "Aktien", symbol: "META", requestSymbol: "META", source: "NASDAQ:META", name: "META", timeframe: "D", hasData: true, hasStrategy: true, strategyStatus: "mapped", buildable: true },
  { tab: "Aktien", symbol: "AMZN", requestSymbol: "AMZN", source: "NASDAQ:AMZN", name: "AMZN", timeframe: "D", hasData: true, hasStrategy: true, strategyStatus: "mapped", buildable: true },
];

const FALLBACK_INVEST_UNIVERSE_ITEMS: UniverseAssetItem[] = [
  // CI v2.0 — ETF Core (passive)
  { tab: "Invest", symbol: "SPY",           requestSymbol: "SPY",   source: "BATS:SPY",    name: "S&P 500 ETF (SPY)",      timeframe: "D", hasData: true,  hasStrategy: false, strategyStatus: "passive",  buildable: false },
  { tab: "Invest", symbol: "QQQ_PASSIVE",   requestSymbol: "QQQ",   source: "NASDAQ:QQQ",  name: "Nasdaq ETF passiv (QQQ)", timeframe: "D", hasData: false, hasStrategy: false, strategyStatus: "passive",  buildable: false },
  { tab: "Invest", symbol: "SPMO",          requestSymbol: "SPMO",  source: "BATS:SPMO",   name: "S&P Momentum (SPMO)",    timeframe: "D", hasData: false, hasStrategy: false, strategyStatus: "passive",  buildable: false },
  { tab: "Invest", symbol: "GLD",           requestSymbol: "GLD",   source: "AMEX:GLD",    name: "Gold ETF (GLD)",         timeframe: "D", hasData: false, hasStrategy: false, strategyStatus: "passive",  buildable: false },
  // CI v2.0 — Active Sleeves
  { tab: "Invest", symbol: "QQQ_PINE_1",    requestSymbol: "QQQ",   source: "NASDAQ:QQQ",  name: "QQQ Pine 1",             timeframe: "D", hasData: false, hasStrategy: true,  strategyStatus: "mapped",   buildable: true,  strategyId: "QQQ_PINE_1" },
  { tab: "Invest", symbol: "QQQ_PINE_2_EMA",requestSymbol: "QQQ",   source: "NASDAQ:QQQ",  name: "QQQ Pine 2 EMA",         timeframe: "D", hasData: false, hasStrategy: true,  strategyStatus: "mapped",   buildable: true,  strategyId: "QQQ_PINE_2_EMA" },
  { tab: "Invest", symbol: "HG1!",          requestSymbol: "HG1!",  source: "COMEX:HG1!",  name: "Copper Sleeve (HG1!)",   timeframe: "D", hasData: true,  hasStrategy: true,  strategyStatus: "mapped",   buildable: true,  strategyId: "COPPER_HG" },
  { tab: "Invest", symbol: "6S1!",          requestSymbol: "6S1!",  source: "CME:6S1!",    name: "CHF Sleeve (6S1!)",      timeframe: "D", hasData: true,  hasStrategy: true,  strategyStatus: "mapped",   buildable: true,  strategyId: "CHF_6S" },
];

const INVEST_WORKSPACE_ASSETS = [
  { symbol: "QQQ_PINE_1", name: "QQQ Pine 1" },
  { symbol: "QQQ_PINE_2_EMA", name: "QQQ Pine 2 EMA" },
  { symbol: "COPPER_HG", name: "Copper / HG" },
  { symbol: "CHF_6S", name: "CHF / 6S" },
] as const;
const INVEST_STRATEGY_IDS = ["QQQ_PINE_1", "QQQ_PINE_2_EMA", "COPPER_HG", "CHF_6S"] as const;
const isInvestStrategyId = (value: string): value is (typeof INVEST_STRATEGY_IDS)[number] =>
  (INVEST_STRATEGY_IDS as readonly string[]).includes(value);

type UniverseAssetItem = {
  tab: string;
  symbol: string;
  requestSymbol?: string;
  source: string;
  name: string;
  timeframe?: string;
  strategyId?: string;
  strategyScriptFile?: string;
  missingPineScript?: boolean;
  hasData: boolean;
  hasStrategy: boolean;
  strategyStatus: string;
  buildable: boolean;
  stub?: boolean;
};

type UniverseConfig = {
  assets?: Array<{
    tab?: string;
    symbol?: string;
    requestSymbol?: string;
    source?: string;
    name?: string;
    timeframe?: string;
    strategyId?: string;
    strategyScriptFile?: string;
    missingPineScript?: boolean;
    hasData?: boolean;
    hasStrategy?: boolean;
    strategyStatus?: string;
    buildable?: boolean;
    stub?: boolean;
  }>;
};

type ProductionStrategyUniverseEntry = {
  asset: string;
  label: string;
  sourceSymbol: string;
  timeframe: string;
  active: boolean;
  status: string;
  strategyType: "macro" | "seasonal" | "valuation" | "portfolio";
  sleeveName?: string;
};

type StrategyRuntimeRouteRow = {
  strategyId?: string;
  group?: string;
  asset?: string;
  tvSymbol?: string;
  timeframe?: string;
  universeSymbol?: string | null;
  sourceMode?: string | null;
  preferredEventsFile?: string | null;
  referenceEventsFile?: string | null;
  hybridEventsFile?: string | null;
  baseEventsFile?: string | null;
  candleFile?: string | null;
};

type StrategyRuntimeRoutesPayload = {
  routes?: StrategyRuntimeRouteRow[];
};

type MonitoringPayload = {
  metadata: {
    code: string;
    name: string;
    tvSymbol: string;
    strategy: string;
    badge?: string | null;
    status: "OK" | "WARN" | "ERROR";
    lastSignalTime?: string | null;
    openPosition?: boolean;
    hasStrategy?: boolean;
    strategyEventsFile?: string | null;
    strategyEventsFallbackFile?: string | null;
    strategyEventsFallbackCandidates?: string[] | null;
    strategyEventsSourceMode?: string | null;
    badgeTooltip?: string | null;
    hints?: string[];
    params?: Array<{
      key: string;
      label: string;
      group: string;
      type: "bool" | "number" | "text" | "select";
      value: any;
      options?: string[] | null;
    }>;
  };
  bars: Array<{ time: string | null; open: number | null; high: number | null; low: number | null; close: number | null }>;
  signals: Array<{
    time: string | null;
    type?: "long_entry" | "short_entry" | "long_exit" | "short_exit";
    long_entry: boolean;
    short_entry: boolean;
    long_exit: boolean;
    short_exit: boolean;
    close?: number | null;
    entry_price: number | null;
    entry_sl: number | null;
    entry_tp: number | null;
    long_sl_final: number | null;
    short_sl_final: number | null;
    long_tp_final: number | null;
    short_tp_final: number | null;
    be_active: boolean;
    position?: number;
    position_size?: number | null;
    signal_text?: string;
  }>;
  boxes: Array<{
    type: "demand" | "supply";
    strong: boolean;
    start_time: string | null;
    end_time: string | null;
    low: number | null;
    high: number | null;
    active: boolean;
  }>;
};

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
    _source?: string;
  } | null;
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
  trades: Array<{
    direction: "long" | "short";
    entryTime: string;
    exitTime: string;
    entry: number;
    sl?: number | null;
    tp?: number | null;
    exit: number;
    exitReason?: string;
  }>;
};

type ParityDebugReport = {
  generatedAt?: string;
  modeAIsDefault?: boolean;
  topAssets?: Array<{
    asset?: string;
    missing?: number;
    extra?: number;
    valueDiff?: number;
  }>;
};

type TradingViewEventType = "entry" | "exit" | "open_position" | "flat" | "pending_signal";
type TradingViewDirection = "long" | "short" | "none";
type TradingViewPositionStatus = "open" | "closed" | "flat" | "pending";
type TradingViewExitReason = "tp" | "sl" | "close" | "reverse" | "none";

type TradingViewTradeEvent = {
  schema?: string;
  receivedAt?: string;
  source?: string;
  asset?: {
    symbol?: string;
    source?: string;
    name?: string;
  };
  event?: {
    type?: TradingViewEventType | string;
    direction?: TradingViewDirection | string;
    time?: string;
    barTime?: string;
    entry?: number;
    stopLoss?: number;
    takeProfit?: number;
    exit?: number;
    exitReason?: TradingViewExitReason | string;
    positionStatus?: TradingViewPositionStatus | string;
  };
};

type TradingViewTradesBySource = Record<string, StrategyEventsPayload["trades"]>;
type CsvReferenceTradesResponse = {
  ok?: boolean;
  source?: string;
  tradesBySource?: Record<string, StrategyEventsPayload["trades"]>;
  totalTrades?: number;
};
type OjCustomEngineSourceStatus = "real_engine_output" | "missing" | "blocked";
type CustomEngineTradesResponse = {
  ok?: boolean;
  source?: string;
  sourceStatus?: OjCustomEngineSourceStatus;
  fallbackUsed?: boolean;
  suspiciousFakeParityBlocked?: boolean;
  warning?: string | null;
  trades?: Array<MonitoringTrade & { _source?: string }>;
  tradeCount?: number;
  firstTradeDate?: string | null;
  lastTradeDate?: string | null;
  openTrade?: MonitoringTrade | null;
  engineOutputPath?: string | null;
  referencePath?: string | null;
  referenceTradeCount?: number;
  referenceFirstTradeDate?: string | null;
  sourceLabel?: string | null;
  historicalParityScore?: number;
  historicalParityStatus?: string | null;
  currentSignal?: "FLAT" | "OPEN";
  currentSignalStatus?: string | null;
};
type AgrarCardLoadState = {
  status: MonitoringLoadStatus;
  resolvedPath: string | null;
  barCount: number;
  firstDate: string | null;
  lastDate: string | null;
  error: string | null;
  staleData?: boolean;
  manifestGeneratedAt?: string | null;
};

type CandlePriceScaleAuditRow = {
  tvSymbol?: string;
  timeframe?: string;
  status?: "pass" | "fail" | "chart_only" | "missing_parity_candle_source";
  reason?: string;
  priceRatio?: number | null;
};

type AgrarParityAuditRow = {
  tvSymbol?: string;
  source?: string;
  timeframe?: string;
  parityStatus?: string;
  badgeStatus?: string;
  parityPercent?: number;
  overlapParityPercent?: number;
  referenceTradesInOverlap?: number;
  dashboardTradesInOverlap?: number;
  matchedTradesInOverlap?: number;
  recentParity2025_2026?: { parityPercent?: number; matched?: number; csvTrades?: number; status?: string };
  liveOpenTradeParity?: { status?: string; match?: boolean | null };
  candleStatus?: string;
  mainFailureReason?: string;
  mainRemainingIssue?: string;
};

type ChartItem = {
  key: string;
  code: string;
  name: string;
  strategy?: string;
  tv?: string;
  source?: string;
  short?: string;
  assetId?: string;
  dataMismatch?: boolean;
  payload: MonitoringPayload | null;
  variant: "large" | "compact";
  timeframe?: string;
  eventsFile?: string;
};

type AgrarAssetConfig = {
  code: string;
  short: string;
  name: string;
  tv: string;
  source: string;
  strategy: string;
  file: string;
  assetId: string;
  liveProvider: "tradingview";
};

type IntradayMtAssetConfig = {
  slot: "top_left" | "top_right" | "bottom_left" | "bottom_right";
  displaySymbol: string;
  requestSymbol: string;
  source: string;
  name: string;
  timeframe: "30M" | "1H" | "2H";
  strategyId: string;
  strategyScriptFile: string;
};

type AgrarLiveState = {
  symbol: string;
  short: string;
  displayName: string;
  source: string;
  latestTimestamp: string | null;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
  tradeStatus: "open" | "closed" | "none";
  positionDirection: "long" | "short" | null;
  entryPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  openTrade: boolean;
  sourceUsed: string | null;
  updatedAt: string | null;
};

type MonitoringLiveStateRow = {
  strategyId?: string | null;
  symbol?: string | null;
  group?: string | null;
  timeframe?: string | null;
  direction?: string | null;
  entryTime?: string | null;
  entryPrice?: number | null;
  currentPrice?: number | null;
  stopLossPrice?: number | null;
  takeProfitPrice?: number | null;
  exitTime?: string | null;
  exitPrice?: number | null;
  source?: string | null;
  status?: string | null;
  tradeId?: string | null;
};

type MonitoringLiveStatePayload = {
  updatedAt?: string | null;
  openTrades?: MonitoringLiveStateRow[];
  exitsToday?: MonitoringLiveStateRow[];
};

type MonitoringEngineStateStrategyRow = {
  strategyId?: string | null;
  symbol?: string | null;
  group?: string | null;
  timeframe?: string | null;
  source?: string | null;
  openTrades?: MonitoringLiveStateRow[];
  todayEntries?: MonitoringLiveStateRow[];
  todayExits?: MonitoringLiveStateRow[];
};

type MonitoringEngineStateIndexPayload = {
  updatedAt?: string | null;
  strategies?: MonitoringEngineStateStrategyRow[];
};

type MonitoringCacheManifestPayload = {
  generatedAt?: string;
  assets?: Array<{ stale?: boolean }>;
};

type MonitoringPageProps = {
  initialAgriFinalStatus?: AgriFinalStatusResponse | null;
};

type Wave1DesktopState = Record<Wave1GroupId, Wave1GroupData | null>;

const ORDERED_ASSETS: AgrarAssetConfig[] = [
  { code: "ZW1!", short: "ZW1", name: "Wheat", tv: "CBOT:ZW1!", source: "CBOT:ZW1!", strategy: "Macro Valuation Alpha V1", file: "agrar_ZW1.json", assetId: "wheat", liveProvider: "tradingview" },
  { code: "ZC1!", short: "ZC1", name: "Corn", tv: "CBOT:ZC1!", source: "CBOT:ZC1!", strategy: "Macro Valuation Alpha V1", file: "agrar_ZC1.json", assetId: "corn", liveProvider: "tradingview" },
  { code: "ZS1!", short: "ZS1", name: "Soybeans", tv: "CBOT:ZS1!", source: "CBOT:ZS1!", strategy: "Macro Valuation Alpha V1", file: "agrar_ZS1.json", assetId: "soybeans", liveProvider: "tradingview" },
  { code: "CC1!", short: "CC1", name: "Cocoa", tv: "ICEUS:CC1!", source: "ICEUS:CC1!", strategy: "Macro Valuation Alpha V1", file: "agrar_CC1.json", assetId: "cocoa", liveProvider: "tradingview" },
  { code: "KC1!", short: "KC1", name: "Coffee", tv: "ICEUS:KC1!", source: "ICEUS:KC1!", strategy: "Macro Valuation Alpha V1", file: "agrar_KC1.json", assetId: "coffee", liveProvider: "tradingview" },
  { code: "SB1!", short: "SB1", name: "Sugar", tv: "ICEUS:SB1!", source: "ICEUS:SB1!", strategy: "Macro Valuation Alpha V1", file: "agrar_SB1.json", assetId: "sugar", liveProvider: "tradingview" },
  { code: "CT1!", short: "CT1", name: "Cotton", tv: "ICEUS:CT1!", source: "ICEUS:CT1!", strategy: "Macro Valuation Alpha V1", file: "agrar_CT1.json", assetId: "cotton", liveProvider: "tradingview" },
  { code: "OJ1!", short: "OJ1", name: "Orange Juice", tv: "ICEUS:OJ1!", source: "ICEUS:OJ1!", strategy: "Macro Valuation Alpha V1", file: "agrar_OJ1.json", assetId: "orange_juice", liveProvider: "tradingview" },
];

const INTRADAY_MT_ASSETS: IntradayMtAssetConfig[] = [
  {
    slot: "top_left",
    displaySymbol: "FDAX1! 2H",
    // source stays OANDA so existing candle cache files load; displaySymbol shows futures name
    requestSymbol: "DE30EUR",
    source: "OANDA:DE30EUR",
    name: "DAX Future (TM)",
    timeframe: "2H",
    strategyId: "dax_2h",
    strategyScriptFile: "workspace/input/pine_strategies/01_dax_2h_intraday.pine",
  },
  {
    slot: "top_right",
    displaySymbol: "6B1! 30M",
    requestSymbol: "GBPUSD",
    source: "OANDA:GBPUSD",
    name: "GBP Future (MT)",
    timeframe: "30M",
    strategyId: "gbpusd_30m",
    strategyScriptFile: "workspace/input/pine_strategies/03_gbpusd_30m_intraday.pine",
  },
  {
    slot: "bottom_left",
    displaySymbol: "FDAX1! 1H",
    requestSymbol: "DE30EUR",
    source: "OANDA:DE30EUR",
    name: "DAX Future (MT)",
    timeframe: "1H",
    strategyId: "dax_1h",
    strategyScriptFile: "workspace/input/pine_strategies/02_dax_1h_intraday.pine",
  },
  {
    slot: "bottom_right",
    displaySymbol: "6E1! 30M",
    requestSymbol: "EURUSD",
    source: "OANDA:EURUSD",
    name: "EUR Future (MT)",
    timeframe: "30M",
    strategyId: "eurusd_30m",
    strategyScriptFile: "workspace/input/pine_strategies/04_eurusd_30m_intraday.pine",
  },
];

type AnomalyMtAssetConfig = {
  slot: "top_left" | "top_right" | "bottom_left" | "bottom_right";
  displaySymbol: string;
  requestSymbol: string;
  source: string;
  name: string;
  timeframe: string;
};

const ANOMALY_MT_ASSETS: AnomalyMtAssetConfig[] = [
  { slot: "top_left",     displaySymbol: "GC1! 1D",   requestSymbol: "GC1!",   source: "COMEX:GC1!",     name: "Gold Freitag Long (GC1!)",    timeframe: "1D" },
  { slot: "top_right",    displaySymbol: "GLD 1D",    requestSymbol: "GLD",    source: "AMEX:GLD",       name: "Gold Donnerstag Long (GLD)",  timeframe: "1D" },
  { slot: "bottom_left",  displaySymbol: "YM1! 1D",   requestSymbol: "YM1!",   source: "CBOT_MINI:YM1!", name: "Dow Jones TAT (YM1!)",        timeframe: "1D" },
  { slot: "bottom_right", displaySymbol: "FDAX1! 1D", requestSymbol: "FDAX1!", source: "EUREX:FDAX1!",   name: "DAX Futures TAT (FDAX1!)",    timeframe: "1D" },
];

const WAVE1_GROUP_BY_TAB: Partial<Record<TabId, Wave1GroupId>> = {
  agrar: "agrar",
  intraday_mt: "intraday",
  indizes: "indices",
};

const WAVE1_INDICES_ASSETS: UniverseAssetItem[] = [
  { tab: "Indizes", symbol: "YM1!", requestSymbol: "YM1!", source: "CBOT_MINI:YM1!", name: "Dow", timeframe: "D", hasData: true, hasStrategy: true, strategyStatus: "wave1", buildable: true },
  { tab: "Indizes", symbol: "UKX!", requestSymbol: "UKX!", source: "TVC:UKX!", name: "UKX", timeframe: "D", hasData: true, hasStrategy: true, strategyStatus: "wave1", buildable: true },
  { tab: "Indizes", symbol: "NQ1!", requestSymbol: "NQ1!", source: "CME_MINI:NQ1!", name: "Nasdaq", timeframe: "D", hasData: true, hasStrategy: true, strategyStatus: "wave1", buildable: true },
  { tab: "Indizes", symbol: "FDAX1!", requestSymbol: "FDAX1!", source: "EUREX:FDAX1!", name: "DAX", timeframe: "D", hasData: true, hasStrategy: true, strategyStatus: "wave1", buildable: true },
  { tab: "Indizes", symbol: "ES1!", requestSymbol: "ES1!", source: "CME_MINI:ES1!", name: "S&P 500", timeframe: "D", hasData: true, hasStrategy: true, strategyStatus: "wave1", buildable: true },
];

function normalizeWave1SignalLabel(value: string | null | undefined): "long_entry" | "short_entry" | "long_exit" | "short_exit" {
  const key = String(value || "").trim().toLowerCase();
  if (key === "long_entry") return "long_entry";
  if (key === "short_entry") return "short_entry";
  if (key === "short_exit" || key === "sl_hit" || key === "tp_hit") return "short_exit";
  if (key === "long_exit") return "long_exit";
  return "long_entry";
}

function buildWave1MonitoringPayload(record: Wave1StrategyRecord, source: string, strategyEventsFile: string): MonitoringPayload {
  const status = String(record.manifestStatus || "").trim().toLowerCase();
  const signalStatus = String(record.signal?.signal_status || "").trim().toUpperCase();
  const badge = status === "weak_strategy" ? "WATCH" : signalStatus === "OK" ? "OK" : signalStatus || "OK";
  return {
    metadata: {
      code: record.symbol,
      name: record.label,
      tvSymbol: source,
      strategy: "Wave 1",
      status: "OK",
      hasStrategy: true,
      strategyEventsFile,
      strategyEventsFallbackFile: null,
      strategyEventsFallbackCandidates: [],
      strategyEventsSourceMode: "wave1_frozen",
      badge,
      badgeTooltip: `Wave 1 · ${record.freezeStatus}`,
      lastSignalTime: record.signal?.last_signal_time ?? null,
      openPosition: Boolean(record.signal?.open_position),
      hints: ["wave1", record.freezeStatus],
      params: [],
    },
    bars: (record.chart?.bars ?? []).map((bar) => ({
      time: bar.time,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
    })),
    signals: (record.chart?.markers ?? [])
      .filter((marker) => marker.type === "signal")
      .map((marker) => {
        const type = normalizeWave1SignalLabel(marker.label);
        return {
          time: marker.time,
          type,
          long_entry: type === "long_entry",
          short_entry: type === "short_entry",
          long_exit: type === "long_exit",
          short_exit: type === "short_exit",
          close: marker.price,
          entry_price: marker.price,
          entry_sl: null,
          entry_tp: null,
          long_sl_final: null,
          short_sl_final: null,
          long_tp_final: null,
          short_tp_final: null,
          be_active: false,
          position: 0,
          position_size: null,
          signal_text: marker.label,
        };
      }),
    boxes: [],
  };
}

function buildWave1StrategyEvents(record: Wave1StrategyRecord, source: string): StrategyEventsPayload {
  const markers = record.chart?.markers ?? [];
  const entryMarkers = markers.filter((marker) => marker.type === "entry");
  const exitMarkers = markers.filter((marker) => marker.type === "exit");
  const signalMarkers = markers.filter((marker) => marker.type === "signal");
  const trades: StrategyEventsPayload["trades"] = entryMarkers.map((entryMarker, index) => {
    const exitMarker = exitMarkers[index] ?? null;
    const side: "long" | "short" = String(entryMarker.label || "").trim().toLowerCase() === "short" ? "short" : "long";
    return {
      direction: side,
      entryTime: entryMarker.time || "",
      exitTime: exitMarker?.time || "",
      entry: Number(entryMarker.price ?? 0),
      sl: null,
      tp: null,
      exit: Number(exitMarker?.price ?? 0) || Number(entryMarker.price ?? 0),
      exitReason: exitMarker ? String(exitMarker.label || "wave1_exit") : "open_position",
    };
  }).filter((trade) => trade.entryTime && Number.isFinite(trade.entry) && trade.entry > 0);

  return {
    symbol: record.symbol,
    tvSymbol: source,
    strategyName: "Wave 1",
    hasStrategy: true,
    source: "wave1_frozen",
    openTrade: Boolean(record.signal?.open_position),
    openTradeRow: null,
    signalEvents: signalMarkers.map((marker, index) => ({
      id: `${record.strategyId}-signal-${index}`,
      time: marker.time || "",
      type: normalizeWave1SignalLabel(marker.label),
      direction: marker.side === "short" ? "short" : marker.side === "long" ? "long" : null,
      price: marker.price,
      entry: marker.price,
      sl: null,
      tp: null,
      reason: "wave1",
    })),
    events: signalMarkers.map((marker, index) => ({
      time: marker.time || "",
      barIndex: index,
      type: normalizeWave1SignalLabel(marker.label),
      price: marker.price,
      entry: marker.price,
      sl: null,
      tp: null,
      reason: "wave1",
    })),
    trades,
  };
}

const GROUP_ORDER = ["Agrar", "Metalle", "Energie", "Indizes", "FX", "Aktien", "Invest", "Intraday MT"];
// Indizes tab assets that route through the unified (Agrar-cloned) strategy workspace.
const MONITORING_INDICES_SYMBOLS = new Set(["YM1!", "UKX!", "NQ1!", "FDAX1!", "ES1!"]);

const GROUP_ALIASES: Record<string, string> = {
  agrar: "Agrar",
  metals: "Metalle",
  metalle: "Metalle",
  "metalle+energie": "Metalle+Energie",
  energy: "Energie",
  energie: "Energie",
  indices: "Indizes",
  indizes: "Indizes",
  fx: "FX",
  stocks: "Aktien",
  aktien: "Aktien",
  invest: "Invest",
  bonds: "Invest",
  "intraday / mt": "Intraday MT",
  intraday_mt: "Intraday MT",
  "intraday mt": "Intraday MT",
};

const MAX_GRID_CHARTS = 8;

function limitGridUniverseItems(items: UniverseAssetItem[], tabId: TabId): UniverseAssetItem[] {
  if ((tabId === "all" || tabId === "live")) return items;
  return items.slice(0, MAX_GRID_CHARTS);
}

function normalizeGroup(raw: string): string {
  const key = String(raw || "").trim().toLowerCase();
  if (!key) return "";
  return GROUP_ALIASES[key] ?? raw;
}

function tabIdToMonitoringLabel(tabId: TabId): MonitoringTabLabel | null {
  switch (tabId) {
    case "agrar":
      return "Agrar";
    case "metalle_energie":
      return null;
    case "indizes":
      return "Indizes";
    case "fx":
      return "FX";
    case "aktien":
      return "Aktien";
    case "invest":
      return "Invest";
    case "intraday_mt":
      return "Intraday MT";
    case "live":
    case "all":
      return "Alle Strategien";
    default:
      return null;
  }
}

function groupToMonitoringLabel(group: string): MonitoringTabLabel | null {
  const normalized = normalizeGroup(group);
  switch (normalized) {
    case "Agrar":
    case "Metalle":
    case "Energie":
    case "Indizes":
    case "FX":
    case "Aktien":
    case "Invest":
    case "Intraday MT":
    case "Anomaly":
      return normalized;
    default:
      return null;
  }
}

function tabConfigById(tabId: TabId) {
  return getMonitoringTabConfig(tabId);
}

function monitoringTabIdForGroup(group: string): TabId {
  const normalized = normalizeGroup(group);
  if (normalized === "Metalle+Energie") return "metalle_energie";
  const cfg = MONITORING_TAB_CONFIG.find((tab) =>
    tab.universeGroups.some((g) => normalizeGroup(g) === normalized),
  );
  if (!cfg || cfg.tabId === "all" || cfg.tabId === "live") return "all";
  return cfg.tabId;
}

function defaultTimeframeForGroup(group: string): string {
  const normalized = normalizeGroup(group);
  const cfg = MONITORING_TAB_CONFIG.find((tab) => tab.universeGroups.some((g) => normalizeGroup(g) === normalized));
  return cfg?.defaultTimeframe ?? "D";
}

function universePayloadKey(item: UniverseAssetItem): string {
  const safeTab = item.tab.replace(/\s+/g, "_").toLowerCase();
  const safeSource = item.source.replace(/[^A-Za-z0-9_]/g, "_");
  const safeSymbol = String(item.symbol || "").replace(/[^A-Za-z0-9_]/g, "_");
  const safeTimeframe = String(item.timeframe || "").replace(/[^A-Za-z0-9_]/g, "_").toUpperCase();
  return `alltab_universe_${safeTab}_${safeSource}_${safeSymbol}_${safeTimeframe}`;
}

function intradayMtPayloadKey(item: UniverseAssetItem): string {
  const safeSource = item.source.replace(/[^A-Za-z0-9_]/g, "_");
  const safeTf = String(item.timeframe || "").replace(/[^A-Za-z0-9_]/g, "_").toUpperCase();
  const safeSym = String(item.symbol || "").replace(/[^A-Za-z0-9_]/g, "_");
  return `intraday_mt_${safeSym}_${safeSource}_${safeTf}`;
}

function isIntradayMtUniverseItem(item: UniverseAssetItem): boolean {
  return normalizeGroup(item.tab) === "Intraday MT";
}

function findOrderedAgrarAsset(symbol: string): (typeof ORDERED_ASSETS)[number] | null {
  const code = String(symbol || "").trim().toUpperCase();
  return ORDERED_ASSETS.find((asset) => asset.code.toUpperCase() === code) ?? null;
}

function monitoringPayloadKeyForItem(item: UniverseAssetItem, tabId: TabId): string {
  const agrarAsset = findOrderedAgrarAsset(item.symbol);
  if (agrarAsset && (tabId === "agrar" || (tabId === "all" || tabId === "live"))) {
    return agrarAsset.file;
  }
  if (tabId === "intraday_mt" || ((tabId === "all" || tabId === "live") && isIntradayMtUniverseItem(item))) {
    return intradayMtPayloadKey(item);
  }
  return universePayloadKey(item);
}

function monitoringTimeframeForItem(item: UniverseAssetItem, tabId: TabId): string {
  if (findOrderedAgrarAsset(item.symbol) && (tabId === "agrar" || (tabId === "all" || tabId === "live"))) {
    return "D";
  }
  if (tabId === "intraday_mt" || ((tabId === "all" || tabId === "live") && isIntradayMtUniverseItem(item))) {
    return normalizeIntradayTf(item.timeframe);
  }
  if ((tabId === "all" || tabId === "live")) return defaultTimeframeForGroup(item.tab);
  return tabConfigById(tabId)?.defaultTimeframe ?? "D";
}

function shouldUseIntradayMtFallback(item: UniverseAssetItem, tabId: TabId): boolean {
  return tabId === "intraday_mt" || ((tabId === "all" || tabId === "live") && isIntradayMtUniverseItem(item));
}

function buildOrderedAgrarUniverseItems(): UniverseAssetItem[] {
  return ORDERED_ASSETS.map((asset) => ({
    tab: "Agrar",
    symbol: asset.code,
    requestSymbol: asset.code,
    source: asset.source,
    name: asset.name,
    timeframe: "D",
    hasData: true,
    hasStrategy: true,
    strategyStatus: "mapped",
    buildable: true,
  }));
}

function buildOrderedIntradayMtUniverseItems(): UniverseAssetItem[] {
  return INTRADAY_MT_ASSETS.map((row) => ({
    tab: "Intraday MT",
    symbol: row.displaySymbol,
    requestSymbol: row.requestSymbol,
    source: row.source,
    name: row.name,
    timeframe: row.timeframe,
    strategyId: row.strategyId,
    strategyScriptFile: row.strategyScriptFile,
    missingPineScript: false,
    hasData: true,
    hasStrategy: true,
    strategyStatus: "mapped",
    buildable: true,
  }));
}

function applyMonitoringUniverseFilters(items: UniverseAssetItem[], options?: { replaceAgrarWithOrdered?: boolean }): UniverseAssetItem[] {
  const filtered = items.filter((item) => {
    if (isExcludedMonitoringAsset(item)) return false;
    if (normalizeGroup(item.tab) === "Agrar" && !isActiveMonitoringAgrarSymbol(item.symbol)) return false;
    return true;
  });

  if (!options?.replaceAgrarWithOrdered) return filtered;

  const withoutPinned = filtered.filter((item) => {
    const group = normalizeGroup(item.tab);
    return group !== "Agrar" && group !== "Intraday MT";
  });
  return [...withoutPinned, ...buildOrderedAgrarUniverseItems(), ...buildOrderedIntradayMtUniverseItems()];
}

function normalizeIntradayTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const text = String(value).trim();
  if (!text) return null;
  const iso = text.includes("T") ? text : `${text}T00:00:00.000Z`;
  const dt = new Date(iso);
  if (!Number.isFinite(dt.getTime())) return null;
  return dt.toISOString();
}

function normalizeIntradayTf(value: string | null | undefined): "30M" | "1H" | "2H" | "D" {
  const tf = String(value || "").trim().toUpperCase();
  if (tf === "30M" || tf === "30") return "30M";
  if (tf === "1H" || tf === "60" || tf === "60M") return "1H";
  if (tf === "2H" || tf === "120" || tf === "120M") return "2H";
  return "D";
}

function readOptimizerMtAssetId(source: string): "dax40" | "eurusd" | "gbpusd" | null {
  const src = normalizeSourceKey(source);
  if (src === "OANDA:DE30EUR") return "dax40";
  if (src === "OANDA:EURUSD") return "eurusd";
  if (src === "OANDA:GBPUSD") return "gbpusd";
  return null;
}

function parseOptimizerMtCandles(payload: any): MonitoringCandle[] {
  const rows = Array.isArray(payload?.candles30m) ? payload.candles30m : [];
  const byTime = new Map<string, MonitoringCandle>();
  for (const row of rows) {
    const time = normalizeIntradayTime(row?.t ?? null);
    const open = Number(row?.open);
    const high = Number(row?.high);
    const low = Number(row?.low);
    const close = Number(row?.close);
    if (!time) continue;
    if (!Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) continue;
    if (high < low) continue;
    byTime.set(time, { time, open, high, low, close, volume: null });
  }
  return Array.from(byTime.values()).sort((a, b) => String(a.time).localeCompare(String(b.time)));
}

function resampleCandlesFrom30M(input: MonitoringCandle[], timeframe: "30M" | "1H" | "2H"): MonitoringCandle[] {
  if (timeframe === "30M") return input;
  const intervalMs = timeframe === "1H" ? 60 * 60 * 1000 : 2 * 60 * 60 * 1000;
  const buckets = new Map<number, MonitoringCandle>();
  for (const row of input) {
    const ts = new Date(row.time).getTime();
    if (!Number.isFinite(ts)) continue;
    const bucket = Math.floor(ts / intervalMs) * intervalMs;
    const existing = buckets.get(bucket);
    if (!existing) {
      buckets.set(bucket, {
        time: new Date(bucket).toISOString(),
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        volume: null,
      });
      continue;
    }
    existing.high = Math.max(existing.high, row.high);
    existing.low = Math.min(existing.low, row.low);
    existing.close = row.close;
  }
  return Array.from(buckets.values()).sort((a, b) => String(a.time).localeCompare(String(b.time)));
}

function isIntradayFallbackStale(bars: MonitoringCandle[]): boolean {
  if (!bars.length) return true;
  const last = bars[bars.length - 1];
  const ts = Date.parse(String(last?.time || ""));
  if (!Number.isFinite(ts)) return true;
  const ageHours = (Date.now() - ts) / 3_600_000;
  return !Number.isFinite(ageHours) || ageHours > 72;
}

// V2 events files generated from the V2 engine take precedence over V1 legacy events files.
// When V2 registry is active, the chart must use V2 engine results as the authoritative source.
// V1 files (strategies/*_events.json) are legacy fallback only — never authoritative for V2 assets.
const V2_EVENTS_OVERRIDES: Record<string, string> = {
  "strategies/CBOT_ZC1_events.json":  "strategies/CBOT_ZC1_v2_events.json",
  "strategies/CBOT_ZW1_events.json":  "strategies/CBOT_ZW1_v2_events.json",
  "strategies/CBOT_ZS1_events.json":  "strategies/CBOT_ZS1_v2_events.json",
  "strategies/ICEUS_CC1_events.json": "strategies/ICEUS_CC1_v2_events.json",
  "strategies/ICEUS_OJ1_events.json": "strategies/ICEUS_OJ1_v2_events.json",
  "strategies/ICEUS_KC1_events.json": "strategies/ICEUS_KC1_v2_events.json",
  "strategies/ICEUS_SB1_events.json": "strategies/ICEUS_SB1_v2_events.json",
  "strategies/ICEUS_CT1_events.json": "strategies/ICEUS_CT1_v2_events.json",
};

function strategyEventsFileFromSource(source: string | null | undefined): string | null {
  const raw = String(source || "").trim();
  if (!raw || !raw.includes(":")) return null;
  const [exchange, symbol] = raw.split(":", 2);
  if (!exchange || !symbol) return null;
  const v1File = `strategies/${exchange}_${symbol.replace("!", "")}_events.json`;
  return V2_EVENTS_OVERRIDES[v1File] ?? v1File;
}

// Hybrid events overrides: when a hybrid events file exists for a strategy,
// the engine/default mode uses the hybrid file (CSV history + engine recent).
// The CSV reference mode continues to use the original events file.
const HYBRID_EVENTS_OVERRIDES: Record<string, string> = {
  "strategies/OANDA_DE30EUR_2H_events.json": "strategies/OANDA_DE30EUR_2H_hybrid_events.json",
  "strategies/OANDA_DE30EUR_1H_events.json": "strategies/OANDA_DE30EUR_1H_hybrid_events.json",
  "strategies/OANDA_GBPUSD_30M_events.json": "strategies/OANDA_GBPUSD_30M_hybrid_events.json",
  "strategies/OANDA_EURUSD_30M_events.json": "strategies/OANDA_EURUSD_30M_hybrid_events.json",
};

// For intraday assets where the same source has multiple strategies at different timeframes,
// use a timeframe-specific events file (e.g. OANDA_DE30EUR_2H_events.json).
function strategyEventsCandidatesFromSourceTf(
  source: string | null | undefined,
  timeframe: string | null | undefined,
): string[] {
  const tf = normalizeIntradayTf(timeframe);
  if (tf === "D") {
    const single = strategyEventsFileFromSource(source);
    return single ? [single] : [];
  }
  const raw = String(source || "").trim();
  if (!raw || !raw.includes(":")) return [];
  const [exchange, symbol] = raw.split(":", 2);
  if (!exchange || !symbol) return [];
  const base = `strategies/${exchange}_${symbol.replace("!", "")}_${tf}_events.json`;
  const hybrid = HYBRID_EVENTS_OVERRIDES[base];
  return hybrid ? [base, hybrid] : [base];
}

function strategyEventsFileFromSourceTf(
  source: string | null | undefined,
  timeframe: string | null | undefined,
): string | null {
  const candidates = strategyEventsCandidatesFromSourceTf(source, timeframe);
  return candidates[0] ?? null;
}

function deriveExecutionParityStatus(badge: string): ExecutionParityStatus {
  const key = String(badge || "").trim().toUpperCase();
  if (!key) return "unknown";
  if (key.includes("PASS") || key === "OK") return "pass";
  if (key.includes("WARN") || key.includes("OVERLAP")) return "warn";
  if (key.includes("FAIL")) return "fail";
  return "unknown";
}

function routeTfKey(value: string | null | undefined): string {
  return normalizeIntradayTf(value);
}

function resolveStrategyRuntimeRoute(
  routes: StrategyRuntimeRouteRow[],
  item: UniverseAssetItem | ChartItem | null | undefined,
): StrategyRuntimeRouteRow | null {
  if (!item) return null;
  const source = String(("source" in item ? item.source : item.tv) || "").trim().toUpperCase();
  const timeframe = routeTfKey(item.timeframe ?? null);
  const symbol = String(("code" in item ? item.code : item.symbol) || "").trim().toUpperCase();
  const strategyId = String(("strategyId" in item ? item.strategyId : "") || "").trim().toLowerCase();
  const universeSymbol = String(("symbol" in item ? item.symbol : item.code) || "").trim().toUpperCase();
  if (!source) return null;

  const byStrategyId = strategyId
    ? routes.find((row) => String(row.strategyId || "").trim().toLowerCase() === strategyId) ?? null
    : null;
  if (byStrategyId) return byStrategyId;

  const scoped = routes.filter((row) =>
    String(row.tvSymbol || "").trim().toUpperCase() === source
    && routeTfKey(row.timeframe ?? null) === timeframe
  );
  if (!scoped.length) return null;

  const byUniverseSymbol = scoped.find((row) => String(row.universeSymbol || "").trim().toUpperCase() === universeSymbol);
  if (byUniverseSymbol) return byUniverseSymbol;

  const byCode = scoped.find((row) => {
    const asset = String(row.asset || "").trim().toUpperCase();
    return asset && (symbol === asset || symbol.includes(asset));
  });
  if (byCode) return byCode;

  return scoped[0] ?? null;
}

function strategyEventsCandidatesForItem(
  routes: StrategyRuntimeRouteRow[],
  item: UniverseAssetItem | ChartItem | null | undefined,
): string[] {
  const route = resolveStrategyRuntimeRoute(routes, item);
  if (!route) {
    const source = item ? ("source" in item ? item.source : item.tv) : null;
    const timeframe = item?.timeframe ?? null;
    return strategyEventsCandidatesFromSourceTf(source, timeframe);
  }
  const preferred = String(route.preferredEventsFile || "").trim();
  const reference = String(route.referenceEventsFile || "").trim();
  const hybrid = String(route.hybridEventsFile || "").trim();
  const base = String(route.baseEventsFile || "").trim();
  const sourceMode = String(route.sourceMode || "").trim().toLowerCase();
  const group = String(route.group || "").trim().toLowerCase();
  const preferBaseForIntraday = sourceMode === "hybrid_csv_engine" || group === "intraday mt";
  if (group === "intraday mt" && base) {
    return [base];
  }
  const out: string[] = [];
  if (preferBaseForIntraday) {
    if (base) out.push(base);
    if (preferred) out.push(preferred);
    if (hybrid) out.push(hybrid);
    if (reference) out.push(reference);
  } else {
    if (preferred) out.push(preferred);
    if (hybrid) out.push(hybrid);
    if (reference) out.push(reference);
    if (base) out.push(base);
  }
  const uniqueRouteFiles = Array.from(new Set(out.filter(Boolean)));
  if (uniqueRouteFiles.length) return uniqueRouteFiles;
  const source = item ? ("source" in item ? item.source : item.tv) : null;
  const timeframe = item?.timeframe ?? null;
  return strategyEventsCandidatesFromSourceTf(source, timeframe);
}

function pickPreferredEventsFile(
  candidates: Array<string | null | undefined>,
  loaded: Record<string, StrategyEventsPayload>,
): string {
  const files = candidates.map((v) => String(v || "").trim()).filter(Boolean);
  if (!files.length) return "";
  const loadedFile = files.find((file) => Boolean(loaded[file]));
  return loadedFile ?? files[0];
}

function lifecycleSourceFromEventsFile(file: string): TradeLifecycleSource {
  const normalized = String(file || "").trim().toLowerCase();
  if (!normalized) return "engine";
  if (normalized.includes("reference_events")) return "csv_reference";
  if (normalized.includes("hybrid_events")) return "hybrid";
  if (normalized.includes("live_state")) return "live_state";
  if (normalized.startsWith("strategies/") || normalized.includes("/strategies/")) return "engine";
  return "engine";
}

type LooseTradeRow = {
  direction: "long" | "short";
  entryTime: string;
  exitTime?: string | null;
  entry: number;
  sl?: number | null;
  tp?: number | null;
  exit?: number | null;
  exitReason?: string | null;
  _source?: string;
};

function normalizeTradeTimeValue(value: string | null | undefined): string {
  return String(value || "").trim().replace(/ZZ$/i, "Z");
}

function parseTradeTimestampValue(value: string | null | undefined): number | null {
  const raw = normalizeTradeTimeValue(value);
  if (!raw) return null;
  const iso = raw.includes("T")
    ? (raw.endsWith("Z") ? raw : `${raw}Z`)
    : `${raw}T00:00:00Z`;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function tradeIdentityKey(row: LooseTradeRow): string {
  return [
    String(row.direction || "").toLowerCase(),
    normalizeTradeTimeValue(row.entryTime),
    normalizeTradeTimeValue(row.exitTime ?? null),
    Number(row.entry),
    Number(row.exit ?? 0),
  ].join("|");
}

function pickTradeFieldNumber(row: LooseTradeRow | null | undefined, keys: string[]): number | null {
  if (!row) return null;
  const data = row as unknown as Record<string, unknown>;
  for (const key of keys) {
    const value = Number(data[key]);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return null;
}

function findBestFallbackTrade(primaryRow: LooseTradeRow, fallbackRows: LooseTradeRow[]): LooseTradeRow | null {
  const exact = fallbackRows.find((row) => tradeIdentityKey(row) === tradeIdentityKey(primaryRow));
  if (exact) return exact;

  const pEntry = pickTradeFieldNumber(primaryRow, ["entry", "entryPrice", "entry_price", "openPrice", "price"]);
  const pEntryTimeMs = parseTradeTimestampValue(primaryRow.entryTime);
  const pEntryDay = normalizeTradeTimeValue(primaryRow.entryTime).slice(0, 10);
  const pExitTimeMs = parseTradeTimestampValue(primaryRow.exitTime ?? null);
  const pDir = String(primaryRow.direction || "long").toLowerCase() === "short" ? "short" : "long";

  let best: LooseTradeRow | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const row of fallbackRows) {
    const cDir = String(row.direction || "long").toLowerCase() === "short" ? "short" : "long";
    if (cDir !== pDir) continue;

    const cEntry = pickTradeFieldNumber(row, ["entry", "entryPrice", "entry_price", "openPrice", "price"]);
    const cEntryTimeMs = parseTradeTimestampValue(row.entryTime);
    const cEntryDay = normalizeTradeTimeValue(row.entryTime).slice(0, 10);
    const cExitTimeMs = parseTradeTimestampValue(row.exitTime ?? null);

    let timeScore = 5;
    if (pEntryTimeMs != null && cEntryTimeMs != null) {
      const diff = Math.abs(pEntryTimeMs - cEntryTimeMs);
      const toleranceMs = 3 * 24 * 60 * 60 * 1000;
      if (diff > toleranceMs) continue;
      timeScore = diff / toleranceMs;
    } else if (pEntryDay && cEntryDay) {
      if (pEntryDay !== cEntryDay) continue;
      timeScore = 0;
    }

    let priceScore = 1;
    if (pEntry != null && cEntry != null) {
      const diff = Math.abs(pEntry - cEntry);
      const tolerance = Math.max(0.0001, pEntry * 0.01);
      if (diff > tolerance) continue;
      priceScore = diff / tolerance;
    }

    let exitScore = 0.25;
    if (pExitTimeMs != null && cExitTimeMs != null) {
      const exitDiff = Math.abs(pExitTimeMs - cExitTimeMs);
      exitScore = Math.min(0.25, exitDiff / (7 * 24 * 60 * 60 * 1000));
    }

    const hasLevels = row.sl != null || row.tp != null;
    const score = timeScore * 1.5 + priceScore + exitScore + (hasLevels ? -0.2 : 0);
    if (score < bestScore) {
      bestScore = score;
      best = row;
    }
  }
  return best;
}

function enrichTradesWithFallback<T extends LooseTradeRow>(
  primary: T[],
  fallback: T[],
): T[] {
  if (!primary.length || !fallback.length) return primary;
  return primary.map((row) => {
    const match = findBestFallbackTrade(row, fallback as LooseTradeRow[]) as T | null;
    if (!match) return row;
    return {
      ...row,
      sl: row.sl ?? match.sl ?? null,
      tp: row.tp ?? match.tp ?? null,
      exit: row.exit ?? match.exit ?? null,
      exitReason: row.exitReason ?? match.exitReason ?? undefined,
    };
  });
}

function toStrictMonitoringTrades(rows: LooseTradeRow[]): Array<MonitoringTrade & { _source?: string }> {
  const out: Array<MonitoringTrade & { _source?: string }> = [];
  for (const row of rows) {
    const entry = Number(row.entry);
    if (!Number.isFinite(entry) || entry <= 0) continue;
    const exit = Number(row.exit);
    const hasExit = Number.isFinite(exit) && exit > 0;
    const entryTime = normalizeTradeTimeValue(row.entryTime);
    const exitTimeRaw = normalizeTradeTimeValue(row.exitTime ?? null);
    const exitTime = exitTimeRaw || entryTime;
    out.push({
      direction: row.direction === "short" ? "short" : "long",
      entryTime,
      exitTime,
      entry,
      sl: row.sl ?? null,
      tp: row.tp ?? null,
      exit: hasExit ? exit : entry,
      exitReason: row.exitReason ?? null,
      quantity: null,
      _source: row._source,
    });
  }
  return out;
}

function toChartTradeRows(rows: LooseTradeRow[]): NonNullable<MonitoringChartData["trades"]> {
  const out: NonNullable<MonitoringChartData["trades"]> = [];
  for (const row of rows) {
    const entry = Number(row.entry);
    if (!Number.isFinite(entry) || entry <= 0) continue;
    const exit = Number(row.exit);
    out.push({
      direction: row.direction === "short" ? "short" : "long",
      entryTime: normalizeTradeTimeValue(row.entryTime),
      exitTime: normalizeTradeTimeValue(row.exitTime ?? null) || null,
      entry,
      sl: row.sl ?? null,
      tp: row.tp ?? null,
      exit: Number.isFinite(exit) && exit > 0 ? exit : null,
      exitReason: row.exitReason ?? undefined,
    });
  }
  return out;
}

function normalizeNumberInput(raw: string): number {
  const s = raw.trim().replace(",", ".");
  const parsed = Number(s);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toFinite(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toIsoTimestampFromDate(value: string | null | undefined): string {
  const day = String(value || "").slice(0, 10);
  if (!day) return "";
  return `${day}T00:00:00.000Z`;
}

function sortTradesByEntryTime(trades: MonitoringTrade[]): MonitoringTrade[] {
  return [...trades].sort((a, b) => String(a.entryTime || "").localeCompare(String(b.entryTime || "")));
}

function filterTradesByFromDate(trades: MonitoringTrade[], from: string | null): MonitoringTrade[] {
  if (!from) return trades;
  return trades.filter((trade) => String(trade.entryTime || "").slice(0, 10) >= from);
}

function buildSyntheticCalendarCandles(trades: MonitoringTrade[]): MonitoringCandle[] {
  const daySet = new Set<string>();
  for (const trade of trades) {
    const entryDay = String(trade.entryTime || "").slice(0, 10);
    const exitDay = String(trade.exitTime || "").slice(0, 10);
    if (entryDay) daySet.add(entryDay);
    if (exitDay) daySet.add(exitDay);
  }
  const days = Array.from(daySet.values()).sort((a, b) => a.localeCompare(b));
  return days.map((day) => ({
    time: `${day}T00:00:00.000Z`,
    open: 1,
    high: 1,
    low: 1,
    close: 1,
    volume: null,
  }));
}

function buildChartSignalsFromEvents(payload: StrategyEventsPayload | undefined): MonitoringChartData["signals"] {
  const visualTypes = new Set([
    "long_entry",
    "short_entry",
    "long_exit",
    "short_exit",
    "sl_hit",
    "tp_hit",
    "trend_exit",
    "opposite_valuation_exit",
  ]);
  const explicitSignals = Array.isArray(payload?.signalEvents) ? payload?.signalEvents : [];
  if (explicitSignals.length) {
    return explicitSignals
      .filter((row) => visualTypes.has(String(row.type || "").toLowerCase()))
      .map((row) => ({
        time: row.time ?? null,
        type: row.type as any,
        price: row.price ?? row.entry ?? null,
        entry_price: row.entry ?? null,
      }));
  }
  const rows = Array.isArray(payload?.events) ? payload.events : [];
  return rows
    .filter((row) => visualTypes.has(String(row.type || "").toLowerCase()))
    .map((row) => ({
      time: row.time ?? null,
      type: row.type,
      price: row.price ?? row.entry ?? null,
      entry_price: row.entry ?? null,
    }));
}

function toIsoDay(value: string | null | undefined): string | null {
  if (!value) return null;
  return String(value).slice(0, 10);
}

function normalizeDailyTime(value: string | null | undefined): string | null {
  return toIsoDay(value);
}

function normalizeSourceKey(value: string | null | undefined): string {
  return String(value || "").trim().toUpperCase();
}

function normalizeAssetCode(value: string | null | undefined): string {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function toEventTime(event: TradingViewTradeEvent): string | null {
  const barTime = String(event.event?.barTime || "").trim();
  if (barTime) return barTime;
  const eventTime = String(event.event?.time || "").trim();
  if (eventTime) return eventTime;
  const receivedAt = String(event.receivedAt || "").trim();
  return receivedAt || null;
}

function toEventNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function normalizeIsoTimeString(value: unknown): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.endsWith("ZZ")) return `${raw.slice(0, -1)}`;
  return raw;
}

function normalizeStrategyEventsPayload(payload: StrategyEventsPayload): StrategyEventsPayload {
  const normalizeTrade = (trade: StrategyEventsPayload["trades"][number]) => ({
    ...trade,
    entryTime: normalizeIsoTimeString(trade.entryTime),
    exitTime: normalizeIsoTimeString(trade.exitTime),
  });
  const normalizeEvent = (eventRow: StrategyEventsPayload["events"][number]) => ({
    ...eventRow,
    time: normalizeIsoTimeString(eventRow.time),
  });
  const signalEvents = Array.isArray(payload.signalEvents)
    ? payload.signalEvents.map((row) => ({
      ...row,
      time: normalizeIsoTimeString(row.time),
    }))
    : payload.signalEvents;
  const openTradeRow = payload.openTradeRow
    ? {
      ...payload.openTradeRow,
      entryTime: normalizeIsoTimeString(payload.openTradeRow.entryTime),
      exitTime: normalizeIsoTimeString(payload.openTradeRow.exitTime),
    }
    : payload.openTradeRow;

  return {
    ...payload,
    events: Array.isArray(payload.events) ? payload.events.map(normalizeEvent) : [],
    trades: Array.isArray(payload.trades) ? payload.trades.map(normalizeTrade) : [],
    signalEvents,
    openTradeRow,
  };
}

function normalizeDirection(value: unknown): "long" | "short" | null {
  const key = String(value || "").trim().toLowerCase();
  if (key === "long") return "long";
  if (key === "short") return "short";
  return null;
}

function normalizeTradeExitReason(value: unknown): string {
  const key = String(value || "").trim().toLowerCase();
  if (!key) return "none";
  if (key === "tp") return "take_profit";
  if (key === "sl") return "stop_loss";
  if (key === "reverse") return "reverse";
  if (key === "close") return "strategy_close";
  return key;
}

function extractTradingViewEvents(raw: unknown): TradingViewTradeEvent[] {
  if (Array.isArray(raw)) return raw as TradingViewTradeEvent[];
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.events)) return obj.events as TradingViewTradeEvent[];
    if (Array.isArray(obj.history)) return obj.history as TradingViewTradeEvent[];
    if (Array.isArray(obj.items)) return obj.items as TradingViewTradeEvent[];
  }
  return [];
}

function buildTradingViewTradesBySource(rawHistory: unknown): TradingViewTradesBySource {
  const events = extractTradingViewEvents(rawHistory)
    .filter((row) => normalizeSourceKey(row.asset?.source))
    .sort((a, b) => String(toEventTime(a) || "").localeCompare(String(toEventTime(b) || "")));

  const openBySource = new Map<string, {
    direction: "long" | "short";
    entryTime: string;
    entry: number;
    sl: number | null;
    tp: number | null;
  }>();
  const tradesBySource = new Map<string, StrategyEventsPayload["trades"]>();

  for (const row of events) {
    const source = normalizeSourceKey(row.asset?.source);
    if (!source) continue;
    const eventType = String(row.event?.type || "").trim().toLowerCase();
    const direction = normalizeDirection(row.event?.direction);
    const eventTime = toEventTime(row);
    const entry = toEventNumber(row.event?.entry);
    const stopLoss = toEventNumber(row.event?.stopLoss);
    const takeProfit = toEventNumber(row.event?.takeProfit);
    const exit = toEventNumber(row.event?.exit);
    const list = tradesBySource.get(source) ?? [];
    const openTrade = openBySource.get(source) ?? null;

    if (eventType === "entry" || eventType === "open_position") {
      if (!direction || !eventTime || entry == null) continue;
      if (openTrade && openTrade.direction === direction) {
        openTrade.sl = stopLoss ?? openTrade.sl;
        openTrade.tp = takeProfit ?? openTrade.tp;
        openBySource.set(source, openTrade);
        continue;
      }
      if (openTrade && openTrade.direction !== direction) {
        list.push({
          direction: openTrade.direction,
          entryTime: openTrade.entryTime,
          exitTime: eventTime,
          entry: openTrade.entry,
          sl: openTrade.sl,
          tp: openTrade.tp,
          exit: entry,
          exitReason: "reverse",
        });
      }
      openBySource.set(source, {
        direction,
        entryTime: eventTime,
        entry,
        sl: stopLoss,
        tp: takeProfit,
      });
      tradesBySource.set(source, list);
      continue;
    }

    if (eventType === "pending_signal") {
      if (!direction || !eventTime || entry == null || openTrade) continue;
      openBySource.set(source, {
        direction,
        entryTime: eventTime,
        entry,
        sl: stopLoss,
        tp: takeProfit,
      });
      tradesBySource.set(source, list);
      continue;
    }

    if (eventType === "exit" || eventType === "flat") {
      if (!openTrade || !eventTime) continue;
      const exitPrice = exit ?? entry ?? openTrade.entry;
      list.push({
        direction: openTrade.direction,
        entryTime: openTrade.entryTime,
        exitTime: eventTime,
        entry: openTrade.entry,
        sl: openTrade.sl,
        tp: openTrade.tp,
        exit: exitPrice,
        exitReason: normalizeTradeExitReason(row.event?.exitReason),
      });
      openBySource.delete(source);
      tradesBySource.set(source, list);
    }
  }

  for (const [source, openTrade] of openBySource.entries()) {
    const list = tradesBySource.get(source) ?? [];
    list.push({
      direction: openTrade.direction,
      entryTime: openTrade.entryTime,
      exitTime: "",
      entry: openTrade.entry,
      sl: openTrade.sl,
      tp: openTrade.tp,
      exit: 0,
      exitReason: "open_position",
    });
    tradesBySource.set(source, list);
  }

  return Object.fromEntries(tradesBySource);
}

function normalizeMonitoringCandles(
  bars: Array<{ time: string | null; open: number | null; high: number | null; low: number | null; close: number | null }>,
): MonitoringCandle[] {
  const byDay = new Map<string, MonitoringCandle>();
  for (const bar of bars) {
    const day = normalizeDailyTime(bar.time);
    const open = toFinite(bar.open);
    const high = toFinite(bar.high);
    const low = toFinite(bar.low);
    const close = toFinite(bar.close);
    if (!day || open == null || high == null || low == null || close == null) continue;
    byDay.set(day, {
      time: `${day}T00:00:00Z`,
      open,
      high,
      low,
      close,
      volume: null,
    });
  }
  return Array.from(byDay.values()).sort((a, b) => String(a.time).localeCompare(String(b.time)));
}

/** Convert payload bars to MonitoringCandle[] WITHOUT collapsing to one-per-day, so
 *  intraday cadence (30M/1H/2H) is preserved (dedup by exact timestamp only). */
function toIntradayMonitoringCandles(
  bars: Array<{ time: string | null; open: number | null; high: number | null; low: number | null; close: number | null }>,
): MonitoringCandle[] {
  const byTime = new Map<string, MonitoringCandle>();
  for (const bar of bars) {
    const time = bar.time ? String(bar.time) : null;
    const open = toFinite(bar.open);
    const high = toFinite(bar.high);
    const low = toFinite(bar.low);
    const close = toFinite(bar.close);
    if (!time || open == null || high == null || low == null || close == null) continue;
    byTime.set(time, { time, open, high, low, close, volume: null });
  }
  return Array.from(byTime.values()).sort((a, b) => String(a.time).localeCompare(String(b.time)));
}

function isIntradayTimeframe(tf: string | null | undefined): boolean {
  const key = String(tf ?? "").trim().toUpperCase();
  return key === "30M" || key === "1H" || key === "2H" || /^\d+(M|H)$/.test(key);
}

/** History candles for a chart item: daily charts collapse to one-per-day (full-history
 *  friendly); intraday charts keep their native cadence — same data the grid tile shows.
 *  This is why a maximized intraday chart no longer falls back to daily candles. */
function historyCandlesForTimeframe(
  timeframe: string | null | undefined,
  bars: Array<{ time: string | null; open: number | null; high: number | null; low: number | null; close: number | null }>,
): MonitoringCandle[] {
  return isIntradayTimeframe(timeframe) ? toIntradayMonitoringCandles(bars) : normalizeMonitoringCandles(bars);
}

function ohlcEquals(
  left: { open: number | null; high: number | null; low: number | null; close: number | null } | null,
  right: { open: number | null; high: number | null; low: number | null; close: number | null } | null,
): boolean {
  if (!left || !right) return false;
  return left.open === right.open && left.high === right.high && left.low === right.low && left.close === right.close;
}

function enforceTrendEngineDefaultOff(payload: MonitoringPayload): MonitoringPayload {
  const params = payload.metadata.params;
  if (!params?.length) return payload;

  let changed = false;
  const nextParams = params.map((param) => {
    const key = String(param.key || "").trim().toLowerCase();
    const label = String(param.label || "").trim().toLowerCase();
    const isTrendEngineToggle = key === "usetrendengine" || label === "use trend engine";
    if (!isTrendEngineToggle) return param;
    if (param.type === "bool") {
      if (param.value === true || param.value === false) return param;
      changed = true;
      return { ...param, value: false };
    }
    const raw = String(param.value ?? "").trim().toLowerCase();
    const explicitTrue = raw === "true" || raw === "1" || raw === "an" || raw === "on" || raw === "yes";
    changed = true;
    return { ...param, type: "bool" as const, value: explicitTrue ? true : false };
  });

  if (!changed) return payload;
  return {
    ...payload,
    metadata: {
      ...payload.metadata,
      params: nextParams,
    },
  };
}

function normalizeTimeseriesBars(response: TimeseriesResponse): MonitoringPayload["bars"] {
  return (response.ohlcv ?? [])
    .map((row) => ({
      time: normalizeDailyTime(row?.t) ?? null,
      open: toFinite(row?.open),
      high: toFinite(row?.high),
      low: toFinite(row?.low),
      close: toFinite(row?.close),
    }))
    .filter((bar) => !!bar.time && bar.open != null && bar.high != null && bar.low != null && bar.close != null);
}

function normalizeSnapshotBars(snapshotAsset: AgrarSnapshotAsset | null): MonitoringPayload["bars"] {
  if (!snapshotAsset) return [];
  return snapshotAsset.ohlc
    .map((row) => ({
      time: normalizeDailyTime(row.date) || null,
      open: toFinite(row.open),
      high: toFinite(row.high),
      low: toFinite(row.low),
      close: toFinite(row.close),
    }))
    .filter((bar) => !!bar.time && bar.open != null && bar.high != null && bar.low != null && bar.close != null);
}

function mergeBarsIncremental(existingBars: MonitoringPayload["bars"], incomingBars: MonitoringPayload["bars"]): MonitoringPayload["bars"] {
  const mergedByTime = new Map<string, MonitoringPayload["bars"][number]>();
  for (const bar of existingBars) {
    const day = normalizeDailyTime(bar.time);
    if (!day) continue;
    mergedByTime.set(day, { ...bar, time: day });
  }
  for (const bar of incomingBars) {
    const day = normalizeDailyTime(bar.time);
    if (!day) continue;
    mergedByTime.set(day, { ...bar, time: day });
  }

  return Array.from(mergedByTime.values())
    .sort((left, right) => String(left.time).localeCompare(String(right.time)))
    .slice(-120);
}

function barsUnchanged(left: MonitoringPayload["bars"], right: MonitoringPayload["bars"]): boolean {
  if (left.length !== right.length) return false;
  if (!left.length && !right.length) return true;
  const l = left[left.length - 1];
  const r = right[right.length - 1];
  if (normalizeDailyTime(l?.time) !== normalizeDailyTime(r?.time)) return false;
  return l?.open === r?.open && l?.high === r?.high && l?.low === r?.low && l?.close === r?.close;
}

function applyAgrarSnapshotPriorityBars(
  existingBars: MonitoringPayload["bars"],
  apiBars: MonitoringPayload["bars"],
  snapshotAsset: AgrarSnapshotAsset | null,
): MonitoringPayload["bars"] {
  const withApi = apiBars.length ? mergeBarsIncremental(existingBars, apiBars) : existingBars;
  if (!snapshotAsset?.latest) return withApi;
  const historicalBars = withApi
    .map((bar) => ({
      time: normalizeDailyTime(bar.time) ?? "",
      open: toFinite(bar.open),
      high: toFinite(bar.high),
      low: toFinite(bar.low),
      close: toFinite(bar.close),
    }))
    .filter(
      (bar): bar is { time: string; open: number; high: number; low: number; close: number } =>
        Boolean(bar.time) && bar.open != null && bar.high != null && bar.low != null && bar.close != null,
    );
  if (!historicalBars.length) return withApi;

  const merged = mergeLiveSnapshot({
    historicalBars,
    liveSnapshotAsset: {
      name: snapshotAsset.name,
      symbol: snapshotAsset.symbol,
      source: snapshotAsset.source,
      mergeMode: snapshotAsset.mergeMode,
      date: snapshotAsset.latest.date,
      open: snapshotAsset.latest.open,
      high: snapshotAsset.latest.high,
      low: snapshotAsset.latest.low,
      close: snapshotAsset.latest.close,
      volume: snapshotAsset.latest.volume ?? null,
    },
  });

  return merged.bars.map((bar) => ({
    time: bar.time,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
  }));
}

function extendSignalsForLive(
  baseSignals: MonitoringPayload["signals"],
  mergedBars: MonitoringPayload["bars"],
): MonitoringPayload["signals"] {
  if (!baseSignals.length || !mergedBars.length) return baseSignals;
  const ordered = [...baseSignals].sort((left, right) => String(left.time || "").localeCompare(String(right.time || "")));
  const lastSignal = ordered[ordered.length - 1];
  const currentPos = Number(lastSignal?.position ?? 0);
  if (!Number.isFinite(currentPos) || currentPos === 0) return ordered;

  const lastSignalDay = toIsoDay(lastSignal?.time ?? null);
  if (!lastSignalDay) return ordered;
  const entryPrice = toFinite(lastSignal.entry_price);
  if (entryPrice == null || entryPrice <= 0) return ordered;

  const sl = currentPos > 0
    ? toFinite(lastSignal.long_sl_final ?? lastSignal.entry_sl)
    : toFinite(lastSignal.short_sl_final ?? lastSignal.entry_sl);
  const tp = currentPos > 0
    ? toFinite(lastSignal.long_tp_final ?? lastSignal.entry_tp)
    : toFinite(lastSignal.short_tp_final ?? lastSignal.entry_tp);

  const knownDays = new Set(ordered.map((signal) => toIsoDay(signal.time ?? null)).filter(Boolean) as string[]);
  const append: MonitoringPayload["signals"] = [];

  for (const bar of mergedBars) {
    const day = toIsoDay(bar.time);
    if (!day) continue;
    if (day <= lastSignalDay) continue;
    if (knownDays.has(day)) continue;
    knownDays.add(day);
    append.push({
      time: bar.time,
      long_entry: false,
      short_entry: false,
      long_exit: false,
      short_exit: false,
      close: bar.close,
      entry_price: entryPrice,
      entry_sl: sl,
      entry_tp: tp,
      long_sl_final: currentPos > 0 ? sl : null,
      short_sl_final: currentPos < 0 ? sl : null,
      long_tp_final: currentPos > 0 ? tp : null,
      short_tp_final: currentPos < 0 ? tp : null,
      be_active: false,
      position: currentPos,
      position_size: lastSignal.position_size ?? null,
      signal_text: "",
    });
  }

  if (!append.length) return ordered;
  return [...ordered, ...append].slice(-120);
}

function liveStateFromPayload(asset: AgrarAssetConfig, payload: MonitoringPayload | null): AgrarLiveState {
  const lastBar = payload?.bars?.[payload.bars.length - 1] ?? null;
  const signals = payload?.signals ?? [];
  const lastSignal = signals.length ? signals[signals.length - 1] : null;
  const position = Number(lastSignal?.position ?? 0);
  const positionDirection = Number.isFinite(position) && position !== 0 ? (position > 0 ? "long" : "short") : null;
  const entryPrice = toFinite(lastSignal?.entry_price);
  const stopLoss = positionDirection === "long"
    ? toFinite(lastSignal?.long_sl_final ?? lastSignal?.entry_sl)
    : positionDirection === "short"
      ? toFinite(lastSignal?.short_sl_final ?? lastSignal?.entry_sl)
      : null;
  const takeProfit = positionDirection === "long"
    ? toFinite(lastSignal?.long_tp_final ?? lastSignal?.entry_tp)
    : positionDirection === "short"
      ? toFinite(lastSignal?.short_tp_final ?? lastSignal?.entry_tp)
      : null;
  const tradeStatus: AgrarLiveState["tradeStatus"] = positionDirection ? "open" : (signals.length ? "closed" : "none");

  return {
    symbol: asset.code,
    short: asset.short,
    displayName: asset.name,
    source: asset.source,
    latestTimestamp: lastBar?.time ?? null,
    open: toFinite(lastBar?.open),
    high: toFinite(lastBar?.high),
    low: toFinite(lastBar?.low),
    close: toFinite(lastBar?.close),
    volume: null,
    tradeStatus,
    positionDirection,
    entryPrice,
    stopLoss,
    takeProfit,
    openTrade: Boolean(positionDirection),
    sourceUsed: null,
    updatedAt: null,
  };
}

function applyAgrarSnapshotToPayloads(
  payloadByFile: Record<string, MonitoringPayload>,
  snapshot: AgrarLiveSnapshot | null,
): Record<string, MonitoringPayload> {
  if (!snapshot) return payloadByFile;
  let changed = false;
  const next = { ...payloadByFile };

  for (const asset of ORDERED_ASSETS) {
    const existingRaw = next[asset.file];
    const existing = existingRaw ? enforceTrendEngineDefaultOff(existingRaw) : null;
    if (existing && existing !== existingRaw) {
      changed = true;
      next[asset.file] = existing;
    }
    if (!existing) continue;
    const snapshotAsset = findAgrarSnapshotAsset(snapshot, asset.code, asset.source);
    const mergedBars = applyAgrarSnapshotPriorityBars(existing.bars ?? [], [], snapshotAsset);
    if (barsUnchanged(existing.bars ?? [], mergedBars)) continue;
    changed = true;
    next[asset.file] = {
      ...existing,
      bars: mergedBars,
    };
  }

  return changed ? next : payloadByFile;
}

async function loadAgrarSnapshotWithTimeout(signal: AbortSignal, timeoutMs = 2500): Promise<AgrarLiveSnapshot | null> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(null), timeoutMs);
    const unregisterTimeout = registerMonitoringTimeout(timer);
    loadAgrarLiveSnapshot(signal)
      .then((snapshot) => resolve(isAgrarLiveSnapshotFresh(snapshot) ? snapshot : null))
      .catch(() => resolve(null))
      .finally(() => {
        unregisterTimeout();
        window.clearTimeout(timer);
      });
  });
}

function getBadge(payload: MonitoringPayload | null): string {
  if (!payload) return "DATA WARN";
  const raw = String(payload.metadata.badge ?? "").trim();
  return raw || "OK";
}

function hasStrategy(payload: MonitoringPayload | null, badge: string): boolean {
  if (!payload) return false;
  const symbol = String(payload.metadata.code ?? payload.metadata.tvSymbol ?? "").trim().toUpperCase();
  if (symbol === "SB1!" || symbol === "CT1!") return false;
  if (
    badge === "NO STRAT"
    || badge === "MISSING MAP"
    || badge === "DATA MISMATCH"
    || badge === "CANDLE SOURCE MISMATCH"
    || badge === "CANDLE SOURCE FAIL"
    || badge === "PARAMETER FAIL"
    || badge === "CHART ONLY"
  ) return false;
  // PARITY FAIL: badge visible but signals still shown if engine has data
  return payload.metadata.hasStrategy ?? true;
}

function candleScaleAuditKey(source: string | null | undefined, timeframe: string | null | undefined): string {
  return `${normalizeSourceKey(source)}|${normalizeIntradayTf(timeframe)}`;
}

function applyCandleScaleMismatchBadge(
  payload: MonitoringPayload | null,
  source: string | null | undefined,
  timeframe: string | null | undefined,
  candleScaleAuditMap: Record<string, CandlePriceScaleAuditRow>,
): MonitoringPayload | null {
  if (!payload) return null;
  const row = candleScaleAuditMap[candleScaleAuditKey(source, timeframe)] ?? null;
  const status = String(row?.status || "").toLowerCase();
  const isChartOnly = status === "chart_only";
  const mismatch = status === "fail" || status === "missing_parity_candle_source";
  if (!isChartOnly && !mismatch) return payload;
  const hint = isChartOnly ? "chart_only" : "candle_source_mismatch";
  const nextHints = Array.from(new Set([...(payload.metadata.hints ?? []), hint]));
  return {
    ...payload,
    metadata: {
      ...payload.metadata,
      badge: isChartOnly ? "CHART ONLY" : "CANDLE SOURCE FAIL",
      hasStrategy: false,
      hints: nextHints,
    },
  };
}

function applyAgrarParityBadge(
  payload: MonitoringPayload | null,
  source: string | null | undefined,
  timeframe: string | null | undefined,
  agrarParityAuditMap: Record<string, AgrarParityAuditRow>,
): MonitoringPayload | null {
  if (!payload) return null;
  const row = agrarParityAuditMap[candleScaleAuditKey(source, timeframe)] ?? null;
  if (!row) return payload;
  const toPct = (value: unknown): number | null => {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };
  const fmtPct = (value: number | null): string => (value === null ? "n/a" : `${value.toFixed(1)}%`);
  const normalizeText = (value: unknown): string => String(value ?? "").trim();
  const liveStatusRaw = normalizeText(row?.liveOpenTradeParity?.status);
  const liveMatch = row?.liveOpenTradeParity?.match;
  const recentPct = toPct(row?.recentParity2025_2026?.parityPercent);
  const overlapPct = toPct(row?.overlapParityPercent ?? row?.parityPercent);
  const csvPct = toPct(row?.parityPercent ?? row?.overlapParityPercent);
  const badgeStatus = normalizeText(row?.badgeStatus).toUpperCase();
  const candleStatus = normalizeText(row?.candleStatus).toLowerCase();
  const mainReason = normalizeText(row?.mainRemainingIssue || row?.mainFailureReason || row?.badgeStatus || row?.parityStatus || "none");

  const liveIsPass = liveMatch === true || /pass|match/.test(liveStatusRaw.toLowerCase());
  const liveIsFail = liveMatch === false || /fail|mismatch|missing/.test(liveStatusRaw.toLowerCase());
  const liveStatusText = liveStatusRaw ? liveStatusRaw.replace(/_/g, " ") : (liveMatch === true ? "match" : liveMatch === false ? "mismatch" : "unknown");
  const isDataWarn = badgeStatus === "DATA_APPROX" || badgeStatus === "DATA_STALE" || candleStatus === "approx" || candleStatus === "stale" || /stale|approx/.test(mainReason.toLowerCase());

  let derivedBadge: string;
  let hint: string;
  if (isDataWarn) {
    derivedBadge = "DATA WARN";
    hint = "data_warn";
  } else if (liveIsPass) {
    derivedBadge = "LIVE PASS";
    hint = "live_pass";
  } else if (liveIsFail) {
    derivedBadge = "PARITY FAIL";
    hint = "parity_fail";
  } else if (recentPct !== null) {
    if (recentPct >= 75) {
      derivedBadge = "RECENT PASS";
      hint = "recent_pass";
    } else if (recentPct >= 45) {
      derivedBadge = "RECENT WARN";
      hint = "recent_warn";
    } else {
      derivedBadge = "PARITY FAIL";
      hint = "parity_fail";
    }
  } else if (overlapPct !== null) {
    if (overlapPct >= 45) {
      derivedBadge = "OVERLAP WARN";
      hint = "overlap_warn";
    } else {
      derivedBadge = "PARITY FAIL";
      hint = "parity_fail";
    }
  } else if (badgeStatus === "OVERLAP_WARN" || badgeStatus === "PARITY_WARN") {
    derivedBadge = "OVERLAP WARN";
    hint = "overlap_warn";
  } else {
    derivedBadge = "PARITY FAIL";
    hint = "parity_fail";
  }

  const badgeTooltip = [
    `CSV Match: ${fmtPct(csvPct)}`,
    `Recent Match (2025/2026): ${fmtPct(recentPct)}`,
    `Live/Open Trade: ${liveStatusText}`,
    `Hauptgrund: ${mainReason}`,
  ].join("\n");

  const nextHints = Array.from(new Set([...(payload.metadata.hints ?? []), hint]));
  return {
    ...payload,
    metadata: {
      ...payload.metadata,
      badge: derivedBadge,
      badgeTooltip,
      hasStrategy: true,
      hints: nextHints,
    },
  };
}

const AgrarGrid = memo(function AgrarGrid({
  items,
  selectedAssetId,
  onChartSelect,
  onIndicatorOpen,
  onOpenFullscreen,
  isTradeExecutionOpen,
  tradeMode,
  manualLevelsBySymbol,
  onManualLevelsChange,
  missingBuild,
  loadStateBySymbol,
  strategyEventsByFile,
  tradingViewTradesBySource,
  selectedTradeId,
  agriAvailableKindsBySymbol,
  agriActiveKindsBySymbol,
  onAgriKindToggle,
}: {
  items: ChartItem[];
  selectedAssetId: string | null;
  onChartSelect: (item: ChartItem) => void;
  onIndicatorOpen: (item: ChartItem) => void;
  onOpenFullscreen?: (item: ChartItem) => void;
  isTradeExecutionOpen: boolean;
  tradeMode: TradeMode;
  manualLevelsBySymbol: Record<string, ManualTradeLevels>;
  onManualLevelsChange: (symbol: string, levels: ManualTradeLevels) => void;
  missingBuild: boolean;
  loadStateBySymbol: Record<string, AgrarCardLoadState>;
  strategyEventsByFile: Record<string, StrategyEventsPayload>;
  tradingViewTradesBySource: TradingViewTradesBySource;
  selectedTradeId: string | null;
  agriAvailableKindsBySymbol?: Record<string, { valuation: boolean; seasonal: boolean; macro: boolean }>;
  agriActiveKindsBySymbol?: Record<string, import("@/lib/agri/agri-v2-registry").AgriStrategyKind[]>;
  onAgriKindToggle?: (symbol: string, kind: import("@/lib/agri/agri-v2-registry").AgriStrategyKind) => void;
}) {
  return (
    <div className="agrarGrid monitoring-grid">
      {Array.from({ length: ORDERED_ASSETS.length }).map((_, i) => {
        const item = items[i] ?? null;
        const isActive = !!item && selectedAssetId === item.key;
        return (
          <MonitoringChartCard
            key={`agrar-${i}`}
            item={item as MonitoringChartCardItem | null}
            isActive={isActive}
            variant="large"
            missingBuild={missingBuild}
            loadStatus={item ? (loadStateBySymbol[item.code]?.status ?? "loading") : "no_data"}
            strategyEventsByFile={strategyEventsByFile}
            tradingViewTradesBySource={tradingViewTradesBySource}
            onCardClick={() => {
              if (!item) return;
              onChartSelect(item);
            }}
            onIndicatorClick={() => {
              if (!item) return;
              onIndicatorOpen(item);
            }}
            onOpenFullscreen={() => {
              if (!item) return;
              onOpenFullscreen?.(item);
            }}
            showManualLevels={Boolean(item && isTradeExecutionOpen && tradeMode === "manual" && selectedAssetId === item.key)}
            manualLevels={item ? (manualLevelsBySymbol[item.code] ?? null) : null}
            onManualLevelsChange={(levels) => {
              if (!item) return;
              onManualLevelsChange(item.code, levels);
            }}
            selectedTradeId={isActive ? selectedTradeId : null}
            agriAvailableKinds={item ? agriAvailableKindsBySymbol?.[item.code] : undefined}
            agriActiveKinds={item ? (agriActiveKindsBySymbol?.[item.code] ?? []) : []}
            onAgriKindToggle={item && onAgriKindToggle ? (kind) => onAgriKindToggle(item.code, kind) : undefined}
          />
        );
      })}
    </div>
  );
});

const CompactGrid = memo(function CompactGrid({
  items,
  selectedAssetId,
  onChartSelect,
  onOpenFullscreen,
  loadStateBySymbol,
  strategyEventsByFile,
  tradingViewTradesBySource,
  selectedTradeId,
  uiPrefs,
}: {
  items: ChartItem[];
  selectedAssetId: string | null;
  onChartSelect: (item: ChartItem) => void;
  onOpenFullscreen?: (item: ChartItem) => void;
  loadStateBySymbol: Record<string, AgrarCardLoadState>;
  strategyEventsByFile: Record<string, StrategyEventsPayload>;
  tradingViewTradesBySource: TradingViewTradesBySource;
  selectedTradeId: string | null;
  uiPrefs: MonitoringUiPrefs;
}) {
  return (
    <section className="section-compact">
      <div className="grid-compact-scroll">
        <div className="grid-compact">
          {items.map((item) => (
            <MonitoringChartCard
              key={item.key}
              item={item as MonitoringChartCardItem}
              isActive={selectedAssetId === item.key}
              variant="compact"
              missingBuild={false}
              loadStatus={loadStateBySymbol[item.code]?.status ?? "loading"}
              strategyEventsByFile={strategyEventsByFile}
              tradingViewTradesBySource={tradingViewTradesBySource}
              onCardClick={() => onChartSelect(item)}
              onIndicatorClick={() => undefined}
              onOpenFullscreen={onOpenFullscreen ? () => onOpenFullscreen(item) : undefined}
              selectedTradeId={selectedAssetId === item.key ? selectedTradeId : null}
              uiPrefs={uiPrefs}
            />
          ))}
        </div>
      </div>
    </section>
  );
});

export default function MonitoringPage({ initialAgriFinalStatus = null }: MonitoringPageProps) {
  const isEnabledFlag = (value: unknown): boolean => value === true || value === "lazy";
  const basicCandleChartsEnabled = monitoringFeatureFlags.enableBasicCandleCharts;
  const strategyTesterEnabled = isEnabledFlag(monitoringFeatureFlags.enableStrategyTester);
  const tradeExecutionEnabled = isEnabledFlag(monitoringFeatureFlags.enableTradeExecution);
  const fullscreenEnabled = isEnabledFlag(monitoringFeatureFlags.enableFullscreenChart);
  const allTabsEnabled = monitoringFeatureFlags.enableAllTabsBuild;
  const allStrategiesGridEnabled = isEnabledFlag(monitoringFeatureFlags.enableAllStrategiesGrid);
  const intradayMTEnabled = isEnabledFlag(monitoringFeatureFlags.enableIntradayMT);
  const liveSnapshotMergeEnabled = monitoringFeatureFlags.enableLiveSnapshotMerge;
  const liveSnapshotPollingEnabled = monitoringFeatureFlags.enableLiveSnapshotPolling && monitoringFeatureFlags.enableRealtimePolling;
  const fullHistoryInGridEnabled = monitoringFeatureFlags.enableFullHistoryInGrid;
  const debugRenderingEnabled = monitoringFeatureFlags.enableDebugRendering;
  const customOrangeJuiceEnginePilotEnabled = monitoringFeatureFlags.useCustomOrangeJuiceEnginePilot;
  const customEs1EnginePilotEnabled = monitoringFeatureFlags.useCustomEs1EnginePilot;
  const customPa1EnginePilotEnabled = monitoringFeatureFlags.useCustomPa1EnginePilot;
  const customPl1EnginePilotEnabled = monitoringFeatureFlags.useCustomPl1EnginePilot;
  const ALL_TAB_IDS: TabId[] = ["agrar", "metalle_energie", "indizes", "aktien", "invest", "fx", "anomaly", "intraday_mt", "live", "all"];
  const [activeTab, setActiveTab] = useState<TabId>("agrar");
  const setActiveTabPersisted = useCallback((tab: TabId) => {
    try {
      window.localStorage.setItem("monitoring_active_tab", tab);
    } catch { /* ignore */ }
    setActiveTab(tab);
  }, []);
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("monitoring_active_tab");
      const normalized = (stored === "indices" ? "indizes" : stored === "intraday" ? "intraday_mt" : stored) as TabId;
      if (ALL_TAB_IDS.includes(normalized)) {
        setActiveTab(normalized);
      }
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Agrar v2.0: V/S/M strategy kind selection per asset (localStorage-persisted)
  const { getActiveKinds: getAgriActiveKinds, toggleKind: toggleAgriKind } = useAgriStrategySelection();
  const agriAvailableKindsBySymbol = useMemo(() => {
    const map: Record<string, { valuation: boolean; seasonal: boolean; macro: boolean }> = {};
    for (const asset of getAllAgriAssets()) {
      map[asset.symbol] = getAgriKindsForAsset(asset.symbol);
    }
    return map;
  }, []);
  const agriActiveKindsBySymbol = useMemo(() => {
    const map: Record<string, import("@/lib/agri/agri-v2-registry").AgriStrategyKind[]> = {};
    for (const asset of getAllAgriAssets()) {
      map[asset.symbol] = getAgriActiveKinds(asset.symbol, getAgriKindsForAsset(asset.symbol));
    }
    return map;
  // Re-derive when active kinds change (getAgriActiveKinds is stable, selection triggers re-render)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getAgriActiveKinds]);

  // Mirror of activeTab for stable callbacks (refresh handler has [] deps).
  const activeTabRef = useRef<TabId>(activeTab);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);
  // The "live" tab is a filtered view on the "all" data: it reuses the exact same data
  // loading + item building, then renders only the signal charts (open/fresh/recent-closed).
  const isAllOrLive = activeTab === "all" || activeTab === "live";
  const [universeAssets, setUniverseAssets] = useState<UniverseAssetItem[]>([]);
  const [productionUniverseAssets, setProductionUniverseAssets] = useState<UniverseAssetItem[]>([]);
  const [productionUniverseLoading, setProductionUniverseLoading] = useState(false);
  const [productionUniverseError, setProductionUniverseError] = useState<string | null>(null);
  const [payloads, setPayloads] = useState<Record<string, MonitoringPayload>>({});
  const [wave1Groups, setWave1Groups] = useState<Wave1DesktopState>({
    agrar: null,
    intraday: null,
    indices: null,
  });
  const [agrarLoadStateBySymbol, setAgrarLoadStateBySymbol] = useState<Record<string, AgrarCardLoadState>>({});
  const [strategyEventsByFile, setStrategyEventsByFile] = useState<Record<string, StrategyEventsPayload>>({});
  const [strategyRuntimeRoutes, setStrategyRuntimeRoutes] = useState<StrategyRuntimeRouteRow[]>([]);
  const [tradingViewTradesBySource, setTradingViewTradesBySource] = useState<TradingViewTradesBySource>({});
  const [liveStatePayload, setLiveStatePayload] = useState<MonitoringLiveStatePayload | null>(null);
  const [manualVerifiedPayload, setManualVerifiedPayload] = useState<ManualVerifiedPayload | null>(null);
  const [engineStateIndexPayload, setEngineStateIndexPayload] = useState<MonitoringEngineStateIndexPayload | null>(null);
  const [candleScaleAuditMap, setCandleScaleAuditMap] = useState<Record<string, CandlePriceScaleAuditRow>>({});
  const [agrarParityAuditMap, setAgrarParityAuditMap] = useState<Record<string, AgrarParityAuditRow>>({});
  const [agriFinalStatus, setAgriFinalStatus] = useState<AgriFinalStatusResponse | null>(initialAgriFinalStatus);
  const [agriEngineResultsBySymbol, setAgriEngineResultsBySymbol] = useState<Record<string, MonitoringStrategyTestResult>>({});
  const [agrarLiveState, setAgrarLiveState] = useState<Record<string, AgrarLiveState>>({});
  const [agrarDataMismatch, setAgrarDataMismatch] = useState<Record<string, boolean>>({});
  const [missingBuild, setMissingBuild] = useState(false);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [selectedStrategySymbols, setSelectedStrategySymbols] = useState<string[]>([]);
  const [strategyMultiSelectArmed, setStrategyMultiSelectArmed] = useState(false);
  const [isInputPanelOpen, setIsInputPanelOpen] = useState(false);
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const [liveSignalsOpen, setLiveSignalsOpen] = useState<boolean>(false);
  useEffect(() => {
    try { window.localStorage.setItem("monitoring_live_panel_open", liveSignalsOpen ? "1" : "0"); } catch { /* ignore */ }
  }, [liveSignalsOpen]);
  const [sentinelOpen, setSentinelOpen] = useState<boolean>(false);
  useEffect(() => {
    try { window.localStorage.setItem("monitoring_sentinel_panel_open", sentinelOpen ? "1" : "0"); } catch { /* ignore */ }
  }, [sentinelOpen]);
  // Persisted, resizable width of the Live-signal column (px). SSR-safe default; the
  // stored value is loaded (and clamped) on mount so it survives reload/refresh/tab switch.
  const [livePanelWidth, setLivePanelWidth] = useState<number>(LIVE_PANEL_WIDTH_DEFAULT);
  const [liveChartAutoView, setLiveChartAutoView] = useState<boolean>(true);
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("monitoring_liveChartAutoView");
      if (stored === "true") setLiveChartAutoView(true);
      if (stored === "false") setLiveChartAutoView(false);
    } catch { /* ignore */ }
  }, []);
  const [executionFocusTradeId, setExecutionFocusTradeId] = useState<string | null>(null);
  const [tradeMode, setTradeMode] = useState<TradeMode>("signal");
  const [manualLevelsBySymbol, setManualLevelsBySymbol] = useState<Record<string, ManualTradeLevels>>({});
  const [fullscreenAssetId, setFullscreenAssetId] = useState<string | null>(null);
  type MonitoringRightPanelMode = null | "strategy_tester";
  const [rightPanelMode, setRightPanelMode] = useState<MonitoringRightPanelMode>(null);
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("monitoring_right_panel_mode");
      if (stored === "strategy_tester") setRightPanelMode("strategy_tester");
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    try { window.localStorage.setItem("monitoring_right_panel_mode", rightPanelMode ?? ""); } catch { /* ignore */ }
  }, [rightPanelMode]);
  const strategyTesterOpen = rightPanelMode === "strategy_tester";
  const [fullHistoryBySymbol, setFullHistoryBySymbol] = useState<Record<string, MonitoringCandle[]>>({});
  const [fullHistoryLoading, setFullHistoryLoading] = useState(false);
  const [draftParams, setDraftParams] = useState<Record<string, Record<string, any>>>({});
  const [showStrategyTesterPaused, setShowStrategyTesterPaused] = useState(false);
  const [showTradeExecutionPaused, setShowTradeExecutionPaused] = useState(false);
  const [strategyTesterDataMode, setStrategyTesterDataMode] = useState<StrategyTesterDataMode>("engine");
  const [csvReferenceTradesBySource, setCsvReferenceTradesBySource] = useState<Record<string, StrategyEventsPayload["trades"]>>({});
  const [customEnginePayload, setCustomEnginePayload] = useState<CustomEngineTradesResponse | null>(null);
  const [strategyTesterConfig, setStrategyTesterConfig] = useState<StrategyTesterRuntimeConfig>({
    equityMode: "base_balance",
    compounding: false,
    timeRangeFrom: null,
  });
  const strategyUseCompounding = Boolean(strategyTesterConfig.compounding);
  const strategyTimeRangeFrom = strategyTesterConfig.timeRangeFrom ?? null;
  const [strategyPerfLoading, setStrategyPerfLoading] = useState(false);
  const [activePerformance, setActivePerformance] = useState<StrategyPerformanceResult | null>(null);

  // ── Core Invest Tester state ────────────────────────────────────────────────
  const [investSelectedStrategyId, setInvestSelectedStrategyIdRaw] = useState<string>("QQQ_PINE_1");
  const setInvestSelectedStrategyId = useCallback((id: string) => {
    try { window.localStorage.setItem("monitoring_invest_strategy_id", id); } catch { /* ignore */ }
    setInvestSelectedStrategyIdRaw(id);
    setSelectedStrategySymbols([id]);
  }, []);
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("monitoring_invest_strategy_id");
      if (stored && isInvestStrategyId(stored)) setInvestSelectedStrategyIdRaw(stored);
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [parityDebugWarning, setParityDebugWarning] = useState<string | null>(null);
  const [cacheManifestStamp, setCacheManifestStamp] = useState<string>("");
  const [monitoringBootstrapReady, setMonitoringBootstrapReady] = useState(false);
  const cacheManifestStampRef = useRef<string>("");
  // Generation counter for the intraday/non-agrar load effect. Each time the effect
  // re-fires (e.g. when strategyRuntimeRoutes resolves asynchronously), we increment
  // this counter. Before writing state we verify the counter still matches — if it
  // doesn't, a newer load already ran and we silently discard this stale result.
  const intradayLoadGenerationRef = useRef(0);
  const [manifestGeneratedAt, setManifestGeneratedAt] = useState<string | null>(null);
  const [uiPrefs, setUiPrefs] = useState<MonitoringUiPrefs>(DEFAULT_MONITORING_UI_PREFS);
  const [uiPrefsOpen, setUiPrefsOpen] = useState(false);
  // Refs for direct DOM drag — no React re-renders during drag, committed on mouseup
  const mainWorkspaceRef = useRef<HTMLDivElement | null>(null);
  const execLayoutRef = useRef<HTMLDivElement | null>(null);

  // ── Forward Logger ──────────────────────────────────────────────────────────
  type FwdTrade = Record<string, string> & { lastClose?: number | null; lastCloseDate?: string | null; unrealizedPct?: number | null };
  type ForwardLoggerData = { available: boolean; asOf?: string; openTrades?: FwdTrade[]; activeSignals?: FwdTrade[]; recentClosed?: FwdTrade[]; counts?: { open: number; activeSignals: number; recentClosed: number } };
  const [forwardLogger, setForwardLogger] = useState<ForwardLoggerData | null>(null);
  useEffect(() => {
    if (activeTab !== "live") return;
    fetch("/api/monitoring/forward-logger")
      .then((r) => r.json())
      .then((d: ForwardLoggerData) => setForwardLogger(d))
      .catch(() => setForwardLogger({ available: false }));
  }, [activeTab]);

  // Load persisted live-panel width once on mount (clamped to the current viewport).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(LIVE_PANEL_WIDTH_KEY);
      const parsed = raw != null ? Number.parseFloat(raw) : NaN;
      if (Number.isFinite(parsed)) setLivePanelWidth(clampLivePanelWidth(parsed));
    } catch { /* ignore */ }
  }, []);

  // Re-clamp on window resize so the column never overlaps the chart grid on small screens.
  useEffect(() => {
    const onResize = () => setLivePanelWidth((w) => clampLivePanelWidth(w));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Drag the left-edge handle: dragging left widens, dragging right narrows. The width is
  // persisted on release; refresh/auto-update/tab-switch never reset it (it is React state).
  const onLivePanelResizeStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const layout = execLayoutRef.current;
    const rightEdge = layout ? layout.getBoundingClientRect().right : window.innerWidth;
    const startX = e.clientX;
    let next = clampLivePanelWidth(rightEdge - startX);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    const onMove = (ev: PointerEvent) => {
      next = clampLivePanelWidth(rightEdge - ev.clientX);
      setLivePanelWidth(next);
    };
    const onUp = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      try { window.localStorage.setItem(LIVE_PANEL_WIDTH_KEY, String(next)); } catch { /* ignore */ }
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }, []);
  const inputPanelRef = useRef<HTMLElement | null>(null);
  const [manifestStaleCount, setManifestStaleCount] = useState<number>(0);
  const [refreshStatus, setRefreshStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const isRefreshingRef = useRef(false);
  const lastCompletedRefreshAtRef = useRef<number>(0);
  const isTradeExecutionOpen = activePanel === "tradeExecution";
  const isFullscreen = fullscreenAssetId !== null;
  const liveSignalsPanelEnabled = liveSignalsOpen;
  const sentinelPanelEnabled = sentinelOpen;
  // Right side column shows when Live and/or Sentinel is open. When both are open the
  // column is split vertically (Live on top, Sentinel below).
  const rightColumnEnabled = liveSignalsPanelEnabled || sentinelPanelEnabled;
  // When the column is narrower than default, scale the cards (and their content) down
  // proportionally; never above 1 (wider just widens the cards, content stays put).
  const liveCardScale = Math.min(1, Math.max(0.72, livePanelWidth / LIVE_PANEL_WIDTH_DEFAULT));
  // When the Live/Sentinel column is open, the Trade-Ausführen / account-risk column is hidden.
  const tradeExecutionPanelEnabled = isTradeExecutionOpen && tradeExecutionEnabled && !liveSignalsOpen && !sentinelOpen;
  const showGrid = fullscreenAssetId === null;
  const showStrategyTester = strategyTesterOpen;
  const showStrategyTesterWorkspace = strategyTesterOpen && strategyTesterEnabled && !tradeExecutionPanelEnabled;
  const useUnifiedAgrarStrategyWorkspace = activeTab === "agrar" && showStrategyTesterWorkspace;
  const useUnifiedIntradayWorkspace = activeTab === "intraday_mt" && showStrategyTesterWorkspace;
  // Indizes reuses the exact same MonitoringStrategyWorkspace as Agrar (same macro_valuation
  // engine, same Inputs/KPI/Equity/Drawdown/Trade UI). No intradayEventsUrl, so it takes the
  // Agrar code path (XLSX inputs + engine run), not the events-url path.
  const useUnifiedIndicesWorkspace = activeTab === "indizes" && showStrategyTesterWorkspace;
  const useUnifiedInvestWorkspace = activeTab === "invest" && showStrategyTesterWorkspace;
  const useUnifiedAnomalyWorkspace = activeTab === "anomaly" && showStrategyTesterWorkspace;
  const useUnifiedNonAgrarWorkspace = useUnifiedIntradayWorkspace || useUnifiedIndicesWorkspace || useUnifiedInvestWorkspace || useUnifiedAnomalyWorkspace;
  const intradayEventsUrl = useMemo(() => {
    if (!useUnifiedIntradayWorkspace) return undefined;
    const sym = selectedStrategySymbols[0] ?? null;
    if (!sym) return undefined;
    const hasConfig = INTRADAY_MT_ASSETS.some((a) => a.displaySymbol === sym);
    if (!hasConfig) return undefined;
    return `/api/monitoring/strategy-tester/run-intraday?symbol=${encodeURIComponent(sym)}`;
  }, [useUnifiedIntradayWorkspace, selectedStrategySymbols]);

  // Indizes feeds the same workspace via its own events adapter (agri engine is agri-only).
  const indicesEventsUrl = useMemo(() => {
    if (!useUnifiedIndicesWorkspace) return undefined;
    const sym = selectedStrategySymbols[0] ?? null;
    if (!sym || !MONITORING_INDICES_SYMBOLS.has(sym)) return undefined;
    return `/api/monitoring/strategy-tester/run-indices?symbol=${encodeURIComponent(sym)}`;
  }, [useUnifiedIndicesWorkspace, selectedStrategySymbols]);

  const investEventsUrl = useMemo(() => {
    if (!useUnifiedInvestWorkspace) return undefined;
    const sym = selectedStrategySymbols[0] ?? investSelectedStrategyId;
    if (!sym || !isInvestStrategyId(sym)) return undefined;
    return `/api/monitoring/strategy-tester/run-invest?symbol=${encodeURIComponent(sym)}`;
  }, [investSelectedStrategyId, selectedStrategySymbols, useUnifiedInvestWorkspace]);

  const anomalyEventsUrl = useMemo(() => {
    if (!useUnifiedAnomalyWorkspace) return undefined;
    const sym = selectedStrategySymbols[0] ?? null;
    if (!sym) return undefined;
    const hasConfig = ANOMALY_MT_ASSETS.some((a) => a.displaySymbol === sym);
    if (!hasConfig) return undefined;
    return `/api/monitoring/strategy-tester/run-anomaly?symbol=${encodeURIComponent(sym)}`;
  }, [useUnifiedAnomalyWorkspace, selectedStrategySymbols]);

  useEffect(() => {
    startMonitoringRuntime();
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        resumeMonitoringRuntime();
      } else {
        pauseMonitoringRuntime();
      }
    };
    const onPageHide = () => stopMonitoringRuntime();
    const onBeforeUnload = () => stopMonitoringRuntime();

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onBeforeUnload);

    if (document.visibilityState !== "visible") {
      pauseMonitoringRuntime();
    }

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
      stopMonitoringRuntime();
    };
  }, []);

  useEffect(() => {
    if (activeTab !== "agrar" && !showStrategyTesterWorkspace) return;
    let ignore = false;
    const ctrl = new AbortController();

    void (async () => {
      try {
        const response = await fetch("/api/monitoring/agri-final-status", {
          cache: "no-store",
          signal: ctrl.signal,
        });
        if (!response.ok) return;
        const data = await response.json() as AgriFinalStatusResponse;
        if (!ignore) setAgriFinalStatus(data);
      } catch (error) {
        if ((error as { name?: string }).name === "AbortError") return;
      }
    })();

    return () => {
      ignore = true;
      ctrl.abort();
    };
  }, [activeTab, refreshStatus, showStrategyTesterWorkspace]);

  useEffect(() => {
    setAgriEngineResultsBySymbol({});
  }, [cacheManifestStamp]);

  useEffect(() => {
    if (!strategyTesterEnabled && strategyTesterOpen) {
      setShowStrategyTesterPaused(true);
    }
    if (!tradeExecutionEnabled && activePanel === "tradeExecution") {
      setShowTradeExecutionPaused(true);
    }
    if (!fullscreenEnabled) setFullscreenAssetId(null);
  }, [activePanel, fullscreenEnabled, strategyTesterOpen, strategyTesterEnabled, tradeExecutionEnabled]);

  useEffect(() => {
    if (!strategyTesterOpen) {
      setActivePerformance(null);
      setStrategyPerfLoading(false);
    }
    if (!isTradeExecutionOpen) {
      setTradingViewTradesBySource({});
    }
  }, [strategyTesterOpen, isTradeExecutionOpen]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    console.debug("[MonitoringTopbar] activeTab changed", activeTab);
  }, [activeTab]);


  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    console.debug("[MonitoringTopbar] activePanel changed", activePanel);
  }, [activePanel]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next = await loadWave1Groups(["agrar", "intraday", "indices"]);
      if (!cancelled) {
        setWave1Groups(next);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    let timer: number | null = null;
    let unregisterTimer: (() => void) | null = null;
    let inFlight: AbortController | null = null;

    const schedule = (ms: number) => {
      if (disposed) return;
      if (timer != null) window.clearTimeout(timer);
      if (unregisterTimer) {
        unregisterTimer();
        unregisterTimer = null;
      }
      timer = window.setTimeout(() => {
        void poll();
      }, ms);
      unregisterTimer = registerMonitoringTimeout(timer);
    };

    const poll = async () => {
      if (disposed) return;
      if (document.hidden) {
        schedule(60_000);
        return;
      }
      if (inFlight) inFlight.abort();
      const ctrl = new AbortController();
      inFlight = ctrl;
      const unregisterFetch = registerMonitoringFetch(ctrl);
      try {
        const json = await fetchMonitoringJson(
          "/generated/monitoring/tradingview_data_cache/cache_manifest_full.json",
          {
            signal: ctrl.signal,
            ttlMs: 15_000
          }
        ) as MonitoringCacheManifestPayload | null;
        if (!json || ctrl.signal.aborted || disposed) return;
        const stamp = `${String(json.generatedAt || "")}:${Array.isArray(json.assets) ? json.assets.length : 0}`;
        if (stamp && stamp !== cacheManifestStampRef.current) {
          cacheManifestStampRef.current = stamp;
          setCacheManifestStamp(stamp);
          if (json.generatedAt) setManifestGeneratedAt(json.generatedAt);
          if (Array.isArray(json.assets)) {
            setManifestStaleCount(json.assets.filter((a) => Boolean(a?.stale)).length);
          }
        }
      } catch {
        // keep previous stamp
      } finally {
        unregisterFetch();
        schedule(60_000);
      }
    };

    void poll();
    return () => {
      disposed = true;
      if (timer != null) window.clearTimeout(timer);
      if (unregisterTimer) unregisterTimer();
      if (inFlight) inFlight.abort();
    };
  }, []);

  // Bust the in-memory candle cache whenever the data stamp changes so that all loading
  // effects (Agrar, Intraday MT, other tabs) fetch fresh OHLC from disk on next run.
  useEffect(() => {
    clearMonitoringCandleCache();
  }, [cacheManifestStamp]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const summary = getMonitoringRuntimeReport(120);
    console.debug("[MonitoringPerf]", summary);
  }, [activePanel, activeTab, isTradeExecutionOpen, strategyTesterOpen]);

  useEffect(() => {
    freezeInactiveTabs(activeTab);
  }, [activeTab]);

  useEffect(() => {
    if (!debugRenderingEnabled) {
      setParityDebugWarning(null);
      return;
    }
    const ctrl = new AbortController();
    const unregisterFetch = registerMonitoringFetch(ctrl);
    const run = async () => {
      try {
        const res = await fetch("/generated/monitoring/debug/parity_after_revert_to_mode_a.json", {
          cache: "no-store",
          signal: ctrl.signal,
        });
        if (!res.ok || ctrl.signal.aborted) {
          setParityDebugWarning(null);
          return;
        }
        const payload = (await res.json()) as ParityDebugReport;
        if (ctrl.signal.aborted) return;
        const rows = Array.isArray(payload.topAssets) ? payload.topAssets : [];
        const hasDrift = rows.some((row) => Number(row.missing ?? 0) > 0 || Number(row.extra ?? 0) > 0 || Number(row.valueDiff ?? 0) > 0);
        if (!hasDrift) {
          setParityDebugWarning(null);
          return;
        }
        const top = rows
          .map((row) => ({
            asset: String(row.asset || "").trim(),
            drift: Number(row.missing ?? 0) + Number(row.extra ?? 0),
          }))
          .filter((row) => row.asset && Number.isFinite(row.drift))
          .sort((a, b) => b.drift - a.drift)
          .slice(0, 3)
          .map((row) => `${row.asset}(${row.drift})`)
          .join(", ");
        setParityDebugWarning(`Parity DEBUG: non-blocking drift active${top ? ` [${top}]` : ""}`);
      } catch {
        if (!ctrl.signal.aborted) setParityDebugWarning(null);
      }
    };
    void run();
    return () => {
      unregisterFetch();
      ctrl.abort();
    };
  }, [debugRenderingEnabled]);

  useEffect(() => {
    const ctrl = new AbortController();
    const run = async () => {
      try {
        const cfg = await fetchMonitoringJson("/generated/monitoring/config/strategy_tester_config.json", {
          signal: ctrl.signal,
          ttlMs: 60_000
        }) as StrategyTesterRuntimeConfig | null;
        if (!cfg || ctrl.signal.aborted) return;
        setStrategyTesterConfig({
          equityMode: String(cfg?.equityMode || "base_balance").trim().toLowerCase() || "base_balance",
          compounding: Boolean(cfg?.compounding),
        });
      } catch {
        if (!ctrl.signal.aborted) {
          setStrategyTesterConfig({
            equityMode: "base_balance",
            compounding: false,
          });
        }
      }
    };
    void run();
    return () => ctrl.abort();
  }, []);

  useEffect(() => {
    if (!monitoringBootstrapReady && !cacheManifestStamp) return;
    const ctrl = new AbortController();
    const unregisterFetch = registerMonitoringFetch(ctrl);
    const run = async () => {
      try {
        const json = await fetchMonitoringJson("/generated/monitoring/audit/agrar_candle_trade_alignment_report.json", {
          signal: ctrl.signal,
          cacheKey: `/generated/monitoring/audit/agrar_candle_trade_alignment_report.json?manifest=${cacheManifestStamp}`
        }) as { assets?: CandlePriceScaleAuditRow[] } | null;
        if (!json || ctrl.signal.aborted) return;
        if (ctrl.signal.aborted) return;
        const rows = Array.isArray(json?.assets) ? json.assets : [];
        const next: Record<string, CandlePriceScaleAuditRow> = {};
        for (const raw of rows) {
          const row = raw as CandlePriceScaleAuditRow;
          const key = candleScaleAuditKey(row?.tvSymbol ?? null, row?.timeframe ?? null);
          if (!key.startsWith("|")) {
            next[key] = row;
          }
        }
        setCandleScaleAuditMap(next);
      } catch {
        if (!ctrl.signal.aborted) setCandleScaleAuditMap({});
      }
    };
    void run();
    return () => {
      unregisterFetch();
      ctrl.abort();
    };
  }, [cacheManifestStamp, monitoringBootstrapReady]);

  useEffect(() => {
    if (!monitoringBootstrapReady && !cacheManifestStamp) return;
    const ctrl = new AbortController();
    const unregisterFetch = registerMonitoringFetch(ctrl);
    const run = async () => {
      try {
        const json = await fetchMonitoringJson("/generated/monitoring/engine_state/index.json", {
          signal: ctrl.signal,
          cacheKey: `/generated/monitoring/engine_state/index.json?manifest=${cacheManifestStamp}`
        }) as MonitoringEngineStateIndexPayload | null;
        if (!json || ctrl.signal.aborted) return;
        setEngineStateIndexPayload(json);
      } catch {
        if (!ctrl.signal.aborted) setEngineStateIndexPayload(null);
      }
    };
    void run();
    return () => {
      unregisterFetch();
      ctrl.abort();
    };
  }, [cacheManifestStamp, monitoringBootstrapReady]);

  useEffect(() => {
    if (!monitoringBootstrapReady && !cacheManifestStamp) return;
    const ctrl = new AbortController();
    const unregisterFetch = registerMonitoringFetch(ctrl);
    const run = async () => {
      try {
        const json = await fetchMonitoringJson("/api/monitoring/live-state", {
          signal: ctrl.signal,
          cacheKey: `/api/monitoring/live-state?manifest=${cacheManifestStamp}`
        }) as MonitoringLiveStatePayload | null;
        if (!json || ctrl.signal.aborted) return;
        setLiveStatePayload(json);
      } catch {
        if (!ctrl.signal.aborted) setLiveStatePayload(null);
      }
    };
    void run();
    return () => {
      unregisterFetch();
      ctrl.abort();
    };
  }, [cacheManifestStamp, monitoringBootstrapReady]);

  useEffect(() => {
    if (!monitoringBootstrapReady && !cacheManifestStamp) return;
    const ctrl = new AbortController();
    const unregisterFetch = registerMonitoringFetch(ctrl);
    const run = async () => {
      try {
        const json = await fetchMonitoringJson("/generated/monitoring/live_state/manual_verified_live_signals.json", {
          signal: ctrl.signal,
          cacheKey: `/generated/monitoring/live_state/manual_verified_live_signals.json?manifest=${cacheManifestStamp}`
        }) as ManualVerifiedPayload | null;
        if (!json || ctrl.signal.aborted) return;
        setManualVerifiedPayload(json);
      } catch {
        if (!ctrl.signal.aborted) setManualVerifiedPayload(null);
      }
    };
    void run();
    return () => {
      unregisterFetch();
      ctrl.abort();
    };
  }, [cacheManifestStamp, monitoringBootstrapReady]);

  // Live-feed events loader: the per-tab loaders only fetch the active tab's event
  // ledgers, so on the Agrar tab the intraday-MT files are never loaded and the live
  // panel cannot see DAX40 2H (end_of_data open) or this-week-closed intraday signals.
  // Load those base event ledgers once (tab-independent) and merge them in.
  useEffect(() => {
    if (!Array.isArray(strategyRuntimeRoutes) || !strategyRuntimeRoutes.length) return;
    const files = new Set<string>();
    for (const r of strategyRuntimeRoutes) {
      if (String(r?.group || "").trim().toLowerCase() !== "intraday mt") continue;
      const base = String(r?.baseEventsFile || "").trim();
      if (base) files.add(base);
    }
    if (!files.size) return;
    const ctrl = new AbortController();
    const unregisterFetch = registerMonitoringFetch(ctrl);
    void (async () => {
      const loaded: Record<string, StrategyEventsPayload> = {};
      await Promise.all([...files].map(async (key) => {
        try {
          const payload = await fetchMonitoringJson(`/generated/monitoring/${key}`, {
            signal: ctrl.signal,
            cacheKey: `/generated/monitoring/${key}?manifest=${cacheManifestStamp}`,
          }) as StrategyEventsPayload | null;
          if (payload) loaded[key] = normalizeStrategyEventsPayload(payload);
        } catch { /* ignore individual file errors */ }
      }));
      if (ctrl.signal.aborted || !Object.keys(loaded).length) return;
      // prev wins on key conflicts so a freshly-loaded ledger is never downgraded.
      setStrategyEventsByFile((prev) => ({ ...loaded, ...prev }));
    })();
    return () => {
      unregisterFetch();
      ctrl.abort();
    };
  }, [strategyRuntimeRoutes, cacheManifestStamp]);

  useEffect(() => {
    if (!monitoringBootstrapReady && !cacheManifestStamp) return;
    const ctrl = new AbortController();
    const unregisterFetch = registerMonitoringFetch(ctrl);
    const run = async () => {
      try {
        const json = await fetchMonitoringJson("/generated/monitoring/audit/agrar_strategy_parity_report.json", {
          signal: ctrl.signal,
          cacheKey: `/generated/monitoring/audit/agrar_strategy_parity_report.json?manifest=${cacheManifestStamp}`
        }) as { assets?: AgrarParityAuditRow[] } | null;
        if (!json || ctrl.signal.aborted) return;
        if (ctrl.signal.aborted) return;
        const rows = Array.isArray(json?.assets) ? json.assets : [];
        const next: Record<string, AgrarParityAuditRow> = {};
        for (const raw of rows) {
          const row = raw as AgrarParityAuditRow;
          // v5 report uses "source" (e.g. "CBOT:ZW1!"), older uses "tvSymbol"
          const sym = row?.tvSymbol ?? row?.source ?? null;
          const key = candleScaleAuditKey(sym, row?.timeframe ?? "D");
          if (!key.startsWith("|")) next[key] = row;
        }
        setAgrarParityAuditMap(next);
      } catch {
        if (!ctrl.signal.aborted) setAgrarParityAuditMap({});
      }
    };
    void run();
    return () => {
      unregisterFetch();
      ctrl.abort();
    };
  }, [cacheManifestStamp, monitoringBootstrapReady]);

  useEffect(() => {
    if (!allTabsEnabled) return;
    const ctrl = new AbortController();
    const unregisterFetch = registerMonitoringFetch(ctrl);
    const run = async () => {
      try {
        const json = await fetchMonitoringJson("/generated/monitoring/config/monitoring_asset_universe.json", {
          signal: ctrl.signal,
          ttlMs: 60_000
        }) as UniverseConfig | null;
        if (!json || ctrl.signal.aborted) return;
        const rows = Array.isArray(json.assets) ? json.assets : [];
        const normalized = rows
          .map((row) => ({
            tab: String(row.tab || "").trim(),
            symbol: String(row.symbol || "").trim(),
            requestSymbol: String(row.requestSymbol || row.symbol || "").trim(),
            source: String(row.source || "").trim(),
            name: String(row.name || row.symbol || "").trim(),
            timeframe: String(row.timeframe || "").trim(),
            strategyId: String(row.strategyId || "").trim() || undefined,
            strategyScriptFile: String(row.strategyScriptFile || "").trim() || undefined,
            missingPineScript: Boolean(row.missingPineScript),
            hasData: Boolean(row.hasData),
            hasStrategy: Boolean(row.hasStrategy),
            strategyStatus: String(row.strategyStatus || "").trim(),
            buildable: Boolean(row.buildable),
            stub: Boolean(row.stub),
          }))
          .filter((row) => row.tab && row.symbol && row.source);
        setUniverseAssets(normalized);
      } catch {
        if (!ctrl.signal.aborted) setUniverseAssets([]);
      }
    };
    void run();
    return () => {
      unregisterFetch();
      ctrl.abort();
    };
  }, [allTabsEnabled]);

  useEffect(() => {
    if (!allTabsEnabled) return;
    const ctrl = new AbortController();
    const unregisterFetch = registerMonitoringFetch(ctrl);
    const run = async () => {
      setProductionUniverseLoading(true);
      setProductionUniverseError(null);
      try {
        const json = await fetch("/api/monitoring/strategy-registry", {
          cache: "no-store",
          signal: ctrl.signal,
        });
        if (!json.ok || ctrl.signal.aborted) {
          throw new Error(`registry_http_${json.status}`);
        }
        const data = await json.json() as { productionStrategies?: ProductionStrategyUniverseEntry[] };
        if (ctrl.signal.aborted) return;
        const rows = Array.isArray(data.productionStrategies) ? data.productionStrategies : [];
        const priority = (type: ProductionStrategyUniverseEntry["strategyType"]) =>
          type === "macro" ? 0 : type === "valuation" ? 1 : type === "seasonal" ? 2 : 3;
        const keepByAsset = new Map<string, ProductionStrategyUniverseEntry>();
        for (const row of rows) {
          if (!row.active) continue;
          if (!row.sleeveName) continue;
          const prev = keepByAsset.get(row.asset);
          if (!prev || priority(row.strategyType) < priority(prev.strategyType)) {
            keepByAsset.set(row.asset, row);
          }
        }
        const mapped = Array.from(keepByAsset.values()).map<UniverseAssetItem>((row) => {
          let tab = "Agrar";
          if (row.sleeveName === "Metals5") tab = "Metalle";
          else if (row.sleeveName === "Energy Robust3") tab = "Energie";
          else if (row.sleeveName === "Indices Hybrid") tab = "Indizes";
          else if (row.sleeveName === "Forex8") tab = "FX";
          return {
            tab,
            symbol: row.asset,
            requestSymbol: row.asset,
            source: row.sourceSymbol,
            name: row.label,
            timeframe: row.timeframe,
            hasData: true,
            hasStrategy: true,
            strategyStatus: row.status,
            buildable: true,
          };
        });
        setProductionUniverseAssets(mapped);
      } catch (error) {
        if (!ctrl.signal.aborted) {
          setProductionUniverseAssets([]);
          setProductionUniverseError(error instanceof Error ? error.message : "registry_fetch_failed");
        }
      } finally {
        if (!ctrl.signal.aborted) setProductionUniverseLoading(false);
      }
    };
    void run();
    return () => {
      unregisterFetch();
      ctrl.abort();
    };
  }, [allTabsEnabled]);

  useEffect(() => {
    if (!monitoringBootstrapReady && !cacheManifestStamp) return;
    const ctrl = new AbortController();
    const unregisterFetch = registerMonitoringFetch(ctrl);
    const run = async () => {
      try {
        const json = await fetchMonitoringJson("/generated/monitoring/config/strategy_runtime_routes.json", {
          signal: ctrl.signal,
          cacheKey: `/generated/monitoring/config/strategy_runtime_routes.json?manifest=${cacheManifestStamp}`
        }) as StrategyRuntimeRoutesPayload | null;
        if (!json || ctrl.signal.aborted) return;
        const rows = Array.isArray(json?.routes) ? json.routes : [];
        setStrategyRuntimeRoutes(rows);
      } catch {
        if (!ctrl.signal.aborted) setStrategyRuntimeRoutes([]);
      }
    };
    void run();
    return () => {
      unregisterFetch();
      ctrl.abort();
    };
  }, [cacheManifestStamp, monitoringBootstrapReady]);

  useEffect(() => {
    if (!basicCandleChartsEnabled) {
      setMissingBuild(true);
      return;
    }
    if (activeTab !== "agrar" && !(isAllOrLive && allStrategiesGridEnabled)) return;
    const ctrl = new AbortController();
    const unregisterFetch = registerMonitoringFetch(ctrl);
    const run = async () => {
      try {
        const initialStates: Record<string, AgrarCardLoadState> = {};
        for (const asset of ORDERED_ASSETS) {
          initialStates[asset.code] = {
            status: "loading",
            resolvedPath: null,
            barCount: 0,
            firstDate: null,
            lastDate: null,
            error: null,
            staleData: false,
            manifestGeneratedAt: null,
          };
        }
        setAgrarLoadStateBySymbol(initialStates);

        const snapshotPromise = liveSnapshotMergeEnabled ? loadAgrarSnapshotWithTimeout(ctrl.signal, 2500) : Promise.resolve(null);
        const bootstrapManifest = await fetchMonitoringJson(
          "/generated/monitoring/tradingview_data_cache/cache_manifest_full.json",
          {
            signal: ctrl.signal,
            ttlMs: 10_000
          }
        ) as MonitoringCacheManifestPayload | null;
        if (bootstrapManifest?.generatedAt) {
          const bootstrapStamp = `${String(bootstrapManifest.generatedAt || "")}:${Array.isArray(bootstrapManifest.assets) ? bootstrapManifest.assets.length : 0}`;
          if (bootstrapStamp && !cacheManifestStampRef.current) {
            cacheManifestStampRef.current = bootstrapStamp;
          }
          setManifestGeneratedAt(bootstrapManifest.generatedAt);
          if (Array.isArray(bootstrapManifest.assets)) {
            setManifestStaleCount(bootstrapManifest.assets.filter((row) => Boolean(row?.stale)).length);
          }
        }
        setMonitoringBootstrapReady(true);
        if (ctrl.signal.aborted) return;

        const results = await Promise.all(
          ORDERED_ASSETS.map(async (asset) => {
            const result = await loadMonitoringCandles(
              {
                tab: "Agrar",
                symbol: asset.code,
                source: asset.source,
                maxBars: 3000,
                timeframe: "D",
                cacheVersion: cacheManifestStamp,
              },
              ctrl.signal,
            );
            return [asset, result] as const;
          }),
        );
        if (ctrl.signal.aborted) return;

        const nextPayloads: Record<string, MonitoringPayload> = {};
        const nextStates: Record<string, AgrarCardLoadState> = {};
        for (const [asset, result] of results) {
          nextStates[asset.code] = {
            status: result.status,
            resolvedPath: result.resolvedPath ?? null,
            barCount: result.barCount,
            firstDate: result.firstDate,
            lastDate: result.lastDate,
            error: result.error ?? null,
            staleData: result.staleData,
            manifestGeneratedAt: result.manifestGeneratedAt,
          };
          if (result.payload) {
            const routeLookupItem: UniverseAssetItem = {
              tab: "Agrar",
              symbol: asset.code,
              requestSymbol: asset.code,
              source: asset.source,
              name: asset.name,
              timeframe: "D",
              hasData: true,
              hasStrategy: true,
              strategyStatus: "mapped",
              buildable: true,
            };
            const route = resolveStrategyRuntimeRoute(strategyRuntimeRoutes, routeLookupItem);
            const eventsCandidates = strategyEventsCandidatesForItem(strategyRuntimeRoutes, routeLookupItem);
            const eventsFile = eventsCandidates[0]
              ?? strategyEventsFileFromSource(asset.source);
            const fallbackEventsFile = String(route?.baseEventsFile || "").trim() || null;
            const fallbackCandidates = eventsCandidates.filter((file) => file && file !== eventsFile);
            const hasStrategy = Boolean((result.payload as MonitoringPayload)?.metadata?.hasStrategy);
            const badge = result.staleData ? "DATA STALE" : (hasStrategy ? "OK" : "NO STRAT");
            nextPayloads[asset.file] = enforceTrendEngineDefaultOff({
              ...(result.payload as MonitoringPayload),
              metadata: {
                ...((result.payload as MonitoringPayload).metadata ?? {}),
                badge,
                strategyEventsFile: eventsFile,
                strategyEventsFallbackFile:
                  fallbackEventsFile && fallbackEventsFile !== eventsFile ? fallbackEventsFile : null,
                strategyEventsFallbackCandidates: fallbackCandidates,
                strategyEventsSourceMode: resolveStrategyRuntimeRoute(strategyRuntimeRoutes, routeLookupItem)?.sourceMode ?? null,
              },
              bars: result.bars.map((bar) => ({
                time: bar.time,
                open: bar.open,
                high: bar.high,
                low: bar.low,
                close: bar.close,
              })),
            });
          }
        }

        const snapshot = await snapshotPromise;
        if (ctrl.signal.aborted) return;
        markTabLoaded(activeTab);
        setAgrarLoadStateBySymbol(nextStates);
        // CRITICAL: use a functional updater so that existing non-Agrar payloads
        // (e.g. Intraday MT keys) are preserved. A direct setPayloads(nextPayloads)
        // call would replace the entire state and wipe intraday data.
        setPayloads((prev) => {
          const agrarMerged = applyAgrarSnapshotToPayloads(nextPayloads, snapshot);
          return { ...prev, ...agrarMerged };
        });
        setMissingBuild(false);

        const localEventCache = new Map<string, StrategyEventsPayload>(Object.entries(strategyEventsByFile));
        const localEventInFlight = new Map<string, Promise<StrategyEventsPayload | null>>();
        const loadEventFile = async (eventsFile: string): Promise<StrategyEventsPayload | null> => {
          const key = String(eventsFile || "").trim();
          if (!key) return null;
          const cached = localEventCache.get(key);
          if (cached) return cached;
          const pending = localEventInFlight.get(key);
          if (pending) return pending;
          const task = (async () => {
            try {
              const payload = await fetchMonitoringJson(`/generated/monitoring/${key}`, {
                signal: ctrl.signal,
                ttlMs: 5_000
              }) as StrategyEventsPayload | null;
              if (!payload) return null;
              const normalizedPayload = normalizeStrategyEventsPayload(payload);
              localEventCache.set(key, normalizedPayload);
              return normalizedPayload;
            } catch {
              return null;
            } finally {
              localEventInFlight.delete(key);
            }
          })();
          localEventInFlight.set(key, task);
          return task;
        };

        const loadedByAsset = await Promise.all(
          ORDERED_ASSETS.map(async (asset) => {
            const routeLookupItem: UniverseAssetItem = {
              tab: "Agrar",
              symbol: asset.code,
              requestSymbol: asset.code,
              source: asset.source,
              name: asset.name,
              timeframe: "D",
              hasData: true,
              hasStrategy: true,
              strategyStatus: "mapped",
              buildable: true,
            };
            const route = resolveStrategyRuntimeRoute(strategyRuntimeRoutes, routeLookupItem);
            const eventCandidates = strategyEventsCandidatesForItem(strategyRuntimeRoutes, routeLookupItem);
            // Also include the baseEventsFile (strategies file) as an additional candidate
            // so it can be loaded and used as an SL/TP enrichment source even when the
            // preferredEventsFile (reference_events) is the primary source.
            const baseEventsFile = String(route?.baseEventsFile || "").trim();
            const allCandidates = baseEventsFile && !eventCandidates.includes(baseEventsFile)
              ? [...eventCandidates, baseEventsFile]
              : eventCandidates;
            const loadedForAsset: Array<{ key: string; payload: StrategyEventsPayload }> = [];
            for (const eventsFile of allCandidates) {
              const payload = await loadEventFile(eventsFile);
              if (!payload) continue;
              loadedForAsset.push({
                key: eventsFile,
                payload,
              });
            }
            // Only require primary candidates to be loaded before skipping the fallback loader
            const primaryLoaded = loadedForAsset.filter((row) => eventCandidates.includes(row.key));
            if (primaryLoaded.length) return [asset, loadedForAsset] as const;

            const loaded = await loadMonitoringTradeEvents({
              symbol: asset.code,
              source: asset.source,
              preferredEventsFiles: eventCandidates,
              signal: ctrl.signal,
            });
            if (!loaded.ok || !loaded.payload || !loaded.resolvedPath) return [asset, loadedForAsset] as const;
            const fallbackKey = loaded.resolvedPath.replace("/generated/monitoring/", "");
            return [asset, [{
              key: eventCandidates[0] ?? fallbackKey,
              payload: normalizeStrategyEventsPayload(loaded.payload),
            }, ...loadedForAsset.filter((row) => !eventCandidates.includes(row.key))]] as const;
          }),
        );
        if (ctrl.signal.aborted) return;
        const nextEvents: Record<string, StrategyEventsPayload> = {};
        for (const [asset, loadedRows] of loadedByAsset) {
          if (!loadedRows.length) continue;
          for (const row of loadedRows) {
            nextEvents[row.key] = row.payload;
          }
          const payload = nextPayloads[asset.file];
          const payloadFile = String(payload?.metadata?.strategyEventsFile || "").trim();
          if (payloadFile) {
            const preferredPayload = loadedRows.find((row) => row.key === payloadFile)?.payload ?? loadedRows[0]?.payload;
            if (preferredPayload) nextEvents[payloadFile] = preferredPayload;
          }
          const fallbackFile = String(payload?.metadata?.strategyEventsFallbackFile || "").trim();
          if (fallbackFile) {
            const fallbackPayload = loadedRows.find((row) => row.key === fallbackFile)?.payload
              ?? (await loadEventFile(fallbackFile));
            if (fallbackPayload) nextEvents[fallbackFile] = fallbackPayload;
          }
        }
        // Merge (don't replace) so live-feed event files for non-Agrar groups
        // (intraday MT, indices) loaded by the dedicated live-feed effect survive an
        // Agrar-tab refresh — otherwise DAX40 2H / intraday closed signals would vanish.
        setStrategyEventsByFile((prev) => ({ ...prev, ...nextEvents }));
      } catch {
        if (!ctrl.signal.aborted) {
          setAgrarLoadStateBySymbol((prev) => {
            const next = { ...prev };
            for (const asset of ORDERED_ASSETS) {
              if ((next[asset.code]?.status ?? "loading") === "loading") {
                next[asset.code] = {
                  status: "load_error",
                  resolvedPath: null,
                  barCount: 0,
                  firstDate: null,
                  lastDate: null,
                  error: "loader_exception",
                  staleData: false,
                  manifestGeneratedAt: null,
                };
              }
            }
            return next;
          });
          setMissingBuild(true);
        }
      }
    };
    void run();
    return () => {
      unregisterFetch();
      ctrl.abort();
    };
  }, [activeTab, allStrategiesGridEnabled, basicCandleChartsEnabled, cacheManifestStamp, liveSnapshotMergeEnabled, strategyRuntimeRoutes, universeAssets]);

  useEffect(() => {
    if (!tradeExecutionPanelEnabled && !liveSignalsPanelEnabled) {
      setTradingViewTradesBySource({});
      return;
    }
    const ctrl = new AbortController();
    const unregisterFetch = registerMonitoringFetch(ctrl);
    const loadTradingViewEvents = async () => {
      try {
        const [historyJson, latestJson] = await Promise.all([
          fetch("/api/monitoring/tradingview-events?kind=history", {
            cache: "no-store",
            signal: ctrl.signal,
          }).then(async (res) => (res.ok ? res.json() : { events: [] })).catch(() => ({ events: [] })),
          fetch("/api/monitoring/tradingview-events?kind=latest", {
            cache: "no-store",
            signal: ctrl.signal,
          }).then(async (res) => (res.ok ? res.json() : { events: [] })).catch(() => ({ events: [] })),
        ]);
        if (ctrl.signal.aborted) {
          return;
        }
        const merged = {
          events: [
            ...extractTradingViewEvents(historyJson),
            ...extractTradingViewEvents(latestJson),
          ],
        };
        if (ctrl.signal.aborted) return;
        setTradingViewTradesBySource(buildTradingViewTradesBySource(merged));
      } catch {
        if (!ctrl.signal.aborted) setTradingViewTradesBySource({});
      }
    };
    void loadTradingViewEvents();
    return () => {
      unregisterFetch();
      ctrl.abort();
    };
  }, [liveSignalsPanelEnabled, tradeExecutionPanelEnabled]);

  useEffect(() => {
    if (!liveSnapshotMergeEnabled) return;
    if (!liveSnapshotPollingEnabled) return;
    if (activeTab !== "agrar" && !(isAllOrLive && allStrategiesGridEnabled)) return;

    let disposed = false;
    let timer: number | null = null;
    let unregisterTimer: (() => void) | null = null;
    let inFlight: AbortController | null = null;

    const schedule = (ms: number) => {
      if (disposed) return;
      if (timer != null) window.clearTimeout(timer);
      if (unregisterTimer) {
        unregisterTimer();
        unregisterTimer = null;
      }
      timer = window.setTimeout(() => {
        void pollLiveAgrar();
      }, ms);
      unregisterTimer = registerMonitoringTimeout(timer);
    };

    const pollLiveAgrar = async () => {
      if (disposed) return;
      if (document.hidden) {
        schedule(20_000);
        return;
      }

      if (inFlight) inFlight.abort();
      const ctrl = new AbortController();
      inFlight = ctrl;
      const unregisterFetch = registerMonitoringFetch(ctrl);
      try {
        const refreshBucket = Math.floor(Date.now() / 30_000);
        const snapshot = await loadAgrarSnapshotWithTimeout(ctrl.signal, 2000);
        if (disposed || ctrl.signal.aborted) return;

        const liveResults = await Promise.all(
          ORDERED_ASSETS.map(async (asset) => {
            const url = `/api/asset/${encodeURIComponent(asset.assetId)}/timeseries?tf=D&source=${asset.liveProvider}&continuous_mode=backadjusted&build_mode=auto&refresh_bucket=${refreshBucket}`;
            try {
              const response = await fetch(url, { cache: "no-store", signal: ctrl.signal });
              if (!response.ok) return { asset, ok: false as const };
              const payload = (await response.json()) as TimeseriesResponse;
              const bars = normalizeTimeseriesBars(payload);
              const lastOhlcv = payload.ohlcv?.[payload.ohlcv.length - 1] ?? null;
              return {
                asset,
                ok: true as const,
                bars,
                sourceUsed: String(payload.sourceUsed || payload.source || "").trim() || null,
                updatedAt: payload.updatedAt ?? null,
                volume: toFinite(lastOhlcv?.volume),
              };
            } catch {
              return { asset, ok: false as const };
            }
          }),
        );

        if (disposed || ctrl.signal.aborted) return;

        const nextLiveState: Record<string, AgrarLiveState> = {};
        const nextDataMismatch: Record<string, boolean> = {};
        const debugRows: Array<{
          asset: string;
          source: string;
          bars: number;
          lastDate: string | null;
          open: number | null;
          high: number | null;
          low: number | null;
          close: number | null;
          mergeResult: string;
          mismatch: boolean;
        }> = [];

        setPayloads((prev) => {
        let changed = false;
        const next = { ...prev };

        for (const result of liveResults) {
          const existing = next[result.asset.file] ?? null;
          if (!existing) continue;
          const snapshotAsset = findAgrarSnapshotAsset(snapshot, result.asset.code, result.asset.source);

          const mergedBars = applyAgrarSnapshotPriorityBars(existing.bars ?? [], result.ok ? result.bars : [], snapshotAsset);
          if (!mergedBars.length) {
            nextLiveState[result.asset.code] = liveStateFromPayload(result.asset, existing);
            nextDataMismatch[result.asset.code] = false;
            continue;
          }

          const mergedSignals = existing.signals ?? [];
          const didBarsChange = !barsUnchanged(existing.bars ?? [], mergedBars);
          const didSignalsChange = false;

          if (didBarsChange || didSignalsChange) {
            changed = true;
            next[result.asset.file] = {
              ...existing,
              bars: mergedBars,
              signals: mergedSignals,
              metadata: {
                ...existing.metadata,
                openPosition: Number(mergedSignals[mergedSignals.length - 1]?.position ?? 0) !== 0,
              },
            };
          }

          const liveBaseRaw = next[result.asset.file] ?? existing;
          const liveBase = enforceTrendEngineDefaultOff(liveBaseRaw);
          if (liveBase !== liveBaseRaw) {
            changed = true;
            next[result.asset.file] = liveBase;
          }
          const snapshotLatest = snapshotAsset?.latest ?? null;
          const sourceUsed = result.ok ? (result.sourceUsed ?? null) : null;
          const updatedAt = result.ok ? (result.updatedAt ?? null) : null;
          const volume = result.ok ? (result.volume ?? null) : null;
          const lastBar = liveBase.bars?.[liveBase.bars.length - 1] ?? null;
          const sourceMismatch = snapshotAsset ? snapshotAsset.source !== result.asset.source : false;
          const mismatch = snapshotLatest
            ? (
              sourceMismatch
              || (
              normalizeDailyTime(lastBar?.time) !== normalizeDailyTime(snapshotLatest.date)
              || !ohlcEquals(
                lastBar
                  ? { open: lastBar.open, high: lastBar.high, low: lastBar.low, close: lastBar.close }
                  : null,
                { open: toFinite(snapshotLatest.open), high: toFinite(snapshotLatest.high), low: toFinite(snapshotLatest.low), close: toFinite(snapshotLatest.close) },
              ))
            )
            : sourceMismatch;
          nextDataMismatch[result.asset.code] = mismatch;
          debugRows.push({
            asset: result.asset.code,
            source: snapshotAsset ? (snapshot?.source ?? sourceUsed ?? result.asset.source) : (sourceUsed ?? result.asset.source),
            bars: liveBase.bars?.length ?? 0,
            lastDate: normalizeDailyTime(lastBar?.time),
            open: toFinite(lastBar?.open),
            high: toFinite(lastBar?.high),
            low: toFinite(lastBar?.low),
            close: toFinite(lastBar?.close),
            mergeResult: snapshotAsset ? (result.ok ? "snapshot>api>history" : "snapshot>history") : (result.ok ? "api>history" : "history-only"),
            mismatch,
          });
          nextLiveState[result.asset.code] = {
            ...liveStateFromPayload(result.asset, liveBase),
            sourceUsed: snapshotAsset ? (snapshot?.source ?? sourceUsed) : sourceUsed,
            updatedAt: snapshotLatest?.date ? `${snapshotLatest.date}T00:00:00Z` : updatedAt,
            volume: toFinite(snapshotLatest?.volume) ?? volume,
          };
        }

        for (const asset of ORDERED_ASSETS) {
          if (nextLiveState[asset.code]) continue;
          const payload = next[asset.file] ? enforceTrendEngineDefaultOff(next[asset.file]) : null;
          if (payload && payload !== next[asset.file]) {
            changed = true;
            next[asset.file] = payload;
          }
          nextLiveState[asset.code] = liveStateFromPayload(asset, payload);
          if (nextDataMismatch[asset.code] == null) nextDataMismatch[asset.code] = false;
        }

        if (debugRenderingEnabled && process.env.NODE_ENV !== "production") {
          console.table(debugRows);
          for (const row of debugRows) {
            if (!row.mismatch) continue;
            console.warn("[AGRAR][DATA MISMATCH]", row.asset, row);
          }
        }

        return changed ? next : prev;
        });

        if (!disposed) {
          setAgrarLiveState(nextLiveState);
          setAgrarDataMismatch(nextDataMismatch);
        }

        schedule(35_000);
      } finally {
        unregisterFetch();
      }
    };

    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (timer != null) window.clearTimeout(timer);
      void pollLiveAgrar();
    };

    void pollLiveAgrar();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      disposed = true;
      if (timer != null) window.clearTimeout(timer);
      if (unregisterTimer) unregisterTimer();
      if (inFlight) inFlight.abort();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [activeTab, allStrategiesGridEnabled, debugRenderingEnabled, liveSnapshotMergeEnabled, liveSnapshotPollingEnabled]);

  const intradayMtUniverseItems = useMemo<UniverseAssetItem[]>(
    () =>
      INTRADAY_MT_ASSETS.map((row) => ({
        tab: "Intraday MT",
        symbol: row.displaySymbol,
        requestSymbol: row.requestSymbol,
        source: row.source,
        name: row.name,
        timeframe: row.timeframe,
        strategyId: row.strategyId,
        strategyScriptFile: row.strategyScriptFile,
        missingPineScript: false,
        hasData: true,
        hasStrategy: true,
        strategyStatus: "mapped",
        buildable: true,
      })),
    [],
  );

  const anomalyMtUniverseItems = useMemo<UniverseAssetItem[]>(
    () =>
      ANOMALY_MT_ASSETS.map((row) => ({
        tab: "Anomaly",
        symbol: row.displaySymbol,
        requestSymbol: row.requestSymbol,
        source: row.source,
        name: row.name,
        timeframe: row.timeframe,
        hasData: true,
        hasStrategy: true,
        strategyStatus: "mapped" as const,
        buildable: true,
      })),
    [],
  );

  const effectiveUniverseAssets = useMemo(() => {
    if (productionUniverseAssets.length === 0) return universeAssets;
    const keep = universeAssets.filter((asset) => {
      const group = normalizeGroup(asset.tab);
      return group === "Aktien" || group === "Invest" || group === "Intraday MT";
    });
    return [...productionUniverseAssets, ...keep];
  }, [productionUniverseAssets, universeAssets]);

  const fallbackUniverseByTab = useMemo(() => ({
    aktien: FALLBACK_AKTIEN_UNIVERSE_ITEMS,
    invest: FALLBACK_INVEST_UNIVERSE_ITEMS,
    fx: productionUniverseAssets.filter((asset) => normalizeGroup(asset.tab) === "FX"),
    metalle_energie: productionUniverseAssets.filter((asset) => {
      const group = normalizeGroup(asset.tab);
      return group === "Metalle" || group === "Energie";
    }),
    live: productionUniverseAssets,
    all: productionUniverseAssets,
  }), [productionUniverseAssets]);

  const filteredUniverseItems = useMemo(() => {
    if (activeTab === "intraday_mt") {
      return intradayMtUniverseItems;
    }
    if (activeTab === "anomaly") {
      return anomalyMtUniverseItems;
    }
    if (activeTab === "indizes") {
      return WAVE1_INDICES_ASSETS;
    }
    if ((activeTab === "aktien" || activeTab === "invest" || activeTab === "fx" || activeTab === "metalle_energie" || activeTab === "live" || activeTab === "all") && fallbackUniverseByTab[activeTab].length) {
      return fallbackUniverseByTab[activeTab];
    }
    if (!effectiveUniverseAssets.length) {
      if (activeTab === "aktien") return FALLBACK_AKTIEN_UNIVERSE_ITEMS;
      if (activeTab === "invest") return FALLBACK_INVEST_UNIVERSE_ITEMS;
      return [] as UniverseAssetItem[];
    }
    if (isAllOrLive) {
      const cfg = tabConfigById("all");
      const groups = new Set((cfg?.universeGroups ?? []).map((group) => normalizeGroup(group)));
      const scoped = effectiveUniverseAssets.filter((asset) => {
        const group = normalizeGroup(asset.tab);
        return groups.has(group);
      });
      return applyMonitoringUniverseFilters(scoped, { replaceAgrarWithOrdered: true });
    }
    const cfg = tabConfigById(activeTab);
    if (!cfg) return [] as UniverseAssetItem[];
    const groups = new Set(cfg.universeGroups.map((group) => normalizeGroup(group)));
    const scoped = effectiveUniverseAssets.filter((asset) => groups.has(normalizeGroup(asset.tab)));
    const replaceAgrar = activeTab === "agrar" || groups.has("Agrar");
    return applyMonitoringUniverseFilters(scoped, { replaceAgrarWithOrdered: replaceAgrar });
  }, [activeTab, anomalyMtUniverseItems, effectiveUniverseAssets, fallbackUniverseByTab, intradayMtUniverseItems]);

  useEffect(() => {
    const activeKeys: string[] = [];
    if (activeTab === "agrar") {
      for (const asset of ORDERED_ASSETS) activeKeys.push(`${asset.source.toUpperCase()}|D`);
    } else {
      for (const item of limitGridUniverseItems(filteredUniverseItems, activeTab)) {
        const tf = monitoringTimeframeForItem(item, activeTab);
        activeKeys.push(`${String(item.source || "").toUpperCase()}|${String(tf).toUpperCase()}`);
      }
    }
    clearInactiveMonitoringDataCache(activeKeys);
  }, [activeTab, filteredUniverseItems]);

  useEffect(() => {
    if (!allTabsEnabled) return;
    if (activeTab === "agrar") return;
    if (isAllOrLive && !allStrategiesGridEnabled) return;
    if (activeTab === "intraday_mt" && !intradayMTEnabled) return;
    const visibleItems = limitGridUniverseItems(filteredUniverseItems, activeTab).filter((item) => {
      if (isAllOrLive && findOrderedAgrarAsset(item.symbol)) return false;
      return true;
    });
    if (!visibleItems.length) return;

    const ctrl = new AbortController();
    const unregisterFetch = registerMonitoringFetch(ctrl);
    // Increment the generation counter so that any previously-started async run
    // knows it has been superseded and should not write state.
    intradayLoadGenerationRef.current += 1;
    const myGeneration = intradayLoadGenerationRef.current;
    const run = async () => {
      setAgrarLoadStateBySymbol((prev) => {
        const next = { ...prev };
        for (const item of visibleItems) {
          next[item.symbol] = {
            status: "loading",
            resolvedPath: null,
            barCount: 0,
            firstDate: null,
            lastDate: null,
            error: null,
            staleData: false,
            manifestGeneratedAt: null,
          };
        }
        return next;
      });

      const loaded = await Promise.all(
        visibleItems.map(async (item) => {
          const source = String(item.source || "").trim();
          const agrarAsset = findOrderedAgrarAsset(item.symbol);
          const symbol = agrarAsset
            ? agrarAsset.code
            : String(item.requestSymbol || item.symbol || "").trim();
          const tabLabel = agrarAsset ? ("Agrar" as const) : groupToMonitoringLabel(item.tab);
          const payloadKey = monitoringPayloadKeyForItem(item, activeTab);
          if (!source || !symbol || !tabLabel || tabLabel === "Alle Strategien") {
            return {
              item,
              payloadKey,
              payload: null as MonitoringPayload | null,
              result: {
                ok: false,
                status: "invalid_data" as MonitoringLoadStatus,
                bars: [],
                error: "symbol_mapping_failed",
                resolvedPath: undefined,
                barCount: 0,
                firstDate: null,
                lastDate: null,
                payload: null,
                mergeStatus: "no_snapshot" as const,
                mergeWarning: null,
                snapshotDate: null,
                historyLastDateBeforeMerge: null,
                historyCloseBeforeMerge: null,
                snapshotClose: null,
                staleData: false,
                manifestGeneratedAt: null,
              },
            };
          }
          const requestedTimeframe = monitoringTimeframeForItem(item, activeTab);
          if (shouldUseIntradayMtFallback(item, activeTab) && requestedTimeframe === "D") {
            return {
              item,
              payloadKey,
              payload: null as MonitoringPayload | null,
              result: {
                ok: false,
                status: "missing_candles" as MonitoringLoadStatus,
                bars: [],
                error: "missing_candles: intraday_timeframe_unresolved",
                resolvedPath: undefined,
                barCount: 0,
                firstDate: null,
                lastDate: null,
                payload: null,
                mergeStatus: "no_snapshot" as const,
                mergeWarning: null,
                snapshotDate: null,
                historyLastDateBeforeMerge: null,
                historyCloseBeforeMerge: null,
                snapshotClose: null,
                staleData: false,
                manifestGeneratedAt: null,
              },
            };
          }

          let result = await loadMonitoringCandles(
            {
              tab: tabLabel,
              symbol,
              source,
              maxBars: isAllOrLive ? 600 : 2500,
              timeframe: requestedTimeframe,
              cacheVersion: cacheManifestStamp,
            },
            ctrl.signal,
          );

          // Optimizer-mt fallback: only use when the primary load returned an unknown
          // error (not "missing_candles" — that status means we attempted the fresh-file
          // path and the file was empty or unparseable, so stale March-2026 data from
          // the optimizer-mt package must NOT silently replace it). Assets with known
          // fresh files (DAX 2H, DAX 1H, GBPUSD 30M, EURUSD 30M) will always get
          // status "missing_candles" on failure — so the fallback is effectively disabled
          // for those assets and will only ever activate for unknown error conditions
          // on assets that have no fresh-file path at all.
          const isMissingCandlesStatus = result.status === "missing_candles";
          if (
            shouldUseIntradayMtFallback(item, activeTab) &&
            (!result.ok || !result.bars.length) &&
            !isMissingCandlesStatus
          ) {
            const mtAssetId = readOptimizerMtAssetId(source);
            if (mtAssetId) {
              try {
                const mtPath = `/data/optimizer-mt/cache/${mtAssetId}_30m.json`;
                const mtRes = await fetch(mtPath, { cache: "no-store", signal: ctrl.signal });
                if (mtRes.ok) {
                  const mtJson = await mtRes.json();
                  const mt30 = parseOptimizerMtCandles(mtJson);
                  const tfNorm = normalizeIntradayTf(requestedTimeframe);
                  const intradayTf: "30M" | "1H" | "2H" = tfNorm === "D" ? "30M" : tfNorm;
                  const mtBars = resampleCandlesFrom30M(mt30, intradayTf);
                  if (mtBars.length) {
                    const clipped = mtBars.slice(-120);
                    // Always mark optimizer-mt data as stale — it is a legacy fallback
                    // and should never be presented as current data.
                    result = {
                      ok: true,
                      status: "loaded",
                      bars: clipped,
                      resolvedPath: mtPath,
                      staleData: true,
                      manifestGeneratedAt: null,
                      barCount: clipped.length,
                      firstDate: clipped[0]?.time ? String(clipped[0].time).slice(0, 10) : null,
                      lastDate: clipped[clipped.length - 1]?.time ? String(clipped[clipped.length - 1].time).slice(0, 10) : null,
                      payload: null,
                      mergeStatus: "no_snapshot",
                      mergeWarning: null,
                      snapshotDate: null,
                      historyLastDateBeforeMerge: null,
                      historyCloseBeforeMerge: null,
                      snapshotClose: null,
                    };
                  }
                }
              } catch {
                // keep existing cache result fallback
              }
            }
          }
          const route = resolveStrategyRuntimeRoute(strategyRuntimeRoutes, item);
          const routeCandidates = strategyEventsCandidatesForItem(strategyRuntimeRoutes, item);
          const primaryEventsFile = routeCandidates[0] ?? strategyEventsFileFromSourceTf(source, requestedTimeframe);
          const fallbackEventsFile = String(route?.baseEventsFile || "").trim() || null;
          const fallbackCandidates = routeCandidates.filter((file) => file && file !== primaryEventsFile);
          const payload: MonitoringPayload = {
            metadata: {
              code: item.symbol,
              name: item.name,
              tvSymbol: source,
              strategy: item.missingPineScript ? "missing_pine_script" : (item.hasStrategy ? "Mapped Strategy" : "No signals"),
              status: item.missingPineScript ? "WARN" : (item.hasStrategy ? "OK" : "WARN"),
              hasStrategy: item.missingPineScript ? false : Boolean(item.hasStrategy),
              strategyEventsFile: item.missingPineScript
                ? null
                : primaryEventsFile,
              strategyEventsFallbackFile: item.missingPineScript
                ? null
                : (fallbackEventsFile && fallbackEventsFile !== primaryEventsFile ? fallbackEventsFile : null),
              strategyEventsFallbackCandidates: item.missingPineScript ? [] : fallbackCandidates,
              strategyEventsSourceMode: item.missingPineScript
                ? null
                : (route?.sourceMode ?? null),
              badge: item.missingPineScript
                ? "MISSING PINE"
                : (result.staleData ? "DATA STALE" : (item.hasStrategy ? "OK" : "NO STRAT")),
              hints: item.missingPineScript ? ["missing_pine_script"] : [],
              params: [],
            },
            bars: result.bars.map((bar) => ({
              time: bar.time,
              open: bar.open,
              high: bar.high,
              low: bar.low,
              close: bar.close,
            })),
            signals: [],
            boxes: [],
          };
          return {
            item,
            payloadKey,
            payload,
            result,
          };
        }),
      );

      const localEventCache = new Map<string, StrategyEventsPayload>(Object.entries(strategyEventsByFile));
      const localEventInFlight = new Map<string, Promise<StrategyEventsPayload | null>>();
      const loadEventFile = async (eventsFile: string): Promise<StrategyEventsPayload | null> => {
        const key = String(eventsFile || "").trim();
        if (!key) return null;
        const cached = localEventCache.get(key);
        if (cached) return cached;
        const pending = localEventInFlight.get(key);
        if (pending) return pending;
        const task = (async () => {
          try {
            const res = await fetch(`/generated/monitoring/${key}`, {
              cache: "no-store",
              signal: ctrl.signal,
            });
            if (!res.ok) return null;
            const payload = normalizeStrategyEventsPayload((await res.json()) as StrategyEventsPayload);
            localEventCache.set(key, payload);
            return payload;
          } catch {
            return null;
          } finally {
            localEventInFlight.delete(key);
          }
        })();
        localEventInFlight.set(key, task);
        return task;
      };

      const loadedEventsNested = await Promise.all(
        visibleItems.map(async (item) => {
          if (item.missingPineScript) return [] as Array<{ key: string; payload: StrategyEventsPayload }>;
          const source = String(item.source || "").trim();
          const symbol = String(item.requestSymbol || item.symbol || "").trim();
          if (!source || !symbol) return [] as Array<{ key: string; payload: StrategyEventsPayload }>;
          const tf = monitoringTimeframeForItem(item, activeTab);
          const candidates = strategyEventsCandidatesForItem(strategyRuntimeRoutes, item);
          // Also include the baseEventsFile (strategies file) as an additional candidate
          // so it can be loaded and used as an SL/TP enrichment source even when the
          // preferredEventsFile (reference_events) is the primary source.
          const itemRoute = resolveStrategyRuntimeRoute(strategyRuntimeRoutes, item);
          const baseEventsFile = String(itemRoute?.baseEventsFile || "").trim();
          const allCandidates = baseEventsFile && !candidates.includes(baseEventsFile)
            ? [...candidates, baseEventsFile]
            : candidates;
          const loadedForItem: Array<{ key: string; payload: StrategyEventsPayload }> = [];
          for (const eventsFile of allCandidates) {
            const payload = await loadEventFile(eventsFile);
            if (!payload) continue;
            loadedForItem.push({
              key: eventsFile,
              payload,
            });
          }
          // Only require primary candidates (not baseEventsFile extras) to be loaded
          const primaryLoaded = loadedForItem.filter((row) => candidates.includes(row.key));
          if (primaryLoaded.length) return loadedForItem;
          const eventRes = await loadMonitoringTradeEvents({
            symbol,
            source,
            preferredEventsFiles: candidates,
            signal: ctrl.signal,
          });
          if (!eventRes.ok || !eventRes.payload || !eventRes.resolvedPath) {
            return loadedForItem; // return any baseEventsFile loaded even if primary failed
          }
          const fallbackKey = eventRes.resolvedPath.replace("/generated/monitoring/", "");
          return [{
            key: candidates[0] ?? fallbackKey,
            payload: normalizeStrategyEventsPayload(eventRes.payload),
          }, ...loadedForItem.filter((row) => !candidates.includes(row.key))];
        }),
      );
      const loadedEvents = loadedEventsNested.flat();

      if (ctrl.signal.aborted) return;
      // If a newer load effect has already started, discard this result to prevent
      // a stale async run from overwriting fresher data (race condition guard).
      if (myGeneration !== intradayLoadGenerationRef.current) return;
      markTabLoaded(activeTab);

      setPayloads((prev) => {
        const next = { ...prev };
        for (const row of loaded) {
          const { item, payloadKey, result, payload } = row;
          if (!payloadKey || !result.ok) {
            const staleKey = monitoringPayloadKeyForItem(item, activeTab);
            const isIntradayMtItem = item.tab === "Intraday MT" || activeTab === "intraday_mt";
            // Never wipe intraday payload if we already have valid bars — keep existing and skip
            if (isIntradayMtItem && next[staleKey]?.bars?.length) {
              continue; // preserve existing valid candles; failed fetch is ignored
            }
            if (!(findOrderedAgrarAsset(item.symbol) && next[staleKey]?.bars?.length)) {
              delete next[staleKey];
            }
            continue;
          }
          if (payload) {
            // For intraday assets: guard against overwriting fresher data with older data.
            // This can happen if a stale async run completes after a fresher one (race).
            const isIntradayItem = item.tab === "Intraday MT" || (activeTab === "intraday_mt");
            if (isIntradayItem) {
              const existingBars = next[payloadKey]?.bars;
              const existingLastBar = existingBars?.[existingBars.length - 1];
              const newBars = payload?.bars;
              const newLastBar = newBars?.[newBars.length - 1];
              if (
                existingLastBar?.time != null &&
                newLastBar?.time != null &&
                String(newLastBar.time) < String(existingLastBar.time)
              ) {
                // Incoming data is older than what we already have — skip this write.
                continue;
              }
            }
            next[payloadKey] = enforceTrendEngineDefaultOff(payload);
          }
        }
        return next;
      });

      setAgrarLoadStateBySymbol((prev) => {
        const next = { ...prev };
        for (const row of loaded) {
          const { item, result } = row;
          const isIntradayMtItem = item.tab === "Intraday MT" || activeTab === "intraday_mt";
          // If we kept previous candles (intraday failed fetch), don't overwrite status with error
          if (isIntradayMtItem && !result.ok) {
            const existingState = next[item.symbol];
            if (existingState?.barCount && existingState.barCount > 0) {
              continue; // keep previous load state metadata
            }
          }
          next[item.symbol] = {
            status: result.status,
            resolvedPath: result.resolvedPath ?? null,
            barCount: result.barCount,
            firstDate: result.firstDate,
            lastDate: result.lastDate,
            error: result.error ?? null,
            staleData: result.staleData,
            manifestGeneratedAt: result.manifestGeneratedAt,
          };
        }
        return next;
      });

      setStrategyEventsByFile((prev) => {
        const next = { ...prev };
        for (const row of loadedEvents) {
          next[row.key] = row.payload;
        }
        return next;
      });
    };

    void run();
    return () => {
      unregisterFetch();
      ctrl.abort();
    };
  }, [activeTab, allStrategiesGridEnabled, allTabsEnabled, cacheManifestStamp, filteredUniverseItems, intradayMTEnabled, strategyRuntimeRoutes]);

  useEffect(() => {
    if (activeTab === "agrar") return;
    setIsInputPanelOpen(false);
  }, [activeTab]);

  const wave1Prepared = useMemo(() => {
    const payloadBySymbol: Record<string, MonitoringPayload> = {};
    const eventsByFile: Record<string, StrategyEventsPayload> = {};
    const tradesByItemKey: Record<string, ReturnType<typeof mergeTradesFromEventsPayload>> = {};
    const loadStateBySymbol: Record<string, AgrarCardLoadState> = {};

    const pushRecord = (groupId: Wave1GroupId, record: Wave1StrategyRecord, source: string, itemKey: string) => {
      const eventsFile = `wave1/${groupId}/${record.strategyId}.json`;
      payloadBySymbol[itemKey] = buildWave1MonitoringPayload(record, source, eventsFile);
      const eventsPayload = buildWave1StrategyEvents(record, source);
      eventsByFile[eventsFile] = eventsPayload;
      tradesByItemKey[itemKey] = eventsPayload.trades;
      loadStateBySymbol[record.symbol] = {
        status: record.chart?.bars?.length ? "loaded" : "missing_candles",
        resolvedPath: `/generated/monitoring/wave1/${groupId}/charts.json`,
        barCount: record.chart?.bars?.length ?? 0,
        firstDate: record.chart?.bars?.[0]?.time?.slice(0, 10) ?? null,
        lastDate: record.chart?.bars?.[record.chart.bars.length - 1]?.time?.slice(0, 10) ?? null,
        error: null,
        staleData: false,
        manifestGeneratedAt: wave1Groups[groupId]?.manifest?.generated_at ?? null,
      };
    };

    for (const asset of ORDERED_ASSETS) {
      const record = wave1Groups.agrar?.records.find((row) => row.symbol === asset.code) ?? null;
      if (!record) continue;
      pushRecord("agrar", record, asset.source, asset.file);
    }

    for (const item of intradayMtUniverseItems) {
      const record = wave1Groups.intraday?.records.find((row) => row.label === item.symbol || row.symbol === item.requestSymbol || row.label === item.requestSymbol) ?? null;
      if (!record) continue;
      pushRecord("intraday", record, item.source, intradayMtPayloadKey(item));
    }

    for (const item of WAVE1_INDICES_ASSETS) {
      const record = wave1Groups.indices?.records.find((row) => row.symbol === item.symbol) ?? null;
      if (!record) continue;
      pushRecord("indices", record, item.source, universePayloadKey(item));
    }

    return { payloadBySymbol, eventsByFile, tradesByItemKey, loadStateBySymbol };
  }, [intradayMtUniverseItems, wave1Groups]);

  const effectiveLoadStateBySymbol = useMemo(
    () => ({ ...agrarLoadStateBySymbol, ...wave1Prepared.loadStateBySymbol }),
    [agrarLoadStateBySymbol, wave1Prepared.loadStateBySymbol],
  );

  const effectiveStrategyEventsByFile = useMemo(
    () => ({ ...strategyEventsByFile, ...wave1Prepared.eventsByFile }),
    [strategyEventsByFile, wave1Prepared.eventsByFile],
  );

  const orderedItems = useMemo(
    () =>
      ORDERED_ASSETS.map((asset) => {
        const wave1Payload = wave1Prepared.payloadBySymbol[asset.file] ?? null;
        const _agrarFreshPayload = payloads[asset.file] ? enforceTrendEngineDefaultOff(payloads[asset.file]) : null;
        const basePayload = (_agrarFreshPayload?.bars?.length ? _agrarFreshPayload : wave1Payload) ?? _agrarFreshPayload ?? null;
        const withCandleBadge = applyCandleScaleMismatchBadge(basePayload, asset.source, "D", candleScaleAuditMap);
        const finalPayload = applyAgrarParityBadge(withCandleBadge, asset.source, "D", agrarParityAuditMap);
        const labeled = applyMonitoringChartLabel({
          key: asset.code,
          code: asset.code,
          assetId: asset.assetId,
          strategy: asset.strategy,
          tv: asset.tv,
          source: asset.source,
          dataMismatch: Boolean(agrarDataMismatch[asset.code]),
          payload: finalPayload,
          variant: "large" as const,
          timeframe: "D",
          eventsFile: undefined as string | undefined,
        });
        if (uiPrefs.language === "de") {
          return { ...labeled, name: translateMonitoringTerm(labeled.name, "de") };
        }
        return labeled;
      }),
    [agrarDataMismatch, agrarParityAuditMap, candleScaleAuditMap, payloads, uiPrefs.language, wave1Prepared.payloadBySymbol],
  );

  const allItems = useMemo(() => {
    if (activeTab === "intraday_mt") {
      const slotOrder: Array<IntradayMtAssetConfig["slot"]> = ["top_left", "top_right", "bottom_left", "bottom_right"];
      const bySlot = new Map<IntradayMtAssetConfig["slot"], UniverseAssetItem>();
      for (const item of filteredUniverseItems) {
        // Match by source + timeframe (not displaySymbol) to handle shared-source assets like DE30EUR
        const itemTf = normalizeIntradayTf(item.timeframe);
        const spec = INTRADAY_MT_ASSETS.find(
          (row) => row.source === item.source && normalizeIntradayTf(row.timeframe) === itemTf,
        );
        if (!spec) continue;
        bySlot.set(spec.slot, item);
      }
      return slotOrder
        .map((slot) => bySlot.get(slot) ?? null)
        .filter((it): it is UniverseAssetItem => Boolean(it))
        .map((it) => {
          const tf = normalizeIntradayTf(it.timeframe);
          const spec = INTRADAY_MT_ASSETS.find(
            (row) => row.source === it.source && normalizeIntradayTf(row.timeframe) === tf,
          );
          const eventsFile = strategyEventsCandidatesForItem(strategyRuntimeRoutes, it)[0]
            ?? strategyEventsFileFromSourceTf(it.source, tf);
          const basePayload = wave1Prepared.payloadBySymbol[intradayMtPayloadKey(it)] ?? payloads[intradayMtPayloadKey(it)] ?? null;
          const labeled = applyMonitoringChartLabel({
            key: `${it.tab}:${it.symbol}`,
            code: spec?.displaySymbol ?? it.symbol,
            tv: it.source,
            strategy: it.missingPineScript ? "missing_pine_script" : (basePayload?.metadata?.strategy ?? ""),
            payload: applyCandleScaleMismatchBadge(basePayload, it.source, tf, candleScaleAuditMap),
            variant: "large" as const,
            timeframe: tf,
            universeGroup: "Intraday MT",
            eventsFile: eventsFile ?? undefined,
          });
          if (uiPrefs.language === "de") {
            return { ...labeled, name: translateMonitoringTerm(labeled.name, "de") };
          }
          return labeled;
        });
    }

    if (activeTab === "anomaly") {
      const slotOrder: Array<AnomalyMtAssetConfig["slot"]> = ["top_left", "top_right", "bottom_left", "bottom_right"];
      const bySlot = new Map<AnomalyMtAssetConfig["slot"], UniverseAssetItem>();
      for (const item of filteredUniverseItems) {
        const spec = ANOMALY_MT_ASSETS.find((row) => row.displaySymbol === item.symbol);
        if (!spec) continue;
        bySlot.set(spec.slot, item);
      }
      return slotOrder
        .map((slot) => bySlot.get(slot) ?? null)
        .filter((it): it is UniverseAssetItem => Boolean(it))
        .map((it) => {
          const spec = ANOMALY_MT_ASSETS.find((row) => row.displaySymbol === it.symbol);
          const labeled = applyMonitoringChartLabel({
            key: `anomaly:${it.symbol}`,
            code: spec?.displaySymbol ?? it.symbol,
            tv: it.source,
            strategy: "",
            payload: null,
            variant: "large" as const,
            timeframe: it.timeframe,
            universeGroup: "Anomaly",
          });
          if (uiPrefs.language === "de") {
            return { ...labeled, name: translateMonitoringTerm(labeled.name, "de") };
          }
          return labeled;
        });
    }

    const groupIndex = Object.fromEntries(GROUP_ORDER.map((g, i) => [g, i]));
    const agrarSymbolOrder = Object.fromEntries(MONITORING_ACTIVE_AGRAR_SYMBOLS.map((code, index) => [code, index]));
    const agrarAssetIdByCode = Object.fromEntries(ORDERED_ASSETS.map((asset) => [asset.code, asset.assetId]));
    const sorted = [...filteredUniverseItems].sort((a, b) => {
      const aBuildable = a.hasData && a.buildable;
      const bBuildable = b.hasData && b.buildable;
      const buildableCmp = (aBuildable ? 0 : 1) - (bBuildable ? 0 : 1);
      if (buildableCmp !== 0) return buildableCmp;
      const gCmp = (groupIndex[normalizeGroup(a.tab)] ?? 99) - (groupIndex[normalizeGroup(b.tab)] ?? 99);
      if (gCmp !== 0) return gCmp;
      if (normalizeGroup(a.tab) === "Agrar" && normalizeGroup(b.tab) === "Agrar") {
        const aIdx = agrarSymbolOrder[a.symbol] ?? 99;
        const bIdx = agrarSymbolOrder[b.symbol] ?? 99;
        if (aIdx !== bIdx) return aIdx - bIdx;
      }
      // Fixed Indizes order so the grid reads YM1!/UKX!/NQ1! (top) then FDAX1!/ES1! (bottom).
      if (normalizeGroup(a.tab) === "Indizes" && normalizeGroup(b.tab) === "Indizes") {
        const order: Record<string, number> = { "YM1!": 0, "UKX!": 1, "NQ1!": 2, "FDAX1!": 3, "ES1!": 4 };
        const aIdx = order[a.symbol] ?? 99;
        const bIdx = order[b.symbol] ?? 99;
        if (aIdx !== bIdx) return aIdx - bIdx;
      }
      return a.symbol.localeCompare(b.symbol);
    });

    const mapped = sorted.map((it) => {
      const agrarAsset = findOrderedAgrarAsset(it.symbol);
      if (isAllOrLive && agrarAsset) {
        const basePayload = payloads[agrarAsset.file] ? enforceTrendEngineDefaultOff(payloads[agrarAsset.file]) : null;
        const withCandleBadge = applyCandleScaleMismatchBadge(basePayload, agrarAsset.source, "D", candleScaleAuditMap);
        const finalPayload = applyAgrarParityBadge(withCandleBadge, agrarAsset.source, "D", agrarParityAuditMap);
        const labeled = applyMonitoringChartLabel({
          key: agrarAsset.code,
          code: agrarAsset.code,
          assetId: agrarAsset.assetId,
          strategy: agrarAsset.strategy,
          tv: agrarAsset.source,
          payload: finalPayload,
          variant: "compact" as const,
          timeframe: "D",
          universeGroup: "Agrar",
          eventsFile: undefined as string | undefined,
        });
        if (uiPrefs.language === "de") {
          return { ...labeled, name: translateMonitoringTerm(labeled.name, "de") };
        }
        return labeled;
      }

      if (isAllOrLive && isIntradayMtUniverseItem(it)) {
        const itemTf = normalizeIntradayTf(it.timeframe);
        const spec = INTRADAY_MT_ASSETS.find(
          (row) => row.source === it.source && normalizeIntradayTf(row.timeframe) === itemTf,
        );
        const code = spec?.displaySymbol ?? it.symbol;
        const eventsFile = strategyEventsCandidatesForItem(strategyRuntimeRoutes, it)[0]
          ?? strategyEventsFileFromSourceTf(it.source, itemTf);
        const basePayload = payloads[intradayMtPayloadKey(it)] ?? null;
        const labeled = applyMonitoringChartLabel({
          key: `${it.tab}:${code}`,
          code,
          tv: it.source,
          strategy: it.missingPineScript ? "missing_pine_script" : (basePayload?.metadata?.strategy ?? ""),
          payload: applyCandleScaleMismatchBadge(basePayload, it.source, itemTf, candleScaleAuditMap),
          variant: "compact" as const,
          timeframe: itemTf,
          universeGroup: "Intraday MT",
          eventsFile: eventsFile ?? undefined,
        });
        if (uiPrefs.language === "de") {
          return { ...labeled, name: translateMonitoringTerm(labeled.name, "de") };
        }
        return labeled;
      }

        const tf = monitoringTimeframeForItem(it, activeTab);
      const _pKey = monitoringPayloadKeyForItem(it, activeTab);
      const _freshPayload = payloads[_pKey] ?? null;
      const _wave1Payload = wave1Prepared.payloadBySymbol[_pKey] ?? null;
      const basePayload = (_freshPayload?.bars?.length ? _freshPayload : _wave1Payload) ?? _freshPayload ?? null;
      const eventsFile = strategyEventsCandidatesForItem(strategyRuntimeRoutes, it)[0]
        ?? strategyEventsFileFromSourceTf(it.source, tf);
      const group = normalizeGroup(it.tab);
      let effectivePayload = applyCandleScaleMismatchBadge(basePayload, it.source, tf, candleScaleAuditMap);
      // Stub assets (e.g. UKX!/FTSE 100 placeholder): force a visible DATA STUB badge so the
      // template (DAX-shaped) candles are never mistaken for real, parity-approved data.
      if (it.stub && effectivePayload) {
        effectivePayload = {
          ...effectivePayload,
          metadata: {
            ...effectivePayload.metadata,
            badge: "DATA STUB",
            badgeTooltip:
              "DATA_STUB · TEMPLATE_FROM_DAX · NOT_LIVE · NOT_PARITY_APPROVED — Platzhalter-Kerzen aus DAX kopiert, keine echten Daten, keine Live-Signale, keine Parität.",
            hasStrategy: false,
          },
        };
      }
      const labeled = applyMonitoringChartLabel({
        key: `${it.tab}:${it.symbol}`,
        code: it.symbol,
        tv: it.source,
        assetId: agrarAssetIdByCode[it.symbol],
        strategy: basePayload?.metadata?.strategy ?? "",
        payload: effectivePayload,
        variant: isAllOrLive ? ("compact" as const) : ("large" as const),
        timeframe: tf,
        universeGroup: group,
        eventsFile: eventsFile ?? undefined,
      });
      if (uiPrefs.language === "de") {
        return { ...labeled, name: translateMonitoringTerm(labeled.name, "de") };
      }
      return labeled;
    });
    if (isAllOrLive) return mapped;
    return mapped.slice(0, MAX_GRID_CHARTS);
  }, [activeTab, agrarParityAuditMap, candleScaleAuditMap, filteredUniverseItems, payloads, strategyRuntimeRoutes, uiPrefs.language, wave1Prepared.payloadBySymbol]);

  const chartScopeItems = useMemo(() => (
    activeTab === "agrar" ? orderedItems : allItems
  ), [activeTab, allItems, orderedItems]);

  const agrarCardLiveStateBySymbol = useMemo(() => {
    const out = { ...agrarLiveState };
    for (const asset of ORDERED_ASSETS) {
      const engineResult = agriEngineResultsBySymbol[asset.code];
      if (!engineResult) {
        if (useUnifiedAgrarStrategyWorkspace) {
          out[asset.code] = {
            ...out[asset.code],
            tradeStatus: "none",
            positionDirection: null,
            entryPrice: null,
            stopLoss: null,
            takeProfit: null,
            openTrade: false,
            sourceUsed: "agri_final_engine_pending",
          };
        }
        continue;
      }
      const readiness = agriFinalStatus?.assets?.[asset.code]?.liveReadiness?.status ?? engineResult.agriAudit?.liveReadiness?.status ?? null;
      const allowLiveBox = readiness === "READY" || readiness === "PROVISIONAL_ONLY";
      const openTrade = allowLiveBox ? engineResult.openTrade : null;
      out[asset.code] = {
        symbol: asset.code,
        short: asset.short,
        displayName: asset.name,
        source: asset.source,
        latestTimestamp: engineResult.liveSignal?.basedOnLatestBarTime ?? out[asset.code]?.latestTimestamp ?? null,
        open: out[asset.code]?.open ?? null,
        high: out[asset.code]?.high ?? null,
        low: out[asset.code]?.low ?? null,
        close: out[asset.code]?.close ?? null,
        volume: out[asset.code]?.volume ?? null,
        tradeStatus: openTrade ? "open" : (out[asset.code]?.tradeStatus ?? "none"),
        positionDirection: openTrade
          ? (openTrade.direction === "LONG" ? "long" : "short")
          : (out[asset.code]?.positionDirection ?? null),
        entryPrice: openTrade?.entryPrice ?? out[asset.code]?.entryPrice ?? null,
        stopLoss: openTrade?.stopLossPrice ?? engineResult.liveSignal?.stopLoss ?? out[asset.code]?.stopLoss ?? null,
        takeProfit: openTrade?.takeProfitPrice ?? engineResult.liveSignal?.takeProfit ?? out[asset.code]?.takeProfit ?? null,
        openTrade: Boolean(openTrade),
        sourceUsed: "agri_final_engine_runtime",
        updatedAt: engineResult.liveSignal?.timestamp ?? out[asset.code]?.updatedAt ?? null,
      };
    }
    return out;
  }, [agriEngineResultsBySymbol, agriFinalStatus?.assets, agrarLiveState, useUnifiedAgrarStrategyWorkspace]);

  const lifecycleTradesByItemKey = useMemo<Record<string, TradeLifecycle[]>>(() => {
    const out: Record<string, TradeLifecycle[]> = {};
    for (const item of chartScopeItems) {
      const itemGroup = String((item as Record<string, unknown>)?.universeGroup || "");
      const isAgrarStrategyCard = isActiveMonitoringAgrarSymbol(item.code);
      const effectiveGroup = isAgrarStrategyCard ? "Agrar" : itemGroup;
      const agriEngineResult = isAgrarStrategyCard ? agriEngineResultsBySymbol[item.code] ?? null : null;
      if (agriEngineResult) {
        const readiness = agriFinalStatus?.assets?.[item.code]?.liveReadiness?.status ?? agriEngineResult.agriAudit?.liveReadiness?.status ?? null;
        const allowLiveBox = readiness === "READY" || readiness === "PROVISIONAL_ONLY";
        const engineRows = [
          ...(agriEngineResult.rawTrades ?? []),
          ...(agriEngineResult.openTrade && allowLiveBox ? [{
            tradeId: `${item.code}_open`,
            strategyId: item.key,
            strategyName: item.strategy ?? item.name,
            symbol: item.code,
            direction: agriEngineResult.openTrade.direction,
            entryTime: agriEngineResult.openTrade.entryTime,
            entryPrice: agriEngineResult.openTrade.entryPrice,
            exitTime: null,
            exitPrice: null,
            stopLossPrice: agriEngineResult.openTrade.stopLossPrice,
            takeProfitPrice: agriEngineResult.openTrade.takeProfitPrice,
            exitReason: null,
            quantity: 1,
            source: "engine",
          }] : []),
        ];
        out[item.key] = buildTradeLifecycleFromRows(engineRows, {
          strategyId: item.key,
          symbol: item.code,
          group: effectiveGroup,
          timeframe: item.timeframe ?? "D",
          source: "engine",
          sourceFile: "agri_final_engine_runtime",
        });
        continue;
      }
      if (useUnifiedAgrarStrategyWorkspace && isAgrarStrategyCard) {
        out[item.key] = [];
        continue;
      }
      const payloadFile = String(item.payload?.metadata?.strategyEventsFile || "").trim();
      const primaryFile = pickPreferredEventsFile(
        [
          payloadFile,
          ...strategyEventsCandidatesForItem(strategyRuntimeRoutes, item),
        ],
        strategyEventsByFile,
      );
      if (!primaryFile) {
        out[item.key] = [];
        continue;
      }
      const primaryRows = mergeTradesFromEventsPayload(strategyEventsByFile[primaryFile]);
      const primaryLifecycle = buildTradeLifecycleFromRows(primaryRows, {
        strategyId: item.key,
        symbol: item.code,
        group: effectiveGroup,
        timeframe: item.timeframe ?? "D",
        source: lifecycleSourceFromEventsFile(primaryFile),
        sourceFile: primaryFile,
      });
      const fallbackLifecycleGroups: TradeLifecycle[][] = [];

      const fallbackFile = String(item.payload?.metadata?.strategyEventsFallbackFile || "").trim();
      if (fallbackFile && fallbackFile !== primaryFile) {
        fallbackLifecycleGroups.push(
          buildTradeLifecycleFromRows(
            mergeTradesFromEventsPayload(strategyEventsByFile[fallbackFile]),
            {
              strategyId: item.key,
              symbol: item.code,
              group: effectiveGroup,
              timeframe: item.timeframe ?? "D",
              source: lifecycleSourceFromEventsFile(fallbackFile),
              sourceFile: fallbackFile,
            },
          ),
        );
      }
      const fallbackCandidates = Array.isArray(item.payload?.metadata?.strategyEventsFallbackCandidates)
        ? item.payload?.metadata?.strategyEventsFallbackCandidates
        : [];
      for (const file of fallbackCandidates) {
        const key = String(file || "").trim();
        if (!key || key === primaryFile || key === fallbackFile) continue;
        fallbackLifecycleGroups.push(
          buildTradeLifecycleFromRows(
            mergeTradesFromEventsPayload(strategyEventsByFile[key]),
            {
              strategyId: item.key,
              symbol: item.code,
              group: effectiveGroup,
              timeframe: item.timeframe ?? "D",
              source: lifecycleSourceFromEventsFile(key),
              sourceFile: key,
            },
          ),
        );
      }
      const sourceKey = normalizeSourceKey(item.tv ?? item.code ?? null);
      const sourceFallbackTrades = sourceKey ? (tradingViewTradesBySource[sourceKey] ?? []) : [];
      if (sourceFallbackTrades.length) {
        fallbackLifecycleGroups.push(
          buildTradeLifecycleFromRows(sourceFallbackTrades, {
            strategyId: item.key,
            symbol: item.code,
            group: effectiveGroup,
            timeframe: item.timeframe ?? "D",
            source: "engine",
            sourceFile: "generated_monitoring_events",
          }),
        );
      }
      let merged = primaryLifecycle;
      for (const fallbackRows of fallbackLifecycleGroups) {
        merged = mergeLifecycleTrades(merged, fallbackRows);
      }
      out[item.key] = merged;
    }
    return out;
  }, [agriEngineResultsBySymbol, agriFinalStatus?.assets, chartScopeItems, strategyEventsByFile, strategyRuntimeRoutes, tradingViewTradesBySource, useUnifiedAgrarStrategyWorkspace]);

  const preparedTradesByItemKey = useMemo<Record<string, ReturnType<typeof mergeTradesFromEventsPayload>>>(() => {
    const out: Record<string, ReturnType<typeof mergeTradesFromEventsPayload>> = { ...wave1Prepared.tradesByItemKey };
    for (const [key, rows] of Object.entries(lifecycleTradesByItemKey)) {
      if (out[key]?.length) continue;
      out[key] = rows.map((row) => lifecycleToTradeRow(row)) as ReturnType<typeof mergeTradesFromEventsPayload>;
    }
    return out;
  }, [lifecycleTradesByItemKey, wave1Prepared.tradesByItemKey]);

  const liveSignalsFeed = useMemo(() => {
    const mapTab: TabId = "all";
    const scopeItems: Array<{
      key: string;
      code: string;
      name: string;
      strategy?: string;
      tv?: string;
      assetId?: string;
      timeframe?: string;
      universeGroup?: string;
      payload: MonitoringPayload | null;
    }> = [];
    const tradesByKey: Record<string, TradeLifecycle[]> = {};
    const agrarAssetIdByCode = Object.fromEntries(ORDERED_ASSETS.map((asset) => [asset.code, asset.assetId]));
    // NOTE: engine_state/index.json `openTrades` is a periodically-regenerated snapshot
    // that can go stale and contradict the per-strategy events ledger (e.g. it lists PA1!
    // as open even though PA1!'s ledger closed that position via stop_loss). The
    // authoritative "currently open" sources are live_state/open_trades.json + each
    // strategy's events lifecycle, so we do NOT inject the snapshot openTrades here.
    const engineRows = (Array.isArray(engineStateIndexPayload?.strategies) ? engineStateIndexPayload.strategies : [])
      .flatMap((row) => [
        ...(Array.isArray(row?.todayEntries) ? row.todayEntries : []),
        ...(Array.isArray(row?.todayExits) ? row.todayExits : []),
      ]);
    const liveRows = [
      ...engineRows,
      ...(Array.isArray(liveStatePayload?.openTrades) ? liveStatePayload.openTrades : []),
      ...(Array.isArray(liveStatePayload?.exitsToday) ? liveStatePayload.exitsToday : []),
    ];

    const liveScanUniverse = applyMonitoringUniverseFilters(
      universeAssets.filter((asset) => {
        const group = normalizeGroup(asset.tab);
        if (group === "FX") return false;
        if (group === "Intraday MT") return true;
        return ["Agrar", "Metalle", "Energie", "Metalle+Energie", "Indizes", "Aktien", "Invest"].includes(group);
      }),
      { replaceAgrarWithOrdered: true },
    );

    for (const it of liveScanUniverse) {
      if (!it.hasData || !it.buildable) continue;
      const routeForItem = resolveStrategyRuntimeRoute(strategyRuntimeRoutes, it);
      let scopeItem: (typeof scopeItems)[number] | null = null;

      const agrarAsset = findOrderedAgrarAsset(it.symbol);
      if (agrarAsset) {
        const basePayload = payloads[agrarAsset.file] ? enforceTrendEngineDefaultOff(payloads[agrarAsset.file]) : null;
        const withCandleBadge = applyCandleScaleMismatchBadge(basePayload, agrarAsset.source, "D", candleScaleAuditMap);
        const finalPayload = applyAgrarParityBadge(withCandleBadge, agrarAsset.source, "D", agrarParityAuditMap);
        scopeItem = applyMonitoringChartLabel({
          key: agrarAsset.code,
          code: agrarAsset.code,
          assetId: agrarAsset.assetId,
          strategy: agrarAsset.strategy,
          tv: agrarAsset.source,
          timeframe: "D",
          universeGroup: "Agrar",
          payload: finalPayload,
        });
      } else if (isIntradayMtUniverseItem(it)) {
        const itemTf = normalizeIntradayTf(it.timeframe);
        const spec = INTRADAY_MT_ASSETS.find((row) => row.source === it.source && normalizeIntradayTf(row.timeframe) === itemTf);
        const code = spec?.displaySymbol ?? it.symbol;
        scopeItem = applyMonitoringChartLabel({
          key: `${it.tab}:${code}`,
          code,
          tv: it.source,
          strategy: it.missingPineScript ? "missing_pine_script" : (payloads[intradayMtPayloadKey(it)]?.metadata?.strategy ?? ""),
          timeframe: itemTf,
          universeGroup: "Intraday MT",
          payload: applyCandleScaleMismatchBadge(payloads[intradayMtPayloadKey(it)] ?? null, it.source, itemTf, candleScaleAuditMap),
        });
      } else {
        const tf = monitoringTimeframeForItem(it, mapTab);
        const group = normalizeGroup(it.tab);
        scopeItem = applyMonitoringChartLabel({
          key: `${it.tab}:${it.symbol}`,
          code: it.symbol,
          tv: it.source,
          assetId: agrarAssetIdByCode[it.symbol],
          strategy: payloads[monitoringPayloadKeyForItem(it, mapTab)]?.metadata?.strategy ?? "",
          timeframe: tf,
          universeGroup: group,
          payload: applyCandleScaleMismatchBadge(payloads[monitoringPayloadKeyForItem(it, mapTab)] ?? null, it.source, tf, candleScaleAuditMap),
        });
      }
      if (!scopeItem) continue;
      scopeItems.push(scopeItem);

      const routeStrategyId = String(routeForItem?.strategyId || "").trim().toLowerCase();
      const routeAssetCodes = new Set<string>([
        normalizeAssetCode(routeForItem?.asset ?? null),
        normalizeAssetCode(routeForItem?.universeSymbol ?? null),
        normalizeAssetCode(it.symbol),
        normalizeAssetCode(scopeItem.code),
      ].filter(Boolean));
      const routeTf = normalizeIntradayTf(routeForItem?.timeframe ?? scopeItem.timeframe ?? "D");

      const routeSourceMode = String(routeForItem?.sourceMode || "").trim().toLowerCase();
      let lifecycleTrades = routeSourceMode === "csv_reference"
        ? []
        : [...(lifecycleTradesByItemKey[scopeItem.key] ?? [])];
      // The cached lifecycle map is keyed by the ACTIVE tab's chart scope items, so on
      // non-"all" tabs intraday/index items are absent (their key never gets built).
      // Build their lifecycle directly from the events ledger so the live feed is
      // tab-independent — this surfaces DAX40 2H (end_of_data open), ES1!, and the
      // this-week-closed intraday trades regardless of which tab is active.
      if (!lifecycleTrades.length && routeSourceMode !== "csv_reference") {
        const eventsCandidates = [
          ...strategyEventsCandidatesForItem(strategyRuntimeRoutes, it),
          strategyEventsFileFromSourceTf(it.source, scopeItem.timeframe || "D"),
        ].filter(Boolean) as string[];
        const primaryFile = pickPreferredEventsFile(eventsCandidates, strategyEventsByFile);
        if (primaryFile) {
          lifecycleTrades = buildTradeLifecycleFromRows(
            mergeTradesFromEventsPayload(strategyEventsByFile[primaryFile]),
            {
              strategyId: routeForItem?.strategyId || scopeItem.key,
              symbol: scopeItem.code,
              group: scopeItem.universeGroup || "",
              timeframe: scopeItem.timeframe || "D",
              source: lifecycleSourceFromEventsFile(primaryFile),
              sourceFile: primaryFile,
            },
          );
        }
      }
      const liveLifecycleRows: TradeLifecycle[] = [];
      for (const row of liveRows) {
        const rowStrategyId = String(row?.strategyId || "").trim().toLowerCase();
        const rowSymbol = normalizeAssetCode(row?.symbol ?? null);
        const rowTf = normalizeIntradayTf(row?.timeframe ?? routeTf);
        const strategyMatch = Boolean(routeStrategyId && rowStrategyId && routeStrategyId === rowStrategyId);
        const symbolMatch = Boolean(rowSymbol && routeAssetCodes.has(rowSymbol));
        if (!(strategyMatch || symbolMatch) || rowTf !== routeTf) continue;
        const lifecycle = lifecycleFromLiveStateRow(row, {
          strategyId: routeForItem?.strategyId || scopeItem.key,
          symbol: scopeItem.code,
          group: scopeItem.universeGroup || "",
          timeframe: scopeItem.timeframe || "D",
          sourceFile: "live_state/open_trades.json",
        });
        if (lifecycle) liveLifecycleRows.push(lifecycle);
      }
      if (liveLifecycleRows.length) {
        lifecycleTrades = mergeLifecycleTrades(lifecycleTrades, liveLifecycleRows);
      }
      tradesByKey[scopeItem.key] = lifecycleTrades;
    }

    const rawFeed = buildLiveSignalsFeedFromLifecycle(
      scopeItems.map((item) => ({
        ...item,
        payload: item.payload
          ? {
              bars: item.payload.bars?.map((bar) => ({
                time: bar.time ?? undefined,
                close: bar.close ?? undefined,
              })),
            }
          : null,
      })),
      tradesByKey,
      monitoringTabIdForGroup,
    );
    // manual_verified_live_state has highest priority — overrides all engine/csv/snapshot sources
    const feed = applyManualVerifiedOverrides(rawFeed, manualVerifiedPayload);

    // Fallback: if the monitoring lifecycle produced no open signals (e.g. on Vercel without
    // local Brain data), inject forward-logger open trades so the Live Signals panel is not empty.
    if (feed.openTrades.length === 0 && Array.isArray(forwardLogger?.openTrades) && forwardLogger.openTrades.length > 0) {
      const now = Date.now();
      const injected: LiveSignalRow[] = (forwardLogger.openTrades as Array<Record<string, string> & { lastClose?: number | null; unrealizedPct?: number | null }>)
        .flatMap((r, i) => {
          const sym = (r.symbol ?? "").toUpperCase();
          const dir = (r.direction ?? "").toLowerCase() as "long" | "short";
          if (!sym || (dir !== "long" && dir !== "short")) return [];
          const entryMs = r.entry_date ? new Date(r.entry_date).getTime() : now;
          const entry = parseFloat(r.entry_price ?? "") || null;
          const sl = parseFloat(r.stop_loss ?? "") || null;
          const tp = parseFloat(r.take_profit ?? "") || null;
          const current = r.lastClose ?? null;
          const diffMs = now - entryMs;
          const mins = Math.floor(diffMs / 60_000);
          const durationLabel = mins < 60 ? `seit ${mins}m` : mins < 1440 ? `seit ${Math.floor(mins / 60)}h` : `seit ${Math.floor(mins / 1440)}d`;
          const row: LiveSignalRow = {
            id: `fwd-${sym}-${i}`,
            tradeId: r.trade_id ?? r.tradeId ?? `fwd-${sym}-${i}`,
            itemKey: sym,
            tabId: "all" as const,
            symbol: sym,
            name: sym,
            strategy: r.strategy ?? "-",
            group: "Forward",
            direction: dir,
            status: "OPEN" as const,
            entryTime: r.entry_date ?? new Date(now).toISOString(),
            exitTime: null,
            entryPrice: entry,
            currentPrice: typeof current === "number" ? current : null,
            exitPrice: null,
            stopLossPrice: sl,
            takeProfitPrice: tp,
            hasStopLoss: sl != null && sl > 0,
            hasTakeProfit: tp != null && tp > 0,
            sourceLabel: "csv_reference",
            isOpen: true,
            entryToday: false,
            exitToday: false,
            staleStatus: "fresh" as const,
            lastCandleTime: null,
            dataAgeLabel: "",
            durationLabel,
            signalTimeLabel: r.entry_date ?? "",
            plApprox: null,
            plPct: typeof r.unrealizedPct === "number" ? r.unrealizedPct : null,
          };
          return [row];
        });
      return { ...feed, openTrades: injected, openCount: injected.length };
    }

    return feed;
  }, [
    agrarParityAuditMap,
    candleScaleAuditMap,
    payloads,
    engineStateIndexPayload,
    liveStatePayload,
    manualVerifiedPayload,
    universeAssets,
    strategyRuntimeRoutes,
    lifecycleTradesByItemKey,
    strategyEventsByFile,
    forwardLogger,
  ]);

  // Live-signal card colours come from the user's chart/UI overlay settings
  // (Entry=blue / Stop Loss=red / Take Profit=green), not hard-coded values.
  const liveSignalColors = useMemo(() => ({
    entry: uiPrefs?.overlayEntryColor ?? "#3b82f6",
    sl: uiPrefs?.overlaySlColor ?? "#ff3b46",
    tp: uiPrefs?.overlayTpColor ?? "#22c55e",
  }), [uiPrefs?.overlayEntryColor, uiPrefs?.overlaySlColor, uiPrefs?.overlayTpColor]);

  const liveSignalsRefreshLabel = useMemo(() => {
    if (refreshStatus === "running") return "Live-Daten: aktualisiere…";
    if (!manifestGeneratedAt) return "Live-Daten: —";
    const secs = Math.floor((Date.now() - new Date(manifestGeneratedAt).getTime()) / 1000);
    if (secs < 90) return "Live-Daten: gerade eben";
    const mins = Math.floor(secs / 60);
    return mins < 60 ? `Live-Daten: vor ${mins} Min` : "Live-Daten: vor >1h";
  }, [manifestGeneratedAt, refreshStatus]);

  // Per-item live-signal state for the All-tab radar mosaic ranking. Derived only
  // from the already-computed live feed — no extra fetches or engine runs.
  const radarSignalState = useMemo(() => {
    // Track open / fresh-entry / closed separately so the radar can rank an OPEN trade
    // strictly above any CLOSED signal (a just-closed intraday must never outrank a
    // multi-day open swing like SB1!/Sugar).
    const raw: Record<string, { openMs: number | null; freshEntryMs: number | null; closedMs: number | null }> = {};
    const ensure = (key: string) => (raw[key] ??= { openMs: null, freshEntryMs: null, closedMs: null });
    const maxMs = (a: number | null, b: number | null) => (b == null ? a : a == null ? b : Math.max(a, b));
    for (const r of liveSignalsFeed.openTrades) {
      if (!r.itemKey) continue;
      ensure(r.itemKey).openMs = maxMs(raw[r.itemKey].openMs, parseTradeTimestampValue(r.entryTime));
    }
    for (const r of liveSignalsFeed.entriesToday) {
      if (!r.itemKey) continue;
      ensure(r.itemKey).freshEntryMs = maxMs(raw[r.itemKey].freshEntryMs, parseTradeTimestampValue(r.entryTime));
    }
    for (const r of liveSignalsFeed.exitsToday) {
      if (!r.itemKey) continue;
      ensure(r.itemKey).closedMs = maxMs(raw[r.itemKey].closedMs, parseTradeTimestampValue(r.exitTime ?? r.entryTime));
    }
    for (const r of (liveSignalsFeed.closedThisWeek ?? [])) {
      if (!r.itemKey) continue;
      ensure(r.itemKey).closedMs = maxMs(raw[r.itemKey].closedMs, parseTradeTimestampValue(r.exitTime ?? r.entryTime));
    }

    // Hero (activeSignal) = a recent open trade (≤ 21 days) OR a fresh still-active entry
    // (today/yesterday) that has NOT been closed. A closed-only signal — however recent —
    // is never a hero. A stale open (> 21 days) is also no longer a hero.
    const RADAR_OPEN_MAX_AGE_MS = 21 * 24 * 60 * 60_000;
    const RADAR_FRESH_ENTRY_MS = 2 * 24 * 60 * 60_000;
    const nowMs = Date.now();
    const map: Record<string, { activeSignal: boolean; hasOpenTrade: boolean; isClosedSignal: boolean; lastSignalMs: number | null }> = {};
    for (const [key, m] of Object.entries(raw)) {
      const openAge = m.openMs != null ? nowMs - m.openMs : Infinity;
      const freshAge = m.freshEntryMs != null ? nowMs - m.freshEntryMs : Infinity;
      const hasOpenTrade = m.openMs != null && openAge <= RADAR_OPEN_MAX_AGE_MS;
      const hasClosed = m.closedMs != null;
      const freshActive = m.freshEntryMs != null && !hasClosed && m.openMs == null && freshAge <= RADAR_FRESH_ENTRY_MS;
      const activeSignal = hasOpenTrade || freshActive;
      const isClosedSignal = hasClosed && m.openMs == null;
      const lastSignalMs = maxMs(maxMs(m.openMs, m.freshEntryMs), m.closedMs);
      map[key] = { activeSignal, hasOpenTrade, isClosedSignal, lastSignalMs };
    }
    return map;
  }, [liveSignalsFeed]);

  // Live tab = the All-tab items filtered to charts that actually carry a signal in the
  // last 7 days (open trades, fresh active signals, recently-closed). Signal-less charts
  // are dropped so the Live tab renders far fewer charts than All. Pure filter, no fetch.
  const liveTabItems = useMemo(() => {
    if (activeTab !== "live") return [] as typeof allItems;
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60_000;
    const now = Date.now();
    return allItems.filter((it) => {
      const sig = radarSignalState[it.key];
      if (!sig) return false;
      if (sig.hasOpenTrade || sig.activeSignal) return true;
      return sig.lastSignalMs != null && now - sig.lastSignalMs <= SEVEN_DAYS_MS;
    });
  }, [activeTab, allItems, radarSignalState]);

  const liveTabCounts = useMemo(() => {
    let open = 0, fresh = 0, closed = 0;
    for (const it of liveTabItems) {
      const sig = radarSignalState[it.key];
      if (!sig) continue;
      if (sig.hasOpenTrade) open += 1;
      else if (sig.activeSignal) fresh += 1;
      else closed += 1;
    }
    return { open, fresh, closed };
  }, [liveTabItems, radarSignalState]);

  // Honest per-signal provenance for the Live tab (dezent chip). Derived from the real
  // strategy-events source mode — no "live approved" claim anywhere.
  const liveSourceByKey = useMemo(() => {
    if (activeTab !== "live") return {} as Record<string, string>;
    const out: Record<string, string> = {};
    for (const it of liveTabItems) {
      const mode = String(
        (it.payload?.metadata as { strategyEventsSourceMode?: string | null } | undefined)?.strategyEventsSourceMode ?? "",
      ).trim().toLowerCase();
      out[it.key] =
        mode === "csv_reference" ? "csv_reference"
        : mode === "hybrid_csv_engine" || mode === "hybrid" ? "hybrid"
        : mode === "base" || mode === "engine" ? "engine"
        : mode === "manual_verified" ? "manual_verified"
        : "live_state";
    }
    return out;
  }, [activeTab, liveTabItems]);

  const onFocusLiveSignal = useCallback((row: { tabId: TabId; itemKey: string; tradeId: string }) => {
    // Navigate to the right tab + focus the chart on the signal. Do NOT open the
    // Trade-Ausführen panel or the Strategy Tester from the Live panel.
    if (row.tabId !== "all" && row.tabId !== activeTab) {
      setActiveTabPersisted(row.tabId);
    }
    setSelectedAssetId(row.itemKey);
    setExecutionFocusTradeId(row.tradeId);
  }, [activeTab]);

  const activeChart = useMemo(() => {
    if (!selectedAssetId) return null;
    return chartScopeItems.find((x) => x.key === selectedAssetId) ?? null;
  }, [chartScopeItems, selectedAssetId]);

  const fullscreenItem = useMemo(
    () => (fullscreenAssetId ? chartScopeItems.find((x) => x.key === fullscreenAssetId) ?? null : null),
    [fullscreenAssetId, chartScopeItems],
  );
  const strategyTesterSelectedChart = useMemo(() => {
    if (!selectedAssetId) return null;
    return chartScopeItems.find((x) => x.key === selectedAssetId) ?? null;
  }, [chartScopeItems, selectedAssetId]);

  const strategyTesterScopeItems = useMemo(() => {
    if (!showStrategyTesterWorkspace) return [] as ChartItem[];
    if (strategyTesterSelectedChart) return [strategyTesterSelectedChart];
    return chartScopeItems;
  }, [chartScopeItems, showStrategyTesterWorkspace, strategyTesterSelectedChart]);

  const strategyTesterScopeKey = useMemo(
    () => strategyTesterScopeItems.map((item) => item.key).sort().join("|"),
    [strategyTesterScopeItems],
  );

  const strategyTesterIsGroupMode = strategyTesterScopeItems.length > 1;
  const strategyTesterChart = strategyTesterIsGroupMode ? null : (strategyTesterScopeItems[0] ?? null);
  const strategyTesterIsOrangeJuice = useMemo(() => {
    if (strategyTesterIsGroupMode) return false;
    const code = String(strategyTesterChart?.code || "").trim().toUpperCase();
    const tv = normalizeSourceKey(strategyTesterChart?.tv);
    return code === "OJ1!" || tv === "ICEUS:OJ1!";
  }, [strategyTesterChart?.code, strategyTesterChart?.tv, strategyTesterIsGroupMode]);
  const strategyTesterIsEs1 = useMemo(() => {
    if (strategyTesterIsGroupMode) return false;
    const code = String(strategyTesterChart?.code || "").trim().toUpperCase();
    const tv = normalizeSourceKey(strategyTesterChart?.tv);
    return code === "ES1!" || tv === "CME_MINI:ES1!";
  }, [strategyTesterChart?.code, strategyTesterChart?.tv, strategyTesterIsGroupMode]);
  const strategyTesterIsPa1 = useMemo(() => {
    if (strategyTesterIsGroupMode) return false;
    const code = String(strategyTesterChart?.code || "").trim().toUpperCase();
    const tv = normalizeSourceKey(strategyTesterChart?.tv);
    return code === "PA1!" || tv === "NYMEX:PA1!";
  }, [strategyTesterChart?.code, strategyTesterChart?.tv, strategyTesterIsGroupMode]);
  const strategyTesterIsPl1 = useMemo(() => {
    if (strategyTesterIsGroupMode) return false;
    const code = String(strategyTesterChart?.code || "").trim().toUpperCase();
    const tv = normalizeSourceKey(strategyTesterChart?.tv);
    return code === "PL1!" || tv === "NYMEX:PL1!";
  }, [strategyTesterChart?.code, strategyTesterChart?.tv, strategyTesterIsGroupMode]);
  const strategyTesterCustomEngineKey = useMemo<string | null>(() => {
    if (strategyTesterIsOrangeJuice) return "orange_juice_custom";
    if (strategyTesterIsEs1) return "es1_custom";
    if (strategyTesterIsPa1) return "pa1_custom";
    if (strategyTesterIsPl1) return "pl1_custom";
    return null;
  }, [strategyTesterIsEs1, strategyTesterIsOrangeJuice, strategyTesterIsPa1, strategyTesterIsPl1]);
  const strategyTesterCustomEngineSource = useMemo(() => {
    if (strategyTesterCustomEngineKey === "orange_juice_custom") return "local_pine_engine_orange_juice";
    if (strategyTesterCustomEngineKey === "es1_custom") return "local_pine_engine_es1";
    if (strategyTesterCustomEngineKey === "pa1_custom") return "local_pine_engine_pa1";
    if (strategyTesterCustomEngineKey === "pl1_custom") return "local_pine_engine_pl1";
    return "local_pine_engine_orange_juice";
  }, [strategyTesterCustomEngineKey]);
  const strategyTesterCustomEnginePilotEnabled = useMemo(() => {
    if (strategyTesterCustomEngineKey === "orange_juice_custom") return customOrangeJuiceEnginePilotEnabled;
    if (strategyTesterCustomEngineKey === "es1_custom") return customEs1EnginePilotEnabled;
    if (strategyTesterCustomEngineKey === "pa1_custom") return customPa1EnginePilotEnabled;
    if (strategyTesterCustomEngineKey === "pl1_custom") return customPl1EnginePilotEnabled;
    return false;
  }, [
    customEs1EnginePilotEnabled,
    customOrangeJuiceEnginePilotEnabled,
    customPa1EnginePilotEnabled,
    customPl1EnginePilotEnabled,
    strategyTesterCustomEngineKey,
  ]);
  const strategyTesterScopeSources = useMemo(
    () => Array.from(new Set(strategyTesterScopeItems.map((item) => normalizeSourceKey(item.tv)).filter(Boolean))),
    [strategyTesterScopeItems],
  );
  const activeParityRow = useMemo(() => {
    if (!strategyTesterScopeItems.length) return null;
    // Check if all items use csv_import events — derive files directly from items to avoid forward refs
    const itemEventFiles = strategyTesterScopeItems.map((item) => {
      const payloadFile = String(item.payload?.metadata.strategyEventsFile || "").trim();
      const eventFile = pickPreferredEventsFile(
        [
          payloadFile,
          ...strategyEventsCandidatesForItem(strategyRuntimeRoutes, item),
        ],
        strategyEventsByFile,
      );
      return eventFile;
    }).filter(Boolean);
    const scopePayloads = itemEventFiles.map((f) => strategyEventsByFile[f] ?? null).filter(Boolean);
    const allCsvImport = scopePayloads.length > 0
      && scopePayloads.every((p) => p?.source === "csv_import" || p?.source === "csv_reference");
    if (allCsvImport) {
      return { badgeStatus: "CSV_REFERENCE", parityPercent: undefined } as AgrarParityAuditRow;
    }
    // Hybrid engine: source = "hybrid_csv_engine"
    const allHybrid = scopePayloads.length > 0 && scopePayloads.every((p) => p?.source === "hybrid_csv_engine");
    if (allHybrid) {
      const engineParity = Number((scopePayloads[0] as Record<string, unknown>)?.engineParity ?? 0);
      const engineStatus = String((scopePayloads[0] as Record<string, unknown>)?.engineStatus ?? "OVERLAP_PASS");
      return {
        badgeStatus: engineStatus === "OVERLAP_PASS" ? "HYBRID_ENGINE_PASS"
                   : engineStatus === "OVERLAP_WARN" ? "HYBRID_ENGINE_WARN"
                   : "HYBRID_ENGINE",
        parityPercent: engineParity > 0 ? engineParity : undefined,
      } as AgrarParityAuditRow;
    }
    // Agrar parity map lookup
    const rows = strategyTesterScopeItems
      .map((item) => agrarParityAuditMap[candleScaleAuditKey(item.tv ?? null, "D")] ?? null)
      .filter((row): row is AgrarParityAuditRow => Boolean(row));
    if (!rows.length) return null;
    if (rows.length === 1) return rows[0];
    const parityValues = rows.map((row) => Number(row.parityPercent)).filter((value) => Number.isFinite(value));
    const avgParity = parityValues.length
      ? parityValues.reduce((acc, value) => acc + value, 0) / parityValues.length
      : null;
    const badgeStatus = avgParity == null ? "NOT_COMPARABLE" : avgParity >= 95 ? "LIVE_PASS" : avgParity >= 80 ? "OVERLAP_WARN" : "PARITY_FAIL";
    return {
      badgeStatus,
      parityPercent: avgParity ?? undefined,
    } as AgrarParityAuditRow;
  }, [agrarParityAuditMap, strategyEventsByFile, strategyRuntimeRoutes, strategyTesterScopeItems]);
  const activePayload = activeChart?.payload ?? null;
  const activeBadge = getBadge(activePayload);
  const activeHasStrategy = hasStrategy(activePayload, activeBadge);
  const strategyTesterHasStrategy = strategyTesterScopeItems.some((item) => hasStrategy(item.payload, getBadge(item.payload)));
  const activeEventsFile = pickPreferredEventsFile(
    [
      String(activePayload?.metadata.strategyEventsFile || "").trim(),
      ...strategyEventsCandidatesForItem(strategyRuntimeRoutes, activeChart),
    ],
    strategyEventsByFile,
  );
  const activeEventsPayload = activeEventsFile ? strategyEventsByFile[activeEventsFile] ?? null : null;
  const activeEventsSource = useMemo(() => {
    const files = strategyTesterScopeItems.map((item) => {
      const pf = String(item.payload?.metadata.strategyEventsFile || "").trim();
      return pickPreferredEventsFile(
        [
          pf,
          ...strategyEventsCandidatesForItem(strategyRuntimeRoutes, item),
        ],
        strategyEventsByFile,
      );
    }).filter(Boolean);
    const payloads = files.map((f) => strategyEventsByFile[f] ?? null).filter(Boolean);
    if (!payloads.length) return null;
    const sources = [...new Set(payloads.map((p) => p?.source ?? null).filter(Boolean))];
    return sources.length === 1 ? sources[0] ?? null : null;
  }, [strategyEventsByFile, strategyRuntimeRoutes, strategyTesterScopeItems]);
  const activeAssetConfig = useMemo(
    () => ORDERED_ASSETS.find((asset) => asset.code === (activeChart?.code ?? "")) ?? null,
    [activeChart?.code],
  );
  const strategyTesterAssetConfig = useMemo(
    () => ORDERED_ASSETS.find((asset) => asset.code === (strategyTesterChart?.code ?? "")) ?? null,
    [strategyTesterChart?.code],
  );

  useEffect(() => {
    if (!strategyTesterEnabled && !fullscreenEnabled) return;
    if (!fullHistoryInGridEnabled) return;
    const targetItem = strategyTesterOpen
      ? strategyTesterChart
      : isFullscreen
        ? fullscreenItem
        : null;
    if (!targetItem) return;
    const fsAsset = ORDERED_ASSETS.find((x) => x.code === targetItem.code);
    if (!fsAsset) return;
    if (fullHistoryBySymbol[fsAsset.code]?.length) return;
    const fallbackBars = targetItem.payload?.bars ?? [];
    let cancelled = false;
    setFullHistoryLoading(true);
    void loadFullHistoryForAsset({
      assetId: fsAsset.assetId,
      symbol: fsAsset.code,
      source: fsAsset.source,
      fallbackBars,
    }).then((result) => {
      if (cancelled) return;
      setFullHistoryBySymbol((prev) => ({ ...prev, [fsAsset.code]: result.bars }));
    }).finally(() => {
      if (!cancelled) setFullHistoryLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [
    fullHistoryBySymbol,
    fullHistoryInGridEnabled,
    fullscreenItem,
    isFullscreen,
    strategyTesterOpen,
    strategyTesterChart,
    strategyTesterEnabled,
    fullscreenEnabled,
  ]);

  const activeHistoryCandles = useMemo(() => {
    const symbol = activeChart?.code ?? "";
    const full = fullHistoryBySymbol[symbol];
    if (full?.length && !isIntradayTimeframe(activeChart?.timeframe)) return full;
    return historyCandlesForTimeframe(activeChart?.timeframe, activePayload?.bars ?? []);
  }, [activeChart?.code, activeChart?.timeframe, activePayload?.bars, fullHistoryBySymbol]);

  const strategyTesterHistoryCandles = useMemo(() => {
    if (!strategyTesterScopeItems.length) return [] as MonitoringCandle[];
    if (strategyTesterScopeItems.length === 1) {
      const item = strategyTesterScopeItems[0];
      const symbol = item?.code ?? "";
      const full = fullHistoryBySymbol[symbol];
      if (full?.length && !isIntradayTimeframe(item?.timeframe)) return full;
      return historyCandlesForTimeframe(item?.timeframe, item?.payload?.bars ?? []);
    }
    return buildSyntheticCalendarCandles([]);
  }, [fullHistoryBySymbol, strategyTesterScopeItems]);

  const activeStrategyParams = useMemo(() => {
    const params = activePayload?.metadata.params ?? [];
    const out: Record<string, unknown> = {};
    for (const p of params) out[p.key] = p.value;
    return out;
  }, [activePayload?.metadata.params]);

  const activeLatestPrice = useMemo(() => {
    const lastBar = activePayload?.bars?.[activePayload.bars.length - 1] ?? null;
    return toFinite(lastBar?.close);
  }, [activePayload?.bars]);

  const activeSignalState = useMemo(
    () => activeSetupFromEventsPayload(activeEventsPayload ?? undefined),
    [activeEventsPayload],
  );
  const activeExecutionParityStatus = useMemo(
    () => deriveExecutionParityStatus(activeBadge),
    [activeBadge],
  );
  const activeTradeCandidates = useMemo(() => {
    if (!activeChart) return [];
    const lifecycleRows = lifecycleTradesByItemKey[activeChart.key] ?? [];
    return lifecycleRows.map((row) => lifecycleToNormalizedVisualLevel(row));
  }, [activeChart, lifecycleTradesByItemKey]);

  const activeManualLevels = useMemo<ManualTradeLevels | null>(() => {
    if (!activeChart?.code) return null;
    return manualLevelsBySymbol[activeChart.code] ?? null;
  }, [activeChart?.code, manualLevelsBySymbol]);
  const nonAgrarGridEnabled = isAllOrLive
    ? allStrategiesGridEnabled
    : activeTab === "intraday_mt"
      ? intradayMTEnabled
      : true;

  useEffect(() => {
    setStrategyTesterMounted(showStrategyTesterWorkspace);
    setTradeExecutionMounted(tradeExecutionPanelEnabled);
    setAllStrategiesMounted(isAllOrLive && nonAgrarGridEnabled);
  }, [activeTab, nonAgrarGridEnabled, showStrategyTesterWorkspace, tradeExecutionPanelEnabled]);

  const strategyTesterScopeEventsFiles = useMemo(() => {
    const out = new Set<string>();
    for (const item of strategyTesterScopeItems) {
      const payloadFile = String(item.payload?.metadata.strategyEventsFile || "").trim();
      const candidates = strategyEventsCandidatesForItem(strategyRuntimeRoutes, item);
      if (payloadFile) {
        out.add(payloadFile);
      } else if (candidates.length > 0) {
        out.add(candidates[0]);
      }
    }
    return Array.from(out.values());
  }, [strategyRuntimeRoutes, strategyTesterScopeItems]);

  const strategyTesterScopeEventsPayloads = useMemo(
    () => strategyTesterScopeEventsFiles
      .map((file) => strategyEventsByFile[file] ?? null)
      .filter((payload): payload is StrategyEventsPayload => Boolean(payload)),
    [strategyEventsByFile, strategyTesterScopeEventsFiles],
  );

  useEffect(() => {
    if (!showStrategyTesterWorkspace && !tradeExecutionPanelEnabled) return;
    const targetFiles = showStrategyTesterWorkspace
      ? strategyTesterScopeEventsFiles.filter((file) => file && !strategyEventsByFile[file])
      : (activeEventsFile && !strategyEventsByFile[activeEventsFile] ? [activeEventsFile] : []);
    if (!targetFiles.length) return;
    const ctrl = new AbortController();
    const unregisterFetch = registerMonitoringFetch(ctrl);
    const run = async () => {
      try {
        const loaded = await Promise.all(targetFiles.map(async (targetFile) => {
          const payload = await fetchMonitoringJson(`/generated/monitoring/${targetFile}`, {
            signal: ctrl.signal,
            ttlMs: 5_000
          }) as StrategyEventsPayload | null;
          if (!payload || ctrl.signal.aborted) return null;
          return { targetFile, payload: normalizeStrategyEventsPayload(payload) };
        }));
        if (ctrl.signal.aborted) return;
        setStrategyEventsByFile((prev) => {
          const next = { ...prev };
          for (const row of loaded) {
            if (!row) continue;
            next[row.targetFile] = row.payload;
          }
          return next;
        });
      } catch {
        // keep silent; panel will show no backtest data
      }
    };
    void run();
    return () => {
      unregisterFetch();
      ctrl.abort();
    };
  }, [
    activeEventsFile,
    strategyEventsByFile,
    strategyTesterScopeEventsFiles,
    showStrategyTesterWorkspace,
    tradeExecutionPanelEnabled,
  ]);

  useEffect(() => {
    if (!showStrategyTesterWorkspace) return;
    if (strategyTesterDataMode !== "csv_reference") return;
    if (!strategyTesterScopeSources.length) {
      setCsvReferenceTradesBySource({});
      return;
    }
    const ctrl = new AbortController();
    const unregisterFetch = registerMonitoringFetch(ctrl);
    const run = async () => {
      try {
        const query = encodeURIComponent(strategyTesterScopeSources.join(","));
        const res = await fetch(`/api/monitoring/csv-reference-trades?sources=${query}`, {
          cache: "no-store",
          signal: ctrl.signal,
        });
        if (!res.ok || ctrl.signal.aborted) return;
        const json = (await res.json()) as CsvReferenceTradesResponse;
        if (ctrl.signal.aborted) return;
        setCsvReferenceTradesBySource(json.tradesBySource ?? {});
      } catch {
        if (!ctrl.signal.aborted) setCsvReferenceTradesBySource({});
      }
    };
    void run();
    return () => {
      unregisterFetch();
      ctrl.abort();
    };
  }, [showStrategyTesterWorkspace, strategyTesterDataMode, strategyTesterScopeSources]);

  useEffect(() => {
    if (!showStrategyTesterWorkspace) {
      setCustomEnginePayload(null);
      return;
    }
    if (strategyTesterDataMode !== "engine") return;
    if (!strategyTesterCustomEngineKey) {
      setCustomEnginePayload(null);
      return;
    }
    if (!strategyTesterCustomEnginePilotEnabled) {
      setCustomEnginePayload({
        ok: true,
        source: strategyTesterCustomEngineSource,
        sourceStatus: "blocked",
        fallbackUsed: false,
        warning: "local_engine_output_not_available_or_blocked_feature_flag_disabled",
        trades: [],
        tradeCount: 0,
      });
      return;
    }
    const ctrl = new AbortController();
    const unregisterFetch = registerMonitoringFetch(ctrl);
    const run = async () => {
      try {
        const res = await fetch(`/api/monitoring/custom-engine-trades?strategyKey=${encodeURIComponent(strategyTesterCustomEngineKey)}`, {
          cache: "no-store",
          signal: ctrl.signal,
        });
        if (!res.ok || ctrl.signal.aborted) return;
        const json = (await res.json()) as CustomEngineTradesResponse;
        if (ctrl.signal.aborted) return;
        const trades = sortTradesByEntryTime(toStrictMonitoringTrades(Array.isArray(json.trades) ? json.trades : []));
        setCustomEnginePayload({
          ...json,
          trades,
          tradeCount: trades.length,
        });
      } catch {
        if (!ctrl.signal.aborted) {
          setCustomEnginePayload({
            ok: false,
            source: strategyTesterCustomEngineSource,
            sourceStatus: "missing",
            fallbackUsed: false,
            warning: "local_engine_output_not_available_or_blocked",
            trades: [],
            tradeCount: 0,
          });
        }
      }
    };
    void run();
    return () => {
      unregisterFetch();
      ctrl.abort();
    };
  }, [
    strategyTesterCustomEnginePilotEnabled,
    showStrategyTesterWorkspace,
    strategyTesterDataMode,
    strategyTesterCustomEngineKey,
    strategyTesterCustomEngineSource,
  ]);

  const strategyTesterStrategyParams = useMemo(() => {
    const params = strategyTesterChart?.payload?.metadata.params ?? [];
    const out: Record<string, unknown> = {};
    for (const p of params) out[p.key] = p.value;
    return out;
  }, [strategyTesterChart?.payload?.metadata.params]);

  const strategyTesterEngineTrades = useMemo(() => {
    if (strategyTesterCustomEngineKey) {
      return sortTradesByEntryTime(customEnginePayload?.trades ?? []);
    }
    const merged: MonitoringTrade[] = [];
    for (const payload of strategyTesterScopeEventsPayloads) {
      merged.push(...toStrictMonitoringTrades(mergeTradesFromEventsPayload(payload)));
    }
    return sortTradesByEntryTime(merged);
  }, [customEnginePayload?.trades, strategyTesterCustomEngineKey, strategyTesterScopeEventsPayloads]);

  const strategyTesterEngineEvents = useMemo(() => {
    if (strategyTesterCustomEngineKey) return [] as StrategyEventsPayload["events"];
    const merged: StrategyEventsPayload["events"] = [];
    for (const payload of strategyTesterScopeEventsPayloads) {
      merged.push(...(payload.events ?? []));
    }
    return [...merged].sort((a, b) => String(a.time || "").localeCompare(String(b.time || "")));
  }, [strategyTesterCustomEngineKey, strategyTesterScopeEventsPayloads]);

  const strategyTesterEngineSourceStatus = useMemo<OjCustomEngineSourceStatus | null>(() => {
    if (!strategyTesterCustomEngineKey) return null;
    return customEnginePayload?.sourceStatus ?? "missing";
  }, [customEnginePayload?.sourceStatus, strategyTesterCustomEngineKey]);

  const strategyTesterEngineStatusMessage = useMemo<string | null>(() => {
    if (!strategyTesterCustomEngineKey) return null;
    if (strategyTesterEngineSourceStatus === "real_engine_output") return null;
    if (!strategyTesterCustomEnginePilotEnabled) return "Local engine output not available / blocked";
    if (customEnginePayload?.warning === "blocked_suspicious_engine_data_looks_like_csv_reference_fallback") {
      return "Blocked suspicious engine data: looks like CSV reference fallback";
    }
    return "Local engine output not available / blocked";
  }, [
    strategyTesterCustomEnginePilotEnabled,
    customEnginePayload?.warning,
    strategyTesterEngineSourceStatus,
    strategyTesterCustomEngineKey,
  ]);

  const strategyTesterEngineTradeCount = useMemo<number | null>(() => {
    if (!strategyTesterCustomEngineKey) return null;
    return Number.isFinite(Number(customEnginePayload?.tradeCount))
      ? Number(customEnginePayload?.tradeCount)
      : null;
  }, [customEnginePayload?.tradeCount, strategyTesterCustomEngineKey]);

  const strategyTesterEngineFirstTradeDate = useMemo<string | null>(() => {
    if (!strategyTesterCustomEngineKey) return null;
    return customEnginePayload?.firstTradeDate ?? null;
  }, [customEnginePayload?.firstTradeDate, strategyTesterCustomEngineKey]);

  const strategyTesterEngineOpenTrade = useMemo<boolean | null>(() => {
    if (!strategyTesterCustomEngineKey) return null;
    if (customEnginePayload?.openTrade == null) return false;
    return true;
  }, [customEnginePayload?.openTrade, strategyTesterCustomEngineKey]);

  const strategyTesterEngineCurrentSignalLabel = useMemo<string | null>(() => {
    if (!strategyTesterCustomEngineKey) return null;
    return customEnginePayload?.currentSignal ?? null;
  }, [customEnginePayload?.currentSignal, strategyTesterCustomEngineKey]);

  const strategyTesterEngineCurrentSignalStatus = useMemo<string | null>(() => {
    if (!strategyTesterCustomEngineKey) return null;
    return customEnginePayload?.currentSignalStatus ?? null;
  }, [customEnginePayload?.currentSignalStatus, strategyTesterCustomEngineKey]);

  const strategyTesterEngineHistoricalParityScore = useMemo<number | null>(() => {
    if (!strategyTesterCustomEngineKey) return null;
    return Number.isFinite(Number(customEnginePayload?.historicalParityScore))
      ? Number(customEnginePayload?.historicalParityScore)
      : null;
  }, [customEnginePayload?.historicalParityScore, strategyTesterCustomEngineKey]);

  const strategyTesterCsvTrades = useMemo(() => {
    const merged: MonitoringTrade[] = [];
    for (const payload of strategyTesterScopeEventsPayloads) {
      const src = String(payload?.source || "").trim().toLowerCase();
      if (src === "csv_reference") {
        merged.push(...toStrictMonitoringTrades(mergeTradesFromEventsPayload(payload)));
        continue;
      }
      if (src === "hybrid_csv_engine") {
        const csvTrades = toStrictMonitoringTrades(mergeTradesFromEventsPayload(payload)).filter(
          (t) => (t as MonitoringTrade & { _source?: string })._source === "csv_import"
        );
        merged.push(...csvTrades);
      }
    }
    if (merged.length) {
      return sortTradesByEntryTime(merged);
    }
    for (const source of strategyTesterScopeSources) {
      merged.push(...(csvReferenceTradesBySource[source] ?? []));
    }
    return sortTradesByEntryTime(merged);
  }, [csvReferenceTradesBySource, strategyTesterScopeSources, strategyTesterScopeEventsPayloads]);

  const strategyTesterActiveTrades = useMemo(() => {
    const trades = strategyTesterDataMode === "csv_reference"
      ? strategyTesterCsvTrades
      : strategyTesterEngineTrades;
    return filterTradesByFromDate(trades, strategyTimeRangeFrom);
  }, [
    strategyTesterDataMode,
    strategyTesterCsvTrades,
    strategyTesterEngineTrades,
    strategyTimeRangeFrom,
  ]);

  const strategyTesterActiveCandles = useMemo(() => {
    if (strategyTesterScopeItems.length === 1) {
      return strategyTesterHistoryCandles;
    }
    return buildSyntheticCalendarCandles(strategyTesterActiveTrades);
  }, [strategyTesterActiveTrades, strategyTesterHistoryCandles, strategyTesterScopeItems.length]);

  useEffect(() => {
    if (!strategyTesterEnabled || !strategyTesterOpen) {
      setActivePerformance(null);
      setStrategyPerfLoading(false);
      return;
    }
    if (!strategyTesterScopeItems.length) {
      setActivePerformance(null);
      setStrategyPerfLoading(false);
      return;
    }
    if (strategyTesterDataMode === "engine" && !strategyTesterHasStrategy) {
      setActivePerformance(null);
      setStrategyPerfLoading(false);
      return;
    }

    setStrategyPerfLoading(true);
    const timer = window.setTimeout(() => {
      const trades = strategyTesterActiveTrades;
      const events = strategyTesterDataMode === "csv_reference" || Boolean(strategyTesterCustomEngineKey) ? [] : strategyTesterEngineEvents;
      if (!trades.length) {
        setActivePerformance(null);
        setStrategyPerfLoading(false);
        return;
      }
      const perf = calculateStrategyPerformance({
        candles: strategyTesterActiveCandles,
        trades,
        events,
        strategyParams: {
          pointvalue: Number(strategyTesterStrategyParams.pointvalue ?? 1),
          commission: Number(strategyTesterStrategyParams.commission ?? 0),
          commissionPerTrade: Number(strategyTesterStrategyParams.commissionPerTrade ?? 0),
          useComp: strategyUseCompounding,
        },
      });
      setActivePerformance(perf);
      setStrategyPerfLoading(false);
    }, 0);
    const unregisterTimer = registerMonitoringTimeout(timer);
    return () => {
      unregisterTimer();
      window.clearTimeout(timer);
    };
  }, [
    strategyTesterOpen,
    strategyTesterScopeKey,
    strategyTesterDataMode,
    strategyTesterEnabled,
    strategyTesterHasStrategy,
    strategyTesterActiveCandles,
    strategyTesterActiveTrades,
    strategyTesterEngineEvents,
    strategyTesterCustomEngineKey,
    strategyTesterScopeItems.length,
    strategyTesterStrategyParams,
    strategyUseCompounding,
  ]);

  const fullscreenHistoryCandles = useMemo(() => {
    // Daily charts may use the longer full-history; intraday charts must keep their own
    // payload bars at native cadence (never the daily full-history / daily collapse), so
    // a maximized DAX40 2H/1H stays 2H/1H instead of falling back to daily candles.
    const symbol = fullscreenItem?.code ?? "";
    const full = fullHistoryBySymbol[symbol];
    if (full?.length && !isIntradayTimeframe(fullscreenItem?.timeframe)) return full;
    return historyCandlesForTimeframe(fullscreenItem?.timeframe, fullscreenItem?.payload?.bars ?? []);
  }, [fullscreenItem, fullHistoryBySymbol]);

  const activeChartDataForFullscreen = useMemo<MonitoringChartData | null>(() => {
    const chartItem = fullscreenItem;
    if (!chartItem) return null;
    const payload = chartItem.payload;
    const badge = getBadge(payload);
    const strategyTrades = toChartTradeRows(preparedTradesByItemKey[chartItem.key] ?? []);
    const bars = fullscreenHistoryCandles.map((bar) => ({
      time: bar.time,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
    }));
    return {
      displaySymbol: chartItem.code,
      displayName: chartItem.name,
      tvSymbol: chartItem.tv,
      badge,
      bars,
      signals: [],
      trades: strategyTrades,
      boxes: [],
      variant: "large",
      timeframe: fullscreenItem?.timeframe ?? "D",
    };
  }, [fullscreenHistoryCandles, fullscreenItem, preparedTradesByItemKey]);

  const activeParams = useMemo(() => {
    if (!activeChart || !activePayload?.metadata.params || !activeHasStrategy) return [];
    const base = Object.fromEntries((activePayload.metadata.params ?? []).map((p) => [p.key, p.value]));
    for (const p of activePayload.metadata.params ?? []) {
      const key = String(p.key || "").trim().toLowerCase();
      const label = String(p.label || "").trim().toLowerCase();
      if (key === "usetrendengine" || label === "use trend engine") {
        base[p.key] = false;
      }
    }
    const overrides = draftParams[activeChart.key] ?? {};
    const merged = { ...base, ...overrides };
    return (activePayload.metadata.params ?? []).map((p) => ({ ...p, value: merged[p.key] }));
  }, [activeChart, activeHasStrategy, activePayload, draftParams]);

  const groupedParams = useMemo(() => {
    const out: Record<string, typeof activeParams> = {};
    for (const p of activeParams) {
      if (!out[p.group]) out[p.group] = [];
      out[p.group].push(p);
    }
    return out;
  }, [activeParams]);

  useEffect(() => {
    if (!chartScopeItems.length) {
      setSelectedAssetId(null);
      setSelectedStrategySymbols([]);
      return;
    }
    if (selectedAssetId && !chartScopeItems.some((item) => item.key === selectedAssetId)) {
      setSelectedAssetId(null);
    }
    const availableSymbols = new Set(chartScopeItems.map((item) => item.code));
    setSelectedStrategySymbols((current) => current.filter((symbol) => availableSymbols.has(symbol)));
  }, [chartScopeItems, selectedAssetId]);

  const ensureManualLevelsForItem = useCallback((item: ChartItem) => {
    setManualLevelsBySymbol((prev) => {
      if (prev[item.code]) return prev;
      const payload = item.payload;
      const signals = payload?.signals ?? [];
      const last = signals.length ? signals[signals.length - 1] : null;
      const pos = Number(last?.position ?? 0);
      const direction: TradeDirection = Number.isFinite(pos) && pos < 0 ? "short" : "long";
      const entry = toFinite(last?.entry_price ?? last?.close);
      const stopLoss = direction === "long"
        ? toFinite(last?.long_sl_final ?? last?.entry_sl)
        : toFinite(last?.short_sl_final ?? last?.entry_sl);
      const takeProfit = direction === "long"
        ? toFinite(last?.long_tp_final ?? last?.entry_tp)
        : toFinite(last?.short_tp_final ?? last?.entry_tp);
      return {
        ...prev,
        [item.code]: {
          direction,
          entry,
          stopLoss,
          takeProfit,
        },
      };
    });
  }, []);

  const onChartSelect = (item: ChartItem) => {
    ensureManualLevelsForItem(item);
    if (useUnifiedAgrarStrategyWorkspace && isActiveMonitoringAgrarSymbol(item.code)) {
      setSelectedAssetId(item.key);
      setSelectedStrategySymbols((current) => {
        if (!strategyMultiSelectArmed) return [item.code];
        return current.includes(item.code)
          ? (current.length > 1 ? current.filter((symbol) => symbol !== item.code) : current)
          : [...current, item.code];
      });
      return;
    }
    if (useUnifiedIntradayWorkspace) {
      setSelectedAssetId(item.key);
      setSelectedStrategySymbols([item.code]);
      return;
    }
    setSelectedAssetId((current) => (current === item.key ? null : item.key));
  };

  const onIndicatorOpen = (item: ChartItem) => {
    setSelectedAssetId(item.key);
    ensureManualLevelsForItem(item);
    setIsInputPanelOpen(true);
  };

  const onStrategyWorkspaceSelect = useCallback((item: ChartItem) => {
    setSelectedAssetId(item.key);
    ensureManualLevelsForItem(item);
  }, [ensureManualLevelsForItem]);

  const onOpenFullscreen = (item: ChartItem) => {
    if (!fullscreenEnabled) return;
    setSelectedAssetId(item.key);
    setFullscreenAssetId((current) => (current === item.key ? null : item.key));
  };

  const onExitFullscreen = () => {
    setFullscreenAssetId(null);
  };

  useEffect(() => {
    if (!fullscreenAssetId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullscreenAssetId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreenAssetId]);

  const handleManualLevelsChange = (symbol: string, levels: ManualTradeLevels) => {
    if (!symbol) return;
    setManualLevelsBySymbol((prev) => ({
      ...prev,
      [symbol]: levels,
    }));
  };

  const unifiedStrategyChart = useMemo(
    () => activeChart ?? chartScopeItems[0] ?? null,
    [activeChart, chartScopeItems],
  );

  useEffect(() => {
    if (!useUnifiedAgrarStrategyWorkspace) return;
    if (!chartScopeItems.length) return;
    const fallback = chartScopeItems[0] ?? null;
    if (!selectedAssetId && fallback) {
      setSelectedAssetId(fallback.key);
    }
    setSelectedStrategySymbols((current) => {
      if (current.length || selectedAssetId) return current;
      return fallback?.code ? [fallback.code] : [];
    });
  }, [chartScopeItems, selectedAssetId, useUnifiedAgrarStrategyWorkspace]);

  useEffect(() => {
    if (!useUnifiedIntradayWorkspace) return;
    if (!chartScopeItems.length) return;
    const intradayCodes = new Set(INTRADAY_MT_ASSETS.map((a) => a.displaySymbol));
    const activeItem = selectedAssetId
      ? chartScopeItems.find((item) => item.key === selectedAssetId && intradayCodes.has(item.code)) ?? null
      : null;
    const fallback = activeItem ?? chartScopeItems.find((item) => intradayCodes.has(item.code)) ?? null;
    if (!selectedAssetId && fallback) {
      setSelectedAssetId(fallback.key);
    }
    setSelectedStrategySymbols((current) => {
      if (current.length && current.some((s) => intradayCodes.has(s))) return current;
      return fallback?.code ? [fallback.code] : current;
    });
  }, [chartScopeItems, selectedAssetId, useUnifiedIntradayWorkspace]);

  useEffect(() => {
    if (!useUnifiedIndicesWorkspace) return;
    if (!chartScopeItems.length) return;
    const activeItem = selectedAssetId
      ? chartScopeItems.find((item) => item.key === selectedAssetId && MONITORING_INDICES_SYMBOLS.has(item.code)) ?? null
      : null;
    const fallback = activeItem ?? chartScopeItems.find((item) => MONITORING_INDICES_SYMBOLS.has(item.code)) ?? null;
    if (!selectedAssetId && fallback) {
      setSelectedAssetId(fallback.key);
    }
    // Follow the clicked chart: the events URL (data source) is keyed on selectedStrategySymbols,
    // so it must track the active index chart, otherwise every asset would show the first one's data.
    const targetCode = (activeItem ?? fallback)?.code;
    if (targetCode) {
      setSelectedStrategySymbols((current) => (current.length === 1 && current[0] === targetCode) ? current : [targetCode]);
    }
  }, [chartScopeItems, selectedAssetId, useUnifiedIndicesWorkspace]);

  useEffect(() => {
    if (!useUnifiedInvestWorkspace) return;
    const fallback = isInvestStrategyId(investSelectedStrategyId) ? investSelectedStrategyId : "QQQ_PINE_1";
    setSelectedStrategySymbols((current) => (current.length === 1 && current[0] === fallback ? current : [fallback]));
  }, [investSelectedStrategyId, useUnifiedInvestWorkspace]);

  useEffect(() => {
    const jump = readMonitoringSignalJump();
    if (!jump) return;

    if (jump.tabId !== activeTab) {
      setActiveTabPersisted(jump.tabId);
      return;
    }

    if (jump.investStrategyId && isInvestStrategyId(jump.investStrategyId)) {
      if (investSelectedStrategyId !== jump.investStrategyId) {
        setInvestSelectedStrategyId(jump.investStrategyId);
        return;
      }
      if (selectedAssetId !== jump.investStrategyId) {
        setSelectedAssetId(jump.investStrategyId);
      }
      clearMonitoringSignalJump();
      return;
    }

    if (!chartScopeItems.length) return;

    const match = chartScopeItems.find((item) => {
      const targetKey = String(jump.targetItemKey ?? "").trim().toUpperCase();
      const targetCode = String(jump.targetCode ?? "").trim().toUpperCase();
      return item.key.toUpperCase() === targetKey || item.code.toUpperCase() === targetCode;
    }) ?? null;

    if (!match) return;

    if (selectedAssetId !== match.key) {
      setSelectedAssetId(match.key);
    }
    setSelectedStrategySymbols((current) => {
      if (current.length === 1 && current[0] === match.code) return current;
      return [match.code];
    });
    clearMonitoringSignalJump();
  }, [
    activeTab,
    chartScopeItems,
    investSelectedStrategyId,
    selectedAssetId,
    setActiveTabPersisted,
    setInvestSelectedStrategyId,
  ]);

  useEffect(() => {
    if (!useUnifiedAgrarStrategyWorkspace) {
      setStrategyMultiSelectArmed(false);
      return;
    }
    if (!selectedStrategySymbols.length) return;
    const selectedSet = new Set(selectedStrategySymbols);
    const activeItem = selectedAssetId ? chartScopeItems.find((item) => item.key === selectedAssetId) ?? null : null;
    if (activeItem && selectedSet.has(activeItem.code)) return;
    const fallback = chartScopeItems.find((item) => selectedSet.has(item.code)) ?? null;
    if (fallback) {
      setSelectedAssetId(fallback.key);
      ensureManualLevelsForItem(fallback);
    }
  }, [chartScopeItems, ensureManualLevelsForItem, selectedAssetId, selectedStrategySymbols, useUnifiedAgrarStrategyWorkspace]);

  useEffect(() => {
    if (!strategyMultiSelectArmed) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest(".monitoring-flexible-grid")) return;
      setStrategyMultiSelectArmed(false);
    };
    window.addEventListener("pointerdown", handlePointerDown, true);
    return () => window.removeEventListener("pointerdown", handlePointerDown, true);
  }, [strategyMultiSelectArmed]);

  const monitoringAgriAssets = useMemo(
    () => chartScopeItems
      .filter((item) => isActiveMonitoringAgrarSymbol(item.code))
      .map((item) => ({ symbol: item.code, name: item.name })),
    [chartScopeItems],
  );

  // Intraday MT assets for the unified intraday workspace
  const monitoringIntradayAssets = useMemo(
    () => INTRADAY_MT_ASSETS.map((row) => ({ symbol: row.displaySymbol, name: row.name })),
    [],
  );

  // Indizes assets for the unified (Agrar-cloned) indices workspace.
  const monitoringIndicesAssets = useMemo(
    () => chartScopeItems
      .filter((item) => MONITORING_INDICES_SYMBOLS.has(item.code))
      .map((item) => ({ symbol: item.code, name: item.name })),
    [chartScopeItems],
  );

  const handleStrategySelectionChange = useCallback((symbols: string[]) => {
    const available = new Set(monitoringAgriAssets.map((item) => item.symbol));
    setSelectedStrategySymbols(Array.from(new Set(symbols.filter((symbol) => available.has(symbol)))));
  }, [monitoringAgriAssets]);

  const monitoringAnomalyAssets = useMemo(
    () => ANOMALY_MT_ASSETS.map((row) => ({ symbol: row.displaySymbol, name: row.name })),
    [],
  );

  const handleIntradayStrategySelectionChange = useCallback((symbols: string[]) => {
    const available = new Set(monitoringIntradayAssets.map((item) => item.symbol));
    setSelectedStrategySymbols(Array.from(new Set(symbols.filter((symbol) => available.has(symbol)))));
  }, [monitoringIntradayAssets]);

  const handleAnomalyStrategySelectionChange = useCallback((symbols: string[]) => {
    const available = new Set(monitoringAnomalyAssets.map((item) => item.symbol));
    setSelectedStrategySymbols(Array.from(new Set(symbols.filter((symbol) => available.has(symbol)))));
  }, [monitoringAnomalyAssets]);

  const handleIndicesStrategySelectionChange = useCallback((symbols: string[]) => {
    const available = new Set(monitoringIndicesAssets.map((item) => item.symbol));
    setSelectedStrategySymbols(Array.from(new Set(symbols.filter((symbol) => available.has(symbol)))));
  }, [monitoringIndicesAssets]);

  const handleInvestStrategySelectionChange = useCallback((symbols: string[]) => {
    const available = new Set<string>(INVEST_WORKSPACE_ASSETS.map((item) => item.symbol));
    const next = Array.from(new Set(symbols.filter((symbol) => available.has(symbol))));
    setSelectedStrategySymbols(next);
    if (next[0] && next[0] !== investSelectedStrategyId) {
      setInvestSelectedStrategyIdRaw(next[0]);
    }
  }, [investSelectedStrategyId]);

  const handleStrategyFocusSymbol = useCallback((symbol: string) => {
    const match = chartScopeItems.find((item) => item.code === symbol);
    if (!match) return;
    setSelectedAssetId(match.key);
    ensureManualLevelsForItem(match);
  }, [chartScopeItems, ensureManualLevelsForItem]);

  const handleInvestStrategyFocus = useCallback((symbol: string) => {
    if (!isInvestStrategyId(symbol)) return;
    setInvestSelectedStrategyId(symbol);
  }, [setInvestSelectedStrategyId]);

  const handleStrategyEngineResultCache = useCallback((results: Record<string, MonitoringStrategyTestResult>) => {
    setAgriEngineResultsBySymbol((current) => ({
      ...current,
      ...results,
    }));
  }, []);

  const requestMonitoringRefresh = useCallback(async (mode: "manual" | "auto") => {
    const FIVE_MINUTES = 5 * 60 * 1000;
    if (mode === "auto") {
      const elapsed = Date.now() - lastCompletedRefreshAtRef.current;
      if (elapsed > 0 && elapsed < FIVE_MINUTES) return;
    }
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;
    setRefreshStatus("running");
    try {
      // One GLOBAL refresh: the server always runs the full pipeline (all assets across
      // every tab) + DAX live tail, regardless of which tab is active. So the button (and
      // auto-refresh) never updates "only single assets".
      const res = await fetch("/api/monitoring/refresh-now", {
        method: "POST",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ global: true }),
      });
      const json = (await res.json()) as { ok?: boolean; alreadyRunning?: boolean; manifestUpdatedAt?: string | null; status?: string };
      if (json.alreadyRunning) {
        setRefreshStatus("running");
        return;
      }
      if (json.ok) {
        lastCompletedRefreshAtRef.current = Date.now();
        if (mode === "manual") {
          // Backend refresh finished → controlled HARD-RELOAD so the new data is
          // guaranteed visible without a manual browser refresh. The active tab (and
          // other localStorage-persisted UI state: live-panel open/width, visual
          // settings) survive, so the page returns to the same monitoring tab.
          setRefreshStatus("done");
          try { window.localStorage.setItem("monitoring_active_tab", activeTabRef.current); } catch { /* ignore */ }
          isRefreshingRef.current = false;
          window.location.reload();
          return;
        }
        // Auto refresh: in-page cache-bust revalidate (no disruptive 5-min reload).
        setRefreshStatus("done");
        clearMonitoringCandleCache();
        setStrategyEventsByFile({});
        if (json.manifestUpdatedAt) setManifestGeneratedAt(json.manifestUpdatedAt);
        const forcedStamp = `${mode}-refresh:${Date.now()}`;
        cacheManifestStampRef.current = forcedStamp;
        setCacheManifestStamp(forcedStamp);
        window.setTimeout(() => setRefreshStatus("idle"), 6000);
      } else {
        setRefreshStatus("error");
      }
    } catch {
      setRefreshStatus("error");
    } finally {
      isRefreshingRef.current = false;
    }
  }, []);

  useEffect(() => {
    let disposed = false;
    const FIVE_MINUTES = 5 * 60 * 1000;
    // Global auto-refresh on EVERY tab — same global pipeline as the manual button. The
    // in-flight mutex + 5-min elapsed guard inside requestMonitoringRefresh (plus the
    // server-side lock) prevent any parallel/overlapping refresh run.
    const runAutoRefresh = () => {
      if (disposed) return;
      if (document.hidden) return;
      void requestMonitoringRefresh("auto");
    };
    const timerId = window.setInterval(runAutoRefresh, FIVE_MINUTES);
    const unregisterInterval = registerMonitoringInterval(timerId);
    return () => {
      disposed = true;
      window.clearInterval(timerId);
      unregisterInterval();
    };
  }, [requestMonitoringRefresh]);

  const handleManualRefresh = async () => {
    await requestMonitoringRefresh("manual");
  };

  const strategyTesterPanelContext = useMemo(() => {
    if (strategyTesterIsGroupMode) {
      const assetCount = strategyTesterScopeItems.length;
      return {
        symbol: `${tabConfigById(activeTab)?.title ?? "Group"} Group`,
        assetName: `${assetCount} Strategies / ${assetCount} Assets`,
        strategyName: null,
      };
    }
    return {
      symbol: strategyTesterChart?.code ?? null,
      assetName: strategyTesterChart?.name ?? null,
      strategyName: strategyTesterChart?.strategy ?? null,
    };
  }, [activeTab, strategyTesterChart?.code, strategyTesterChart?.name, strategyTesterChart?.strategy, strategyTesterIsGroupMode, strategyTesterScopeItems.length]);

  // ── Core Invest Tester: context ────────────────────────────────────────────────
  const INVEST_SLEEVE_META: Record<string, { symbol: string; name: string; strategy: string }> = {
    QQQ_PINE_1:     { symbol: "QQQ",  name: "QQQ Pine 1",     strategy: "Pine 1 (SMA400/5)" },
    QQQ_PINE_2_EMA: { symbol: "QQQ",  name: "QQQ Pine 2 EMA", strategy: "Pine 2 EMA (EMA20/50)" },
    COPPER_HG:      { symbol: "HG1!", name: "Copper/HG",       strategy: "EMA20/50 Valuation" },
    CHF_6S:         { symbol: "6S1!", name: "CHF/6S",          strategy: "EMA20/50 Valuation" },
  };
  const investTesterMeta = INVEST_SLEEVE_META[investSelectedStrategyId] ?? INVEST_SLEEVE_META.QQQ_PINE_1;

  useEffect(() => {
    const prefs = loadMonitoringUiPrefs();
    setUiPrefs(prefs);
    // Never restore panel open state from localStorage — panel only opens when user explicitly clicks a strategy
  }, []);

  useEffect(() => {
    saveMonitoringUiPrefs(uiPrefs);
  }, [uiPrefs]);

  // Persist params visibility to uiPrefs whenever it changes
  useEffect(() => {
    setUiPrefs((p) => ({ ...p, paramsPanelVisible: isInputPanelOpen }));
  }, [isInputPanelOpen]);

  const handleVertDragStart = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.detail === 2) {
      const el = mainWorkspaceRef.current;
      if (el) el.style.gridTemplateRows = `minmax(0, 62%) 6px minmax(0, 1fr)`;
      setUiPrefs((p) => ({ ...p, chartSplitPct: null }));
      return;
    }
    e.preventDefault();
    const el = mainWorkspaceRef.current;
    if (!el) return;
    const totalH = el.getBoundingClientRect().height;
    if (totalH <= 0) return;
    const startY = e.clientY;
    const startPct = uiPrefs.chartSplitPct ?? 62;
    const onMove = (me: MouseEvent) => {
      const newPct = Math.min(80, Math.max(20, startPct + ((me.clientY - startY) / totalH) * 100));
      el.style.gridTemplateRows = `minmax(0, ${newPct.toFixed(1)}%) 6px minmax(0, 1fr)`;
    };
    const onUp = (me: MouseEvent) => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      const finalPct = Math.min(80, Math.max(20, startPct + ((me.clientY - startY) / totalH) * 100));
      setUiPrefs((p) => ({ ...p, chartSplitPct: Math.round(finalPct) }));
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [uiPrefs.chartSplitPct]);

  const handleHorizDragStart = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.detail === 2) {
      const el = execLayoutRef.current;
      const hasLive = el?.classList.contains("show-live-signals-panel") ?? false;
      const paramsW = uiPrefs.inputPanelWidthPx ?? 220;
      if (el) el.style.gridTemplateColumns = buildExecCols(300, paramsW, false, hasLive);
      setUiPrefs((p) => ({ ...p, rightPanelWidthPx: null }));
      return;
    }
    e.preventDefault();
    const el = execLayoutRef.current;
    if (!el) return;
    const startX = e.clientX;
    const startW = uiPrefs.rightPanelWidthPx ?? 300;
    const paramsW = uiPrefs.inputPanelWidthPx ?? 220;
    const hasLive = el.classList.contains("show-live-signals-panel");
    const onMove = (me: MouseEvent) => {
      const newW = Math.min(480, Math.max(200, startW + (startX - me.clientX)));
      el.style.gridTemplateColumns = buildExecCols(newW, paramsW, false, hasLive);
    };
    const onUp = (me: MouseEvent) => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      const finalW = Math.min(480, Math.max(200, startW + (startX - me.clientX)));
      setUiPrefs((p) => ({ ...p, rightPanelWidthPx: Math.round(finalW) }));
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [uiPrefs.rightPanelWidthPx, uiPrefs.inputPanelWidthPx]);

  const handleParamsDragStart = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.detail === 2) {
      const el = execLayoutRef.current;
      if (el) {
        const kpiW = uiPrefs.rightPanelWidthPx ?? 300;
        const hasLive = el.classList.contains("show-live-signals-panel");
        el.style.gridTemplateColumns = buildExecCols(kpiW, 220, true, hasLive);
      }
      setUiPrefs((p) => ({ ...p, inputPanelWidthPx: null }));
      return;
    }
    e.preventDefault();
    const el = execLayoutRef.current;
    if (!el) return;
    const startX = e.clientX;
    const startW = uiPrefs.inputPanelWidthPx ?? 220;
    const kpiW = uiPrefs.rightPanelWidthPx ?? 300;
    const hasLive = el.classList.contains("show-live-signals-panel");
    const onMove = (me: MouseEvent) => {
      const newW = Math.min(400, Math.max(160, startW + (startX - me.clientX)));
      el.style.gridTemplateColumns = buildExecCols(kpiW, newW, true, hasLive);
    };
    const onUp = (me: MouseEvent) => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      const finalW = Math.min(400, Math.max(160, startW + (startX - me.clientX)));
      setUiPrefs((p) => ({ ...p, inputPanelWidthPx: Math.round(finalW) }));
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [uiPrefs.inputPanelWidthPx, uiPrefs.rightPanelWidthPx]);

  const toggleParamsPanel = useCallback(() => {
    setIsInputPanelOpen((prev) => {
      const next = !prev;
      const el = execLayoutRef.current;
      if (el) {
        const kpiW = uiPrefs.rightPanelWidthPx ?? 300;
        const paramsW = uiPrefs.inputPanelWidthPx ?? 220;
        const hasLive = el.classList.contains("show-live-signals-panel");
        el.style.gridTemplateColumns = buildExecCols(kpiW, paramsW, next, hasLive);
      }
      return next;
    });
  }, [uiPrefs.rightPanelWidthPx, uiPrefs.inputPanelWidthPx]);

  useEffect(() => {
    document.body.classList.add("ivq-monitoring-topbar-active");
    return () => {
      document.body.classList.remove("ivq-monitoring-topbar-active");
    };
  }, []);

  const handleSidebarHeaderToggle = useCallback(() => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("invoria-sidebar-toggle"));
  }, []);

  return (
    <LiveQuotesProvider>
    <main
      className="monitoringPage monitoring-root"
      style={{ "--monitoring-chart-bg": uiPrefs.backgroundColor ?? "#0A0A0A" } as React.CSSProperties}
    >
      <div className="monitoringTabBar monitoringTopbar tabbar" role="tablist" aria-label="Monitoring">
        <div className="monitoringTabRail">
          <div className="monitoringTabScroll">
            {MONITORING_HEADER_TABS.map((item) => {
              if (item.kind === "placeholder") {
                return (
                  <button
                    key={item.key}
                    type="button"
                    className="tab monitoring-tab-card monitoring-tab-card--placeholder"
                    aria-disabled="true"
                    disabled
                    title={`${item.title} folgt`}
                  >
                    <span className="monitoring-tab-icon" aria-hidden>
                      <BarChart3 size={14} strokeWidth={1.8} className="monitoring-tab-icon-svg" />
                    </span>
                    <span className="monitoring-tab-label">{item.title}</span>
                  </button>
                );
              }

              const isActive = activeTab === item.tabId;
              return (
                <button
                  key={item.key}
                  type="button"
                  role="tab"
                  data-tab-id={item.tabId}
                  aria-selected={isActive}
                  className={`tab monitoring-tab-card ${isActive ? "active" : ""}${item.tabId === "all" ? " monitoring-tab-card--all" : ""}`}
                  onClick={() => {
                    if (process.env.NODE_ENV === "development") {
                      console.debug("[MonitoringTopbar] click", { tab: item.title, panel: null });
                    }
                    setActiveTabPersisted(item.tabId);
                  }}
                >
                  <MonitoringTabIcon tabId={item.tabId} active={isActive} />
                  <span className="monitoring-tab-label">{item.title}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="monitoringTabBarActions">
          {parityDebugWarning ? <div className="parity-debug-warning">{parityDebugWarning}</div> : null}
          <button
            type="button"
            aria-pressed={strategyTesterOpen}
            className={`tab tab-action tab-strategy-tester ${strategyTesterOpen ? "active" : ""}`}
            onClick={() => {
              if (process.env.NODE_ENV === "development") {
                console.debug("[MonitoringTopbar] click", { tab: activeTab, panel: "tester" });
              }
              const isOpening = rightPanelMode !== "strategy_tester";
              setRightPanelMode(isOpening ? "strategy_tester" : null);
              if (!strategyTesterEnabled) {
                setShowStrategyTesterPaused(true);
                setShowTradeExecutionPaused(false);
                return;
              }
              setShowStrategyTesterPaused(false);
              setShowTradeExecutionPaused(false);
            }}
          >
            <BarChart3 size={13} strokeWidth={1.9} />
            <span>Tester</span>
          </button>
          <button
            type="button"
            aria-pressed={liveSignalsOpen}
            className={`tab tab-action tab-live-signals ${liveSignalsOpen ? "active" : ""}`}
            onClick={() => {
              setLiveSignalsOpen((prev) => !prev);
            }}
          >
            <Bell size={13} strokeWidth={1.9} />
            <span>Live</span>
            {liveSignalsFeed.openCount > 0 ? (
              <span
                className="tab-live-badge"
                title={`${liveSignalsFeed.openCount} offene Live-Signale${liveSignalsFeed.exitsTodayCount > 0 ? ` · ${liveSignalsFeed.exitsTodayCount} Exit heute` : ""}`}
                style={{
                  marginLeft: 4,
                  minWidth: 15,
                  height: 15,
                  padding: "0 4px",
                  borderRadius: 999,
                  background: "#4ea1ff",
                  color: "#06121f",
                  fontSize: 9,
                  fontWeight: 800,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  lineHeight: 1,
                }}
              >
                {liveSignalsFeed.openCount}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            aria-pressed={sentinelOpen}
            className={`tab tab-action tab-sentinel ${sentinelOpen ? "active" : ""}`}
            onClick={() => {
              setSentinelOpen((prev) => !prev);
            }}
          >
            <img src="/Sentinel.png" alt="" width={14} height={14} style={{ objectFit: "contain" }} />
            <span>Sentinel</span>
          </button>
          <button
            type="button"
            aria-pressed={liveChartAutoView}
            className={`tab tab-action tab-live-chart-autoview ${liveChartAutoView ? "active" : ""}`}
            onClick={() => {
              setLiveChartAutoView((prev) => {
                const next = !prev;
                try { localStorage.setItem("monitoring_liveChartAutoView", String(next)); } catch { /* noop */ }
                return next;
              });
            }}
            title={liveChartAutoView ? "Live-Chart-Ansicht aktiv — klicken zum Deaktivieren" : "Live-Chart-Ansicht aktivieren"}
            aria-label="Live-Chart Auto-View"
          >
            <Activity size={13} strokeWidth={1.9} />
          </button>
          <button
            type="button"
            className={`tab tab-action tab-refresh ${refreshStatus === "running" ? "is-running" : ""}${refreshStatus === "error" ? " is-error" : ""}`}
            disabled={refreshStatus === "running"}
            onClick={() => { void handleManualRefresh(); }}
            title="Live-Daten jetzt aktualisieren"
            aria-label="Refresh"
          >
            <RotateCw size={13} strokeWidth={2} className={refreshStatus === "running" ? "spin" : ""} />
          </button>
          <button
            type="button"
            className="tab tab-action tab-monitoring-settings"
            style={{ pointerEvents: "auto" }}
            onClick={() => setUiPrefsOpen(true)}
            title="Einstellungen"
            aria-label="Monitoring Einstellungen"
          >
            <Settings size={14} strokeWidth={2} />
          </button>
        </div>
      </div>


      <MonitoringSettingsModal
        open={uiPrefsOpen}
        prefs={uiPrefs}
        onChange={setUiPrefs}
        onClose={() => setUiPrefsOpen(false)}
      />

      {activeTab === "live" ? (
        <div className="monitoringContent monitoring-content monitoring-live-tab">
          <div className="monitoring-live-header">
            <div className="monitoring-live-title">
              <span className="monitoring-live-title-main">Live Signale</span>
              <span className="monitoring-live-sub">Letzte 7 Tage</span>
            </div>
            <div className="monitoring-live-chips">
              <span className="monitoring-live-chip is-open">Open: {liveTabCounts.open}</span>
              <span className="monitoring-live-chip is-fresh">Fresh: {liveTabCounts.fresh}</span>
              <span className="monitoring-live-chip is-closed">Closed 7D: {liveTabCounts.closed}</span>
            </div>
            <span className="monitoring-live-research" title="Der Live-Tab ist eine gefilterte Research-Ansicht auf bestehende Signalquellen — keine Live-Trading-Freigabe.">
              Research monitoring · not live approved
            </span>
          </div>
          {forwardLogger?.available && (forwardLogger.openTrades?.length ?? 0) > 0 && (
            <div className="monitoring-fwd-section">
              <div className="monitoring-fwd-header">
                <span className="monitoring-fwd-title">Forward Positionen</span>
                <span className="monitoring-fwd-count monitoring-live-chip is-open">{forwardLogger.openTrades!.length} offen</span>
                {forwardLogger.asOf && (
                  <span className="monitoring-live-sub">Stand: {forwardLogger.asOf.slice(0, 10)}</span>
                )}
              </div>
              <div className="monitoring-fwd-table">
                <div className="monitoring-fwd-row monitoring-fwd-row--head">
                  <span>Asset</span>
                  <span>Strategie</span>
                  <span>Dir</span>
                  <span>Entry</span>
                  <span>SL</span>
                  <span>TP</span>
                  <span>RR</span>
                  <span>P&amp;L %</span>
                  <span>Entry-Datum</span>
                </div>
                {forwardLogger.openTrades!.map((t, i) => {
                  const dir = (t.direction ?? "").toUpperCase();
                  const rr = t.model_rr ? `${parseFloat(t.model_rr).toFixed(1)}R` : "–";
                  const entryP = t.entry_price ? parseFloat(t.entry_price).toLocaleString("de-CH", { maximumFractionDigits: 4 }) : "–";
                  const slP = t.sl_price ? parseFloat(t.sl_price).toLocaleString("de-CH", { maximumFractionDigits: 4 }) : "–";
                  const tpP = t.tp_price ? parseFloat(t.tp_price).toLocaleString("de-CH", { maximumFractionDigits: 4 }) : "–";
                  const pnl = t.unrealizedPct ?? null;
                  const pnlStr = pnl != null ? `${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}%` : "–";
                  const pnlClass = pnl == null ? "" : pnl > 0 ? "is-pnl-pos" : pnl < 0 ? "is-pnl-neg" : "";
                  return (
                    <div key={i} className="monitoring-fwd-row">
                      <span className="monitoring-fwd-symbol">{t.symbol ?? "–"}</span>
                      <span className="monitoring-fwd-strategy">{t.strategy ?? "–"}</span>
                      <span className={`monitoring-fwd-dir ${dir === "LONG" ? "is-long" : "is-short"}`}>{dir}</span>
                      <span>{entryP}</span>
                      <span className="monitoring-fwd-sl">{slP}</span>
                      <span className="monitoring-fwd-tp">{tpP}</span>
                      <span>{rr}</span>
                      <span className={`monitoring-fwd-pnl ${pnlClass}`} title={t.lastClose != null ? `Close: ${t.lastClose} (${t.lastCloseDate ?? ""})` : "Kein Preis"}>
                        {pnlStr}
                      </span>
                      <span className="monitoring-live-sub">{t.entry_date ?? "–"}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {!allTabsEnabled || !nonAgrarGridEnabled ? (
            <div className="monitoring-live-empty">
              <div className="monitoring-live-empty-title">Live-Ansicht pausiert</div>
            </div>
          ) : liveTabItems.length ? (
            <div className="monitoring-live-grid">
              <MonitoringFlexibleGrid
                tabId="live"
                assets={liveTabItems}
                radarSignalState={radarSignalState}
                radarSourceByKey={liveSourceByKey}
                activeChartId={selectedAssetId}
                selectedStrategySymbols={selectedStrategySymbols}
                selectedTradeId={executionFocusTradeId}
                preferredDensity={tabConfigById("live")?.preferredDensity ?? "compact"}
                onChartSelect={onChartSelect}
                onIndicatorOpen={onStrategyWorkspaceSelect}
                onOpenFullscreen={fullscreenEnabled ? onOpenFullscreen : undefined}
                isTradeExecutionOpen={tradeExecutionPanelEnabled}
                tradeMode={tradeMode}
                manualLevelsBySymbol={manualLevelsBySymbol}
                onManualLevelsChange={handleManualLevelsChange}
                missingBuild={missingBuild}
                loadStatusBySymbol={effectiveLoadStateBySymbol}
                strategyEventsByFile={effectiveStrategyEventsByFile}
                tradingViewTradesBySource={tradingViewTradesBySource}
                preparedTradesByItemKey={preparedTradesByItemKey}
                uiPrefs={uiPrefs}
                agriAuditBySymbol={agriFinalStatus?.assets ?? {}}
                agriLiveStateBySymbol={agrarCardLiveStateBySymbol}
                liveChartAutoView={liveChartAutoView}
              />
            </div>
          ) : (
            <div className="monitoring-live-empty">
              <div className="monitoring-live-empty-title">Keine aktuellen Signale</div>
              <div className="monitoring-live-empty-sub">Zeitraum: letzte 7 Tage</div>
            </div>
          )}
        </div>
      ) : activeTab === "agrar" ? (
        <div className={`monitoringContent monitoring-content ${isInputPanelOpen ? "input-open" : ""} ${showStrategyTester ? "tester-open" : ""} ${isTradeExecutionOpen ? "execution-open" : ""} ${liveSignalsOpen ? "live-signals-open" : ""}`}>
          <div
            className={`monitoringExecutionLayout ${tradeExecutionPanelEnabled ? "show-side-panel" : ""} ${rightColumnEnabled ? "show-live-signals-panel" : ""} ${showStrategyTesterWorkspace ? "show-strategy-tester" : ""}`}
            ref={(el) => { execLayoutRef.current = el; }}
            style={showStrategyTesterWorkspace && !useUnifiedAgrarStrategyWorkspace ? {
              gridTemplateColumns: buildExecCols(
                uiPrefs.rightPanelWidthPx ?? 300,
                uiPrefs.inputPanelWidthPx ?? 220,
                false,
                rightColumnEnabled
              )
            } : rightColumnEnabled ? {
              // Resizable + persisted Live-/Sentinel column width.
              gridTemplateColumns: `minmax(0, 1fr) ${livePanelWidth}px`,
            } : undefined}
          >
            <div
              className={`monitoringMainWorkspace ${showStrategyTesterWorkspace && !useUnifiedAgrarStrategyWorkspace ? "with-strategy-tester" : ""}`}
              ref={(el) => { mainWorkspaceRef.current = el; }}
              style={showStrategyTesterWorkspace && !useUnifiedAgrarStrategyWorkspace ? { gridTemplateRows: `minmax(0, ${uiPrefs.chartSplitPct ?? 62}%) 6px minmax(0, 1fr)` } : undefined}
            >
              {useUnifiedAgrarStrategyWorkspace ? (
                <MonitoringStrategyWorkspace
                  symbol={unifiedStrategyChart?.code ?? null}
                  assetName={unifiedStrategyChart?.name ?? null}
                  selectedSymbols={selectedStrategySymbols}
                  availableAssets={monitoringAgriAssets}
                  onSelectedSymbolsChange={handleStrategySelectionChange}
                  onFocusSymbol={handleStrategyFocusSymbol}
                  multiSelectArmed={strategyMultiSelectArmed}
                  onMultiSelectArmedChange={setStrategyMultiSelectArmed}
                  onEngineResultCache={handleStrategyEngineResultCache}
                  agriStatus={unifiedStrategyChart?.code ? (agriFinalStatus?.assets?.[unifiedStrategyChart.code] ?? null) : null}
                  agriStatusBySymbol={agriFinalStatus?.assets ?? {}}
                  portfolioDelta={agriFinalStatus?.portfolio ?? null}
                  autoUpdate={agriFinalStatus?.autoUpdate ?? null}
                  agriActiveKinds={unifiedStrategyChart?.code ? (agriActiveKindsBySymbol[unifiedStrategyChart.code] ?? undefined) : undefined}
                  agriAvailableKinds={unifiedStrategyChart?.code ? Object.entries(agriAvailableKindsBySymbol[unifiedStrategyChart.code] ?? {}).filter(([, v]) => v).map(([k]) => k) : undefined}
                  topContent={
                    showGrid ? (
                      <MonitoringFlexibleGrid
                        tabId={activeTab}
                        assets={orderedItems}
                        activeChartId={selectedAssetId}
                        selectedStrategySymbols={selectedStrategySymbols}
                        selectedTradeId={executionFocusTradeId}
                        preferredDensity="balanced"
                        onChartSelect={onChartSelect}
                        onIndicatorOpen={onStrategyWorkspaceSelect}
                        onOpenFullscreen={fullscreenEnabled ? onOpenFullscreen : undefined}
                        isTradeExecutionOpen={tradeExecutionPanelEnabled}
                        tradeMode={tradeMode}
                        manualLevelsBySymbol={manualLevelsBySymbol}
                        onManualLevelsChange={handleManualLevelsChange}
                        missingBuild={missingBuild}
                        loadStatusBySymbol={effectiveLoadStateBySymbol}
                        strategyEventsByFile={effectiveStrategyEventsByFile}
                        tradingViewTradesBySource={tradingViewTradesBySource}
                        preparedTradesByItemKey={preparedTradesByItemKey}
                        uiPrefs={uiPrefs}
                        agriAuditBySymbol={agriFinalStatus?.assets ?? {}}
                        agriLiveStateBySymbol={agrarCardLiveStateBySymbol}
                        liveChartAutoView={liveChartAutoView}
                        agriAvailableKindsBySymbol={activeTab === "agrar" ? agriAvailableKindsBySymbol : undefined}
                        agriActiveKindsBySymbol={activeTab === "agrar" ? agriActiveKindsBySymbol : undefined}
                        onAgriKindToggle={activeTab === "agrar" ? toggleAgriKind : undefined}
                      />
                    ) : (
                      <div className="expandedChartPane fullscreenChartPane" style={{ position: "relative" }}>
                        {activeChartDataForFullscreen ? (
                          <MonitoringChart
                            data={activeChartDataForFullscreen}
                            maxBars={0}
                            showFullscreenControl={fullscreenEnabled}
                            isFullscreen={true}
                            onFullscreenRequest={() => {
                              if (fullscreenItem) onOpenFullscreen(fullscreenItem);
                            }}
                            uiPrefs={uiPrefs}
                          />
                        ) : (
                          <div className="expanded-empty">No chart data</div>
                        )}
                        {activeTab === "agrar" && fullscreenItem?.code && agriAvailableKindsBySymbol[fullscreenItem.code] ? (
                          <AgriStrategyKindButtons
                            availableKinds={agriAvailableKindsBySymbol[fullscreenItem.code]}
                            activeKinds={agriActiveKindsBySymbol[fullscreenItem.code] ?? []}
                            onToggle={(kind) => toggleAgriKind(fullscreenItem.code, kind)}
                          />
                        ) : null}
                        <div className="expanded-chart-label">
                          <div className="expanded-chart-symbol">{fullscreenItem?.short ?? fullscreenItem?.code ?? "-"}</div>
                          <div className="expanded-chart-desc">{fullscreenItem?.name ?? "-"}</div>
                        </div>
                        <button type="button" className="expanded-chart-close" onClick={onExitFullscreen} aria-label="Exit fullscreen">
                          ⊡
                        </button>
                      </div>
                    )
                  }
                />
              ) : (
                <>
                  {showGrid ? (
                    <MonitoringFlexibleGrid
                      tabId={activeTab}
                      assets={orderedItems}
                      activeChartId={selectedAssetId}
                      selectedStrategySymbols={selectedStrategySymbols}
                      selectedTradeId={executionFocusTradeId}
                      preferredDensity="balanced"
                      onChartSelect={onChartSelect}
                      onIndicatorOpen={onIndicatorOpen}
                      onOpenFullscreen={fullscreenEnabled ? onOpenFullscreen : undefined}
                      isTradeExecutionOpen={tradeExecutionPanelEnabled}
                      tradeMode={tradeMode}
                      manualLevelsBySymbol={manualLevelsBySymbol}
                      onManualLevelsChange={handleManualLevelsChange}
                      missingBuild={missingBuild}
                      loadStatusBySymbol={effectiveLoadStateBySymbol}
                      strategyEventsByFile={effectiveStrategyEventsByFile}
                      tradingViewTradesBySource={tradingViewTradesBySource}
                      preparedTradesByItemKey={preparedTradesByItemKey}
                      uiPrefs={uiPrefs}
                      agriAuditBySymbol={agriFinalStatus?.assets ?? {}}
                      agriLiveStateBySymbol={agrarCardLiveStateBySymbol}
                      liveChartAutoView={liveChartAutoView}
                      agriAvailableKindsBySymbol={activeTab === "agrar" ? agriAvailableKindsBySymbol : undefined}
                      agriActiveKindsBySymbol={activeTab === "agrar" ? agriActiveKindsBySymbol : undefined}
                      onAgriKindToggle={activeTab === "agrar" ? toggleAgriKind : undefined}
                    />
                  ) : (
                    <div className="expandedChartPane fullscreenChartPane" style={{ position: "relative" }}>
                      {activeChartDataForFullscreen ? (
                        <MonitoringChart
                          data={activeChartDataForFullscreen}
                          maxBars={0}
                          showFullscreenControl={fullscreenEnabled}
                          isFullscreen={true}
                          onFullscreenRequest={() => {
                            if (fullscreenItem) onOpenFullscreen(fullscreenItem);
                          }}
                          uiPrefs={uiPrefs}
                        />
                      ) : (
                        <div className="expanded-empty">No chart data</div>
                      )}
                      {activeTab === "agrar" && fullscreenItem?.code && agriAvailableKindsBySymbol[fullscreenItem.code] ? (
                        <AgriStrategyKindButtons
                          availableKinds={agriAvailableKindsBySymbol[fullscreenItem.code]}
                          activeKinds={agriActiveKindsBySymbol[fullscreenItem.code] ?? []}
                          onToggle={(kind) => toggleAgriKind(fullscreenItem.code, kind)}
                        />
                      ) : null}
                      <div className="expanded-chart-label">
                        <div className="expanded-chart-symbol">{fullscreenItem?.short ?? fullscreenItem?.code ?? "-"}</div>
                        <div className="expanded-chart-desc">{fullscreenItem?.name ?? "-"}</div>
                      </div>
                      <button type="button" className="expanded-chart-close" onClick={onExitFullscreen} aria-label="Exit fullscreen">
                        ⊡
                      </button>
                    </div>
                  )}
                  {showStrategyTesterWorkspace ? (
                    <div className="mon-drag-handle-vert" onMouseDown={handleVertDragStart} aria-hidden="true" />
                  ) : null}
                  {showStrategyTesterWorkspace ? (
                    <div className="strategyTesterCurves">
                      <div className="stc-header">
                        <span className="stc-label">Equity / Drawdown</span>
                        {activePerformance?.summary ? (
                          <>
                            <span className={`st-stat-chip ${activePerformance.summary.totalReturnPercent >= 0 ? "pos" : "neg"}`}>
                              {activePerformance.summary.totalReturnPercent >= 0 ? "+" : ""}{activePerformance.summary.totalReturnPercent.toFixed(1)}%
                            </span>
                            <span className="st-stat-chip muted">{activePerformance.summary.totalTrades} trades</span>
                          </>
                        ) : null}
                      </div>
                      {activePerformance ? (
                        <>
                          <StrategyTesterEquityChart
                            data={activePerformance.equityCurve}
                            timeRangeFrom={strategyTimeRangeFrom}
                            totalReturnPercent={activePerformance.summary.totalReturnPercent}
                            cagr={activePerformance.summary.cagr}
                            fillContainer
                          />
                          <StrategyTesterDrawdownChart
                            data={activePerformance.drawdownCurve}
                            maxDrawdownPercent={activePerformance.summary.maxDrawdownPercent}
                            avgDrawdownPercent={activePerformance.summary.avgDrawdownPercent}
                            top5DrawdownsPercent={activePerformance.summary.top5DrawdownsPercent}
                            timeRangeFrom={strategyTimeRangeFrom}
                            fillContainer
                          />
                        </>
                      ) : (
                        <div className="st-empty">No backtest data</div>
                      )}
                    </div>
                  ) : null}
                </>
              )}
            </div>
            {!useUnifiedAgrarStrategyWorkspace && showStrategyTesterWorkspace ? (
              <div className="mon-drag-handle-horiz" onMouseDown={handleHorizDragStart} aria-hidden="true" />
            ) : null}
            {!useUnifiedAgrarStrategyWorkspace && showStrategyTesterWorkspace ? (
              <div className="testerWorkspaceSide">
                <StrategyTesterPanel
                  symbol={strategyTesterPanelContext.symbol}
                  assetName={strategyTesterPanelContext.assetName}
                  strategyName={strategyTesterPanelContext.strategyName}
                  hasStrategy={strategyTesterHasStrategy}
                  loading={strategyPerfLoading || (strategyTesterScopeItems.length === 1 && fullHistoryLoading)}
                  performance={activePerformance}
                  useCompounding={strategyUseCompounding}
                  onToggleCompounding={() => setStrategyTesterConfig((c) => ({ ...c, compounding: !c.compounding }))}
                  dataMode={strategyTesterDataMode}
                  onDataModeChange={setStrategyTesterDataMode}
                  layoutMode="sidebar"
                  parityPercent={activeParityRow?.parityPercent ?? null}
                  parityBadge={activeParityRow?.badgeStatus ?? null}
                  timeRangeFrom={strategyTimeRangeFrom}
                  onSetTimeRange={(from) => setStrategyTesterConfig((c) => ({ ...c, timeRangeFrom: from }))}
                  eventsSource={
                    Boolean(strategyTesterCustomEngineKey) && strategyTesterDataMode === "engine"
                      ? (customEnginePayload?.source ?? activeEventsSource)
                      : activeEventsSource
                  }
                  engineSourceStatus={strategyTesterEngineSourceStatus}
                  engineStatusMessage={strategyTesterEngineStatusMessage}
                  engineSourceLabel={customEnginePayload?.sourceLabel ?? null}
                  engineTradeCount={strategyTesterEngineTradeCount}
                  engineFirstTradeDate={strategyTesterEngineFirstTradeDate}
                  engineOpenTrade={strategyTesterEngineOpenTrade}
                  currentSignalLabel={strategyTesterEngineCurrentSignalLabel}
                  currentSignalStatus={strategyTesterEngineCurrentSignalStatus}
                  historicalParityScore={strategyTesterEngineHistoricalParityScore}
                />
              </div>
            ) : null}
            {!tradeExecutionPanelEnabled && strategyTesterOpen && !strategyTesterEnabled ? (
              <aside className="input-panel">
                <div className="no-strat-text">Strategietester pausiert</div>
              </aside>
            ) : null}
            {!tradeExecutionPanelEnabled && isTradeExecutionOpen && !tradeExecutionEnabled ? (
              <aside className="input-panel">
                <div className="no-strat-text">Trade-Ausführung pausiert</div>
              </aside>
            ) : null}
            {rightColumnEnabled ? (
              <div
                className="monitoringRightColumn"
                style={{ display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0, height: "100%", position: "relative", isolation: "isolate" }}
              >
                {/* Mobile close strip — shown on ≤768px via CSS */}
                <div className="mobile-panel-close-btn" style={{ display: "none", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", letterSpacing: "0.04em" }}>
                    {liveSignalsPanelEnabled && sentinelPanelEnabled ? "Live · Sentinel" : liveSignalsPanelEnabled ? "Live Signale" : "Sentinel"}
                  </span>
                  <button
                    type="button"
                    style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer", minHeight: 44, minWidth: 44, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, lineHeight: 1 }}
                    onClick={() => { if (liveSignalsPanelEnabled) setLiveSignalsOpen(false); if (sentinelPanelEnabled) setSentinelOpen(false); }}
                    aria-label="Panel schließen"
                  >✕</button>
                </div>
                {liveSignalsPanelEnabled ? (
                  <div style={{ flex: 1, minHeight: 0 }}>
                    <LiveSignalsPanel
                      feed={liveSignalsFeed}
                      refreshLabel={liveSignalsRefreshLabel}
                      refreshStatus={refreshStatus}
                      onSelectSignal={onFocusLiveSignal}
                      colors={liveSignalColors}
                      onResizeStart={onLivePanelResizeStart}
                      scale={liveCardScale}
                    />
                  </div>
                ) : null}
                {sentinelPanelEnabled ? (
                  <div style={{ flex: 1, minHeight: 0 }}>
                    <SentinelErrorBoundary>
                      <SentinelPanel
                        halved={liveSignalsPanelEnabled}
                        onResizeStart={onLivePanelResizeStart}
                        feed={liveSignalsFeed}
                      />
                    </SentinelErrorBoundary>
                  </div>
                ) : null}
              </div>
            ) : null}
            {tradeExecutionPanelEnabled ? (
              <TradeExecutionPanel
                activeSymbol={activeChart?.code ?? null}
                activeName={activeChart?.name ?? null}
                activeStrategyId={activeChart?.strategy ?? null}
                activeTimeframe={activeChart?.timeframe ?? null}
                parityStatus={activeExecutionParityStatus}
                eventsSourceHint={activeEventsFile ? `/generated/monitoring/${activeEventsFile}` : null}
                latestPrice={activeLatestPrice}
                activeSignal={activeSignalState}
                mode={tradeMode}
                onModeChange={setTradeMode}
                manualLevels={activeManualLevels}
                tradeCandidates={activeTradeCandidates}
                selectedTradeId={executionFocusTradeId}
                onSelectedTradeIdChange={setExecutionFocusTradeId}
                onManualLevelsChange={(levels) => {
                  if (!activeChart?.code) return;
                  handleManualLevelsChange(activeChart.code, levels);
                }}
              />
            ) : null}
          </div>
          {isInputPanelOpen ? (
            <aside
              className="input-panel"
              ref={(el) => { inputPanelRef.current = el; }}
              style={{ width: `${uiPrefs.inputPanelWidthPx ?? 300}px` }}
            >
              <div className="input-panel-header">
                <div>
                  <div className="input-panel-symbol">{activeChart?.code ?? "-"}</div>
                  <div className="input-panel-strategy">{activeChart?.strategy ?? activeChart?.name ?? ""}</div>
                </div>
                <button type="button" className="input-panel-close" onClick={() => { setIsInputPanelOpen(false); }}>×</button>
              </div>
              <div className="input-panel-status-wrap">
                {!activeHasStrategy ? (
                  <span className="status-badge no-strat">No signals</span>
                ) : (
                  <span className="status-badge rebuild">REBUILD REQUIRED</span>
                )}
              </div>
              {!activeHasStrategy ? (
                <div className="no-strat-text">No signals available for this asset.</div>
              ) : (
                Object.entries(groupedParams).map(([groupName, params]) => (
                  <div key={groupName}>
                    <div className="param-group-title">{groupName}</div>
                    {params.map((p) => (
                      <div key={p.key} className="param-row">
                        <div className="param-label">{p.label}</div>
                        <div>
                          {p.type === "bool" ? (
                            <input
                              type="checkbox"
                              checked={!!p.value}
                              onChange={(e) =>
                                setDraftParams((prev) => ({
                                  ...prev,
                                  [selectedAssetId || ""]: {
                                    ...(prev[selectedAssetId || ""] || {}),
                                    [p.key]: e.target.checked,
                                  },
                                }))
                              }
                            />
                          ) : p.type === "select" ? (
                            <select
                              className="param-input"
                              value={String(p.value ?? "")}
                              onChange={(e) =>
                                setDraftParams((prev) => ({
                                  ...prev,
                                  [selectedAssetId || ""]: {
                                    ...(prev[selectedAssetId || ""] || {}),
                                    [p.key]: e.target.value,
                                  },
                                }))
                              }
                            >
                              {(p.options || []).map((opt) => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                          ) : (
                            <input
                              className="param-input"
                              value={String(p.value ?? "")}
                              onChange={(e) =>
                                setDraftParams((prev) => ({
                                  ...prev,
                                  [selectedAssetId || ""]: {
                                    ...(prev[selectedAssetId || ""] || {}),
                                    [p.key]: p.type === "number" ? normalizeNumberInput(e.target.value) : e.target.value,
                                  },
                                }))
                              }
                            />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </aside>
          ) : null}
        </div>
      ) : activeTab === "invest" ? (
        <div className={`monitoringContent monitoring-content ${showStrategyTester ? "tester-open" : ""} ${liveSignalsOpen ? "live-signals-open" : ""}`}>
          <div
            className={`monitoringExecutionLayout ${rightColumnEnabled ? "show-live-signals-panel" : ""} ${showStrategyTesterWorkspace ? "show-strategy-tester" : ""}`}
            ref={(el) => { execLayoutRef.current = el; }}
            style={rightColumnEnabled ? { gridTemplateColumns: `minmax(0, 1fr) ${livePanelWidth}px` } : undefined}
          >
            <div className="monitoringMainWorkspace" ref={(el) => { mainWorkspaceRef.current = el; }}>
              {useUnifiedInvestWorkspace ? (
                <MonitoringStrategyWorkspace
                  symbol={investSelectedStrategyId}
                  assetName={investTesterMeta.name}
                  selectedSymbols={selectedStrategySymbols}
                  availableAssets={[...INVEST_WORKSPACE_ASSETS]}
                  onSelectedSymbolsChange={handleInvestStrategySelectionChange}
                  onFocusSymbol={handleInvestStrategyFocus}
                  onEngineResultCache={() => undefined}
                  uiPrefs={uiPrefs}
                  intradayEventsUrl={investEventsUrl}
                  adapterLabel="Core Invest"
                  topContent={(
                    <CoreInvestMonitoringGrid
                      onStrategySelect={setInvestSelectedStrategyId}
                      selectedStrategyId={investSelectedStrategyId}
                    />
                  )}
                />
              ) : (
                <CoreInvestMonitoringGrid
                  onStrategySelect={setInvestSelectedStrategyId}
                  selectedStrategyId={investSelectedStrategyId}
                />
              )}
            </div>
            {rightColumnEnabled ? (
              <div className={`monitoringRightColumn ${liveSignalsPanelEnabled && sentinelPanelEnabled ? "split" : ""}`}>
                <div className="mobile-panel-close-btn">
                  <button
                    type="button"
                    className="monitoring-ghost-btn"
                    onClick={() => { if (liveSignalsPanelEnabled) setLiveSignalsOpen(false); if (sentinelPanelEnabled) setSentinelOpen(false); }}
                  >
                    Schließen
                  </button>
                </div>
                {liveSignalsPanelEnabled ? (
                  <div className="rightPanelSection">
                    <LiveSignalsPanel
                      feed={liveSignalsFeed}
                      refreshLabel={manifestGeneratedAt ?? "n/a"}
                      refreshStatus={refreshStatus}
                      onSelectSignal={onFocusLiveSignal}
                      onResizeStart={onLivePanelResizeStart}
                      scale={liveCardScale}
                    />
                  </div>
                ) : null}
                {sentinelPanelEnabled ? (
                  <div className="rightPanelSection">
                    <SentinelErrorBoundary>
                      <SentinelPanel
                        onResizeStart={onLivePanelResizeStart}
                        halved={liveSignalsPanelEnabled}
                        feed={liveSignalsFeed}
                      />
                    </SentinelErrorBoundary>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : !allTabsEnabled ? (
        <div className="grid-compact-scroll" style={{ display: "grid", placeItems: "center" }}>
          <div className="no-strat-text">Tab pausiert</div>
        </div>
      ) : !nonAgrarGridEnabled ? (
        <div className="grid-compact-scroll" style={{ display: "grid", placeItems: "center" }}>
          <div className="no-strat-text">Tab pausiert</div>
        </div>
      ) : (
        <div className={`monitoringContent monitoring-content ${isInputPanelOpen ? "input-open" : ""} ${showStrategyTester ? "tester-open" : ""} ${isTradeExecutionOpen ? "execution-open" : ""} ${liveSignalsOpen ? "live-signals-open" : ""}`}>
          <div
            className={`monitoringExecutionLayout ${tradeExecutionPanelEnabled ? "show-side-panel" : ""} ${liveSignalsPanelEnabled ? "show-live-signals-panel" : ""} ${showStrategyTesterWorkspace ? "show-strategy-tester" : ""}`}
            ref={(el) => { execLayoutRef.current = el; }}
            style={showStrategyTesterWorkspace && !useUnifiedNonAgrarWorkspace ? {
              gridTemplateColumns: liveSignalsPanelEnabled
                ? `minmax(0, 1fr) ${livePanelWidth}px 6px ${uiPrefs.rightPanelWidthPx ?? 420}px`
                : `minmax(0, 1fr) 6px ${uiPrefs.rightPanelWidthPx ?? 420}px`
            } : liveSignalsPanelEnabled ? {
              // Resizable + persisted Live-signal column width.
              gridTemplateColumns: `minmax(0, 1fr) ${livePanelWidth}px`,
            } : undefined}
          >
            <div
              className={`monitoringMainWorkspace ${showStrategyTesterWorkspace && !useUnifiedNonAgrarWorkspace ? "with-strategy-tester" : ""}`}
              ref={(el) => { mainWorkspaceRef.current = el; }}
              style={showStrategyTesterWorkspace && !useUnifiedNonAgrarWorkspace ? { gridTemplateRows: `minmax(0, ${uiPrefs.chartSplitPct ?? 62}%) 6px minmax(0, 1fr)` } : undefined}
            >
              {useUnifiedNonAgrarWorkspace ? (
                <MonitoringStrategyWorkspace
                  symbol={unifiedStrategyChart?.code ?? null}
                  assetName={unifiedStrategyChart?.name ?? null}
                  selectedSymbols={selectedStrategySymbols}
                  availableAssets={useUnifiedIndicesWorkspace ? monitoringIndicesAssets : useUnifiedAnomalyWorkspace ? monitoringAnomalyAssets : monitoringIntradayAssets}
                  onSelectedSymbolsChange={useUnifiedIndicesWorkspace ? handleIndicesStrategySelectionChange : useUnifiedAnomalyWorkspace ? handleAnomalyStrategySelectionChange : handleIntradayStrategySelectionChange}
                  onFocusSymbol={handleStrategyFocusSymbol}
                  multiSelectArmed={strategyMultiSelectArmed}
                  onMultiSelectArmedChange={setStrategyMultiSelectArmed}
                  onEngineResultCache={handleStrategyEngineResultCache}
                  uiPrefs={uiPrefs}
                  intradayEventsUrl={useUnifiedIndicesWorkspace ? indicesEventsUrl : useUnifiedAnomalyWorkspace ? anomalyEventsUrl : intradayEventsUrl}
                  adapterLabel={useUnifiedAnomalyWorkspace ? "Anomaly" : undefined}
                  topContent={
                    showGrid ? (
                      <MonitoringFlexibleGrid
                        tabId={activeTab}
                        assets={allItems}
                        radarSignalState={radarSignalState}
                        activeChartId={selectedAssetId}
                        selectedStrategySymbols={selectedStrategySymbols}
                        selectedTradeId={executionFocusTradeId}
                        preferredDensity={tabConfigById(activeTab)?.preferredDensity ?? "balanced"}
                        onChartSelect={onChartSelect}
                        onIndicatorOpen={onStrategyWorkspaceSelect}
                        onOpenFullscreen={fullscreenEnabled ? onOpenFullscreen : undefined}
                        isTradeExecutionOpen={tradeExecutionPanelEnabled}
                        tradeMode={tradeMode}
                        manualLevelsBySymbol={manualLevelsBySymbol}
                        onManualLevelsChange={handleManualLevelsChange}
                        missingBuild={missingBuild}
                        loadStatusBySymbol={effectiveLoadStateBySymbol}
                        strategyEventsByFile={effectiveStrategyEventsByFile}
                        tradingViewTradesBySource={tradingViewTradesBySource}
                        preparedTradesByItemKey={preparedTradesByItemKey}
                        uiPrefs={uiPrefs}
                        agriAuditBySymbol={agriFinalStatus?.assets ?? {}}
                        agriLiveStateBySymbol={agrarCardLiveStateBySymbol}
                        liveChartAutoView={liveChartAutoView}
                      />
                    ) : (
                      <div className="expandedChartPane fullscreenChartPane">
                        {activeChartDataForFullscreen ? (
                          <MonitoringChart
                            data={activeChartDataForFullscreen}
                            maxBars={0}
                            showFullscreenControl={fullscreenEnabled}
                            isFullscreen={true}
                            onFullscreenRequest={() => {
                              if (fullscreenItem) onOpenFullscreen(fullscreenItem);
                            }}
                            uiPrefs={uiPrefs}
                          />
                        ) : (
                          <div className="expanded-empty">No chart data</div>
                        )}
                        <div className="expanded-chart-label">
                          <div className="expanded-chart-symbol">{fullscreenItem?.short ?? fullscreenItem?.code ?? "-"}</div>
                          <div className="expanded-chart-desc">{fullscreenItem?.name ?? "-"}</div>
                        </div>
                        <button type="button" className="expanded-chart-close" onClick={onExitFullscreen} aria-label="Exit fullscreen">
                          ⊡
                        </button>
                      </div>
                    )
                  }
                />
              ) : (
                <>
                  {showGrid ? (
                    <MonitoringFlexibleGrid
                      tabId={activeTab}
                      assets={allItems}
                      radarSignalState={radarSignalState}
                      activeChartId={selectedAssetId}
                      selectedStrategySymbols={selectedStrategySymbols}
                      selectedTradeId={executionFocusTradeId}
                      preferredDensity={tabConfigById(activeTab)?.preferredDensity ?? "balanced"}
                      onChartSelect={onChartSelect}
                      onIndicatorOpen={onIndicatorOpen}
                      onOpenFullscreen={fullscreenEnabled ? onOpenFullscreen : undefined}
                      isTradeExecutionOpen={tradeExecutionPanelEnabled}
                      tradeMode={tradeMode}
                      manualLevelsBySymbol={manualLevelsBySymbol}
                      onManualLevelsChange={handleManualLevelsChange}
                      missingBuild={missingBuild}
                      loadStatusBySymbol={effectiveLoadStateBySymbol}
                      strategyEventsByFile={effectiveStrategyEventsByFile}
                      tradingViewTradesBySource={tradingViewTradesBySource}
                      preparedTradesByItemKey={preparedTradesByItemKey}
                      uiPrefs={uiPrefs}
                      agriAuditBySymbol={agriFinalStatus?.assets ?? {}}
                      agriLiveStateBySymbol={agrarCardLiveStateBySymbol}
                      liveChartAutoView={liveChartAutoView}
                    />
                  ) : (
                    <div className="expandedChartPane fullscreenChartPane">
                      {activeChartDataForFullscreen ? (
                        <MonitoringChart
                          data={activeChartDataForFullscreen}
                          maxBars={0}
                          showFullscreenControl={fullscreenEnabled}
                          isFullscreen={true}
                          uiPrefs={uiPrefs}
                          onFullscreenRequest={() => {
                            if (fullscreenItem) onOpenFullscreen(fullscreenItem);
                          }}
                        />
                      ) : (
                        <div className="expanded-empty">No chart data</div>
                      )}
                      <div className="expanded-chart-label">
                        <div className="expanded-chart-symbol">{fullscreenItem?.short ?? fullscreenItem?.code ?? "-"}</div>
                        <div className="expanded-chart-desc">{fullscreenItem?.name ?? "-"}</div>
                      </div>
                      <button type="button" className="expanded-chart-close" onClick={onExitFullscreen} aria-label="Exit fullscreen">
                        ⊡
                      </button>
                    </div>
                  )}
                  {showStrategyTesterWorkspace ? (
                    <div className="mon-drag-handle-vert" onMouseDown={handleVertDragStart} aria-hidden="true" />
                  ) : null}
                  {showStrategyTesterWorkspace ? (
                    <div className="strategyTesterCurves">
                      <div className="stc-header">
                        <span className="stc-label">Equity / Drawdown</span>
                        {activePerformance?.summary ? (
                          <>
                            <span className={`st-stat-chip ${activePerformance.summary.totalReturnPercent >= 0 ? "pos" : "neg"}`}>
                              {activePerformance.summary.totalReturnPercent >= 0 ? "+" : ""}{activePerformance.summary.totalReturnPercent.toFixed(1)}%
                            </span>
                            <span className="st-stat-chip muted">{activePerformance.summary.totalTrades} trades</span>
                          </>
                        ) : null}
                      </div>
                      {activePerformance ? (
                        <>
                          <StrategyTesterEquityChart
                            data={activePerformance.equityCurve}
                            timeRangeFrom={strategyTimeRangeFrom}
                            totalReturnPercent={activePerformance.summary.totalReturnPercent}
                            cagr={activePerformance.summary.cagr}
                            fillContainer
                          />
                          <StrategyTesterDrawdownChart
                            data={activePerformance.drawdownCurve}
                            maxDrawdownPercent={activePerformance.summary.maxDrawdownPercent}
                            avgDrawdownPercent={activePerformance.summary.avgDrawdownPercent}
                            top5DrawdownsPercent={activePerformance.summary.top5DrawdownsPercent}
                            timeRangeFrom={strategyTimeRangeFrom}
                            fillContainer
                          />
                        </>
                      ) : (
                        <div className="st-empty">No backtest data</div>
                      )}
                    </div>
                  ) : null}
                </>
              )}
            </div>
            {!useUnifiedNonAgrarWorkspace && showStrategyTesterWorkspace ? (
              <div className="mon-drag-handle-horiz" onMouseDown={handleHorizDragStart} aria-hidden="true" />
            ) : null}
            {!useUnifiedNonAgrarWorkspace && showStrategyTesterWorkspace ? (
              <div className="testerWorkspaceSide">
                <StrategyTesterPanel
                  symbol={strategyTesterPanelContext.symbol}
                  assetName={strategyTesterPanelContext.assetName}
                  strategyName={strategyTesterPanelContext.strategyName}
                  hasStrategy={strategyTesterHasStrategy}
                  loading={strategyPerfLoading || (strategyTesterScopeItems.length === 1 && fullHistoryLoading)}
                  performance={activePerformance}
                  useCompounding={strategyUseCompounding}
                  onToggleCompounding={() => setStrategyTesterConfig((c) => ({ ...c, compounding: !c.compounding }))}
                  dataMode={strategyTesterDataMode}
                  onDataModeChange={setStrategyTesterDataMode}
                  layoutMode="sidebar"
                  parityPercent={activeParityRow?.parityPercent ?? null}
                  parityBadge={activeParityRow?.badgeStatus ?? null}
                  timeRangeFrom={strategyTimeRangeFrom}
                  onSetTimeRange={(from) => setStrategyTesterConfig((c) => ({ ...c, timeRangeFrom: from }))}
                  eventsSource={
                    Boolean(strategyTesterCustomEngineKey) && strategyTesterDataMode === "engine"
                      ? (customEnginePayload?.source ?? activeEventsSource)
                      : activeEventsSource
                  }
                  engineSourceStatus={strategyTesterEngineSourceStatus}
                  engineStatusMessage={strategyTesterEngineStatusMessage}
                  engineSourceLabel={customEnginePayload?.sourceLabel ?? null}
                  engineTradeCount={strategyTesterEngineTradeCount}
                  engineFirstTradeDate={strategyTesterEngineFirstTradeDate}
                  engineOpenTrade={strategyTesterEngineOpenTrade}
                  currentSignalLabel={strategyTesterEngineCurrentSignalLabel}
                  currentSignalStatus={strategyTesterEngineCurrentSignalStatus}
                  historicalParityScore={strategyTesterEngineHistoricalParityScore}
                />
              </div>
            ) : null}
            {rightColumnEnabled ? (
              <div
                className="monitoringRightColumn"
                style={{ display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0, height: "100%", position: "relative", isolation: "isolate" }}
              >
                {/* Mobile close strip — shown on ≤768px via CSS */}
                <div className="mobile-panel-close-btn" style={{ display: "none", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", letterSpacing: "0.04em" }}>
                    {liveSignalsPanelEnabled && sentinelPanelEnabled ? "Live · Sentinel" : liveSignalsPanelEnabled ? "Live Signale" : "Sentinel"}
                  </span>
                  <button
                    type="button"
                    style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer", minHeight: 44, minWidth: 44, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, lineHeight: 1 }}
                    onClick={() => { if (liveSignalsPanelEnabled) setLiveSignalsOpen(false); if (sentinelPanelEnabled) setSentinelOpen(false); }}
                    aria-label="Panel schließen"
                  >✕</button>
                </div>
                {liveSignalsPanelEnabled ? (
                  <div style={{ flex: 1, minHeight: 0 }}>
                    <LiveSignalsPanel
                      feed={liveSignalsFeed}
                      refreshLabel={liveSignalsRefreshLabel}
                      refreshStatus={refreshStatus}
                      onSelectSignal={onFocusLiveSignal}
                      colors={liveSignalColors}
                      onResizeStart={onLivePanelResizeStart}
                      scale={liveCardScale}
                    />
                  </div>
                ) : null}
                {sentinelPanelEnabled ? (
                  <div style={{ flex: 1, minHeight: 0 }}>
                    <SentinelErrorBoundary>
                      <SentinelPanel
                        halved={liveSignalsPanelEnabled}
                        onResizeStart={onLivePanelResizeStart}
                        feed={liveSignalsFeed}
                      />
                    </SentinelErrorBoundary>
                  </div>
                ) : null}
              </div>
            ) : null}
            {tradeExecutionPanelEnabled ? (
              <TradeExecutionPanel
                activeSymbol={activeChart?.code ?? null}
                activeName={activeChart?.name ?? null}
                activeStrategyId={activeChart?.strategy ?? null}
                activeTimeframe={activeChart?.timeframe ?? null}
                parityStatus={activeExecutionParityStatus}
                eventsSourceHint={activeEventsFile ? `/generated/monitoring/${activeEventsFile}` : null}
                latestPrice={activeLatestPrice}
                activeSignal={activeSignalState}
                mode={tradeMode}
                onModeChange={setTradeMode}
                manualLevels={activeManualLevels}
                tradeCandidates={activeTradeCandidates}
                selectedTradeId={executionFocusTradeId}
                onSelectedTradeIdChange={setExecutionFocusTradeId}
                onManualLevelsChange={(levels) => {
                  if (!activeChart?.code) return;
                  handleManualLevelsChange(activeChart.code, levels);
                }}
              />
            ) : null}
            {!tradeExecutionPanelEnabled && isTradeExecutionOpen && !tradeExecutionEnabled ? (
              <aside className="input-panel">
                <div className="no-strat-text">Trade-Ausführung pausiert</div>
              </aside>
            ) : null}
          </div>
          {isInputPanelOpen ? (
            <aside
              className="input-panel"
              ref={(el) => { inputPanelRef.current = el; }}
              style={{ width: `${uiPrefs.inputPanelWidthPx ?? 300}px` }}
            >
              <div className="input-panel-header">
                <div>
                  <div className="input-panel-symbol">{activeChart?.code ?? "-"}</div>
                  <div className="input-panel-strategy">{activeChart?.strategy ?? activeChart?.name ?? ""}</div>
                </div>
                <button type="button" className="input-panel-close" onClick={() => setIsInputPanelOpen(false)}>×</button>
              </div>
              <div className="input-panel-status-wrap">
                {!activeHasStrategy ? (
                  <span className="status-badge no-strat">No signals</span>
                ) : (
                  <span className="status-badge ok">Strategy aktiv</span>
                )}
              </div>
              {!activeHasStrategy ? (
                <div className="no-strat-text">Keine Signale für dieses Asset.</div>
              ) : (
                Object.entries(groupedParams).map(([groupName, params]) => (
                  <div key={groupName}>
                    <div className="param-group-title">{groupName}</div>
                    {params.map((p) => (
                      <div key={p.key} className="param-row">
                        <div className="param-label">{p.label}</div>
                        <div>
                          {p.type === "bool" ? (
                            <input type="checkbox" checked={!!p.value} readOnly />
                          ) : (
                            <span className="param-value-text">{String(p.value ?? "-")}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </aside>
          ) : null}
        </div>
      )}

      <style jsx global>{`
        .monitoringPage {
          width: 100%;
          height: 100%;
          min-height: 0;
          margin: 0;
          padding: 0;
          background: var(--monitoring-chart-bg);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          --monitoring-tabbar-height: 34px;
          --monitoring-header-chart-gap: 10px;
          --monitoring-chart-bg: #0A0A0A;
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, sans-serif;
        }
        .monitoringTabBar {
          position: relative;
          z-index: 20;
          flex: 0 0 var(--monitoring-tabbar-height);
          height: var(--monitoring-tabbar-height);
          min-height: var(--monitoring-tabbar-height);
          width: 100%;
          max-width: 100%;
          box-sizing: border-box;
          pointer-events: none;
          background: linear-gradient(180deg, rgba(11, 12, 14, 0.99) 0%, rgba(8, 9, 11, 0.98) 100%);
          border-bottom: 1px solid rgba(255, 255, 255, 0.09);
          display: flex;
          flex-direction: row;
          flex-wrap: nowrap;
          align-items: center;
          justify-content: space-between;
          gap: 0;
          padding: 0;
          margin: 0;
          overflow-x: hidden;
          overflow-y: visible;
          box-shadow: 0 6px 16px rgba(0, 0, 0, 0.18);
        }
        .monitoringTabRail {
          display: flex;
          align-items: center;
          gap: 0;
          flex: 1 1 auto;
          min-width: 0;
          height: 100%;
        }
        .monitoringTabScroll {
          display: flex;
          flex: 1 1 auto;
          flex-direction: row;
          flex-wrap: nowrap;
          align-items: center;
          gap: 0;
          min-width: 0;
          height: 100%;
          overflow-x: auto;
          overflow-y: hidden;
          scrollbar-width: none;
        }
        .monitoringTabScroll::-webkit-scrollbar {
          height: 0;
        }
        .monitoringTabBarActions {
          display: flex;
          flex: 0 0 auto;
          flex-direction: row;
          align-items: center;
          justify-content: flex-end;
          gap: 0;
          height: 100%;
          min-width: 0;
          max-width: 100%;
          margin-left: auto;
          overflow-x: hidden;
          overflow-y: hidden;
          padding-left: 0;
          border-left: 1px solid rgba(255, 255, 255, 0.08);
        }
        .monitoringTopbar {
          position: relative;
          z-index: 20;
          pointer-events: none;
        }
        .monitoringTabBar button.tab,
        .monitoringTopbar button.tab {
          pointer-events: auto;
          cursor: pointer;
        }
        .monitoring-sidebar-toggle {
          flex: 0 0 auto;
          width: 26px;
          min-width: 26px;
          height: 100%;
          padding: 0;
          border: 0;
          border-right: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 0;
          background: transparent;
          color: rgba(228, 232, 239, 0.84);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: -0.1em;
          line-height: 1;
          box-shadow: none;
          transition: background 120ms ease, color 120ms ease;
        }
        .monitoring-sidebar-toggle:hover,
        .monitoring-sidebar-toggle:focus-visible {
          background: rgba(255, 255, 255, 0.07);
          color: #ffffff;
        }
        .monitoringTabBar .monitoring-tab-card {
          position: relative;
          flex: 0 0 auto;
          height: 100%;
          min-height: 100%;
          margin: 0;
          padding: 0 10px;
          min-width: max-content;
          box-sizing: border-box;
          border: 0;
          border-right: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 0;
          display: inline-flex;
          flex-direction: row;
          align-items: center;
          justify-content: center;
          gap: 6px;
          font-size: 11px;
          font-weight: 600;
          line-height: 1;
          letter-spacing: 0.01em;
          cursor: pointer;
          user-select: none;
          -webkit-tap-highlight-color: transparent;
          background: transparent;
          color: rgba(212, 217, 225, 0.78);
          white-space: nowrap;
          box-shadow: none;
          transition: background 120ms ease, color 120ms ease;
        }
        .monitoringTabBar .monitoring-tab-card:hover {
          background: rgba(255, 255, 255, 0.06);
          color: rgba(244, 247, 251, 0.98);
        }
        .monitoringTabBar .monitoring-tab-card:focus-visible {
          outline: 1px solid rgba(255, 255, 255, 0.35);
          outline-offset: 1px;
        }
        .monitoringTabBar .monitoring-tab-card.active {
          background: rgba(30, 32, 36, 0.94);
          color: #ffffff;
          font-weight: 600;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
        }
        .monitoringTabBar .monitoring-tab-card--all {
          border-right: 0;
        }
        .monitoringTabBar .monitoring-tab-card--placeholder {
          opacity: 0.46;
          color: rgba(163, 169, 178, 0.72);
          cursor: default;
        }
        .monitoringTabBar .monitoring-tab-card--placeholder:hover {
          background: transparent;
          color: rgba(163, 169, 178, 0.72);
        }
        .monitoring-tab-label {
          display: inline-flex;
          align-items: center;
          line-height: 1;
        }
        .monitoring-tab-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 14px;
          height: 14px;
          flex-shrink: 0;
          opacity: 0.72;
          color: inherit;
          transition: opacity 120ms ease;
        }
        .monitoring-tab-icon.is-active,
        .monitoringTabBar .monitoring-tab-card.active .monitoring-tab-icon {
          opacity: 0.98;
        }
        .monitoring-tab-icon-img {
          width: 14px;
          height: 14px;
          border-radius: 0;
          object-fit: contain;
          display: block;
        }
        .monitoring-tab-icon-fallback {
          display: block;
          width: 14px;
          height: 14px;
          border-radius: 2px;
          background: rgba(255, 255, 255, 0.08);
        }
        .monitoring-tab-icon-svg {
          color: currentColor;
          display: block;
        }
        .monitoringTopbarMeta {
          flex: 0 1 auto;
          min-width: 0;
          padding: 0 10px;
          color: rgba(170, 176, 185, 0.68);
          font-size: 9px;
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          letter-spacing: 0.03em;
        }
        .monitoringTabBar .tab-action {
          height: 100%;
          min-height: 100%;
          box-sizing: border-box;
          padding: 0 10px;
          border-radius: 0;
          border: 0;
          border-left: 1px solid rgba(255, 255, 255, 0.08);
          background: transparent;
          color: rgba(224, 228, 236, 0.78);
          font-size: 10px;
          font-weight: 600;
          line-height: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          white-space: nowrap;
          box-shadow: none;
          cursor: pointer;
          transition: background 120ms ease, color 120ms ease;
        }
        .monitoringTabBar .tab-action:hover {
          background: rgba(255, 255, 255, 0.06);
          color: #ffffff;
        }
        .monitoringTabBar .tab-action.active {
          background: rgba(30, 32, 36, 0.94);
          color: #ffffff;
          font-weight: 600;
          box-shadow: none;
        }
        .monitoringTabBar .tab-action:disabled {
          opacity: 0.56;
          cursor: default;
        }
        .tab-strategy-tester,
        .tab-live-signals,
        .tab-live-chart-autoview,
        .tab-refresh,
        .tab-monitoring-settings {
          min-width: 0;
        }
        .tab-refresh,
        .tab-monitoring-settings,
        .tab-live-chart-autoview {
          width: 34px;
          padding: 0;
          justify-content: center;
        }
        .tab-monitoring-settings {
          width: 36px;
        }
        .tab-refresh svg,
        .tab-monitoring-settings svg,
        .tab-live-chart-autoview svg {
          flex-shrink: 0;
        }
        .tab-live-chart-autoview.active {
          color: #7dd3fc;
        }
        .tab-refresh.is-error {
          color: #ffd2d2;
        }
        .parity-debug-warning {
          pointer-events: auto;
          flex: 0 1 auto;
          align-self: stretch;
          display: inline-flex;
          align-items: center;
          padding: 0 10px;
          border-radius: 0;
          border-right: 1px solid rgba(255, 255, 255, 0.08);
          background: transparent;
          color: rgba(219, 224, 232, 0.76);
          font-size: 9px;
          font-weight: 600;
          line-height: 1.15;
          white-space: nowrap;
          max-width: min(30vw, 260px);
          overflow: hidden;
          text-overflow: ellipsis;
        }
        :global(body.ivq-monitoring-topbar-active .ivq-sidebar-expand-zone),
        :global(body.ivq-monitoring-topbar-active .ivq-sidebar-collapse-btn),
        :global(body.ivq-monitoring-topbar-active .ivq-mobile-sidebar-toggle) {
          display: none !important;
        }
        .monitoring-live-tab {
          display: flex;
          flex-direction: column;
          min-height: 0;
        }
        .monitoring-live-header {
          flex: 0 0 auto;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 6px 12px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          background: linear-gradient(180deg, rgba(13, 14, 18, 0.96) 0%, rgba(11, 12, 15, 0.88) 100%);
        }
        .monitoring-live-title {
          display: flex;
          align-items: baseline;
          gap: 8px;
        }
        .monitoring-live-title-main {
          font-size: 12px;
          font-weight: 700;
          color: #f5f7fa;
          letter-spacing: 0.02em;
        }
        .monitoring-live-sub {
          font-size: 10px;
          color: #7b8190;
        }
        .monitoring-live-chips {
          display: flex;
          gap: 6px;
        }
        .monitoring-live-chip {
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.04em;
          padding: 2px 7px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          color: #c7ccd4;
          background: rgba(255, 255, 255, 0.04);
        }
        .monitoring-live-chip.is-open {
          color: #22c55e;
          border-color: rgba(34, 197, 94, 0.34);
          background: rgba(34, 197, 94, 0.1);
        }
        .monitoring-live-chip.is-fresh {
          color: #fb923c;
          border-color: rgba(251, 146, 60, 0.34);
          background: rgba(251, 146, 60, 0.1);
        }
        .monitoring-live-chip.is-closed {
          color: #8b95a3;
        }
        .monitoring-live-research {
          margin-left: auto;
          font-size: 9px;
          color: #5a606e;
          letter-spacing: 0.04em;
        }
        .monitoring-live-grid {
          flex: 1 1 auto;
          min-height: 0;
          position: relative;
        }
        .monitoring-live-empty {
          flex: 1 1 auto;
          display: grid;
          place-items: center;
          align-content: center;
          gap: 4px;
          color: #7b8190;
        }
        .monitoring-live-empty-title {
          font-size: 13px;
          font-weight: 600;
          color: #c7ccd4;
        }
        .monitoring-live-empty-sub {
          font-size: 11px;
          color: #5a606e;
        }
        .monitoring-fwd-section {
          flex: 0 0 auto;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          padding: 8px 12px;
        }
        .monitoring-fwd-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 6px;
        }
        .monitoring-fwd-title {
          font-size: 11px;
          font-weight: 700;
          color: #c7ccd4;
          letter-spacing: 0.02em;
        }
        .monitoring-fwd-count {
          font-size: 9px;
        }
        .monitoring-fwd-table {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .monitoring-fwd-row {
          display: grid;
          grid-template-columns: 60px 1fr 46px 90px 90px 90px 36px 60px 90px;
          gap: 0 10px;
          align-items: center;
          font-size: 10px;
          color: #c7ccd4;
          padding: 3px 4px;
          border-radius: 4px;
        }
        .monitoring-fwd-row--head {
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.04em;
          color: #5a606e;
          padding-bottom: 2px;
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .monitoring-fwd-row:not(.monitoring-fwd-row--head):hover {
          background: rgba(255,255,255,0.03);
        }
        .monitoring-fwd-symbol {
          font-weight: 700;
          color: #f5f7fa;
        }
        .monitoring-fwd-strategy {
          color: #7b8190;
          font-size: 9px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .monitoring-fwd-dir.is-long {
          color: #22c55e;
          font-weight: 700;
        }
        .monitoring-fwd-dir.is-short {
          color: #f87171;
          font-weight: 700;
        }
        .monitoring-fwd-sl {
          color: #f87171;
        }
        .monitoring-fwd-tp {
          color: #22c55e;
        }
        .monitoring-fwd-pnl {
          font-weight: 700;
          font-variant-numeric: tabular-nums;
        }
        .monitoring-fwd-pnl.is-pnl-pos {
          color: #22c55e;
        }
        .monitoring-fwd-pnl.is-pnl-neg {
          color: #f87171;
        }
        .monitoringContent {
          z-index: 1;
          flex: 1 1 auto;
          min-height: 0;
          width: 100%;
          background: var(--monitoring-chart-bg);
          overflow: hidden;
          box-sizing: border-box;
          position: relative;
        }
        .monitoringContent.input-open {
          padding-right: 300px;
        }
        .monitoringExecutionLayout {
          width: 100%;
          height: 100%;
          min-height: 0;
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          overflow: hidden;
        }
        .monitoringExecutionLayout.show-side-panel {
          grid-template-columns: minmax(0, 1fr) clamp(320px, 24vw, 420px);
        }
        .monitoringExecutionLayout.show-strategy-tester {
          grid-template-columns: minmax(0, 1fr) 6px auto;
        }
        .monitoringExecutionLayout.show-live-signals-panel {
          grid-template-columns: minmax(0, 1fr) clamp(360px, 24vw, 440px);
        }
        .monitoringExecutionLayout.show-live-signals-panel.show-side-panel {
          grid-template-columns: minmax(0, 1fr) clamp(260px, 18vw, 320px) clamp(300px, 22vw, 400px);
        }
        .monitoringExecutionLayout.show-live-signals-panel.show-strategy-tester {
          grid-template-columns: minmax(0, 1fr) clamp(260px, 18vw, 320px) 6px auto;
        }
        .tab-live-signals,
        .tab-sentinel {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .live-signals-panel {
          height: calc(100vh - var(--monitoring-tabbar-height));
          min-height: 0;
          min-width: 0;
          background: var(--monitoring-chart-bg);
          border-left: 1px solid rgba(255, 255, 255, 0.08);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          box-sizing: border-box;
        }
        .live-signals-header {
          flex: 0 0 auto;
          padding: 10px 12px 8px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }
        .live-signals-title {
          color: #f5f7fa;
          font-size: 12px;
          font-weight: 700;
        }
        .live-signals-sub {
          margin-top: 3px;
          color: #7b8088;
          font-size: 9px;
        }
        .live-signals-stats {
          margin-top: 6px;
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          color: #9aa3ad;
          font-size: 9px;
        }
        .live-signals-scroll {
          flex: 1 1 auto;
          min-height: 0;
          overflow-y: auto;
          overflow-x: hidden;
          padding: 8px 10px 10px;
        }
        .live-signals-section + .live-signals-section {
          margin-top: 10px;
        }
        .live-signals-section-title {
          color: rgba(235, 235, 245, 0.55);
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          margin-bottom: 6px;
        }
        .live-signals-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .live-signals-empty {
          color: #7b8088;
          font-size: 10px;
          padding: 6px 2px;
        }
        .live-signal-card {
          width: 100%;
          text-align: left;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.025);
          border-radius: 12px;
          padding: 8px 9px;
          cursor: pointer;
          color: #e8edf3;
        }
        .live-signal-card:hover {
          border-color: rgba(255, 255, 255, 0.16);
          background: rgba(255, 255, 255, 0.04);
        }
        .live-signal-card-head {
          display: flex;
          align-items: flex-start;
          gap: 7px;
        }
        .live-signal-icon {
          width: 22px;
          height: 22px;
          border-radius: 6px;
          flex-shrink: 0;
          object-fit: contain;
          border: 1px solid rgba(255, 255, 255, 0.08);
        }
        .live-signal-icon-fallback {
          display: inline-block;
          background: rgba(255, 255, 255, 0.06);
        }
        .live-signal-symbol {
          font-size: 10px;
          font-weight: 700;
          color: #f5f7fa;
        }
        .live-signal-name {
          font-weight: 500;
          color: #9aa3ad;
        }
        .live-signal-meta {
          margin-top: 2px;
          display: flex;
          flex-wrap: wrap;
          gap: 5px;
          font-size: 8px;
        }
        .live-signal-strategy {
          color: #7b8088;
        }
        .live-signal-dir-long {
          color: #22c55e;
          font-weight: 700;
        }
        .live-signal-dir-short {
          color: #ff4d5a;
          font-weight: 700;
        }
        .live-signal-status-open {
          color: #22c55e;
          font-weight: 600;
        }
        .live-signal-status-live {
          color: #2dd4bf;
          font-weight: 600;
        }
        .live-signal-status-wait {
          color: #eab308;
          font-weight: 600;
        }
        .live-signal-status-confirmed {
          color: #60a5fa;
          font-weight: 600;
        }
        .live-signal-prices,
        .live-signal-levels,
        .live-signal-footer {
          margin-top: 4px;
          font-size: 9px;
          color: #a7b0bb;
          line-height: 1.35;
        }
        .live-signal-footer {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .live-signal-countdown {
          color: #eab308;
        }
        .live-signal-source {
          color: #7b8088;
        }
        .live-signal-pl.pos {
          color: #22c55e;
        }
        .live-signal-pl.neg {
          color: #ff4d5a;
        }
        .monitoringMainWorkspace {
          min-width: 0;
          min-height: 0;
          height: 100%;
          display: grid;
          grid-template-rows: minmax(0, 1fr);
          gap: 0;
          overflow: hidden;
        }
        .monitoringMainWorkspace.with-strategy-tester {
          grid-template-rows: minmax(0, 62%) 6px minmax(0, 1fr);
          gap: 0;
          padding: 4px 0 6px 6px;
          box-sizing: border-box;
        }
        .mon-drag-handle-vert {
          grid-column: 1 / -1;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: row-resize;
          user-select: none;
          z-index: 10;
        }
        .mon-drag-handle-vert::after {
          content: '';
          display: block;
          width: 40px;
          height: 3px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.14);
          transition: background 140ms ease, width 140ms ease;
        }
        .mon-drag-handle-vert:hover::after {
          background: rgba(255, 255, 255, 0.36);
          width: 60px;
        }
        .mon-drag-handle-horiz {
          width: 6px;
          min-height: 0;
          height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          cursor: col-resize;
          user-select: none;
          z-index: 10;
          flex-shrink: 0;
        }
        .mon-drag-handle-horiz::after {
          content: '';
          display: block;
          width: 3px;
          height: 40px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.14);
          transition: background 140ms ease, height 140ms ease;
        }
        .mon-drag-handle-horiz:hover::after {
          background: rgba(255, 255, 255, 0.36);
          height: 60px;
        }
        .monitoringMainWorkspace .monitoring-flexible-grid,
        .monitoringMainWorkspace .monitoring-grid,
        .monitoringMainWorkspace .agrarGrid,
        .monitoringMainWorkspace .monitoring-all-strategies-dashboard {
          height: 100% !important;
          min-height: 0;
        }
        .monitoring-all-strategies-dashboard {
          position: relative;
          width: 100%;
          height: 100%;
          min-height: 0;
          max-height: 100%;
          overflow: hidden;
          background: var(--monitoring-chart-bg);
          box-sizing: border-box;
          display: flex;
          flex-direction: row;
          align-items: stretch;
          padding: 6px 10px 8px;
        }
        .monitoring-all-strategies-column {
          min-width: 0;
          min-height: 0;
          height: 100%;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .monitoring-all-strategies-column--left {
          padding-right: 0;
        }
        .monitoring-all-strategies-column--right {
          padding-left: 0;
        }
        .monitoring-all-strategies-layout-reset {
          position: absolute;
          top: 8px;
          right: 10px;
          z-index: 22;
          pointer-events: auto;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(18, 21, 26, 0.62);
          color: rgba(235, 235, 245, 0.72);
          border-radius: 6px;
          font-size: 10px;
          line-height: 1;
          padding: 4px 7px;
          cursor: pointer;
          opacity: 0;
          transition: opacity 120ms ease, background 120ms ease, border-color 120ms ease;
        }
        .monitoring-all-strategies-dashboard:hover .monitoring-all-strategies-layout-reset,
        .monitoring-all-strategies-dashboard.is-resizing .monitoring-all-strategies-layout-reset {
          opacity: 1;
        }
        .monitoring-all-strategies-layout-reset:hover {
          background: rgba(36, 42, 50, 0.78);
          border-color: rgba(255, 255, 255, 0.22);
          color: rgba(245, 245, 250, 0.92);
        }
        .monitoring-all-strategies-splitter {
          flex-shrink: 0;
          pointer-events: auto;
          touch-action: none;
          opacity: 0;
          background: transparent;
          border: none;
          box-shadow: none;
          outline: none;
        }
        .monitoring-all-strategies-splitter::before {
          display: none;
        }
        .monitoring-all-strategies-splitter-col {
          flex: 0 0 10px;
          width: 10px;
          min-width: 10px;
          height: 100%;
          cursor: col-resize;
        }
        .monitoring-all-strategies-splitter-row {
          flex: 0 0 10px;
          width: 100%;
          min-height: 10px;
          height: 10px;
          cursor: row-resize;
        }
        :global(body.monitoring-splitter-dragging) {
          user-select: none !important;
          -webkit-user-select: none !important;
          overscroll-behavior: none;
        }
        .monitoring-all-strategies-mosaic-cell {
          display: grid;
          grid-template-rows: 14px minmax(0, 1fr);
          gap: 3px;
          min-width: 0;
          min-height: 0;
          overflow: hidden;
        }
        .monitoring-all-strategies-mosaic-cell[data-group="Indizes"],
        .monitoring-all-strategies-mosaic-cell[data-group="Invest"] {
          grid-template-rows: 12px minmax(0, 1fr);
        }
        .monitoring-all-strategies-section-label {
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.02em;
          color: rgba(235, 235, 245, 0.38);
          padding: 0 2px;
          line-height: 14px;
          height: 14px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .monitoring-all-strategies-section-grid {
          display: grid;
          width: 100%;
          height: 100%;
          min-height: 0;
          box-sizing: border-box;
          gap: 4px;
        }
        .monitoring-all-strategies-mosaic-cell[data-group="Indizes"] .monitoring-all-strategies-section-grid,
        .monitoring-all-strategies-mosaic-cell[data-group="Invest"] .monitoring-all-strategies-section-grid {
          gap: 3px;
        }
        .monitoring-all-strategies-mosaic-cell[data-group="Aktien"] .monitoring-all-strategies-section-grid,
        .monitoring-all-strategies-mosaic-cell[data-group="Intraday MT"] .monitoring-all-strategies-section-grid {
          gap: 5px;
        }
        .monitoring-all-strategies-section-grid.layout-agrar,
        .monitoring-all-strategies-section-grid.layout-intraday {
          grid-template-columns: repeat(2, minmax(0, 1fr));
          grid-template-rows: repeat(2, minmax(60px, 1fr));
        }
        .monitoring-all-strategies-section-grid.layout-metalle,
        .monitoring-all-strategies-section-grid.layout-aktien {
          grid-template-columns: repeat(3, minmax(0, 1fr));
          grid-template-rows: repeat(2, minmax(60px, 1fr));
        }
        .monitoring-all-strategies-section-grid.layout-indizes,
        .monitoring-all-strategies-section-grid.layout-invest {
          grid-template-columns: repeat(3, minmax(0, 1fr));
          grid-template-rows: minmax(60px, 1fr);
        }
        .monitoring-all-strategies-chart-cell {
          min-width: 0;
          min-height: 0;
          height: 100%;
          overflow: hidden;
        }
        .monitoring-all-strategies-dashboard :global(.chartCard.monitoring-card--all-strategies) {
          min-height: 0;
          height: 100%;
          border-radius: 6px;
        }
        .monitoring-all-strategies-dashboard :global(.monitoring-card-label) {
          top: 3px;
          left: 4px;
          gap: 0;
          max-width: calc(100% - 40px);
        }
        .monitoring-all-strategies-dashboard :global(.monitoring-card-label-head) {
          gap: 4px;
          align-items: center;
          padding: 3px 6px 3px 4px;
          border-radius: 6px;
          background: var(--monitoring-chart-bg);
          -webkit-backdrop-filter: blur(8px) saturate(120%);
          backdrop-filter: blur(8px) saturate(120%);
        }
        .monitoring-all-strategies-dashboard :global(.monitoring-card-asset-icon--mini) {
          width: 17px;
          height: 17px;
          border: none;
          background: transparent;
          border-radius: 0;
          object-fit: contain;
        }
        .monitoring-all-strategies-dashboard :global(.monitoring-card-symbol) {
          font-size: 11px;
          line-height: 1.05;
        }
        .monitoring-all-strategies-dashboard :global(.monitoring-card-label-text) {
          gap: 1px;
        }
        .monitoring-all-strategies-dashboard :global(.monitoring-card-desc) {
          font-size: 11px;
          line-height: 1;
          margin-top: 0;
          opacity: 0.88;
        }
        .monitoring-all-strategies-dashboard :global(.monitoring-card-badge) {
          font-size: 7px;
          padding: 1px 4px;
          top: 3px;
          right: 3px;
        }
        .monitoring-all-strategies-dashboard :global(.monitoring-chart-shell--dashboard) {
          inset: 0;
        }
        .monitoringMainWorkspace .fullscreenChartPane {
          min-width: 0;
          min-height: 0;
          height: 100%;
        }
        .strategyTesterCurves {
          min-height: 0;
          overflow: hidden;
          background: color-mix(in srgb, var(--monitoring-chart-bg) 75%, #000 25%);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 8px;
          box-sizing: border-box;
          display: grid;
          grid-template-rows: auto minmax(0, 1fr) minmax(0, 1fr);
          gap: 0;
        }
        .stc-header {
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 4px 8px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          flex-shrink: 0;
        }
        .stc-label {
          font-size: 8px;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #5a606e;
          flex: 1;
        }
        .monitoringContent.tester-open.input-open .monitoringExecutionLayout.show-side-panel,
        .monitoringContent.execution-open.input-open .monitoringExecutionLayout.show-side-panel {
          grid-template-columns: minmax(0, 1fr) clamp(300px, 22vw, 400px);
        }
        .expandedMonitoringLayout {
          width: 100%;
          height: calc(100vh - var(--monitoring-tabbar-height));
          min-height: 0;
          display: grid;
          grid-template-columns: 1fr;
          background: var(--monitoring-chart-bg);
          padding: 4px 6px 6px 6px;
          box-sizing: border-box;
          gap: 0;
        }
        .monitoringExecutionLayout > .expandedMonitoringLayout {
          height: 100%;
        }
        .expandedMonitoringLayout.tester-open {
          grid-template-columns: minmax(0, 1fr) clamp(320px, 24vw, 420px);
          gap: 8px;
        }
        .expandedMainColumn {
          min-width: 0;
          min-height: 0;
          display: grid;
          grid-template-rows: minmax(0, 1fr);
          gap: 8px;
        }
        .expandedMainColumn.has-tester-curves {
          grid-template-rows: minmax(0, 58%) minmax(0, 42%);
        }
        .expandedChartPane {
          position: relative;
          min-width: 0;
          min-height: 0;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          overflow: hidden;
          background: var(--monitoring-chart-bg);
        }
        .expanded-empty {
          width: 100%;
          height: 100%;
          display: grid;
          place-items: center;
          color: #7b8088;
          font-size: 12px;
        }
        .expanded-chart-label {
          position: absolute;
          top: 10px;
          left: 10px;
          z-index: 10;
          pointer-events: none;
          display: flex;
          flex-direction: column;
          gap: 3px;
        }
        .expanded-chart-symbol {
          color: #f5f7fa;
          font-size: 12px;
          font-weight: 700;
          line-height: 1;
        }
        .expanded-chart-desc {
          color: #7b8088;
          font-size: 9px;
          line-height: 1;
        }
        .expanded-chart-strategy {
          color: #C8A84B;
          font-size: 8px;
          font-weight: 500;
          line-height: 1;
          margin-top: 2px;
          opacity: 0.85;
        }
        .expanded-chart-close {
          position: absolute;
          top: 10px;
          right: 10px;
          z-index: 12;
          width: 26px;
          height: 26px;
          border-radius: 7px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(9, 11, 13, 0.88);
          color: #d4dae2;
          cursor: pointer;
          font-size: 14px;
          line-height: 1;
          opacity: 0;
          transition: opacity 0.18s ease, background 0.14s;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .expandedChartPane:hover .expanded-chart-close {
          opacity: 1;
        }
        .expanded-chart-close:hover {
          background: rgba(255, 255, 255, 0.1);
        }
        .expandedTesterCurves {
          min-height: 0;
          overflow: hidden;
          background: var(--monitoring-chart-bg);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 8px;
          padding: 6px;
          box-sizing: border-box;
          display: grid;
          grid-template-rows: minmax(0, 1fr) minmax(0, 1fr);
          gap: 4px;
        }
        .expandedTesterSide {
          min-width: 0;
          min-height: 0;
          border-left: 1px solid rgba(255, 255, 255, 0.08);
          overflow: hidden;
          background: var(--monitoring-chart-bg);
        }
        .monitoring-chart-grid,
        .monitoring-grid,
        .agrarGrid {
          background: var(--monitoring-chart-bg);
        }
        .monitoring-chart-grid {
          width: 100%;
          height: calc(100vh - var(--monitoring-tabbar-height));
          min-height: 0;
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          grid-template-rows: repeat(2, minmax(0, 1fr));
          gap: 6px;
          padding: 4px 4px 4px 4px;
          box-sizing: border-box;
        }
        .testerWorkspace {
          width: 100%;
          height: 100%;
          min-height: 0;
          display: grid;
          grid-template-columns: minmax(0, 1fr) clamp(320px, 24vw, 420px);
          gap: 8px;
        }
        .testerWorkspaceMain {
          min-width: 0;
          min-height: 0;
          display: grid;
          grid-template-rows: minmax(0, 62%) minmax(0, 38%);
          gap: 8px;
        }
        .testerMainChart {
          min-width: 0;
          min-height: 0;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          overflow: hidden;
          background: var(--monitoring-chart-bg);
        }
        .testerMainCurves {
          min-height: 0;
          overflow: hidden;
          background: var(--monitoring-chart-bg);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 8px;
          padding: 6px;
          box-sizing: border-box;
          display: grid;
          grid-template-rows: minmax(0, 1fr) minmax(0, 1fr);
          gap: 4px;
        }
        .testerWorkspaceSide {
          width: 100%;
          min-width: 0;
          min-height: 0;
          border-left: 1px solid rgba(255, 255, 255, 0.08);
          overflow-y: auto;
          overflow-x: hidden;
          background: var(--monitoring-chart-bg);
        }
        .chartCard {
          position: relative;
          min-width: 0;
          min-height: 0;
          width: 100%;
          height: 100%;
          background: var(--monitoring-chart-bg);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 8px;
          overflow: hidden;
          box-sizing: border-box;
          cursor: default;
        }
        .chartCard.is-active {
          border: 1px solid rgba(255, 255, 255, 0.28);
          box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.08);
        }
        :global(.monitoring-chart-shell) {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          min-width: 0;
          min-height: 0;
          z-index: 2;
          overflow: visible;
          cursor: crosshair;
        }
        :global(.monitoring-price-axis-label) {
          z-index: 30 !important;
          pointer-events: none;
        }
        :global(.chartHost) {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          min-width: 0;
          min-height: 0;
          z-index: 1;
          cursor: crosshair;
          pointer-events: auto;
          touch-action: none;
        }
        :global(.chartHost canvas) {
          cursor: crosshair;
        }
        :global(.tradeSvgOverlay) {
          cursor: crosshair;
        }
        .monitoring-card-label {
          position: absolute;
          top: 8px;
          left: 10px;
          z-index: 20;
          pointer-events: none;
          display: flex;
          flex-direction: column;
          gap: 3px;
          align-items: flex-start;
        }
        .monitoring-card-label-head {
          display: flex;
          align-items: center;
          gap: 6px;
          min-width: 0;
          padding: 5px 9px 5px 6px;
          border-radius: 8px;
          background: var(--monitoring-chart-bg);
          -webkit-backdrop-filter: blur(10px) saturate(120%);
          backdrop-filter: blur(10px) saturate(120%);
        }
        .monitoring-card-asset-icon {
          width: 32px;
          height: 32px;
          border-radius: 0;
          object-fit: contain;
          flex-shrink: 0;
          border: none;
          background: transparent;
        }
        .monitoring-card-label-text {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }
        .assetTopLine {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .monitoring-card-symbol {
          font-size: 14px;
          font-weight: 700;
          color: #f5f7fa;
          line-height: 1.05;
        }
        .monitoring-card-desc {
          font-size: 14px;
          font-weight: 500;
          line-height: 1;
          color: #8a929c;
          opacity: 0.92;
          margin-top: 0;
        }
        .indicatorButton {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          height: 18px;
          padding: 0 6px;
          margin-top: 6px;
          background: rgba(255, 255, 255, 0.045);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 5px;
          color: rgba(214, 218, 225, 0.82);
          font-size: 8.5px;
          font-weight: 600;
          line-height: 1;
          cursor: pointer;
          pointer-events: auto;
          backdrop-filter: blur(6px);
        }
        .indicatorButton:hover {
          background: rgba(255, 255, 255, 0.08);
          color: #f5f7fa;
        }
        .indicatorButton.disabled {
          cursor: default;
          opacity: 0.9;
        }
        .indicatorButton .gear-icon {
          font-size: 9px;
          opacity: 0.8;
        }
        .monitoring-card-badge {
          position: absolute;
          right: 8px;
          top: 8px;
          z-index: 21;
          height: 18px;
          padding: 0 6px;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          font-size: 8px;
          font-weight: 700;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.12);
          color: #c7ccd4;
          pointer-events: none;
        }
        .badge-no-strat,
        .badge-missing-map {
          color: #ff4d5a;
          background: rgba(255, 77, 90, 0.1);
          border-color: rgba(255, 77, 90, 0.3);
        }
        .badge-data-warn,
        .badge-param-warn {
          color: #eab308;
          background: rgba(234, 179, 8, 0.1);
          border-color: rgba(234, 179, 8, 0.25);
        }
        .badge-data-stub {
          color: #fb923c;
          background: rgba(251, 146, 60, 0.16);
          border-color: rgba(251, 146, 60, 0.45);
          height: 20px;
          padding: 0 8px;
          font-size: 9px;
          letter-spacing: 0.04em;
        }
        .badge-candle-source-mismatch {
          color: #ff4d5a;
          background: rgba(255, 77, 90, 0.12);
          border-color: rgba(255, 77, 90, 0.32);
        }
        .badge-candle-source-fail {
          color: #ff4d5a;
          background: rgba(255, 77, 90, 0.12);
          border-color: rgba(255, 77, 90, 0.32);
        }
        .badge-parameter-fail {
          color: #eab308;
          background: rgba(234, 179, 8, 0.12);
          border-color: rgba(234, 179, 8, 0.3);
        }
        .badge-live-pass,
        .badge-recent-pass {
          color: #22c55e;
          background: rgba(34, 197, 94, 0.12);
          border-color: rgba(34, 197, 94, 0.3);
        }
        .badge-recent-warn,
        .badge-overlap-warn {
          color: #eab308;
          background: rgba(234, 179, 8, 0.12);
          border-color: rgba(234, 179, 8, 0.3);
        }
        .badge-parity-fail {
          color: #ff4d5a;
          background: rgba(255, 77, 90, 0.12);
          border-color: rgba(255, 77, 90, 0.32);
        }
        .badge-parity-warn {
          color: #eab308;
          background: rgba(234, 179, 8, 0.12);
          border-color: rgba(234, 179, 8, 0.3);
        }
        .badge-data-approx {
          color: #f97316;
          background: rgba(249, 115, 22, 0.12);
          border-color: rgba(249, 115, 22, 0.3);
        }
        .badge-data-stale {
          color: #f97316;
          background: rgba(249, 115, 22, 0.12);
          border-color: rgba(249, 115, 22, 0.3);
        }
        .badge-chart-only {
          color: #9aa3ad;
          background: rgba(154, 163, 173, 0.12);
          border-color: rgba(154, 163, 173, 0.3);
        }
        .input-panel {
          position: absolute;
          top: 0;
          right: 0;
          bottom: 0;
          width: 300px; /* overridden by inline style when dragged */
          background: var(--monitoring-chart-bg);
          border-left: 1px solid rgba(255, 255, 255, 0.1);
          overflow-y: auto;
          overflow-x: hidden;
          padding: 10px 10px 14px 14px;
          box-sizing: border-box;
        }
        .input-panel-drag-handle {
          position: absolute;
          top: 0;
          left: 0;
          width: 6px;
          height: 100%;
          cursor: col-resize;
          user-select: none;
          z-index: 20;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .input-panel-drag-handle::after {
          content: '';
          display: block;
          width: 3px;
          height: 40px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.12);
          transition: background 140ms ease, height 140ms ease;
        }
        .input-panel-drag-handle:hover::after {
          background: rgba(255, 255, 255, 0.34);
          height: 60px;
        }
        .input-panel-header {
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          margin-bottom: 8px;
        }
        .input-panel-symbol {
          font-size: 13px;
          font-weight: 700;
          color: #f5f7fa;
          line-height: 1;
        }
        .input-panel-strategy {
          margin-top: 3px;
          font-size: 10px;
          color: #7b8088;
        }
        .input-panel-close {
          width: 22px;
          height: 22px;
          border-radius: 6px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #8b9097;
          font-size: 12px;
          cursor: pointer;
        }
        .input-panel-close:hover {
          background: rgba(255, 255, 255, 0.1);
        }
        .input-panel-status-wrap {
          margin-bottom: 8px;
        }
        .status-badge {
          font-size: 9px;
          height: 18px;
          padding: 0 6px;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          font-weight: 700;
        }
        .status-badge.rebuild {
          color: #eab308;
          background: rgba(234, 179, 8, 0.1);
          border: 1px solid rgba(234, 179, 8, 0.25);
        }
        .status-badge.no-strat {
          color: #7b8088;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
        .status-badge.ok {
          color: #4ade80;
          background: rgba(74, 222, 128, 0.08);
          border: 1px solid rgba(74, 222, 128, 0.25);
        }
        .no-strat-text {
          color: #7b8088;
          font-size: 12px;
          margin-top: 14px;
        }
        .param-group-title {
          font-size: 10px;
          font-weight: 700;
          color: #7b8088;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          margin-top: 12px;
          margin-bottom: 4px;
        }
        .param-row {
          display: grid;
          grid-template-columns: minmax(150px, 1fr) 120px;
          gap: 8px;
          align-items: center;
          height: 28px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.04);
        }
        .param-label {
          font-size: 10.5px;
          color: #a3aab5;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .param-input {
          height: 23px;
          width: 100%;
          background: #0b0d10;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 5px;
          color: #f5f7fa;
          font-size: 10.5px;
          padding: 0 7px;
          box-sizing: border-box;
        }
        .param-row input[type="checkbox"] {
          width: 14px;
          height: 14px;
          accent-color: #3b82f6;
        }
        .param-value-text {
          font-size: 10.5px;
          color: #d0d3d8;
          padding: 2px 4px;
        }
        .section-compact {
          margin-top: 4px;
        }
        .grid-compact-scroll {
          width: 100%;
          height: calc(100vh - var(--monitoring-tabbar-height));
          overflow-y: auto;
          padding: 0;
          margin: 0;
          background: var(--monitoring-chart-bg);
        }
        .grid-compact {
          display: grid;
          grid-template-columns: repeat(6, minmax(0, 1fr));
          gap: 4px;
          padding: 4px;
          width: 100%;
          box-sizing: border-box;
        }
        .grid-compact :global(.chartCard) {
          min-height: 240px;
          height: 260px;
        }
        .grid-compact :global(.monitoring-card-symbol) {
          font-size: 12px;
        }
        .grid-compact :global(.monitoring-card-desc) {
          font-size: 13px;
          line-height: 1;
          margin-top: 0;
        }
        .strategyTesterPanel {
          height: calc(100vh - var(--monitoring-tabbar-height));
          min-height: 0;
          background: var(--monitoring-chart-bg);
          border-left: 1px solid rgba(255, 255, 255, 0.08);
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        .strategyTesterPanel.sidebar-mode {
          height: 100%;
          border-left: 0;
        }
        .execution-panel {
          height: calc(100vh - var(--monitoring-tabbar-height));
          min-height: 0;
          background: var(--monitoring-chart-bg);
          border-left: 1px solid rgba(255, 255, 255, 0.08);
          overflow-y: auto;
          overflow-x: hidden;
          padding: 10px;
          box-sizing: border-box;
        }
        .exec-empty {
          color: #7b8088;
          font-size: 11px;
          padding: 10px 4px;
        }
        .exec-sim-banner {
          margin: -10px -10px 10px -10px;
          padding: 8px 10px;
          font-size: 10px;
          font-weight: 600;
          line-height: 1.35;
          color: rgba(235, 235, 245, 0.82);
          background: rgba(10, 132, 255, 0.12);
          border-bottom: 1px solid rgba(10, 132, 255, 0.22);
          box-sizing: border-box;
        }
        .exec-header {
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.025);
          border-radius: 8px;
          padding: 10px;
        }
        .exec-header-clean {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .exec-header-main {
          display: grid;
          grid-template-columns: auto 1fr auto;
          gap: 10px;
          align-items: center;
        }
        .exec-icon-wrap {
          width: 34px;
          height: 34px;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.16);
          background: rgba(255, 255, 255, 0.05);
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }
        .exec-icon {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .exec-icon-fallback {
          font-size: 16px;
          line-height: 1;
        }
        .exec-symbol-stack {
          min-width: 0;
        }
        .exec-symbol {
          color: #f5f7fa;
          font-size: 14px;
          font-weight: 700;
          line-height: 1.1;
        }
        .exec-name {
          margin-top: 3px;
          color: #7b8088;
          font-size: 10px;
        }
        .exec-price-row {
          margin-top: 8px;
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 10px;
        }
        .exec-price-panel {
          text-align: right;
        }
        .exec-price-label {
          font-size: 9px;
          font-weight: 600;
          color: #7b8088;
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }
        .exec-status-row {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .exec-status-chip {
          display: inline-flex;
          align-items: center;
          height: 20px;
          border-radius: 999px;
          padding: 0 8px;
          font-size: 9px;
          font-weight: 700;
          border: 1px solid rgba(255, 255, 255, 0.15);
          color: #e5e7eb;
          background: rgba(255, 255, 255, 0.06);
        }
        .exec-status-chip.ok {
          border-color: rgba(34, 197, 94, 0.38);
          color: #9be3b2;
          background: rgba(34, 197, 94, 0.12);
        }
        .exec-status-chip.warn {
          border-color: rgba(245, 158, 11, 0.36);
          color: #f3d08e;
          background: rgba(245, 158, 11, 0.12);
        }
        .exec-status-chip.block {
          border-color: rgba(255, 69, 58, 0.38);
          color: #ff9e97;
          background: rgba(255, 69, 58, 0.12);
        }
        .exec-events-hint {
          margin-top: 7px;
          font-size: 8px;
          color: #6b7280;
          word-break: break-all;
          line-height: 1.25;
        }
        .exec-readonly-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6px;
        }
        .exec-readonly-grid > div {
          display: flex;
          flex-direction: column;
          gap: 3px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 6px;
          padding: 7px;
          background: rgba(255, 255, 255, 0.02);
        }
        .exec-readonly-grid span {
          font-size: 9px;
          color: #7b8088;
          font-weight: 600;
        }
        .exec-readonly-grid b {
          font-size: 12px;
          color: #f5f7fa;
          font-weight: 700;
        }
        .exec-risk-budget {
          display: flex;
          flex-direction: column;
          gap: 4px;
          margin-bottom: 8px;
          padding: 8px;
          border-radius: 6px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.03);
        }
        .exec-risk-budget-label {
          font-size: 9px;
          color: #7b8088;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .exec-risk-budget-value {
          font-size: 15px;
          font-weight: 700;
          color: #f5f7fa;
        }
        .exec-risk-budget-note {
          font-size: 9px;
          color: #9ca3af;
          line-height: 1.35;
        }
        .exec-price {
          color: #f5f7fa;
          font-size: 16px;
          font-weight: 700;
        }
        .exec-signal-chip {
          margin-top: 8px;
          display: inline-flex;
          align-items: center;
          height: 20px;
          border-radius: 999px;
          padding: 0 8px;
          font-size: 9px;
          font-weight: 700;
          border: 1px solid rgba(255, 255, 255, 0.15);
          background: rgba(255, 255, 255, 0.06);
          color: #cfd5de;
        }
        .exec-signal-chip.green,
        .exec-signal-box.green {
          border-color: rgba(34, 197, 94, 0.42);
          background: rgba(34, 197, 94, 0.12);
          color: #22c55e;
        }
        .exec-signal-chip.red,
        .exec-signal-box.red {
          border-color: rgba(255, 59, 48, 0.42);
          background: rgba(255, 59, 48, 0.12);
          color: #ff3b30;
        }
        .exec-signal-chip.gray,
        .exec-signal-box.gray {
          border-color: rgba(255, 255, 255, 0.16);
          background: rgba(255, 255, 255, 0.05);
          color: #9ca3af;
        }
        .exec-block {
          margin-top: 10px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.02);
          padding: 9px;
        }
        .exec-block-title {
          color: #7b8088;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          margin-bottom: 7px;
        }
        .exec-signal-box {
          height: 24px;
          border-radius: 6px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          display: flex;
          align-items: center;
          padding: 0 8px;
          font-size: 10px;
          font-weight: 700;
        }
        .exec-toggle {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6px;
        }
        .exec-toggle-compact {
          margin-top: 2px;
        }
        .exec-toggle-btn {
          height: 28px;
          border-radius: 6px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.03);
          color: #b3b9c4;
          font-size: 10px;
          font-weight: 600;
          cursor: pointer;
        }
        .exec-toggle-btn.active {
          border-color: rgba(59, 130, 246, 0.5);
          background: rgba(59, 130, 246, 0.16);
          color: #dbeafe;
        }
        .exec-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 7px;
        }
        .exec-grid label {
          display: flex;
          flex-direction: column;
          gap: 4px;
          color: #7b8088;
          font-size: 9px;
          font-weight: 600;
        }
        .exec-grid input,
        .exec-grid select {
          height: 27px;
          width: 100%;
          border-radius: 6px;
          border: 1px solid rgba(255, 255, 255, 0.11);
          background: #0b0e12;
          color: #f5f7fa;
          font-size: 11px;
          padding: 0 7px;
          box-sizing: border-box;
        }
        .exec-risk-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6px;
        }
        .exec-signal-card-grid {
          grid-template-columns: 1fr 1fr;
        }
        .exec-risk-grid > div {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-height: 38px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 6px;
          padding: 6px;
          background: rgba(255, 255, 255, 0.02);
        }
        .exec-risk-grid span {
          color: #7b8088;
          font-size: 9px;
        }
        .exec-risk-grid b {
          color: #f5f7fa;
          font-size: 12px;
          font-weight: 700;
        }
        .exec-direction-long {
          color: #22c55e;
        }
        .exec-direction-short {
          color: #ff6259;
        }
        .exec-field-missing {
          border-color: rgba(255, 69, 58, 0.34) !important;
          background: rgba(255, 69, 58, 0.09) !important;
        }
        .exec-risk-table-wrap {
          width: 100%;
          overflow-x: auto;
        }
        .exec-risk-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 10px;
          color: #d1d5db;
        }
        .exec-risk-table th {
          text-align: left;
          font-size: 9px;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          color: #8f96a3;
          font-weight: 700;
          border-bottom: 1px solid rgba(255, 255, 255, 0.12);
          padding: 6px 4px;
          white-space: nowrap;
        }
        .exec-risk-table td {
          border-bottom: 1px solid rgba(255, 255, 255, 0.07);
          padding: 7px 4px;
          vertical-align: top;
        }
        .exec-risk-account {
          color: #f3f4f6;
          font-weight: 700;
          font-size: 10px;
        }
        .exec-risk-sub {
          color: #9aa1ad;
          font-size: 9px;
          margin-top: 2px;
        }
        .exec-inline-status {
          display: inline-flex;
          align-items: center;
          padding: 2px 6px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.16);
          font-size: 9px;
          font-weight: 700;
        }
        .exec-inline-status.ok {
          border-color: rgba(34, 197, 94, 0.35);
          background: rgba(34, 197, 94, 0.1);
          color: #9de2b3;
        }
        .exec-inline-status.warn {
          border-color: rgba(245, 158, 11, 0.35);
          background: rgba(245, 158, 11, 0.1);
          color: #f5d196;
        }
        .exec-inline-status.block {
          border-color: rgba(255, 69, 58, 0.35);
          background: rgba(255, 69, 58, 0.1);
          color: #ff9f98;
        }
        .exec-broker-details > summary {
          list-style: none;
          cursor: pointer;
        }
        .exec-broker-details > summary::-webkit-details-marker {
          display: none;
        }
        .exec-summary {
          margin-bottom: 8px;
        }
        .exec-account-list {
          display: grid;
          grid-template-columns: 1fr;
          gap: 7px;
        }
        .exec-account-row {
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 6px;
          padding: 7px;
          background: rgba(255, 255, 255, 0.018);
        }
        .exec-account-main {
          display: flex;
          align-items: center;
          justify-content: space-between;
          color: #f5f7fa;
          font-size: 10px;
          font-weight: 700;
        }
        .exec-account-sub {
          margin-top: 5px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 3px 6px;
          color: #a7b0bb;
          font-size: 9px;
        }
        .exec-actions {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 6px;
        }
        .exec-actions-4 {
          grid-template-columns: 1fr 1fr 1fr 1fr;
        }
        .exec-actions button {
          height: 28px;
          border-radius: 6px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.03);
          color: #d2d8e2;
          font-size: 10px;
          font-weight: 700;
          cursor: pointer;
        }
        .exec-actions button:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.09);
        }
        .exec-actions button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .exec-preview-list {
          margin-top: 8px;
          display: grid;
          grid-template-columns: 1fr;
          gap: 5px;
        }
        .exec-preview-row {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr 0.8fr 1fr;
          gap: 5px;
          font-size: 9px;
          color: #d0d5dd;
          padding: 5px 6px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 6px;
          background: rgba(255, 255, 255, 0.02);
        }
        .exec-muted {
          margin-top: 8px;
          color: #7b8088;
          font-size: 10px;
        }
        .exec-warn-chip {
          margin-top: 8px;
          display: inline-flex;
          align-items: center;
          height: 19px;
          border-radius: 999px;
          padding: 0 7px;
          border: 1px solid rgba(255, 59, 48, 0.32);
          background: rgba(255, 59, 48, 0.12);
          color: #ff8079;
          font-size: 9px;
          font-weight: 700;
        }
        .exec-trade-list {
          margin-top: 8px;
          display: grid;
          grid-template-columns: 1fr;
          gap: 5px;
        }
        .exec-trade-item {
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.03);
          color: #d0d5dd;
          border-radius: 6px;
          padding: 6px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          cursor: pointer;
          font-size: 9px;
          font-weight: 600;
        }
        .exec-trade-item.active {
          border-color: rgba(200, 168, 75, 0.7);
          background: rgba(200, 168, 75, 0.12);
          color: #f5f7fa;
        }
        .exec-blocker-list {
          display: grid;
          grid-template-columns: 1fr;
          gap: 5px;
        }
        .exec-blocker {
          border-radius: 6px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          padding: 6px 7px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 6px;
          font-size: 9px;
          color: #d0d5dd;
        }
        .exec-blocker b {
          font-size: 9px;
          font-weight: 700;
        }
        .exec-blocker-ok {
          border-color: rgba(34, 197, 94, 0.4);
          background: rgba(34, 197, 94, 0.1);
          color: #8de0a9;
        }
        .exec-blocker-warn {
          border-color: rgba(200, 168, 75, 0.4);
          background: rgba(200, 168, 75, 0.1);
          color: #f0d48c;
        }
        .exec-blocker-block {
          border-color: rgba(255, 77, 90, 0.45);
          background: rgba(255, 77, 90, 0.12);
          color: #ff9aa3;
        }
        .st-header {
          padding: 4px 8px 3px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.07);
          flex-shrink: 0;
        }
        /* v2 header: single compact row */
        .st-header-v2 {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 4px;
          min-width: 0;
          flex-wrap: nowrap;
        }
        .st-header-compact {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 6px;
          min-width: 0;
          flex-wrap: nowrap;
        }
        /* Quick time-range strip (replaces full time-range row) */
        .st-time-quick {
          display: flex;
          gap: 2px;
          padding: 3px 8px 3px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          flex-wrap: nowrap;
          overflow-x: auto;
          scrollbar-width: none;
        }
        .st-time-quick::-webkit-scrollbar { display: none; }
        .st-tq-btn {
          height: 16px;
          padding: 0 6px;
          border-radius: 3px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.02);
          color: #50596a;
          font-size: 8px;
          font-weight: 600;
          cursor: pointer;
          white-space: nowrap;
          transition: color 0.1s, background 0.1s, border-color 0.1s;
          flex-shrink: 0;
        }
        .st-tq-btn:hover {
          background: rgba(255, 255, 255, 0.06);
          color: #b8c0cc;
        }
        .st-tq-btn.active {
          border-color: rgba(200, 210, 230, 0.35);
          background: rgba(200, 210, 230, 0.08);
          color: #dde3ef;
        }
        /* Stub views for Live / Validation / CSV Parity */
        .st-view-stub {
          flex: 1 1 auto;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 24px 16px;
          color: #6b7280;
          text-align: center;
        }
        .st-stub-icon {
          font-size: 22px;
          opacity: 0.5;
        }
        .st-stub-label {
          font-size: 11px;
          font-weight: 600;
          color: #9aa3ad;
          letter-spacing: 0.04em;
        }
        .st-stub-sub {
          font-size: 10px;
          color: #50596a;
          line-height: 1.5;
        }
        /* Smaller src select (data source) in header */
        .st-src-select {
          max-width: 56px;
        }
        .st-hc-left {
          display: flex;
          align-items: center;
          gap: 5px;
          min-width: 0;
          overflow: hidden;
          flex: 1 1 auto;
        }
        .st-hc-badge {
          flex-shrink: 0;
          width: 26px;
          height: 18px;
          border-radius: 4px;
          background: rgba(255, 255, 255, 0.07);
          border: 1px solid rgba(255, 255, 255, 0.12);
          color: #c8cdd8;
          font-size: 7px;
          font-weight: 800;
          letter-spacing: 0.04em;
          display: flex;
          align-items: center;
          justify-content: center;
          text-transform: uppercase;
        }
        .st-hc-name {
          font-size: 11px;
          font-weight: 700;
          color: #e8ecf2;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          min-width: 0;
        }
        .st-hc-sep {
          color: #3a4058;
          font-size: 10px;
          flex-shrink: 0;
        }
        .st-hc-label {
          font-size: 8px;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #6b7280;
          flex-shrink: 0;
          white-space: nowrap;
        }
        .st-header-controls {
          display: flex;
          align-items: center;
          gap: 5px;
          flex-shrink: 0;
        }
        .st-mode-select {
          height: 20px;
          padding: 0 14px 0 6px;
          font-size: 8px;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.03);
          color: #b8bec8;
          border-radius: 5px;
          cursor: pointer;
          appearance: none;
          -webkit-appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8' viewBox='0 0 8 8'%3E%3Cpath d='M1 2.5l3 3 3-3' stroke='%236b7280' stroke-width='1.2' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 4px center;
          flex-shrink: 0;
        }
        .st-mode-select:focus {
          outline: none;
          border-color: rgba(255, 255, 255, 0.22);
        }
        .st-data-mode-toggle {
          display: inline-flex;
          align-items: center;
          gap: 2px;
          padding: 2px;
          border-radius: 6px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.03);
        }
        .st-mode-btn {
          height: 18px;
          padding: 0 7px;
          border: 1px solid transparent;
          border-radius: 4px;
          background: transparent;
          color: #7b8088;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.02em;
          cursor: pointer;
          white-space: nowrap;
        }
        .st-mode-btn:hover {
          color: #c7ccd4;
          background: rgba(255, 255, 255, 0.05);
        }
        .st-mode-btn.active {
          color: #e8eaed;
          border-color: rgba(232, 234, 237, 0.28);
          background: rgba(232, 234, 237, 0.1);
        }
        .st-symbol-line {
          color: #f5f7fa;
          font-size: 12px;
          font-weight: 700;
          line-height: 1.2;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .st-strategy-line {
          margin-top: 2px;
          color: #C8A84B;
          font-size: 9px;
          font-weight: 500;
          line-height: 1.2;
          opacity: 0.85;
        }
        .st-time-range {
          display: flex;
          flex-wrap: wrap;
          gap: 3px;
          margin-top: 7px;
        }
        .st-range-btn {
          height: 18px;
          padding: 0 7px;
          border-radius: 4px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.03);
          color: #55606e;
          font-size: 9px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.12s, color 0.12s, border-color 0.12s;
          letter-spacing: 0.02em;
        }
        .st-range-btn:hover {
          background: rgba(255, 255, 255, 0.07);
          color: #c7ccd4;
        }
        .st-range-btn.active {
          border-color: rgba(232, 234, 237, 0.4);
          background: rgba(232, 234, 237, 0.08);
          color: #e8eaed;
        }
        .st-parity-chip {
          height: 18px;
          padding: 0 7px;
          border-radius: 4px;
          font-size: 9px;
          font-weight: 700;
          display: inline-flex;
          align-items: center;
          border: 1px solid transparent;
          letter-spacing: 0.02em;
          white-space: nowrap;
        }
        .st-parity-chip.parity-pass {
          border-color: rgba(34, 197, 94, 0.35);
          background: rgba(34, 197, 94, 0.1);
          color: #22c55e;
        }
        .st-parity-chip.parity-warn {
          border-color: rgba(234, 179, 8, 0.35);
          background: rgba(234, 179, 8, 0.1);
          color: #eab308;
        }
        .st-parity-chip.parity-fail {
          border-color: rgba(255, 77, 90, 0.35);
          background: rgba(255, 77, 90, 0.1);
          color: #ff4d5a;
        }
        .st-parity-chip.parity-muted {
          border-color: rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.04);
          color: #55606e;
        }
        .st-parity-chip.parity-info {
          border-color: rgba(96, 165, 250, 0.35);
          background: rgba(96, 165, 250, 0.1);
          color: #60a5fa;
        }
        .st-parity-chip.parity-hybrid {
          border-color: rgba(45, 212, 191, 0.4);
          background: rgba(45, 212, 191, 0.1);
          color: #2dd4bf;
        }
        .st-source-note {
          font-size: 9px;
          color: #60a5fa;
          margin-top: 2px;
          letter-spacing: 0.02em;
          cursor: default;
        }
        .st-source-note.st-source-hybrid {
          color: #2dd4bf;
        }
        .st-mode-btn-pending {
          opacity: 0.5;
        }
        .st-mode-btn-hybrid {
          border-color: rgba(45, 212, 191, 0.4);
          color: #2dd4bf;
        }
        .st-mode-btn-hybrid.active {
          background: rgba(45, 212, 191, 0.15);
          border-color: rgba(45, 212, 191, 0.5);
          color: #2dd4bf;
        }
        .st-comp-toggle {
          flex-shrink: 0;
          height: 22px;
          padding: 0 9px;
          border-radius: 6px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.04);
          color: #7b8088;
          font-size: 9px;
          font-weight: 700;
          cursor: pointer;
          letter-spacing: 0.02em;
          transition: background 0.14s, border-color 0.14s, color 0.14s;
          white-space: nowrap;
        }
        .st-comp-toggle:hover {
          background: rgba(255, 255, 255, 0.08);
          color: #c7ccd4;
        }
        .st-comp-toggle.active {
          border-color: rgba(200, 168, 75, 0.5);
          background: rgba(200, 168, 75, 0.12);
          color: #C8A84B;
        }
        /* Chart fill-container layout */
        .st-section-fill {
          min-height: 0;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .st-section-fill.fill {
          height: 100%;
        }
        .st-section-header {
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 4px 4px 2px;
        }
        .st-section-stats {
          display: flex;
          align-items: center;
          gap: 5px;
          flex-wrap: wrap;
        }
        .st-mini-kpi-card {
          display: grid;
          justify-items: start;
          gap: 2px;
          min-width: 92px;
          padding: 6px 9px;
          border-radius: 10px;
          border: 1px solid rgba(232, 237, 244, 0.16);
          background: rgba(12, 14, 18, 0.92);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(8px);
          text-align: left;
        }
        .st-mini-kpi-card--drawdown {
          border-color: rgba(216, 91, 104, 0.34);
          background: rgba(24, 11, 14, 0.9);
        }
        .st-mini-kpi-label {
          font-size: 8px;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #7c8798;
          white-space: nowrap;
          line-height: 1;
        }
        .st-mini-kpi-card strong {
          font-size: 12px;
          font-weight: 700;
          line-height: 1.15;
          color: #eef2f7;
          white-space: nowrap;
        }
        .st-mini-kpi-card--drawdown strong {
          color: #f08b95;
        }
        .st-stat-chip {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 9px;
          font-weight: 700;
          padding: 1px 5px;
          border-radius: 4px;
          border: 1px solid transparent;
          white-space: nowrap;
        }
        .st-stat-chip-label {
          opacity: 0.72;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }
        .st-stat-chip strong {
          font-weight: 700;
          color: inherit;
        }
        .st-stat-chip.pos {
          border-color: rgba(34, 197, 94, 0.3);
          background: rgba(34, 197, 94, 0.08);
          color: #22c55e;
        }
        .st-stat-chip.neg {
          border-color: rgba(255, 59, 48, 0.3);
          background: rgba(255, 59, 48, 0.08);
          color: #ff4d5a;
        }
        .st-stat-chip.neg-soft {
          border-color: rgba(255, 77, 90, 0.2);
          background: rgba(255, 77, 90, 0.06);
          color: #ff8079;
        }
        .st-stat-chip.muted {
          border-color: rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.04);
          color: #55606e;
        }
        .st-chart-fill {
          flex: 1 1 auto;
          min-height: 0;
          overflow: hidden;
        }
        .st-empty {
          color: #7b8088;
          font-size: 11px;
          padding: 12px;
        }
        .st-scroll {
          overflow-y: auto;
          overflow-x: hidden;
          height: 100%;
          padding: 10px;
          box-sizing: border-box;
        }
        .st-kpi-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 6px;
        }
        .st-kpi-card {
          background: linear-gradient(160deg, #141618 0%, #0d0f11 100%);
          border: 1px solid rgba(255, 255, 255, 0.065);
          border-radius: 10px;
          padding: 10px 11px 9px;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.035);
        }
        .st-kpi-label {
          font-size: 9px;
          font-weight: 600;
          color: #55606e;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .st-kpi-value {
          margin-top: 5px;
          font-size: 16px;
          font-weight: 700;
          color: #f5f7fa;
          line-height: 1;
        }
        .st-kpi-sub {
          margin-top: 3px;
          font-size: 8px;
          color: #40484f;
        }
        .st-kpi-value.positive,
        .st-stat-value.positive,
        .tone-pos {
          color: #22c55e;
        }
        .st-kpi-value.negative,
        .st-stat-value.negative,
        .tone-neg {
          color: #ff3b30;
        }
        .st-kpi-value.neutral,
        .st-stat-value.neutral {
          color: #f5f7fa;
        }
        .st-section {
          margin-top: 12px;
        }
        .st-section-title {
          color: #f5f7fa;
          font-size: 11px;
          font-weight: 700;
          margin-bottom: 8px;
        }
        .st-chart-wrap {
          background: transparent;
          border-radius: 6px;
          overflow: hidden;
        }
        .st-chart-wrap-equity {
          height: 180px;
        }
        .st-chart-wrap-drawdown {
          height: 100px;
        }
        .st-dd-top5 {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 6px;
          margin-top: 6px;
        }
        .st-dd-top5-label {
          font-size: 9px;
          color: #55606e;
          font-weight: 600;
        }
        .st-dd-top5-val {
          font-size: 9px;
          font-weight: 700;
          color: #ff4d5a;
          background: rgba(255, 77, 90, 0.1);
          border: 1px solid rgba(255, 77, 90, 0.2);
          border-radius: 4px;
          padding: 1px 5px;
        }
        .st-dist-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6px;
          margin-top: 8px;
        }
        .st-dist-card {
          display: flex;
          align-items: center;
          gap: 10px;
          background: linear-gradient(160deg, #141618 0%, #0d0f11 100%);
          border: 1px solid rgba(255, 255, 255, 0.065);
          border-radius: 10px;
          padding: 9px 11px;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.035);
        }
        .st-dist-labels {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }
        .st-dist-title {
          font-size: 8px;
          font-weight: 700;
          color: #55606e;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          margin-bottom: 2px;
        }
        .st-dist-stat {
          font-size: 10px;
          font-weight: 700;
          line-height: 1.2;
        }
        .st-stat-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 4px;
          background: rgba(255, 255, 255, 0.025);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 8px;
          padding: 8px;
        }
        .st-stat-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          min-height: 22px;
        }
        .st-stat-label {
          color: #7b8088;
          font-size: 10px;
        }
        .st-stat-value {
          color: #f5f7fa;
          font-size: 10.5px;
          font-weight: 600;
          text-align: right;
        }
        .st-trade-table-wrap {
          overflow: auto;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 8px;
        }
        .st-trade-table {
          width: 100%;
          border-collapse: collapse;
          min-width: 780px;
          font-size: 10px;
          color: #d0d4db;
        }
        .st-trade-table thead th {
          position: sticky;
          top: 0;
          z-index: 1;
          background: #0a0c0f;
          color: #9aa3ad;
          text-align: left;
          font-weight: 700;
          padding: 6px 8px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        .st-trade-table tbody td {
          padding: 5px 8px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.04);
          white-space: nowrap;
        }
        .st-empty-row {
          text-align: center;
          color: #7b8088;
          padding: 12px;
        }
        .fullscreen-modal {
          position: fixed;
          inset: 0;
          z-index: 300;
          background: rgba(0, 0, 0, 0.96);
          display: flex;
          flex-direction: column;
        }
        .fullscreen-topbar {
          flex: 0 0 40px;
          height: 40px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.12);
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 10px;
          box-sizing: border-box;
          background: #07090c;
        }
        .fullscreen-title {
          color: #f5f7fa;
          font-size: 12px;
          font-weight: 700;
        }
        .fullscreen-close {
          width: 24px;
          height: 24px;
          border-radius: 6px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.04);
          color: #d3d7df;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .fullscreen-body {
          flex: 1 1 auto;
          min-height: 0;
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          overflow: hidden;
        }
        .fullscreen-body.with-tester {
          grid-template-columns: minmax(0, 1fr) clamp(320px, 30vw, 460px);
        }
        .fullscreen-chart-wrap {
          min-width: 0;
          min-height: 0;
          height: 100%;
          position: relative;
          background: var(--monitoring-chart-bg);
        }
        .fullscreen-empty {
          color: #7b8088;
          height: 100%;
          display: grid;
          place-items: center;
          font-size: 12px;
        }
        .fullscreen-body .strategyTesterPanel {
          height: calc(100vh - 40px);
        }
        @media (max-width: 1599px) {
          .grid-compact {
            grid-template-columns: repeat(5, minmax(0, 1fr));
          }
        }
        @media (max-width: 1299px) {
          .grid-compact {
            grid-template-columns: repeat(4, minmax(0, 1fr));
          }
        }
        @media (max-width: 999px) {
          .grid-compact {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }
        @media (max-width: 699px) {
          .grid-compact {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .monitoringExecutionLayout.show-side-panel,
          .monitoringExecutionLayout.show-strategy-tester,
          .monitoringExecutionLayout.show-live-signals-panel.show-strategy-tester,
          .monitoringContent.tester-open.input-open .monitoringExecutionLayout.show-side-panel,
          .monitoringContent.execution-open.input-open .monitoringExecutionLayout.show-side-panel {
            grid-template-columns: 1fr;
          }
          .strategyTesterPanel,
          .execution-panel {
            height: 42vh;
            border-left: 0;
            border-top: 1px solid rgba(255, 255, 255, 0.08);
          }
          .fullscreen-body.with-tester {
            grid-template-columns: 1fr;
            grid-template-rows: minmax(0, 1fr) 42vh;
          }
          .expandedMonitoringLayout.tester-open {
            grid-template-columns: 1fr;
            grid-template-rows: minmax(0, 1fr) 42vh;
          }
          .testerWorkspace {
            grid-template-columns: 1fr;
            grid-template-rows: minmax(0, 1fr) 42vh;
          }
          .testerWorkspaceMain {
            grid-template-rows: minmax(0, 1fr) 42vh !important;
          }
          .testerWorkspaceSide {
            border-left: 0;
            border-top: 1px solid rgba(255, 255, 255, 0.08);
          }
          .expandedMainColumn {
            grid-template-rows: minmax(0, 1fr) 42vh !important;
          }
          .expandedTesterSide {
            border-left: 0;
            border-top: 1px solid rgba(255, 255, 255, 0.08);
          }
        }
        /* ── MVA Strategy Selector: rendered inside .testerWorkspaceSide right rail ── */
        :global(.mst-panel) {
          display: flex;
          flex-direction: column;
          height: 100%;
          font-size: 12px;
          color: #c8ccd2;
        }
        :global(.mst-panel-header) {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 10px 6px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          flex-shrink: 0;
        }
        :global(.mst-panel-title) { font-weight: 600; font-size: 11px; color: #e8eaed; flex: 1; }
        :global(.mst-panel-symbol) { color: #7cb9e8; font-weight: 500; }
        :global(.mst-panel-asset) { color: #888; font-size: 10px; }
        :global(.mst-close-btn) {
          background: none; border: none; cursor: pointer; color: #555;
          padding: 2px; display: flex; align-items: center; line-height: 1;
        }
        :global(.mst-close-btn:hover) { color: #999; }
        :global(.mst-kind-selector) {
          display: flex; flex-wrap: wrap; gap: 3px; padding: 6px 8px;
          border-bottom: 1px solid rgba(255,255,255,0.04);
        }
        :global(.mst-kind-btn) {
          font-size: 10px; padding: 3px 7px; border-radius: 3px; cursor: pointer;
          border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.03);
          color: #aaa; transition: all 0.1s;
        }
        :global(.mst-kind-btn:hover) { border-color: rgba(255,255,255,0.2); color: #ccc; }
        :global(.mst-kind-btn.active) {
          border-color: #4a90d9; background: rgba(74,144,217,0.12); color: #7cb9e8;
        }
        :global(.mst-kind-btn.blocked) { opacity: 0.45; cursor: default; }
        :global(.mst-kind-badge-blocked) {
          font-size: 8px; background: #333; color: #666; border-radius: 2px;
          padding: 1px 3px; margin-left: 3px; vertical-align: middle;
        }
        :global(.mst-blocked-notice) {
          padding: 8px 10px; font-size: 11px; color: #888;
          border-bottom: 1px solid rgba(255,255,255,0.04);
        }
        :global(.mst-error-notice) {
          padding: 8px 10px; font-size: 11px; color: #e06c75;
          border-bottom: 1px solid rgba(255,255,255,0.04);
        }
        :global(.mst-inputs-row) { padding: 5px 8px; border-bottom: 1px solid rgba(255,255,255,0.04); }
        :global(.mst-inputs-toggle) {
          display: flex; align-items: center; gap: 4px; font-size: 11px; color: #aaa;
          background: none; border: none; cursor: pointer; padding: 2px 0;
        }
        :global(.mst-inputs-toggle:hover) { color: #ccc; }
        :global(.mst-inputs-count) {
          font-size: 10px; color: #666; background: rgba(255,255,255,0.05);
          border-radius: 2px; padding: 1px 4px; margin-left: 2px;
        }
        :global(.mst-inputs-err) { font-size: 10px; color: #e06c75; margin-left: 2px; }
        :global(.mst-input-sidebar) {
          border-bottom: 1px solid rgba(255,255,255,0.06);
          background: rgba(255,255,255,0.02);
        }
        :global(.mst-input-header) {
          display: flex; align-items: center; gap: 6px; padding: 5px 8px;
          border-bottom: 1px solid rgba(255,255,255,0.04);
        }
        :global(.mst-input-title) { font-size: 10px; font-weight: 600; color: #bbb; flex: 1; }
        :global(.mst-input-meta) { font-size: 9px; color: #555; }
        :global(.mst-input-close) {
          background: none; border: none; cursor: pointer; color: #444; padding: 1px;
          display: flex; align-items: center;
        }
        :global(.mst-input-meta-row) { padding: 3px 8px; font-size: 10px; color: #555; }
        :global(.mst-input-groups) { padding: 4px 0; max-height: 220px; overflow-y: auto; }
        :global(.mst-input-group) { padding: 0 0 4px; }
        :global(.mst-input-group-label) {
          padding: 2px 8px; font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em;
          color: #444; font-weight: 600;
        }
        :global(.mst-input-row) {
          display: flex; justify-content: space-between; align-items: center;
          padding: 2px 8px; font-size: 11px;
        }
        :global(.mst-input-row:hover) { background: rgba(255,255,255,0.03); }
        :global(.mst-input-label) { color: #999; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        :global(.mst-input-val) { color: #c8ccd2; font-family: monospace; font-size: 10px; margin-left: 6px; }
        :global(.mst-bool-on) { color: #56b36d; }
        :global(.mst-bool-off) { color: #888; }
        :global(.mst-input-footer) { padding: 4px 8px; font-size: 9px; color: #444; }
        :global(.mst-inputs-error-box) { padding: 6px 8px; font-size: 11px; color: #e06c75; }
        :global(.mst-run-row) {
          display: flex; align-items: center; gap: 8px; padding: 6px 8px;
          border-bottom: 1px solid rgba(255,255,255,0.04);
        }
        :global(.mst-run-btn) {
          display: flex; align-items: center; gap: 5px; padding: 5px 12px;
          border-radius: 4px; border: 1px solid rgba(74,144,217,0.4);
          background: rgba(74,144,217,0.1); color: #7cb9e8; cursor: pointer;
          font-size: 11px; font-weight: 500; transition: all 0.1s;
        }
        :global(.mst-run-btn:hover:not(:disabled)) {
          background: rgba(74,144,217,0.18); border-color: rgba(74,144,217,0.6);
        }
        :global(.mst-run-btn:disabled) { opacity: 0.5; cursor: default; }
        :global(.mst-run-btn.running) { opacity: 0.7; cursor: default; }
        :global(.mst-run-status) { font-size: 10px; }
        :global(.mst-run-status.pass) { color: #56b36d; }
        :global(.mst-run-status.fail) { color: #e06c75; }
        :global(.mst-spin) { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        :global(.mst-results) { flex: 1; overflow-y: auto; padding: 6px 0; }
        :global(.mst-results-header) {
          display: flex; align-items: center; gap: 6px; padding: 4px 8px 6px;
          flex-wrap: wrap;
        }
        :global(.mst-results-label) { font-size: 11px; font-weight: 600; color: #c8ccd2; flex: 1; }
        :global(.mst-parity-badge) {
          font-size: 9px; padding: 2px 5px; border-radius: 2px; font-weight: 700;
        }
        :global(.mst-parity-badge.pass) { background: rgba(86,179,109,0.15); color: #56b36d; }
        :global(.mst-parity-badge.info) { background: rgba(74,144,217,0.12); color: #7cb9e8; }
        :global(.mst-parity-badge.metric) { background: rgba(230,180,80,0.15); color: #e6b450; }
        :global(.mst-parity-badge.custom) { background: rgba(180,120,220,0.12); color: #b478dc; }
        :global(.mst-inputs-basis-badge) {
          font-size: 9px; padding: 2px 5px; border-radius: 2px;
          background: rgba(255,255,255,0.05); color: #888;
        }
        :global(.mst-inputs-basis-badge.missing) { color: #e6b450; background: rgba(230,180,80,0.08); }
        :global(.mst-inputs-missing) { font-size: 10px; color: #e6b450; margin-left: 6px; }
        :global(.mst-inputs-metric-only) {
          font-size: 10px; color: #b0b4bc; padding: 6px 10px;
          background: rgba(230,180,80,0.06); border-left: 2px solid rgba(230,180,80,0.4);
          margin: 4px 10px; border-radius: 2px; line-height: 1.5;
        }
        :global(.mst-metric-only-badge) {
          font-size: 9px; font-weight: 700; padding: 1px 4px; border-radius: 2px;
          background: rgba(230,180,80,0.15); color: #e6b450; margin-right: 4px;
        }
        :global(.mst-mode-badge) {
          font-size: 9px; padding: 2px 5px; border-radius: 2px;
          background: rgba(255,255,255,0.05); color: #666;
        }
        :global(.mst-kpi-grid) {
          display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px;
          padding: 0 4px 6px; border-bottom: 1px solid rgba(255,255,255,0.04);
        }
        :global(.mst-kpi-cell) {
          padding: 4px 5px; background: rgba(255,255,255,0.02); border-radius: 3px;
        }
        :global(.mst-kpi-label) { font-size: 9px; color: #555; margin-bottom: 1px; }
        :global(.mst-kpi-value) { font-size: 11px; font-weight: 600; font-family: monospace; }
        :global(.mst-kpi-pos) { color: #56b36d; }
        :global(.mst-kpi-neg) { color: #e06c75; }
        :global(.mst-kpi-neu) { color: #c8ccd2; }
        :global(.mst-trade-section) { padding: 4px 8px; }
        :global(.mst-section-toggle) {
          display: flex; align-items: center; gap: 4px; font-size: 11px; color: #888;
          background: none; border: none; cursor: pointer; padding: 3px 0; width: 100%;
        }
        :global(.mst-section-toggle:hover) { color: #bbb; }
        :global(.mst-trade-table-wrap) { overflow-x: auto; margin-top: 4px; }
        :global(.mst-trade-table) {
          width: 100%; border-collapse: collapse; font-size: 10px;
        }
        :global(.mst-trade-table th) {
          color: #555; font-weight: 500; padding: 2px 4px; text-align: right;
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        :global(.mst-trade-table th:first-child),
        :global(.mst-trade-table td:first-child) { text-align: left; }
        :global(.mst-trade-table td) { padding: 2px 4px; text-align: right; color: #aaa; }
        :global(.mst-row-win td) { background: rgba(86,179,109,0.04); }
        :global(.mst-row-loss td) { background: rgba(224,108,117,0.04); }
        :global(.mst-td-date) { color: #666; font-size: 9px; }
        :global(.mst-td-pos) { color: #56b36d; }
        :global(.mst-td-neg) { color: #e06c75; }
        :global(.mst-trade-more) { font-size: 10px; color: #555; padding: 4px 0; text-align: center; }

        /* ── Panel header two-column layout ──────────────────────────────────── */
        :global(.mst-panel-title-col) { display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0; }
        :global(.mst-panel-sym-row) { display: flex; align-items: center; gap: 4px; }
        :global(.mst-symbol-chip) {
          font-size: 10px; font-weight: 700; color: #7cb9e8;
          background: rgba(74,144,217,0.1); border: 1px solid rgba(74,144,217,0.2);
          border-radius: 3px; padding: 1px 5px; font-family: monospace;
        }

        /* ── Status bar ──────────────────────────────────────────────────────── */
        :global(.mst-status-bar) {
          display: flex; align-items: center; flex-wrap: wrap; gap: 4px;
          padding: 4px 8px; border-bottom: 1px solid rgba(255,255,255,0.04);
          background: rgba(0,0,0,0.15); flex-shrink: 0;
        }
        :global(.mst-dirty-count) { font-size: 9px; color: #e6b450; margin-left: 2px; }

        /* ── Section tabs ────────────────────────────────────────────────────── */
        :global(.mst-tab-row) {
          display: flex; gap: 0; border-bottom: 1px solid rgba(255,255,255,0.06);
          flex-shrink: 0;
        }
        :global(.mst-tab-btn) {
          flex: 1; padding: 5px 6px; font-size: 10px; font-weight: 500;
          background: none; border: none; cursor: pointer; color: #666;
          border-bottom: 2px solid transparent; transition: all 0.12s;
          display: flex; align-items: center; justify-content: center; gap: 3px;
        }
        :global(.mst-tab-btn:hover) { color: #aaa; }
        :global(.mst-tab-btn.active) { color: #7cb9e8; border-bottom-color: #4a90d9; }
        :global(.mst-tab-dirty) { font-size: 8px; color: #e6b450; }
        :global(.mst-tab-done) { font-size: 8px; color: #56b36d; }
        :global(.mst-tab-content) { flex: 1; overflow-y: auto; }

        /* ── Inputs section ──────────────────────────────────────────────────── */
        :global(.mst-inputs-section) { padding: 4px 0 8px; }
        :global(.mst-inputs-meta-row) {
          padding: 3px 10px; font-size: 9px; color: #555;
          border-bottom: 1px solid rgba(255,255,255,0.03); margin-bottom: 4px;
        }
        :global(.mst-group-label) {
          padding: 3px 10px 1px; font-size: 9px; text-transform: uppercase;
          letter-spacing: 0.06em; color: #444; font-weight: 600;
        }
        :global(.mst-input-row.dirty) { background: rgba(230,180,80,0.04); }
        :global(.mst-input-field) {
          width: 72px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
          color: #c8ccd2; font-size: 10px; font-family: monospace; padding: 2px 4px;
          border-radius: 3px; text-align: right; outline: none;
          -moz-appearance: textfield;
        }
        :global(.mst-input-field::-webkit-outer-spin-button),
        :global(.mst-input-field::-webkit-inner-spin-button) { -webkit-appearance: none; margin: 0; }
        :global(.mst-input-field:focus) { border-color: rgba(74,144,217,0.4); }
        :global(.mst-input-field.dirty) { border-color: rgba(230,180,80,0.4); color: #f0c060; }
        :global(.mst-bool-toggle) {
          font-size: 9px; font-weight: 700; padding: 2px 7px; border-radius: 3px;
          border: 1px solid; cursor: pointer; transition: all 0.1s;
        }
        :global(.mst-bool-toggle.on) { color: #56b36d; border-color: rgba(86,179,109,0.35); background: rgba(86,179,109,0.08); }
        :global(.mst-bool-toggle.off) { color: #666; border-color: rgba(255,255,255,0.1); background: rgba(255,255,255,0.03); }
        :global(.mst-bool-toggle.dirty) { border-color: rgba(230,180,80,0.4); }
        :global(.mst-input-unit) { font-size: 9px; color: #555; margin-left: 2px; }
        :global(.mst-field-reset-btn) {
          background: none; border: none; cursor: pointer; color: #888; padding: 0 2px;
          font-size: 11px; line-height: 1; transition: color 0.1s;
        }
        :global(.mst-field-reset-btn:hover) { color: #e6b450; }
        :global(.mst-advanced-toggle) {
          display: flex; align-items: center; gap: 4px; width: 100%;
          padding: 4px 10px 2px; background: none; border: none; cursor: pointer;
          font-size: 10px; color: #666; text-align: left;
        }
        :global(.mst-advanced-toggle:hover) { color: #aaa; }
        :global(.mst-adv-count) {
          font-size: 9px; color: #555; background: rgba(255,255,255,0.05);
          border-radius: 2px; padding: 0 3px; margin-left: 1px;
        }

        /* ── Metric-only notice ──────────────────────────────────────────────── */
        :global(.mst-metric-only-notice) {
          margin: 8px 10px; padding: 8px; border-radius: 4px; font-size: 10px;
          color: #b0b4bc; background: rgba(230,180,80,0.06);
          border-left: 2px solid rgba(230,180,80,0.4); line-height: 1.55;
        }

        /* ── Action row ──────────────────────────────────────────────────────── */
        :global(.mst-action-row) {
          display: flex; align-items: center; gap: 6px; padding: 6px 8px;
          border-top: 1px solid rgba(255,255,255,0.06); flex-shrink: 0;
          background: rgba(0,0,0,0.1);
        }
        :global(.mst-reset-btn) {
          display: flex; align-items: center; gap: 4px; padding: 4px 8px;
          border-radius: 3px; border: 1px solid rgba(230,180,80,0.3);
          background: rgba(230,180,80,0.06); color: #e6b450; cursor: pointer;
          font-size: 10px; transition: all 0.1s;
        }
        :global(.mst-reset-btn:hover) { background: rgba(230,180,80,0.12); border-color: rgba(230,180,80,0.5); }
        :global(.mst-action-note) { font-size: 10px; color: #555; flex: 1; }
        :global(.mst-run-btn) {
          display: flex; align-items: center; gap: 5px; padding: 5px 12px;
          border-radius: 4px; border: 1px solid rgba(74,144,217,0.4);
          background: rgba(74,144,217,0.1); color: #7cb9e8; cursor: pointer;
          font-size: 11px; font-weight: 500; transition: all 0.1s; margin-left: auto;
        }
        :global(.mst-run-btn:hover:not(:disabled)) {
          background: rgba(74,144,217,0.18); border-color: rgba(74,144,217,0.6);
        }
        :global(.mst-run-btn:disabled) { opacity: 0.5; cursor: default; }
        :global(.mst-run-btn.running) { opacity: 0.7; cursor: default; }
        :global(.mst-run-btn.custom) {
          border-color: rgba(180,120,220,0.4); background: rgba(180,120,220,0.08); color: #b478dc;
        }
        :global(.mst-run-btn.custom:hover:not(:disabled)) {
          background: rgba(180,120,220,0.16); border-color: rgba(180,120,220,0.6);
        }

        /* ── Results section ─────────────────────────────────────────────────── */
        :global(.mst-results-section) { padding: 4px 0 8px; }
        :global(.mst-custom-run-notice) {
          margin: 6px 10px 4px; padding: 5px 8px; border-radius: 3px; font-size: 10px;
          color: #b478dc; background: rgba(180,120,220,0.07);
          border-left: 2px solid rgba(180,120,220,0.35);
        }

        /* ── Validation section ──────────────────────────────────────────────── */
        :global(.mst-validation-section) {
          margin: 6px 8px 4px; padding: 6px 8px; border-radius: 4px;
          background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05);
        }
        :global(.mst-validation-title) { font-size: 9px; text-transform: uppercase; letter-spacing: 0.07em; color: #444; font-weight: 600; margin-bottom: 4px; }
        :global(.mst-val-item) { font-size: 10px; padding: 1px 0; }
        :global(.mst-val-item.pass) { color: #56b36d; }
        :global(.mst-val-item.fail) { color: #e06c75; }
        :global(.mst-val-item.info) { color: #e6b450; }
        :global(.mst-val-disclaimer) { font-size: 9px; color: #444; margin-top: 5px; border-top: 1px solid rgba(255,255,255,0.04); padding-top: 4px; }

        /* ── Section placeholders / errors ───────────────────────────────────── */
        :global(.mst-section-placeholder) {
          display: flex; align-items: center; gap: 5px;
          padding: 16px 10px; font-size: 11px; color: #555; justify-content: center;
        }
        :global(.mst-section-error) {
          padding: 10px; font-size: 11px; color: #e06c75; margin: 8px;
          background: rgba(224,108,117,0.06); border-radius: 3px;
        }

        @media (max-width: 699px) {
          .testerWorkspaceSide { height: 55vh; }
        }

        /* ── Mobile nav: HIDDEN by default on desktop ──────────────────────── */
        /* These rules sit outside any @media so they are the baseline.        */
        /* The @media(768px) block below overrides only on narrow viewports.   */
        .monitoring-mobile-nav { display: none !important; }
        .mobile-panel-close-btn { display: none !important; }

        /* ── Mobile ≤768px ───────────────────────────────────────────────── */
        @media (max-width: 768px) {
          /* Swipeable tab bar */
          .monitoringTopbar {
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
            scrollbar-width: none;
            white-space: nowrap;
            flex-wrap: nowrap;
            padding-bottom: 2px;
          }
          .monitoringTopbar::-webkit-scrollbar { display: none; }

          /* Larger touch targets for tabs */
          :global(.tab) {
            min-height: 40px;
            padding: 6px 12px;
            font-size: 12px;
          }

          /* Chart scroll area: auto height on mobile, no horizontal overflow */
          .grid-compact-scroll {
            height: auto !important;
            min-height: 0 !important;
            overflow-x: hidden !important;
            overflow-y: visible !important;
            padding-bottom: calc(70px + env(safe-area-inset-bottom, 0px));
          }

          /* Compact chart grid: 2 columns on mobile */
          .grid-compact {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 8px;
            padding: 8px;
          }

          /* Chart cards: reduce height on mobile so 2 rows fit in viewport */
          .grid-compact :global(.chartCard) {
            min-height: 200px !important;
            height: 220px !important;
          }

          /* Smaller labels inside mobile chart cards */
          .grid-compact :global(.monitoring-card-symbol) { font-size: 10px !important; }
          .grid-compact :global(.monitoring-card-desc) { font-size: 11px !important; line-height: 1.1 !important; }
          .grid-compact :global(.monitoring-card-price) { font-size: 11px !important; }
          .grid-compact :global(.monitoring-card-signal) { font-size: 9px !important; }

          /* Force single-column grid — right panel becomes fixed overlay */
          .monitoringExecutionLayout {
            grid-template-columns: 1fr !important;
          }
          /* Hide strategy tester and execution panels on mobile */
          .strategyTesterPanel,
          .execution-panel {
            display: none;
          }

          /* Right column (Live + Sentinel) → full-screen fixed overlay */
          .monitoringRightColumn {
            position: fixed !important;
            top: 0;
            left: 0;
            right: 0;
            bottom: calc(56px + env(safe-area-inset-bottom, 0px));
            z-index: 8500;
            background: #06080b;
            overflow: hidden;
            flex-direction: column;
            animation: mrnSlideIn 0.22s ease-out;
          }
          @keyframes mrnSlideIn {
            from { transform: translateY(8px); opacity: 0.7; }
            to   { transform: translateY(0);   opacity: 1; }
          }

          /* Close button strip inside overlay */
          .mobile-panel-close-btn {
            display: flex !important;
          }

          /* Main content: no horizontal overflow */
          .monitoringContent {
            overflow-x: hidden;
          }

          /* Safe bottom padding for mobile nav */
          .monitoringPageInner,
          .fullscreen-body,
          .expandedMonitoringLayout {
            padding-bottom: calc(60px + env(safe-area-inset-bottom, 0px));
          }

          /* Mobile bottom nav: override the default display:none above */
          .monitoring-mobile-nav {
            display: flex !important;
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            z-index: 9001;
            height: calc(56px + env(safe-area-inset-bottom, 0px));
            padding-bottom: env(safe-area-inset-bottom, 0px);
            background: rgba(6,8,11,0.97);
            backdrop-filter: blur(16px) saturate(1.4);
            -webkit-backdrop-filter: blur(16px) saturate(1.4);
            border-top: 1px solid rgba(255,255,255,0.07);
            align-items: stretch;
            justify-content: space-around;
          }
          .monitoring-mobile-nav-item {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 3px;
            flex: 1;
            min-height: 44px;
            color: rgba(255,255,255,0.38);
            text-decoration: none;
            background: none;
            border: none;
            cursor: pointer;
            padding: 6px 4px 0;
            font-size: 10px;
            font-weight: 500;
            font-family: var(--font-montserrat, system-ui, sans-serif);
            -webkit-tap-highlight-color: transparent;
            touch-action: manipulation;
            letter-spacing: 0.02em;
          }
          .monitoring-mobile-nav-item.nav-active { color: #e8d07a; }
          .monitoring-mobile-nav-item svg { width: 21px; height: 21px; }
        }
      `}</style>

    </main>
    </LiveQuotesProvider>
  );
}
