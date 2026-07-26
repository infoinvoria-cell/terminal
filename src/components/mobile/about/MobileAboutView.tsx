"use client";

import {
  BookOpen, TrendingUp,
  Layers, Calendar, Clock, Globe, Shield, Wallet,
  RefreshCw, BarChart2, Target, CheckCircle,
} from "lucide-react";
import {
  ABOUT_STRATEGIES, ABOUT_COMPARISON, ABOUT_INVESTOR,
  ABOUT_RISK, ABOUT_TRACK_RECORD, ABOUT_ZEITHORIZONT, ABOUT_ECKDATEN,
} from "@/lib/about/about-data";

const BG      = "#0c0d10";
const CARD    = "linear-gradient(180deg,#1c1d20 0%,#141517 100%)";
const BORDER  = "rgba(255,255,255,0.07)";
const SHADOW  = "0 8px 24px -8px rgba(0,0,0,0.6)";
const MUTED   = "rgba(255,255,255,0.38)";
const ACCENT  = "var(--dash-accent, #e2ca7a)";
const M       = "var(--font-montserrat,sans-serif)";
const N       = "var(--font-nunito,sans-serif)";

const ICON_MAP: Record<string, React.ReactNode> = {
  Layers:      <Layers size={11} />,
  Globe:       <Globe size={11} />,
  Clock:       <Clock size={11} />,
  Calendar:    <Calendar size={11} />,
  CheckCircle: <CheckCircle size={11} />,
  Target:      <Target size={11} />,
  RefreshCw:   <RefreshCw size={11} />,
  BarChart2:   <BarChart2 size={11} />,
};

export function MobileAboutView() {
  return (
    <div style={{ background: BG, minHeight: "100%", padding: "14px 14px 32px" }}>

      {/* HEADER */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <BookOpen size={14} color={ACCENT} />
        <div>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#fff", fontFamily: N }}>Bibel</p>
          <p style={{ margin: 0, fontSize: 9, color: MUTED, fontFamily: M }}>Intern · kein Angebot · nicht geprüft</p>
        </div>
      </div>

      {/* STRATEGIEN — stacked vertically on mobile */}
      {ABOUT_STRATEGIES.map((s) => (
        <MCard key={s.id} style={{ marginBottom: 12 }}>
          {/* Title row */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
            <div>
              <p style={{ margin: 0, fontSize: 9, fontWeight: 600, color: MUTED, textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: M }}>
                {s.number} · {s.type}
              </p>
              <p style={{ margin: "2px 0 0", fontSize: 18, fontWeight: 700, color: "#fff", fontFamily: N, letterSpacing: "-0.02em" }}>
                {s.name}
              </p>
            </div>
            <span style={{
              flexShrink: 0, borderRadius: 20, border: `1px solid ${s.badgeColor === "gold" ? "rgba(226,202,122,0.3)" : "rgba(96,165,250,0.3)"}`,
              background: s.badgeColor === "gold" ? "rgba(226,202,122,0.1)" : "rgba(96,165,250,0.1)",
              color: s.badgeColor === "gold" ? ACCENT : "#60a5fa",
              fontSize: 9, fontWeight: 600, padding: "3px 8px", fontFamily: M,
            }}>
              {s.badge}
            </span>
          </div>

          {/* 4 stat boxes — 2x2 grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 12 }}>
            {s.stats.map((st) => (
              <div key={st.label} style={{
                background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)",
                borderRadius: 10, padding: "8px 10px",
              }}>
                <p style={{ margin: 0, fontSize: 9, color: MUTED, fontFamily: M }}>{st.label}</p>
                <p style={{
                  margin: "2px 0 0", fontSize: 18, fontWeight: 700, fontFamily: N,
                  color: st.color === "gold" ? ACCENT : st.color === "red" ? "#a1a1aa" : "#fff",
                }}>
                  {st.value}
                </p>
              </div>
            ))}
          </div>

          {/* Details */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {s.details.map((d) => (
              <div key={d.key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ flexShrink: 0, color: MUTED }}>{ICON_MAP[d.icon]}</span>
                <span style={{ fontSize: 10, color: MUTED, fontFamily: M, flexShrink: 0 }}>{d.key}</span>
                <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 500, color: "#fff", fontFamily: M, textAlign: "right" }}>{d.value}</span>
              </div>
            ))}
          </div>
        </MCard>
      ))}

      {/* VERGLEICH */}
      <MCard style={{ marginBottom: 12 }}>
        <SHead icon={<BarChart2 size={12} />} label="Vergleich · Anlageklassen" />
        <div style={{ marginTop: 10, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 400 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                {["Asset","CAGR","Max DD","Sharpe","Calmar","Korr. SPY"].map(h => (
                  <th key={h} style={{ padding: "4px 8px", textAlign: "left", fontSize: 9, fontWeight: 600, color: MUTED, textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: M, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ABOUT_COMPARISON.map((r) => (
                <tr key={r.name} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)", background: r.accent ? "rgba(226,202,122,0.03)" : "transparent" }}>
                  <td style={{ padding: "5px 8px", fontSize: 11, fontWeight: 500, color: r.accent ? ACCENT : "#fff", fontFamily: M, whiteSpace: "nowrap" }}>
                    {r.name}
                    {r.tag && <span style={{ marginLeft: 4, fontSize: 8, fontWeight: 600, background: r.accent ? "rgba(226,202,122,0.15)" : "rgba(255,255,255,0.06)", color: r.accent ? ACCENT : MUTED, padding: "1px 4px", borderRadius: 3 }}>{r.tag}</span>}
                  </td>
                  <td style={{ padding: "5px 8px", fontSize: 11, fontWeight: 600, color: ACCENT, fontFamily: N }}>{r.cagr}</td>
                  <td style={{ padding: "5px 8px", fontSize: 11, fontWeight: 600, color: "#f87171", fontFamily: N }}>{r.dd}</td>
                  <td style={{ padding: "5px 8px", fontSize: 11, color: "#fff", fontFamily: N }}>{r.sharpe}</td>
                  <td style={{ padding: "5px 8px", fontSize: 11, color: "#fff", fontFamily: N }}>{r.calmar}</td>
                  <td style={{ padding: "5px 8px", fontSize: 10, color: MUTED, fontFamily: M, whiteSpace: "nowrap" }}>{r.corrSpy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </MCard>

      {/* TRACK RECORD + ZEITHORIZONT side by side */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
        <MCard>
          <SHead icon={<TrendingUp size={12} />} label="WS · Live-Record" />
          <div style={{ marginTop: 10 }}>
            {ABOUT_TRACK_RECORD.map(({ key, value }) => (
              <KVRow key={key} k={key} v={value} />
            ))}
          </div>
        </MCard>
        <MCard>
          <SHead icon={<Clock size={12} />} label="Anlagehorizont" />
          <div style={{ marginTop: 10 }}>
            {ABOUT_ZEITHORIZONT.map(({ key, value }) => (
              <KVRow key={key} k={key} v={value} />
            ))}
          </div>
        </MCard>
      </div>

      {/* INVESTOR + RISIKO side by side */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
        <MCard>
          <SHead icon={<Wallet size={12} />} label="Für Investoren" />
          <div style={{ marginTop: 10 }}>
            {ABOUT_INVESTOR.map(({ key, value }) => (
              <KVRow key={key} k={key} v={value} />
            ))}
          </div>
        </MCard>
        <MCard>
          <SHead icon={<Shield size={12} />} label="Risikoprofil" />
          <div style={{ marginTop: 10 }}>
            {ABOUT_RISK.map(({ key, value }) => (
              <KVRow key={key} k={key} v={value} />
            ))}
          </div>
        </MCard>
      </div>

      {/* ECKDATEN */}
      <MCard>
        <SHead icon={<Globe size={12} />} label="Eckdaten" />
        <div style={{ marginTop: 10 }}>
          {ABOUT_ECKDATEN.map(({ key, value }) => (
            <KVRow key={key} k={key} v={value} />
          ))}
        </div>
      </MCard>

    </div>
  );
}

// ─── Primitives ───────────────────────────────────────────────────────────────

function MCard({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16,
      boxShadow: SHADOW, padding: 14, ...style,
    }}>
      {children}
    </div>
  );
}

function SHead({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ color: ACCENT, flexShrink: 0 }}>{icon}</span>
      <p style={{ margin: 0, fontSize: 9, fontWeight: 600, color: ACCENT, textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: M }}>{label}</p>
    </div>
  );
}

function KVRow({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
      <span style={{ fontSize: 10, color: MUTED, fontFamily: M, flexShrink: 0 }}>{k}</span>
      <span style={{ fontSize: 10, fontWeight: 500, color: "#fff", fontFamily: M, textAlign: "right" }}>{v}</span>
    </div>
  );
}
