"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getMonitoringAssetIconUrl } from "@/lib/monitoring/monitoringAssetIcons";
import type {
  TenPatternResult,
  TenPatternResultsFile,
  YearReturn,
} from "@/lib/seasonality/tenPatternResults";

/* ─── Design tokens ─────────────────────────────────────────────────── */
const C_WHITE  = "#ffffff";
const C_TEXT2  = "rgba(255,255,255,0.55)";
const C_TEXT3  = "rgba(255,255,255,0.28)";
const C_GOLD   = "#d8bc67";
const C_CARD   = "#111318";
const C_BORDER = "rgba(255,255,255,0.08)";
const C_HOVER  = "rgba(255,255,255,0.04)";
const C_NEG    = "rgba(172,96,104,0.90)";
const FONT     = "Montserrat, Segoe UI, sans-serif";

/* ─── Pattern identity + metadata ONLY — all KPI values come from results.json ── */
export interface SleevePattern {
  id: number;
  /** Key in results.json → TenPatternResultsFile.patterns */
  patternId: string;
  assetId: string;
  iconAssetId?: string;
  symbol: string;
  name: string;
  direction: "LONG" | "SHORT";
  window: string;
  startSlot: number;
  endSlot: number;
  calStart: number;
  tier: "bonferroni" | "fdr";
  category: string;
  rationale: string;
}

export const SLEEVE_PATTERNS: SleevePattern[] = [
  { id: 1,  patternId: "rb1_long_slot29_v1",   assetId: "rb1",     symbol: "RB1!",  name: "RBOB Gasoline",  direction: "LONG",  window: "Feb 8 – 16",  startSlot: 29,  endSlot: 35,  calStart: 39,  tier: "bonferroni", category: "Energie", rationale: "Pre-summer driving season baut RFG-Nachfrage auf." },
  { id: 2,  patternId: "zw1_long_slot152_v1",  assetId: "wheat",   symbol: "ZW1!",  name: "Chicago Wheat",  direction: "LONG",  window: "Aug 10 – 20", startSlot: 152, endSlot: 159, calStart: 222, tier: "bonferroni", category: "Agrar",   rationale: "Northern-hemisphere Erntedruck lässt nach." },
  { id: 3,  patternId: "gc1_long_slot128_v1",  assetId: "gc1",     symbol: "GC1!",  name: "Gold",           direction: "LONG",  window: "Jul 25 – 31", startSlot: 128, endSlot: 133, calStart: 206, tier: "fdr",        category: "Metalle", rationale: "Pre-India wedding season demand ramp." },
  { id: 4,  patternId: "ng1_short_slot170_v1", assetId: "ng1",     symbol: "NG1!",  name: "Natural Gas",    direction: "SHORT", window: "Sep 16 – 30", startSlot: 170, endSlot: 181, calStart: 259, tier: "fdr",        category: "Energie", rationale: "Post-Injection-Season Überangebot drückt Nov-Kontrakt." },
  { id: 5,  patternId: "sb1_short_slot172_v1", assetId: "sugar",   symbol: "SB1!",  name: "Sugar #11",      direction: "SHORT", window: "Sep 18 – 30", startSlot: 172, endSlot: 182, calStart: 261, tier: "fdr",        category: "Agrar",   rationale: "Brasilianische Ernte drückt Exportpreise in Q4." },
  { id: 6,  patternId: "cc1_long_slot210_v1",  assetId: "cocoa",   symbol: "CC1!",  name: "Cocoa",          direction: "LONG",  window: "Nov 5 – 15",  startSlot: 210, endSlot: 217, calStart: 309, tier: "fdr",        category: "Agrar",   rationale: "West African main crop arrival delays." },
  { id: 7,  patternId: "pa1_short_slot10_v1",  assetId: "pa1",     symbol: "PA1!",  name: "Palladium",      direction: "SHORT", window: "Jan 10 – 20", startSlot: 10,  endSlot: 17,  calStart: 10,  tier: "fdr",        category: "Metalle", rationale: "Jan-Liquidation nach Jahres-Rally drückt Palladium." },
  { id: 8,  patternId: "zm1_long_slot73_v1",   assetId: "soymeal", iconAssetId: "zs1", symbol: "ZM1!",  name: "Soybean Meal", direction: "LONG",  window: "Apr 15 – 25", startSlot: 73,  endSlot: 80,  calStart: 105, tier: "fdr",        category: "Agrar",   rationale: "US spring crush margin rally." },
  { id: 9,  patternId: "ct1_long_slot29_v1",   assetId: "cotton",  symbol: "CT1!",  name: "Cotton #2",      direction: "LONG",  window: "Feb 8 – 16",  startSlot: 29,  endSlot: 35,  calStart: 39,  tier: "fdr",        category: "Agrar",   rationale: "Export sales pace beschleunigt nach USDA Feb Report." },
  { id: 10, patternId: "es1_long_slot240_v1",  assetId: "es1",     symbol: "ES1!",  name: "S&P 500 E-mini", direction: "LONG",  window: "Dez 15 – 25", startSlot: 240, endSlot: 248, calStart: 349, tier: "fdr",        category: "Indizes", rationale: "Santa Claus Rally: Pension fund rebalancing." },
];

/* ─── Fetch hook — loads results.json once, no cache ───────────────── */
function useAllPatternResults(): Record<string, TenPatternResult> {
  const [results, setResults] = useState<Record<string, TenPatternResult>>({});
  useEffect(() => {
    fetch("/generated/seasonality/ten_patterns/results.json", { cache: "no-store" })
      .then(r => r.json())
      .then((data: TenPatternResultsFile) => setResults(data.patterns ?? {}))
      .catch(() => {});
  }, []);
  return results;
}

/* ─── Derive display values from a TenPatternResult ────────────────── */
interface PatternDisplay {
  isNoData:   boolean;
  isNegOos:   boolean;
  wrPct:      number | null;  // the value shown in WR donut
  wrSource:   "OOS" | "IS" | null;
  oosWr:      number | null;
  isWr:       number | null;
  oosAvg:     number | null;
  isAvg:      number | null;
  sortino:    number | null;
  robustness: number | null;
  nObs:       number | null;
  maxDd:      number | null;
  profitFactor: number | null;
  decadeConsistent: boolean | null;
  nFolds:     number | null;
  statusText: string;
}

function patternDisplay(result: TenPatternResult | undefined): PatternDisplay {
  if (!result) return {
    isNoData: false, isNegOos: false,
    wrPct: null, wrSource: null, oosWr: null, isWr: null,
    oosAvg: null, isAvg: null, sortino: null, robustness: null,
    nObs: null, maxDd: null, profitFactor: null, decadeConsistent: null,
    nFolds: null, statusText: "Laden…",
  };

  const isNoData = result.status === "no_data_source"
    || result.statusDetail?.dataStatus === "no_data_source";

  const oosWr  = result.wf?.oosWinRatePct ?? null;
  const isWr   = result.historical?.isWinRatePct ?? result.historical?.winRatePct ?? null;
  const wrPct  = oosWr ?? isWr;
  const wrSource: "OOS" | "IS" | null = oosWr != null ? "OOS" : isWr != null ? "IS" : null;

  const oosAvg = result.wf?.oosAvgReturnPct ?? null;
  const isAvg  = result.historical?.isAvgReturnMeanPct
    ?? result.historical?.avgReturnMeanPct
    ?? result.historical?.avgReturnPct
    ?? null;

  const isNegOos = result.statusDetail?.profitabilityStatus === "negative_oos_expectancy";

  const statusText = result.status === "wf_completed"       ? "Walk Forward geprüft"
    : result.status === "historical_computed" ? "Historisch berechnet"
    : result.status === "no_data_source"      ? "Keine Datenquelle"
    : result.status === "data_error"          ? "Datenfehler"
    : "Nicht berechnet";

  return {
    isNoData, isNegOos,
    wrPct, wrSource, oosWr, isWr,
    oosAvg, isAvg,
    sortino:     result.historical?.sortinoRatio ?? null,
    robustness:  result.wf?.robustnessPct ?? null,
    nObs:        result.historical?.nObs ?? null,
    maxDd:       result.historical?.maxDrawdownPct ?? null,
    profitFactor: result.historical?.profitFactor ?? null,
    decadeConsistent: result.historical?.decadeConsistent ?? null,
    nFolds:      result.wf?.nFolds ?? null,
    statusText,
  };
}

/* ─── Portfolio computation from real yearReturns ───────────────────── */
interface PortfolioStats {
  yearlyRets: { year: number; ret: number; n: number }[];
  equity:     number[];
  totalReturn: number;
  maxDrawdown: number;
  sortino:    number | null;
  avgIsWr:    number | null;
  avgOosWr:   number | null;
  nPatterns:  number;
  nObs:       number;
  startYear:  number;
  endYear:    number;
}

function computePortfolio(results: Record<string, TenPatternResult>): PortfolioStats | null {
  const eligible = Object.values(results).filter(p =>
    p.historical?.yearReturns && p.historical.yearReturns.length >= 3 &&
    p.status !== "no_data_source" &&
    p.statusDetail?.dataStatus !== "no_data_source"
  );
  if (eligible.length === 0) return null;

  const yearMap = new Map<number, number[]>();
  for (const p of eligible) {
    for (const yr of (p.historical!.yearReturns as YearReturn[])) {
      if (!yearMap.has(yr.year)) yearMap.set(yr.year, []);
      yearMap.get(yr.year)!.push(yr.returnPct);
    }
  }

  const years = Array.from(yearMap.keys()).sort((a, b) => a - b);
  if (years.length === 0) return null;

  const yearlyRets = years.map(year => {
    const rets = yearMap.get(year)!;
    return { year, ret: rets.reduce((s, v) => s + v, 0) / rets.length, n: rets.length };
  });

  const equity: number[] = [100];
  for (const { ret } of yearlyRets) {
    equity.push(equity[equity.length - 1] * (1 + ret / 100));
  }

  const rets = yearlyRets.map(y => y.ret);
  const n = rets.length;
  const mean = rets.reduce((s, v) => s + v, 0) / n;
  const totalReturn = (equity[equity.length - 1] / 100 - 1) * 100;

  let peak = 100; let maxDd = 0;
  for (const v of equity) {
    if (v > peak) peak = v;
    const dd = (v / peak - 1) * 100;
    if (dd < maxDd) maxDd = dd;
  }

  const negRets = rets.filter(r => r < 0);
  const sortino = negRets.length > 0
    ? mean / Math.sqrt(negRets.reduce((s, v) => s + v * v, 0) / negRets.length)
    : null;

  const avgIsWr  = eligible.filter(p => p.historical?.isWinRatePct != null || p.historical?.winRatePct != null)
    .reduce((s, p) => s + (p.historical!.isWinRatePct ?? p.historical!.winRatePct ?? 0), 0) / eligible.length;
  const wfEl = eligible.filter(p => p.wf?.oosWinRatePct != null);
  const avgOosWr = wfEl.length > 0
    ? wfEl.reduce((s, p) => s + p.wf!.oosWinRatePct, 0) / wfEl.length
    : null;

  return {
    yearlyRets, equity, totalReturn, maxDrawdown: maxDd, sortino,
    avgIsWr, avgOosWr,
    nPatterns: eligible.length,
    nObs: n,
    startYear: years[0],
    endYear: years[years.length - 1],
  };
}

/* ─── Countdown hook ────────────────────────────────────────────────── */
function todayCalendarDay(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  return Math.floor((now.getTime() - start.getTime()) / 86_400_000) + 1;
}

function usePatternCountdown(calStart: number): string {
  const [display, setDisplay] = useState("");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    const tick = () => {
      const today = todayCalendarDay();
      let daysAway = calStart - today;
      if (daysAway < -14) daysAway += 365;
      if (daysAway < 0) { setDisplay("Aktiv"); return; }
      if (daysAway === 0) { setDisplay("Heute"); return; }
      const now = new Date();
      const h = Math.max(0, 18 - now.getHours());
      const m = now.getMinutes();
      setDisplay(`${daysAway} Tage : ${h} Std : ${m} min`);
    };
    tick();
    timer.current = setInterval(tick, 60_000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [calStart]);
  return display;
}

/* ─── Asset icon ─────────────────────────────────────────────────────── */
function AssetIcon({ assetId, iconAssetId, symbol, name, size = 48 }: {
  assetId: string; iconAssetId?: string; symbol: string; name: string; size?: number;
}) {
  const url = getMonitoringAssetIconUrl({
    code: symbol, assetId: iconAssetId ?? assetId, name,
    displaySymbol: symbol.replace("1!", ""),
  });
  if (!url) {
    const letter = symbol.replace("1!", "").charAt(0);
    return (
      <div style={{ width: size, height: size, borderRadius: 12, flexShrink: 0,
        background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)",
        display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: size * 0.40, fontWeight: 800, color: "rgba(255,255,255,0.60)" }}>{letter}</span>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={symbol} width={size} height={size} style={{
      objectFit: "contain", borderRadius: 12, flexShrink: 0,
      border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)",
    }} />
  );
}

/* ─── WR donut ───────────────────────────────────────────────────────── */
function WrDonut({ pct, size = 64 }: { pct: number; size?: number }) {
  const thick = size * 0.095;
  const r = (size - thick) / 2;
  const circ = 2 * Math.PI * r;
  const ratio = Math.min(1, Math.max(0, pct / 100));
  const cx = size / 2; const cy = size / 2;
  return (
    <svg width={size} height={size} style={{ display: "block", flexShrink: 0 }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth={thick} />
      {ratio >= 0.999
        ? <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(232,237,243,0.90)" strokeWidth={thick} />
        : <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(232,237,243,0.90)" strokeWidth={thick}
            strokeDasharray={`${ratio * circ} ${(1 - ratio) * circ}`}
            strokeDashoffset={circ * 0.25} strokeLinecap="round" />
      }
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
        fill="#ffffff" fontSize={size * 0.225} fontWeight="800" fontFamily={FONT}>
        {pct.toFixed(0)}%
      </text>
    </svg>
  );
}

function WrDonutEmpty({ size = 64 }: { size?: number }) {
  const thick = size * 0.095;
  const r = (size - thick) / 2;
  const cx = size / 2; const cy = size / 2;
  return (
    <svg width={size} height={size} style={{ display: "block", flexShrink: 0 }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth={thick} />
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
        fill="rgba(255,255,255,0.28)" fontSize={size * 0.25} fontWeight="700" fontFamily={FONT}>—</text>
    </svg>
  );
}

/* ─── Card equity line from real IS year returns ─────────────────────── */
function CardEquityLine({ yearReturns, id, oosAvgReturn }: {
  yearReturns: YearReturn[];
  id: string;
  oosAvgReturn: number | null;
}) {
  const eq: number[] = [0];
  for (const yr of yearReturns) eq.push(eq[eq.length - 1] + yr.returnPct);

  if (eq.length < 2) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 60, fontSize: 9, color: C_TEXT3 }}>
        Keine Return-Serie
      </div>
    );
  }

  const W = 300; const H = 60;
  const padTop = 18; const padBot = 4;
  const min = Math.min(...eq); const max = Math.max(...eq);
  const rng = max - min || 0.1;
  const pts = eq.map((v, i) => {
    const x = (i / (eq.length - 1)) * W;
    const y = padTop + (1 - (v - min) / rng) * (H - padTop - padBot);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  const refVal = oosAvgReturn ?? (eq[eq.length - 1] / yearReturns.length);
  const lineC  = refVal >= 0 ? "#e8edf3" : C_GOLD;
  const fillId = `cf-${id}`;
  const lastVal = eq[eq.length - 1];
  const lastY = padTop + (1 - (lastVal - min) / rng) * (H - padTop - padBot);
  const base = padTop + (1 - (0 - min) / rng) * (H - padTop - padBot);
  const clampedBase = Math.min(H - padBot, Math.max(padTop, base));

  const avgLabel = oosAvgReturn != null
    ? `OOS ${oosAvgReturn >= 0 ? "+" : ""}${oosAvgReturn.toFixed(1)}% avg`
    : `IS ${refVal >= 0 ? "+" : ""}${refVal.toFixed(1)}%`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: "block" }}>
      <defs>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={lineC} stopOpacity="0.18" />
          <stop offset="100%" stopColor={lineC} stopOpacity="0.00" />
        </linearGradient>
      </defs>
      <text x={W - 2} y={12} textAnchor="end" fill={lineC} fontSize={11} fontWeight="700" fontFamily={FONT}>{avgLabel}</text>
      <line x1={0} y1={clampedBase} x2={W} y2={clampedBase}
        stroke="rgba(255,255,255,0.07)" strokeWidth={0.5} strokeDasharray="3 5" />
      <polygon points={`0,${clampedBase} ${pts} ${W},${clampedBase}`} fill={`url(#${fillId})`} />
      <polyline points={pts} fill="none" stroke={lineC} strokeWidth={2} strokeLinejoin="round" />
      <circle cx={W} cy={lastY} r={3} fill={lineC} />
    </svg>
  );
}

function CardNoData({ message }: { message: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 60, fontSize: 9, color: C_TEXT3, fontFamily: FONT, textAlign: "center" }}>
      {message}
    </div>
  );
}

/* ─── Year-return bars (IS trade breakdown) ─────────────────────────── */
function ReturnBars({ yearReturns, width = 80, height = 36 }: {
  yearReturns: YearReturn[]; width?: number; height?: number;
}) {
  const rets = yearReturns.map(y => y.returnPct);
  const max = Math.max(...rets.map(Math.abs), 0.001);
  const bw  = Math.max(1, width / rets.length - 1);
  const mid = height / 2;
  return (
    <svg width={width} height={height} style={{ display: "block", overflow: "visible" }}>
      <line x1={0} y1={mid} x2={width} y2={mid} stroke="rgba(255,255,255,0.10)" strokeWidth={0.5} />
      {rets.map((v, i) => {
        const h = Math.max(2, (Math.abs(v) / max) * (mid - 1));
        const pos = v >= 0;
        return (
          <rect key={i}
            x={i * (bw + 1)} y={pos ? mid - h : mid}
            width={bw} height={h}
            fill={pos ? "rgba(232,234,239,0.82)" : "rgba(214,184,103,0.72)"}
            rx={0.5}
          />
        );
      })}
    </svg>
  );
}

/* ─── Portfolio equity chart (real computed) ────────────────────────── */
function EquityLine({ equity, width, height, startYear, endYear }: {
  equity: number[]; width: number; height: number; startYear: number; endYear: number;
}) {
  const min = Math.min(...equity);
  const max = Math.max(...equity);
  const rng = max - min || 0.001;
  const pad = 20;
  const pts = equity.map((v, i) => {
    const x = (i / (equity.length - 1)) * width;
    const y = height - pad - ((v - min) / rng) * (height - pad - 4);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const last  = equity[equity.length - 1];
  const pct   = ((last / equity[0]) - 1) * 100;
  const lastX = width;
  const lastY = height - pad - ((last - min) / rng) * (height - pad - 4);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%"
      preserveAspectRatio="none" style={{ display: "block" }}>
      <defs>
        <linearGradient id="eq-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="rgba(244,245,247,0.16)" />
          <stop offset="100%" stopColor="rgba(244,245,247,0.01)" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map(f => (
        <line key={f}
          x1={0} y1={height - pad - f * (height - pad - 4)}
          x2={width} y2={height - pad - f * (height - pad - 4)}
          stroke="rgba(255,255,255,0.045)" strokeWidth={0.5} strokeDasharray="3 5" />
      ))}
      <polygon points={`0,${height - pad} ${pts} ${width},${height - pad}`} fill="url(#eq-g)" />
      <polyline points={pts} fill="none" stroke="#e6e7ea" strokeWidth={1.8} strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r={2.5} fill="#e6e7ea" />
      <text x={6} y={13} fill="rgba(255,255,255,0.28)" fontFamily={FONT} fontSize={9}>
        {`Portfolio Equity · IS · ${startYear}–${endYear}`}
      </text>
      <text x={width - 6} y={13} fill={pct >= 0 ? C_GOLD : C_NEG}
        fontFamily={FONT} fontSize={11} fontWeight="700" textAnchor="end">
        {pct >= 0 ? "+" : ""}{pct.toFixed(1)}%
      </text>
    </svg>
  );
}

function DrawdownLine({ equity, width, height }: { equity: number[]; width: number; height: number }) {
  let pk = equity[0];
  const dd = equity.map(v => { if (v > pk) pk = v; return (v / pk) - 1; });
  const minDd = Math.min(...dd, -0.001);
  const pts = dd.map((v, i) => {
    const x = (i / (dd.length - 1)) * width;
    const y = 4 + (Math.abs(v) / Math.abs(minDd)) * (height - 10);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const maxDd = Math.min(...dd);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%"
      preserveAspectRatio="none" style={{ display: "block" }}>
      <defs>
        <linearGradient id="dd-g" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%"   stopColor="rgba(124,58,67,0.30)" />
          <stop offset="100%" stopColor="rgba(124,58,67,0.04)" />
        </linearGradient>
      </defs>
      <line x1={0} y1={4} x2={width} y2={4}
        stroke="rgba(255,255,255,0.16)" strokeWidth={0.5} strokeDasharray="5 4" />
      <polygon points={`0,4 ${pts} ${width},4`} fill="url(#dd-g)" />
      <polyline points={pts} fill="none" stroke="rgba(172,96,104,0.86)" strokeWidth={1.45} strokeLinejoin="round" />
      <text x={6} y={height - 4} fill="rgba(255,255,255,0.28)" fontFamily={FONT} fontSize={9}>Drawdown</text>
      <text x={width - 6} y={height - 4} fill={C_GOLD}
        fontFamily={FONT} fontSize={10} fontWeight="700" textAnchor="end">
        {(maxDd * 100).toFixed(1)}%
      </text>
    </svg>
  );
}

/* ─── Tier badge ─────────────────────────────────────────────────────── */
function TierBadge({ tier }: { tier: SleevePattern["tier"] }) {
  return (
    <span style={{
      fontSize: 7, fontWeight: 700, padding: "1px 5px", borderRadius: 3,
      background: tier === "bonferroni" ? "rgba(216,188,103,0.14)" : "rgba(255,255,255,0.06)",
      color: tier === "bonferroni" ? C_GOLD : "rgba(255,255,255,0.40)",
      letterSpacing: "0.06em", textTransform: "uppercase" as const,
    }}>
      {tier === "bonferroni" ? "T1" : "T2"}
    </span>
  );
}

/* ─── Portfolio KPI strip ────────────────────────────────────────────── */
function KpiBox({ label, value, sub, valueColor = "#eef2f7" }: { label: string; value: string; sub: string; valueColor?: string }) {
  return (
    <div style={{
      background: "rgba(12,14,18,0.92)", border: "1px solid rgba(232,237,244,0.12)",
      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)", backdropFilter: "blur(8px)",
      borderRadius: 10, padding: "10px 14px",
      display: "flex", flexDirection: "column", justifyContent: "space-between", fontFamily: FONT,
    }}>
      <div style={{ fontSize: 8, fontWeight: 700, color: "#7c8798", textTransform: "uppercase" as const, letterSpacing: "0.10em", marginBottom: 6 }}>{label}</div>
      <div>
        <div style={{ fontSize: 20, fontWeight: 800, color: valueColor, lineHeight: 1, letterSpacing: "-0.3px", fontVariantNumeric: "tabular-nums" }}>{value}</div>
        <div style={{ fontSize: 8, color: "rgba(255,255,255,0.28)", marginTop: 4 }}>{sub}</div>
      </div>
    </div>
  );
}

/* ─── Symbol icon ────────────────────────────────────────────────────── */
function SymbolIcon({ symbol, dir, size = 40 }: { symbol: string; dir: "LONG" | "SHORT"; size?: number }) {
  const letter = symbol.replace("1!", "").charAt(0);
  const isL = dir === "LONG";
  return (
    <div style={{ width: size, height: size, borderRadius: 10, flexShrink: 0,
      background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)",
      display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span style={{ fontSize: size * 0.38, fontWeight: 800, color: isL ? "rgba(232,234,239,0.80)" : C_GOLD }}>
        {letter}
      </span>
    </div>
  );
}

/* ─── Detail icon ────────────────────────────────────────────────────── */
function DetailIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ display: "block" }}>
      <rect x="1" y="2" width="12" height="1.5" rx="0.75" fill="currentColor" />
      <rect x="1" y="6" width="8"  height="1.5" rx="0.75" fill="currentColor" />
      <rect x="1" y="10" width="10" height="1.5" rx="0.75" fill="currentColor" />
    </svg>
  );
}

/* ─── Grid card ─────────────────────────────────────────────────────── */
function SleeveCard({ p, result, selected, onActivate, onDetail }: {
  p: SleevePattern;
  result: TenPatternResult | undefined;
  selected: boolean;
  onActivate: () => void;
  onDetail: () => void;
}) {
  const isLong    = p.direction === "LONG";
  const dirColor  = isLong ? "#e8edf3" : C_GOLD;
  const countdown = usePatternCountdown(p.calStart);
  const [detailHov, setDetailHov] = useState(false);

  const { wrPct, wrSource, oosAvg, isNoData, isNegOos, statusText } = patternDisplay(result);
  const yearReturns = result?.historical?.yearReturns ?? [];

  const cardBg = selected
    ? `radial-gradient(ellipse 120% 90% at 115% 120%, rgba(216,188,103,0.14) 0%, transparent 55%), ${C_CARD}`
    : C_CARD;

  return (
    <div
      role="button" tabIndex={0}
      onClick={onActivate}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onActivate(); }}
      style={{
        background: cardBg,
        border: selected ? "1px solid rgba(216,188,103,0.32)" : `1px solid ${C_BORDER}`,
        borderRadius: 16, padding: "12px 14px 10px",
        display: "flex", flexDirection: "column", gap: 0,
        cursor: "pointer", outline: "none", transition: "border-color 120ms",
        height: "100%", boxSizing: "border-box" as const,
        fontFamily: FONT, overflow: "hidden",
      }}
    >
      {/* ── Row 1: Icon · Symbol + Name · WR donut ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <AssetIcon assetId={p.assetId} iconAssetId={p.iconAssetId} symbol={p.symbol} name={p.name} size={36} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: "#fff", lineHeight: 1, letterSpacing: "0.01em" }}>
            {p.symbol.replace("1!", "!")}
          </div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.38)", lineHeight: 1, marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {p.name}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          {isNoData || wrPct == null
            ? <WrDonutEmpty size={48} />
            : <WrDonut pct={wrPct} size={48} />
          }
          {wrSource && !isNoData && (
            <span style={{ fontSize: 7, fontWeight: 700, color: C_TEXT3, letterSpacing: "0.06em" }}>
              {wrSource} WR
            </span>
          )}
        </div>
      </div>

      {/* ── Row 2: Window ── */}
      <div style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.82)", lineHeight: 1, marginBottom: 7, letterSpacing: "-0.1px" }}>
        {p.window}
      </div>

      {/* ── Row 3: Countdown + status or warning ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        {isNoData ? (
          <span style={{ fontSize: 11, fontWeight: 600, color: C_TEXT3, lineHeight: 1 }}>
            Keine Datenquelle
          </span>
        ) : isNegOos ? (
          <>
            <span style={{ fontSize: 11, fontWeight: 600, color: countdown === "Aktiv" ? "#e8edf3" : C_GOLD, lineHeight: 1 }}>
              {countdown || "—"}
            </span>
            <span style={{ fontSize: 10, fontWeight: 800, color: C_NEG, lineHeight: 1 }}>
              ↓ Neg. OOS-Erwartung
            </span>
          </>
        ) : (
          <span style={{ fontSize: 11, fontWeight: 600, color: countdown === "Aktiv" ? "#e8edf3" : C_GOLD, lineHeight: 1 }}>
            {countdown || "—"}
          </span>
        )}
      </div>

      {/* ── Row 4: Equity line from real IS year returns ── */}
      <div style={{ flex: 1, minHeight: 50, overflow: "hidden" }}>
        {isNoData ? (
          <CardNoData message="Keine Datenquelle" />
        ) : yearReturns.length >= 2 ? (
          <CardEquityLine yearReturns={yearReturns} id={`p${p.id}`} oosAvgReturn={oosAvg} />
        ) : (
          <CardNoData message="Keine Return-Serie verfügbar" />
        )}
      </div>

      {/* ── Row 5: Direction + Detail ── */}
      <div style={{ marginTop: 8, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5,
          fontSize: 13, fontWeight: 900, letterSpacing: "0.06em", color: dirColor, lineHeight: 1 }}>
          <span style={{ fontSize: 10 }}>{isLong ? "▲" : "▼"}</span>
          {p.direction}
        </span>
        <button type="button"
          onClick={(e) => { e.stopPropagation(); onDetail(); }}
          onMouseEnter={() => setDetailHov(true)}
          onMouseLeave={() => setDetailHov(false)}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 24, height: 24, borderRadius: 6, border: "none",
            background: detailHov ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.05)",
            color: detailHov ? "#e8edf3" : "rgba(255,255,255,0.40)",
            cursor: "pointer", flexShrink: 0, transition: "background 120ms, color 120ms",
          }}>
          <DetailIcon />
        </button>
      </div>
    </div>
  );
}

/* ─── Left list row (detail view) ───────────────────────────────────── */
function PatternListRow({ p, result, selected, onSelect }: {
  p: SleevePattern; result: TenPatternResult | undefined; selected: boolean; onSelect: () => void;
}) {
  const [hov, setHov] = useState(false);
  const dirColor = p.direction === "LONG" ? "rgba(232,234,239,0.70)" : C_GOLD;
  const { wrPct, wrSource, sortino, isNoData } = patternDisplay(result);

  return (
    <button type="button" onClick={onSelect}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        width: "100%", textAlign: "left",
        padding: "7px 10px", border: "none", cursor: "pointer",
        background: selected ? "rgba(216,188,103,0.06)" : hov ? C_HOVER : "transparent",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
        borderLeft: selected ? `2px solid ${C_GOLD}` : "2px solid transparent",
        boxShadow: `inset 3px 0 0 ${selected ? C_GOLD : "transparent"}`,
        transition: "background 0.1s", flexShrink: 0, fontFamily: FONT,
      }}>
      <div style={{ width: 6, height: 6, borderRadius: "50%", background: dirColor, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: C_WHITE, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", letterSpacing: "0.01em" }}>{p.symbol}</div>
        <div style={{ fontSize: 7.5, color: C_TEXT3, whiteSpace: "nowrap" }}>{p.window}</div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: isNoData ? C_TEXT3 : C_WHITE }}>
          {isNoData ? "—" : wrPct != null ? `${wrPct.toFixed(0)}%` : "—"}
        </div>
        <div style={{ fontSize: 7, color: C_TEXT3 }}>
          {isNoData ? "Kein Daten" : wrSource ? `${wrSource} WR` : "—"}
        </div>
      </div>
      <TierBadge tier={p.tier} />
    </button>
  );
}

/* ─── Detail panel ──────────────────────────────────────────────────── */
function DetailPanel({ p, result, onGoToChart }: {
  p: SleevePattern; result: TenPatternResult | undefined; onGoToChart: () => void;
}) {
  const isLong   = p.direction === "LONG";
  const dirColor = isLong ? "rgba(232,234,239,0.80)" : C_GOLD;
  const {
    isNoData, isNegOos,
    oosWr, isWr, oosAvg, isAvg,
    sortino, robustness, nObs, maxDd, profitFactor, decadeConsistent,
    nFolds, statusText,
  } = patternDisplay(result);

  const yearReturns = result?.historical?.yearReturns ?? [];

  const fmt = (v: number | null, suffix = "", decimals = 0, showSign = false) =>
    v != null ? `${showSign && v >= 0 ? "+" : ""}${v.toFixed(decimals)}${suffix}` : "—";

  const statusColor = result?.statusDetail?.profitabilityStatus === "negative_oos_expectancy"
    ? C_NEG
    : result?.status === "wf_completed" ? "rgba(100,200,140,0.85)"
    : C_TEXT3;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "14px 16px", flex: 1, minHeight: 0, overflow: "hidden", fontFamily: FONT }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <SymbolIcon symbol={p.symbol} dir={p.direction} />
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
              <span style={{ fontSize: 18, fontWeight: 900, color: C_WHITE, letterSpacing: "0.01em" }}>{p.symbol}</span>
              <TierBadge tier={p.tier} />
              <span style={{ fontSize: 8, fontWeight: 700, color: dirColor, background: `${dirColor}18`, padding: "1px 5px", borderRadius: 3 }}>{p.direction}</span>
              <span style={{ fontSize: 8, fontWeight: 700, color: statusColor, background: `${statusColor}16`, padding: "1px 5px", borderRadius: 3, border: `1px solid ${statusColor}30` }}>
                {statusText}
              </span>
            </div>
            <div style={{ fontSize: 10, color: C_TEXT2 }}>{p.name} · {p.window}</div>
            <div style={{ fontSize: 8, color: C_TEXT3, marginTop: 2 }}>{p.category} · {decadeConsistent != null ? (decadeConsistent ? "Decade-konsistent ✓" : "—") : "—"}</div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, flexShrink: 0 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 7, color: C_TEXT3, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>Sortino</div>
            <div style={{ fontSize: 26, fontWeight: 900, color: C_GOLD, letterSpacing: "-0.5px", lineHeight: 1 }}>
              {sortino != null ? sortino.toFixed(2) : "—"}
            </div>
          </div>
          <button type="button" onClick={onGoToChart} style={{
            background: "rgba(216,188,103,0.08)", border: "1px solid rgba(216,188,103,0.25)",
            borderRadius: 6, padding: "5px 12px", color: C_GOLD, fontSize: 9,
            cursor: "pointer", fontWeight: 700, fontFamily: FONT, letterSpacing: "0.03em",
          }}>
            ↗ Chart öffnen
          </button>
        </div>
      </div>

      {/* Negative OOS warning */}
      {isNegOos && (
        <div style={{
          background: "rgba(172,96,104,0.12)", border: "1px solid rgba(172,96,104,0.30)",
          borderRadius: 6, padding: "7px 12px", flexShrink: 0,
          fontSize: 9, fontWeight: 700, color: C_NEG, letterSpacing: "0.02em",
        }}>
          ↓ OOS-Erwartung negativ — dieses Muster ist nicht für Signale oder Portfolios geeignet
        </div>
      )}

      {/* KPI grids */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
        {/* Row 1: WR + Returns */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8,
          background: "rgba(255,255,255,0.025)", borderRadius: 8, padding: "10px 12px", border: `1px solid ${C_BORDER}` }}>
          {[
            { label: "IS Winrate",      value: fmt(isWr,  "%") },
            { label: "OOS Winrate",     value: fmt(oosWr, "%") },
            { label: "IS Avg Return",   value: fmt(isAvg,  "%", 2, true) },
            { label: "OOS Avg Return",  value: fmt(oosAvg, "%", 2, true) },
          ].map(s => (
            <div key={s.label}>
              <div style={{ fontSize: 7, color: C_TEXT3, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 3 }}>{s.label}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: C_WHITE, fontFamily: FONT }}>{s.value}</div>
            </div>
          ))}
        </div>
        {/* Row 2: IS stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8,
          background: "rgba(255,255,255,0.025)", borderRadius: 8, padding: "10px 12px", border: `1px solid ${C_BORDER}` }}>
          {[
            { label: "IS Beobacht.",  value: fmt(nObs) },
            { label: "Robustheit",   value: fmt(robustness, "%") },
            { label: "IS Profit Fkt",value: fmt(profitFactor, "", 1) },
            { label: "IS Max DD",    value: fmt(maxDd, "%") },
          ].map(s => (
            <div key={s.label}>
              <div style={{ fontSize: 7, color: C_TEXT3, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 3 }}>{s.label}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: C_TEXT2, fontFamily: FONT }}>{s.value}</div>
            </div>
          ))}
        </div>
        {/* Row 3: WF + Production */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8,
          background: "rgba(255,255,255,0.025)", borderRadius: 8, padding: "10px 12px", border: `1px solid ${C_BORDER}` }}>
          {[
            { label: "Dekaden",       value: decadeConsistent != null ? (decadeConsistent ? "✓ stabil" : "—") : "—" },
            { label: "OOS Status",    value: result?.statusDetail?.profitabilityStatus === "positive_oos_expectancy" ? "Pos."
              : result?.statusDetail?.profitabilityStatus === "negative_oos_expectancy" ? "Neg."
              : result?.statusDetail?.profitabilityStatus === "near_zero_expectancy" ? "Neutral"
              : "—" },
            { label: "Produktion",    value: "Nicht freigeg." },
            { label: "Sortino (IS)",  value: fmt(sortino, "", 2) },
          ].map(s => (
            <div key={s.label}>
              <div style={{ fontSize: 7, color: C_TEXT3, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 3 }}>{s.label}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: C_TEXT2, fontFamily: FONT }}>{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Charts row */}
      <div style={{ display: "flex", gap: 8, flex: 1, minHeight: 0 }}>
        <div style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${C_BORDER}`, borderRadius: 8, padding: "10px 12px", flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 7.5, color: C_TEXT3, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 8 }}>
            {isNoData ? "Keine Datenquelle" : `Jährl. Trade-Ergebnisse · ${yearReturns.length} Trades`}
          </div>
          <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center" }}>
            {yearReturns.length > 0
              ? <ReturnBars yearReturns={yearReturns} width={280} height={54} />
              : <span style={{ fontSize: 9, color: C_TEXT3 }}>Keine Return-Daten</span>
            }
          </div>
        </div>
        <div style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${C_BORDER}`, borderRadius: 8, padding: "10px 12px", flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 7.5, color: C_TEXT3, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 8 }}>
            Wirtschaftliche Begründung
          </div>
          <div style={{ fontSize: 10, color: C_TEXT2, lineHeight: 1.65, flex: 1, overflow: "hidden" }}>{p.rationale}</div>
        </div>
      </div>
    </div>
  );
}

/* ─── Portfolio view — real computation ─────────────────────────────── */
function PortfolioView({ results }: { results: Record<string, TenPatternResult> }) {
  const stats = useMemo(() => computePortfolio(results), [results]);

  if (!stats) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, fontSize: 11, color: C_TEXT3, fontFamily: FONT }}>
        Portfolio-Zeitreihe noch nicht berechnet — results.json lädt…
      </div>
    );
  }

  const { equity, totalReturn, maxDrawdown, sortino, avgIsWr, avgOosWr, nPatterns, nObs, startYear, endYear } = stats;

  const patterns9 = SLEEVE_PATTERNS.filter(p => {
    const r = results[p.patternId];
    return r && r.status !== "no_data_source";
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1, minHeight: 0, overflow: "hidden" }}>
      {/* KPI strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, flexShrink: 0 }}>
        <KpiBox label="Muster"         value={`${nPatterns}`}  sub="Berechnet (ZM exkl.)" />
        <KpiBox label="Ø IS Win Rate"  value={avgIsWr != null ? `${avgIsWr.toFixed(1)}%` : "—"}  sub="In-Sample" />
        <KpiBox label="Ø OOS Win Rate" value={avgOosWr != null ? `${avgOosWr.toFixed(1)}%` : "—"} sub="Out-of-Sample" />
        <KpiBox label="Ø Sortino"      value={sortino != null ? sortino.toFixed(2) : "—"}         sub="IS-Durchschnitt" />
        <KpiBox label="Gesamt n"       value={`${nObs}`}       sub={`${startYear}–${endYear}`} />
        <KpiBox label="Portfolio Ret." value={`${totalReturn >= 0 ? "+" : ""}${totalReturn.toFixed(1)}%`}
          sub={`IS · ${startYear}–${endYear}`}
          valueColor={totalReturn >= 0 ? "#eef2f7" : C_GOLD} />
        <KpiBox label="Max Drawdown"   value={`${maxDrawdown.toFixed(1)}%`} sub="Portfolio" valueColor={C_GOLD} />
      </div>

      {/* Charts + list */}
      <div style={{ display: "flex", gap: 8, flex: 1, minHeight: 0 }}>
        <div style={{ flex: 2, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ background: C_CARD, border: `1px solid ${C_BORDER}`, borderRadius: 10, padding: "10px 12px", flex: 3, minHeight: 0, display: "flex", flexDirection: "column" }}>
            <div style={{ flex: 1, minHeight: 0 }}>
              <EquityLine equity={equity} width={600} height={100} startYear={startYear} endYear={endYear} />
            </div>
          </div>
          <div style={{ background: C_CARD, border: `1px solid ${C_BORDER}`, borderRadius: 10, padding: "8px 12px", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            <div style={{ flex: 1, minHeight: 0 }}>
              <DrawdownLine equity={equity} width={600} height={44} />
            </div>
          </div>
        </div>

        {/* Pattern list */}
        <div style={{ flex: 1, minWidth: 0, background: C_CARD, border: `1px solid ${C_BORDER}`, borderRadius: 10, padding: "10px 12px", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ fontSize: 7.5, color: C_TEXT3, textTransform: "uppercase" as const, letterSpacing: "0.07em", marginBottom: 8, flexShrink: 0 }}>Muster-Übersicht</div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {patterns9.map(p => {
              const r = results[p.patternId];
              const { oosWr, isWr, isNoData } = patternDisplay(r);
              const displayWr = oosWr ?? isWr;
              const yearReturns = r?.historical?.yearReturns ?? [];
              const dirC = p.direction === "LONG" ? "rgba(232,234,239,0.55)" : C_GOLD;
              return (
                <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6, paddingBottom: 5, borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <div style={{ width: 5, height: 5, borderRadius: "50%", background: dirC, flexShrink: 0 }} />
                  <span style={{ fontSize: 9.5, fontWeight: 800, color: C_WHITE, width: 32, flexShrink: 0, letterSpacing: "0.01em" }}>{p.symbol.replace("1!", "")}</span>
                  {yearReturns.length > 0
                    ? <ReturnBars yearReturns={yearReturns.slice(-12)} width={68} height={16} />
                    : <span style={{ width: 68, fontSize: 7, color: C_TEXT3 }}>—</span>
                  }
                  <span style={{ fontSize: 7.5, color: C_TEXT3, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.window}</span>
                  <span style={{ fontSize: 9, fontWeight: 700, color: isNoData ? C_TEXT3 : C_TEXT2, flexShrink: 0 }}>
                    {displayWr != null ? `${displayWr.toFixed(0)}%` : "—"}
                  </span>
                </div>
              );
            })}
            <div style={{ fontSize: 7, color: C_TEXT3, marginTop: 4 }}>
              IS-Jahresdurchschnitt · equal-weight · ZM exkludiert
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Main panel ────────────────────────────────────────────────────── */
type Mode = "grid" | "detail" | "portfolio";

interface Props {
  mode: Mode;
  onModeChange: (m: Mode) => void;
  onSelectPattern?: (assetId: string, startSlot: number, direction: "LONG" | "SHORT") => void;
}

export function SleevePortfolioPanel({ mode, onModeChange, onSelectPattern }: Props) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const allResults = useAllPatternResults();
  const selected = useMemo(() => SLEEVE_PATTERNS.find(p => p.id === selectedId) ?? null, [selectedId]);

  function activatePattern(p: SleevePattern) {
    setSelectedId(p.id);
    onSelectPattern?.(p.assetId, p.startSlot, p.direction);
  }

  function openDetail(p: SleevePattern) {
    setSelectedId(p.id);
    onModeChange("detail");
    onSelectPattern?.(p.assetId, p.startSlot, p.direction);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, fontFamily: FONT }}>

      {mode === "grid" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 14, flex: 1, minHeight: 0, overflow: "hidden", padding: "12px 14px 14px" }}>
          {SLEEVE_PATTERNS.map(p => (
            <SleeveCard key={p.id} p={p} result={allResults[p.patternId]}
              selected={selectedId === p.id}
              onActivate={() => activatePattern(p)}
              onDetail={() => openDetail(p)}
            />
          ))}
        </div>
      )}

      {mode === "detail" && (
        <div style={{ display: "flex", flex: 1, minHeight: 0, gap: 0, overflow: "hidden" }}>
          <div style={{ width: 185, flexShrink: 0, borderRight: "1px solid rgba(255,255,255,0.05)", display: "flex", flexDirection: "column", overflowY: "auto" }}>
            {SLEEVE_PATTERNS.map(p => (
              <PatternListRow key={p.id} p={p} result={allResults[p.patternId]}
                selected={selectedId === p.id} onSelect={() => openDetail(p)} />
            ))}
          </div>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
            {selected
              ? <DetailPanel p={selected} result={allResults[selected.patternId]}
                  onGoToChart={() => onSelectPattern?.(selected.assetId, selected.startSlot, selected.direction)} />
              : <div style={{ padding: 20, fontSize: 10, color: C_TEXT3 }}>Muster auswählen</div>
            }
          </div>
        </div>
      )}

      {mode === "portfolio" && (
        <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <PortfolioView results={allResults} />
        </div>
      )}
    </div>
  );
}
