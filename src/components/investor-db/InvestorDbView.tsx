"use client";

import { useCallback, useRef, useState } from "react";
import { MessageSquare, Upload } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

export type InvestorDb = {
  id: number;
  name: string;
  unternehmen: string | null;
  typ: string | null;
  email: string | null;
  linkedin: string | null;
  kapital: string | null;
  quelle: string | null;
  score: number | null;
  status: string;
  naechsterSchritt: string | null;
  letzterKont: string | null;
  notizen: string | null;
};

// ── Mock seed data ─────────────────────────────────────────────────────────────

const MOCK: InvestorDb[] = [
  { id: 1,  name: "Thomas Becker",    unternehmen: "Becker Capital GmbH",        typ: "HNWI",         email: "t.becker@becker-capital.de",    linkedin: "linkedin.com/in/thomasbecker",   kapital: "100k–500k",  quelle: "LinkedIn",       score: 4, status: "Neu",        naechsterSchritt: "Erstkontakt senden",    letzterKont: null,         notizen: "" },
  { id: 2,  name: "Sabine Hoffmann",  unternehmen: "Hoffmann Ventures",           typ: "Angel",        email: "s.hoffmann@hoffmann-ventures.de",linkedin: "linkedin.com/in/sabinehoffmann", kapital: "25k–100k",   quelle: "BAND",           score: 3, status: "Kontaktiert", naechsterSchritt: "Follow-up",             letzterKont: "2025-01-15", notizen: "Interesse an Algo-Trading" },
  { id: 3,  name: "Klaus Müller",     unternehmen: "Müller Family Office",        typ: "Family Office",email: "k.mueller@mueller-fo.de",         linkedin: "",                              kapital: "500k+",      quelle: "BaFin",          score: 5, status: "Geantwortet", naechsterSchritt: "Call planen",           letzterKont: "2025-01-20", notizen: "Sehr interessiert, fragt nach Track Record" },
  { id: 4,  name: "Andrea Schmidt",   unternehmen: "Schmidt AG",                  typ: "Unternehmer",  email: "a.schmidt@schmidt-ag.de",         linkedin: "linkedin.com/in/andreaSchmidt", kapital: "50k–200k",   quelle: "Manual",         score: 3, status: "Call",        naechsterSchritt: "Angebot senden",        letzterKont: "2025-01-22", notizen: "" },
  { id: 5,  name: "Markus Weber",     unternehmen: "Weber Invest",                typ: "HNWI",         email: "m.weber@weber-invest.de",          linkedin: "linkedin.com/in/markusweber",   kapital: "100k–300k",  quelle: "Bundesanzeiger", score: 4, status: "Investor",    naechsterSchritt: "Onboarding",            letzterKont: "2025-01-25", notizen: "Vertrag unterzeichnet" },
  { id: 6,  name: "Julia Braun",      unternehmen: "Braun & Partner",             typ: "Angel",        email: "j.braun@braunpartner.de",          linkedin: "",                              kapital: "25k–75k",    quelle: "BAND",           score: 3, status: "Neu",        naechsterSchritt: "Research",              letzterKont: null,         notizen: "" },
  { id: 7,  name: "Stefan Richter",   unternehmen: "Richter Holding",             typ: "Family Office",email: "s.richter@richter-holding.de",     linkedin: "linkedin.com/in/stefanrichter", kapital: "250k–1M",    quelle: "LinkedIn",       score: 5, status: "Geantwortet", naechsterSchritt: "NDA senden",            letzterKont: "2025-01-18", notizen: "Top Priorität" },
  { id: 8,  name: "Petra Klein",      unternehmen: "Selbstständig",               typ: "Privat",       email: "p.klein@gmail.com",                linkedin: "",                              kapital: "25k–50k",    quelle: "Manual",         score: 2, status: "Kontaktiert", naechsterSchritt: "Warten auf Antwort",    letzterKont: "2025-01-10", notizen: "" },
  { id: 9,  name: "Hans Fischer",     unternehmen: "Fischer Vermögensverwaltung", typ: "VC",           email: "h.fischer@fischer-vv.de",          linkedin: "linkedin.com/in/hansfischer",   kapital: "500k+",      quelle: "BaFin",          score: 4, status: "Neu",        naechsterSchritt: "Erstgespräch anfragen", letzterKont: null,         notizen: "Spezialisiert auf Fintech" },
  { id: 10, name: "Lisa Zimmermann",  unternehmen: "Zimmermann Capital",          typ: "HNWI",         email: "l.zimmer@zimmermann-cap.de",       linkedin: "linkedin.com/in/lisazimmer",    kapital: "100k–250k",  quelle: "LinkedIn",       score: 4, status: "Kontaktiert", naechsterSchritt: "Follow-up Montag",      letzterKont: "2025-01-12", notizen: "" },
];

// ── Options ────────────────────────────────────────────────────────────────────

const TYP_OPTS     = ["HNWI", "Angel", "Family Office", "VC", "Unternehmer", "Privat"];
const QUELLE_OPTS  = ["BaFin", "Bundesanzeiger", "LinkedIn", "BAND", "Manual"];
const STATUS_OPTS  = ["Neu", "Kontaktiert", "Geantwortet", "Call", "Investor"];
const SCHRITT_OPTS = ["Erstkontakt senden", "Erstgespräch anfragen", "Follow-up", "Call planen", "NDA senden", "Angebot senden", "Onboarding", "Research", "Warten auf Antwort", "Kein weiterer Schritt"];

// ── Colors ─────────────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, { bg: string; text: string; border: string }> = {
  "Neu":         { bg: "rgba(113,113,122,0.18)", text: "#a1a1aa", border: "rgba(113,113,122,0.35)" },
  "Kontaktiert": { bg: "rgba(59,130,246,0.18)",  text: "#9CA3AF", border: "rgba(59,130,246,0.35)" },
  "Geantwortet": { bg: "rgba(245,158,11,0.18)",  text: "#fbbf24", border: "rgba(245,158,11,0.35)" },
  "Call":        { bg: "rgba(249,115,22,0.18)",  text: "#fb923c", border: "rgba(249,115,22,0.35)" },
  "Investor":    { bg: "rgba(34,197,94,0.18)",   text: "#22C55E", border: "rgba(34,197,94,0.35)" },
};

const QUELLE_COLOR: Record<string, { bg: string; text: string; border: string }> = {
  "BaFin":          { bg: "rgba(20,184,166,0.15)", text: "#2dd4bf", border: "rgba(20,184,166,0.3)" },
  "Bundesanzeiger": { bg: "rgba(30,64,175,0.2)",   text: "#93c5fd", border: "rgba(59,130,246,0.3)" },
  "LinkedIn":       { bg: "rgba(10,102,194,0.18)", text: "#60a5fa", border: "rgba(10,102,194,0.35)" },
  "BAND":           { bg: "rgba(139,92,246,0.15)", text: "#c084fc", border: "rgba(139,92,246,0.3)" },
  "Manual":         { bg: "rgba(63,63,70,0.3)",    text: "#71717a", border: "rgba(63,63,70,0.5)" },
};

const TYP_COLOR: Record<string, { bg: string; text: string; border: string }> = {
  "HNWI":          { bg: "rgba(201,168,76,0.1)",  text: "#c9a84c", border: "rgba(201,168,76,0.25)" },
  "Angel":         { bg: "rgba(249,115,22,0.12)", text: "#fb923c", border: "rgba(249,115,22,0.3)" },
  "Family Office": { bg: "rgba(168,85,247,0.12)", text: "#c084fc", border: "rgba(168,85,247,0.3)" },
  "VC":            { bg: "rgba(239,68,68,0.12)",  text: "#f87171", border: "rgba(239,68,68,0.3)" },
  "Unternehmer":   { bg: "rgba(6,182,212,0.12)",  text: "#22d3ee", border: "rgba(6,182,212,0.3)" },
  "Privat":        { bg: "rgba(113,113,122,0.15)",text: "#a1a1aa", border: "rgba(113,113,122,0.3)" },
};

// ── Shared styles ──────────────────────────────────────────────────────────────

const T = "var(--font-text)";

const inp: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)", borderRadius: 5, color: "#e4e4e7",
  fontSize: 12, fontFamily: T, padding: "4px 9px", outline: "none",
};

const editSt: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", background: "transparent", border: "none",
  borderBottom: "1px solid rgba(255,255,255,0.5)", color: "#f0f0f2",
  fontSize: 12, fontFamily: T, padding: "0 2px", outline: "none", caretColor: "#fff",
};
const selSt: React.CSSProperties = { ...editSt, background: "#141416", cursor: "pointer" };

const btnSt: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 5,
  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 6, padding: "5px 12px", color: "rgba(255,255,255,0.6)",
  cursor: "pointer", fontSize: 11, fontWeight: 700, fontFamily: T, letterSpacing: "0.04em",
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function Badge({ label, map }: { label: string | null; map: Record<string, { bg: string; text: string; border: string }> }) {
  if (!label) return <span style={{ color: "rgba(255,255,255,0.18)", fontSize: 10 }}>—</span>;
  const c = map[label] ?? { bg: "rgba(63,63,70,0.3)", text: "#71717a", border: "rgba(63,63,70,0.4)" };
  return (
    <span style={{ display: "inline-block", padding: "2px 7px", borderRadius: 4, fontSize: 10, fontWeight: 700, fontFamily: T, letterSpacing: "0.03em", background: c.bg, color: c.text, border: `1px solid ${c.border}`, whiteSpace: "nowrap" }}>
      {label}
    </span>
  );
}

function Stars({ n }: { n: number | null }) {
  const v = n ?? 0;
  return (
    <span style={{ display: "inline-flex", gap: 1 }}>
      {[1,2,3,4,5].map(i => (
        <span key={i} style={{ color: i <= v ? "#c9a84c" : "rgba(255,255,255,0.1)", fontSize: 11, lineHeight: 1 }}>★</span>
      ))}
    </span>
  );
}

// ── Column definitions ─────────────────────────────────────────────────────────

type ColKey = keyof Omit<InvestorDb, "id">;
type Col = { key: ColKey; label: string; w: number };

const COLS: Col[] = [
  { key: "name",            label: "Name",              w: 140 },
  { key: "unternehmen",     label: "Unternehmen",       w: 140 },
  { key: "typ",             label: "Typ",               w: 110 },
  { key: "email",           label: "E-Mail",            w: 165 },
  { key: "linkedin",        label: "LinkedIn",          w: 80  },
  { key: "kapital",         label: "Kapital",           w: 110 },
  { key: "quelle",          label: "Quelle",            w: 120 },
  { key: "score",           label: "Score",             w: 90  },
  { key: "status",          label: "Status",            w: 115 },
  { key: "naechsterSchritt",label: "Nächster Schritt",  w: 160 },
  { key: "letzterKont",     label: "Letzter Kont.",     w: 100 },
  { key: "notizen",         label: "Notizen",           w: 180 },
];

const TABS = ["Alle", "Neu", "Kontaktiert", "Geantwortet", "Call", "Investor"] as const;
type Tab = typeof TABS[number];

// ── Edit cell ─────────────────────────────────────────────────────────────────

function EditCell({ col, value, onSave, onClose }: { col: ColKey; value: string | null; onSave: (v: string | null) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(value ?? "");
  const commit = (v: string) => { onSave(v.trim() || null); onClose(); };

  const dropOpts =
    col === "typ" ? TYP_OPTS :
    col === "quelle" ? QUELLE_OPTS :
    col === "status" ? STATUS_OPTS :
    col === "naechsterSchritt" ? SCHRITT_OPTS : null;

  if (col === "score") return (
    <select autoFocus style={selSt} value={draft} onChange={e => { setDraft(e.target.value); commit(e.target.value); }} onBlur={() => commit(draft)}>
      <option value="">—</option>
      {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
    </select>
  );
  if (dropOpts) return (
    <select autoFocus style={selSt} value={draft} onChange={e => { setDraft(e.target.value); commit(e.target.value); }} onBlur={() => commit(draft)}>
      <option value="">—</option>
      {dropOpts.map(o => <option key={o}>{o}</option>)}
    </select>
  );
  if (col === "letzterKont") return (
    <input autoFocus type="date" style={editSt} value={draft} onChange={e => setDraft(e.target.value)} onBlur={() => commit(draft)} />
  );
  return (
    <input autoFocus type={col === "email" ? "email" : "text"} style={editSt} value={draft}
      onChange={e => setDraft(e.target.value)} onBlur={() => commit(draft)}
      onKeyDown={e => e.key === "Enter" && commit(draft)} />
  );
}

// ── Add modal ─────────────────────────────────────────────────────────────────

function AddModal({ onClose, onAdd }: { onClose: () => void; onAdd: (row: Omit<InvestorDb,"id">) => void }) {
  const [form, setForm] = useState<Partial<Omit<InvestorDb,"id">>>({ status: "Neu" });
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof Omit<InvestorDb,"id">, v: string | null) => setForm(f => ({ ...f, [k]: v }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name?.trim()) { setErr("Name ist Pflichtfeld"); return; }
    onAdd({ name: form.name.trim(), unternehmen: form.unternehmen ?? null, typ: form.typ ?? null, email: form.email ?? null, linkedin: form.linkedin ?? null, kapital: form.kapital ?? null, quelle: form.quelle ?? null, score: form.score ?? null, status: form.status ?? "Neu", naechsterSchritt: form.naechsterSchritt ?? null, letzterKont: form.letzterKont ?? null, notizen: form.notizen ?? null });
    onClose();
  }

  const lbl = (text: string) => (
    <label style={{ display: "block", fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.28)", fontFamily: T, letterSpacing: "0.07em", textTransform: "uppercase" as const, marginBottom: 4 }}>{text}</label>
  );

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2000, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "#0c0d10", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, width: "100%", maxWidth: 580, maxHeight: "88vh", overflowY: "auto", padding: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: "rgba(255,255,255,0.7)", fontFamily: T }}>Investor hinzufügen</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.35)", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>✕</button>
        </div>
        <form onSubmit={submit}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {([ { k: "name" as const, label: "Name *" }, { k: "unternehmen" as const, label: "Unternehmen" }, { k: "email" as const, label: "E-Mail" }, { k: "linkedin" as const, label: "LinkedIn URL" }, { k: "kapital" as const, label: "Kapital" } ] as { k: keyof Omit<InvestorDb,"id">; label: string }[]).map(({ k, label }) => (
              <div key={k}>{lbl(label)}<input style={inp} value={(form[k] as string) ?? ""} onChange={e => set(k, e.target.value || null)} /></div>
            ))}
            {([ { k: "typ" as const, label: "Typ", opts: TYP_OPTS }, { k: "quelle" as const, label: "Quelle", opts: QUELLE_OPTS }, { k: "status" as const, label: "Status", opts: STATUS_OPTS }, { k: "naechsterSchritt" as const, label: "Nächster Schritt", opts: SCHRITT_OPTS } ] as { k: keyof Omit<InvestorDb,"id">; label: string; opts: string[] }[]).map(({ k, label, opts }) => (
              <div key={k}>{lbl(label)}<select style={inp} value={(form[k] as string) ?? ""} onChange={e => set(k, e.target.value || null)}><option value="">—</option>{opts.map(o => <option key={o}>{o}</option>)}</select></div>
            ))}
            <div>{lbl("Score")}<select style={inp} value={form.score?.toString() ?? ""} onChange={e => set("score" as keyof Omit<InvestorDb,"id">, e.target.value || null)}><option value="">—</option>{[1,2,3,4,5].map(n => <option key={n} value={n}>{n} ★</option>)}</select></div>
            <div>{lbl("Letzter Kontakt")}<input style={inp} type="date" value={form.letzterKont ?? ""} onChange={e => set("letzterKont", e.target.value || null)} /></div>
          </div>
          <div style={{ marginTop: 10 }}>{lbl("Notizen")}<textarea style={{ ...inp, height: 60, resize: "vertical" }} value={form.notizen ?? ""} onChange={e => set("notizen", e.target.value || null)} /></div>
          {err && <p style={{ color: "#f87171", fontSize: 11, marginTop: 6, fontFamily: T }}>{err}</p>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
            <button type="button" onClick={onClose} style={btnSt}>Abbrechen</button>
            <button type="submit" style={btnSt}>Hinzufügen</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── CSV modal ─────────────────────────────────────────────────────────────────

function CsvModal({ onClose, onImport }: { onClose: () => void; onImport: (rows: Omit<InvestorDb,"id">[]) => void }) {
  const [text, setText] = useState("");
  const [err, setErr]   = useState<string | null>(null);

  function parse() {
    const lines = text.trim().split("\n").filter(Boolean);
    if (lines.length < 2) { setErr("Mindestens eine Kopfzeile + eine Datenzeile."); return; }
    const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
    const rows: Omit<InvestorDb,"id">[] = [];
    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].split(",").map(v => v.trim());
      const row: Record<string,string> = {};
      headers.forEach((h, idx) => { if (vals[idx]) row[h] = vals[idx]; });
      if (!row.name) continue;
      rows.push({ name: row.name, unternehmen: row.unternehmen ?? null, typ: row.typ ?? null, email: row.email ?? null, linkedin: row.linkedin ?? null, kapital: row.kapital ?? null, quelle: row.quelle ?? null, score: row.score ? parseInt(row.score) : null, status: row.status ?? "Neu", naechsterSchritt: row.naechsterschritt ?? null, letzterKont: row.letzterkont ?? null, notizen: row.notizen ?? null });
    }
    if (!rows.length) { setErr("Keine gültigen Zeilen gefunden."); return; }
    onImport(rows); onClose();
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2000, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "#0c0d10", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, width: "100%", maxWidth: 500, padding: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: "rgba(255,255,255,0.7)", fontFamily: T }}>CSV importieren</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.35)", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>✕</button>
        </div>
        <p style={{ margin: "0 0 8px", fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: T }}>Kopfzeile: name, unternehmen, typ, email, linkedin, kapital, quelle, score, status, naechsterschritt, notizen</p>
        <textarea style={{ ...inp, height: 150, resize: "vertical" }} placeholder={"name,email,status\nMax Mustermann,max@example.com,Neu"} value={text} onChange={e => setText(e.target.value)} />
        {err && <p style={{ color: "#f87171", fontSize: 11, marginTop: 4, fontFamily: T }}>{err}</p>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
          <button onClick={onClose} style={btnSt}>Abbrechen</button>
          <button onClick={parse} style={btnSt}>Importieren</button>
        </div>
      </div>
    </div>
  );
}

// ── Main view ──────────────────────────────────────────────────────────────────

export function InvestorDbView() {
  const nextId = useRef(MOCK.length + 1);
  const [rows, setRows]         = useState<InvestorDb[]>(MOCK);
  const [search, setSearch]     = useState("");
  const [tab, setTab]           = useState<Tab>("Alle");
  const [activeCell, setActiveCell] = useState<string | null>(null);
  const [showAdd, setShowAdd]   = useState(false);
  const [showCsv, setShowCsv]   = useState(false);

  const patch = useCallback((id: number, key: ColKey, value: string | null) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [key]: key === "score" ? (value ? parseInt(value) : null) : value } : r));
  }, []);

  function del(id: number) {
    if (!confirm("Löschen?")) return;
    setRows(prev => prev.filter(r => r.id !== id));
  }

  function addRow(row: Omit<InvestorDb,"id">) {
    setRows(prev => [...prev, { ...row, id: nextId.current++ }]);
  }

  function importRows(rows: Omit<InvestorDb,"id">[]) {
    setRows(prev => [...prev, ...rows.map(r => ({ ...r, id: nextId.current++ }))]);
  }

  const tabCount = (t: Tab) => t === "Alle" ? rows.length : rows.filter(r => r.status === t).length;

  const filtered = rows.filter(r => {
    if (tab !== "Alle" && r.status !== tab) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (["name","unternehmen","email"] as ColKey[]).some(k => (r[k] ?? "").toString().toLowerCase().includes(q));
  });

  const nrMap = Object.fromEntries(rows.map((r, i) => [r.id, i + 1]));

  const th: React.CSSProperties = {
    padding: "0 8px", height: 30, textAlign: "left", fontSize: 10, fontWeight: 700,
    color: "rgba(255,255,255,0.58)", fontFamily: T, letterSpacing: "0.06em",
    textTransform: "uppercase", whiteSpace: "nowrap", userSelect: "none",
    borderBottom: "1px solid rgba(255,255,255,0.1)",
  };
  const td: React.CSSProperties = {
    padding: "0 8px", height: 34, verticalAlign: "middle",
    borderBottom: "1px solid rgba(255,255,255,0.04)", whiteSpace: "nowrap", overflow: "hidden",
  };

  function renderCell(row: InvestorDb, col: Col) {
    const key = col.key;
    const val = row[key];
    if (key === "status")    return <Badge label={val as string|null} map={STATUS_COLOR} />;
    if (key === "quelle")    return <Badge label={val as string|null} map={QUELLE_COLOR} />;
    if (key === "typ")       return <Badge label={val as string|null} map={TYP_COLOR} />;
    if (key === "score")     return <Stars n={val as number|null} />;
    if (key === "letzterKont") return <span style={{ fontSize: 12, fontFamily: T, color: val ? "#e4e4e7" : "rgba(255,255,255,0.2)" }}>{fmtDate(val as string|null) || "—"}</span>;
    if (key === "linkedin" && val) return (
      <a href={`https://${(val as string).replace(/^https?:\/\//,"")}`} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ color: "#60a5fa", fontSize: 11 }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ verticalAlign: "middle" }}><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>
      </a>
    );
    return <span style={{ fontSize: 12, fontFamily: T, color: val ? "#e4e4e7" : "rgba(255,255,255,0.2)", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{(val as string|null) ?? "—"}</span>;
  }

  return (
    <div
      style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, background: "#0a0a0c", color: "#e4e4e7", position: "relative" }}
      onClick={() => setActiveCell(null)}
    >
      {/* ── Header row ── */}
      <div
        style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 14px", height: 46, flexShrink: 0, borderBottom: "1px solid rgba(255,255,255,0.07)" }}
        onClick={e => e.stopPropagation()}
      >
        <span style={{ fontSize: 13, fontWeight: 800, color: "rgba(255,255,255,0.7)", fontFamily: T, flexShrink: 0, letterSpacing: "0.01em" }}>Investor DB</span>
        <input
          style={{ width: 150, flexShrink: 0, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 5, color: "#e4e4e7", fontSize: 12, padding: "4px 9px", fontFamily: T, outline: "none" }}
          placeholder="Suche…" value={search} onChange={e => setSearch(e.target.value)}
        />
        <div style={{ flex: 1, display: "flex", alignItems: "center", overflow: "hidden" }}>
          {[
            { label: "Gesamt",     value: String(rows.length) },
            { label: "Investoren", value: String(rows.filter(r => r.status === "Investor").length) },
            { label: "Warm",       value: String(rows.filter(r => ["Geantwortet","Call"].includes(r.status)).length) },
          ].map(k => (
            <div key={k.label} style={{ display: "flex", alignItems: "baseline", gap: 4, padding: "0 13px", borderLeft: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.28)", fontFamily: T, letterSpacing: "0.07em", textTransform: "uppercase" }}>{k.label}</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: "#e4e4e7", fontFamily: T }}>{k.value}</span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          <button onClick={() => setShowCsv(true)} style={{ ...btnSt, color: "rgba(255,255,255,0.5)" }}>
            <Upload size={11} strokeWidth={1.8} />CSV
          </button>
          <button onClick={() => setShowAdd(true)} style={btnSt}>
            <MessageSquare size={11} strokeWidth={1.65} />+ Investor
          </button>
        </div>
      </div>

      {/* ── Filter tabs ── */}
      <div
        style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,0.07)", paddingLeft: 14, flexShrink: 0 }}
        onClick={e => e.stopPropagation()}
      >
        {TABS.map(t => {
          const active = tab === t;
          return (
            <button key={t} onClick={() => setTab(t)} style={{
              background: "none", border: "none",
              borderBottom: active ? "1.5px solid rgba(201,168,76,0.75)" : "1.5px solid transparent",
              padding: "6px 12px", cursor: "pointer",
              color: active ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.28)",
              fontSize: 10, fontWeight: 700, fontFamily: T, letterSpacing: "0.06em",
              textTransform: "uppercase", transition: "color 120ms, border-color 120ms",
              marginBottom: -1, display: "flex", alignItems: "center", gap: 5,
            }}>
              {t} <span style={{ color: active ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.15)", fontWeight: 600 }}>{tabCount(t)}</span>
            </button>
          );
        })}
      </div>

      {/* ── Table ── */}
      <div
        style={{ flex: 1, minHeight: 0, overflowX: "auto", overflowY: "auto", position: "relative" }}
        onClick={e => e.stopPropagation()}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1300, tableLayout: "fixed" }}>
          <thead style={{ position: "sticky", top: 0, zIndex: 10, background: "#0a0a0c" }}>
            <tr>
              <th style={{ ...th, width: 36, paddingLeft: 14 }}>#</th>
              {COLS.map(c => <th key={c.key} style={{ ...th, width: c.w }}>{c.label}</th>)}
              <th style={{ ...th, width: 34 }} />
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, ri) => (
              <tr key={row.id} style={{ background: ri % 2 === 0 ? "transparent" : "rgba(255,255,255,0.013)" }}>
                <td style={{ ...td, width: 36, paddingLeft: 14 }}>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.48)", fontFamily: T, fontWeight: 500 }}>{nrMap[row.id]}</span>
                </td>
                {COLS.map(col => {
                  const cellId = `${row.id}:${col.key}`;
                  const isActive = activeCell === cellId;
                  return (
                    <td key={col.key} style={{ ...td, width: col.w, background: isActive ? "rgba(255,255,255,0.06)" : undefined, boxShadow: isActive ? "inset 0 0 0 1px rgba(255,255,255,0.15)" : undefined }}
                      onClick={e => { e.stopPropagation(); setActiveCell(cellId); }}>
                      {isActive ? (
                        <EditCell col={col.key} value={row[col.key]?.toString() ?? null}
                          onSave={v => patch(row.id, col.key, v)} onClose={() => setActiveCell(null)} />
                      ) : renderCell(row, col)}
                    </td>
                  );
                })}
                <td style={{ ...td, width: 34 }}>
                  <button onClick={e => { e.stopPropagation(); del(row.id); }} style={{ background: "none", border: "none", color: "rgba(239,68,68,0.35)", cursor: "pointer", fontSize: 13, padding: "2px 4px" }} title="Löschen">✕</button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={COLS.length + 2} style={{ ...td, textAlign: "center", color: "rgba(255,255,255,0.18)", fontSize: 11, fontFamily: T, letterSpacing: "0.05em", height: 48 }}>
                {rows.length === 0 ? "Noch keine Einträge" : "Keine Treffer"}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showAdd && <AddModal onClose={() => setShowAdd(false)} onAdd={addRow} />}
      {showCsv && <CsvModal onClose={() => setShowCsv(false)} onImport={importRows} />}
    </div>
  );
}
