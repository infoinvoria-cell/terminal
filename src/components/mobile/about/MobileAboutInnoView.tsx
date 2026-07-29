"use client";

import { AboutModeTabs } from "@/components/about/AboutModeTabs";
import { AlertTriangle, BookOpen, Database, FileText } from "lucide-react";
import {
  INNO_DATA_GAPS_ROWS,
  INNO_MEETING_BRIEF,
  INNO_OVERVIEW_METRICS,
  INNO_SOURCE_REGISTER,
  INNO_STRATEGY_CARDS,
} from "@/lib/about/about-inno-data";

const BG = "#0c0d10";
const CARD = "linear-gradient(180deg,#1c1d20 0%,#141517 100%)";
const BORDER = "rgba(255,255,255,0.07)";
const SHADOW = "0 8px 24px -8px rgba(0,0,0,0.6)";
const MUTED = "rgba(255,255,255,0.38)";
const ACCENT = "var(--dash-accent, #e2ca7a)";
const M = "var(--font-montserrat,sans-serif)";
const N = "var(--font-nunito,sans-serif)";

export function MobileAboutInnoView() {
  return (
    <div style={{ background: BG, minHeight: "100%", padding: "14px 14px 32px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <BookOpen size={14} color={ACCENT} />
        <div>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#fff", fontFamily: N }}>INNO Vorbereitung</p>
          <p style={{ margin: 0, fontSize: 9, color: MUTED, fontFamily: M }}>Interner Diligence-Modus · Quellenpflicht</p>
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <AboutModeTabs
          activeMode="inno"
          mobile
          basePath="/m/about"
          hrefs={{ overview: "/m/about", inno: "/m/about/inno" }}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
        {INNO_OVERVIEW_METRICS.map((metric) => (
          <MCard key={metric.label}>
            <p style={{ margin: 0, fontSize: 8, color: MUTED, textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: M }}>{metric.label}</p>
            <p style={{ margin: "4px 0 0", fontSize: 15, fontWeight: 700, color: metric.tone === "gold" ? ACCENT : metric.tone === "red" ? "#fda4af" : metric.tone === "blue" ? "#7dd3fc" : "#fff", fontFamily: N }}>{metric.value}</p>
            {metric.sub ? <p style={{ margin: "2px 0 0", fontSize: 9, color: "#fff", fontFamily: M }}>{metric.sub}</p> : null}
            <p style={{ margin: "5px 0 0", fontSize: 8, color: "rgba(255,255,255,0.35)", fontFamily: M }}>Quelle: {metric.source}</p>
          </MCard>
        ))}
      </div>

      {INNO_STRATEGY_CARDS.map((card) => (
        <MCard key={card.id} style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
            <div>
              <p style={{ margin: 0, fontSize: 9, fontWeight: 600, color: MUTED, textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: M }}>{card.id === "tactical" ? "01 · Tactical" : "02 · Strategic"}</p>
              <p style={{ margin: "3px 0 0", fontSize: 18, fontWeight: 700, color: "#fff", fontFamily: N }}>{card.title}</p>
            </div>
            <Badge tone={card.badgeTone}>{card.badge}</Badge>
          </div>
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            {card.rows.slice(0, 6).map((row) => (
              <div key={row.key} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontSize: 10, color: MUTED, fontFamily: M }}>{row.key}</span>
                <span style={{ fontSize: 10, color: "#fff", textAlign: "right", fontFamily: M }}>{row.value}</span>
              </div>
            ))}
          </div>
        </MCard>
      ))}

      <MCard style={{ marginBottom: 12 }}>
        <SHead icon={<FileText size={12} />} label="INNO-Meeting-Brief" />
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          {INNO_MEETING_BRIEF.map((line) => (
            <div key={line} style={{ borderRadius: 10, border: "1px solid rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.03)", padding: "8px 10px", fontSize: 10, color: "#fff", fontFamily: M }}>
              {line}
            </div>
          ))}
        </div>
      </MCard>

      <MCard style={{ marginBottom: 12 }}>
        <SHead icon={<AlertTriangle size={12} />} label="Datenluecken" />
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          {INNO_DATA_GAPS_ROWS.slice(0, 5).map((row) => (
            <div key={row.aussage} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: 8 }}>
              <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: "#fff", fontFamily: M }}>{row.aussage}</p>
              <p style={{ margin: "3px 0 0", fontSize: 9, color: MUTED, fontFamily: M }}>{row.status} · {row.wert}</p>
              <p style={{ margin: "3px 0 0", fontSize: 8, color: "rgba(255,255,255,0.35)", fontFamily: M }}>{row.quelle}</p>
            </div>
          ))}
        </div>
      </MCard>

      <MCard>
        <SHead icon={<Database size={12} />} label="Quellenregister" />
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          {INNO_SOURCE_REGISTER.slice(0, 6).map((source) => (
            <div key={source.path}>
              <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: "#fff", fontFamily: N }}>{source.label}</p>
              <p style={{ margin: "2px 0 0", fontSize: 8, color: MUTED, fontFamily: M }}>{source.path}</p>
            </div>
          ))}
        </div>
      </MCard>
    </div>
  );
}

function MCard({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, boxShadow: SHADOW, padding: 14, ...style }}>
      {children}
    </div>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone: "gold" | "blue" | "red" | "zinc" }) {
  const style =
    tone === "gold" ? { border: "1px solid rgba(226,202,122,0.3)", background: "rgba(226,202,122,0.1)", color: ACCENT } :
    tone === "blue" ? { border: "1px solid rgba(125,211,252,0.3)", background: "rgba(125,211,252,0.1)", color: "#7dd3fc" } :
    tone === "red" ? { border: "1px solid rgba(253,164,175,0.3)", background: "rgba(253,164,175,0.1)", color: "#fda4af" } :
    { border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.7)" };
  return <span style={{ borderRadius: 20, fontSize: 8, fontWeight: 700, padding: "3px 8px", fontFamily: M, ...style }}>{children}</span>;
}

function SHead({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ color: ACCENT, flexShrink: 0 }}>{icon}</span>
      <p style={{ margin: 0, fontSize: 9, fontWeight: 600, color: ACCENT, textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: M }}>{label}</p>
    </div>
  );
}
