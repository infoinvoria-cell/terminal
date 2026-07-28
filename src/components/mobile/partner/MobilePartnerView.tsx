"use client";

import { useState } from "react";
import { useUser } from "@/context/user-context";
import { getPartnerProfile } from "@/lib/partner/partnerMockData";
import {
  calcPerformanceFeeDistribution,
  calcAP,
  tierProgress,
  formatEur,
  formatPct,
} from "@/lib/partner/partnerCalculations";
import { PARTNER_PROGRAM_CONFIG } from "@/lib/partner/partnerProgramConfig";

// ── Design tokens (inline only — no Tailwind) ─────────────────────────────────

const C = {
  bg:       "#0c0d10",
  card:     "linear-gradient(180deg, #1c1d20 0%, #141517 100%)",
  border:   "rgba(255,255,255,0.06)",
  gold:     "#e2ca7a",
  text:     "#f4f5f7",
  muted:    "rgba(255,255,255,0.4)",
  dimmed:   "rgba(255,255,255,0.18)",
  green:    "#4ade80",
  red:      "#f87171",
  font:     "var(--font-montserrat, sans-serif)",
} as const;

// Tiers that get the gold pill background (dark text on gold)
const GOLD_TIERS = new Set(["gold", "platin", "black"]);

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      margin: "0 0 10px",
      fontSize: 10,
      fontWeight: 700,
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

function KpiRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
      <span style={{ fontSize: 11, color: C.muted, fontFamily: C.font }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: C.text, fontFamily: C.font }}>{value}</span>
    </div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────

export function MobilePartnerView() {
  const { user } = useUser();
  const [apInput, setApInput]   = useState("");
  const [lockup, setLockup]     = useState<1 | 3 | 5>(1);

  if (!user) {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: C.bg }}>
        <span style={{ fontSize: 12, color: C.muted, fontFamily: C.font }}>Kein Nutzer aktiv</span>
      </div>
    );
  }

  const profile     = getPartnerProfile(user.id);
  const totalVol    = profile.totalActiveVolume;
  const isFounder   = profile.founderStatus;

  // Resolve live tier from volume (ignores stored partnerTier to stay consistent)
  const { current: tier, next, progress } = tierProgress(totalVol, isFounder);

  // Example fee distribution: 100 000 € investor profit
  const EXAMPLE_PROFIT = 100_000;
  const dist = calcPerformanceFeeDistribution(EXAMPLE_PROFIT, tier.id);

  // AP calculator
  const apEur    = parseFloat(apInput) || 0;
  const apResult = apEur > 0 ? calcAP(apEur, lockup) : null;

  // Tier pill style
  const tierPillStyle: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.06em",
    borderRadius: 99,
    padding: "2px 9px",
    fontFamily: C.font,
    background: GOLD_TIERS.has(tier.id) ? C.gold : "rgba(255,255,255,0.12)",
    color:      GOLD_TIERS.has(tier.id) ? "#0c0d10" : C.text,
  };

  return (
    <div style={{ height: "100%", overflowY: "auto", overflowX: "hidden", background: C.bg }}>
      <div style={{ padding: "12px 16px 120px", display: "flex", flexDirection: "column", gap: 12 }}>

        {/* ── Section A: Status Card ─────────────────────────────────────── */}
        <Card>
          {/* Name + badges */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: C.text, fontFamily: C.font }}>
              {profile.userName}
            </span>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {isFounder && (
                <span style={{
                  fontSize: 9, fontWeight: 700,
                  color: "#0c0d10", background: C.gold,
                  borderRadius: 99, padding: "2px 7px",
                  letterSpacing: "0.06em",
                  fontFamily: C.font,
                }}>
                  FOUNDER
                </span>
              )}
              <span style={tierPillStyle}>{tier.label.toUpperCase()}</span>
            </div>
          </div>

          {/* KPI rows */}
          <KpiRow label="Eigenes Volumen"  value={formatEur(profile.ownActiveVolume)} />
          <KpiRow label="Team-Volumen"     value={formatEur(profile.teamActiveVolume)} />
          <KpiRow label="Gesamt-Volumen"   value={formatEur(totalVol)} />

          {/* Progress bar to next tier */}
          {next ? (
            <div style={{ marginTop: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                <span style={{ fontSize: 10, color: C.muted, fontFamily: C.font }}>
                  Nächste Stufe: {next.label}
                </span>
                <span style={{ fontSize: 10, color: C.muted, fontFamily: C.font }}>
                  {Math.round(progress * 100)} %
                </span>
              </div>
              <div style={{ height: 4, borderRadius: 99, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                <div style={{
                  height: "100%",
                  width: `${Math.max(Math.round(progress * 100), 2)}%`,
                  background: C.gold,
                  borderRadius: 99,
                  transition: "width 600ms ease",
                }} />
              </div>
            </div>
          ) : (
            <p style={{ margin: "6px 0 0", fontSize: 10, color: C.gold, textAlign: "center", fontFamily: C.font }}>
              Hochste Stufe erreicht
            </p>
          )}
        </Card>

        {/* ── Section B: Fee Flow ────────────────────────────────────────── */}
        <Card>
          <SectionTitle>Geldfluss</SectionTitle>
          <p style={{ margin: "0 0 10px", fontSize: 10, color: C.dimmed, fontFamily: C.font }}>
            Beispiel: {formatEur(EXAMPLE_PROFIT)} Investor-Gewinn
          </p>

          {[
            { label: "Investor-Gewinn",                                        value: formatEur(dist.investorProfit),    indent: false, highlight: false },
            { label: `Perf.-Fee (${formatPct(PARTNER_PROGRAM_CONFIG.performanceFeeRate)})`, value: `−${formatEur(dist.performanceFee)}`,   indent: true,  highlight: false },
            { label: `InnoInvest (${formatPct(PARTNER_PROGRAM_CONFIG.innoInvestRate)})`,    value: `−${formatEur(dist.innoInvestShare)}`, indent: true,  highlight: false },
            { label: "CL-Basis",                                               value: formatEur(dist.clBase),            indent: true,  highlight: false },
            { label: `Partner ${tier.label} (${formatPct(tier.clShareRate)})`, value: formatEur(dist.partnerShare),      indent: true,  highlight: true  },
            { label: "CL Rest",                                                value: formatEur(dist.clRemainder),       indent: true,  highlight: false },
          ].map(({ label, value, indent, highlight }, i) => (
            <div key={i} style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 7,
              paddingLeft: indent ? 10 : 0,
              borderLeft: highlight ? `2px solid ${C.gold}` : indent ? "2px solid rgba(255,255,255,0.07)" : "none",
            }}>
              <span style={{ flex: 1, fontSize: 11, color: highlight ? C.gold : C.muted, fontFamily: C.font }}>
                {label}
              </span>
              <span style={{
                fontSize: 12,
                fontWeight: highlight ? 700 : 500,
                color: highlight ? C.gold : C.text,
                fontFamily: C.font,
              }}>
                {value}
              </span>
            </div>
          ))}
        </Card>

        {/* ── Section C: Tier Table ─────────────────────────────────────── */}
        <Card>
          <SectionTitle>Partnerstufen</SectionTitle>
          {PARTNER_PROGRAM_CONFIG.tiers.map((t) => {
            const isActive  = t.id === tier.id;
            const threshold = isFounder ? t.founderThreshold : t.volThreshold;
            return (
              <div key={t.id} style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "7px 8px",
                marginBottom: 2,
                borderRadius: 6,
                borderLeft: isActive ? `3px solid ${C.gold}` : "3px solid transparent",
                background: isActive ? "rgba(226,202,122,0.06)" : "transparent",
              }}>
                <span style={{
                  flex: 1,
                  fontSize: 12,
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? C.gold : C.text,
                  fontFamily: C.font,
                }}>
                  {t.label}
                </span>
                <span style={{
                  fontSize: 11,
                  color: isActive ? C.gold : C.muted,
                  fontFamily: C.font,
                  minWidth: 40,
                  textAlign: "right" as const,
                }}>
                  {formatPct(t.clShareRate)}
                </span>
                <span style={{
                  fontSize: 10,
                  color: C.muted,
                  fontFamily: C.font,
                  minWidth: 84,
                  textAlign: "right" as const,
                }}>
                  {threshold === 0 ? "ab 0 €" : formatEur(threshold)}
                </span>
              </div>
            );
          })}
          {isFounder && (
            <p style={{ margin: "8px 0 0", fontSize: 9, color: C.dimmed, fontFamily: C.font, textAlign: "center" }}>
              Schwellenwerte als Founder (50 % Rabatt)
            </p>
          )}
        </Card>

        {/* ── Section G: AP Rechner ─────────────────────────────────────── */}
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

          {/* Lock-up toggle */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {([1, 3, 5] as const).map((y) => (
              <button
                key={y}
                onClick={() => setLockup(y)}
                style={{
                  flex: 1,
                  padding: "8px 0",
                  background: lockup === y ? C.gold : "rgba(255,255,255,0.06)",
                  border: "none",
                  borderRadius: 8,
                  color: lockup === y ? "#0c0d10" : C.muted,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: C.font,
                  WebkitTapHighlightColor: "transparent",
                  transition: "background 150ms, color 150ms",
                }}
              >
                {y}J
              </button>
            ))}
          </div>

          {/* Result */}
          {apResult ? (
            <div style={{
              background: "rgba(226,202,122,0.06)",
              border: `1px solid rgba(226,202,122,0.15)`,
              borderRadius: 8,
              padding: "10px 12px",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: C.muted, fontFamily: C.font }}>Lock-up</span>
                <span style={{ fontSize: 11, color: C.text, fontFamily: C.font }}>{apResult.lockupYears} Jahre</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: C.muted, fontFamily: C.font }}>AP-Rate</span>
                <span style={{ fontSize: 11, color: C.gold, fontFamily: C.font, fontWeight: 600 }}>
                  {formatPct(apResult.rate)}
                </span>
              </div>
              <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "6px 0" }} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: C.text, fontFamily: C.font }}>
                  Abschlussprovision
                </span>
                <span style={{ fontSize: 16, fontWeight: 700, color: C.gold, fontFamily: C.font }}>
                  {formatEur(apResult.apAmount)}
                </span>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "12px 0" }}>
              <span style={{ fontSize: 11, color: C.dimmed, fontFamily: C.font }}>
                Anlagebetrag eingeben
              </span>
            </div>
          )}
        </Card>

      </div>
    </div>
  );
}
