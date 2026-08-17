"use client";

const GOLD    = "#C9A84C";
const CARD_BG = "#1F1F1F";
const BORDER  = "rgba(255,255,255,0.06)";
const MUTED   = "rgba(255,255,255,0.42)";

function TargetIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
    </svg>
  );
}

type FactorRow = { factor: string; exposure: string; direction: "positive" | "negative" | "neutral" };

const FACTORS: FactorRow[] = [
  { factor: "Momentum (12M)",   exposure: "0.72",  direction: "positive" },
  { factor: "Value",            exposure: "−0.31", direction: "negative" },
  { factor: "Volatility",       exposure: "0.15",  direction: "positive" },
  { factor: "Carry",            exposure: "0.58",  direction: "positive" },
  { factor: "Trend (6M)",       exposure: "0.44",  direction: "positive" },
  { factor: "Correlation Risk", exposure: "−0.22", direction: "negative" },
];

const DIR_COLOR = { positive: "#22C55E", negative: "#ef4444", neutral: GOLD };

export function MobileMvaView() {
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
      <header style={{ position: "sticky", top: 0, zIndex: 20, padding: "16px 16px 12px", background: "linear-gradient(#0c0d10 68%, rgba(12,13,16,0))" }}>
        <p style={{ margin: "0 0 1px", fontSize: 9, fontWeight: 600, color: MUTED, textTransform: "uppercase", letterSpacing: "0.07em" }}>RESEARCH</p>
        <h1 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: "#fafafa" }}>MVA</h1>
        <p style={{ margin: "2px 0 0", fontSize: 11, color: MUTED, fontWeight: 600 }}>Multi-Variate Analysis · Factor-Exposition</p>
      </header>

      <div style={{ padding: "8px 16px 120px", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Info banner */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, background: `${GOLD}0A`, border: `1px solid ${GOLD}25`, borderRadius: 16, padding: "14px 16px" }}>
          <TargetIcon />
          <div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: GOLD }}>Desktop-Tool</p>
            <p style={{ margin: "2px 0 0", fontSize: 11, color: "rgba(255,255,255,0.55)" }}>Vollständige Korrelationsmatrix im Desktop-Terminal</p>
          </div>
        </div>

        {/* Factor table */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Factor-Exposition · White Swan v6.3.5</div>
          <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: "hidden" }}>
            {FACTORS.map((f, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 14px", borderTop: i > 0 ? `1px solid ${BORDER}` : "none" }}>
                <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.80)", fontWeight: 500 }}>{f.factor}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: DIR_COLOR[f.direction], fontVariantNumeric: "tabular-nums" }}>
                  {f.exposure}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Disclaimer */}
        <div style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${BORDER}`, borderRadius: 12, padding: "11px 14px" }}>
          <p style={{ margin: 0, fontSize: 11, color: MUTED, lineHeight: 1.6 }}>
            Vollständige Korrelationsmatrix, Rolling-Window-Analyse und interaktiver Factor-Drill-Down ausschließlich im Desktop-Terminal verfügbar. Werte oben sind illustrativ für Mobile.
          </p>
        </div>
      </div>
    </div>
  );
}
