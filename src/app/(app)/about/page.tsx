import type { Metadata } from "next";
import Image from "next/image";

export const metadata: Metadata = {
  title: "Info Panel — Capitalife Capital",
  description: "Internes Infopanel: Strategien, Metriken, Investoren-Überblick.",
};

// Number sources (all verified):
// white-swan-official-kpis.json  → Live CFD: cagr=35.2, dd=-11.76, sharpe=1.6, calmar=3, pf=1.28
// portfolio_f10_equity.json      → WS OOS: cagr=4.608, dd=-4.419, sharpe=1.267, calmar=1.043
// white-swan-global-strategy.json → active_entries=35, 5 sleeves
// core-invest-paper.config.json  → CI OOS: cagr=17.11, dd=-21.73, sharpe=1.152, calmar=0.787

const M = "var(--font-montserrat), sans-serif";
const N = "var(--font-nunito), sans-serif";

export default function AboutPage() {
  return (
    <div className="relative flex h-full flex-col">
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="px-7 pb-20 pt-5">

          {/* ── HEADER ─────────────────────────────────────────────────────── */}
          <div className="mb-6 flex items-center gap-3">
            <Image
              src="/CAPITALIFE_ICON.png"
              alt="Capitalife"
              width={28}
              height={28}
              className="shrink-0 opacity-90"
            />
            <div>
              <h1 className="text-[15px] font-bold leading-none text-white" style={{ fontFamily: N }}>
                Info Panel
              </h1>
              <p className="mt-0.5 text-[11px] text-[color:var(--dash-muted)]" style={{ fontFamily: M }}>
                Capitalife Capital · Internes Dokument · kein Angebot
              </p>
            </div>
          </div>

          {/* ── ROW 1: Strategy side-by-side ───────────────────────────────── */}
          <div className="mb-4 grid gap-3 lg:grid-cols-2">

            {/* White Swan */}
            <Card>
              <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                  <Label>01 · Futures / Commodities</Label>
                  <Title>White Swan Portfolio</Title>
                </div>
                <Badge color="gold">Unkorreliert</Badge>
              </div>
              {/* 4-stat grid */}
              <div className="mb-3 grid grid-cols-4 gap-2">
                {[
                  { l: "CAGR OOS",   v: "+4.6%",  neg: false },
                  { l: "Max DD",     v: "−4.4%",  neg: true  },
                  { l: "Sharpe",     v: "1.27",   neg: false },
                  { l: "Calmar",     v: "1.04",   neg: false },
                ].map(({ l, v, neg }) => (
                  <MiniStat key={l} label={l} value={v} negative={neg} />
                ))}
              </div>
              {/* Two-col info */}
              <div className="mb-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-[12px]">
                <KV k="Komponenten"     v="35 aktive Strategien" />
                <KV k="Sleeves"         v="Agrar · Metalle · Indizes · Energie · Forex" />
                <KV k="Anlagehorizont"  v="Tage – Wochen (je Strategie)" />
                <KV k="Rebalancing"     v="Sleeve-gewichtet, laufend" />
                <KV k="Execution"       v="Forward Tracking · kein Live-Konto" />
                <KV k="Backtest"        v="Walk-Forward OOS 2019–2026 (IS ab 2003)" />
              </div>
              <Caveat>OOS-Backtest, nicht unabhängig geprüft. Keine Live-Execution. AuM EUR 0.</Caveat>
            </Card>

            {/* Core Invest */}
            <Card>
              <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                  <Label>02 · ETF / Aktien / Rohstoffe</Label>
                  <Title>Core Invest</Title>
                </div>
                <Badge color="blue">Leicht korreliert</Badge>
              </div>
              <div className="mb-3 grid grid-cols-4 gap-2">
                {[
                  { l: "CAGR OOS",   v: "+17.1%", neg: false },
                  { l: "Max DD",     v: "−21.7%", neg: true  },
                  { l: "Sharpe",     v: "1.15",   neg: false },
                  { l: "Calmar",     v: "0.79",   neg: false },
                ].map(({ l, v, neg }) => (
                  <MiniStat key={l} label={l} value={v} negative={neg} />
                ))}
              </div>
              <div className="mb-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-[12px]">
                <KV k="Komponenten"     v="8 Assets (QQQ 45% · GLD 25% · Sleeves 30%)" />
                <KV k="Benchmark"       v="SPY" />
                <KV k="Anlagehorizont"  v="Wochen – Monate (Langfrist)" />
                <KV k="Rebalancing"     v="Quartalsweise (Mrz · Jun · Sep · Dez)" />
                <KV k="Status"          v="Approved · Frozen · noch kein Live-Konto" />
                <KV k="Backtest"        v="Grid-Sweep 50.388 Komb. · OOS 2019–2026 (IS ab 2000)" />
              </div>
              <Caveat>OOS-Backtest, SPMO-Proxy 2000–2015. Calmar-optimiert. Kein Live-Track-Record.</Caveat>
            </Card>
          </div>

          {/* ── ROW 2: Vergleich + Investor-Facts ──────────────────────────── */}
          <div className="mb-4 grid gap-3 lg:grid-cols-[1fr_320px]">

            {/* Comparison table */}
            <Card noPad>
              <div className="border-b border-white/[0.06] px-4 py-2.5">
                <Label>Vergleich · Anlageklassen</Label>
              </div>
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-white/[0.04]">
                    {["Strategie / Asset", "CAGR", "Max DD", "Sharpe", "Calmar", "Horizont", "Korr. zu WS"].map(h => (
                      <th key={h} className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-[color:var(--dash-muted)]" style={{ fontFamily: M }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.03]">
                  <TRow accent name="CFD Live-Strategie" tag="LV" cagr="+35.2%" dd="−11.8%" sharpe="1.60" calmar="3.0" horizon="Intraday–Tage" corr="n/a" />
                  <TRow accent name="White Swan (OOS BT)" tag="BT" cagr="+4.6%" dd="−4.4%" sharpe="1.27" calmar="1.04" horizon="Tage–Wochen" corr="—" />
                  <TRow name="Core Invest (OOS BT)" tag="BT" cagr="+17.1%" dd="−21.7%" sharpe="1.15" calmar="0.79" horizon="Wochen–Monate" corr="mittel" />
                  <TRow name="S&P 500" cagr="~10%" dd="−55%" sharpe="~0.5" calmar="~0.2" horizon="Langfrist" corr="niedrig" />
                  <TRow name="DAX" cagr="~8%" dd="−60%" sharpe="~0.4" calmar="~0.1" horizon="Langfrist" corr="niedrig" />
                  <TRow name="Gold" cagr="~7%" dd="−45%" sharpe="~0.4" calmar="~0.2" horizon="Langfrist" corr="mittel" />
                  <TRow name="60/40" cagr="~7%" dd="−35%" sharpe="~0.5" calmar="~0.2" horizon="Langfrist" corr="niedrig" />
                  <TRow name="Anleihen (AGG)" cagr="~3%" dd="−20%" sharpe="~0.4" calmar="~0.2" horizon="Langfrist" corr="sehr niedrig" />
                </tbody>
              </table>
            </Card>

            {/* Investor facts */}
            <div className="flex flex-col gap-3">
              <Card>
                <Label>Für Investoren</Label>
                <div className="mt-2 space-y-1.5">
                  <KV k="Struktur"         v="Eigenverantwortlich verwaltetes Konto" />
                  <KV k="Mindestanlage"    v="Nicht definiert (intern)" />
                  <KV k="Liquidität"       v="Täglich (Futures / CFD)" />
                  <KV k="Gebühren"         v="Keine externe Management Fee" />
                  <KV k="Transparenz"      v="Live-Dashboard + Signal-Log" />
                  <KV k="Ausschüttung"     v="Keine — Thesaurierend" />
                  <KV k="Währung"          v="EUR / USD" />
                  <KV k="Regulierung"      v="Eigenhandel · kein regulierter Fonds" />
                </div>
              </Card>
              <Card>
                <Label>Risikoprofil</Label>
                <div className="mt-2 space-y-1.5">
                  <KV k="CFD-Strategie"    v="Mittel–Hoch (MaxDD ~12%)" />
                  <KV k="White Swan"       v="Niedrig (OOS MaxDD ~4%)" />
                  <KV k="Core Invest"      v="Mittel (OOS MaxDD ~22%)" />
                  <KV k="Korrelation"      v="WS zu Aktien: sehr niedrig" />
                  <KV k="Leverage"         v="Variabel (je Sleeve / Broker)" />
                  <KV k="Margin"           v="Intraday-Kontrolle aktiv" />
                </div>
              </Card>
            </div>
          </div>

          {/* ── ROW 3: Eckdaten + Zeithorizont ────────────────────────────── */}
          <div className="grid gap-3 lg:grid-cols-3">
            <Card>
              <Label>Zeithorizont</Label>
              <div className="mt-2 space-y-1.5">
                <KV k="CFD Intraday"      v="Minuten – Stunden" />
                <KV k="CFD Swing"         v="1–5 Tage" />
                <KV k="White Swan"        v="1–30 Tage (je Sleeves)" />
                <KV k="Core Invest"       v="Wochen – 12 Monate" />
                <KV k="WS Backtest"       v="OOS ab Jan 2019 / IS ab 2003" />
                <KV k="CI Backtest"       v="OOS ab Jan 2019 / IS ab 2000" />
              </div>
            </Card>
            <Card>
              <Label>Eckdaten</Label>
              <div className="mt-2 space-y-1.5">
                <KV k="Live-Tracking seit"  v="Apr 2024" />
                <KV k="WS Komponenten"      v="35 aktiv · 5 Sleeves · 29 Assets" />
                <KV k="CI Assets"           v="8 Komponenten (4 ETF + 4 Sleeves)" />
                <KV k="Märkte"              v="Futures · CFD · ETF · Aktien · FX" />
                <KV k="Monitoring"          v="24/7 via Capitalife Terminal" />
                <KV k="Signale"             v="Automatisch · regelbasiert · kein Ermessen" />
              </div>
            </Card>
            <Card>
              <Label>Track Record</Label>
              <div className="mt-2 space-y-1.5">
                <KV k="Periode"             v="Apr 2024 – Jul 2026 (Live)" />
                <KV k="Rendite gesamt"      v="+97.2% (kompoundiert +114.6%)" />
                <KV k="Rendite p.a."        v="+35.2% ann." />
                <KV k="Calmar (Live)"       v="3.0 (Rendite / MaxDD)" />
                <KV k="Profit Factor"       v="1.28" />
                <KV k="Quelle"             v="Broker-Statement (nicht geprüft)" />
              </div>
            </Card>
          </div>

          <p className="mt-4 text-[10px] leading-relaxed text-zinc-700" style={{ fontFamily: M }}>
            ¹ Statement-basiert, nicht unabhängig geprüft. BT = Walk-Forward OOS Backtest. LV = Live.
            Klassische Asset-Zahlen sind approximierte historische Richtwerte. Kein Anlageberatungsangebot.
          </p>

        </div>
      </div>

      {/* Scroll fade */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-20"
        style={{ background: "linear-gradient(to top, #0a0a0c 0%, transparent 100%)" }}
      />
    </div>
  );
}

// ─── Primitive building blocks ────────────────────────────────────────────────

function Card({ children, noPad = false }: { children: React.ReactNode; noPad?: boolean }) {
  return (
    <div className={`rounded-[16px] border border-white/[0.06] bg-gradient-to-b from-[#1c1d20] to-[#141517] shadow-[0_12px_32px_-12px_rgba(0,0,0,0.5)] ${noPad ? "" : "p-4"}`}>
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--dash-accent)]" style={{ fontFamily: M }}>
      {children}
    </p>
  );
}

function Title({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-0.5 text-[16px] font-bold text-white" style={{ fontFamily: N }}>
      {children}
    </p>
  );
}

function Badge({ children, color }: { children: React.ReactNode; color: "gold" | "blue" }) {
  const cls = color === "gold"
    ? "border-[color:var(--dash-accent)]/30 bg-[color:var(--dash-accent)]/10 text-[color:var(--dash-accent)]"
    : "border-blue-400/30 bg-blue-400/10 text-blue-400";
  return (
    <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${cls}`} style={{ fontFamily: M }}>
      {children}
    </span>
  );
}

function MiniStat({ label, value, negative }: { label: string; value: string; negative?: boolean }) {
  return (
    <div className="rounded-[10px] border border-white/[0.04] bg-white/[0.025] px-3 py-2">
      <p className="text-[10px] text-[color:var(--dash-muted)]" style={{ fontFamily: M }}>{label}</p>
      <p className={`mt-0.5 text-[15px] font-bold ${negative ? "text-zinc-400" : "text-white"}`} style={{ fontFamily: N }}>{value}</p>
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="shrink-0 text-[11px] text-[color:var(--dash-muted)]" style={{ fontFamily: M }}>{k}</span>
      <span className="text-right text-[11px] text-white" style={{ fontFamily: M }}>{v}</span>
    </div>
  );
}

function Caveat({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] leading-relaxed text-zinc-600" style={{ fontFamily: M }}>⚠️ {children}</p>
  );
}

function TRow({
  name, tag, cagr, dd, sharpe, calmar, horizon, corr, accent = false,
}: {
  name: string; tag?: string; cagr: string; dd: string;
  sharpe: string; calmar: string; horizon: string; corr: string; accent?: boolean;
}) {
  return (
    <tr className={accent ? "bg-[color:var(--dash-accent)]/[0.035]" : ""}>
      <td className="px-4 py-2">
        <span className={`${accent ? "text-[color:var(--dash-accent)]" : "text-white"} font-medium`} style={{ fontFamily: M }}>{name}</span>
        {tag && (
          <span className={`ml-1.5 rounded px-1 py-0.5 text-[9px] font-bold ${accent ? "bg-[color:var(--dash-accent)]/15 text-[color:var(--dash-accent)]" : "bg-white/[0.06] text-zinc-500"}`}>
            {tag}
          </span>
        )}
      </td>
      <td className="px-4 py-2 font-semibold text-green-400" style={{ fontFamily: N }}>{cagr}</td>
      <td className="px-4 py-2 font-semibold text-red-400" style={{ fontFamily: N }}>{dd}</td>
      <td className="px-4 py-2 text-white" style={{ fontFamily: N }}>{sharpe}</td>
      <td className="px-4 py-2 text-white" style={{ fontFamily: N }}>{calmar}</td>
      <td className="px-4 py-2 text-[color:var(--dash-muted)]" style={{ fontFamily: M }}>{horizon}</td>
      <td className="px-4 py-2 text-[color:var(--dash-muted)]" style={{ fontFamily: M }}>{corr}</td>
    </tr>
  );
}
