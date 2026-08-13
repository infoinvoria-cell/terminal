"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const MONTSERRAT = "var(--font-montserrat, 'Montserrat', sans-serif)";
const NUNITO     = "var(--font-numbers, 'Nunito', sans-serif)";

const KPI_BG   = "linear-gradient(to bottom, #26262d, #111114)";
const PILL_CSS = `
  .rbc-pill { border-radius: 999px; cursor: pointer; transition: background 160ms ease, border-color 160ms ease;
    outline: none; display: flex; align-items: center; border: 1.5px solid transparent; }
  .rbc-pill:focus-visible { outline: 2px solid rgba(180,200,220,0.45); outline-offset: 2px; }
  .rbc-active   { background: ${KPI_BG}; border-color: rgba(255,255,255,0.28); }
  .rbc-active:hover   { border-color: rgba(255,255,255,0.42); }
  .rbc-inactive { background: transparent; border-color: transparent; }
  .rbc-inactive:hover { background: ${KPI_BG}; border-color: rgba(255,255,255,0.18); }
`;

// ── Gradient tiers ────────────────────────────────────────────────────────────
const GRAD_DEFS = [
  { id:"pb-hi", x1:"0",y1:"1",x2:"0",y2:"0", stops:[{o:"0%",c:"#606470"},{o:"50%",c:"#e6e8ec"},{o:"100%",c:"#f8f9fb"}] },
  { id:"pb-md", x1:"0",y1:"1",x2:"0",y2:"0", stops:[{o:"0%",c:"#565a62"},{o:"65%",c:"#d0d3d9"},{o:"100%",c:"#e8e9ec"}] },
  { id:"pb-lo", x1:"0",y1:"1",x2:"0",y2:"0", stops:[{o:"0%",c:"#44484f"},{o:"100%",c:"#a2a6ae"}] },
  { id:"pb-xs", x1:"0",y1:"1",x2:"0",y2:"0", stops:[{o:"0%",c:"#38393e"},{o:"100%",c:"#66696f"}] },
  { id:"nb-hi", x1:"0",y1:"0",x2:"0",y2:"1", stops:[{o:"0%",c:"#4a4630"},{o:"100%",c:"#D6B24A"}] },
  { id:"nb-md", x1:"0",y1:"0",x2:"0",y2:"1", stops:[{o:"0%",c:"#3e3b28"},{o:"100%",c:"#b08838"}] },
  { id:"nb-lo", x1:"0",y1:"0",x2:"0",y2:"1", stops:[{o:"0%",c:"#333028"},{o:"100%",c:"#7a6230"}] },
  { id:"nb-xs", x1:"0",y1:"0",x2:"0",y2:"1", stops:[{o:"0%",c:"#2a2820"},{o:"100%",c:"#4e4828"}] },
] as const;

function gradFill(val: number, maxPos: number, maxNeg: number): string {
  if (val >= 0) {
    const s = maxPos > 0 ? val / maxPos : 0;
    if (s >= 0.85) return "url(#pb-hi)";
    if (s >= 0.45) return "url(#pb-md)";
    if (s >= 0.15) return "url(#pb-lo)";
    return "url(#pb-xs)";
  }
  const s = maxNeg < 0 ? Math.abs(val) / Math.abs(maxNeg) : 0;
  if (s >= 0.85) return "url(#nb-hi)";
  if (s >= 0.45) return "url(#nb-md)";
  if (s >= 0.15) return "url(#nb-lo)";
  return "url(#nb-xs)";
}

// ── PRNG ──────────────────────────────────────────────────────────────────────
function makePrng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) >>> 0;
    s = Math.imul(s ^ (s >>> 12), 0x297a2d39) >>> 0;
    s ^= s >>> 15;
    return (s >>> 0) / 0xffffffff;
  };
}

// ── 5 years of daily returns with real dates (2020-2024) ─────────────────────
interface DayPoint { date: Date; value: number; }

function buildDailyData(): DayPoint[] {
  const rand = makePrng(0xda11e001);
  const result: DayPoint[] = [];
  for (let year = 2020; year <= 2024; year++) {
    const d = new Date(year, 0, 1);
    while (d.getFullYear() === year) {
      const dow = d.getDay();
      if (dow !== 0 && dow !== 6) {
        result.push({ date: new Date(d), value: +((rand() - 0.46) * 2.4).toFixed(4) });
      }
      d.setDate(d.getDate() + 1);
    }
  }
  return result;
}

const DAILY_DATA = buildDailyData();

// Compound return of a series of daily % returns
function compound(rets: number[]): number {
  if (!rets.length) return 0;
  return +((rets.reduce((acc, r) => acc * (1 + r / 100), 1) - 1) * 100).toFixed(2);
}

// ISO week number
function isoWeek(date: Date): number {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay() || 7;
  d.setDate(d.getDate() + 4 - day);
  const jan1 = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + 1) / 7);
}

type TimeOpt  = "1D" | "1W" | "1M" | "1Y";
type BarEntry = { label: string; value: number };

const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function sumOf(rets: number[]): number {
  return +rets.reduce((s, v) => s + v, 0).toFixed(2);
}

// ── Calendar-aggregated bars ───────────────────────────────────────────────────
// 1Y → 5 bars: compound return per individual year
// 1M → 12 bars: sum of all daily returns for that calendar month across all years
// 1W → 52 bars: sum of all daily returns for that ISO week across all years
// 1D → ~252 bars: sum of daily returns at each position across all years
function buildBars(range: TimeOpt): BarEntry[] {
  if (range === "1Y") {
    return [2020, 2021, 2022, 2023, 2024].map(yr => {
      const rets = DAILY_DATA.filter(d => d.date.getFullYear() === yr).map(d => d.value);
      return { label: String(yr), value: compound(rets) };
    });
  }

  if (range === "1M") {
    return MONTH_LABELS.map((m, mi) => {
      const rets = DAILY_DATA.filter(d => d.date.getMonth() === mi).map(d => d.value);
      return { label: m, value: sumOf(rets) };
    });
  }

  if (range === "1W") {
    return Array.from({ length: 52 }, (_, i) => {
      const w = i + 1;
      const rets = DAILY_DATA.filter(d => isoWeek(d.date) === w).map(d => d.value);
      return { label: `W${w}`, value: sumOf(rets) };
    });
  }

  // 1D: sum of returns at each trading-day-of-year position across all years
  const posMap = new Map<number, number[]>();
  for (let yr = 2020; yr <= 2024; yr++) {
    DAILY_DATA.filter(d => d.date.getFullYear() === yr).forEach(({ value }, pos) => {
      if (!posMap.has(pos)) posMap.set(pos, []);
      posMap.get(pos)!.push(value);
    });
  }
  const ref2020 = DAILY_DATA.filter(d => d.date.getFullYear() === 2020);
  const maxPos = Math.max(...posMap.keys());
  return Array.from({ length: maxPos + 1 }, (_, pos) => {
    const rets = posMap.get(pos) ?? [];
    const refDate = ref2020[pos]?.date;
    const label = refDate
      ? refDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : `D${pos + 1}`;
    return { label, value: sumOf(rets) };
  });
}

// X-tick interval
function tickInterval(len: number): number {
  if (len <= 12) return 0;
  if (len <= 20) return 1;
  if (len <= 52) return Math.max(1, Math.floor(len / 13));
  return Math.max(1, Math.floor(len / 10));
}

// ── Tooltip ───────────────────────────────────────────────────────────────────
function CustomTooltip({
  active, payload, label,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const v = payload[0].value;
  const pos = v >= 0;
  return (
    <div style={{
      background: "#0B0E12",
      border: `1px solid ${pos ? "rgba(240,242,246,0.18)" : "rgba(214,178,74,0.22)"}`,
      borderRadius: 6, padding: "5px 9px", fontFamily: NUNITO, fontSize: 11,
    }}>
      <div style={{ color: "#7c8798", marginBottom: 2 }}>{label}</div>
      <div style={{ color: pos ? "#F0F2F6" : "#D6B24A", fontWeight: 700 }}>
        {pos ? "+" : ""}{v.toFixed(2)}%
      </div>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────
const TIME_OPTS: TimeOpt[] = ["1D", "1W", "1M", "1Y"];

export default function ReferenceBarChart() {
  const [range, setRange] = useState<TimeOpt>("1M");
  const data = useMemo(() => buildBars(range), [range]);

  const maxPos = Math.max(0, ...data.map(d => d.value));
  const maxNeg = Math.min(0, ...data.map(d => d.value));
  const yMin   = Math.min(...data.map(d => d.value));
  const yMax   = Math.max(...data.map(d => d.value));
  const pad    = Math.max(Math.abs(yMax - yMin) * 0.15, 0.2);
  const yDomain: [number, number] = [
    Math.floor((yMin - pad) * 10) / 10,
    Math.ceil((yMax  + pad) * 10) / 10,
  ];

  // 1M always shows all 12 labels; others use interval
  const interval = range === "1M" ? 0 : tickInterval(data.length);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, overflow: "hidden" }}>
      <style dangerouslySetInnerHTML={{ __html: PILL_CSS }} />

      {/* Header */}
      <div style={{
        flexShrink: 0, display: "flex", alignItems: "center",
        justifyContent: "space-between", gap: 6, padding: "10px 16px 6px",
      }}>
        <span style={{ color: "#f5f7fa", fontSize: 11, fontWeight: 700,
          fontFamily: MONTSERRAT, letterSpacing: "0.04em", whiteSpace: "nowrap" }}>
          Bar Chart
        </span>
        <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
          {TIME_OPTS.map(t => (
            <button
              key={t}
              onClick={() => setRange(t)}
              className={`rbc-pill ${range === t ? "rbc-active" : "rbc-inactive"}`}
              style={{ padding: "5px 10px", fontFamily: MONTSERRAT }}
            >
              <span style={{
                fontSize: 11, fontWeight: range === t ? 600 : 400,
                color: range === t ? "#F3F3F4" : "#5a5e6a",
                fontFamily: MONTSERRAT, lineHeight: 1,
              }}>
                {t}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div style={{ flex: "1 1 auto", minHeight: 0, overflow: "hidden", padding: "0 4px 8px" }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 6, bottom: 2, left: 0 }} barCategoryGap="40%">
            <defs>
              {GRAD_DEFS.map(g => (
                <linearGradient key={g.id} id={g.id} x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2}>
                  {g.stops.map(s => <stop key={s.o} offset={s.o} stopColor={s.c} />)}
                </linearGradient>
              ))}
            </defs>
            <XAxis
              dataKey="label"
              interval={interval}
              tick={{ fill: "#7f8a9d", fontSize: 10, fontFamily: NUNITO }}
              axisLine={{ stroke: "rgba(255,255,255,0.16)" }}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v) => `${Number(v) >= 0 ? "+" : ""}${Number(v).toFixed(1)}%`}
              tick={{ fill: "#7f8a9d", fontSize: 10, fontFamily: NUNITO }}
              axisLine={{ stroke: "rgba(255,255,255,0.14)" }}
              tickLine={false}
              width={46}
              domain={yDomain}
            />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.22)" strokeWidth={1} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
            <Bar dataKey="value" radius={[2, 2, 0, 0]} isAnimationActive={false} maxBarSize={22}>
              {data.map((entry, i) => (
                <Cell key={i} fill={gradFill(entry.value, maxPos, maxNeg)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
