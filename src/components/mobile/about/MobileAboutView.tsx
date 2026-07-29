"use client";

import { AboutModeTabs } from "@/components/about/AboutModeTabs";
import {
  BookOpen, TrendingUp,
  Layers, Calendar, Clock, Globe, Shield, Wallet,
  RefreshCw, BarChart2, Target, CheckCircle,
} from "lucide-react";
import {
  ABOUT_STRATEGIES, ABOUT_COMPARISON, ABOUT_INVESTOR,
  ABOUT_RISK, ABOUT_TRACK_RECORD, ABOUT_ZEITHORIZONT, ABOUT_ECKDATEN,
  ABOUT_WS_SLEEVES, ABOUT_CI_ALLOC, ABOUT_CORRELATION,
} from "@/lib/about/about-data";

const SHADES = ["#e2ca7a", "rgba(226,202,122,0.62)", "rgba(226,202,122,0.38)", "rgba(255,255,255,0.18)", "rgba(255,255,255,0.10)"];
const ALLOC: Record<string, { label: string; pct: number }[]> = {
  ws: ABOUT_WS_SLEEVES.map((s) => ({ label: s.label, pct: s.pct })),
  ci: [...ABOUT_CI_ALLOC],
};

const BG = "#0c0d10";
const CARD = "linear-gradient(180deg,#1c1d20 0%,#141517 100%)";
const BORDER = "rgba(255,255,255,0.07)";
const SHADOW = "0 8px 24px -8px rgba(0,0,0,0.6)";
const MUTED = "rgba(255,255,255,0.38)";
const ACCENT = "var(--dash-accent, #e2ca7a)";
const M = "var(--font-montserrat,sans-serif)";
const N = "var(--font-nunito,sans-serif)";

const ICON_MAP: Record<string, React.ReactNode> = {
  Layers: <Layers size={11} />,
  Globe: <Globe size={11} />,
  Clock: <Clock size={11} />,
  Calendar: <Calendar size={11} />,
  CheckCircle: <CheckCircle size={11} />,
  Target: <Target size={11} />,
  RefreshCw: <RefreshCw size={11} />,
  BarChart2: <BarChart2 size={11} />,
};

export function MobileAboutView() {
  return (
    <div style={{ background: BG, minHeight: "100%", padding: "14px 14px 32px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <BookOpen size={14} color={ACCENT} />
        <div>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#fff", fontFamily: N }}>Bibel</p>
          <p style={{ margin: 0, fontSize: 9, color: MUTED, fontFamily: M }}>Intern - kein Angebot - nicht geprueft</p>
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <AboutModeTabs
          activeMode="overview"
          mobile
          basePath="/m/about"
          hrefs={{ overview: "/m/about", inno: "/m/about/inno" }}
        />
      </div>

      {ABOUT_STRATEGIES.map((s) => (
        <MCard key={s.id} style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
            <div>
              <p style={{ margin: 0, fontSize: 9, fontWeight: 600, color: MUTED, textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: M }}>
                {s.number} - {s.type}
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

          <div style={{ marginBottom: 12 }}>
            <p style={{ margin: "0 0 6px", fontSize: 8, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: MUTED, fontFamily: M }}>
              {s.id === "ws" ? "Sleeve-Verteilung - 35 Strategien" : "Gewichtung v2.0"}
            </p>
            <MAllocBar segments={ALLOC[s.id]} />
          </div>

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

      <MCard style={{ marginBottom: 12 }}>
        <SHead icon={<BarChart2 size={12} />} label="Vergleich - Anlageklassen" />
        <div style={{ marginTop: 10, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 400 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                {["Asset", "CAGR", "Max DD", "Sharpe", "Calmar", "Korr. SPY"].map((h) => (
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

      <MCard style={{ marginBottom: 12 }}>
        <SHead icon={<Target size={12} />} label="Korrelation zu SPY" />
        <p style={{ margin: "4px 0 0", fontSize: 9, color: MUTED, fontFamily: M }}>Geschaetzt - niedriger = mehr Diversifikation</p>
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          {ABOUT_CORRELATION.map((c) => (
            <MCorrBar key={c.name} name={c.name} corr={c.corr} accent={c.accent} />
          ))}
        </div>
      </MCard>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
        <MCard>
          <SHead icon={<TrendingUp size={12} />} label="WS - Live-Record" />
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

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
        <MCard>
          <SHead icon={<Wallet size={12} />} label="Fuer Investoren" />
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

function MAllocBar({ segments }: { segments: { label: string; pct: number }[] }) {
  return (
    <div>
      <div style={{ display: "flex", height: 10, width: "100%", overflow: "hidden", borderRadius: 999, border: "1px solid rgba(255,255,255,0.06)" }}>
        {segments.map((s, i) => (
          <div key={s.label} style={{ width: `${s.pct}%`, background: SHADES[i % SHADES.length] }} />
        ))}
      </div>
      <div style={{ marginTop: 7, display: "flex", flexWrap: "wrap", gap: "3px 12px" }}>
        {segments.map((s, i) => (
          <span key={s.label} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9, color: MUTED, fontFamily: M }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: SHADES[i % SHADES.length] }} />
            {s.label} <span style={{ color: "rgba(255,255,255,0.8)" }}>{s.pct}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function MCorrBar({ name, corr, accent }: { name: string; corr: number; accent: boolean }) {
  const w = Math.max(2, Math.min(100, ((corr + 0.1) / 1.1) * 100));
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ width: 82, flexShrink: 0, fontSize: 10, fontWeight: accent ? 600 : 400, color: accent ? ACCENT : MUTED, fontFamily: M, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
      <div style={{ position: "relative", height: 8, flex: 1, overflow: "hidden", borderRadius: 999, background: "rgba(255,255,255,0.05)" }}>
        <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, borderRadius: 999, width: `${w}%`, background: accent ? ACCENT : "rgba(255,255,255,0.28)" }} />
      </div>
      <span style={{ width: 34, flexShrink: 0, textAlign: "right", fontSize: 10, fontWeight: 600, color: accent ? ACCENT : "rgba(255,255,255,0.7)", fontFamily: N }}>{corr.toFixed(2)}</span>
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
