"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

const CARD_BG   = "#1F1F1F";
const BORDER    = "rgba(255,255,255,0.06)";
const SHADOW    = "0 8px 20px -8px rgba(0,0,0,0.55)";
const GOLD      = "#C9A84C";
const MUTED     = "rgba(255,255,255,0.42)";

// ── Icons ──────────────────────────────────────────────────────────────────────
function IconFlask() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 3h6v10.6a6 6 0 0 1-6 0V3z"/><path d="M9 3H6l-3 17h18L18 3h-3"/>
    </svg>
  );
}
function IconCalendar() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  );
}
function IconTrendingUp() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>
    </svg>
  );
}
function IconTarget() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
    </svg>
  );
}
function IconLayers() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>
    </svg>
  );
}
function IconExternalLink() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
    </svg>
  );
}

// ── Research tool definition ────────────────────────────────────────────────────
type ToolDef = {
  id: string;
  label: string;
  sub: string;
  Icon: () => React.ReactElement;
  href: string;
  mobile: boolean;
  status?: "active" | "local" | "unavailable";
  badge?: string;
};

const TOOLS: ToolDef[] = [
  {
    id: "tester",
    label: "Strategy Tester",
    sub: "Backtest & Walk-Forward-Ergebnisse",
    Icon: IconFlask,
    href: "/m/signale",
    mobile: true,
    status: "active",
  },
  {
    id: "seasonality",
    label: "Seasonality",
    sub: "Saisonale Muster & Kalender-Anomalien",
    Icon: IconCalendar,
    href: "/m/signale",
    mobile: true,
    status: "active",
  },
  {
    id: "analytics",
    label: "Portfolio Analytics",
    sub: "Equity-Kurve, Drawdown, Perioden-Returns",
    Icon: IconTrendingUp,
    href: "/m/analytics",
    mobile: true,
    status: "active",
  },
  {
    id: "mva",
    label: "MVA — Multi-Variate",
    sub: "Korrelationsmatrix & Factor-Exposition",
    Icon: IconTarget,
    href: "/m/analytics",
    mobile: true,
    status: "active",
  },
  {
    id: "forward",
    label: "Shadow / Forward",
    sub: "Live-Forward-Logger & Realzeit-Tracking",
    Icon: IconLayers,
    href: "/m/signals",
    mobile: true,
    status: "active",
  },
];

// ── Summary stat from White Swan ────────────────────────────────────────────────
type WsSummary = { capitalLevels?: Record<string, { finalRecommendation?: { oosCAGR?: number; sharpe?: number } }> };

export function MobileResearchView() {
  const [wsStat, setWsStat] = useState<{ cagr: number; sharpe: number } | null>(null);

  useEffect(() => {
    fetch("/api/white-swan-final?type=summary")
      .then(r => r.json())
      .then((j: WsSummary) => {
        const levels = j.capitalLevels;
        if (!levels) return;
        const first = Object.values(levels)[0];
        const rec = first?.finalRecommendation;
        if (rec?.oosCAGR != null && rec?.sharpe != null) {
          setWsStat({ cagr: rec.oosCAGR, sharpe: rec.sharpe });
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
      <header style={{ position: "sticky", top: 0, zIndex: 20, padding: "16px 16px 12px", background: "linear-gradient(#0c0d10 68%, rgba(12,13,16,0))" }}>
        <p style={{ margin: "0 0 1px", fontSize: 9, fontWeight: 600, color: MUTED, fontFamily: "var(--font-text)", textTransform: "uppercase", letterSpacing: "0.07em" }}>RESEARCH</p>
        <h1 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: "#fafafa", fontFamily: "var(--font-text), sans-serif" }}>Tools</h1>
        <p style={{ margin: "2px 0 0", fontSize: 11, color: MUTED, fontWeight: 600 }}>Strategie-Research & Analyse</p>
      </header>

      <div style={{ padding: "8px 16px 120px", display: "flex", flexDirection: "column", gap: 14 }}>

        {/* White Swan quick KPI */}
        {wsStat && (
          <div style={{ background: `linear-gradient(135deg, ${GOLD}14 0%, transparent 80%)`, border: `1px solid ${GOLD}30`, borderRadius: 16, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: GOLD, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "var(--font-text)" }}>White Swan · Aktiv</p>
              <p style={{ margin: "2px 0 0", fontSize: 11, color: "rgba(255,255,255,0.55)", fontFamily: "var(--font-text)" }}>v6.3.5 · OOS validiert</p>
            </div>
            <div style={{ display: "flex", gap: 16 }}>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 9, color: MUTED, fontWeight: 600, textTransform: "uppercase" }}>OOS CAGR</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", fontFamily: "var(--font-numbers)" }}>{wsStat.cagr >= 0 ? "+" : ""}{wsStat.cagr.toFixed(1)}%</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 9, color: MUTED, fontWeight: 600, textTransform: "uppercase" }}>Sharpe</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", fontFamily: "var(--font-numbers)" }}>{wsStat.sharpe.toFixed(2)}</div>
              </div>
            </div>
          </div>
        )}

        {/* Tool cards */}
        <p style={{ margin: "4px 0 2px", fontSize: 11, fontWeight: 600, color: "#c8cad0", fontFamily: "var(--font-text)" }}>Research Werkzeuge</p>
        {TOOLS.map(tool => (
          <Link key={tool.id} href={tool.href} style={{ textDecoration: "none" }}>
            <div style={{
              background: CARD_BG,
              border: `1px solid ${BORDER}`,
              borderRadius: 16,
              boxShadow: SHADOW,
              padding: "14px 16px",
              display: "flex", alignItems: "center", gap: 14,
              WebkitTapHighlightColor: "transparent",
              cursor: "pointer",
            }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(201,168,76,0.1)", border: `1px solid ${GOLD}25`, display: "flex", alignItems: "center", justifyContent: "center", color: GOLD, flexShrink: 0 }}>
                <tool.Icon />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#fafafa", fontFamily: "var(--font-text)" }}>{tool.label}</span>
                  {tool.mobile && (
                    <span style={{ fontSize: 8.5, fontWeight: 700, color: "#22C55E", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 4, padding: "1px 5px", letterSpacing: "0.04em" }}>MOBIL</span>
                  )}
                </div>
                <p style={{ margin: "2px 0 0", fontSize: 11.5, color: MUTED, fontFamily: "var(--font-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tool.sub}</p>
              </div>
              <span style={{ color: MUTED, flexShrink: 0 }}><IconExternalLink /></span>
            </div>
          </Link>
        ))}

        {/* Info footer */}
        <div style={{ marginTop: 4, padding: "10px 14px", background: "rgba(255,255,255,0.03)", borderRadius: 12 }}>
          <p style={{ margin: 0, fontSize: 10.5, color: MUTED, lineHeight: 1.6, fontFamily: "var(--font-text)" }}>
            Execution deaktiviert · Read-only · Alle Signale sind informativ
          </p>
        </div>
      </div>
    </div>
  );
}
