"use client";

import { useMemo, useState } from "react";
import { AboutModeTabs } from "@/components/about/AboutModeTabs";
import {
  AlertTriangle,
  Boxes,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  CircleDashed,
  Database,
  FileSearch,
  FileText,
  Link2,
  ShieldAlert,
  Waypoints,
} from "lucide-react";
import {
  INNO_COST_ROWS,
  INNO_DATA_GAPS_ROWS,
  INNO_IBKR_ROWS,
  INNO_MEETING_BRIEF,
  INNO_OVERVIEW_METRICS,
  INNO_RISK_ROWS,
  INNO_SOURCE_REGISTER,
  INNO_STRATEGY_CARDS,
  INNO_TRACK_RECORD_ROWS,
  type InnoSourceRef,
  type InnoStatusTone,
} from "@/lib/about/about-inno-data";

const BG = "#0c0d10";
const CARD = "linear-gradient(180deg,#1c1d20 0%,#141517 100%)";
const BORDER = "rgba(255,255,255,0.07)";
const SHADOW = "0 8px 24px -8px rgba(0,0,0,0.6)";
const MUTED = "rgba(255,255,255,0.38)";
const ACCENT = "var(--dash-accent, #e2ca7a)";
const M = "var(--font-montserrat,sans-serif)";
const N = "var(--font-nunito,sans-serif)";

type InnoSection = "overview" | "portfolios" | "track" | "risk" | "ibkr" | "cto" | "sources";

const TABS: { id: InnoSection; label: string }[] = [
  { id: "overview", label: "Übersicht" },
  { id: "portfolios", label: "Portfolios" },
  { id: "track", label: "Track Record" },
  { id: "risk", label: "Risiko & Kosten" },
  { id: "ibkr", label: "IBKR & Technik" },
  { id: "cto", label: "CTO-Gespräch" },
  { id: "sources", label: "Quellen" },
];

type OverviewMetricCard = {
  label: string;
  value: string;
  sub: string;
  tone: InnoStatusTone;
  source: string;
};

export function MobileAboutInnoView() {
  const [activeSection, setActiveSection] = useState<InnoSection>("overview");
  const [sourceQuery, setSourceQuery] = useState("");

  const completionStats = useMemo(() => {
    const total = INNO_DATA_GAPS_ROWS.length;
    const conflicting = INNO_DATA_GAPS_ROWS.filter((row) => row.status.toLowerCase().includes("widers")).length;
    const open = INNO_DATA_GAPS_ROWS.filter(
      (row) => row.status.toLowerCase().includes("nicht") || row.status.toLowerCase().includes("pruefung"),
    ).length;
    const covered = Math.max(total - open - conflicting, 0);
    return { total, covered, open, conflicting };
  }, []);

  const readinessChecklist = useMemo(
    () => [
      { label: "Strategie definiert", done: true },
      { label: "Track Record vorhanden", done: true },
      { label: "Kosten dokumentiert", done: false },
      { label: "Risiken dokumentiert", done: false },
      { label: "Instrumentenuniversum festgelegt", done: true },
      { label: "IBKR-Konfiguration geklärt", done: false },
      { label: "Mindestanlage geklärt", done: false },
      { label: "Technische Anbindung geklärt", done: false },
    ],
    [],
  );

  const readinessDone = readinessChecklist.filter((item) => item.done).length;

  const sourceRows = useMemo(
    () => INNO_SOURCE_REGISTER.filter((source) => {
      const query = sourceQuery.trim().toLowerCase();
      return !query
        || source.label.toLowerCase().includes(query)
        || source.path.toLowerCase().includes(query)
        || source.quality?.toLowerCase().includes(query);
    }),
    [sourceQuery],
  );

  const overviewMetrics: OverviewMetricCard[] = [
    {
      label: "Tactical Track Record",
      value: INNO_OVERVIEW_METRICS[0]?.sub ?? "Nicht gefunden",
      sub: INNO_OVERVIEW_METRICS[0]?.value ?? "Statement-basiert",
      tone: "gold" as const,
      source: INNO_OVERVIEW_METRICS[0]?.source ?? "",
    },
    {
      label: "Tradingfrequenz",
      value: "5-10 Trades/Woche",
      sub: "Intraday bis 2-3 Wochen",
      tone: "zinc" as const,
      source: "17_Haftungsdach_QA/Formales Strategiedokument Institut.md",
    },
    {
      label: "Mindestanlagesumme",
      value: "20.000-25.000 EUR",
      sub: "10.000 EUR wird geprüft",
      tone: "red" as const,
      source: "Auftragsvorgabe",
    },
    {
      label: "Strategic Status",
      value: "Kein Live-Track-Record",
      sub: "Backtest und Forward Tracking",
      tone: "blue" as const,
      source: INNO_OVERVIEW_METRICS[1]?.source ?? "",
    },
    {
      label: "Datenvollständigkeit",
      value: `${completionStats.covered}/${completionStats.total}`,
      sub: `${completionStats.open} offen · ${completionStats.conflicting} widersprüchlich`,
      tone: completionStats.conflicting ? "red" : "gold",
      source: "17_Haftungsdach_QA/Haftungsdach Missing Evidence List.md",
    },
    {
      label: "CTO-Bereitschaft",
      value: `${readinessDone}/${readinessChecklist.length}`,
      sub: `${readinessChecklist.length - readinessDone} Punkte offen`,
      tone: "blue" as const,
      source: "17_Haftungsdach_QA/Haftungsdach Meeting Brief.md",
    },
  ];

  return (
    <div style={{ background: BG, minHeight: "100%", padding: "12px 12px 28px" }}>
      <MCard>
        <div>
          <AboutModeTabs
            activeMode="inno"
            mobile
            basePath="/m/about"
            hrefs={{ overview: "/m/about", inno: "/m/about/inno" }}
          />
        </div>

        <div style={{ display: "flex", gap: 8, overflowX: "auto", marginTop: 12, paddingBottom: 2 }}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSection(tab.id)}
              style={{
                borderRadius: 999,
                border: activeSection === tab.id ? "1px solid rgba(226,202,122,0.35)" : "1px solid rgba(255,255,255,0.06)",
                background: activeSection === tab.id ? "rgba(226,202,122,0.12)" : "rgba(255,255,255,0.03)",
                color: activeSection === tab.id ? ACCENT : "rgba(255,255,255,0.66)",
                padding: "7px 12px",
                fontSize: 11,
                fontWeight: 700,
                fontFamily: M,
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </MCard>

      {activeSection === "overview" ? (
        <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {overviewMetrics.map((metric) => (
              <MCard key={metric.label}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 9, color: MUTED, fontFamily: M }}>{metric.label}</p>
                    <p style={{ margin: "4px 0 0", fontSize: 14, fontWeight: 700, color: toneColor(metric.tone), fontFamily: N, lineHeight: 1.2 }}>
                      {metric.value}
                    </p>
                    <p style={{ margin: "3px 0 0", fontSize: 9, color: "#fff", fontFamily: M, lineHeight: 1.35 }}>{metric.sub}</p>
                  </div>
                  <SourcePill source={metric.source} />
                </div>
              </MCard>
            ))}
          </div>

          <MCard>
            <SHead icon={<Database size={13} />} label="Datenvollständigkeit" />
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
              <Donut
                segments={[
                  { value: completionStats.covered, tone: "gold" },
                  { value: completionStats.open, tone: "zinc" },
                  { value: completionStats.conflicting, tone: "red" },
                ]}
                label={`${completionStats.covered}/${completionStats.total}`}
              />
              <div style={{ display: "grid", gap: 8, flex: 1, minWidth: 0 }}>
                <LegendRow label="Belegt" value={completionStats.covered} tone="gold" />
                <LegendRow label="Offen" value={completionStats.open} tone="zinc" />
                <LegendRow label="Widersprüchlich" value={completionStats.conflicting} tone="red" />
              </div>
            </div>
          </MCard>

          <MCard>
            <SHead icon={<CheckCircle2 size={13} />} label="CTO-Bereitschaft" />
            <div style={{ marginTop: 12 }}>
              <div style={{ height: 8, borderRadius: 999, background: "rgba(255,255,255,0.07)", overflow: "hidden" }}>
                <div style={{ width: `${(readinessDone / readinessChecklist.length) * 100}%`, height: "100%", background: "#38bdf8" }} />
              </div>
              <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                {readinessChecklist.map((item) => (
                  <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 8, borderRadius: 12, border: "1px solid rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.02)", padding: "8px 10px" }}>
                    {item.done ? <CheckCircle2 size={14} color="#86efac" /> : <CircleDashed size={14} color="rgba(255,255,255,0.4)" />}
                    <span style={{ fontSize: 10, color: "#fff", fontFamily: M }}>{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </MCard>

          {INNO_STRATEGY_CARDS.map((card) => (
            <PortfolioCard key={card.id} card={card} compact />
          ))}
        </div>
      ) : null}

      {activeSection === "portfolios" ? (
        <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
          {INNO_STRATEGY_CARDS.map((card) => (
            <PortfolioCard key={card.id} card={card} />
          ))}
        </div>
      ) : null}

      {activeSection === "track" ? (
        <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
          {INNO_TRACK_RECORD_ROWS.map((row) => (
            <MCard key={row.portfolio}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                <div>
                  <SHead icon={<BriefcaseBusiness size={13} />} label={row.portfolio} />
                  <p style={{ margin: "6px 0 0", fontSize: 10, color: "rgba(255,255,255,0.62)", fontFamily: M }}>{row.zeitraum}</p>
                </div>
                <Badge tone={row.portfolio.includes("Tactical") ? "gold" : "blue"}>{row.echtgeldstatus}</Badge>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}>
                <TrackMetric label="Gesamtperformance" value={row.performance} />
                <TrackMetric label="Annualisiert" value={row.annualisierung} warn={row.annualisierung.includes("nachgerechnet")} />
                <TrackMetric label="Max DD" value={row.drawdown} />
                <TrackMetric label="Sharpe" value={row.sharpe} />
                <TrackMetric label="Calmar" value={row.calmar} />
                <TrackMetric label="Volatilität" value={row.volatilitaet} warn={row.volatilitaet === "Nicht gefunden"} />
                <TrackMetric label="Profit Factor" value={row.profitFactor} />
                <TrackMetric label="Trefferquote" value={row.trefferquote} warn={row.trefferquote === "Nicht gefunden"} />
              </div>
            </MCard>
          ))}

          {["Equity-Kurve", "Drawdown-Verlauf", "Monatliche Renditeübersicht"].map((label) => (
            <MCard key={label}>
              <SHead icon={<FileSearch size={13} />} label={label} />
              <div style={{ marginTop: 12, minHeight: 160, borderRadius: 14, border: "1px dashed rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)", display: "flex", alignItems: "center", justifyContent: "center", padding: 18, textAlign: "center", fontSize: 11, color: "rgba(255,255,255,0.58)", fontFamily: M }}>
                Für diese Darstellung fehlen derzeit die monatlichen Rohdaten.
              </div>
            </MCard>
          ))}
        </div>
      ) : null}

      {activeSection === "risk" ? (
        <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
          <FactCard icon={<ShieldAlert size={13} />} title="Risikosteuerung" rows={INNO_RISK_ROWS.map((row) => ({ label: row.topic, value: row.value, status: row.status, source: row.source }))} />
          <FactCard icon={<AlertTriangle size={13} />} title="Kostenstruktur" rows={normalizeCostRows(INNO_COST_ROWS)} />
        </div>
      ) : null}

      {activeSection === "ibkr" ? (
        <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
          <MCard>
            <SHead icon={<Boxes size={13} />} label="Instrumentenmatrix" />
            <div style={{ marginTop: 12, overflowX: "auto" }}>
              <table style={{ width: "100%", minWidth: 760, tableLayout: "fixed", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    {["Instrument", "Typ", "Börse", "Status", "Kontraktgröße", "Mindestdepot", "Marktdaten", "CTO-Prüfung"].map((label) => (
                      <th key={label} style={{ padding: "8px 10px", textAlign: "left", fontSize: 9, color: MUTED, fontFamily: M }}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {INNO_IBKR_ROWS.map((row) => (
                    <tr key={row.instrument} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", verticalAlign: "top" }}>
                      <Cell>{row.instrument}</Cell>
                      <Cell>{row.product}</Cell>
                      <Cell>{row.venue}</Cell>
                      <Cell><Badge tone="gold">Geplant</Badge></Cell>
                      <Cell>{row.contract}</Cell>
                      <Cell>{row.margin}</Cell>
                      <Cell>Offen</Cell>
                      <Cell>{row.status}</Cell>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </MCard>

          <MCard>
            <SHead icon={<Link2 size={13} />} label="Technische Prozessgrafik" />
            <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
              {["Capitalife-Strategie", "Trading Engine", "INNO / IBKR-Anbindung", "Kundendepots", "Monitoring & Reporting"].map((step, index, array) => (
                <div key={step} style={{ display: "grid", gap: 8 }}>
                  <div style={{ borderRadius: 14, border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.03)", padding: "12px 14px", fontSize: 11, color: "#fff", fontFamily: M, textAlign: "center" }}>
                    {step}
                  </div>
                  {index < array.length - 1 ? (
                    <div style={{ display: "flex", justifyContent: "center" }}>
                      <ChevronRight size={16} color={ACCENT} style={{ transform: "rotate(90deg)" }} />
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </MCard>
        </div>
      ) : null}

      {activeSection === "cto" ? (
        <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
          <MCard>
            <SHead icon={<FileText size={13} />} label="Meeting Brief" />
            <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
              {INNO_MEETING_BRIEF.map((line) => (
                <div key={line} style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.03)", padding: "9px 10px", fontSize: 10, color: "#fff", fontFamily: M, lineHeight: 1.45 }}>
                  {line}
                </div>
              ))}
            </div>
          </MCard>

          <MCard>
            <SHead icon={<Waypoints size={13} />} label="Priorisierte Punkte" />
            <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
              {INNO_DATA_GAPS_ROWS.map((row, index) => (
                <div key={`${row.aussage}-${index}`} style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.02)", padding: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: "#fff", fontFamily: M }}>{row.aussage}</p>
                    <Badge tone={row.status.toLowerCase().includes("widers") ? "red" : row.status.toLowerCase().includes("pruefung") ? "blue" : "zinc"}>
                      {row.status.toLowerCase().includes("widers") ? "Kritisch" : "Vor Gespräch"}
                    </Badge>
                  </div>
                  <div style={{ display: "grid", gap: 3, marginTop: 6, fontSize: 9, color: "rgba(255,255,255,0.64)", fontFamily: M }}>
                    <span>Verantwortlich: {row.pruefung}</span>
                    <span>Status: {row.status}</span>
                    <span style={{ overflowWrap: "anywhere" }}>Quelle: {row.quelle}</span>
                    <span>Nächste Aktion: {row.verwendbar}</span>
                  </div>
                </div>
              ))}
            </div>
          </MCard>
        </div>
      ) : null}

      {activeSection === "sources" ? (
        <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
          <MCard>
            <SHead icon={<Database size={13} />} label="Quellenregister" />
            <input
              value={sourceQuery}
              onChange={(event) => setSourceQuery(event.target.value)}
              placeholder="Quelle oder Pfad suchen"
              style={{
                marginTop: 12,
                width: "100%",
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(255,255,255,0.03)",
                color: "#fff",
                padding: "10px 12px",
                fontSize: 12,
                fontFamily: M,
                outline: "none",
              }}
            />

            <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
              {sourceRows.map((source) => (
                <details key={source.path} style={{ borderRadius: 14, border: "1px solid rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.02)", padding: "10px 12px" }}>
                  <summary style={{ cursor: "pointer", listStyle: "none", fontSize: 11, fontWeight: 700, color: "#fff", fontFamily: N }}>
                    {source.label}
                  </summary>
                  <div style={{ display: "grid", gap: 4, marginTop: 8, fontSize: 10, color: "rgba(255,255,255,0.66)", fontFamily: M }}>
                    <span>{inferSourceType(source)} · {inferSourcePortfolio(source)}</span>
                    <a href={source.path} style={{ color: ACCENT, overflowWrap: "anywhere" }}>{source.path}</a>
                    {source.period ? <span>Zeitraum: {source.period}</span> : null}
                    {source.updated ? <span>Update: {source.updated}</span> : null}
                    {source.quality ? <span>Qualität: {source.quality}</span> : null}
                  </div>
                </details>
              ))}
            </div>
          </MCard>
        </div>
      ) : null}
    </div>
  );
}

function MCard({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 18, boxShadow: SHADOW, padding: 14, ...style }}>
      {children}
    </div>
  );
}

function PortfolioCard({ card, compact = false }: { card: (typeof INNO_STRATEGY_CARDS)[number]; compact?: boolean }) {
  const objective = card.rows.find((row) => row.key === "Ziel")?.value ?? "Nicht gefunden";
  const rows = ["Datenart", "Track-Record-Status", "Tradingfrequenz", "Haltedauer", "Anzahl Assets", "Parallele Positionen", "Geplante Gewichtung", "Instrumententypen"].map((key) => {
    const found = card.rows.find((row) => row.key === key);
    return { key, value: found?.value ?? (key === "Instrumententypen" ? (card.id === "tactical" ? "Futures / FX" : "ETF / Asset-Allokationen") : "Nicht gefunden"), source: found?.source ?? "Auftragsvorgabe" };
  });

  return (
    <MCard style={{ marginTop: compact ? 0 : 12 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#fff", fontFamily: N }}>{card.title}</p>
          <p style={{ margin: "4px 0 0", fontSize: 10, color: "rgba(255,255,255,0.66)", fontFamily: M }}>{objective}</p>
        </div>
        <Badge tone={card.badgeTone}>{card.badge}</Badge>
      </div>

      <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
        {rows.map((row) => (
          <div key={row.key} style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.02)", padding: "9px 10px", minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontSize: 9, color: MUTED, fontFamily: M }}>{row.key}</span>
              <SourcePill source={row.source} />
            </div>
            <p style={{ margin: "4px 0 0", fontSize: 10, color: "#fff", fontFamily: M, overflowWrap: "anywhere" }}>{row.value}</p>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
        {[
          { label: "Belegt", text: card.badge, tone: card.badgeTone },
          { label: "Offen", text: card.rows.find((row) => row.key === "Offene Pruefungen")?.value ?? "Nicht gefunden", tone: "zinc" as const },
          { label: "INNO-Prüfung", text: "Broker-, Risiko- und Gebührenparität bestätigen", tone: "blue" as const },
        ].map((item) => (
          <div key={item.label} style={{ display: "flex", alignItems: "flex-start", gap: 8, borderRadius: 12, border: "1px solid rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.02)", padding: "9px 10px" }}>
            <StatusDot tone={item.tone} />
            <div style={{ minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 9, color: MUTED, fontFamily: M }}>{item.label}</p>
              <p style={{ margin: "3px 0 0", fontSize: 10, color: "#fff", fontFamily: M, overflowWrap: "anywhere" }}>{item.text}</p>
            </div>
          </div>
        ))}
      </div>
    </MCard>
  );
}

function FactCard({
  icon,
  title,
  rows,
}: {
  icon: React.ReactNode;
  title: string;
  rows: { label: string; value: string; status: string; source: string }[];
}) {
  return (
    <MCard>
      <SHead icon={icon} label={title} />
      <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
        {rows.map((row) => (
          <div key={row.label} style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.02)", padding: "10px 12px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: "#fff", fontFamily: M }}>{row.label}</p>
              <Badge tone={toneFromStatus(row.status)}>{row.status}</Badge>
            </div>
            <p style={{ margin: "6px 0 0", fontSize: 10, color: "#fff", fontFamily: M, overflowWrap: "anywhere" }}>{row.value}</p>
            <p style={{ margin: "4px 0 0", fontSize: 9, color: MUTED, fontFamily: M, overflowWrap: "anywhere" }}>{row.source}</p>
          </div>
        ))}
      </div>
    </MCard>
  );
}

function TrackMetric({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.02)", padding: "9px 10px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <span style={{ fontSize: 9, color: MUTED, fontFamily: M }}>{label}</span>
        {warn ? <CircleAlert size={11} color="#fda4af" /> : null}
      </div>
      <p style={{ margin: "4px 0 0", fontSize: 10, color: "#fff", fontFamily: M, overflowWrap: "anywhere" }}>{value}</p>
    </div>
  );
}

function SHead({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ color: ACCENT, flexShrink: 0 }}>{icon}</span>
      <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: "#fff", fontFamily: M }}>{label}</p>
    </div>
  );
}

function SourcePill({ source }: { source: string }) {
  return (
    <span title={source} style={{ borderRadius: 999, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.55)", padding: "3px 7px", fontSize: 8, fontFamily: M, flexShrink: 0 }}>
      Quelle
    </span>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone: InnoStatusTone }) {
  const style =
    tone === "gold" ? { border: "1px solid rgba(226,202,122,0.3)", background: "rgba(226,202,122,0.1)", color: ACCENT } :
    tone === "blue" ? { border: "1px solid rgba(125,211,252,0.3)", background: "rgba(125,211,252,0.1)", color: "#7dd3fc" } :
    tone === "red" ? { border: "1px solid rgba(253,164,175,0.3)", background: "rgba(253,164,175,0.1)", color: "#fda4af" } :
    { border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.7)" };
  return <span style={{ borderRadius: 20, fontSize: 8, fontWeight: 700, padding: "4px 8px", fontFamily: M, ...style }}>{children}</span>;
}

function Donut({
  segments,
  label,
}: {
  segments: { value: number; tone: InnoStatusTone }[];
  label: string;
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0) || 1;
  let cursor = 0;
  const gradient = segments
    .map((segment) => {
      const start = (cursor / total) * 360;
      cursor += segment.value;
      const end = (cursor / total) * 360;
      return `${toneColor(segment.tone)} ${start}deg ${end}deg`;
    })
    .join(", ");

  return (
    <div style={{ width: 86, height: 86, borderRadius: "50%", background: `conic-gradient(${gradient})`, position: "relative", flexShrink: 0 }}>
      <div style={{ position: "absolute", inset: 12, borderRadius: "50%", background: "#17181b", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 13, fontWeight: 700, fontFamily: N }}>
        {label}
      </div>
    </div>
  );
}

function LegendRow({ label, value, tone }: { label: string; value: number; tone: InnoStatusTone }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, borderRadius: 12, border: "1px solid rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.02)", padding: "8px 10px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <StatusDot tone={tone} />
        <span style={{ fontSize: 10, color: "#fff", fontFamily: M }}>{label}</span>
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", fontFamily: N }}>{value}</span>
    </div>
  );
}

function StatusDot({ tone }: { tone: InnoStatusTone }) {
  return <span style={{ width: 9, height: 9, borderRadius: 999, background: toneColor(tone), flexShrink: 0 }} />;
}

function Cell({ children }: { children: React.ReactNode }) {
  return (
    <td style={{ padding: "10px", fontSize: 10, color: "#fff", fontFamily: M, overflowWrap: "anywhere" }}>
      {children}
    </td>
  );
}

function normalizeCostRows(rows: typeof INNO_COST_ROWS) {
  return [
    { label: "Spread", value: rows[0]?.detail ?? "Nicht gefunden", status: rows[0]?.status ?? "Nicht gefunden", source: rows[0]?.source ?? "Nicht gefunden" },
    { label: "Kommission", value: rows[3]?.detail ?? "Nicht gefunden", status: rows[3]?.status ?? "Nicht gefunden", source: rows[3]?.source ?? "Nicht gefunden" },
    { label: "Swap", value: rows[0]?.detail ?? "Nicht gefunden", status: rows[0]?.status ?? "Nicht gefunden", source: rows[0]?.source ?? "Nicht gefunden" },
    { label: "Sonstige Handelskosten", value: rows[2]?.detail ?? "Nicht gefunden", status: rows[2]?.status ?? "Nicht gefunden", source: rows[2]?.source ?? "Nicht gefunden" },
    { label: "Management Fee", value: rows[1]?.detail ?? "Nicht gefunden", status: rows[1]?.status ?? "Nicht gefunden", source: rows[1]?.source ?? "Nicht gefunden" },
    { label: "Performance Fee", value: rows[1]?.detail ?? "Nicht gefunden", status: rows[1]?.status ?? "Nicht gefunden", source: rows[1]?.source ?? "Nicht gefunden" },
    { label: "Netto / Brutto Status", value: rows[0]?.detail ?? "Nicht gefunden", status: "Teilweise belegbar", source: rows[0]?.source ?? "Nicht gefunden" },
  ];
}

function inferSourceType(source: InnoSourceRef) {
  const key = `${source.label} ${source.path}`.toLowerCase();
  if (key.includes("performance")) return "Track Record";
  if (key.includes("ibkr")) return "Technik";
  if (key.includes("meeting") || key.includes("fragen")) return "Meeting";
  if (key.includes("strategie")) return "Strategie";
  return "Governance";
}

function inferSourcePortfolio(source: InnoSourceRef) {
  const key = `${source.label} ${source.path} ${source.quality ?? ""}`.toLowerCase();
  if (key.includes("strategic")) return "Strategic";
  if (key.includes("performance") || key.includes("track")) return "Tactical";
  return "Beide";
}

function toneFromStatus(status: string): InnoStatusTone {
  const key = status.toLowerCase();
  if (key.includes("widers")) return "red";
  if (key.includes("live")) return "gold";
  if (key.includes("pruefung") || key.includes("geplant") || key.includes("offen")) return "blue";
  if (key.includes("nicht")) return "zinc";
  return "zinc";
}

function toneColor(tone: InnoStatusTone) {
  if (tone === "gold") return "#e2ca7a";
  if (tone === "blue") return "#7dd3fc";
  if (tone === "red") return "#fda4af";
  return "#ffffff";
}
