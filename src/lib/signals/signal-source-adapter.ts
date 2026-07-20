import fs from "node:fs";
import path from "node:path";
import type { MonitoringChartData } from "@/components/monitoring/MonitoringChart";
import type { MonitoringPrimaryTabId } from "@/config/monitoringTabConfig";
import { calculateStrategyPerformance } from "@/lib/monitoring/backtest/calculateStrategyPerformance";
import type { MonitoringCandle, MonitoringTrade, StrategyPerformanceResult } from "@/lib/monitoring/types";
import { mergeTradesFromEventsPayload, type EventsTradeRow } from "@/lib/monitoring/tradeSetupFromEvents";
import type {
  SignalCardGroup,
  SignalCardCategory,
  SignalCardModel,
  SignalCardPreview,
  SignalCardStatus,
} from "@/lib/signals/signal-types";

type StrategyTrade = {
  direction?: "long" | "short";
  entryTime?: string;
  exitTime?: string | null;
  entry?: number | null;
  exit?: number | null;
  sl?: number | null;
  tp?: number | null;
  exitReason?: string | null;
  quantity?: number | null;
};

type StrategyFile = {
  symbol?: string;
  strategyName?: string;
  status?: string;
  openTrade?: boolean;
  openTradeRow?: StrategyTrade | null;
  trades?: StrategyTrade[];
  signalEvents?: Array<{
    time?: string;
    type?: string;
    direction?: "long" | "short" | null;
    price?: number | null;
    entry?: number | null;
    sl?: number | null;
    tp?: number | null;
  }>;
};

type CandleBar = {
  time?: string;
  date?: string;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
};

type CandleFile = {
  bars?: CandleBar[];
};

type NextSignalSchedule = "friday" | "thursday" | "tuesday_conditional" | "daily" | "date_specific";

type SignalSource = {
  id: string;
  group: SignalCardGroup;
  category: SignalCardCategory;
  strategyId: string;
  strategyName: string;
  symbol: string;
  assetName: string;
  iconKey: string;
  monitoringTarget: {
    tab: MonitoringPrimaryTabId;
    asset: string;
    strategyId?: string;
  };
  strategyFile: string;
  strategyFolder: "strategies" | "signals";
  candleFile?: string;
  candleSource: "cache" | "invest_csv";
  investSymbol?: string;
  forcedStatus?: SignalCardStatus;
  forcedDirection?: "LONG" | "SHORT";
  forcedTp?: number;
  forcedSl?: number;
  nextSignalSchedule?: NextSignalSchedule;
  nextSignalDate?: string;
};

function nextWeekday(targetDay: number): string {
  const now = new Date();
  const today = now.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  let daysAhead = targetDay - today;
  if (daysAhead <= 0) daysAhead += 7;
  const next = new Date(now);
  next.setDate(now.getDate() + daysAhead);
  return next.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
}

function computeNextSignalLabel(schedule: NextSignalSchedule | undefined, date?: string): string | undefined {
  if (!schedule) return undefined;
  if (schedule === "friday") return `Fr ${nextWeekday(5)}`;
  if (schedule === "thursday") return `Do ${nextWeekday(4)}`;
  if (schedule === "tuesday_conditional") return `Di ${nextWeekday(2)} (nur bei neg. Mo)`;
  if (schedule === "daily") return "täglich prüfen";
  if (schedule === "date_specific") return date ?? "Datum TBD";
  return undefined;
}

const PROJECT_ROOT = process.cwd();
const GENERATED_ROOT = path.join(PROJECT_ROOT, "public", "generated", "monitoring");
const STRATEGIES_ROOT = path.join(GENERATED_ROOT, "strategies");
const SIGNALS_ROOT = path.join(GENERATED_ROOT, "signals");
const D_CACHE_ROOT = path.join(GENERATED_ROOT, "tradingview_data_cache", "D");
const INVEST_FOLDER = "C:\\Users\\joris\\Desktop\\Invest Portfolio";

const INVEST_OHLC_FILES: Record<string, string[]> = {
  QQQ: ["QQQ.csv", "QQQ(1).csv", "QQQ(2).csv", "BATS_QQQ, 1D_9233b.csv"],
};

export const SIGNAL_SOURCE_FILTERS = ["all", "long", "short", "cash", "open", "validation"] as const;

// ── ARCHIVED: old Universe sources (WS_PORTFOLIO_WORKING_V0) ──────────────────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const ARCHIVED_WHITE_SWAN_SOURCES: SignalSource[] = [
  {
    id: "ws-wheat-valuation",
    group: "white_swan",
    category: "valuation",
    strategyId: "WHITE_SWAN_WHEAT_VALUATION",
    strategyName: "Valuation Alpha",
    symbol: "ZW1!",
    assetName: "Wheat",
    iconKey: "wheat",
    strategyFile: "CBOT_ZW1_events.json",
    strategyFolder: "strategies",
    candleFile: "CBOT_ZW1_D.json",
    candleSource: "cache",
    monitoringTarget: { tab: "agrar", asset: "ZW1!" },
  },
  {
    id: "ws-corn-macro",
    group: "white_swan",
    category: "macro",
    strategyId: "WHITE_SWAN_CORN_MACRO",
    strategyName: "Macro Valuation Alpha",
    symbol: "ZC1!",
    assetName: "Corn",
    iconKey: "corn",
    strategyFile: "CBOT_ZC1_events.json",
    strategyFolder: "strategies",
    candleFile: "CBOT_ZC1_D.json",
    candleSource: "cache",
    monitoringTarget: { tab: "agrar", asset: "ZC1!" },
  },
  {
    id: "ws-soybeans-seasonal",
    group: "white_swan",
    category: "seasonal",
    strategyId: "WHITE_SWAN_SOYBEANS_SEASONAL",
    strategyName: "Seasonal Alpha",
    symbol: "ZS1!",
    assetName: "Soybeans",
    iconKey: "soybeans",
    strategyFile: "CBOT_ZS1_events.json",
    strategyFolder: "strategies",
    candleFile: "CBOT_ZS1_D.json",
    candleSource: "cache",
    monitoringTarget: { tab: "agrar", asset: "ZS1!" },
  },
  {
    id: "ws-gold-macro",
    group: "white_swan",
    category: "macro",
    strategyId: "WHITE_SWAN_GOLD_MACRO",
    strategyName: "Macro Valuation Alpha",
    symbol: "GC1!",
    assetName: "Gold",
    iconKey: "gold",
    strategyFile: "COMEX_GC1_events.json",
    strategyFolder: "strategies",
    candleFile: "COMEX_GC1_D.json",
    candleSource: "cache",
    monitoringTarget: { tab: "metalle_energie", asset: "GC1!" },
  },
  {
    id: "ws-nas100-valuation",
    group: "white_swan",
    category: "valuation",
    strategyId: "WHITE_SWAN_NAS100",
    strategyName: "White Swan NAS100",
    symbol: "NAS100USD",
    assetName: "Nasdaq 100",
    iconKey: "nasdaq",
    strategyFile: "OANDA_NAS100USD_events.json",
    strategyFolder: "strategies",
    candleFile: "OANDA_NAS100USD_D.json",
    candleSource: "cache",
    monitoringTarget: { tab: "invest", asset: "NAS100USD_ONLY_LONG_VALUATION_TREND_EMA", strategyId: "NAS100USD_ONLY_LONG_VALUATION_TREND_EMA" },
  },
];

// ── ACTIVE: F+10% Portfolio (WS-F+10%) ────────────────────────────────────────
export const WHITE_SWAN_SOURCES: SignalSource[] = [
  {
    id: "fp10-gc1-friday-long",
    group: "white_swan",
    category: "seasonal",
    strategyId: "FP10_GC1_FRIDAY_LONG",
    strategyName: "GC1! Friday Long",
    symbol: "GC1!",
    assetName: "Gold Futures",
    iconKey: "gold",
    strategyFile: "FP10_GC1_friday_long_events.json",
    strategyFolder: "strategies",
    candleFile: "COMEX_GC1_D.json",
    candleSource: "cache",
    forcedStatus: "PAPER_ONLY",
    forcedDirection: "LONG",
    nextSignalSchedule: "friday",
    monitoringTarget: { tab: "metalle_energie", asset: "GC1!" },
  },
  {
    id: "fp10-gld-thursday-long",
    group: "white_swan",
    category: "seasonal",
    strategyId: "FP10_GLD_THURSDAY_LONG",
    strategyName: "GLD Thursday Long",
    symbol: "GLD",
    assetName: "Gold ETF (GLD)",
    iconKey: "gold",
    strategyFile: "FP10_GLD_thursday_long_events.json",
    strategyFolder: "strategies",
    candleSource: "cache",
    forcedStatus: "PAPER_ONLY",
    forcedDirection: "LONG",
    nextSignalSchedule: "thursday",
    monitoringTarget: { tab: "invest", asset: "GLD" },
  },
  {
    id: "fp10-ym1-tat",
    group: "white_swan",
    category: "macro",
    strategyId: "FP10_YM1_TAT",
    strategyName: "YM1! TAT",
    symbol: "YM1!",
    assetName: "Dow Jones Futures",
    iconKey: "dowJones",
    strategyFile: "FP10_YM1_tat_events.json",
    strategyFolder: "strategies",
    candleSource: "cache",
    forcedStatus: "PAPER_ONLY",
    forcedDirection: "LONG",
    nextSignalSchedule: "tuesday_conditional",
    monitoringTarget: { tab: "indizes", asset: "YM1!" },
  },
  {
    id: "fp10-ukx-valuation",
    group: "white_swan",
    category: "valuation",
    strategyId: "FP10_UKX_VALUATION",
    strategyName: "UKX Valuation",
    symbol: "UKX",
    assetName: "FTSE 100",
    iconKey: "gbp",
    strategyFile: "FP10_UKX_valuation_events.json",
    strategyFolder: "strategies",
    candleSource: "cache",
    forcedStatus: "PAPER_ONLY",
    forcedDirection: "LONG",
    nextSignalSchedule: "daily",
    monitoringTarget: { tab: "indizes", asset: "UKX" },
  },
  {
    id: "fp10-ct1-macro-a",
    group: "white_swan",
    category: "macro",
    strategyId: "FP10_CT1_MACRO_A",
    strategyName: "CT1 Macro A",
    symbol: "CT1!",
    assetName: "Cotton Futures",
    iconKey: "cotton",
    strategyFile: "FP10_CT1_macro_a_events.json",
    strategyFolder: "strategies",
    candleSource: "cache",
    forcedStatus: "PAPER_ONLY",
    forcedDirection: "LONG",
    nextSignalSchedule: "daily",
    monitoringTarget: { tab: "agrar", asset: "CT1!" },
  },
  {
    id: "fp10-nq1-trend-lo",
    group: "white_swan",
    category: "valuation",
    strategyId: "FP10_NQ1_TREND_LO",
    strategyName: "NQ1 Trend LO",
    symbol: "NQ1!",
    assetName: "Nasdaq Futures",
    iconKey: "nasdaq",
    strategyFile: "FP10_NQ1_trend_lo_events.json",
    strategyFolder: "strategies",
    candleFile: "OANDA_NAS100USD_D.json",
    candleSource: "cache",
    forcedStatus: "PAPER_ONLY",
    forcedDirection: "LONG",
    nextSignalSchedule: "daily",
    monitoringTarget: { tab: "indizes", asset: "NQ1!" },
  },
  {
    id: "fp10-intraday-mt-v3f",
    group: "white_swan",
    category: "macro",
    strategyId: "FP10_INTRADAY_MT_V3F",
    strategyName: "Intraday MT v3-F",
    symbol: "EURUSD",
    assetName: "Intraday Multi-Asset",
    iconKey: "eur",
    strategyFile: "FP10_intraday_mt_v3f_events.json",
    strategyFolder: "strategies",
    candleSource: "cache",
    forcedStatus: "PAPER_ONLY",
    forcedDirection: "LONG",
    nextSignalSchedule: "daily",
    monitoringTarget: { tab: "intraday_mt", asset: "6E1! 30M" },
  },
];

export const CORE_INVEST_SOURCES: SignalSource[] = [
  {
    id: "ci-qqq-pine-1",
    group: "core_invest",
    category: "core_strategy",
    strategyId: "QQQ_PINE_1",
    strategyName: "QQQ Pine 1",
    symbol: "QQQ",
    assetName: "QQQ Pine 1",
    iconKey: "nasdaq",
    strategyFile: "BATS_QQQ_pine1_events.json",
    strategyFolder: "strategies",
    candleSource: "invest_csv",
    investSymbol: "QQQ",
    forcedDirection: "LONG",
    monitoringTarget: { tab: "invest", asset: "QQQ_PINE_1", strategyId: "QQQ_PINE_1" },
  },
  {
    id: "ci-qqq-pine-2",
    group: "core_invest",
    category: "core_strategy",
    strategyId: "QQQ_PINE_2_EMA",
    strategyName: "QQQ Pine 2 EMA",
    symbol: "QQQ",
    assetName: "QQQ Pine 2 EMA",
    iconKey: "nasdaq",
    strategyFile: "BATS_QQQ_pine2_events.json",
    strategyFolder: "strategies",
    candleSource: "invest_csv",
    investSymbol: "QQQ",
    forcedDirection: "LONG",
    monitoringTarget: { tab: "invest", asset: "QQQ_PINE_2_EMA", strategyId: "QQQ_PINE_2_EMA" },
  },
  {
    id: "ci-copper-hg",
    group: "core_invest",
    category: "core_strategy",
    strategyId: "COPPER_HG",
    strategyName: "Copper / HG",
    symbol: "HG1!",
    assetName: "Copper / HG",
    iconKey: "copper",
    strategyFile: "COMEX_HG1_events.json",
    strategyFolder: "strategies",
    candleFile: "COMEX_HG1_D.json",
    candleSource: "cache",
    forcedDirection: "LONG",
    monitoringTarget: { tab: "invest", asset: "COPPER_HG", strategyId: "COPPER_HG" },
  },
  {
    id: "ci-chf-6s",
    group: "core_invest",
    category: "research_validation",
    strategyId: "CHF_6S",
    strategyName: "CHF / 6S Validation",
    symbol: "6S1!",
    assetName: "CHF / Swiss Franc",
    iconKey: "chf",
    strategyFile: "CME_6S1_events.json",
    strategyFolder: "signals",
    candleFile: "CME_6S1_D.json",
    candleSource: "cache",
    forcedStatus: "PARITY_PENDING",
    forcedDirection: "LONG",
    monitoringTarget: { tab: "invest", asset: "CHF_6S", strategyId: "CHF_6S" },
  },
  {
    id: "ci-spy-passive",
    group: "core_invest",
    category: "core_strategy",
    strategyId: "CI_SPY_PASSIVE",
    strategyName: "SPY passiv",
    symbol: "SPY",
    assetName: "S&P 500 ETF (SPY)",
    iconKey: "esSp",
    strategyFile: "CI_SPY_passive_events.json",
    strategyFolder: "strategies",
    candleFile: "BATS_SPY_D.json",
    candleSource: "cache",
    forcedStatus: "OPEN",
    monitoringTarget: { tab: "invest", asset: "SPY" },
  },
  {
    id: "ci-qqq-passive",
    group: "core_invest",
    category: "core_strategy",
    strategyId: "CI_QQQ_PASSIVE",
    strategyName: "QQQ passiv",
    symbol: "QQQ",
    assetName: "Nasdaq ETF passiv (QQQ)",
    iconKey: "nasdaq",
    strategyFile: "CI_QQQ_passive_events.json",
    strategyFolder: "strategies",
    candleSource: "cache",
    forcedStatus: "OPEN",
    monitoringTarget: { tab: "invest", asset: "QQQ_PASSIVE" },
  },
  {
    id: "ci-spmo-passive",
    group: "core_invest",
    category: "core_strategy",
    strategyId: "CI_SPMO_PASSIVE",
    strategyName: "SPMO passiv",
    symbol: "SPMO",
    assetName: "S&P Momentum (SPMO)",
    iconKey: "esSp",
    strategyFile: "CI_SPMO_passive_events.json",
    strategyFolder: "strategies",
    candleSource: "cache",
    forcedStatus: "OPEN",
    monitoringTarget: { tab: "invest", asset: "SPMO" },
  },
  {
    id: "ci-gld-passive",
    group: "core_invest",
    category: "core_strategy",
    strategyId: "CI_GLD_PASSIVE",
    strategyName: "GLD passiv",
    symbol: "GLD",
    assetName: "Gold ETF (GLD)",
    iconKey: "gold",
    strategyFile: "CI_GLD_passive_events.json",
    strategyFolder: "strategies",
    candleSource: "cache",
    forcedStatus: "OPEN",
    monitoringTarget: { tab: "invest", asset: "GLD" },
  },
  {
    id: "ci-quarterly-rebalancing",
    group: "core_invest",
    category: "research_validation",
    strategyId: "CI_QUARTERLY_REBALANCING",
    strategyName: "Quarterly Rebalancing",
    symbol: "CI2.0",
    assetName: "Core Invest v2.0 Portfolio",
    iconKey: "esSp",
    strategyFile: "CI_quarterly_rebalancing_events.json",
    strategyFolder: "strategies",
    candleSource: "cache",
    forcedStatus: "PAPER_ONLY",
    nextSignalSchedule: "date_specific",
    nextSignalDate: "Okt 2026",
    monitoringTarget: { tab: "invest", asset: "SPY" },
  },
];

function readJson<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

function toNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDate(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : undefined;
}

function ageDays(dateText: string | undefined): number | undefined {
  if (!dateText) return undefined;
  const date = Date.parse(`${dateText}T00:00:00Z`);
  if (!Number.isFinite(date)) return undefined;
  return Math.max(0, Math.floor((Date.now() - date) / 86_400_000));
}

function resolveInvestFile(symbol: string | undefined): string | null {
  if (!symbol) return null;
  for (const fileName of INVEST_OHLC_FILES[symbol] ?? []) {
    const fullPath = path.join(INVEST_FOLDER, fileName);
    if (fs.existsSync(fullPath)) return fullPath;
  }
  return null;
}

function readInvestCandles(symbol: string | undefined): MonitoringCandle[] {
  const filePath = resolveInvestFile(symbol);
  if (!filePath) return [];
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const lines = raw.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) return [];
    const headers = lines[0]!.split(",").map((item) => item.trim().replace(/^"|"$/g, ""));
    return lines.slice(1).map((line) => {
      const cols = line.split(",").map((item) => item.trim().replace(/^"|"$/g, ""));
      const row = Object.fromEntries(headers.map((header, index) => [header, cols[index] ?? ""])) as Record<string, string>;
      return {
        time: String(row.time ?? row.date ?? row.Date ?? "").slice(0, 10),
        open: Number(row.open ?? row.Open ?? row.close ?? row.Close ?? 0),
        high: Number(row.high ?? row.High ?? row.close ?? row.Close ?? 0),
        low: Number(row.low ?? row.Low ?? row.close ?? row.Close ?? 0),
        close: Number(row.close ?? row.Close ?? 0),
      } satisfies MonitoringCandle;
    }).filter((bar) => bar.time && [bar.open, bar.high, bar.low, bar.close].every(Number.isFinite));
  } catch {
    return [];
  }
}

function readCacheCandles(candleFile: string | undefined): MonitoringCandle[] {
  if (!candleFile) return [];
  const payload = readJson<CandleFile>(path.join(D_CACHE_ROOT, candleFile));
  return (payload?.bars ?? []).map((bar) => {
    const time = String(bar.time ?? bar.date ?? "").slice(0, 10);
    const close = toNumber(bar.close) ?? 0;
    return {
      time,
      open: toNumber(bar.open) ?? close,
      high: toNumber(bar.high) ?? close,
      low: toNumber(bar.low) ?? close,
      close,
    } satisfies MonitoringCandle;
  }).filter((bar) => bar.time && [bar.open, bar.high, bar.low, bar.close].every(Number.isFinite));
}

function readStrategyFile(source: SignalSource): StrategyFile | null {
  const root = source.strategyFolder === "strategies" ? STRATEGIES_ROOT : SIGNALS_ROOT;
  return readJson<StrategyFile>(path.join(root, source.strategyFile));
}

function latestTrade(file: StrategyFile | null): StrategyTrade | null {
  if (!file) return null;
  if (file.openTradeRow) return file.openTradeRow;
  if (file.trades?.length) return file.trades[file.trades.length - 1] ?? null;
  const latestSignal = [...(file.signalEvents ?? [])].reverse().find((event) => String(event.type ?? "").includes("entry"));
  if (!latestSignal) return null;
  return {
    direction: latestSignal.direction ?? undefined,
    entryTime: latestSignal.time,
    entry: latestSignal.entry ?? latestSignal.price ?? null,
    sl: latestSignal.sl ?? null,
    tp: latestSignal.tp ?? null,
    exitTime: null,
  };
}

function latestPriceChange(candles: MonitoringCandle[]): { price?: number; changePct?: number } {
  const last = candles.at(-1);
  const previous = candles.length > 1 ? candles[candles.length - 2] : undefined;
  if (!last) return {};
  const price = toNumber(last.close) ?? undefined;
  const prevClose = toNumber(previous?.close);
  if (price == null) return {};
  if (prevClose == null || prevClose === 0) return { price };
  return { price, changePct: ((price - prevClose) / prevClose) * 100 };
}

function toMonitoringTrades(rows: EventsTradeRow[]): MonitoringTrade[] {
  return rows
    .filter((row) => row.entryTime && row.exitTime && row.entry != null && row.exit != null)
    .map((row) => ({
      direction: row.direction === "short" ? "short" : "long",
      entryTime: row.entryTime,
      exitTime: row.exitTime as string,
      entry: Number(row.entry),
      exit: Number(row.exit),
      sl: toNumber(row.sl),
      tp: toNumber(row.tp),
      exitReason: row.exitReason ?? null,
      quantity: 1,
    }));
}

function formatPct(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function formatRatio(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return value.toFixed(digits);
}

function formatCount(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return String(Math.round(value));
}

function monthBreakdown(trades: MonitoringTrade[]): Array<{ month: string; value: number }> {
  const monthly = new Map<string, number>();
  for (const trade of trades) {
    const month = String(trade.exitTime || trade.entryTime).slice(0, 7);
    if (!month) continue;
    const direction = trade.direction === "long" ? 1 : -1;
    const entry = Number(trade.entry);
    const exit = Number(trade.exit);
    if (!Number.isFinite(entry) || !Number.isFinite(exit) || entry === 0) continue;
    const pct = ((exit - entry) / entry) * direction * 100;
    monthly.set(month, (monthly.get(month) ?? 0) + pct);
  }
  return [...monthly.entries()].map(([month, value]) => ({ month, value }));
}

type ValidatedKpi = { label: string; value: string; tone?: "positive" | "negative" | "neutral" };

const VALIDATED_METRICS: Record<string, ValidatedKpi[]> = {
  "fp10-gc1-friday-long": [
    { label: "Sharpe", value: "1.54", tone: "positive" },
    { label: "CAGR", value: "+4.18%", tone: "positive" },
    { label: "Max Drawdown", value: "-6.87%", tone: "negative" },
    { label: "Profit Factor", value: "2.07", tone: "positive" },
    { label: "Winrate", value: "61.8%", tone: "positive" },
    { label: "Trades", value: "377", tone: "neutral" },
  ],
  "fp10-gld-thursday-long": [
    { label: "Sharpe", value: "0.51", tone: "positive" },
    { label: "CAGR", value: "+3.38%", tone: "positive" },
    { label: "Max Drawdown", value: "-7.29%", tone: "negative" },
    { label: "Profit Factor", value: "1.21", tone: "neutral" },
    { label: "Winrate", value: "54.6%", tone: "positive" },
    { label: "Trades", value: "379", tone: "neutral" },
  ],
  "fp10-ym1-tat": [
    { label: "Sharpe", value: "0.35", tone: "positive" },
    { label: "CAGR", value: "+1.24%", tone: "positive" },
    { label: "Max Drawdown", value: "-6.64%", tone: "negative" },
    { label: "Profit Factor", value: "1.21", tone: "neutral" },
    { label: "Winrate", value: "53.7%", tone: "positive" },
    { label: "Trades", value: "164", tone: "neutral" },
  ],
  "fp10-ukx-valuation": [
    { label: "Sharpe", value: "0.93", tone: "positive" },
    { label: "CAGR", value: "+11.8%", tone: "positive" },
    { label: "Max Drawdown", value: "-21.1%", tone: "negative" },
    { label: "Profit Factor", value: "1.9", tone: "positive" },
    { label: "Winrate", value: "57%", tone: "positive" },
    { label: "Trades", value: "485", tone: "neutral" },
  ],
  "fp10-ct1-macro-a": [
    { label: "Sharpe", value: "0.63", tone: "positive" },
    { label: "CAGR", value: "+9.5%", tone: "positive" },
    { label: "Max Drawdown", value: "-28.7%", tone: "negative" },
    { label: "Profit Factor", value: "1.51", tone: "positive" },
    { label: "Winrate", value: "59%", tone: "positive" },
    { label: "Trades", value: "142", tone: "neutral" },
  ],
  "fp10-nq1-trend-lo": [
    { label: "Sharpe", value: "0.44", tone: "positive" },
    { label: "CAGR", value: "+8.3%", tone: "positive" },
    { label: "Max Drawdown", value: "-35.9%", tone: "negative" },
    { label: "Profit Factor", value: "1.5", tone: "positive" },
    { label: "Winrate", value: "54%", tone: "positive" },
    { label: "Trades", value: "100", tone: "neutral" },
  ],
  "ci-qqq-pine-1": [
    { label: "Sharpe IS", value: "0.25", tone: "positive" },
    { label: "OOS", value: "positiv", tone: "positive" },
    { label: "CAGR", value: "n/a", tone: "neutral" },
    { label: "Max Drawdown", value: "n/a", tone: "neutral" },
    { label: "Profit Factor", value: "n/a", tone: "neutral" },
    { label: "Trades", value: "n/a", tone: "neutral" },
  ],
};

function buildPreview(
  card: SignalCardModel,
  candles: MonitoringCandle[],
  file: StrategyFile | null,
): SignalCardPreview {
  const mergedTrades = mergeTradesFromEventsPayload(file as never);
  const monitoringTrades = toMonitoringTrades(mergedTrades);
  const chart: MonitoringChartData | null = candles.length
    ? {
        displaySymbol: card.displaySymbol,
        displayName: card.assetName,
        badge: null,
        bars: candles.map((bar) => ({
          time: bar.time,
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
        })),
        signals: [],
        trades: mergedTrades.map((trade) => ({
          direction: trade.direction,
          entryTime: trade.entryTime,
          exitTime: trade.exitTime ?? null,
          entry: trade.entry,
          exit: trade.exit ?? null,
          sl: trade.sl ?? null,
          tp: trade.tp ?? null,
          exitReason: trade.exitReason,
        })),
        boxes: [],
        variant: "large",
        timeframe: "D",
      }
    : null;

  const performance: StrategyPerformanceResult | null = monitoringTrades.length && candles.length
    ? calculateStrategyPerformance({
        candles,
        trades: monitoringTrades,
        events: [],
      })
    : null;

  const monthly = monthBreakdown(monitoringTrades);
  const positiveMonths = monthly.length ? monthly.filter((entry) => entry.value > 0).length : 0;

  const validatedKpis = !performance ? (VALIDATED_METRICS[card.id] ?? null) : null;

  return {
    chart,
    performance,
    testerStatus: performance ? "ready" : validatedKpis ? "validated" : "missing",
    testerMessage: performance ? null : validatedKpis ? null : "Tester-Daten fuer dieses Signal fehlen",
    kpis: validatedKpis ?? [
      { label: "Net Return", value: performance ? formatPct(performance.summary.totalReturnPercent) : "n/a", tone: performance && performance.summary.totalReturnPercent > 0 ? "positive" : performance && performance.summary.totalReturnPercent < 0 ? "negative" : "neutral" },
      { label: "CAGR", value: performance ? formatPct(performance.summary.cagr) : "n/a", tone: performance && performance.summary.cagr > 0 ? "positive" : performance && performance.summary.cagr < 0 ? "negative" : "neutral" },
      { label: "Max Drawdown", value: performance ? formatPct(-Math.abs(performance.summary.maxDrawdownPercent)) : "n/a", tone: performance && performance.summary.maxDrawdownPercent > 0 ? "negative" : "neutral" },
      { label: "Profit Factor", value: performance ? formatRatio(performance.summary.profitFactor) : "n/a", tone: performance && performance.summary.profitFactor >= 1.5 ? "positive" : performance && performance.summary.profitFactor < 1 ? "negative" : "neutral" },
      { label: "Winrate", value: performance ? `${performance.summary.winRatePercent.toFixed(1)}%` : "n/a", tone: performance && performance.summary.winRatePercent >= 50 ? "positive" : performance && performance.summary.winRatePercent > 0 ? "negative" : "neutral" },
      { label: "Trades", value: performance ? formatCount(performance.summary.totalTrades) : "n/a", tone: "neutral" },
      { label: "Calmar", value: performance ? formatRatio(performance.summary.calmarRatio) : "n/a", tone: performance && performance.summary.calmarRatio >= 0.5 ? "positive" : performance && performance.summary.calmarRatio < 0 ? "negative" : "neutral" },
      { label: "Expectancy", value: performance ? `${formatPct(performance.summary.expectancyPercent)} /Trade` : "n/a", tone: performance && performance.summary.expectancyPercent > 0 ? "positive" : performance && performance.summary.expectancyPercent < 0 ? "negative" : "neutral" },
      { label: "Positive Months", value: monthly.length ? `${positiveMonths}/${monthly.length}` : "n/a", tone: monthly.length && positiveMonths >= monthly.length / 2 ? "positive" : "neutral" },
    ],
  };
}

export function loadSignalSources(): Array<{ card: SignalCardModel; preview: SignalCardPreview }> {
  return [...WHITE_SWAN_SOURCES, ...CORE_INVEST_SOURCES].flatMap((source) => {
    const file = readStrategyFile(source);
    const trade = latestTrade(file);
    const candles = source.candleSource === "invest_csv" ? readInvestCandles(source.investSymbol) : readCacheCandles(source.candleFile);
    const { price, changePct } = latestPriceChange(candles);
    const signalDate = normalizeDate(trade?.exitTime ?? trade?.entryTime);
    const dataStatus = file && candles.length ? "ok" : file || candles.length ? "partial" : "missing";
    const computedDirection = source.forcedStatus === "PARITY_PENDING"
      ? "PENDING"
      : trade?.direction === "short"
        ? "SHORT"
        : trade?.direction === "long" && !trade.exitTime
          ? "LONG"
          : "CASH";
    const direction = source.forcedDirection ?? computedDirection;
    const status: SignalCardStatus = source.forcedStatus
      ?? (!trade ? "VALIDATION" : !trade.exitTime ? "OPEN" : "CLOSED");
    const card: SignalCardModel = {
      id: source.id,
      group: source.group,
      category: source.category,
      assetSymbol: source.symbol,
      displaySymbol: source.symbol,
      assetName: source.assetName,
      iconKey: source.iconKey,
      strategyName: source.strategyName,
      strategyId: source.strategyId,
      direction,
      status,
      signalDate,
      ageDays: ageDays(signalDate),
      price,
      changePct,
      tp: source.forcedTp ?? toNumber(trade?.tp) ?? undefined,
      sl: source.forcedSl ?? toNumber(trade?.sl) ?? undefined,
      dataStatus,
      nextSignalLabel: computeNextSignalLabel(source.nextSignalSchedule, source.nextSignalDate),
      monitoringTarget: source.monitoringTarget,
    };
    const age = ageDays(signalDate);
    // Hide CLOSED signals older than 7 days
    if (status === "CLOSED" && age !== undefined && age > 7) return [];
    // Hide PAPER_ONLY cards with no recent signal and no active direction (LONG/SHORT)
    const hasRecentSignal = age !== undefined && age <= 7;
    const hasActiveDirection = direction === "LONG" || direction === "SHORT";
    if (status === "PAPER_ONLY" && !hasRecentSignal && !hasActiveDirection) return [];
    return [{ card, preview: buildPreview(card, candles, file) }];
  });
}
