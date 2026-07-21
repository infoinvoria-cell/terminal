"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { SecondaryKpiRow } from "@/components/dashboard/secondary-kpi-row";
import type { DashboardKpis, SerializedTrade } from "@/lib/trades-analytics";
import type { CapalifeData } from "@/lib/capitalife-data";

// ── Lazy-load the heavy chart (same as desktop) ───────────────────────────────
const PortfolioSection = dynamic(
  () => import("@/components/portfolio/portfolio-section").then(m => m.PortfolioSection),
  { ssr: false, loading: () => <div style={{ flex: 1, minHeight: 120 }} /> }
);

// ── Design tokens ─────────────────────────────────────────────────────────────
const PAGE_BG     = "#0c0d10";
const CARD_BG     = "linear-gradient(180deg,#1c1d20 0%,#141517 100%)";
const CARD_BORDER = "rgba(255,255,255,0.06)";
const CARD_SHADOW = "0 12px 28px -10px rgba(0,0,0,0.55)";
const LABEL_MUT   = "rgba(255,255,255,0.42)";

// ── AUM card with eye toggle (mirrors AumKpiCard from desktop) ────────────────
const AUM_LS_KEY = "fund-manager:aum-visible";

function EyeIcon({ off }: { off?: boolean }) {
  return off ? (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  ) : (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  );
}

function AumCard({ value }: { value: string }) {
  const [visible, setVisible] = useState(true);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    try { if (localStorage.getItem(AUM_LS_KEY) === "false") setVisible(false); } catch {}
  }, []);
  const toggle = () => {
    const next = !visible;
    setVisible(next);
    try { localStorage.setItem(AUM_LS_KEY, String(next)); } catch {}
  };
  return (
    <div style={{
      background: CARD_BG, border: `1px solid ${CARD_BORDER}`,
      borderRadius: 16, boxShadow: CARD_SHADOW,
      padding: "14px 16px 16px",
      display: "flex", flexDirection: "column", gap: 8,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <p style={{
          margin: 0, fontSize: 12, fontWeight: 500, color: LABEL_MUT,
          fontFamily: "var(--font-montserrat,sans-serif)",
        }}>
          Risk adjusted AuM
        </p>
        <button
          type="button" onClick={toggle}
          aria-label={visible ? "AuM verbergen" : "AuM anzeigen"}
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: "rgba(255,255,255,0.3)", padding: 2, lineHeight: 0,
            WebkitTapHighlightColor: "transparent",
          }}
        >
          {mounted ? <EyeIcon off={!visible} /> : <EyeIcon />}
        </button>
      </div>
      <p style={{
        margin: 0, fontSize: 26, fontWeight: 700, lineHeight: 1,
        letterSpacing: "-0.02em",
        fontFamily: "var(--font-nunito,sans-serif)",
        color: "#ffffff",
        opacity: mounted && !visible ? 0.3 : 1,
        transition: "opacity 0.2s",
      }}>
        {mounted && !visible ? "—" : value}
      </p>
    </div>
  );
}

// ── Tab button (mirrors desktop style exactly) ────────────────────────────────
type HomeTab = "portfolio" | "risk" | "trades" | "quant";
const TABS: { id: HomeTab; label: string }[] = [
  { id: "portfolio", label: "Portfolio" },
  { id: "risk",      label: "Risk"      },
  { id: "trades",    label: "Trades"    },
  { id: "quant",     label: "Quant"     },
];

function TabBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button" onClick={onClick}
      style={{
        height: 28, padding: "0 11px", borderRadius: 14,
        fontSize: 11, fontFamily: "var(--font-montserrat,sans-serif)", fontWeight: 500,
        cursor: "pointer", lineHeight: "28px",
        background:   active ? "rgba(255,255,255,0.07)" : "transparent",
        border:       `1px solid ${active ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.09)"}`,
        color:        active ? "#ffffff" : "#7a7d87",
        transition:   "border-color 0.15s, color 0.15s, background 0.15s",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      {label}
    </button>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────

export function MobileHomeView({
  riskAdjustedAum,
  kpis,
  trades,
  capalifeData,
}: {
  riskAdjustedAum: string;
  kpis: DashboardKpis;
  trades: SerializedTrade[];
  capalifeData: CapalifeData;
}) {
  const [tab, setTab] = useState<HomeTab>("portfolio");

  return (
    <div style={{ background: PAGE_BG, minHeight: "100%", paddingBottom: 16 }}>

      {/* Page title */}
      <div style={{ padding: "14px 14px 10px" }}>
        <p style={{
          margin: "0 0 2px", fontSize: 10, fontWeight: 600,
          color: LABEL_MUT, textTransform: "uppercase", letterSpacing: "0.07em",
          fontFamily: "var(--font-montserrat,sans-serif)",
        }}>
          HOME
        </p>
        <h1 style={{
          margin: 0, fontSize: 20, fontWeight: 700, color: "#fafafa",
          fontFamily: "var(--font-montserrat,sans-serif)", letterSpacing: "-0.01em",
        }}>
          Portfolio
        </h1>
      </div>

      {/* AUM card */}
      <div style={{ padding: "0 14px 12px" }}>
        <AumCard value={riskAdjustedAum} />
      </div>

      {/* 4 tab buttons */}
      <div style={{ padding: "0 14px 12px", display: "flex", gap: 6, flexWrap: "wrap" }}>
        {TABS.map(t => (
          <TabBtn key={t.id} label={t.label} active={tab === t.id} onClick={() => setTab(t.id)} />
        ))}
      </div>

      {/* Portfolio tab: 6 KPI cards + Performance chart */}
      {tab === "portfolio" && (
        <div style={{ padding: "0 14px", display: "flex", flexDirection: "column", gap: 0 }}>
          <SecondaryKpiRow kpis={kpis} trades={trades} />
          {/* PortfolioSection includes "Performance Overview" title + chart with all controls */}
          <div style={{ marginTop: 0, minHeight: 420 }}>
            <PortfolioSection trades={trades} kpis={kpis} capalifeData={capalifeData} />
          </div>
        </div>
      )}

      {tab === "risk" && (
        <div style={{ padding: "0 14px" }}>
          <div style={{
            background: CARD_BG, border: `1px solid ${CARD_BORDER}`,
            borderRadius: 16, boxShadow: CARD_SHADOW,
            padding: "20px 16px", textAlign: "center",
          }}>
            <p style={{ color: LABEL_MUT, fontFamily: "var(--font-montserrat,sans-serif)", fontSize: 13 }}>
              Risk Dashboard — demnächst verfügbar
            </p>
          </div>
        </div>
      )}

      {tab === "trades" && (
        <div style={{ padding: "0 14px" }}>
          <div style={{
            background: CARD_BG, border: `1px solid ${CARD_BORDER}`,
            borderRadius: 16, boxShadow: CARD_SHADOW,
            padding: "20px 16px", textAlign: "center",
          }}>
            <p style={{ color: LABEL_MUT, fontFamily: "var(--font-montserrat,sans-serif)", fontSize: 13 }}>
              Trades Dashboard — demnächst verfügbar
            </p>
          </div>
        </div>
      )}

      {tab === "quant" && (
        <div style={{ padding: "0 14px" }}>
          <div style={{
            background: CARD_BG, border: `1px solid ${CARD_BORDER}`,
            borderRadius: 16, boxShadow: CARD_SHADOW,
            padding: "20px 16px", textAlign: "center",
          }}>
            <p style={{ color: LABEL_MUT, fontFamily: "var(--font-montserrat,sans-serif)", fontSize: 13 }}>
              Quant Dashboard — demnächst verfügbar
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
