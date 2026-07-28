"use client";

import { useState } from "react";
import { AGENT_PATTERNS, AGENT_PORTFOLIO_GENERATED, AGENT_PORTFOLIO_N, type AgentPattern } from "@/lib/seasonality/agentPortfolioData";

const C_WHITE  = "#F0F3F7";
const C_GOLD   = "#DCC476";
const C_MUTED  = "#9AAAB8";
const C_DIM    = "#7A8898";
const C_BG     = "#060606";
const C_BORDER = "rgba(255,255,255,0.07)";
const C_HOVER  = "rgba(255,255,255,0.04)";
const C_SEL    = "rgba(255,255,255,0.07)";

function pct(v: number, d = 1) {
  return `${(v * 100).toFixed(d)}%`;
}
function fmt(v: number, d = 2) {
  return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(d)}%`;
}

function TierBadge({ tier }: { tier: AgentPattern["tier"] }) {
  const colors: Record<string, { bg: string; color: string; label: string }> = {
    bonferroni: { bg: "rgba(100,220,130,0.15)", color: "#64DC82", label: "Tier 1" },
    fdr:        { bg: "rgba(220,196,118,0.15)", color: C_GOLD,    label: "Tier 2" },
    watchlist:  { bg: "rgba(154,170,184,0.12)", color: C_MUTED,   label: "Research" },
  };
  const c = colors[tier] ?? colors.watchlist;
  return (
    <span style={{
      fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 3,
      background: c.bg, color: c.color, letterSpacing: "0.04em",
      textTransform: "uppercase", flexShrink: 0,
    }}>
      {c.label}
    </span>
  );
}

function DirBadge({ dir }: { dir: string }) {
  const isLong = dir === "long" || dir === "LONG";
  return (
    <span style={{
      fontSize: 7.5, fontWeight: 700, padding: "1px 4px", borderRadius: 3,
      background: isLong ? "rgba(100,200,140,0.12)" : "rgba(220,196,118,0.12)",
      color: isLong ? "#64DC82" : C_GOLD,
      letterSpacing: "0.03em", textTransform: "uppercase", flexShrink: 0,
    }}>
      {isLong ? "L" : "S"}
    </span>
  );
}

function StatCell({ label, value, color = C_WHITE }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <div style={{ fontSize: 7, color: C_DIM, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
      <div style={{ fontSize: 11, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

function PatternRow({
  p, selected, onSelect,
}: { p: AgentPattern; selected: boolean; onSelect: () => void }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      type="button"
      onClick={onSelect}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "flex", alignItems: "center", gap: 6,
        width: "100%", textAlign: "left",
        padding: "6px 8px", border: "none", cursor: "pointer",
        background: selected ? C_SEL : hov ? C_HOVER : "transparent",
        borderBottom: `1px solid ${C_BORDER}`,
        borderLeft: selected ? `2px solid ${C_GOLD}` : "2px solid transparent",
        transition: "background 0.1s",
      }}
    >
      <span style={{ fontSize: 8, color: C_DIM, minWidth: 16, textAlign: "right", flexShrink: 0 }}>
        {p.rank}
      </span>
      <DirBadge dir={p.direction} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: C_WHITE, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {p.asset}
        </div>
        <div style={{ fontSize: 8, color: C_MUTED, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {p.hypothesis}
        </div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: C_WHITE }}>{pct(p.win_rate, 0)}</div>
        <div style={{ fontSize: 7.5, color: C_DIM }}>S {p.sortino.toFixed(2)}</div>
      </div>
      <TierBadge tier={p.tier} />
    </button>
  );
}

function DetailPanel({ p }: { p: AgentPattern }) {
  const hasRegime = p.best_regime && p.best_regime !== "none";
  const dirUpper = p.direction.toUpperCase();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "10px 12px", overflowY: "auto", flex: 1, minHeight: 0 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: C_WHITE }}>{p.asset}</span>
            <TierBadge tier={p.tier} />
            <DirBadge dir={p.direction} />
          </div>
          <div style={{ fontSize: 10, color: C_MUTED }}>{p.asset_type} · {p.hypothesis}</div>
          <div style={{ fontSize: 8, color: C_DIM, marginTop: 2 }}>{p.category_label}</div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 7, color: C_DIM, textTransform: "uppercase", letterSpacing: "0.06em" }}>Sortino</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: C_GOLD }}>{p.sortino.toFixed(2)}</div>
        </div>
      </div>

      {/* Stats row 1: win rates + return + obs */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8,
        background: C_BG, borderRadius: 6, padding: "8px 10px",
      }}>
        <StatCell label="IS Win Rate" value={pct(p.is_win_rate, 0)} color={C_WHITE} />
        <StatCell label="OOS Win Rate" value={pct(p.oos_win_rate, 0)} color={p.oos_win_rate >= 0.70 ? "#64DC82" : C_MUTED} />
        <StatCell label="Ø Return" value={fmt(p.avg_return, 2)} color={p.avg_return >= 0 ? C_WHITE : C_GOLD} />
        <StatCell label="Beobacht." value={String(p.n_obs)} />
      </div>

      {/* Stats row 2: robustness + profit factor + drawdown + cross-asset */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8,
        background: C_BG, borderRadius: 6, padding: "8px 10px",
      }}>
        <StatCell label="Robustheit" value={pct(p.robustness_score, 0)} color={p.robustness_score >= 0.9 ? "#64DC82" : C_MUTED} />
        <StatCell label="Profit Factor" value={p.profit_factor.toFixed(1)} color={p.profit_factor >= 5 ? "#64DC82" : C_WHITE} />
        <StatCell label="Max DD" value={pct(p.max_drawdown, 1)} color={p.max_drawdown < 0.05 ? "#64DC82" : C_MUTED} />
        <StatCell label="Dekaden" value={p.decade_consistent ? "✓ stabil" : "–"} color={p.decade_consistent ? "#64DC82" : C_DIM} />
      </div>

      {/* Regime */}
      {hasRegime && (
        <div style={{
          background: "rgba(220,196,118,0.06)", border: "1px solid rgba(220,196,118,0.18)",
          borderRadius: 5, padding: "7px 10px",
        }}>
          <div style={{ fontSize: 7.5, color: C_GOLD, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
            Bestes Regime
          </div>
          <div style={{ fontSize: 9.5, color: C_WHITE }}>
            Bevorzugt bei: <strong>{p.best_regime}</strong>
          </div>
        </div>
      )}

      {/* Next signal */}
      <div style={{
        background: "rgba(100,220,130,0.05)", border: "1px solid rgba(100,220,130,0.15)",
        borderRadius: 5, padding: "7px 10px",
      }}>
        <div style={{ fontSize: 7.5, color: "#64DC82", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
          Nächstes Signal
        </div>
        <div style={{ display: "flex", gap: 20 }}>
          <div>
            <div style={{ fontSize: 7, color: C_DIM }}>ENTRY</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: C_WHITE }}>{p.next_entry || "—"}</div>
          </div>
          <div>
            <div style={{ fontSize: 7, color: C_DIM }}>EXIT</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: C_WHITE }}>{p.next_exit || "—"}</div>
          </div>
          <div>
            <div style={{ fontSize: 7, color: C_DIM }}>SIDE</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: dirUpper === "SHORT" ? C_GOLD : C_WHITE }}>{dirUpper}</div>
          </div>
          <div>
            <div style={{ fontSize: 7, color: C_DIM }}>SIZE</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: C_MUTED }}>5%</div>
          </div>
        </div>
      </div>

      {/* Execution note */}
      <div style={{ background: C_BG, borderRadius: 5, padding: "7px 10px" }}>
        <div style={{ fontSize: 7.5, color: C_DIM, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
          Execution
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <span style={{ fontSize: 7.5, color: C_DIM, minWidth: 32, flexShrink: 0 }}>ENTRY</span>
            <span style={{ fontSize: 9, color: C_WHITE, lineHeight: 1.4 }}>Open am Einstiegstag ({p.next_entry || "nächster Termin"})</span>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <span style={{ fontSize: 7.5, color: C_DIM, minWidth: 32, flexShrink: 0 }}>EXIT</span>
            <span style={{ fontSize: 9, color: C_WHITE, lineHeight: 1.4 }}>Close am Ausstiegstag ({p.next_exit || "nächster Termin"})</span>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <span style={{ fontSize: 7.5, color: C_DIM, minWidth: 32, flexShrink: 0 }}>STOP</span>
            <span style={{ fontSize: 9, color: C_MUTED }}>Kein Stop-Loss — kalenderbasierter Exit</span>
          </div>
        </div>
      </div>

      {/* Economic rationale */}
      {p.rationale_text && (
        <div style={{
          background: "rgba(255,255,255,0.02)", border: `1px solid ${C_BORDER}`,
          borderRadius: 5, padding: "7px 10px",
        }}>
          <div style={{ fontSize: 7.5, color: C_DIM, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
            Ökonomische Logik
          </div>
          <div style={{ fontSize: 8.5, color: C_MUTED, lineHeight: 1.55 }}>
            {p.rationale_text}
          </div>
        </div>
      )}

      {p.tier === "watchlist" && (
        <div style={{ fontSize: 8, color: C_DIM, padding: "4px 6px", borderLeft: "2px solid rgba(154,170,184,0.3)", lineHeight: 1.5 }}>
          Research-Tier — statistisch signifikant, aber ohne FDR-Korrektur. Nur zur Beobachtung, nicht für Live-Signale.
        </div>
      )}
    </div>
  );
}

export function AgentPortfolioPanel() {
  const [selected, setSelected] = useState<number>(AGENT_PATTERNS[0].rank);

  const selectedPattern = AGENT_PATTERNS.find((p) => p.rank === selected) ?? AGENT_PATTERNS[0];

  return (
    <div style={{
      display: "flex", flex: 1, minHeight: 0, overflow: "hidden",
      fontFamily: "Montserrat, Segoe UI, sans-serif",
    }}>
      {/* Left: pattern list */}
      <div style={{
        width: 240, flexShrink: 0, borderRight: `1px solid ${C_BORDER}`,
        display: "flex", flexDirection: "column", minHeight: 0, overflowY: "auto",
      }}>
        {/* Header row */}
        <div style={{
          padding: "5px 8px", borderBottom: `1px solid ${C_BORDER}`,
          display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0,
        }}>
          <span style={{ fontSize: 7.5, color: C_DIM, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {AGENT_PORTFOLIO_N} Muster · {AGENT_PORTFOLIO_GENERATED}
          </span>
          <span style={{ fontSize: 7.5, color: C_DIM }}>WR · Sort</span>
        </div>
        {AGENT_PATTERNS.map((p) => (
          <PatternRow
            key={`${p.rank}-${p.asset}`}
            p={p}
            selected={selected === p.rank}
            onSelect={() => setSelected(p.rank)}
          />
        ))}
      </div>

      {/* Right: detail */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
        <DetailPanel p={selectedPattern} />
      </div>
    </div>
  );
}
