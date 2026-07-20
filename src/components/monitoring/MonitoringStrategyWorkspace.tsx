"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import StrategyTesterDrawdownChart from "@/components/monitoring/StrategyTesterDrawdownChart";
import StrategyTesterEquityChart from "@/components/monitoring/StrategyTesterEquityChart";
import type {
  AgriAssetStatusSummary,
  AgriAutoUpdateHealth,
  AgriPortfolioReferenceDelta,
} from "@/lib/monitoring/agriFinalStatusTypes";
import { getMonitoringAssetIconUrl } from "@/lib/monitoring/monitoringAssetIcons";
import type {
  MonitoringMvaTrade,
  MonitoringStrategyHistoryMode,
  MonitoringStrategyKind,
  MonitoringStrategyRunResponse,
  MonitoringStrategyTestResult,
  StrategyInputDefinitionItem,
  StrategyInputSet,
} from "@/lib/monitoring/strategyTester/types";
import type { MonitoringUiPrefs } from "@/lib/monitoring/monitoringUiPrefs";
import { AGRI_DEFAULT_BACKTEST_START, AGRI_LIVE_START_DATE } from "@/lib/monitoring/strategyTester/constants";

type StrategyMode = "engine_simulation" | "live_signal" | "walk_forward" | "engine_vs_csv_validation";

type Props = {
  symbol: string | null;
  assetName?: string | null;
  selectedSymbols?: string[];
  availableAssets?: Array<{ symbol: string; name: string }>;
  onSelectedSymbolsChange?: (symbols: string[]) => void;
  onFocusSymbol?: (symbol: string) => void;
  multiSelectArmed?: boolean;
  onMultiSelectArmedChange?: (active: boolean) => void;
  onEngineResultCache?: (results: Record<string, MonitoringStrategyTestResult>) => void;
  topContent: ReactNode;
  agriStatus?: AgriAssetStatusSummary | null;
  agriStatusBySymbol?: Record<string, AgriAssetStatusSummary | null>;
  portfolioDelta?: AgriPortfolioReferenceDelta | null;
  autoUpdate?: AgriAutoUpdateHealth | null;
  uiPrefs?: MonitoringUiPrefs;
  intradayEventsUrl?: string;
  adapterLabel?: string;
  /** Active V/S/M kinds for the currently focused agri asset (from useAgriStrategySelection). */
  agriActiveKinds?: string[];
  /** All available V/S/M kinds for the currently focused agri asset. Used to detect partial selection. */
  agriAvailableKinds?: string[];
};

type InputsState =
  | { phase: "idle" | "loading" }
  | { phase: "loaded"; inputSet: StrategyInputSet; inputAvailability: string }
  | { phase: "error"; message: string };

type CurvePoint = { time: string; value: number };

type TradeSummary = {
  totalTrades: number;
  longTrades: number;
  shortTrades: number;
  wins: number;
  losses: number;
  winratePct: number;
  netReturnPct: number;
  profitFactor: number;
  maxDrawdownPct: number;
  avgTradePct: number;
  expectancyPct: number;
  calmar: number;
  sharpe: number;
  cagr: number;
  drawdownCurve: CurvePoint[];
  equityCurve: CurvePoint[];
};

type MonteCarloSummary = {
  medianReturnPct: number;
  p10ReturnPct: number;
  p90ReturnPct: number;
  medianWinratePct: number;
  worstReturnPct: number;
  bestReturnPct: number;
  samples: Array<{ index: number; returnPct: number }>;
};

type ChipTone = "base" | "pass" | "warn" | "fail";
type RegistryStrategyType = "macro" | "seasonal" | "valuation" | "portfolio";
type RegistryEntry = {
  asset: string;
  sleeveName?: string;
  strategyType: RegistryStrategyType;
  active: boolean;
  label: string;
};

type InputSectionBlueprint = {
  key: string;
  title: string;
  description?: string;
  rows: string[][];
};

type InputSection = {
  key: string;
  title: string;
  description?: string;
  rows: StrategyInputDefinitionItem[][];
  advanced?: boolean;
};

const MODE_META: Record<StrategyMode, { label: string; runMode: StrategyMode; helper: string }> = {
  engine_simulation: {
    label: "FULL",
    runMode: "engine_simulation",
    helper: "Full reference backtest from 2000-01-01",
  },
  live_signal: {
    label: "LIVE",
    runMode: "live_signal",
    helper: "Forward window since 2026-01-01",
  },
  walk_forward: {
    label: "WF/OOS",
    runMode: "walk_forward",
    helper: "Walk-forward OOS validation",
  },
  engine_vs_csv_validation: {
    label: "IS",
    runMode: "engine_vs_csv_validation",
    helper: "Calibration/control view against stored reference outputs",
  },
};

const PARITY_STATUS_META: Record<string, { label: string; tone: ChipTone }> = {
  PASS_EXACT_PARITY: { label: "Reference aligned", tone: "pass" },
  PASS_METRIC_PARITY_MISSING_INPUT_XLSX: { label: "Metric parity", tone: "pass" },
  PASS_TRADE_EXPORT_PARITY_INPUTS_UNKNOWN: { label: "TV export — parity pending", tone: "warn" },
  FAIL_TRADE_MISMATCH: { label: "CSV diff", tone: "warn" },
  FAIL_METRIC_MISMATCH: { label: "Metric diff", tone: "warn" },
  BLOCKED_MISSING_TRADE_EXPORT: { label: "No CSV reference", tone: "base" },
  BLOCKED_MISSING_HISTORY: { label: "History missing", tone: "fail" },
  BLOCKED_MISSING_INPUT_XLSX: { label: "No XLSX defaults", tone: "base" },
  UNSUPPORTED: { label: "Unsupported", tone: "fail" },
  CUSTOM_INPUTS_NOT_PARITY_VALIDATED: { label: "Custom inputs", tone: "warn" },
  exact_trade_parity: { label: "Exact trade parity", tone: "pass" },
  close_metric_parity: { label: "Close metric parity", tone: "warn" },
  mismatch_remaining: { label: "Mismatch remaining", tone: "warn" },
  blocked_missing_execution_assumption: { label: "Execution assumption gap", tone: "fail" },
  blocked_missing_csv_reference: { label: "No CSV reference", tone: "base" },
};

const ROBUSTNESS_META: Record<string, { label: string; tone: ChipTone }> = {
  strong: { label: "Strong", tone: "pass" },
  promising: { label: "Promising", tone: "pass" },
  weak: { label: "Weak", tone: "warn" },
  failed: { label: "Failed", tone: "fail" },
  insufficient: { label: "Insufficient", tone: "base" },
};

const METRIC_LABELS: Record<string, string> = {
  trade_count: "Trades",
  net_return_pct: "Net Return",
  avg_trade_pct: "Avg Trade",
  profit_factor: "Profit Factor",
  sharpe_ratio: "Sharpe",
  max_drawdown_pct: "Max DD",
};

const HISTORY_MODE_STORAGE_KEY = "invoria.monitoring.strategyHistoryMode.v1";
const HISTORY_MODE_COMPACT_LABELS: Record<MonitoringStrategyHistoryMode, string> = {
  default_2000: "ab 2000",
  full: "Full",
};

const MISMATCH_FIELD_LABELS: Record<string, string> = {
  entryDate: "Entry date",
  exitDate: "Exit date",
  direction: "Direction",
  entryPrice: "Entry price",
  exitPrice: "Exit price",
  returnPct: "Return",
  pnl: "PnL",
  quantity: "Quantity",
};

const LIKELY_CAUSE_LABELS: Record<string, string> = {
  execution_timing_mismatch: "Execution timing differs",
  signal_rule_mismatch: "Signal rules differ",
  exit_logic_mismatch: "Exit logic differs",
};

// Mirrors the real input-group order of workspace/input/pine_strategies/07_macro_valuation_v1.pine:
// 1) Risk, 2) Position, Execution, 3) Valuation, 5) Comparison, 6) Regime Engine,
// Valuation Logic, S&D. (4) Colors has no engine-relevant inputs and is omitted;
// Cooldown is ungrouped in Pine and is shown alongside Execution.
const PRIMARY_INPUT_SECTIONS: InputSectionBlueprint[] = [
  {
    key: "risk",
    title: "Risk",
    rows: [
      ["useATR", "atrLen"],
      ["slATR", "rr"],
      ["useBE", "beATR"],
      ["useTrail", "trailATR"],
    ],
  },
  {
    key: "position",
    title: "Position",
    description: "Risk % and contract sizing control nominal P&L only - they do not change the % metrics shown on the right.",
    rows: [
      ["riskPct", "minContract"],
      ["useComp"],
    ],
  },
  {
    key: "execution",
    title: "Execution",
    rows: [
      ["enableLongs", "enableShorts"],
      ["cooldown"],
    ],
  },
  {
    key: "valuation",
    title: "Valuation",
    rows: [
      ["useCustomBase", "baseSymbol"],
      ["valTF", "rescale"],
      ["fastLen", "slowLen"],
      ["upper", "lower"],
      ["valMode", "valRequirement"],
      ["exitOppVal"],
    ],
  },
  {
    key: "comparison",
    title: "Comparison",
    rows: [
      ["use1", "sym1"],
      ["use2", "sym2"],
      ["use3", "sym3"],
    ],
  },
  {
    key: "regime",
    title: "Regime Engine",
    rows: [
      ["useRegime", "logicMode"],
      ["useRegimeDirectionFilter", "regMaLen"],
      ["vixHigh", "vixLow"],
      ["modeHighVol", "modeLowVol"],
      ["modeBull", "modeBear"],
      ["modeStrongUSD", "modeWeakUSD"],
      ["modeRatesUp", "modeRatesDown"],
      ["modeRiskOn", "modeRiskOff"],
    ],
  },
  {
    key: "supply_demand",
    title: "S&D",
    description: "Visual-only in Pine - does not affect engine entries or exits.",
    rows: [
      ["sd", "sd1"],
    ],
  },
];

const ADVANCED_GROUP_ORDER = ["Advanced", "Trend", "EMA Trend Filter", "Costs", "Risk", "Position", "Comparison"];
const TESTER_MIN_HEIGHT_PX = 320;

// Values sourced verbatim from the intraday strategy package configs in
// workspace/input/intraday_strategy_package/strategies/*.json. Keep in sync with
// those files; a field is only "missing in config" if it is genuinely absent there.
const INTRADAY_STRATEGY_CONFIG: Record<string, {
  configFile: string;
  sessionRules: string;
  direction: string;
  entryRules: string;
  exitRules: string;
  slTp: string;
  breakEven: string;
  regimeFilter: string;
  panelTitle?: string;
}> = {
  // Indizes — Macro Valuation Alpha V1 (workspace/input/tradingview_strategy.pine).
  // Real config from the Pine: useATR=true, atrLen=14, slATR=1.0, rr=2.0 (TP=2·ATR),
  // beATR=1.0, useTP=true, useTrail=false. Exits are the ATR bracket + opposite-valuation
  // close; the package TV export did not store bracket prices, so events show signal exits.
  ...Object.fromEntries(
    ["YM1!", "UKX!", "NQ1!", "FDAX1!", "ES1!"].map((sym) => [sym, {
      panelTitle: "Strategy Config",
      configFile: "tradingview_strategy.pine · Macro Valuation Alpha V1",
      sessionRules: "Daily (1D) · no intraday session filter",
      direction: "Long / Short (macro valuation)",
      entryRules: "Macro valuation regime signal (value vs price)",
      exitRules: "ATR SL/TP bracket + opposite-valuation / trend close",
      slTp: "SL entry ∓ ATR(14)×1.0 · TP 2.0R (RR 2:1)",
      breakEven: "1.0×ATR (BE stop)",
      regimeFilter: "Macro valuation (DXY / US10Y / VIX inputs)",
    }]),
  ),
  // v3-F validated parameters (frozen 2026-07)
  "FDAX1! 1H": {
    configFile: "02_dax_1h_intraday.pine",
    sessionRules: "07:00–12:00 Europe/Berlin · Mon–Fri · max 1 trade/day",
    direction: "Long only",
    entryRules: "Bullish liquidity sweep/reclaim (lookback 3–9), close > EMA(2), session filter",
    exitRules: "SL exit / TP exit",
    slTp: "SL 40 pts · TP 100 pts (2.5R)",
    breakEven: "1.5R, BE stop from next bar",
    regimeFilter: "Off",
  },
  "FDAX1! 2H": {
    configFile: "01_dax_2h_intraday.pine",
    sessionRules: "09:00–11:00 Europe/Berlin · Mon–Fri · max 3 trades/day",
    direction: "Long only",
    entryRules: "Bullish sweep/reclaim (lookback 3–9), close > EMA(4), session filter",
    exitRules: "SL exit / TP exit",
    slTp: "SL ATR(14)×0.8 · TP 3.0R",
    breakEven: "1.0R, BE stop from next bar",
    regimeFilter: "Off",
  },
  "6B1! 30M": {
    configFile: "03_gbpusd_30m_intraday.pine",
    sessionRules: "09:00–10:30 Europe/Berlin · Mon–Fri · max 1 trade/day",
    direction: "Long / Short",
    entryRules: "Sweep/reclaim (lookback 3–19), close vs EMA(2)",
    exitRules: "SL exit / TP exit",
    slTp: "SL 10 pips · TP 35 pips (3.5R)",
    breakEven: "1.0R, BE stop from next bar (next-bar logic)",
    regimeFilter: "Off",
  },
  "6E1! 30M": {
    configFile: "04_eurusd_30m_intraday.pine",
    sessionRules: "09:00–12:30 Europe/Berlin · Mon–Fri · max 1 trade/day",
    direction: "Long / Short",
    entryRules: "Sweep + engulfing candle (lookback 3–19), close vs EMA(5), session filter",
    exitRules: "SL exit / TP exit",
    slTp: "SL 13 pips · TP 39 pips (3.0R)",
    breakEven: "1.0R, BE stop from next bar",
    regimeFilter: "Off",
  },
  // ── Core Invest sleeves ────────────────────────────────────────────────────
  QQQ_PINE_1: {
    panelTitle: "Core Invest Config",
    configFile: "BATS_QQQ_pine1_events.json · Pine 1 SMA400/5",
    sessionRules: "Daily (1D) · US equity session",
    direction: "Long only",
    entryRules: "SMA400/5 crossover + valuation regime signal",
    exitRules: "SMA crossunder or opposite valuation",
    slTp: "Strategy exits — no fixed SL/TP",
    breakEven: "—",
    regimeFilter: "Macro valuation (rate / macro regime)",
  },
  QQQ_PINE_2_EMA: {
    panelTitle: "Core Invest Config",
    configFile: "BATS_QQQ_pine2_events.json · Pine 2 EMA20/50",
    sessionRules: "Daily (1D) · US equity session",
    direction: "Long only",
    entryRules: "EMA20 > EMA50 + valuation regime signal",
    exitRules: "EMA crossunder or opposite valuation",
    slTp: "Strategy exits — no fixed SL/TP",
    breakEven: "—",
    regimeFilter: "Macro valuation (rate / macro regime)",
  },
  COPPER_HG: {
    panelTitle: "Core Invest Config",
    configFile: "COMEX_HG1_events.json · EMA20/50 Valuation",
    sessionRules: "Daily (1D) · COMEX HG futures",
    direction: "Long only",
    entryRules: "EMA20 > EMA50 + valuation regime signal",
    exitRules: "EMA crossunder or opposite valuation",
    slTp: "Strategy exits — no fixed SL/TP",
    breakEven: "—",
    regimeFilter: "Macro valuation (copper cycle / DXY)",
  },
  CHF_6S: {
    panelTitle: "Core Invest Config",
    configFile: "CME_6S1_events.json · EMA + Valuation Strategy PRO MTF + Regime (TradingView)",
    sessionRules: "Daily (1D) · CME 6S futures",
    direction: "Long only",
    entryRules: "EMA + Valuation regime signal (MTF + Regime filter)",
    exitRules: "Opposite Valuation / Take Profit / Stop Loss",
    slTp: "Per-trade SL/TP from strategy engine",
    breakEven: "—",
    regimeFilter: "Macro valuation (CHF / safe-haven cycle)",
  },
};

function valueEquals(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function safeNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatPct(value: number | null | undefined, digits = 2): string {
  const safe = safeNumber(value, 0);
  return `${safe >= 0 ? "+" : ""}${safe.toFixed(digits)}%`;
}

function formatSigned(value: number | null | undefined, digits = 2): string {
  const safe = safeNumber(value, 0);
  return safe.toFixed(digits);
}

function formatRatio(value: number | null | undefined, digits = 2): string {
  const safe = safeNumber(value, 0);
  if (!Number.isFinite(safe)) return "0.00";
  return safe.toFixed(digits);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  return value.slice(0, 10);
}

function formatMaybeNumber(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return "-";
  return Number(value).toFixed(digits);
}

function formatMaybePct(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return "-";
  const safe = Number(value);
  return `${safe >= 0 ? "+" : ""}${safe.toFixed(digits)}%`;
}

function prettifyStatus(status: string | null | undefined): { label: string; tone: ChipTone } {
  if (!status) return { label: "No status", tone: "base" };
  return PARITY_STATUS_META[status] ?? {
    label: status.replaceAll("_", " ").toLowerCase(),
    tone: "base",
  };
}

function prettifyRobustness(status: string | null | undefined): { label: string; tone: ChipTone } {
  if (!status) return { label: "Not available", tone: "base" };
  return ROBUSTNESS_META[String(status).toLowerCase()] ?? { label: String(status), tone: "base" };
}

// AssetInputSourceStatus indicator (Part 3, section 1/18): small dot next to
// "Parameters" showing whether this asset's inputs come from its XLSX
// (source: "xlsx") or from engine defaults (source: "engine_default").
function XlsxStatusDot({ availability }: { availability: string | null | undefined }) {
  const hasXlsx = availability === "xlsx_params_available";
  const label = hasXlsx ? "XLSX inputs loaded" : "XLSX missing - using engine defaults";
  return <span className={`msw-xlsx-dot ${hasXlsx ? "ok" : "missing"}`} title={label} aria-label={label} role="img" />;
}

function prettifyMetricName(name: string | null | undefined): string {
  if (!name) return "Metric";
  return METRIC_LABELS[name] ?? name.replaceAll("_", " ");
}

function prettifyMismatchField(field: string | null | undefined): string {
  if (!field) return "Field";
  return MISMATCH_FIELD_LABELS[field] ?? field;
}

function prettifyLikelyCause(cause: string | null | undefined): string {
  if (!cause) return "Not classified";
  return LIKELY_CAUSE_LABELS[cause] ?? cause.replaceAll("_", " ");
}

function prettifyInputLabel(input: StrategyInputDefinitionItem): string {
  if (input.key === "fastLen") return "Valuation Fast";
  if (input.key === "slowLen") return "Valuation Slow";
  if (input.key === "useComp") return "Compounding (no effect yet)";
  return input.label;
}

function humanizeReason(reason: string): string {
  return reason.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatParityMetricValue(name: string, value: number | null | undefined): string {
  if (name === "trade_count") return value == null ? "-" : String(Math.round(Number(value)));
  if (name.endsWith("_pct")) return formatMaybePct(value);
  return formatMaybeNumber(value);
}

function formatMetricDelta(name: string, value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "-";
  if (name === "trade_count") {
    const rounded = Math.round(Number(value));
    return rounded > 0 ? `+${rounded}` : String(rounded);
  }
  if (name.endsWith("_pct")) return formatMaybePct(value, 2);
  const numeric = Number(value);
  return numeric > 0 ? `+${numeric.toFixed(2)}` : numeric.toFixed(2);
}

function formatCardNumber(value: number | null | undefined, kind: "pct" | "ratio" | "count" = "ratio"): string {
  if (value == null || !Number.isFinite(value)) return "-";
  if (kind === "pct") return formatMaybePct(value);
  if (kind === "count") return String(Math.round(Number(value)));
  return formatMaybeNumber(value);
}

function prettifyLiveReadiness(status: string | null | undefined): { label: string; tone: ChipTone } {
  if (!status) return { label: "Config pending", tone: "base" };
  if (status === "READY") return { label: "Live ready", tone: "pass" };
  if (status === "PROVISIONAL_ONLY") return { label: "Provisional only", tone: "warn" };
  if (status === "DATA_STALE") return { label: "Data stale", tone: "warn" };
  if (status === "INVALID_OHLC") return { label: "Invalid OHLC", tone: "fail" };
  if (status === "MISSING_COMPARISON_SYMBOL") return { label: "Missing reference", tone: "fail" };
  if (status === "INVALID_RISK_LEVELS") return { label: "Risk blocked", tone: "fail" };
  if (status === "CONFIG_INCOMPLETE") return { label: "Config incomplete", tone: "fail" };
  return { label: status.replaceAll("_", " "), tone: "base" };
}

function prettifyDataHealth(status: string | null | undefined): { label: string; tone: ChipTone } {
  if (!status) return { label: "Data unknown", tone: "base" };
  if (status === "fresh") return { label: "Data fresh", tone: "pass" };
  if (status === "provisional") return { label: "Data provisional", tone: "warn" };
  if (status === "stale") return { label: "Data stale", tone: "warn" };
  if (status === "invalid_scale") return { label: "Scale invalid", tone: "fail" };
  if (status === "missing") return { label: "Data missing", tone: "fail" };
  return { label: status, tone: "base" };
}

function prettifyPortfolioDelta(value: number | null | undefined, kind: "pct" | "count" | "ratio"): string {
  if (value == null || !Number.isFinite(value)) return "-";
  if (kind === "count") {
    const rounded = Math.round(Number(value));
    return rounded > 0 ? `+${rounded}` : String(rounded);
  }
  if (kind === "pct") return formatMaybePct(value);
  return Number(value) > 0 ? `+${Number(value).toFixed(2)}` : Number(value).toFixed(2);
}

function normalizeExitReason(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function tradeTime(value: string | null | undefined): number {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildEquityCurveFromTrades(trades: MonitoringMvaTrade[]): CurvePoint[] {
  const curve: CurvePoint[] = [];
  let cumulative = 0;
  for (const trade of trades) {
    cumulative += safeNumber(trade.returnPct, 0);
    curve.push({
      time: trade.exitDate || trade.entryDate,
      value: cumulative,
    });
  }
  return curve;
}

function buildDrawdownCurve(curve: CurvePoint[]): CurvePoint[] {
  const drawdown: CurvePoint[] = [];
  let peak = Number.NEGATIVE_INFINITY;
  for (const point of curve) {
    peak = Math.max(peak, point.value);
    drawdown.push({
      time: point.time,
      value: point.value - peak,
    });
  }
  return drawdown;
}

function percentile(values: number[], ratio: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * ratio)));
  return sorted[index] ?? 0;
}

function buildSummaryFromTrades(trades: MonitoringMvaTrade[]): TradeSummary {
  const orderedTrades = [...trades].sort((left, right) => tradeTime(left.entryDate) - tradeTime(right.entryDate));
  const equityCurve = buildEquityCurveFromTrades(orderedTrades);
  const drawdownCurve = buildDrawdownCurve(equityCurve);
  const totalTrades = orderedTrades.length;
  const longTrades = orderedTrades.filter((trade) => trade.direction === "LONG").length;
  const shortTrades = totalTrades - longTrades;
  const wins = orderedTrades.filter((trade) => safeNumber(trade.returnPct, 0) > 0).length;
  const losses = orderedTrades.filter((trade) => safeNumber(trade.returnPct, 0) < 0).length;
  const returns = orderedTrades.map((trade) => safeNumber(trade.returnPct, 0));
  const grossWins = returns.filter((value) => value > 0).reduce((sum, value) => sum + value, 0);
  const grossLosses = returns.filter((value) => value < 0).reduce((sum, value) => sum + Math.abs(value), 0);
  const netReturnPct = returns.reduce((sum, value) => sum + value, 0);
  const avgTradePct = totalTrades ? netReturnPct / totalTrades : 0;
  const winratePct = totalTrades ? (wins / totalTrades) * 100 : 0;
  const profitFactor = grossLosses > 0 ? grossWins / grossLosses : grossWins > 0 ? 999 : 0;
  const maxDrawdownPct = Math.abs(Math.min(0, ...drawdownCurve.map((point) => point.value)));
  const calmar = maxDrawdownPct > 0 ? netReturnPct / maxDrawdownPct : netReturnPct;
  const meanReturn = totalTrades ? avgTradePct : 0;
  const variance = totalTrades > 1
    ? returns.reduce((sum, value) => sum + ((value - meanReturn) ** 2), 0) / (totalTrades - 1)
    : 0;
  const stdDev = Math.sqrt(Math.max(variance, 0));
  const sharpe = stdDev > 0 ? (meanReturn / stdDev) * Math.sqrt(Math.max(totalTrades, 1)) : 0;
  const firstDate = tradeTime(orderedTrades[0]?.entryDate);
  const lastDate = tradeTime(orderedTrades[orderedTrades.length - 1]?.exitDate ?? orderedTrades[orderedTrades.length - 1]?.entryDate);
  const years = firstDate > 0 && lastDate > firstDate ? (lastDate - firstDate) / (1000 * 60 * 60 * 24 * 365.25) : 0;
  const cagr = years > 0 ? netReturnPct / years : netReturnPct;
  return {
    totalTrades,
    longTrades,
    shortTrades,
    wins,
    losses,
    winratePct,
    netReturnPct,
    profitFactor,
    maxDrawdownPct,
    avgTradePct,
    expectancyPct: avgTradePct,
    calmar,
    sharpe,
    cagr,
    equityCurve,
    drawdownCurve,
  };
}

function hashSeed(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function buildMonteCarloSummary(symbol: string, trades: MonitoringMvaTrade[]): MonteCarloSummary | null {
  if (!trades.length) return null;
  const returns = trades.map((trade) => safeNumber(trade.returnPct, 0));
  const winFlags = trades.map((trade) => safeNumber(trade.returnPct, 0) > 0 ? 1 : 0);
  let seed = hashSeed(`${symbol}|${returns.join("|")}`);
  const nextRand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };

  const samples = Array.from({ length: 140 }, (_, index) => {
    let totalReturn = 0;
    let winCount = 0;
    for (let sampleIndex = 0; sampleIndex < returns.length; sampleIndex += 1) {
      const pick = Math.floor(nextRand() * returns.length);
      totalReturn += returns[pick] ?? 0;
      winCount += winFlags[pick] ?? 0;
    }
    return {
      index,
      returnPct: totalReturn,
      winratePct: returns.length ? (winCount / returns.length) * 100 : 0,
    };
  });

  const sampleReturns = samples.map((sample) => sample.returnPct);
  const sampleWinrates = samples.map((sample) => sample.winratePct);
  return {
    medianReturnPct: percentile(sampleReturns, 0.5),
    p10ReturnPct: percentile(sampleReturns, 0.1),
    p90ReturnPct: percentile(sampleReturns, 0.9),
    medianWinratePct: percentile(sampleWinrates, 0.5),
    worstReturnPct: Math.min(...sampleReturns),
    bestReturnPct: Math.max(...sampleReturns),
    samples: samples.map((sample) => ({ index: sample.index, returnPct: sample.returnPct })),
  };
}

function Sparkline({ values, tone = "neutral" }: { values: number[]; tone?: "positive" | "negative" | "neutral" }) {
  const points = useMemo(() => {
    if (!values.length) return "";
    const width = 320;
    const height = 88;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    return values
      .map((value, index) => {
        const x = (index / Math.max(values.length - 1, 1)) * width;
        const y = height - (((value - min) / range) * height);
        return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(" ");
  }, [values]);

  const stroke = tone === "positive" ? "#dcc476" : tone === "negative" ? "#ff7b84" : "#9aa4b2";

  return (
    <svg viewBox="0 0 320 88" className="msw-sparkline" aria-hidden="true">
      <path d={points} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StatusChip({ tone, children }: { tone: "base" | "pass" | "warn" | "fail"; children: ReactNode }) {
  return <span className={`msw-chip msw-chip--${tone}`}>{children}</span>;
}

function InputControl({
  input,
  value,
  dirty,
  onChange,
  onReset,
}: {
  input: StrategyInputDefinitionItem;
  value: unknown;
  dirty: boolean;
  onChange: (key: string, value: unknown) => void;
  onReset: (key: string) => void;
}) {
  return (
    <div className={`msw-input-tile ${dirty ? "is-dirty" : ""} ${input.type === "boolean" ? "is-boolean" : ""}`}>
      <div className="msw-input-top">
        <label className="msw-input-label">{prettifyInputLabel(input)}</label>
        {dirty ? (
          <button type="button" className="msw-reset-field" onClick={() => onReset(input.key)} aria-label={`${input.label} reset`}>
            Reset
          </button>
        ) : null}
      </div>
      <div className="msw-input-control">
        {input.type === "boolean" ? (
          <button type="button" className={`msw-bool ${Boolean(value) ? "on" : "off"}`} onClick={() => onChange(input.key, !Boolean(value))}>
            <span className="msw-bool-dot" />
            {Boolean(value) ? "Active" : "Off"}
          </button>
        ) : input.type === "select" ? (
          <select className="msw-field" value={String(value ?? "")} onChange={(event) => onChange(input.key, event.target.value)}>
            {(input.options ?? []).map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        ) : input.type === "number" ? (
          <input
            className="msw-field"
            type="number"
            value={Number(value ?? 0)}
            min={input.min}
            max={input.max}
            step={input.step ?? 0.1}
            onChange={(event) => onChange(input.key, Number(event.target.value))}
          />
        ) : (
          <input className="msw-field" type="text" value={String(value ?? "")} onChange={(event) => onChange(input.key, event.target.value)} />
        )}
        {dirty ? (
          <button type="button" className="msw-reset-field" onClick={() => onReset(input.key)} aria-label={`${input.label} reset`}>
            Reset
          </button>
        ) : null}
      </div>
    </div>
  );
}

export default function MonitoringStrategyWorkspace({
  symbol,
  selectedSymbols = [],
  availableAssets = [],
  onSelectedSymbolsChange,
  onFocusSymbol,
  multiSelectArmed = false,
  onMultiSelectArmedChange,
  onEngineResultCache,
  topContent,
  agriStatus = null,
  agriStatusBySymbol = {},
  portfolioDelta = null,
  autoUpdate = null,
  uiPrefs,
  intradayEventsUrl,
  adapterLabel,
  agriActiveKinds,
  agriAvailableKinds,
}: Props) {
  const [mode, setMode] = useState<StrategyMode>("engine_simulation");
  const [historyMode, setHistoryMode] = useState<MonitoringStrategyHistoryMode>("default_2000");
  const [inputsState, setInputsState] = useState<InputsState>({ phase: "idle" });
  const [runCache, setRunCache] = useState<Partial<Record<StrategyMode, MonitoringStrategyRunResponse>>>({});
  const [runningMode, setRunningMode] = useState<StrategyMode | null>(null);
  const [runErrors, setRunErrors] = useState<Partial<Record<StrategyMode, string>>>({});
  const [editedValues, setEditedValues] = useState<Record<string, unknown>>({});
  const [openSections, setOpenSections] = useState<Set<string>>(() => new Set(["risk"]));
  const [showStrategyDetails, setShowStrategyDetails] = useState(false);
  const [registryEntries, setRegistryEntries] = useState<RegistryEntry[]>([]);
  const [selectedSleeve, setSelectedSleeve] = useState<string>("all");
  const [selectedAssetFilter, setSelectedAssetFilter] = useState<string>("all");
  const [selectedStrategyType, setSelectedStrategyType] = useState<RegistryStrategyType | "all">("all");
  // When multiple V/S/M kinds are active, this overrides the single-value selectedStrategyType filter.
  const [agriKindFilter, setAgriKindFilter] = useState<Set<string> | null>(null);
  const [portfolioModeFilter, setPortfolioModeFilter] = useState<"single" | "sleeve_portfolio" | "global_portfolio">("single");
  // Collapsible right Parameters column (persisted). Defaults open so Agrar is unchanged.
  const [paramsCollapsed, setParamsCollapsed] = useState(false);
  useEffect(() => {
    try {
      if (window.localStorage.getItem("msw-params-collapsed") === "1") setParamsCollapsed(true);
    } catch { /* ignore */ }
  }, []);
  const toggleParamsCollapsed = useCallback(() => {
    setParamsCollapsed((prev) => {
      const next = !prev;
      try { window.localStorage.setItem("msw-params-collapsed", next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  }, []);
  const abortRef = useRef<AbortController | null>(null);
  const appliedInputsRef = useRef<string>("");

  // ── Resizable layout ─────────────────────────────────────────────────────
  const LAYOUT_KEY = "invoria.monitoring.strategyLayout.v1";
  const MIN_LEFT_PCT = 45;
  const MAX_LEFT_PCT = 78;
  const MIN_MID_PX = 240;
  const MAX_MID_PX = 520;
  const MIN_RIGHT_PX = 220;
  const MIN_CHART_PX = 220;
  const MAX_CHART_PX = 720;
  const DEFAULT_LAYOUT = { leftPanePct: 63, middlePanePx: 300, chartGridHeightPx: 420 };
  type StrategyLayout = { leftPanePct: number; middlePanePx: number; chartGridHeightPx: number };

  const [layout, setLayout] = useState<StrategyLayout>(DEFAULT_LAYOUT);

  const rootRef = useRef<HTMLDivElement>(null);
  const leftColRef = useRef<HTMLDivElement>(null);
  const hDragRef = useRef<{ startY: number; startH: number } | null>(null);
  const v1DragRef = useRef<{ startX: number; startPct: number } | null>(null);
  const v2DragRef = useRef<{ startX: number; startPx: number } | null>(null);

  useEffect(() => {
    try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout)); } catch { /* ignore */ }
  }, [layout]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(LAYOUT_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored) as Partial<StrategyLayout>;
      setLayout({
        leftPanePct: Math.max(MIN_LEFT_PCT, Math.min(MAX_LEFT_PCT, parsed.leftPanePct ?? DEFAULT_LAYOUT.leftPanePct)),
        middlePanePx: Math.max(MIN_MID_PX, Math.min(MAX_MID_PX, parsed.middlePanePx ?? DEFAULT_LAYOUT.middlePanePx)),
        chartGridHeightPx: Math.max(MIN_CHART_PX, Math.min(MAX_CHART_PX, parsed.chartGridHeightPx ?? DEFAULT_LAYOUT.chartGridHeightPx)),
      });
    } catch { /* ignore */ }
  }, []);

  const handleHDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    hDragRef.current = { startY: e.clientY, startH: layout.chartGridHeightPx };
  }, [layout.chartGridHeightPx]);

  const handleHMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!hDragRef.current) return;
    const dy = e.clientY - hDragRef.current.startY;
    const newH = Math.max(MIN_CHART_PX, Math.min(MAX_CHART_PX, hDragRef.current.startH + dy));
    setLayout((prev) => ({ ...prev, chartGridHeightPx: newH }));
  }, []);

  const handleHUp = useCallback(() => { hDragRef.current = null; }, []);

  const handleV1Down = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    v1DragRef.current = { startX: e.clientX, startPct: layout.leftPanePct };
  }, [layout.leftPanePct]);

  const handleV1Move = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!v1DragRef.current) return;
    const rootW = rootRef.current?.getBoundingClientRect().width ?? 1200;
    const dx = e.clientX - v1DragRef.current.startX;
    const newPct = Math.max(MIN_LEFT_PCT, Math.min(MAX_LEFT_PCT, v1DragRef.current.startPct + (dx / rootW * 100)));
    setLayout((prev) => ({ ...prev, leftPanePct: newPct }));
  }, []);

  const handleV1Up = useCallback(() => { v1DragRef.current = null; }, []);

  const handleV2Down = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    v2DragRef.current = { startX: e.clientX, startPx: layout.middlePanePx };
  }, [layout.middlePanePx]);

  const handleV2Move = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!v2DragRef.current) return;
    const dx = e.clientX - v2DragRef.current.startX;
    const rootW = rootRef.current?.getBoundingClientRect().width ?? 1200;
    const leftW = rootW * layout.leftPanePct / 100;
    const maxMid = Math.max(MIN_MID_PX, rootW - leftW - 16 - MIN_RIGHT_PX);
    const newPx = Math.max(MIN_MID_PX, Math.min(MAX_MID_PX, maxMid, v2DragRef.current.startPx + dx));
    setLayout((prev) => ({ ...prev, middlePanePx: newPx }));
  }, [layout.leftPanePct]);

  const handleV2Up = useCallback(() => { v2DragRef.current = null; }, []);

  const resetLayout = useCallback(() => { setLayout(DEFAULT_LAYOUT); }, []);
  // ─────────────────────────────────────────────────────────────────────────
  const inFlightRunKeyRef = useRef<string | null>(null);
  const intradayFetchedKeyRef = useRef<string>("");
  const basketSelectedSymbols = useMemo(
    () => Array.from(new Set(selectedSymbols.map((item) => String(item ?? "").trim().toUpperCase()).filter(Boolean))),
    [selectedSymbols],
  );
  const availableAssetSymbols = useMemo(
    () => new Set(availableAssets.map((asset) => asset.symbol.toUpperCase())),
    [availableAssets],
  );
  const productionEntries = useMemo(
    () => registryEntries.filter((entry) => availableAssetSymbols.has(entry.asset.toUpperCase())),
    [availableAssetSymbols, registryEntries],
  );
  const visibleEntries = useMemo(() => productionEntries.filter((entry) => entry.active), [productionEntries]);
  const sleeveOptions = useMemo(
    () => Array.from(new Set(visibleEntries.map((entry) => entry.sleeveName).filter(Boolean) as string[])).sort((left, right) => left.localeCompare(right)),
    [visibleEntries],
  );
  const strategyTypeOptions = useMemo(
    () => Array.from(new Set(visibleEntries.map((entry) => entry.strategyType))).sort(),
    [visibleEntries],
  );
  const filteredEntries = useMemo(() => visibleEntries.filter((entry) => {
    if (selectedSleeve !== "all" && entry.sleeveName !== selectedSleeve) return false;
    if (agriKindFilter !== null) {
      // Multi-kind agri mode: include only entries whose strategyType is in the active set.
      if (!agriKindFilter.has(entry.strategyType)) return false;
    } else if (selectedStrategyType !== "all" && entry.strategyType !== selectedStrategyType) return false;
    if (selectedAssetFilter !== "all" && entry.asset !== selectedAssetFilter) return false;
    return true;
  }), [agriKindFilter, selectedAssetFilter, selectedSleeve, selectedStrategyType, visibleEntries]);
  const assetFilterOptions = useMemo(() => {
    const assets = (selectedSleeve === "all" && selectedStrategyType === "all" ? visibleEntries : filteredEntries)
      .map((entry) => entry.asset);
    return Array.from(new Set(assets)).sort((left, right) => left.localeCompare(right));
  }, [filteredEntries, selectedSleeve, selectedStrategyType, visibleEntries]);
  const registryStrategyKind: MonitoringStrategyKind = selectedStrategyType === "seasonal"
    ? "seasonal"
    : selectedStrategyType === "portfolio"
      ? "portfolio"
      : "macro_valuation";

  // testerInputKey: stable cache key that includes active kinds. Changes on every V/S/M toggle.
  const testerInputKey = symbol
    ? `${symbol}:${(agriActiveKinds ?? []).slice().sort().join("+") || "none"}`
    : null;

  // True only when active kinds === all available kinds (or when not in agri mode).
  // When a subset is selected, the engine has no per-kind data → show Missing State.
  const isFullKindCombination = agriActiveKinds === undefined
    || agriAvailableKinds === undefined
    || agriAvailableKinds.length === 0
    || (agriActiveKinds.length === agriAvailableKinds.length
        && agriAvailableKinds.every((k) => agriActiveKinds.includes(k)));

  // True when exactly "seasonal" is the only active kind — has a real engine.
  const isSeasonalOnlyKind =
    agriActiveKinds !== undefined &&
    agriActiveKinds.length === 1 &&
    agriActiveKinds[0] === "seasonal";

  // True when the tester can actually produce results (full combo OR seasonal-only engine).
  const canRunTester = isFullKindCombination || isSeasonalOnlyKind;

  const isMultiAssetSelection = basketSelectedSymbols.length > 1;
  const basketSelectionKey = useMemo(() => basketSelectedSymbols.join("|"), [basketSelectedSymbols]);
  const backtestStart = historyMode === "full" ? null : AGRI_DEFAULT_BACKTEST_START;
  const backtestStartLabel = historyMode === "full" ? "Full history" : AGRI_DEFAULT_BACKTEST_START;

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/monitoring/strategy-registry", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json() as { productionStrategies?: RegistryEntry[] };
        if (!cancelled) {
          setRegistryEntries(Array.isArray(data.productionStrategies) ? data.productionStrategies : []);
        }
      })
      .catch(() => {
        if (!cancelled) setRegistryEntries([]);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (selectedSleeve !== "all" && !sleeveOptions.includes(selectedSleeve)) {
      setSelectedSleeve("all");
    }
  }, [selectedSleeve, sleeveOptions]);

  useEffect(() => {
    if (selectedStrategyType !== "all" && !strategyTypeOptions.includes(selectedStrategyType)) {
      setSelectedStrategyType("all");
    }
  }, [selectedStrategyType, strategyTypeOptions]);

  useEffect(() => {
    if (selectedAssetFilter !== "all" && !assetFilterOptions.includes(selectedAssetFilter)) {
      setSelectedAssetFilter("all");
    }
  }, [assetFilterOptions, selectedAssetFilter]);

  // Sync V/S/M kind selection → strategy type filter when the focused symbol or active kinds change.
  useEffect(() => {
    if (!agriActiveKinds) {
      setAgriKindFilter(null);
      return;
    }
    if (agriActiveKinds.length === 1) {
      // Single kind: use the existing dropdown filter so other workspace controls still work.
      setAgriKindFilter(null);
      const [kind] = agriActiveKinds;
      if (kind === "seasonal") setSelectedStrategyType("seasonal");
      else if (kind === "valuation") setSelectedStrategyType("valuation");
      else if (kind === "macro") setSelectedStrategyType("macro");
      else setSelectedStrategyType("all");
    } else {
      // 0 or 2+ kinds: use the set filter (empty set → no strategies shown; 2-3 → multi-kind filter).
      setAgriKindFilter(new Set(agriActiveKinds));
      setSelectedStrategyType("all");
    }
  }, [symbol, agriActiveKinds]);

  useEffect(() => {
    if (!visibleEntries.length || !onSelectedSymbolsChange) return;
    const pool = filteredEntries.length ? filteredEntries : visibleEntries;
    const filteredSymbols = Array.from(new Set(pool.map((entry) => entry.asset)));
    if (!filteredSymbols.length) return;
    let nextSymbols = filteredSymbols;
    if (portfolioModeFilter === "single") {
      const preferred = selectedAssetFilter !== "all"
        ? selectedAssetFilter
        : filteredSymbols.includes(symbol ?? "") ? (symbol ?? filteredSymbols[0]) : filteredSymbols[0];
      nextSymbols = preferred ? [preferred] : [filteredSymbols[0]];
    } else if (portfolioModeFilter === "sleeve_portfolio" && selectedSleeve !== "all") {
      nextSymbols = filteredSymbols;
    } else if (portfolioModeFilter === "global_portfolio") {
      nextSymbols = Array.from(new Set(
        visibleEntries
          .filter((entry) => selectedStrategyType === "all" || entry.strategyType === selectedStrategyType)
          .map((entry) => entry.asset),
      ));
    }
    const currentKey = basketSelectedSymbols.join("|");
    const nextKey = nextSymbols.join("|");
    if (nextKey && nextKey !== currentKey) {
      onSelectedSymbolsChange(nextSymbols);
    }
    if (nextSymbols[0] && nextSymbols[0] !== symbol) {
      onFocusSymbol?.(nextSymbols[0]);
    }
  }, [
    basketSelectedSymbols,
    filteredEntries,
    onFocusSymbol,
    onSelectedSymbolsChange,
    portfolioModeFilter,
    selectedAssetFilter,
    selectedSleeve,
    selectedStrategyType,
    symbol,
    visibleEntries,
  ]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(HISTORY_MODE_STORAGE_KEY);
      if (stored === "full" || stored === "default_2000") {
        setHistoryMode(stored);
      }
    } catch {
      // ignore localStorage failures
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(HISTORY_MODE_STORAGE_KEY, historyMode);
    } catch {
      // ignore localStorage failures
    }
  }, [historyMode]);

  const inputSet = inputsState.phase === "loaded" ? inputsState.inputSet : null;
  const valueMap = useMemo(
    () => Object.fromEntries((inputSet?.inputs ?? []).map((input) => [input.key, editedValues[input.key] ?? input.defaultValue])),
    [editedValues, inputSet],
  );
  const dirtyKeys = useMemo(() => {
    const next = new Set<string>();
    for (const input of inputSet?.inputs ?? []) {
      if (!valueEquals(input.defaultValue, valueMap[input.key])) next.add(input.key);
    }
    return next;
  }, [inputSet, valueMap]);

  const loadInputs = useCallback(async (currentSymbol: string) => {
    setInputsState({ phase: "loading" });
    try {
      const response = await fetch("/api/monitoring/strategy-tester/load-inputs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: currentSymbol, strategyKind: registryStrategyKind }),
      });
      const data = await response.json() as { inputSet?: StrategyInputSet | null; inputAvailability?: string; error?: string };
      if (!data.inputSet) {
        if (data.inputAvailability === "not_applicable") {
          setInputsState({ phase: "idle" });
        } else {
          setInputsState({ phase: "error", message: data.error ?? "Inputs konnten nicht geladen werden." });
        }
        return;
      }
      setInputsState({
        phase: "loaded",
        inputSet: data.inputSet,
        inputAvailability: data.inputAvailability ?? "missing_input_xlsx",
      });
    } catch (error) {
      setInputsState({
        phase: "error",
        message: error instanceof Error ? error.message : "Inputs konnten nicht geladen werden.",
      });
    }
  }, [registryStrategyKind]);

  useEffect(() => {
    abortRef.current?.abort();
    inFlightRunKeyRef.current = null;
    intradayFetchedKeyRef.current = "";
    setRunCache({});
    setRunErrors({});
    setEditedValues({});
    setOpenSections(new Set(["risk"]));
    setMode("engine_simulation");
    appliedInputsRef.current = "";
    if (!symbol) {
      setInputsState({ phase: "idle" });
      return;
    }
    if (intradayEventsUrl) {
      setInputsState({ phase: "idle" });
      return;
    }
    loadInputs(symbol);
  }, [basketSelectionKey, intradayEventsUrl, loadInputs, symbol]);

  // Auto-fetch for Intraday assets: read results from events JSON via dedicated route.
  useEffect(() => {
    if (!intradayEventsUrl || !symbol || !basketSelectedSymbols.length) return;
    // Append from-date filter based on historyMode so the route returns only matching trades.
    const fromDate = historyMode === "default_2000" ? "2000-01-01" : null;
    const resolvedUrl = fromDate ? `${intradayEventsUrl}&from=${fromDate}` : intradayEventsUrl;
    const fetchKey = `${symbol}::${resolvedUrl}`;
    if (intradayFetchedKeyRef.current === fetchKey) return;
    intradayFetchedKeyRef.current = fetchKey;

    let cancelled = false;
    setRunningMode("engine_simulation");

    void fetch(resolvedUrl)
      .then(async (r) => {
        const data = (await r.json()) as MonitoringStrategyRunResponse;
        if (!cancelled) setRunCache((prev) => ({ ...prev, engine_simulation: data }));
      })
      .catch(() => {
        if (!cancelled) setRunErrors((prev) => ({ ...prev, engine_simulation: "Intraday events konnten nicht geladen werden." }));
      })
      .finally(() => {
        if (!cancelled) setRunningMode(null);
      });

    return () => { cancelled = true; };
  }, [historyMode, intradayEventsUrl, symbol, basketSelectedSymbols.length]);

  const runMode = useCallback(async (targetMode: StrategyMode) => {
    if (!symbol || !basketSelectedSymbols.length) return;
    // Seasonal-only engine computes from OHLC rules — no XLSX inputs required.
    if (!isSeasonalOnlyKind && inputsState.phase !== "loaded") return;
    const requestKey = JSON.stringify({
      targetMode,
      symbol,
      basketSelectedSymbols,
      historyMode,
      activeKinds: agriActiveKinds ? [...agriActiveKinds].sort() : null,
      customInputs: dirtyKeys.size ? valueMap : null,
    });
    if (inFlightRunKeyRef.current === requestKey) return;
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    inFlightRunKeyRef.current = requestKey;
    setRunningMode(targetMode);
    setRunErrors((prev) => ({ ...prev, [targetMode]: "" }));
    try {
      const runEndpoint = isSeasonalOnlyKind
        ? "/api/monitoring/strategy-tester/run-agri-seasonal"
        : "/api/monitoring/strategy-tester/run";
      const response = await fetch(runEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol,
          symbols: basketSelectedSymbols,
          focusedSymbol: symbol,
          strategyKind: isSeasonalOnlyKind ? "seasonal" : registryStrategyKind,
          strategyFamily: "agri_macro_final",
          portfolioMode: basketSelectedSymbols.length > 1 || portfolioModeFilter !== "single" ? "selected_equal_weight" : "single",
          historyMode,
          useFinalRegistry: true,
          runMode: MODE_META[targetMode].runMode,
          customInputs: dirtyKeys.size ? valueMap : undefined,
        }),
        signal: abortRef.current.signal,
      });
      const data = await response.json() as MonitoringStrategyRunResponse;
      setRunCache((prev) => ({ ...prev, [targetMode]: data }));
      if (targetMode === "engine_simulation" && data.status === "passed") {
        const nextResults = data.perAsset ?? (data.result ? { [data.result.symbol]: data.result } : {});
        if (Object.keys(nextResults).length) {
          onEngineResultCache?.(nextResults);
        }
      }
    } catch (error) {
      if ((error as { name?: string }).name === "AbortError") return;
      setRunErrors((prev) => ({
        ...prev,
        [targetMode]: error instanceof Error ? error.message : "Run fehlgeschlagen.",
      }));
    } finally {
      if (inFlightRunKeyRef.current === requestKey) {
        inFlightRunKeyRef.current = null;
      }
      setRunningMode((current) => (current === targetMode ? null : current));
    }
  }, [agriActiveKinds, basketSelectedSymbols, dirtyKeys.size, historyMode, isSeasonalOnlyKind, onEngineResultCache, portfolioModeFilter, registryStrategyKind, symbol, valueMap]);

  // Clear cached results when V/S/M active kinds change so stale results are never shown.
  const prevTesterInputKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (testerInputKey === prevTesterInputKeyRef.current) return;
    prevTesterInputKeyRef.current = testerInputKey;
    setRunCache({});
    setRunErrors({});
  }, [testerInputKey]);

  // Auto-run: load a result for the active mode whenever none is cached yet.
  useEffect(() => {
    if (!symbol || !basketSelectedSymbols.length) return;
    // Seasonal-only engine doesn't need XLSX inputs — bypass inputsState check.
    if (!isSeasonalOnlyKind && (inputsState.phase === "idle" || inputsState.phase === "loading")) return;
    if (runningMode) return;
    if (runCache[mode] || runErrors[mode]) return;
    // Don't auto-run when a subset is selected without a real engine.
    if (!canRunTester) return;
    appliedInputsRef.current = JSON.stringify(valueMap);
    void runMode(mode);
  }, [basketSelectedSymbols.length, canRunTester, isSeasonalOnlyKind, symbol, mode, inputsState.phase, runCache, runErrors, runningMode, runMode, valueMap]);

  // Debounced auto-recalculation: clear cached results once inputs settle after an edit.
  useEffect(() => {
    if (!symbol) return;
    if (inputsState.phase === "idle" || inputsState.phase === "loading") return;
    const signature = JSON.stringify(valueMap);
    if (signature === appliedInputsRef.current) return;
    const timer = setTimeout(() => {
      setRunCache({});
      setRunErrors({});
    }, 700);
    return () => clearTimeout(timer);
  }, [symbol, inputsState.phase, valueMap]);

  useEffect(() => {
    inFlightRunKeyRef.current = null;
    intradayFetchedKeyRef.current = "";
    setRunCache({});
    setRunErrors({});
    appliedInputsRef.current = "";
  }, [historyMode]);

  const currentResponse = runCache[mode] ?? null;
  const currentResult = currentResponse?.status === "passed" ? currentResponse.result ?? null : null;
  const currentCombined = currentResponse?.status === "passed" ? currentResponse.combined ?? null : null;
  const currentPerAsset = currentResponse?.status === "passed" ? currentResponse.perAsset ?? {} : {};
  const requestedDataSources = useMemo(
    () => (currentResult?.dataSourceMap ?? []).filter((entry) => entry.requested),
    [currentResult?.dataSourceMap],
  );
  const currentBlocker = currentResponse && currentResponse.status !== "passed"
    ? currentResponse.blocker ?? "Run blockiert."
    : runErrors[mode] ?? "";
  const backtestResult = runCache.engine_simulation?.status === "passed" ? runCache.engine_simulation.result ?? null : null;
  const effectiveAgriAudit = currentResult?.agriAudit ?? backtestResult?.agriAudit ?? agriStatus ?? null;
  const focusedAssetLabel = currentResult?.symbol ?? symbol ?? "-";

  const inputSections = useMemo(() => {
    const inputs = inputSet?.inputs ?? [];
    const byKey = new Map(inputs.map((input) => [input.key, input]));
    const used = new Set<string>();

    const primary = PRIMARY_INPUT_SECTIONS
      .map<InputSection>((section) => ({
        key: section.key,
        title: section.title,
        description: section.description,
        rows: section.rows
          .map((row) => row.map((key) => byKey.get(key)).filter(Boolean) as StrategyInputDefinitionItem[])
          .filter((row) => row.length > 0),
      }))
      .filter((section) => section.rows.length > 0);

    for (const section of primary) {
      for (const row of section.rows) {
        for (const input of row) used.add(input.key);
      }
    }

    const leftoversByGroup = new Map<string, StrategyInputDefinitionItem[]>();
    for (const input of inputs) {
      if (used.has(input.key)) continue;
      const bucket = leftoversByGroup.get(input.group) ?? [];
      bucket.push(input);
      leftoversByGroup.set(input.group, bucket);
    }

    const leftoverInputs = Array.from(leftoversByGroup.entries())
      .sort(([left], [right]) => {
        const leftIndex = ADVANCED_GROUP_ORDER.indexOf(left);
        const rightIndex = ADVANCED_GROUP_ORDER.indexOf(right);
        if (leftIndex === -1 && rightIndex === -1) return left.localeCompare(right);
        if (leftIndex === -1) return 1;
        if (rightIndex === -1) return -1;
        return leftIndex - rightIndex;
      })
      .flatMap(([, groupInputs]) => groupInputs);

    if (!leftoverInputs.length) return primary;

    const advancedRows = leftoverInputs.reduce<StrategyInputDefinitionItem[][]>((rows, input, index) => {
      if (index % 2 === 0) rows.push([input]);
      else rows[rows.length - 1]?.push(input);
      return rows;
    }, []);

    return [
      ...primary,
      {
        key: "advanced",
        title: "Advanced",
        description: "Engine-side extras, cost settings, trend filters and non-primary controls.",
        rows: advancedRows,
        advanced: true,
      },
    ];
  }, [inputSet]);

  const displayTrades = useMemo(() => {
    const sourceTrades = isMultiAssetSelection
      ? ((currentCombined?.trades ?? []) as MonitoringMvaTrade[])
      : (currentResult?.trades ?? []);
    if (!sourceTrades.length) return [] as MonitoringMvaTrade[];
    if (mode !== "live_signal") return sourceTrades;
    return sourceTrades.filter((trade) => String(trade.entryDate || "") >= AGRI_LIVE_START_DATE);
  }, [currentCombined?.trades, currentResult?.trades, isMultiAssetSelection, mode]);

  const displaySummary = useMemo(() => {
    if (isMultiAssetSelection && currentCombined) {
      const tradeSummary = buildSummaryFromTrades(displayTrades as MonitoringMvaTrade[]);
      return {
        ...tradeSummary,
        totalTrades: safeNumber(currentCombined.metrics.totalTrades, tradeSummary.totalTrades),
        longTrades: safeNumber(currentCombined.metrics.longTrades, tradeSummary.longTrades),
        shortTrades: safeNumber(currentCombined.metrics.shortTrades, tradeSummary.shortTrades),
        wins: safeNumber(currentCombined.metrics.wins, tradeSummary.wins),
        losses: safeNumber(currentCombined.metrics.losses, tradeSummary.losses),
        winratePct: safeNumber(currentCombined.metrics.winratePct, tradeSummary.winratePct),
        netReturnPct: safeNumber(currentCombined.metrics.netReturnPct, tradeSummary.netReturnPct),
        profitFactor: safeNumber(currentCombined.metrics.profitFactor, tradeSummary.profitFactor),
        maxDrawdownPct: safeNumber(currentCombined.metrics.maxDrawdownPct, tradeSummary.maxDrawdownPct),
        avgTradePct: safeNumber(currentCombined.metrics.avgTradePct, tradeSummary.avgTradePct),
        expectancyPct: safeNumber(currentCombined.metrics.avgTradePct, tradeSummary.expectancyPct),
        sharpe: safeNumber(currentCombined.metrics.tradeSharpe, tradeSummary.sharpe),
        cagr: safeNumber(currentCombined.metrics.cagr, tradeSummary.cagr),
        equityCurve: (currentCombined.equityCurve ?? []).map((point) => ({ time: point.date, value: safeNumber(point.cumulativeReturnPct) })),
        drawdownCurve: (currentCombined.drawdownCurve ?? []).map((point) => ({ time: point.date, value: safeNumber(point.cumulativeReturnPct) })),
      } satisfies TradeSummary;
    }
    if (!currentResult) return null;
    if (mode === "engine_simulation") {
      const tradeSummary = buildSummaryFromTrades(currentResult.trades ?? []);
      return {
        ...tradeSummary,
        totalTrades: safeNumber(currentResult.metrics.totalTrades, tradeSummary.totalTrades),
        longTrades: safeNumber(currentResult.metrics.longTrades, tradeSummary.longTrades),
        shortTrades: safeNumber(currentResult.metrics.shortTrades, tradeSummary.shortTrades),
        wins: safeNumber(currentResult.metrics.wins, tradeSummary.wins),
        losses: safeNumber(currentResult.metrics.losses, tradeSummary.losses),
        winratePct: safeNumber(currentResult.metrics.winratePct, tradeSummary.winratePct),
        netReturnPct: safeNumber(currentResult.metrics.netReturnPct, tradeSummary.netReturnPct),
        profitFactor: safeNumber(currentResult.metrics.profitFactor, tradeSummary.profitFactor),
        maxDrawdownPct: safeNumber(currentResult.metrics.maxDrawdownPct, tradeSummary.maxDrawdownPct),
        avgTradePct: safeNumber(currentResult.metrics.avgReturnPct, tradeSummary.avgTradePct),
        expectancyPct: safeNumber(currentResult.metrics.avgReturnPct, tradeSummary.expectancyPct),
        sharpe: currentResult.metrics.sharpeRatio ?? tradeSummary.sharpe,
        cagr: currentResult.metrics.cagr ?? tradeSummary.cagr,
        equityCurve: (currentResult.equityCurve ?? []).map((point) => ({ time: point.date, value: safeNumber(point.cumulativeReturnPct) })),
        drawdownCurve: buildDrawdownCurve((currentResult.equityCurve ?? []).map((point) => ({ time: point.date, value: safeNumber(point.cumulativeReturnPct) }))),
      } satisfies TradeSummary;
    }
    if (mode === "walk_forward" && currentResult.walkForward) {
      const tradeSummary = buildSummaryFromTrades(currentResult.trades ?? []);
      return {
        ...tradeSummary,
        totalTrades: safeNumber(currentResult.walkForward.oosAggregate.trades),
        winratePct: safeNumber(currentResult.walkForward.oosAggregate.winrate),
        netReturnPct: safeNumber(currentResult.walkForward.oosAggregate.netReturn),
        profitFactor: safeNumber(currentResult.walkForward.oosAggregate.profitFactor),
        maxDrawdownPct: Math.abs(safeNumber(currentResult.walkForward.oosAggregate.maxDrawdown)),
        calmar: safeNumber(currentResult.walkForward.oosAggregate.calmar),
      } satisfies TradeSummary;
    }
    return buildSummaryFromTrades(displayTrades);
  }, [currentCombined, currentResult, displayTrades, isMultiAssetSelection, mode]);

  const monteCarlo = useMemo(
    () => buildMonteCarloSummary(symbol ?? "", currentResult?.trades ?? backtestResult?.trades ?? []),
    [backtestResult?.trades, currentResult?.trades, symbol],
  );

  const rawTradeSummary = useMemo(() => {
    if (isMultiAssetSelection && currentCombined) {
      return {
        stopExitRate: currentCombined.metrics.stopExitRate,
        tpExitRate: currentCombined.metrics.tpExitRate,
        commissionCost: currentCombined.metrics.commissionCost,
        spreadCost: currentCombined.metrics.spreadCost,
        slippageCost: currentCombined.metrics.slippageCost,
        financingCost: currentCombined.metrics.financingCost,
        grossReturnPct: currentCombined.metrics.grossReturnPct,
        tradeSharpe: currentCombined.metrics.tradeSharpe,
        dailySharpe: currentCombined.metrics.dailySharpe,
      };
    }
    const rows = currentResult?.rawTrades ?? [];
    if (!rows.length) {
      return {
        stopExitRate: null,
        tpExitRate: null,
        commissionCost: currentResult?.costSummary?.totalCommissionCost ?? null,
        spreadCost: currentResult?.costSummary?.totalSpreadCost ?? null,
        slippageCost: currentResult?.costSummary?.totalSlippageCost ?? null,
        financingCost: currentResult?.costSummary?.totalFinancingCost ?? null,
        grossReturnPct: null,
        tradeSharpe: currentResult?.metrics.sharpeRatio ?? displaySummary?.sharpe ?? null,
        dailySharpe: null,
      };
    }

    const stopExits = rows.filter((row) => normalizeExitReason(row.exitReason).includes("stop")).length;
    const tpExits = rows.filter((row) => {
      const reason = normalizeExitReason(row.exitReason);
      return reason.includes("take") || reason.includes("tp");
    }).length;
    const initialCapital = currentResult?.costSummary?.initialCapital ?? currentResult?.metrics.initialCapital ?? null;
    const totalGrossPnl = currentResult?.costSummary?.totalGrossPnl
      ?? rows.reduce((sum, row) => sum + safeNumber(row.grossPnl, 0), 0);
    const grossReturnPct = initialCapital && initialCapital > 0
      ? (safeNumber(totalGrossPnl, 0) / initialCapital) * 100
      : null;

    return {
      stopExitRate: rows.length ? (stopExits / rows.length) * 100 : null,
      tpExitRate: rows.length ? (tpExits / rows.length) * 100 : null,
      commissionCost: currentResult?.costSummary?.totalCommissionCost ?? rows.reduce((sum, row) => sum + safeNumber(row.commissionCost, 0), 0),
      spreadCost: currentResult?.costSummary?.totalSpreadCost ?? rows.reduce((sum, row) => sum + safeNumber(row.spreadCost, 0), 0),
      slippageCost: currentResult?.costSummary?.totalSlippageCost ?? rows.reduce((sum, row) => sum + safeNumber(row.slippageCost, 0), 0),
      financingCost: currentResult?.costSummary?.totalFinancingCost ?? rows.reduce((sum, row) => sum + safeNumber(row.financingCost, 0), 0),
      grossReturnPct,
      tradeSharpe: currentResult?.metrics.sharpeRatio ?? displaySummary?.sharpe ?? null,
      dailySharpe: null,
    };
  }, [currentCombined, currentResult, displaySummary?.sharpe, isMultiAssetSelection]);

  const detailedTradeRows = useMemo(() => {
    if (isMultiAssetSelection) {
      const rows = currentCombined?.rawTrades ?? [];
      return rows.slice(-18).reverse().map((trade) => ({
        key: trade.key,
        symbol: trade.symbol,
        direction: trade.direction,
        entryDate: formatDate(trade.entryTime),
        exitDate: formatDate(trade.exitTime),
        entryPrice: trade.entryPrice,
        exitPrice: trade.exitPrice,
        stopLoss: trade.stopLossPrice,
        takeProfit: trade.takeProfitPrice,
        exitReason: trade.exitReason ?? "-",
        quantity: trade.quantity,
        grossPnl: trade.grossPnl ?? null,
        netPnl: trade.netPnl ?? null,
        rMultiple: trade.rMultiple ?? null,
        holdingBars: trade.holdingBars ?? null,
      }));
    }
    const rows = currentResult?.rawTrades ?? [];
    if (!rows.length) return [];
    return rows.slice(-12).reverse().map((trade) => ({
      key: trade.tradeId,
      symbol: trade.symbol,
      direction: trade.direction,
      entryDate: formatDate(trade.entryTime),
      exitDate: formatDate(trade.exitTime),
      entryPrice: trade.entryPrice,
      exitPrice: trade.exitPrice,
      stopLoss: trade.stopLossPrice,
      takeProfit: trade.takeProfitPrice,
      exitReason: trade.exitReason ?? "-",
      quantity: trade.quantity,
      grossPnl: trade.grossPnl ?? null,
      netPnl: trade.netPnl ?? null,
      rMultiple: null,
      holdingBars: null,
    }));
  }, [currentCombined?.rawTrades, currentResult?.rawTrades, isMultiAssetSelection]);

  const selectedHeaderTitle = useMemo(() => {
    if (basketSelectedSymbols.length === 8) return "All-8 Agri Basket";
    if (basketSelectedSymbols.length > 1) return `Agri Basket Backtest (${basketSelectedSymbols.length})`;
    if (basketSelectedSymbols.length === 1) return `${basketSelectedSymbols[0]} Strategy Backtest`;
    return "Asset wählen";
  }, [basketSelectedSymbols]);

  const handleHeaderAssetClick = useCallback((selectedSymbol: string) => {
    if (!selectedSymbol) return;
    if (basketSelectedSymbols.length > 1) {
      const nextSymbols = basketSelectedSymbols.filter((item) => item !== selectedSymbol);
      if (!nextSymbols.length) return;
      onSelectedSymbolsChange?.(nextSymbols);
      onMultiSelectArmedChange?.(false);
      if (selectedSymbol === symbol) {
        onFocusSymbol?.(nextSymbols[0]);
      }
      return;
    }
    onFocusSymbol?.(selectedSymbol);
  }, [basketSelectedSymbols, onFocusSymbol, onMultiSelectArmedChange, onSelectedSymbolsChange, symbol]);

  const perAssetBreakdown = useMemo(() => {
    return basketSelectedSymbols.map((selectedSymbol) => {
      const result = currentPerAsset[selectedSymbol];
      const status = agriStatusBySymbol[selectedSymbol] ?? result?.agriAudit ?? null;
      return {
        symbol: selectedSymbol,
        name: availableAssets.find((asset) => asset.symbol === selectedSymbol)?.name ?? selectedSymbol,
        trades: result?.metrics.totalTrades ?? null,
        returnPct: result?.metrics.netReturnPct ?? null,
        maxDrawdownPct: result?.metrics.maxDrawdownPct ?? null,
        profitFactor: result?.metrics.profitFactor ?? null,
        winratePct: result?.metrics.winratePct ?? null,
        tradeSharpe: result?.metrics.sharpeRatio ?? null,
        dataHealth: status?.dataHealth.overallStatus ?? null,
        liveReadiness: status?.liveReadiness.status ?? null,
      };
    });
  }, [agriStatusBySymbol, availableAssets, basketSelectedSymbols, currentPerAsset]);

  const renderBacktestCharts = (result: MonitoringStrategyTestResult, summary: TradeSummary | null) => {
    const equityData = summary?.equityCurve ?? result.equityCurve.map((point) => ({ time: point.date, value: safeNumber(point.cumulativeReturnPct) }));
    const drawdownData = summary?.drawdownCurve ?? buildDrawdownCurve(equityData);
    const topDrawdowns = drawdownData
      .map((point) => Math.abs(point.value))
      .sort((left, right) => right - left)
      .slice(0, 5);

    return (
      <div className="msw-visual-stack">
        <div className="msw-chart-grid">
          <div className="msw-chart-card">
            <StrategyTesterEquityChart
              data={equityData.map((point) => ({ time: point.time, value: point.value }))}
              totalReturnPercent={summary?.netReturnPct ?? result.metrics.netReturnPct}
              cagr={summary?.cagr ?? result.metrics.cagr ?? undefined}
              fillContainer
            />
          </div>
          <div className="msw-chart-card">
            <StrategyTesterDrawdownChart
              data={drawdownData.map((point) => ({ time: point.time, value: point.value }))}
              maxDrawdownPercent={summary?.maxDrawdownPct ?? result.metrics.maxDrawdownPct}
              avgDrawdownPercent={drawdownData.length ? drawdownData.reduce((sum, point) => sum + point.value, 0) / drawdownData.length : 0}
              top5DrawdownsPercent={topDrawdowns}
              fillContainer
            />
          </div>
        </div>
      </div>
    );
  };

  const renderLiveCharts = (result: MonitoringStrategyTestResult, summary: TradeSummary | null) => {
    const liveSignal = result.liveSignal;
    return (
      <div className="msw-section-stack">
        <div className="msw-inline-grid">
          <div className="msw-mini-card">
            <span>Signal</span>
            <strong>{liveSignal?.signal ?? "NONE"}</strong>
            <small>{liveSignal?.stale ? "Signal stale" : `Since ${AGRI_LIVE_START_DATE}`}</small>
          </div>
          <div className="msw-mini-card">
            <span>Entry</span>
            <strong>{liveSignal?.entryPrice != null ? formatSigned(liveSignal.entryPrice) : "-"}</strong>
            <small>{formatDate(liveSignal?.basedOnLatestBarTime)}</small>
          </div>
          <div className="msw-mini-card">
            <span>Stop / TP</span>
            <strong>{liveSignal?.stopLoss != null ? formatSigned(liveSignal.stopLoss) : "-"} / {liveSignal?.takeProfit != null ? formatSigned(liveSignal.takeProfit) : "-"}</strong>
            <small>{(liveSignal?.reason ?? []).slice(0, 2).map(humanizeReason).join(" / ") || "Engine rules"}</small>
          </div>
        </div>
        {renderBacktestCharts(result, summary)}
      </div>
    );
  };

  const renderValidationCharts = (result: MonitoringStrategyTestResult) => {
    const walkForward = result.walkForward;
    if (!walkForward) {
      return <div className="msw-placeholder">No walk-forward data available for this result.</div>;
    }
    const monteCarloValues = monteCarlo?.samples.map((sample) => sample.returnPct) ?? [];
    const latestFold = walkForward.folds.at(-1) ?? null;
    const latestTrainReturn = latestFold ? safeNumber(latestFold.trainMetrics.netReturnPct) : null;
    const latestTrainPf = latestFold ? safeNumber(latestFold.trainMetrics.profitFactor) : null;
    const latestOosReturn = latestFold ? safeNumber(latestFold.oosMetrics.netReturnPct) : null;
    const latestOosPf = latestFold ? safeNumber(latestFold.oosMetrics.profitFactor) : null;
    return (
      <div className="msw-section-stack">
        <div className="msw-inline-grid">
          <div className="msw-mini-card">
            <span>Walk-Forward</span>
            <strong>{prettifyRobustness(walkForward.robustnessStatus).label}</strong>
            <small>{walkForward.folds.length} folds</small>
          </div>
          <div className="msw-mini-card">
            <span>In-Sample</span>
            <strong>{formatCardNumber(latestTrainReturn, "pct")}</strong>
            <small>PF {formatCardNumber(latestTrainPf)}</small>
          </div>
          <div className="msw-mini-card">
            <span>Out-of-Sample</span>
            <strong>{formatCardNumber(latestOosReturn, "pct")}</strong>
            <small>PF {formatCardNumber(latestOosPf)}</small>
          </div>
          <div className="msw-mini-card">
            <span>Monte Carlo</span>
            <strong>{monteCarlo ? formatMaybePct(monteCarlo.medianReturnPct) : "-"}</strong>
            <small>{monteCarlo ? `P10 ${formatMaybePct(monteCarlo.p10ReturnPct)} / P90 ${formatMaybePct(monteCarlo.p90ReturnPct)}` : "Not available"}</small>
          </div>
        </div>
        <div className="msw-validation-layout">
          <div className="msw-surface-card">
            <div className="msw-surface-head">
              <strong>Walk-Forward Folds</strong>
              <span>{walkForward.folds.length} folds</span>
            </div>
            <div className="msw-fold-list">
              {walkForward.folds.map((fold, index) => (
                <div key={`${fold.trainStart}_${fold.oosStart}`} className="msw-fold-row">
                  <strong>Fold {index + 1}</strong>
                  <span>{formatDate(fold.trainStart)} to {formatDate(fold.trainEnd)}</span>
                  <span>{formatDate(fold.oosStart)} to {formatDate(fold.oosEnd)}</span>
                  <em>{formatMaybePct(safeNumber(fold.oosMetrics.netReturnPct))}</em>
                </div>
              ))}
            </div>
          </div>
          <div className="msw-surface-card">
            <div className="msw-surface-head">
              <strong>Robustness</strong>
              <StatusChip tone={prettifyRobustness(walkForward.robustnessStatus).tone}>{prettifyRobustness(walkForward.robustnessStatus).label}</StatusChip>
            </div>
            {monteCarlo ? (
              <>
                <Sparkline values={monteCarloValues} tone={monteCarlo.medianReturnPct >= 0 ? "positive" : "negative"} />
                <div className="msw-stat-pairs">
                  <div><span>Median</span><strong>{formatPct(monteCarlo.medianReturnPct)}</strong></div>
                  <div><span>P10</span><strong>{formatPct(monteCarlo.p10ReturnPct)}</strong></div>
                  <div><span>P90</span><strong>{formatPct(monteCarlo.p90ReturnPct)}</strong></div>
                  <div><span>Median WR</span><strong>{formatPct(monteCarlo.medianWinratePct)}</strong></div>
                </div>
              </>
            ) : (
              <div className="msw-muted">Monte Carlo not available.</div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderParityCharts = (result: MonitoringStrategyTestResult) => {
    const validation = result.validation;
    if (!validation) {
      return <div className="msw-placeholder">No CSV reference available for this symbol.</div>;
    }
    const parityMeta = prettifyStatus(validation.parityStatus);
    const deltas = validation.metrics.map((metric) => safeNumber(metric.delta));
    return (
      <div className="msw-section-stack">
        <div className="msw-inline-grid">
          <div className="msw-mini-card">
            <span>Engine Trades</span>
            <strong>{validation.engineTradeCount}</strong>
            <small>Engine result</small>
          </div>
          <div className="msw-mini-card">
            <span>CSV Trades</span>
            <strong>{validation.csvTradeCount}</strong>
            <small>Reference only</small>
          </div>
          <div className="msw-mini-card">
            <span>Trade Delta</span>
            <strong>{formatMetricDelta("trade_count", validation.engineTradeCount - validation.csvTradeCount)}</strong>
            <small>{validation.tradeCountMatches ? "Aligned" : "Reference differs"}</small>
          </div>
          <div className="msw-mini-card">
            <span>Status</span>
            <strong>{parityMeta.label}</strong>
            <small>Reference comparison only</small>
          </div>
        </div>
        <div className="msw-validation-layout">
          <div className="msw-surface-card">
            <div className="msw-surface-head">
              <strong>Metric Delta</strong>
              <StatusChip tone={prettifyStatus(validation.parityStatus).tone}>{prettifyStatus(validation.parityStatus).label}</StatusChip>
            </div>
            <Sparkline values={deltas.length ? deltas : [0]} tone={validation.tradeCountMatches ? "positive" : "negative"} />
            <div className="msw-metric-list">
              {validation.metrics.map((metric) => (
                <div key={prettifyMetricName(metric.name)} className={`msw-metric-row ${metric.passed ? "pass" : "fail"}`}>
                  <span>{prettifyMetricName(metric.name)}</span>
                  <strong>{formatParityMetricValue(metric.name, metric.engineValue)} / {formatParityMetricValue(metric.name, metric.csvValue)}</strong>
                  <em>{formatMetricDelta(metric.name, metric.delta)}</em>
                </div>
              ))}
            </div>
          </div>
          <div className="msw-surface-card">
            <div className="msw-surface-head">
              <strong>First Mismatch</strong>
              <span>Root cause</span>
            </div>
            {validation.firstMismatch ? (
              <div className="msw-mismatch-card">
                <div><span>Trade</span><strong>#{validation.firstMismatch.tradeIndex}</strong></div>
                <div><span>Field</span><strong>{prettifyMismatchField(validation.firstMismatch.field)}</strong></div>
                <div><span>Engine</span><strong>{String(validation.firstMismatch.engineValue ?? "-")}</strong></div>
                <div><span>CSV</span><strong>{String(validation.firstMismatch.csvValue ?? "-")}</strong></div>
                <div className="full"><span>Likely cause</span><strong>{prettifyLikelyCause(validation.firstMismatch.likelyCause)}</strong></div>
              </div>
            ) : (
              <div className="msw-muted">No mismatch detected.</div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const testerBody = (() => {
    if (agriActiveKinds !== undefined && agriActiveKinds.length === 0) {
      return <div className="msw-placeholder">Keine Strategie aktiv — V, S oder M aktivieren.</div>;
    }
    if (!isFullKindCombination && !isSeasonalOnlyKind) {
      const activeLabel = agriActiveKinds!.map((k) => k[0].toUpperCase()).sort().join("+") || "—";
      const availLabel = (agriAvailableKinds ?? []).map((k) => k[0].toUpperCase()).sort().join("+");
      return (
        <div className="msw-placeholder">
          Keine validierte Tester-Serie für aktive Kombination ({activeLabel}).<br />
          Nur Vollbild {availLabel} oder S-only verfügbar.
        </div>
      );
    }
    if (!basketSelectedSymbols.length) {
      return <div className="msw-placeholder">Wähle ein oder mehrere Assets.</div>;
    }
    if (inputsState.phase !== "loaded" && !runningMode && !currentResult) {
      if (intradayEventsUrl) {
        return (
          <div className="msw-placeholder">
            <Loader2 size={14} className="spin" />
            Loading Backtesting...
          </div>
        );
      }
      return <div className="msw-placeholder">No strategy result loaded.</div>;
    }
    if (runningMode === mode) {
      return (
        <div className="msw-placeholder">
          <Loader2 size={14} className="spin" />
          Running {MODE_META[mode].label}...
        </div>
      );
    }
    if (currentBlocker) {
      return <div className="msw-error">{currentBlocker}</div>;
    }
    if (!currentResult) {
      return (
        <div className="msw-placeholder">
          <Loader2 size={14} className="spin" />
          Loading {MODE_META[mode].label}...
        </div>
      );
    }
    if (mode === "engine_simulation") return renderBacktestCharts(currentResult, displaySummary);
    if (mode === "live_signal") return renderLiveCharts(currentResult, displaySummary);
    if (mode === "walk_forward") return renderValidationCharts(currentResult);
    return renderParityCharts(currentResult);
  })();

  const tradeRows = useMemo(() => {
    if (mode === "walk_forward" && currentResult?.walkForward?.folds?.length) {
      return currentResult.walkForward.folds.slice(-8).map((fold, index) => ({
        key: `${fold.oosStart}_${index}`,
        left: `Fold ${index + 1}`,
        middle: `${formatDate(fold.oosStart)} to ${formatDate(fold.oosEnd)}`,
        right: formatMaybePct(safeNumber(fold.oosMetrics.netReturnPct)),
        positive: safeNumber(fold.oosMetrics.netReturnPct) >= 0,
      }));
    }
    return displayTrades.slice(-14).reverse().map((trade) => ({
      key: `${trade.tradeNo}_${trade.entryDate}`,
      left: `#${trade.tradeNo} ${trade.direction === "LONG" ? "L" : "S"}`,
      middle: `${formatDate(trade.entryDate)} to ${formatDate(trade.exitDate)}`,
      right: formatPct(trade.returnPct),
      positive: safeNumber(trade.returnPct) >= 0,
    }));
  }, [currentResult?.walkForward?.folds, displayTrades, mode]);

  const sidebarKpis = useMemo(() => {
    if (!displaySummary) return null;
    const isValidation = mode === "walk_forward";
    const winningTrades = displayTrades.filter((trade) => safeNumber(trade.returnPct, 0) > 0);
    const losingTrades = displayTrades.filter((trade) => safeNumber(trade.returnPct, 0) < 0);
    const avgWinPct = winningTrades.length
      ? winningTrades.reduce((sum, trade) => sum + safeNumber(trade.returnPct, 0), 0) / winningTrades.length
      : null;
    const avgLossPct = losingTrades.length
      ? losingTrades.reduce((sum, trade) => sum + safeNumber(trade.returnPct, 0), 0) / losingTrades.length
      : null;
    return {
      grossReturn: formatCardNumber(rawTradeSummary.grossReturnPct, "pct"),
      netReturn: formatCardNumber(displaySummary.netReturnPct, "pct"),
      costDrag: rawTradeSummary.grossReturnPct != null
        ? formatCardNumber(displaySummary.netReturnPct - rawTradeSummary.grossReturnPct, "pct")
        : "-",
      cagr: isValidation ? "-" : formatCardNumber(displaySummary.cagr, "pct"),
      winrate: formatCardNumber(displaySummary.winratePct, "pct"),
      profitFactor: formatCardNumber(displaySummary.profitFactor),
      calmar: formatCardNumber(displaySummary.calmar),
      tradeSharpe: isValidation ? "-" : formatCardNumber(rawTradeSummary.tradeSharpe),
      dailySharpe: isValidation ? "-" : formatCardNumber(rawTradeSummary.dailySharpe),
      maxDrawdown: formatCardNumber(-Math.abs(displaySummary.maxDrawdownPct), "pct"),
      avgTrade: isValidation ? "-" : formatCardNumber(displaySummary.avgTradePct, "pct"),
      expectancy: isValidation ? "-" : formatCardNumber(displaySummary.expectancyPct, "pct"),
      trades: formatCardNumber(displaySummary.totalTrades, "count"),
      longShort: isValidation ? "- / -" : `${displaySummary.longTrades} / ${displaySummary.shortTrades}`,
      winLoss: isValidation ? "- / -" : `${displaySummary.wins} / ${displaySummary.losses}`,
      stopExitRate: formatCardNumber(rawTradeSummary.stopExitRate, "pct"),
      tpExitRate: formatCardNumber(rawTradeSummary.tpExitRate, "pct"),
      commissionCost: formatCardNumber(rawTradeSummary.commissionCost),
      spreadCost: formatCardNumber(rawTradeSummary.spreadCost),
      slippageCost: formatCardNumber(rawTradeSummary.slippageCost),
      financingCost: formatCardNumber(rawTradeSummary.financingCost),
      avgWin: isValidation ? "-" : formatCardNumber(isMultiAssetSelection ? currentCombined?.metrics.avgWinPct : avgWinPct, "pct"),
      avgLoss: isValidation ? "-" : formatCardNumber(isMultiAssetSelection ? currentCombined?.metrics.avgLossPct : avgLossPct, "pct"),
      exposure: isValidation ? "-" : formatCardNumber(currentCombined?.metrics.exposurePct, "pct"),
      positiveYears: isValidation ? "-" : formatCardNumber(currentCombined?.metrics.positiveYears, "count"),
      startDate: isMultiAssetSelection ? (currentCombined?.metrics.startDate ?? "-") : backtestStartLabel,
      endDate: isMultiAssetSelection ? (currentCombined?.metrics.endDate ?? "-") : (currentResult?.dataBinding?.lastDate ?? "-"),
    };
  }, [backtestStartLabel, currentCombined?.metrics, currentResult?.dataBinding?.firstDate, currentResult?.dataBinding?.lastDate, currentResult, displaySummary, displayTrades, isMultiAssetSelection, mode, rawTradeSummary]);

  const kpiTones = useMemo(() => {
    if (!displaySummary) return null;
    const isValidation = mode === "walk_forward";
    return {
      grossReturn: rawTradeSummary.grossReturnPct != null && rawTradeSummary.grossReturnPct < 0,
      netReturn: displaySummary.netReturnPct < 0,
      cagr: !isValidation && displaySummary.cagr < 0,
      winrate: displaySummary.winratePct < 50,
      profitFactor: displaySummary.profitFactor < 1,
      calmar: displaySummary.calmar < 0,
      tradeSharpe: !isValidation && safeNumber(rawTradeSummary.tradeSharpe, 0) < 0,
      dailySharpe: !isValidation && safeNumber(rawTradeSummary.dailySharpe, 0) < 0,
      maxDrawdown: displaySummary.maxDrawdownPct > 0,
      avgTrade: !isValidation && displaySummary.avgTradePct < 0,
      expectancy: !isValidation && displaySummary.expectancyPct < 0,
    };
  }, [displaySummary, mode, rawTradeSummary.dailySharpe, rawTradeSummary.grossReturnPct, rawTradeSummary.tradeSharpe]);

  const strategyIdentityLabel = intradayEventsUrl
    ? (isMultiAssetSelection ? `Intraday · ${basketSelectedSymbols.length}` : focusedAssetLabel)
    : isMultiAssetSelection
      ? `Agri Basket · ${basketSelectedSymbols.length}`
      : focusedAssetLabel;
  const strategyDetailSummary = effectiveAgriAudit?.strategyConfig
    ? [
        effectiveAgriAudit.strategyConfig.variantId ? `Variant ${effectiveAgriAudit.strategyConfig.variantId}` : null,
        effectiveAgriAudit.strategyConfig.direction ? `Dir ${effectiveAgriAudit.strategyConfig.direction}` : null,
        currentResult?.dataMode ?? "PRODUCTION_LIVE",
        backtestStartLabel,
      ].filter(Boolean).join(" · ")
    : [currentResult?.dataMode ?? "PRODUCTION_LIVE", backtestStartLabel].join(" · ");
  const finalReference = !isMultiAssetSelection ? currentResult?.referenceKpis ?? null : null;
  const openTradeQuantity = useMemo(() => {
    if (isMultiAssetSelection) return null;
    const openTrade = (currentResult?.rawTrades ?? []).find((trade) => trade.exitTime == null);
    return openTrade?.quantity ?? null;
  }, [currentResult?.rawTrades, isMultiAssetSelection]);

  const dataHealthMeta = prettifyDataHealth(effectiveAgriAudit?.dataHealth.overallStatus);
  const liveReadinessMeta = prettifyLiveReadiness(effectiveAgriAudit?.liveReadiness.status);
  const parityMeta = effectiveAgriAudit ? {
    label: effectiveAgriAudit.parity.status,
    tone: effectiveAgriAudit.parity.status === "MATCH" ? "pass" : effectiveAgriAudit.parity.status === "CLOSE" ? "warn" : "fail",
  } satisfies { label: string; tone: ChipTone } : null;
  const impliedTimeframeFromSymbol = symbol
    ? (symbol.match(/\b(30M|15M|5M|1H|2H|4H|8H|12H)\b/i)?.[0]?.toUpperCase() ?? null)
    : null;

  return (
    <div className="msw-root" ref={rootRef}>
      <div className="msw-left-col" ref={leftColRef} style={{ flexBasis: `${layout.leftPanePct}%` }}>
        <div
          className="msw-main"
          style={{ height: `min(${layout.chartGridHeightPx}px, calc(100% - ${TESTER_MIN_HEIGHT_PX}px))` }}
        >
          {topContent}
        </div>
        <div
          className="msw-resize-handle msw-resize-h"
          onPointerDown={handleHDown}
          onPointerMove={handleHMove}
          onPointerUp={handleHUp}
          onPointerCancel={handleHUp}
        />
      <section className="msw-tester">
        <div className="msw-head">
          <div className="msw-head-compact-row">
            <div className="msw-head-title-block">
              <div className="msw-head-title">Strategie Tester</div>
            </div>
            <div className="msw-head-controls">
              <div className="msw-selection-cluster" aria-label="Asset Auswahl">
                <div className="msw-asset-stack">
                  {basketSelectedSymbols.map((selectedSymbol, idx) => {
                    const assetMeta = availableAssets.find((asset) => asset.symbol === selectedSymbol);
                    const assetIconUrl = getMonitoringAssetIconUrl({ code: selectedSymbol, name: assetMeta?.name ?? null });
                    return (
                      <button
                        key={selectedSymbol}
                        type="button"
                        className={`msw-asset-thumb ${selectedSymbol === symbol ? "is-focused" : ""}`}
                        style={{ zIndex: Math.max(1, 20 - idx) }}
                        title={assetMeta?.name ? `${selectedSymbol} - ${assetMeta.name}` : selectedSymbol}
                        onClick={() => handleHeaderAssetClick(selectedSymbol)}
                      >
                        {assetIconUrl ? (
                          <img
                            src={assetIconUrl}
                            alt=""
                            className="msw-asset-thumb-icon"
                            loading="lazy"
                            decoding="async"
                            draggable={false}
                          />
                        ) : (
                          <span className="msw-asset-thumb-fallback" aria-hidden="true">
                            {selectedSymbol.slice(0, 2)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                  {basketSelectedSymbols.length === 0 ? <span className="msw-muted-sm">—</span> : null}
                </div>
                <button
                  type="button"
                  className="msw-plus-toggle"
                  title="Alle 4 Strategien laden"
                  onClick={() => {
                    const all = (availableAssets ?? []).map((a) => a.symbol);
                    if (all.length) onSelectedSymbolsChange?.(all);
                  }}
                >
                  +
                </button>
              </div>
              <div className="msw-head-sep-v" />
              <label className="msw-head-pill">
                <span>Modus</span>
                <select className="msw-head-select" value={mode} onChange={(event) => setMode(event.target.value as StrategyMode)}>
                  {(Object.keys(MODE_META) as StrategyMode[]).map((item) => (
                    <option key={item} value={item}>{MODE_META[item].label}</option>
                  ))}
                </select>
              </label>
              <label className="msw-head-pill">
                <span>Zeitraum</span>
                <select className="msw-head-select" value={historyMode} onChange={(event) => setHistoryMode(event.target.value as MonitoringStrategyHistoryMode)}>
                  {(["default_2000", "full"] as MonitoringStrategyHistoryMode[]).map((item) => (
                    <option key={item} value={item}>{HISTORY_MODE_COMPACT_LABELS[item]}</option>
                  ))}
                </select>
              </label>
              <label className="msw-head-pill">
                <span>Sleeve</span>
                <select className="msw-head-select" value={selectedSleeve} onChange={(event) => setSelectedSleeve(event.target.value)}>
                  <option value="all">Alle</option>
                  {sleeveOptions.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label className="msw-head-pill">
                <span>Asset</span>
                <select className="msw-head-select" value={selectedAssetFilter} onChange={(event) => setSelectedAssetFilter(event.target.value)}>
                  <option value="all">Alle</option>
                  {assetFilterOptions.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label className="msw-head-pill">
                <span>Typ</span>
                <select className="msw-head-select" value={selectedStrategyType} onChange={(event) => setSelectedStrategyType(event.target.value as RegistryStrategyType | "all")}>
                  <option value="all">Alle</option>
                  {strategyTypeOptions.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label className="msw-head-pill">
                <span>Portfolio</span>
                <select className="msw-head-select" value={portfolioModeFilter} onChange={(event) => setPortfolioModeFilter(event.target.value as "single" | "sleeve_portfolio" | "global_portfolio")}>
                  <option value="single">Einzelstrategie</option>
                  <option value="sleeve_portfolio">Sleeve Portfolio</option>
                  <option value="global_portfolio">Gesamtportfolio</option>
                </select>
              </label>
            </div>
          </div>
          {false ? (
            <div className="msw-head-hint">
              Multi-Select aktiv. Charts oben anklicken, Klick außerhalb des Grid beendet den Modus.
            </div>
          ) : null}
        </div>
        <div className="msw-body">{testerBody}</div>
      </section>
      </div>

      <div
        className="msw-resize-handle msw-resize-v"
        onPointerDown={handleV1Down}
        onPointerMove={handleV1Move}
        onPointerUp={handleV1Up}
        onPointerCancel={handleV1Up}
      />
      <aside className="msw-side msw-side--stats" style={{ width: layout.middlePanePx }}>
          <div className="msw-side-head">
            <div className="msw-identity">
              <span className="msw-eyebrow">Strategie</span>
              <strong>{strategyIdentityLabel}</strong>
              {basketSelectedSymbols.length > 1 ? (
                <div className="msw-side-icons" aria-hidden="true">
                  {basketSelectedSymbols.map((selectedSymbol) => (
                    <span key={selectedSymbol} className="msw-side-icon-chip">{selectedSymbol.replace("!", "")}</span>
                  ))}
                </div>
              ) : null}
              {effectiveAgriAudit ? (
                <div className="msw-mode-row">
                  <StatusChip tone={dataHealthMeta.tone}>{dataHealthMeta.label}</StatusChip>
                  <StatusChip tone={liveReadinessMeta.tone}>{liveReadinessMeta.label}</StatusChip>
                  {parityMeta ? <StatusChip tone={parityMeta.tone}>{parityMeta.label}</StatusChip> : null}
                  {effectiveAgriAudit?.strategyConfig?.registrySource?.includes("_v2") ? <StatusChip tone="pass">V2</StatusChip> : null}
                  {effectiveAgriAudit?.strategyConfig?.hints?.includes("REOPTIMIZED") ? <StatusChip tone="pass">REOPTIMIZED</StatusChip> : null}
                  {effectiveAgriAudit?.strategyConfig?.hints?.includes("SATELLITE_WEAK") ? <StatusChip tone="warn">SATELLITE_WEAK</StatusChip> : null}
                </div>
              ) : null}
          </div>
        </div>

        {displaySummary ? (
          <div className="msw-side-scroll">
            {effectiveAgriAudit ? (
              <div className="msw-surface-card">
                <div className="msw-surface-head">
                  <strong>Details</strong>
                  <button type="button" className="msw-mode msw-mode--micro" onClick={() => setShowStrategyDetails((current) => !current)}>
                    {showStrategyDetails ? "Hide" : "Show"}
                  </button>
                </div>
                <div className="msw-section-stack">
                  {showStrategyDetails ? (
                    <div className="msw-muted">
                      <div>Strategy: {finalReference?.strategyName ?? "Invoria Agri Macro Frozen"}</div>
                      <div>Status: {finalReference?.strategyStatus ?? "ACTIVE"}</div>
                      <div>Summary: {strategyDetailSummary}</div>
                      <div>Registry: {effectiveAgriAudit.strategyConfig.registrySource.split("/").pop() ?? "agri_strategy_configs_final.json"}</div>
                      <div>Variants: {effectiveAgriAudit.strategyConfig.variantsSource.split("/").pop() ?? "agri_final_selected_variants.json"}</div>
                      <div>Direction: {effectiveAgriAudit.strategyConfig.direction ?? "-"}</div>
                      <div>Comparisons: {effectiveAgriAudit.strategyConfig.comparisonSymbols.join(", ") || "-"}</div>
                      <div>Data mode: {currentResult?.dataMode ?? "PRODUCTION_LIVE"}</div>
                      <div>Backtest start: {backtestStartLabel}</div>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="msw-kpi-grid">
              <div className="msw-kpi-card"><span>Gross Return</span><strong className={kpiTones?.grossReturn ? "is-negative" : ""}>{sidebarKpis?.grossReturn ?? "-"}</strong></div>
              <div className="msw-kpi-card"><span>Net Return</span><strong className={kpiTones?.netReturn ? "is-negative" : ""}>{sidebarKpis?.netReturn ?? "-"}</strong></div>
              <div className="msw-kpi-card"><span>Cost Drag</span><strong className="is-negative">{sidebarKpis?.costDrag ?? "-"}</strong></div>
              <div className="msw-kpi-card"><span>CAGR</span><strong className={kpiTones?.cagr ? "is-negative" : ""}>{sidebarKpis?.cagr ?? "-"}</strong></div>
              <div className="msw-kpi-card"><span>Winrate</span><strong className={kpiTones?.winrate ? "is-negative" : ""}>{sidebarKpis?.winrate ?? "-"}</strong></div>
              <div className="msw-kpi-card"><span>Profit Factor</span><strong className={kpiTones?.profitFactor ? "is-negative" : ""}>{sidebarKpis?.profitFactor ?? "-"}</strong></div>
              <div className="msw-kpi-card"><span>Calmar</span><strong className={kpiTones?.calmar ? "is-negative" : ""}>{sidebarKpis?.calmar ?? "-"}</strong></div>
              <div className="msw-kpi-card"><span>Trade Sharpe</span><strong className={kpiTones?.tradeSharpe ? "is-negative" : ""}>{sidebarKpis?.tradeSharpe ?? "-"}</strong></div>
              <div className="msw-kpi-card"><span>Daily Sharpe</span><strong className={kpiTones?.dailySharpe ? "is-negative" : ""}>{sidebarKpis?.dailySharpe ?? "-"}</strong></div>
              <div className="msw-kpi-card"><span>Max DD</span><strong className={kpiTones?.maxDrawdown ? "is-negative" : ""}>{sidebarKpis?.maxDrawdown ?? "-"}</strong></div>
              <div className="msw-kpi-card"><span>Avg Trade</span><strong className={kpiTones?.avgTrade ? "is-negative" : ""}>{sidebarKpis?.avgTrade ?? "-"}</strong></div>
              <div className="msw-kpi-card"><span>Expectancy</span><strong className={kpiTones?.expectancy ? "is-negative" : ""}>{sidebarKpis?.expectancy ?? "-"}</strong></div>
              <div className="msw-kpi-card"><span>Trades</span><strong>{sidebarKpis?.trades ?? "-"}</strong></div>
              <div className="msw-kpi-card"><span>Long / Short</span><strong>{sidebarKpis?.longShort ?? "- / -"}</strong></div>
              <div className="msw-kpi-card"><span>Win / Loss</span><strong>{sidebarKpis?.winLoss ?? "- / -"}</strong></div>
              <div className="msw-kpi-card"><span>Stop Exit Rate</span><strong>{sidebarKpis?.stopExitRate ?? "-"}</strong></div>
              <div className="msw-kpi-card"><span>TP Exit Rate</span><strong>{sidebarKpis?.tpExitRate ?? "-"}</strong></div>
              <div className="msw-kpi-card"><span>Commission Cost</span><strong>{sidebarKpis?.commissionCost ?? "-"}</strong></div>
              <div className="msw-kpi-card"><span>Spread Cost</span><strong>{sidebarKpis?.spreadCost ?? "-"}</strong></div>
              <div className="msw-kpi-card"><span>Slippage Cost</span><strong>{sidebarKpis?.slippageCost ?? "-"}</strong></div>
              <div className="msw-kpi-card"><span>Financing Cost</span><strong>{sidebarKpis?.financingCost ?? "-"}</strong></div>
              <div className="msw-kpi-card"><span>Avg Win</span><strong>{sidebarKpis?.avgWin ?? "-"}</strong></div>
              <div className="msw-kpi-card"><span>Avg Loss</span><strong>{sidebarKpis?.avgLoss ?? "-"}</strong></div>
              <div className="msw-kpi-card"><span>Exposure</span><strong>{sidebarKpis?.exposure ?? "-"}</strong></div>
              <div className="msw-kpi-card"><span>Positive Years</span><strong>{sidebarKpis?.positiveYears ?? "-"}</strong></div>
              <div className="msw-kpi-card"><span>Start</span><strong>{sidebarKpis?.startDate ?? "-"}</strong></div>
              <div className="msw-kpi-card"><span>End</span><strong>{sidebarKpis?.endDate ?? "-"}</strong></div>
            </div>

            {isMultiAssetSelection ? (
              <div className="msw-surface-card">
                <div className="msw-surface-head">
                  <strong>Aggregation Mode</strong>
                  <span>Equal-weight sleeves</span>
                </div>
                <div className="msw-stat-pairs">
                  <div><span>Method</span><strong>Equal-weight 1/N sleeves</strong></div>
                  <div><span>KPI basis</span><strong>Trade-based (not daily)</strong></div>
                  <div><span>Returns</span><strong>Net after commission + spread</strong></div>
                  <div><span>Cost model</span><strong>spreadTicks=1.0 · commissionPct=0.01%</strong></div>
                </div>
                <div className="msw-muted">Reference Python uses spreadTicks=0 (no spread cost). Reference &quot;net&quot; ~= Invoria gross minus commission only. Cost Drag shown above = gross-net including spread.</div>
              </div>
            ) : null}

            {portfolioDelta && !currentResponse?.referenceComparison ? (
              <div className="msw-surface-card">
                <div className="msw-surface-head">
                  <strong>All-8 Delta</strong>
                  <span>Data provenance delta</span>
                </div>
                <div className="msw-stat-pairs">
                  <div><span>Invoria Trades</span><strong>{formatCardNumber(portfolioDelta.invoria.trades, "count")}</strong></div>
                  <div><span>Python Ref</span><strong>{formatCardNumber(portfolioDelta.reference.trades, "count")}</strong></div>
                  <div><span>Trade Delta</span><strong>{prettifyPortfolioDelta(portfolioDelta.delta.trades, "count")}</strong></div>
                  <div><span>Return Delta</span><strong>{prettifyPortfolioDelta(portfolioDelta.delta.returnPct, "pct")}</strong></div>
                </div>
                <div className="msw-muted">{portfolioDelta.note}</div>
              </div>
            ) : null}

            {currentResponse?.referenceComparison ? (
              <div className="msw-surface-card">
                <div className="msw-surface-head">
                  <strong>Reference Comparison</strong>
                  <span>{currentResponse.referenceComparison.referenceName}</span>
                </div>
                <div className="msw-stat-pairs">
                  <div><span>Ref Start</span><strong>{currentResponse.referenceComparison.startDate ?? backtestStartLabel}</strong></div>
                  <div><span>Data Window</span><strong>{backtestStartLabel} to now</strong></div>
                  <div><span>Ref Trades</span><strong>{formatCardNumber(currentResponse.referenceComparison.referenceTrades, "count")}</strong></div>
                  <div><span>Engine Trades</span><strong>{formatCardNumber(currentCombined?.metrics.totalTrades, "count")}</strong></div>
                  <div><span>Ref Return</span><strong>{formatCardNumber(currentResponse.referenceComparison.referenceReturnPct, "pct")}</strong></div>
                  <div><span>Engine Return</span><strong>{formatCardNumber(currentCombined?.metrics.netReturnPct, "pct")}</strong></div>
                  <div><span>Trade Delta</span><strong>{prettifyPortfolioDelta(currentResponse.referenceComparison.tradeDelta, "count")}</strong></div>
                  <div><span>Return Delta</span><strong>{prettifyPortfolioDelta(currentResponse.referenceComparison.returnDelta, "pct")}</strong></div>
                </div>
                {currentResponse.referenceComparison.provenanceDelta ? (
                  <div className="msw-muted">{currentResponse.referenceComparison.provenanceDelta}</div>
                ) : null}
              </div>
            ) : null}

            {!isMultiAssetSelection && finalReference ? (() => {
              const ref = finalReference;
              const engTrades = displaySummary?.totalTrades ?? null;
              const engReturn = displaySummary?.netReturnPct ?? null;
              const engMaxDD = displaySummary?.maxDrawdownPct ?? null;
              const engSharpe = safeNumber(rawTradeSummary.tradeSharpe, 0);
              const tradeDelta = engTrades != null ? engTrades - ref.trades : null;
              const returnDelta = engReturn != null ? engReturn - ref.returnPct : null;
              const ddDelta = engMaxDD != null ? engMaxDD - Math.abs(ref.maxDdPct) : null;
              const sharpeDelta = engSharpe != null ? engSharpe - ref.sharpe : null;
              const fmtDelta = (v: number | null, suffix = "%") => v == null ? "-" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}${suffix}`;
              const returnAbsDiff = returnDelta != null ? Math.abs(returnDelta) : 999;
              const activeDataMode = currentResult?.dataMode ?? "PRODUCTION_LIVE";
              const badge = returnAbsDiff < 5 ? "MATCH" : returnAbsDiff < 15 ? "CLOSE" : activeDataMode === "REFERENCE_PARITY" ? "REFERENCE_PARITY" : "DATA_VERSION_DELTA";
              const badgeTone = badge === "MATCH" ? "msw-chip-pass" : badge === "CLOSE" ? "msw-chip-warn" : badge === "REFERENCE_PARITY" ? "msw-chip-pass" : "msw-chip-fail";
              const dataModeNote = activeDataMode === "REFERENCE_PARITY"
                ? "Data mode: REFERENCE_PARITY - engine uses downloaded reference CSV files (ICEUS_DLY_DXY, NYMEX_DL_CL1). Residual gaps are post-2006 feed price differences."
                : "Data mode: PRODUCTION_LIVE - engine uses TVC_DXY_D.json (from 2006) and NYMEX_CL1_D.json (from 2006). Reference used ICEUS_DLY_DXY and NYMEX_DL_CL1 with full history (1973+/1983+). Missing pre-2006 comparison data causes most of the gap for SB1/CT1/OJ1. Download reference CSVs -> see AGRI_MISSING_REFERENCE_DATA_DOWNLOAD_LIST.md";
              return (
                <div className="msw-surface-card">
                  <div className="msw-surface-head">
                    <strong>Final Frozen Result</strong>
                    <span className={`msw-chip ${badgeTone}`}>{badge}</span>
                    <span className={`msw-chip ${activeDataMode === "REFERENCE_PARITY" ? "msw-chip-pass" : "msw-chip-base"}`} style={{fontSize:"0.7rem"}}>{activeDataMode}</span>
                  </div>
                  <div className="msw-stat-pairs">
                    <div><span>Asset / Symbol</span><strong>{currentResult?.symbol ?? symbol ?? "-"}</strong></div>
                    <div><span>Strategie</span><strong>{ref.strategyName ?? "Invoria Agri Macro Frozen"}</strong></div>
                    <div><span>Status</span><strong>{ref.strategyStatus ?? "ACTIVE"}</strong></div>
                    <div><span>Zeitraum</span><strong>{ref.start}{" -> "}{ref.end}</strong></div>
                    <div><span>Trades</span><strong>{ref.trades}</strong></div>
                    <div><span>Winrate</span><strong>{ref.winPct.toFixed(2)}%</strong></div>
                    <div><span>Profit Factor</span><strong>{ref.pf.toFixed(3)}</strong></div>
                    <div><span>Avg R</span><strong>{ref.avgR != null ? ref.avgR.toFixed(3) : "pending / not available"}</strong></div>
                    <div><span>CAGR</span><strong>{ref.cagrPct.toFixed(2)}%</strong></div>
                    <div><span>Max Drawdown</span><strong>{ref.maxDdPct.toFixed(2)}%</strong></div>
                    <div><span>Sharpe</span><strong>{ref.sharpe.toFixed(4)}</strong></div>
                    <div><span>Sortino</span><strong>{ref.sortino != null ? ref.sortino.toFixed(4) : "pending / not available"}</strong></div>
                    <div><span>Calmar</span><strong>{ref.cagrPct != null && ref.maxDdPct != null ? formatCardNumber(ref.cagrPct / Math.max(ref.maxDdPct, 0.0001)) : "-"}</strong></div>
                    <div><span>OOS Sharpe</span><strong>{ref.oosSharpe != null ? ref.oosSharpe.toFixed(4) : "pending / not available"}</strong></div>
                    <div><span>OOS p-Wert</span><strong>{ref.oosPValue != null ? ref.oosPValue.toFixed(4) : "pending / not available"}</strong></div>
                    <div><span>Engine Trades</span><strong>{engTrades ?? "-"}</strong></div>
                    <div><span>Trade Delta</span><strong>{tradeDelta != null ? fmtDelta(tradeDelta, "") : "-"}</strong></div>
                    <div><span>Engine Net Return</span><strong>{engReturn != null ? `${engReturn.toFixed(2)}%` : "-"}</strong></div>
                    <div><span>Return Delta</span><strong>{fmtDelta(returnDelta)}</strong></div>
                    <div><span>Engine MaxDD</span><strong>{engMaxDD != null ? `-${engMaxDD.toFixed(2)}%` : "-"}</strong></div>
                    <div><span>MaxDD Delta</span><strong>{fmtDelta(ddDelta)}</strong></div>
                    <div><span>Engine Sharpe</span><strong>{engSharpe.toFixed(4)}</strong></div>
                    <div><span>Sharpe Delta</span><strong>{fmtDelta(sharpeDelta, "")}</strong></div>
                  </div>
                  <div className="msw-muted">Ref: net after commission ({ref.commissionPct}%) + spread ({ref.spreadTicks} tick). Engine: spreadTicks=1.0, commissionPct=0.01%. Initial capital ref: ${(ref.initialCapital / 1e6).toFixed(0)}M · engine: $1M (same return% - sizing is capital-invariant). {dataModeNote}</div>
                </div>
              );
            })() : null}

            {!isMultiAssetSelection && currentResult ? (
              <div className="msw-surface-card">
                <div className="msw-surface-head">
                  <strong>Data Sources</strong>
                  <span>{currentResult.dataMode ?? "PRODUCTION_LIVE"}</span>
                </div>
                <div className="msw-stat-pairs">
                  <div className="full">
                    <span>Asset OHLC</span>
                    <strong>{currentResult.dataBinding?.validatedOhlcCsvPath ?? "-"}</strong>
                    <small>{currentResult.dataBinding?.firstDate ?? "-"}{" -> "}{currentResult.dataBinding?.lastDate ?? "-"} · {currentResult.dataBinding?.rowCount ?? "-"} rows</small>
                  </div>
                  {requestedDataSources.map((entry) => (
                    <div key={`${entry.symbol}_${entry.path}`}>
                      <span>{entry.symbol}</span>
                      <strong>{entry.mode}</strong>
                      <small>{entry.path}</small>
                      <small>{entry.startDate ?? "-"}{" -> "}{entry.endDate ?? "-"} · {entry.rowCount ?? "-"} rows</small>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {isMultiAssetSelection ? (
              <div className="msw-surface-card">
                <div className="msw-surface-head">
                  <strong>Per-Asset Breakdown</strong>
                  <span>{perAssetBreakdown.length} assets</span>
                </div>
                <div className="msw-detail-table-wrap">
                  <table className="msw-detail-table">
                    <thead>
                      <tr>
                        <th>Asset</th>
                        <th>Trades</th>
                        <th>Return</th>
                        <th>MaxDD</th>
                        <th>PF</th>
                        <th>Winrate</th>
                        <th>Sharpe</th>
                        <th>Health</th>
                        <th>Readiness</th>
                      </tr>
                    </thead>
                    <tbody>
                      {perAssetBreakdown.map((row) => (
                        <tr key={row.symbol}>
                          <td>{row.symbol}</td>
                          <td>{formatCardNumber(row.trades, "count")}</td>
                          <td>{formatCardNumber(row.returnPct, "pct")}</td>
                          <td>{formatCardNumber(row.maxDrawdownPct != null ? -Math.abs(row.maxDrawdownPct) : null, "pct")}</td>
                          <td>{formatCardNumber(row.profitFactor)}</td>
                          <td>{formatCardNumber(row.winratePct, "pct")}</td>
                          <td>{formatCardNumber(row.tradeSharpe)}</td>
                          <td>{prettifyDataHealth(row.dataHealth).label}</td>
                          <td>{prettifyLiveReadiness(row.liveReadiness).label}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {currentResult?.liveSignal ? (
              <div className="msw-surface-card">
                <div className="msw-surface-head">
                  <strong>Live State</strong>
                  <span>{formatDate(currentResult.liveSignal.basedOnLatestBarTime)}</span>
                </div>
                <div className="msw-stat-pairs">
                  <div><span>Signal</span><strong>{currentResult.liveSignal.signal === "NONE" ? "FLAT" : currentResult.liveSignal.signal}</strong></div>
                  <div><span>Entry</span><strong>{currentResult.liveSignal.entryPrice != null ? formatSigned(currentResult.liveSignal.entryPrice) : "-"}</strong></div>
                  <div><span>Stop</span><strong>{currentResult.liveSignal.stopLoss != null ? formatSigned(currentResult.liveSignal.stopLoss) : "-"}</strong></div>
                  <div><span>TP</span><strong>{currentResult.liveSignal.takeProfit != null ? formatSigned(currentResult.liveSignal.takeProfit) : "-"}</strong></div>
                  <div><span>Qty</span><strong>{openTradeQuantity != null ? formatCardNumber(openTradeQuantity) : "pending / not available"}</strong></div>
                  <div><span>Last Signal</span><strong>{formatDate(currentResult.liveSignal.timestamp ?? currentResult.liveSignal.basedOnLatestBarTime)}</strong></div>
                </div>
                {effectiveAgriAudit?.liveReadiness.blockers?.length ? (
                  <div className="msw-warning-list">
                    {effectiveAgriAudit.liveReadiness.blockers.slice(0, 3).map((warning) => <div key={warning}>{warning}</div>)}
                  </div>
                ) : null}
              </div>
            ) : null}

            {autoUpdate ? (
              <div className="msw-surface-card">
                <div className="msw-surface-head">
                  <strong>Refresh Health</strong>
                  <StatusChip tone={autoUpdate.refreshLoopActive ? "pass" : "warn"}>{autoUpdate.refreshLoopActive ? "Loop active" : "Loop idle"}</StatusChip>
                </div>
                <div className="msw-stat-pairs">
                  <div><span>Last Refresh</span><strong>{formatDate(autoUpdate.lastRefreshAt)}</strong></div>
                  <div><span>Lock</span><strong>{autoUpdate.lockStatus}</strong></div>
                  <div><span>Success / Fail</span><strong>{formatCardNumber(autoUpdate.successfulSymbols, "count")} / {formatCardNumber(autoUpdate.failedSymbols, "count")}</strong></div>
                  <div><span>Provisional</span><strong>{formatCardNumber(autoUpdate.provisionalAssets, "count")}</strong></div>
                </div>
                {autoUpdate.lastError ? <div className="msw-muted">Last error: {autoUpdate.lastError}</div> : null}
              </div>
            ) : null}

            <div className="msw-surface-card">
              <div className="msw-surface-head">
                <strong>{mode === "walk_forward" ? "Validation Rows" : detailedTradeRows.length ? "Trade Table" : "Trades"}</strong>
                <span>{detailedTradeRows.length || tradeRows.length} rows</span>
              </div>
              {mode !== "walk_forward" && detailedTradeRows.length ? (
                <div className="msw-detail-table-wrap">
                  <table className="msw-detail-table">
                    <thead>
                      <tr>
                        {isMultiAssetSelection ? <th>Asset</th> : null}
                        <th>Dir</th>
                        <th>Entry</th>
                        <th>Exit</th>
                        <th>SL</th>
                        <th>TP</th>
                        <th>Reason</th>
                        <th>Qty</th>
                        <th>Gross</th>
                        <th>Net</th>
                        {isMultiAssetSelection ? <th>R</th> : null}
                        {isMultiAssetSelection ? <th>Hold</th> : null}
                        {isMultiAssetSelection ? <th>Valuation</th> : null}
                        {isMultiAssetSelection ? <th>EMA</th> : null}
                        {isMultiAssetSelection ? <th>Regime</th> : null}
                        {isMultiAssetSelection ? <th>S&amp;D</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {detailedTradeRows.map((row) => (
                        <tr key={row.key}>
                          {isMultiAssetSelection ? <td>{row.symbol}</td> : null}
                          <td>{row.direction}</td>
                          <td>{row.entryDate} · {formatMaybeNumber(row.entryPrice)}</td>
                          <td>{row.exitDate} · {formatMaybeNumber(row.exitPrice)}</td>
                          <td>{formatMaybeNumber(row.stopLoss)}</td>
                          <td>{formatMaybeNumber(row.takeProfit)}</td>
                          <td>{row.exitReason}</td>
                          <td>{formatMaybeNumber(row.quantity, 2)}</td>
                          <td>{formatMaybeNumber(row.grossPnl)}</td>
                          <td>{formatMaybeNumber(row.netPnl)}</td>
                          {isMultiAssetSelection ? <td>{formatMaybeNumber(row.rMultiple, 2)}</td> : null}
                          {isMultiAssetSelection ? <td>{formatMaybeNumber(row.holdingBars, 0)}</td> : null}
                          {isMultiAssetSelection ? <td>-</td> : null}
                          {isMultiAssetSelection ? <td>-</td> : null}
                          {isMultiAssetSelection ? <td>-</td> : null}
                          {isMultiAssetSelection ? <td>-</td> : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : tradeRows.length ? (
                <div className="msw-trade-list">
                  {tradeRows.map((row) => (
                    <div key={row.key} className="msw-trade-row">
                      <span>{row.left}</span>
                      <span>{row.middle}</span>
                      <strong className={row.positive ? "is-pos" : "is-neg"}>{row.right}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="msw-muted">No rows available.</div>
              )}
            </div>

            {currentResult?.warnings?.length ? (
              <div className="msw-surface-card">
                <div className="msw-surface-head">
                  <strong>Warnings</strong>
                  <span>{currentResult.warnings.length}</span>
                </div>
                <div className="msw-warning-list">
                  {currentResult.warnings.slice(0, 6).map((warning) => <div key={warning}>{warning}</div>)}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="msw-placeholder">No strategy result loaded.</div>
        )}
      </aside>

      {!paramsCollapsed ? (
        <div
          className="msw-resize-handle msw-resize-v"
          onPointerDown={handleV2Down}
          onPointerMove={handleV2Move}
          onPointerUp={handleV2Up}
          onPointerCancel={handleV2Up}
        />
      ) : null}
      <aside className={`msw-side msw-side--inputs ${paramsCollapsed ? "msw-side--collapsed" : ""}`}>
          {paramsCollapsed ? (
            <button
              type="button"
              className="msw-params-toggle msw-params-toggle--rail"
              onClick={toggleParamsCollapsed}
              title="Show Strategy Parameters"
              aria-label="Show Strategy Parameters"
            >
              <span className="msw-params-toggle-label">Parameters</span>
            </button>
          ) : null}
          <div className="msw-side-head">
            <div className="msw-identity">
              <span className="msw-eyebrow">{intradayEventsUrl ? "Strategy" : "Inputs"}</span>
              <strong>
                {intradayEventsUrl ? "Parameters" : "Parameters"}
                {!intradayEventsUrl && runningMode === mode ? <Loader2 size={11} className="spin msw-auto-indicator" aria-label="Recalculating" /> : null}
                {!intradayEventsUrl && inputsState.phase === "loaded" ? <XlsxStatusDot availability={inputsState.inputAvailability} /> : null}
              </strong>
              <small>{symbol ?? "-"} / {impliedTimeframeFromSymbol ?? (intradayEventsUrl ? (adapterLabel ? "D" : "Intraday") : "D")}</small>
          </div>
          <div className="msw-side-head-actions">
            <button type="button" className="msw-params-toggle" onClick={toggleParamsCollapsed} title="Collapse parameters" aria-label="Collapse parameters">⟩</button>
            <button type="button" className="msw-layout-reset-btn" onClick={resetLayout} title="Reset layout to default">Reset layout</button>
          </div>
        </div>

        <div className="msw-side-scroll">
          {intradayEventsUrl ? (() => {
            const intradayMeta = (currentResponse as Record<string, unknown> | null)?.intradayMeta as {
              strategyName?: string | null;
              tvSymbol?: string | null;
              timeframe?: string | null;
              source?: string | null;
              engineVersion?: string | null;
              engineParity?: number | null;
              engineStatus?: string | null;
              engineStartDate?: string | null;
              macroFiltersDisabled?: string[];
              tradeCounts?: { csvHistorical?: number; engineRecent?: number; total?: number } | null;
              dateRange?: { first?: string; last?: string } | null;
              generatedAt?: string | null;
            } | undefined;
            const cfg = symbol ? INTRADAY_STRATEGY_CONFIG[symbol] : null;
            const na = "missing in config";
            // Runtime engine metadata comes from the events JSON, not the strategy
            // config — a blank there is "not reported", not a config gap.
            const metaNa = "—";
            return (
              <div className="msw-surface-card">
                <div className="msw-surface-head">
                  <strong>{cfg?.panelTitle ?? (adapterLabel ? `${adapterLabel} Config` : "Intraday Strategy Config")}</strong>
                  <span className="msw-chip msw-chip-base">ENGINE</span>
                </div>
                <div className="msw-stat-pairs">
                  <div><span>Strategy</span><strong>{intradayMeta?.strategyName ?? metaNa}</strong></div>
                  <div><span>Symbol</span><strong>{intradayMeta?.tvSymbol ?? symbol ?? metaNa}</strong></div>
                  <div><span>Timeframe</span><strong>{intradayMeta?.timeframe ?? metaNa}</strong></div>
                  {cfg?.sessionRules ? <div><span>Session</span><strong>{cfg.sessionRules}</strong></div> : null}
                  {cfg?.direction ? <div><span>Direction</span><strong>{cfg.direction}</strong></div> : null}
                  {cfg?.entryRules ? <div><span>Entry Rules</span><strong>{cfg.entryRules}</strong></div> : null}
                  {cfg?.exitRules ? <div><span>Exit Rules</span><strong>{cfg.exitRules}</strong></div> : null}
                  {cfg?.slTp ? <div><span>SL / TP</span><strong>{cfg.slTp}</strong></div> : null}
                  {cfg?.breakEven ? <div><span>Break Even</span><strong>{cfg.breakEven}</strong></div> : null}
                  {cfg?.regimeFilter ? <div><span>Regime Filter</span><strong>{cfg.regimeFilter}</strong></div> : null}
                  <div><span>Engine Status</span><strong>{intradayMeta?.engineStatus ?? metaNa}</strong></div>
                  <div><span>Engine Parity</span><strong>{intradayMeta?.engineParity != null ? `${intradayMeta.engineParity}%` : metaNa}</strong></div>
                  {intradayMeta?.dateRange ? (
                    <div><span>Date Range</span><strong>{intradayMeta.dateRange.first ?? "?"} → {intradayMeta.dateRange.last ?? "?"}</strong></div>
                  ) : null}
                  {intradayMeta?.tradeCounts ? (
                    <div><span>Trades</span><strong>{intradayMeta.tradeCounts.total ?? 0}</strong></div>
                  ) : null}
                  <div><span>Tester</span><strong>{
                    currentResult
                      ? currentResult.metrics.totalTrades < 20
                        ? "PARTIAL"
                        : "PASS"
                      : currentBlocker ? "BLOCKED" : "IDLE"
                  }</strong></div>
                </div>
                {intradayMeta?.macroFiltersDisabled?.length === 0 ? (
                  <div className="msw-muted">Macro filters active — no filters disabled.</div>
                ) : intradayMeta?.macroFiltersDisabled?.length ? (
                  <div className="msw-muted">Disabled filters: {intradayMeta.macroFiltersDisabled.join(", ")}</div>
                ) : null}
              </div>
            );
          })() : null}
          {!intradayEventsUrl && inputsState.phase === "loading" ? (
            <div className="msw-placeholder"><Loader2 size={14} className="spin" /> Loading inputs...</div>
          ) : null}
          {!intradayEventsUrl && inputsState.phase === "error" ? (
            <div className="msw-error">{inputsState.message}</div>
          ) : null}
          {!intradayEventsUrl && inputsState.phase === "loaded" ? (
            <>
              <div className="msw-input-groups">
                {inputSections.map((section) => {
                  const isOpen = openSections.has(section.key);
                  return (
                    <div key={section.key} className="msw-input-group">
                      <button
                        type="button"
                        className={`msw-group-toggle ${isOpen ? "open" : ""}`}
                        aria-expanded={isOpen}
                        onClick={() => setOpenSections((current) => {
                          const next = new Set(current);
                          if (next.has(section.key)) next.delete(section.key);
                          else next.add(section.key);
                          return next;
                        })}
                      >
                        <span>{section.title}</span>
                        <ChevronDown size={13} />
                      </button>
                      {isOpen ? (
                        <>
                        {section.description ? <p className="msw-group-desc">{section.description}</p> : null}
                        <div className="msw-input-pairs">
                          {section.rows.map((row, rowIndex) => (
                            <div key={`${section.key}_${rowIndex}`} className={`msw-input-pair ${row.length === 1 ? "single" : ""}`}>
                              {row.map((input) => (
                                <InputControl
                                  key={input.key}
                                  input={input}
                                  value={valueMap[input.key]}
                                  dirty={dirtyKeys.has(input.key)}
                                  onChange={(key, value) => setEditedValues((prev) => ({ ...prev, [key]: value }))}
                                  onReset={(key) => setEditedValues((prev) => {
                                    const next = { ...prev };
                                    delete next[key];
                                    return next;
                                  })}
                                />
                              ))}
                            </div>
                          ))}
                        </div>
                        </>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </>
          ) : null}
        </div>
      </aside>

      <style jsx global>{`
        .msw-root {
          height: 100%;
          min-height: 0;
          display: flex;
          flex-direction: row;
          gap: 0;
          padding: 6px 0 8px 6px;
          box-sizing: border-box;
          color-scheme: dark;
          overflow: hidden;
        }
        .msw-left-col {
          flex: 1 1 0;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 0;
          overflow: hidden;
        }
        .msw-resize-handle {
          flex: 0 0 auto;
          background: transparent;
          position: relative;
          z-index: 10;
          transition: background 0.12s;
        }
        .msw-resize-h {
          width: 100%;
          height: 8px;
          cursor: row-resize;
        }
        .msw-resize-v {
          width: 8px;
          height: 100%;
          cursor: col-resize;
        }
        .msw-resize-handle:hover {
          background: rgba(255, 255, 255, 0.04);
        }
        .msw-resize-handle:active {
          background: rgba(255, 255, 255, 0.07);
        }
        .msw-main,
        .msw-tester,
        .msw-side {
          min-width: 0;
          min-height: 0;
          border: 1px solid rgba(255, 255, 255, 0.06);
          background: var(--monitoring-chart-bg);
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.03),
            0 14px 40px rgba(0, 0, 0, 0.22);
          border-radius: 16px;
          overflow: hidden;
        }
        .msw-main {
          flex: 0 0 auto;
        }
        .msw-tester {
          flex: 1 1 0;
          min-height: 200px;
          display: grid;
          grid-template-rows: auto minmax(0, 1fr);
        }
        .msw-side {
          display: grid;
          grid-template-rows: auto minmax(0, 1fr);
        }
        .msw-side--stats {
          flex: 0 0 auto;
          min-width: 0;
        }
        .msw-side--inputs {
          flex: 1 1 0;
          min-width: 220px;
        }
        .msw-side--inputs.msw-side--collapsed {
          flex: 0 0 30px;
          min-width: 30px;
          width: 30px;
          position: relative;
        }
        .msw-side--collapsed .msw-side-head,
        .msw-side--collapsed .msw-side-scroll {
          display: none;
        }
        .msw-side-head-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          align-self: end;
        }
        .msw-params-toggle {
          font-size: 11px;
          font-weight: 700;
          color: #5a606e;
          background: none;
          border: none;
          padding: 2px 4px;
          cursor: pointer;
          line-height: 1;
        }
        .msw-params-toggle:hover { color: #cbd0da; }
        .msw-params-toggle--rail {
          position: absolute;
          inset: 0;
          width: 30px;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          border-left: 1px solid rgba(255, 255, 255, 0.06);
          background: linear-gradient(180deg, rgba(13, 14, 18, 0.98) 0%, rgba(11, 12, 15, 0.9) 100%);
        }
        .msw-params-toggle--rail .msw-params-toggle-label {
          writing-mode: vertical-rl;
          transform: rotate(180deg);
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #7b8190;
        }
        .msw-params-toggle--rail:hover .msw-params-toggle-label { color: #cbd0da; }
        .msw-head,
        .msw-side-head {
          display: grid;
          gap: 6px;
          padding: 7px 10px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          background: linear-gradient(180deg, rgba(13, 14, 18, 0.98) 0%, rgba(11, 12, 15, 0.9) 100%);
        }
        .msw-head {
          display: block;
          padding: 0;
        }
        .msw-head-compact-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 6px 10px;
          flex-wrap: nowrap;
          min-width: 0;
          overflow: hidden;
        }
        .msw-head-compact-row::-webkit-scrollbar {
          display: none;
        }
        .msw-head-title-block {
          display: grid;
          gap: 2px;
          min-width: 0;
          flex: 0 0 auto;
        }
        .msw-head-st-label {
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #727986;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .msw-head-sep-v {
          width: 1px;
          align-self: stretch;
          background: rgba(255, 255, 255, 0.07);
          flex-shrink: 0;
          min-height: 22px;
        }
        .msw-asset-stack {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-shrink: 0;
          padding-left: 4px;
          min-width: 0;
          overflow-x: auto;
          scrollbar-width: none;
        }
        .msw-asset-stack::-webkit-scrollbar {
          display: none;
        }
        .msw-asset-thumb {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          padding: 0;
          border-radius: 999px;
          border: 1px solid rgba(236, 240, 245, 0.28);
          background: linear-gradient(180deg, #1a1d23 0%, #0d0f14 100%);
          color: #e8edf5;
          cursor: pointer;
          flex-shrink: 0;
          overflow: hidden;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
        }
        .msw-asset-thumb-icon {
          width: 20px;
          height: 20px;
          object-fit: contain;
          border-radius: 999px;
          flex-shrink: 0;
        }
        .msw-asset-thumb-fallback {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.06em;
          color: #eef2f7;
        }
        .msw-asset-thumb:hover {
          background: linear-gradient(180deg, #21262f 0%, #131821 100%);
          border-color: rgba(244, 247, 251, 0.42);
          z-index: 30 !important;
        }
        .msw-asset-thumb.is-focused {
          border-color: rgba(255, 255, 255, 0.7);
          box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.08);
        }
        .msw-muted-sm {
          font-size: 9px;
          color: #66707f;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .msw-head-title {
          min-width: 0;
          font-size: 12px;
          font-weight: 700;
          color: #f2f4f7;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          letter-spacing: -0.01em;
        }
        .msw-layout-reset-btn {
          align-self: end;
          font-size: 9px;
          font-weight: 600;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          color: #5a606e;
          background: none;
          border: none;
          padding: 2px 0;
          cursor: pointer;
          text-align: left;
          line-height: 1.4;
        }
        .msw-layout-reset-btn:hover {
          color: #8a8f9c;
        }
        .msw-selection-chips,
        .msw-selection-actions {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }
        .msw-selection-chips--inline {
          margin-top: 0;
          min-width: 0;
          flex-wrap: nowrap;
          overflow-x: auto;
          padding-bottom: 1px;
        }
        .msw-selection-actions--compact {
          justify-content: flex-start;
          flex-wrap: nowrap;
        }
        .msw-head-controls {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 10px;
          flex-wrap: nowrap;
          min-width: 0;
          overflow-x: auto;
          scrollbar-width: none;
        }
        .msw-head-controls::-webkit-scrollbar {
          display: none;
        }
        .msw-selection-cluster {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
          flex-shrink: 0;
        }
        .msw-plus-toggle {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 10px;
          padding: 0 2px;
          border: none;
          background: transparent;
          color: #b9c0ca;
          font-size: 16px;
          font-weight: 700;
          line-height: 1;
          cursor: pointer;
          flex-shrink: 0;
        }
        .msw-plus-toggle:hover {
          color: #f5f7fa;
        }
        .msw-plus-toggle.active {
          color: #f7f9fc;
        }
        .msw-head-pill {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          height: 26px;
          padding: 0 8px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.035);
          flex-shrink: 0;
        }
        .msw-head-pill span {
          font-size: 8px;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #7a818d;
        }
        .msw-head-select {
          min-width: 0;
          border: none;
          background: transparent;
          color: #f3f6fa;
          font-size: 10px;
          font-weight: 700;
          padding-right: 10px;
          cursor: pointer;
          outline: none;
          appearance: none;
          -webkit-appearance: none;
        }
        .msw-selection-chip-remove {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 12px;
          height: 12px;
          color: #aeb7c2;
          font-size: 12px;
          line-height: 1;
          cursor: pointer;
        }
        .msw-head-copy,
        .msw-identity {
          display: grid;
          gap: 2px;
        }
        .msw-head-copy--compact {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
        }
        .msw-eyebrow {
          font-size: 8px;
          text-transform: uppercase;
          letter-spacing: 0.18em;
          color: #707784;
        }
        .msw-head-copy strong,
        .msw-identity strong {
          font-size: 14px;
          line-height: 1.05;
          color: #f5f7fa;
        }
        .msw-head-copy strong {
          white-space: nowrap;
          flex: 0 0 auto;
        }
        .msw-head-copy small,
        .msw-identity small {
          font-size: 9px;
          line-height: 1.35;
          color: #8b929f;
        }
        .msw-side-icons {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
          margin-top: 2px;
        }
        .msw-side-icon-chip {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 28px;
          height: 20px;
          padding: 0 6px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.045);
          color: #e9edf3;
          font-size: 9px;
          font-weight: 700;
        }
        .msw-mode-row {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }
        .msw-history-row {
          justify-content: flex-start;
          flex-wrap: nowrap;
        }
        .msw-head-tabs {
          justify-content: flex-end;
          flex-wrap: nowrap;
        }
        .msw-xlsx-dot {
          display: inline-block;
          width: 7px;
          height: 7px;
          margin-left: 6px;
          border-radius: 50%;
          vertical-align: middle;
        }
        .msw-xlsx-dot.ok {
          background: #3ddc84;
          box-shadow: 0 0 4px rgba(61, 220, 132, 0.5);
        }
        .msw-xlsx-dot.missing {
          background: #5a5d63;
        }
        .msw-mode,
        .msw-bool,
        .msw-reset-field {
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.025);
          color: #cfd5de;
          border-radius: 9px;
          cursor: pointer;
        }
        .msw-mode {
          height: 22px;
          padding: 0 8px;
          font-size: 8px;
          font-weight: 600;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }
        .msw-mode--micro {
          height: 20px;
          padding: 0 7px;
          font-size: 8px;
        }
        .msw-mode.active {
          background: rgba(244, 247, 251, 0.09);
          color: #f6f7fb;
          border-color: rgba(255, 255, 255, 0.18);
          box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.04);
        }
        .msw-auto-indicator {
          display: inline-block;
          vertical-align: middle;
          margin-left: 6px;
          color: #c6a558;
        }
        .msw-body {
          min-height: 0;
          overflow-y: auto;
          overflow-x: hidden;
          padding: 6px 10px 10px;
          display: flex;
          flex-direction: column;
        }
        .msw-side-scroll {
          min-height: 0;
          overflow-y: auto;
          overflow-x: hidden;
          padding: 10px;
          scrollbar-width: thin;
          scrollbar-color: #2a2d33 #060606;
        }
        .msw-side-scroll::-webkit-scrollbar,
        .msw-fold-list::-webkit-scrollbar,
        .msw-metric-list::-webkit-scrollbar,
        .msw-trade-list::-webkit-scrollbar {
          width: 6px;
        }
        .msw-side-scroll::-webkit-scrollbar-track,
        .msw-fold-list::-webkit-scrollbar-track,
        .msw-metric-list::-webkit-scrollbar-track,
        .msw-trade-list::-webkit-scrollbar-track {
          background: #060606;
        }
        .msw-side-scroll::-webkit-scrollbar-thumb,
        .msw-fold-list::-webkit-scrollbar-thumb,
        .msw-metric-list::-webkit-scrollbar-thumb,
        .msw-trade-list::-webkit-scrollbar-thumb {
          background: #2a2d33;
          border-radius: 999px;
        }
        .msw-side-scroll::-webkit-scrollbar-thumb:hover,
        .msw-fold-list::-webkit-scrollbar-thumb:hover,
        .msw-metric-list::-webkit-scrollbar-thumb:hover,
        .msw-trade-list::-webkit-scrollbar-thumb:hover {
          background: #383c44;
        }
        .msw-visual-stack {
          flex: 1 1 0;
          min-height: 0;
          min-width: 0;
          display: grid;
          grid-template-rows: minmax(0, 1fr);
        }
        .msw-section-stack,
        .msw-input-groups,
        .msw-warning-list {
          display: grid;
          gap: 8px;
        }
        .msw-chart-grid {
          min-height: 0;
          min-width: 0;
          height: 100%;
          display: grid;
          grid-template-columns: 1fr;
          grid-template-rows: minmax(200px, 2fr) minmax(100px, 1fr);
          gap: 6px;
        }
        .msw-chart-card,
        .msw-surface-card,
        .msw-mini-card,
        .msw-kpi-card {
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.055);
          background: rgba(17, 18, 22, 0.78);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.025);
        }
        .msw-chart-card {
          min-height: 0;
          min-width: 0;
          padding: 6px 7px;
          display: flex;
        }
        .msw-chart-card .st-section-fill {
          display: flex;
          flex-direction: column;
          height: 100%;
          width: 100%;
          min-height: 0;
          min-width: 0;
        }
        .msw-chart-card .st-chart-fill {
          flex: 1 1 0;
          min-height: 0;
          min-width: 0;
          height: 100%;
        }
        .msw-chart-card .st-section-header {
          padding: 2px 2px 0;
        }
        .msw-chart-card .st-section-title {
          font-size: 9px;
          margin-bottom: 0;
        }
        .msw-chart-card .st-chart-wrap-equity,
        .msw-chart-card .st-chart-wrap-drawdown {
          flex: 1 1 0;
          min-height: 0;
          min-width: 0;
          height: 100%;
        }
        .msw-inline-grid,
        .msw-kpi-grid,
        .msw-stat-pairs {
          display: grid;
          gap: 7px;
          min-width: 0;
        }
        .msw-inline-grid {
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }
        .msw-kpi-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .msw-mini-card,
        .msw-kpi-card {
          padding: 9px 10px;
          display: grid;
          gap: 3px;
          min-width: 0;
        }
        .msw-mini-card span,
        .msw-kpi-card span,
        .msw-stat-pairs span,
        .msw-mismatch-card span,
        .msw-input-label {
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #9399a6;
        }
        .msw-mini-card strong,
        .msw-kpi-card strong,
        .msw-stat-pairs strong,
        .msw-mismatch-card strong {
          font-size: 14px;
          color: #f5f7fa;
          line-height: 1.2;
        }
        .msw-kpi-card strong.is-negative {
          color: #dbc594;
        }
        .msw-mini-card small {
          font-size: 9px;
          color: #8f96a2;
          line-height: 1.35;
        }
        .msw-validation-layout {
          min-height: 0;
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(280px, 0.84fr);
          gap: 8px;
        }
        .msw-surface-card {
          min-height: 0;
          padding: 10px;
          display: grid;
          gap: 8px;
        }
        .msw-surface-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }
        .msw-surface-head strong {
          font-size: 11px;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: #eceff4;
        }
        .msw-surface-head span {
          font-size: 9px;
          color: #8f96a2;
        }
        .msw-fold-list,
        .msw-metric-list,
        .msw-trade-list {
          display: grid;
          gap: 7px;
          max-height: 320px;
          overflow: auto;
          padding-right: 4px;
          scrollbar-width: thin;
          scrollbar-color: #2a2d33 #060606;
        }
        .msw-detail-table-wrap {
          max-height: 340px;
          overflow: auto;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.05);
        }
        .msw-detail-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 10px;
        }
        .msw-detail-table th,
        .msw-detail-table td {
          padding: 7px 8px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          text-align: left;
          white-space: nowrap;
        }
        .msw-detail-table th {
          position: sticky;
          top: 0;
          z-index: 1;
          background: #0d0f13;
          color: #8f96a2;
          font-size: 9px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        .msw-detail-table td {
          color: #eceff4;
        }
        .msw-fold-row,
        .msw-metric-row,
        .msw-trade-row {
          display: grid;
          gap: 8px;
          align-items: center;
          font-size: 10px;
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.028);
          padding: 8px;
        }
        .msw-fold-row {
          grid-template-columns: 80px minmax(0, 1fr) minmax(0, 1fr) 84px;
        }
        .msw-metric-row {
          grid-template-columns: minmax(0, 1fr) 120px 76px;
        }
        .msw-trade-row {
          grid-template-columns: 74px minmax(0, 1fr) 72px;
        }
        .msw-metric-row.pass {
          border-left: 2px solid rgba(255, 255, 255, 0.16);
        }
        .msw-metric-row.fail {
          color: #ff8b94;
        }
        .msw-trade-row strong.is-neg {
          color: #dbc594;
        }
        .msw-trade-row strong.is-pos {
          color: #d9dce3;
        }
        .msw-fold-row em,
        .msw-metric-row em {
          font-style: normal;
          text-align: right;
          color: #eceff4;
        }
        .msw-stat-pairs {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .msw-stat-pairs > div {
          display: grid;
          gap: 3px;
          padding: 8px 0;
          border-top: 1px solid rgba(255, 255, 255, 0.05);
        }
        .msw-stat-pairs > div:nth-child(-n+2) {
          border-top: 0;
        }
        .msw-mismatch-card {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }
        .msw-mismatch-card .full {
          grid-column: 1 / -1;
        }
        .msw-chip {
          display: inline-flex;
          align-items: center;
          height: 20px;
          padding: 0 9px;
          border-radius: 999px;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }
        .msw-chip--base {
          background: rgba(255, 255, 255, 0.05);
          color: #d0d4dc;
        }
        .msw-chip--pass {
          background: rgba(255, 255, 255, 0.06);
          color: #eef2f7;
        }
        .msw-chip--warn {
          background: rgba(198, 165, 88, 0.12);
          color: #dbc594;
        }
        .msw-chip--fail {
          background: rgba(255, 123, 132, 0.12);
          color: #ff9ba4;
        }
        .msw-input-group {
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.03);
          overflow: hidden;
        }
        .msw-group-toggle {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          height: 32px;
          padding: 0 10px;
          border: none;
          background: transparent;
          color: #d8dde6;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          cursor: pointer;
          min-width: 0;
          overflow: hidden;
        }
        .msw-group-toggle > span:first-child {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          min-width: 0;
          flex: 1 1 0;
        }
        .msw-group-toggle svg {
          color: #8f96a2;
          transition: transform 0.15s ease;
        }
        .msw-group-toggle.open {
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }
        .msw-group-toggle.open svg {
          transform: rotate(180deg);
        }
        .msw-group-desc {
          margin: 0;
          padding: 8px 10px 0;
          font-size: 9px;
          line-height: 1.45;
          color: #8b929f;
          letter-spacing: 0.01em;
          text-transform: none;
          font-weight: 400;
        }
        .msw-input-pairs {
          display: grid;
          gap: 7px;
          padding: 8px;
          min-width: 0;
        }
        .msw-input-pair {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 7px;
          min-width: 0;
        }
        .msw-input-pair.single {
          grid-template-columns: minmax(0, 1fr);
        }
        .msw-input-tile {
          display: grid;
          gap: 5px;
          padding: 8px;
          border-radius: 9px;
          border: 1px solid rgba(255, 255, 255, 0.05);
          background: rgba(255, 255, 255, 0.018);
        }
        .msw-input-tile.is-dirty {
          border-color: rgba(198, 165, 88, 0.24);
        }
        .msw-input-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }
        .msw-input-tile.is-dirty .msw-input-label {
          color: #dbc594;
        }
        .msw-input-control {
          display: grid;
          align-items: center;
          gap: 5px;
        }
        .msw-field,
        .msw-bool {
          width: 100%;
          height: 28px;
          border-radius: 7px;
          padding: 0 9px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: #050505;
          color: #f5f7fa;
          font-size: 11px;
        }
        .msw-field {
          appearance: textfield;
        }
        .msw-field:focus,
        .msw-bool:focus,
        .msw-mode:focus,
        .msw-group-toggle:focus {
          outline: none;
          border-color: rgba(198, 165, 88, 0.26);
          box-shadow: 0 0 0 1px rgba(198, 165, 88, 0.08);
        }
        .msw-field::-webkit-outer-spin-button,
        .msw-field::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        .msw-bool {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          font-size: 10px;
          font-weight: 600;
        }
        .msw-bool-dot {
          width: 6px;
          height: 6px;
          border-radius: 999px;
          background: currentColor;
          opacity: 0.72;
        }
        .msw-bool.on {
          color: #f1f3f7;
          border-color: rgba(198, 165, 88, 0.22);
          background: rgba(198, 165, 88, 0.07);
        }
        .msw-reset-field {
          width: auto;
          height: 20px;
          padding: 0 7px;
          border-radius: 999px;
          font-size: 9px;
          line-height: 18px;
        }
        .msw-placeholder,
        .msw-error {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          height: 100%;
          min-height: 120px;
          color: #8f948f;
          font-size: 11px;
        }
        .msw-error {
          justify-content: flex-start;
          padding: 14px;
          border-radius: 12px;
          background: rgba(255, 123, 132, 0.08);
          border: 1px solid rgba(255, 123, 132, 0.16);
          color: #ff9ba4;
        }
        .msw-muted,
        .msw-warning-list {
          color: #8f948f;
          font-size: 10px;
          line-height: 1.45;
        }
        .msw-sparkline {
          width: 100%;
          height: 92px;
        }
        .msw-warning-list {
          gap: 6px;
        }
        .spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @media (max-width: 1440px) {
          .msw-inline-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .msw-validation-layout {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 1180px) {
          .msw-inline-grid,
          .msw-chart-grid,
          .msw-validation-layout,
          .msw-kpi-grid {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 1080px) {
          .msw-root {
            flex-direction: column;
            overflow-y: auto;
            overflow-x: hidden;
            height: auto;
            min-height: 100%;
            padding: 4px 4px 6px;
          }
          .msw-left-col {
            width: 100% !important;
            flex: 0 0 auto;
            min-height: 60vh;
          }
          .msw-main {
            height: 42vh !important;
            flex: 0 0 auto;
          }
          .msw-tester {
            flex: 0 0 auto;
            min-height: 34vh;
          }
          .msw-side--stats,
          .msw-side--inputs {
            width: 100% !important;
            min-width: 0;
            flex: 0 0 auto;
            min-height: 34vh;
          }
          .msw-resize-handle {
            display: none;
          }
          .msw-head-compact-row,
          .msw-head-controls {
            flex-wrap: wrap;
            overflow: visible;
          }
          .msw-head-controls {
            justify-content: flex-start;
          }
          .msw-selection-cluster {
            width: 100%;
          }
          .msw-inline-grid,
          .msw-kpi-grid,
          .msw-stat-pairs,
          .msw-mismatch-card {
            grid-template-columns: 1fr;
          }
          .msw-fold-row,
          .msw-metric-row,
          .msw-trade-row,
          .msw-input-pair {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}





