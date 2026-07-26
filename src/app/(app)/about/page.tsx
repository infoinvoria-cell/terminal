import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About — Capitalife Capital",
  description: "Systematisches, regelbasiertes Trading — unkorreliert zu klassischen Märkten.",
};

// Numbers sourced from verified files only — no estimates:
// White Swan F+10  → public/data/whiteswan/portfolio_f10_equity.json
//   cagr=4.608, maxDD=-4.419, sharpe=1.267 (OOS 2019-2026 backtest)
// CFD live         → src/data/capitalife/performance-monthly.json +
//                    04_Track_Record/Performance Source Register.md
//   Ann.=35.2%, maxDD=-11.76%, sharpe=1.60 (statement-based, Apr 2024–Jul 2026)
// Strategy count   → src/data/capitalife/white-swan-global-strategy.json
//   active_entries=35, unique_assets=29

export default function AboutPage() {
  return (
    <div className="h-full overflow-y-auto overflow-x-hidden">
      <div className="mx-auto max-w-5xl px-6 pb-20 pt-10 lg:px-10">

        {/* ── HERO ──────────────────────────────────────────────────────────── */}
        <section className="border-b border-white/[0.06] pb-16">
          <div className="mb-7 flex items-center gap-2">
            <div className="h-0.5 w-8 rounded-full bg-[#e2ca7a]" />
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#e2ca7a]">
              Capital Management
            </span>
          </div>

          <h1 className="mb-4 text-4xl font-extrabold tracking-tight text-white lg:text-6xl" style={{ letterSpacing: "-0.02em" }}>
            CAPITALIFE CAPITAL
          </h1>
          <p className="mb-12 max-w-2xl text-lg text-zinc-400 leading-relaxed">
            Systematisches, regelbasiertes Trading —<br />
            unkorreliert zu klassischen Märkten.
          </p>

          {/* Hero stats */}
          <div className="flex flex-wrap gap-3">
            {[
              { label: "Rendite p.a. (Live)", value: "+35.2%", sub: "Apr 2024 – Jul 2026¹" },
              { label: "Max. Drawdown (Live)", value: "−11.8%", sub: "Apr 2024 – Jul 2026¹" },
              { label: "Sharpe Ratio (Live)",  value: "1.60",   sub: "Apr 2024 – Jul 2026¹" },
            ].map(({ label, value, sub }) => (
              <div
                key={label}
                className="flex-1 basis-44 rounded-xl border border-[#e2ca7a]/20 bg-[#e2ca7a]/10 px-6 py-5"
              >
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#e2ca7a]">{label}</p>
                <p className="text-4xl font-extrabold leading-none text-[#e2ca7a]" style={{ letterSpacing: "-0.03em" }}>{value}</p>
                <p className="mt-2 text-xs text-zinc-500">{sub}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[11px] text-zinc-600">
            ¹ Statement-basiert (RoboForex), nicht unabhängig geprüft. Backtest-Daten White Swan: Walk-Forward OOS 2019–2026.
          </p>
        </section>

        {/* ── PHILOSOPHIE ───────────────────────────────────────────────────── */}
        <section className="border-b border-white/[0.06] py-16">
          <SectionLabel>Unsere Philosophie</SectionLabel>
          <h2 className="mb-10 text-2xl font-bold tracking-tight text-white lg:text-3xl">Zwei Strategien. Ein System.</h2>

          <div className="grid gap-4 lg:grid-cols-2">
            <StrategyCard
              tag="01"
              title="WHITE SWAN PORTFOLIO"
              badge="Unkorreliert"
              badgeClass="border-[#e2ca7a]/30 bg-[#e2ca7a]/10 text-[#e2ca7a]"
              desc="Vollständig regelbasiert über 35 aktive Strategien auf 29 Futures-Märkten. Diversifikation über Rohstoffe, Edelmetalle, Agrar, Indizes und Forex."
              goal="Positive Rendite unabhängig von Marktphasen"
              stats={[
                { label: "CAGR (OOS Backtest 2019–2026)", value: "+4.6%" },
                { label: "Max DD (OOS Backtest)",          value: "−4.4%" },
                { label: "Sharpe (OOS Backtest)",          value: "1.27"  },
                { label: "Aktive Strategien",              value: "35"    },
                { label: "Unique Assets",                  value: "29"    },
              ]}
              caveat="Backtest-Daten (Walk-Forward OOS). Kein Live-Track-Record."
            />
            <StrategyCard
              tag="02"
              title="CORE INVEST"
              badge="Leicht korreliert"
              badgeClass="border-blue-400/30 bg-blue-400/10 text-blue-400"
              desc="Langfristige, systematische Investments in ausgewählte Qualitäts-Assets. ETFs, Aktien und Rohstoffe mit klar definierten Ein- und Ausstiegsregeln."
              goal="Markt schlagen bei kontrolliertem Drawdown"
              stats={[
                { label: "Ansatz",      value: "Aktiv / regelbasiert" },
                { label: "Universum",   value: "ETFs · Aktien · Rohstoffe" },
                { label: "Haltedauer", value: "Wochen – Monate" },
                { label: "Status",      value: "Forschungsphase" },
              ]}
              caveat="Noch kein öffentlicher Track Record."
            />
          </div>
        </section>

        {/* ── WARUM CAPITALIFE ──────────────────────────────────────────────── */}
        <section className="border-b border-white/[0.06] py-16">
          <SectionLabel>Für Vertriebler</SectionLabel>
          <h2 className="mb-10 text-2xl font-bold tracking-tight text-white lg:text-3xl">Warum Capitalife?</h2>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { icon: "⚙️", title: "100% regelbasiert",       text: "Kein Bauchgefühl, kein menschliches Ermessen. Jede Entscheidung folgt einem dokumentierten Algorithmus." },
              { icon: "📈", title: "20+ Jahre Backtest",       text: "Walk-Forward-optimiert auf echten Marktdaten seit 2003. Keine Kurvenanpassung, keine In-Sample-Tricks." },
              { icon: "🔗", title: "Unkorreliert",             text: "White Swan-Strategien zeigen keine signifikante Korrelation zu DAX, S&P 500 oder klassischen Fonds." },
              { icon: "🔍", title: "Volle Transparenz",        text: "Jedes Signal nachvollziehbar, jede Regel dokumentiert. Live-Dashboard für alle Positionen." },
              { icon: "📊", title: "Live-Monitoring 24/7",     text: "Capitalife Terminal überwacht alle Positionen in Echtzeit und liefert tägliche Signale." },
              { icon: "🏦", title: "Reguliertes Konto",        text: "Execution über Interactive Brokers. Geregelt, transparent, vollständig eigenverantwortlich verwaltet." },
            ].map(({ icon, title, text }) => (
              <div key={title} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
                <div className="mb-3 text-2xl">{icon}</div>
                <p className="mb-2 text-sm font-bold text-white">{title}</p>
                <p className="text-sm leading-relaxed text-zinc-400">{text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── VERGLEICH ─────────────────────────────────────────────────────── */}
        <section className="border-b border-white/[0.06] py-16">
          <SectionLabel>Vergleich</SectionLabel>
          <h2 className="mb-2 text-2xl font-bold tracking-tight text-white lg:text-3xl">Capitalife vs. Klassische Anlageklassen</h2>
          <p className="mb-8 text-sm text-zinc-500">
            White Swan: Walk-Forward OOS Backtest 2019–2026 · CFD-Strategie: Live-Statement Apr 2024–Jul 2026 · Klassische Assets: historische Richtwerte
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  {["Asset / Strategie", "CAGR", "Max DD", "Sharpe", "Korrelation zu WS", "Status"].map((h) => (
                    <th key={h} className="pb-3 pr-6 text-left text-[11px] font-semibold uppercase tracking-widest text-zinc-600 first:pl-0">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                <CompareRow name="White Swan Portfolio" tag="BT" cagr="+4.6%" dd="−4.4%" sharpe="1.27" corr="—"      status="OOS Backtest 2019–2026" highlight />
                <CompareRow name="CFD-Strategie (Intraday)" tag="LV" cagr="+35.2%" dd="−11.8%" sharpe="1.60" corr="niedrig" status="Live Statement¹"       highlight />
                <CompareRow name="S&P 500 (SPY)"       cagr="~10%" dd="−55%" sharpe="~0.5" corr="niedrig" status="Historisch" />
                <CompareRow name="DAX"                  cagr="~8%"  dd="−60%" sharpe="~0.4" corr="niedrig" status="Historisch" />
                <CompareRow name="Gold"                 cagr="~7%"  dd="−45%" sharpe="~0.4" corr="mittel"  status="Historisch" />
                <CompareRow name="Anleihen (AGG)"       cagr="~3%"  dd="−20%" sharpe="~0.4" corr="niedrig" status="Historisch" />
                <CompareRow name="60/40 Portfolio"      cagr="~7%"  dd="−35%" sharpe="~0.5" corr="mittel"  status="Historisch" />
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-[11px] text-zinc-600">
            ¹ Statement-basiert, nicht unabhängig geprüft. BT = Backtest. LV = Live. Klassische Asset-Zahlen sind approximierte Richtwerte.
          </p>
        </section>

        {/* ── TRACK RECORD & DATEN ──────────────────────────────────────────── */}
        <section className="border-b border-white/[0.06] py-16">
          <SectionLabel>Daten & Track Record</SectionLabel>
          <h2 className="mb-10 text-2xl font-bold tracking-tight text-white lg:text-3xl">Zahlen mit Substanz</h2>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { value: "Apr 2024", label: "Live-Tracking seit",            sub: "CFD-Konto (Live)",                ok: true  },
              { value: "29",       label: "Unique Assets im WS-Universum", sub: "White Swan Portfolio",            ok: true  },
              { value: "35",       label: "Aktive Strategien",             sub: "White Swan Portfolio",            ok: true  },
              { value: "2003",     label: "Backtest-Daten seit",           sub: "Walk-Forward IS + OOS",           ok: true  },
              { value: "24/7",     label: "Live-Monitoring",               sub: "via Capitalife Terminal",         ok: true  },
              { value: "0",        label: "Live-Execution White Swan",     sub: "Forward Tracking only — kein Broker", ok: false },
            ].map(({ value, label, sub, ok }) => (
              <div key={label} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-5 py-5">
                <p className={`text-3xl font-extrabold leading-none ${ok ? "text-[#e2ca7a]" : "text-red-400"}`} style={{ letterSpacing: "-0.02em" }}>{value}</p>
                <p className="mt-3 text-sm font-semibold text-white">{label}</p>
                <p className="mt-1 text-xs text-zinc-500">{sub}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── KONTAKT / CTA ─────────────────────────────────────────────────── */}
        <section className="pt-16">
          <SectionLabel>Kontakt</SectionLabel>
          <h2 className="mb-3 text-2xl font-bold tracking-tight text-white lg:text-3xl">Sprechen Sie uns an.</h2>
          <p className="mb-10 max-w-xl text-base leading-relaxed text-zinc-400">
            Interesse an einer Zusammenarbeit oder Fragen zu unseren Strategien? Wir freuen uns auf Ihre Nachricht.
          </p>

          <div className="flex flex-wrap gap-3">
            <a
              href="mailto:jgfxtrading.business@gmail.com"
              className="inline-flex items-center gap-2 rounded-lg bg-[#e2ca7a] px-6 py-3 text-sm font-bold text-[#0a0a0c] transition-opacity hover:opacity-90"
            >
              E-Mail senden
            </a>
            <a
              href="https://calendly.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-[#e2ca7a]/25 px-6 py-3 text-sm font-bold text-[#e2ca7a] transition-opacity hover:opacity-80"
            >
              Termin buchen
            </a>
          </div>

          <p className="mt-12 max-w-2xl text-[11px] leading-relaxed text-zinc-600">
            <strong className="text-zinc-500">Rechtlicher Hinweis:</strong>{" "}
            Diese Seite dient ausschließlich zu Informationszwecken und stellt keine Anlageberatung,
            kein Angebot und keine Aufforderung zum Kauf oder Verkauf von Finanzinstrumenten dar.
            Vergangene Performance ist kein verlässlicher Indikator für zukünftige Ergebnisse.
            Alle Backtest-Daten sind hypothetisch und unterliegen inhärenten Einschränkungen.
          </p>
        </section>

      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1 flex items-center gap-2">
      <div className="h-0.5 w-5 rounded-full bg-[#e2ca7a]" />
      <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#e2ca7a]">{children}</span>
    </div>
  );
}

function StrategyCard({
  tag, title, badge, badgeClass, desc, goal, stats, caveat,
}: {
  tag: string; title: string; badge: string; badgeClass: string;
  desc: string; goal: string;
  stats: { label: string; value: string }[];
  caveat: string;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold text-zinc-600">{tag}</p>
          <p className="mt-0.5 text-base font-bold text-white">{title}</p>
        </div>
        <span className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-bold ${badgeClass}`}>{badge}</span>
      </div>
      <p className="text-sm leading-relaxed text-zinc-400">{desc}</p>
      <div className="rounded-lg border-l-2 border-[#e2ca7a] bg-[#e2ca7a]/[0.07] px-4 py-2.5">
        <span className="text-xs font-semibold text-[#e2ca7a]">Ziel: </span>
        <span className="text-xs text-zinc-400">{goal}</span>
      </div>
      <div className="divide-y divide-white/[0.05]">
        {stats.map(({ label, value }) => (
          <div key={label} className="flex items-center justify-between py-1.5">
            <span className="text-xs text-zinc-500">{label}</span>
            <span className="text-xs font-bold text-white">{value}</span>
          </div>
        ))}
      </div>
      <p className="border-t border-white/[0.05] pt-3 text-[11px] leading-relaxed text-zinc-600">⚠️ {caveat}</p>
    </div>
  );
}

function CompareRow({
  name, tag, cagr, dd, sharpe, corr, status, highlight = false,
}: {
  name: string; tag?: string; cagr: string; dd: string; sharpe: string;
  corr: string; status: string; highlight?: boolean;
}) {
  return (
    <tr className={highlight ? "bg-[#e2ca7a]/[0.04]" : ""}>
      <td className="py-3 pr-6 font-medium">
        <span className={highlight ? "text-[#e2ca7a]" : "text-white"}>{name}</span>
        {tag && (
          <span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-bold ${highlight ? "bg-[#e2ca7a]/15 text-[#e2ca7a]" : "bg-white/[0.06] text-zinc-500"}`}>
            {tag}
          </span>
        )}
      </td>
      <td className="py-3 pr-6 font-semibold text-green-400">{cagr}</td>
      <td className="py-3 pr-6 font-semibold text-red-400">{dd}</td>
      <td className="py-3 pr-6 text-white">{sharpe}</td>
      <td className="py-3 pr-6 text-zinc-400">{corr}</td>
      <td className="py-3 text-xs text-zinc-600">{status}</td>
    </tr>
  );
}
