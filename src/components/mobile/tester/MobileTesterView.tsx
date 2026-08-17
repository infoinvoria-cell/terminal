"use client";

const GOLD      = "#C9A84C";
const CARD_BG   = "#1F1F1F";
const BORDER    = "rgba(255,255,255,0.06)";
const MUTED     = "rgba(255,255,255,0.42)";

function FlaskIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 3h6v10.6a6 6 0 0 1-6 0V3z"/><path d="M9 3H6l-3 17h18L18 3h-3"/>
    </svg>
  );
}

type MetricRow = { label: string; value: string; sub?: string };

const METRICS: MetricRow[] = [
  { label: "Aktive Strategien",     value: "5",           sub: "Production Sleeves" },
  { label: "Walk-Forward-Perioden", value: "12",          sub: "OOS-validiert" },
  { label: "Beste OOS CAGR",        value: "+24.4%",      sub: "White Swan v6.3.5" },
  { label: "Schlechteste MDD",      value: "−14.2%",      sub: "Worst-case OOS" },
];

export function MobileTesterView() {
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
      <header style={{ position: "sticky", top: 0, zIndex: 20, padding: "16px 16px 12px", background: "linear-gradient(#0c0d10 68%, rgba(12,13,16,0))" }}>
        <p style={{ margin: "0 0 1px", fontSize: 9, fontWeight: 600, color: MUTED, textTransform: "uppercase", letterSpacing: "0.07em" }}>RESEARCH</p>
        <h1 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: "#fafafa" }}>Strategy Tester</h1>
        <p style={{ margin: "2px 0 0", fontSize: 11, color: MUTED, fontWeight: 600 }}>Backtest & Walk-Forward-Ergebnisse</p>
      </header>

      <div style={{ padding: "8px 16px 120px", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Info banner */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, background: `${GOLD}0A`, border: `1px solid ${GOLD}25`, borderRadius: 16, padding: "14px 16px" }}>
          <FlaskIcon />
          <div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: GOLD }}>Desktop-Tool</p>
            <p style={{ margin: "2px 0 0", fontSize: 11, color: "rgba(255,255,255,0.55)" }}>Vollständiger Tester im Desktop-Terminal verfügbar</p>
          </div>
        </div>

        {/* Summary metrics — read-only */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Zusammenfassung · Read-only</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 0, background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: "hidden" }}>
            {METRICS.map((m, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 14px", borderTop: i > 0 ? `1px solid ${BORDER}` : "none" }}>
                <div>
                  <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.80)", fontWeight: 500 }}>{m.label}</div>
                  {m.sub && <div style={{ fontSize: 10, color: MUTED, marginTop: 1 }}>{m.sub}</div>}
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: m.value.startsWith("+") ? "#22C55E" : m.value.startsWith("−") || m.value.startsWith("-") ? "#ef4444" : "#fff" }}>
                  {m.value}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Disclaimer */}
        <div style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${BORDER}`, borderRadius: 12, padding: "11px 14px" }}>
          <p style={{ margin: 0, fontSize: 11, color: MUTED, lineHeight: 1.6 }}>
            Interaktive Backtest-Konfiguration, Parameter-Sweep und Equity-Kurven-Detail sind ausschließlich im Desktop-Terminal verfügbar. Diese Seite zeigt ausschließlich aggregierte Read-only-Kennzahlen.
          </p>
        </div>
      </div>
    </div>
  );
}
