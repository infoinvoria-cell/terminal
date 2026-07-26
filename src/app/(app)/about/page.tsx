import type { Metadata } from "next";
import { KpiCard } from "@/components/dashboard/kpi-card";

export const metadata: Metadata = {
  title: "About — Capitalife Capital",
  description: "Systematisches, regelbasiertes Trading — unkorreliert zu klassischen Märkten.",
};

// Verified number sources:
// Live CFD         → src/data/capitalife/white-swan-official-kpis.json
//   annualized_return_pct=35.2, max_drawdown_pct=-11.76, sharpe=1.6, calmar=3
//   period: 2024-04-11 – 2026-07-01
// White Swan OOS   → public/data/whiteswan/portfolio_f10_equity.json summary
//   cagr=4.608, maxDD=-4.419, sharpe=1.267, calmar=1.043 (OOS 2019–2026)
// WS Sleeve count  → src/data/capitalife/white-swan-global-strategy.json
//   active_entries=35, 5 sleeves
// Core Invest OOS  → src/data/capitalife/core-invest-paper.config.json validated_metrics.oos_period
//   cagr_pct=17.11, sharpe=1.152, max_dd_pct=-21.73, calmar=0.787

export default function AboutPage() {
  return (
    // Outer wrapper: h-full but NO scroll — provides the relative context for the gradient overlay
    <div className="relative flex h-full flex-col">

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="px-8 pb-24 pt-8">

          {/* ── HEADER ──────────────────────────────────────────────────────── */}
          <div className="mb-8 flex items-center gap-3">
            <div className="h-[1px] w-6 bg-[color:var(--dash-accent)]" />
            <span
              className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--dash-accent)]"
              style={{ fontFamily: "var(--font-montserrat), sans-serif" }}
            >
              Capital Management · Internes Infopanel
            </span>
          </div>

          <h1
            className="mb-2 text-[28px] font-bold leading-tight text-white"
            style={{ fontFamily: "var(--font-nunito), sans-serif", letterSpacing: "-0.02em" }}
          >
            Capitalife Capital
          </h1>
          <p
            className="mb-10 text-sm text-[color:var(--dash-muted)]"
            style={{ fontFamily: "var(--font-montserrat), sans-serif" }}
          >
            Systematisches, regelbasiertes Trading — unkorreliert zu klassischen Märkten.
          </p>

          {/* ── KPI STRIP — LIVE STRATEGIE ────────────────────────────────── */}
          <SectionLabel>Live-Strategie · Apr 2024 – Jul 2026¹</SectionLabel>
          <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <KpiCard label="Rendite p.a." value="+35.2%" subtitle="Ann., statement-basiert" />
            <KpiCard label="Max. Drawdown" value="−11.8%" subtitle="Live-Konto" valueVariant="negative" />
            <KpiCard label="Sharpe Ratio" value="1.60" subtitle="Live-Konto" />
            <KpiCard label="Calmar Ratio" value="3.0" subtitle="Return / MaxDD p.a." />
            <KpiCard label="Profit Factor" value="1.28" subtitle="Live-Konto" />
          </div>

          {/* ── ZWEI STRATEGIEN ───────────────────────────────────────────── */}
          <SectionLabel>Strategien</SectionLabel>
          <div className="mb-8 grid gap-4 lg:grid-cols-2">

            {/* White Swan */}
            <div className="rounded-[20px] border border-white/[0.06] bg-gradient-to-b from-[#1c1d20] to-[#141517] p-6 shadow-[0_20px_40px_-16px_rgba(0,0,0,0.55)]">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <p
                    className="text-[11px] font-semibold uppercase tracking-widest text-[color:var(--dash-muted)]"
                    style={{ fontFamily: "var(--font-montserrat), sans-serif" }}
                  >
                    01 · Futures
                  </p>
                  <p
                    className="mt-1 text-[20px] font-bold text-white"
                    style={{ fontFamily: "var(--font-nunito), sans-serif" }}
                  >
                    White Swan Portfolio
                  </p>
                </div>
                <span
                  className="shrink-0 rounded-full border border-[color:var(--dash-accent)]/30 bg-[color:var(--dash-accent)]/10 px-3 py-1 text-[11px] font-semibold text-[color:var(--dash-accent)]"
                  style={{ fontFamily: "var(--font-montserrat), sans-serif" }}
                >
                  Unkorreliert
                </span>
              </div>

              <p
                className="mb-5 text-sm leading-relaxed text-[color:var(--dash-muted)]"
                style={{ fontFamily: "var(--font-montserrat), sans-serif" }}
              >
                35 aktive Komponentenstrategien über 5 Sleeves (Agrar, Metalle, Indizes, Energie, Forex).
                Vollständig regelbasiert, keine Diskretionärentscheidungen.
              </p>

              {/* OOS stats grid */}
              <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: "CAGR (OOS)", value: "+4.6%" },
                  { label: "Max DD (OOS)", value: "−4.4%" },
                  { label: "Sharpe (OOS)", value: "1.27" },
                  { label: "Calmar (OOS)", value: "1.04" },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-[14px] border border-white/[0.04] bg-white/[0.03] px-4 py-3">
                    <p
                      className="text-[11px] text-[color:var(--dash-muted)]"
                      style={{ fontFamily: "var(--font-montserrat), sans-serif" }}
                    >
                      {label}
                    </p>
                    <p
                      className="mt-1 text-[18px] font-bold text-white"
                      style={{ fontFamily: "var(--font-nunito), sans-serif" }}
                    >
                      {value}
                    </p>
                  </div>
                ))}
              </div>

              {/* Sleeves */}
              <div className="mb-5 space-y-1.5">
                {[
                  { name: "Agrar Final",   active: 14, assets: "ZC1! ZW1! ZS1! CC1! KC1! OJ1! SB1! CT1!" },
                  { name: "Metals5",       active: 5,  assets: "GC1! SI1! HG1! PL1! PA1!" },
                  { name: "Indices Hybrid",active: 5,  assets: "ES1! NQ1! YM1! FDAX1! UKX" },
                  { name: "Energy Robust3",active: 3,  assets: "CL1! NG1! RB1!" },
                  { name: "Forex8",        active: 8,  assets: "EURGBP MXNUSD NOKUSD CLPUSD GBPJPY SEKUSD BRLUSD ZARUSD" },
                ].map(({ name, active, assets }) => (
                  <div key={name} className="flex items-center justify-between rounded-[10px] border border-white/[0.04] px-3 py-2">
                    <div className="flex items-center gap-3">
                      <span
                        className="min-w-[20px] text-center text-[13px] font-bold text-[color:var(--dash-accent)]"
                        style={{ fontFamily: "var(--font-nunito), sans-serif" }}
                      >
                        {active}
                      </span>
                      <span
                        className="text-[12px] text-white"
                        style={{ fontFamily: "var(--font-montserrat), sans-serif" }}
                      >
                        {name}
                      </span>
                    </div>
                    <span
                      className="hidden text-[11px] text-[color:var(--dash-muted)] sm:block"
                      style={{ fontFamily: "var(--font-montserrat), sans-serif" }}
                    >
                      {assets}
                    </span>
                  </div>
                ))}
              </div>

              <p
                className="text-[11px] leading-relaxed text-zinc-600"
                style={{ fontFamily: "var(--font-montserrat), sans-serif" }}
              >
                ⚠️ Walk-Forward OOS Backtest 2019–2026. Forward Tracking only — keine Live-Execution.
              </p>
            </div>

            {/* Core Invest */}
            <div className="rounded-[20px] border border-white/[0.06] bg-gradient-to-b from-[#1c1d20] to-[#141517] p-6 shadow-[0_20px_40px_-16px_rgba(0,0,0,0.55)]">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <p
                    className="text-[11px] font-semibold uppercase tracking-widest text-[color:var(--dash-muted)]"
                    style={{ fontFamily: "var(--font-montserrat), sans-serif" }}
                  >
                    02 · ETF / Aktien
                  </p>
                  <p
                    className="mt-1 text-[20px] font-bold text-white"
                    style={{ fontFamily: "var(--font-nunito), sans-serif" }}
                  >
                    Core Invest
                  </p>
                </div>
                <span
                  className="shrink-0 rounded-full border border-blue-400/30 bg-blue-400/10 px-3 py-1 text-[11px] font-semibold text-blue-400"
                  style={{ fontFamily: "var(--font-montserrat), sans-serif" }}
                >
                  Leicht korreliert
                </span>
              </div>

              <p
                className="mb-5 text-sm leading-relaxed text-[color:var(--dash-muted)]"
                style={{ fontFamily: "var(--font-montserrat), sans-serif" }}
              >
                Systematisch-regelbasiertes Langfrist-Portfolio über 8 Komponenten.
                Vierteljährliches Rebalancing. Status: approved, frozen — noch kein Live-Konto.
              </p>

              <div className="mb-5 grid grid-cols-2 gap-3">
                {[
                  { label: "CAGR (OOS)", value: "+17.1%" },
                  { label: "Max DD (OOS)", value: "−21.7%" },
                  { label: "Sharpe (OOS)", value: "1.15" },
                  { label: "Calmar (OOS)", value: "0.79" },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-[14px] border border-white/[0.04] bg-white/[0.03] px-4 py-3">
                    <p
                      className="text-[11px] text-[color:var(--dash-muted)]"
                      style={{ fontFamily: "var(--font-montserrat), sans-serif" }}
                    >
                      {label}
                    </p>
                    <p
                      className="mt-1 text-[18px] font-bold text-white"
                      style={{ fontFamily: "var(--font-nunito), sans-serif" }}
                    >
                      {value}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mb-5 space-y-1.5">
                {[
                  { symbol: "QQQ Passive",   weight: "45%", note: "ETF-Kern" },
                  { symbol: "GLD",           weight: "25%", note: "Gold-Anker" },
                  { symbol: "SPMO",          weight: "5%",  note: "Momentum-ETF" },
                  { symbol: "QQQ Pine 1/2",  weight: "10%", note: "Strategie-Sleeve" },
                  { symbol: "SPY",           weight: "5%",  note: "Benchmark-Sleeve" },
                  { symbol: "HG / CHF (6S)", weight: "10%", note: "Rohstoff + Forex" },
                ].map(({ symbol, weight, note }) => (
                  <div key={symbol} className="flex items-center justify-between rounded-[10px] border border-white/[0.04] px-3 py-2">
                    <span
                      className="text-[12px] text-white"
                      style={{ fontFamily: "var(--font-montserrat), sans-serif" }}
                    >
                      {symbol}
                    </span>
                    <div className="flex items-center gap-3">
                      <span
                        className="hidden text-[11px] text-[color:var(--dash-muted)] sm:block"
                        style={{ fontFamily: "var(--font-montserrat), sans-serif" }}
                      >
                        {note}
                      </span>
                      <span
                        className="w-10 text-right text-[12px] font-semibold text-[color:var(--dash-accent)]"
                        style={{ fontFamily: "var(--font-nunito), sans-serif" }}
                      >
                        {weight}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <p
                className="text-[11px] leading-relaxed text-zinc-600"
                style={{ fontFamily: "var(--font-montserrat), sans-serif" }}
              >
                ⚠️ OOS 2019–2026 · 50.388 Kombinationen Grid-Sweep · Calmar-optimiert · SPMO-Proxy für 2000–2015.
              </p>
            </div>
          </div>

          {/* ── VERGLEICHSTABELLE ─────────────────────────────────────────── */}
          <SectionLabel>Vergleich · klassische Anlageklassen</SectionLabel>
          <div className="mb-8 overflow-x-auto rounded-[20px] border border-white/[0.06] bg-gradient-to-b from-[#1c1d20] to-[#141517] shadow-[0_20px_40px_-16px_rgba(0,0,0,0.55)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  {["Asset / Strategie", "CAGR", "Max DD", "Sharpe", "Calmar", "Status"].map((h) => (
                    <th
                      key={h}
                      className="px-5 py-4 text-left text-[11px] font-semibold uppercase tracking-widest text-[color:var(--dash-muted)]"
                      style={{ fontFamily: "var(--font-montserrat), sans-serif" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                <CRow name="CFD-Strategie (Live)" tag="LV" cagr="+35.2%" dd="−11.8%" sharpe="1.60" calmar="3.0" status="Live · Apr 2024–Jul 2026¹" accent />
                <CRow name="White Swan Portfolio" tag="BT" cagr="+4.6%" dd="−4.4%" sharpe="1.27" calmar="1.04" status="OOS Backtest 2019–2026" accent />
                <CRow name="Core Invest" tag="BT" cagr="+17.1%" dd="−21.7%" sharpe="1.15" calmar="0.79" status="OOS Backtest 2019–2026" />
                <CRow name="S&P 500 (SPY)" cagr="~10%" dd="−55%" sharpe="~0.5" calmar="~0.2" status="Historisch" />
                <CRow name="DAX" cagr="~8%" dd="−60%" sharpe="~0.4" calmar="~0.1" status="Historisch" />
                <CRow name="Gold" cagr="~7%" dd="−45%" sharpe="~0.4" calmar="~0.2" status="Historisch" />
                <CRow name="60/40 Portfolio" cagr="~7%" dd="−35%" sharpe="~0.5" calmar="~0.2" status="Historisch" />
              </tbody>
            </table>
          </div>

          {/* ── QUICK STATS ───────────────────────────────────────────────── */}
          <SectionLabel>Eckdaten</SectionLabel>
          <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <KpiCard label="Live-Tracking seit" value="Apr 2024" />
            <KpiCard label="WS Komponenten" value="35" />
            <KpiCard label="WS Sleeves" value="5" />
            <KpiCard label="Backtest-Daten ab" value="2003" />
            <KpiCard label="Core Invest Assets" value="8" />
            <KpiCard label="Live-Monitoring" value="24/7" />
          </div>

          {/* footnote */}
          <p
            className="text-[11px] leading-relaxed text-zinc-600"
            style={{ fontFamily: "var(--font-montserrat), sans-serif" }}
          >
            ¹ Statement-basiert (Broker-Export), nicht unabhängig geprüft. BT = Walk-Forward OOS Backtest. LV = Live.
            Klassische Asset-Zahlen sind approximierte Richtwerte.
            White Swan: Forward Tracking only — keine Live-Execution, AuM EUR 0.
            Core Invest: approved, frozen, noch kein Live-Konto.
          </p>

        </div>
      </div>

      {/* ── SCROLL FADE — indicates more content below ──────────────────── */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-28"
        style={{ background: "linear-gradient(to top, #0a0a0c 0%, transparent 100%)" }}
      />
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <div className="h-[1px] w-4 rounded-full bg-[color:var(--dash-accent)]" />
      <span
        className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--dash-accent)]"
        style={{ fontFamily: "var(--font-montserrat), sans-serif" }}
      >
        {children}
      </span>
    </div>
  );
}

function CRow({
  name, tag, cagr, dd, sharpe, calmar, status, accent = false,
}: {
  name: string; tag?: string; cagr: string; dd: string;
  sharpe: string; calmar: string; status: string; accent?: boolean;
}) {
  return (
    <tr className={accent ? "bg-[color:var(--dash-accent)]/[0.04]" : ""}>
      <td className="px-5 py-3">
        <span
          className={accent ? "font-medium text-[color:var(--dash-accent)]" : "font-medium text-white"}
          style={{ fontFamily: "var(--font-montserrat), sans-serif" }}
        >
          {name}
        </span>
        {tag && (
          <span
            className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-semibold ${accent ? "bg-[color:var(--dash-accent)]/15 text-[color:var(--dash-accent)]" : "bg-white/[0.06] text-zinc-500"}`}
            style={{ fontFamily: "var(--font-montserrat), sans-serif" }}
          >
            {tag}
          </span>
        )}
      </td>
      <td className="px-5 py-3 font-semibold text-green-400" style={{ fontFamily: "var(--font-nunito), sans-serif" }}>{cagr}</td>
      <td className="px-5 py-3 font-semibold text-red-400" style={{ fontFamily: "var(--font-nunito), sans-serif" }}>{dd}</td>
      <td className="px-5 py-3 text-white" style={{ fontFamily: "var(--font-nunito), sans-serif" }}>{sharpe}</td>
      <td className="px-5 py-3 text-white" style={{ fontFamily: "var(--font-nunito), sans-serif" }}>{calmar}</td>
      <td className="px-5 py-3 text-[11px] text-zinc-500" style={{ fontFamily: "var(--font-montserrat), sans-serif" }}>{status}</td>
    </tr>
  );
}
