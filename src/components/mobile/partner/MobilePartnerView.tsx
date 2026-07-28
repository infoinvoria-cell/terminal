"use client";

import { useState } from "react";
import { calcAP, formatEur, formatPct } from "@/lib/partner/partnerCalculations";
import { PARTNER_PROGRAM_CONFIG } from "@/lib/partner/partnerProgramConfig";
import { PartnerWhiteboardModal } from "@/components/partner/PartnerWhiteboardModal";

// ── Design tokens (inline only — no Tailwind) ─────────────────────────────────

const C = {
  bg:     "#0c0d10",
  card:   "linear-gradient(180deg, #1c1d20 0%, #141517 100%)",
  border: "rgba(255,255,255,0.06)",
  gold:   "#e2ca7a",
  text:   "#f4f5f7",
  muted:  "rgba(255,255,255,0.4)",
  dimmed: "rgba(255,255,255,0.18)",
  green:  "#4ade80",
  red:    "#f87171",
  font:   "var(--font-montserrat, sans-serif)",
} as const;

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      margin: "0 0 10px",
      fontSize: 10, fontWeight: 700,
      color: C.muted,
      textTransform: "uppercase" as const,
      letterSpacing: "0.07em",
      fontFamily: C.font,
    }}>
      {children}
    </p>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 12,
      padding: "14px",
      ...style,
    }}>
      {children}
    </div>
  );
}

// ── Fee flow (generic example) ─────────────────────────────────────────────────

const EXAMPLE_PROFIT = 100_000;
const PF_RATE  = PARTNER_PROGRAM_CONFIG.performanceFeeRate;   // 0.25
const IN_RATE  = PARTNER_PROGRAM_CONFIG.innoInvestRate;       // 0.125
const PF       = Math.round(EXAMPLE_PROFIT * PF_RATE);        // 25 000
const INNO     = Math.round(PF * IN_RATE);                    // 3 125
const CL_BASE  = PF - INNO;                                   // 21 875

// ── Main view ─────────────────────────────────────────────────────────────────

export function MobilePartnerView() {
  const [showWhiteboard, setShowWhiteboard] = useState(false);
  const [apInput, setApInput]               = useState("");
  const [lockup, setLockup]                 = useState<1 | 3 | 5>(1);

  const apEur    = parseFloat(apInput) || 0;
  const apResult = apEur > 0 ? calcAP(apEur, lockup) : null;

  return (
    <>
      {showWhiteboard && (
        <PartnerWhiteboardModal onClose={() => setShowWhiteboard(false)} />
      )}

      <div style={{ height: "100%", overflowY: "auto", overflowX: "hidden", background: C.bg }}>
        <div style={{ padding: "12px 16px 120px", display: "flex", flexDirection: "column", gap: 12 }}>

          {/* ── Header + Whiteboard Button ────────────────────────────────── */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
            <div>
              <p style={{ margin: 0, fontSize: 9.5, fontWeight: 700, color: `${C.gold}99`, letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: C.font }}>
                Capitalife
              </p>
              <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: C.text, fontFamily: C.font }}>
                Partnerprogramm
              </p>
            </div>
            <button
              onClick={() => setShowWhiteboard(true)}
              style={{
                background: `rgba(226,202,122,0.1)`,
                border: `1px solid rgba(226,202,122,0.3)`,
                borderRadius: 8,
                padding: "8px 12px",
                display: "flex", alignItems: "center", gap: 6,
                color: C.gold,
                fontSize: 11, fontWeight: 700,
                cursor: "pointer",
                fontFamily: C.font,
                WebkitTapHighlightColor: "transparent",
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
                <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
              </svg>
              Whiteboard
            </button>
          </div>

          {/* ── Section: Performance-Fee Ablauf ───────────────────────────── */}
          <Card>
            <SectionTitle>Performance-Fee Ablauf (Beispiel)</SectionTitle>
            <p style={{ margin: "0 0 10px", fontSize: 10, color: C.dimmed, fontFamily: C.font }}>
              Basis: {formatEur(EXAMPLE_PROFIT)} Investor-Gewinn
            </p>

            {[
              { label: "Investorengewinn",          value: formatEur(EXAMPLE_PROFIT), indent: false, hi: false },
              { label: `Performance Fee ${(PF_RATE * 100).toFixed(0)} %`, value: `−${formatEur(PF)}`, indent: true, hi: false },
              { label: `InnoInvest ${(IN_RATE * 100).toFixed(1)} %`,      value: `−${formatEur(INNO)}`, indent: true, hi: false },
              { label: "CL-Basis",                  value: formatEur(CL_BASE), indent: true, hi: false },
              { label: "Partneranteil (nach Stufe)", value: "40 % Gold → 8.750 €", indent: true, hi: true },
            ].map(({ label, value, indent, hi }, i) => (
              <div key={i} style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 7,
                paddingLeft: indent ? 10 : 0,
                borderLeft: hi ? `2px solid ${C.gold}` : indent ? "2px solid rgba(255,255,255,0.07)" : "none",
              }}>
                <span style={{ flex: 1, fontSize: 11, color: hi ? C.gold : C.muted, fontFamily: C.font }}>{label}</span>
                <span style={{ fontSize: 12, fontWeight: hi ? 700 : 500, color: hi ? C.gold : C.text, fontFamily: C.font }}>{value}</span>
              </div>
            ))}

            <p style={{ margin: "8px 0 0", fontSize: 9.5, color: C.dimmed, fontFamily: C.font, textAlign: "center" }}>
              ≈ 8,75 % des Investorengewinns · 35 % der Performance Fee
            </p>
          </Card>

          {/* ── Section: Partnerstufen ────────────────────────────────────── */}
          <Card>
            <SectionTitle>Partnerstufen</SectionTitle>

            {/* Column headers */}
            <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
              <span style={{ flex: 1, fontSize: 9, color: C.dimmed, fontFamily: C.font }}>Stufe</span>
              <span style={{ fontSize: 9, color: C.dimmed, fontFamily: C.font, width: 46, textAlign: "right" }}>CL-Ant.</span>
              <span style={{ fontSize: 9, color: C.dimmed, fontFamily: C.font, width: 72, textAlign: "right" }}>Vol. regulär</span>
              <span style={{ fontSize: 9, color: C.dimmed, fontFamily: C.font, width: 72, textAlign: "right" }}>Vol. Founder</span>
            </div>

            {PARTNER_PROGRAM_CONFIG.tiers.map((t) => (
              <div key={t.id} style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "6px 4px",
                marginBottom: 1,
                borderBottom: "1px solid rgba(255,255,255,0.04)",
              }}>
                <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: C.text, fontFamily: C.font }}>
                  {t.label}
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, color: C.gold, fontFamily: C.font, width: 46, textAlign: "right" }}>
                  {(t.clShareRate * 100).toFixed(0)} %
                </span>
                <span style={{ fontSize: 10, color: C.muted, fontFamily: C.font, width: 72, textAlign: "right" }}>
                  {t.volThreshold === 0 ? "–" : formatEur(t.volThreshold)}
                </span>
                <span style={{ fontSize: 10, color: `${C.gold}88`, fontFamily: C.font, width: 72, textAlign: "right" }}>
                  {t.founderThreshold === 0 ? "–" : formatEur(t.founderThreshold)}
                </span>
              </div>
            ))}

            <p style={{ margin: "8px 0 0", fontSize: 9, color: C.dimmed, fontFamily: C.font }}>
              ★ Founder-Schwellen: 50 % reduziert · Mgmt. Fee ab Platin (TBD)
            </p>
          </Card>

          {/* ── Section: AP-Sätze ─────────────────────────────────────────── */}
          <Card>
            <SectionTitle>Abschlussprovision (AP)</SectionTitle>
            <p style={{ margin: "0 0 10px", fontSize: 10, color: C.dimmed, fontFamily: C.font }}>
              Direkt auf den Investitionsbetrag · sofort bei Abschluss
            </p>

            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              {PARTNER_PROGRAM_CONFIG.apRates.map((ap) => (
                <div key={ap.lockupYears} style={{
                  flex: 1,
                  background: "rgba(226,202,122,0.07)",
                  border: `1px solid rgba(226,202,122,0.2)`,
                  borderRadius: 8,
                  padding: "10px 4px",
                  textAlign: "center",
                }}>
                  <p style={{ margin: "0 0 2px", fontSize: 9, color: C.muted, fontFamily: C.font }}>{ap.lockupYears}J Bindung</p>
                  <p style={{ margin: 0, fontSize: 18, fontWeight: 800, color: C.gold, fontFamily: C.font }}>
                    {(ap.rate * 100).toFixed(1)} %
                  </p>
                </div>
              ))}
            </div>
          </Card>

          {/* ── Section: AP Rechner ───────────────────────────────────────── */}
          <Card>
            <SectionTitle>AP Rechner</SectionTitle>

            <input
              type="number"
              inputMode="numeric"
              value={apInput}
              onChange={(e) => setApInput(e.target.value)}
              placeholder="Anlagebetrag in €"
              style={{
                width: "100%",
                padding: "10px 12px",
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.10)",
                borderRadius: 8,
                color: C.text,
                fontSize: 14,
                fontFamily: C.font,
                outline: "none",
                boxSizing: "border-box" as const,
                marginBottom: 10,
              }}
            />

            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              {([1, 3, 5] as const).map((y) => (
                <button key={y} onClick={() => setLockup(y)} style={{
                  flex: 1,
                  padding: "8px 0",
                  background: lockup === y ? C.gold : "rgba(255,255,255,0.06)",
                  border: "none",
                  borderRadius: 8,
                  color: lockup === y ? "#0c0d10" : C.muted,
                  fontSize: 12, fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: C.font,
                  WebkitTapHighlightColor: "transparent",
                  transition: "background 150ms, color 150ms",
                }}>
                  {y}J
                </button>
              ))}
            </div>

            {apResult ? (
              <div style={{
                background: "rgba(226,202,122,0.06)",
                border: `1px solid rgba(226,202,122,0.15)`,
                borderRadius: 8,
                padding: "10px 12px",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                  <span style={{ fontSize: 11, color: C.muted, fontFamily: C.font }}>Satz</span>
                  <span style={{ fontSize: 11, color: C.gold, fontWeight: 600, fontFamily: C.font }}>
                    {formatPct(apResult.rate)}
                  </span>
                </div>
                <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "4px 0" }} />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: C.text, fontFamily: C.font }}>AP</span>
                  <span style={{ fontSize: 18, fontWeight: 700, color: C.gold, fontFamily: C.font }}>
                    {formatEur(apResult.apAmount)}
                  </span>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "12px 0" }}>
                <span style={{ fontSize: 11, color: C.dimmed, fontFamily: C.font }}>Anlagebetrag eingeben</span>
              </div>
            )}
          </Card>

          {/* ── Section: Volumenberechnung ────────────────────────────────── */}
          <Card>
            <SectionTitle>Aktives Volumen — Was zählt?</SectionTitle>
            {[
              { label: "Eigenes aktiv investiertes Kapital", ok: true  },
              { label: "Aktives Kapital direkter Teampartner", ok: true  },
              { label: "Gekündigte Investments",               ok: false },
              { label: "Vollständig ausgezahlte Investments",  ok: false },
              { label: "Nicht eingezahlte Zeichnungen",        ok: false },
            ].map(({ label, ok }) => (
              <div key={label} style={{
                display: "flex", alignItems: "center", gap: 8,
                marginBottom: 7,
              }}>
                <span style={{ fontSize: 13, color: ok ? C.green : C.red, flexShrink: 0 }}>
                  {ok ? "✓" : "✗"}
                </span>
                <span style={{ fontSize: 11, color: ok ? C.text : C.muted, fontFamily: C.font }}>{label}</span>
              </div>
            ))}
            <p style={{ margin: "6px 0 0", fontSize: 9, color: C.dimmed, fontFamily: C.font }}>
              Teamstruktur: aktuell nur direkte Ebene (Tiefe 1)
            </p>
          </Card>

          {/* ── Section: Verwaltungsgebühr ────────────────────────────────── */}
          <Card>
            <SectionTitle>Verwaltungsgebühr (Mgmt. Fee)</SectionTitle>
            {[
              { label: "Gesamt p.a.", value: `${(PARTNER_PROGRAM_CONFIG.managementFeeRate * 100).toFixed(1)} %` },
              { label: "InnoInvest",  value: `${(PARTNER_PROGRAM_CONFIG.innoInvestMgmtRate * 100).toFixed(1)} % des Anteils` },
              { label: "Platin / Black", value: "Beteiligung TBD" },
            ].map(({ label, value }) => (
              <div key={label} style={{
                display: "flex", justifyContent: "space-between",
                alignItems: "center", marginBottom: 8,
              }}>
                <span style={{ fontSize: 11, color: C.muted, fontFamily: C.font }}>{label}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: C.text, fontFamily: C.font }}>{value}</span>
              </div>
            ))}
            <p style={{ margin: "6px 0 0", fontSize: 9, color: C.dimmed, fontFamily: C.font }}>
              Finanziert Betrieb und Abschlussprovisionen
            </p>
          </Card>

        </div>
      </div>
    </>
  );
}
