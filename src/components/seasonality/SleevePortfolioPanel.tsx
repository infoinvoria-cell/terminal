"use client";

import { useMemo, useState } from "react";

/* ─── Design tokens — match terminal exactly ────────────────────────── */
const C_WHITE  = "#F0F3F7";
const C_GOLD   = "#DCC476";
const C_MUTED  = "#9AAAB8";
const C_DIM    = "#7A8898";
const C_DIM2   = "#5E6E80";
const C_BG     = "#060606";
const C_BORDER = "rgba(255,255,255,0.07)";
const C_HOVER  = "rgba(255,255,255,0.04)";
const C_SEL    = "rgba(255,255,255,0.07)";
const C_GREEN  = "#64DC82";
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

function makeFakeReturns(wr: number, avg: number, n = 30): number[] {
  const out: number[] = [];
  let seed = Math.floor(wr * 1000 + avg * 10000) | 0;
  for (let i = 0; i < n; i++) {
    seed = (seed * 1664525 + 1013904223) & 0x7fffffff;
    const r = (seed / 0x7fffffff) * 2 - 1;
    const hit = (seed / 0x7fffffff) < wr;
    out.push(hit ? avg * (1 + Math.abs(r) * 0.4) : -avg * (0.5 + Math.abs(r) * 0.3));
  }
  return out;
}

export const SLEEVE_PATTERNS: SleevePattern[] = [
  {
    id: 1, assetId: "rb1", symbol: "RB1!", name: "RBOB Gasoline",
    direction: "LONG", window: "Feb 8–16", startSlot: 29,
    tier: "bonferroni", winRate: 0.86, oosWinRate: 1.00,
    avgReturn: 0.024, sortino: 3.2, nObs: 29,
    maxDrawdown: -0.08, profitFactor: 5.1, robustness: 0.72, decadeConsistent: true,
    category: "Energie",
    rationale: "Pre-summer driving season baut RFG-Nachfrage auf. Raffinerie-Wartung + Spec-Positioning treiben die Feb-Rally.",
    fakeReturns: makeFakeReturns(0.86, 0.024),
  },
  {
    id: 2, assetId: "wheat", symbol: "ZW1!", name: "Chicago Wheat",
    direction: "LONG", window: "Aug 10–20", startSlot: 152,
    tier: "bonferroni", winRate: 0.84, oosWinRate: 0.75,
    avgReturn: 0.018, sortino: 2.8, nObs: 32,
    maxDrawdown: -0.06, profitFactor: 4.3, robustness: 0.68, decadeConsistent: true,
    category: "Agrar",
    rationale: "Northern-hemisphere Erntedruck lässt nach. Southern-hemisphere Pflanzungsunsicherheit fügt Risikoprämie hinzu.",
    fakeReturns: makeFakeReturns(0.84, 0.018),
  },
  {
    id: 3, assetId: "gc1", symbol: "GC1!", name: "Gold",
    direction: "LONG", window: "Jul letzt. 5 HT", startSlot: 128,
    tier: "fdr", winRate: 0.78, oosWinRate: 0.72,
    avgReturn: 0.012, sortino: 2.1, nObs: 35,
    maxDrawdown: -0.05, profitFactor: 3.1, robustness: 0.58, decadeConsistent: true,
    category: "Metalle",
    rationale: "Pre-India wedding season demand ramp. Physische Käufer akkumulieren vor der August-Bewegung.",
    fakeReturns: makeFakeReturns(0.78, 0.012),
  },
  {
    id: 4, assetId: "ng1", symbol: "NG1!", name: "Natural Gas",
    direction: "LONG", window: "Sep H2", startSlot: 170,
    tier: "fdr", winRate: 0.76, oosWinRate: 0.71,
    avgReturn: 0.021, sortino: 2.4, nObs: 28,
    maxDrawdown: -0.10, profitFactor: 3.6, robustness: 0.55, decadeConsistent: true,
    category: "Energie",
    rationale: "Pre-winter storage injection season. Heating-demand Spec-Positioning beschleunigt sich spät-September.",
    fakeReturns: makeFakeReturns(0.76, 0.021),
  },
  {
    id: 5, assetId: "sugar", symbol: "SB1!", name: "Sugar #11",
    direction: "LONG", window: "Sep H2", startSlot: 172,
    tier: "fdr", winRate: 0.75, oosWinRate: 0.70,
    avgReturn: 0.016, sortino: 1.9, nObs: 30,
    maxDrawdown: -0.07, profitFactor: 2.8, robustness: 0.52, decadeConsistent: true,
    category: "Agrar",
    rationale: "Northern-hemisphere Crushing-Season endet. Brasilianische Export-Logistik eingeschränkt. Globale Nachfrage saisonal fest.",
    fakeReturns: makeFakeReturns(0.75, 0.016),
  },
  {
    id: 6, assetId: "cocoa", symbol: "CC1!", name: "Cocoa",
    direction: "LONG", window: "Nov 5–15", startSlot: 210,
    tier: "fdr", winRate: 0.74, oosWinRate: 0.70,
    avgReturn: 0.019, sortino: 2.2, nObs: 27,
    maxDrawdown: -0.09, profitFactor: 3.0, robustness: 0.53, decadeConsistent: true,
    category: "Agrar",
    rationale: "West African main crop arrival delays + pre-holiday chocolate demand surge. Saisonales Angebotstief.",
    fakeReturns: makeFakeReturns(0.74, 0.019),
  },
  {
    id: 7, assetId: "pa1", symbol: "PA1!", name: "Palladium",
    direction: "LONG", window: "Jan OpEx", startSlot: 10,
    tier: "fdr", winRate: 0.77, oosWinRate: 0.71,
    avgReturn: 0.022, sortino: 2.3, nObs: 24,
    maxDrawdown: -0.08, profitFactor: 3.4, robustness: 0.60, decadeConsistent: true,
    category: "Metalle",
    rationale: "Auto-catalyst restocking nach Jahresende. Russische Supply-Unsicherheit + dünne Post-Holiday-Liquidität.",
    fakeReturns: makeFakeReturns(0.77, 0.022),
  },
  {
    id: 8, assetId: "soymeal", symbol: "ZM1!", name: "Soybean Meal",
    direction: "LONG", window: "Apr 15–25", startSlot: 73,
    tier: "fdr", winRate: 0.73, oosWinRate: 0.69,
    avgReturn: 0.014, sortino: 1.8, nObs: 31,
    maxDrawdown: -0.06, profitFactor: 2.5, robustness: 0.51, decadeConsistent: true,
    category: "Agrar",
    rationale: "US spring crush margin rally + South American export competition lässt nach. Feed demand spec.",
    fakeReturns: makeFakeReturns(0.73, 0.014),
  },
  {
    id: 9, assetId: "cotton", symbol: "CT1!", name: "Cotton #2",
    direction: "LONG", window: "Feb 8–16", startSlot: 29,
    tier: "fdr", winRate: 0.72, oosWinRate: 0.68,
    avgReturn: 0.013, sortino: 1.7, nObs: 28,
    maxDrawdown: -0.07, profitFactor: 2.4, robustness: 0.49, decadeConsistent: true,
    category: "Agrar",
    rationale: "Export sales pace beschleunigt nach USDA Feb Supply/Demand Report. Asiatisches Textil-Restocking.",
    fakeReturns: makeFakeReturns(0.72, 0.013),
  },
  {
    id: 10, assetId: "es1", symbol: "ES1!", name: "S&P 500 E-mini",
    direction: "LONG", window: "Dez 15–25", startSlot: 240,
    tier: "fdr", winRate: 0.80, oosWinRate: 0.75,
    avgReturn: 0.015, sortino: 2.5, nObs: 36,
    maxDrawdown: -0.04, profitFactor: 3.8, robustness: 0.65, decadeConsistent: true,
    category: "Indizes",
    rationale: "Santa Claus Rally: Pension fund rebalancing, tax-loss selling exhaustion, niedrige institutionelle Beteiligung.",
    fakeReturns: makeFakeReturns(0.80, 0.015),
  },
];

/* ─── Mini Donut ────────────────────────────────────────────────────── */
function MiniDonut({ pct, color, size = 44 }: { pct: number; color: string; size?: number }) {
  const r    = size * 0.36;
  const circ = 2 * Math.PI * r;
  const sw   = size * 0.092;
  const arc  = Math.max(0, Math.min(1, pct / 100)) * circ;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeOpacity={0.20} strokeWidth={sw} />
        {arc > 0 && (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none"
            stroke={color} strokeOpacity={0.92} strokeWidth={sw}
            strokeDasharray={`${arc} ${circ - arc}`} />
        )}
      </g>
      <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="central"
        fill={color} fontFamily={FONT} fontSize={size * 0.22} fontWeight="700">
        {pct.toFixed(0)}%
      </text>
    </svg>
  );
}

/* ─── Mini Bar Sparkline ────────────────────────────────────────────── */
function MiniSpark({ returns: rets, color, width = 64, height = 34 }: {
  returns: number[]; color: string; width?: number; height?: number;
}) {
  const max = Math.max(...rets.map(Math.abs), 0.001);
  const bw  = width / rets.length - 0.5;
  return (
    <svg width={width} height={height} style={{ display: "block", overflow: "visible" }}>
      {rets.map((v, i) => {
        const h = Math.max(1, (Math.abs(v) / max) * ((height / 2) - 1));
        const pos = v >= 0;
        return (
          <rect key={i}
            x={i * (bw + 0.5)} y={pos ? height / 2 - h : height / 2}
            width={bw} height={h}
            fill={pos ? color : "rgba(220,100,100,0.5)"} rx={0.5}
          />
        );
      })}
      <line x1={0} y1={height / 2} x2={width} y2={height / 2}
        stroke="rgba(255,255,255,0.08)" strokeWidth={0.5} />
    </svg>
  );
}

/* ─── SVG Equity / Drawdown chart ───────────────────────────────────── */
function EquityChart({ equity, color, width, height, label }: {
  equity: number[]; color: string; width: number; height: number; label: string;
}) {
  if (equity.length < 2) return null;
  const min = Math.min(...equity);
  const max = Math.max(...equity);
  const range = max - min || 0.001;
  const pts = equity.map((v, i) => {
    const x = (i / (equity.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const fillPts = `0,${height} ${pts} ${width},${height}`;
  const isPositive = equity[equity.length - 1] >= equity[0];
  const lineColor = isPositive ? C_GREEN : "#DC6464";
  const fillColor = isPositive ? "rgba(100,220,130,0.10)" : "rgba(220,100,100,0.10)";
  const last = equity[equity.length - 1];
  const pctChange = ((last / equity[0]) - 1) * 100;

  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      {/* Grid lines */}
      {[0.25, 0.5, 0.75].map(f => {
        const y = height - f * (height - 4) - 2;
        return <line key={f} x1={0} y1={y} x2={width} y2={y} stroke="rgba(255,255,255,0.04)" strokeWidth={0.5} />;
      })}
      {/* Fill */}
      <polygon points={fillPts} fill={fillColor} />
      {/* Line */}
      <polyline points={pts} fill="none" stroke={lineColor} strokeWidth={1.5} strokeLinejoin="round" />
      {/* End dot */}
      {(() => {
        const lastX = width;
        const lastY = height - ((last - min) / range) * (height - 4) - 2;
        return <circle cx={lastX} cy={lastY} r={2.5} fill={lineColor} />;
      })()}
      {/* Label */}
      <text x={6} y={11} fill={C_DIM} fontFamily={FONT} fontSize={8} textAnchor="start">{label}</text>
      <text x={width - 6} y={11} fill={isPositive ? C_GREEN : "#DC6464"} fontFamily={FONT} fontSize={9} fontWeight="700" textAnchor="end">
        {pctChange >= 0 ? "+" : ""}{pctChange.toFixed(1)}%
      </text>
    </svg>
  );
}

function DrawdownChart({ equity, width, height }: { equity: number[]; width: number; height: number }) {
  if (equity.length < 2) return null;
  let peak = equity[0];
  const dd = equity.map(v => {
    if (v > peak) peak = v;
    return (v / peak) - 1;
  });
  const minDd = Math.min(...dd, -0.001);
  const pts = dd.map((v, i) => {
    const x = (i / (dd.length - 1)) * width;
    const y = (v / minDd) * (height - 4) + 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const fillPts = `0,2 ${pts} ${width},2`;
  const maxDd = Math.min(...dd);

  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <line x1={0} y1={2} x2={width} y2={2} stroke="rgba(255,255,255,0.06)" strokeWidth={0.5} />
      <polygon points={fillPts} fill="rgba(220,100,100,0.12)" />
      <polyline points={pts} fill="none" stroke="rgba(220,100,100,0.65)" strokeWidth={1} strokeLinejoin="round" />
      <text x={6} y={height - 4} fill={C_DIM} fontFamily={FONT} fontSize={8} textAnchor="start">Drawdown</text>
      <text x={width - 6} y={height - 4} fill={C_GOLD} fontFamily={FONT} fontSize={9} fontWeight="700" textAnchor="end">
        {(maxDd * 100).toFixed(1)}%
      </text>
    </svg>
  );
}

/* ─── Tier / Dir badges ─────────────────────────────────────────────── */
function TierBadge({ tier }: { tier: SleevePattern["tier"] }) {
  const s = tier === "bonferroni"
    ? { bg: "rgba(100,220,130,0.15)", color: C_GREEN, label: "Tier 1" }
    : { bg: "rgba(220,196,118,0.15)", color: C_GOLD,  label: "Tier 2" };
  return (
    <span style={{
      fontSize: 7, fontWeight: 700, padding: "1px 4px", borderRadius: 3,
      background: s.bg, color: s.color, letterSpacing: "0.04em", textTransform: "uppercase" as const,
    }}>{s.label}</span>
  );
}

function DirBadge({ dir }: { dir: "LONG" | "SHORT" }) {
  return (
    <span style={{
      fontSize: 7, fontWeight: 700, padding: "1px 4px", borderRadius: 3,
      background: dir === "LONG" ? "rgba(100,200,140,0.12)" : "rgba(220,196,118,0.12)",
      color: dir === "LONG" ? C_GREEN : C_GOLD,
      letterSpacing: "0.03em", textTransform: "uppercase" as const,
    }}>{dir === "LONG" ? "L" : "S"}</span>
  );
}

/* ─── Stat cell ─────────────────────────────────────────────────────── */
function StatCell({ label, value, color = C_WHITE }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <div style={{ fontSize: 7, color: C_DIM, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>{label}</div>
      <div style={{ fontSize: 11, fontWeight: 700, color, fontFamily: FONT }}>{value}</div>
    </div>
  );
}

/* ─── Grid card ─────────────────────────────────────────────────────── */
function SleeveCard({ p, selected, onSelect }: { p: SleevePattern; selected: boolean; onSelect: () => void }) {
  const [hov, setHov] = useState(false);
  const color = p.direction === "LONG" ? C_WHITE : C_GOLD;

  return (
    <div
      role="button" tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelect(); }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "flex", flexDirection: "column", gap: 0,
        background: selected ? "rgba(220,196,118,0.06)" : hov ? "rgba(255,255,255,0.038)" : "rgba(255,255,255,0.028)",
        border: `1px solid ${selected ? "rgba(220,196,118,0.35)" : "rgba(255,255,255,0.07)"}`,
        borderRadius: 10, padding: "12px 13px 10px",
        cursor: "pointer", outline: "none",
        transition: "background 0.1s, border-color 0.1s",
        height: "100%", boxSizing: "border-box" as const,
        fontFamily: FONT, overflow: "hidden",
      }}
    >
      {/* Symbol + badges */}
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: C_WHITE, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {p.symbol}
        </span>
        <DirBadge dir={p.direction} />
        <TierBadge tier={p.tier} />
      </div>

      {/* Donut + sparkline */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8, marginBottom: 8 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, flexShrink: 0 }}>
          <MiniDonut pct={p.winRate * 100} color={color} size={44} />
          <span style={{ fontSize: 6.5, color: C_DIM2, letterSpacing: "0.04em" }}>IS Win Rate</span>
        </div>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
          <MiniSpark returns={p.fakeReturns.slice(0, 18)} color={color} width={72} height={30} />
          <span style={{ fontSize: 6.5, color: C_DIM2 }}>Trade Returns</span>
        </div>
      </div>

      {/* Name + window */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 8, color: C_MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
        <div style={{ fontSize: 12, fontWeight: 700, color, letterSpacing: "-0.2px", lineHeight: 1.2, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {p.window}
        </div>
      </div>

      {/* Key stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6, borderTop: `1px solid ${C_BORDER}`, paddingTop: 7 }}>
        <div>
          <div style={{ fontSize: 6, color: C_DIM, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>OOS WR</div>
          <div style={{ fontSize: 9, fontWeight: 700, color: p.oosWinRate >= 0.70 ? C_GREEN : C_MUTED }}>
            {(p.oosWinRate * 100).toFixed(0)}%
          </div>
        </div>
        <div>
          <div style={{ fontSize: 6, color: C_DIM, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>Sortino</div>
          <div style={{ fontSize: 9, fontWeight: 700, color: C_WHITE }}>{p.sortino.toFixed(1)}</div>
        </div>
        <div>
          <div style={{ fontSize: 6, color: C_DIM, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>Robust</div>
          <div style={{ fontSize: 9, fontWeight: 700, color: p.robustness >= 0.60 ? C_GREEN : C_MUTED }}>{(p.robustness * 100).toFixed(0)}%</div>
        </div>
        <div>
          <div style={{ fontSize: 6, color: C_DIM, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>n</div>
          <div style={{ fontSize: 9, fontWeight: 700, color: C_MUTED }}>{p.nObs}</div>
        </div>
      </div>
    </div>
  );
}

/* ─── Left list row ─────────────────────────────────────────────────── */
function PatternListRow({ p, selected, onSelect }: { p: SleevePattern; selected: boolean; onSelect: () => void }) {
  const [hov, setHov] = useState(false);
  return (
    <button type="button" onClick={onSelect}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        display: "flex", alignItems: "center", gap: 6,
        width: "100%", textAlign: "left",
        padding: "6px 8px", border: "none", cursor: "pointer",
        background: selected ? C_SEL : hov ? C_HOVER : "transparent",
        borderBottom: `1px solid ${C_BORDER}`,
        borderLeft: selected ? `2px solid ${C_GOLD}` : "2px solid transparent",
        transition: "background 0.1s", flexShrink: 0, fontFamily: FONT,
      }}
    >
      <span style={{ fontSize: 8, color: C_DIM2, minWidth: 14, textAlign: "right", flexShrink: 0 }}>{p.id}</span>
      <DirBadge dir={p.direction} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 9.5, fontWeight: 700, color: C_WHITE, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.symbol}</div>
        <div style={{ fontSize: 7.5, color: C_MUTED, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.window}</div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: C_WHITE }}>{(p.winRate * 100).toFixed(0)}%</div>
        <div style={{ fontSize: 7, color: C_DIM }}>S {p.sortino.toFixed(1)}</div>
      </div>
      <TierBadge tier={p.tier} />
    </button>
  );
}

/* ─── Detail panel ──────────────────────────────────────────────────── */
function DetailPanel({ p, onGoToChart }: { p: SleevePattern; onGoToChart: () => void }) {
  const color  = p.direction === "LONG" ? C_WHITE : C_GOLD;
  const pf     = (v: number, d = 0) => `${(v * 100).toFixed(d)}%`;
  const fp     = (v: number, d = 2) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(d)}%`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "10px 12px", flex: 1, minHeight: 0, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, flexShrink: 0 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: C_WHITE }}>{p.symbol}</span>
            <TierBadge tier={p.tier} />
            <DirBadge dir={p.direction} />
          </div>
          <div style={{ fontSize: 10, color: C_MUTED }}>{p.name} · {p.window}</div>
          <div style={{ fontSize: 8, color: C_DIM, marginTop: 2 }}>{p.category} · {p.decadeConsistent ? "Decade-konsistent ✓" : "—"}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 7, color: C_DIM, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>Sortino</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: C_GOLD }}>{p.sortino.toFixed(2)}</div>
          </div>
          <button type="button" onClick={onGoToChart} style={{
            background: "rgba(220,196,118,0.10)", border: "1px solid rgba(220,196,118,0.28)",
            borderRadius: 4, padding: "4px 10px", color: C_GOLD, fontSize: 8.5,
            cursor: "pointer", fontWeight: 700, fontFamily: FONT, letterSpacing: "0.04em",
          }}>
            ↗ Chart öffnen
          </button>
        </div>
      </div>

      {/* Win rates + return + obs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, background: C_BG, borderRadius: 6, padding: "8px 10px", flexShrink: 0 }}>
        <StatCell label="IS Win Rate"  value={pf(p.winRate)}    color={C_WHITE} />
        <StatCell label="OOS Win Rate" value={pf(p.oosWinRate)} color={p.oosWinRate >= 0.70 ? C_GREEN : C_MUTED} />
        <StatCell label="Ø Return"     value={fp(p.avgReturn)}  color={p.avgReturn >= 0 ? C_WHITE : C_GOLD} />
        <StatCell label="Beobacht."    value={String(p.nObs)} />
      </div>

      {/* Risk + quality */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, background: C_BG, borderRadius: 6, padding: "8px 10px", flexShrink: 0 }}>
        <StatCell label="Robustheit"    value={pf(p.robustness)}            color={p.robustness >= 0.60 ? C_GREEN : C_MUTED} />
        <StatCell label="Profit Factor" value={p.profitFactor.toFixed(1)}   color={p.profitFactor >= 4.0 ? C_GREEN : C_WHITE} />
        <StatCell label="Max DD"        value={pf(p.maxDrawdown)}           color={Math.abs(p.maxDrawdown) < 0.08 ? C_GREEN : C_MUTED} />
        <StatCell label="Dekaden"       value={p.decadeConsistent ? "✓ stabil" : "–"} color={p.decadeConsistent ? C_GREEN : C_DIM} />
      </div>

      {/* Sparkline + rationale row */}
      <div style={{ display: "flex", gap: 8, flex: 1, minHeight: 0 }}>
        <div style={{ background: C_BG, borderRadius: 6, padding: "8px 10px", flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 7.5, color: C_DIM, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 6 }}>
            Historischer Verlauf (illustrativ · {p.nObs} Trades)
          </div>
          <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center" }}>
            <MiniSpark returns={p.fakeReturns} color={color} width={240} height={40} />
          </div>
        </div>
        <div style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${C_BORDER}`, borderRadius: 5, padding: "8px 10px", flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 7.5, color: C_DIM, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 6 }}>
            Wirtschaftliche Begründung
          </div>
          <div style={{ fontSize: 9, color: C_WHITE, lineHeight: 1.55, flex: 1, overflow: "hidden" }}>{p.rationale}</div>
        </div>
      </div>
    </div>
  );
}

/* ─── Portfolio equity/drawdown ─────────────────────────────────────── */
function buildPortfolioEquity(): number[] {
  const n = SLEEVE_PATTERNS[0].fakeReturns.length;
  const equity: number[] = [1];
  for (let i = 0; i < n; i++) {
    const avgRet = SLEEVE_PATTERNS.reduce((s, p) => s + (p.fakeReturns[i] ?? 0), 0) / SLEEVE_PATTERNS.length;
    equity.push(equity[equity.length - 1] * (1 + avgRet));
  }
  return equity;
}

/* ─── Portfolio view ────────────────────────────────────────────────── */
function PortfolioView() {
  const patterns = SLEEVE_PATTERNS;
  const avgWr   = patterns.reduce((s, p) => s + p.winRate,    0) / patterns.length;
  const avgOos  = patterns.reduce((s, p) => s + p.oosWinRate, 0) / patterns.length;
  const avgSort = patterns.reduce((s, p) => s + p.sortino,    0) / patterns.length;
  const total   = patterns.reduce((s, p) => s + p.nObs,       0);
  const bon     = patterns.filter(p => p.tier === "bonferroni").length;
  const equity  = useMemo(() => buildPortfolioEquity(), []);
  const finalRet = (equity[equity.length - 1] - 1) * 100;
  let pk = equity[0]; let maxDd = 0;
  for (const v of equity) { if (v > pk) pk = v; const dd = (v / pk) - 1; if (dd < maxDd) maxDd = dd; }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1, minHeight: 0, overflow: "hidden" }}>
      {/* KPI cards row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, flexShrink: 0 }}>
        {[
          { label: "Muster",         value: `${patterns.length}`, sub: `${bon} Bonferroni` },
          { label: "Ø IS Win Rate",  value: `${(avgWr  * 100).toFixed(1)}%`, sub: "In-Sample" },
          { label: "Ø OOS Win Rate", value: `${(avgOos * 100).toFixed(1)}%`, sub: "Out-of-Sample" },
          { label: "Ø Sortino",      value: avgSort.toFixed(2),              sub: "Risikoadjustiert" },
          { label: "Gesamt n",       value: `${total}`,                      sub: "Hist. Trades" },
          { label: "Portfolio Ret.", value: `${finalRet >= 0 ? "+" : ""}${finalRet.toFixed(1)}%`, sub: "Illustrativ" },
          { label: "Max Drawdown",   value: `${(maxDd * 100).toFixed(1)}%`, sub: "Portfolio" },
        ].map(({ label, value, sub }) => (
          <div key={label} style={{ padding: "7px 9px", background: C_BG, border: `1px solid ${C_BORDER}`, borderRadius: 6 }}>
            <div style={{ fontSize: 6.5, color: C_DIM, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 3 }}>{label}</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: C_WHITE, fontFamily: FONT }}>{value}</div>
            <div style={{ fontSize: 7, color: C_DIM2, marginTop: 2 }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Charts row: equity + drawdown stacked left, pattern list right */}
      <div style={{ display: "flex", gap: 8, flex: 1, minHeight: 0 }}>
        {/* Left: equity curve + drawdown */}
        <div style={{ flex: 2, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ background: C_BG, border: `1px solid ${C_BORDER}`, borderRadius: 6, padding: "8px 10px", flex: 3, minHeight: 0, display: "flex", flexDirection: "column" }}>
            <div style={{ flex: 1, minHeight: 0 }}>
              <EquityChartResponsive equity={equity} />
            </div>
          </div>
          <div style={{ background: C_BG, border: `1px solid ${C_BORDER}`, borderRadius: 6, padding: "8px 10px", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            <div style={{ flex: 1, minHeight: 0 }}>
              <DrawdownChartResponsive equity={equity} />
            </div>
          </div>
        </div>

        {/* Right: pattern table */}
        <div style={{ flex: 1, minWidth: 0, background: C_BG, border: `1px solid ${C_BORDER}`, borderRadius: 6, padding: "8px 10px", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ fontSize: 7.5, color: C_DIM, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 6, flexShrink: 0 }}>Muster-Übersicht</div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {patterns.map(p => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 8.5, fontWeight: 700, color: C_WHITE, width: 36, flexShrink: 0 }}>{p.symbol.replace("1!", "")}</span>
                <MiniSpark returns={p.fakeReturns.slice(0, 12)} color={p.direction === "LONG" ? C_WHITE : C_GOLD} width={80} height={12} />
                <span style={{ fontSize: 8, color: C_MUTED, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.window}</span>
                <span style={{ fontSize: 8.5, fontWeight: 700, color: p.oosWinRate >= 0.70 ? C_GREEN : C_MUTED, flexShrink: 0 }}>
                  {(p.oosWinRate * 100).toFixed(0)}%
                </span>
                <DirBadge dir={p.direction} />
              </div>
            ))}
            <div style={{ fontSize: 7, color: C_DIM2, marginTop: 6 }}>Illustrativ · IS-Kennzahlen</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* Responsive wrappers using ResizeObserver-free approach (SVG fills container) */
function EquityChartResponsive({ equity }: { equity: number[] }) {
  return (
    <svg viewBox="0 0 400 100" width="100%" height="100%" preserveAspectRatio="none" style={{ display: "block" }}>
      <EquityChartInner equity={equity} w={400} h={100} />
    </svg>
  );
}

function DrawdownChartResponsive({ equity }: { equity: number[] }) {
  return (
    <svg viewBox="0 0 400 40" width="100%" height="100%" preserveAspectRatio="none" style={{ display: "block" }}>
      <DrawdownChartInner equity={equity} w={400} h={40} />
    </svg>
  );
}

function EquityChartInner({ equity, w, h }: { equity: number[]; w: number; h: number }) {
  const min = Math.min(...equity);
  const max = Math.max(...equity);
  const range = max - min || 0.001;
  const pad = 16;
  const pts = equity.map((v, i) => {
    const x = (i / (equity.length - 1)) * w;
    const y = h - pad - ((v - min) / range) * (h - pad - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const last = equity[equity.length - 1];
  const pctChange = ((last / equity[0]) - 1) * 100;
  const lastX = w;
  const lastY = h - pad - ((last - min) / range) * (h - pad - 4) - 2;

  return (
    <>
      {[0.25, 0.5, 0.75].map(f => {
        const y = h - pad - f * (h - pad - 4) - 2;
        return <line key={f} x1={0} y1={y} x2={w} y2={y} stroke="rgba(255,255,255,0.04)" strokeWidth={0.5} />;
      })}
      <polygon points={`0,${h - pad} ${pts} ${w},${h - pad}`} fill="rgba(100,220,130,0.08)" />
      <polyline points={pts} fill="none" stroke={C_GREEN} strokeWidth={1.5} strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r={3} fill={C_GREEN} />
      <text x={4} y={12} fill={C_DIM} fontFamily={FONT} fontSize={9} textAnchor="start">Portfolio Equity (illustrativ)</text>
      <text x={w - 4} y={12} fill={C_GREEN} fontFamily={FONT} fontSize={10} fontWeight="700" textAnchor="end">
        {pctChange >= 0 ? "+" : ""}{pctChange.toFixed(1)}%
      </text>
    </>
  );
}

function DrawdownChartInner({ equity, w, h }: { equity: number[]; w: number; h: number }) {
  let peak = equity[0];
  const dd = equity.map(v => { if (v > peak) peak = v; return (v / peak) - 1; });
  const minDd = Math.min(...dd, -0.001);
  const pts = dd.map((v, i) => {
    const x = (i / (dd.length - 1)) * w;
    const y = (v / minDd) * (h - 8) + 4;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const maxDd = Math.min(...dd);

  return (
    <>
      <line x1={0} y1={4} x2={w} y2={4} stroke="rgba(255,255,255,0.06)" strokeWidth={0.5} />
      <polygon points={`0,4 ${pts} ${w},4`} fill="rgba(220,100,100,0.12)" />
      <polyline points={pts} fill="none" stroke="rgba(220,100,100,0.70)" strokeWidth={1} strokeLinejoin="round" />
      <text x={4} y={h - 4} fill={C_DIM} fontFamily={FONT} fontSize={8} textAnchor="start">Drawdown</text>
      <text x={w - 4} y={h - 4} fill={C_GOLD} fontFamily={FONT} fontSize={9} fontWeight="700" textAnchor="end">
        {(maxDd * 100).toFixed(1)}%
      </text>
    </>
  );
}

/* ─── Main Panel ────────────────────────────────────────────────────── */
type Mode = "grid" | "detail" | "portfolio";

interface Props {
  mode: Mode;
  onModeChange: (m: Mode) => void;
  onSelectPattern?: (assetId: string, startSlot: number, direction: "LONG" | "SHORT") => void;
}

export function SleevePortfolioPanel({ mode, onModeChange, onSelectPattern }: Props) {
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const selected = useMemo(
    () => SLEEVE_PATTERNS.find(p => p.id === selectedId) ?? null,
    [selectedId],
  );

  function selectPattern(p: SleevePattern) {
    setSelectedId(p.id);
    onModeChange("detail");
    onSelectPattern?.(p.assetId, p.startSlot, p.direction);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, fontFamily: FONT }}>

      {/* Grid */}
      {mode === "grid" && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
          gap: 6, flex: 1, minHeight: 0, overflow: "hidden",
        }}>
          {SLEEVE_PATTERNS.map(p => (
            <SleeveCard key={p.id} p={p} selected={selectedId === p.id} onSelect={() => selectPattern(p)} />
          ))}
        </div>
      )}

      {/* Detail — left list + right detail */}
      {mode === "detail" && (
        <div style={{ display: "flex", flex: 1, minHeight: 0, gap: 0, overflow: "hidden" }}>
          <div style={{ width: 190, flexShrink: 0, borderRight: `1px solid ${C_BORDER}`, display: "flex", flexDirection: "column", overflowY: "auto" }}>
            {SLEEVE_PATTERNS.map(p => (
              <PatternListRow key={p.id} p={p} selected={selectedId === p.id} onSelect={() => selectPattern(p)} />
            ))}
          </div>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
            {selected
              ? <DetailPanel p={selected} onGoToChart={() => onSelectPattern?.(selected.assetId, selected.startSlot, selected.direction)} />
              : <div style={{ padding: 16, fontSize: 9, color: C_DIM }}>Muster auswählen</div>
            }
          </div>
        </div>
      )}

      {/* Portfolio */}
      {mode === "portfolio" && (
        <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <PortfolioView />
        </div>
      )}
    </div>
  );
}
