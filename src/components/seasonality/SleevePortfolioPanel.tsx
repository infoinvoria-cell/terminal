"use client";

import { useState, useMemo } from "react";

/* ─── Pattern Data ─────────────────────────────────────────────────── */

export interface SleevePattern {
  id: number;
  assetId: string;       // registry id used to switch main chart
  symbol: string;        // display symbol
  name: string;          // human name
  direction: "LONG" | "SHORT";
  window: string;        // e.g. "Feb 8–16"
  tier: "bonferroni" | "fdr";
  winRate: number;       // overall IS+OOS
  isWinRate: number;
  oosWinRate: number;
  avgReturn: number;     // per trade, decimal
  sortino: number;
  nObs: number;
  maxDrawdown: number;
  profitFactor: number;
  robustness: number;
  decadeConsistent: boolean;
  startSlot: number;     // approximate slot for chart linking
  category: string;
  rationale: string;
  // Monthly performance profile (12 values, signed %)
  monthlyProfile: number[];
}

export const SLEEVE_PATTERNS: SleevePattern[] = [
  {
    id: 1, assetId: "RB=F", symbol: "RB1!", name: "RBOB Gasoline",
    direction: "LONG", window: "Feb 8–16", tier: "bonferroni",
    winRate: 0.86, isWinRate: 0.83, oosWinRate: 1.00,
    avgReturn: 0.024, sortino: 3.2, nObs: 29,
    maxDrawdown: -0.08, profitFactor: 5.1, robustness: 0.72,
    decadeConsistent: true, startSlot: 38, category: "Energy",
    rationale: "Pre-summer driving season builds RFG demand. Refinery maintenance cutbacks + spec positioning.",
    monthlyProfile: [-0.3, 2.4, 1.1, 0.5, -0.2, -0.8, -0.3, 0.1, -0.5, -0.4, 0.2, -0.3],
  },
  {
    id: 2, assetId: "ZW=F", symbol: "ZW1!", name: "Chicago Wheat",
    direction: "LONG", window: "Aug 10–20", tier: "bonferroni",
    winRate: 0.84, isWinRate: 0.88, oosWinRate: 0.75,
    avgReturn: 0.018, sortino: 2.8, nObs: 32,
    maxDrawdown: -0.06, profitFactor: 4.3, robustness: 0.68,
    decadeConsistent: true, startSlot: 155, category: "Agrar",
    rationale: "Northern hemisphere harvest pressure subsides post-Aug 10. Southern hemisphere planting uncertainty adds risk premium.",
    monthlyProfile: [0.1, -0.2, 0.3, 0.5, -0.4, -0.8, -1.2, 1.8, 0.6, 0.2, -0.1, 0.2],
  },
  {
    id: 3, assetId: "GC=F", symbol: "GC1!", name: "Gold",
    direction: "LONG", window: "Jul last 5 HT", tier: "fdr",
    winRate: 0.78, isWinRate: 0.80, oosWinRate: 0.72,
    avgReturn: 0.012, sortino: 2.1, nObs: 35,
    maxDrawdown: -0.05, profitFactor: 3.1, robustness: 0.58,
    decadeConsistent: true, startSlot: 128, category: "Metals",
    rationale: "Pre-India wedding season demand ramp. Physical buyers accumulate before price moves in August.",
    monthlyProfile: [0.3, 0.5, -0.2, -0.1, -0.3, 0.2, 1.2, 0.8, 0.4, 0.1, -0.2, 0.4],
  },
  {
    id: 4, assetId: "NG=F", symbol: "NG1!", name: "Natural Gas",
    direction: "LONG", window: "Sep H2", tier: "fdr",
    winRate: 0.76, isWinRate: 0.78, oosWinRate: 0.71,
    avgReturn: 0.021, sortino: 2.4, nObs: 28,
    maxDrawdown: -0.10, profitFactor: 3.6, robustness: 0.55,
    decadeConsistent: true, startSlot: 168, category: "Energy",
    rationale: "Pre-winter storage injection season reaches critical level. Heating demand spec positioning accelerates late September.",
    monthlyProfile: [-0.5, -0.3, 0.1, 0.2, -0.1, -0.8, -0.5, -0.3, 2.1, 1.2, 0.6, 0.3],
  },
  {
    id: 5, assetId: "SB=F", symbol: "SB1!", name: "Sugar #11",
    direction: "LONG", window: "Sep H2", tier: "fdr",
    winRate: 0.75, isWinRate: 0.77, oosWinRate: 0.70,
    avgReturn: 0.016, sortino: 1.9, nObs: 30,
    maxDrawdown: -0.07, profitFactor: 2.8, robustness: 0.52,
    decadeConsistent: true, startSlot: 170, category: "Agrar",
    rationale: "Northern hemisphere crushing season ends. Brazilian export logistics constrained. Global demand seasonally firm.",
    monthlyProfile: [0.2, -0.1, 0.4, 0.8, 0.1, -0.3, -0.6, -0.4, 1.6, 0.5, -0.2, 0.1],
  },
  {
    id: 6, assetId: "CC=F", symbol: "CC1!", name: "Cocoa",
    direction: "LONG", window: "Nov 5–15", tier: "fdr",
    winRate: 0.74, isWinRate: 0.76, oosWinRate: 0.70,
    avgReturn: 0.019, sortino: 2.2, nObs: 27,
    maxDrawdown: -0.09, profitFactor: 3.0, robustness: 0.53,
    decadeConsistent: true, startSlot: 195, category: "Agrar",
    rationale: "West African main crop arrival delays create pre-holiday chocolate demand surge. Seasonal low supply overlap.",
    monthlyProfile: [-0.2, 0.1, -0.3, 0.2, 0.4, -0.5, -0.3, 0.1, -0.2, 0.6, 1.9, 0.8],
  },
  {
    id: 7, assetId: "PA=F", symbol: "PA1!", name: "Palladium",
    direction: "LONG", window: "Jan OpEx", tier: "fdr",
    winRate: 0.77, isWinRate: 0.80, oosWinRate: 0.71,
    avgReturn: 0.022, sortino: 2.3, nObs: 24,
    maxDrawdown: -0.08, profitFactor: 3.4, robustness: 0.60,
    decadeConsistent: true, startSlot: 10, category: "Metals",
    rationale: "Auto-catalyst restocking after year-end. Russian supply uncertainty + thin post-holiday liquidity amplifies move.",
    monthlyProfile: [2.2, 0.4, -0.5, 0.1, -0.3, -0.6, -0.4, 0.2, 0.5, 0.1, -0.2, 0.3],
  },
  {
    id: 8, assetId: "ZM=F", symbol: "ZM1!", name: "Soybean Meal",
    direction: "LONG", window: "Apr 15–25", tier: "fdr",
    winRate: 0.73, isWinRate: 0.75, oosWinRate: 0.69,
    avgReturn: 0.014, sortino: 1.8, nObs: 31,
    maxDrawdown: -0.06, profitFactor: 2.5, robustness: 0.51,
    decadeConsistent: true, startSlot: 73, category: "Agrar",
    rationale: "US spring crush crush margin rally + South American export competition eases mid-April. Feed demand spec.",
    monthlyProfile: [0.1, 0.3, 0.6, 1.4, 0.4, -0.2, -0.5, -0.3, 0.1, -0.1, 0.2, 0.1],
  },
  {
    id: 9, assetId: "CT=F", symbol: "CT1!", name: "Cotton #2",
    direction: "LONG", window: "Feb 8–16", tier: "fdr",
    winRate: 0.72, isWinRate: 0.74, oosWinRate: 0.68,
    avgReturn: 0.013, sortino: 1.7, nObs: 28,
    maxDrawdown: -0.07, profitFactor: 2.4, robustness: 0.49,
    decadeConsistent: true, startSlot: 38, category: "Agrar",
    rationale: "Export sales pace accelerates post-USDA Feb supply/demand report. Asian textile restocking.",
    monthlyProfile: [0.2, 1.3, 0.4, 0.1, -0.3, -0.5, -0.4, 0.1, 0.2, 0.1, -0.1, 0.1],
  },
  {
    id: 10, assetId: "ES=F", symbol: "ES1!", name: "S&P 500 E-mini",
    direction: "LONG", window: "Dec 15–25", tier: "fdr",
    winRate: 0.80, isWinRate: 0.82, oosWinRate: 0.75,
    avgReturn: 0.015, sortino: 2.5, nObs: 36,
    maxDrawdown: -0.04, profitFactor: 3.8, robustness: 0.65,
    decadeConsistent: true, startSlot: 213, category: "Indices",
    rationale: "Santa Claus rally: pension fund rebalancing, tax-loss selling exhaustion, low institutional participation inflates prices.",
    monthlyProfile: [-0.1, 0.2, 0.5, 0.8, 0.3, 0.4, 0.5, 0.3, -0.1, 0.2, 0.4, 1.5],
  },
];

/* ─── Styles / Constants ────────────────────────────────────────────── */

const C_BG    = "rgba(255,255,255,0.02)";
const C_CARD  = "rgba(255,255,255,0.04)";
const C_GOLD  = "#DCC476";
const C_WHITE = "#F0F3F7";
const C_MUTED = "#9AAAB8";
const C_DIM   = "#5E6E80";
const C_GREEN = "#4EBA8A";
const C_RED   = "#E07070";
const C_SEL   = "rgba(220,196,118,0.15)";
const C_HOVER = "rgba(255,255,255,0.06)";

const CATEGORY_COLORS: Record<string, string> = {
  Energy:  "#E8965A",
  Agrar:   "#7DBD6B",
  Metals:  "#A8CADF",
  Indices: "#9B8FD4",
};

function catColor(cat: string) { return CATEGORY_COLORS[cat] ?? C_MUTED; }

/* ─── Mini Sparkline ────────────────────────────────────────────────── */

function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data.map(Math.abs), 0.01);
  const h = 22, w = 60;
  const barW = w / data.length - 1;
  return (
    <svg width={w} height={h} style={{ display: "block", overflow: "visible" }}>
      {data.map((v, i) => {
        const barH = Math.max(1, Math.abs(v) / max * (h / 2 - 1));
        const isPos = v >= 0;
        return (
          <rect
            key={i}
            x={i * (barW + 1)}
            y={isPos ? h / 2 - barH : h / 2}
            width={barW}
            height={barH}
            fill={isPos ? color : "rgba(224,112,112,0.6)"}
            rx={0.5}
          />
        );
      })}
      <line x1={0} y1={h / 2} x2={w} y2={h / 2} stroke="rgba(255,255,255,0.10)" strokeWidth={0.5} />
    </svg>
  );
}

/* ─── Portfolio Equity Curve ────────────────────────────────────────── */

function PortfolioEquityCurve({ patterns }: { patterns: SleevePattern[] }) {
  // Simulate 30-year compounded equity curve from IS win rates and avg returns
  const years = 30;
  const points: number[] = [1.0];
  for (let y = 0; y < years; y++) {
    let equity = points[points.length - 1];
    for (const p of patterns) {
      const wins = p.isWinRate;
      const r = p.avgReturn * (Math.random() > wins ? -0.4 : 1);
      equity *= (1 + r * 0.1); // scale down — each pattern ~10% weight
    }
    points.push(equity);
  }
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 0.01;
  const W = 280, H = 60;
  const pts = points.map((v, i) => `${(i / (points.length - 1)) * W},${H - ((v - min) / range) * (H - 4) - 2}`).join(" ");
  return (
    <svg width={W} height={H} style={{ display: "block" }}>
      <polyline points={pts} fill="none" stroke={C_GOLD} strokeWidth={1.5} />
      <polyline points={`0,${H} ${pts} ${W},${H}`} fill={`${C_GOLD}18`} stroke="none" />
    </svg>
  );
}

/* ─── Pattern Card (grid item) ─────────────────────────────────────── */

function PatternCard({
  p, selected, onClick,
}: { p: SleevePattern; selected: boolean; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  const cc = catColor(p.category);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: "10px 11px",
        background: selected ? C_SEL : hovered ? C_HOVER : C_CARD,
        border: `1px solid ${selected ? C_GOLD : "rgba(255,255,255,0.07)"}`,
        borderLeft: `3px solid ${cc}`,
        borderRadius: 6,
        cursor: "pointer",
        textAlign: "left",
        transition: "background 0.12s, border-color 0.12s",
        minWidth: 0,
      }}
    >
      {/* Top row: symbol + direction badge */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: C_WHITE, letterSpacing: "0.02em" }}>{p.symbol}</div>
          <div style={{ fontSize: 8.5, color: C_MUTED, marginTop: 1 }}>{p.name}</div>
        </div>
        <span style={{
          fontSize: 7.5, fontWeight: 700, padding: "2px 5px", borderRadius: 3,
          background: p.direction === "LONG" ? "rgba(78,186,138,0.15)" : "rgba(224,112,112,0.15)",
          color: p.direction === "LONG" ? C_GREEN : C_RED,
          letterSpacing: "0.05em", flexShrink: 0,
        }}>{p.direction}</span>
      </div>

      {/* Window label */}
      <div style={{ fontSize: 8, color: C_GOLD, fontStyle: "italic" }}>{p.window}</div>

      {/* Mini sparkline */}
      <MiniSparkline data={p.monthlyProfile} color={cc} />

      {/* Key stats row */}
      <div style={{ display: "flex", gap: 8 }}>
        <div>
          <div style={{ fontSize: 7, color: C_DIM }}>WR</div>
          <div style={{ fontSize: 9, fontWeight: 600, color: C_WHITE }}>{(p.winRate * 100).toFixed(0)}%</div>
        </div>
        <div>
          <div style={{ fontSize: 7, color: C_DIM }}>OOS</div>
          <div style={{ fontSize: 9, fontWeight: 600, color: p.oosWinRate >= 0.65 ? C_GREEN : C_MUTED }}>
            {(p.oosWinRate * 100).toFixed(0)}%
          </div>
        </div>
        <div>
          <div style={{ fontSize: 7, color: C_DIM }}>Sortino</div>
          <div style={{ fontSize: 9, fontWeight: 600, color: C_WHITE }}>{p.sortino.toFixed(1)}</div>
        </div>
        <div>
          <div style={{ fontSize: 7, color: C_DIM }}>n</div>
          <div style={{ fontSize: 9, fontWeight: 600, color: C_MUTED }}>{p.nObs}</div>
        </div>
      </div>
    </button>
  );
}

/* ─── Detail Panel ──────────────────────────────────────────────────── */

function PatternDetail({ p, onBack, onGoToChart }: {
  p: SleevePattern;
  onBack: () => void;
  onGoToChart: () => void;
}) {
  const cc = catColor(p.category);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button type="button" onClick={onBack}
          style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 4, padding: "3px 8px", color: C_MUTED, fontSize: 9, cursor: "pointer" }}>
          ← Zurück
        </button>
        <div style={{ width: 3, height: 20, borderRadius: 2, background: cc, flexShrink: 0 }} />
        <div>
          <span style={{ fontSize: 13, fontWeight: 700, color: C_WHITE }}>{p.symbol}</span>
          <span style={{ fontSize: 10, color: C_MUTED, marginLeft: 6 }}>{p.name}</span>
        </div>
        <span style={{
          fontSize: 8, fontWeight: 700, padding: "2px 6px", borderRadius: 3, marginLeft: 4,
          background: p.direction === "LONG" ? "rgba(78,186,138,0.15)" : "rgba(224,112,112,0.15)",
          color: p.direction === "LONG" ? C_GREEN : C_RED,
        }}>{p.direction}</span>
        <span style={{
          fontSize: 7.5, padding: "2px 6px", borderRadius: 3,
          background: p.tier === "bonferroni" ? "rgba(220,196,118,0.18)" : "rgba(255,255,255,0.06)",
          color: p.tier === "bonferroni" ? C_GOLD : C_MUTED,
          fontWeight: 600, letterSpacing: "0.04em", marginLeft: 2,
        }}>{p.tier.toUpperCase()}</span>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={onGoToChart}
          style={{ background: "rgba(220,196,118,0.12)", border: "1px solid rgba(220,196,118,0.3)", borderRadius: 4, padding: "4px 10px", color: C_GOLD, fontSize: 9, cursor: "pointer", fontWeight: 600 }}>
          ↗ Chart öffnen
        </button>
      </div>

      {/* KPI grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 6 }}>
        {[
          { label: "Win Rate", value: `${(p.winRate * 100).toFixed(1)}%`, highlight: true },
          { label: "IS Win Rate", value: `${(p.isWinRate * 100).toFixed(1)}%` },
          { label: "OOS Win Rate", value: `${(p.oosWinRate * 100).toFixed(1)}%`, highlight: p.oosWinRate >= 0.65 },
          { label: "Avg Return", value: `${(p.avgReturn * 100).toFixed(2)}%`, highlight: true },
          { label: "Sortino", value: p.sortino.toFixed(2), highlight: true },
          { label: "Profit Factor", value: p.profitFactor.toFixed(2) },
          { label: "Max DD", value: `${(p.maxDrawdown * 100).toFixed(1)}%` },
          { label: "n Obs", value: p.nObs.toString() },
        ].map(({ label, value, highlight }) => (
          <div key={label} style={{
            padding: "8px 10px", background: C_BG,
            border: "1px solid rgba(255,255,255,0.06)", borderRadius: 5,
          }}>
            <div style={{ fontSize: 7.5, color: C_DIM, marginBottom: 3 }}>{label}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: highlight ? C_WHITE : C_MUTED }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Window + rationale */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 8 }}>
        <div style={{ padding: "10px 12px", background: C_BG, border: "1px solid rgba(255,255,255,0.06)", borderRadius: 5 }}>
          <div style={{ fontSize: 7.5, color: C_DIM, marginBottom: 4 }}>HANDELSFENSTER</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: C_GOLD }}>{p.window}</div>
          <div style={{ fontSize: 8.5, color: C_MUTED, marginTop: 4 }}>Kategorie: {p.category}</div>
          <div style={{ fontSize: 8.5, color: p.decadeConsistent ? C_GREEN : C_MUTED, marginTop: 3 }}>
            {p.decadeConsistent ? "✓ Decade-konsistent" : "— Decade-Konsistenz fehlt"}
          </div>
          <div style={{ marginTop: 10 }}>
            <MiniSparkline data={p.monthlyProfile} color={cc} />
            <div style={{ fontSize: 7, color: C_DIM, marginTop: 3 }}>Monatsprofil (Jan–Dez)</div>
          </div>
        </div>
        <div style={{ padding: "10px 12px", background: C_BG, border: "1px solid rgba(255,255,255,0.06)", borderRadius: 5 }}>
          <div style={{ fontSize: 7.5, color: C_DIM, marginBottom: 4 }}>RATIONALE</div>
          <div style={{ fontSize: 9.5, color: C_WHITE, lineHeight: 1.55 }}>{p.rationale}</div>
          <div style={{ marginTop: 10, display: "flex", gap: 6 }}>
            <div style={{ fontSize: 8, color: C_DIM }}>Robustness Score:</div>
            <div style={{ fontSize: 8, fontWeight: 700, color: p.robustness >= 0.6 ? C_GREEN : C_MUTED }}>
              {(p.robustness * 100).toFixed(0)}%
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Portfolio View ────────────────────────────────────────────────── */

function PortfolioView({ patterns, onBack }: { patterns: SleevePattern[]; onBack: () => void }) {
  const avgWr = patterns.reduce((s, p) => s + p.winRate, 0) / patterns.length;
  const avgOos = patterns.reduce((s, p) => s + p.oosWinRate, 0) / patterns.length;
  const avgSortino = patterns.reduce((s, p) => s + p.sortino, 0) / patterns.length;
  const totalObs = patterns.reduce((s, p) => s + p.nObs, 0);
  const bonferroniCount = patterns.filter(p => p.tier === "bonferroni").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button type="button" onClick={onBack}
          style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 4, padding: "3px 8px", color: C_MUTED, fontSize: 9, cursor: "pointer" }}>
          ← Zurück
        </button>
        <span style={{ fontSize: 12, fontWeight: 700, color: C_WHITE }}>Saisonales Portfolio</span>
        <span style={{ fontSize: 8, color: C_MUTED }}>{patterns.length} Muster · FDR/Bonferroni validiert</span>
      </div>

      {/* Portfolio KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
        {[
          { label: "Muster", value: `${patterns.length}`, sub: `${bonferroniCount} Bonferroni` },
          { label: "Ø Win Rate", value: `${(avgWr * 100).toFixed(1)}%`, sub: "IS" },
          { label: "Ø OOS Win Rate", value: `${(avgOos * 100).toFixed(1)}%`, sub: "Walk-forward" },
          { label: "Ø Sortino", value: avgSortino.toFixed(2), sub: "Annualisiert" },
          { label: "Gesamt n", value: totalObs.toString(), sub: "Historische Trades" },
        ].map(({ label, value, sub }) => (
          <div key={label} style={{ padding: "10px 12px", background: C_BG, border: "1px solid rgba(255,255,255,0.08)", borderRadius: 5 }}>
            <div style={{ fontSize: 7.5, color: C_DIM, marginBottom: 3 }}>{label}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C_WHITE }}>{value}</div>
            <div style={{ fontSize: 7.5, color: C_MUTED, marginTop: 2 }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Equity curve (simulated) */}
      <div style={{ padding: "10px 12px", background: C_BG, border: "1px solid rgba(255,255,255,0.06)", borderRadius: 5 }}>
        <div style={{ fontSize: 7.5, color: C_DIM, marginBottom: 6 }}>SIMULIERTE EQUITY-KURVE (30J IS, gleichgewichtet)</div>
        <PortfolioEquityCurve patterns={patterns} />
        <div style={{ fontSize: 7, color: C_DIM, marginTop: 4 }}>Illustrativ — basiert auf IS-Kennzahlen, nicht auf tatsächlichen Trades</div>
      </div>

      {/* Category breakdown */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div style={{ padding: "10px 12px", background: C_BG, border: "1px solid rgba(255,255,255,0.06)", borderRadius: 5 }}>
          <div style={{ fontSize: 7.5, color: C_DIM, marginBottom: 6 }}>KATEGORIE-VERTEILUNG</div>
          {Object.entries(
            patterns.reduce<Record<string, number>>((acc, p) => ({ ...acc, [p.category]: (acc[p.category] ?? 0) + 1 }), {})
          ).map(([cat, count]) => (
            <div key={cat} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: catColor(cat), flexShrink: 0 }} />
              <div style={{ fontSize: 8.5, color: C_WHITE, flex: 1 }}>{cat}</div>
              <div style={{ fontSize: 8.5, color: C_MUTED }}>{count} Muster</div>
              <div style={{ width: (count / patterns.length) * 80, height: 4, background: catColor(cat), borderRadius: 2, opacity: 0.6 }} />
            </div>
          ))}
        </div>
        <div style={{ padding: "10px 12px", background: C_BG, border: "1px solid rgba(255,255,255,0.06)", borderRadius: 5 }}>
          <div style={{ fontSize: 7.5, color: C_DIM, marginBottom: 6 }}>MUSTER-ÜBERSICHT</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {patterns.map(p => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 3, height: 12, borderRadius: 1, background: catColor(p.category), flexShrink: 0 }} />
                <div style={{ fontSize: 8.5, fontWeight: 600, color: C_WHITE, width: 32 }}>{p.symbol.replace("1!", "")}</div>
                <div style={{ fontSize: 8, color: C_MUTED, flex: 1 }}>{p.window}</div>
                <div style={{ fontSize: 8.5, color: p.oosWinRate >= 0.70 ? C_GREEN : C_MUTED }}>
                  {(p.oosWinRate * 100).toFixed(0)}% OOS
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Panel ────────────────────────────────────────────────────── */

type PanelView = "grid" | "detail" | "portfolio";

interface Props {
  onSelectPattern?: (assetId: string, startSlot: number, direction: "LONG" | "SHORT") => void;
}

export function SleevePortfolioPanel({ onSelectPattern }: Props) {
  const [view, setView] = useState<PanelView>("grid");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const selected = useMemo(
    () => SLEEVE_PATTERNS.find(p => p.id === selectedId) ?? null,
    [selectedId]
  );

  function handleCardClick(p: SleevePattern) {
    setSelectedId(p.id);
    setView("detail");
  }

  function handleGoToChart() {
    if (!selected || !onSelectPattern) return;
    onSelectPattern(selected.assetId, selected.startSlot, selected.direction);
  }

  return (
    <div style={{
      padding: "10px 0 4px",
      display: "flex",
      flexDirection: "column",
      gap: 10,
      minHeight: 180,
    }}>
      {/* Sub-header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 6, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: C_WHITE }}>Saisonale Komponenten</span>
        <span style={{ fontSize: 8.5, color: C_MUTED }}>{SLEEVE_PATTERNS.length} validierte Muster · TV Back-Adjusted · FDR/Bonferroni</span>
        <div style={{ flex: 1 }} />
        {view !== "portfolio" && (
          <button
            type="button"
            onClick={() => setView("portfolio")}
            style={{
              background: "rgba(220,196,118,0.10)",
              border: "1px solid rgba(220,196,118,0.25)",
              borderRadius: 4, padding: "4px 12px",
              color: C_GOLD, fontSize: 9, cursor: "pointer", fontWeight: 600,
            }}
          >
            Portfolio
          </button>
        )}
        {view !== "grid" && (
          <button
            type="button"
            onClick={() => setView("grid")}
            style={{
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 4, padding: "4px 10px",
              color: C_MUTED, fontSize: 9, cursor: "pointer",
            }}
          >
            Alle Muster
          </button>
        )}
      </div>

      {/* Content */}
      {view === "grid" && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: 8,
        }}>
          {SLEEVE_PATTERNS.map(p => (
            <PatternCard
              key={p.id}
              p={p}
              selected={selectedId === p.id}
              onClick={() => handleCardClick(p)}
            />
          ))}
        </div>
      )}

      {view === "detail" && selected && (
        <PatternDetail
          p={selected}
          onBack={() => setView("grid")}
          onGoToChart={handleGoToChart}
        />
      )}

      {view === "portfolio" && (
        <PortfolioView
          patterns={SLEEVE_PATTERNS}
          onBack={() => setView("grid")}
        />
      )}
    </div>
  );
}
