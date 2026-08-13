"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { getEntityHref } from "@/lib/navigation/entity-resolver";
import { InjectPillCss } from "@/components/ui/pill-button";
import { getMonitoringAssetIconUrl } from "@/lib/monitoring/monitoringAssetIcons";
import { TrendingUp, LayoutGrid } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { CapalifeChart, type CapalifeChartApi, type CapalifeChartBar } from "@/components/ui/capitalife-chart";
import type { MonitoringChartData } from "@/components/monitoring/MonitoringChart";
import {
  WS_STRATEGIES, PILLAR_META, type StrategyRow, type Pillar,
  CI_STRATEGIES, CI_META, type CoreInvestRow, type CIPillar,
  CI_PORTFOLIO_KPIS,
} from "@/lib/components/ws-strategy-data";
import {
  WHITE_SWAN_COMPONENT_KPIS,
  WHITE_SWAN_PORTFOLIO_TRUTH,
  activeWhiteSwanComponents,
} from "@/lib/white-swan/portfolio-truth";
import {
  getWhiteSwanExecutionSizing,
  getWhiteSwanExecutionStatus,
  WHITE_SWAN_EXECUTION_BY_ID,
  WHITE_SWAN_EXECUTION_PROFILES,
  type WhiteSwanExecutionStatus,
  type WhiteSwanExecutionProfileId,
} from "@/lib/white-swan/execution-truth";

// ── design tokens ─────────────────────────────────────────────────────────────
const GOLD     = "#D6B24A";
const MUTED    = "rgba(180,192,210,0.6)";
const BG       = "#0c0d10";
const CARD     = "linear-gradient(to bottom, #26262d, #111114)";
const CBORD    = "rgba(255,255,255,0.055)";
const RBORD    = "rgba(255,255,255,0.04)";
const FONT_UI  = "var(--font-montserrat, 'Montserrat', sans-serif)";
const FONT_NUM = "var(--font-numbers, 'Nunito', sans-serif)";
const TEXT_PRIMARY = "#F0F2F6";

// ── asset icon map ────────────────────────────────────────────────────────────
const AI = "/asset-icons/";
const TICKER_ICON: Record<string, string> = {
  "ES1!": AI + "es_s&p.png", "NQ1!": AI + "nasdaq.png", "YM1!": AI + "dow_jones.png",
  "GC1!": AI + "gold.png",   "GLD":  AI + "gold.png",   "SI1!": AI + "silver.png",
  "HG1!": AI + "Kupfer.webp","PL1!": AI + "platinum.png","PA1!": AI + "palladium.png",
  "CL1!": AI + "crude_oil.png","NG1!": AI + "crude_oil.png","RB1!": AI + "crude_oil.png",
  "CT1!": AI + "cotton.png", "SB1!": AI + "sugar.png",  "OJ1!": AI + "orange_juice.jpg",
  "ZC1!": AI + "corn.png",   "ZW1!": AI + "wheat.png",  "ZS1!": AI + "soybeans.png",
  "CC1!": AI + "cocoa.webp", "KC1!": AI + "coffee.png",
  "FDAX1!": AI + "dax.png",  "UKX!": AI + "gbp.png",
  "GOOGL": AI + "google.png","NVDA": AI + "nvidia.png", "MSFT": AI + "microsoft.png",
  "AAPL":  AI + "apple.png", "META": AI + "meta.png",   "AMZN": AI + "amazon.png",
  "6E1!": AI + "eurusd.png", "EURUSD": AI + "eurusd.png", "GBPUSD 30M": AI + "gbpusd.png",
  "DAX 1H / MT": AI + "dax.png", "DAX 2H": AI + "dax.png",
  "QQQ": AI + "nasdaq.png",  "SPY":  AI + "es_s&p.png", "SPMO": AI + "es_s&p.png",
  "6S1!": AI + "chf.png",
  "SEKUSD": AI + "flag_sek.webp", "ZARUSD": AI + "flag_zar.jpg",
  "BRLUSD": AI + "flag_brl.jpg",  "NOKUSD": AI + "flag_nok.webp",
  "MXNUSD": AI + "flag_mxn.png",  "CLPUSD": AI + "flag_clp.webp",
  // seasonal sleeve — fallbacks for assets without dedicated icons
  "ZM1!":  AI + "soybeans.png",   // Soybean Meal → soybeans
  "EEM":   AI + "es_s&p.png",     // EM ETF → ETF icon
  "IWM":   AI + "es_s&p.png",     // Small Cap ETF → ETF icon
};

function TickerIcon({ ticker }: { ticker: string }) {
  const src = TICKER_ICON[ticker];
  if (!src) return null;
  return (
    <img src={src} alt="" width={14} height={14}
      style={{ width: 14, height: 14, objectFit: "contain", borderRadius: 3, flexShrink: 0 }}
      onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
    />
  );
}

// ── types ─────────────────────────────────────────────────────────────────────
type Portfolio = "ws" | "ci";
type SortKey   = "ticker"|"label"|"pillar"|"weight"|"sharpeOos"|"cagr"|"maxDd"|"calmar"|"pf"|"trades"|"wfWin"|"status";
type SortDir   = "desc"|"asc";

const WS_KPIS = [
  { label: "Sharpe OOS", value: WHITE_SWAN_COMPONENT_KPIS.sharpe },
  { label: "CAGR OOS",   value: WHITE_SWAN_COMPONENT_KPIS.cagr   },
  { label: "Max DD",     value: WHITE_SWAN_COMPONENT_KPIS.maxDd  },
  { label: "Calmar",     value: WHITE_SWAN_COMPONENT_KPIS.calmar  },
  { label: "Strategien", value: WHITE_SWAN_COMPONENT_KPIS.strategies },
];
const CI_KPIS = [
  { label: "Sharpe OOS", value: CI_PORTFOLIO_KPIS.sharpe    },
  { label: "CAGR OOS",   value: CI_PORTFOLIO_KPIS.cagr      },
  { label: "Max DD",     value: CI_PORTFOLIO_KPIS.maxDd     },
  { label: "Calmar",     value: CI_PORTFOLIO_KPIS.calmar     },
  { label: "Komponenten", value: CI_PORTFOLIO_KPIS.components },
];

const ACTIVE_WS_COMPONENTS_BY_ID = new Map(activeWhiteSwanComponents.map((component) => [component.id, component]));
const ACTIVE_WS_COMPONENT_IDS = new Set(activeWhiteSwanComponents.map((component) => component.id));
const WHITE_SWAN_TRUTH_NOTE = `Aktiv ${WHITE_SWAN_PORTFOLIO_TRUTH.activeWhiteSwanStrategies} · Σ ${WHITE_SWAN_PORTFOLIO_TRUTH.activeWeightSumPct?.toFixed(2)}% · Watch ${WHITE_SWAN_PORTFOLIO_TRUTH.watchRows} · Research ${WHITE_SWAN_PORTFOLIO_TRUTH.researchRows} · Reserve ${WHITE_SWAN_PORTFOLIO_TRUTH.cashMarginReservePct}%`;

// ── unified display row ───────────────────────────────────────────────────────
interface DisplayRow {
  id: string; section: Portfolio;
  ticker: string; label: string; group: string; engine: string;
  pillarKey: string; pillarLabel: string;
  weight: number | null; sharpeOos: number | null;
  cagr: string | null; maxDd: string | null;
  pf: number | null; trades: number | null;
  wfWin: string | null; calmar: number | null;
  canonicalStrategyId?: string;
  signalInstrument?: string;
  executionInstrument?: string;
  executionModel?: "etf" | "equity" | "future" | "fx";
  minQty?: number | null;
  riskPerTradePctEquity?: number | null;
  riskPerTradeUsd?: number | null;
  executionQty?: number | null;
  initialMarginUsd?: number | null;
  maintenanceMarginUsd?: number | null;
  executionStatus?: WhiteSwanExecutionStatus;
  executionNote?: string;
  status: string; dataFile?: string; intradayId?: string; codexGroup?: string; codexSymbol?: string; isNotes?: string; exchange?: string; brainPath?: string;
}

function wsRow(r: StrategyRow): DisplayRow {
  const activeConfig = ACTIVE_WS_COMPONENTS_BY_ID.get(r.id);
  return {
    id: r.id, section: "ws",
    ticker: r.ticker, label: r.label, group: r.group, engine: r.engine,
    pillarKey: r.pillar, pillarLabel: PILLAR_META[r.pillar as Pillar].label,
    weight: activeConfig?.displayWeightPct ?? r.weight, sharpeOos: r.sharpeOos,
    cagr: r.cagr, maxDd: r.maxDd, pf: r.pf, trades: r.trades,
    wfWin: r.wfOos, calmar: r.calmar, status: r.status,
    canonicalStrategyId: activeConfig?.canonicalStrategyId,
    signalInstrument: activeConfig?.signalInstrument,
    executionInstrument: activeConfig?.executionInstrument,
    executionModel: activeConfig?.executionModel,
    minQty: activeConfig?.minQty,
    riskPerTradePctEquity: activeConfig?.riskPerTradePctEquity,
    riskPerTradeUsd: activeConfig?.riskPerTradeUsd,
    executionQty: activeConfig?.executionQty,
    initialMarginUsd: activeConfig?.initialMarginUsd,
    maintenanceMarginUsd: activeConfig?.maintenanceMarginUsd,
    executionStatus: activeConfig?.executionStatus,
    executionNote: activeConfig?.executionNote,
    dataFile: r.dataFile, intradayId: r.intradayId, codexGroup: r.codexGroup, codexSymbol: r.codexSymbol, isNotes: r.isNotes, exchange: r.exchange, brainPath: r.brainPath,
  };
}
function ciRow(r: CoreInvestRow): DisplayRow {
  return {
    id: r.id, section: "ci",
    ticker: r.ticker, label: r.label, group: r.group, engine: r.engine,
    pillarKey: r.pillar, pillarLabel: CI_META[r.pillar as CIPillar]?.label ?? r.pillar,
    weight: r.weight, sharpeOos: r.sharpe ?? null,
    cagr: r.cagr ?? null, maxDd: r.maxDd, pf: r.pf, trades: r.trades,
    wfWin: r.winRate, calmar: r.calmar ?? null, status: r.status, isNotes: r.notes,
  };
}

const WS_ROWS = WS_STRATEGIES.map(wsRow);
const CI_ROWS = CI_STRATEGIES.map(ciRow);

// ── OHLC in-memory cache (persists for session, avoids re-fetch on every expand) ─
type OhlcCacheEntry = { bars: OhlcBar[]; ts: number };
const OHLC_CACHE = new Map<string, OhlcCacheEntry>();
const OHLC_CACHE_TTL = 60_000; // 60s before background refresh

// known data-start dates per ticker (DD.MM.YYYY format for Von column)
const TICKER_VON: Record<string, string> = {
  "CT1!": "01.01.1970", "ZC1!": "01.01.1970", "SB1!": "01.01.1970", "OJ1!": "01.01.1970",
  "ZW1!": "01.01.1970", "ZS1!": "01.01.1970", "CC1!": "01.01.1970", "KC1!": "01.01.1970",
  "GC1!": "01.01.1975", "SI1!": "01.01.1975", "HG1!": "01.01.1988",
  "CL1!": "01.01.1983", "NG1!": "01.01.1991",
  "ES1!": "01.01.1993", "NQ1!": "01.01.1996", "YM1!": "01.01.1997",
  "FDAX1!": "01.01.2000", "UKX!": "01.01.2001",
  "6E1!": "13.01.2003", "6B1!": "01.01.2003", "6S1!": "01.01.2003", "6J1!": "01.01.2003",
  "GOOGL": "19.08.2004", "AAPL": "12.12.1980", "MSFT": "13.03.1986", "NVDA": "22.01.1999",
  "META": "18.05.2012", "AMZN": "15.05.1997",
  "QQQ": "10.03.1999", "SPY": "22.01.1993", "GLD": "18.11.2004", "SPMO": "12.10.2015",
  "VLUE": "16.04.2013", "RSP": "24.04.2003", "QUAL": "16.07.2013",
  "MTUM": "16.04.2013", "USMV": "18.10.2011", "IWM": "22.05.2000", "BIL": "25.05.2007",
  "ZM1!": "01.01.1970",
  "ZARUSD": "01.01.2003", "SEKUSD": "01.01.2003", "BRLUSD": "01.01.2003",
};

// ── live feed ─────────────────────────────────────────────────────────────────
interface LiveFeedItem {
  symbol: string; tab: string; source: string;
  lastClose: number | null; changePct: number | null;
  lastDate: string | null; firstDate: string | null; refreshedAt: string | null;
  barCount: number | null; dataStatus: "live"|"daily"|"missing"; liveRefreshSeconds: number | null;
}

// ── live state (open trades) ──────────────────────────────────────────────────
interface LiveTrade {
  symbol: string; direction: string; entry_price: number;
  entry_date: string; strategy_id: string; pnl: number | null; notes: string | null;
}

const LIVE_SYMBOL_MAP: Record<string, string[]> = {
  "6E1!":        ["6E1!", "EURUSD", "EUR/USD", "6E"],
  "EURUSD":      ["EURUSD", "6E1!", "EUR/USD", "6E"],
  "DAX 1H / MT": ["FDAX1!", "DAX", "DAX40", "GER40"],
  "DAX 2H":      ["FDAX1!", "DAX", "DAX40"],
  "FDAX1!":      ["FDAX1!", "DAX", "DAX40"],
  "ES1!":        ["ES1!", "S&P500", "US500"],
  "NQ1!":        ["NQ1!", "NAS100", "NASDAQ"],
  "YM1!":        ["YM1!", "US30", "DOW30"],
  "GC1!":        ["GC1!", "GOLD", "XAU"],
  "GLD":         ["GLD", "GC1!", "GOLD"],
  "CT1!":        ["CT1!", "COTTON"],
  "GOOGL":       ["GOOGL", "GOOGLE"],
};

// maps display ticker → OHLC API symbol
const OHLC_SYMBOL: Record<string, string> = {
  "DAX 1H / MT": "FDAX1!",
  "DAX 2H":      "FDAX1!",
  "GBPUSD 30M":  "6B1!",
  "GLD":         "GC1!",
};
function toOhlcSymbol(ticker: string): string {
  return OHLC_SYMBOL[ticker] ?? ticker.split(" ")[0];
}

function matchLive(ticker: string, live: Map<string, LiveFeedItem>): LiveFeedItem | null {
  const candidates = LIVE_SYMBOL_MAP[ticker] ?? [ticker, ticker.replace("1!", ""), ticker.split(" ")[0]];
  for (const k of candidates) {
    const v = live.get(k);
    if (v) return v;
  }
  for (const [key, val] of live) {
    const base = ticker.split(" ")[0].replace("1!", "").toUpperCase();
    if (key.toUpperCase().startsWith(base) || base.startsWith(key.replace("1!", "").toUpperCase())) return val;
  }
  return null;
}

function fmtPrice(v: number, ticker: string): string {
  const isFx = /EURUSD|GBPUSD|6E|6B|6S|ZARUSD|BRLUSD|SEKUSD/.test(ticker) && !/1H|2H/.test(ticker);
  if (isFx && v < 100) return v.toFixed(4);
  if (v > 10000) return v.toLocaleString("de", { maximumFractionDigits: 0 });
  if (v > 100) return v.toFixed(2);
  return v.toFixed(3);
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!isFinite(d.getTime())) return "—";
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

function fmtDateTime(iso: string | null): string {
  const d = iso ? new Date(iso) : new Date();
  if (!isFinite(d.getTime())) return fmtDateTime(null);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// Von date: firstDate from API, then OHLC cache first bar, then TICKER_VON lookup, then barCount estimate
function estimateVon(item: LiveFeedItem, ticker?: string): string {
  if (item.firstDate) return fmtDate(item.firstDate);
  if (ticker) {
    const sym = toOhlcSymbol(ticker);
    // TICKER_VON has actual inception dates — preferred over OHLC cache (which may have limited history)
    // Check original ticker first (e.g. GLD=18.11.2004) before aliased OHLC symbol (GC1!=01.01.1975)
    const von = TICKER_VON[ticker.split(" ")[0]] ?? TICKER_VON[sym] ?? null;
    if (von) return von;
    const cached = OHLC_CACHE.get(sym + ":1D");
    if (cached?.bars?.length) return fmtDate(cached.bars[0].time);
  }
  if (item.lastDate && item.barCount && item.barCount > 0) {
    const last = new Date(item.lastDate);
    last.setDate(last.getDate() - Math.round(item.barCount * 1.4));
    return fmtDate(last.toISOString());
  }
  return "—";
}

// ── data types ────────────────────────────────────────────────────────────────
interface EP { time: string; value: number; }
interface OhlcBar { time: string; open: number; high: number; low: number; close: number; }
interface StrategyData {
  summary: { oos: { sharpe: number; cagr: number; maxDrawdownPercent: number; profitFactor: number; tradeCount: number; winRate: number; finalEquity: number } };
  equityCurve: { oos: EP[]; full?: EP[]; is_?: EP[] }; drawdownCurve: { oos: EP[] };
}

// ── helpers ───────────────────────────────────────────────────────────────────
const fmtN = (v: number | null, d = 2) => v === null ? "—" : v.toFixed(d);

function numColor(v: number | null): string {
  if (v === null) return "rgba(255,255,255,0.2)";
  return v < 0 ? GOLD : "rgba(255,255,255,0.85)";
}
function strNumColor(s: string | null): string {
  if (!s || s === "—") return "rgba(255,255,255,0.2)";
  if (s.startsWith("−") || s.startsWith("-")) return GOLD;
  return "rgba(255,255,255,0.8)";
}

function executionStatusLabel(status?: string) {
  switch (status) {
    case "EXECUTABLE_10K_NATIVE":
      return "Native";
    case "EXECUTABLE_10K_SMALLER_CONTRACT":
      return "Smaller contract";
    case "EXECUTABLE_10K_VALIDATED_PROXY":
      return "Validated proxy";
    case "NOT_EXECUTABLE_10K":
      return "Not executable";
    default:
      return "—";
  }
}

function formatUsd(value?: number | null) {
  if (value == null) return "—";
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function formatQty(value?: number | null) {
  if (value == null) return "—";
  return Number.isInteger(value) ? String(value) : String(value);
}

function SwanIcon({ size = 13 }: { size?: number }) {
  return <img src="/branding/white-swan-logo.png" alt="WS" width={size} height={size} style={{ width: size, height: size, objectFit: "contain" }} />;
}

// ── KPI cards ─────────────────────────────────────────────────────────────────
function HKpi({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${CBORD}`, borderRadius: 14, padding: "8px 14px", boxShadow: "0 6px 18px -8px rgba(0,0,0,0.6)", minWidth: 78 }}>
      <div style={{ fontFamily: FONT_UI, fontSize: 9, fontWeight: 700, color: MUTED, letterSpacing: ".08em", textTransform: "uppercase" as const, marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: FONT_NUM, fontSize: 18, fontWeight: 700, letterSpacing: "-.02em", color: TEXT_PRIMARY, lineHeight: 1 }}>{value}</div>
    </div>
  );
}

function EKpi({ label, value }: { label: string; value: string }) {
  const color = (() => {
    if (!value || value === "—") return "rgba(255,255,255,0.2)";
    if (value.startsWith("−") || value.startsWith("-")) return "#ff8080";
    if (/^[+]/.test(value) || /^\d/.test(value)) return "#a8e6b0";
    return "#f0f2f6";
  })();
  return (
    <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 6, padding: "7px 10px", flex: "1 1 0", minWidth: 0 }}>
      <div style={{ fontFamily: FONT_UI, fontSize: 9, fontWeight: 600, color: "rgba(255,255,255,0.38)", letterSpacing: ".06em", textTransform: "uppercase" as const, marginBottom: 4, whiteSpace: "nowrap" as const }}>{label}</div>
      <div style={{ fontFamily: FONT_NUM, fontSize: 16, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

// ── section label helper ───────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.08em", color: "rgba(255,255,255,0.35)", textTransform: "uppercase" as const, fontFamily: FONT_UI, marginBottom: 4 }}>
      {children}
    </div>
  );
}

// ── filter pill ───────────────────────────────────────────────────────────────
function Pill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rc-pill ${active ? "rc-active" : "rc-inactive"}`}
      style={{
        fontFamily: FONT_UI, fontSize: 10, fontWeight: active ? 700 : 500,
        letterSpacing: ".07em", textTransform: "uppercase" as const,
        padding: "5px 12px",
        color: active ? "#F3F3F4" : "#6a6e7a",
      }}
    >{label}</button>
  );
}

// ── status chip ───────────────────────────────────────────────────────────────
function Chip({ status }: { status: string }) {
  const cfg: Record<string, { label: string; c: string }> = {
    active:         { label: "Aktiv",      c: "rgba(255,255,255,0.5)" },
    watch:          { label: "Watch",      c: GOLD },
    archived:       { label: "Archiviert", c: "rgba(255,255,255,0.15)" },
    historical_reference: { label: "Historisch",      c: "#9CA3AF" },
    research:             { label: "Research",        c: "rgba(255,255,255,0.3)" },
    validation:           { label: "Validation",      c: "rgba(255,255,255,0.45)" },
    parity_pending:       { label: "Pending",         c: GOLD },
    parity_partial:       { label: "⚠ Parity partiell", c: "#f59e0b" },
    validiert:            { label: "Validiert",        c: "#22c55e" },
  };
  const s = cfg[status] ?? { label: status, c: MUTED };
  return (
    <span style={{ fontFamily: FONT_UI, fontSize: 10, fontWeight: 600, color: s.c, display: "inline-flex", alignItems: "center", gap: 4 }}>
      <span style={{ width: 4, height: 4, borderRadius: "50%", background: s.c, flexShrink: 0 }} />
      {s.label}
    </span>
  );
}

// ── signal cell — gray checkmark for pending, dash for no signal ──────────────
function SignalCell({ hasTrade }: { hasTrade: boolean }) {
  if (!hasTrade) {
    return <span style={{ fontSize: 9, color: "rgba(255,255,255,0.2)" }}>—</span>;
  }
  // gray checkmark (pending_valid style matching signals page)
  return (
    <svg width={13} height={13} viewBox="0 0 13 13" fill="none" style={{ display: "inline-block", verticalAlign: "middle" }}>
      <circle cx={6.5} cy={6.5} r={5.5} stroke="rgba(255,255,255,0.22)" strokeWidth={1} />
      <path d="M4 6.5l2 2 3-3" stroke="rgba(255,255,255,0.38)" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── sortable th ───────────────────────────────────────────────────────────────
function Th({ label, k, sortKey, sortDir, onSort, align = "left", agg }: {
  label: string; k: SortKey; sortKey: SortKey | null; sortDir: SortDir;
  onSort: (k: SortKey) => void; align?: "left"|"right"; agg?: string;
}) {
  const active = sortKey === k;
  return (
    <th onClick={() => onSort(k)} style={{
      fontFamily: FONT_UI,
      fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" as const,
      color: active ? "#f5f7fa" : MUTED,
      padding: "0 8px 9px", whiteSpace: "nowrap" as const, textAlign: align,
      borderBottom: `1px solid ${RBORD}`, background: BG,
      userSelect: "none" as const, cursor: "pointer", transition: "color .1s",
    }}>
      {agg && <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: ".03em", color: "rgba(255,255,255,0.50)", marginBottom: 2, textTransform: "none" as const }}>{agg}</div>}
      {label}{active && <span style={{ marginLeft: 3, fontSize: 9, opacity: 0.65 }}>{sortDir === "desc" ? "↓" : "↑"}</span>}
    </th>
  );
}

// ── live countdown ring ───────────────────────────────────────────────────────
function LiveTimer({ secs, max }: { secs: number; max: number }) {
  const r = 6, circ = 2 * Math.PI * r;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <svg width={14} height={14} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={7} cy={7} r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={1.5} />
        <circle cx={7} cy={7} r={r} fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth={1.5}
          strokeDasharray={`${circ * (secs / max)} ${circ}`} strokeLinecap="round" />
      </svg>
      <span style={{ fontFamily: FONT_UI, fontSize: 10, color: MUTED, fontVariantNumeric: "tabular-nums" }}>{secs}s</span>
    </span>
  );
}

// ── intraday equity data shape ────────────────────────────────────────────────
interface IntradayCurvePoint { date: string; equity: number; }
interface IntradayPeriodStats { cagr: number; maxDD: number; mar?: number; sharpe: number; pf: number; n: number; wr: number; }
interface IntradayStrategy {
  id: string; title: string; timeframe?: string;
  is?: { curve: IntradayCurvePoint[]; stats: IntradayPeriodStats };
  oos: { curve: IntradayCurvePoint[]; stats: IntradayPeriodStats };
}

// ticker → correct OHLC timeframe for intraday strategies
const TICKER_TF: Record<string, string> = {
  "6E1!":        "30M",
  "EURUSD":      "30M",
  "GBPUSD 30M":  "30M",
  "DAX 1H / MT": "1H",
  "DAX 2H":      "2H",
};

// ── candle chart — CapalifeChart wrapper with OHLC cache ─────────────────────
function CandleChart({ ticker, timeframe = "1D", refreshSecs = 30, assetName }: { ticker: string; timeframe?: string; refreshSecs?: number; assetName?: string }) {
  const sym      = toOhlcSymbol(ticker);
  const cacheKey = sym + ":1D";
  const cached   = OHLC_CACHE.get(cacheKey);

  const [bars, setBars] = useState<OhlcBar[] | null>(cached ? cached.bars : null);
  const chartApiRef     = useRef<CapalifeChartApi | null>(null);
  const fetchBars       = useRef(() => {});

  useEffect(() => {
    const symEnc = encodeURIComponent(sym);
    fetchBars.current = () => {
      fetch(`/api/monitoring/ohlc?symbol=${symEnc}&timeframe=1D`)
        .then(r => r.json())
        .then(d => {
          const b: OhlcBar[] = Array.isArray(d.bars) && d.bars.length ? d.bars : [];
          OHLC_CACHE.set(cacheKey, { bars: b, ts: Date.now() });
          setBars(b);
          if (chartApiRef.current && b.length) {
            chartApiRef.current.setOverlayBars(b as unknown as CapalifeChartBar[]);
          }
        })
        .catch(() => { if (!OHLC_CACHE.has(cacheKey)) setBars([]); });
    };
    if (!cached || Date.now() - cached.ts > OHLC_CACHE_TTL) {
      fetchBars.current();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker]);

  useEffect(() => {
    const id = setInterval(() => fetchBars.current(), refreshSecs * 1000);
    return () => clearInterval(id);
  }, [refreshSecs]);

  const filteredBars: OhlcBar[] | null = bars ? (() => {
    const pre = bars.filter(b => (b.high - b.low) / Math.max(b.close, 0.0001) > 0.0002);
    return pre.filter((b, i) => {
      if (i === 0) return true;
      const prev = pre[i - 1];
      return Math.abs(b.open - prev.close) / Math.max(prev.close, 0.0001) < 0.40;
    });
  })() : null;

  const chartData: MonitoringChartData | null = filteredBars?.length ? {
    displaySymbol: ticker.replace("1!", ""),
    displayName:  assetName ?? ticker,
    timeframe:    "1D",
    bars:         filteredBars.map(b => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close })),
    signals:      [],
    boxes:        [],
  } : null;

  const iconUrl = getMonitoringAssetIconUrl({ code: ticker, name: assetName, displaySymbol: ticker });

  return (
    <div style={{ height: 300, borderRadius: 8, overflow: "hidden" }}>
      <CapalifeChart
        symbol={ticker.replace("1!", "")}
        instrument={assetName}
        timeframe={timeframe}
        showHeader={true}
        showPriceOverlay={true}
        showRangeBar={true}
        showResetButton={true}
        iconUrl={iconUrl ?? undefined}
        data={chartData}
        onChartReady={(api) => {
          chartApiRef.current = api;
          if (filteredBars?.length) {
            api.setOverlayBars(filteredBars as unknown as CapalifeChartBar[]);
          }
        }}
      />
    </div>
  );
}

// ── equity / drawdown charts — synchronized crosshair via syncId ──────────────
const SYNC_ID_PREFIX = "eq-dd-";

// Identical margins ensure pixel-perfect X-axis alignment between the two stacked charts
const CHART_M   = { top: 4, right: 44, bottom: 0, left: 0 };
const CHART_M_X = { top: 2, right: 44, bottom: 4, left: 0 }; // DdChart gets bottom space for X labels
const Y_WIDTH   = 38; // same for both charts
const AXIS_TICK = { fill: "rgba(180,192,210,0.5)", fontSize: 8, fontFamily: "var(--font-numbers, 'Nunito', sans-serif)" };
const TOOLTIP_STYLE = { background: "#1e1e24", border: `1px solid rgba(255,255,255,0.055)`, borderRadius: 8, fontSize: 10, fontFamily: "var(--font-montserrat, 'Montserrat', sans-serif)", color: "#F0F2F6" };
const CURSOR_STYLE  = { stroke: "rgba(255,255,255,0.22)", strokeWidth: 1, strokeDasharray: "3 3" };

const REF_LINE_STYLE = { stroke: "rgba(255,255,255,0.28)", strokeDasharray: "4 3", strokeWidth: 1 };

const PANEL_BG   = "#0b0c10";
const PANEL_BORD = "1px solid rgba(255,255,255,0.07)";

function EqChart({ pts, label, syncId, oosStart }: { pts: EP[]; label: string; syncId: string; oosStart?: string }) {
  const d = pts.map(p => ({ t: p.time.slice(0, 7), v: Math.round(p.value * 100) / 100 }));
  const vals = d.map(p => p.v);
  const mn = Math.min(...vals); const mx = Math.max(...vals);
  const oosKey = oosStart ? oosStart.slice(0, 7) : undefined;
  return (
    <div style={{ background: PANEL_BG, border: PANEL_BORD, borderRadius: 8, padding: "8px 8px 4px", marginBottom: 0 }}>
      <SectionLabel>{label}</SectionLabel>
      <ResponsiveContainer width="100%" height={95}>
        <AreaChart data={d} margin={CHART_M} syncId={syncId}>
          <defs><linearGradient id="eqg2" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#fff" stopOpacity={0.08}/><stop offset="95%" stopColor="#fff" stopOpacity={0}/></linearGradient></defs>
          <XAxis dataKey="t" hide />
          <YAxis hide domain={[mn * 0.995, mx * 1.005]} />
          <Tooltip contentStyle={TOOLTIP_STYLE}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={(v: any) => [`$${Number(v ?? 0).toLocaleString("de", { maximumFractionDigits: 0 })}`, "Equity"]}
            cursor={CURSOR_STYLE} />
          <Area type="monotone" dataKey="v" stroke="#ffffff" strokeWidth={1.5} fill="url(#eqg2)" dot={false} activeDot={{ r: 3, fill: "#fff", strokeWidth: 0 }} />
          {oosKey && <ReferenceLine x={oosKey} stroke="#D6B24A" strokeDasharray="4 3" strokeWidth={1} label={{ value: "IS / OOS", position: "insideTopRight", fill: "rgba(214,178,74,0.7)", fontSize: 8, fontFamily: FONT_UI }} />}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function DdChart({ pts, syncId, oosStart }: { pts: EP[]; syncId: string; oosStart?: string }) {
  const d = pts.map(p => ({ t: p.time.slice(0, 7), v: Math.round(p.value * 100) / 100 }));
  const vals = d.map(p => p.v);
  const mn = Math.min(...vals, -0.01);
  const oosKey = oosStart ? oosStart.slice(0, 7) : undefined;
  return (
    <div style={{ background: PANEL_BG, border: PANEL_BORD, borderRadius: 8, padding: "8px 8px 4px", marginTop: 0 }}>
      <SectionLabel>Drawdown</SectionLabel>
      <ResponsiveContainer width="100%" height={72}>
        <AreaChart data={d} margin={CHART_M} syncId={syncId}>
          <defs><linearGradient id="ddg2" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={GOLD} stopOpacity={0.15}/><stop offset="95%" stopColor={GOLD} stopOpacity={0}/></linearGradient></defs>
          <XAxis dataKey="t" hide />
          <YAxis hide domain={[mn * 1.1, 0]} />
          <Tooltip contentStyle={TOOLTIP_STYLE}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={(v: any) => [`${Number(v ?? 0).toFixed(2)}%`, "DD"]}
            cursor={CURSOR_STYLE} />
          <Area type="monotone" dataKey="v" stroke="#D6B24A" strokeWidth={1.5} fill="url(#ddg2)" dot={false} activeDot={{ r: 3, fill: "#D6B24A", strokeWidth: 0 }} />
          {oosKey && <ReferenceLine x={oosKey} stroke="#D6B24A" strokeDasharray="4 3" strokeWidth={1} />}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── synthetic equity/drawdown curve from CAGR + MaxDD ────────────────────────
function syntheticCurves(cagrStr: string | null, maxDdStr: string | null): { eq: EP[]; dd: EP[] } | null {
  const cagrPct = parseFloat((cagrStr ?? "").replace(/[^0-9.-]/g, ""));
  const ddPct   = Math.abs(parseFloat((maxDdStr ?? "").replace(/[^0-9.-]/g, "")));
  if (!isFinite(cagrPct) || !isFinite(ddPct)) return null;

  const monthlyRate = Math.pow(1 + cagrPct / 100, 1 / 12) - 1;
  const eq: EP[] = []; const dd: EP[] = [];
  let equity = 10000; let peak = 10000;
  const startY = 2019; const startM = 1;
  const now = new Date(); const endY = now.getFullYear(); const endM = now.getMonth() + 1;

  for (let y = startY, m = startM; y < endY || (y === endY && m <= endM); ) {
    const idx = (y - startY) * 12 + (m - 1);
    // deterministic wave to simulate volatility (no Math.random)
    const wave = Math.sin(idx * 0.41) * 0.008 + Math.sin(idx * 1.17) * 0.004;
    equity = equity * (1 + monthlyRate + wave);
    if (equity > peak) peak = equity;
    const drawdown = peak > 0 ? ((peak - equity) / peak) * -100 : 0;
    // clamp drawdown to not exceed maxDD (scale it)
    const scaledDd = Math.max(-ddPct, drawdown);
    const time = `${y}-${String(m).padStart(2, "0")}-01`;
    eq.push({ time, value: Math.round(equity) });
    dd.push({ time, value: Math.round(scaledDd * 100) / 100 });
    m++; if (m > 12) { m = 1; y++; }
  }
  return { eq, dd };
}

// ── strategy info helpers ─────────────────────────────────────────────────────
function inferDirection(engine: string): string {
  const e = engine.toLowerCase();
  if (e.includes("long-only") || e.includes("long only")) return "Long Only";
  if (e.includes("short-only") || e.includes("short only")) return "Short Only";
  if (e.includes("long") && e.includes("short")) return "Long & Short";
  if (e.includes("long")) return "Long";
  if (e.includes("short")) return "Short";
  return "Long & Short";
}

function pillarDescription(pillar: string): string {
  switch (pillar) {
    case "valuation": return "Fundamentale Überbewertung / Unterbewertung als Einstiegssignal. Modell-basiert, kein Pattern.";
    case "macro":     return "Makroökonomischer Filter (z.B. Trend-Regime, saisonale Makrostruktur). Hält Positionen über Wochen.";
    case "trend":     return "EMA-basierter Trendfolge-Ansatz. Einstieg bei Crossover, Ausstieg bei Gegentrend.";
    case "seasonal":  return "Kalender-basiertes Muster (festes Datum Ein-/Ausstieg). Historisch replizierbares Saisonal-Phänomen.";
    case "anomaly":   return "Wochentagsanomalie (z.B. Freitag-Long, Dienstag-Reversal). Marktstruktur-basiert.";
    case "intraday":  return "Intraday Mean-Reversion / Momentum. Hält keine Positionen über Nacht. Session-gebunden.";
    default:          return "Multi-Asset Strategie.";
  }
}

function dataRangeLabel(pillar: string, intradayId?: string): string {
  if (intradayId) return "IS: 2006 – 2017 · OOS: Dez 2017 – laufend (live)";
  if (pillar === "anomaly") return "IS+OOS: Jan 2003 – laufend (live)";
  return "OOS: Jan 2019 – Jun 2026";
}

// ── expanded row — candle chart left, equity/drawdown/KPIs right ──────────────
function ExpandedRow({ row }: { row: DisplayRow }) {
  const [data, setData]         = useState<StrategyData | null>(null);
  const [intraday, setIntraday] = useState<IntradayStrategy | null>(null);
  const [codexEq, setCodexEq]   = useState<EP[] | null>(null);
  const [codexDd, setCodexDd]   = useState<EP[] | null>(null);
  const [brainEq, setBrainEq]   = useState<EP[] | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [executionProfileId, setExecutionProfileId] =
    useState<WhiteSwanExecutionProfileId>("WHITE_SWAN_IBKR_10K_USD_V1");

  const isRealtime = row.pillarKey === "anomaly" || row.pillarKey === "intraday";
  const refreshSecs = isRealtime ? 5 : 30;

  // Priority 1: dataFile → full anomaly JSON (equity + drawdown)
  useEffect(() => {
    if (!row.dataFile) return;
    fetch(`/data/${row.dataFile}`).then(r => r.json()).then(setData).catch(() => {});
  }, [row.dataFile]);

  // Priority 2: codex API → equity + drawdown (seasonal/macro)
  useEffect(() => {
    if (!row.codexGroup || !row.codexSymbol || row.dataFile || row.intradayId) return;
    const g = row.codexGroup, s = row.codexSymbol;
    fetch(`/api/monitoring/codex-equity-curve?group=${g}&symbol=${s}&type=equity`)
      .then(r => r.json())
      .then((d: { rows?: Array<{ date: string; value: number }> }) => {
        if (d.rows?.length)
          setCodexEq(d.rows.map(p => ({ time: p.date.length === 7 ? p.date + "-01" : p.date, value: p.value })));
      })
      .catch(() => {});
    fetch(`/api/monitoring/codex-equity-curve?group=${g}&symbol=${s}&type=drawdown`)
      .then(r => r.json())
      .then((d: { rows?: Array<{ date: string; value: number }> }) => {
        if (d.rows?.length)
          setCodexDd(d.rows.map(p => ({ time: p.date.length === 7 ? p.date + "-01" : p.date, value: p.value })));
      })
      .catch(() => {});
  }, [row.codexGroup, row.codexSymbol, row.dataFile, row.intradayId]);

  // Priority 3b: brainPath → /api/monitoring/brain-equity (valuation daily curves)
  useEffect(() => {
    if (!row.brainPath || row.dataFile || row.intradayId || row.codexGroup) return;
    fetch(`/api/monitoring/brain-equity?key=${encodeURIComponent(row.brainPath)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const pts: Array<{ time: string; value: number }> = d?.pts ?? [];
        if (pts.length) setBrainEq(pts.map(p => ({ time: p.time, value: p.value })));
      })
      .catch(() => {});
  }, [row.brainPath, row.dataFile, row.intradayId, row.codexGroup]);

  // Priority 3: intradayId → intraday-equity.json (always — real OOS equity)
  useEffect(() => {
    if (!row.intradayId || row.dataFile) return;
    fetch("/data/intraday-equity.json")
      .then(r => r.json())
      .then((d: { strategies: IntradayStrategy[] }) => {
        const s = d.strategies.find(x => x.id === row.intradayId);
        setIntraday(s ?? null);
      })
      .catch(() => {});
  }, [row.intradayId, row.dataFile]);

  const eqOos = data?.equityCurve?.oos;
  const eqFull = data?.equityCurve?.full;
  const ddOos = data?.drawdownCurve?.oos;
  const oos   = data?.summary?.oos;

  // intraday: combine IS + OOS for full history — chain OOS to continue from IS end value
  const intradayFull: EP[] | null = (() => {
    if (!intraday) return null;
    const isC  = (intraday.is?.curve  ?? []).map(p => ({ time: p.date + "-01", value: p.equity }));
    const oosC = (intraday.oos?.curve ?? []).map(p => ({ time: p.date + "-01", value: p.equity }));
    if (!isC.length) return oosC.length ? oosC : null;
    if (!oosC.length) return isC;
    // scale OOS so first OOS point == last IS point (no vertical gap)
    const isEnd  = isC[isC.length - 1].value;
    const oosBase = oosC[0].value;
    const scale = oosBase > 0 ? isEnd / oosBase : 1;
    const oosScaled = oosC.map(p => ({ time: p.time, value: p.value * scale }));
    return [...isC, ...oosScaled];
  })();
  const ist = intraday?.oos?.stats;

  // OOS boundary date for vertical line
  const oosStart: string | undefined = (() => {
    if (eqFull?.length && eqOos?.length) return eqOos[0]?.time;             // anomaly: first OOS point
    if (intraday?.oos?.curve?.length)    return intraday.oos.curve[0]!.date + "-01"; // intraday OOS start
    return undefined;
  })();

  // correct candle timeframe per ticker
  const candleTf = TICKER_TF[row.ticker] ?? "1D";

  // always provide synthetic curves as fallback for missing pieces
  const hasRealEq = (eqFull?.length ?? 0) > 0 || (eqOos?.length ?? 0) > 0 || (codexEq?.length ?? 0) > 0 || (intradayFull?.length ?? 0) > 0 || (brainEq?.length ?? 0) > 0;
  const synthAll  = syntheticCurves(row.cagr, row.maxDd);

  // priority: anomaly full > intraday full > OOS only > brain daily > codex > synthetic
  const activeEq: EP[] = eqFull?.length ? eqFull : intradayFull?.length ? intradayFull : eqOos?.length ? eqOos : brainEq?.length ? brainEq : codexEq?.length ? codexEq : synthAll?.eq ?? [];

  // drawdown always computed FROM activeEq — guarantees same point count & X alignment
  const activeDd: EP[] = (() => {
    if (!activeEq.length) return synthAll?.dd ?? [];
    let peak = activeEq[0]?.value ?? 0;
    return activeEq.map(p => {
      if (p.value > peak) peak = p.value;
      const dd = peak > 0 ? ((p.value - peak) / peak) * 100 : 0;
      return { time: p.time, value: Math.round(dd * 100) / 100 };
    });
  })();

  const isSynthetic = !hasRealEq;

  const eqLabel = isSynthetic ? "Equity (Sim)" : "Equity";

  // KPI cards — Sharpe, CAGR, MaxDD, PF, Trades, Calmar, WinRate + "Mehr" button
  const kpis: Array<{ label: string; value: string }> = [];
  if (row.sharpeOos !== null)          kpis.push({ label: "Sharpe OOS",    value: fmtN(row.sharpeOos) });
  else if (ist?.sharpe != null)        kpis.push({ label: "Sharpe OOS",    value: fmtN(ist.sharpe) });
  if (oos?.cagr != null)               kpis.push({ label: "CAGR OOS",      value: `${oos.cagr > 0 ? "+" : ""}${oos.cagr.toFixed(2)}%` });
  else if (ist?.cagr != null)          kpis.push({ label: "CAGR OOS",      value: `+${fmtN(ist.cagr)}%` });
  else if (row.cagr)                   kpis.push({ label: "CAGR",          value: row.cagr });
  if (oos?.maxDrawdownPercent != null) kpis.push({ label: "Max DD",        value: `−${Math.abs(oos.maxDrawdownPercent).toFixed(2)}%` });
  else if (ist?.maxDD != null)         kpis.push({ label: "Max DD",        value: `−${fmtN(ist.maxDD)}%` });
  else if (row.maxDd)                  kpis.push({ label: "Max DD",        value: row.maxDd });
  if (row.pf != null)                  kpis.push({ label: "Profit Factor", value: fmtN(row.pf) });
  else if (ist?.pf != null)            kpis.push({ label: "Profit Factor", value: fmtN(ist.pf) });
  if (row.trades != null)              kpis.push({ label: "Trades",        value: String(row.trades) });
  else if (ist?.n != null)             kpis.push({ label: "Trades",        value: String(ist.n) });
  if (row.calmar != null)              kpis.push({ label: "Calmar",        value: fmtN(row.calmar) });
  else if (ist?.mar != null)           kpis.push({ label: "Calmar",        value: fmtN(ist.mar) });
  if (ist?.wr != null)                 kpis.push({ label: "Win Rate",      value: `${(ist.wr * 100).toFixed(1)}%` });
  else if (oos?.winRate != null)       kpis.push({ label: "Win Rate",      value: `${oos.winRate.toFixed(1)}%` });

  // Info panel — 4 thematic boxes
  const dir   = inferDirection(row.engine);
  const sharpeV  = row.sharpeOos ?? ist?.sharpe ?? null;
  const calmarV  = ist?.mar ?? row.calmar ?? null;
  const pfV      = row.pf ?? ist?.pf ?? oos?.profitFactor ?? null;
  const tradesV  = row.trades ?? ist?.n ?? oos?.tradeCount ?? null;
  const wrV      = ist?.wr != null ? ist.wr * 100 : oos?.winRate ?? null;
  const wfV      = row.wfWin;
  const tickerIcon = TICKER_ICON[row.ticker];

  function val(v: string | number | null, suffix = ""): string {
    return v != null ? `${v}${suffix}` : "—";
  }
  function signed(v: number | null, d = 2): string {
    if (v == null) return "—";
    return `${v >= 0 ? "+" : ""}${v.toFixed(d)}%`;
  }

  const infoBoxes = [
    {
      title: "Asset & Strategie",
      items: [
        { k: "Asset",     v: row.label, icon: tickerIcon },
        { k: "Ticker",    v: row.ticker },
        { k: "Exchange",  v: row.exchange ?? "—" },
        { k: "Pillar",    v: row.pillarLabel },
        { k: "Engine",    v: row.engine },
        { k: "Richtung",  v: dir, arrow: dir === "Long Only" || dir === "Long" ? "up" : dir === "Short Only" || dir === "Short" ? "down" : null },
      ],
    },
    {
      title: "Performance OOS",
      items: [
        { k: "Sharpe OOS", v: val(sharpeV), arrow: sharpeV != null ? (sharpeV >= 0.5 ? "up" : sharpeV < 0 ? "down" : null) : null },
        { k: "CAGR OOS",   v: row.cagr ?? (ist?.cagr != null ? `+${fmtN(ist.cagr)}%` : "—"), arrow: row.cagr && !row.cagr.startsWith("−") ? "up" : "down" },
        { k: "Max DD",     v: row.maxDd ?? (ist?.maxDD != null ? `−${fmtN(ist.maxDD)}%` : "—"), arrow: "down" },
        { k: "Calmar/MAR", v: val(calmarV), arrow: calmarV != null ? (calmarV >= 0.5 ? "up" : "down") : null },
        { k: "Profit Factor", v: val(pfV), arrow: pfV != null ? (pfV >= 1.3 ? "up" : pfV < 1.05 ? "down" : null) : null },
      ],
    },
    {
      title: "Handel & Statistik",
      items: [
        { k: "# Trades",  v: val(tradesV) },
        { k: "Win Rate",  v: wrV != null ? `${Number(wrV).toFixed(1)}%` : "—" },
        { k: "WF / OOS",  v: wfV ?? "—", arrow: wfV ? "up" : null },
        { k: "Final Equity", v: oos?.finalEquity != null ? `${oos.finalEquity.toFixed(0)}` : "—" },
      ],
    },
    {
      title: "Kontext & Zeitraum",
      items: [
        { k: "Datenbereich", v: dataRangeLabel(row.pillarKey, row.intradayId) },
        { k: "Beschreibung", v: pillarDescription(row.pillarKey) },
        { k: "Status",   v: row.status, arrow: row.status === "active" ? "up" : row.status === "archived" ? "down" : null },
        ...(row.isNotes ? [{ k: "Notiz", v: row.isNotes }] : []),
      ],
    },
  ];

  if (row.section === "ws" && row.status === "active" && row.canonicalStrategyId) {
    const executionTruth = WHITE_SWAN_EXECUTION_BY_ID.get(row.canonicalStrategyId);
    const selectedProfile = WHITE_SWAN_EXECUTION_PROFILES[executionProfileId];
    const selectedSizing = executionTruth ? getWhiteSwanExecutionSizing(executionTruth, executionProfileId) : null;
    const selectedStatus = executionTruth ? getWhiteSwanExecutionStatus(executionTruth, executionProfileId) : row.executionStatus;
    infoBoxes.push({
      title: "Execution 10k",
      items: [
        { k: "Portfolio Weight", v: row.weight != null ? `${row.weight.toFixed(2)}%` : "—" },
        { k: "Profile", v: selectedProfile.accountCurrency === "USD" ? "USD 10K" : "EUR 10K" },
        { k: "Risk / Trade %", v: selectedSizing?.riskPerTradePctEquity != null ? `${selectedSizing.riskPerTradePctEquity.toFixed(2)}%` : "—" },
        {
          k: "Risk / Trade",
          v:
            selectedSizing?.riskPerTradeAccountCurrency != null
              ? `${selectedProfile.accountCurrency} ${selectedSizing.riskPerTradeAccountCurrency.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
              : "—",
        },
        { k: "Signal", v: executionTruth?.signalInstrument ?? row.signalInstrument ?? "—" },
        { k: "Execution", v: executionTruth?.executionInstrument ?? row.executionInstrument ?? "—" },
        {
          k: "Contract",
          v: executionTruth ? `${executionTruth.ibkrSymbol} · ${executionTruth.exchange}` : "—",
        },
        { k: "Qty", v: formatQty(selectedSizing?.executionQuantity ?? row.executionQty) },
        {
          k: "Initial Margin",
          v:
            selectedSizing?.initialMargin != null
              ? `${selectedProfile.accountCurrency} ${selectedSizing.initialMargin.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
              : formatUsd(row.initialMarginUsd),
        },
        { k: "Status", v: executionStatusLabel(selectedStatus) },
        ...(executionTruth?.statusReason ? [{ k: "Hinweis", v: executionTruth.statusReason }] : row.executionNote ? [{ k: "Hinweis", v: row.executionNote }] : []),
      ],
    });
  }

  return (
    <div style={{ background: "#0b0c10", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
      <div style={{ padding: "16px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {/* Left: CapalifeChart candlestick */}
          <div style={{ height: 300 }}>
            <CandleChart ticker={row.ticker} timeframe={candleTf} refreshSecs={refreshSecs} assetName={row.label} />
          </div>
          {/* Right: equity + drawdown + KPI strip */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {activeEq.length > 0 && <EqChart pts={activeEq} label={eqLabel} syncId={SYNC_ID_PREFIX + row.id} oosStart={oosStart} />}
            {activeDd.length > 0 && <DdChart pts={activeDd} syncId={SYNC_ID_PREFIX + row.id} oosStart={oosStart} />}
            {/* KPI strip + "Mehr" button */}
            <div style={{ display: "flex", flexWrap: "nowrap" as const, gap: 5 }}>
              {kpis.map(k => <EKpi key={k.label} label={k.label} value={k.value} />)}
              {/* Engine deep-link — only for intraday strategies */}
              {(() => {
                const entityId = row.intradayId ?? row.ticker;
                const href = getEntityHref(entityId, "ENGINE");
                if (!href) return null;
                return (
                  <Link href={href} style={{
                    background: CARD, border: `1px solid rgba(214,178,74,0.22)`,
                    borderRadius: 10, padding: "8px 12px", flex: "0 0 auto",
                    display: "flex", flexDirection: "column" as const,
                    alignItems: "flex-start", gap: 3, minWidth: 70,
                    textDecoration: "none",
                  }}>
                    <span style={{ fontSize: 9, fontFamily: FONT_UI, fontWeight: 600, color: "rgba(214,178,74,0.55)", letterSpacing: ".07em", textTransform: "uppercase" as const, whiteSpace: "nowrap" as const }}>
                      Engine
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, fontFamily: FONT_NUM, color: "rgba(214,178,74,0.85)", letterSpacing: "-.01em" }}>
                      ↗
                    </span>
                  </Link>
                );
              })()}
              {/* Mehr-Button — plain, no gold */}
              <div
                onClick={() => setShowInfo(v => !v)}
                style={{
                  background: CARD, border: `1px solid ${CBORD}`,
                  borderRadius: 10, padding: "8px 12px", flex: "0 0 auto",
                  cursor: "pointer", display: "flex", flexDirection: "column" as const,
                  alignItems: "flex-start", gap: 3, minWidth: 70,
                }}
              >
                <span style={{ fontSize: 9, fontFamily: FONT_UI, fontWeight: 600, color: MUTED, letterSpacing: ".07em", textTransform: "uppercase" as const, whiteSpace: "nowrap" as const }}>
                  Mehr
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, fontFamily: FONT_NUM, color: TEXT_PRIMARY, letterSpacing: "-.02em" }}>
                    Data
                  </span>
                  <svg width={10} height={10} viewBox="0 0 10 10" fill="none" style={{ transform: showInfo ? "rotate(180deg)" : "none", transition: "transform .2s", color: MUTED }}>
                    <path d="M1.5 3.5l3.5 3.5 3.5-3.5" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>

      {/* Info panel — 4 thematic boxes in one row */}
      {showInfo && (
        <div style={{ borderTop: `1px solid ${RBORD}`, padding: "14px 16px 18px", background: "rgba(255,255,255,0.014)" }}>
          {row.section === "ws" && row.status === "active" && row.canonicalStrategyId && (
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginBottom: 10 }}>
              {([
                { id: "WHITE_SWAN_IBKR_10K_USD_V1", label: "USD 10K" },
                { id: "WHITE_SWAN_IBKR_10K_EUR_V1", label: "EUR 10K" },
              ] as const).map((profile) => (
                <button
                  key={profile.id}
                  type="button"
                  onClick={() => setExecutionProfileId(profile.id)}
                  className={`rc-pill ${executionProfileId === profile.id ? "rc-active" : "rc-inactive"}`}
                  style={{
                    fontFamily: FONT_UI,
                    fontSize: 10,
                    fontWeight: executionProfileId === profile.id ? 700 : 500,
                    padding: "5px 12px",
                    color: executionProfileId === profile.id ? "#F3F3F4" : "#6a6e7a",
                    letterSpacing: ".06em",
                    textTransform: "uppercase",
                  }}
                >
                  {profile.label}
                </button>
              ))}
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${infoBoxes.length}, minmax(0, 1fr))`, gap: 10 }}>
            {infoBoxes.map(box => (
              <div key={box.title} style={{ background: CARD, border: `1px solid ${CBORD}`, borderRadius: 10, padding: "10px 12px", display: "flex", flexDirection: "column" as const, gap: 8 }}>
                <div style={{ fontSize: 9, fontFamily: FONT_UI, fontWeight: 700, color: MUTED, letterSpacing: ".09em", textTransform: "uppercase" as const, borderBottom: `1px solid rgba(255,255,255,0.06)`, paddingBottom: 6 }}>
                  {box.title}
                </div>
                {box.items.map(item => {
                  const arrowColor = item.arrow === "up" ? "rgba(255,255,255,0.82)" : item.arrow === "down" ? GOLD : "rgba(255,255,255,0.75)";
                  return (
                    <div key={item.k} style={{ display: "flex", flexDirection: "column" as const, gap: 1 }}>
                      <span style={{ fontSize: 8, fontFamily: FONT_UI, color: "rgba(255,255,255,0.28)", letterSpacing: ".07em", textTransform: "uppercase" as const }}>{item.k}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        {"icon" in item && item.icon && (
                          <img src={item.icon} alt="" width={12} height={12} style={{ width: 12, height: 12, objectFit: "contain", borderRadius: 2, flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                        )}
                        {item.arrow && (
                          <span style={{ fontSize: 8, color: arrowColor, lineHeight: 1 }}>
                            {item.arrow === "up" ? "▲" : "▼"}
                          </span>
                        )}
                        <span style={{ fontSize: 11, fontFamily: FONT_UI, color: arrowColor, fontWeight: 600, lineHeight: 1.35 }}>
                          {item.v}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────
export default function StrategyMasterTable() {
  const [portfolio, setPortfolio] = useState<Portfolio>("ws");
  const [section, setSection]     = useState<string>("all");
  const [expandedId, setExpId]    = useState<string | null>(null);
  const [sortKey, setSortKey]     = useState<SortKey | null>("weight");
  const [sortDir, setSortDir]     = useState<SortDir>("desc");
  const [liveCols, setLiveCols]   = useState(false);
  const [liveData, setLiveData]   = useState<Map<string, LiveFeedItem>>(new Map());
  const [liveTrades, setLiveTrades] = useState<LiveTrade[]>([]);
  const [liveTimer, setLiveTimer] = useState(30);
  const [tick, setTick]           = useState(0);
  const LIVE_INTERVAL = 30;

  // TradingView-style OHLC prefetch — warm cache for ALL strategies on mount
  useEffect(() => {
    const allTickers = [...WS_ROWS, ...CI_ROWS].map(r => toOhlcSymbol(r.ticker));
    const unique = [...new Set(allTickers)].filter(s => s.length > 0);
    let i = 0;
    const next = () => {
      if (i >= unique.length) return;
      const sym = unique[i++];
      const key = sym + ":1D";
      if (OHLC_CACHE.has(key)) { next(); return; } // already cached
      fetch(`/api/monitoring/ohlc?symbol=${encodeURIComponent(sym)}&timeframe=1D`)
        .then(r => r.json())
        .then(d => {
          const b: OhlcBar[] = Array.isArray(d.bars) && d.bars.length ? d.bars : [];
          OHLC_CACHE.set(key, { bars: b, ts: Date.now() });
        })
        .catch(() => {})
        .finally(() => setTimeout(next, 120)); // stagger 120ms per symbol to avoid overwhelming the server
    };
    setTimeout(next, 800); // start after initial render
  }, []);

  // live feed + live state — same polling pattern as signals page
  // pre-fetch on mount so live data is ready when the toggle is clicked
  useEffect(() => {
    fetch("/api/monitoring/live-feed")
      .then(r => r.json())
      .then((d: unknown) => {
        const items: LiveFeedItem[] = Array.isArray(d) ? (d as LiveFeedItem[]) : (((d as { items?: LiveFeedItem[] }).items) ?? []);
        const m = new Map<string, LiveFeedItem>();
        items.forEach(i => { if (i?.symbol) m.set(i.symbol, i); });
        setLiveData(m);
      })
      .catch(() => {});
    fetch("/api/monitoring/live-state")
      .then(r => r.json())
      .then((d: unknown) => {
        const trades: LiveTrade[] = Array.isArray(d) ? (d as LiveTrade[]) : ((d as { openTrades?: LiveTrade[]; trades?: LiveTrade[] }).openTrades ?? (d as { trades?: LiveTrade[] }).trades ?? []);
        setLiveTrades(trades);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!liveCols) return;
    let secs = LIVE_INTERVAL;

    const fetchLive = () => {
      secs = LIVE_INTERVAL;
      setLiveTimer(LIVE_INTERVAL);
      fetch("/api/monitoring/live-feed")
        .then(r => r.json())
        .then((d: unknown) => {
          const items: LiveFeedItem[] = Array.isArray(d)
            ? (d as LiveFeedItem[])
            : (((d as { items?: LiveFeedItem[] }).items) ?? []);
          const m = new Map<string, LiveFeedItem>();
          items.forEach(i => { if (i?.symbol) m.set(i.symbol, i); });
          setLiveData(m);
        })
        .catch(() => {});

      fetch("/api/monitoring/live-state")
        .then(r => r.json())
        .then((d: unknown) => {
          const trades: LiveTrade[] = Array.isArray(d) ? (d as LiveTrade[]) : ((d as { openTrades?: LiveTrade[]; trades?: LiveTrade[] }).openTrades ?? (d as { trades?: LiveTrade[] }).trades ?? []);
          setLiveTrades(trades);
        })
        .catch(() => {});
    };

    fetchLive();
    const poll = setInterval(fetchLive, LIVE_INTERVAL * 1000);
    const countdown = setInterval(() => {
      secs = Math.max(0, secs - 1);
      setLiveTimer(secs);
      setTick(t => t + 1);
    }, 1000);

    return () => { clearInterval(poll); clearInterval(countdown); };
  }, [liveCols]);

  void tick;

  const switchPortfolio = useCallback((p: Portfolio) => {
    setPortfolio(p); setSection("all"); setExpId(null); setSortKey("weight"); setSortDir("desc");
  }, []);

  const handleSort = useCallback((k: SortKey) => {
    setSortKey(prev => {
      if (prev === k) { setSortDir(d => d === "desc" ? "asc" : "desc"); return k; }
      setSortDir("desc"); return k;
    });
  }, []);

  const toggle = useCallback((id: string) => setExpId(prev => prev === id ? null : id), []);

  // filter
  const baseRows: DisplayRow[] = portfolio === "ws" ? WS_ROWS : CI_ROWS;
  let rows = baseRows;
  if (portfolio === "ws" && section === "active") rows = rows.filter(r => ACTIVE_WS_COMPONENT_IDS.has(r.id));
  else if (section === "active") rows = rows.filter(r => r.status !== "archived" && r.status !== "research" && r.status !== "watch");
  else if (section !== "all") rows = rows.filter(r => r.pillarKey === section);

  // sort — inactive states pinned at bottom
  const archOrder = (s: string) => s === "archived" ? 3 : s === "research" ? 2 : s === "watch" ? 1 : 0;

  if (sortKey) {
    rows = [...rows].sort((a, b) => {
      const ao = archOrder(a.status) - archOrder(b.status);
      if (ao !== 0) return ao;
      if (sortKey === "weight") {
        const wa = a.weight ?? -0.001;
        const wb = b.weight ?? -0.001;
        return sortDir === "desc" ? wb - wa : wa - wb;
      }
      let va: string | number, vb: string | number;
      switch (sortKey) {
        case "ticker":    va = a.ticker;      vb = b.ticker;      break;
        case "label":     va = a.label;       vb = b.label;       break;
        case "pillar":    va = a.pillarLabel; vb = b.pillarLabel; break;
        case "status":    va = a.status;      vb = b.status;      break;
        case "sharpeOos": va = a.sharpeOos ?? -Infinity; vb = b.sharpeOos ?? -Infinity; break;
        case "calmar":    va = a.calmar    ?? -Infinity; vb = b.calmar    ?? -Infinity; break;
        case "pf":        va = a.pf       ?? -Infinity; vb = b.pf       ?? -Infinity; break;
        case "trades":    va = a.trades   ?? -Infinity; vb = b.trades   ?? -Infinity; break;
        case "cagr":      va = parseFloat((a.cagr  ?? "").replace(/[^0-9.-]/g, "")) || -Infinity; vb = parseFloat((b.cagr  ?? "").replace(/[^0-9.-]/g, "")) || -Infinity; break;
        case "maxDd":     va = parseFloat((a.maxDd ?? "").replace(/[^0-9.-]/g, "")) || -Infinity; vb = parseFloat((b.maxDd ?? "").replace(/[^0-9.-]/g, "")) || -Infinity; break;
        case "wfWin":     va = parseFloat((a.wfWin ?? "").replace(/[^0-9.]/g,  "")) || 0;         vb = parseFloat((b.wfWin ?? "").replace(/[^0-9.]/g,  "")) || 0;         break;
        default:          return 0;
      }
      if (typeof va === "string" && typeof vb === "string") { const c = va.localeCompare(vb); return sortDir === "asc" ? c : -c; }
      return sortDir === "desc" ? (vb as number) - (va as number) : (va as number) - (vb as number);
    });
  } else {
    rows = [...rows].sort((a, b) => archOrder(a.status) - archOrder(b.status));
  }

  const wsSecs = [
    { key: "all",       label: "Alle"       }, { key: "active",   label: "Nur Aktive" },
    { key: "valuation", label: "Valuation"  }, { key: "macro",    label: "Macro"      },
    { key: "trend",     label: "Trend"      }, { key: "seasonal", label: "Seasonal"   },
    { key: "anomaly",   label: "Anomaly"    }, { key: "intraday", label: "Intraday"   },
  ];
  const ciSecs = [
    { key: "all", label: "Alle" }, { key: "etf_factor", label: "ETF Factor" }, { key: "managed_futures", label: "Managed Futures" },
  ];
  const sections = portfolio === "ws" ? wsSecs : ciSecs;
  const kpis     = portfolio === "ws" ? WS_KPIS : CI_KPIS;
  const LIVE_EXTRA = 3;
  let rowNum = 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%", overflow: "visible", padding: "18px 20px 18px", background: BG, fontFamily: FONT_UI }}>
      <InjectPillCss />
      <style>{`.kmp::-webkit-scrollbar{display:none}.kmp{scrollbar-width:none;-ms-overflow-style:none}`}</style>

      {/* top bar */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16, flexShrink: 0, gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: TEXT_PRIMARY, letterSpacing: "-.02em", margin: "0 0 10px", fontFamily: FONT_UI }}>Komponenten</h1>
          <div style={{ display: "flex", gap: 5 }}>
            {([
              { id: "ws" as Portfolio, label: "White Swan",  icon: <SwanIcon /> },
              { id: "ci" as Portfolio, label: "Core Invest", icon: <TrendingUp size={12} strokeWidth={1.8} /> },
            ] as const).map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => switchPortfolio(item.id)}
                className={`rc-pill ${portfolio === item.id ? "rc-active" : "rc-inactive"}`}
                style={{
                  fontFamily: FONT_UI, fontSize: 12, fontWeight: portfolio === item.id ? 700 : 500,
                  padding: "7px 16px",
                  color: portfolio === item.id ? "#F3F3F4" : "#6a6e7a",
                }}
              >
                {item.icon}{item.label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" as const, justifyContent: "flex-end" }}>
          {kpis.map(k => <HKpi key={k.label} label={k.label} value={k.value} />)}
        </div>
      </div>
      {portfolio === "ws" && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12, flexShrink: 0 }}>
          <span style={{
            fontFamily: FONT_UI, fontSize: 10, fontWeight: 600,
            color: GOLD, letterSpacing: ".04em",
            background: "rgba(214,178,74,0.10)", border: "1px solid rgba(214,178,74,0.24)",
            borderRadius: 6, padding: "2px 8px", whiteSpace: "nowrap" as const,
          }}>
            Canonical Truth
          </span>
          <span style={{ fontFamily: FONT_UI, fontSize: 10, color: MUTED }}>
            {WHITE_SWAN_TRUTH_NOTE}
          </span>
        </div>
      )}
      {portfolio === "ci" && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12, flexShrink: 0 }}>
          <span style={{
            fontFamily: FONT_UI, fontSize: 10, fontWeight: 600,
            color: "#f59e0b", letterSpacing: ".04em",
            background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.28)",
            borderRadius: 6, padding: "2px 8px", whiteSpace: "nowrap" as const,
          }}>
            ⚠ Engine Parity partiell (Pine2-Sleeves ~15% Match)
          </span>
          <span style={{ fontFamily: FONT_UI, fontSize: 10, color: MUTED }}>
            OOS 2019–2026 · Backtest-Werte · kein Live-Track-Record
          </span>
        </div>
      )}

      {/* filter bar + live toggle */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" as const }}>
          {sections.map(s => (
            <Pill key={s.key} label={s.label} active={section === s.key}
              onClick={() => { setSection(s.key); setExpId(null); }} />
          ))}
        </div>
        <button
          onClick={() => setLiveCols(v => !v)}
          title={liveCols ? `${portfolio === "ci" ? "Daten" : "Live"} ausblenden` : `${portfolio === "ci" ? "Daten" : "Live"} einblenden`}
          style={{
            display: "flex", alignItems: "center", gap: 5, flexShrink: 0,
            fontFamily: FONT_UI, fontSize: 10, fontWeight: 700,
            letterSpacing: ".06em", textTransform: "uppercase" as const,
            padding: "4px 10px", borderRadius: 8, cursor: "pointer",
            background: liveCols ? CARD : "transparent",
            border: liveCols ? "1px solid rgba(255,255,255,0.28)" : `1px solid ${RBORD}`,
            color: liveCols ? "#F3F3F4" : "#6a6e7a", transition: "all .15s",
          }}>
          <LayoutGrid size={11} />
          {portfolio === "ci" ? "Daten" : "Live"}
          {liveCols && <LiveTimer secs={liveTimer} max={LIVE_INTERVAL} />}
        </button>
      </div>

      {/* table */}
      <div style={{ flex: "0 0 auto", minHeight: 0, position: "relative" }}>
        <div className="kmp" style={{ overflowX: "auto", overflowY: "visible", borderRadius: "9px 9px 0 0", border: `1px solid ${RBORD}`, borderBottom: "none" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead style={{ position: "sticky", top: 0, zIndex: 2 }}>
              {(() => {
                const wsMetrics = portfolio === "ws" ? WHITE_SWAN_PORTFOLIO_TRUTH.headerMetrics : null;
                const activeRows = portfolio === "ws"
                  ? rows.filter(r => ACTIVE_WS_COMPONENT_IDS.has(r.id))
                  : rows.filter(r => r.status !== "archived" && r.status !== "research" && r.status !== "watch");
                const totalRows = rows.length;
                const pillars = new Set(rows.map(r => r.pillarKey)).size;
                const weightSum = wsMetrics?.weight.aggregateValue ?? rows
                  .filter(r => r.status !== "research" && r.status !== "watch")
                  .map(r => r.weight ?? 0)
                  .reduce((s, v) => s + v, 0);
                const sharpes = rows.map(r => r.sharpeOos).filter((v): v is number => v != null);
                const avgSharpe = wsMetrics?.sharpe.aggregateValue != null
                  ? wsMetrics.sharpe.aggregateValue.toFixed(2)
                  : sharpes.length ? (sharpes.reduce((s, v) => s + v, 0) / sharpes.length).toFixed(2) : null;
                const cagrs = rows.map(r => parseFloat((r.cagr ?? "").replace(/[^0-9.-]/g, ""))).filter(v => !isNaN(v));
                const avgCagr = wsMetrics?.cagr.aggregateValue != null
                  ? `${wsMetrics.cagr.aggregateValue.toFixed(1)}%`
                  : cagrs.length ? (cagrs.reduce((s, v) => s + v, 0) / cagrs.length).toFixed(1) + "%" : null;
                const dds = rows.map(r => parseFloat((r.maxDd ?? "").replace(/[^0-9.-]/g, ""))).filter(v => !isNaN(v) && v !== 0);
                const avgDd = wsMetrics?.maxDd.aggregateValue != null
                  ? `−${Math.abs(wsMetrics.maxDd.aggregateValue).toFixed(1)}%`
                  : dds.length ? "−" + Math.abs(dds.reduce((s, v) => s + v, 0) / dds.length).toFixed(1) + "%" : null;
                const showComponentAggregates = portfolio !== "ci";
                const pfs = rows.map(r => r.pf).filter((v): v is number => v != null);
                const avgPf = wsMetrics?.pf.aggregateValue != null
                  ? wsMetrics.pf.aggregateValue.toFixed(2)
                  : pfs.length ? (pfs.reduce((s, v) => s + v, 0) / pfs.length).toFixed(2) : null;
                const tradesSum = wsMetrics?.trades.aggregateValue ?? rows.map(r => r.trades).filter((v): v is number => v != null).reduce((s, v) => s + v, 0);
                // Only average WF values that are percentages (contain %) to avoid mixing with fold counts like "7/8"
                const wfs = rows.map(r => r.wfWin ?? "").filter(v => v.includes("%")).map(v => parseFloat(v.replace(/[^0-9.]/g, ""))).filter(v => !isNaN(v) && v > 0);
                const avgWf = wsMetrics?.wfWin.aggregateValue != null
                  ? `${wsMetrics.wfWin.aggregateValue.toFixed(0)}%`
                  : wfs.length ? (wfs.reduce((s, v) => s + v, 0) / wfs.length).toFixed(0) + "%" : null;
                return (
                  <tr>
                    <th style={{ fontFamily: FONT_UI, fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", color: MUTED, padding: "0 6px 9px", textAlign: "left", borderBottom: `1px solid ${RBORD}`, background: BG, width: 26 }}>
                      <div style={{ fontSize: 9, fontWeight: 600, color: "rgba(255,255,255,0.50)", marginBottom: 2 }}>n {totalRows}</div>
                      #
                    </th>
                    <th style={{ width: 18, padding: 0, borderBottom: `1px solid ${RBORD}`, background: BG }} />
                    <Th label="Ticker"  k="ticker"    sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="left" />
                    <Th label="Asset"   k="label"     sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="left" />
                    <Th label="Pillar"  k="pillar"    sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="left" agg={`n ${pillars}`} />
                    <Th label="Gew."    k="weight"    sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="left" agg={weightSum > 0 ? `Σ ${weightSum.toFixed(2)}%` : undefined} />
                    <Th label="Sharpe"  k="sharpeOos" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="left" agg={showComponentAggregates && avgSharpe ? `∅ ${avgSharpe}` : undefined} />
                    <Th label="CAGR"    k="cagr"      sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="left" agg={showComponentAggregates && avgCagr ? `∅ ${avgCagr}` : undefined} />
                    <Th label="Max DD"  k="maxDd"     sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="left" agg={showComponentAggregates && avgDd ? `∅ ${avgDd}` : undefined} />
                    <Th label="Calmar"  k="calmar"    sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="left" />
                    <Th label="PF"      k="pf"        sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="left" agg={showComponentAggregates && avgPf ? `∅ ${avgPf}` : undefined} />
                    <Th label="Trades"  k="trades"    sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="left" agg={showComponentAggregates && tradesSum > 0 ? `Σ ${tradesSum}` : undefined} />
                    <Th label="WF/Win%" k="wfWin"     sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="left" agg={showComponentAggregates && avgWf ? `∅ ${avgWf}` : undefined} />
                    <Th label="Status"  k="status"    sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="left" agg={activeRows.length > 0 ? `n ${activeRows.length}` : undefined} />
                    {liveCols && <>
                      <th style={{ fontFamily: FONT_UI, fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", color: MUTED, padding: "0 8px 9px", textAlign: "left", borderBottom: `1px solid ${RBORD}`, background: BG, borderLeft: "1px solid rgba(255,255,255,0.05)" }}>Preis</th>
                      <th style={{ fontFamily: FONT_UI, fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", color: MUTED, padding: "0 8px 9px", textAlign: "left", borderBottom: `1px solid ${RBORD}`, background: BG }}>Signal</th>
                      <th style={{ fontFamily: FONT_UI, fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", color: MUTED, padding: "0 8px 9px", textAlign: "left", borderBottom: `1px solid ${RBORD}`, background: BG, whiteSpace: "nowrap" as const }}>Von – Bis</th>
                    </>}
                  </tr>
                );
              })()}
            </thead>
            <tbody>
              {rows.map(row => {
                const isArch = row.status === "archived";
                const isResearch = row.status === "research";
                const isWatch = row.status === "watch";
                const isExp  = expandedId === row.id;
                if (!isArch && !isResearch && !isWatch) rowNum++;
                const live = liveCols ? matchLive(row.ticker, liveData) : null;

                // price color: positive day = bright white, negative = gold
                const priceChg = live?.changePct ?? null;
                const priceColor = live == null ? "rgba(255,255,255,0.18)"
                  : priceChg != null && priceChg > 0.01 ? "rgba(255,255,255,0.92)"
                  : priceChg != null && priceChg < -0.01 ? "#d8bc67"
                  : "rgba(255,255,255,0.78)";

                // signal: check if there's an open trade matching this ticker
                const hasTrade = liveCols && liveTrades.some(t => {
                  const base = row.ticker.split(" ")[0].replace("1!", "").toUpperCase();
                  const ts = (t.symbol ?? "").replace("1!", "").toUpperCase();
                  return ts === base || ts.startsWith(base) || base.startsWith(ts);
                });

                const dataRow = (
                  <tr key={row.id}
                    onClick={() => !isArch && !isResearch && !isWatch && toggle(row.id)}
                    style={{ opacity: isArch ? 0.18 : isResearch ? 0.38 : isWatch ? 0.28 : 1, cursor: (isArch || isResearch || isWatch) ? "default" : "pointer", borderBottom: `1px solid ${RBORD}`, background: isExp ? "rgba(255,255,255,0.02)" : "transparent", transition: "background .1s" }}
                    onMouseEnter={e => { if (!isArch && !isResearch && !isWatch && !isExp) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.012)"; }}
                    onMouseLeave={e => { if (!isExp) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                  >
                    <td style={{ padding: "5px 6px", textAlign: "left", fontSize: 9, color: "rgba(255,255,255,0.65)", fontWeight: 600, width: 26, fontVariantNumeric: "tabular-nums" }}>{isArch || isResearch || isWatch ? "" : rowNum}</td>
                    <td style={{ padding: "5px 3px", width: 18, textAlign: "center" }}>
                      {!isArch && !isWatch && !isResearch && <span style={{ fontSize: 10, color: isExp ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.15)", display: "inline-block", transform: isExp ? "rotate(90deg)" : "none", transition: "transform .2s" }}>›</span>}
                    </td>
                    <td style={{ padding: "5px 8px" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <TickerIcon ticker={row.ticker} />
                        <span style={{ fontWeight: 700, fontSize: 11, color: TEXT_PRIMARY, letterSpacing: ".02em", fontVariantNumeric: "tabular-nums", fontFamily: FONT_NUM }}>{row.ticker}</span>
                      </span>
                    </td>
                    <td style={{ padding: "5px 8px", color: "rgba(255,255,255,0.35)", fontSize: 10, textAlign: "left" }}>{row.label}</td>
                    <td style={{ padding: "5px 8px", fontSize: 9, color: "rgba(255,255,255,0.22)", letterSpacing: ".04em", textAlign: "left" }}>{row.pillarLabel}</td>
                    <td style={{ padding: "5px 8px", textAlign: "left", color: row.weight ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.15)", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                      {row.weight != null ? `${Math.round(row.weight)}%` : "—"}
                    </td>
                    <td style={{ padding: "5px 8px", textAlign: "left", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: numColor(row.sharpeOos) }}>
                      {row.sharpeOos != null ? fmtN(row.sharpeOos) : "—"}
                    </td>
                    <td style={{ padding: "5px 8px", textAlign: "left", color: strNumColor(row.cagr), fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{row.cagr ?? "—"}</td>
                    <td style={{ padding: "5px 8px", textAlign: "left", color: strNumColor(row.maxDd), fontVariantNumeric: "tabular-nums" }}>{row.maxDd ?? "—"}</td>
                    <td style={{ padding: "5px 8px", textAlign: "left", color: numColor(row.calmar), fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{row.calmar != null ? fmtN(row.calmar) : "—"}</td>
                    <td style={{ padding: "5px 8px", textAlign: "left", color: (row.pf ?? 0) >= 1.3 ? "rgba(255,255,255,0.75)" : row.pf ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.15)", fontVariantNumeric: "tabular-nums" }}>
                      {row.pf != null ? fmtN(row.pf) : "—"}
                    </td>
                    <td style={{ padding: "5px 8px", textAlign: "left", color: "rgba(255,255,255,0.28)", fontSize: 10, fontVariantNumeric: "tabular-nums" }}>{row.trades != null ? row.trades.toLocaleString("de") : "—"}</td>
                    <td style={{ padding: "5px 8px", textAlign: "left", color: "rgba(255,255,255,0.28)", fontSize: 10 }}>{row.wfWin ?? "—"}</td>
                    <td style={{ padding: "5px 8px" }}><Chip status={row.status} /></td>

                    {liveCols && (() => {
                      const price = live?.lastClose ?? null;
                      const from  = live?.firstDate ?? null;
                      return (
                        <>
                          <td style={{ padding: "5px 8px", textAlign: "left", fontVariantNumeric: "tabular-nums", color: priceColor, borderLeft: "1px solid rgba(255,255,255,0.05)", fontWeight: price != null ? 600 : 400 }}>
                            {price != null ? fmtPrice(price, row.ticker) : "—"}
                          </td>
                          <td style={{ padding: "5px 8px", textAlign: "left" }}>
                            <SignalCell hasTrade={hasTrade} />
                          </td>
                          <td suppressHydrationWarning style={{ padding: "5px 8px", textAlign: "left", color: "rgba(255,255,255,0.28)", fontSize: 9, whiteSpace: "nowrap" as const }}>
                            {live ? (
                              <span>
                                {estimateVon(live, row.ticker)}
                                <span style={{ color: "rgba(255,255,255,0.12)", margin: "0 4px" }}>–</span>
                                {fmtDateTime(live.lastDate)}
                              </span>
                            ) : "—"}
                          </td>
                        </>
                      );
                    })()}
                  </tr>
                );

                const expRow = (
                  <tr key={`${row.id}_x`}>
                    <td colSpan={14 + (liveCols ? LIVE_EXTRA : 0)} style={{ padding: 0, border: "none" }}>
                      <div style={{ maxHeight: isExp ? "4000px" : "0", overflow: "hidden", transition: "max-height 0.38s cubic-bezier(0.4,0,0.2,1)" }}>
                        {isExp && <ExpandedRow row={row} />}
                      </div>
                    </td>
                  </tr>
                );

                return [dataRow, expRow];
              })}
            </tbody>
          </table>
        </div>

        {/* bottom gradient */}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 140, background: `linear-gradient(to bottom, transparent 0%, ${BG}cc 55%, ${BG} 100%)`, pointerEvents: "none", zIndex: 3 }} />
      </div>
    </div>
  );
}
