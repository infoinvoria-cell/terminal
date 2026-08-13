"use client";

import { useMemo, useState } from "react";
import type { ComponentType, CSSProperties, KeyboardEvent, ReactNode } from "react";
import {
  Building2,
  Cable,
  ChevronDown,
  FileSpreadsheet,
  Handshake,
  Lock,
  Radar,
  Shield,
  Target,
  Workflow,
} from "lucide-react";
import { INNO_PREP_STATUS_STRIP } from "@/lib/about/inno-preparation-page-data";
import type { TrackRecordOverview } from "@/lib/track-record/types";

const FONT = `"Open Sans", var(--font-text, system-ui), sans-serif`;
const BG = "#0B0C0F";
const PANEL = "linear-gradient(180deg, rgba(19,21,26,0.98) 0%, rgba(11,12,15,0.995) 100%)";
const SOFT = "rgba(255,255,255,0.018)";
const BORDER = "rgba(255,255,255,0.058)";
const DIVIDER = "rgba(255,255,255,0.05)";
const TEXT = "#F5F7FA";
const TEXT_BODY = "rgba(223,228,235,0.86)";
const TEXT_META = "rgba(188,196,205,0.76)";
const TEXT_DIM = "rgba(144,152,162,0.72)";

type CallStatus = "READY" | "TEILWEISE" | "PROTOTYP" | "OFFEN";

type StatusItem = {
  title: string;
  status: CallStatus;
  note: string;
  icon: ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
};

type MetricItem = {
  label: string;
  value: string;
};

type QaItem = {
  no: string;
  question: string;
  bullets: string[];
  keyInfo: string;
  column: "left" | "right";
};

type Model = {
  statusItems: StatusItem[];
  metricItems: MetricItem[];
  have: string[];
  missing: string[];
  qaItems: QaItem[];
};

const STATUS_ICONS: Record<string, StatusItem["icon"]> = {
  Strategie: Target,
  "Track Record": FileSpreadsheet,
  Technik: Cable,
  CTO: Handshake,
};

function formatPct(value: number | null | undefined, digits = 2) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "offen";
  return `${value.toFixed(digits).replace(".", ",")} %`;
}

function formatNumber(value: number | null | undefined, digits = 2) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "offen";
  return value.toFixed(digits).replace(".", ",");
}

function formatHours(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "offen";
  return `${value.toFixed(2).replace(".", ",")} h`;
}

function metricNumber(overview: TrackRecordOverview, name: string) {
  const value = overview.live.metrics.find((metric) => metric.metricName === name)?.metricValue;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function panel(extra?: CSSProperties): CSSProperties {
  return {
    borderRadius: 20,
    border: `1px solid ${BORDER}`,
    background: PANEL,
    boxShadow: "0 18px 40px -30px rgba(0,0,0,0.9)",
    ...extra,
  };
}

function badge(status: CallStatus): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "3px 8px",
    borderRadius: 999,
    border: `1px solid ${BORDER}`,
    background: "rgba(255,255,255,0.028)",
    color: TEXT_BODY,
    fontSize: 9.5,
    fontWeight: 800,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  };
}

function buildModel(overview: TrackRecordOverview): Model {
  const account1 = overview.historical.account1;
  const reportedAnnualized =
    metricNumber(overview, "annualized_return_reported_pct") ?? overview.historical.official.annualizedReturnPct;
  const recalculatedAnnualized = metricNumber(overview, "annualized_return_recalculated_pct");

  const statusItems: StatusItem[] = INNO_PREP_STATUS_STRIP.map((item) => ({
    title: item.title,
    status: item.status === "ZU KLAREN" ? "OFFEN" : (item.status as CallStatus),
    note:
      item.title === "Strategie"
        ? "Regelwerk und Ground Truth vorhanden"
        : item.title === "Track Record"
          ? "Account 1 primär belegt · Gesamt-Scope offen"
          : item.title === "Technik"
            ? "Runtime vorhanden · Produktionsschicht offen"
            : "Kernfragen und Zielbild vorbereitet",
    icon: STATUS_ICONS[item.title] ?? Target,
  }));

  const metricItems: MetricItem[] = [
    { label: "Report", value: overview.historical.baselinePeriod },
    { label: "Monate", value: String(overview.historical.monthlyReturnCount) },
    { label: "Account 1", value: `${account1.totalClosedTrades} Trades` },
    { label: "Win Rate", value: formatPct(account1.winRatePct) },
    { label: "Profit Factor", value: formatNumber(account1.profitFactor, 4) },
    { label: "Ø Haltedauer", value: formatHours(account1.avgHoldHours) },
    { label: "Report p.a.", value: formatPct(reportedAnnualized, 1) },
    { label: "Nachrechnung", value: formatPct(recalculatedAnnualized, 2) },
  ];

  const qaItems: QaItem[] = [
    {
      no: "01",
      question: "Wie sieht Ihr aktuelles IT-Setup aus?",
      bullets: [
        "Eigenes Capitalife Terminal in Entwicklung",
        "Historische Daten, Strategien und Monitoring integriert",
        "Vieles aktuell noch Research / Paper",
        "Nächster Schritt: Futures- und Live-Daten",
      ],
      keyInfo: "Technische Basis vorhanden, Produktionssystem noch nicht.",
      column: "left",
    },
    {
      no: "02",
      question: "Wie soll die Zielarchitektur aussehen?",
      bullets: [
        "Daten empfangen",
        "Signal erzeugen",
        "Risiko prüfen",
        "Order freigeben",
        "An Broker senden",
        "Danach überwachen",
      ],
      keyInfo: "Daten → Signal → Risiko → Freigabe → Broker → Monitoring",
      column: "left",
    },
    {
      no: "03",
      question: "Welche Broker-/API-Struktur möchten Sie?",
      bullets: [
        "IBKR ist unser bevorzugtes Zielbild",
        "Noch kein produktives Firmenkonto",
        "Account- und API-Struktur mit INNO klären",
      ],
      keyInfo: "IBKR bevorzugt, aber noch nicht final bestätigt.",
      column: "left",
    },
    {
      no: "04",
      question: "Ist die IBKR-Anbindung bereits fertig?",
      bullets: [
        "Nein, noch nicht produktiv",
        "Erste API-Tests wurden gemacht",
        "Live-Integration erst nach finaler Struktur",
      ],
      keyInfo: "Vorarbeit vorhanden, Live-Anbindung fehlt.",
      column: "left",
    },
    {
      no: "05",
      question: "Soll das System vollautomatisch handeln?",
      bullets: [
        "Kurzfristige Strategien möglichst automatisch",
        "Langfristige Signale auch mit Bestätigung denkbar",
        "Monitoring bleibt immer aktiv",
        "Finalen Automatisierungsgrad mit INNO festlegen",
      ],
      keyInfo: "Automatisieren, aber kontrolliert.",
      column: "left",
    },
    {
      no: "06",
      question: "Was wäre das konkrete IT-Projekt?",
      bullets: [
        "Kein neues Research-System bauen",
        "Bestehende Technik produktionsfähig machen",
        "Broker/API, Risiko und Orderfreigabe integrieren",
        "Logging und Reconciliation ergänzen",
      ],
      keyInfo: "Fokus ist die institutionelle Produktionsschicht.",
      column: "left",
    },
    {
      no: "07",
      question: "Was können Sie selbst liefern und was brauchen Sie von INNO?",
      bullets: [
        "Wir liefern: Strategie",
        "Wir liefern: Signale",
        "Wir liefern: Datenlogik",
        "Wir liefern: Terminal / Monitoring",
        "Von INNO: Broker-/API-Rahmen",
        "Von INNO: Risikovorgaben",
        "Von INNO: Freigaberegeln",
        "Von INNO: Betriebsanforderungen",
      ],
      keyInfo: "Wir liefern die Basis, INNO den institutionellen Rahmen.",
      column: "left",
    },
    {
      no: "08",
      question: "Wo soll das System gehostet werden?",
      bullets: [
        "Externer VPS / Cloud ist aktuell denkbar",
        "Dauerhafter Betrieb und Monitoring",
        "Zugriffe und Credentials kontrollieren",
        "Anforderungen mit INNO abstimmen",
      ],
      keyInfo: "Hosting technisch lösbar, Vorgaben noch offen.",
      column: "left",
    },
    {
      no: "09",
      question: "Was passiert bei Daten- oder API-Fehlern?",
      bullets: [
        "Keine neue Order",
        "Fehler wird gemeldet",
        "Weiter erst nach sauberem Systemzustand",
      ],
      keyInfo: "Fail-closed: lieber kein Trade als ein falscher Trade.",
      column: "right",
    },
    {
      no: "10",
      question: "Wie verhindern Sie doppelte oder falsche Orders?",
      bullets: [
        "Eindeutige Signal- und Order-ID",
        "Vor Ausführung Status prüfen",
        "Brokerstatus abgleichen",
      ],
      keyInfo: "IDs + Reconciliation verhindern Doppelorders.",
      column: "right",
    },
    {
      no: "11",
      question: "Welche Risikologik existiert bereits?",
      bullets: [
        "Gewichtungen für Strategien vorhanden",
        "Sizing- und Risk-Logik vorbereitet",
        "Exposure / Drawdown berücksichtigt",
        "Finale Institutslimits fehlen",
      ],
      keyInfo: "Interne Risk-Logik vorhanden, Institutslimits noch offen.",
      column: "right",
    },
    {
      no: "12",
      question: "Welche Risikolimits möchten Sie festlegen?",
      bullets: [
        "Risiko pro Trade",
        "Gesamt-Exposure",
        "Drawdown",
        "Positions-/Sleeve-Limits",
        "Stops / Kill Switch",
      ],
      keyInfo: "Limits sollen zur getesteten Strategie passen.",
      column: "right",
    },
    {
      no: "13",
      question: "Was passiert bei einer Limitverletzung?",
      bullets: [
        "Neue Orders blockieren",
        "Meldung erzeugen",
        "Risiko reduzieren oder Trading stoppen",
        "Danach kontrolliert wieder freigeben",
      ],
      keyInfo: "Limit verletzt → Blockierung → Prüfung → Freigabe.",
      column: "right",
    },
    {
      no: "14",
      question: "Wer darf Risikoparameter ändern?",
      bullets: [
        "Nur rollenbasiert",
        "Änderungen protokollieren",
        "Kritische Parameter nicht frei änderbar",
        "Rechte mit INNO festlegen",
      ],
      keyInfo: "Kontrolliert und nachvollziehbar ändern.",
      column: "right",
    },
    {
      no: "15",
      question: "Wer betreibt und überwacht das System?",
      bullets: [
        "Technische Hauptverantwortung bei mir",
        "Team überwacht Terminal und Signale mit",
        "Rollen und Zuständigkeiten mit INNO festlegen",
      ],
      keyInfo: "Wir betreiben operativ, Verantwortlichkeiten müssen klar geregelt sein.",
      column: "right",
    },
    {
      no: "16",
      question: "Was brauchen Sie konkret von INNO?",
      bullets: [
        "Broker-/API-Struktur",
        "Automatisierungsgrad",
        "Orderfreigabe",
        "Risikolimits",
        "Hosting / Betrieb",
        "Audit / Reconciliation",
        "Go-Live-Prozess",
      ],
      keyInfo: "Wir haben Strategie und Technikbasis – INNO soll mit uns den institutionellen Produktionsrahmen festlegen.",
      column: "right",
    },
  ];

  return {
    statusItems,
    metricItems,
    have: [
      "Strategie / Ground Truth",
      "Performance Report",
      "Account-1-Primärhistorie",
      "Runtime / Monitoring",
    ],
    missing: [
      "Gesamt-Evidenz",
      "Gesamt-Kostenmethodik",
      "Finale Institutslimits",
      "Produktiver Broker-/API-Pfad",
    ],
    qaItems,
  };
}

function BulletList({ items }: { items: string[] }) {
  return (
    <div style={{ display: "grid", gap: 2 }}>
      {items.map((item) => (
        <div key={item} style={{ display: "grid", gridTemplateColumns: "9px minmax(0,1fr)", gap: 6 }}>
          <div style={{ color: TEXT_META, fontSize: 10.5, lineHeight: 1.15 }}>•</div>
          <div style={{ color: TEXT_BODY, fontSize: 12.4, lineHeight: 1.22 }}>{item}</div>
        </div>
      ))}
    </div>
  );
}

function QaAccordionColumn({
  title,
  items,
  activeNo,
  onToggle,
  testId,
}: {
  title: string;
  items: QaItem[];
  activeNo: string | null;
  onToggle: (no: string) => void;
  testId: string;
}) {
  return (
    <div data-testid={testId} style={{ display: "grid", alignContent: "start" }}>
      <div style={{ color: TEXT_DIM, fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>
        {title}
      </div>
      <div style={{ display: "grid" }}>
        {items.map((item) => {
          const expanded = activeNo === item.no;
          return (
            <div key={item.no} style={{ borderBottom: `1px solid ${DIVIDER}` }}>
              <button
                type="button"
                className="inno-qa-toggle"
                data-testid={`qa-toggle-${item.no}`}
                aria-expanded={expanded}
                onClick={() => onToggle(item.no)}
                onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onToggle(item.no);
                  }
                }}
                style={{
                  width: "100%",
                  background: "transparent",
                  border: "none",
                  padding: "10px 0",
                  display: "grid",
                  gridTemplateColumns: "28px minmax(0,1fr) 18px",
                  gap: 8,
                  alignItems: "center",
                  textAlign: "left",
                  cursor: "pointer",
                  color: TEXT,
                  outline: "none",
                  borderRadius: 8,
                }}
              >
                <span style={{ color: TEXT_DIM, fontSize: 10.5, fontWeight: 800, letterSpacing: "0.08em" }}>{item.no}</span>
                <span style={{ fontSize: 13.2, fontWeight: 700, lineHeight: 1.18 }}>{item.question}</span>
                <ChevronDown
                  size={14}
                  color={TEXT_META}
                  style={{
                    transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
                    transition: "transform 140ms ease",
                  }}
                />
              </button>
              {expanded ? (
                <div
                  data-testid={`qa-panel-${item.no}`}
                  style={{
                    padding: "0 0 10px 36px",
                    display: "grid",
                    gap: 6,
                  }}
                >
                  <BulletList items={item.bullets} />
                  <div style={{ display: "grid", gap: 2 }}>
                    <div style={{ color: TEXT, fontSize: 11.3, fontWeight: 700, lineHeight: 1.16 }}>Key Info</div>
                    <div style={{ color: TEXT_META, fontSize: 12.1, fontWeight: 600, lineHeight: 1.2 }}>{item.keyInfo}</div>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DesktopLayout({ overview }: { overview: TrackRecordOverview }) {
  const model = useMemo(() => buildModel(overview), [overview]);
  const [leftOpen, setLeftOpen] = useState<string | null>(null);
  const [rightOpen, setRightOpen] = useState<string | null>(null);

  const leftItems = model.qaItems.filter((item) => item.column === "left");
  const rightItems = model.qaItems.filter((item) => item.column === "right");

  return (
    <div
      style={{
        height: "100%",
        minHeight: "100%",
        background: BG,
        color: TEXT,
        fontFamily: FONT,
        padding: "8px 10px 8px 12px",
        boxSizing: "border-box",
      }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "29% minmax(0,71%)", gap: 8, height: "100%", minHeight: 0 }}>
        <section data-testid="inno-left-column" style={{ display: "grid", gap: 6, alignContent: "start", minHeight: 0 }}>
          <div style={panel({ padding: "9px", display: "grid", gap: 7 })}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 6 }}>
              {model.statusItems.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} style={{ borderRadius: 13, border: `1px solid ${BORDER}`, background: SOFT, padding: "7px 8px", display: "grid", gap: 4 }}>
                    <div style={{ display: "flex", alignItems: "start", justifyContent: "space-between", gap: 7 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                        <Icon size={12.5} color={TEXT_BODY} strokeWidth={1.85} />
                        <div style={{ color: TEXT, fontSize: 13.1, fontWeight: 700 }}>{item.title}</div>
                      </div>
                      <span style={badge(item.status)}>{item.status}</span>
                    </div>
                    <div style={{ color: TEXT_META, fontSize: 11.9, lineHeight: 1.18 }}>{item.note}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={panel({ padding: "9px", display: "grid", gap: 6 })}>
            <div style={{ color: TEXT_DIM, fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase" }}>Kernzahlen</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 6 }}>
              {model.metricItems.map((item) => (
                <div key={item.label} style={{ borderRadius: 12, border: `1px solid ${BORDER}`, background: SOFT, padding: "7px 8px", display: "grid", gap: 2 }}>
                  <div style={{ color: TEXT_DIM, fontSize: 9.5, fontWeight: 800, letterSpacing: "0.07em", textTransform: "uppercase" }}>{item.label}</div>
                  <div style={{ color: TEXT, fontSize: 13.5, fontWeight: 700, lineHeight: 1.12 }}>{item.value}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={panel({ padding: "9px", display: "grid", gap: 6 })}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 8 }}>
              <div>
                <div style={{ color: TEXT_DIM, fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 5 }}>Haben</div>
                <BulletList items={model.have} />
              </div>
              <div>
                <div style={{ color: TEXT_DIM, fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 5 }}>Fehlt</div>
                <BulletList items={model.missing} />
              </div>
            </div>
          </div>
        </section>

        <section
          data-testid="inno-qa-box"
          style={panel({
            padding: "10px 12px",
            display: "grid",
            gridTemplateRows: "auto minmax(0,1fr)",
            gap: 8,
            minHeight: 0,
          })}
        >
          <div style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", opacity: 0, pointerEvents: "none" }}>
            TRACK-RECORD-SCOPE
          </div>
          <div style={{ color: TEXT, fontSize: 18, fontWeight: 700, lineHeight: 1.08 }}>Fragen für den CTO-Call</div>

          <div
            style={{
              minHeight: 0,
              overflowY: "auto",
              overflowX: "hidden",
              display: "grid",
              gridTemplateColumns: "minmax(0,1fr) 1px minmax(0,1fr)",
              gap: 14,
            }}
          >
            <QaAccordionColumn
              title="01–08"
              items={leftItems}
              activeNo={leftOpen}
              onToggle={(no) => setLeftOpen((current) => (current === no ? null : no))}
              testId="qa-left-column"
            />
            <div aria-hidden="true" style={{ width: 1, background: DIVIDER }} />
            <QaAccordionColumn
              title="09–16"
              items={rightItems}
              activeNo={rightOpen}
              onToggle={(no) => setRightOpen((current) => (current === no ? null : no))}
              testId="qa-right-column"
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function MobileAccordion({
  item,
  expanded,
  onToggle,
}: {
  item: QaItem;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div style={{ borderBottom: `1px solid ${DIVIDER}` }}>
      <button
        type="button"
        className="inno-qa-toggle"
        aria-expanded={expanded}
        onClick={onToggle}
        style={{
          width: "100%",
          background: "transparent",
          border: "none",
          padding: "10px 0",
          display: "grid",
          gridTemplateColumns: "28px minmax(0,1fr) 18px",
          gap: 8,
          alignItems: "center",
          textAlign: "left",
          color: TEXT,
        }}
      >
        <span style={{ color: TEXT_DIM, fontSize: 10.5, fontWeight: 800, letterSpacing: "0.08em" }}>{item.no}</span>
        <span style={{ fontSize: 13.2, fontWeight: 700, lineHeight: 1.18 }}>{item.question}</span>
        <ChevronDown
          size={14}
          color={TEXT_META}
          style={{
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 140ms ease",
          }}
        />
      </button>
      {expanded ? (
        <div style={{ padding: "0 0 10px 36px", display: "grid", gap: 6 }}>
          <BulletList items={item.bullets} />
          <div style={{ display: "grid", gap: 2 }}>
            <div style={{ color: TEXT, fontSize: 11.3, fontWeight: 700, lineHeight: 1.16 }}>Key Info</div>
            <div style={{ color: TEXT_META, fontSize: 12.1, fontWeight: 600, lineHeight: 1.2 }}>{item.keyInfo}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MobileLayout({ overview }: { overview: TrackRecordOverview }) {
  const model = useMemo(() => buildModel(overview), [overview]);
  const [openNo, setOpenNo] = useState<string | null>(null);

  return (
    <div
      style={{
        background: BG,
        color: TEXT,
        fontFamily: FONT,
        padding: "10px 10px 22px",
        display: "grid",
        gap: 10,
      }}
    >
      <div style={panel({ padding: "10px", display: "grid", gap: 8 })}>
        <div style={{ color: TEXT, fontSize: 18, fontWeight: 700, lineHeight: 1.08 }}>Fragen für den CTO-Call</div>
        <div style={{ display: "grid" }}>
          {model.qaItems.map((item) => (
            <MobileAccordion
              key={item.no}
              item={item}
              expanded={openNo === item.no}
              onToggle={() => setOpenNo((current) => (current === item.no ? null : item.no))}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function InnoPreparationContent({
  trackRecordOverview,
  mobile = false,
}: {
  trackRecordOverview?: TrackRecordOverview;
  mobile?: boolean;
}) {
  if (!trackRecordOverview) {
    return (
      <div
        style={{
          height: "100%",
          display: "grid",
          placeItems: "center",
          background: BG,
          color: TEXT_BODY,
          fontFamily: FONT,
        }}
      >
        INNO-Daten werden geladen...
      </div>
    );
  }

  return mobile ? <MobileLayout overview={trackRecordOverview} /> : <DesktopLayout overview={trackRecordOverview} />;
}
