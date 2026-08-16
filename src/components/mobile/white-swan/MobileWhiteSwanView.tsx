"use client";

import { useEffect, useMemo, useState } from "react";

// ─── Types — mirror the actual /api/white-swan-final response
// (final-normalized/summary.json), same endpoint WhiteSwanAnalytics.tsx uses. ──

interface FinalRecommendation {
  variantId: string;
  eurFilter: string; d2hFilter: string; gldFilter: string; sizingTier: string;
  alpha_netCAGR_1c: number; scaledNetCAGR: number; oosCAGR: number;
  sharpe: number; maxDD: number; marginPct: number; totalMargin_EUR: number;
  costsAnnual_1c: number; scaledCostsAnnual: number;
}
interface CapitalLevel {
  capitalAssessment: string; capitalAssessmentNote: string;
  finalCandidates: number; aggressiveVariants: number;
  finalRecommendation: FinalRecommendation | null;
}
interface Summary {
  schemaVersion: string; generatedDate: string; status: string;
  ibkrCostsVerifiedDate: string; ibkrCosts: Record<string, number>;
  elapsedYears: number; conservativeMarginTotal_EUR: number;
  minimumCapitalFor30pctRule_EUR: number;
  capitalLevels: Record<string, CapitalLevel>;
}

const GOLD = "#C9A84C";
const CARD_BG = "#1F1F1F";
const CARD_BORDER = "rgba(255,255,255,0.06)";

const fmtEUR = (n: number | null | undefined) => (n == null ? "—" : `€${Math.round(n).toLocaleString("de-DE")}`);
const fmtPct = (n: number | null | undefined, d = 2) => (n == null ? "—" : `${n.toFixed(d)}%`);
const fmtNum = (n: number | null | undefined, d = 2) => (n == null ? "—" : n.toFixed(d));
const fmtCap = (c: number) => (c >= 1000 ? `€${c % 1000 === 0 ? c / 1000 : (c / 1000).toFixed(1)}k` : `€${c}`);

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  const color = ok ? "#22c55e" : "#ef4444";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, background: `${color}12`, border: `1px solid ${color}35`, borderRadius: 10, padding: "8px 10px" }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />
      <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.82)" }}>{label}</span>
    </div>
  );
}

function Kpi({ label, value, gold, sub }: { label: string; value: string; gold?: boolean; sub?: string }) {
  return (
    <div style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 12, padding: "10px 12px", minWidth: 0 }}>
      <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: gold ? GOLD : "#e8eaed", fontFamily: "var(--font-numbers, monospace)" }}>{value}</div>
      {sub && <div style={{ fontSize: 9, color: "rgba(255,255,255,0.32)", marginTop: 1 }}>{sub}</div>}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "4px 0 2px" }}>
      {children}
    </div>
  );
}

export function MobileWhiteSwanView() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState(false);
  const [selectedCapital, setSelectedCapital] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/white-swan-final?type=summary")
      .then(r => r.json())
      .then((d: Summary) => {
        if (!d.capitalLevels) { setError(true); return; }
        setSummary(d);
        const caps = Object.keys(d.capitalLevels).map(Number).sort((a, b) => a - b);
        const firstPass = caps.find(c => d.capitalLevels[String(c)].capitalAssessment === "PASS");
        setSelectedCapital(String(firstPass ?? caps[0]));
      })
      .catch(() => setError(true));
  }, []);

  const caps = useMemo(
    () => (summary ? Object.keys(summary.capitalLevels).map(Number).sort((a, b) => a - b) : []),
    [summary],
  );
  const level = summary && selectedCapital ? summary.capitalLevels[selectedCapital] : null;
  const rec = level?.finalRecommendation ?? null;

  if (error) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "rgba(255,255,255,0.4)", fontSize: 13 }}>
        White Swan Daten nicht erreichbar.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
      <header style={{ position: "sticky", top: 0, zIndex: 20, padding: "16px 16px 10px", background: "linear-gradient(#0c0d10 68%, rgba(12,13,16,0))" }}>
        <h1 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: "#fafafa", fontFamily: "var(--font-text), sans-serif" }}>White Swan</h1>
        <p style={{ margin: "2px 0 0", fontSize: 11, color: "rgba(255,255,255,0.42)", fontWeight: 600 }}>
          {summary ? `Zero-Cost Portfolio · Stand ${summary.generatedDate}` : "wird geladen…"}
        </p>
      </header>

      {!summary ? (
        <div style={{ padding: "40px 16px", textAlign: "center", color: "rgba(255,255,255,0.35)", fontSize: 13 }}>Lädt…</div>
      ) : (
        <div style={{ padding: "6px 16px 100px", display: "flex", flexDirection: "column", gap: 18 }}>

          {/* Honest research status — this product is not yet "validated final" */}
          <div>
            <SectionTitle>Status</SectionTitle>
            <StatusPill ok={summary.status === "VALIDATED"} label={summary.status.replace(/_/g, " ")} />
          </div>

          {/* Capital selector */}
          <div>
            <SectionTitle>Kapital</SectionTitle>
            <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, WebkitOverflowScrolling: "touch" }}>
              {caps.map(cap => {
                const active = String(cap) === selectedCapital;
                const capLevel = summary.capitalLevels[String(cap)];
                const pass = capLevel.capitalAssessment === "PASS";
                return (
                  <button
                    key={cap}
                    onClick={() => setSelectedCapital(String(cap))}
                    style={{
                      flex: "0 0 auto", padding: "9px 16px", borderRadius: 999,
                      border: `1px solid ${active ? GOLD : "rgba(255,255,255,0.12)"}`,
                      background: active ? "rgba(201,168,76,0.14)" : "rgba(255,255,255,0.03)",
                      color: active ? GOLD : pass ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.3)",
                      fontSize: 13, fontWeight: 700, fontFamily: "var(--font-numbers, monospace)",
                      WebkitTapHighlightColor: "transparent",
                    }}
                  >
                    {fmtCap(cap)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected tier */}
          {level && (
            <div>
              <SectionTitle>Kapital-Assessment bei {fmtCap(Number(selectedCapital))}</SectionTitle>
              <StatusPill ok={level.capitalAssessment === "PASS"} label={level.capitalAssessment.replace(/_/g, " ")} />
              <p style={{ margin: "8px 0 0", fontSize: 11.5, color: "rgba(255,255,255,0.5)", lineHeight: 1.5 }}>{level.capitalAssessmentNote}</p>
            </div>
          )}

          {level && (
            <Kpi label="Finalisten" value={String(level.finalCandidates)} sub={`von ${level.aggressiveVariants} Varianten geprüft`} />
          )}

          {/* Best variant KPIs */}
          {rec && (
            <div>
              <SectionTitle>Beste Variante bei {fmtCap(Number(selectedCapital))}</SectionTitle>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <Kpi label="Net CAGR" value={fmtPct(rec.scaledNetCAGR, 1)} gold />
                <Kpi label="OOS CAGR" value={fmtPct(rec.oosCAGR, 1)} />
                <Kpi label="Sharpe" value={fmtNum(rec.sharpe)} />
                <Kpi label="Max DD" value={fmtPct(rec.maxDD, 1)} />
                <Kpi label="Margin" value={fmtPct(rec.marginPct, 1)} sub={fmtEUR(rec.totalMargin_EUR)} />
                <Kpi label="Kosten p.a." value={fmtEUR(rec.scaledCostsAnnual)} />
              </div>
              <div style={{ marginTop: 10, background: CARD_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 12, padding: "10px 12px" }}>
                <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Filter-Kombination</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {[rec.eurFilter, rec.d2hFilter, rec.gldFilter, rec.sizingTier].map(tag => (
                    <span key={tag} style={{ fontSize: 10.5, padding: "5px 9px", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.6)" }}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {level && !rec && (
            <div style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 12, padding: 12 }}>
              <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
                Bei {fmtCap(Number(selectedCapital))} gibt es keine finale Empfehlung — Margin-Anforderung wird nicht erfüllt.
              </p>
            </div>
          )}

          {/* Capital comparison */}
          <div>
            <SectionTitle>Kapital-Vergleich</SectionTitle>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {caps.map(cap => {
                const l = summary.capitalLevels[String(cap)];
                const r = l.finalRecommendation;
                return (
                  <button
                    key={cap}
                    onClick={() => setSelectedCapital(String(cap))}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      background: String(cap) === selectedCapital ? "rgba(201,168,76,0.08)" : CARD_BG,
                      border: `1px solid ${String(cap) === selectedCapital ? "rgba(201,168,76,0.3)" : CARD_BORDER}`,
                      borderRadius: 10, padding: "8px 12px", textAlign: "left", WebkitTapHighlightColor: "transparent",
                    }}
                  >
                    <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.8)", fontFamily: "var(--font-numbers, monospace)" }}>{fmtCap(cap)}</span>
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>{r ? `${fmtPct(r.scaledNetCAGR, 1)} CAGR` : "—"}</span>
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>{r ? `${fmtNum(r.sharpe)} Sharpe` : "—"}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: l.capitalAssessment === "PASS" ? "#22c55e" : "#ef4444" }}>
                      {l.capitalAssessment.replace(/_/g, " ")}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ background: "linear-gradient(135deg, rgba(201,168,76,0.10), rgba(201,168,76,0.02))", border: "1px solid rgba(201,168,76,0.25)", borderRadius: 14, padding: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: GOLD, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Kontext</div>
            <p style={{ margin: 0, fontSize: 12.5, color: "rgba(255,255,255,0.75)", lineHeight: 1.5 }}>
              Mindestkapital für die strikte 30%-Margin-Regel: <strong style={{ color: GOLD }}>{fmtEUR(summary.minimumCapitalFor30pctRule_EUR)}</strong>.
              IBKR-Kosten geprüft am {summary.ibkrCostsVerifiedDate}.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
