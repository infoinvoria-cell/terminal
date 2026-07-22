"use client";

import { useCallback, useEffect, useState } from "react";
import type { Investor } from "./InvestorsCRMView";

const STATUS_COLOR: Record<string, { bg: string; text: string }> = {
  "Neu":                    { bg: "rgba(113,113,122,0.2)", text: "#a1a1aa" },
  "Kontaktiert":            { bg: "rgba(59,130,246,0.2)",  text: "#60a5fa" },
  "Early Access gesendet":  { bg: "rgba(99,102,241,0.2)",  text: "#818cf8" },
  "Interesse bestätigt":    { bg: "rgba(6,182,212,0.2)",   text: "#22d3ee" },
  "Gespräch geplant":       { bg: "rgba(168,85,247,0.2)",  text: "#c084fc" },
  "Warm Commitment":        { bg: "rgba(245,158,11,0.2)",  text: "#fbbf24" },
  "Unterlagen ausstehend":  { bg: "rgba(249,115,22,0.2)",  text: "#fb923c" },
  "Bereit für Onboarding":  { bg: "rgba(34,197,94,0.2)",   text: "#4ade80" },
  "Später kontaktieren":    { bg: "rgba(63,63,70,0.35)",   text: "#71717a" },
  "Abgesagt":               { bg: "rgba(239,68,68,0.2)",   text: "#f87171" },
};

function fmtDate(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function InvestorCard({ investor, nr }: { investor: Investor; nr: number }) {
  const sc = STATUS_COLOR[investor.status] ?? STATUS_COLOR["Neu"];
  return (
    <div style={{
      background: "rgba(255,255,255,0.03)",
      border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 10, padding: "14px 16px", marginBottom: 10,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", fontFamily: "var(--font-montserrat,sans-serif)", fontWeight: 700, marginRight: 6 }}>#{nr}</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#fff", fontFamily: "var(--font-montserrat,sans-serif)" }}>{investor.name}</span>
          {investor.unternehmen && (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 2, fontFamily: "var(--font-montserrat,sans-serif)" }}>{investor.unternehmen}</div>
          )}
        </div>
        <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, fontFamily: "var(--font-montserrat,sans-serif)", background: sc.bg, color: sc.text, flexShrink: 0, marginLeft: 8 }}>
          {investor.status}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 12px" }}>
        {investor.email && <Row label="E-Mail" value={investor.email} />}
        {investor.telefon && <Row label="Tel." value={investor.telefon} />}
        {investor.kapitalrahmen && <Row label="Kapital" value={investor.kapitalrahmen} />}
        {investor.kontaktquelle && <Row label="Quelle" value={investor.kontaktquelle} />}
        {investor.zustaendig && <Row label="Zuständig" value={investor.zustaendig} />}
        {investor.naechster_schritt && <Row label="Nächster Schritt" value={investor.naechster_schritt} />}
        {investor.letzter_kontakt && <Row label="Letzter Kontakt" value={fmtDate(investor.letzter_kontakt) ?? ""} />}
        {investor.verfuegbar_ab && <Row label="Verfügbar ab" value={fmtDate(investor.verfuegbar_ab) ?? ""} />}
      </div>

      {investor.notizen && (
        <div style={{ marginTop: 8, padding: "6px 8px", background: "rgba(255,255,255,0.04)", borderRadius: 6, fontSize: 11, color: "rgba(255,255,255,0.5)", fontFamily: "var(--font-montserrat,sans-serif)", lineHeight: 1.5 }}>
          {investor.notizen}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span style={{ fontSize: 9.5, color: "rgba(255,255,255,0.3)", fontFamily: "var(--font-montserrat,sans-serif)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}: </span>
      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", fontFamily: "var(--font-montserrat,sans-serif)" }}>{value}</span>
    </div>
  );
}

export function MobileInvestorsCRMView() {
  const [rows, setRows] = useState<Investor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/investors-crm");
      if (r.ok) setRows(await r.json());
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = rows.filter(r => {
    const q = search.toLowerCase();
    if (q && !["name","unternehmen","email","telefon"].some(k => (r[k as keyof Investor] ?? "").toString().toLowerCase().includes(q))) return false;
    if (filterStatus && r.status !== filterStatus) return false;
    return true;
  });

  const nrMap = Object.fromEntries(rows.map((r, i) => [r.id, i + 1]));

  const STATUS_OPTS = ["Neu","Kontaktiert","Early Access gesendet","Interesse bestätigt","Gespräch geplant","Warm Commitment","Unterlagen ausstehend","Bereit für Onboarding","Später kontaktieren","Abgesagt"];
  const inp: React.CSSProperties = { width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#e4e4e7", fontSize: 16, fontFamily: "var(--font-montserrat,sans-serif)", padding: "9px 12px", outline: "none" };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#090a0c", color: "#e4e4e7" }}>
      <div style={{ padding: "16px 16px 12px", flexShrink: 0, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        <h1 style={{ margin: "0 0 2px", fontSize: 16, fontWeight: 800, fontFamily: "var(--font-montserrat,sans-serif)", color: "#fff" }}>Early Access Investoren</h1>
        <p style={{ margin: "0 0 12px", fontSize: 11, color: "rgba(255,255,255,0.3)", fontFamily: "var(--font-montserrat,sans-serif)" }}>{rows.length} Einträge</p>
        <input style={inp} placeholder="Suche Name, Firma…" value={search} onChange={e => setSearch(e.target.value)} />
        <select style={{ ...inp, marginTop: 8 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">Alle Status</option>
          {STATUS_OPTS.map(o => <option key={o}>{o}</option>)}
        </select>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px 80px" }}>
        {loading ? (
          <p style={{ textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 13, paddingTop: 40, fontFamily: "var(--font-montserrat,sans-serif)" }}>Lädt…</p>
        ) : filtered.length === 0 ? (
          <p style={{ textAlign: "center", color: "rgba(255,255,255,0.25)", fontSize: 13, paddingTop: 40, fontFamily: "var(--font-montserrat,sans-serif)" }}>
            {rows.length === 0 ? "Noch keine Interessenten eingetragen." : "Keine Ergebnisse."}
          </p>
        ) : (
          filtered.map(inv => <InvestorCard key={inv.id} investor={inv} nr={nrMap[inv.id]} />)
        )}
      </div>
    </div>
  );
}
