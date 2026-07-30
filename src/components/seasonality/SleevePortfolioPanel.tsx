"use client";

import { useMemo, useState } from "react";

/* ─── Design tokens — SignalCard / terminal exact ───────────────────── */
const C_WHITE  = "#ffffff";
const C_TEXT2  = "rgba(255,255,255,0.55)";
const C_TEXT3  = "rgba(255,255,255,0.28)";
const C_GOLD   = "#d8bc67";
const C_RED    = "#ef4444";
const C_GREEN  = "#22c55e";
const C_CARD   = "#111318";
const C_BORDER = "rgba(255,255,255,0.08)";
const C_HOVER  = "rgba(255,255,255,0.04)";
const FONT     = "Montserrat, Segoe UI, sans-serif";

/* ─── Pattern data ──────────────────────────────────────────────────── */
export interface SleevePattern {
  id: number;
  assetId: string;
  symbol: string;
  name: string;
  direction: "LONG" | "SHORT";
  window: string;
  startSlot: number;
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
}

function makeFakeReturns(wr: number, avg: number, n = 32): number[] {
  const out: number[] = [];
  let seed = Math.floor(wr * 1000 + avg * 10000) | 0;
  for (let i = 0; i < n; i++) {
    seed = (seed * 1664525 + 1013904223) & 0x7fffffff;
    const r1 = seed / 0x7fffffff;
    seed = (seed * 1664525 + 1013904223) & 0x7fffffff;
    const r2 = seed / 0x7fffffff;
    const hit = r1 < wr;
    const mag = 0.4 + r2 * 1.2;
    out.push(hit ? avg * mag : -avg * (0.9 + r2 * 1.8));
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

export const SLEEVE_PATTERNS: SleevePattern[] = [
  { id: 1,  assetId: "rb1",     symbol: "RB1!",  name: "RBOB Gasoline",   direction: "LONG", window: "Feb 8–16",        startSlot: 29,  tier: "bonferroni", winRate: 0.86, oosWinRate: 1.00, avgReturn: 0.024, sortino: 3.2, nObs: 29, maxDrawdown: -0.08, profitFactor: 5.1, robustness: 0.72, decadeConsistent: true,  category: "Energie", rationale: "Pre-summer driving season baut RFG-Nachfrage auf. Raffinerie-Wartung + Spec-Positioning treiben die Feb-Rally.", fakeReturns: makeFakeReturns(0.86, 0.024) },
  { id: 2,  assetId: "wheat",   symbol: "ZW1!",  name: "Chicago Wheat",   direction: "LONG", window: "Aug 10–20",       startSlot: 152, tier: "bonferroni", winRate: 0.84, oosWinRate: 0.75, avgReturn: 0.018, sortino: 2.8, nObs: 32, maxDrawdown: -0.06, profitFactor: 4.3, robustness: 0.68, decadeConsistent: true,  category: "Agrar",   rationale: "Northern-hemisphere Erntedruck lässt nach. Southern-hemisphere Pflanzungsunsicherheit fügt Risikoprämie hinzu.", fakeReturns: makeFakeReturns(0.84, 0.018) },
  { id: 3,  assetId: "gc1",     symbol: "GC1!",  name: "Gold",            direction: "LONG", window: "Jul letzt. 5 HT", startSlot: 128, tier: "fdr",        winRate: 0.78, oosWinRate: 0.72, avgReturn: 0.012, sortino: 2.1, nObs: 35, maxDrawdown: -0.05, profitFactor: 3.1, robustness: 0.58, decadeConsistent: true,  category: "Metalle", rationale: "Pre-India wedding season demand ramp. Physische Käufer akkumulieren vor der August-Bewegung.", fakeReturns: makeFakeReturns(0.78, 0.012) },
  { id: 4,  assetId: "ng1",     symbol: "NG1!",  name: "Natural Gas",     direction: "LONG", window: "Sep H2",          startSlot: 170, tier: "fdr",        winRate: 0.76, oosWinRate: 0.71, avgReturn: 0.021, sortino: 2.4, nObs: 28, maxDrawdown: -0.10, profitFactor: 3.6, robustness: 0.55, decadeConsistent: true,  category: "Energie", rationale: "Pre-winter storage injection season. Heating-demand Spec-Positioning beschleunigt sich spät-September.", fakeReturns: makeFakeReturns(0.76, 0.021) },
  { id: 5,  assetId: "sugar",   symbol: "SB1!",  name: "Sugar #11",       direction: "LONG", window: "Sep H2",          startSlot: 172, tier: "fdr",        winRate: 0.75, oosWinRate: 0.70, avgReturn: 0.016, sortino: 1.9, nObs: 30, maxDrawdown: -0.07, profitFactor: 2.8, robustness: 0.52, decadeConsistent: true,  category: "Agrar",   rationale: "Northern-hemisphere Crushing-Season endet. Brasilianische Export-Logistik eingeschränkt.", fakeReturns: makeFakeReturns(0.75, 0.016) },
  { id: 6,  assetId: "cocoa",   symbol: "CC1!",  name: "Cocoa",           direction: "LONG", window: "Nov 5–15",        startSlot: 210, tier: "fdr",        winRate: 0.74, oosWinRate: 0.70, avgReturn: 0.019, sortino: 2.2, nObs: 27, maxDrawdown: -0.09, profitFactor: 3.0, robustness: 0.53, decadeConsistent: true,  category: "Agrar",   rationale: "West African main crop arrival delays + pre-holiday chocolate demand surge.", fakeReturns: makeFakeReturns(0.74, 0.019) },
  { id: 7,  assetId: "pa1",     symbol: "PA1!",  name: "Palladium",       direction: "LONG", window: "Jan OpEx",        startSlot: 10,  tier: "fdr",        winRate: 0.77, oosWinRate: 0.71, avgReturn: 0.022, sortino: 2.3, nObs: 24, maxDrawdown: -0.08, profitFactor: 3.4, robustness: 0.60, decadeConsistent: true,  category: "Metalle", rationale: "Auto-catalyst restocking nach Jahresende. Russische Supply-Unsicherheit + dünne Liquidität.", fakeReturns: makeFakeReturns(0.77, 0.022) },
  { id: 8,  assetId: "soymeal", symbol: "ZM1!",  name: "Soybean Meal",   direction: "LONG", window: "Apr 15–25",       startSlot: 73,  tier: "fdr",        winRate: 0.73, oosWinRate: 0.69, avgReturn: 0.014, sortino: 1.8, nObs: 31, maxDrawdown: -0.06, profitFactor: 2.5, robustness: 0.51, decadeConsistent: true,  category: "Agrar",   rationale: "US spring crush margin rally + South American export competition lässt nach.", fakeReturns: makeFakeReturns(0.73, 0.014) },
  { id: 9,  assetId: "cotton",  symbol: "CT1!",  name: "Cotton #2",       direction: "LONG", window: "Feb 8–16",        startSlot: 29,  tier: "fdr",        winRate: 0.72, oosWinRate: 0.68, avgReturn: 0.013, sortino: 1.7, nObs: 28, maxDrawdown: -0.07, profitFactor: 2.4, robustness: 0.49, decadeConsistent: true,  category: "Agrar",   rationale: "Export sales pace beschleunigt nach USDA Feb Supply/Demand Report.", fakeReturns: makeFakeReturns(0.72, 0.013) },
  { id: 10, assetId: "es1",     symbol: "ES1!",  name: "S&P 500 E-mini",  direction: "LONG", window: "Dez 15–25",       startSlot: 240, tier: "fdr",        winRate: 0.80, oosWinRate: 0.75, avgReturn: 0.015, sortino: 2.5, nObs: 36, maxDrawdown: -0.04, profitFactor: 3.8, robustness: 0.65, decadeConsistent: true,  category: "Indizes", rationale: "Santa Claus Rally: Pension fund rebalancing, tax-loss selling exhaustion.", fakeReturns: makeFakeReturns(0.80, 0.015) },
];

/* ─── Cumulative equity card-line — positive=white, negative=gold ────── */
function CardEquityLine({ returns: rets, id }: { returns: number[]; id: string }) {
  const eq: number[] = [0];
  for (const r of rets) eq.push(eq[eq.length - 1] + r * 100);
  const W = 300; const H = 56;
  const pad = 4;
  const min = Math.min(...eq); const max = Math.max(...eq);
  const rng = max - min || 0.1;
  const pts = eq.map((v, i) => {
    const x = (i / (eq.length - 1)) * W;
    const y = H - pad - ((v - min) / rng) * (H - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const last = eq[eq.length - 1];
  // positive = white, negative = gold — never red
  const lineC = last >= 0 ? "#e8edf3" : "#d6b867";
  const fillC = last >= 0 ? "rgba(232,237,243,0.13)" : "rgba(214,184,103,0.12)";
  const fillId = `cf-${id}`;
  const lastX = W;
  const lastY = H - pad - ((last - min) / rng) * (H - pad * 2);
  const base  = H - pad - ((0 - min) / rng) * (H - pad * 2);
  const clampedBase = Math.min(H - pad, Math.max(pad, base));
  const pctLabel = `${last >= 0 ? "+" : ""}${last.toFixed(1)}%`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: "block" }}>
      <defs>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={lineC} stopOpacity="0.18" />
          <stop offset="100%" stopColor={lineC} stopOpacity="0.00" />
        </linearGradient>
      </defs>
      {/* Grid lines */}
      {[0.25, 0.5, 0.75].map(f => (
        <line key={f} x1={0} y1={H - pad - f * (H - pad * 2)} x2={W} y2={H - pad - f * (H - pad * 2)}
          stroke="rgba(255,255,255,0.04)" strokeWidth={0.5} />
      ))}
      {/* Zero baseline */}
      <line x1={0} y1={clampedBase} x2={W} y2={clampedBase} stroke="rgba(255,255,255,0.10)" strokeWidth={0.5} strokeDasharray="3 4" />
      {/* Area fill */}
      <polygon points={`0,${clampedBase} ${pts} ${W},${clampedBase}`} fill={`url(#${fillId})`} />
      {/* Line */}
      <polyline points={pts} fill="none" stroke={lineC} strokeWidth={1.6} strokeLinejoin="round" />
      {/* Endpoint dot */}
      <circle cx={lastX} cy={lastY} r={3} fill={lineC} />
      {/* P&L label */}
      <text x={W - 2} y={lastY - 5} textAnchor="end" fill={lineC}
        fontSize={10} fontWeight="700" fontFamily={FONT}>{pctLabel}</text>
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

/* ─── Grid card — SignalCard structure, Monitoring Tester stats ──────── */
function SleeveCard({ p, selected, onSelect }: { p: SleevePattern; selected: boolean; onSelect: () => void }) {
  const isLong   = p.direction === "LONG";
  const dirColor = isLong ? "#e8edf3" : C_GOLD; // positive=white, negative=gold

  const cardBg = selected
    ? `radial-gradient(ellipse 120% 90% at 115% 120%, rgba(216,188,103,0.14) 0%, transparent 55%), ${C_CARD}`
    : C_CARD;

  return (
    <div
      role="button" tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelect(); }}
      style={{
        background: cardBg,
        border: selected ? "1px solid rgba(216,188,103,0.32)" : `1px solid ${C_BORDER}`,
        borderRadius: 12,
        padding: "14px 14px 12px",
        display: "flex", flexDirection: "column", gap: 0,
        cursor: "pointer", outline: "none",
        transition: "border-color 120ms",
        height: "100%", boxSizing: "border-box" as const,
        fontFamily: FONT, overflow: "hidden",
        boxShadow: `inset 3px 0 0 ${dirColor}`,
      }}
    >
      {/* ── Row 1: Icon · Symbol/Name · Win-Rate chip (= SignalCard Row 1) ── */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
        <SymbolIcon symbol={p.symbol} dir={p.direction} size={40} />
        <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: "#fff", letterSpacing: "0.01em", lineHeight: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {p.symbol.replace("1!", "")}
          </div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.30)", lineHeight: 1, marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {p.name}
          </div>
        </div>
        {/* IS Win Rate chip — bold top-right, white or gold */}
        <div style={{ flexShrink: 0, textAlign: "right", paddingTop: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: dirColor, letterSpacing: "-0.02em", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
            {(p.winRate * 100).toFixed(0)}%
          </div>
          <div style={{ fontSize: 8, color: "rgba(255,255,255,0.28)", marginTop: 2 }}>IS WR</div>
        </div>
      </div>

      {/* ── Row 2: Window · Tier (= SignalCard strategy/date row) ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6, marginBottom: 10 }}>
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.28)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>
          {p.window}
        </span>
        <TierBadge tier={p.tier} />
      </div>

      {/* ── Row 3: Equity line chart — taller, Monitoring Tester style ── */}
      <div style={{ flex: 1, minHeight: 0, marginBottom: 10 }}>
        <CardEquityLine returns={p.fakeReturns} id={`p${p.id}`} />
      </div>

      {/* ── Row 4: OOS WR · Sortino · Robust · n — KPI micro-grid ── */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 4,
        marginBottom: 10, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 8,
      }}>
        {[
          { label: "OOS WR",  value: `${(p.oosWinRate * 100).toFixed(0)}%` },
          { label: "Sortino", value: p.sortino.toFixed(1) },
          { label: "Robust",  value: `${(p.robustness * 100).toFixed(0)}%` },
          { label: "n",       value: String(p.nObs) },
        ].map(s => (
          <div key={s.label} style={{
            background: "rgba(255,255,255,0.03)", borderRadius: 6,
            border: "1px solid rgba(255,255,255,0.06)", padding: "4px 6px",
          }}>
            <div style={{ fontSize: 7, color: "#7c8798", textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 2 }}>{s.label}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#eef2f7", fontVariantNumeric: "tabular-nums" }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* ── Row 5: Direction chip (= SignalCard Row 4) ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13, fontWeight: 900, letterSpacing: "0.06em", color: dirColor, lineHeight: 1 }}>
          <span style={{ fontSize: 10 }}>{isLong ? "▲" : "▼"}</span>
          {p.direction}
        </span>
        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.18)" }}>{p.category}</span>
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

/* ─── Detail panel ──────────────────────────────────────────────────── */
function DetailPanel({ p, onGoToChart }: { p: SleevePattern; onGoToChart: () => void }) {
  const isLong   = p.direction === "LONG";
  const dirColor = isLong ? "rgba(232,234,239,0.80)" : C_GOLD;

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
            </div>
            <div style={{ fontSize: 10, color: C_TEXT2 }}>{p.name} · {p.window}</div>
            <div style={{ fontSize: 8, color: C_TEXT3, marginTop: 2 }}>{p.category} · {p.decadeConsistent ? "Decade-konsistent ✓" : "—"}</div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, flexShrink: 0 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 7, color: C_TEXT3, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>Sortino</div>
            <div style={{ fontSize: 26, fontWeight: 900, color: C_GOLD, letterSpacing: "-0.5px", lineHeight: 1 }}>{p.sortino.toFixed(2)}</div>
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

      {/* KPI grids */}
      {[
        [
          { label: "IS Win Rate",  value: `${(p.winRate * 100).toFixed(0)}%`,    color: C_WHITE },
          { label: "OOS Win Rate", value: `${(p.oosWinRate * 100).toFixed(0)}%`, color: p.oosWinRate >= 0.70 ? C_WHITE : C_TEXT2 },
          { label: "Ø Return",     value: `${p.avgReturn >= 0 ? "+" : ""}${(p.avgReturn * 100).toFixed(2)}%`, color: p.avgReturn >= 0 ? C_WHITE : C_GOLD },
          { label: "Beobacht.",    value: String(p.nObs), color: C_TEXT2 },
        ],
        [
          { label: "Robustheit",    value: `${(p.robustness * 100).toFixed(0)}%`,  color: C_TEXT2 },
          { label: "Profit Factor", value: p.profitFactor.toFixed(1),              color: C_WHITE },
          { label: "Max DD",        value: `${(p.maxDrawdown * 100).toFixed(0)}%`, color: C_TEXT2 },
          { label: "Dekaden",       value: p.decadeConsistent ? "✓ stabil" : "–",  color: p.decadeConsistent ? C_TEXT2 : C_TEXT3 },
        ],
      ].map((row, ri) => (
        <div key={ri} style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, background: "rgba(255,255,255,0.025)", borderRadius: 8, padding: "10px 12px", border: `1px solid ${C_BORDER}`, flexShrink: 0 }}>
          {row.map(s => (
            <div key={s.label}>
              <div style={{ fontSize: 7, color: C_TEXT3, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 3 }}>{s.label}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: s.color, fontFamily: FONT }}>{s.value}</div>
            </div>
          ))}
        </div>
      ))}

      {/* Charts row */}
      <div style={{ display: "flex", gap: 8, flex: 1, minHeight: 0 }}>
        <div style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${C_BORDER}`, borderRadius: 8, padding: "10px 12px", flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 7.5, color: C_TEXT3, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 8 }}>
            Trade-Verlauf (illustrativ · {p.nObs} Trades)
          </div>
          <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center" }}>
            <ReturnBars returns={p.fakeReturns} width={280} height={54} />
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
  onSelectPattern?: (assetId: string, startSlot: number, direction: "LONG" | "SHORT") => void;
}

export function SleevePortfolioPanel({ mode, onModeChange, onSelectPattern }: Props) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = useMemo(() => SLEEVE_PATTERNS.find(p => p.id === selectedId) ?? null, [selectedId]);

  function selectPattern(p: SleevePattern) {
    setSelectedId(p.id);
    onModeChange("detail");
    onSelectPattern?.(p.assetId, p.startSlot, p.direction);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, fontFamily: FONT }}>

      {mode === "grid" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 7, flex: 1, minHeight: 0, overflow: "hidden" }}>
          {SLEEVE_PATTERNS.map(p => (
            <SleeveCard key={p.id} p={p} selected={selectedId === p.id} onSelect={() => selectPattern(p)} />
          ))}
        </div>
      )}

      {mode === "detail" && (
        <div style={{ display: "flex", flex: 1, minHeight: 0, gap: 0, overflow: "hidden" }}>
          <div style={{ width: 185, flexShrink: 0, borderRight: `1px solid rgba(255,255,255,0.05)`, display: "flex", flexDirection: "column", overflowY: "auto" }}>
            {SLEEVE_PATTERNS.map(p => (
              <PatternListRow key={p.id} p={p} selected={selectedId === p.id} onSelect={() => selectPattern(p)} />
            ))}
          </div>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
            {selected
              ? <DetailPanel p={selected} onGoToChart={() => onSelectPattern?.(selected.assetId, selected.startSlot, selected.direction)} />
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
