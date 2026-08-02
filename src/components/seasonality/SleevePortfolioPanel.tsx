"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getMonitoringAssetIconUrl } from "@/lib/monitoring/monitoringAssetIcons";
import {
  getDeepValidatedPatterns,
  getDeepDetailById,
  getRevalidationById,
  getNextSignals,
  gradeColor,
  gradeBg,
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
  p.reval != null && p.validationId != null && !DUPLICATE_IDS.has(p.validationId)
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

/* ─── Cumulative equity card-line — avg label at exact last-point Y ── */
function CardEquityLine({ returns: rets, id, avgReturn }: {
  returns: number[]; id: string; avgReturn: number;
}) {
  const eq: number[] = [0];
  for (const r of rets) eq.push(eq[eq.length - 1] + r * 100);
  const W = 148; const H = 42; const VW = W + 50;
  const min = Math.min(...eq); const max = Math.max(...eq);
  const rng = max - min || 0.1;
  // y=0 → top of chart, y=H → bottom (max maps to top, min maps to bottom)
  const points = eq.map((v, i) => ({
    x: (i / (eq.length - 1)) * W,
    y: H - ((v - min) / rng) * H,
  }));
  const pts = points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const lastY = points[points.length - 1].y;
  const baseY = H - ((0 - min) / rng) * H;
  const clampedBase = Math.min(H, Math.max(0, baseY));
  const lineC = avgReturn >= 0 ? "#e8edf3" : "#d6b867";
  const fillId = `cf-${id}`;
  const avgLabel = `${avgReturn >= 0 ? "+" : ""}${(avgReturn * 100).toFixed(1)}%`;

  return (
    <svg viewBox={`0 0 ${VW} ${H}`} width="100%" height={H} style={{ display: "block" }}>
      <defs>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={lineC} stopOpacity="0.18" />
          <stop offset="100%" stopColor={lineC} stopOpacity="0.00" />
        </linearGradient>
      </defs>
      <line x1={0} y1={clampedBase} x2={W} y2={clampedBase}
        stroke="rgba(255,255,255,0.07)" strokeWidth={0.5} strokeDasharray="3 5" />
      <polygon points={`0,${clampedBase} ${pts} ${W},${clampedBase}`} fill={`url(#${fillId})`} />
      <polyline points={pts} fill="none" stroke={lineC} strokeWidth={1.8} strokeLinejoin="round" />
      <circle cx={W} cy={lastY} r={2.5} fill={lineC} />
      <text x={W + 4} y={lastY} dominantBaseline="central"
        fill="#C9A84C" fontSize={9} fontWeight={700} fontFamily={FONT}>
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
          <stop offset="0%"   stopColor="rgba(124,58,67,0.30)" />
          <stop offset="100%" stopColor="rgba(124,58,67,0.04)" />
        </linearGradient>
      </defs>
      <line x1={0} y1={4} x2={width} y2={4} stroke="rgba(255,255,255,0.16)" strokeWidth={0.5} strokeDasharray="5 4" />
      <polygon points={`0,4 ${pts} ${width},4`} fill="url(#dd-g)" />
      <polyline points={pts} fill="none" stroke="rgba(172,96,104,0.86)" strokeWidth={1.45} strokeLinejoin="round" />
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

/* ─── Grid card — 1:1 Referenz-Layout, kompakt ──────────────────────── */
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

  const ls = p.validationId ? LIVE_STATUS[p.validationId] : undefined;
  const isRejected = ls?.tier === 4;
  const cardBg = selected
    ? `radial-gradient(ellipse 120% 90% at 115% 120%, rgba(216,188,103,0.14) 0%, transparent 55%), ${C_CARD}`
    : C_CARD;
  const avgLabel = `${p.avgReturn >= 0 ? "+" : ""}${(p.avgReturn * 100).toFixed(1)}% avg`;

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
        opacity: isRejected ? 0.45 : 1,
      }}
    >
      {/* ── Row 1: Icon · Symbol + Name · LiveDot · WR Donut ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <AssetIcon assetId={p.assetId} iconAssetId={p.iconAssetId} symbol={p.symbol} name={p.name} size={28} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 900, color: "#fff", lineHeight: 1, letterSpacing: "0.01em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {p.symbol.replace("1!", "!")}
            <span style={{ fontSize: 9, fontWeight: 500, color: "rgba(255,255,255,0.38)", marginLeft: 5 }}>{p.name.split(" ")[0]}</span>
          </div>
        </div>
        <LiveDot validationId={p.validationId} />
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

      {/* ── Row 4: Sparkline with inline avg label at last point ── */}
      <div style={{ flex: 1, minHeight: 32, overflow: "hidden" }}>
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
  const bg = pass ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)";
  const color = pass ? "#22C55E" : "#EF4444";
  const text = label ?? (pass ? "PASS" : "FAIL");
  return (
    <span style={{ fontSize: 9, fontWeight: 700, color, background: bg, padding: "1px 6px", borderRadius: 4, fontFamily: FONT }}>
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
  const gb       = p.deepGrade ? gradeBg(p.deepGrade) : "transparent";
  const C_PASS   = "#22C55E";
  const C_FAIL   = "#EF4444";
  const C_SCORE  = "#C9A84C";
  const CARD     = { background: "rgba(255,255,255,0.025)", border: `1px solid ${C_BORDER}`, borderRadius: 8, padding: "10px 12px" } as const;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "14px 16px", flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", fontFamily: FONT }}>

      {/* ── A) HEADER ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <AssetIcon assetId={p.assetId} iconAssetId={p.iconAssetId} symbol={p.symbol} name={p.name} size={44} />
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
              <span style={{ fontSize: 18, fontWeight: 900, color: C_WHITE, letterSpacing: "0.01em" }}>{p.symbol.replace("1!", "!")}</span>
              <span style={{ fontSize: 8, fontWeight: 700, color: dirColor, background: `${dirColor}18`, padding: "1px 5px", borderRadius: 3 }}>{p.direction}</span>
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

      {/* ── B0) BACKTRADER ENGINE METRICS ── */}
      {detail && (detail as any).backtrader_metrics && (() => {
        const bt = (detail as any).backtrader_metrics as { sharpe: number; calmar: number; win_rate: number; profit_factor: number; cagr: number; max_dd: number; trades: number; total_pnl: number; oos_sharpe: number; oos_win_rate: number };
        return (
          <div style={{ ...CARD, flexShrink: 0 }}>
            <SectionLabel>Backtrader Engine — Echte Backtestzahlen</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 8 }}>
              {[
                { label: "Sharpe", value: bt.sharpe.toFixed(2), color: bt.sharpe >= 0.5 ? C_PASS : C_SCORE },
                { label: "Calmar", value: bt.calmar.toFixed(2), color: bt.calmar >= 1 ? C_PASS : C_SCORE },
                { label: "Win Rate", value: `${bt.win_rate.toFixed(1)}%`, color: bt.win_rate >= 70 ? C_PASS : C_WHITE },
                { label: "Profit Factor", value: bt.profit_factor.toFixed(2), color: bt.profit_factor >= 2 ? C_PASS : C_WHITE },
              ].map(k => (
                <div key={k.label}>
                  <div style={{ fontSize: 7, color: C_TEXT3, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 3 }}>{k.label}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: k.color, fontFamily: FONT, fontVariantNumeric: "tabular-nums" }}>{k.value}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
              {[
                { label: "CAGR", value: `${bt.cagr.toFixed(1)}%`, color: bt.cagr > 0 ? C_PASS : C_FAIL },
                { label: "Max DD", value: `${bt.max_dd.toFixed(1)}%`, color: C_FAIL },
                { label: "Trades", value: `${bt.trades}`, color: C_WHITE },
                { label: "OOS Sharpe", value: bt.oos_sharpe.toFixed(2), color: bt.oos_sharpe > 0 ? C_PASS : C_FAIL },
              ].map(k => (
                <div key={k.label}>
                  <div style={{ fontSize: 7, color: C_TEXT3, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 3 }}>{k.label}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: k.color, fontFamily: FONT, fontVariantNumeric: "tabular-nums" }}>{k.value}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ── REVALIDATION RESULTS ── */}
      {p.reval && (() => {
        const rv = p.reval;
        const C_PASS = "#22C55E";
        const C_WARN = "#F0883E";
        const mmColor = rv.median_mean_ratio >= 0.7 ? C_PASS : rv.median_mean_ratio >= 0.5 ? C_WARN : "#EF4444";
        return (
          <div style={{ ...CARD, flexShrink: 0 }}>
            <SectionLabel>Re-Validierung — Robustheitsprüfung</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 10 }}>
              {[
                { label: "Historie", value: `${rv.n_years} Jahre`, color: rv.has_20y ? C_PASS : "#EF4444" },
                { label: "Win Rate", value: `${rv.win_rate.toFixed(1)}%`, color: rv.win_rate >= 75 ? C_PASS : C_WHITE },
                { label: "Med/Mean", value: rv.median_mean_ratio.toFixed(2), color: mmColor },
                { label: "Skewness", value: rv.skewness.toFixed(2), color: Math.abs(rv.skewness) > 1.5 ? C_WARN : C_WHITE },
              ].map(k => (
                <div key={k.label}>
                  <div style={{ fontSize: 7, color: C_TEXT3, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 3 }}>{k.label}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: k.color, fontFamily: FONT, fontVariantNumeric: "tabular-nums" }}>{k.value}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 10 }}>
              {[
                { label: "RWF Folds", value: `${rv.rolling_wf_positive}/${rv.rolling_wf_folds}`, color: rv.rolling_wf_pct >= 80 ? C_PASS : C_WARN },
                { label: "RWF Rate", value: `${rv.rolling_wf_pct.toFixed(0)}%`, color: rv.rolling_wf_pct >= 80 ? C_PASS : C_WARN },
                { label: "Param Robust", value: `${rv.param_pct.toFixed(0)}%`, color: rv.param_pct >= 80 ? C_PASS : C_WARN },
                { label: "Param Var.", value: `${rv.param_positive}/${rv.param_total}`, color: rv.param_robust ? C_PASS : "#EF4444" },
              ].map(k => (
                <div key={k.label}>
                  <div style={{ fontSize: 7, color: C_TEXT3, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 3 }}>{k.label}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: k.color, fontFamily: FONT, fontVariantNumeric: "tabular-nums" }}>{k.value}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <StatusPill pass={rv.has_20y} label={rv.has_20y ? "20+ JAHRE" : "<20 JAHRE"} />
              <StatusPill pass={rv.rolling_wf_pass} label={rv.rolling_wf_pass ? "RWF PASS" : "RWF FAIL"} />
              <StatusPill pass={rv.param_robust} label={rv.param_robust ? "ROBUST" : "FRAGIL"} />
              <StatusPill pass={!rv.outlier_concern} label={rv.outlier_concern ? "OUTLIER" : "CLEAN"} />
              <StatusPill pass={rv.profitable_without_best} label={rv.profitable_without_best ? "OHNE BEST OK" : "BEST-ABHÄNGIG"} />
              <StatusPill pass={rv.profitable_without_top2} label={rv.profitable_without_top2 ? "OHNE TOP2 OK" : "TOP2-ABHÄNGIG"} />
            </div>
            {rv.issues.length > 0 && (
              <div style={{ marginTop: 8, fontSize: 10, color: C_WARN, fontStyle: "italic" }}>
                {rv.issues.join(", ")}
              </div>
            )}
          </div>
        );
      })()}

      {/* ── B) BACKTRADER VALIDATION — 7 Tests ── */}
      {detail && (
        <div style={{ ...CARD, flexShrink: 0 }}>
          <SectionLabel>Backtrader Validation — 7 Tests</SectionLabel>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10, fontFamily: FONT }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C_BORDER}` }}>
                {["Test", "Ergebnis", "Status"].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "4px 6px", fontSize: 8, fontWeight: 700, color: "#7c8798", textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { test: "Walk-Forward (streng)", value: `${detail.t1_wf_strict.wf_strict_pct.toFixed(1)}%`, pass: detail.t1_wf_strict.pass },
                { test: "Bonferroni Korrektur", value: detail.t2_bonferroni.significant ? `p=${detail.t2_bonferroni.p_bonferroni.toFixed(3)}` : `p=${detail.t2_bonferroni.p_raw.toFixed(3)}`, pass: detail.t2_bonferroni.significant, label: detail.t2_bonferroni.significant ? "SIGNIFIKANT" : "FAIL" },
                { test: "Parameter-Stabilität", value: `${detail.t3_stability.stability_pct.toFixed(0)}%`, pass: detail.t3_stability.pass, label: detail.t3_stability.robust ? "ROBUST" : "FAIL" },
                { test: "Dekaden-Stabilität", value: `${detail.t6_decades.decades_profitable}/${detail.t6_decades.total}`, pass: detail.t6_decades.pass },
                { test: "Forward Test 2023-26", value: `Sharpe ${detail.t7_forward.sharpe >= 0 ? "+" : ""}${detail.t7_forward.sharpe.toFixed(2)}`, pass: detail.t7_forward.pass },
                { test: "Kosten-Sensitivität", value: `BE ${detail.t5_costs.break_even_range}`, pass: detail.t5_costs.pass },
                { test: "Regime-Abhängigkeit", value: `${detail.t4_regime.regimes_positive}/${detail.t4_regime.total_regimes}`, pass: detail.t4_regime.pass },
              ].map(r => (
                <tr key={r.test} style={{ borderBottom: `1px solid rgba(255,255,255,0.03)` }}>
                  <td style={{ padding: "5px 6px", color: C_WHITE, fontWeight: 600 }}>{r.test}</td>
                  <td style={{ padding: "5px 6px", color: C_TEXT2, fontVariantNumeric: "tabular-nums" }}>{r.value}</td>
                  <td style={{ padding: "5px 6px" }}><StatusPill pass={r.pass} label={r.label} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── C) EQUITY CURVE (fold PnL as cumulative line) ── */}
      {detail && detail.t1_wf_strict.fold_details.length > 0 && (() => {
        const folds = detail.t1_wf_strict.fold_details;
        const eq: number[] = [0];
        for (const f of folds) eq.push(eq[eq.length - 1] + f.pnl);
        const max = Math.max(...eq.map(Math.abs), 1);
        const W = 400; const H = 60;
        const pts = eq.map((v, i) => {
          const x = (i / (eq.length - 1)) * W;
          const y = H / 2 - (v / max) * (H / 2 - 4);
          return `${x.toFixed(1)},${y.toFixed(1)}`;
        }).join(" ");
        const fillId = `eq-detail-${p.id}`;
        return (
          <div style={{ ...CARD, flexShrink: 0 }}>
            <SectionLabel>Walk-Forward Equity (OOS Folds)</SectionLabel>
            <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: "block" }}>
              <defs>
                <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(232,237,243,0.14)" />
                  <stop offset="100%" stopColor="rgba(232,237,243,0.01)" />
                </linearGradient>
              </defs>
              <line x1={0} y1={H / 2} x2={W} y2={H / 2} stroke="rgba(255,255,255,0.08)" strokeWidth={0.5} strokeDasharray="3 5" />
              <polygon points={`0,${H / 2} ${pts} ${W},${H / 2}`} fill={`url(#${fillId})`} />
              <polyline points={pts} fill="none" stroke="#e8edf3" strokeWidth={1.6} strokeLinejoin="round" />
            </svg>
          </div>
        );
      })()}

      {/* ── D) WALK-FORWARD FOLDS ── */}
      {detail && (
        <div style={{ ...CARD, flexShrink: 0 }}>
          <SectionLabel>Walk-Forward Folds ({detail.t1_wf_strict.positive_folds}/{detail.t1_wf_strict.folds} positiv)</SectionLabel>
          <div style={{ maxHeight: 160, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9, fontFamily: FONT }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C_BORDER}` }}>
                  {["Fold", "OOS Periode", "Sharpe", "PnL", "Trades", ""].map(h => (
                    <th key={h} style={{ textAlign: "left", padding: "3px 4px", fontSize: 7, fontWeight: 700, color: "#7c8798", textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {detail.t1_wf_strict.fold_details.map((f, i) => {
                  const pos = f.positive === true;
                  return (
                    <tr key={i} style={{ borderBottom: `1px solid rgba(255,255,255,0.03)` }}>
                      <td style={{ padding: "3px 4px", color: C_TEXT3, fontVariantNumeric: "tabular-nums" }}>{i + 1}</td>
                      <td style={{ padding: "3px 4px", color: C_TEXT2 }}>{f.oos_start.slice(0, 4)}–{f.oos_end.slice(0, 4)}</td>
                      <td style={{ padding: "3px 4px", color: pos ? C_PASS : C_FAIL, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{f.sharpe >= 0 ? "+" : ""}{f.sharpe.toFixed(2)}</td>
                      <td style={{ padding: "3px 4px", color: pos ? C_WHITE : C_FAIL, fontVariantNumeric: "tabular-nums" }}>{f.pnl >= 0 ? "+" : ""}{(f.pnl / 1000).toFixed(1)}k</td>
                      <td style={{ padding: "3px 4px", color: C_TEXT3 }}>{f.trades}</td>
                      <td style={{ padding: "3px 4px" }}><span style={{ fontSize: 8, color: pos ? C_PASS : C_FAIL }}>{pos ? "●" : "●"}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── E) REGIME / STRESS TESTS ── */}
      {detail && (
        <div style={{ ...CARD, flexShrink: 0 }}>
          <SectionLabel>Regime-Abhängigkeit ({detail.t4_regime.regimes_positive}/{detail.t4_regime.total_regimes} positiv)</SectionLabel>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9, fontFamily: FONT }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C_BORDER}` }}>
                {["Regime", "Sharpe", "PnL", "Trades", ""].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "3px 4px", fontSize: 7, fontWeight: 700, color: "#7c8798", textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(detail.t4_regime.regimes).map(([regime, rd]) => {
                const label: Record<string, string> = { high_vol: "High Vol", low_vol: "Low Vol", trend_up: "Trend Up", trend_down: "Trend Down" };
                return (
                  <tr key={regime} style={{ borderBottom: `1px solid rgba(255,255,255,0.03)` }}>
                    <td style={{ padding: "3px 4px", color: C_WHITE, fontWeight: 600 }}>{label[regime] ?? regime}</td>
                    <td style={{ padding: "3px 4px", color: rd.positive ? C_PASS : C_FAIL, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{rd.sharpe.toFixed(2)}</td>
                    <td style={{ padding: "3px 4px", color: C_TEXT2, fontVariantNumeric: "tabular-nums" }}>{rd.trades > 0 ? `${(rd.pnl / 1000).toFixed(1)}k` : "—"}</td>
                    <td style={{ padding: "3px 4px", color: C_TEXT3 }}>{rd.trades}</td>
                    <td style={{ padding: "3px 4px" }}><StatusPill pass={rd.positive} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── F) DEKADEN-STABILITÄT ── */}
      {detail && (
        <div style={{ ...CARD, flexShrink: 0 }}>
          <SectionLabel>Dekaden-Stabilität ({detail.t6_decades.decades_profitable}/{detail.t6_decades.total})</SectionLabel>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9, fontFamily: FONT }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C_BORDER}` }}>
                {["Periode", "Sharpe", "WR", "PnL", "Trades", ""].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "3px 4px", fontSize: 7, fontWeight: 700, color: "#7c8798", textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(detail.t6_decades.decades).map(([period, dd]) => (
                <tr key={period} style={{ borderBottom: `1px solid rgba(255,255,255,0.03)` }}>
                  <td style={{ padding: "3px 4px", color: C_WHITE, fontWeight: 600 }}>{period}</td>
                  <td style={{ padding: "3px 4px", color: dd.profitable ? C_PASS : C_FAIL, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{dd.sharpe.toFixed(2)}</td>
                  <td style={{ padding: "3px 4px", color: C_TEXT2, fontVariantNumeric: "tabular-nums" }}>{dd.win_rate.toFixed(0)}%</td>
                  <td style={{ padding: "3px 4px", color: C_TEXT2, fontVariantNumeric: "tabular-nums" }}>{(dd.pnl / 1000).toFixed(1)}k</td>
                  <td style={{ padding: "3px 4px", color: C_TEXT3 }}>{dd.trades}</td>
                  <td style={{ padding: "3px 4px" }}><StatusPill pass={dd.profitable} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── G) KOSTEN-ANALYSE ── */}
      {detail && (
        <div style={{ ...CARD, flexShrink: 0 }}>
          <SectionLabel>Kosten-Sensitivität (Break-Even: {detail.t5_costs.break_even_range})</SectionLabel>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9, fontFamily: FONT }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C_BORDER}` }}>
                {["Kosten", "Sharpe", "PnL", ""].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "3px 4px", fontSize: 7, fontWeight: 700, color: "#7c8798", textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(detail.t5_costs.cost_levels).map(([level, cl]) => (
                <tr key={level} style={{ borderBottom: `1px solid rgba(255,255,255,0.03)` }}>
                  <td style={{ padding: "3px 4px", color: C_WHITE, fontWeight: 600 }}>{level}</td>
                  <td style={{ padding: "3px 4px", color: cl.profitable ? C_WHITE : C_FAIL, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{cl.sharpe.toFixed(2)}</td>
                  <td style={{ padding: "3px 4px", color: C_TEXT2, fontVariantNumeric: "tabular-nums" }}>{(cl.pnl / 1000).toFixed(0)}k</td>
                  <td style={{ padding: "3px 4px" }}><StatusPill pass={cl.profitable} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── FORWARD TEST ── */}
      {detail && (
        <div style={{ ...CARD, flexShrink: 0 }}>
          <SectionLabel>Forward Test 2023–2026</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
            {[
              { label: "Sharpe", value: detail.t7_forward.sharpe.toFixed(2), color: detail.t7_forward.pass ? C_PASS : C_FAIL },
              { label: "Win Rate", value: `${detail.t7_forward.win_rate.toFixed(0)}%`, color: detail.t7_forward.win_rate >= 50 ? C_WHITE : C_FAIL },
              { label: "PnL", value: `${(detail.t7_forward.pnl / 1000).toFixed(1)}k`, color: detail.t7_forward.pnl >= 0 ? C_WHITE : C_FAIL },
              { label: "Profit Factor", value: detail.t7_forward.profit_factor.toFixed(2), color: detail.t7_forward.profit_factor >= 1 ? C_WHITE : C_FAIL },
            ].map(k => (
              <div key={k.label}>
                <div style={{ fontSize: 7, color: C_TEXT3, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 3 }}>{k.label}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: k.color, fontFamily: FONT, fontVariantNumeric: "tabular-nums" }}>{k.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── BONFERRONI DETAIL ── */}
      {detail && (
        <div style={{ ...CARD, flexShrink: 0 }}>
          <SectionLabel>Bonferroni Korrektur (500 Random-Entry Sims)</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            {[
              { label: "Real Sharpe", value: detail.t2_bonferroni.real_sharpe.toFixed(2), color: C_SCORE },
              { label: "Random Ø", value: detail.t2_bonferroni.random_sharpe_mean.toFixed(2), color: C_TEXT2 },
              { label: "p (Bonf.)", value: detail.t2_bonferroni.p_bonferroni.toFixed(3), color: detail.t2_bonferroni.significant ? C_PASS : C_FAIL },
            ].map(k => (
              <div key={k.label}>
                <div style={{ fontSize: 7, color: C_TEXT3, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 3 }}>{k.label}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: k.color, fontFamily: FONT, fontVariantNumeric: "tabular-nums" }}>{k.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── PARAMETER-STABILITÄT ── */}
      {detail && (
        <div style={{ ...CARD, flexShrink: 0 }}>
          <SectionLabel>Parameter-Stabilität ({detail.t3_stability.positive_variants}/{detail.t3_stability.n_variants} positiv — {detail.t3_stability.stability_pct.toFixed(0)}%)</SectionLabel>
          <div style={{ fontSize: 10, color: C_TEXT2, lineHeight: 1.6 }}>
            Entry ±1–3 Tage × Hold ±2,5 Tage → {detail.t3_stability.n_variants} Varianten getestet.
            <span style={{ color: detail.t3_stability.robust ? C_PASS : C_FAIL, fontWeight: 700 }}>
              {" "}{detail.t3_stability.robust ? "Robust — Edge ist nicht parameter-abhängig." : "Fragil — Edge hängt von exakten Parametern ab."}
            </span>
          </div>
        </div>
      )}

      {/* Fallback if no deep detail available */}
      {!detail && (
        <>
          <div style={{ ...CARD, flexShrink: 0 }}>
            <SectionLabel>Basis-Kennzahlen</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
              {[
                { label: "Win Rate", value: `${(p.winRate * 100).toFixed(0)}%`, color: C_WHITE },
                { label: "Profit Factor", value: p.profitFactor.toFixed(1), color: C_WHITE },
                { label: "Max DD", value: `${(p.maxDrawdown * 100).toFixed(0)}%`, color: C_TEXT2 },
                { label: "Trades", value: String(p.nObs), color: C_TEXT2 },
              ].map(k => (
                <div key={k.label}>
                  <div style={{ fontSize: 7, color: C_TEXT3, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 3 }}>{k.label}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: k.color, fontFamily: FONT }}>{k.value}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ ...CARD, flex: 1, minHeight: 50, display: "flex", flexDirection: "column" }}>
            <SectionLabel>Trade-Verlauf (illustrativ)</SectionLabel>
            <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center" }}>
              <ReturnBars returns={p.fakeReturns} width={280} height={54} />
            </div>
          </div>
        </>
      )}
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
      background: "rgba(12,14,18,0.92)",
      border: "1px solid rgba(232,237,244,0.12)",
      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)",
      backdropFilter: "blur(8px)",
      borderRadius: 10, padding: "10px 14px",
      display: "flex", flexDirection: "column", justifyContent: "space-between",
      fontFamily: FONT,
    }}>
      <div style={{ fontSize: 8, fontWeight: 700, color: "#7c8798", textTransform: "uppercase" as const, letterSpacing: "0.10em", marginBottom: 6 }}>{label}</div>
      <div>
        <div style={{ fontSize: 20, fontWeight: 800, color: valueColor, lineHeight: 1, letterSpacing: "-0.3px", fontVariantNumeric: "tabular-nums" }}>{value}</div>
        <div style={{ fontSize: 8, color: "rgba(255,255,255,0.28)", marginTop: 4 }}>{sub}</div>
      </div>
    </div>
  );
}

/* ─── Portfolio view ────────────────────────────────────────────────── */
function PortfolioView() {
  const patterns = SLEEVE_PATTERNS;
  const avgWr    = patterns.reduce((s, p) => s + p.winRate, 0) / patterns.length;
  const avgOos   = patterns.reduce((s, p) => s + p.oosWinRate, 0) / patterns.length;
  const avgSort  = patterns.reduce((s, p) => s + p.sortino, 0) / patterns.length;
  const total    = patterns.reduce((s, p) => s + p.nObs, 0);
  const bon      = patterns.filter(p => p.tier === "bonferroni").length;
  const equity   = useMemo(() => buildPortfolioEquity(), []);
  const finalRet = (equity[equity.length - 1] / equity[0] - 1) * 100;
  let pk = equity[0]; let maxDd = 0;
  for (const v of equity) { if (v > pk) pk = v; const dd = (v / pk) - 1; if (dd < maxDd) maxDd = dd; }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1, minHeight: 0, overflow: "hidden" }}>
      {/* KPI strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, flexShrink: 0 }}>
        <KpiBox label="Muster"         value={`${patterns.length}`}                              sub={`${bon} Bonferroni`} />
        <KpiBox label="Ø IS Win Rate"  value={`${(avgWr * 100).toFixed(1)}%`}                   sub="In-Sample" />
        <KpiBox label="Ø OOS Win Rate" value={`${(avgOos * 100).toFixed(1)}%`}                  sub="Out-of-Sample" />
        <KpiBox label="Ø Sortino"      value={avgSort.toFixed(2)}                               sub="Risikoadjustiert" />
        <KpiBox label="Gesamt n"       value={`${total}`}                                        sub="Hist. Trades" />
        <KpiBox label="Portfolio Ret." value={`${finalRet >= 0 ? "+" : ""}${finalRet.toFixed(1)}%`} sub="Illustrativ" valueColor={finalRet >= 0 ? "#eef2f7" : C_GOLD} />
        <KpiBox label="Max Drawdown"   value={`${(maxDd * 100).toFixed(1)}%`}                   sub="Portfolio" valueColor={C_GOLD} />
      </div>

      {/* Charts + list */}
      <div style={{ display: "flex", gap: 8, flex: 1, minHeight: 0 }}>
        <div style={{ flex: 2, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ background: C_CARD, border: `1px solid ${C_BORDER}`, borderRadius: 10, padding: "10px 12px", flex: 3, minHeight: 0, display: "flex", flexDirection: "column" }}>
            <div style={{ flex: 1, minHeight: 0 }}>
              <EquityLine equity={equity} width={600} height={100} />
            </div>
          </div>
          <div style={{ background: C_CARD, border: `1px solid ${C_BORDER}`, borderRadius: 10, padding: "8px 12px", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            <div style={{ flex: 1, minHeight: 0 }}>
              <DrawdownLine equity={equity} width={600} height={44} />
            </div>
          </div>
        </div>

        {/* Muster list */}
        <div style={{ flex: 1, minWidth: 0, background: C_CARD, border: `1px solid ${C_BORDER}`, borderRadius: 10, padding: "10px 12px", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ fontSize: 7.5, color: C_TEXT3, textTransform: "uppercase" as const, letterSpacing: "0.07em", marginBottom: 8, flexShrink: 0 }}>Muster-Übersicht</div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {patterns.map(p => {
              const dirC = p.direction === "LONG" ? "rgba(232,234,239,0.55)" : C_GOLD;
              return (
                <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6, paddingBottom: 5, borderBottom: `1px solid rgba(255,255,255,0.04)` }}>
                  <div style={{ width: 5, height: 5, borderRadius: "50%", background: dirC, flexShrink: 0 }} />
                  <span style={{ fontSize: 9.5, fontWeight: 800, color: C_WHITE, width: 32, flexShrink: 0, letterSpacing: "0.01em" }}>{p.symbol.replace("1!", "")}</span>
                  <ReturnBars returns={p.fakeReturns.slice(0, 12)} width={68} height={16} />
                  <span style={{ fontSize: 7.5, color: C_TEXT3, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.window}</span>
                  <span style={{ fontSize: 9, fontWeight: 700, color: C_TEXT2, flexShrink: 0 }}>{(p.oosWinRate * 100).toFixed(0)}%</span>
                </div>
              );
            })}
            <div style={{ fontSize: 7, color: C_TEXT3, marginTop: 4 }}>Illustrativ · IS-Kennzahlen</div>
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
  onSelectPattern?: (assetId: string, startSlot: number, direction: "LONG" | "SHORT", holdingDays?: number) => void;
}

export function SleevePortfolioPanel({ mode, onModeChange, onSelectPattern }: Props) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(true);
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
        const base = [...LIVE_PATTERNS].sort((a, b) => {
          const today = todayCalendarDay();
          const dA = ((a.calStart - today) + 365) % 365;
          const dB = ((b.calStart - today) + 365) % 365;
          return dA - dB;
        });
        const sorted = showAll ? base : base.filter(p => {
          const ls = p.validationId ? LIVE_STATUS[p.validationId] : undefined;
          return !ls || ls.tier <= 2;
        });
        const nextSignal = base.find(p => {
          const ls = p.validationId ? LIVE_STATUS[p.validationId] : undefined;
          return ls && ls.tier <= 2;
        });
        const nextDays = nextSignal ? ((nextSignal.calStart - todayCalendarDay()) + 365) % 365 : null;
        const decCluster = base.filter(p => {
          const m = p.validationId?.match(/_(\d{2})\d{2}_/);
          return m && parseInt(m[1]) === 12;
        });

        return (
          <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: "auto" }}>
            {/* Top bar: Nächstes Signal + Toggle */}
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "8px 14px 0", flexShrink: 0, flexWrap: "wrap",
            }}>
              {nextSignal && nextDays != null && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 7, flex: 1,
                  background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.15)",
                  borderRadius: 7, padding: "5px 10px",
                }}>
                  <span style={{ fontSize: 8, fontWeight: 700, color: "#7c8798", textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>Nächstes Signal</span>
                  <span style={{ fontSize: 12, fontWeight: 900, color: "#22C55E" }}>{nextSignal.symbol.replace("1!", "!")}</span>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.50)" }}>{nextSignal.window}</span>
                  <span style={{ fontSize: 11, fontWeight: 800, color: nextDays === 0 ? "#22C55E" : C_GOLD }}>
                    {nextDays === 0 ? "Heute" : `in ${nextDays} Tagen`}
                  </span>
                </div>
              )}
              <button type="button" onClick={() => setShowAll(v => !v)} style={{
                padding: "4px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.12)",
                background: showAll ? "rgba(216,188,103,0.10)" : "transparent",
                color: showAll ? C_GOLD : "rgba(255,255,255,0.40)",
                fontSize: 9, fontWeight: 700, cursor: "pointer", letterSpacing: "0.05em",
                fontFamily: FONT, flexShrink: 0,
              }}>
                {showAll ? "Alle" : "Nur Live"}
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gridAutoRows: "1fr", gap: 12, padding: "10px 14px 8px", flex: 1 }}>
              {sorted.map(p => (
                <SleeveCard key={p.id} p={p} selected={selectedId === p.id}
                  onActivate={() => activatePattern(p)}
                  onDetail={() => openDetail(p)}
                />
              ))}
            </div>

            {/* Dezember-Cluster Warnung */}
            {decCluster.length >= 3 && (
              <div style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "5px 14px", margin: "0 14px 2px",
                background: "rgba(245,158,11,0.05)", border: "1px solid rgba(245,158,11,0.14)",
                borderRadius: 6, fontFamily: FONT, flexShrink: 0,
              }}>
                <span style={{ fontSize: 10, color: "#F59E0B" }}>
                  ⚠ {decCluster.length} Signale gleichzeitig im Dezember — Positionsgröße halbieren
                </span>
              </div>
            )}

            {/* Q4-Bias Hinweis */}
            <div style={{ padding: "3px 14px 8px", fontFamily: FONT, flexShrink: 0, textAlign: "center" }}>
              <span style={{ fontSize: 9, color: "rgba(255,255,255,0.22)" }}>
                70% der Muster im Q4 — Kapitalallokation beachten
              </span>
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
