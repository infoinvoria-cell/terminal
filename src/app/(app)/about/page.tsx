import type { Metadata } from "next";
import {
  Info, TrendingUp, TrendingDown, Activity, Zap,
  Layers, Calendar, Clock, Globe, Shield, Wallet,
  RefreshCw, BarChart2, Target, CheckCircle,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Info Panel — Capitalife",
};

// Sources: white-swan-official-kpis.json · portfolio_f10_equity.json
//          white-swan-global-strategy.json · core-invest-paper.config.json

const M = "var(--font-montserrat), sans-serif";
const N = "var(--font-nunito), sans-serif";

export default function AboutPage() {
  return (
    <div className="relative flex h-full w-full flex-col">
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="px-8 pb-20 pt-5">

          {/* ── HEADER ─────────────────────────────────────────────────────── */}
          <div className="mb-6 flex items-center gap-2.5">
            <Info size={16} className="shrink-0 text-[color:var(--dash-accent)]" />
            <div>
              <h1 className="text-[13px] font-bold leading-none text-white" style={{ fontFamily: N }}>Info Panel</h1>
              <p className="mt-0.5 text-[10px] text-[color:var(--dash-muted)]" style={{ fontFamily: M }}>Intern · kein Angebot · nicht geprüft</p>
            </div>
          </div>

          {/* ── ROW 1 — ZWEI STRATEGIEN ────────────────────────────────────── */}
          <div className="mb-5 grid grid-cols-2 gap-5">

            {/* WHITE SWAN */}
            <div className="rounded-[20px] border border-white/[0.07] bg-gradient-to-b from-[#1e1f22] to-[#151618] p-7 shadow-[0_16px_40px_-16px_rgba(0,0,0,0.6)]">
              <div className="mb-5 flex items-start justify-between">
                <div>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-[color:var(--dash-muted)]" style={{ fontFamily: M }}>
                    01 · Futures · Walk-Forward OOS
                  </p>
                  <h2 className="text-[26px] font-bold text-white" style={{ fontFamily: N, letterSpacing: "-0.02em" }}>
                    White Swan Portfolio
                  </h2>
                </div>
                <span className="mt-1 rounded-full border border-[color:var(--dash-accent)]/30 bg-[color:var(--dash-accent)]/10 px-3 py-1 text-[11px] font-semibold text-[color:var(--dash-accent)]" style={{ fontFamily: M }}>
                  Unkorreliert
                </span>
              </div>

              {/* 4 big stat boxes */}
              <div className="mb-5 grid grid-cols-4 gap-3">
                <BigStat icon={<TrendingUp size={14} />} label="CAGR OOS" value="+4.6%" color="green" />
                <BigStat icon={<TrendingDown size={14} />} label="Max DD" value="−4.4%" color="red" />
                <BigStat icon={<Activity size={14} />} label="Sharpe" value="1.27" />
                <BigStat icon={<Zap size={14} />} label="Calmar" value="1.04" />
              </div>

              {/* Details grid */}
              <div className="grid grid-cols-2 gap-x-8 gap-y-2.5">
                <Row icon={<Layers size={12} />} k="Komponenten" v="35 aktive Strategien" />
                <Row icon={<Globe size={12} />} k="Märkte" v="Agrar · Metalle · Indizes · Energie · Forex" />
                <Row icon={<Clock size={12} />} k="Zeithorizont" v="1–30 Tage je Sleeve" />
                <Row icon={<Calendar size={12} />} k="Backtest" v="OOS 2019–2026 · IS ab 2003" />
                <Row icon={<CheckCircle size={12} />} k="Execution" v="Forward Tracking · kein Live-Konto" />
                <Row icon={<Target size={12} />} k="Korrelation" v="Sehr niedrig zu Aktien" />
              </div>
            </div>

            {/* CORE INVEST */}
            <div className="rounded-[20px] border border-white/[0.07] bg-gradient-to-b from-[#1e1f22] to-[#151618] p-7 shadow-[0_16px_40px_-16px_rgba(0,0,0,0.6)]">
              <div className="mb-5 flex items-start justify-between">
                <div>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-[color:var(--dash-muted)]" style={{ fontFamily: M }}>
                    02 · ETF / Aktien / Rohstoffe · OOS BT
                  </p>
                  <h2 className="text-[26px] font-bold text-white" style={{ fontFamily: N, letterSpacing: "-0.02em" }}>
                    Core Invest
                  </h2>
                </div>
                <span className="mt-1 rounded-full border border-blue-400/30 bg-blue-400/10 px-3 py-1 text-[11px] font-semibold text-blue-400" style={{ fontFamily: M }}>
                  Leicht korreliert
                </span>
              </div>

              <div className="mb-5 grid grid-cols-4 gap-3">
                <BigStat icon={<TrendingUp size={14} />} label="CAGR OOS" value="+17.1%" color="green" />
                <BigStat icon={<TrendingDown size={14} />} label="Max DD" value="−21.7%" color="red" />
                <BigStat icon={<Activity size={14} />} label="Sharpe" value="1.15" />
                <BigStat icon={<Zap size={14} />} label="Calmar" value="0.79" />
              </div>

              <div className="grid grid-cols-2 gap-x-8 gap-y-2.5">
                <Row icon={<Layers size={12} />} k="Assets" v="8 Komponenten" />
                <Row icon={<Globe size={12} />} k="Kern" v="QQQ 45% · GLD 25% · Sleeves 30%" />
                <Row icon={<Clock size={12} />} k="Zeithorizont" v="Wochen – 12 Monate" />
                <Row icon={<RefreshCw size={12} />} k="Rebalancing" v="Quartalsweise" />
                <Row icon={<Calendar size={12} />} k="Backtest" v="OOS 2019–2026 · IS ab 2000" />
                <Row icon={<CheckCircle size={12} />} k="Status" v="Approved · Frozen · kein Live-Konto" />
              </div>
            </div>
          </div>

          {/* ── ROW 2 — Vergleich + Investor/Risiko ───────────────────────── */}
          <div className="mb-5 grid grid-cols-[1fr_280px] gap-5">

            <div className="rounded-[20px] border border-white/[0.07] bg-gradient-to-b from-[#1e1f22] to-[#151618] shadow-[0_16px_40px_-16px_rgba(0,0,0,0.6)]">
              <div className="flex items-center gap-2 border-b border-white/[0.05] px-6 py-3.5">
                <BarChart2 size={13} className="text-[color:var(--dash-accent)]" />
                <p className="text-[11px] font-semibold uppercase tracking-widest text-[color:var(--dash-accent)]" style={{ fontFamily: M }}>Vergleich · Anlageklassen</p>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/[0.04]">
                    {["Strategie / Asset", "CAGR", "Max DD", "Sharpe", "Calmar", "Horizont", "Korr. zu WS"].map(h => (
                      <th key={h} className="px-5 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[color:var(--dash-muted)]" style={{ fontFamily: M }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.03]">
                  <TR accent name="White Swan" tag="BT" cagr="+4.6%" dd="−4.4%" s="1.27" c="1.04" h="Tage–Wochen" k="—" />
                  <TR accent name="Core Invest" tag="BT" cagr="+17.1%" dd="−21.7%" s="1.15" c="0.79" h="Wochen–Monate" k="mittel" />
                  <TR name="S&P 500" cagr="~10%" dd="−55%" s="~0.5" c="~0.2" h="Langfrist" k="niedrig" />
                  <TR name="DAX" cagr="~8%" dd="−60%" s="~0.4" c="~0.1" h="Langfrist" k="niedrig" />
                  <TR name="Gold" cagr="~7%" dd="−45%" s="~0.4" c="~0.2" h="Langfrist" k="mittel" />
                  <TR name="60/40" cagr="~7%" dd="−35%" s="~0.5" c="~0.2" h="Langfrist" k="niedrig" />
                  <TR name="Anleihen (AGG)" cagr="~3%" dd="−20%" s="~0.4" c="~0.2" h="Langfrist" k="sehr niedrig" />
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-5">
              <div className="flex-1 rounded-[20px] border border-white/[0.07] bg-gradient-to-b from-[#1e1f22] to-[#151618] p-5 shadow-[0_16px_40px_-16px_rgba(0,0,0,0.6)]">
                <SectionHead icon={<Wallet size={13} />} label="Für Investoren" />
                <div className="mt-3 space-y-2.5">
                  <KV k="Liquidität"   v="Täglich" />
                  <KV k="Gebühren"     v="Keine" />
                  <KV k="Währung"      v="EUR / USD" />
                  <KV k="Ausschüttung" v="Thesaurierend" />
                  <KV k="Struktur"     v="Eigenhandel" />
                  <KV k="Regulierung"  v="Kein reg. Fonds" />
                </div>
              </div>
              <div className="flex-1 rounded-[20px] border border-white/[0.07] bg-gradient-to-b from-[#1e1f22] to-[#151618] p-5 shadow-[0_16px_40px_-16px_rgba(0,0,0,0.6)]">
                <SectionHead icon={<Shield size={13} />} label="Risikoprofil" />
                <div className="mt-3 space-y-2.5">
                  <KV k="White Swan"  v="Niedrig (MaxDD ~4%)" />
                  <KV k="Core Invest" v="Mittel (MaxDD ~22%)" />
                  <KV k="Korrelation" v="WS zu Aktien: sehr niedrig" />
                  <KV k="Leverage"    v="Variabel je Sleeve" />
                </div>
              </div>
            </div>
          </div>

          {/* ── ROW 3 — Track Record + Zeithorizont + Eckdaten ───────────── */}
          <div className="grid grid-cols-3 gap-5">
            <div className="rounded-[20px] border border-white/[0.07] bg-gradient-to-b from-[#1e1f22] to-[#151618] p-5 shadow-[0_16px_40px_-16px_rgba(0,0,0,0.6)]">
              <SectionHead icon={<TrendingUp size={13} />} label="Track Record · Live CFD" />
              <div className="mt-3 space-y-2.5">
                <KV k="Periode"      v="Apr 2024 – Jul 2026" />
                <KV k="Gesamt"       v="+97.2%" />
                <KV k="Kompoundiert" v="+114.6%" />
                <KV k="p.a."         v="+35.2%" />
                <KV k="Calmar"       v="3.0" />
                <KV k="Sharpe"       v="1.60" />
                <KV k="Max DD"       v="−11.8%" />
                <KV k="Profit Factor" v="1.28" />
                <KV k="Quelle"       v="Broker-Statement" />
              </div>
            </div>
            <div className="rounded-[20px] border border-white/[0.07] bg-gradient-to-b from-[#1e1f22] to-[#151618] p-5 shadow-[0_16px_40px_-16px_rgba(0,0,0,0.6)]">
              <SectionHead icon={<Clock size={13} />} label="Zeithorizont" />
              <div className="mt-3 space-y-2.5">
                <KV k="CFD Intraday"  v="Minuten – Stunden" />
                <KV k="CFD Swing"     v="1–5 Tage" />
                <KV k="White Swan"    v="1–30 Tage" />
                <KV k="Core Invest"   v="Wochen – 12 Monate" />
                <KV k="WS Backtest"   v="OOS ab 2019 · IS ab 2003" />
                <KV k="CI Backtest"   v="OOS ab 2019 · IS ab 2000" />
              </div>
            </div>
            <div className="rounded-[20px] border border-white/[0.07] bg-gradient-to-b from-[#1e1f22] to-[#151618] p-5 shadow-[0_16px_40px_-16px_rgba(0,0,0,0.6)]">
              <SectionHead icon={<Globe size={13} />} label="Eckdaten" />
              <div className="mt-3 space-y-2.5">
                <KV k="Live seit"   v="Apr 2024" />
                <KV k="WS Sleeves"  v="Agrar · Metalle · Indizes · Energie · Forex" />
                <KV k="WS Assets"   v="29 Futures · 35 aktive Strategien" />
                <KV k="CI Kern"     v="QQQ 45% · GLD 25% · Sleeves 30%" />
                <KV k="Märkte"      v="Futures · CFD · ETF · FX" />
                <KV k="Signale"     v="Vollautomatisch · regelbasiert" />
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Scroll fade */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-16"
        style={{ background: "linear-gradient(to top, #0a0a0c 0%, transparent 100%)" }}
      />
    </div>
  );
}

// ─── Primitives ───────────────────────────────────────────────────────────────

function BigStat({ icon, label, value, color }: {
  icon: React.ReactNode; label: string; value: string; color?: "green" | "red";
}) {
  const valColor = color === "green" ? "text-green-400" : color === "red" ? "text-zinc-400" : "text-white";
  return (
    <div className="rounded-[12px] border border-white/[0.05] bg-white/[0.03] px-4 py-3">
      <div className="mb-1.5 flex items-center gap-1.5 text-[color:var(--dash-muted)]">{icon}
        <span className="text-[10px]" style={{ fontFamily: M }}>{label}</span>
      </div>
      <p className={`text-[22px] font-bold leading-none ${valColor}`} style={{ fontFamily: N }}>{value}</p>
    </div>
  );
}

function Row({ icon, k, v }: { icon: React.ReactNode; k: string; v: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="shrink-0 text-[color:var(--dash-muted)]">{icon}</span>
      <span className="text-[11px] text-[color:var(--dash-muted)]" style={{ fontFamily: M }}>{k}</span>
      <span className="ml-auto text-right text-[11px] font-medium text-white" style={{ fontFamily: M }}>{v}</span>
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="shrink-0 text-[11px] text-[color:var(--dash-muted)]" style={{ fontFamily: M }}>{k}</span>
      <span className="text-right text-[11px] font-medium text-white" style={{ fontFamily: M }}>{v}</span>
    </div>
  );
}

function SectionHead({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[color:var(--dash-accent)]">{icon}</span>
      <p className="text-[11px] font-semibold uppercase tracking-widest text-[color:var(--dash-accent)]" style={{ fontFamily: M }}>{label}</p>
    </div>
  );
}

function TR({ name, tag, cagr, dd, s, c, h, k, accent = false }: {
  name: string; tag?: string; cagr: string; dd: string;
  s: string; c: string; h: string; k: string; accent?: boolean;
}) {
  return (
    <tr className={accent ? "bg-[color:var(--dash-accent)]/[0.03]" : ""}>
      <td className="px-5 py-2.5">
        <span className={`text-[12px] font-medium ${accent ? "text-[color:var(--dash-accent)]" : "text-white"}`} style={{ fontFamily: M }}>{name}</span>
        {tag && <span className={`ml-1.5 rounded px-1 py-0.5 text-[9px] font-semibold ${accent ? "bg-[color:var(--dash-accent)]/15 text-[color:var(--dash-accent)]" : "bg-white/[0.06] text-zinc-500"}`}>{tag}</span>}
      </td>
      <td className="px-5 py-2.5 text-[12px] font-semibold text-green-400" style={{ fontFamily: N }}>{cagr}</td>
      <td className="px-5 py-2.5 text-[12px] font-semibold text-red-400" style={{ fontFamily: N }}>{dd}</td>
      <td className="px-5 py-2.5 text-[12px] text-white" style={{ fontFamily: N }}>{s}</td>
      <td className="px-5 py-2.5 text-[12px] text-white" style={{ fontFamily: N }}>{c}</td>
      <td className="px-5 py-2.5 text-[11px] text-[color:var(--dash-muted)]" style={{ fontFamily: M }}>{h}</td>
      <td className="px-5 py-2.5 text-[11px] text-[color:var(--dash-muted)]" style={{ fontFamily: M }}>{k}</td>
    </tr>
  );
}
