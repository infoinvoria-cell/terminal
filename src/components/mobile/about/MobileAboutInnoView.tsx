"use client";

import { useMemo, useState } from "react";
import { AboutModeTabs } from "@/components/about/AboutModeTabs";
import {
  AlertTriangle,
  Boxes,
  BriefcaseBusiness,
  Building2,
  Check,
  ChevronRight,
  CircleAlert,
  CircleDashed,
  Database,
  FileBadge2,
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
  INNO_RISK_ROWS,
  INNO_SEASONAL_PATTERNS,
  INNO_SOURCE_REGISTER,
  INNO_STRATEGY_CARDS,
  INNO_TRACK_RECORD_ROWS,
  type InnoSourceRef,
} from "@/lib/about/about-inno-data";
import {
  buildInnoTrackRecordRuntimeModel,
  type InnoTrackRecordRuntimeModel,
} from "@/lib/about/inno-track-record-model";
import type { TrackRecordOverview } from "@/lib/track-record/types";

const TOKENS = {
  bg: "#09090A",
  surface: "#141416",
  elevated: "#1B1C1F",
  border: "#2C2D31",
  text: "#F4F4F1",
  muted: "#96979C",
  goldLight: "#E8D58B",
  gold: "#C7A651",
  goldDark: "#8C7132",
  red: "#D45B63",
};

const M = "var(--font-text)";
const N = "var(--font-numbers)";

type InnoSection = "overview" | "portfolios" | "track" | "risk" | "ibkr" | "cto" | "sources";
type VisualTone = "confirmed" | "test" | "planned" | "open" | "critical";

const TABS: { id: InnoSection; label: string }[] = [
  { id: "overview", label: "Übersicht" },
  { id: "portfolios", label: "Portfolios" },
  { id: "track", label: "Track Record" },
  { id: "risk", label: "Risiko & Kosten" },
  { id: "ibkr", label: "IBKR & Technik" },
  { id: "cto", label: "CTO-Gespräch" },
  { id: "sources", label: "Quellen" },
];

export function MobileAboutInnoView({ trackRecordOverview }: { trackRecordOverview: TrackRecordOverview }) {
  const [activeSection, setActiveSection] = useState<InnoSection>("overview");
  const [sourceQuery, setSourceQuery] = useState("");

  const runtime = useMemo(
    () => buildInnoTrackRecordRuntimeModel(trackRecordOverview),
    [trackRecordOverview],
  );
  const overviewMetrics = runtime.heroMetrics;

  const readinessChecklist = useMemo(
    () => runtime.readiness.map((item) => ({
      label: `${item.label} · ${item.status}`,
      done: item.done,
      tone: item.done ? "confirmed" as VisualTone : "open" as VisualTone,
    })),
    [runtime],
  );

  const topOpenPoints = [
    { title: "Maschinenlesbare vollständige Broker-Statements", priority: "Vor Gespräch", tone: "planned" as VisualTone },
    { title: "Vollständige Trade-Liste", priority: "Vor Gespräch", tone: "planned" as VisualTone },
    { title: "Widersprüchliche Tactical-Annualisierung klären", priority: "Kritisch", tone: "critical" as VisualTone },
  ];

  const sourceRows = useMemo(
    () => INNO_SOURCE_REGISTER.filter((source) => {
      const query = sourceQuery.trim().toLowerCase();
      return !query || source.label.toLowerCase().includes(query) || source.path.toLowerCase().includes(query);
    }),
    [sourceQuery],
  );
  const openSource = (query: string) => {
    setSourceQuery(query);
    setActiveSection("sources");
  };

  return (
    <div style={{ background: TOKENS.bg, minHeight: "100%", padding: "12px 12px 28px" }}>
      <Card>
        <AboutModeTabs activeMode="inno" mobile basePath="/m/about" hrefs={{ overview: "/m/about", inno: "/m/about/inno" }} />
        <div style={{ display: "flex", gap: 8, overflowX: "auto", marginTop: 12, paddingBottom: 2 }}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSection(tab.id)}
              style={{
                borderRadius: 999,
                border: `1px solid ${activeSection === tab.id ? TOKENS.goldDark : TOKENS.border}`,
                background: activeSection === tab.id ? "rgba(199,166,81,0.12)" : TOKENS.surface,
                color: activeSection === tab.id ? TOKENS.text : TOKENS.muted,
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
      </Card>

      {activeSection === "overview" ? (
        <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {overviewMetrics.map((metric) => (
              <Card key={metric.label}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 9, color: TOKENS.muted, fontFamily: M }}>{metric.label}</p>
                    <p style={{ margin: "4px 0 0", fontSize: 14, fontWeight: 700, color: TOKENS.text, fontFamily: N, lineHeight: 1.2 }}>{metric.value}</p>
                    <p style={{ margin: "3px 0 0", fontSize: 9, color: TOKENS.goldLight, fontFamily: M, lineHeight: 1.35 }}>{metric.sub}</p>
                  </div>
                  <SourcePill source={metric.source} onOpen={() => openSource(sourceLabel(metric.source))} />
                </div>
              </Card>
            ))}
          </div>

          <Card>
            <SHead icon={<Database size={13} />} label="Datenvollständigkeit" />
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
              <Donut
                segments={[
                  { value: trackRecordOverview.historical.historicalDataQuality === "complete" ? 2 : 1, tone: "confirmed" },
                  { value: trackRecordOverview.readiness.blockers.length, tone: "open" },
                  { value: 1, tone: "critical" },
                ]}
                label={`${trackRecordOverview.historical.historicalDataQuality === "complete" ? 2 : 1}/6`}
              />
              <div style={{ display: "grid", gap: 8, flex: 1, minWidth: 0 }}>
                <LegendRow label="Vollständige Datenkategorien" value={trackRecordOverview.historical.historicalDataQuality === "complete" ? 2 : 1} tone="confirmed" />
                <LegendRow label="Offene Evidenzpunkte" value={trackRecordOverview.readiness.blockers.length} tone="open" />
                <LegendRow label="Widersprüchliche Angaben: 1" value={1} tone="critical" />
              </div>
            </div>
          </Card>

          <Card>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <SHead icon={<Check size={13} />} label="CTO-Bereitschaft" />
              <div
                style={{
                  borderRadius: 999,
                  border: `1px solid ${TOKENS.goldDark}`,
                  background: "rgba(199,166,81,0.12)",
                  color: TOKENS.goldLight,
                  padding: "5px 9px",
                  fontSize: 10,
                  fontWeight: 700,
                  fontFamily: M,
                  flexShrink: 0,
                }}
              >
                {trackRecordOverview.readiness.completed}/{trackRecordOverview.readiness.total}
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <div style={{ height: 8, borderRadius: 999, background: "#222327", overflow: "hidden" }}>
                <div style={{ width: `${trackRecordOverview.readiness.percent}%`, height: "100%", background: TOKENS.gold }} />
              </div>
              <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                {readinessChecklist.map((item) => (
                  <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 8, borderRadius: 12, border: "1px solid rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.02)", padding: "8px 10px" }}>
                    {item.done ? <Check size={14} color={TOKENS.gold} /> : <CircleDashed size={14} color={item.tone === "planned" ? TOKENS.goldDark : TOKENS.muted} />}
                    <span style={{ fontSize: 10, color: item.done ? TOKENS.text : TOKENS.muted, fontFamily: M }}>{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          <Card>
            <SHead icon={<Waypoints size={13} />} label="Statusverteilung" />
            <div style={{ marginTop: 12 }}>
              <div style={{ display: "flex", height: 8, overflow: "hidden", borderRadius: 999, background: "rgba(255,255,255,0.06)" }}>
                {[{ v: 1, t: "confirmed" }, { v: 2, t: "test" }, { v: 4, t: "planned" }, { v: 5, t: "open" }, { v: 1, t: "critical" }].map((segment) => (
                  <div key={`${segment.t}-${segment.v}`} style={{ width: `${(segment.v / 13) * 100}%`, background: visualColor(segment.t as VisualTone) }} />
                ))}
              </div>
              <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                <LegendRow label="Live belegt" value={1} tone="confirmed" />
                <LegendRow label="Testdaten" value={2} tone="test" />
                <LegendRow label="Geplant" value={4} tone="planned" />
                <LegendRow label="Offen" value={5} tone="open" />
                <LegendRow label="Widerspruechlich" value={1} tone="critical" />
              </div>
            </div>
          </Card>

          <Card>
            <SHead icon={<AlertTriangle size={13} />} label="Offene Punkte" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}>
              <MiniStat label="Offene Evidenzpunkte" value="20" />
              <MiniStat label="Offene Entscheidungen" value="9" />
            </div>
            <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
              {topOpenPoints.map((row) => (
                <div key={row.title} style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.02)", padding: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: TOKENS.text, fontFamily: M }}>{row.title}</p>
                    <Badge tone={row.tone}>{row.priority}</Badge>
                  </div>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setActiveSection("cto")} style={{ marginTop: 12, borderRadius: 999, border: `1px solid ${TOKENS.goldDark}`, background: "rgba(199,166,81,0.08)", color: TOKENS.goldLight, padding: "8px 12px", fontSize: 11, fontWeight: 700, fontFamily: M }}>
              Alle offenen Punkte im CTO-Gespräch
            </button>
          </Card>
        </div>
      ) : null}

      {activeSection === "portfolios" ? <SectionPortfolios /> : null}
      {activeSection === "track" ? <SectionTrack runtime={runtime} overview={trackRecordOverview} /> : null}
      {activeSection === "risk" ? <SectionRisk /> : null}
      {activeSection === "ibkr" ? <SectionIbkr /> : null}
      {activeSection === "cto" ? <SectionCto /> : null}

      {activeSection === "sources" ? (
        <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
          <Card>
            <SHead icon={<Database size={13} />} label="Quellenregister" />
            <input
              value={sourceQuery}
              onChange={(event) => setSourceQuery(event.target.value)}
              placeholder="Quelle oder Pfad suchen"
              style={{ marginTop: 12, width: "100%", borderRadius: 14, border: `1px solid ${TOKENS.border}`, background: TOKENS.elevated, color: TOKENS.text, padding: "10px 12px", fontSize: 12, fontFamily: M, outline: "none" }}
            />
            <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
              {sourceRows.map((source) => (
                <details key={source.path} style={{ borderRadius: 14, border: "1px solid rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.02)", padding: "10px 12px" }}>
                  <summary style={{ cursor: "pointer", listStyle: "none", fontSize: 11, fontWeight: 700, color: TOKENS.text, fontFamily: N }}>{source.label}</summary>
                  <div style={{ display: "grid", gap: 4, marginTop: 8, fontSize: 10, color: TOKENS.muted, fontFamily: M }}>
                    <span>{inferSourceType(source)} - {inferSourcePortfolio(source)}</span>
                    <span style={{ overflowWrap: "anywhere" }}>{source.path}</span>
                    {source.period ? <span>Zeitraum: {source.period}</span> : null}
                  </div>
                </details>
              ))}
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

function SectionPortfolios() {
  return (
    <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
      {INNO_STRATEGY_CARDS.map((card) => (
        <PortfolioCard key={card.id} card={card} />
      ))}
      <SeasonalEvidenceCard />
    </div>
  );
}

function SeasonalEvidenceCard() {
  const found = INNO_SEASONAL_PATTERNS.filter((row) => row.found).length;
  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <SHead icon={<Waypoints size={13} />} label="White-Swan-Saisonmuster" />
        <Badge tone="planned">{found}/10 nachweisbar</Badge>
      </div>
      <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
        {INNO_SEASONAL_PATTERNS.map((row) => (
          <div key={row.id} style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.02)", padding: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: TOKENS.text, fontFamily: M }}>{row.pattern}</span>
              <Badge tone={row.found ? "planned" : "critical"}>{row.found ? "Research" : "Fehlt"}</Badge>
            </div>
            <div style={{ marginTop: 6, fontSize: 9, color: TOKENS.muted, fontFamily: M }}>
              Berechnung: {row.calculationAvailable ? "vorhanden" : "fehlt"} · Walk Forward: {row.walkForwardAvailable ? "vorhanden" : "fehlt"} · Produktion: nein
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function SectionTrack({
  runtime,
  overview,
}: {
  runtime: InnoTrackRecordRuntimeModel;
  overview: TrackRecordOverview;
}) {
  return (
    <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
      {INNO_TRACK_RECORD_ROWS.map((row) => (
        <Card key={row.portfolio}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
            <div>
              <SHead icon={<BriefcaseBusiness size={13} />} label={row.portfolio} />
              <p style={{ margin: "6px 0 0", fontSize: 10, color: TOKENS.muted, fontFamily: M }}>{row.zeitraum}</p>
            </div>
            <Badge tone={row.portfolio.includes("Tactical") ? "confirmed" : "planned"}>{row.echtgeldstatus}</Badge>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}>
            <TrackMetric label="Gesamtperformance" value={row.performance} />
            <TrackMetric
              label={row.portfolio.includes("Tactical") ? "Berichtswert p.a." : "Annualisiert"}
              value={row.portfolio.includes("Tactical")
                ? runtime.annualization.reported
                : row.annualisierung}
              warn={row.portfolio.includes("Tactical")}
            />
            {row.portfolio.includes("Tactical") ? (
              <>
                <TrackMetric label="Neu berechnet" value={runtime.annualization.recalculated} warn />
                <TrackMetric label="Monats-CAGR*" value={runtime.annualization.alternative} warn />
              </>
            ) : null}
            <TrackMetric label="Max DD" value={row.drawdown} />
            <TrackMetric label="Sharpe" value={row.sharpe} />
            <TrackMetric label="Calmar" value={row.calmar} />
            <TrackMetric label="Volatilität" value={row.volatilitaet} warn={row.volatilitaet === "Nicht gefunden"} />
            <TrackMetric label="Profit Factor" value={row.profitFactor} />
            <TrackMetric label="Trefferquote" value={row.trefferquote} warn={row.trefferquote === "Nicht gefunden"} />
          </div>
          {row.portfolio.includes("Tactical") ? (
            <div style={{ marginTop: 12, borderRadius: 12, border: "1px solid rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.02)", padding: "9px 10px", fontSize: 10, color: TOKENS.text, fontFamily: M }}>
              {runtime.annualization.explanation}
              <div style={{ marginTop: 6, color: TOKENS.muted }}>Myfxbook: {runtime.myfxbookStatus} · Darwinex: {runtime.darwinexStatus} · Datenbank: {runtime.databaseStatus}</div>
            </div>
          ) : null}
        </Card>
      ))}

      {["Equity-Kurve", "Drawdown-Verlauf"].map((label) => (
        <Card key={label}>
          <SHead icon={<FileSearch size={13} />} label={label} />
          <div style={{ marginTop: 12, minHeight: 160, borderRadius: 14, border: "1px dashed rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)", display: "flex", alignItems: "center", justifyContent: "center", padding: 18, textAlign: "center", fontSize: 11, color: TOKENS.muted, fontFamily: M }}>
            Für diese Auswertung fehlen weiterhin vollständige Rohdaten.
          </div>
        </Card>
      ))}
      <Card>
        <SHead icon={<FileSearch size={13} />} label="Monatliche Renditen" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 6, marginTop: 12 }}>
          {overview.historical.monthlyReturns.map((row) => (
            <div key={row.month} style={{
              borderRadius: 10,
              border: `1px solid ${TOKENS.border}`,
              background: row.returnPct > 0 ? "rgba(199,166,81,0.12)" : row.returnPct < 0 ? "rgba(212,91,99,0.12)" : "rgba(255,255,255,0.03)",
              padding: "6px 4px",
              textAlign: "center",
            }}>
              <div style={{ fontSize: 8, color: TOKENS.muted }}>{row.month}</div>
              <div style={{ marginTop: 2, fontSize: 10, fontWeight: 700, color: row.returnPct < 0 ? TOKENS.red : TOKENS.text }}>{row.returnPct.toFixed(1)}%</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function SectionRisk() {
  return (
    <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
      <FactCard icon={<ShieldAlert size={13} />} title="Risikosteuerung" rows={INNO_RISK_ROWS.map((row) => ({ label: row.topic, value: row.value, status: row.status, source: row.source }))} />
      <FactCard icon={<Building2 size={13} />} title="Kostenstruktur" rows={normalizeCostRows(INNO_COST_ROWS)} />
    </div>
  );
}

function SectionIbkr() {
  return (
    <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
      <Card>
        <SHead icon={<Boxes size={13} />} label="Instrumentenmatrix" />
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 1720, tableLayout: "fixed", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                {["Strategie", "Instrument", "Produkttyp", "Symbol", "ConId", "Börse", "Währung", "Stückelung", "Fractional", "Marktdaten", "Ordertyp", "Status", "Offene Prüfung"].map((label) => (
                  <th key={label} style={{ padding: "8px 10px", textAlign: "left", fontSize: 9, color: TOKENS.muted, fontFamily: M }}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {INNO_IBKR_ROWS.map((row) => (
                <tr key={`${row.strategy}-${row.symbol}`} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", verticalAlign: "top" }}>
                  <Cell>{row.strategy}</Cell>
                  <Cell>{row.instrument}</Cell>
                  <Cell>{row.productType}</Cell>
                  <Cell>{row.symbol}</Cell>
                  <Cell>{row.conId}</Cell>
                  <Cell>{row.exchange}</Cell>
                  <Cell>{row.currency}</Cell>
                  <Cell>{row.lotSize}</Cell>
                  <Cell>{row.fractional}</Cell>
                  <Cell>{row.marketData}</Cell>
                  <Cell>{row.orderType}</Cell>
                  <Cell><Badge tone="planned">{row.status}</Badge></Cell>
                  <Cell>{row.openReview}</Cell>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <SHead icon={<Link2 size={13} />} label="Technische Prozessgrafik" />
        <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
          {["Capitalife-Strategie", "Trading Engine", "INNO / IBKR-Anbindung", "Individuelle Kundendepots", "Monitoring und Reporting"].map((step, index, array) => (
            <div key={step} style={{ display: "grid", gap: 8 }}>
              <div style={{ borderRadius: 14, border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.03)", padding: "12px 14px", fontSize: 11, color: TOKENS.text, fontFamily: M, textAlign: "center" }}>{step}</div>
              {index < array.length - 1 ? (
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <ChevronRight size={16} color={TOKENS.goldDark} style={{ transform: "rotate(90deg)" }} />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function SectionCto() {
  const sections = [
    { label: "Bereits bestätigt", tone: "confirmed" as VisualTone, items: ["Empfohlene Mindestanlage etwa 20.000–25.000 EUR", "10.000 EUR wird im Rahmen der Strategieprüfung bewertet", "Tradingfrequenz wird detailliert besprochen", "Kosten im Track Record werden besprochen", "Risiko- und Performancekennzahlen werden geprüft", "Technische Anbindung und mögliches IT-Projekt werden erörtert", "Early Access grundsätzlich möglich, sofern keine Gelder, Garantien oder konkreten Performancezusagen erfolgen"] },
    { label: "Vor dem Gespräch intern vorzubereiten", tone: "planned" as VisualTone, items: ["Maschinenlesbare Broker-Statements", "Vollständige Trade-Liste", "Konsistente Annualisierungslogik"] },
    { label: "Mit CTO zu klären", tone: "planned" as VisualTone, items: ["IBKR-Setup und technische Anbindung", "Instrumentenuniversum inklusive QQQ, DAX-Kontrakt, 6E und 6B", "Gebühren- und Kostenparität im Zielmodell"] },
    { label: "Nach dem Gespräch zu entscheiden", tone: "open" as VisualTone, items: ["Finale Mindestanlageschwelle", "Zeitplan für IT-Projekt und Freigaben", "Nächste operative Due-Diligence-Schritte"] },
  ];

  return (
    <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
      <Card>
        <SHead icon={<FileText size={13} />} label="Meeting Brief" />
        <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
          {INNO_MEETING_BRIEF.map((line) => (
            <div key={line} style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.03)", padding: "9px 10px", fontSize: 10, color: TOKENS.text, fontFamily: M, lineHeight: 1.45 }}>
              {line}
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <SHead icon={<Waypoints size={13} />} label="Priorisierte Punkte" />
        <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
          {sections.map((section) => (
            <div key={section.label} style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.02)", padding: 10 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: TOKENS.text, fontFamily: M }}>{section.label}</p>
                <Badge tone={section.tone}>{section.label}</Badge>
              </div>
              <div style={{ display: "grid", gap: 4, marginTop: 8 }}>
                {section.items.map((item) => (
                  <div key={item} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                    <StatusDot tone={section.tone} />
                    <span style={{ fontSize: 10, color: section.tone === "open" ? TOKENS.muted : TOKENS.text, fontFamily: M }}>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ background: `linear-gradient(180deg, ${TOKENS.elevated} 0%, ${TOKENS.surface} 100%)`, border: `1px solid ${TOKENS.border}`, borderRadius: 18, boxShadow: "0 8px 24px -8px rgba(0,0,0,0.6)", padding: 14, ...style }}>{children}</div>;
}

function PortfolioCard({ card }: { card: (typeof INNO_STRATEGY_CARDS)[number] }) {
  const objective = card.rows.find((row) => row.key === "Ziel")?.value ?? "Nicht gefunden";
  const rows = ["Datenart", "Track-Record-Status", "Tradingfrequenz", "Haltedauer", "Anzahl Assets", "Parallele Positionen", "Geplante Gewichtung", "Instrumententypen"].map((key) => {
    const found = card.rows.find((row) => row.key === key);
    return { key, value: found?.value ?? (key === "Instrumententypen" ? (card.id === "tactical" ? "Futures / FX" : "ETF / Asset-Allokationen") : "Nicht gefunden"), source: found?.source ?? "Auftragsvorgabe" };
  });

  const notes = card.id === "tactical"
    ? [
      { label: "Track Record", text: "Historischer Live-Track-Record; bisher teilweise CFD-basiert", tone: "confirmed" as VisualTone },
      { label: "Zukunft", text: "Zukuenftige Umsetzung ohne CFDs geplant", tone: "planned" as VisualTone },
      { label: "Abgrenzung", text: "Neue Paper-, Backtest- oder Forward-Strategien werden separat gekennzeichnet", tone: "open" as VisualTone },
    ]
    : card.id === "core-invest"
      ? [
        { label: "Allokation", text: "8 Komponenten und 100% Zielgewicht zentral belegt", tone: "confirmed" as VisualTone },
        { label: "Validierung", text: "4 Strategy-Sleeves ohne exakte Trade-Paritaet", tone: "open" as VisualTone },
        { label: "Live", text: "Keine echten Live-Daten oder IBKR-Ausfuehrung verifiziert", tone: "planned" as VisualTone },
      ]
      : [
      { label: "Status", text: "Kein vollständiger Live-Track-Record", tone: "planned" as VisualTone },
      { label: "Struktur", text: "Etwa 6-8 Assets und etwa 4 aktive Positionen plus ETF-Allokationen", tone: "planned" as VisualTone },
      { label: "Pruefung", text: "Separate Pruefung durch INNO erforderlich", tone: "open" as VisualTone },
    ];

  return (
    <Card>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: TOKENS.text, fontFamily: N }}>{card.title}</p>
          <p style={{ margin: "4px 0 0", fontSize: 10, color: TOKENS.muted, fontFamily: M }}>{objective}</p>
        </div>
        <Badge tone={card.id === "tactical" ? "confirmed" : card.id === "core-invest" ? "open" : "planned"}>{card.badge}</Badge>
      </div>

      <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
        {rows.map((row) => (
          <div key={row.key} style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.02)", padding: "9px 10px" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontSize: 9, color: TOKENS.muted, fontFamily: M }}>{row.key}</span>
              <SourcePill source={row.source} />
            </div>
            <p style={{ margin: "4px 0 0", fontSize: 10, color: TOKENS.text, fontFamily: M, overflowWrap: "anywhere" }}>{row.value}</p>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
        {notes.map((item) => (
          <div key={item.label} style={{ display: "flex", alignItems: "flex-start", gap: 8, borderRadius: 12, border: "1px solid rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.02)", padding: "9px 10px" }}>
            <StatusDot tone={item.tone} />
            <div style={{ minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 9, color: TOKENS.muted, fontFamily: M }}>{item.label}</p>
              <p style={{ margin: "3px 0 0", fontSize: 10, color: TOKENS.text, fontFamily: M, overflowWrap: "anywhere" }}>{item.text}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function FactCard({ icon, title, rows }: { icon: React.ReactNode; title: string; rows: { label: string; value: string; status: string; source: string }[] }) {
  return (
    <Card>
      <SHead icon={icon} label={title} />
      <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
        {rows.map((row) => (
          <div key={row.label} style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.02)", padding: "10px 12px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: TOKENS.text, fontFamily: M }}>{row.label}</p>
              <Badge tone={visualToneFromStatus(row.status)}>{normalizeStatusLabel(row.status)}</Badge>
            </div>
            <p style={{ margin: "6px 0 0", fontSize: 10, color: TOKENS.text, fontFamily: M, overflowWrap: "anywhere" }}>{row.value}</p>
            <p style={{ margin: "4px 0 0", fontSize: 9, color: TOKENS.muted, fontFamily: M, overflowWrap: "anywhere" }}>{row.source}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function TrackMetric({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.02)", padding: "9px 10px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <span style={{ fontSize: 9, color: TOKENS.muted, fontFamily: M }}>{label}</span>
        {warn ? <CircleAlert size={11} color={TOKENS.red} /> : null}
      </div>
      <p style={{ margin: "4px 0 0", fontSize: 10, color: TOKENS.text, fontFamily: M, overflowWrap: "anywhere" }}>{value}</p>
    </div>
  );
}

function SHead({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ color: TOKENS.gold, flexShrink: 0 }}>{icon}</span>
      <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: TOKENS.text, fontFamily: M }}>{label}</p>
    </div>
  );
}

function SourcePill({ source, onOpen }: { source: string; onOpen?: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      title={`Quelle anzeigen: ${sourceLabel(source)}`}
      aria-label={`Quelle anzeigen: ${sourceLabel(source)}`}
      style={{ borderRadius: 999, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", color: TOKENS.muted, width: 30, height: 30, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
    >
      <FileBadge2 size={15} />
    </button>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone: VisualTone }) {
  return <span style={{ borderRadius: 20, fontSize: 8, fontWeight: 700, padding: "4px 8px", fontFamily: M, ...badgeToneStyle(tone) }}>{children}</span>;
}

function Donut({ segments, label }: { segments: { value: number; tone: VisualTone }[]; label: string }) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0) || 1;
  let cursor = 0;
  const gradient = segments.map((segment) => {
    const start = (cursor / total) * 360;
    cursor += segment.value;
    const end = (cursor / total) * 360;
    return `${visualColor(segment.tone)} ${start}deg ${end}deg`;
  }).join(", ");

  return (
    <div style={{ width: 86, height: 86, borderRadius: "50%", background: `conic-gradient(${gradient})`, position: "relative", flexShrink: 0 }}>
      <div style={{ position: "absolute", inset: 12, borderRadius: "50%", background: TOKENS.surface, display: "flex", alignItems: "center", justifyContent: "center", color: TOKENS.text, fontSize: 13, fontWeight: 700, fontFamily: N }}>{label}</div>
    </div>
  );
}

function LegendRow({ label, value, tone }: { label: string; value: number; tone: VisualTone }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, borderRadius: 12, border: "1px solid rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.02)", padding: "8px 10px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <StatusDot tone={tone} />
        <span style={{ fontSize: 10, color: TOKENS.text, fontFamily: M }}>{label}</span>
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color: TOKENS.text, fontFamily: N }}>{value}</span>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.02)", padding: "9px 10px" }}>
      <p style={{ margin: 0, fontSize: 9, color: TOKENS.muted, fontFamily: M }}>{label}</p>
      <p style={{ margin: "4px 0 0", fontSize: 14, fontWeight: 700, color: TOKENS.text, fontFamily: N }}>{value}</p>
    </div>
  );
}

function StatusDot({ tone }: { tone: VisualTone }) {
  return <span style={{ width: 9, height: 9, borderRadius: 999, background: visualColor(tone), flexShrink: 0 }} />;
}

function Cell({ children }: { children: React.ReactNode }) {
  return <td style={{ padding: "10px", fontSize: 10, color: TOKENS.text, fontFamily: M, overflowWrap: "anywhere" }}>{children}</td>;
}

function normalizeCostRows(rows: typeof INNO_COST_ROWS) {
  return [
    { label: "Spread / Kommission / Swap historisch", value: "Brokerseitig verbuchte Handelskosten wie Spreads, Kommissionen und Swaps sind beruecksichtigt, soweit sie auf den zugrunde liegenden Echtgeldkonten verbucht wurden.", status: "Teilweise belegt", source: rows[0]?.source ?? "Nicht gefunden" },
    { label: "Management Fee / Performance Fee", value: "Noch festzulegen", status: "Nicht dokumentiert", source: rows[1]?.source ?? "Nicht gefunden" },
    { label: "Historisch enthaltene Gebühren", value: rows[2]?.detail ?? "Nicht gefunden", status: rows[2]?.status ?? "Nicht gefunden", source: rows[2]?.source ?? "Nicht gefunden" },
    { label: "Zukünftige Gebühren im IBKR-/Institutsmodell", value: rows[3]?.detail ?? "Nicht gefunden", status: "Noch festzulegen", source: rows[3]?.source ?? "Nicht gefunden" },
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

function sourceLabel(source: string) {
  const parts = source.split(/[\\/]/);
  return parts[parts.length - 1] || source;
}

function visualToneFromStatus(status: string): VisualTone {
  const key = status.toLowerCase();
  if (key.includes("widers")) return "critical";
  if (key.includes("live") || key.includes("bestaetigt") || key.includes("belegt")) return "confirmed";
  if (key.includes("intern geplant") || key.includes("forward") || key.includes("backtest")) return "test";
  if (key.includes("pruefung") || key.includes("offen") || key.includes("festzulegen")) return "planned";
  return "open";
}

function normalizeStatusLabel(status: string) {
  const key = status.toLowerCase();
  if (key.includes("nicht")) return "Nicht dokumentiert";
  if (key.includes("offen")) return "Noch festzulegen";
  return status;
}

function visualColor(tone: VisualTone) {
  if (tone === "confirmed") return TOKENS.goldLight;
  if (tone === "test") return TOKENS.gold;
  if (tone === "planned") return TOKENS.goldDark;
  if (tone === "critical") return TOKENS.red;
  return "#6B6C70";
}

function badgeToneStyle(tone: VisualTone) {
  return {
    border: `1px solid ${tone === "critical" ? "rgba(212,91,99,0.35)" : tone === "open" ? TOKENS.border : "rgba(199,166,81,0.35)"}`,
    background: tone === "critical" ? "rgba(212,91,99,0.12)" : tone === "open" ? "rgba(255,255,255,0.04)" : "rgba(199,166,81,0.12)",
    color: tone === "critical" ? TOKENS.red : tone === "open" ? TOKENS.muted : TOKENS.goldLight,
  };
}
