"use client";

import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { deserializeTrades, compoundGains } from "@/lib/trades-analytics";
import type { DashboardKpis, SerializedTrade } from "@/lib/trades-analytics";
import type { CapalifeData } from "@/lib/capitalife-data";
import type { TimeFrame, ViewMode } from "@/components/dashboard/performance-report-chart";

const PerformanceReportChart = dynamic(
  () => import("@/components/dashboard/performance-report-chart").then(m => m.PerformanceReportChart),
  { ssr: false, loading: () => <div style={{ flex: 1 }} /> }
);

// ── Tokens ────────────────────────────────────────────────────────────────────
const PAGE_BG     = "#0c0d10";
const CARD_BG     = "linear-gradient(180deg,#1c1d20 0%,#141517 100%)";
const CARD_BORDER = "rgba(255,255,255,0.06)";
const CARD_SHADOW = "0 12px 28px -10px rgba(0,0,0,0.55)";
const MUTED       = "rgba(255,255,255,0.4)";
const AUM_LS_KEY  = "fund-manager:aum-visible";

// ── Eye icons ─────────────────────────────────────────────────────────────────
function Eye({ off }: { off?: boolean }) {
  return off ? (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  ) : (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  );
}

// ── AUM card ──────────────────────────────────────────────────────────────────
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
    <div style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 14, boxShadow: CARD_SHADOW, padding: "12px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
      <div>
        <p style={{ margin: "0 0 4px", fontSize: 10, fontWeight: 600, color: MUTED, fontFamily: "var(--font-montserrat,sans-serif)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Risk adjusted AuM
        </p>
        <p style={{ margin: 0, fontSize: 22, fontWeight: 700, lineHeight: 1, letterSpacing: "-0.02em", fontFamily: "var(--font-nunito,sans-serif)", color: "#fff", opacity: mounted && !visible ? 0.25 : 1, transition: "opacity 0.2s" }}>
          {mounted && !visible ? "—" : value}
        </p>
      </div>
      <button type="button" onClick={toggle} aria-label={visible ? "Verbergen" : "Anzeigen"}
        style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.28)", padding: 4, lineHeight: 0, WebkitTapHighlightColor: "transparent" }}>
        {mounted ? <Eye off={!visible} /> : <Eye />}
      </button>
    </div>
  );
}

// ── Tab button ────────────────────────────────────────────────────────────────
type HomeTab = "portfolio" | "risk" | "trades" | "quant";

function TabBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      style={{
        height: 26, padding: "0 10px", borderRadius: 13,
        fontSize: 11, fontFamily: "var(--font-montserrat,sans-serif)", fontWeight: 500,
        cursor: "pointer", lineHeight: "26px",
        background: active ? "rgba(255,255,255,0.07)" : "transparent",
        border: `1px solid ${active ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.09)"}`,
        color: active ? "#ffffff" : "#7a7d87",
        transition: "border-color 0.15s, color 0.15s, background 0.15s",
        WebkitTapHighlightColor: "transparent",
      }}>
      {label}
    </button>
  );
}

// ── Chart control button ──────────────────────────────────────────────────────
function Btn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      style={{
        height: 24, minWidth: 28, padding: "0 7px", borderRadius: 12,
        fontSize: 10, fontFamily: "var(--font-montserrat,sans-serif)", fontWeight: 500,
        cursor: "pointer", lineHeight: "24px",
        background: active ? "rgba(255,255,255,0.07)" : "transparent",
        border: `1px solid ${active ? "#ffffff" : "rgba(255,255,255,0.09)"}`,
        color: active ? "#ffffff" : "#7a7d87",
        transition: "border-color 0.15s, color 0.15s, background 0.15s",
        WebkitTapHighlightColor: "transparent",
      }}>
      {label}
    </button>
  );
}

// ── Monthly stats from trades ─────────────────────────────────────────────────
function useMonthlyStats(trades: SerializedTrade[]) {
  return useMemo(() => {
    if (!trades.length) return null;
    const rows = deserializeTrades(trades);
    const map = new Map<string, number[]>();
    for (const r of rows) {
      const key = `${r.date.getFullYear()}-${String(r.date.getMonth() + 1).padStart(2, "0")}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r.gainPct);
    }
    const monthly = [...map.values()].map(g => compoundGains(g));
    if (!monthly.length) return null;
    const best  = Math.max(...monthly);
    const worst = Math.min(...monthly);
    const pos   = monthly.filter(m => m >= 0).length;
    const total = monthly.length;
    let equity = 100, peak = 100, maxDd = 0;
    for (const r of rows) {
      equity *= 1 + r.gainPct / 100;
      peak = Math.max(peak, equity);
      if (peak > 0) maxDd = Math.max(maxDd, ((peak - equity) / peak) * 100);
    }
    const totalRet   = compoundGains(rows.map(r => r.gainPct));
    const annualized = (Math.pow(1 + totalRet / 100, 12 / rows.length) - 1) * 100;
    const calmar     = maxDd > 0.01 ? annualized / maxDd : null;
    return { best, worst, pos, total, calmar };
  }, [trades]);
}

// ── Compact KPI card for 3×2 grid ────────────────────────────────────────────
function KpiCard({ label, value, delta, deltaPos }: { label: string; value: string; delta?: string; deltaPos?: boolean }) {
  return (
    <div style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 12, boxShadow: CARD_SHADOW, padding: "8px 10px 10px", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 4 }}>
      <p style={{ margin: 0, fontSize: 8.5, fontWeight: 600, color: MUTED, fontFamily: "var(--font-montserrat,sans-serif)", textTransform: "uppercase", letterSpacing: "0.01em", lineHeight: 1.3 }}>
        {label}
      </p>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 2, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 700, lineHeight: 1, letterSpacing: "-0.02em", fontFamily: "var(--font-nunito,sans-serif)", color: "#fff", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {value}
        </p>
        {delta != null && deltaPos != null && (
          deltaPos
            ? <span style={{ flexShrink: 0, border: "1px solid rgba(226,202,122,0.3)", borderRadius: 999, padding: "1px 4px", fontSize: 8, fontWeight: 700, color: "#e2ca7a", fontFamily: "var(--font-nunito,sans-serif)", lineHeight: 1.4, whiteSpace: "nowrap" }}>{delta}</span>
            : <span style={{ flexShrink: 0, fontSize: 8, fontWeight: 600, color: "rgba(161,161,170,0.65)", fontFamily: "var(--font-nunito,sans-serif)", lineHeight: 1.4 }}>{delta}</span>
        )}
      </div>
    </div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────
export function MobileHomeView({
  riskAdjustedAum,
  kpis: _kpis,
  trades,
  capalifeData,
}: {
  riskAdjustedAum: string;
  kpis: DashboardKpis;
  trades: SerializedTrade[];
  capalifeData: CapalifeData;
}) {
  const [tab, setTab]           = useState<HomeTab>("portfolio");
  const [view, setView]         = useState<ViewMode>("Line");
  const [timeframe, setTF]      = useState<TimeFrame>("1D");
  const [lastLine, setLastLine] = useState<TimeFrame>("1D");
  const [lastBar,  setLastBar]  = useState<TimeFrame>("1M");
  const [lastTbl,  setLastTbl]  = useState<TimeFrame>("1M");

  const stats  = useMonthlyStats(trades);
  const fmt    = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;

  const kpiCards = [
    { label: "Calmar",      value: stats?.calmar != null ? stats.calmar.toFixed(1) : "—" },
    { label: "Best Month",  value: stats ? fmt(stats.best)  : "—", delta: stats ? fmt(stats.best)  : undefined, deltaPos: true  },
    { label: "Worst Month", value: stats ? fmt(stats.worst) : "—", delta: stats ? fmt(stats.worst) : undefined, deltaPos: false },
    { label: "Pos. Months", value: stats ? `${stats.pos} / ${stats.total}` : "—" },
    { label: "Assets",      value: "35" },
    { label: "Strategies",  value: "56" },
  ];

  function changeView(v: ViewMode) {
    setView(v);
    if (v === "Line") { setTF(lastLine); return; }
    if (v === "Bar")  { setTF(lastBar);  return; }
    setTF(lastTbl);
  }
  function changeTF(tf: TimeFrame) {
    setTF(tf);
    if (view === "Line") { setLastLine(tf); return; }
    if (view === "Bar")  { setLastBar(tf);  return; }
    setLastTbl(tf);
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: PAGE_BG, overflow: "hidden" }}>

      {/* Page title */}
      <div style={{ flexShrink: 0, padding: "12px 14px 8px" }}>
        <p style={{ margin: "0 0 1px", fontSize: 9.5, fontWeight: 600, color: MUTED, fontFamily: "var(--font-montserrat,sans-serif)", textTransform: "uppercase", letterSpacing: "0.07em" }}>HOME</p>
        <h1 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: "#fafafa", fontFamily: "var(--font-montserrat,sans-serif)", letterSpacing: "-0.01em" }}>Portfolio</h1>
      </div>

      {/* AUM card */}
      <div style={{ flexShrink: 0, padding: "0 14px 8px" }}>
        <AumCard value={riskAdjustedAum} />
      </div>

      {/* 4 tabs */}
      <div style={{ flexShrink: 0, padding: "0 14px 8px", display: "flex", gap: 6 }}>
        {(["portfolio", "risk", "trades", "quant"] as HomeTab[]).map(t => (
          <TabBtn key={t} label={t.charAt(0).toUpperCase() + t.slice(1)} active={tab === t} onClick={() => setTab(t)} />
        ))}
      </div>

      {tab === "portfolio" ? (
        <>
          {/* 3×2 KPI grid */}
          <div style={{ flexShrink: 0, padding: "0 14px 8px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6 }}>
              {kpiCards.map(c => <KpiCard key={c.label} {...c} />)}
            </div>
          </div>

          {/* Performance Overview — fills remaining height */}
          <div style={{ flex: 1, minHeight: 0, padding: "0 14px 10px", display: "flex", flexDirection: "column" }}>
            <p style={{ flexShrink: 0, margin: "0 0 6px", fontSize: 11, fontWeight: 600, color: "#c8cad0", fontFamily: "var(--font-montserrat,sans-serif)", letterSpacing: "0.01em" }}>
              Performance Overview
            </p>

            {/* Chart card */}
            <div style={{ position: "relative", flex: 1, minHeight: 0, borderRadius: 14, border: `1px solid ${CARD_BORDER}`, background: CARD_BG, boxShadow: CARD_SHADOW, overflow: "hidden" }}>
              {/* Controls top-right */}
              <div style={{ position: "absolute", top: 0, right: 0, padding: "8px 10px 0", zIndex: 2, display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{ display: "flex", gap: 3 }}>
                  {(["1D","1W","1M","3M","1Y"] as TimeFrame[]).map(tf => (
                    <Btn key={tf} label={tf} active={timeframe === tf} onClick={() => changeTF(tf)} />
                  ))}
                </div>
                <div style={{ width: 1, height: 12, background: "rgba(255,255,255,0.08)", flexShrink: 0 }} />
                <div style={{ display: "flex", gap: 3 }}>
                  {(["Bar","Line","Table"] as ViewMode[]).map(v => (
                    <Btn key={v} label={v} active={view === v} onClick={() => changeView(v)} />
                  ))}
                </div>
              </div>

              {/* Chart fills card */}
              <div style={{ position: "absolute", inset: 0, paddingTop: 40, paddingLeft: 14, paddingRight: 10, paddingBottom: 8 }}>
                <PerformanceReportChart trades={trades} timeframe={timeframe} view={view} capalifeData={capalifeData} />
              </div>
            </div>
          </div>
        </>
      ) : (
        <div style={{ flex: 1, minHeight: 0, padding: "0 14px 10px", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <p style={{ color: MUTED, fontFamily: "var(--font-montserrat,sans-serif)", fontSize: 13, textAlign: "center" }}>
            {tab.charAt(0).toUpperCase() + tab.slice(1)} Dashboard — demnächst verfügbar
          </p>
        </div>
      )}
    </div>
  );
}
