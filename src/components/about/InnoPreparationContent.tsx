"use client";

import {
  ClipboardCheck,
  FileQuestion,
  FileSpreadsheet,
  Handshake,
  MessageSquareMore,
  ServerCog,
  Target,
} from "lucide-react";
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

// ── Design tokens ─────────────────────────────────────────────────────────────

const BG     = "#0a0a0c";
const TEXT   = "#F5F6F8";
const SOFT   = "rgba(231,236,242,0.82)";
const MUTED  = "rgba(198,206,216,0.42)";
const GOLD   = "rgba(214,178,74,0.80)";
const BORDER = "rgba(255,255,255,0.055)";
const DIV    = "rgba(255,255,255,0.042)";
const FNT    = `"Open Sans", var(--font-text, system-ui), sans-serif`;

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_CFG: Record<InnoPrepStatus, { color: string; bg: string; border: string }> = {
  READY:       { color: "rgba(74,222,128,0.92)",  bg: "rgba(34,197,94,0.1)",   border: "rgba(34,197,94,0.22)"  },
  TEILWEISE:   { color: "rgba(212,175,55,0.92)",  bg: "rgba(212,175,55,0.1)",  border: "rgba(212,175,55,0.22)" },
  PROTOTYP:    { color: "rgba(129,140,248,0.92)", bg: "rgba(99,102,241,0.1)",  border: "rgba(99,102,241,0.22)" },
  OFFEN:       { color: "rgba(248,113,113,0.92)", bg: "rgba(239,68,68,0.1)",   border: "rgba(239,68,68,0.22)"  },
  "ZU KLAREN": { color: "rgba(251,191,36,0.92)",  bg: "rgba(251,146,60,0.1)",  border: "rgba(251,146,60,0.22)" },
};

// ── Strip icons ───────────────────────────────────────────────────────────────

type LucideIcon = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
const STRIP_ICONS: Record<string, LucideIcon> = {
  "Strategie":    Target,
  "Track Record": FileSpreadsheet,
  "Technik":      ServerCog,
  "CTO":          Handshake,
};

// ── Per-answer highlight texts (replaces KEY INFO) ────────────────────────────

const ANSWER_HIGHLIGHTS = [
  "SYSTEMATISCH · REGELBASIERT",
  "ACCOUNT 1 PRIMÄR · GESAMT-SCOPE TEILWEISE",
  "ACCOUNT 1 TEILWEISE PRIMÄR BELEGT",
  "INTERNE RISK-LOGIK VORHANDEN",
  "ECHTE VORARBEIT · KEIN PRODUKTIVSYSTEM",
  "KLARE PRODUKTIONSKETTE",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function n2(n: number) { return String(n).padStart(2, "0"); }

function SectionHeader({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6,
      padding: "10px 18px 10px",
      borderBottom: `1px solid ${DIV}`,
      flexShrink: 0,
    }}>
      <Icon size={12} color={GOLD} strokeWidth={1.8} />
      <span style={{
        fontSize: 9, fontWeight: 800, letterSpacing: "0.12em",
        textTransform: "uppercase", color: MUTED, fontFamily: FNT,
      }}>
        {label}
      </span>
    </div>
  );
}

function StatusPill({ status }: { status: InnoPrepStatus }) {
  const c = STATUS_CFG[status] ?? { color: MUTED, bg: "transparent", border: "transparent" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      padding: "1px 6px", borderRadius: 999,
      fontSize: 8.5, fontWeight: 800, letterSpacing: "0.09em",
      textTransform: "uppercase", fontFamily: FNT,
      background: c.bg, color: c.color, border: `1px solid ${c.border}`,
    }}>
      {status}
    </span>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function InnoPreparationContent({
  trackRecordOverview: _trackRecordOverview,
  mobile: _mobile,
}: {
  trackRecordOverview?: TrackRecordOverview;
  mobile?: boolean;
}) {
  return (
    <div style={{
      display: "flex", flexDirection: "column",
      height: "100%", minHeight: 0, overflow: "hidden",
      background: BG, color: TEXT, fontFamily: FNT,
    }}>

      {/* ═══════════════════════════════════════════════════════════
          STATUS STRIP
          ═══════════════════════════════════════════════════════════ */}
      <div style={{
        display: "flex", alignItems: "stretch",
        borderBottom: `1px solid ${BORDER}`,
        flexShrink: 0, height: 62,
      }}>
        {INNO_PREP_STATUS_STRIP.map((item) => {
          const Icon = STRIP_ICONS[item.title] ?? Target;
          const c    = STATUS_CFG[item.status] ?? STATUS_CFG.OFFEN;
          return (
            <div key={item.title} style={{
              flex: 1, display: "flex", alignItems: "center", gap: 11,
              padding: "0 18px",
              borderRight: `1px solid ${BORDER}`,
            }}>
              {/* Icon badge */}
              <div style={{
                width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                background: c.bg, border: `1px solid ${c.border}`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Icon size={14} color={c.color} strokeWidth={1.75} />
              </div>
              {/* Text */}
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
                  <span style={{ fontSize: 11.5, fontWeight: 800, color: TEXT, letterSpacing: "0.01em" }}>
                    {item.title}
                  </span>
                  <StatusPill status={item.status} />
                </div>
                <span style={{
                  fontSize: 10.5, color: MUTED, display: "block",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {item.note}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* ═══════════════════════════════════════════════════════════
          MAIN BODY
          ═══════════════════════════════════════════════════════════ */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", overflow: "hidden" }}>

        {/* ── LEFT: Realität heute ── */}
        <div style={{
          width: 252, flexShrink: 0,
          borderRight: `1px solid ${BORDER}`,
          display: "flex", flexDirection: "column",
          overflow: "hidden",
        }}>
          <SectionHeader icon={Target} label="Realität heute" />

          <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column", padding: "12px 16px" }}>

            {/* Was ist da */}
            <div style={{ marginBottom: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 7 }}>
                <span style={{ fontSize: 9, color: "rgba(74,222,128,0.6)", lineHeight: 1 }}>✓</span>
                <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.09em", textTransform: "uppercase", color: "rgba(74,222,128,0.65)" }}>
                  Was ist da
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {INNO_PREP_HAVE_CARD.items.map((item, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 7 }}>
                    <span style={{ fontSize: 8, color: "rgba(74,222,128,0.4)", marginTop: 3.5, flexShrink: 0 }}>▸</span>
                    <span style={{ fontSize: 11.5, color: SOFT, lineHeight: 1.38 }}>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: DIV, margin: "12px 0" }} />

            {/* Was fehlt */}
            <div style={{ marginBottom: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 7 }}>
                <span style={{ fontSize: 9, color: "rgba(248,113,113,0.6)", lineHeight: 1 }}>○</span>
                <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.09em", textTransform: "uppercase", color: "rgba(248,113,113,0.65)" }}>
                  Was fehlt noch
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {INNO_PREP_MISSING_CARD.items.map((item, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 7 }}>
                    <span style={{ fontSize: 8, color: "rgba(248,113,113,0.35)", marginTop: 3.5, flexShrink: 0 }}>▹</span>
                    <span style={{ fontSize: 11.5, color: SOFT, lineHeight: 1.38 }}>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: DIV, margin: "12px 0" }} />

            {/* Produktionskette */}
            <div>
              <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: MUTED, display: "block", marginBottom: 8 }}>
                Produktionskette
              </span>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 0 }}>
                {Array.from(INNO_PREP_FLOW).map((step, i) => (
                  <span key={step} style={{ display: "flex", alignItems: "center" }}>
                    <span style={{
                      fontSize: 10.5, fontWeight: 600,
                      color: i === 0 ? GOLD : SOFT,
                      padding: "2px 5px",
                      background: i === 0 ? "rgba(214,178,74,0.08)" : "transparent",
                      borderRadius: 4,
                    }}>
                      {step}
                    </span>
                    {i < INNO_PREP_FLOW.length - 1 && (
                      <span style={{ fontSize: 9, color: MUTED, margin: "0 1px" }}>→</span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── MIDDLE: Was wir beantworten müssen ── */}
        <div style={{
          flex: 1, minWidth: 0, minHeight: 0,
          borderRight: `1px solid ${BORDER}`,
          display: "flex", flexDirection: "column",
          overflow: "hidden",
          background: "rgba(255,255,255,0.010)",
        }}>
          <SectionHeader icon={MessageSquareMore} label="Was wir beantworten müssen" />

          {/* Answer blocks */}
          <div style={{
            flex: 1, minHeight: 0,
            overflowY: "auto",
            scrollbarWidth: "thin",
            scrollbarColor: "rgba(255,255,255,0.12) transparent",
          }}>
            {INNO_PREP_ANSWER_PROMPTS.map((item, i) => (
              <div key={i} style={{
                display: "flex", gap: 14,
                padding: "12px 20px",
                borderBottom: i < INNO_PREP_ANSWER_PROMPTS.length - 1 ? `1px solid ${DIV}` : "none",
              }}>
                {/* Ghost number */}
                <span style={{
                  fontSize: 22, fontWeight: 800, letterSpacing: "-0.03em",
                  color: "rgba(255,255,255,0.09)", lineHeight: 1,
                  flexShrink: 0, width: 30, paddingTop: 1,
                }}>
                  {n2(i + 1)}
                </span>
                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Question */}
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: TEXT, lineHeight: 1.34, marginBottom: 4 }}>
                    {item.question}
                  </div>
                  {/* Highlight answer — replaces KEY INFO */}
                  <div style={{
                    fontSize: 9.5, fontWeight: 800, letterSpacing: "0.1em",
                    textTransform: "uppercase", color: GOLD, marginBottom: 6,
                  }}>
                    {ANSWER_HIGHLIGHTS[i]}
                  </div>
                  {/* Bullets */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    {item.bullets.map((b, j) => (
                      <div key={j} style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
                        <span style={{ fontSize: 7.5, color: MUTED, marginTop: 4, flexShrink: 0 }}>•</span>
                        <span style={{ fontSize: 11.5, color: SOFT, lineHeight: 1.4 }}>{b}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── RIGHT: Was wir INNO fragen ── */}
        <div style={{
          width: 360, flexShrink: 0,
          display: "flex", flexDirection: "column",
          overflow: "hidden",
          background: "rgba(255,255,255,0.010)",
        }}>
          <SectionHeader icon={FileQuestion} label="Was wir INNO fragen" />

          {/* Question blocks */}
          <div style={{
            flex: 1, minHeight: 0,
            overflowY: "auto",
            scrollbarWidth: "thin",
            scrollbarColor: "rgba(255,255,255,0.12) transparent",
          }}>
            {INNO_PREP_INNO_PROMPTS.map((item, i) => (
              <div key={i} style={{
                display: "flex", gap: 14,
                padding: "12px 20px",
                borderBottom: i < INNO_PREP_INNO_PROMPTS.length - 1 ? `1px solid ${DIV}` : "none",
              }}>
                {/* Ghost number */}
                <span style={{
                  fontSize: 22, fontWeight: 800, letterSpacing: "-0.03em",
                  color: "rgba(255,255,255,0.09)", lineHeight: 1,
                  flexShrink: 0, width: 30, paddingTop: 1,
                }}>
                  {n2(i + 1)}
                </span>
                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Question */}
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: TEXT, lineHeight: 1.34, marginBottom: 5 }}>
                    {item.question}
                  </div>
                  {/* KLÄRT row */}
                  <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
                    <span style={{
                      fontSize: 8.5, fontWeight: 800, letterSpacing: "0.1em",
                      textTransform: "uppercase", color: MUTED, flexShrink: 0,
                    }}>
                      KLÄRT
                    </span>
                    <span style={{ fontSize: 11.5, color: SOFT, lineHeight: 1.4 }}>
                      {item.keyInfo}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          ACTION STRIP — Bis zum Termin
          ═══════════════════════════════════════════════════════════ */}
      <div style={{
        display: "flex", alignItems: "stretch",
        borderTop: `1px solid ${BORDER}`,
        flexShrink: 0, height: 54,
      }}>
        {/* Label */}
        <div style={{
          display: "flex", alignItems: "center", gap: 7,
          padding: "0 18px",
          borderRight: `1px solid ${BORDER}`,
          flexShrink: 0,
        }}>
          <ClipboardCheck size={12} color={GOLD} strokeWidth={1.8} />
          <span style={{
            fontSize: 9, fontWeight: 800, letterSpacing: "0.1em",
            textTransform: "uppercase", color: MUTED, whiteSpace: "nowrap",
          }}>
            Bis zum Termin
          </span>
        </div>

        {/* Task items */}
        {INNO_PREP_TERM_TASKS.map((task, i) => (
          <div key={i} style={{
            flex: 1, display: "flex", alignItems: "center", gap: 10,
            padding: "0 18px",
            borderRight: i < INNO_PREP_TERM_TASKS.length - 1 ? `1px solid ${BORDER}` : "none",
          }}>
            <span style={{
              fontSize: 16, fontWeight: 800, letterSpacing: "-0.03em",
              color: "rgba(255,255,255,0.1)", lineHeight: 1, flexShrink: 0,
            }}>
              {n2(i + 1)}
            </span>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: TEXT, marginBottom: 1 }}>
                {task.title}
              </div>
              <div style={{ fontSize: 10.5, color: MUTED, lineHeight: 1.3 }}>
                {task.action}
              </div>
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}
