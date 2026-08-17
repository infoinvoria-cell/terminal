"use client";

import React, { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { TrackRecordStatusStrip } from "@/components/dashboard/track-record-status-strip";
import { deserializeTrades, compoundGains } from "@/lib/trades-analytics";
import type { DashboardKpis, SerializedTrade } from "@/lib/trades-analytics";
import type { CapalifeData } from "@/lib/capitalife-data";
import type { TimeFrame, ViewMode } from "@/components/dashboard/performance-report-chart";
import type { TrackRecordOverview } from "@/lib/track-record/types";

const PerformanceReportChart = dynamic(
  () => import("@/components/dashboard/performance-report-chart").then(m => m.PerformanceReportChart),
  { ssr: false, loading: () => <div style={{ flex: 1 }} /> }
);

// ── Tokens ────────────────────────────────────────────────────────────────────
const PAGE_BG     = "#0c0d10";
const CARD_BG     = "linear-gradient(180deg,#1F1F1F 0%,#13131A 100%)";
const CARD_BORDER = "rgba(255,255,255,0.06)";
const CARD_SHADOW = "0 8px 20px -8px rgba(0,0,0,0.55)";
const MUTED       = "rgba(255,255,255,0.38)";
const AUM_LS_KEY  = "fund-manager:aum-visible";

// ── Eye icons ─────────────────────────────────────────────────────────────────
function Eye({ off }: { off?: boolean }) {
  return off ? (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  ) : (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  );
}

// ── Top KPI card — first one gets eye toggle for AuM ─────────────────────────
export type TopKpiItem = { label: string; value: string; neg?: boolean; isAum?: boolean };

function TopKpi({ label, value, neg, isAum }: TopKpiItem) {
  const [visible, setVisible] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (!isAum) return;
    setMounted(true);
    try { if (localStorage.getItem(AUM_LS_KEY) === "false") setVisible(false); } catch {}
  }, [isAum]);

  const toggle = () => {
    if (!isAum) return;
    const next = !visible;
    setVisible(next);
    try { localStorage.setItem(AUM_LS_KEY, String(next)); } catch {}
  };

  const displayValue = isAum && mounted && !visible ? "—" : value;

  return (
    <div style={{
      background: CARD_BG,
      border: `1px solid ${CARD_BORDER}`,
      borderRadius: 10,
      boxShadow: CARD_SHADOW,
      padding: "9px 9px 11px",
      display: "flex", flexDirection: "column", justifyContent: "space-between",
      gap: 6, minWidth: 0,
    }}>
      {/* Label row — eye on AuM card */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2 }}>
        <p style={{
          margin: 0, fontSize: 8, fontWeight: 600, color: MUTED,
          fontFamily: "var(--font-text)",
          textTransform: "uppercase", letterSpacing: "0.01em", lineHeight: 1.2,
          minWidth: 0, overflow: "hidden",
        }}>
          {label}
        </p>
        {isAum && (
          <button type="button" onClick={toggle}
            style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.22)", padding: 0, lineHeight: 0, flexShrink: 0, WebkitTapHighlightColor: "transparent" }}>
            {mounted ? <Eye off={!visible} /> : <Eye />}
          </button>
        )}
      </div>
      {/* Value */}
      <p style={{
        margin: 0, fontSize: 13, fontWeight: 700, lineHeight: 1,
        letterSpacing: "-0.02em",
        fontFamily: "var(--font-numbers)",
        color: neg ? "rgba(161,161,170,1)" : "#ffffff",
        opacity: isAum && mounted && !visible ? 0.22 : 1,
        transition: "opacity 0.2s",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {displayValue}
      </p>
    </div>
  );
}

// ── Tab buttons (no pill, icon + text) ────────────────────────────────────────
type HomeTab = "portfolio" | "risk" | "trades" | "quant";

function IconLayers()   { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>; }
function IconCircle()   { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/></svg>; }
function IconBarChart() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="12" width="4" height="9"/><rect x="9.5" y="7" width="4" height="14"/><rect x="16" y="3" width="4" height="18"/></svg>; }
function IconSparkles() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v1m0 16v1M4.22 4.22l.71.71m12.73 12.73.71.71M3 12h1m16 0h1M4.93 19.07l.71-.71M18.36 5.64l.71-.71"/><circle cx="12" cy="12" r="4"/></svg>; }

const TAB_ICONS: Record<HomeTab, () => React.ReactElement> = {
  portfolio: IconLayers,
  risk:      IconCircle,
  trades:    IconBarChart,
  quant:     IconSparkles,
};

function TabBtn({ id, label, active, onClick }: { id: HomeTab; label: string; active: boolean; onClick: () => void }) {
  const Icon = TAB_ICONS[id];
  return (
    <button type="button" onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 5,
        background: "none", border: "none", padding: "5px 8px",
        cursor: "pointer", WebkitTapHighlightColor: "transparent",
        color: active ? "#ffffff" : "#55585f",
        fontSize: 12, fontWeight: active ? 600 : 500,
        fontFamily: "var(--font-text)",
        transition: "color 0.12s",
      }}>
      <Icon />
      {label}
    </button>
  );
}

// ── Secondary KPI card (4×2) ──────────────────────────────────────────────────
function SecKpi({ label, value, delta, deltaPos }: { label: string; value: string; delta?: string; deltaPos?: boolean }) {
  return (
    <div style={{
      background: CARD_BG, border: `1px solid ${CARD_BORDER}`,
      borderRadius: 10, boxShadow: CARD_SHADOW,
      padding: "8px 9px 10px",
      display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 5,
    }}>
      <p style={{ margin: 0, fontSize: 7.5, fontWeight: 600, color: MUTED, fontFamily: "var(--font-text)", textTransform: "uppercase", letterSpacing: "0.01em", lineHeight: 1.3 }}>
        {label}
      </p>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 2, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, lineHeight: 1, letterSpacing: "-0.02em", fontFamily: "var(--font-numbers)", color: "#fff", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {value}
        </p>
        {delta != null && deltaPos != null && (
          deltaPos
            ? <span style={{ flexShrink: 0, border: "1px solid rgba(226,202,122,0.3)", borderRadius: 999, padding: "1px 3px", fontSize: 7, fontWeight: 700, color: "#C9A84C", fontFamily: "var(--font-numbers)", lineHeight: 1.4, whiteSpace: "nowrap" }}>{delta}</span>
            : <span style={{ flexShrink: 0, fontSize: 7, fontWeight: 600, color: "rgba(161,161,170,0.55)", fontFamily: "var(--font-numbers)", lineHeight: 1.4 }}>{delta}</span>
        )}
      </div>
    </div>
  );
}

// ── Chart control button ──────────────────────────────────────────────────────
function Btn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      style={{
        height: 22, minWidth: 26, padding: "0 6px", borderRadius: 11,
        fontSize: 9.5, fontFamily: "var(--font-text)", fontWeight: 500,
        cursor: "pointer", lineHeight: "22px",
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

// ── Monthly table helper ──────────────────────────────────────────────────────
type MonthRow = { key: string; label: string; gainPct: number; cumulative: number };

function buildMonthlyTable(trades: SerializedTrade[]): MonthRow[] {
  if (!trades.length) return [];
  const rows = deserializeTrades(trades);
  const map  = new Map<string, number[]>();
  for (const r of rows) {
    const key = `${r.date.getFullYear()}-${String(r.date.getMonth() + 1).padStart(2, "0")}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r.gainPct);
  }
  const sorted = [...map.entries()].sort(([a], [b]) => b.localeCompare(a));
  let equity = 100;
  const withCum: MonthRow[] = [];
  for (const [key, gains] of [...map.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const g = compoundGains(gains);
    equity *= 1 + g / 100;
    withCum.push({ key, label: key, gainPct: g, cumulative: equity - 100 });
  }
  withCum.sort((a, b) => b.key.localeCompare(a.key));
  const monthNames = ["","Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"];
  return withCum.map(r => {
    const [y, m] = r.key.split("-");
    return { ...r, label: `${monthNames[parseInt(m!)] ?? m} ${y}` };
  });
}

// ── Risk tab ──────────────────────────────────────────────────────────────────
function RiskTab({ kpis, stats, trades }: { kpis: DashboardKpis; stats: ReturnType<typeof useMonthlyStats>; trades: SerializedTrade[] }) {
  const fmt = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
  const rows = deserializeTrades(trades);
  const stdDev = useMemo(() => {
    if (rows.length < 2) return null;
    const mean = rows.reduce((a, r) => a + r.gainPct, 0) / rows.length;
    const sq = rows.reduce((a, r) => a + (r.gainPct - mean) ** 2, 0);
    return Math.sqrt(sq / (rows.length - 1));
  }, [rows]);

  const riskCards = [
    { label: "Max Drawdown",  value: `-${kpis.maxDrawdownPct.toFixed(2)}%`, neg: true  },
    { label: "Win Rate",      value: stats ? `${((stats.pos / stats.total) * 100).toFixed(0)}%` : "—" },
    { label: "Best Month",   value: stats ? fmt(stats.best)  : "—",         pos: true  },
    { label: "Worst Month",  value: stats ? fmt(stats.worst) : "—",         neg: true  },
    { label: "Calmar",        value: stats?.calmar != null ? stats.calmar.toFixed(2) : "—" },
    { label: "Pos. Months",  value: stats ? `${stats.pos}/${stats.total}` : "—" },
    { label: "Volatility",   value: stdDev != null ? `${stdDev.toFixed(2)}%` : "—" },
    { label: "Trade Count",  value: trades.length > 0 ? trades.length.toLocaleString("de-DE") : "—" },
  ];

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 14px 120px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 5, marginBottom: 14 }}>
        {riskCards.map(c => (
          <div key={c.label} style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 10, boxShadow: CARD_SHADOW, padding: "8px 9px 10px" }}>
            <p style={{ margin: 0, fontSize: 7.5, fontWeight: 600, color: MUTED, fontFamily: "var(--font-text)", textTransform: "uppercase", letterSpacing: "0.01em", lineHeight: 1.3 }}>{c.label}</p>
            <p style={{ margin: "4px 0 0", fontSize: 13, fontWeight: 700, lineHeight: 1, letterSpacing: "-0.02em", fontFamily: "var(--font-numbers)", color: c.neg ? "rgba(239,68,68,0.9)" : c.pos ? "#22C55E" : "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.value}</p>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 10, color: MUTED, fontFamily: "var(--font-text)", margin: "0 0 2px" }}>Basis: Trades-Log seit Aufzeichnung · Tägliche Perioden</p>
    </div>
  );
}

// ── Trades tab ────────────────────────────────────────────────────────────────
function TradesTab({ trades }: { trades: SerializedTrade[] }) {
  const monthly = useMemo(() => buildMonthlyTable(trades), [trades]);

  if (!monthly.length) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: MUTED, fontSize: 13, fontFamily: "var(--font-text)" }}>Keine Trade-Daten</p>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 14px 120px" }}>
      <div style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 64px 72px", padding: "7px 12px", borderBottom: `1px solid ${CARD_BORDER}` }}>
          {["Monat", "Return", "Kum."].map(h => (
            <span key={h} style={{ fontSize: 9, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: "var(--font-text)", textAlign: h === "Monat" ? "left" : "right" as const }}>{h}</span>
          ))}
        </div>
        {monthly.map(r => (
          <div key={r.key} style={{ display: "grid", gridTemplateColumns: "1fr 64px 72px", padding: "8px 12px", borderBottom: `1px solid rgba(255,255,255,0.03)` }}>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.8)", fontFamily: "var(--font-text)", fontWeight: 500 }}>{r.label}</span>
            <span style={{ fontSize: 12, fontFamily: "var(--font-numbers)", fontWeight: 700, textAlign: "right", color: r.gainPct >= 0 ? "#22C55E" : "rgba(239,68,68,0.9)", fontVariantNumeric: "tabular-nums" }}>
              {r.gainPct >= 0 ? "+" : ""}{r.gainPct.toFixed(2)}%
            </span>
            <span style={{ fontSize: 12, fontFamily: "var(--font-numbers)", fontWeight: 600, textAlign: "right", color: r.cumulative >= 0 ? "rgba(201,168,76,0.9)" : "rgba(239,68,68,0.7)", fontVariantNumeric: "tabular-nums" }}>
              {r.cumulative >= 0 ? "+" : ""}{r.cumulative.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Quant tab ─────────────────────────────────────────────────────────────────
function QuantTab({ kpis, capalifeData }: { kpis: DashboardKpis; capalifeData: CapalifeData }) {
  const annualRows = useMemo(() => {
    const ann = capalifeData.whiteSwanAnnualReturns as unknown as Record<string, number>;
    if (!ann || typeof ann !== "object") return [];
    return Object.entries(ann)
      .filter(([, v]) => typeof v === "number")
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 8);
  }, [capalifeData.whiteSwanAnnualReturns]);

  const compositionCards = [
    { label: "Assets",       value: kpis.assetsCount > 0 ? String(kpis.assetsCount) : "35" },
    { label: "Strategies",   value: kpis.strategiesCount > 0 ? String(kpis.strategiesCount) : "56" },
    { label: "Sleeves",      value: "5" },
    { label: "Approaches",   value: "10" },
  ];

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 14px 120px" }}>
      {/* Composition */}
      <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 600, color: "#c8cad0", fontFamily: "var(--font-text)" }}>Zusammensetzung</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 5, marginBottom: 16 }}>
        {compositionCards.map(c => (
          <div key={c.label} style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 10, boxShadow: CARD_SHADOW, padding: "8px 9px 10px" }}>
            <p style={{ margin: 0, fontSize: 7.5, fontWeight: 600, color: MUTED, fontFamily: "var(--font-text)", textTransform: "uppercase", letterSpacing: "0.01em" }}>{c.label}</p>
            <p style={{ margin: "4px 0 0", fontSize: 18, fontWeight: 700, lineHeight: 1, fontFamily: "var(--font-numbers)", color: "#C9A84C" }}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* White Swan annual returns */}
      {annualRows.length > 0 && (
        <>
          <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 600, color: "#c8cad0", fontFamily: "var(--font-text)" }}>White Swan — Jahresrenditen</p>
          <div style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 12, overflow: "hidden" }}>
            {annualRows.map(([year, ret]) => (
              <div key={year} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 14px", borderBottom: `1px solid rgba(255,255,255,0.03)` }}>
                <span style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", fontFamily: "var(--font-text)", fontWeight: 500 }}>{year}</span>
                <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "var(--font-numbers)", color: Number(ret) >= 0 ? "#22C55E" : "rgba(239,68,68,0.9)", fontVariantNumeric: "tabular-nums" }}>
                  {Number(ret) >= 0 ? "+" : ""}{Number(ret).toFixed(2)}%
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── System status strip ───────────────────────────────────────────────────────
type SysStatus = { sentinel: "ok" | "partial" | "unavailable"; brain: "ok" | "local" | "unavailable" };

function useSystemStatus(): SysStatus {
  const [s, setS] = useState<SysStatus>({ sentinel: "unavailable", brain: "unavailable" });
  useEffect(() => {
    // Sentinel provider check
    fetch("/api/sentinel/status")
      .then(r => r.json())
      .then((j: { providers?: { usable: boolean; configured?: boolean }[] }) => {
        const hasUsable = j.providers?.some(p => p.usable) ?? false;
        const hasPartial = j.providers?.some(p => p.configured && !p.usable) ?? false;
        setS(prev => ({ ...prev, sentinel: hasUsable ? "ok" : hasPartial ? "partial" : "unavailable" }));
      })
      .catch(() => {});
    // Brain path check
    fetch("/api/brain-graph/status")
      .then(r => r.json())
      .then((j: { pathConfigured?: boolean; available?: boolean }) => {
        setS(prev => ({
          ...prev,
          brain: j.available ? "ok" : j.pathConfigured ? "local" : "unavailable",
        }));
      })
      .catch(() => {});
  }, []);
  return s;
}

const STATUS_COLORS: Record<string, string> = { ok: "#22C55E", partial: "#C9A84C", local: "#C9A84C", unavailable: "#374151" };
const STATUS_LABELS: Record<string, string> = {
  sentinel_ok: "Sentinel bereit", sentinel_partial: "Sentinel konfiguriert", sentinel_unavailable: "Kein AI",
  brain_ok: "Brain verbunden", brain_local: "Brain lokal", brain_unavailable: "Kein Brain",
};

function SystemStatusStrip({ status }: { status: SysStatus }) {
  const chips: { key: string; label: string; color: string }[] = [
    { key: "ws",       label: "White Swan aktiv",                   color: "#22C55E"                             },
    { key: "sentinel", label: STATUS_LABELS[`sentinel_${status.sentinel}`]!, color: STATUS_COLORS[status.sentinel]! },
    { key: "brain",    label: STATUS_LABELS[`brain_${status.brain}`]!,       color: STATUS_COLORS[status.brain]!    },
  ];
  return (
    <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 6, marginBottom: 2 }}>
      {chips.map(c => (
        <span key={c.key} style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          fontSize: 9.5, fontWeight: 700, color: "rgba(255,255,255,0.65)",
          fontFamily: "var(--font-text)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 999, padding: "3px 8px",
          letterSpacing: "0.02em",
        }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: c.color, flexShrink: 0 }} />
          {c.label}
        </span>
      ))}
    </div>
  );
}

// ── Monthly stats ─────────────────────────────────────────────────────────────
function useMonthlyStats(trades: SerializedTrade[]) {
  return useMemo(() => {
    if (!trades.length) return null;
    const rows = deserializeTrades(trades);
    const map  = new Map<string, number[]>();
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
      peak    = Math.max(peak, equity);
      if (peak > 0) maxDd = Math.max(maxDd, ((peak - equity) / peak) * 100);
    }
    const totalRet   = compoundGains(rows.map(r => r.gainPct));
    const annualized = rows.length > 0 ? (Math.pow(1 + totalRet / 100, 12 / rows.length) - 1) * 100 : 0;
    const calmar     = maxDd > 0.01 ? annualized / maxDd : null;
    return { best, worst, pos, total, calmar };
  }, [trades]);
}

// ── Main view ─────────────────────────────────────────────────────────────────
export function MobileHomeView({
  topKpis,
  kpis,
  trades,
  capalifeData,
  trackRecordOverview,
}: {
  topKpis: TopKpiItem[];
  kpis: DashboardKpis;
  trades: SerializedTrade[];
  capalifeData: CapalifeData;
  trackRecordOverview: TrackRecordOverview | null;
}) {
  const [tab,      setTab]      = useState<HomeTab>("portfolio");
  const [view,     setView]     = useState<ViewMode>("Bar");
  const [timeframe, setTF]      = useState<TimeFrame>("1M");
  const [lastLine, setLastLine] = useState<TimeFrame>("1D");
  const [lastBar,  setLastBar]  = useState<TimeFrame>("1M");
  const [lastTbl,  setLastTbl]  = useState<TimeFrame>("1M");

  const stats  = useMonthlyStats(trades);
  const sysStatus = useSystemStatus();
  const fmt   = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;

  const secCards = [
    { label: "Calmar",      value: stats?.calmar != null ? stats.calmar.toFixed(1) : "—" },
    { label: "Best Month",  value: stats ? fmt(stats.best)  : "—", delta: stats ? fmt(stats.best)  : undefined, deltaPos: true  },
    { label: "Worst Month", value: stats ? fmt(stats.worst) : "—", delta: stats ? fmt(stats.worst) : undefined, deltaPos: false },
    { label: "Pos. Months", value: stats ? `${stats.pos} / ${stats.total}` : "—" },
    { label: "Assets",      value: "35" },
    { label: "Strategies",  value: "56" },
    { label: "Approaches",  value: "10" },
    { label: "Sleeves",     value: "5"  },
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

      {/* ── Page title ─────────────────────────────────────── */}
      <div style={{ flexShrink: 0, padding: "12px 14px 10px" }}>
        <p style={{ margin: "0 0 1px", fontSize: 9, fontWeight: 600, color: MUTED, fontFamily: "var(--font-text)", textTransform: "uppercase", letterSpacing: "0.07em" }}>HOME</p>
        <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#fafafa", fontFamily: "var(--font-text)", letterSpacing: "-0.01em" }}>Portfolio</h1>
        <SystemStatusStrip status={sysStatus} />
      </div>

      {/* ── 4 top KPI cards (1×4) — Risk Adj. AuM | Total Return | Max DD | Annualized ── */}
      <div style={{ flexShrink: 0, padding: "0 14px 16px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 5 }}>
          {topKpis.map(k => <TopKpi key={k.label} {...k} />)}
        </div>
      </div>

      {/* ── 4 tab buttons ──────────────────────────────────── */}
      <div style={{ flexShrink: 0, padding: "0 6px 16px", display: "flex", gap: 0 }}>
        {(["portfolio","risk","trades","quant"] as HomeTab[]).map(t => (
          <TabBtn key={t} id={t} label={t.charAt(0).toUpperCase() + t.slice(1)} active={tab === t} onClick={() => setTab(t)} />
        ))}
      </div>

      {tab === "portfolio" ? (
        <>
          {/* ── 4×2 secondary KPI grid ─────────────────────── */}
          <div style={{ flexShrink: 0, padding: "0 14px 16px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 5 }}>
              {secCards.map(c => <SecKpi key={c.label} {...c} />)}
            </div>
          </div>

          <div style={{ flexShrink: 0, padding: "0 14px 12px" }}>
            <TrackRecordStatusStrip overview={trackRecordOverview} compact />
          </div>

          {/* ── Performance Overview ───────────────────────── */}
          <div style={{ flex: 1, minHeight: 0, padding: "0 14px 10px", display: "flex", flexDirection: "column" }}>
            <p style={{ flexShrink: 0, margin: "0 0 8px", fontSize: 11, fontWeight: 600, color: "#c8cad0", fontFamily: "var(--font-text)", letterSpacing: "0.01em" }}>
              Performance Overview
            </p>
            <div style={{ position: "relative", flex: 1, minHeight: 0, borderRadius: 10, border: `1px solid ${CARD_BORDER}`, background: CARD_BG, boxShadow: CARD_SHADOW, overflow: "hidden" }}>
              {/* Controls */}
              <div style={{ position: "absolute", top: 0, right: 0, padding: "6px 8px 0", zIndex: 2, display: "flex", alignItems: "center", gap: 4 }}>
                <div style={{ display: "flex", gap: 2 }}>
                  {(["1D","1W","1M","3M","1Y"] as TimeFrame[]).map(tf => (
                    <Btn key={tf} label={tf} active={timeframe === tf} onClick={() => changeTF(tf)} />
                  ))}
                </div>
                <div style={{ width: 1, height: 10, background: "rgba(255,255,255,0.08)", flexShrink: 0 }} />
                <div style={{ display: "flex", gap: 2 }}>
                  {(["Bar","Line","Table"] as ViewMode[]).map(v => (
                    <Btn key={v} label={v} active={view === v} onClick={() => changeView(v)} />
                  ))}
                </div>
              </div>
              {/* Chart */}
              <div style={{ position: "absolute", inset: 0, paddingTop: 36, paddingLeft: 12, paddingRight: 8, paddingBottom: 6 }}>
                <PerformanceReportChart trades={trades} timeframe={timeframe} view={view} capalifeData={capalifeData} compact />
              </div>
            </div>
          </div>
        </>
      ) : tab === "risk" ? (
        <RiskTab kpis={kpis} stats={stats} trades={trades} />
      ) : tab === "trades" ? (
        <TradesTab trades={trades} />
      ) : (
        <QuantTab kpis={kpis} capalifeData={capalifeData} />
      )}
    </div>
  );
}
