import type { Metadata } from "next";
import {
  Info, TrendingUp, TrendingDown, Activity, Target,
  Layers, Calendar, Clock, Globe, Shield, Wallet,
  RefreshCw, BarChart2, Zap,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Info Panel — Capitalife",
  description: "Internes Infopanel: Strategien, Metriken, Investoren-Überblick.",
};

// Sources: white-swan-official-kpis.json · portfolio_f10_equity.json
//          white-swan-global-strategy.json · core-invest-paper.config.json

const M = "var(--font-montserrat), sans-serif";
const N = "var(--font-nunito), sans-serif";

export default function AboutPage() {
  return (
    <div className="relative flex h-full flex-col">
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="px-7 pb-20 pt-5">

          {/* ── HEADER ─────────────────────────────────────────────────────── */}
          <div className="mb-5 flex items-center gap-2.5">
            <Info size={18} className="shrink-0 text-[color:var(--dash-accent)]" />
            <div>
              <h1 className="text-[14px] font-bold leading-none text-white" style={{ fontFamily: N }}>
                Info Panel
              </h1>
              <p className="mt-0.5 text-[10px] text-[color:var(--dash-muted)]" style={{ fontFamily: M }}>
                Intern · kein Angebot · nicht geprüft
              </p>
            </div>
          </div>

          {/* ── ROW 1 — 3 Strategien nebeneinander ────────────────────────── */}
          <div className="mb-4 grid grid-cols-3 gap-3">

            {/* CFD Live */}
            <Card accent>
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <CardLabel>Live · CFD-Strategie</CardLabel>
                  <CardTitle>Intraday &amp; Swing</CardTitle>
                </div>
                <Badge color="gold">Live</Badge>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <StatRow icon={<TrendingUp size={12} className="text-green-400" />} label="Rendite p.a." value="+35.2%" green />
                <StatRow icon={<TrendingDown size={12} className="text-red-400" />} label="Max DD" value="−11.8%" red />
                <StatRow icon={<Activity size={12} />} label="Sharpe" value="1.60" />
                <StatRow icon={<Zap size={12} />} label="Calmar" value="3.0" />
                <StatRow icon={<Target size={12} />} label="Profit Factor" value="1.28" />
                <StatRow icon={<Calendar size={12} />} label="Seit" value="Apr 2024" />
              </div>
            </Card>

            {/* White Swan */}
            <Card>
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <CardLabel>01 · Futures · OOS BT</CardLabel>
                  <CardTitle>White Swan Portfolio</CardTitle>
                </div>
                <Badge color="gold">Unkorreliert</Badge>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <StatRow icon={<TrendingUp size={12} className="text-green-400" />} label="CAGR OOS" value="+4.6%" green />
                <StatRow icon={<TrendingDown size={12} className="text-red-400" />} label="Max DD" value="−4.4%" red />
                <StatRow icon={<Activity size={12} />} label="Sharpe" value="1.27" />
                <StatRow icon={<Zap size={12} />} label="Calmar" value="1.04" />
                <StatRow icon={<Layers size={12} />} label="Strategien" value="35 aktiv" />
                <StatRow icon={<Globe size={12} />} label="Sleeves" value="5 Märkte" />
              </div>
            </Card>

            {/* Core Invest */}
            <Card>
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <CardLabel>02 · ETF / Aktien · OOS BT</CardLabel>
                  <CardTitle>Core Invest</CardTitle>
                </div>
                <Badge color="blue">Leicht korr.</Badge>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <StatRow icon={<TrendingUp size={12} className="text-green-400" />} label="CAGR OOS" value="+17.1%" green />
                <StatRow icon={<TrendingDown size={12} className="text-red-400" />} label="Max DD" value="−21.7%" red />
                <StatRow icon={<Activity size={12} />} label="Sharpe" value="1.15" />
                <StatRow icon={<Zap size={12} />} label="Calmar" value="0.79" />
                <StatRow icon={<Layers size={12} />} label="Assets" value="8" />
                <StatRow icon={<RefreshCw size={12} />} label="Rebalancing" value="Quartalsweise" />
              </div>
            </Card>
          </div>

          {/* ── ROW 2 — Vergleich + Investor/Risiko ───────────────────────── */}
          <div className="mb-4 grid grid-cols-[1fr_260px] gap-3">

            {/* Comparison table */}
            <Card noPad>
              <div className="flex items-center gap-2 border-b border-white/[0.05] px-4 py-2.5">
                <BarChart2 size={12} className="text-[color:var(--dash-accent)]" />
                <CardLabel>Vergleich · Anlageklassen</CardLabel>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/[0.04]">
                    {["Strategie / Asset", "CAGR", "Max DD", "Sharpe", "Calmar", "Horizont", "Korr. zu WS"].map(h => (
                      <th key={h} className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-[color:var(--dash-muted)]" style={{ fontFamily: M }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.03]">
                  <TR accent name="CFD Live-Strategie" tag="LV" cagr="+35.2%" dd="−11.8%" s="1.60" c="3.0" h="Intraday–Tage" k="—" />
                  <TR accent name="White Swan" tag="BT" cagr="+4.6%" dd="−4.4%" s="1.27" c="1.04" h="Tage–Wochen" k="—" />
                  <TR name="Core Invest" tag="BT" cagr="+17.1%" dd="−21.7%" s="1.15" c="0.79" h="Wochen–Monate" k="mittel" />
                  <TR name="S&P 500" cagr="~10%" dd="−55%" s="~0.5" c="~0.2" h="Langfrist" k="niedrig" />
                  <TR name="DAX" cagr="~8%" dd="−60%" s="~0.4" c="~0.1" h="Langfrist" k="niedrig" />
                  <TR name="Gold" cagr="~7%" dd="−45%" s="~0.4" c="~0.2" h="Langfrist" k="mittel" />
                  <TR name="60/40" cagr="~7%" dd="−35%" s="~0.5" c="~0.2" h="Langfrist" k="niedrig" />
                  <TR name="Anleihen (AGG)" cagr="~3%" dd="−20%" s="~0.4" c="~0.2" h="Langfrist" k="sehr niedrig" />
                </tbody>
              </table>
            </Card>

            {/* Investor + Risiko */}
            <div className="flex flex-col gap-3">
              <Card>
                <div className="mb-2.5 flex items-center gap-2">
                  <Wallet size={12} className="text-[color:var(--dash-accent)]" />
                  <CardLabel>Für Investoren</CardLabel>
                </div>
                <div className="space-y-1.5">
                  <KV k="Liquidität"   v="Täglich" />
                  <KV k="Gebühren"     v="Keine" />
                  <KV k="Währung"      v="EUR / USD" />
                  <KV k="Ausschüttung" v="Thesaurierend" />
                  <KV k="Struktur"     v="Eigenhandel" />
                  <KV k="Regulierung"  v="Kein reg. Fonds" />
                </div>
              </Card>
              <Card>
                <div className="mb-2.5 flex items-center gap-2">
                  <Shield size={12} className="text-[color:var(--dash-accent)]" />
                  <CardLabel>Risikoprofil</CardLabel>
                </div>
                <div className="space-y-1.5">
                  <KV k="CFD"          v="Mittel–Hoch" />
                  <KV k="White Swan"   v="Niedrig" />
                  <KV k="Core Invest"  v="Mittel" />
                  <KV k="Korrelation"  v="WS zu Aktien: sehr niedrig" />
                  <KV k="Leverage"     v="Variabel" />
                </div>
              </Card>
            </div>
          </div>

          {/* ── ROW 3 — Zeithorizont / Eckdaten / Track Record ────────────── */}
          <div className="grid grid-cols-3 gap-3">
            <Card>
              <div className="mb-2.5 flex items-center gap-2">
                <Clock size={12} className="text-[color:var(--dash-accent)]" />
                <CardLabel>Zeithorizont</CardLabel>
              </div>
              <div className="space-y-1.5">
                <KV k="CFD Intraday"  v="Minuten–Stunden" />
                <KV k="CFD Swing"     v="1–5 Tage" />
                <KV k="White Swan"    v="1–30 Tage" />
                <KV k="Core Invest"   v="Wochen–12 Monate" />
                <KV k="WS IS-Periode" v="2003–2018" />
                <KV k="CI IS-Periode" v="2000–2018" />
              </div>
            </Card>
            <Card>
              <div className="mb-2.5 flex items-center gap-2">
                <Globe size={12} className="text-[color:var(--dash-accent)]" />
                <CardLabel>Eckdaten</CardLabel>
              </div>
              <div className="space-y-1.5">
                <KV k="Live seit"     v="Apr 2024" />
                <KV k="WS Sleeves"    v="Agrar · Metalle · Indizes · Energie · Forex" />
                <KV k="WS Assets"     v="29 Futures" />
                <KV k="CI Kern"       v="QQQ 45% · GLD 25%" />
                <KV k="Märkte"        v="Futures · CFD · ETF · FX" />
                <KV k="Signale"       v="Vollautomatisch" />
              </div>
            </Card>
            <Card>
              <div className="mb-2.5 flex items-center gap-2">
                <TrendingUp size={12} className="text-[color:var(--dash-accent)]" />
                <CardLabel>Track Record · Live</CardLabel>
              </div>
              <div className="space-y-1.5">
                <KV k="Periode"       v="Apr 2024 – Jul 2026" />
                <KV k="Gesamt"        v="+97.2%" />
                <KV k="Kompoundiert"  v="+114.6%" />
                <KV k="p.a."          v="+35.2%" />
                <KV k="Calmar"        v="3.0" />
                <KV k="Quelle"        v="Broker-Statement" />
              </div>
            </Card>
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

function Card({ children, noPad = false, accent = false }: {
  children: React.ReactNode; noPad?: boolean; accent?: boolean;
}) {
  return (
    <div className={[
      "rounded-[16px] border shadow-[0_12px_32px_-12px_rgba(0,0,0,0.5)]",
      accent
        ? "border-[color:var(--dash-accent)]/20 bg-gradient-to-b from-[#201e16] to-[#161510]"
        : "border-white/[0.06] bg-gradient-to-b from-[#1c1d20] to-[#141517]",
      noPad ? "" : "p-4",
    ].join(" ")}>
      {children}
    </div>
  );
}

function CardLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--dash-accent)]" style={{ fontFamily: M }}>
      {children}
    </p>
  );
}

function CardTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-0.5 text-[15px] font-bold text-white" style={{ fontFamily: N }}>
      {children}
    </p>
  );
}

function Badge({ children, color }: { children: React.ReactNode; color: "gold" | "blue" }) {
  const cls = color === "gold"
    ? "border-[color:var(--dash-accent)]/30 bg-[color:var(--dash-accent)]/10 text-[color:var(--dash-accent)]"
    : "border-blue-400/30 bg-blue-400/10 text-blue-400";
  return (
    <span className={`shrink-0 self-start rounded-full border px-2 py-0.5 text-[10px] font-semibold ${cls}`} style={{ fontFamily: M }}>
      {children}
    </span>
  );
}

function StatRow({ icon, label, value, green = false, red = false }: {
  icon: React.ReactNode; label: string; value: string; green?: boolean; red?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-[8px] border border-white/[0.04] bg-white/[0.025] px-2.5 py-2">
      <span className="shrink-0 text-[color:var(--dash-muted)]">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[9px] text-[color:var(--dash-muted)]" style={{ fontFamily: M }}>{label}</p>
        <p className={`text-[13px] font-bold leading-tight ${green ? "text-green-400" : red ? "text-red-400" : "text-white"}`} style={{ fontFamily: N }}>
          {value}
        </p>
      </div>
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

function TR({ name, tag, cagr, dd, s, c, h, k, accent = false }: {
  name: string; tag?: string; cagr: string; dd: string;
  s: string; c: string; h: string; k: string; accent?: boolean;
}) {
  return (
    <tr className={accent ? "bg-[color:var(--dash-accent)]/[0.03]" : ""}>
      <td className="px-4 py-2">
        <span className={`text-[12px] font-medium ${accent ? "text-[color:var(--dash-accent)]" : "text-white"}`} style={{ fontFamily: M }}>
          {name}
        </span>
        {tag && (
          <span className={`ml-1.5 rounded px-1 py-0.5 text-[9px] font-semibold ${accent ? "bg-[color:var(--dash-accent)]/15 text-[color:var(--dash-accent)]" : "bg-white/[0.06] text-zinc-500"}`}>
            {tag}
          </span>
        )}
      </td>
      <td className="px-4 py-2 text-[12px] font-semibold text-green-400" style={{ fontFamily: N }}>{cagr}</td>
      <td className="px-4 py-2 text-[12px] font-semibold text-red-400" style={{ fontFamily: N }}>{dd}</td>
      <td className="px-4 py-2 text-[12px] text-white" style={{ fontFamily: N }}>{s}</td>
      <td className="px-4 py-2 text-[12px] text-white" style={{ fontFamily: N }}>{c}</td>
      <td className="px-4 py-2 text-[11px] text-[color:var(--dash-muted)]" style={{ fontFamily: M }}>{h}</td>
      <td className="px-4 py-2 text-[11px] text-[color:var(--dash-muted)]" style={{ fontFamily: M }}>{k}</td>
    </tr>
  );
}
