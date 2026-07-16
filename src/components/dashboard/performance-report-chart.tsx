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

import monthlyData from "@/data/capitalife/performance-monthly.json";
import {
  compoundGains,
  deserializeTrades,
  type PerformanceAggregation,
  type SerializedTrade,
} from "@/lib/trades-analytics";
import {
  buildHomeLineSeries,
  buildHomePeriodReturns,
  HOME_TRACK_RECORD_ACCOUNT1_END,
  HOME_TRACK_RECORD_ACCOUNT2_END,
  HOME_TRACK_RECORD_EXPECTED_END,
  validateHomeTrackRecordSeries,
} from "@/lib/home-performance-track-record";

export type TimeFrame = PerformanceAggregation;
export type ViewMode = "Bar" | "Line" | "Table";

type Props = {
  trades: SerializedTrade[];
  timeframe: TimeFrame;
  view: ViewMode;
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

function parseMonthlyRows(): MonthlyReturnRow[] {
  return monthlyData.monthly_returns.map((row) => ({
    year: row.year,
    month: Number(row.month.slice(5, 7)),
    label: row.label,
    returnPct: row.return_pct,
  }));
}

function groupMonthlyReturns(aggregation: TimeFrame) {
  const rows = parseMonthlyRows();
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
    label:
      aggregation === "3M"
        ? key
        : key,
    periodReturnPct: compoundGains(entries.map((entry) => entry.returnPct)),
    year: entries[0]?.year ?? 0,
  }));
}

function buildLineData(trades: SerializedTrade[], aggregation: TimeFrame) {
  const tradeRows = deserializeTrades(trades);
  return buildHomeLineSeries(tradeRows, aggregation).map((p) => ({
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

function buildBarData(trades: SerializedTrade[], aggregation: TimeFrame) {
  if (aggregation === "1M" || aggregation === "3M" || aggregation === "1Y") {
    return buildHomePeriodReturns(aggregation).map((row) => ({
      label: row.label,
      returnPct: Number(row.periodReturnPct.toFixed(2)),
      acc1ReturnPct: null as number | null,
      acc2ReturnPct: null as number | null,
      year: row.year,
    }));
  }

  return buildLineData(trades, aggregation).map((p) => ({
    label: p.label,
    returnPct: p.periodReturnPct,
    acc1ReturnPct: p.acc1ReturnPct as number | null,
    acc2ReturnPct: p.acc2ReturnPct,
    year: p.year,
  }));
}

function buildTableMatrix() {
  const rows = parseMonthlyRows();
  const byYear = new Map<number, Map<number, number>>();

  for (const row of rows) {
    if (!byYear.has(row.year)) byYear.set(row.year, new Map());
    byYear.get(row.year)!.set(row.month, row.returnPct);
  }

  return [...byYear.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([year, months]) => ({
      year,
      months: MONTH_ABBR.map((_, index) => months.get(index + 1) ?? null),
      total: compoundGains([...months.values()]),
    }));
}

function buildTableList(trades: SerializedTrade[], aggregation: TimeFrame) {
  if (aggregation === "1M") return [];

  if (aggregation === "3M" || aggregation === "1Y") {
    return buildHomePeriodReturns(aggregation).map((row) => ({
      label: row.label,
      periodReturnPct: Number(row.periodReturnPct.toFixed(2)),
    }));
  }

  return buildLineData(trades, aggregation).map((row) => ({
    label: row.label,
    periodReturnPct: row.periodReturnPct,
  }));
}

// ── Tiered bar gradients (8 defs, strength-based selection) ─────────────────

const GRAD_DEFS = [
  // Positive tiers — gradient goes bottom → top (y1=1 → y2=0)
  { id: "pos-hi", x1:"0",y1:"1",x2:"0",y2:"0", stops:[{o:"0%",c:"#5d6067"},{o:"52%",c:"#f2f3f4"},{o:"100%",c:"#d8c071"}] },
  { id: "pos-md", x1:"0",y1:"1",x2:"0",y2:"0", stops:[{o:"0%",c:"#565a60"},{o:"62%",c:"#d6d8db"},{o:"100%",c:"#eff0f2"}] },
  { id: "pos-lo", x1:"0",y1:"1",x2:"0",y2:"0", stops:[{o:"0%",c:"#44484f"},{o:"100%",c:"#aeb2b8"}] },
  { id: "pos-xs", x1:"0",y1:"1",x2:"0",y2:"0", stops:[{o:"0%",c:"#3a3d43"},{o:"100%",c:"#777c85"}] },
  // Negative tiers — gradient goes top → bottom (y1=0 → y2=1)
  { id: "neg-hi", x1:"0",y1:"0",x2:"0",y2:"1", stops:[{o:"0%",c:"#4c4f56"},{o:"100%",c:"#9a5b60"}] },
  { id: "neg-md", x1:"0",y1:"0",x2:"0",y2:"1", stops:[{o:"0%",c:"#4c4f56"},{o:"100%",c:"#7a5155"}] },
  { id: "neg-lo", x1:"0",y1:"0",x2:"0",y2:"1", stops:[{o:"0%",c:"#3d3f45"},{o:"100%",c:"#5d4649"}] },
  { id: "neg-xs", x1:"0",y1:"0",x2:"0",y2:"1", stops:[{o:"0%",c:"#34363b"},{o:"100%",c:"#484148"}] },
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

function tickInterval(length: number) {
  if (length <= 8) return 0;
  if (length <= 20) return 1;
  if (length <= 52) return Math.max(1, Math.floor(length / 12));
  return Math.max(1, Math.floor(length / 10));
}

function ToolTip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ value?: number | string; payload?: Record<string, unknown> }>;
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  const value = Number(payload[0]?.value ?? 0);
  const point = payload[0]?.payload ?? {};
  const acc1 = point.acc1CumulativePct ?? point.acc1ReturnPct;
  const acc2 = point.acc2CumulativePct ?? point.acc2ReturnPct;
  const hasBreakdown = acc1 !== null && acc1 !== undefined;
  return (
    <div
      style={{
        background: "#111216",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 8,
        padding: "7px 12px",
        fontSize: 11,
        fontFamily: "var(--font-montserrat,sans-serif)",
        boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
        minWidth: 130,
      }}
    >
      <p style={{ color: "#8d8f98", margin: "0 0 4px" }}>{String(label ?? "")}</p>
      <p style={{ color: "#f5f5f7", fontWeight: 700, margin: "0 0 2px" }}>
        Combined: {formatSignedPercent(value)}
      </p>
      {hasBreakdown && (
        <>
          <p style={{ color: "#9ca3af", margin: "0 0 1px", fontSize: 10 }}>
            Acc 1: {formatSignedPercent(Number(acc1))}
          </p>
          <p style={{ color: "#9ca3af", margin: 0, fontSize: 10 }}>
            Acc 2:{" "}
            {acc2 !== null && acc2 !== undefined
              ? formatSignedPercent(Number(acc2))
              : "n/a"}
          </p>
        </>
      )}
    </div>
  );
}

function MatrixTable() {
  const matrix = buildTableMatrix();
  return (
    <div style={{ height: "100%", overflow: "auto" }}>
      <table
        style={{
          width: "100%",
          minWidth: 720,
          borderCollapse: "collapse",
          fontSize: 11,
          fontFamily: "var(--font-montserrat,sans-serif)",
          color: "#e2e6ed",
        }}
      >
        <thead>
          <tr style={{ background: "rgba(255,255,255,0.03)" }}>
            <th style={{ padding: "8px 10px", textAlign: "left", color: "#686b73", fontWeight: 600, fontSize: 10 }}>Year</th>
            {MONTH_ABBR.map((month) => (
              <th key={month} style={{ padding: "8px 6px", textAlign: "right", color: "#686b73", fontWeight: 600, fontSize: 10 }}>
                {month}
              </th>
            ))}
            <th style={{ padding: "8px 8px", textAlign: "right", color: "#e2e6ed", fontWeight: 600, fontSize: 10 }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {matrix.map((row) => (
            <tr key={row.year}>
              <td style={{ padding: "8px 10px", borderTop: "1px solid rgba(255,255,255,0.05)", color: "#9ca0aa", fontWeight: 600 }}>{row.year}</td>
              {row.months.map((value, index) => (
                <td key={index} style={{ padding: "8px 6px", textAlign: "right", borderTop: "1px solid rgba(255,255,255,0.05)", color: value === null ? "#4b5563" : value >= 0 ? "#d6d8dc" : "#c08080" }}>
                  {value === null ? "—" : formatSignedPercent(value)}
                </td>
              ))}
              <td style={{ padding: "8px 8px", textAlign: "right", borderTop: "1px solid rgba(255,255,255,0.05)", color: "#f0e2a2", fontWeight: 700 }}>
                {formatSignedPercent(row.total)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ background: "rgba(255,255,255,0.03)" }}>
            <td style={{ padding: "8px 10px", borderTop: "1px solid rgba(255,255,255,0.08)", color: "#e2e6ed", fontWeight: 700 }}>
              Combined
            </td>
            <td colSpan={12} style={{ padding: "8px 10px", borderTop: "1px solid rgba(255,255,255,0.08)", textAlign: "right", color: "#9ca0aa" }}>
              Account 1 {formatSignedPercent(HOME_TRACK_RECORD_ACCOUNT1_END, 2)} · Account 2 {formatSignedPercent(HOME_TRACK_RECORD_ACCOUNT2_END, 2)}
            </td>
            <td style={{ padding: "8px 8px", textAlign: "right", borderTop: "1px solid rgba(255,255,255,0.08)", color: "#f0e2a2", fontWeight: 700 }}>
              {formatSignedPercent(HOME_TRACK_RECORD_EXPECTED_END, 1)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function ListTable({ rows }: { rows: Array<{ label: string; periodReturnPct: number }> }) {
  return (
    <div style={{ height: "100%", overflow: "auto" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 11,
          fontFamily: "var(--font-montserrat,sans-serif)",
          color: "#e2e6ed",
        }}
      >
        <thead>
          <tr style={{ background: "rgba(255,255,255,0.03)" }}>
            <th style={{ padding: "8px 10px", textAlign: "left", color: "#686b73", fontWeight: 600, fontSize: 10 }}>Period</th>
            <th style={{ padding: "8px 10px", textAlign: "right", color: "#686b73", fontWeight: 600, fontSize: 10 }}>Return</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <td style={{ padding: "8px 10px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>{row.label}</td>
              <td style={{ padding: "8px 10px", textAlign: "right", borderTop: "1px solid rgba(255,255,255,0.05)", color: row.periodReturnPct >= 0 ? "#d6d8dc" : "#c08080" }}>
                {formatSignedPercent(row.periodReturnPct)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ background: "rgba(255,255,255,0.03)" }}>
            <td style={{ padding: "8px 10px", borderTop: "1px solid rgba(255,255,255,0.08)", color: "#e2e6ed", fontWeight: 700 }}>Combined Total</td>
            <td style={{ padding: "8px 10px", textAlign: "right", borderTop: "1px solid rgba(255,255,255,0.08)", color: "#f0e2a2", fontWeight: 700 }}>
              {formatSignedPercent(HOME_TRACK_RECORD_EXPECTED_END, 1)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function Acc2Note({ lastDate }: { lastDate: string | null }) {
  return (
    <div
      style={{
        position: "absolute",
        bottom: 4,
        left: 12,
        fontSize: 9,
        color: "#44474f",
        fontFamily: "var(--font-montserrat,sans-serif)",
        pointerEvents: "none",
        userSelect: "none",
      }}
    >
      {lastDate ? `Data as of ${lastDate} · ` : ""}Acc 2: partial visible history · official end anchored to Performance Report · statement-based · Not live
    </div>
  );
}

export function PerformanceReportChart({ trades, timeframe, view }: Props) {
  const lineData = useMemo(() => buildLineData(trades, timeframe), [trades, timeframe]);
  const barData = useMemo(() => buildBarData(trades, timeframe), [trades, timeframe]);
  const tableRows = useMemo(() => buildTableList(trades, timeframe), [trades, timeframe]);
  const validation = useMemo(
    () => validateHomeTrackRecordSeries(timeframe, lineData),
    [timeframe, lineData]
  );
  const lineInterval = tickInterval(lineData.length);
  const barInterval = tickInterval(barData.length);
  const show1D1WNote = timeframe === "1D" || timeframe === "1W";
  const lastDataDate = useMemo(() => {
    if (!show1D1WNote) return null;
    // Use last key from line data (covers acc2 dates beyond acc1)
    const last = lineData[lineData.length - 1] as { key?: string; label?: string } | undefined;
    return last?.key ?? null;
  }, [show1D1WNote, lineData]);
  const maxPos = useMemo(() => Math.max(0, ...barData.map(d => d.returnPct)), [barData]);
  const maxNeg = useMemo(() => Math.min(0, ...barData.map(d => d.returnPct)), [barData]);

  if (process.env.NODE_ENV !== "production" && validation.status !== "ok") {
    console.warn("Home track record validation failed", validation);
  }

  if (view === "Table") {
    return timeframe === "1M" ? <MatrixTable /> : <ListTable rows={tableRows} />;
  }

  if (view === "Line") {
    return (
      <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {show1D1WNote && <Acc2Note lastDate={lastDataDate} />}
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={lineData} margin={{ top: 8, right: 12, bottom: 2, left: -16 }}>
          <defs>
            <linearGradient id="lineAreaFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(255,255,255,0.16)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0.00)" />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="3 5" stroke="rgba(255,255,255,0.04)" />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#686b73", fontFamily: "var(--font-montserrat,sans-serif)" }} tickLine={false} axisLine={false} interval={lineInterval} />
          <YAxis tick={{ fontSize: 11, fill: "#686b73", fontFamily: "var(--font-montserrat,sans-serif)" }} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${v >= 0 ? "+" : ""}${v}%`} />
          <Tooltip content={<ToolTip />} cursor={{ stroke: "rgba(255,255,255,0.10)", strokeWidth: 1 }} />
          <ReferenceLine y={0} stroke="rgba(255,255,255,0.16)" strokeWidth={1} />
          <Area dataKey="cumulativePct" name="Cumulative %" stroke="#e6e7ea" strokeWidth={2.2} fill="url(#lineAreaFill)" dot={false} activeDot={{ r: 3.5, fill: "#e6e7ea", strokeWidth: 0 }} />
        </AreaChart>
      </ResponsiveContainer>
      </div>
    );
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
    {show1D1WNote && <Acc2Note lastDate={lastDataDate} />}
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={barData} margin={{ top: 8, right: 12, bottom: 2, left: -16 }} barCategoryGap="18%">
        <defs>
          {GRAD_DEFS.map(g => (
            <linearGradient key={g.id} id={g.id} x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2}>
              {g.stops.map(s => <stop key={s.o} offset={s.o} stopColor={s.c} />)}
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 5" stroke="rgba(255,255,255,0.045)" />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#686b73", fontFamily: "var(--font-montserrat,sans-serif)" }} tickLine={false} axisLine={false} interval={barInterval} />
        <YAxis tick={{ fontSize: 11, fill: "#686b73", fontFamily: "var(--font-montserrat,sans-serif)" }} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${v > 0 ? "+" : ""}${v}%`} />
        <Tooltip content={<ToolTip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
        <ReferenceLine y={0} stroke="rgba(255,255,255,0.16)" strokeWidth={1} />
        <Bar dataKey="returnPct" radius={[3, 3, 0, 0]} maxBarSize={14} name="Return %">
          {barData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={gradFill(entry.returnPct, maxPos, maxNeg)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
    </div>
  );
}
