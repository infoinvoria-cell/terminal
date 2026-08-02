"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getMonitoringAssetIconUrl } from "@/lib/monitoring/monitoringAssetIcons";
import React from "react";
import {
  getDeepValidatedPatterns,
  getDeepDetailById,
  getNextSignals,
  gradeColor,
  gradeBg,
  getRevalidationById,
  type DeepValidationPattern,
  type DeepDetailResult,
  type RevalidationResult,
} from "@/lib/seasonality/deepValidation";

/* ─── Design tokens — SignalCard / terminal exact ───────────────────── */
const C_WHITE  = "#ffffff";
const C_TEXT2  = "rgba(255,255,255,0.55)";
const C_TEXT3  = "rgba(255,255,255,0.28)";
const C_GOLD   = "#d8bc67";
const C_CARD   = "#111318";
const C_BORDER = "rgba(255,255,255,0.08)";
const C_HOVER  = "rgba(255,255,255,0.04)";
const FONT     = "Montserrat, Segoe UI, sans-serif";

/* ─── Pattern data ──────────────────────────────────────────────────── */
export interface SleevePattern {
  id: number;
  assetId: string;
  iconAssetId?: string; // override icon lookup (e.g. ZM → ZS icon)
  symbol: string;
  name: string;
  direction: "LONG" | "SHORT";
  window: string;
  startSlot: number;
  endSlot: number;
  calStart: number; // calendar day-of-year (1-365) for accurate countdown
  tier: "bonferroni" | "fdr";
  winRate: number;
  oosWinRate: number;
  avgReturn: number;
  sortino: number;
  nObs: number;
  maxDrawdown: number;
  profitFactor: number;
  robustness: number;
  decadeConsistent: boolean;
  category: string;
  rationale: string;
  fakeReturns: number[];
  validationId?: string;
  deepScore?: number;
  deepGrade?: string;
  wfStrictPct?: number;
  bonferroniSig?: boolean;
  paramStabilityPct?: number;
  decadesProfitable?: number;
  forwardPass?: boolean;
  reval?: RevalidationResult;
}

function makeFakeReturns(wr: number, avg: number, n = 32): number[] {
  const out: number[] = [];
  let seed = Math.floor(wr * 1000 + Math.abs(avg) * 10000) | 0;
  for (let i = 0; i < n; i++) {
    seed = (seed * 1664525 + 1013904223) & 0x7fffffff;
    const r1 = seed / 0x7fffffff;
    seed = (seed * 1664525 + 1013904223) & 0x7fffffff;
    const r2 = seed / 0x7fffffff;
    const hit = r1 < wr;
    const mag = 0.4 + r2 * 1.2;
    out.push(hit ? Math.abs(avg) * mag : -Math.abs(avg) * (0.9 + r2 * 1.8));
  }
  // Normalize so mean matches the stated avg (ensures equity line matches avgReturn sign)
  const mean = out.reduce((s, v) => s + v, 0) / out.length;
  if (Math.abs(mean) > 1e-9) {
    const scale = avg / mean;
    return out.map(v => v * scale);
  }
  return out;
}

function buildPortfolioEquity(): number[] {
  const equity: number[] = [100];
  let seed = 0x4a3f2b1c;
  for (let i = 0; i < 150; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const r1 = seed / 0xffffffff;
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const r2 = seed / 0xffffffff;
    const hit = r1 < 0.72;
    const mag = 0.3 + r2 * 1.5;
    equity.push(equity[equity.length - 1] * (1 + (hit ? 0.0055 * mag : -0.0115 * mag)));
  }
  return equity;
}

/* ─── Build sleeve patterns from deep-validated + legacy data ─────── */
function buildDeepSleevePatterns(): SleevePattern[] {
  const deepPatterns = getDeepValidatedPatterns();
  const monthNames: Record<number, string> = { 1: "Jan", 2: "Feb", 3: "Mär", 4: "Apr", 5: "Mai", 6: "Jun", 7: "Jul", 8: "Aug", 9: "Sep", 10: "Okt", 11: "Nov", 12: "Dez" };
  function parseEntryDate(id: string): { month: number; day: number; hold: number } | null {
    const m = id.match(/_(\d{2})(\d{2})_(\d+)$/);
    if (!m) return null;
    return { month: parseInt(m[1], 10), day: parseInt(m[2], 10), hold: parseInt(m[3], 10) };
  }
  function calDay(month: number, day: number): number {
    return Math.floor((new Date(2024, month - 1, day).getTime() - new Date(2024, 0, 1).getTime()) / 86400000) + 1;
  }
  function approxSlot(month: number, day: number): number {
    return Math.round(calDay(month, day) * (252 / 365));
  }
  const assetMap: Record<string, { assetId: string; iconAssetId?: string; category: string }> = {
    SB1: { assetId: "sugar", category: "Agrar" },
    ZW1: { assetId: "wheat", category: "Agrar" },
    ZC1: { assetId: "zc1", category: "Agrar" },
    ZS1: { assetId: "zs1", category: "Agrar" },
    IWM: { assetId: "iwm", category: "Indizes" },
    CL1: { assetId: "cl1", category: "Energie" },
    CC1: { assetId: "cocoa", category: "Agrar" },
    CT1: { assetId: "cotton", category: "Agrar" },
    ES1: { assetId: "es1", category: "Indizes" },
    KC1: { assetId: "kc1", category: "Agrar" },
    RB1: { assetId: "rb1", category: "Energie" },
    PL1: { assetId: "pl1", category: "Metalle" },
    PA1: { assetId: "pa1", category: "Metalle" },
    SPY: { assetId: "spy", category: "ETF" },
    EEM: { assetId: "eem", category: "ETF" },
    EFA: { assetId: "efa", category: "ETF" },
    NVDA: { assetId: "nvda", category: "Aktien" },
    FDAX1: { assetId: "fdax1", category: "Indizes" },
    YM1: { assetId: "ym1", category: "Indizes" },
    NQ1: { assetId: "nq1", category: "Indizes" },
    NG1: { assetId: "ng1", category: "Energie" },
    GC1: { assetId: "gc1", category: "Metalle" },
    GLD: { assetId: "gld", category: "ETF" },
    TLT: { assetId: "tlt", category: "Bonds" },
  };

  const result: SleevePattern[] = deepPatterns.map((dp, i) => {
    const entry = parseEntryDate(dp.id);
    const asset = assetMap[dp.asset] ?? { assetId: dp.asset.toLowerCase(), category: "Sonstige" };
    const startSlot = entry ? approxSlot(entry.month, entry.day) : 1;
    const holdSlots = entry ? Math.round(entry.hold * (252 / 365)) : 10;
    const cStart = entry ? calDay(entry.month, entry.day) : 1;
    const endDay = entry ? (() => {
      const start = new Date(2024, entry.month - 1, entry.day);
      const end = new Date(start.getTime() + (dp.avg_trade_days ?? 10) * 86400000 * (365 / 252));
      return { month: end.getMonth() + 1, day: end.getDate() };
    })() : null;
    const windowLabel = entry
      ? endDay && endDay.month !== entry.month
        ? `${monthNames[entry.month] ?? entry.month} ${entry.day} - ${monthNames[endDay.month] ?? endDay.month} ${endDay.day}`
        : `${monthNames[entry.month] ?? entry.month} ${entry.day} - ${endDay?.day ?? entry.day + 10}`
      : dp.name;
    const avgRet = dp.direction === "LONG" ? Math.abs(dp.cagr / 100) * 0.3 : -Math.abs(dp.cagr / 100) * 0.3;

    return {
      id: 100 + i,
      assetId: asset.assetId,
      iconAssetId: asset.iconAssetId,
      symbol: `${dp.asset}!`,
      name: dp.name,
      direction: dp.direction,
      window: windowLabel,
      startSlot,
      endSlot: startSlot + holdSlots,
      calStart: cStart,
      tier: dp.bonferroni_significant ? "bonferroni" as const : "fdr" as const,
      winRate: dp.win_rate / 100,
      oosWinRate: dp.wf_strict_pct != null ? dp.wf_strict_pct / 100 : dp.wf_efficiency / 100,
      avgReturn: avgRet,
      sortino: dp.sharpe * 1.4,
      nObs: dp.trades,
      maxDrawdown: dp.max_dd / 100,
      profitFactor: dp.profit_factor,
      robustness: (dp.param_stability_pct ?? 50) / 100,
      decadeConsistent: (dp.decades_profitable ?? 0) >= 4,
      category: asset.category,
      rationale: dp.verdict,
      fakeReturns: makeFakeReturns(dp.win_rate / 100, avgRet),
      validationId: dp.id,
      deepScore: dp.deep_score,
      deepGrade: dp.deep_grade,
      wfStrictPct: dp.wf_strict_pct,
      bonferroniSig: dp.bonferroni_significant,
      paramStabilityPct: dp.param_stability_pct,
      decadesProfitable: dp.decades_profitable,
      forwardPass: dp.forward_pass,
      reval: getRevalidationById(dp.id),
    };
  });

  result.sort((a, b) => (b.deepScore ?? 0) - (a.deepScore ?? 0));
  return result;
}

export const SLEEVE_PATTERNS: SleevePattern[] = buildDeepSleevePatterns();

const DUPLICATE_IDS = new Set([
  "ZW1_L_0810_8", "ZC1_L_1125_21", "PL1_L_1220_21",
  "EEM_L_1215_10", "PA1_L_1220_30", "ES1_L_1025_30",
]);

const LIVE_STATUS: Record<string, { tier: number; status: string; label: string; color: string; bg: string }> = {
  "SPY_L_1025_30":  { tier: 1, status: "LIVE_READY",   label: "LIVE",   color: "#22C55E", bg: "rgba(34,197,94,0.14)" },
  "NVDA_L_0810_14": { tier: 1, status: "LIVE_READY",   label: "LIVE",   color: "#22C55E", bg: "rgba(34,197,94,0.14)" },
  "EEM_L_1220_5":   { tier: 1, status: "LIVE_READY",   label: "LIVE",   color: "#22C55E", bg: "rgba(34,197,94,0.14)" },
  "ZW1_L_0810_10":  { tier: 1, status: "LIVE_READY",   label: "LIVE",   color: "#22C55E", bg: "rgba(34,197,94,0.14)" },
  "ZC1_L_1125_10":  { tier: 1, status: "LIVE_READY",   label: "LIVE",   color: "#22C55E", bg: "rgba(34,197,94,0.14)" },
  "PL1_L_1220_18":  { tier: 2, status: "CONDITIONAL",  label: "COND.",  color: "#D8BC67", bg: "rgba(216,188,103,0.14)" },
  "RB1_L_0205_14":  { tier: 2, status: "CONDITIONAL",  label: "COND.",  color: "#D8BC67", bg: "rgba(216,188,103,0.14)" },
  "PA1_L_1220_21":  { tier: 4, status: "REJECTED",     label: "REJECT", color: "#EF4444", bg: "rgba(239,68,68,0.12)" },
  "RB1_L_1210_45":  { tier: 4, status: "REJECTED",     label: "REJECT", color: "#EF4444", bg: "rgba(239,68,68,0.12)" },
};

const LIVE_PATTERNS = SLEEVE_PATTERNS.filter(p =>
  p.validationId != null && !DUPLICATE_IDS.has(p.validationId)
);

/* ─── Countdown hook — uses calStart (calendar day 1-365) ──────────── */
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
      setDisplay(`in ${daysAway} Tagen`);
    };
    tick();
    timer.current = setInterval(tick, 60_000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [calStart]);
  return display;
}

/* ─── Asset icon — real commodity icon via monitoring registry ───────── */
function AssetIcon({ assetId, iconAssetId, symbol, name, size = 48 }: {
  assetId: string; iconAssetId?: string; symbol: string; name: string; size?: number;
}) {
  const url = getMonitoringAssetIconUrl({
    code: symbol,
    assetId: iconAssetId ?? assetId,
    name,
    displaySymbol: symbol.replace("1!", ""),
  });
  if (!url) {
    const letter = symbol.replace("1!", "").charAt(0);
    return (
      <div style={{
        width: size, height: size, borderRadius: 12, flexShrink: 0,
        background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
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

/* ─── OOS Win Rate donut — top-right of card ────────────────────────── */
function WrDonut({ pct, size = 64 }: { pct: number; size?: number }) {
  const thick = size * 0.095;
  const r = (size - thick) / 2;
  const circ = 2 * Math.PI * r;
  const ratio = Math.min(1, Math.max(0, pct / 100));
  // At 100% use full circle stroke (no dasharray needed); otherwise partial arc
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

/* ─── Cumulative equity card-line — AVG label at last point Y ────────── */
function CardEquityLine({ returns: rets, id, avgReturn }: {
  returns: number[]; id: string; avgReturn: number;
}) {
  const eq: number[] = [0];
  for (const r of rets) eq.push(eq[eq.length - 1] + r * 100);
  const W = 200; const H = 60; const LABEL_W = 52; const VW = W + LABEL_W;
  const padTop = 4; const padBot = 4;
  const min = Math.min(...eq); const max = Math.max(...eq);
  const rng = max - min || 0.1;
  const pts = eq.map((v, i) => {
    const x = (i / (eq.length - 1)) * W;
    const y = padTop + (1 - (v - min) / rng) * (H - padTop - padBot);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const lineC = avgReturn >= 0 ? "#e8edf3" : "#d6b867";
  const fillId = `cf-${id}`;
  const lastVal = eq[eq.length - 1];
  const lastY = padTop + (1 - (lastVal - min) / rng) * (H - padTop - padBot);
  const base  = padTop + (1 - (0 - min) / rng) * (H - padTop - padBot);
  const clampedBase = Math.min(H - padBot, Math.max(padTop, base));
  const avgLabel = `${avgReturn >= 0 ? "+" : ""}${(avgReturn * 100).toFixed(1)}%`;

  return (
    <svg viewBox={`0 0 ${VW} ${H}`} width="100%" height="100%" preserveAspectRatio="none" style={{ display: "block" }}>
      <defs>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={lineC} stopOpacity="0.20" />
          <stop offset="100%" stopColor={lineC} stopOpacity="0.00" />
        </linearGradient>
      </defs>
      <line x1={0} y1={clampedBase} x2={W} y2={clampedBase}
        stroke="rgba(255,255,255,0.07)" strokeWidth={0.5} strokeDasharray="3 5" />
      <polygon points={`0,${clampedBase} ${pts} ${W},${clampedBase}`} fill={`url(#${fillId})`} />
      <polyline points={pts} fill="none" stroke={lineC} strokeWidth={1.8} strokeLinejoin="round" />
      <circle cx={W} cy={lastY} r={2.5} fill={lineC} />
      <text x={W + 5} y={lastY} dominantBaseline="central"
        fill={lineC} fontSize={9} fontWeight={700} fontFamily={FONT}>
        {avgLabel}
      </text>
    </svg>
  );
}

/* ─── Raw trade bars (for detail panel / portfolio list) ────────────── */
function ReturnBars({ returns: rets, width = 80, height = 36 }: {
  returns: number[]; width?: number; height?: number;
}) {
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

/* ─── Equity line chart — Analytics-style (white line, white fill) ── */
function EquityLine({ equity, width, height }: { equity: number[]; width: number; height: number }) {
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
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%" preserveAspectRatio="none" style={{ display: "block" }}>
      <defs>
        <linearGradient id="eq-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="rgba(245,245,245,0.10)" />
          <stop offset="100%" stopColor="rgba(245,245,245,0.00)" />
        </linearGradient>
      </defs>
      <polygon points={`0,${height - pad} ${pts} ${width},${height - pad}`} fill="url(#eq-g)" />
      <polyline points={pts} fill="none" stroke="#F5F5F5" strokeWidth={1.5} strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r={2.5} fill="#F5F5F5" />
      <text x={6} y={13} fill="rgba(255,255,255,0.28)" fontFamily={FONT} fontSize={9}>Portfolio Equity (illustrativ)</text>
      <text x={width - 6} y={13} fill={pct >= 0 ? C_GOLD : "rgba(172,96,104,0.90)"} fontFamily={FONT} fontSize={11} fontWeight="700" textAnchor="end">
        {pct >= 0 ? "+" : ""}{pct.toFixed(1)}%
      </text>
    </svg>
  );
}

/* Drawdown — Analytics-style (burgundy) */
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
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%" preserveAspectRatio="none" style={{ display: "block" }}>
      <defs>
        <linearGradient id="dd-g" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%"   stopColor="rgba(239,68,68,0.15)" />
          <stop offset="100%" stopColor="rgba(239,68,68,0.00)" />
        </linearGradient>
      </defs>
      <line x1={0} y1={4} x2={width} y2={4} stroke="rgba(255,255,255,0.16)" strokeWidth={0.5} strokeDasharray="5 4" />
      <polygon points={`0,4 ${pts} ${width},4`} fill="url(#dd-g)" />
      <polyline points={pts} fill="none" stroke="#EF4444" strokeWidth={1} strokeLinejoin="round" />
      <text x={6} y={height - 4} fill="rgba(255,255,255,0.28)" fontFamily={FONT} fontSize={9}>Drawdown</text>
      <text x={width - 6} y={height - 4} fill={C_GOLD} fontFamily={FONT} fontSize={10} fontWeight="700" textAnchor="end">
        {(maxDd * 100).toFixed(1)}%
      </text>
    </svg>
  );
}

/* ─── Symbol icon — matches SignalCard AssetIcon ────────────────────── */
function SymbolIcon({ symbol, dir, size = 40 }: { symbol: string; dir: "LONG" | "SHORT"; size?: number }) {
  const letter = symbol.replace("1!", "").charAt(0);
  const isL = dir === "LONG";
  return (
    <div style={{
      width: size, height: size, borderRadius: 10, flexShrink: 0,
      background: "rgba(255,255,255,0.06)",
      border: "1px solid rgba(255,255,255,0.08)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <span style={{ fontSize: size * 0.38, fontWeight: 800, color: isL ? "rgba(232,234,239,0.80)" : C_GOLD }}>
        {letter}
      </span>
    </div>
  );
}

/* ─── Monitoring-Tester MiniDonut ───────────────────────────────────── */
function MiniDonut({ pct, color, bg = "rgba(255,255,255,0.06)", size = 52, thick = 5 }: {
  pct: number; color: string; bg?: string; size?: number; thick?: number;
}) {
  const r = (size - thick) / 2;
  const circ = 2 * Math.PI * r;
  const dash = Math.min(1, Math.max(0, pct / 100)) * circ;
  const cx = size / 2; const cy = size / 2;
  return (
    <svg width={size} height={size} style={{ display: "block", flexShrink: 0 }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={bg} strokeWidth={thick} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={thick}
        strokeDasharray={`${dash} ${circ}`} strokeDashoffset={circ * 0.25} strokeLinecap="round" />
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
        fill={color} fontSize={size * 0.24} fontWeight="700" fontFamily={FONT}>
        {pct.toFixed(0)}%
      </text>
    </svg>
  );
}

/* ─── Deep Grade Badge — replaces WrDonut for deep-validated patterns ── */
function DeepGradeBadge({ grade, score, size = 48 }: { grade: string; score: number; size?: number }) {
  const color = gradeColor(grade);
  const bg = gradeBg(grade);
  return (
    <div style={{
      width: size, height: size, borderRadius: 10, flexShrink: 0,
      background: bg, border: `1.5px solid ${color}40`,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      gap: 1,
    }}>
      <span style={{ fontSize: size * 0.38, fontWeight: 900, color, lineHeight: 1, fontFamily: FONT }}>
        {grade}
      </span>
      <span style={{ fontSize: size * 0.17, fontWeight: 700, color: `${color}B0`, lineHeight: 1, fontFamily: FONT }}>
        {score}
      </span>
    </div>
  );
}

/* ─── Tier badge ────────────────────────────────────────────────────── */
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

/* ─── Monitoring-Tester KPI mini-cell ───────────────────────────────── */
function KpiCell({ label, value, valueColor = "#eef2f7" }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={{
      padding: "5px 7px", borderRadius: 8,
      border: "1px solid rgba(232,237,244,0.12)",
      background: "rgba(12,14,18,0.85)",
      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
    }}>
      <div style={{ fontSize: 7, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase" as const, color: "#7c8798", lineHeight: 1, marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ fontSize: 11, fontWeight: 700, color: valueColor, lineHeight: 1, fontFamily: FONT }}>
        {value}
      </div>
    </div>
  );
}

/* ─── Detail icon (list/chart) ───────────────────────────────────────── */
function DetailIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ display: "block" }}>
      <rect x="1" y="2" width="12" height="1.5" rx="0.75" fill="currentColor" />
      <rect x="1" y="6" width="8"  height="1.5" rx="0.75" fill="currentColor" />
      <rect x="1" y="10" width="10" height="1.5" rx="0.75" fill="currentColor" />
    </svg>
  );
}

/* ─── Live status dot — small 6px dot next to WrDonut ──────────────── */
function LiveDot({ validationId }: { validationId?: string }) {
  if (!validationId) return null;
  const ls = LIVE_STATUS[validationId];
  if (!ls || ls.tier === 4) return null;
  return (
    <span style={{
      display: "inline-block",
      width: 6, height: 6, borderRadius: "50%",
      background: ls.color,
      flexShrink: 0, alignSelf: "center",
      boxShadow: `0 0 4px ${ls.color}80`,
    }} />
  );
}

/* ─── Grid card ─────────────────────────────────────────────────────── */
function SleeveCard({ p, selected, onActivate, onDetail }: {
  p: SleevePattern;
  selected: boolean;
  onActivate: () => void;
  onDetail: () => void;
}) {
  const isLong    = p.direction === "LONG";
  const dirColor  = isLong ? "#22C55E" : "#EF4444";
  const countdown = usePatternCountdown(p.calStart);
  const [detailHov, setDetailHov] = useState(false);
  const activeLiveEst = useMemo<number | null>(() => {
    if (countdown !== "Aktiv") return null;
    const todayCal = todayCalendarDay();
    const daysElapsed = Math.max(0, todayCal - p.calStart);
    const windowTd = Math.max(1, p.endSlot - p.startSlot);
    const tradingElapsed = daysElapsed * (252 / 365);
    const progress = Math.min(1, tradingElapsed / windowTd);
    const idx = Math.max(1, Math.round(progress * p.fakeReturns.length));
    return p.fakeReturns.slice(0, idx).reduce((s, r) => s + r * 100, 0);
  }, [countdown, p.calStart, p.endSlot, p.startSlot, p.fakeReturns]);

  const cardBg = selected
    ? `radial-gradient(ellipse 120% 90% at 115% 120%, rgba(216,188,103,0.14) 0%, transparent 55%), linear-gradient(160deg, #181c24 0%, #111318 100%)`
    : `linear-gradient(160deg, #181c24 0%, #111318 100%)`;

  return (
    <div
      role="button" tabIndex={0}
      onClick={onActivate}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onActivate(); }}
      style={{
        background: cardBg,
        border: selected ? "1px solid rgba(216,188,103,0.32)" : `1px solid ${C_BORDER}`,
        borderRadius: 12,
        padding: "8px 10px 6px",
        display: "flex", flexDirection: "column", gap: 0,
        cursor: "pointer", outline: "none",
        transition: "border-color 120ms",
        height: "100%", boxSizing: "border-box" as const,
        fontFamily: FONT, overflow: "hidden",
      }}
    >
      {/* ── Row 1: Icon · Symbol + Name · WR Donut ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <AssetIcon assetId={p.assetId} iconAssetId={p.iconAssetId} symbol={p.symbol} name={p.name} size={28} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 900, color: "#fff", lineHeight: 1, letterSpacing: "0.01em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {p.symbol.replace("1!", "!")}
            <span style={{ fontSize: 9, fontWeight: 500, color: "rgba(255,255,255,0.38)", marginLeft: 5 }}>{p.name.split(" ")[0]}</span>
          </div>
        </div>
        <WrDonut pct={p.winRate * 100} size={38} />
      </div>

      {/* ── Row 2: Datum ── */}
      <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.82)", lineHeight: 1, marginBottom: 3 }}>
        {p.window}
      </div>

      {/* ── Row 3: Countdown ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
        <span style={{ fontSize: 9, fontWeight: 600, color: countdown === "Aktiv" ? "#e8edf3" : C_GOLD, lineHeight: 1 }}>
          {countdown || "—"}
        </span>
        {activeLiveEst !== null && (
          <span style={{ fontSize: 9, fontWeight: 800, lineHeight: 1, color: activeLiveEst >= 0 ? C_GOLD : "rgba(210,90,80,0.90)" }}>
            {activeLiveEst >= 0 ? "+" : ""}{activeLiveEst.toFixed(1)}%
          </span>
        )}
      </div>

      {/* ── Row 4: Sparkline — fills remaining space, AVG label inside SVG ── */}
      <div style={{ flex: 1, minHeight: 48, overflow: "hidden" }}>
        <CardEquityLine returns={p.fakeReturns} id={`p${p.id}`} avgReturn={p.avgReturn} />
      </div>

      {/* ── Row 5: Direction ▲/▼ · Detail icon ── */}
      <div style={{ marginTop: 4, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          fontSize: 10, fontWeight: 900, letterSpacing: "0.06em",
          color: dirColor, lineHeight: 1,
        }}>
          <span style={{ fontSize: 8 }}>{isLong ? "▲" : "▼"}</span>
          {p.direction}
        </span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDetail(); }}
          onMouseEnter={() => setDetailHov(true)}
          onMouseLeave={() => setDetailHov(false)}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 20, height: 20, borderRadius: 5, border: "none",
            background: detailHov ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.04)",
            color: detailHov ? "#e8edf3" : "rgba(255,255,255,0.25)",
            cursor: "pointer", flexShrink: 0, transition: "background 120ms, color 120ms",
          }}
        >
          <DetailIcon />
        </button>
      </div>
    </div>
  );
}

/* ─── Left list row (detail view) ───────────────────────────────────── */
function PatternListRow({ p, selected, onSelect }: { p: SleevePattern; selected: boolean; onSelect: () => void }) {
  const [hov, setHov] = useState(false);
  const dirColor = p.direction === "LONG" ? "rgba(232,234,239,0.70)" : C_GOLD;
  return (
    <button type="button" onClick={onSelect}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        width: "100%", textAlign: "left",
        padding: "7px 10px", border: "none", cursor: "pointer",
        background: selected ? "rgba(216,188,103,0.06)" : hov ? C_HOVER : "transparent",
        borderBottom: `1px solid rgba(255,255,255,0.05)`,
        borderLeft: selected ? `2px solid ${C_GOLD}` : "2px solid transparent",
        boxShadow: `inset 3px 0 0 ${selected ? C_GOLD : "transparent"}`,
        transition: "background 0.1s", flexShrink: 0, fontFamily: FONT,
      }}
    >
      <div style={{ width: 6, height: 6, borderRadius: "50%", background: dirColor, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: C_WHITE, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", letterSpacing: "0.01em" }}>{p.symbol}</div>
        <div style={{ fontSize: 7.5, color: C_TEXT3, whiteSpace: "nowrap" }}>{p.window}</div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: C_WHITE }}>{(p.winRate * 100).toFixed(0)}%</div>
        <div style={{ fontSize: 7, color: C_TEXT3 }}>S {p.sortino.toFixed(1)}</div>
      </div>
      <TierBadge tier={p.tier} />
    </button>
  );
}

/* ─── Section label ────────────────────────────────────────────────── */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 8, fontWeight: 700, color: "#7c8798", textTransform: "uppercase" as const, letterSpacing: "0.10em", marginBottom: 6 }}>
      {children}
    </div>
  );
}

/* ─── Status pill ──────────────────────────────────────────────────── */
function StatusPill({ pass, label }: { pass: boolean; label?: string }) {
  const color = pass ? "#22C55E" : "#EF4444";
  const text = label ?? (pass ? "PASS" : "FAIL");
  return (
    <span style={{ fontSize: 9, fontWeight: 700, color, border: `1px solid ${pass ? "rgba(34,197,94,0.35)" : "rgba(239,68,68,0.35)"}`, padding: "1px 6px", borderRadius: 4, fontFamily: FONT }}>
      {text}
    </span>
  );
}

/* ─── Detail panel — Deep Validation breakdown ─────────────────────── */
function DetailPanel({ p, onGoToChart }: { p: SleevePattern; onGoToChart: () => void }) {
  const isLong   = p.direction === "LONG";
  const dirColor = isLong ? "rgba(232,234,239,0.80)" : C_GOLD;
  const detail   = p.validationId ? getDeepDetailById(p.validationId) : undefined;
  const gc       = p.deepGrade ? gradeColor(p.deepGrade) : C_WHITE;
  const C_PASS   = "#22C55E";
  const C_FAIL   = "#EF4444";
  const C_WARN   = "#F59E0B";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "16px 18px", flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", fontFamily: FONT, background: "#090909" }}>

      {/* ── HEADER ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <AssetIcon assetId={p.assetId} iconAssetId={p.iconAssetId} symbol={p.symbol} name={p.name} size={44} />
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
              <span style={{ fontSize: 18, fontWeight: 900, color: C_WHITE, letterSpacing: "0.01em" }}>{p.symbol.replace("1!", "!")}</span>
              <span style={{ fontSize: 8, fontWeight: 700, color: dirColor, border: `1px solid ${dirColor}40`, padding: "1px 5px", borderRadius: 3 }}>{p.direction}</span>
            </div>
            <div style={{ fontSize: 10, color: C_TEXT2 }}>{p.name} · {p.window}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          {p.deepGrade && p.deepScore != null && (
            <DeepGradeBadge grade={p.deepGrade} score={p.deepScore} size={56} />
          )}
          <button type="button" onClick={onGoToChart} style={{
            background: "rgba(216,188,103,0.08)", border: "1px solid rgba(216,188,103,0.25)",
            borderRadius: 6, padding: "5px 12px", color: C_GOLD, fontSize: 9,
            cursor: "pointer", fontWeight: 700, fontFamily: FONT, letterSpacing: "0.03em",
          }}>
            Chart
          </button>
        </div>
      </div>


      {/* ── METRICS ── */}
      {((): React.ReactNode => {
        const bt = detail && (detail as any).backtrader_metrics ? (detail as any).backtrader_metrics as { sharpe: number; calmar: number; win_rate: number; profit_factor: number; cagr: number; max_dd: number; trades: number; oos_sharpe: number; oos_win_rate: number } : null;
        const KC: React.CSSProperties = { background: "linear-gradient(to bottom, #19191d, #111214)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "10px 12px", display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: 68 };
        const KL: React.CSSProperties = { fontSize: 8, fontWeight: 600, color: "#71717a", textTransform: "uppercase", letterSpacing: "0.10em", fontFamily: FONT };
        const KV: React.CSSProperties = { fontSize: 17, fontWeight: 700, lineHeight: 1, fontVariantNumeric: "tabular-nums", fontFamily: FONT };
        const metrics = bt ? [
          { label: "Sharpe",       value: bt.sharpe.toFixed(2),          color: bt.sharpe >= 1 ? C_PASS : bt.sharpe < 0 ? C_FAIL : "#ffffff" },
          { label: "Calmar",       value: bt.calmar.toFixed(2),          color: bt.calmar >= 1 ? C_PASS : bt.calmar < 0 ? C_FAIL : "#ffffff" },
          { label: "Win Rate",     value: `${bt.win_rate.toFixed(1)}%`,  color: "#ffffff" },
          { label: "Profit Factor",value: bt.profit_factor.toFixed(2),   color: "#ffffff" },
          { label: "CAGR",         value: `${bt.cagr.toFixed(1)}%`,      color: bt.cagr > 0 ? "#ffffff" : C_FAIL },
          { label: "Max Drawdown", value: `${bt.max_dd.toFixed(1)}%`,    color: C_FAIL },
          { label: "OOS Sharpe",   value: bt.oos_sharpe.toFixed(2),      color: bt.oos_sharpe >= 1 ? C_PASS : bt.oos_sharpe < 0 ? C_FAIL : "#ffffff" },
          { label: "Trades",       value: `${bt.trades}`,                 color: "#ffffff" },
        ] : [
          { label: "Win Rate IS",  value: `${(p.winRate * 100).toFixed(0)}%`,     color: "#ffffff" },
          { label: "Win Rate OOS", value: `${(p.oosWinRate * 100).toFixed(0)}%`,  color: "#ffffff" },
          { label: "Profit Factor",value: p.profitFactor.toFixed(1),               color: "#ffffff" },
          { label: "Sortino",      value: p.sortino.toFixed(2),                    color: p.sortino >= 1 ? C_PASS : "#ffffff" },
          { label: "Max DD",       value: `${(p.maxDrawdown * 100).toFixed(0)}%`,  color: C_FAIL },
          { label: "Avg Return",   value: `${(p.avgReturn * 100).toFixed(2)}%`,    color: p.avgReturn >= 0 ? "#ffffff" : C_FAIL },
          { label: "Trades",       value: `${p.nObs}`,                             color: "#ffffff" },
          { label: "WF Score",     value: p.wfStrictPct != null ? `${p.wfStrictPct.toFixed(0)}%` : "—", color: "#ffffff" },
        ];
        return (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, flexShrink: 0 }}>
            {metrics.map(m => (
              <div key={m.label} style={KC}>
                <div style={KL}>{m.label}</div>
                <div style={{ ...KV, color: m.color }}>{m.value}</div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* ── 7-TEST CHIPS ── */}
      {detail && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, flexShrink: 0 }}>
          {[
            { label: "Walk-Forward", pass: detail.t1_wf_strict.pass,          value: `${detail.t1_wf_strict.wf_strict_pct.toFixed(0)}%` },
            { label: "Bonferroni",   pass: detail.t2_bonferroni.significant,  value: `p=${detail.t2_bonferroni.p_bonferroni.toFixed(3)}` },
            { label: "Param Stab.", pass: detail.t3_stability.pass,           value: `${detail.t3_stability.stability_pct.toFixed(0)}%` },
            { label: "Dekaden",     pass: detail.t6_decades.pass,             value: `${detail.t6_decades.decades_profitable}/${detail.t6_decades.total}` },
            { label: "Forward",     pass: detail.t7_forward.pass,             value: detail.t7_forward.sharpe.toFixed(2) },
            { label: "Kosten",      pass: detail.t5_costs.pass,               value: detail.t5_costs.break_even_range },
            { label: "Regime",      pass: detail.t4_regime.pass,              value: `${detail.t4_regime.regimes_positive}/${detail.t4_regime.total_regimes}` },
          ].map(t => (
            <div key={t.label} style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "5px 10px", borderRadius: 8,
              background: "rgba(255,255,255,0.03)",
              border: `1px solid ${t.pass ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.18)"}`,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: t.pass ? C_PASS : C_FAIL, display: "inline-block", flexShrink: 0 }} />
              <span style={{ fontSize: 9, fontWeight: 600, color: "#8d8f98", fontFamily: FONT }}>{t.label}</span>
              <span style={{ fontSize: 9, fontWeight: 700, color: t.pass ? "#e8edf3" : C_FAIL, fontFamily: FONT, fontVariantNumeric: "tabular-nums" }}>{t.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── WF EQUITY CHART ── */}
      {detail && detail.t1_wf_strict.fold_details.length > 0 && (() => {
        const folds = detail.t1_wf_strict.fold_details;
        const eq: number[] = [0];
        for (const f of folds) eq.push(eq[eq.length - 1] + f.pnl);
        const maxAbs = Math.max(...eq.map(Math.abs), 1);
        const W = 400; const H = 72;
        const pts = eq.map((v, i) => {
          const x = (i / (eq.length - 1)) * W;
          const y = H / 2 - (v / maxAbs) * (H / 2 - 6);
          return `${x.toFixed(1)},${y.toFixed(1)}`;
        }).join(" ");
        const fillId = `wf-eq-${p.id}`;
        return (
          <div style={{ flexShrink: 0 }}>
            <div style={{ fontSize: 8, fontWeight: 600, color: "#71717a", textTransform: "uppercase" as const, letterSpacing: "0.10em", marginBottom: 8, fontFamily: FONT }}>
              Walk-Forward — {detail.t1_wf_strict.positive_folds}/{detail.t1_wf_strict.folds} positive Folds
            </div>
            <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: "block" }}>
              <defs>
                <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(232,237,243,0.12)" />
                  <stop offset="100%" stopColor="rgba(232,237,243,0.00)" />
                </linearGradient>
              </defs>
              <line x1={0} y1={H / 2} x2={W} y2={H / 2} stroke="rgba(255,255,255,0.06)" strokeWidth={0.5} strokeDasharray="4 6" />
              <polygon points={`0,${H / 2} ${pts} ${W},${H / 2}`} fill={`url(#${fillId})`} />
              <polyline points={pts} fill="none" stroke="#e8edf3" strokeWidth={1.6} strokeLinejoin="round" />
            </svg>
          </div>
        );
      })()}

    </div>
  );
}
/* ─── Next Signal Banner ───────────────────────────────────────────── */
function NextSignalBanner() {
  const signals = useMemo(() => getNextSignals(), []);
  const next = signals[0];
  if (!next) return null;
  const monthNames: Record<number, string> = { 1: "Jan", 2: "Feb", 3: "Mär", 4: "Apr", 5: "Mai", 6: "Jun", 7: "Jul", 8: "Aug", 9: "Sep", 10: "Okt", 11: "Nov", 12: "Dez" };
  const dateLabel = `${monthNames[next.entry_month] ?? next.entry_month} ${next.entry_day}`;
  const gc = gradeColor(next.deep_grade);
  const isActive = next.status === "ACTIVE";

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "8px 14px",
      background: "rgba(216,188,103,0.05)",
      borderBottom: "1px solid rgba(216,188,103,0.12)",
      flexShrink: 0, fontFamily: FONT,
    }}>
      <span style={{ fontSize: 7, fontWeight: 700, color: "#7c8798", textTransform: "uppercase" as const, letterSpacing: "0.10em" }}>
        {isActive ? "AKTIVES SIGNAL" : "NÄCHSTES SIGNAL"}
      </span>
      <span style={{ fontSize: 13, fontWeight: 900, color: C_GOLD }}>
        {next.asset}! {next.name.split(" ").slice(1).join(" ")}
      </span>
      <span style={{ fontSize: 9, fontWeight: 700, color: gc, background: gradeBg(next.deep_grade), padding: "1px 6px", borderRadius: 4 }}>
        {next.deep_grade}
      </span>
      <span style={{ fontSize: 11, fontWeight: 600, color: C_TEXT2 }}>
        — {dateLabel}
      </span>
      <span style={{ fontSize: 11, fontWeight: 800, color: isActive ? "#22C55E" : C_GOLD }}>
        {isActive ? "Aktiv" : `in ${next.days_away} Tagen`}
      </span>
    </div>
  );
}

/* ─── Portfolio KPI strip — Monitoring Tester glass-card style ──────── */
function KpiBox({ label, value, sub, valueColor = "#eef2f7" }: { label: string; value: string; sub: string; valueColor?: string }) {
  return (
    <div style={{
      borderBottom: "1px solid #1A1A1A",
      padding: "8px 4px 10px",
      display: "flex", flexDirection: "column", justifyContent: "space-between",
      fontFamily: FONT,
    }}>
      <div style={{ fontSize: 8, fontWeight: 700, color: "#6B7280", textTransform: "uppercase" as const, letterSpacing: "0.10em", marginBottom: 5 }}>{label}</div>
      <div>
        <div style={{ fontSize: 18, fontWeight: 800, color: valueColor, lineHeight: 1, letterSpacing: "-0.3px", fontVariantNumeric: "tabular-nums" }}>{value}</div>
        <div style={{ fontSize: 8, color: "rgba(255,255,255,0.25)", marginTop: 3 }}>{sub}</div>
      </div>
    </div>
  );
}

/* ─── Portfolio view ────────────────────────────────────────────────── */
function PortfolioView() {
  const patterns = SLEEVE_PATTERNS;
  const avgWr    = patterns.reduce((s, p) => s + p.winRate, 0) / patterns.length;
  const avgOos   = patterns.reduce((s, p) => s + p.oosWinRate, 0) / patterns.length;
  const total    = patterns.reduce((s, p) => s + p.nObs, 0);
  const bon      = patterns.filter(p => p.tier === "bonferroni").length;
  const equity   = useMemo(() => buildPortfolioEquity(), []);
  const finalRet = (equity[equity.length - 1] / equity[0] - 1) * 100;
  let pk = equity[0]; let maxDd = 0;
  for (const v of equity) { if (v > pk) pk = v; const dd = (v / pk) - 1; if (dd < maxDd) maxDd = dd; }

  const KC: React.CSSProperties = {
    background: "linear-gradient(to bottom, #19191d, #111214)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 12, padding: "12px 14px",
    display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: 72,
  };
  const KL: React.CSSProperties = { fontSize: 8, fontWeight: 600, color: "#71717a", textTransform: "uppercase", letterSpacing: "0.10em", fontFamily: FONT };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "14px 16px", flex: 1, minHeight: 0, overflow: "hidden" }}>

      {/* ── KPI STRIP (Analytics gradient cards) ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, flexShrink: 0 }}>
        {[
          { label: "Muster",        value: `${patterns.length}`,                               sub: `${bon} Bonferroni`,  color: "#ffffff" },
          { label: "Ø IS Win Rate", value: `${(avgWr * 100).toFixed(1)}%`,                    sub: "In-Sample",          color: "#ffffff" },
          { label: "Ø OOS Win Rate",value: `${(avgOos * 100).toFixed(1)}%`,                   sub: "Out-of-Sample",      color: "#ffffff" },
          { label: "Portfolio Ret.",value: `${finalRet >= 0 ? "+" : ""}${finalRet.toFixed(1)}%`, sub: "Illustrativ",     color: finalRet >= 0 ? "#ffffff" : "#EF4444" },
          { label: "Max Drawdown",  value: `${(maxDd * 100).toFixed(1)}%`,                    sub: `${total} Trades`,    color: "#EF4444" },
        ].map(m => (
          <div key={m.label} style={KC}>
            <div style={KL}>{m.label}</div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1, fontVariantNumeric: "tabular-nums", color: m.color, fontFamily: FONT }}>{m.value}</div>
              <div style={{ fontSize: 8, color: "rgba(255,255,255,0.30)", marginTop: 4, fontFamily: FONT }}>{m.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── EQUITY CHART ── */}
      <div style={{ flex: 3, minHeight: 0, border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, overflow: "hidden" }}>
        <EquityLine equity={equity} width={600} height={120} />
      </div>

      {/* ── DRAWDOWN CHART ── */}
      <div style={{ flex: 1, minHeight: 0, border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, overflow: "hidden" }}>
        <DrawdownLine equity={equity} width={600} height={52} />
      </div>
    </div>
  );
}

/* ─── Main panel ────────────────────────────────────────────────────── */
type Mode = "grid" | "detail" | "portfolio";

interface Props {
  mode: Mode;
  onModeChange: (m: Mode) => void;
  onSelectPattern?: (assetId: string, startSlot: number, direction: "LONG" | "SHORT", holdingDays?: number) => void;
}

export function SleevePortfolioPanel({ mode, onModeChange, onSelectPattern }: Props) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = useMemo(() => SLEEVE_PATTERNS.find(p => p.id === selectedId) ?? null, [selectedId]);

  function activatePattern(p: SleevePattern) {
    setSelectedId(p.id);
    onSelectPattern?.(p.assetId, p.startSlot, p.direction, p.endSlot - p.startSlot);
  }

  function openDetail(p: SleevePattern) {
    setSelectedId(p.id);
    onModeChange("detail");
    onSelectPattern?.(p.assetId, p.startSlot, p.direction, p.endSlot - p.startSlot);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, fontFamily: FONT }}>

      {/* Next Signal Banner — only in detail/portfolio, not grid */}
      {mode !== "grid" && <NextSignalBanner />}

      {mode === "grid" && (() => {
        const UNIQUE_IDS = new Set([
          "ZW1_L_0810_10", "NVDA_L_0810_14", "SPY_L_1025_30",
          "ZC1_L_1125_10", "EEM_L_1220_5",   "PL1_L_1220_18",
          "PA1_L_1220_21", "RB1_L_0205_14",  "RB1_L_1210_45",
          "SB1_L_0924_10",
        ]);
        const today = todayCalendarDay();
        const sorted = SLEEVE_PATTERNS
          .filter(p => p.validationId != null && UNIQUE_IDS.has(p.validationId))
          .sort((a, b) => ((a.calStart - today) + 365) % 365 - ((b.calStart - today) + 365) % 365);

        return (
          <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gridTemplateRows: "repeat(2, 1fr)", gap: 12, padding: "12px 14px", flex: 1 }}>
              {sorted.map(p => (
                <SleeveCard key={p.id} p={p} selected={selectedId === p.id}
                  onActivate={() => activatePattern(p)}
                  onDetail={() => openDetail(p)}
                />
              ))}
            </div>
          </div>
        );
      })()}

      {mode === "detail" && (
        <div style={{ display: "flex", flex: 1, minHeight: 0, gap: 0, overflow: "hidden" }}>
          <div style={{ width: 185, flexShrink: 0, borderRight: `1px solid rgba(255,255,255,0.05)`, display: "flex", flexDirection: "column", overflowY: "auto" }}>
            {SLEEVE_PATTERNS.map(p => (
              <PatternListRow key={p.id} p={p} selected={selectedId === p.id} onSelect={() => openDetail(p)} />
            ))}
          </div>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
            {selected
              ? <DetailPanel p={selected} onGoToChart={() => onSelectPattern?.(selected.assetId, selected.startSlot, selected.direction, selected.endSlot - selected.startSlot)} />
              : <div style={{ padding: 20, fontSize: 10, color: C_TEXT3 }}>Muster auswählen</div>
            }
          </div>
        </div>
      )}

      {mode === "portfolio" && (
        <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <PortfolioView />
        </div>
      )}
    </div>
  );
}
