import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Capitalife Capital — About",
  description: "Systematisches, regelbasiertes Trading — unkorreliert zu klassischen Märkten.",
};

// ─── Design tokens ────────────────────────────────────────────────────────────
const gold   = "#e2ca7a";
const goldDim = "rgba(226,202,122,0.18)";
const goldBorder = "rgba(226,202,122,0.22)";
const bg     = "#0a0a0c";
const surface = "rgba(255,255,255,0.03)";
const surfaceHover = "rgba(255,255,255,0.05)";
const border = "rgba(255,255,255,0.07)";
const textPrimary   = "#f0f2f5";
const textSecondary = "#8b8f99";
const textMuted     = "#5a5d66";
const green  = "#4ade80";
const red    = "#f87171";

// ─── Static data (source-verified) ────────────────────────────────────────────
// White Swan F+10 Portfolio — public/data/whiteswan/portfolio_f10_equity.json
//   summary.cagr=4.608, summary.maxDD=-4.419, summary.sharpe=1.267
//   meta.is_start=2003-01-01, meta.oos_start=2019-01-01
// Short-term CFD — src/data/capitalife/performance-monthly.json
//   period: 11.04.2024 – 01.07.2026, basis: Statement-based
//   From Performance Source Register: return=97.2%, ann.=35.2%, maxDD=-11.76%, sharpe=1.60
// White Swan strategy count — src/data/capitalife/white-swan-global-strategy.json
//   active_entries=35, unique_assets=29

export default function AboutPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: bg,
        color: textPrimary,
        fontFamily: "var(--font-montserrat, 'Montserrat', sans-serif)",
        overflowX: "hidden",
      }}
    >
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px 80px" }}>

        {/* ── HERO ──────────────────────────────────────────────────────────── */}
        <section style={{ paddingTop: 80, paddingBottom: 72, borderBottom: `1px solid ${border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 28 }}>
            <div style={{ width: 32, height: 2, background: gold, borderRadius: 1 }} />
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", color: gold, textTransform: "uppercase" }}>
              Capital Management
            </span>
          </div>

          <h1 style={{
            fontSize: "clamp(32px, 5vw, 58px)",
            fontWeight: 800,
            letterSpacing: "-0.02em",
            lineHeight: 1.08,
            marginBottom: 20,
            color: textPrimary,
          }}>
            CAPITALIFE CAPITAL
          </h1>

          <p style={{
            fontSize: "clamp(16px, 2.2vw, 22px)",
            fontWeight: 400,
            color: textSecondary,
            maxWidth: 680,
            lineHeight: 1.5,
            marginBottom: 52,
          }}>
            Systematisches, regelbasiertes Trading —<br />
            unkorreliert zu klassischen Märkten.
          </p>

          {/* Three hero numbers */}
          <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
            <HeroStat
              label="Rendite p.a. (Live)"
              value="+35.2%"
              sub="CFD-Konto Apr 2024 – Jul 2026"
              note="statement-basiert"
            />
            <HeroStat
              label="Max. Drawdown (Live)"
              value="-11.8%"
              sub="CFD-Konto Apr 2024 – Jul 2026"
              note="statement-basiert"
            />
            <HeroStat
              label="Sharpe Ratio (Live)"
              value="1.60"
              sub="CFD-Konto Apr 2024 – Jul 2026"
              note="statement-basiert"
            />
          </div>

          <p style={{ marginTop: 20, fontSize: 11, color: textMuted, letterSpacing: "0.03em" }}>
            ¹ Statement-basiert, nicht unabhängig geprüft. Kein Forward-Looking Prospekt.
            White Swan Portfolio: ausschließlich Walk-Forward Backtest-Daten (2003–2026).
          </p>
        </section>

        {/* ── UNSERE PHILOSOPHIE ───────────────────────────────────────────── */}
        <section style={{ paddingTop: 64, paddingBottom: 64, borderBottom: `1px solid ${border}` }}>
          <SectionLabel>Unsere Philosophie</SectionLabel>
          <h2 style={h2Style}>Zwei Strategien. Ein System.</h2>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16, marginTop: 40 }}>

            <StrategyCard
              tag="01"
              title="WHITE SWAN PORTFOLIO"
              badge="Unkorreliert"
              badgeColor={gold}
              desc="Vollständig regelbasiert über 35 aktive Strategien auf 29 Futures-Märkten. Diversifikation über Rohstoffe, Edelmetalle, Agrar, Indizes und Forex."
              goal="Positive Rendite unabhängig von Marktphasen"
              stats={[
                { label: "CAGR (OOS Backtest 2019–2026)", value: "+4.6%" },
                { label: "Max DD (OOS Backtest)", value: "-4.4%" },
                { label: "Sharpe (OOS Backtest)", value: "1.27" },
                { label: "Aktive Strategien", value: "35" },
                { label: "Unique Assets", value: "29" },
              ]}
              caveat="Backtest-Daten (Walk-Forward OOS). Kein Live-Track-Record."
            />

            <StrategyCard
              tag="02"
              title="CORE INVEST"
              badge="Leicht korreliert"
              badgeColor="rgba(96,165,250,0.9)"
              desc="Langfristige, systematische Investments in ausgewählte Qualitäts-Assets. ETFs, Aktien und Rohstoffe mit klar definierten Ein- und Ausstiegsregeln."
              goal="Markt schlagen bei kontrolliertem Drawdown"
              stats={[
                { label: "Ansatz", value: "Aktiv / regelbasiert" },
                { label: "Universum", value: "ETFs · Aktien · Rohstoffe" },
                { label: "Haltedauer", value: "Wochen – Monate" },
                { label: "Status", value: "Forschungsphase" },
              ]}
              caveat="Noch kein öffentlicher Track Record."
            />
          </div>
        </section>

        {/* ── WARUM CAPITALIFE ─────────────────────────────────────────────── */}
        <section style={{ paddingTop: 64, paddingBottom: 64, borderBottom: `1px solid ${border}` }}>
          <SectionLabel>Für Vertriebler</SectionLabel>
          <h2 style={h2Style}>Warum Capitalife?</h2>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12, marginTop: 40 }}>
            {[
              { icon: "⚙️", title: "100% regelbasiert", text: "Kein Bauchgefühl, kein menschliches Ermessen. Jede Entscheidung folgt einem dokumentierten Algorithmus." },
              { icon: "📈", title: "20+ Jahre Backtest", text: "Walk-Forward-optimiert auf echten Marktdaten seit 2003. Keine Kurvenanpassung, keine In-Sample-Tricks." },
              { icon: "🔗", title: "Unkorreliert", text: "Weiße Schwan-Strategien zeigen keine signifikante Korrelation zu DAX, S&P 500 oder klassischen Fonds." },
              { icon: "🔍", title: "Volle Transparenz", text: "Jedes Signal nachvollziehbar, jede Regel dokumentiert. Live-Dashboard für alle Positionen." },
              { icon: "📊", title: "Live-Monitoring 24/7", text: "Capitalife Terminal überwacht alle Positionen in Echtzeit und liefert tägliche Signale." },
              { icon: "🏦", title: "Reguliertes Konto", text: "Execution über Interactive Brokers. Geregelt, transparent, vollständig eigenverantwortlich verwaltet." },
            ].map(({ icon, title, text }) => (
              <FeatureCard key={title} icon={icon} title={title} text={text} />
            ))}
          </div>
        </section>

        {/* ── VERGLEICH MIT KLASSISCHEN ASSETS ──────────────────────────────── */}
        <section style={{ paddingTop: 64, paddingBottom: 64, borderBottom: `1px solid ${border}` }}>
          <SectionLabel>Vergleich</SectionLabel>
          <h2 style={h2Style}>Capitalife vs. Klassische Anlageklassen</h2>
          <p style={{ color: textSecondary, fontSize: 14, marginTop: 8, marginBottom: 36 }}>
            White Swan: Walk-Forward OOS Backtest 2019–2026 ·
            CFD-Strategie: Live-Statement Apr 2024 – Jul 2026 ·
            Klassische Assets: historische Richtwerte (Literatur/Indexanbieter)
          </p>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr>
                  {["Asset / Strategie", "CAGR", "Max DD", "Sharpe", "Korrelation zu WS", "Status"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "10px 16px", color: textMuted, fontWeight: 600, fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", borderBottom: `1px solid ${border}` }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <CompareRow
                  name="White Swan Portfolio"
                  tag="BT"
                  cagr="+4.6%"
                  dd="-4.4%"
                  sharpe="1.27"
                  corr="—"
                  status="OOS Backtest 2019–2026"
                  highlight
                />
                <CompareRow
                  name="CFD-Strategie (Intraday)"
                  tag="LV"
                  cagr="+35.2%"
                  dd="-11.8%"
                  sharpe="1.60"
                  corr="niedrig"
                  status="Live Statement ¹"
                  highlight
                />
                <CompareRow name="S&P 500 (SPY)" cagr="~10%" dd="-55%" sharpe="~0.5" corr="niedrig" status="Historisch" />
                <CompareRow name="DAX" cagr="~8%" dd="-60%" sharpe="~0.4" corr="niedrig" status="Historisch" />
                <CompareRow name="Gold" cagr="~7%" dd="-45%" sharpe="~0.4" corr="mittel" status="Historisch" />
                <CompareRow name="Anleihen (AGG)" cagr="~3%" dd="-20%" sharpe="~0.4" corr="niedrig" status="Historisch" />
                <CompareRow name="60/40 Portfolio" cagr="~7%" dd="-35%" sharpe="~0.5" corr="mittel" status="Historisch" />
              </tbody>
            </table>
          </div>
          <p style={{ marginTop: 14, fontSize: 11, color: textMuted }}>
            ¹ Statement-basiert, nicht unabhängig geprüft. BT = Backtest. LV = Live.
            Klassische Asset-Zahlen sind approximierte Richtwerte aus öffentlich verfügbaren Quellen (Morningstar, Bloomberg-Historien).
          </p>
        </section>

        {/* ── TRACK RECORD & DATEN ─────────────────────────────────────────── */}
        <section style={{ paddingTop: 64, paddingBottom: 64, borderBottom: `1px solid ${border}` }}>
          <SectionLabel>Daten & Track Record</SectionLabel>
          <h2 style={h2Style}>Zahlen mit Substanz</h2>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginTop: 40 }}>
            {[
              { value: "Apr 2024", label: "Live-Tracking seit", sub: "CFD-Konto (Live)", ok: true },
              { value: "29", label: "Unique Assets im WS-Universum", sub: "White Swan Portfolio", ok: true },
              { value: "35", label: "Aktive Strategien", sub: "White Swan Portfolio", ok: true },
              { value: "2003", label: "Backtest-Daten seit", sub: "Walk-Forward IS + OOS", ok: true },
              { value: "24/7", label: "Live-Monitoring", sub: "via Capitalife Terminal", ok: true },
              { value: "0", label: "Live-Execution (White Swan)", sub: "Forward Tracking only — kein Broker", ok: false },
            ].map(({ value, label, sub, ok }) => (
              <div key={label} style={{ padding: "20px 20px", background: surface, border: `1px solid ${border}`, borderRadius: 10 }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: ok ? gold : red, letterSpacing: "-0.02em", lineHeight: 1 }}>
                  {value}
                </div>
                <div style={{ marginTop: 8, fontSize: 13, fontWeight: 600, color: textPrimary }}>{label}</div>
                <div style={{ marginTop: 4, fontSize: 11, color: textMuted }}>{sub}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── KONTAKT / CTA ────────────────────────────────────────────────── */}
        <section style={{ paddingTop: 64 }}>
          <SectionLabel>Kontakt</SectionLabel>
          <h2 style={h2Style}>Sprechen Sie uns an.</h2>
          <p style={{ color: textSecondary, fontSize: 16, marginTop: 12, maxWidth: 560, lineHeight: 1.6 }}>
            Interesse an einer Zusammenarbeit oder haben Sie Fragen zu unseren Strategien?
            Wir freuen uns auf Ihre Nachricht.
          </p>

          <div style={{ display: "flex", gap: 12, marginTop: 36, flexWrap: "wrap" }}>
            <a
              href="mailto:jgfxtrading.business@gmail.com"
              style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                padding: "12px 24px", borderRadius: 8,
                background: gold, color: "#0a0a0c",
                fontWeight: 700, fontSize: 14, textDecoration: "none",
                letterSpacing: "0.02em",
              }}
            >
              E-Mail senden
            </a>
            <a
              href="https://calendly.com"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                padding: "12px 24px", borderRadius: 8,
                background: "transparent",
                border: `1px solid ${goldBorder}`,
                color: gold,
                fontWeight: 700, fontSize: 14, textDecoration: "none",
                letterSpacing: "0.02em",
              }}
            >
              Termin buchen
            </a>
          </div>

          <p style={{ marginTop: 48, fontSize: 11, color: textMuted, maxWidth: 700, lineHeight: 1.7 }}>
            <strong style={{ color: textSecondary }}>Rechtlicher Hinweis:</strong>{" "}
            Diese Seite dient ausschließlich zu Informationszwecken und stellt keine Anlageberatung,
            kein Angebot und keine Aufforderung zum Kauf oder Verkauf von Finanzinstrumenten dar.
            Vergangene Performance ist kein verlässlicher Indikator für zukünftige Ergebnisse.
            Alle Backtest-Daten sind hypothetisch und unterliegen inhärenten Einschränkungen.
          </p>
        </section>

      </div>
    </main>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const h2Style: React.CSSProperties = {
  fontSize: "clamp(22px, 3vw, 34px)",
  fontWeight: 700,
  letterSpacing: "-0.02em",
  marginTop: 8,
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
      <div style={{ width: 20, height: 2, background: gold, borderRadius: 1 }} />
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: gold, textTransform: "uppercase" }}>
        {children}
      </span>
    </div>
  );
}

function HeroStat({ label, value, sub, note }: { label: string; value: string; sub: string; note?: string }) {
  return (
    <div style={{
      flex: "1 1 200px",
      padding: "24px 28px",
      background: goldDim,
      border: `1px solid ${goldBorder}`,
      borderRadius: 12,
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: gold, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: 40, fontWeight: 800, color: gold, letterSpacing: "-0.03em", lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ marginTop: 8, fontSize: 12, color: textSecondary }}>{sub}</div>
      {note && <div style={{ marginTop: 4, fontSize: 11, color: textMuted }}>¹ {note}</div>}
    </div>
  );
}

function StrategyCard({
  tag, title, badge, badgeColor, desc, goal, stats, caveat,
}: {
  tag: string; title: string; badge: string; badgeColor: string;
  desc: string; goal: string;
  stats: { label: string; value: string }[];
  caveat: string;
}) {
  return (
    <div style={{
      background: surface,
      border: `1px solid ${border}`,
      borderRadius: 12,
      padding: "28px 28px",
      display: "flex",
      flexDirection: "column",
      gap: 16,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <span style={{ fontSize: 11, color: textMuted, fontWeight: 600 }}>{tag}</span>
          <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.01em", marginTop: 2 }}>{title}</div>
        </div>
        <span style={{
          padding: "4px 10px", borderRadius: 20,
          background: `${badgeColor}22`, border: `1px solid ${badgeColor}44`,
          color: badgeColor, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
        }}>
          {badge}
        </span>
      </div>

      <p style={{ fontSize: 14, color: textSecondary, lineHeight: 1.6, margin: 0 }}>{desc}</p>

      <div style={{ padding: "12px 14px", background: `${goldDim}`, borderRadius: 8, borderLeft: `3px solid ${gold}` }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: gold }}>Ziel: </span>
        <span style={{ fontSize: 12, color: textSecondary }}>{goal}</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {stats.map(({ label, value }) => (
          <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${border}` }}>
            <span style={{ fontSize: 12, color: textSecondary }}>{label}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: textPrimary }}>{value}</span>
          </div>
        ))}
      </div>

      <p style={{ fontSize: 11, color: textMuted, margin: 0, lineHeight: 1.5, borderTop: `1px solid ${border}`, paddingTop: 12 }}>
        ⚠️ {caveat}
      </p>
    </div>
  );
}

function FeatureCard({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <div style={{
      padding: "22px 22px",
      background: surface,
      border: `1px solid ${border}`,
      borderRadius: 10,
      display: "flex",
      flexDirection: "column",
      gap: 10,
    }}>
      <div style={{ fontSize: 24 }}>{icon}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: textPrimary }}>{title}</div>
      <div style={{ fontSize: 13, color: textSecondary, lineHeight: 1.6 }}>{text}</div>
    </div>
  );
}

function CompareRow({
  name, tag, cagr, dd, sharpe, corr, status, highlight = false,
}: {
  name: string; tag?: string; cagr: string; dd: string; sharpe: string;
  corr: string; status: string; highlight?: boolean;
}) {
  const rowBg = highlight ? "rgba(226,202,122,0.05)" : "transparent";
  const nameColor = highlight ? gold : textPrimary;
  return (
    <tr style={{ background: rowBg, borderBottom: `1px solid ${border}` }}>
      <td style={{ padding: "12px 16px", color: nameColor, fontWeight: highlight ? 700 : 400 }}>
        {name}
        {tag && (
          <span style={{ marginLeft: 8, fontSize: 10, padding: "2px 6px", borderRadius: 4, background: highlight ? goldDim : "rgba(255,255,255,0.06)", color: highlight ? gold : textMuted, fontWeight: 700 }}>
            {tag}
          </span>
        )}
      </td>
      <td style={{ padding: "12px 16px", color: green, fontWeight: 600 }}>{cagr}</td>
      <td style={{ padding: "12px 16px", color: red, fontWeight: 600 }}>{dd}</td>
      <td style={{ padding: "12px 16px", color: textPrimary }}>{sharpe}</td>
      <td style={{ padding: "12px 16px", color: textSecondary }}>{corr}</td>
      <td style={{ padding: "12px 16px", color: textMuted, fontSize: 12 }}>{status}</td>
    </tr>
  );
}
