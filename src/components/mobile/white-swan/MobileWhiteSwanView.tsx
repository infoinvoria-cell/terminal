"use client";

import { useEffect, useMemo, useState } from "react";
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

// ─── Types (mirrors WhiteSwanFinal.tsx's Summary/EquityData shapes — same canonical JSON) ──

interface ComponentData {
  id: string; label?: string; instrument?: string; status: string; core?: boolean;
  netEUR: number; PF: number; contracts: number; targetWeight: number; realizedWeight?: number;
}
interface CapLevel {
  capital: number; assessment: string; marginPct: number; marginTotal?: number;
  CAGR: number | null; oosCAGR?: number | null; oos2019CAGR?: number | null;
  Sharpe: number | null; MaxDDPct: number | null; MaxDDEUR?: number | null;
  PF?: number | null; expectancyEUR?: number | null; corePass?: boolean; corePassStr?: string;
  survivalStatus?: string; stressMarginNeeded?: number | null;
  contracts?: Record<string, number>; components?: ComponentData[];
}
interface PortfolioKPIs {
  CAGR: number; oosCAGR: number; oos2019CAGR?: number; Sharpe: number;
  MaxDDPct: number; MaxDDEUR: number; totalNetEUR: number;
}
interface Summary {
  version?: string; status?: string; recommendedCapital: number;
  components: ComponentData[];
  capitalComparison: CapLevel[];
  portfolioKPIs: PortfolioKPIs;
  serkan?: { finalRows?: number; dateRange?: string[] };
  mtmStatusByStrategy?: Record<string, string>;
  generatedAt?: string;
}
interface EquityPoint { date: string; nav: number; dd?: number }
interface EquityData { series: Record<string, EquityPoint[]> }

const CAPS = [10000, 12000, 15000, 20000, 25000, 30000, 40000, 50000, 75000, 100000];
const GOLD = "#C9A84C";
const CARD_BG = "#1F1F1F";
const CARD_BORDER = "rgba(255,255,255,0.06)";

const fmtEUR = (n: number | null | undefined) => (n == null ? "—" : `€${Math.round(n).toLocaleString("de-DE")}`);
const fmtPct = (n: number | null | undefined, d = 2) => (n == null ? "—" : `${n.toFixed(d)}%`);
const fmtNum = (n: number | null | undefined, d = 2) => (n == null ? "—" : n.toFixed(d));
const fmtCap = (c: number) => (c >= 1000 ? `€${c / 1000}k` : `€${c}`);

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
  const [equity, setEquity] = useState<EquityData | null>(null);
  const [error, setError] = useState(false);
  const [selectedCapital, setSelectedCapital] = useState(10000);

  useEffect(() => {
    fetch("/data/white-swan/final/portfolio-summary.json").then(r => r.json()).then((d: Summary) => {
      setSummary(d);
      if (d.recommendedCapital) setSelectedCapital(d.recommendedCapital);
    }).catch(() => setError(true));
    fetch("/data/white-swan/final/equity-series.json").then(r => r.json()).then(setEquity).catch(() => null);
  }, []);

  const tier = useMemo(
    () => summary?.capitalComparison.find(c => c.capital === selectedCapital) ?? null,
    [summary, selectedCapital],
  );

  const chartData = useMemo(() => {
    const series = equity?.series?.[String(selectedCapital)];
    if (!series) return [];
    return series.map(p => ({ date: p.date, nav: p.nav, dd: p.dd ?? 0 }));
  }, [equity, selectedCapital]);

  const coreComponents = tier?.components?.filter(c => c.core) ?? summary?.components.filter(c => c.core) ?? [];
  const optionalComponents = (tier?.components ?? summary?.components ?? []).filter(c => !c.core);
  const allMtmGenuine = summary?.mtmStatusByStrategy
    ? Object.values(summary.mtmStatusByStrategy).every(v => v.startsWith("DAILY_MTM_GENUINE"))
    : false;
  const survivalPass = tier?.survivalStatus?.includes("PASS") ?? false;

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
          {summary ? `${summary.version} · Zero-Cost Portfolio` : "wird geladen…"}
        </p>
      </header>

      {!summary ? (
        <div style={{ padding: "40px 16px", textAlign: "center", color: "rgba(255,255,255,0.35)", fontSize: 13 }}>Lädt…</div>
      ) : (
        <div style={{ padding: "6px 16px 100px", display: "flex", flexDirection: "column", gap: 18 }}>

          {/* Final status */}
          <div>
            <SectionTitle>Final Status</SectionTitle>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <StatusPill ok={!!tier?.corePass} label={tier?.corePassStr ?? "Core Status"} />
              <StatusPill ok={allMtmGenuine} label={allMtmGenuine ? "Daily MTM genuine" : "MTM prüfen"} />
              <StatusPill ok={survivalPass} label={survivalPass ? "Survival PASS" : "Survival prüfen"} />
              <StatusPill ok={!!summary.serkan?.finalRows} label={summary.serkan?.finalRows ? `Serkan ${summary.serkan.finalRows.toLocaleString("de-DE")} Zeilen` : "Serkan —"} />
            </div>
          </div>

          {/* Capital selector */}
          <div>
            <SectionTitle>Kapital</SectionTitle>
            <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, WebkitOverflowScrolling: "touch" }}>
              {CAPS.map(cap => {
                const active = cap === selectedCapital;
                return (
                  <button
                    key={cap}
                    onClick={() => setSelectedCapital(cap)}
                    style={{
                      flex: "0 0 auto", padding: "9px 16px", borderRadius: 999,
                      border: `1px solid ${active ? GOLD : "rgba(255,255,255,0.12)"}`,
                      background: active ? "rgba(201,168,76,0.14)" : "rgba(255,255,255,0.03)",
                      color: active ? GOLD : "rgba(255,255,255,0.6)",
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

          {/* Selected tier KPIs */}
          {tier && (
            <div>
              <SectionTitle>Kennzahlen bei {fmtCap(selectedCapital)}</SectionTitle>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <Kpi label="Net CAGR" value={fmtPct(tier.CAGR, 1)} gold />
                <Kpi label="OOS CAGR 2019+" value={fmtPct(tier.oos2019CAGR, 1)} />
                <Kpi label="Sharpe" value={fmtNum(tier.Sharpe)} />
                <Kpi label="Max DD" value={fmtPct(tier.MaxDDPct, 1)} sub={fmtEUR(tier.MaxDDEUR)} />
                <Kpi label="PF" value={fmtNum(tier.PF)} />
                <Kpi label="Expectancy" value={fmtEUR(tier.expectancyEUR)} />
                <Kpi label="Margin" value={fmtPct(tier.marginPct, 1)} sub={fmtEUR(tier.marginTotal)} />
                <Kpi label="Min Excess Liquidity" value={fmtEUR(tier.stressMarginNeeded)} />
              </div>
            </div>
          )}

          {/* Equity curve */}
          {chartData.length > 0 && (
            <div>
              <SectionTitle>Equity Curve</SectionTitle>
              <div style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 14, padding: "12px 6px 6px", height: 160 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="mwsNav" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={GOLD} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={GOLD} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                    <XAxis dataKey="date" hide />
                    <YAxis hide domain={["auto", "auto"]} />
                    <Tooltip
                      contentStyle={{ background: "#0c0d10", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11 }}
                      labelStyle={{ color: "rgba(255,255,255,0.5)" }}
                      formatter={(v: any) => [fmtEUR(Number(v)), "NAV"]}
                    />
                    <Area type="monotone" dataKey="nav" stroke={GOLD} strokeWidth={1.6} fill="url(#mwsNav)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Drawdown */}
          {chartData.length > 0 && (
            <div>
              <SectionTitle>Drawdown</SectionTitle>
              <div style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 14, padding: "12px 6px 6px", height: 110 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="mwsDd" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#ef4444" stopOpacity={0} />
                        <stop offset="100%" stopColor="#ef4444" stopOpacity={0.35} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" hide />
                    <YAxis hide domain={["auto", 0]} />
                    <Tooltip
                      contentStyle={{ background: "#0c0d10", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11 }}
                      labelStyle={{ color: "rgba(255,255,255,0.5)" }}
                      formatter={(v: any) => [fmtPct(Number(v), 2), "DD"]}
                    />
                    <Area type="monotone" dataKey="dd" stroke="#ef4444" strokeWidth={1.4} fill="url(#mwsDd)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Contracts / core sleeves */}
          <div>
            <SectionTitle>Core Sleeves ({coreComponents.length}/5)</SectionTitle>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {coreComponents.map(c => (
                <div key={c.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: CARD_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 10, padding: "9px 12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: GOLD, flexShrink: 0 }} />
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: "rgba(255,255,255,0.85)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {c.label ?? c.instrument ?? c.id}
                    </span>
                  </div>
                  <span style={{ fontSize: 12, fontFamily: "var(--font-numbers, monospace)", color: GOLD, fontWeight: 700, flexShrink: 0 }}>
                    {tier?.contracts?.[c.id] ?? c.contracts}×
                  </span>
                </div>
              ))}
            </div>
          </div>

          {optionalComponents.length > 0 && (
            <div>
              <SectionTitle>Optional ({optionalComponents.length})</SectionTitle>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {optionalComponents.map(c => (
                  <span key={c.id} style={{ fontSize: 10.5, padding: "5px 9px", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.5)" }}>
                    {c.label ?? c.instrument ?? c.id}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Capital comparison */}
          <div>
            <SectionTitle>Kapital-Vergleich</SectionTitle>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {summary.capitalComparison.map(c => (
                <button
                  key={c.capital}
                  onClick={() => setSelectedCapital(c.capital)}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    background: c.capital === selectedCapital ? "rgba(201,168,76,0.08)" : CARD_BG,
                    border: `1px solid ${c.capital === selectedCapital ? "rgba(201,168,76,0.3)" : CARD_BORDER}`,
                    borderRadius: 10, padding: "8px 12px", textAlign: "left", WebkitTapHighlightColor: "transparent",
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.8)", fontFamily: "var(--font-numbers, monospace)" }}>{fmtCap(c.capital)}</span>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>{fmtPct(c.CAGR, 1)} CAGR</span>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>{fmtNum(c.Sharpe)} Sharpe</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: c.assessment === "COMFORTABLE" || c.assessment === "FEASIBLE" ? "#22c55e" : c.assessment === "TIGHT" ? "#f59e0b" : "#ef4444" }}>
                    {c.assessment}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Final recommendation */}
          <div style={{ background: "linear-gradient(135deg, rgba(201,168,76,0.10), rgba(201,168,76,0.02))", border: "1px solid rgba(201,168,76,0.25)", borderRadius: 14, padding: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: GOLD, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Empfehlung</div>
            <p style={{ margin: 0, fontSize: 12.5, color: "rgba(255,255,255,0.75)", lineHeight: 1.5 }}>
              Empfohlenes Startkapital: <strong style={{ color: GOLD }}>{fmtCap(summary.recommendedCapital)}</strong>.
              {summary.serkan?.dateRange && ` Validiert über ${summary.serkan.dateRange[0]} – ${summary.serkan.dateRange[1]}.`}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
