"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SentinelChat } from "@/components/investors-crm/SentinelChat";

// ── Types ──────────────────────────────────────────────────────────────────────

export type InvestorDb = {
  id: string;
  name: string;
  unternehmen: string | null;
  typ: string | null;
  email: string | null;
  linkedin: string | null;
  kapital: string | null;
  quelle: string | null;
  score: number | null;
  status: string;
  naechster_schritt: string | null;
  letzter_kontakt: string | null;
  notizen: string | null;
  created_at: string;
};

// ── Options ────────────────────────────────────────────────────────────────────

const TYP_OPTS      = ["HNWI", "Angel", "Family Office", "VC", "Unternehmer", "Privat"];
const QUELLE_OPTS   = ["BaFin", "Bundesanzeiger", "LinkedIn", "BAND", "Manual"];
const STATUS_OPTS   = ["Neu", "Kontaktiert", "Geantwortet", "Call", "Investor"];
const SCHRITT_OPTS  = ["Erstkontakt", "E-Mail senden", "Rückruf", "Call vereinbaren", "Follow-up", "Kein weiterer Schritt"];

// ── Colors ─────────────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, { bg: string; text: string; border: string }> = {
  "Neu":         { bg: "rgba(113,113,122,0.15)", text: "#a1a1aa", border: "rgba(113,113,122,0.3)" },
  "Kontaktiert": { bg: "rgba(59,130,246,0.15)",  text: "#60a5fa", border: "rgba(59,130,246,0.3)" },
  "Geantwortet": { bg: "rgba(245,158,11,0.15)",  text: "#fbbf24", border: "rgba(245,158,11,0.3)" },
  "Call":        { bg: "rgba(249,115,22,0.15)",  text: "#fb923c", border: "rgba(249,115,22,0.3)" },
  "Investor":    { bg: "rgba(34,197,94,0.15)",   text: "#4ade80", border: "rgba(34,197,94,0.3)" },
};

const QUELLE_COLOR: Record<string, { bg: string; text: string; border: string }> = {
  "BaFin":          { bg: "rgba(20,184,166,0.12)", text: "#2dd4bf", border: "rgba(20,184,166,0.3)" },
  "Bundesanzeiger": { bg: "rgba(30,64,175,0.2)",   text: "#93c5fd", border: "rgba(59,130,246,0.3)" },
  "LinkedIn":       { bg: "rgba(10,102,194,0.18)", text: "#60a5fa", border: "rgba(10,102,194,0.35)" },
  "BAND":           { bg: "rgba(139,92,246,0.15)", text: "#c084fc", border: "rgba(139,92,246,0.3)" },
  "Manual":         { bg: "rgba(63,63,70,0.3)",    text: "#71717a", border: "rgba(63,63,70,0.5)" },
};

const TYP_COLOR: Record<string, { bg: string; text: string; border: string }> = {
  "HNWI":         { bg: "rgba(226,202,122,0.12)", text: "#e2ca7a", border: "rgba(226,202,122,0.3)" },
  "Angel":        { bg: "rgba(249,115,22,0.12)",  text: "#fb923c", border: "rgba(249,115,22,0.3)" },
  "Family Office":{ bg: "rgba(168,85,247,0.12)",  text: "#c084fc", border: "rgba(168,85,247,0.3)" },
  "VC":           { bg: "rgba(239,68,68,0.12)",   text: "#f87171", border: "rgba(239,68,68,0.3)" },
  "Unternehmer":  { bg: "rgba(6,182,212,0.12)",   text: "#22d3ee", border: "rgba(6,182,212,0.3)" },
  "Privat":       { bg: "rgba(113,113,122,0.15)", text: "#a1a1aa", border: "rgba(113,113,122,0.3)" },
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function Badge({ label, colorMap }: { label: string | null; colorMap: Record<string, { bg: string; text: string; border: string }> }) {
  if (!label) return <span style={{ color: "rgba(255,255,255,0.18)", fontSize: 11 }}>—</span>;
  const c = colorMap[label] ?? { bg: "rgba(63,63,70,0.3)", text: "#71717a", border: "rgba(63,63,70,0.4)" };
  return (
    <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, fontFamily: "var(--font-montserrat,sans-serif)", letterSpacing: "0.02em", background: c.bg, color: c.text, border: `1px solid ${c.border}`, whiteSpace: "nowrap" }}>
      {label}
    </span>
  );
}

function Stars({ score }: { score: number | null }) {
  const n = score ?? 0;
  return (
    <span style={{ display: "inline-flex", gap: 2 }}>
      {[1,2,3,4,5].map(i => (
        <span key={i} style={{ color: i <= n ? "#e2ca7a" : "rgba(255,255,255,0.12)", fontSize: 13, lineHeight: 1 }}>★</span>
      ))}
    </span>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const T = "var(--font-montserrat,sans-serif)";

const inp: React.CSSProperties = {
  width: "100%", boxSizing: "border-box",
  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 6, color: "#e4e4e7", fontSize: 13, fontFamily: T,
  padding: "7px 10px", outline: "none",
};
const btnPrimary: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6,
  background: "linear-gradient(180deg,rgba(200,176,112,0.22) 0%,rgba(184,154,80,0.18) 100%)",
  border: "1px solid rgba(200,176,112,0.35)",
  color: "#e2ca7a", borderRadius: 6, padding: "7px 14px", fontSize: 12, fontWeight: 700,
  fontFamily: T, cursor: "pointer", letterSpacing: "0.04em",
};
const btnSecondary: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6,
  background: "transparent", border: "1px solid rgba(255,255,255,0.12)",
  color: "rgba(255,255,255,0.5)", borderRadius: 6, padding: "7px 12px", fontSize: 12,
  fontFamily: T, cursor: "pointer",
};
const tdS: React.CSSProperties = {
  padding: "0 10px", height: 40, verticalAlign: "middle",
  borderBottom: "1px solid rgba(255,255,255,0.05)", whiteSpace: "nowrap",
};
const cellTxt: React.CSSProperties = { fontSize: 12, color: "#e4e4e7", fontFamily: T };

// ── Column definitions ─────────────────────────────────────────────────────────

type ColKey = keyof Omit<InvestorDb, "id" | "created_at">;
type Col = { key: ColKey; label: string; w: number };

const COLS: Col[] = [
  { key: "name",              label: "Name",            w: 150 },
  { key: "unternehmen",       label: "Unternehmen",     w: 130 },
  { key: "typ",               label: "Typ",             w: 120 },
  { key: "email",             label: "E-Mail",          w: 170 },
  { key: "linkedin",          label: "LinkedIn",        w: 90  },
  { key: "kapital",           label: "Kapital",         w: 130 },
  { key: "quelle",            label: "Quelle",          w: 130 },
  { key: "score",             label: "Score",           w: 110 },
  { key: "status",            label: "Status",          w: 120 },
  { key: "naechster_schritt", label: "Nächster Schritt",w: 160 },
  { key: "letzter_kontakt",   label: "Letzter Kont.",   w: 110 },
  { key: "notizen",           label: "Notizen",         w: 180 },
];

// ── Filter tabs ────────────────────────────────────────────────────────────────

const STATUS_TABS = ["Alle", "Neu", "Kontaktiert", "Geantwortet", "Call", "Investor"] as const;
type StatusTab = typeof STATUS_TABS[number];

// ── Inline edit cell ───────────────────────────────────────────────────────────

function EditCell({ colKey, value, onSave }: { colKey: ColKey; value: string | null; onSave: (v: string | null) => void }) {
  const [draft, setDraft] = useState(value ?? "");
  const isDropdown = ["typ", "quelle", "status", "naechster_schritt"].includes(colKey);
  const isDate     = colKey === "letzter_kontakt";
  const isScore    = colKey === "score";
  const opts = colKey === "typ" ? TYP_OPTS : colKey === "quelle" ? QUELLE_OPTS : colKey === "status" ? STATUS_OPTS : SCHRITT_OPTS;
  const commit = () => onSave(draft.trim() || null);

  if (isScore) return (
    <select autoFocus style={{ ...inp, padding: "3px 6px", fontSize: 12 }} value={draft}
      onChange={e => { setDraft(e.target.value); onSave(e.target.value || null); }}>
      <option value="">—</option>
      {[1,2,3,4,5].map(n => <option key={n} value={n}>{n} ★</option>)}
    </select>
  );
  if (isDropdown) return (
    <select autoFocus style={{ ...inp, padding: "3px 6px", fontSize: 12 }} value={draft}
      onChange={e => { setDraft(e.target.value); onSave(e.target.value || null); }}>
      <option value="">—</option>
      {opts.map(o => <option key={o}>{o}</option>)}
    </select>
  );
  if (isDate) return (
    <input autoFocus type="date" style={{ ...inp, padding: "3px 6px", fontSize: 12 }} value={draft}
      onChange={e => setDraft(e.target.value)} onBlur={commit} />
  );
  return (
    <input autoFocus type={colKey === "email" ? "email" : "text"}
      style={{ ...inp, padding: "3px 6px", fontSize: 12 }} value={draft}
      onChange={e => setDraft(e.target.value)} onBlur={commit}
      onKeyDown={e => e.key === "Enter" && commit()} />
  );
}

// ── CSV import modal ───────────────────────────────────────────────────────────

function CsvModal({ onClose, onImport }: { onClose: () => void; onImport: (rows: Partial<InvestorDb>[]) => void }) {
  const [text, setText] = useState("");
  const [err, setErr]   = useState<string | null>(null);

  function parse() {
    const lines = text.trim().split("\n").filter(Boolean);
    if (lines.length < 2) { setErr("Mindestens eine Kopfzeile + eine Datenzeile erwartet."); return; }
    const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
    const rows: Partial<InvestorDb>[] = [];
    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].split(",").map(v => v.trim());
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => { if (vals[idx]) row[h] = vals[idx]; });
      if (!row.name) continue;
      rows.push({
        name: row.name, unternehmen: row.unternehmen || null, typ: row.typ || null,
        email: row.email || null, linkedin: row.linkedin || null, kapital: row.kapital || null,
        quelle: row.quelle || null, score: row.score ? parseInt(row.score) : null,
        status: row.status || "Neu", notizen: row.notizen || null,
      });
    }
    if (!rows.length) { setErr("Keine gültigen Zeilen mit 'name'-Spalte gefunden."); return; }
    onImport(rows);
    onClose();
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2000, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "#111214", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, width: "100%", maxWidth: 560, padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#fff", fontFamily: T }}>CSV importieren</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>
        <p style={{ margin: "0 0 10px", fontSize: 11, color: "rgba(255,255,255,0.4)", fontFamily: T }}>
          Spalten: name, unternehmen, typ, email, linkedin, kapital, quelle, score, status, notizen
        </p>
        <textarea style={{ ...inp, height: 180, resize: "vertical", fontSize: 12 }}
          placeholder={"name,unternehmen,typ,email,kapital,quelle,score,status\nMax Mustermann,GmbH,HNWI,max@example.com,50k–100k,LinkedIn,4,Neu"}
          value={text} onChange={e => setText(e.target.value)} />
        {err && <p style={{ color: "#f87171", fontSize: 12, marginTop: 6, fontFamily: T }}>{err}</p>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
          <button style={btnSecondary} onClick={onClose}>Abbrechen</button>
          <button style={btnPrimary} onClick={parse}>Importieren</button>
        </div>
      </div>
    </div>
  );
}

// ── Add investor modal (uses shared Sentinel chat) ─────────────────────────────
// Sentinel is re-used for investor_database entries too via a separate flow below.

function AddModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<Partial<InvestorDb>>({ status: "Neu" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof InvestorDb, v: string | null) => setForm(f => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name?.trim()) { setErr("Name ist Pflichtfeld"); return; }
    setSaving(true);
    try {
      const r = await fetch("/api/investor-db", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!r.ok) throw new Error((await r.json()).error ?? "Fehler");
      onSaved(); onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Fehler");
    } finally { setSaving(false); }
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2000, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "#111214", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, width: "100%", maxWidth: 640, maxHeight: "90vh", overflowY: "auto", padding: 26 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#fff", fontFamily: T }}>Investor hinzufügen</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>
        <form onSubmit={submit}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[
              { k: "name" as const,        label: "Name *",          required: true  },
              { k: "unternehmen" as const, label: "Unternehmen"                      },
              { k: "email" as const,       label: "E-Mail"                           },
              { k: "linkedin" as const,    label: "LinkedIn URL"                     },
              { k: "kapital" as const,     label: "Kapital"                          },
            ].map(({ k, label, required }) => (
              <div key={k}>
                <label style={{ display: "block", fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 4, fontFamily: T, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {label}{required && <span style={{ color: "#f87171" }}> *</span>}
                </label>
                <input style={inp} value={(form[k] as string) ?? ""} onChange={e => set(k, e.target.value || null)} />
              </div>
            ))}
            {([
              { k: "typ" as const,               label: "Typ",             opts: TYP_OPTS    },
              { k: "quelle" as const,            label: "Quelle",          opts: QUELLE_OPTS },
              { k: "status" as const,            label: "Status",          opts: STATUS_OPTS },
              { k: "naechster_schritt" as const, label: "Nächster Schritt",opts: SCHRITT_OPTS},
            ] as { k: keyof InvestorDb; label: string; opts: string[] }[]).map(({ k, label, opts }) => (
              <div key={k}>
                <label style={{ display: "block", fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 4, fontFamily: T, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</label>
                <select style={inp} value={(form[k] as string) ?? ""} onChange={e => set(k, e.target.value || null)}>
                  <option value="">—</option>
                  {opts.map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
            ))}
            <div>
              <label style={{ display: "block", fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 4, fontFamily: T, textTransform: "uppercase", letterSpacing: "0.05em" }}>Score</label>
              <select style={inp} value={form.score?.toString() ?? ""} onChange={e => set("score" as keyof InvestorDb, e.target.value || null)}>
                <option value="">—</option>
                {[1,2,3,4,5].map(n => <option key={n} value={n}>{n} ★</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: "block", fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 4, fontFamily: T, textTransform: "uppercase", letterSpacing: "0.05em" }}>Letzter Kontakt</label>
              <input style={inp} type="date" value={form.letzter_kontakt ?? ""} onChange={e => set("letzter_kontakt", e.target.value || null)} />
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <label style={{ display: "block", fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 4, fontFamily: T, textTransform: "uppercase", letterSpacing: "0.05em" }}>Notizen</label>
            <textarea style={{ ...inp, height: 72, resize: "vertical" }} value={form.notizen ?? ""} onChange={e => set("notizen", e.target.value || null)} />
          </div>
          {err && <p style={{ color: "#f87171", fontSize: 12, marginTop: 8, fontFamily: T }}>{err}</p>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
            <button type="button" style={btnSecondary} onClick={onClose}>Abbrechen</button>
            <button type="submit" style={btnPrimary} disabled={saving}>{saving ? "Speichert…" : "Hinzufügen"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Toast ──────────────────────────────────────────────────────────────────────

function Toast({ msg, onDone }: { msg: string; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t); }, [onDone]);
  return (
    <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", zIndex: 9000, background: "rgba(34,197,94,0.18)", border: "1px solid rgba(34,197,94,0.4)", color: "#4ade80", borderRadius: 8, padding: "10px 20px", fontSize: 13, fontFamily: T, fontWeight: 600, backdropFilter: "blur(8px)" }}>
      {msg}
    </div>
  );
}

// ── Empty state ────────────────────────────────────────────────────────────────

function EmptyState({ onAdd, onCsv }: { onAdd: () => void; onCsv: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, gap: 14, padding: "60px 20px" }}>
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
      <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.4)", fontFamily: T }}>Noch keine Investoren</p>
      <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.25)", fontFamily: T, textAlign: "center" }}>
        Importiere eine CSV oder füge Kontakte manuell hinzu.
      </p>
      <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
        <button style={btnPrimary} onClick={onAdd}>+ Investor hinzufügen</button>
        <button style={btnSecondary} onClick={onCsv}>CSV importieren</button>
      </div>
    </div>
  );
}

// ── Main view ──────────────────────────────────────────────────────────────────

type SortDir = "asc" | "desc";

export function InvestorDbView() {
  const [rows, setRows]           = useState<InvestorDb[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState("");
  const [activeTab, setActiveTab] = useState<StatusTab>("Alle");
  const [sortKey, setSortKey]     = useState<ColKey>("name");
  const [sortDir, setSortDir]     = useState<SortDir>("asc");
  const [showAdd, setShowAdd]     = useState(false);
  const [showCsv, setShowCsv]     = useState(false);
  const [showSentinel, setSentinel] = useState(false);
  const [editId, setEditId]       = useState<string | null>(null);
  const [editCol, setEditCol]     = useState<ColKey | null>(null);
  const [toast, setToast]         = useState<string | null>(null);
  const savingRef                 = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/investor-db");
      if (r.ok) setRows(await r.json());
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function patch(id: string, key: ColKey, value: string | null) {
    if (savingRef.current) return;
    savingRef.current = true;
    setRows(prev => prev.map(r => r.id === id ? { ...r, [key]: key === "score" ? (value ? parseInt(value) : null) : value } : r));
    try {
      await fetch(`/api/investor-db/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [key]: key === "score" ? (value ? parseInt(value) : null) : value }) });
    } finally { savingRef.current = false; }
  }

  async function del(id: string) {
    if (!confirm("Investor wirklich löschen?")) return;
    await fetch(`/api/investor-db/${id}`, { method: "DELETE" });
    setRows(prev => prev.filter(r => r.id !== id));
  }

  async function importRows(newRows: Partial<InvestorDb>[]) {
    let count = 0;
    for (const row of newRows) {
      const r = await fetch("/api/investor-db", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(row) });
      if (r.ok) count++;
    }
    setToast(`${count} Kontakt${count !== 1 ? "e" : ""} importiert`);
    load();
  }

  function toggleSort(key: ColKey) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  const tabCount = (tab: StatusTab) => tab === "Alle" ? rows.length : rows.filter(r => r.status === tab).length;

  const filtered = rows
    .filter(r => {
      const q = search.toLowerCase();
      if (q && !["name","unternehmen","email"].some(k => (r[k as keyof InvestorDb] ?? "").toString().toLowerCase().includes(q))) return false;
      if (activeTab !== "Alle" && r.status !== activeTab) return false;
      return true;
    })
    .sort((a, b) => {
      const va = (a[sortKey] ?? "").toString();
      const vb = (b[sortKey] ?? "").toString();
      return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
    });

  const nrMap = Object.fromEntries(rows.map((r, i) => [r.id, i + 1]));

  const thS = (key: ColKey): React.CSSProperties => ({
    padding: "0 10px", height: 36, textAlign: "left", fontSize: 11, fontWeight: 700,
    color: "rgba(255,255,255,0.35)", fontFamily: T, letterSpacing: "0.06em",
    textTransform: "uppercase", cursor: "pointer", whiteSpace: "nowrap", userSelect: "none",
    background: sortKey === key ? "rgba(255,255,255,0.04)" : "transparent",
  });

  function renderCell(row: InvestorDb, col: Col) {
    const raw = row[col.key];
    if (col.key === "status")   return <Badge label={raw as string | null} colorMap={STATUS_COLOR} />;
    if (col.key === "quelle")   return <Badge label={raw as string | null} colorMap={QUELLE_COLOR} />;
    if (col.key === "typ")      return <Badge label={raw as string | null} colorMap={TYP_COLOR} />;
    if (col.key === "score")    return <Stars score={raw as number | null} />;
    if (col.key === "letzter_kontakt") return <span style={cellTxt}>{fmtDate(raw as string | null)}</span>;
    if (col.key === "linkedin" && raw) return (
      <a href={raw as string} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ color: "#60a5fa", fontSize: 12 }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style={{ verticalAlign: "middle" }}><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>
      </a>
    );
    return <span style={{ ...cellTxt, overflow: "hidden", textOverflow: "ellipsis", display: "block" }}>{(raw as string | null) ?? ""}</span>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, background: "#0a0a0c", color: "#e4e4e7" }}>

      {/* ── Header ── */}
      <div style={{ padding: "16px 24px 0", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "#fff", fontFamily: T }}>Investor Database</h1>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "rgba(255,255,255,0.3)", fontFamily: T }}>
              {rows.length} {rows.length === 1 ? "Kontakt" : "Kontakte"} gespeichert
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={{ ...btnPrimary, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)" }} onClick={() => setShowCsv(true)}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              CSV importieren
            </button>
            <button style={btnPrimary} onClick={() => setShowAdd(true)}>
              + Investor hinzufügen
            </button>
          </div>
        </div>

        {/* Search */}
        <div style={{ marginBottom: 12 }}>
          <input style={{ ...inp, width: 240, padding: "6px 10px" }} placeholder="Suche Name, Firma, E-Mail…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {/* Filter tabs */}
        <div style={{ display: "flex", gap: 0, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          {STATUS_TABS.map(tab => {
            const active = activeTab === tab;
            const sc = tab !== "Alle" ? STATUS_COLOR[tab] : null;
            return (
              <button key={tab} onClick={() => setActiveTab(tab)} style={{
                background: "none", border: "none", borderBottom: active ? "2px solid #e2ca7a" : "2px solid transparent",
                padding: "8px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
                color: active ? "#e2ca7a" : "rgba(255,255,255,0.4)", fontSize: 11, fontWeight: 700,
                fontFamily: T, letterSpacing: "0.06em", textTransform: "uppercase",
                transition: "color 150ms, border-color 150ms", marginBottom: -1,
              }}>
                {tab !== "Alle" && sc && (
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: sc.text, flexShrink: 0 }} />
                )}
                {tab}
                <span style={{ color: active ? "rgba(226,202,122,0.6)" : "rgba(255,255,255,0.2)", fontSize: 10, fontWeight: 600 }}>
                  {tabCount(tab)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Table ── */}
      <div style={{ flex: 1, minHeight: 0, overflowX: "auto", overflowY: "auto" }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 13, fontFamily: T }}>Lädt…</div>
        ) : rows.length === 0 ? (
          <EmptyState onAdd={() => setShowAdd(true)} onCsv={() => setShowCsv(true)} />
        ) : filtered.length === 0 ? (
          <div style={{ padding: 60, textAlign: "center", color: "rgba(255,255,255,0.25)", fontSize: 14, fontFamily: T }}>
            Keine Ergebnisse für die aktuelle Filterung.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1400 }}>
            <thead style={{ position: "sticky", top: 0, zIndex: 10, background: "#0a0a0c", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
              <tr>
                <th style={{ ...thS("name"), width: 44, cursor: "default" }}><span style={{ paddingLeft: 6 }}>#</span></th>
                {COLS.map(c => (
                  <th key={c.key} style={{ ...thS(c.key), width: c.w }} onClick={() => toggleSort(c.key)}>
                    {c.label}{sortKey === c.key ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                  </th>
                ))}
                <th style={{ ...thS("name"), width: 50, cursor: "default" }} />
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, ri) => {
                const isEdit = editId === row.id;
                const rowBg  = ri % 2 === 0 ? "transparent" : "rgba(255,255,255,0.018)";
                return (
                  <tr key={row.id}
                    style={{ background: isEdit ? "rgba(226,202,122,0.04)" : rowBg, cursor: "pointer", transition: "background 100ms" }}
                    onClick={() => { setEditId(row.id); setEditCol(null); }}>
                    <td style={tdS}><span style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, paddingLeft: 6 }}>{nrMap[row.id]}</span></td>
                    {COLS.map(c => {
                      const cellEdit = isEdit && editCol === c.key;
                      return (
                        <td key={c.key} style={{ ...tdS, maxWidth: c.w }}
                          onClick={e => { e.stopPropagation(); setEditId(row.id); setEditCol(c.key); }}>
                          {cellEdit ? (
                            <EditCell colKey={c.key} value={row[c.key]?.toString() ?? null} onSave={v => { patch(row.id, c.key, v); setEditCol(null); }} />
                          ) : renderCell(row, c)}
                        </td>
                      );
                    })}
                    <td style={tdS} onClick={e => e.stopPropagation()}>
                      <button style={{ background: "none", border: "none", color: "rgba(239,68,68,0.5)", cursor: "pointer", fontSize: 14, padding: "2px 6px" }}
                        onClick={() => del(row.id)} title="Löschen">✕</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {showAdd     && <AddModal onClose={() => setShowAdd(false)} onSaved={load} />}
      {showCsv     && <CsvModal onClose={() => setShowCsv(false)} onImport={importRows} />}
      {showSentinel && <SentinelChat onClose={() => setSentinel(false)} onSaved={() => { setSentinel(false); load(); }} />}
      {toast       && <Toast msg={toast} onDone={() => setToast(null)} />}
    </div>
  );
}
