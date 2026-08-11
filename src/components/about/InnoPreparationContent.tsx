"use client";

import type { CSSProperties } from "react";
import {
  CheckCircle2,
  CircleDashed,
  ClipboardCheck,
  FileSpreadsheet,
  Handshake,
  Landmark,
  MessageSquare,
  Network,
  Plug,
  Receipt,
  Server,
  Shield,
  Target,
} from "lucide-react";
import { COLORS } from "@/lib/design-tokens";
import type { TrackRecordOverview } from "@/lib/track-record/types";
import {
  INNO_PREP_ANSWER_PROMPTS,
  INNO_PREP_FLOW,
  INNO_PREP_HAVE_CARD,
  INNO_PREP_INNO_PROMPTS,
  INNO_PREP_MISSING_CARD,
  INNO_PREP_STATUS_STRIP,
  INNO_PREP_TERM_TASKS,
  type InnoPrepStatus,
} from "@/lib/about/inno-preparation-page-data";

const OPEN_SANS = `"Open Sans", var(--font-text, system-ui), sans-serif`;
const PAGE_BG = COLORS.PAGE_BG;
const PANEL_BG = "linear-gradient(180deg, rgba(24,25,29,0.92) 0%, rgba(11,12,15,0.96) 100%)";
const PANEL_BG_SOFT = "linear-gradient(180deg, rgba(20,21,25,0.86) 0%, rgba(11,12,15,0.92) 100%)";
const BORDER = COLORS.BORDER;
const DIVIDER = "rgba(255,255,255,0.05)";
const TEXT = COLORS.TEXT_PRIMARY;
const TEXT_SOFT = "rgba(226,232,241,0.86)";
const TEXT_MUTED = COLORS.TEXT_MUTED;
const TEXT_DIM = "rgba(180,192,210,0.48)";
const GOLD = COLORS.GOLD;
const GOLD_SOFT = "rgba(214,178,74,0.14)";
const GREEN = "rgba(74,222,128,0.92)";
const GREEN_SOFT = "rgba(74,222,128,0.12)";
const RED = "rgba(248,113,113,0.92)";
const RED_SOFT = "rgba(248,113,113,0.11)";
const BLUE = "rgba(147,197,253,0.9)";
const BLUE_SOFT = "rgba(147,197,253,0.12)";

type IconType = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

const STATUS_META: Record<InnoPrepStatus, { color: string; bg: string; border: string; icon: IconType }> = {
  READY: { color: GREEN, bg: GREEN_SOFT, border: "rgba(74,222,128,0.24)", icon: CheckCircle2 },
  TEILWEISE: { color: GOLD, bg: GOLD_SOFT, border: "rgba(214,178,74,0.22)", icon: CircleDashed },
  PROTOTYP: { color: BLUE, bg: BLUE_SOFT, border: "rgba(147,197,253,0.22)", icon: CircleDashed },
  OFFEN: { color: RED, bg: RED_SOFT, border: "rgba(248,113,113,0.22)", icon: CircleDashed },
  "ZU KLAREN": { color: GOLD, bg: GOLD_SOFT, border: "rgba(214,178,74,0.22)", icon: CircleDashed },
};

const STRIP_ICONS: Record<string, IconType> = {
  Strategie: Target,
  "Track Record": FileSpreadsheet,
  Technik: Server,
  CTO: Handshake,
};

const ANSWER_ICONS: IconType[] = [
  Target,
  FileSpreadsheet,
  Receipt,
  Shield,
  Network,
  Plug,
];

const QUESTION_ICONS: IconType[] = [
  Plug,
  Network,
  Handshake,
  Shield,
  Receipt,
  Landmark,
];

const ANSWER_HIGHLIGHTS = [
  "Systematisch · regelbasiert",
  "Account 1 primär · Gesamt-Scope teilweise",
  "Account 1 teilweise primär belegt",
  "Interne Risk-Logik vorhanden",
  "Echte technische Vorarbeit · kein Produktivsystem",
  "Klare Produktionskette",
];

const QUESTION_CLARIFIERS = [
  "Broker · Zuständigkeit · technischer Integrationspfad",
  "Vollautomatisch · Batch-Freigabe · Order-by-Order",
  "Wer bestätigt Orders und trägt welche Verantwortung?",
  "Exposure · Drawdown · Sleeves · Stops · Kill Gates",
  "Statements · Trades · Cashflows · Kosten · Audit-Tiefe",
  "Scope · Rollen · Hosting · Entwicklung · Prüfung · Go-Live",
];

const ACTION_ICONS: IconType[] = [FileSpreadsheet, Receipt, Shield, ClipboardCheck];

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function panelStyle(extra?: CSSProperties): CSSProperties {
  return {
    background: PANEL_BG,
    border: `1px solid ${BORDER}`,
    borderRadius: 18,
    boxShadow: "0 20px 48px -32px rgba(0,0,0,0.82)",
    ...extra,
  };
}

function sectionEyebrow(label: string) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color: TEXT_DIM,
      }}
    >
      {label}
    </div>
  );
}

function StatusChip({ status }: { status: InnoPrepStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        borderRadius: 999,
        border: `1px solid ${meta.border}`,
        background: meta.bg,
        color: meta.color,
        padding: "3px 8px",
        fontSize: 9,
        fontWeight: 800,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        lineHeight: 1,
      }}
    >
      {status}
    </span>
  );
}

function StatusStripDesktop() {
  return (
    <div
      style={{
        ...panelStyle({
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          overflow: "hidden",
        }),
      }}
    >
      {INNO_PREP_STATUS_STRIP.map((item, index) => {
        const meta = STATUS_META[item.status];
        const Icon = STRIP_ICONS[item.title] ?? meta.icon;
        return (
          <div
            key={item.title}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "11px 16px",
              minHeight: 64,
              borderRight: index < INNO_PREP_STATUS_STRIP.length - 1 ? `1px solid ${DIVIDER}` : "none",
            }}
          >
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 11,
                border: `1px solid ${meta.border}`,
                background: meta.bg,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Icon size={16} color={meta.color} strokeWidth={1.85} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: TEXT, lineHeight: 1.05 }}>{item.title}</div>
                <StatusChip status={item.status} />
              </div>
              <div style={{ fontSize: 10.5, color: TEXT_MUTED, lineHeight: 1.25 }}>{item.note}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RealityPanel({
  title,
  tone,
  items,
}: {
  title: string;
  tone: "positive" | "negative";
  items: string[];
}) {
  const isPositive = tone === "positive";
  const toneColor = isPositive ? GREEN : RED;
  const toneBg = isPositive ? GREEN_SOFT : RED_SOFT;
  const toneBorder = isPositive ? "rgba(74,222,128,0.2)" : "rgba(248,113,113,0.18)";

  return (
    <div
      style={{
        ...panelStyle({
          background: PANEL_BG_SOFT,
          padding: "12px 16px 10px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          minHeight: 0,
        }),
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          {sectionEyebrow("Realität heute")}
          <div style={{ marginTop: 4, fontSize: 18, fontWeight: 700, color: TEXT, lineHeight: 1.02 }}>{title}</div>
        </div>
        <div
          style={{
            flexShrink: 0,
            borderRadius: 999,
            border: `1px solid ${toneBorder}`,
            background: toneBg,
            color: toneColor,
            padding: "5px 10px",
            fontSize: 9.5,
            fontWeight: 800,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          {isPositive ? "Vorhanden" : "Offen"}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", columnGap: 12, rowGap: 8, minHeight: 0 }}>
        {items.map((item, index) => (
          <div key={item} style={{ display: "grid", gridTemplateColumns: "24px minmax(0,1fr)", gap: 8, alignItems: "start" }}>
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: 8,
                border: `1px solid ${toneBorder}`,
                background: toneBg,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: toneColor,
                fontSize: 9,
                fontWeight: 800,
                lineHeight: 1,
              }}
            >
              {pad2(index + 1)}
            </div>
            <div style={{ paddingTop: 2, fontSize: 11.5, color: TEXT_SOFT, lineHeight: 1.14 }}>{item}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FlowBand() {
  return (
    <div
      style={{
        ...panelStyle({
          background: "linear-gradient(180deg, rgba(17,18,21,0.86) 0%, rgba(11,12,15,0.92) 100%)",
          padding: "12px 18px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }),
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
        {INNO_PREP_FLOW.map((step, index) => (
          <div key={step} style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <div
            style={{
                borderRadius: 999,
                background: index === 0 ? GOLD_SOFT : "rgba(255,255,255,0.04)",
                border: `1px solid ${index === 0 ? "rgba(214,178,74,0.18)" : DIVIDER}`,
                padding: "4px 10px",
                color: index === 0 ? GOLD : TEXT_SOFT,
                fontSize: 10.5,
                fontWeight: 700,
                lineHeight: 1,
              }}
            >
              {step}
            </div>
            {index < INNO_PREP_FLOW.length - 1 ? (
              <div style={{ color: TEXT_DIM, fontSize: 10, letterSpacing: "0.12em" }}>→</div>
            ) : null}
          </div>
        ))}
      </div>
      <div style={{ fontSize: 10.5, color: TEXT_MUTED }}>Produktionskette</div>
    </div>
  );
}

function AnswerRow({
  index,
  question,
  highlight,
  bullets,
  Icon,
}: {
  index: number;
  question: string;
  highlight: string;
  bullets: string[];
  Icon: IconType;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "34px minmax(0,1fr)",
        gap: 12,
        padding: "9px 0",
        borderTop: index === 0 ? "none" : `1px solid ${DIVIDER}`,
      }}
    >
      <div
        style={{
          display: "grid",
          gap: 8,
          justifyItems: "center",
          alignContent: "start",
        }}
      >
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            border: `1px solid ${BORDER}`,
            background: "rgba(255,255,255,0.03)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon size={14} color={COLORS.TEXT_HEADER} strokeWidth={1.9} />
        </div>
        <div style={{ fontSize: 10, fontWeight: 800, color: TEXT_DIM, letterSpacing: "0.08em" }}>{pad2(index + 1)}</div>
      </div>

      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 700, color: TEXT, lineHeight: 1.08 }}>{question}</div>
        <div
          style={{
            marginTop: 4,
            color: GOLD,
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: "0.05em",
            lineHeight: 1.2,
          }}
        >
          {highlight.toUpperCase()}
        </div>
        <div style={{ marginTop: 5, fontSize: 11, color: TEXT_SOFT, lineHeight: 1.2 }}>
          {bullets.join(" · ")}
        </div>
      </div>
    </div>
  );
}

function QuestionRow({
  index,
  question,
  clarifier,
  Icon,
}: {
  index: number;
  question: string;
  clarifier: string;
  Icon: IconType;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "34px minmax(0,1fr)",
        gap: 12,
        padding: "9px 0",
        borderTop: index === 0 ? "none" : `1px solid ${DIVIDER}`,
      }}
    >
      <div
        style={{
          display: "grid",
          gap: 8,
          justifyItems: "center",
          alignContent: "start",
        }}
      >
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            border: `1px solid ${BORDER}`,
            background: "rgba(255,255,255,0.03)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon size={14} color={COLORS.TEXT_HEADER} strokeWidth={1.9} />
        </div>
        <div style={{ fontSize: 10, fontWeight: 800, color: TEXT_DIM, letterSpacing: "0.08em" }}>{pad2(index + 1)}</div>
      </div>
      <div>
        <div style={{ fontSize: 14.5, fontWeight: 700, color: TEXT, lineHeight: 1.08 }}>{question}</div>
        <div
          style={{
            marginTop: 4,
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: "0.05em",
            color: GOLD,
            textTransform: "uppercase",
          }}
        >
          {clarifier}
        </div>
      </div>
    </div>
  );
}

function MainMeetingDesktop() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1.1fr 0.9fr",
        gap: 12,
        minHeight: 0,
      }}
    >
      <div style={{ ...panelStyle({ display: "flex", flexDirection: "column", minHeight: 0, padding: "12px 15px 7px" }) }}>
        {sectionEyebrow("Der Termin")}
        <div style={{ marginTop: 4, fontSize: 18, fontWeight: 700, color: TEXT, lineHeight: 1.02 }}>
          Was wir beantworten müssen
        </div>
        <div style={{ marginTop: 8, minHeight: 0, display: "grid", gap: 0 }}>
          {INNO_PREP_ANSWER_PROMPTS.map((item, index) => (
            <AnswerRow
              key={item.question}
              index={index}
              question={item.question}
              highlight={ANSWER_HIGHLIGHTS[index] ?? item.keyInfo}
              bullets={item.bullets}
              Icon={ANSWER_ICONS[index] ?? MessageSquare}
            />
          ))}
        </div>
      </div>

      <div style={{ ...panelStyle({ display: "flex", flexDirection: "column", minHeight: 0, padding: "12px 15px 7px" }) }}>
        {sectionEyebrow("Mit INNO klären")}
        <div style={{ marginTop: 4, fontSize: 18, fontWeight: 700, color: TEXT, lineHeight: 1.02 }}>
          Was wir INNO fragen
        </div>
        <div style={{ marginTop: 8, minHeight: 0, display: "grid", gap: 0 }}>
          {INNO_PREP_INNO_PROMPTS.map((item, index) => (
            <QuestionRow
              key={item.question}
              index={index}
              question={item.question}
              clarifier={QUESTION_CLARIFIERS[index] ?? item.keyInfo}
              Icon={QUESTION_ICONS[index] ?? MessageSquare}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ActionStripDesktop() {
  return (
    <div
      style={{
        ...panelStyle({
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          overflow: "hidden",
        }),
      }}
    >
      {INNO_PREP_TERM_TASKS.map((task, index) => {
        const Icon = ACTION_ICONS[index] ?? ClipboardCheck;
        return (
          <div
            key={task.title}
            style={{
              padding: "10px 14px",
              borderRight: index < INNO_PREP_TERM_TASKS.length - 1 ? `1px solid ${DIVIDER}` : "none",
              display: "grid",
              gridTemplateColumns: "26px minmax(0,1fr)",
              gap: 10,
              alignItems: "start",
            }}
          >
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: 10,
                border: `1px solid ${BORDER}`,
                background: "rgba(255,255,255,0.03)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon size={13} color={COLORS.TEXT_HEADER} strokeWidth={1.9} />
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 800, color: GOLD, letterSpacing: "0.06em" }}>
                {pad2(index + 1)} {task.title.toUpperCase()}
              </div>
              <div style={{ marginTop: 4, fontSize: 10.5, color: TEXT_SOFT, lineHeight: 1.16 }}>{task.action}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DesktopLayout() {
  return (
    <div
      style={{
        height: "100%",
        minHeight: 0,
        overflow: "hidden",
        padding: "12px 16px 10px",
        display: "grid",
        gridTemplateRows: "56px 152px minmax(0,1fr) 58px",
        gap: 8,
        background: PAGE_BG,
        color: TEXT,
        fontFamily: OPEN_SANS,
      }}
    >
      <StatusStripDesktop />
      <div style={{ display: "grid", gridTemplateRows: "1fr 36px", gap: 8, minHeight: 0 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, minHeight: 0 }}>
          <RealityPanel title="Was ist da?" tone="positive" items={INNO_PREP_HAVE_CARD.items} />
          <RealityPanel title="Was fehlt?" tone="negative" items={INNO_PREP_MISSING_CARD.items} />
        </div>
        <FlowBand />
      </div>
      <MainMeetingDesktop />
      <ActionStripDesktop />
    </div>
  );
}

function StatusStripMobile() {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {INNO_PREP_STATUS_STRIP.map((item) => {
        const meta = STATUS_META[item.status];
        const Icon = STRIP_ICONS[item.title] ?? meta.icon;
        return (
          <div key={item.title} style={{ ...panelStyle({ padding: 14, display: "flex", gap: 12, alignItems: "center" }) }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 12,
                border: `1px solid ${meta.border}`,
                background: meta.bg,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Icon size={16} color={meta.color} strokeWidth={1.85} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 5 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>{item.title}</div>
                <StatusChip status={item.status} />
              </div>
              <div style={{ fontSize: 12, color: TEXT_MUTED, lineHeight: 1.35 }}>{item.note}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MobileSectionCard({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <div style={{ ...panelStyle({ padding: 16 }) }}>
      {sectionEyebrow(eyebrow)}
      <div style={{ marginTop: 8, fontSize: 24, fontWeight: 700, color: TEXT, lineHeight: 1.06 }}>{title}</div>
      <div style={{ marginTop: 14 }}>{children}</div>
    </div>
  );
}

function MobileLayout() {
  return (
    <div
      style={{
        background: PAGE_BG,
        color: TEXT,
        fontFamily: OPEN_SANS,
        padding: "0 0 28px",
        display: "grid",
        gap: 12,
      }}
    >
      <StatusStripMobile />

      <div style={{ display: "grid", gap: 12 }}>
        <MobileSectionCard eyebrow="Realität heute" title="Was ist da?">
          <div style={{ display: "grid", gap: 10 }}>
            {INNO_PREP_HAVE_CARD.items.map((item, index) => (
              <div key={item} style={{ display: "grid", gridTemplateColumns: "26px minmax(0,1fr)", gap: 10 }}>
                <div style={{ color: GREEN, fontSize: 12, fontWeight: 800 }}>{pad2(index + 1)}</div>
                <div style={{ fontSize: 14, color: TEXT_SOFT, lineHeight: 1.35 }}>{item}</div>
              </div>
            ))}
          </div>
        </MobileSectionCard>

        <MobileSectionCard eyebrow="Realität heute" title="Was fehlt?">
          <div style={{ display: "grid", gap: 10 }}>
            {INNO_PREP_MISSING_CARD.items.map((item, index) => (
              <div key={item} style={{ display: "grid", gridTemplateColumns: "26px minmax(0,1fr)", gap: 10 }}>
                <div style={{ color: RED, fontSize: 12, fontWeight: 800 }}>{pad2(index + 1)}</div>
                <div style={{ fontSize: 14, color: TEXT_SOFT, lineHeight: 1.35 }}>{item}</div>
              </div>
            ))}
          </div>
        </MobileSectionCard>

        <MobileSectionCard eyebrow="Der Termin" title="Was wir beantworten müssen">
          <div style={{ display: "grid", gap: 14 }}>
            {INNO_PREP_ANSWER_PROMPTS.map((item, index) => (
              <div key={item.question} style={{ paddingTop: index === 0 ? 0 : 14, borderTop: index === 0 ? "none" : `1px solid ${DIVIDER}` }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: TEXT_DIM, letterSpacing: "0.08em" }}>{pad2(index + 1)}</div>
                <div style={{ marginTop: 6, fontSize: 18, fontWeight: 700, color: TEXT, lineHeight: 1.14 }}>{item.question}</div>
                <div style={{ marginTop: 7, fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", color: GOLD, textTransform: "uppercase" }}>
                  {ANSWER_HIGHLIGHTS[index] ?? item.keyInfo}
                </div>
                <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                  {item.bullets.map((bullet) => (
                    <div key={bullet} style={{ display: "grid", gridTemplateColumns: "10px minmax(0,1fr)", gap: 8 }}>
                      <div style={{ color: TEXT_DIM }}>•</div>
                      <div style={{ fontSize: 13, color: TEXT_SOFT, lineHeight: 1.35 }}>{bullet}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </MobileSectionCard>

        <MobileSectionCard eyebrow="Mit INNO klären" title="Was wir INNO fragen">
          <div style={{ display: "grid", gap: 14 }}>
            {INNO_PREP_INNO_PROMPTS.map((item, index) => (
              <div key={item.question} style={{ paddingTop: index === 0 ? 0 : 14, borderTop: index === 0 ? "none" : `1px solid ${DIVIDER}` }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: TEXT_DIM, letterSpacing: "0.08em" }}>{pad2(index + 1)}</div>
                <div style={{ marginTop: 6, fontSize: 18, fontWeight: 700, color: TEXT, lineHeight: 1.14 }}>{item.question}</div>
                <div style={{ marginTop: 7, fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", color: GOLD, textTransform: "uppercase" }}>
                  {QUESTION_CLARIFIERS[index] ?? item.keyInfo}
                </div>
              </div>
            ))}
          </div>
        </MobileSectionCard>

        <MobileSectionCard eyebrow="Bis zum Termin" title="Vier saubere Vorbereitungen">
          <div style={{ display: "grid", gap: 12 }}>
            {INNO_PREP_TERM_TASKS.map((task, index) => (
              <div key={task.title} style={{ display: "grid", gridTemplateColumns: "28px minmax(0,1fr)", gap: 10, alignItems: "start" }}>
                <div style={{ color: GOLD, fontSize: 12, fontWeight: 800 }}>{pad2(index + 1)}</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>{task.title}</div>
                  <div style={{ marginTop: 4, fontSize: 12, color: TEXT_SOFT, lineHeight: 1.35 }}>{task.action}</div>
                </div>
              </div>
            ))}
          </div>
        </MobileSectionCard>
      </div>
    </div>
  );
}

export function InnoPreparationContent({
  trackRecordOverview: _trackRecordOverview,
  mobile = false,
}: {
  trackRecordOverview?: TrackRecordOverview;
  mobile?: boolean;
}) {
  return mobile ? <MobileLayout /> : <DesktopLayout />;
}
