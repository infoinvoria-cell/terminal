"use client";

import { useMemo } from "react";
import {
  Area,
  ComposedChart,
  Line,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PerformanceCurvePoint } from "@/lib/monitoring/types";
import useObservedElementSize from "@/components/monitoring/useObservedElementSize";
import type { Phase } from "./ReferenzenPage";

export const REF_WF_OOS_START = "2008-01-01";
export const REF_LIVE_START   = "2025-01-01";

const MONITO: React.CSSProperties = { fontFamily: "var(--font-numbers, 'Nunito', sans-serif)" };
const MONTSERRAT = "var(--font-montserrat, 'Montserrat', sans-serif)";

const Y_AXIS_W = 42;
const MARGIN_R = 4;

const KPI_BG  = "linear-gradient(to bottom, #26262d, #111114)";
const PILL_CSS = `
  .rcx-pill { border-radius: 999px; cursor: pointer; transition: background 160ms ease, border-color 160ms ease; outline: none; display: flex; align-items: center; }
  .rcx-pill:focus-visible { outline: 2px solid rgba(180,200,220,0.45); outline-offset: 2px; }
  .rcx-active   { background: ${KPI_BG}; border: 1.5px solid rgba(255,255,255,0.28); }
  .rcx-active:hover   { border-color: rgba(255,255,255,0.42); }
  .rcx-inactive { background: transparent; border: 1.5px solid transparent; }
  .rcx-inactive:hover { background: ${KPI_BG}; border-color: rgba(255,255,255,0.18); }
`;

const PILL_STYLE: React.CSSProperties = {
  position: "absolute",
  transform: "translateX(-50%)",
  bottom: 2,
  background: "#0A0C12",
  borderRadius: 3,
  padding: "2px 7px",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  pointerEvents: "none",
  zIndex: 20,
};

function PhasePill({ left, date, label, color }: { left: number; date: string; label: string; color: string }) {
  return (
    <div style={{ ...PILL_STYLE, left }}>
      <span style={{ color, fontSize: 9, fontWeight: 700, fontFamily: MONTSERRAT, lineHeight: 1.3, whiteSpace: "nowrap" }}>{date}</span>
      <span style={{ color, fontSize: 8, fontWeight: 600, fontFamily: MONTSERRAT, lineHeight: 1.3, whiteSpace: "nowrap" }}>{label}</span>
    </div>
  );
}

function fmtPct(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}
function fmtDate(v: unknown): string {
  const s = String(v ?? "");
  return s.length >= 7 ? s.slice(0, 7) : s.slice(0, 10);
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      minWidth: 76, padding: "7px 11px 8px", borderRadius: 14,
      border: "1px solid rgba(255,255,255,0.055)",
      background: KPI_BG,
      display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 6,
    }}>
      <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: "0.04em",
        color: "rgba(180,192,210,0.6)", whiteSpace: "nowrap", lineHeight: 1, fontFamily: MONTSERRAT }}>
        {label}
      </span>
      <strong style={{ fontSize: 15, fontWeight: 700, lineHeight: 1, color: "#F0F2F6",
        whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums",
        fontFamily: "var(--font-numbers, 'Nunito', sans-serif)" }}>
        {value}
      </strong>
    </div>
  );
}

const PHASE_OPTS: Phase[] = ["All", "Test", "WF+OOS", "Live"];

type Props = {
  data: PerformanceCurvePoint[];
  totalReturnPercent?: number;
  cagr?: number;
  phase?: Phase;
  onPhaseChange?: (p: Phase) => void;
  benchmarkData?: { time: string; value: number }[];
};

export default function ReferenceEquityChart({ data, totalReturnPercent, cagr, phase = "All", onPhaseChange, benchmarkData }: Props) {
  const { ref: chartRef, size } = useObservedElementSize<HTMLDivElement>();

  // Filter data by phase
  const filteredRaw = useMemo(() => {
    if (phase === "All") return data;
    return data.filter(p => {
      const d = String(p.time ?? "").slice(0, 10);
      if (phase === "Test")   return d < REF_WF_OOS_START;
      if (phase === "WF+OOS") return d >= REF_WF_OOS_START && d < REF_LIVE_START;
      if (phase === "Live")   return d >= REF_LIVE_START;
      return true;
    });
  }, [data, phase]);

  // Normalize to phase start (so each phase starts at 0)
  const normalizedRaw = useMemo(() => {
    if (!filteredRaw.length) return filteredRaw;
    if (phase === "All") return filteredRaw;
    const base = Number(filteredRaw[0].value ?? 0);
    return filteredRaw.map(p => ({ ...p, value: +((Number(p.value ?? 0) - base).toFixed(2)) }));
  }, [filteredRaw, phase]);

  // Phase-specific KPIs
  const phaseReturn = useMemo(() => normalizedRaw[normalizedRaw.length - 1]?.value ?? 0, [normalizedRaw]);
  const phaseYears = useMemo(() => {
    if (normalizedRaw.length < 2) return 1;
    const t0 = new Date(String(normalizedRaw[0].time)).getTime();
    const t1 = new Date(String(normalizedRaw[normalizedRaw.length - 1].time)).getTime();
    return Math.max(0.08, (t1 - t0) / (365.25 * 86400000));
  }, [normalizedRaw]);
  const phaseCagr = useMemo(() => {
    if (phaseYears >= 1) return +((Math.pow(1 + phaseReturn / 100, 1 / phaseYears) - 1) * 100).toFixed(1);
    return +(phaseReturn / phaseYears).toFixed(1);
  }, [phaseReturn, phaseYears]);

  const displayReturn = phase === "All" ? (totalReturnPercent ?? phaseReturn) : phaseReturn;
  const displayCagr   = phase === "All" ? (cagr ?? phaseCagr) : phaseCagr;

  const benchMap = useMemo(() => {
    const m = new Map<string, number>();
    if (benchmarkData) {
      for (const b of benchmarkData) {
        const key = String(b.time ?? "").slice(0, 7);
        m.set(key, b.value);
      }
    }
    return m;
  }, [benchmarkData]);

  const chartData = useMemo(() =>
    normalizedRaw.map((p) => {
      const d = String(p.time ?? "").slice(0, 10);
      const v = Math.round(Number(p.value ?? 0) * 100) / 100;
      const key7 = d.slice(0, 7);
      const bench = benchMap.has(key7) ? benchMap.get(key7)! : null;
      return {
        time: p.time,
        pctTest: d < REF_WF_OOS_START ? v : null,
        pctMid:  d >= REF_WF_OOS_START && d < REF_LIVE_START ? v : null,
        pctLive: d >= REF_LIVE_START ? v : null,
        bench,
      };
    }), [normalizedRaw, benchMap]);

  // X-ticks adapted to range size
  const xTicks = useMemo(() => {
    if (!normalizedRaw.length) return [];
    const first = normalizedRaw[0];
    const last  = normalizedRaw[normalizedRaw.length - 1];
    const t0 = new Date(String(first.time)).getTime();
    const t1 = new Date(String(last.time)).getTime();
    const years = (t1 - t0) / (365.25 * 86400000);

    const result: string[] = [];
    const seen = new Set<string>();

    if (years > 6) {
      // every 3 years
      for (const p of normalizedRaw) {
        const yr = parseInt(String(p.time).slice(0, 4), 10);
        if (yr % 3 === 0 && !seen.has(String(yr))) { seen.add(String(yr)); result.push(p.time); }
      }
    } else if (years > 2) {
      // every year
      for (const p of normalizedRaw) {
        const yr = String(p.time).slice(0, 4);
        if (!seen.has(yr)) { seen.add(yr); result.push(p.time); }
      }
    } else {
      // every quarter
      for (const p of normalizedRaw) {
        const d = String(p.time).slice(0, 10);
        const yr = d.slice(0, 4);
        const mo = parseInt(d.slice(5, 7), 10);
        const key = `${yr}-${Math.floor((mo - 1) / 3)}`;
        if (!seen.has(key)) { seen.add(key); result.push(p.time); }
      }
    }

    if (!result.includes(last.time)) result.push(last.time);
    return result;
  }, [normalizedRaw]);

  const yDomain = useMemo((): [number, number] => {
    if (!normalizedRaw.length) return [0, 10];
    const vals = normalizedRaw.map(p => Number(p.value));
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const pad = Math.max(Math.abs(max - min) * 0.06, 1);
    return [Math.floor(min - pad), Math.ceil(max + pad)];
  }, [normalizedRaw]);

  // Boundary lines — from original data, only show in "All" mode
  const wfBoundary = useMemo(
    () => data.find(p => String(p.time ?? "").slice(0, 10) >= REF_WF_OOS_START)?.time ?? null,
    [data]);
  const liveBoundary = useMemo(
    () => data.find(p => String(p.time ?? "").slice(0, 10) >= REF_LIVE_START)?.time ?? null,
    [data]);
  const showBoundaries = phase === "All";

  const firstDate = normalizedRaw[0]?.time ?? null;
  const lastDate  = normalizedRaw[normalizedRaw.length - 1]?.time ?? null;
  const hasSize   = size.width > 0 && size.height > 0;

  const wfPx = useMemo(() => {
    if (!firstDate || !lastDate || !hasSize || !showBoundaries) return null;
    const t0 = new Date(firstDate).getTime();
    const t1 = new Date(lastDate).getTime();
    const tw = new Date(REF_WF_OOS_START).getTime();
    return Y_AXIS_W + ((tw - t0) / (t1 - t0)) * (size.width - Y_AXIS_W - MARGIN_R);
  }, [firstDate, lastDate, hasSize, size.width, showBoundaries]);

  const livePx = useMemo(() => {
    if (!firstDate || !lastDate || !hasSize || !showBoundaries) return null;
    const t0 = new Date(firstDate).getTime();
    const t1 = new Date(lastDate).getTime();
    const tl = new Date(REF_LIVE_START).getTime();
    return Y_AXIS_W + ((tl - t0) / (t1 - t0)) * (size.width - Y_AXIS_W - MARGIN_R);
  }, [firstDate, lastDate, hasSize, size.width, showBoundaries]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, overflow: "hidden" }}>
      <style dangerouslySetInnerHTML={{ __html: PILL_CSS }} />

      {/* Header */}
      <div style={{ flexShrink: 0, display: "flex", alignItems: "flex-start",
        justifyContent: "space-between", gap: 8, padding: "10px 16px 6px" }}>
        {/* Left: title + phase buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <span style={{ color: "#f5f7fa", fontSize: 11, fontWeight: 700,
            fontFamily: MONTSERRAT, letterSpacing: "0.04em", whiteSpace: "nowrap" }}>
            Equity Curve
          </span>
          <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
            {PHASE_OPTS.map(p => (
              <button
                key={p}
                onClick={() => onPhaseChange?.(p)}
                className={`rcx-pill ${phase === p ? "rcx-active" : "rcx-inactive"}`}
                style={{ padding: "4px 8px", fontFamily: MONTSERRAT }}
              >
                <span style={{ fontSize: 10, fontWeight: phase === p ? 600 : 400,
                  color: phase === p ? "#F3F3F4" : "#5a5e6a",
                  fontFamily: MONTSERRAT, lineHeight: 1, whiteSpace: "nowrap" }}>
                  {p}
                </span>
              </button>
            ))}
          </div>
        </div>
        {/* Right: KPI cards */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <KpiCard label="Net Return" value={fmtPct(displayReturn)} />
          <KpiCard label="CAGR" value={`${fmtPct(displayCagr)} p.a.`} />
        </div>
      </div>

      {/* Chart */}
      <div ref={chartRef} style={{ flex: "1 1 auto", minHeight: 0, overflow: "hidden", position: "relative" }}>
        {hasSize && (
          <ComposedChart
            syncId="ref-perf-dd"
            width={Math.max(size.width, 1)}
            height={Math.max(size.height, 1)}
            data={chartData}
            margin={{ top: 4, right: 4, bottom: 10, left: 0 }}
          >
            <defs>
              <linearGradient id="refEqTest" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#aab4c2" stopOpacity={0.1} />
                <stop offset="100%" stopColor="#aab4c2" stopOpacity={0.01} />
              </linearGradient>
              <linearGradient id="refEqMid" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f4f6fa" stopOpacity={0.08} />
                <stop offset="100%" stopColor="#f4f6fa" stopOpacity={0.01} />
              </linearGradient>
              <linearGradient id="refEqLive" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#D6B24A" stopOpacity={0.18} />
                <stop offset="100%" stopColor="#D6B24A" stopOpacity={0.01} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="time"
              ticks={xTicks}
              interval={0}
              tickFormatter={fmtDate}
              tick={{ fill: "#7f8a9d", fontSize: 11, fontFamily: "var(--font-numbers,'Nunito',sans-serif)" }}
              axisLine={{ stroke: "rgba(255,255,255,0.16)" }}
              tickLine={false}
            />
            <YAxis
              domain={yDomain}
              tickFormatter={(v) => `${Number(v).toFixed(0)}%`}
              tick={{ fill: "#7f8a9d", fontSize: 11, fontFamily: "var(--font-numbers,'Nunito',sans-serif)" }}
              axisLine={{ stroke: "rgba(255,255,255,0.14)" }}
              tickLine={false}
              width={42}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const entry = payload.find((p) => p.value !== null && p.value !== undefined);
                if (!entry) return null;
                return (
                  <div style={{ background: "#0B0E12", border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 6, padding: "5px 8px", color: "#F5F7FA", fontSize: 10, ...MONITO }}>
                    <div style={{ color: "#7c8798", marginBottom: 2 }}>{String(label ?? "").slice(0, 10)}</div>
                    <div>{fmtPct(entry.value)}</div>
                  </div>
                );
              }}
            />
            {/* Phase boundary lines — only in All mode */}
            {showBoundaries && wfBoundary && (
              <ReferenceLine x={wfBoundary} stroke="rgba(255,255,255,0.65)"
                strokeDasharray="4 5" strokeWidth={1} ifOverflow="extendDomain" />
            )}
            {showBoundaries && liveBoundary && (
              <ReferenceLine x={liveBoundary} stroke="rgba(214,178,74,0.9)"
                strokeDasharray="4 5" strokeWidth={1} ifOverflow="extendDomain" />
            )}
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.3)" strokeDasharray="5 4" strokeWidth={1} />
            <Area type="monotone" dataKey="pctTest" fill="url(#refEqTest)" stroke="none" dot={false} connectNulls isAnimationActive={false} />
            <Area type="monotone" dataKey="pctMid"  fill="url(#refEqMid)"  stroke="none" dot={false} connectNulls isAnimationActive={false} />
            <Area type="monotone" dataKey="pctLive" fill="url(#refEqLive)" stroke="none" dot={false} connectNulls isAnimationActive={false} />
            <Line type="monotone" dataKey="pctTest" stroke="rgba(183,192,204,0.65)" strokeWidth={1.3} dot={false} connectNulls isAnimationActive={false} />
            <Line type="monotone" dataKey="pctMid"  stroke="#F5F7FA" strokeWidth={1.5} dot={false} activeDot={{ r: 3, fill: "#F5F7FA", stroke: "none" }} connectNulls isAnimationActive={false} />
            <Line type="monotone" dataKey="pctLive" stroke="#D6B24A" strokeWidth={1.8} dot={false} activeDot={{ r: 3, fill: "#D6B24A", stroke: "none" }} connectNulls isAnimationActive={false} />
            {benchmarkData && benchmarkData.length > 0 && (
              <Line type="monotone" dataKey="bench" stroke="#dc2626" strokeWidth={1.5} dot={false} connectNulls isAnimationActive={false} />
            )}
          </ComposedChart>
        )}
        {wfPx != null && <PhasePill left={wfPx} date="01.2008" label="WF+OOS" color="#EDF2FF" />}
        {livePx != null && <PhasePill left={livePx} date="01.2025" label="Live" color="#D6B24A" />}
      </div>
    </div>
  );
}
