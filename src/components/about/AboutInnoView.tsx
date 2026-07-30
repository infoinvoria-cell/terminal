"use client";

import { useMemo, useState } from "react";
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
  INNO_OVERVIEW_METRICS,
  INNO_RISK_ROWS,
  INNO_SEASONAL_PATTERNS,
  INNO_SOURCE_REGISTER,
  INNO_STRATEGY_CARDS,
  INNO_TRACK_RECORD_ROWS,
  type InnoSourceRef,
  type InnoStatusTone,
} from "@/lib/about/about-inno-data";
import { buildInnoTrackRecordRuntimeModel } from "@/lib/about/inno-track-record-model";
import type { TrackRecordOverview } from "@/lib/track-record/types";

const M = "var(--font-montserrat), sans-serif";
const N = "var(--font-nunito), sans-serif";
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

const CARD = "rounded-[18px] border shadow-[0_12px_32px_-12px_rgba(0,0,0,0.58)]";

type InnoSection = "overview" | "portfolios" | "track" | "risk" | "ibkr" | "cto" | "sources";
type VisualTone = "confirmed" | "test" | "planned" | "open" | "critical";
type OverviewMetricCard = {
  label: string;
  value: string;
  sub: string;
  source: string;
};

const SECTION_TABS: { id: InnoSection; label: string }[] = [
  { id: "overview", label: "Übersicht" },
  { id: "portfolios", label: "Portfolios" },
  { id: "track", label: "Track Record" },
  { id: "risk", label: "Risiko & Kosten" },
  { id: "ibkr", label: "IBKR & Technik" },
  { id: "cto", label: "CTO-Gespräch" },
  { id: "sources", label: "Quellen" },
];

export function AboutInnoView({ trackRecordOverview }: { trackRecordOverview: TrackRecordOverview }) {
  const [activeSection, setActiveSection] = useState<InnoSection>("overview");
  const [sourceQuery, setSourceQuery] = useState("");
  const [sourceType, setSourceType] = useState("Alle Datenarten");
  const [sourcePortfolio, setSourcePortfolio] = useState("Alle Portfolios");

  const runtime = useMemo(
    () => buildInnoTrackRecordRuntimeModel(trackRecordOverview),
    [trackRecordOverview],
  );
  const overviewMetrics = runtime.heroMetrics as OverviewMetricCard[];

  const categoryStats = useMemo(() => {
    const totalCategories = 6;
    const completeCategories = trackRecordOverview.historical.historicalDataQuality === "complete" ? 2 : 1;
    const openEvidencePoints = trackRecordOverview.readiness.blockers.length;
    const conflictingPoints = INNO_DATA_GAPS_ROWS.filter((row) => row.status.toLowerCase().includes("widers")).length;
    return { totalCategories, completeCategories, openEvidencePoints, conflictingPoints };
  }, [trackRecordOverview]);

  const readinessChecklist = useMemo(
    () => runtime.readiness.map((item) => ({
      label: `${item.label} · ${item.status}`,
      done: item.done,
      tone: item.done ? "confirmed" as VisualTone : "open" as VisualTone,
    })),
    [runtime],
  );

  const readinessDone = readinessChecklist.filter((item) => item.done).length;

  const statusDistribution = useMemo(
    () => [
      { label: "Live belegt", value: 1, tone: "confirmed" as VisualTone },
      { label: "Testdaten", value: 2, tone: "test" as VisualTone },
      { label: "Geplant", value: 4, tone: "planned" as VisualTone },
      { label: "Offen", value: 5, tone: "open" as VisualTone },
      { label: "Widersprüchlich", value: 1, tone: "critical" as VisualTone },
    ],
    [],
  );

  const topOpenPoints = useMemo(
    () => [
      {
        title: "Maschinenlesbare vollständige Broker-Statements",
        owner: "Joris",
        status: "Nicht gefunden",
        source: "17_Haftungsdach_QA/Haftungsdach Missing Evidence List.md",
        nextAction: "Für CTO-Gespräch intern vorbereiten",
        priority: "Vor Gespräch",
      },
      {
        title: "Vollständige Trade-Liste",
        owner: "Joris",
        status: "Nicht gefunden",
        source: "17_Haftungsdach_QA/Haftungsdach Missing Evidence List.md",
        nextAction: "Für CTO-Gespräch intern vorbereiten",
        priority: "Vor Gespräch",
      },
      {
        title: "Widersprüchliche Tactical-Annualisierung klären",
        owner: "Methodik abstimmen",
        status: "Widersprüchlich",
        source: "04_Track_Record/Performance Metrics Summary.md",
        nextAction: "Methodik abstimmen und Hinweistext finalisieren",
        priority: "Kritisch",
      },
    ],
    [],
  );

  const ctoSections = useMemo(
    () => [
      {
        label: "Bereits bestätigt",
        items: [
          "Empfohlene Mindestanlage etwa 20.000–25.000 EUR",
          "10.000 EUR wird im Rahmen der Strategieprüfung bewertet",
          "Tradingfrequenz wird detailliert besprochen",
          "Kosten im Track Record werden besprochen",
          "Risiko- und Performancekennzahlen werden geprüft",
          "Technische Anbindung und mögliches IT-Projekt werden erörtert",
          "Early Access grundsätzlich möglich, sofern keine Gelder, Garantien oder konkreten Performancezusagen erfolgen",
        ],
        tone: "confirmed" as VisualTone,
      },
      {
        label: "Vor dem Gespräch intern vorzubereiten",
        items: [
          "Maschinenlesbare Broker-Statements",
          "Vollständige Trade-Liste",
          "Konsistente Annualisierungslogik",
        ],
        tone: "planned" as VisualTone,
      },
      {
        label: "Mit CTO zu klären",
        items: [
          "IBKR-Setup und technische Anbindung",
          "Instrumentenuniversum inklusive QQQ, DAX-Kontrakt, 6E und 6B",
          "Gebühren- und Kostenparität im Zielmodell",
        ],
        tone: "planned" as VisualTone,
      },
      {
        label: "Nach dem Gespräch zu entscheiden",
        items: [
          "Finale Mindestanlageschwelle",
          "Zeitplan für IT-Projekt und Freigaben",
          "Nächste operative Due-Diligence-Schritte",
        ],
        tone: "open" as VisualTone,
      },
    ],
    [],
  );

  const sourceRows = useMemo(() => {
    return INNO_SOURCE_REGISTER.filter((source) => {
      const query = sourceQuery.trim().toLowerCase();
      const inferredType = inferSourceType(source);
      const inferredPortfolio = inferSourcePortfolio(source);
      const matchesQuery = !query
        || source.label.toLowerCase().includes(query)
        || source.path.toLowerCase().includes(query)
        || source.quality?.toLowerCase().includes(query);
      return matchesQuery
        && (sourceType === "Alle Datenarten" || inferredType === sourceType)
        && (sourcePortfolio === "Alle Portfolios" || inferredPortfolio === sourcePortfolio);
    });
  }, [sourcePortfolio, sourceQuery, sourceType]);

  const sourceTypes = useMemo(() => ["Alle Datenarten", ...Array.from(new Set(INNO_SOURCE_REGISTER.map(inferSourceType)))], []);
  const sourcePortfolios = useMemo(() => ["Alle Portfolios", ...Array.from(new Set(INNO_SOURCE_REGISTER.map(inferSourcePortfolio)))], []);
  const openSource = (query: string) => {
    setSourceQuery(query);
    setActiveSection("sources");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden" style={{ color: TOKENS.text }}>
      <section className="shrink-0 px-1 py-0.5">
        <div className="flex flex-wrap items-center gap-2 overflow-x-auto pb-1">
          {SECTION_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSection(tab.id)}
              className="rounded-full border px-3 py-1.5 text-[11px] font-semibold whitespace-nowrap transition-colors"
              style={{
                fontFamily: M,
                borderColor: activeSection === tab.id ? TOKENS.goldDark : TOKENS.border,
                background: activeSection === tab.id ? "rgba(199,166,81,0.12)" : TOKENS.surface,
                color: activeSection === tab.id ? TOKENS.text : TOKENS.muted,
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      <div className="min-h-0 flex-1 overflow-auto pr-1">
        {activeSection === "overview" ? (
          <div className="flex min-h-0 flex-col gap-3">
            <section className="grid grid-cols-1 gap-2.5 lg:grid-cols-2 xl:grid-cols-4">
              {overviewMetrics.map((metric) => (
                <div key={metric.label} className={`${CARD} min-w-0 p-3`} style={surfaceStyle()}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px]" style={{ color: TOKENS.muted, fontFamily: M }}>{metric.label}</p>
                      <p className="mt-0.5 text-[17px] font-bold leading-[1.15]" style={{ color: TOKENS.text, fontFamily: N }}>{metric.value}</p>
                      <p className="mt-0.5 text-[10px] leading-[1.2]" style={{ color: TOKENS.goldLight, fontFamily: M }}>{metric.sub}</p>
                    </div>
                    <SourceIcon source={metric.source} onOpen={() => openSource(sourceLabel(metric.source))} />
                  </div>
                </div>
              ))}
            </section>

            <section className="grid grid-cols-1 items-start gap-3 xl:grid-cols-[0.84fr_0.96fr_1.12fr]">
              <div className="grid min-w-0 self-start gap-3">
                <div className={`${CARD} min-w-0 p-3`} style={surfaceStyle()}>
                  <SectionTitle icon={<Database size={14} />} title="Datenvollständigkeit" />
                  <div className="mt-3 flex items-center gap-3">
                    <Donut
                      segments={[
                        { value: categoryStats.completeCategories, tone: "confirmed" },
                        { value: categoryStats.openEvidencePoints, tone: "open" },
                        { value: categoryStats.conflictingPoints, tone: "critical" },
                      ]}
                      label="1/6"
                      compact
                    />
                    <div className="grid min-w-0 flex-1 grid-cols-1 gap-1.5">
                      <LegendRow compact label="Vollständige Datenkategorien: 1 von 6" value={categoryStats.completeCategories} tone="confirmed" />
                      <LegendRow compact label="Offene Evidenzpunkte: 20" value={categoryStats.openEvidencePoints} tone="open" />
                      <LegendRow compact label="Widersprüchliche Angaben: 1" value={categoryStats.conflictingPoints} tone="critical" />
                    </div>
                  </div>
                </div>

                <div className={`${CARD} min-w-0 self-start p-3`} style={surfaceStyle()}>
                  <div className="flex items-center justify-between gap-2">
                    <SectionTitle icon={<Waypoints size={14} />} title="Statusverteilung" />
                    <span
                      title="Die Statusverteilung zählt Strategie- und Prüfobjekte. Die offenen Evidenzpunkte zählen einzelne fehlende Nachweise und Datenfelder."
                      className="inline-flex h-6 w-6 items-center justify-center rounded-full border text-[11px]"
                      style={{ borderColor: TOKENS.border, color: TOKENS.muted, background: "rgba(255,255,255,0.03)" }}
                    >
                      i
                    </span>
                  </div>
                  <div className="mt-2.5 space-y-1.5">
                    <div className="flex h-2 overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
                      {statusDistribution.map((segment) => (
                        <div
                          key={segment.label}
                          style={{
                            width: `${(segment.value / statusDistribution.reduce((sum, item) => sum + item.value, 0)) * 100}%`,
                            background: visualColor(segment.tone),
                          }}
                        />
                      ))}
                    </div>
                    <div className="grid grid-cols-1 gap-1">
                      {statusDistribution.map((segment) => (
                        <LegendRow compact key={segment.label} label={segment.label} value={segment.value} tone={segment.tone} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className={`${CARD} min-w-0 self-start p-3`} style={surfaceStyle()}>
                <div className="flex items-center justify-between gap-3">
                  <SectionTitle icon={<Check size={14} />} title="CTO-Bereitschaft" />
                  <div
                    className="rounded-full border px-2.5 py-1 text-[10px] font-semibold"
                    style={{
                      fontFamily: M,
                      borderColor: TOKENS.goldDark,
                      background: "rgba(199,166,81,0.12)",
                      color: TOKENS.goldLight,
                    }}
                  >
                    {readinessDone}/{readinessChecklist.length}
                  </div>
                </div>
                <div className="mt-2.5 space-y-1.5">
                  <ProgressBar value={readinessDone} total={readinessChecklist.length} compact />
                  <div className="grid grid-cols-1 gap-1">
                    {readinessChecklist.map((item) => (
                      <div key={item.label} className="flex min-w-0 items-center gap-1.5 rounded-[12px] border px-2 py-1.5" style={panelStyle()}>
                        {item.done ? (
                          <Check size={13} style={{ color: TOKENS.gold, flexShrink: 0 }} />
                        ) : (
                          <CircleDashed size={13} style={{ color: item.tone === "planned" ? TOKENS.goldDark : TOKENS.muted, flexShrink: 0 }} />
                        )}
                        <span className="min-w-0 text-[10px] leading-[1.25]" style={{ color: item.done ? TOKENS.text : TOKENS.muted, fontFamily: M }}>{item.label}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[9.5px] leading-[1.28]" style={{ color: TOKENS.muted, fontFamily: M }}>Nur eindeutig abgeschlossene Punkte gelten als erfüllt. Das Instrumentenuniversum ist derzeit noch nicht abgeschlossen und zählt deshalb nicht als erledigt.</p>
                </div>
              </div>

              <div className={`${CARD} min-w-0 self-start p-3`} style={surfaceStyle()}>
                <SectionTitle icon={<AlertTriangle size={14} />} title="Offene Punkte" />
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <MiniStat compact label="Offene Evidenzpunkte" value="20" />
                  <MiniStat compact label="Offene Entscheidungen" value={INNO_OVERVIEW_METRICS[6]?.value ?? "9"} />
                </div>
                <div className="mt-2.5 space-y-1.5">
                  {topOpenPoints.map((item) => (
                    <div key={item.title} className="rounded-[14px] border p-2" style={panelStyle()}>
                      <div className="flex flex-wrap items-center justify-between gap-1.5">
                        <p className="text-[12px] font-semibold" style={{ color: TOKENS.text, fontFamily: M }}>{item.title}</p>
                        <StatusBadge tone={item.priority === "Kritisch" ? "critical" : "planned"}>{item.priority}</StatusBadge>
                      </div>
                      <div className="mt-1.5 grid grid-cols-1 gap-y-1 text-[10px]" style={{ color: TOKENS.muted, fontFamily: M }}>
                        <div className="grid grid-cols-[84px_minmax(0,1fr)] gap-2">
                          <span>Verantwortlich</span>
                          <span style={{ color: TOKENS.text }}>{item.owner}</span>
                        </div>
                        <div className="grid grid-cols-[52px_98px] gap-x-2 gap-y-1 md:grid-cols-[52px_98px_88px_minmax(0,1fr)]">
                          <span>Status</span>
                          <span style={{ color: TOKENS.text }}>{item.status}</span>
                          <span>Nächste Aktion</span>
                          <span className="truncate" title={item.nextAction} style={{ color: TOKENS.text }}>{item.nextAction}</span>
                        </div>
                        <div className="grid grid-cols-[52px_minmax(0,1fr)] gap-2">
                          <span>Quelle</span>
                          <span className="truncate" title={item.source} style={{ color: TOKENS.text }}>{sourceLabel(item.source)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-2.5">
                  <button
                    type="button"
                    onClick={() => setActiveSection("cto")}
                    className="rounded-full border px-3 py-1.5 text-[10px] font-semibold"
                    style={{ borderColor: TOKENS.goldDark, background: "rgba(199,166,81,0.08)", color: TOKENS.goldLight, fontFamily: M }}
                  >
                    Alle offenen Punkte im CTO-Gespräch
                  </button>
                </div>
              </div>
            </section>
          </div>
        ) : null}

        {activeSection === "portfolios" ? (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {INNO_STRATEGY_CARDS.map((card) => (
                <PortfolioCard key={card.id} card={card} />
              ))}
            </div>
            <SeasonalEvidenceTable />
          </div>
        ) : null}

        {activeSection === "track" ? (
          <div className="flex flex-col gap-3">
            <section className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {INNO_TRACK_RECORD_ROWS.map((row) => (
                <div key={row.portfolio} className={`${CARD} min-w-0 p-4`} style={surfaceStyle()}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <SectionTitle icon={<BriefcaseBusiness size={14} />} title={row.portfolio} />
                      <p className="mt-2 text-[12px]" style={{ color: TOKENS.muted, fontFamily: M }}>{row.zeitraum}</p>
                    </div>
                    <StatusBadge tone={row.portfolio.includes("Tactical") ? "confirmed" : "planned"}>
                      {row.echtgeldstatus}
                    </StatusBadge>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 2xl:grid-cols-4">
                    <TrackMetric label="Gesamtperformance" value={row.performance} />
                    <TrackMetric
                      label={row.portfolio.includes("Tactical") ? "Berichtswert p.a." : "Annualisierte Rendite"}
                      value={row.portfolio.includes("Tactical")
                        ? runtime.annualization.reported
                        : row.annualisierung}
                      warn={row.portfolio.includes("Tactical")}
                    />
                    {row.portfolio.includes("Tactical") ? (
                      <>
                        <TrackMetric label="Aus Berichtsreturn neu berechnet" value={runtime.annualization.recalculated} warn />
                        <TrackMetric label="Monats-CAGR, nicht vergleichbar" value={runtime.annualization.alternative} warn />
                      </>
                    ) : null}
                    <TrackMetric label="Max. Drawdown" value={row.drawdown} />
                    <TrackMetric label="Sharpe" value={row.sharpe} />
                    <TrackMetric label="Calmar" value={row.calmar} />
                    <TrackMetric label="Volatilität" value={row.volatilitaet} warn={row.volatilitaet === "Nicht gefunden"} />
                    <TrackMetric label="Profit Factor" value={row.profitFactor} />
                    <TrackMetric label="Trefferquote" value={row.trefferquote} warn={row.trefferquote === "Nicht gefunden"} />
                  </div>
                  {row.portfolio.includes("Tactical") ? (
                    <div className="mt-4 space-y-2 rounded-[14px] border px-3 py-2" style={panelStyle()}>
                      <p className="text-[11px]" style={{ color: TOKENS.text, fontFamily: M }}>{runtime.annualization.explanation}</p>
                      <p className="text-[10px]" style={{ color: TOKENS.muted, fontFamily: M }}>
                        Myfxbook: {runtime.myfxbookStatus} · Darwinex: {runtime.darwinexStatus} · Datenalter: {runtime.dataAgeStatus} · Datenbank: {runtime.databaseStatus}
                      </p>
                    </div>
                  ) : null}
                </div>
              ))}
            </section>

            <section className="grid grid-cols-1 gap-3 xl:grid-cols-3">
              {["Equity-Kurve", "Drawdown-Verlauf"].map((label) => (
                <div key={label} className={`${CARD} min-w-0 p-4`} style={surfaceStyle()}>
                  <SectionTitle icon={<FileSearch size={14} />} title={label} />
                  <EmptyState text="Für diese Auswertung fehlen weiterhin vollständige Rohdaten." />
                </div>
              ))}
              <div className={`${CARD} min-w-0 p-4`} style={surfaceStyle()}>
                <SectionTitle icon={<FileSearch size={14} />} title="Monatliche Renditen" />
                <div className="mt-4 grid grid-cols-4 gap-1.5">
                  {trackRecordOverview.historical.monthlyReturns.map((row) => (
                    <div key={row.month} className="rounded-[10px] border px-2 py-1.5 text-center" style={{
                      borderColor: TOKENS.border,
                      background: row.returnPct > 0 ? "rgba(199,166,81,0.12)" : row.returnPct < 0 ? "rgba(212,91,99,0.12)" : "rgba(255,255,255,0.03)",
                    }}>
                      <p className="text-[8px]" style={{ color: TOKENS.muted }}>{row.month}</p>
                      <p className="text-[10px] font-semibold" style={{ color: row.returnPct < 0 ? TOKENS.red : TOKENS.text }}>{row.returnPct.toFixed(1)}%</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </div>
        ) : null}

        {activeSection === "risk" ? (
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            <FactCard
              icon={<ShieldAlert size={14} />}
              title="Risikosteuerung"
              rows={INNO_RISK_ROWS.map((row) => ({
                label: row.topic,
                value: row.value,
                status: row.status,
                source: row.source,
              }))}
            />
            <FactCard
              icon={<Building2 size={14} />}
              title="Kostenstruktur"
              rows={normalizeCostRows(INNO_COST_ROWS)}
            />
          </div>
        ) : null}

        {activeSection === "ibkr" ? (
          <div className="flex flex-col gap-3">
            <div className={`${CARD} min-w-0 p-4`} style={surfaceStyle()}>
                <SectionTitle icon={<Boxes size={14} />} title="Instrumentenmatrix" />
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[1800px] table-fixed">
                    <thead>
                      <tr className="border-b text-left text-[10px]" style={{ borderColor: TOKENS.border, color: TOKENS.muted, fontFamily: M }}>
                    {["Strategie", "Instrument", "Produkttyp", "Symbol", "ConId", "Börse", "Währung", "Stückelung", "Fractional", "Marktdaten", "Ordertyp", "Status", "Offene Prüfung"].map((label) => (
                        <th key={label} className="px-3 py-2 font-semibold">{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {INNO_IBKR_ROWS.map((row) => (
                      <tr key={`${row.strategy}-${row.symbol}`} className="border-b align-top" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
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
                        <Cell><StatusBadge tone="planned">{row.status}</StatusBadge></Cell>
                        <Cell>{row.openReview}</Cell>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className={`${CARD} min-w-0 p-4`} style={surfaceStyle()}>
              <SectionTitle icon={<Link2 size={14} />} title="Technische Prozessgrafik" />
              <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-5">
                {["Capitalife-Strategie", "Trading Engine", "INNO / IBKR-Anbindung", "Individuelle Kundendepots", "Monitoring und Reporting"].map((step, index, array) => (
                  <div key={step} className="flex min-w-0 items-center gap-3 xl:flex-col xl:items-stretch">
                    <div className="flex min-w-0 flex-1 items-center justify-center rounded-[16px] border px-4 py-4 text-center text-[12px]" style={{ ...panelStyle(), color: TOKENS.text, fontFamily: M }}>
                      {step}
                    </div>
                    {index < array.length - 1 ? <ChevronRight className="shrink-0 xl:mx-auto xl:rotate-90" size={16} style={{ color: TOKENS.goldDark }} /> : null}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {activeSection === "cto" ? (
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-[0.9fr_1.1fr]">
            <div className={`${CARD} min-w-0 p-4`} style={surfaceStyle()}>
              <SectionTitle icon={<FileText size={14} />} title="Meeting Brief" />
              <div className="mt-4 space-y-2">
                {INNO_MEETING_BRIEF.map((line) => (
                  <div key={line} className="rounded-[14px] border px-3 py-2.5 text-[12px]" style={{ ...panelStyle(), color: TOKENS.text, fontFamily: M }}>
                    {line}
                  </div>
                ))}
              </div>
            </div>

            <div className={`${CARD} min-w-0 p-4`} style={surfaceStyle()}>
              <SectionTitle icon={<AlertTriangle size={14} />} title="Priorisierte Punkte und Entscheidungen" />
              <div className="mt-4 space-y-3">
                {ctoSections.map((section) => (
                  <div key={section.label} className="rounded-[14px] border p-3" style={panelStyle()}>
                    <div className="flex items-center justify-between gap-2">
                        <p className="text-[12px] font-semibold" style={{ color: TOKENS.text, fontFamily: M }}>{section.label}</p>
                        <StatusBadge tone={section.tone}>{section.label}</StatusBadge>
                      </div>
                    <div className="mt-2.5 space-y-1.5">
                      {section.items.map((item) => (
                        <div key={item} className="flex items-start gap-2 text-[11px]" style={{ color: section.tone === "open" ? TOKENS.muted : TOKENS.text, fontFamily: M }}>
                          <StatusDot tone={section.tone} />
                          <span className="min-w-0 [overflow-wrap:anywhere]">{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {activeSection === "sources" ? (
          <div className={`${CARD} min-w-0 p-4`} style={surfaceStyle()}>
            <SectionTitle icon={<Database size={14} />} title="Quellenregister" />
            <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-[1.3fr_0.7fr_0.7fr]">
              <input
                value={sourceQuery}
                onChange={(event) => setSourceQuery(event.target.value)}
                placeholder="Quelle oder Pfad suchen"
                className="min-w-0 rounded-[14px] border px-3 py-2 text-[12px] outline-none"
                style={{ borderColor: TOKENS.border, background: TOKENS.elevated, color: TOKENS.text, fontFamily: M }}
              />
              <select
                value={sourceType}
                onChange={(event) => setSourceType(event.target.value)}
                className="min-w-0 rounded-[14px] border px-3 py-2 text-[12px] outline-none"
                style={{ borderColor: TOKENS.border, background: TOKENS.elevated, color: TOKENS.text, fontFamily: M }}
              >
                {sourceTypes.map((option) => <option key={option} value={option} className="bg-[#151618]">{option}</option>)}
              </select>
              <select
                value={sourcePortfolio}
                onChange={(event) => setSourcePortfolio(event.target.value)}
                className="min-w-0 rounded-[14px] border px-3 py-2 text-[12px] outline-none"
                style={{ borderColor: TOKENS.border, background: TOKENS.elevated, color: TOKENS.text, fontFamily: M }}
              >
                {sourcePortfolios.map((option) => <option key={option} value={option} className="bg-[#151618]">{option}</option>)}
              </select>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[920px] table-fixed">
                <thead>
                  <tr className="border-b text-left text-[10px]" style={{ borderColor: TOKENS.border, color: TOKENS.muted, fontFamily: M }}>
                    {["Datei", "Datenart", "Portfolio", "Zeitraum", "Update", "Details"].map((label) => (
                      <th key={label} className="px-3 py-2 font-semibold">{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sourceRows.map((source) => (
                    <tr key={source.path} className="border-b align-top" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
                      <Cell>
                        <details>
                          <summary className="cursor-pointer list-none">
                            <span className="font-semibold" style={{ color: TOKENS.text }}>{source.label}</span>
                          </summary>
                          <div className="mt-2 space-y-1 text-[10px]" style={{ color: TOKENS.muted }}>
                            <div className="[overflow-wrap:anywhere]">{source.path}</div>
                            {source.quality ? <p>Qualität: {source.quality}</p> : null}
                          </div>
                        </details>
                      </Cell>
                      <Cell>{inferSourceType(source)}</Cell>
                      <Cell>{inferSourcePortfolio(source)}</Cell>
                      <Cell>{source.period ?? "Nicht angegeben"}</Cell>
                      <Cell>{source.updated ?? "Nicht angegeben"}</Cell>
                      <Cell>{source.quality ?? "Nicht angegeben"}</Cell>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SeasonalEvidenceTable() {
  const found = INNO_SEASONAL_PATTERNS.filter((row) => row.found).length;
  return (
    <div className={`${CARD} min-w-0 p-4`} style={surfaceStyle()}>
      <div className="flex items-center justify-between gap-3">
        <SectionTitle icon={<Waypoints size={14} />} title="White-Swan-Saisonmuster" />
        <StatusBadge tone="planned">{found}/10 nachweisbar</StatusBadge>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[1100px] table-fixed">
          <thead>
            <tr className="border-b text-left text-[10px]" style={{ borderColor: TOKENS.border, color: TOKENS.muted, fontFamily: M }}>
              {["Muster", "Gefunden", "Status", "Datenquelle", "Berechnung", "Walk Forward", "Produktionsgeeignet"].map((label) => (
                <th key={label} className="px-3 py-2 font-semibold">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {INNO_SEASONAL_PATTERNS.map((row) => (
              <tr key={row.id} className="border-b align-top" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
                <Cell>{row.pattern}</Cell>
                <Cell>{row.found ? "Ja" : "Nein"}</Cell>
                <Cell>{row.status}</Cell>
                <Cell>{row.source}</Cell>
                <Cell>{row.calculationAvailable ? "Vorhanden" : "Fehlt"}</Cell>
                <Cell>{row.walkForwardAvailable ? "Vorhanden" : "Fehlt"}</Cell>
                <Cell>{row.productionReady ? "Ja" : "Nein"}</Cell>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PortfolioCard({ card }: { card: (typeof INNO_STRATEGY_CARDS)[number] }) {
  const objective = card.rows.find((row) => row.key === "Ziel")?.value ?? "Nicht gefunden";
  const rows = ["Datenart", "Track-Record-Status", "Tradingfrequenz", "Haltedauer", "Anzahl Assets", "Parallele Positionen", "Geplante Gewichtung", "Instrumententypen"].map((key) => {
    const found = card.rows.find((row) => row.key === key);
    return {
      key,
      value: found?.value ?? (key === "Instrumententypen" ? (card.id === "tactical" ? "Futures / FX" : "ETF / Asset-Allokationen") : "Nicht gefunden"),
      source: found?.source ?? "Auftragsvorgabe",
    };
  });
  const noteRows = card.id === "tactical"
    ? [
      { label: "Track Record", text: "Historischer Live-Track-Record; bisher teilweise CFD-basiert", tone: "confirmed" as VisualTone },
      { label: "Zukunft", text: "Zukünftige Umsetzung ohne CFDs geplant", tone: "planned" as VisualTone },
      { label: "Abgrenzung", text: "Neue Paper-, Backtest- oder Forward-Strategien werden separat gekennzeichnet", tone: "open" as VisualTone },
    ]
    : card.id === "core-invest"
      ? [
        { label: "Allokation", text: "8 Komponenten und 100% Zielgewicht zentral belegt", tone: "confirmed" as VisualTone },
        { label: "Validierung", text: "4 Strategy-Sleeves ohne exakte Trade-Parität", tone: "open" as VisualTone },
        { label: "Live", text: "Keine echten Live-Daten oder IBKR-Ausführung verifiziert", tone: "planned" as VisualTone },
      ]
      : [
      { label: "Status", text: "Kein vollständiger Live-Track-Record", tone: "planned" as VisualTone },
      { label: "Struktur", text: "Etwa 6–8 Assets und etwa 4 aktive Positionen plus ETF-Allokationen", tone: "planned" as VisualTone },
      { label: "Prüfung", text: "Separate Prüfung durch INNO erforderlich", tone: "open" as VisualTone },
    ];

  return (
    <div className={`${CARD} min-w-0 p-4`} style={surfaceStyle()}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[22px] font-bold" style={{ color: TOKENS.text, fontFamily: N }}>{card.title}</h3>
          <p className="mt-1 text-[12px]" style={{ color: TOKENS.muted, fontFamily: M }}>{objective}</p>
        </div>
        <StatusBadge tone={card.id === "tactical" ? "confirmed" : card.id === "core-invest" ? "open" : "planned"}>{card.badge}</StatusBadge>
      </div>

      <div className="mt-4 grid min-w-0 gap-3 md:grid-cols-2">
        {rows.map((row) => (
          <div key={row.key} className="min-w-0 rounded-[14px] border px-3 py-2.5" style={panelStyle()}>
            <div className="flex items-start justify-between gap-2">
              <p className="text-[10px]" style={{ color: TOKENS.muted, fontFamily: M }}>{row.key}</p>
              <SourceIcon source={row.source} />
            </div>
            <p className="mt-1 text-[12px] [overflow-wrap:anywhere]" style={{ color: TOKENS.text, fontFamily: M }}>{row.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2">
        {noteRows.map((note) => (
          <div key={note.label} className="flex min-w-0 items-start gap-3 rounded-[14px] border px-3 py-2.5" style={panelStyle()}>
            <StatusDot tone={note.tone} />
            <div className="min-w-0">
              <p className="text-[10px]" style={{ color: TOKENS.muted, fontFamily: M }}>{note.label}</p>
              <p className="text-[11px] [overflow-wrap:anywhere]" style={{ color: TOKENS.text, fontFamily: M }}>{note.text}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
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
    <div className={`${CARD} min-w-0 p-4`} style={surfaceStyle()}>
      <SectionTitle icon={icon} title={title} />
      <div className="mt-4 space-y-2.5">
        {rows.map((row) => (
          <div key={row.label} className="rounded-[14px] border p-3" style={panelStyle()}>
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <p className="text-[12px] font-semibold" style={{ color: TOKENS.text, fontFamily: M }}>{row.label}</p>
              <StatusBadge tone={visualToneFromStatus(row.status)}>{normalizeStatusLabel(row.status)}</StatusBadge>
            </div>
            <p className="mt-2 text-[11px] [overflow-wrap:anywhere]" style={{ color: TOKENS.text, fontFamily: M }}>{row.value}</p>
            <p className="mt-1 text-[10px]" title={row.source} style={{ color: TOKENS.muted, fontFamily: M }}>{sourceLabel(row.source)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="mt-4 flex min-h-[220px] items-center justify-center rounded-[16px] border border-dashed px-6 text-center text-[12px]" style={{ borderColor: TOKENS.border, background: "rgba(255,255,255,0.02)", color: TOKENS.muted, fontFamily: M }}>
      {text}
    </div>
  );
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span style={{ color: TOKENS.gold }}>{icon}</span>
      <p className="text-[12px] font-semibold" style={{ color: TOKENS.text, fontFamily: M }}>{title}</p>
    </div>
  );
}

function MiniStat({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <div className={`rounded-[14px] border ${compact ? "p-2.5" : "p-3"}`} style={panelStyle()}>
      <p className={compact ? "text-[9px]" : "text-[10px]"} style={{ color: TOKENS.muted, fontFamily: M }}>{label}</p>
      <p className={compact ? "mt-0.5 text-[16px]" : "mt-1 text-[18px]"} style={{ color: TOKENS.text, fontFamily: N, fontWeight: 700 }}>{value}</p>
    </div>
  );
}

function TrackMetric({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-[14px] border p-3" style={panelStyle()}>
      <div className="flex items-center gap-1.5">
        <p className="text-[10px]" style={{ color: TOKENS.muted, fontFamily: M }}>{label}</p>
        {warn ? <CircleAlert size={12} style={{ color: TOKENS.red }} /> : null}
      </div>
      <p className="mt-1 text-[13px] font-semibold [overflow-wrap:anywhere]" style={{ color: TOKENS.text, fontFamily: M }}>{value}</p>
    </div>
  );
}

function ProgressBar({ value, total, compact = false }: { value: number; total: number; compact?: boolean }) {
  return (
    <div className={`${compact ? "h-1.5" : "h-2"} overflow-hidden rounded-full`} style={{ background: "#222327" }}>
      <div className="h-full" style={{ width: `${(value / total) * 100}%`, background: TOKENS.gold }} />
    </div>
  );
}

function Donut({
  segments,
  label,
  compact = false,
}: {
  segments: { value: number; tone: VisualTone }[];
  label: string;
  compact?: boolean;
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0) || 1;
  let cursor = 0;
  const gradient = segments
    .map((segment) => {
      const start = (cursor / total) * 360;
      cursor += segment.value;
      const end = (cursor / total) * 360;
      return `${visualColor(segment.tone)} ${start}deg ${end}deg`;
    })
    .join(", ");

  return (
    <div className={`relative flex ${compact ? "h-20 w-20" : "h-24 w-24"} shrink-0 items-center justify-center rounded-full`} style={{ background: `conic-gradient(${gradient})` }}>
      <div className={`flex ${compact ? "h-14 w-14 text-[13px]" : "h-16 w-16 text-[15px]"} items-center justify-center rounded-full font-bold`} style={{ background: TOKENS.surface, color: TOKENS.text, fontFamily: N }}>
        {label}
      </div>
    </div>
  );
}

function LegendRow({ label, value, tone, compact = false }: { label: string; value: number; tone: VisualTone; compact?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-3 rounded-[12px] border ${compact ? "px-2.5 py-1.5" : "px-3 py-2"}`} style={panelStyle()}>
      <div className="flex items-center gap-2">
        <StatusDot tone={tone} />
        <span className={compact ? "text-[10px]" : "text-[11px]"} style={{ color: TOKENS.text, fontFamily: M }}>{label}</span>
      </div>
      <span className={compact ? "text-[11px]" : "text-[12px]"} style={{ color: TOKENS.text, fontFamily: N, fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function SourceIcon({ source, onOpen }: { source: string; onOpen?: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      title={`Quelle anzeigen: ${sourceLabel(source)}`}
      aria-label={`Quelle anzeigen: ${sourceLabel(source)}`}
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors"
      style={{ borderColor: TOKENS.border, background: "rgba(255,255,255,0.03)", color: TOKENS.muted }}
    >
      <FileBadge2 size={15} />
    </button>
  );
}

function MetaPair({
  label,
  value,
  title,
  className = "",
  compact = false,
}: {
  label: string;
  value: string;
  title?: string;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={`grid min-w-0 ${compact ? "grid-cols-[84px_minmax(0,1fr)] gap-1.5" : "grid-cols-[92px_minmax(0,1fr)] gap-2"} ${className}`}>
      <span className={compact ? "text-[10px]" : ""} style={{ color: TOKENS.muted, fontFamily: M }}>{label}</span>
      <span title={title} className={`min-w-0 [overflow-wrap:anywhere] ${compact ? "text-[10.5px] leading-[1.3]" : ""}`} style={{ color: TOKENS.text, fontFamily: M }}>{value}</span>
    </div>
  );
}

function StatusBadge({ children, tone }: { children: React.ReactNode; tone: VisualTone }) {
  return (
    <span
      className="shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold"
      style={{ ...badgeToneStyle(tone), fontFamily: M }}
    >
      {children}
    </span>
  );
}

function StatusDot({ tone }: { tone: VisualTone }) {
  return <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: visualColor(tone) }} />;
}

function Cell({ children }: { children: React.ReactNode }) {
  return (
    <td className="px-3 py-3 text-[11px] [overflow-wrap:anywhere]" style={{ color: TOKENS.text, fontFamily: M }}>
      {children}
    </td>
  );
}

function normalizeCostRows(rows: typeof INNO_COST_ROWS) {
  return [
    {
      label: "Spread / Kommission / Swap historisch",
      value: "Brokerseitig verbuchte Handelskosten wie Spreads, Kommissionen und Swaps sind berücksichtigt, soweit sie auf den zugrunde liegenden Echtgeldkonten verbucht wurden.",
      status: "Teilweise belegt",
      source: rows[0]?.source ?? "Nicht gefunden",
    },
    {
      label: "Management Fee / Performance Fee",
      value: "Noch festzulegen",
      status: "Nicht dokumentiert",
      source: rows[1]?.source ?? "Nicht gefunden",
    },
    {
      label: "Historisch enthaltene Gebühren",
      value: rows[2]?.detail ?? "Nicht gefunden",
      status: rows[2]?.status ?? "Nicht gefunden",
      source: rows[2]?.source ?? "Nicht gefunden",
    },
    {
      label: "Zukünftige Gebühren im IBKR-/Institutsmodell",
      value: rows[3]?.detail ?? "Nicht gefunden",
      status: "Noch festzulegen",
      source: rows[3]?.source ?? "Nicht gefunden",
    },
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

function sourceLabel(source: string) {
  const parts = source.split(/[\\/]/);
  return parts[parts.length - 1] || source;
}

function openSource(label: string) {
  return;
}

function inferSourcePortfolio(source: InnoSourceRef) {
  const key = `${source.label} ${source.path} ${source.quality ?? ""}`.toLowerCase();
  if (key.includes("strategic")) return "Strategic";
  if (key.includes("performance") || key.includes("track")) return "Tactical";
  return "Beide";
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
    borderColor: tone === "critical" ? "rgba(212,91,99,0.35)" : tone === "open" ? TOKENS.border : "rgba(199,166,81,0.35)",
    background: tone === "critical" ? "rgba(212,91,99,0.12)" : tone === "open" ? "rgba(255,255,255,0.04)" : "rgba(199,166,81,0.12)",
    color: tone === "critical" ? TOKENS.red : tone === "open" ? TOKENS.muted : TOKENS.goldLight,
  };
}

function surfaceStyle() {
  return {
    borderColor: TOKENS.border,
    background: `linear-gradient(180deg, ${TOKENS.elevated} 0%, ${TOKENS.surface} 100%)`,
  };
}

function panelStyle() {
  return {
    borderColor: "rgba(255,255,255,0.05)",
    background: "rgba(255,255,255,0.02)",
  };
}

