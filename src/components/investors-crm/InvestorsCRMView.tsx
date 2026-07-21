"use client";

import { useEffect, useRef, useState, useCallback } from "react";

// ── Types ──────────────────────────────────────────────────────────────────────

export type Investor = {
  id: string;
  name: string;
  unternehmen: string | null;
  email: string | null;
  telefon: string | null;
  kontaktquelle: string | null;
  kapitalrahmen: string | null;
  verfuegbar_ab: string | null;
  status: string;
  letzter_kontakt: string | null;
  naechster_schritt: string | null;
  zustaendig: string | null;
  notizen: string | null;
  created_at: string;
};

// ── Options ────────────────────────────────────────────────────────────────────

const KONTAKTQUELLE = ["Persönlicher Kontakt", "Empfehlung", "Vermittler", "Netzwerk / Event", "LinkedIn", "Sonstiges"];
const KAPITALRAHMEN = ["unter 25.000 EUR", "25.000–50.000 EUR", "50.000–100.000 EUR", "100.000–250.000 EUR", "250.000–500.000 EUR", "über 500.000 EUR", "noch offen"];
const STATUS_OPTS = ["Neu", "Kontaktiert", "Early Access gesendet", "Interesse bestätigt", "Gespräch geplant", "Warm Commitment", "Unterlagen ausstehend", "Bereit für Onboarding", "Später kontaktieren", "Abgesagt"];
const NAECHSTER_SCHRITT_OPTS = ["Erstkontakt", "PDF senden", "Rückruf", "Gespräch vereinbaren", "Follow-up senden", "Unterlagen anfordern", "Auf Launch warten", "Kein weiterer Schritt"];
const ZUSTAENDIG_OPTS = ["Jeroen", "Partner 2", "Partner 3"];

// ── Status badge colors ────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, { bg: string; text: string; border: string }> = {
  "Neu":                    { bg: "rgba(113,113,122,0.15)", text: "#a1a1aa", border: "rgba(113,113,122,0.3)" },
  "Kontaktiert":            { bg: "rgba(59,130,246,0.15)",  text: "#60a5fa", border: "rgba(59,130,246,0.3)" },
  "Early Access gesendet":  { bg: "rgba(99,102,241,0.15)",  text: "#818cf8", border: "rgba(99,102,241,0.3)" },
  "Interesse bestätigt":    { bg: "rgba(6,182,212,0.15)",   text: "#22d3ee", border: "rgba(6,182,212,0.3)" },
  "Gespräch geplant":       { bg: "rgba(168,85,247,0.15)",  text: "#c084fc", border: "rgba(168,85,247,0.3)" },
  "Warm Commitment":        { bg: "rgba(245,158,11,0.15)",  text: "#fbbf24", border: "rgba(245,158,11,0.3)" },
  "Unterlagen ausstehend":  { bg: "rgba(249,115,22,0.15)",  text: "#fb923c", border: "rgba(249,115,22,0.3)" },
  "Bereit für Onboarding":  { bg: "rgba(34,197,94,0.15)",   text: "#4ade80", border: "rgba(34,197,94,0.3)" },
  "Später kontaktieren":    { bg: "rgba(63,63,70,0.3)",     text: "#71717a", border: "rgba(63,63,70,0.5)" },
  "Abgesagt":               { bg: "rgba(239,68,68,0.15)",   text: "#f87171", border: "rgba(239,68,68,0.3)" },
};

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_COLOR[status] ?? STATUS_COLOR["Neu"];
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 8px",
      borderRadius: 4,
      fontSize: 11,
      fontWeight: 600,
      fontFamily: "var(--font-montserrat,sans-serif)",
      letterSpacing: "0.03em",
      background: c.bg,
      color: c.text,
      border: `1px solid ${c.border}`,
      whiteSpace: "nowrap",
    }}>
      {status}
    </span>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function toIsoDate(de: string): string | null {
  if (!de) return null;
  const m = de.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return de || null;
}

// ── Modal for new investor ─────────────────────────────────────────────────────

const EMPTY: Omit<Investor, "id" | "created_at"> = {
  name: "", unternehmen: null, email: null, telefon: null,
  kontaktquelle: null, kapitalrahmen: null, verfuegbar_ab: null,
  status: "Neu", letzter_kontakt: null, naechster_schritt: null,
  zustaendig: null, notizen: null,
};

function Modal({ onClose, onSave }: { onClose: () => void; onSave: (v: Omit<Investor, "id" | "created_at">) => Promise<void> }) {
  const [form, setForm] = useState({ ...EMPTY, status: "Neu" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const set = (k: string, v: string | null) => setForm(f => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setErr("Name ist Pflichtfeld"); return; }
    setSaving(true);
    try {
      await onSave({ ...form, name: form.name.trim() });
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Fehler beim Speichern");
    } finally { setSaving(false); }
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2000, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "#111214", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, width: "100%", maxWidth: 640, maxHeight: "90vh", overflowY: "auto", padding: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#fff", fontFamily: "var(--font-montserrat,sans-serif)" }}>Investor hinzufügen</h2>
          <button onClick={onClose} style={btnGhost}>✕</button>
        </div>

        <form onSubmit={submit}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Name *" required><input style={inp} value={form.name} onChange={e => set("name", e.target.value)} placeholder="Vollständiger Name" /></Field>
            <Field label="Unternehmen"><input style={inp} value={form.unternehmen ?? ""} onChange={e => set("unternehmen", e.target.value || null)} /></Field>
            <Field label="E-Mail"><input style={inp} type="email" value={form.email ?? ""} onChange={e => set("email", e.target.value || null)} /></Field>
            <Field label="Telefon"><input style={inp} value={form.telefon ?? ""} onChange={e => set("telefon", e.target.value || null)} /></Field>
            <Field label="Kontaktquelle">
              <select style={inp} value={form.kontaktquelle ?? ""} onChange={e => set("kontaktquelle", e.target.value || null)}>
                <option value="">—</option>
                {KONTAKTQUELLE.map(o => <option key={o}>{o}</option>)}
              </select>
            </Field>
            <Field label="Kapitalrahmen">
              <select style={inp} value={form.kapitalrahmen ?? ""} onChange={e => set("kapitalrahmen", e.target.value || null)}>
                <option value="">—</option>
                {KAPITALRAHMEN.map(o => <option key={o}>{o}</option>)}
              </select>
            </Field>
            <Field label="Verfügbar ab">
              <input style={inp} type="date" value={form.verfuegbar_ab ?? ""} onChange={e => set("verfuegbar_ab", e.target.value || null)} />
            </Field>
            <Field label="Status">
              <select style={inp} value={form.status} onChange={e => set("status", e.target.value)}>
                {STATUS_OPTS.map(o => <option key={o}>{o}</option>)}
              </select>
            </Field>
            <Field label="Letzter Kontakt">
              <input style={inp} type="date" value={form.letzter_kontakt ?? ""} onChange={e => set("letzter_kontakt", e.target.value || null)} />
            </Field>
            <Field label="Nächster Schritt">
              <select style={inp} value={form.naechster_schritt ?? ""} onChange={e => set("naechster_schritt", e.target.value || null)}>
                <option value="">—</option>
                {NAECHSTER_SCHRITT_OPTS.map(o => <option key={o}>{o}</option>)}
              </select>
            </Field>
            <Field label="Zuständig">
              <select style={inp} value={form.zustaendig ?? ""} onChange={e => set("zustaendig", e.target.value || null)}>
                <option value="">—</option>
                {ZUSTAENDIG_OPTS.map(o => <option key={o}>{o}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Notizen" style={{ marginTop: 12 }}>
            <textarea style={{ ...inp, height: 80, resize: "vertical" }} value={form.notizen ?? ""} onChange={e => set("notizen", e.target.value || null)} />
          </Field>
          {err && <p style={{ color: "#f87171", fontSize: 12, marginTop: 8 }}>{err}</p>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
            <button type="button" onClick={onClose} style={btnSecondary}>Abbrechen</button>
            <button type="submit" disabled={saving} style={btnPrimary}>{saving ? "Speichert…" : "Hinzufügen"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children, required, style }: { label: string; children: React.ReactNode; required?: boolean; style?: React.CSSProperties }) {
  return (
    <div style={style}>
      <label style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 4, fontFamily: "var(--font-montserrat,sans-serif)", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>
        {label}{required && <span style={{ color: "#f87171" }}> *</span>}
      </label>
      {children}
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const inp: React.CSSProperties = {
  width: "100%", boxSizing: "border-box",
  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 6, color: "#e4e4e7", fontSize: 13,
  fontFamily: "var(--font-montserrat,sans-serif)",
  padding: "7px 10px", outline: "none",
};
const btnPrimary: React.CSSProperties = {
  background: "rgba(226,202,122,0.15)", border: "1px solid rgba(226,202,122,0.35)",
  color: "#e2ca7a", borderRadius: 6, padding: "7px 16px", fontSize: 12, fontWeight: 700,
  fontFamily: "var(--font-montserrat,sans-serif)", cursor: "pointer", letterSpacing: "0.04em",
};
const btnSecondary: React.CSSProperties = {
  background: "transparent", border: "1px solid rgba(255,255,255,0.12)",
  color: "rgba(255,255,255,0.5)", borderRadius: 6, padding: "7px 16px", fontSize: 12,
  fontFamily: "var(--font-montserrat,sans-serif)", cursor: "pointer",
};
const btnGhost: React.CSSProperties = {
  background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 16,
};

// ── Column definitions ─────────────────────────────────────────────────────────

type Col = { key: keyof Investor; label: string; w: number | string };
const COLS: Col[] = [
  { key: "name",              label: "Name",             w: 160 },
  { key: "unternehmen",       label: "Unternehmen",      w: 130 },
  { key: "email",             label: "E-Mail",           w: 170 },
  { key: "telefon",           label: "Telefon",          w: 120 },
  { key: "kontaktquelle",     label: "Kontaktquelle",    w: 140 },
  { key: "kapitalrahmen",     label: "Kapitalrahmen",    w: 160 },
  { key: "verfuegbar_ab",     label: "Verfügbar ab",     w: 110 },
  { key: "status",            label: "Status",           w: 180 },
  { key: "letzter_kontakt",   label: "Letzter Kontakt",  w: 110 },
  { key: "naechster_schritt", label: "Nächster Schritt", w: 170 },
  { key: "zustaendig",        label: "Zuständig",        w: 100 },
  { key: "notizen",           label: "Notizen",          w: 200 },
];

// ── Inline editable cell ───────────────────────────────────────────────────────

function EditCell({
  colKey, value, onSave,
}: { colKey: keyof Investor; value: string | null; onSave: (v: string | null) => void }) {
  const [draft, setDraft] = useState(value ?? "");
  const isDate = colKey === "verfuegbar_ab" || colKey === "letzter_kontakt";
  const isDropdown = ["kontaktquelle", "kapitalrahmen", "status", "naechster_schritt", "zustaendig"].includes(colKey);
  const opts = colKey === "kontaktquelle" ? KONTAKTQUELLE
    : colKey === "kapitalrahmen" ? KAPITALRAHMEN
    : colKey === "status" ? STATUS_OPTS
    : colKey === "naechster_schritt" ? NAECHSTER_SCHRITT_OPTS
    : colKey === "zustaendig" ? ZUSTAENDIG_OPTS : [];

  const commit = () => {
    const v = draft.trim() || null;
    onSave(v);
  };

  if (isDropdown) {
    return (
      <select
        autoFocus
        style={{ ...inp, padding: "3px 6px", fontSize: 12 }}
        value={draft}
        onChange={e => { setDraft(e.target.value); onSave(e.target.value || null); }}
        onBlur={commit}
        onClick={e => e.stopPropagation()}
      >
        <option value="">—</option>
        {opts.map(o => <option key={o}>{o}</option>)}
      </select>
    );
  }
  if (isDate) {
    return (
      <input
        autoFocus
        type="date"
        style={{ ...inp, padding: "3px 6px", fontSize: 12 }}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onClick={e => e.stopPropagation()}
      />
    );
  }
  if (colKey === "notizen") {
    return (
      <textarea
        autoFocus
        style={{ ...inp, padding: "3px 6px", fontSize: 12, height: 60, resize: "vertical" }}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onClick={e => e.stopPropagation()}
      />
    );
  }
  return (
    <input
      autoFocus
      type={colKey === "email" ? "email" : "text"}
      style={{ ...inp, padding: "3px 6px", fontSize: 12 }}
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onClick={e => e.stopPropagation()}
    />
  );
}

// ── Main view ──────────────────────────────────────────────────────────────────

type SortDir = "asc" | "desc";

export function InvestorsCRMView() {
  const [rows, setRows] = useState<Investor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingCol, setEditingCol] = useState<keyof Investor | null>(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<keyof Investor>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterKontakt, setFilterKontakt] = useState("");
  const [filterKapital, setFilterKapital] = useState("");
  const [filterZustaendig, setFilterZustaendig] = useState("");
  const savingRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/investors-crm");
      if (r.ok) setRows(await r.json());
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function create(body: Omit<Investor, "id" | "created_at">) {
    const r = await fetch("/api/investors-crm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error((await r.json()).error ?? "Fehler");
    await load();
  }

  async function patch(id: string, key: keyof Investor, value: string | null) {
    if (savingRef.current) return;
    savingRef.current = true;
    setRows(prev => prev.map(r => r.id === id ? { ...r, [key]: value } : r));
    try {
      await fetch(`/api/investors-crm/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [key]: value }) });
    } finally { savingRef.current = false; }
  }

  async function del(id: string) {
    if (!confirm("Investor wirklich löschen?")) return;
    await fetch(`/api/investors-crm/${id}`, { method: "DELETE" });
    setRows(prev => prev.filter(r => r.id !== id));
    if (editingId === id) setEditingId(null);
  }

  function toggleSort(key: keyof Investor) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  const filtered = rows
    .filter(r => {
      const q = search.toLowerCase();
      if (q && !["name","unternehmen","email","telefon","notizen"].some(k => (r[k as keyof Investor] ?? "").toString().toLowerCase().includes(q))) return false;
      if (filterStatus && r.status !== filterStatus) return false;
      if (filterKontakt && r.kontaktquelle !== filterKontakt) return false;
      if (filterKapital && r.kapitalrahmen !== filterKapital) return false;
      if (filterZustaendig && r.zustaendig !== filterZustaendig) return false;
      return true;
    })
    .sort((a, b) => {
      const va = (a[sortKey] ?? "").toString();
      const vb = (b[sortKey] ?? "").toString();
      return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
    });

  const hasFilters = search || filterStatus || filterKontakt || filterKapital || filterZustaendig;

  // Map id → Nr in full created_at order
  const nrMap = Object.fromEntries(rows.map((r, i) => [r.id, i + 1]));

  const thStyle = (key: keyof Investor): React.CSSProperties => ({
    padding: "0 10px", height: 36, textAlign: "left", fontSize: 11, fontWeight: 700,
    color: "rgba(255,255,255,0.35)", fontFamily: "var(--font-montserrat,sans-serif)",
    letterSpacing: "0.06em", textTransform: "uppercase", cursor: "pointer",
    whiteSpace: "nowrap", userSelect: "none",
    background: sortKey === key ? "rgba(255,255,255,0.04)" : "transparent",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, background: "#0a0a0c", color: "#e4e4e7" }}>
      {/* Header */}
      <div style={{ padding: "20px 24px 16px", flexShrink: 0, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800, fontFamily: "var(--font-montserrat,sans-serif)", color: "#fff" }}>Early Access Investoren</h1>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "rgba(255,255,255,0.3)", fontFamily: "var(--font-montserrat,sans-serif)" }}>
              {rows.length} {rows.length === 1 ? "Interessent" : "Interessenten"} gespeichert
            </p>
          </div>
          <button style={btnPrimary} onClick={() => setShowModal(true)}>+ Investor hinzufügen</button>
        </div>

        {/* Filters */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input
            style={{ ...inp, width: 220, padding: "6px 10px" }}
            placeholder="Suche Name, Firma, E-Mail…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select style={{ ...inp, width: "auto", padding: "6px 10px" }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">Alle Status</option>
            {STATUS_OPTS.map(o => <option key={o}>{o}</option>)}
          </select>
          <select style={{ ...inp, width: "auto", padding: "6px 10px" }} value={filterKontakt} onChange={e => setFilterKontakt(e.target.value)}>
            <option value="">Alle Quellen</option>
            {KONTAKTQUELLE.map(o => <option key={o}>{o}</option>)}
          </select>
          <select style={{ ...inp, width: "auto", padding: "6px 10px" }} value={filterKapital} onChange={e => setFilterKapital(e.target.value)}>
            <option value="">Alle Kapitalrahmen</option>
            {KAPITALRAHMEN.map(o => <option key={o}>{o}</option>)}
          </select>
          <select style={{ ...inp, width: "auto", padding: "6px 10px" }} value={filterZustaendig} onChange={e => setFilterZustaendig(e.target.value)}>
            <option value="">Alle Zuständigen</option>
            {ZUSTAENDIG_OPTS.map(o => <option key={o}>{o}</option>)}
          </select>
          {hasFilters && (
            <button style={btnSecondary} onClick={() => { setSearch(""); setFilterStatus(""); setFilterKontakt(""); setFilterKapital(""); setFilterZustaendig(""); }}>
              Filter zurücksetzen
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div style={{ flex: 1, minHeight: 0, overflowX: "auto", overflowY: "auto" }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 13, fontFamily: "var(--font-montserrat,sans-serif)" }}>Lädt…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 60, textAlign: "center", color: "rgba(255,255,255,0.25)", fontSize: 14, fontFamily: "var(--font-montserrat,sans-serif)" }}>
            {rows.length === 0 ? "Noch keine Interessenten eingetragen." : "Keine Ergebnisse für die aktuellen Filter."}
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1400 }}>
            <thead style={{ position: "sticky", top: 0, zIndex: 10, background: "#0a0a0c", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
              <tr>
                <th style={{ ...thStyle("name"), width: 44, cursor: "default" }}><span style={{ paddingLeft: 6 }}>#</span></th>
                {COLS.map(c => (
                  <th key={c.key} style={{ ...thStyle(c.key), width: c.w }} onClick={() => toggleSort(c.key)}>
                    {c.label} {sortKey === c.key ? (sortDir === "asc" ? "↑" : "↓") : ""}
                  </th>
                ))}
                <th style={{ ...thStyle("name"), width: 60, cursor: "default" }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, ri) => {
                const isEditing = editingId === row.id;
                const rowBg = ri % 2 === 0 ? "transparent" : "rgba(255,255,255,0.018)";
                return (
                  <tr
                    key={row.id}
                    style={{ background: isEditing ? "rgba(226,202,122,0.05)" : rowBg, cursor: "pointer", transition: "background 120ms" }}
                    onClick={() => { setEditingId(row.id); setEditingCol(null); }}
                  >
                    {/* Nr */}
                    <td style={tdStyle}><span style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, paddingLeft: 6 }}>{nrMap[row.id]}</span></td>

                    {COLS.map(c => {
                      const cellEditing = isEditing && editingCol === c.key;
                      const raw = row[c.key] as string | null;

                      return (
                        <td
                          key={c.key}
                          style={{ ...tdStyle, maxWidth: c.w as number }}
                          onClick={e => { e.stopPropagation(); setEditingId(row.id); setEditingCol(c.key); }}
                        >
                          {cellEditing ? (
                            <EditCell
                              colKey={c.key}
                              value={raw}
                              onSave={v => { patch(row.id, c.key, v); setEditingCol(null); }}
                            />
                          ) : c.key === "status" ? (
                            <StatusBadge status={raw ?? "Neu"} />
                          ) : (c.key === "verfuegbar_ab" || c.key === "letzter_kontakt") ? (
                            <span style={cellText}>{fmtDate(raw)}</span>
                          ) : (
                            <span style={{ ...cellText, overflow: "hidden", textOverflow: "ellipsis", display: "block" }}>{raw ?? ""}</span>
                          )}
                        </td>
                      );
                    })}

                    {/* Delete */}
                    <td style={tdStyle} onClick={e => e.stopPropagation()}>
                      <button
                        style={{ background: "none", border: "none", color: "rgba(239,68,68,0.5)", cursor: "pointer", fontSize: 14, padding: "2px 6px" }}
                        onClick={() => del(row.id)}
                        title="Löschen"
                      >✕</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {showModal && <Modal onClose={() => setShowModal(false)} onSave={create} />}
    </div>
  );
}

const tdStyle: React.CSSProperties = {
  padding: "0 10px", height: 40, verticalAlign: "middle",
  borderBottom: "1px solid rgba(255,255,255,0.05)",
  whiteSpace: "nowrap",
};
const cellText: React.CSSProperties = {
  fontSize: 12, color: "#e4e4e7", fontFamily: "var(--font-montserrat,sans-serif)",
};
