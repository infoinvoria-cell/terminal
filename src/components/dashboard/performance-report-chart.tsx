"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { CapalifeData } from "@/lib/capitalife-data";
import {
  compoundGains,
  deserializeTrades,
  type PerformanceAggregation,
  type SerializedTrade,
} from "@/lib/trades-analytics";
import {
  buildHomeLineSeries,
  buildHomePeriodReturns,
  getHomeTrackRecordKpis,
  validateHomeTrackRecordSeries,
} from "@/lib/home-performance-track-record";
import type { SpyDailyReturn } from "@/lib/benchmark/spy-data";

export type TimeFrame = PerformanceAggregation;
export type ViewMode = "Bar" | "Line" | "Table";

export type PortfolioDailySeriesPoint = {
  dateUtc: string;
  cumulativeReturn?: number;
  portfolioIndex?: number;
  portfolioDailyReturn?: number | null;
};

type TradeEventSeriesPoint = {
  closeTimeUtc: string;
  closeTimeEpoch: number;
  cumulativeReturn: number;
  tradeId: string;
  symbol: string;
  side: string;
  netProfitLocal: number;
};

type Props = {
  trades: SerializedTrade[];
  timeframe: TimeFrame;
  view: ViewMode;
  capalifeData: CapalifeData;
  compact?: boolean;
  showBenchmark?: boolean;
  spyDailyReturns?: SpyDailyReturn[];
  /** Authoritative daily series from portfolio-engine. When provided, Line view uses this instead of capalifeData-derived series. */
  performanceSeries?: PortfolioDailySeriesPoint[];
  /** Trade-event series: one point per closed trade. When provided, Line view uses this as the primary data source. */
  tradeEventSeries?: TradeEventSeriesPoint[];
};

type MonthlyReturnRow = {
  year: number;
  month: number;
  label: string;
  returnPct: number;
};

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatSignedPercent(value: number, digits = 1) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function parseMonthlyRows(data: CapalifeData): MonthlyReturnRow[] {
  return data.performanceMonthly.monthly_returns.map((row) => ({
    year: row.year,
    month: Number(row.month.slice(5, 7)),
    label: row.label,
    returnPct: row.return_pct,
  }));
}

function groupMonthlyReturns(aggregation: TimeFrame, data: CapalifeData) {
  const rows = parseMonthlyRows(data);
  if (aggregation === "1M") {
    return rows.map((row) => ({
      key: `${row.year}-${String(row.month).padStart(2, "0")}`,
      label: row.label,
      periodReturnPct: row.returnPct,
      year: row.year,
    }));
  }

  const grouped = new Map<string, MonthlyReturnRow[]>();
  for (const row of rows) {
    const key =
      aggregation === "3M"
        ? `${row.year}-Q${Math.floor((row.month - 1) / 3) + 1}`
        : `${row.year}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(row);
  }

  return [...grouped.entries()].map(([key, entries]) => ({
    key,
    label: key,
    periodReturnPct: compoundGains(entries.map((entry) => entry.returnPct)),
    year: entries[0]?.year ?? 0,
  }));
}

function buildLineData(trades: SerializedTrade[], aggregation: TimeFrame, data: CapalifeData) {
  const tradeRows = deserializeTrades(trades);
  return buildHomeLineSeries(tradeRows, aggregation, data).map((p) => ({
    key: p.key,
    label: p.label,
    cumulativePct: p.cumulativePct,
    periodReturnPct: p.periodReturnPct,
    acc1CumulativePct: p.acc1CumulativePct as number | null,
    acc2CumulativePct: p.acc2CumulativePct,
    acc1ReturnPct: p.acc1ReturnPct as number | null,
    acc2ReturnPct: p.acc2ReturnPct,
    year: p.year,
  }));
}

function buildBarData(trades: SerializedTrade[], aggregation: TimeFrame, data: CapalifeData) {
  if (aggregation === "1M" || aggregation === "3M" || aggregation === "1Y") {
    return buildHomePeriodReturns(aggregation, data).map((row) => ({
      label: row.label,
      key: row.key ?? row.label,
      returnPct: Number(row.periodReturnPct.toFixed(2)),
      acc1ReturnPct: null as number | null,
      acc2ReturnPct: null as number | null,
      year: row.year,
    }));
  }

  return buildLineData(trades, aggregation, data).map((p) => ({
    label: p.label,
    key: p.key,
    returnPct: p.periodReturnPct,
    acc1ReturnPct: p.acc1ReturnPct as number | null,
    acc2ReturnPct: p.acc2ReturnPct,
    year: p.year,
  }));
}

function buildTableMatrix(data: CapalifeData) {
  const rows = parseMonthlyRows(data);
  const byYear = new Map<number, Map<number, number>>();

  for (const row of rows) {
    if (!byYear.has(row.year)) byYear.set(row.year, new Map());
    byYear.get(row.year)!.set(row.month, row.returnPct);
  }

  return [...byYear.entries()]
    .sort((l, r) => l[0] - r[0])
    .map(([year, months]) => ({
      year,
      months: MONTH_ABBR.map((_, i) => months.get(i + 1) ?? null),
      total: compoundGains([...months.values()]),
    }));
}

function buildTableList(trades: SerializedTrade[], aggregation: TimeFrame, data: CapalifeData) {
  if (aggregation === "1M") return [];

  if (aggregation === "3M" || aggregation === "1Y") {
    return buildHomePeriodReturns(aggregation, data).map((row) => ({
      label: row.label,
      key: row.key ?? row.label,
      periodReturnPct: Number(row.periodReturnPct.toFixed(2)),
    }));
  }

  return buildLineData(trades, aggregation, data).map((row) => ({
    label: row.label,
    key: row.key,
    periodReturnPct: row.periodReturnPct,
  }));
}

// ── Trade-event series → Bar / Table ─────────────────────────────────────────

function tesBucketKey(utc: string, aggregation: TimeFrame): string {
  const y = Number(utc.slice(0, 4));
  const m = Number(utc.slice(5, 7));
  const d = Number(utc.slice(8, 10));
  if (aggregation === "1D") return utc.slice(0, 10);
  if (aggregation === "1M") return `${y}-${String(m).padStart(2, "0")}`;
  if (aggregation === "3M") return `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
  if (aggregation === "1Y") return String(y);
  // 1W: Sunday-start
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - dt.getDay());
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function tesBucketLabel(key: string, aggregation: TimeFrame): string {
  if (aggregation === "1D" || aggregation === "1W") {
    const [yr, mo, dy] = key.split("-").map(Number);
    return new Date(yr, mo - 1, dy).toLocaleDateString("en-GB", {
      day: "numeric", month: "short", ...(aggregation === "1D" ? { year: "2-digit" } : {}),
    });
  }
  if (aggregation === "1M") {
    const [yr, mo] = key.split("-").map(Number);
    return new Date(yr, mo - 1, 1).toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
  }
  return key;
}

/** Derive bucketed bar data from trade-event series (chain-linked period returns). */
function buildBarDataFromTradeEvents(
  series: TradeEventSeriesPoint[],
  aggregation: TimeFrame,
): Array<{ label: string; key: string; returnPct: number; acc1ReturnPct: null; acc2ReturnPct: null; year: number }> {
  if (series.length === 0) return [];
  const bucketLast = new Map<string, number>();
  const bucketOrder: string[] = [];
  for (const p of series) {
    const key = tesBucketKey(p.closeTimeUtc, aggregation);
    if (!bucketLast.has(key)) bucketOrder.push(key);
    bucketLast.set(key, p.cumulativeReturn);
  }
  const result = [];
  let prevCum = 0;
  for (const key of bucketOrder) {
    const endCum = bucketLast.get(key)!;
    const periodReturn = ((1 + endCum) / (1 + prevCum) - 1) * 100;
    result.push({
      label: tesBucketLabel(key, aggregation),
      key,
      returnPct: Number(periodReturn.toFixed(2)),
      acc1ReturnPct: null as null,
      acc2ReturnPct: null as null,
      year: Number(key.slice(0, 4)),
    });
    prevCum = endCum;
  }
  return result;
}

/** Derive list-table rows from trade-event series. */
function buildTableListFromTradeEvents(
  series: TradeEventSeriesPoint[],
  aggregation: TimeFrame,
): Array<{ label: string; key: string; periodReturnPct: number }> {
  if (aggregation === "1M" || series.length === 0) return [];
  return buildBarDataFromTradeEvents(series, aggregation).map((p) => ({
    label: p.label,
    key: p.key,
    periodReturnPct: p.returnPct,
  }));
}

/** Derive year×month matrix from trade-event series (for 1M Table). */
function buildTableMatrixFromTradeEvents(
  series: TradeEventSeriesPoint[],
): Array<{ year: number; months: Array<number | null>; total: number }> {
  if (series.length === 0) return [];
  // Monthly last cumulative return
  const monthLast = new Map<string, number>();
  const monthOrder: string[] = [];
  for (const p of series) {
    const key = p.closeTimeUtc.slice(0, 7); // "YYYY-MM"
    if (!monthLast.has(key)) monthOrder.push(key);
    monthLast.set(key, p.cumulativeReturn);
  }
  // Build year→month map
  const byYear = new Map<number, Map<number, number>>();
  let prevCum = 0;
  for (const key of monthOrder) {
    const endCum = monthLast.get(key)!;
    const periodReturn = ((1 + endCum) / (1 + prevCum) - 1) * 100;
    const year = Number(key.slice(0, 4));
    const month = Number(key.slice(5, 7));
    if (!byYear.has(year)) byYear.set(year, new Map());
    byYear.get(year)!.set(month, periodReturn);
    prevCum = endCum;
  }
  return [...byYear.entries()]
    .sort(([a], [b]) => a - b)
    .map(([year, months]) => ({
      year,
      months: Array.from({ length: 12 }, (_, i) => months.get(i + 1) ?? null),
      total: compoundGains([...months.values()]),
    }));
}

// ── Portfolio daily series → line chart points ────────────────────────────

function buildLineDataFromDailySeries(
  series: PortfolioDailySeriesPoint[],
  aggregation: TimeFrame,
): Array<{
  key: string;
  label: string;
  cumulativePct: number;
  periodReturnPct: number;
  acc1CumulativePct: null;
  acc2CumulativePct: null;
  acc1ReturnPct: null;
  acc2ReturnPct: null;
  year: number;
}> {
  if (series.length === 0) return [];

  function bucketKey(dateStr: string): string {
    const [y, m, d] = dateStr.split("-").map(Number);
    if (aggregation === "1D") return dateStr;
    if (aggregation === "1M") return `${y}-${String(m).padStart(2, "0")}`;
    if (aggregation === "3M") return `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
    if (aggregation === "1Y") return String(y);
    // 1W: Sunday-start
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() - dt.getDay());
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  }

  function bucketLabel(key: string): string {
    if (aggregation === "1D") {
      const [yr, mo, dy] = key.split("-").map(Number);
      return new Date(yr, mo - 1, dy).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" });
    }
    if (aggregation === "1W") {
      const [yr, mo, dy] = key.split("-").map(Number);
      return new Date(yr, mo - 1, dy).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    }
    if (aggregation === "1M") {
      const [yr, mo] = key.split("-").map(Number);
      return new Date(yr, mo - 1, 1).toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
    }
    return key;
  }

  function bucketYear(key: string): number {
    if (aggregation === "3M") return Number(key.split("-Q")[0]);
    return Number(key.split("-")[0]);
  }

  // Collect last cumulative value per bucket
  const bucketMap = new Map<string, { lastCumPct: number; firstIdx: number; lastIdx: number }>();
  for (const pt of series) {
    const key = bucketKey(pt.dateUtc);
    const cumPct = (pt.cumulativeReturn ?? ((pt.portfolioIndex ?? 100) / 100 - 1)) * 100;
    const existing = bucketMap.get(key);
    if (!existing) {
      bucketMap.set(key, { lastCumPct: cumPct, firstIdx: cumPct, lastIdx: cumPct });
    } else {
      existing.lastCumPct = cumPct;
      existing.lastIdx = cumPct;
    }
  }

  const keys = [...bucketMap.keys()].sort();
  let prevCum = 0;
  return keys.map((key) => {
    const { lastCumPct } = bucketMap.get(key)!;
    const periodRet = Math.round((lastCumPct - prevCum) * 100) / 100;
    prevCum = lastCumPct;
    return {
      key,
      label: bucketLabel(key),
      cumulativePct: Math.round(lastCumPct * 100) / 100,
      periodReturnPct: periodRet,
      acc1CumulativePct: null,
      acc2CumulativePct: null,
      acc1ReturnPct: null,
      acc2ReturnPct: null,
      year: bucketYear(key),
    };
  });
}

// ── Trade-event series → line chart points ────────────────────────────────

function buildLineDataFromTradeEvents(
  series: TradeEventSeriesPoint[],
  aggregation: TimeFrame,
): ReturnType<typeof buildLineDataFromDailySeries> {
  if (series.length === 0) return [];
  // Convert trade-event points to the PortfolioDailySeriesPoint shape expected by buildLineDataFromDailySeries
  const adapted: PortfolioDailySeriesPoint[] = series.map((p) => ({
    dateUtc: p.closeTimeUtc.slice(0, 10),
    cumulativeReturn: p.cumulativeReturn,
  }));
  return buildLineDataFromDailySeries(adapted, aggregation);
}

// ── SPY series utilities ────────────────────────────────────────────────────

function pad2(n: number) { return String(n).padStart(2, "0"); }

function getSpyPeriodKey(date: string, aggregation: TimeFrame): string {
  const parts = date.split("-").map(Number);
  const year = parts[0];
  const month = parts[1];

  if (aggregation === "1D") return date;
  if (aggregation === "1M") return `${year}-${pad2(month)}`;
  if (aggregation === "3M") return `${year}-Q${Math.floor((month - 1) / 3) + 1}`;
  if (aggregation === "1Y") return `${year}`;

  // 1W: Sunday-start week — matches portfolio's weekKey() in home-performance-track-record.ts
  const d = new Date(parts[0], parts[1] - 1, parts[2]); // local date
  const dow = d.getDay(); // 0=Sun
  d.setDate(d.getDate() - dow); // back to Sunday
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function buildSpyPeriodMap(
  spyDailyReturns: SpyDailyReturn[],
  startDate: string,
  endDate: string,
  aggregation: TimeFrame
): Map<string, number> {
  const grouped = new Map<string, number[]>();
  for (const { date, returnPct } of spyDailyReturns) {
    if (date < startDate || date > endDate) continue;
    const key = getSpyPeriodKey(date, aggregation);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(returnPct);
  }
  const result = new Map<string, number>();
  for (const [key, returns] of grouped) {
    result.set(key, compoundGains(returns));
  }
  return result;
}

// Build daily cumulative map (YYYY-MM-DD → cumulative%). Day 1 includes its own return.
function buildSpyCumulativeByDate(
  spyDailyReturns: SpyDailyReturn[],
  startDate: string,
  endDate: string
): Map<string, number> {
  const map = new Map<string, number>();
  let equity = 1.0;
  for (const { date, returnPct } of spyDailyReturns) {
    if (date < startDate || date > endDate) continue;
    equity *= 1 + returnPct / 100;
    map.set(date, parseFloat(((equity - 1) * 100).toFixed(3)));
  }
  return map;
}

// Compound SPY period returns cumulatively for 1M/3M/1Y/1W line chart
function buildSpyCumulativeFromPeriods(
  periodKeys: string[],
  spyPeriodMap: Map<string, number>
): Map<string, number> {
  let equity = 1.0;
  const map = new Map<string, number>();
  for (const key of periodKeys) {
    const r = spyPeriodMap.get(key);
    if (r == null) {
      map.set(key, parseFloat(((equity - 1) * 100).toFixed(3)));
      continue;
    }
    equity *= 1 + r / 100;
    map.set(key, parseFloat(((equity - 1) * 100).toFixed(3)));
  }
  return map;
}

// ── Bar gradients ──────────────────────────────────────────────────────────

const GRAD_DEFS = [
  { id: "pos-hi", x1:"0",y1:"1",x2:"0",y2:"0", stops:[{o:"0%",c:"#5d6067"},{o:"55%",c:"#d8dadf"},{o:"100%",c:"#f0f2f5"}] },
  { id: "pos-md", x1:"0",y1:"1",x2:"0",y2:"0", stops:[{o:"0%",c:"#4e5158"},{o:"100%",c:"#bbbec5"}] },
  { id: "pos-lo", x1:"0",y1:"1",x2:"0",y2:"0", stops:[{o:"0%",c:"#42454c"},{o:"100%",c:"#8a8d96"}] },
  { id: "pos-xs", x1:"0",y1:"1",x2:"0",y2:"0", stops:[{o:"0%",c:"#383b42"},{o:"100%",c:"#636770"}] },
  { id: "neg-hi", x1:"0",y1:"0",x2:"0",y2:"1", stops:[{o:"0%",c:"#4a4d54"},{o:"100%",c:"#D6B24A"}] },
  { id: "neg-md", x1:"0",y1:"0",x2:"0",y2:"1", stops:[{o:"0%",c:"#414448"},{o:"100%",c:"#a08832"}] },
  { id: "neg-lo", x1:"0",y1:"0",x2:"0",y2:"1", stops:[{o:"0%",c:"#373a40"},{o:"100%",c:"#6b5c20"}] },
  { id: "neg-xs", x1:"0",y1:"0",x2:"0",y2:"1", stops:[{o:"0%",c:"#303236"},{o:"100%",c:"#4a3e1c"}] },
  { id: "spy-pos-hi", x1:"0",y1:"1",x2:"0",y2:"0", stops:[{o:"0%",c:"#5c2323"},{o:"100%",c:"#ef5555"}] },
  { id: "spy-pos-md", x1:"0",y1:"1",x2:"0",y2:"0", stops:[{o:"0%",c:"#4a1e1e"},{o:"100%",c:"#d43f3f"}] },
  { id: "spy-pos-lo", x1:"0",y1:"1",x2:"0",y2:"0", stops:[{o:"0%",c:"#3d1a1a"},{o:"100%",c:"#b03030"}] },
  { id: "spy-pos-xs", x1:"0",y1:"1",x2:"0",y2:"0", stops:[{o:"0%",c:"#301515"},{o:"100%",c:"#842424"}] },
  { id: "spy-neg-hi", x1:"0",y1:"0",x2:"0",y2:"1", stops:[{o:"0%",c:"#5c2323"},{o:"100%",c:"#ef5555"}] },
  { id: "spy-neg-md", x1:"0",y1:"0",x2:"0",y2:"1", stops:[{o:"0%",c:"#4a1e1e"},{o:"100%",c:"#d43f3f"}] },
  { id: "spy-neg-lo", x1:"0",y1:"0",x2:"0",y2:"1", stops:[{o:"0%",c:"#3d1a1a"},{o:"100%",c:"#b03030"}] },
  { id: "spy-neg-xs", x1:"0",y1:"0",x2:"0",y2:"1", stops:[{o:"0%",c:"#301515"},{o:"100%",c:"#842424"}] },
] as const;

function gradFill(val: number, maxPos: number, maxNeg: number): string {
  if (val >= 0) {
    const s = maxPos > 0 ? val / maxPos : 0;
    if (s >= 0.85) return "url(#pos-hi)";
    if (s >= 0.45) return "url(#pos-md)";
    if (s >= 0.15) return "url(#pos-lo)";
    return "url(#pos-xs)";
  }
  const s = maxNeg < 0 ? Math.abs(val) / Math.abs(maxNeg) : 0;
  if (s >= 0.85) return "url(#neg-hi)";
  if (s >= 0.45) return "url(#neg-md)";
  if (s >= 0.15) return "url(#neg-lo)";
  return "url(#neg-xs)";
}

function spyGradFill(val: number, maxAbs: number): string {
  const s = maxAbs > 0 ? Math.abs(val) / maxAbs : 0;
  const tier = s >= 0.85 ? "hi" : s >= 0.45 ? "md" : s >= 0.15 ? "lo" : "xs";
  return val >= 0 ? `url(#spy-pos-${tier})` : `url(#spy-neg-${tier})`;
}

function tickInterval(length: number) {
  if (length <= 8) return 0;
  if (length <= 20) return 1;
  if (length <= 52) return Math.max(1, Math.floor(length / 12));
  return Math.max(1, Math.floor(length / 10));
}

// ── Tooltips ────────────────────────────────────────────────────────────────

function BarToolTip({
  active, payload, label, showBenchmark,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ value?: number | string; dataKey?: string }>;
  label?: string | number;
  showBenchmark?: boolean;
}) {
  if (!active || !payload?.length) return null;
  const portfolio = payload.find((p) => p.dataKey === "returnPct");
  const spy = payload.find((p) => p.dataKey === "spyReturnPct");
  const pVal = portfolio?.value != null ? Number(portfolio.value) : null;
  const sVal = spy?.value != null ? Number(spy.value) : null;
  if (!String(label ?? "").trim()) return null;
  return (
    <div style={{
      background: "#111216", border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 8, padding: "7px 12px", fontSize: 11,
      fontFamily: "var(--font-text)", boxShadow: "0 8px 24px rgba(0,0,0,0.6)", minWidth: 140,
    }}>
      <p style={{ color: "#8d8f98", margin: "0 0 4px" }}>{String(label ?? "")}</p>
      {pVal != null && (
        <p style={{ color: "#f5f5f7", fontWeight: 700, margin: "0 0 2px" }}>
          Portfolio: {formatSignedPercent(pVal)}
        </p>
      )}
      {showBenchmark && sVal != null && (
        <>
          <p style={{ color: "#ef7070", fontWeight: 600, margin: "0 0 2px" }}>
            S&amp;P 500: {formatSignedPercent(sVal)}
          </p>
          {pVal != null && (
            <p style={{ color: "#6b7280", margin: 0, fontSize: 10 }}>
              Diff: {formatSignedPercent(pVal - sVal)}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function LineToolTip({
  active, payload, label, showBenchmark,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ value?: number | string; dataKey?: string; payload?: Record<string, unknown> }>;
  label?: string | number;
  showBenchmark?: boolean;
}) {
  if (!active || !payload?.length) return null;
  if (!String(label ?? "").trim()) return null;
  const main = payload.find((p) => p.dataKey === "cumulativePct");
  const spy = payload.find((p) => p.dataKey === "spyCumulativePct");
  const pVal = main?.value != null ? Number(main.value) : null;
  const sVal = spy?.value != null ? Number(spy.value) : null;
  const point = payload[0]?.payload ?? {};
  const acc1 = point.acc1CumulativePct ?? point.acc1ReturnPct;
  const acc2 = point.acc2CumulativePct ?? point.acc2ReturnPct;
  const hasBreakdown = acc1 !== null && acc1 !== undefined;
  return (
    <div style={{
      background: "#111216", border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 8, padding: "7px 12px", fontSize: 11,
      fontFamily: "var(--font-text)", boxShadow: "0 8px 24px rgba(0,0,0,0.6)", minWidth: 140,
    }}>
      <p style={{ color: "#8d8f98", margin: "0 0 4px" }}>{String(label ?? "")}</p>
      {pVal != null && (
        <p style={{ color: "#f5f5f7", fontWeight: 700, margin: "0 0 2px" }}>
          Portfolio: {formatSignedPercent(pVal)}
        </p>
      )}
      {hasBreakdown && (
        <>
          <p style={{ color: "#9ca3af", margin: "0 0 1px", fontSize: 10 }}>
            Acc 1: {formatSignedPercent(Number(acc1))}
          </p>
          <p style={{ color: "#9ca3af", margin: "0 0 2px", fontSize: 10 }}>
            Acc 2:{" "}
            {acc2 !== null && acc2 !== undefined ? formatSignedPercent(Number(acc2)) : "n/a"}
          </p>
        </>
      )}
      {showBenchmark && sVal != null && (
        <>
          <p style={{ color: "#ef7070", fontWeight: 600, margin: "0 0 2px" }}>
            S&amp;P 500: {formatSignedPercent(sVal)}
          </p>
          {pVal != null && (
            <p style={{ color: "#6b7280", margin: 0, fontSize: 10 }}>
              Diff: {formatSignedPercent(pVal - sVal)}
            </p>
          )}
        </>
      )}
    </div>
  );
}

// ── Tables ──────────────────────────────────────────────────────────────────

function MatrixTable({
  data,
  matrixOverride,
  showBenchmark,
  spyMonthlyMap,
}: {
  data: CapalifeData;
  matrixOverride?: Array<{ year: number; months: Array<number | null>; total: number }>;
  showBenchmark?: boolean;
  spyMonthlyMap?: Map<string, number>;
}) {
  const kpis = getHomeTrackRecordKpis(data);
  const matrix = matrixOverride ?? buildTableMatrix(data);
  const terminalGold = "#C9A84C";
  return (
    <div style={{ height: "100%", overflow: "auto" }}>
      <table style={{
        width: "100%", minWidth: 920, borderCollapse: "collapse",
        fontSize: 19, fontFamily: "var(--font-text)", color: "#e2e6ed",
      }}>
        <thead>
          <tr style={{ background: "rgba(255,255,255,0.03)" }}>
            <th style={{ padding: "18px 14px", textAlign: "left", color: "#7d8390", fontWeight: 800, fontSize: 15 }}>Year</th>
            {MONTH_ABBR.map((month) => (
              <th key={month} style={{ padding: "18px 10px", textAlign: "right", color: "#7d8390", fontWeight: 800, fontSize: 15 }}>{month}</th>
            ))}
            <th style={{ padding: "18px 12px", textAlign: "right", color: terminalGold, fontWeight: 800, fontSize: 15 }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {matrix.map((row) => {
            const spyMonths = showBenchmark && spyMonthlyMap
              ? MONTH_ABBR.map((_, i) => {
                  const k = `${row.year}-${String(i + 1).padStart(2, "0")}`;
                  return spyMonthlyMap.get(k) ?? null;
                })
              : null;
            const spyYearTotal = showBenchmark && spyMonthlyMap
              ? (() => {
                  const vals = MONTH_ABBR.map((_, i) => {
                    const k = `${row.year}-${String(i + 1).padStart(2, "0")}`;
                    return spyMonthlyMap.get(k);
                  }).filter((v): v is number => v != null);
                  return vals.length ? compoundGains(vals) : null;
                })()
              : null;
            return (
              <tr key={row.year}>
                <td style={{ padding: "20px 14px", borderTop: "1px solid rgba(255,255,255,0.05)", color: "#aeb5c2", fontWeight: 800 }}>{row.year}</td>
                {row.months.map((value, index) => {
                  const spyV = spyMonths ? spyMonths[index] : null;
                  return (
                    <td key={index} style={{ padding: "20px 10px", textAlign: "right", borderTop: "1px solid rgba(255,255,255,0.05)", fontWeight: 800 }}>
                      <span style={{ color: value === null ? "#4b5563" : value >= 0 ? "#eef2f7" : "#d98f8f" }}>
                        {value === null ? "—" : formatSignedPercent(value)}
                      </span>
                      {showBenchmark && spyV != null && (
                        <span style={{ display: "block", fontSize: 9, color: "#ef7070", fontWeight: 600, marginTop: 1 }}>
                          {formatSignedPercent(spyV)}
                        </span>
                      )}
                    </td>
                  );
                })}
                <td style={{ padding: "20px 12px", textAlign: "right", borderTop: "1px solid rgba(255,255,255,0.05)", fontWeight: 900 }}>
                  <span style={{ color: terminalGold }}>{formatSignedPercent(row.total)}</span>
                  {showBenchmark && spyYearTotal != null && (
                    <span style={{ display: "block", fontSize: 10, color: "#ef7070", fontWeight: 700 }}>
                      {formatSignedPercent(spyYearTotal)}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr style={{ background: "rgba(255,255,255,0.03)" }}>
            <td style={{ padding: "20px 14px", borderTop: "1px solid rgba(255,255,255,0.08)", color: "#e2e6ed", fontWeight: 900 }}>
              Combined
            </td>
            <td colSpan={12} style={{ padding: "20px 14px", borderTop: "1px solid rgba(255,255,255,0.08)", textAlign: "right", color: "#aeb5c2", fontWeight: 700, fontSize: 17 }}>
              Account 1 {formatSignedPercent(kpis.account1End, 2)} · Account 2 {formatSignedPercent(kpis.account2End, 2)}
            </td>
            <td style={{ padding: "20px 12px", textAlign: "right", borderTop: "1px solid rgba(255,255,255,0.08)", color: terminalGold, fontWeight: 900 }}>
              {formatSignedPercent(kpis.expectedEnd, 1)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function ListTable({
  rows,
  data,
  showBenchmark,
  spyPeriodMap,
}: {
  rows: Array<{ label: string; key: string; periodReturnPct: number }>;
  data: CapalifeData;
  showBenchmark?: boolean;
  spyPeriodMap?: Map<string, number>;
}) {
  const kpis = getHomeTrackRecordKpis(data);
  const terminalGold = "#C9A84C";
  const hasSpy = showBenchmark && spyPeriodMap != null;
  return (
    <div style={{ height: "100%", overflow: "auto" }}>
      <table style={{
        width: "100%", borderCollapse: "collapse",
        fontSize: 13, fontFamily: "var(--font-text)", color: "#e2e6ed",
      }}>
        <thead>
          <tr style={{ background: "rgba(255,255,255,0.03)" }}>
            <th style={{ padding: "18px 14px", textAlign: "left", color: "#7d8390", fontWeight: 800, fontSize: 15 }}>Period</th>
            <th style={{ padding: "18px 14px", textAlign: "right", color: "#7d8390", fontWeight: 800, fontSize: 15 }}>Portfolio</th>
            {hasSpy && (
              <th style={{ padding: "18px 14px", textAlign: "right", color: "#ef7070", fontWeight: 800, fontSize: 15 }}>S&amp;P 500</th>
            )}
            {hasSpy && (
              <th style={{ padding: "18px 14px", textAlign: "right", color: "#7d8390", fontWeight: 800, fontSize: 15 }}>Diff</th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const spyV = hasSpy ? spyPeriodMap!.get(row.key) ?? null : null;
            return (
              <tr key={row.label}>
                <td style={{ padding: "20px 14px", borderTop: "1px solid rgba(255,255,255,0.05)", fontWeight: 700 }}>{row.label}</td>
                <td style={{ padding: "20px 14px", textAlign: "right", borderTop: "1px solid rgba(255,255,255,0.05)", color: row.periodReturnPct >= 0 ? "#eef2f7" : "#d98f8f", fontWeight: 700 }}>
                  {formatSignedPercent(row.periodReturnPct)}
                </td>
                {hasSpy && (
                  <td style={{ padding: "20px 14px", textAlign: "right", borderTop: "1px solid rgba(255,255,255,0.05)", color: "#ef7070", fontWeight: 700 }}>
                    {spyV != null ? formatSignedPercent(spyV) : "—"}
                  </td>
                )}
                {hasSpy && (
                  <td style={{ padding: "20px 14px", textAlign: "right", borderTop: "1px solid rgba(255,255,255,0.05)", fontWeight: 700 }}>
                    {spyV != null
                      ? <span style={{ color: row.periodReturnPct >= spyV ? "#C9A84C" : "#ef4444" }}>
                          {formatSignedPercent(row.periodReturnPct - spyV)}
                        </span>
                      : <span style={{ color: "#6b7280" }}>—</span>
                    }
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr style={{ background: "rgba(255,255,255,0.03)" }}>
            <td style={{ padding: "20px 14px", borderTop: "1px solid rgba(255,255,255,0.08)", color: "#e2e6ed", fontWeight: 800 }}>Combined Total</td>
            <td style={{ padding: "20px 14px", textAlign: "right", borderTop: "1px solid rgba(255,255,255,0.08)", color: terminalGold, fontWeight: 900 }}>
              {formatSignedPercent(kpis.expectedEnd, 1)}
            </td>
            {hasSpy && <td colSpan={2} style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }} />}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function PerformanceReportChart({ trades, timeframe, view, capalifeData, compact, showBenchmark, spyDailyReturns, performanceSeries, tradeEventSeries }: Props) {
  const [showWatermark, setShowWatermark] = useState(true);

  // Watermark: bottom-right, 50% opacity, click to toggle. Fixed-size div stays clickable when hidden.
  const watermark = (
    <div
      onClick={() => setShowWatermark((v: boolean) => !v)}
      title={showWatermark ? "Logo ausblenden" : "Logo einblenden"}
      style={{
        position: "absolute",
        bottom: 36,
        right: view === "Line" ? 112 : 18,
        zIndex: 10,
        cursor: "pointer",
        width: 260,
        height: 64,
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        opacity: showWatermark ? 0.66 : 0,
        transition: "opacity 200ms ease",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/CAPITALIFE_Logo.png" alt="Capital Life" style={{ maxHeight: 60, width: "auto", display: "block" }} />
    </div>
  );

  // Use trade-event series when available (one point per trade); fall back to daily series, then capalifeData-derived
  const lineData = useMemo(() => {
    if (tradeEventSeries && tradeEventSeries.length > 0) {
      return buildLineDataFromTradeEvents(tradeEventSeries, timeframe);
    }
    if (performanceSeries && performanceSeries.length > 0) {
      return buildLineDataFromDailySeries(performanceSeries, timeframe);
    }
    return buildLineData(trades, timeframe, capalifeData);
  }, [tradeEventSeries, performanceSeries, trades, timeframe, capalifeData]);
  const barData = useMemo(() => {
    if (tradeEventSeries && tradeEventSeries.length > 0) return buildBarDataFromTradeEvents(tradeEventSeries, timeframe);
    return buildBarData(trades, timeframe, capalifeData);
  }, [tradeEventSeries, trades, timeframe, capalifeData]);
  const tableRows = useMemo(() => {
    if (tradeEventSeries && tradeEventSeries.length > 0) return buildTableListFromTradeEvents(tradeEventSeries, timeframe);
    return buildTableList(trades, timeframe, capalifeData);
  }, [tradeEventSeries, trades, timeframe, capalifeData]);
  const matrixFromEvents = useMemo(() => {
    if (tradeEventSeries && tradeEventSeries.length > 0) return buildTableMatrixFromTradeEvents(tradeEventSeries);
    return null;
  }, [tradeEventSeries]);
  const validation = useMemo(() => validateHomeTrackRecordSeries(timeframe, lineData, capalifeData), [timeframe, lineData, capalifeData]);

  const lineInterval = compact ? Math.max(1, tickInterval(lineData.length) * 2 + 1) : tickInterval(lineData.length);
  const barInterval  = compact ? Math.max(1, tickInterval(barData.length)  * 2 + 1) : tickInterval(barData.length);
  const show1D1WNote = timeframe === "1D" || timeframe === "1W";

  const maxPos = useMemo(() => Math.max(0, ...barData.map(d => d.returnPct)), [barData]);
  const maxNeg = useMemo(() => Math.min(0, ...barData.map(d => d.returnPct)), [barData]);

  // ── SPY enrichment ──────────────────────────────────────────────────────
  const SPY_START = "2024-04-11";
  const SPY_END   = "2026-07-01";
  const spy = spyDailyReturns ?? [];
  const activeBenchmark = showBenchmark && spy.length > 0;

  // Spy period map for bar + table
  const spyPeriodMap = useMemo<Map<string, number>>(() => {
    if (!activeBenchmark) return new Map();
    return buildSpyPeriodMap(spy, SPY_START, SPY_END, timeframe);
  }, [activeBenchmark, spy, timeframe]);

  // Spy cumulative for line chart
  const spyCumulativeMap = useMemo<Map<string, number>>(() => {
    if (!activeBenchmark) return new Map();
    if (timeframe === "1D") {
      // Daily: one map entry per trading day (YYYY-MM-DD)
      return buildSpyCumulativeByDate(spy, SPY_START, SPY_END);
    }
    // 1W / 1M / 3M / 1Y: compound period returns using portfolio's period keys
    const keys = lineData.map(p => p.key);
    return buildSpyCumulativeFromPeriods(keys, spyPeriodMap);
  }, [activeBenchmark, spy, timeframe, lineData, spyPeriodMap]);

  // Enrich bar data
  const enrichedBarData = useMemo(() => {
    if (!activeBenchmark) return barData.map(d => ({ ...d, spyReturnPct: null as number | null }));
    return barData.map(d => ({
      ...d,
      spyReturnPct: spyPeriodMap.get(d.key) ?? null,
    }));
  }, [activeBenchmark, barData, spyPeriodMap]);

  // Enrich line data with spy cumulative
  const enrichedLineData = useMemo(() => {
    const base = lineData.map(d => ({
      ...d,
      spyCumulativePct: activeBenchmark ? (spyCumulativeMap.get(d.key) ?? null) : null as number | null,
    }));

    // Prepend a zero-anchor so both lines always start at 0%
    if (view === "Line" && base.length > 0) {
      const first = base[0];
      const anchor = {
        ...first,
        key: "~anchor~",
        label: "",   // empty label = no X-axis tick label for anchor
        cumulativePct: 0,
        spyCumulativePct: activeBenchmark ? 0 : null as number | null,
        periodReturnPct: 0,
        acc1CumulativePct: 0 as number | null,
        acc2CumulativePct: 0 as number | null,
        acc1ReturnPct: 0 as number | null,
        acc2ReturnPct: 0 as number | null,
      };
      return [anchor, ...base];
    }
    return base;
  }, [activeBenchmark, lineData, spyCumulativeMap, view, show1D1WNote]);

  // Max abs for spy bar intensity
  const maxSpyAbs = useMemo(() => {
    if (!activeBenchmark) return 0;
    const vals = enrichedBarData.map(d => Math.abs(d.spyReturnPct ?? 0));
    return Math.max(0, ...vals);
  }, [activeBenchmark, enrichedBarData]);

  void groupMonthlyReturns; // imported but only used via buildBarData/buildLineData internally

  if (process.env.NODE_ENV !== "production" && validation.status !== "ok") {
    console.warn("Home track record validation failed", validation);
  }

  if (view === "Table") {
    const spyMonthlyMap = activeBenchmark && timeframe === "1M"
      ? buildSpyPeriodMap(spy, SPY_START, SPY_END, "1M")
      : undefined;
    return (
      <div style={{ position: "relative", width: "100%", height: "100%" }}>
        {timeframe === "1M"
          ? <MatrixTable data={capalifeData} matrixOverride={matrixFromEvents ?? undefined} showBenchmark={activeBenchmark} spyMonthlyMap={spyMonthlyMap} />
          : <ListTable rows={tableRows} data={capalifeData} showBenchmark={activeBenchmark} spyPeriodMap={activeBenchmark ? spyPeriodMap : undefined} />}
        {watermark}
      </div>
    );
  }

  // Line chart interval accounting for anchor point
  const adjustedLineInterval = show1D1WNote && enrichedLineData.length > 1
    ? tickInterval(enrichedLineData.length - 1)
    : lineInterval;

  if (view === "Line") {
    // Y-axis ticks in steps of 10
    const allVals = enrichedLineData.flatMap(d => [d.cumulativePct, d.spyCumulativePct ?? null]).filter((v): v is number => v != null);
    const rawMin = allVals.length ? Math.min(...allVals) : -10;
    const rawMax = allVals.length ? Math.max(...allVals) : 80;
    const tickMin = rawMin >= -2 ? -20 : Math.floor((rawMin - 2) / 10) * 10 - 2;
    const tickMax = Math.ceil((rawMax * 1.06) / 10) * 10;
    const domainMax = rawMax * 1.08; // non-round ceiling — avoids Recharts snapping a tick at tickMax
    const yTicks: number[] = [-10];
    for (let t = 0; t < tickMax; t += 10) yTicks.push(t); // -10 shown as label only, grid only for t>=0

    const lastPortfolioIndex = enrichedLineData.length - 1;
    const lastSpyIndex = activeBenchmark
      ? enrichedLineData.reduce((acc, d, i) => (d.spyCumulativePct != null ? i : acc), -1)
      : -1;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const portfolioDot = (props: any) => {
      const { cx, cy, index } = props;
      if (index !== lastPortfolioIndex || cx == null || cy == null) return <g key={`pd-${index}`} />;
      const val: number | null = props.payload?.cumulativePct;
      if (val == null) return <g key={`pd-null`} />;
      return (
        <g key="portfolio-end">
          <circle cx={cx} cy={cy} r={3} fill="#e6e7ea" />
          <image href="/CAPITALIFE_ICON.png" x={cx + 10} y={cy - 11} width={22} height={22} />
          <text
            x={cx + 36}
            y={cy + 5}
            fill="#e8e9ec"
            fontSize={13}
            fontWeight={700}
            fontFamily="var(--font-numbers,'Nunito',sans-serif)"
            data-testid="home-track-record-chart-last-return"
          >
            {formatSignedPercent(val)}
          </text>
        </g>
      );
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const spyDot = (props: any) => {
      const { cx, cy, index } = props;
      if (index !== lastSpyIndex || cx == null || cy == null) return <g key={`sd-${index}`} />;
      const val: number | null = props.payload?.spyCumulativePct;
      if (val == null) return <g key={`sd-null`} />;
      return (
        <g key="spy-end">
          <circle cx={cx} cy={cy} r={3} fill="#ef5555" />
          <image href="/assets/invest/spy.png" x={cx + 10} y={cy - 11} width={22} height={22} clipPath="url(#spy-end-circle)" />
          <text x={cx + 36} y={cy + 5} fill="#ef7070" fontSize={13} fontWeight={700} fontFamily="var(--font-numbers,'Nunito',sans-serif)">
            {formatSignedPercent(val)}
          </text>
        </g>
      );
    };

    return (
      <div style={{ position: "relative", width: "100%", height: "100%" }}>
        {/* Hidden testid spans for integration verification */}
        <span
          data-testid="home-track-record-chart-point-count"
          style={{ display: "none" }}
          aria-hidden="true"
        >
          {tradeEventSeries?.length ?? lineData.length}
        </span>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={enrichedLineData} margin={{ top: 4, right: 108, bottom: 8, left: -8 }}>
            <defs>
              <linearGradient id="lineAreaFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(255,255,255,0.30)" />
                <stop offset="60%" stopColor="rgba(255,255,255,0.08)" />
                <stop offset="100%" stopColor="rgba(255,255,255,0.00)" />
              </linearGradient>
              <linearGradient id="spyAreaFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(239,85,85,0.28)" />
                <stop offset="60%" stopColor="rgba(239,85,85,0.07)" />
                <stop offset="100%" stopColor="rgba(239,85,85,0.00)" />
              </linearGradient>
              <clipPath id="spy-end-circle" clipPathUnits="objectBoundingBox">
                <circle cx="0.5" cy="0.5" r="0.5" />
              </clipPath>
            </defs>
            {yTicks.filter(t => t >= 0 || !showWatermark).map(t => <ReferenceLine key={`g${t}`} y={t} stroke="rgba(255,255,255,0.065)" strokeWidth={1} />)}
            <XAxis
              dataKey="label"
              tick={{ fontSize: compact ? 9 : 11, fill: "#686b73", fontFamily: "var(--font-numbers,'Nunito',sans-serif)" }}
              tickLine={false}
              axisLine={false}
              interval={adjustedLineInterval}
              tickFormatter={(v: string) => {
                // "28 May 24" → "May '24" · "Jan '24" → unchanged · "2024-Q1" → "Q1 '24"
                const parts = v.split(" ");
                if (parts.length === 3) return `${parts[1]} '${parts[2]}`;
                if (parts.length === 2 && parts[0].startsWith("'")) return v;
                return v;
              }}
            />
            <YAxis tick={{ fontSize: 11, fill: "#686b73", fontFamily: "var(--font-numbers,'Nunito',sans-serif)" }} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${v >= 0 ? "+" : ""}${v}%`} ticks={yTicks} domain={[tickMin, domainMax]} />
            <Tooltip content={<LineToolTip showBenchmark={activeBenchmark} />} cursor={{ stroke: "rgba(255,255,255,0.10)", strokeWidth: 1 }} />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.16)" strokeWidth={1} />
            {activeBenchmark && (
              <Area
                dataKey="spyCumulativePct"
                name="S&P 500"
                stroke="#ef5555"
                strokeWidth={1.5}
                strokeDasharray="4 2"
                fill="url(#spyAreaFill)"
                dot={spyDot}
                activeDot={{ r: 3, fill: "#ef5555", strokeWidth: 0 }}
                connectNulls={timeframe === "1D"}
              />
            )}
            <Area
              dataKey="cumulativePct"
              name="Portfolio"
              stroke="#e6e7ea"
              strokeWidth={2.2}
              fill="url(#lineAreaFill)"
              dot={portfolioDot}
              activeDot={{ r: 3.5, fill: "#e6e7ea", strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
        {watermark}
      </div>
    );
  }

  // Bar chart
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={enrichedBarData}
          margin={{ top: 6, right: 12, bottom: 2, left: -16 }}
          barCategoryGap={activeBenchmark ? "16%" : "18%"}
          barGap={1}
        >
          <defs>
            {GRAD_DEFS.map(g => (
              <linearGradient key={g.id} id={g.id} x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2}>
                {g.stops.map(s => <stop key={s.o} offset={s.o} stopColor={s.c} />)}
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="3 5" stroke="rgba(255,255,255,0.045)" />
          <XAxis dataKey="label" tick={{ fontSize: compact ? 9 : 11, fill: "#686b73", fontFamily: "var(--font-text)" }} tickLine={false} axisLine={false} interval={barInterval} />
          <YAxis tick={{ fontSize: 11, fill: "#686b73", fontFamily: "var(--font-text)" }} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${v > 0 ? "+" : ""}${v}%`} />
          <Tooltip content={<BarToolTip showBenchmark={activeBenchmark} />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
          <ReferenceLine y={0} stroke="rgba(255,255,255,0.16)" strokeWidth={1} />
          <Bar dataKey="returnPct" radius={[3, 3, 0, 0]} maxBarSize={activeBenchmark ? 10 : 14} name="Portfolio">
            {enrichedBarData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={gradFill(entry.returnPct, maxPos, maxNeg)} />
            ))}
          </Bar>
          {activeBenchmark && (
            <Bar dataKey="spyReturnPct" radius={[3, 3, 0, 0]} maxBarSize={10} name="S&P 500">
              {enrichedBarData.map((entry, index) => (
                <Cell
                  key={`spy-${index}`}
                  fill={entry.spyReturnPct != null ? spyGradFill(entry.spyReturnPct, maxSpyAbs) : "transparent"}
                />
              ))}
            </Bar>
          )}
        </BarChart>
      </ResponsiveContainer>
      {watermark}
    </div>
  );
}
