"use client";

const GOLD    = "#C9A84C";
const CARD_BG = "#1F1F1F";
const BORDER  = "rgba(255,255,255,0.06)";
const MUTED   = "rgba(255,255,255,0.42)";

function CalendarIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  );
}

const SEASONAL_HIGHLIGHTS = [
  { month: "Jan", bias: "bullish",  note: "Starkes Januareffekt-Muster in EUR" },
  { month: "Sep", bias: "bearish",  note: "Saisonale Schwäche in Equity-Indizes" },
  { month: "Nov", bias: "bullish",  note: "Year-End-Rally historisch stark" },
  { month: "Aug", bias: "neutral",  note: "Geringes Volumen, erhöhte Volatilität" },
];

const COLOR = { bullish: "#22C55E", bearish: "#ef4444", neutral: GOLD };

export function MobileSeasonalityView() {
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
      <header style={{ position: "sticky", top: 0, zIndex: 20, padding: "16px 16px 12px", background: "linear-gradient(#0c0d10 68%, rgba(12,13,16,0))" }}>
        <p style={{ margin: "0 0 1px", fontSize: 9, fontWeight: 600, color: MUTED, textTransform: "uppercase", letterSpacing: "0.07em" }}>RESEARCH</p>
        <h1 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: "#fafafa" }}>Seasonality</h1>
        <p style={{ margin: "2px 0 0", fontSize: 11, color: MUTED, fontWeight: 600 }}>Saisonale Muster & Kalender-Anomalien</p>
      </header>

      <div style={{ padding: "8px 16px 120px", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Info banner */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, background: `${GOLD}0A`, border: `1px solid ${GOLD}25`, borderRadius: 16, padding: "14px 16px" }}>
          <CalendarIcon />
          <div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: GOLD }}>Desktop-Tool</p>
            <p style={{ margin: "2px 0 0", fontSize: 11, color: "rgba(255,255,255,0.55)" }}>Vollständige Analyse im Desktop-Terminal verfügbar</p>
          </div>
        </div>

        {/* Seasonal highlights */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Key Seasonal Patterns · Read-only</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {SEASONAL_HIGHLIGHTS.map((s, i) => (
              <div key={i} style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "11px 14px", display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 42, height: 42, borderRadius: 10, background: `${COLOR[s.bias as keyof typeof COLOR]}14`, border: `1px solid ${COLOR[s.bias as keyof typeof COLOR]}30`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: COLOR[s.bias as keyof typeof COLOR], letterSpacing: "0.04em" }}>{s.month}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#fafafa" }}>{s.month}</span>
                    <span style={{ fontSize: 9.5, fontWeight: 700, color: COLOR[s.bias as keyof typeof COLOR], border: `1px solid ${COLOR[s.bias as keyof typeof COLOR]}40`, borderRadius: 4, padding: "1px 5px", textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>
                      {s.bias}
                    </span>
                  </div>
                  <p style={{ margin: "2px 0 0", fontSize: 11, color: MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.note}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Disclaimer */}
        <div style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${BORDER}`, borderRadius: 12, padding: "11px 14px" }}>
          <p style={{ margin: 0, fontSize: 11, color: MUTED, lineHeight: 1.6 }}>
            Vollständige Heatmaps, Roll-Artifact-gefilterte Wochentagsmuster und drift-korrigierte Saisonalität sind ausschließlich im Desktop-Terminal verfügbar.
          </p>
        </div>
      </div>
    </div>
  );
}
