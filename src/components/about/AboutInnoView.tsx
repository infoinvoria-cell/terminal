"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  BriefcaseBusiness,
  Building2,
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
  type InnoTableRow,
} from "@/lib/about/about-inno-data";

const M = "var(--font-montserrat), sans-serif";
const N = "var(--font-nunito), sans-serif";
const CARD = "rounded-[18px] border border-white/[0.06] bg-gradient-to-b from-[#1c1d20] to-[#141517] shadow-[0_12px_32px_-12px_rgba(0,0,0,0.58)]";

type InnoSection = "overview" | "portfolios" | "track" | "risk" | "ibkr" | "cto" | "sources";

const SECTION_TABS: { id: InnoSection; label: string }[] = [
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

export function AboutInnoView() {
  const [activeSection, setActiveSection] = useState<InnoSection>("overview");
  const [sourceQuery, setSourceQuery] = useState("");
  const [sourceType, setSourceType] = useState("Alle Datenarten");
  const [sourcePortfolio, setSourcePortfolio] = useState("Alle Portfolios");

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
  const readinessOpen = readinessChecklist.length - readinessDone;

  const statusDistribution = useMemo(
    () => [
      { label: "Live belegt", value: 1, tone: "gold" as const },
      { label: "Backtest", value: 1, tone: "blue" as const },
      { label: "Forward-Test", value: 1, tone: "blue" as const },
      { label: "Geplant", value: 4, tone: "zinc" as const },
      { label: "Offen", value: 6, tone: "red" as const },
    ],
    [],
  );

  const topOpenPoints = useMemo(
    () => [
      ...INNO_DATA_GAPS_ROWS.slice(0, 3).map((row) => ({
        title: row.aussage,
        owner: row.pruefung,
        status: row.status,
        source: row.quelle,
        nextAction: row.verwendbar,
        priority: row.status.toLowerCase().includes("widers") ? "Kritisch" : "Vor Gespräch",
      })),
      {
        title: "Gebührenstruktur für IBKR-/Institutsmodell",
        owner: "CTO + Institut",
        status: "Offen",
        source: "07_Technology/IBKR Umsetzung.md",
        nextAction: "Broker- und Gebührenmodell bestätigen",
        priority: "Vor Gespräch",
      },
      {
        title: "Mindestanlagesumme und Staffelung",
        owner: "Joris",
        status: "Offen",
        source: "Nicht gefunden",
        nextAction: "Interne Entscheidung und Gesprächsfreigabe",
        priority: "Kritisch",
      },
    ],
    [],
  );

  const sourceRows = useMemo(() => {
    const rows = INNO_SOURCE_REGISTER.filter((source) => {
      const query = sourceQuery.trim().toLowerCase();
      const matchesQuery = !query
        || source.label.toLowerCase().includes(query)
        || source.path.toLowerCase().includes(query)
        || source.quality?.toLowerCase().includes(query);
      const inferredType = inferSourceType(source);
      const inferredPortfolio = inferSourcePortfolio(source);
      const matchesType = sourceType === "Alle Datenarten" || inferredType === sourceType;
      const matchesPortfolio = sourcePortfolio === "Alle Portfolios" || inferredPortfolio === sourcePortfolio;
      return matchesQuery && matchesType && matchesPortfolio;
    });
    return rows;
  }, [sourcePortfolio, sourceQuery, sourceType]);

  const sourceTypes = useMemo(() => ["Alle Datenarten", ...Array.from(new Set(INNO_SOURCE_REGISTER.map(inferSourceType)))], []);
  const sourcePortfolios = useMemo(() => ["Alle Portfolios", ...Array.from(new Set(INNO_SOURCE_REGISTER.map(inferSourcePortfolio)))], []);

  const overviewMetrics = useMemo<OverviewMetricCard[]>(
    () => [
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
        sub: `${readinessOpen} Punkte offen`,
        tone: readinessOpen ? "blue" : "gold",
        source: "17_Haftungsdach_QA/Haftungsdach Meeting Brief.md",
      },
    ],
    [completionStats, readinessChecklist.length, readinessDone, readinessOpen],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <section className={`shrink-0 px-1 py-0.5`}>
        <div className="flex flex-wrap items-center gap-2">
          {SECTION_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSection(tab.id)}
              className={
                activeSection === tab.id
                  ? "rounded-full border border-[#e2ca7a]/35 bg-[color:var(--dash-accent)]/12 px-3 py-1.5 text-[color:var(--dash-accent)]"
                  : "rounded-full border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-white/60 transition-colors hover:text-white/82"
              }
              style={{ fontFamily: M, fontSize: 11, fontWeight: 700 }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      <div className="min-h-0 flex-1 overflow-auto pr-1">
        {activeSection === "overview" ? (
          <div className="flex min-h-0 flex-col gap-3">
            <section className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
              {overviewMetrics.map((metric) => (
                <div key={metric.label} className={`min-w-0 p-4 ${CARD}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] text-white/48" style={{ fontFamily: M }}>{metric.label}</p>
                      <p className={`mt-1 text-[20px] font-bold ${toneClass(metric.tone)}`} style={{ fontFamily: N }}>
                        {metric.value}
                      </p>
                      <p className="mt-1 text-[11px] text-white/72" style={{ fontFamily: M }}>{metric.sub}</p>
                    </div>
                    <SourcePill source={metric.source} />
                  </div>
                </div>
              ))}
            </section>

            <section className="grid grid-cols-1 gap-3 xl:grid-cols-[1.1fr_0.9fr]">
              <div className={`min-w-0 p-4 ${CARD}`}>
                <SectionTitle icon={<Database size={14} />} title="Datenvollständigkeit" />
                <div className="mt-4 flex items-center gap-4">
                  <Donut
                    segments={[
                      { value: completionStats.covered, tone: "gold" },
                      { value: completionStats.open, tone: "zinc" },
                      { value: completionStats.conflicting, tone: "red" },
                    ]}
                    label={`${completionStats.covered}/${completionStats.total}`}
                  />
                  <div className="grid min-w-0 flex-1 grid-cols-1 gap-2">
                    <LegendRow label="Belegte Datenpunkte" value={completionStats.covered} tone="gold" />
                    <LegendRow label="Offene Datenpunkte" value={completionStats.open} tone="zinc" />
                    <LegendRow label="Widersprüchliche Datenpunkte" value={completionStats.conflicting} tone="red" />
                  </div>
                </div>
              </div>

              <div className={`min-w-0 p-4 ${CARD}`}>
                <SectionTitle icon={<CheckCircle2 size={14} />} title="CTO-Bereitschaft" />
                <div className="mt-4 space-y-2">
                  <ProgressBar value={readinessDone} total={readinessChecklist.length} tone="blue" />
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    {readinessChecklist.map((item) => (
                      <div key={item.label} className="flex min-w-0 items-center gap-2 rounded-[12px] border border-white/[0.05] bg-white/[0.02] px-3 py-2">
                        {item.done ? (
                          <CheckCircle2 size={14} className="shrink-0 text-emerald-300" />
                        ) : (
                          <CircleDashed size={14} className="shrink-0 text-white/35" />
                        )}
                        <span className="min-w-0 text-[11px] text-white/78" style={{ fontFamily: M }}>{item.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <section className="grid grid-cols-1 gap-3 xl:grid-cols-[1.05fr_0.95fr]">
              <div className={`min-w-0 p-4 ${CARD}`}>
                <SectionTitle icon={<Waypoints size={14} />} title="Statusverteilung" />
                <div className="mt-4 space-y-3">
                  <div className="flex h-3 overflow-hidden rounded-full bg-white/[0.06]">
                    {statusDistribution.map((segment) => (
                      <div
                        key={segment.label}
                        className={segmentBarClass(segment.tone)}
                        style={{ width: `${(segment.value / statusDistribution.reduce((sum, item) => sum + item.value, 0)) * 100}%` }}
                      />
                    ))}
                  </div>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    {statusDistribution.map((segment) => (
                      <LegendRow key={segment.label} label={segment.label} value={segment.value} tone={segment.tone} />
                    ))}
                  </div>
                </div>
              </div>

              <div className={`min-w-0 p-4 ${CARD}`}>
                <SectionTitle icon={<AlertTriangle size={14} />} title="Offene Punkte" />
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <MiniStat label="Offene Datenpunkte" value={INNO_OVERVIEW_METRICS[5]?.value ?? "20"} />
                  <MiniStat label="Offene Entscheidungen" value={INNO_OVERVIEW_METRICS[6]?.value ?? "9"} />
                </div>
                <div className="mt-4 space-y-2.5">
                  {topOpenPoints.slice(0, 5).map((item) => (
                    <div key={item.title} className="rounded-[14px] border border-white/[0.05] bg-white/[0.02] p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[12px] font-semibold text-white" style={{ fontFamily: M }}>{item.title}</p>
                        <StatusBadge tone={item.priority === "Kritisch" ? "red" : "blue"}>{item.priority}</StatusBadge>
                      </div>
                      <div className="mt-2 grid grid-cols-1 gap-1 text-[10px] text-white/60 md:grid-cols-2" style={{ fontFamily: M }}>
                        <span>Verantwortlich: {item.owner}</span>
                        <span>Status: {item.status}</span>
                        <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">Quelle: {item.source}</span>
                        <span>Nächste Aktion: {item.nextAction}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {INNO_STRATEGY_CARDS.map((card) => (
                <PortfolioCard key={card.id} card={card} compact />
              ))}
            </section>
          </div>
        ) : null}

        {activeSection === "portfolios" ? (
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {INNO_STRATEGY_CARDS.map((card) => (
              <PortfolioCard key={card.id} card={card} />
            ))}
          </div>
        ) : null}

        {activeSection === "track" ? (
          <div className="flex flex-col gap-3">
            <section className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {INNO_TRACK_RECORD_ROWS.map((row) => (
                <div key={row.portfolio} className={`min-w-0 p-4 ${CARD}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <SectionTitle icon={<BriefcaseBusiness size={14} />} title={row.portfolio} />
                      <p className="mt-2 text-[12px] text-white/68" style={{ fontFamily: M }}>{row.zeitraum}</p>
                    </div>
                    <StatusBadge tone={row.portfolio.includes("Tactical") ? "gold" : "blue"}>
                      {row.echtgeldstatus}
                    </StatusBadge>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 2xl:grid-cols-4">
                    <TrackMetric label="Gesamtperformance" value={row.performance} warn={false} />
                    <TrackMetric label="Annualisierte Rendite" value={row.annualisierung} warn={row.annualisierung.includes("nachgerechnet")} />
                    <TrackMetric label="Max. Drawdown" value={row.drawdown} warn={false} />
                    <TrackMetric label="Sharpe" value={row.sharpe} warn={false} />
                    <TrackMetric label="Calmar" value={row.calmar} warn={false} />
                    <TrackMetric label="Volatilität" value={row.volatilitaet} warn={row.volatilitaet === "Nicht gefunden"} />
                    <TrackMetric label="Profit Factor" value={row.profitFactor} warn={false} />
                    <TrackMetric label="Trefferquote" value={row.trefferquote} warn={row.trefferquote === "Nicht gefunden"} />
                  </div>
                </div>
              ))}
            </section>

            <section className="grid grid-cols-1 gap-3 xl:grid-cols-3">
              {["Equity-Kurve", "Drawdown-Verlauf", "Monatliche Renditeübersicht"].map((label) => (
                <div key={label} className={`min-w-0 p-4 ${CARD}`}>
                  <SectionTitle icon={<FileSearch size={14} />} title={label} />
                  <EmptyState text="Für diese Darstellung fehlen derzeit die monatlichen Rohdaten." />
                </div>
              ))}
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
            <div className={`min-w-0 p-4 ${CARD}`}>
              <SectionTitle icon={<Boxes size={14} />} title="Instrumentenmatrix" />
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[920px] table-fixed">
                  <thead>
                    <tr className="border-b border-white/[0.06] text-left text-[10px] text-white/42" style={{ fontFamily: M }}>
                      {["Instrument", "Typ", "Börse", "Status", "Kontraktgröße", "Mindestdepot", "Marktdaten", "CTO-Prüfung"].map((label) => (
                        <th key={label} className="px-3 py-2 font-semibold">{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {INNO_IBKR_ROWS.map((row) => (
                      <tr key={row.instrument} className="border-b border-white/[0.04] align-top">
                        <Cell>{row.instrument}</Cell>
                        <Cell>{row.product}</Cell>
                        <Cell>{row.venue}</Cell>
                        <Cell><StatusBadge tone="gold">Geplant · Prüfung erforderlich</StatusBadge></Cell>
                        <Cell>{row.contract}</Cell>
                        <Cell>{row.margin}</Cell>
                        <Cell>Offen</Cell>
                        <Cell>{row.status}</Cell>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className={`min-w-0 p-4 ${CARD}`}>
              <SectionTitle icon={<Link2 size={14} />} title="Technische Prozessgrafik" />
              <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-5">
                {["Capitalife-Strategie", "Trading Engine", "INNO / IBKR-Anbindung", "Kundendepots", "Monitoring & Reporting"].map((step, index, array) => (
                  <div key={step} className="flex min-w-0 items-center gap-3 xl:flex-col xl:items-stretch">
                    <div className="flex min-w-0 flex-1 items-center justify-center rounded-[16px] border border-white/[0.06] bg-white/[0.03] px-4 py-4 text-center text-[12px] text-white/84" style={{ fontFamily: M }}>
                      {step}
                    </div>
                    {index < array.length - 1 ? <ChevronRight className="shrink-0 text-[color:var(--dash-accent)] xl:mx-auto xl:rotate-90" size={16} /> : null}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {activeSection === "cto" ? (
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-[0.9fr_1.1fr]">
            <div className={`min-w-0 p-4 ${CARD}`}>
              <SectionTitle icon={<FileText size={14} />} title="Meeting Brief" />
              <div className="mt-4 space-y-2">
                {INNO_MEETING_BRIEF.map((line) => (
                  <div key={line} className="rounded-[14px] border border-white/[0.05] bg-white/[0.02] px-3 py-2.5 text-[12px] text-white/82" style={{ fontFamily: M }}>
                    {line}
                  </div>
                ))}
              </div>
            </div>

            <div className={`min-w-0 p-4 ${CARD}`}>
              <SectionTitle icon={<AlertTriangle size={14} />} title="Priorisierte Punkte und Entscheidungen" />
              <div className="mt-4 space-y-2.5">
                {topOpenPoints.map((item, index) => (
                  <div key={`${item.title}-${index}`} className="rounded-[14px] border border-white/[0.05] bg-white/[0.02] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[12px] font-semibold text-white" style={{ fontFamily: M }}>{item.title}</p>
                      <StatusBadge tone={item.priority === "Kritisch" ? "red" : item.priority === "Vor Gespräch" ? "blue" : "zinc"}>
                        {item.priority}
                      </StatusBadge>
                    </div>
                    <div className="mt-2 grid grid-cols-1 gap-1 text-[10px] text-white/62 md:grid-cols-2" style={{ fontFamily: M }}>
                      <span>Verantwortlich: {item.owner}</span>
                      <span>Status: {item.status}</span>
                      <span className="min-w-0 break-words">Quelle: {item.source}</span>
                      <span>Nächste Aktion: {item.nextAction}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {activeSection === "sources" ? (
          <div className={`min-w-0 p-4 ${CARD}`}>
            <SectionTitle icon={<Database size={14} />} title="Quellenregister" />
            <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-[1.3fr_0.7fr_0.7fr]">
              <input
                value={sourceQuery}
                onChange={(event) => setSourceQuery(event.target.value)}
                placeholder="Quelle oder Pfad suchen"
                className="min-w-0 rounded-[14px] border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[12px] text-white outline-none placeholder:text-white/28"
                style={{ fontFamily: M }}
              />
              <select
                value={sourceType}
                onChange={(event) => setSourceType(event.target.value)}
                className="min-w-0 rounded-[14px] border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[12px] text-white outline-none"
                style={{ fontFamily: M }}
              >
                {sourceTypes.map((option) => <option key={option} value={option} className="bg-[#151618]">{option}</option>)}
              </select>
              <select
                value={sourcePortfolio}
                onChange={(event) => setSourcePortfolio(event.target.value)}
                className="min-w-0 rounded-[14px] border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[12px] text-white outline-none"
                style={{ fontFamily: M }}
              >
                {sourcePortfolios.map((option) => <option key={option} value={option} className="bg-[#151618]">{option}</option>)}
              </select>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[920px] table-fixed">
                <thead>
                  <tr className="border-b border-white/[0.06] text-left text-[10px] text-white/42" style={{ fontFamily: M }}>
                    {["Quelle", "Datenart", "Portfolio", "Zeitraum", "Update", "Qualität"].map((label) => (
                      <th key={label} className="px-3 py-2 font-semibold">{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sourceRows.map((source) => (
                    <tr key={source.path} className="border-b border-white/[0.04] align-top">
                      <Cell>
                        <details className="group">
                          <summary className="cursor-pointer list-none text-white">
                            <span className="font-semibold">{source.label}</span>
                          </summary>
                          <div className="mt-2 space-y-1 text-[10px] text-white/64">
                            <a href={source.path} className="break-words text-[color:var(--dash-accent)] underline underline-offset-2">
                              {source.path}
                            </a>
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

function PortfolioCard({ card, compact = false }: { card: (typeof INNO_STRATEGY_CARDS)[number]; compact?: boolean }) {
  const objective = card.rows.find((row) => row.key === "Ziel")?.value ?? "Nicht gefunden";
  const badgeTone = card.badgeTone;
  const matrixKeys = ["Datenart", "Track-Record-Status", "Tradingfrequenz", "Haltedauer", "Anzahl Assets", "Parallele Positionen", "Geplante Gewichtung", "Instrumententypen"];
  const rows = matrixKeys.map((key) => {
    const found = card.rows.find((row) => row.key === key);
    return { key, value: found?.value ?? (key === "Instrumententypen" ? (card.id === "tactical" ? "Futures / FX" : "ETF / Asset-Allokationen") : "Nicht gefunden"), source: found?.source ?? "Auftragsvorgabe" };
  });
  const notes = [
    { label: "Belegt", text: card.badge, tone: badgeTone },
    { label: "Offen", text: card.rows.find((row) => row.key === "Offene Pruefungen")?.value ?? "Nicht gefunden", tone: "zinc" as const },
    { label: "INNO-Prüfung", text: "Broker-, Risiko- und Gebührenparität bestätigen", tone: "blue" as const },
  ];

  return (
    <div className={`min-w-0 p-4 ${CARD}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[22px] font-bold text-white" style={{ fontFamily: N }}>{card.title}</h3>
          <p className="mt-1 text-[12px] text-white/66" style={{ fontFamily: M }}>{objective}</p>
        </div>
        <StatusBadge tone={badgeTone}>{card.badge}</StatusBadge>
      </div>

      <div className={`mt-4 grid min-w-0 gap-3 ${compact ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1 md:grid-cols-2"}`}>
        {rows.map((row) => (
          <div key={row.key} className="min-w-0 rounded-[14px] border border-white/[0.05] bg-white/[0.02] px-3 py-2.5">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[10px] text-white/42" style={{ fontFamily: M }}>{row.key}</p>
              <SourcePill source={row.source} />
            </div>
            <p className="mt-1 break-words text-[12px] text-white/82" style={{ fontFamily: M }}>{row.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2">
        {notes.map((note) => (
          <div key={note.label} className="flex min-w-0 items-start gap-3 rounded-[14px] border border-white/[0.05] bg-white/[0.02] px-3 py-2.5">
            <StatusDot tone={note.tone} />
            <div className="min-w-0">
              <p className="text-[10px] text-white/42" style={{ fontFamily: M }}>{note.label}</p>
              <p className="break-words text-[11px] text-white/78" style={{ fontFamily: M }}>{note.text}</p>
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
    <div className={`min-w-0 p-4 ${CARD}`}>
      <SectionTitle icon={icon} title={title} />
      <div className="mt-4 space-y-2.5">
        {rows.map((row) => (
          <div key={row.label} className="rounded-[14px] border border-white/[0.05] bg-white/[0.02] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[12px] font-semibold text-white" style={{ fontFamily: M }}>{row.label}</p>
              <StatusBadge tone={toneFromStatus(row.status)}>{row.status}</StatusBadge>
            </div>
            <p className="mt-2 break-words text-[11px] text-white/78" style={{ fontFamily: M }}>{row.value}</p>
            <p className="mt-1 break-words text-[10px] text-white/38" style={{ fontFamily: M }}>{row.source}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="mt-4 flex min-h-[220px] items-center justify-center rounded-[16px] border border-dashed border-white/[0.08] bg-white/[0.02] px-6 text-center text-[12px] text-white/58" style={{ fontFamily: M }}>
      {text}
    </div>
  );
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[color:var(--dash-accent)]">{icon}</span>
      <p className="text-[12px] font-semibold text-white" style={{ fontFamily: M }}>{title}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[14px] border border-white/[0.05] bg-white/[0.02] p-3">
      <p className="text-[10px] text-white/42" style={{ fontFamily: M }}>{label}</p>
      <p className="mt-1 text-[18px] font-bold text-white" style={{ fontFamily: N }}>{value}</p>
    </div>
  );
}

function TrackMetric({ label, value, warn }: { label: string; value: string; warn: boolean }) {
  return (
    <div className="rounded-[14px] border border-white/[0.05] bg-white/[0.02] p-3">
      <div className="flex items-center gap-1.5">
        <p className="text-[10px] text-white/42" style={{ fontFamily: M }}>{label}</p>
        {warn ? <CircleAlert size={12} className="text-rose-300" /> : null}
      </div>
      <p className="mt-1 break-words text-[13px] font-semibold text-white" style={{ fontFamily: M }}>{value}</p>
    </div>
  );
}

function ProgressBar({ value, total, tone }: { value: number; total: number; tone: InnoStatusTone }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
      <div className={`h-full ${segmentBarClass(tone)}`} style={{ width: `${(value / total) * 100}%` }} />
    </div>
  );
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
    <div
      className="relative flex h-28 w-28 shrink-0 items-center justify-center rounded-full"
      style={{ background: `conic-gradient(${gradient})` }}
    >
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#17181b] text-[15px] font-bold text-white" style={{ fontFamily: N }}>
        {label}
      </div>
    </div>
  );
}

function LegendRow({ label, value, tone }: { label: string; value: number; tone: InnoStatusTone }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[12px] border border-white/[0.05] bg-white/[0.02] px-3 py-2">
      <div className="flex items-center gap-2">
        <StatusDot tone={tone} />
        <span className="text-[11px] text-white/76" style={{ fontFamily: M }}>{label}</span>
      </div>
      <span className="text-[12px] font-semibold text-white" style={{ fontFamily: N }}>{value}</span>
    </div>
  );
}

function SourcePill({ source }: { source: string }) {
  return (
    <span
      title={source}
      className="inline-flex shrink-0 items-center rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-[9px] text-white/52"
      style={{ fontFamily: M }}
    >
      Quelle
    </span>
  );
}

function StatusBadge({ children, tone }: { children: React.ReactNode; tone: InnoStatusTone }) {
  return (
    <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${badgeClass(tone)}`} style={{ fontFamily: M }}>
      {children}
    </span>
  );
}

function StatusDot({ tone }: { tone: InnoStatusTone }) {
  return <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${segmentBarClass(tone)}`} />;
}

function Cell({ children }: { children: React.ReactNode }) {
  return (
    <td className="px-3 py-3 text-[11px] text-white/78 [overflow-wrap:anywhere]" style={{ fontFamily: M }}>
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

function toneClass(tone: InnoStatusTone) {
  if (tone === "gold") return "text-[color:var(--dash-accent)]";
  if (tone === "blue") return "text-sky-300";
  if (tone === "red") return "text-rose-300";
  return "text-white";
}

function badgeClass(tone: InnoStatusTone) {
  if (tone === "gold") return "border-[color:var(--dash-accent)]/30 bg-[color:var(--dash-accent)]/10 text-[color:var(--dash-accent)]";
  if (tone === "blue") return "border-sky-400/25 bg-sky-400/10 text-sky-300";
  if (tone === "red") return "border-rose-400/25 bg-rose-400/10 text-rose-300";
  return "border-white/[0.08] bg-white/[0.04] text-white/60";
}

function segmentBarClass(tone: InnoStatusTone) {
  if (tone === "gold") return "bg-[color:var(--dash-accent)]";
  if (tone === "blue") return "bg-sky-400";
  if (tone === "red") return "bg-rose-400";
  return "bg-white/35";
}

function toneColor(tone: InnoStatusTone) {
  if (tone === "gold") return "#e2ca7a";
  if (tone === "blue") return "#38bdf8";
  if (tone === "red") return "#fb7185";
  return "#71717a";
}
