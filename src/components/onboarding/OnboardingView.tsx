"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { MessageSquare, X, Send, ChevronRight } from "lucide-react";

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

const T = "var(--font-montserrat,sans-serif)";

// ── Dropdown options ───────────────────────────────────────────────────────────

const OPTS: Partial<Record<keyof Investor, string[]>> = {
  kontaktquelle:     ["Persönlicher Kontakt", "Empfehlung", "Vermittler", "Netzwerk / Event", "LinkedIn", "Sonstiges"],
  kapitalrahmen:     ["unter 25.000 EUR", "25.000–50.000 EUR", "50.000–100.000 EUR", "100.000–250.000 EUR", "250.000–500.000 EUR", "über 500.000 EUR", "noch offen"],
  status:            ["Neu", "Kontaktiert", "Early Access gesendet", "Interesse bestätigt", "Gespräch geplant", "Warm Commitment", "Unterlagen ausstehend", "Bereit für Onboarding", "Später kontaktieren", "Abgesagt"],
  naechster_schritt: ["Erstkontakt", "PDF senden", "Rückruf", "Gespräch vereinbaren", "Follow-up senden", "Unterlagen anfordern", "Auf Launch warten", "Kein weiterer Schritt"],
  zustaendig:        ["Jeroen", "Partner 2", "Partner 3"],
};

type CellType = "text" | "dropdown" | "date";
const CELL_TYPE: Partial<Record<keyof Investor, CellType>> = {
  name:              "text",
  unternehmen:       "text",
  email:             "text",
  telefon:           "text",
  notizen:           "text",
  status:            "dropdown",
  kontaktquelle:     "dropdown",
  kapitalrahmen:     "dropdown",
  naechster_schritt: "dropdown",
  zustaendig:        "dropdown",
  verfuegbar_ab:     "date",
  letzter_kontakt:   "date",
};

// ── Column definitions ─────────────────────────────────────────────────────────

type Col = { key: keyof Investor; label: string; w: number };
const COLS: Col[] = [
  { key: "name",              label: "Name",             w: 150 },
  { key: "unternehmen",       label: "Unternehmen",      w: 130 },
  { key: "email",             label: "E-Mail",           w: 170 },
  { key: "status",            label: "Status",           w: 175 },
  { key: "kapitalrahmen",     label: "Kapital",          w: 165 },
  { key: "kontaktquelle",     label: "Quelle",           w: 135 },
  { key: "naechster_schritt", label: "Nächster Schritt", w: 165 },
  { key: "zustaendig",        label: "Zuständig",        w: 95  },
  { key: "letzter_kontakt",   label: "Letzter Kont.",    w: 110 },
  { key: "notizen",           label: "Notizen",          w: 200 },
];

// ── Capital estimate ───────────────────────────────────────────────────────────

const KAPITAL_LOWER: Record<string, number> = {
  "unter 25.000 EUR": 0, "25.000–50.000 EUR": 25_000, "50.000–100.000 EUR": 50_000,
  "100.000–250.000 EUR": 100_000, "250.000–500.000 EUR": 250_000, "über 500.000 EUR": 500_000,
  "noch offen": 0,
};
function estimateCapital(rows: Investor[]): string {
  const t = rows.reduce((s, r) => s + (KAPITAL_LOWER[r.kapitalrahmen ?? ""] ?? 0), 0);
  if (t === 0) return "—";
  if (t >= 1_000_000) return `≥ ${(t / 1_000_000).toFixed(1)}M`;
  return `≥ ${Math.round(t / 1_000)}k`;
}

// ── Status badge (display only) ────────────────────────────────────────────────

const STATUS_COLOR: Record<string, { bg: string; text: string; border: string }> = {
  "Neu":                    { bg: "rgba(113,113,122,0.18)", text: "#a1a1aa", border: "rgba(113,113,122,0.35)" },
  "Kontaktiert":            { bg: "rgba(59,130,246,0.18)",  text: "#60a5fa", border: "rgba(59,130,246,0.35)" },
  "Early Access gesendet":  { bg: "rgba(99,102,241,0.18)",  text: "#818cf8", border: "rgba(99,102,241,0.35)" },
  "Interesse bestätigt":    { bg: "rgba(6,182,212,0.18)",   text: "#22d3ee", border: "rgba(6,182,212,0.35)" },
  "Gespräch geplant":       { bg: "rgba(168,85,247,0.18)",  text: "#c084fc", border: "rgba(168,85,247,0.35)" },
  "Warm Commitment":        { bg: "rgba(245,158,11,0.18)",  text: "#fbbf24", border: "rgba(245,158,11,0.35)" },
  "Unterlagen ausstehend":  { bg: "rgba(249,115,22,0.18)",  text: "#fb923c", border: "rgba(249,115,22,0.35)" },
  "Bereit für Onboarding":  { bg: "rgba(34,197,94,0.18)",   text: "#4ade80", border: "rgba(34,197,94,0.35)" },
  "Später kontaktieren":    { bg: "rgba(63,63,70,0.35)",    text: "#71717a", border: "rgba(63,63,70,0.55)" },
  "Abgesagt":               { bg: "rgba(239,68,68,0.18)",   text: "#f87171", border: "rgba(239,68,68,0.35)" },
};
function StatusBadge({ s }: { s: string }) {
  const c = STATUS_COLOR[s] ?? STATUS_COLOR["Neu"];
  return (
    <span style={{ display: "inline-block", padding: "2px 7px", borderRadius: 4, fontSize: 10, fontWeight: 700, fontFamily: T, letterSpacing: "0.03em", background: c.bg, color: c.text, border: `1px solid ${c.border}`, whiteSpace: "nowrap" }}>
      {s}
    </span>
  );
}

// ── Shared edit input style ────────────────────────────────────────────────────

const editSt: React.CSSProperties = {
  width: "100%", boxSizing: "border-box",
  background: "transparent",
  border: "none",
  borderBottom: "1px solid rgba(255,255,255,0.5)",
  color: "#f0f0f2",
  fontSize: 12, fontFamily: T,
  padding: "0 2px", outline: "none",
  caretColor: "#fff",
};

const selSt: React.CSSProperties = {
  ...editSt,
  // native select inherits background from closest stacking context
  background: "#141416",
  cursor: "pointer",
};

// ── Cell component ─────────────────────────────────────────────────────────────

function Cell({
  colKey,
  value,
  isActive,
  onActivate,
  onSave,
  onNext,
  onPrev,
}: {
  colKey: keyof Investor;
  value: string | null;
  isActive: boolean;
  onActivate: () => void;
  onSave: (v: string | null) => void;
  onNext: () => void;
  onPrev: () => void;
}) {
  const type = CELL_TYPE[colKey] ?? "text";
  const opts = OPTS[colKey];
  const ref = useRef<HTMLInputElement & HTMLSelectElement>(null);
  const [draft, setDraft] = useState(value ?? "");
  const committedRef = useRef(false);

  useEffect(() => { if (!isActive) { setDraft(value ?? ""); committedRef.current = false; } }, [value, isActive]);
  useEffect(() => { if (isActive && ref.current) { ref.current.focus(); if (type === "text" && ref.current instanceof HTMLInputElement) ref.current.select(); } }, [isActive, type]);

  function commit(v: string) {
    if (committedRef.current) return;
    committedRef.current = true;
    onSave(v.trim() || null);
  }

  const fmtDate = (iso: string | null) => {
    if (!iso) return "";
    const d = new Date(iso); return isNaN(d.getTime()) ? iso : d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" });
  };

  // ── Edit mode
  if (isActive) {
    if (type === "dropdown" && opts) {
      return (
        <select
          ref={ref as React.RefObject<HTMLSelectElement>}
          style={selSt}
          value={draft}
          onChange={e => { setDraft(e.target.value); commit(e.target.value); onNext(); }}
          onBlur={() => commit(draft)}
          onKeyDown={e => { if (e.key === "Tab") { e.preventDefault(); commit(draft); e.shiftKey ? onPrev() : onNext(); } if (e.key === "Escape") onNext(); }}
          onClick={e => e.stopPropagation()}
        >
          <option value="">—</option>
          {opts.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }
    if (type === "date") {
      return (
        <input
          ref={ref as React.RefObject<HTMLInputElement>}
          type="date"
          style={editSt}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={() => commit(draft)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); commit(draft); onNext(); } if (e.key === "Tab") { e.preventDefault(); commit(draft); e.shiftKey ? onPrev() : onNext(); } if (e.key === "Escape") onNext(); }}
          onClick={e => e.stopPropagation()}
        />
      );
    }
    // text
    return (
      <input
        ref={ref as React.RefObject<HTMLInputElement>}
        type={colKey === "email" ? "email" : "text"}
        style={editSt}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => commit(draft)}
        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); commit(draft); onNext(); } if (e.key === "Tab") { e.preventDefault(); commit(draft); e.shiftKey ? onPrev() : onNext(); } if (e.key === "Escape") onNext(); }}
        onClick={e => e.stopPropagation()}
      />
    );
  }

  // ── Display mode
  return (
    <div
      onClick={e => { e.stopPropagation(); onActivate(); }}
      style={{ cursor: "default", overflow: "hidden", userSelect: "none", maxWidth: "100%" }}
    >
      {colKey === "status" ? (
        <StatusBadge s={value ?? "Neu"} />
      ) : (type === "date") ? (
        <span style={{ fontSize: 12, fontFamily: T, color: value ? "#e4e4e7" : "rgba(255,255,255,0.2)" }}>
          {fmtDate(value) || "—"}
        </span>
      ) : (
        <span style={{ fontSize: 12, fontFamily: T, color: value ? "#e4e4e7" : "rgba(255,255,255,0.2)", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {value ?? "—"}
        </span>
      )}
    </div>
  );
}

// ── Ghost rows count ───────────────────────────────────────────────────────────

const GHOST_ROWS = 8;

// ── Sentinel panel (scripted — zero LLM API calls) ────────────────────────────

const SENTINEL_STEPS = [
  { key: "name",              question: "Wie heißt der Interessent?" },
  { key: "unternehmen",       question: "Welches Unternehmen?" },
  { key: "email",             question: "E-Mail-Adresse?" },
  { key: "telefon",           question: "Telefonnummer?" },
  { key: "kontaktquelle",     question: "Wie wurde der Kontakt hergestellt?" },
  { key: "kapitalrahmen",     question: "Welcher Kapitalrahmen?" },
  { key: "status",            question: "Aktueller Status?" },
  { key: "naechster_schritt", question: "Nächster Schritt?" },
  { key: "zustaendig",        question: "Wer ist zuständig?" },
  { key: "notizen",           question: "Notizen? (Enter = überspringen)" },
] as const;

type SentinelKey = typeof SENTINEL_STEPS[number]["key"];
type ChatMsg = { from: "sentinel" | "user"; text: string };

const EMPTY_FORM = () => ({
  name: null as string | null, unternehmen: null as string | null, email: null as string | null,
  telefon: null as string | null, kontaktquelle: null as string | null, kapitalrahmen: null as string | null,
  status: "Neu" as string | null, naechster_schritt: null as string | null, zustaendig: null as string | null,
  notizen: null as string | null, verfuegbar_ab: null as string | null, letzter_kontakt: null as string | null,
});

function SentinelPanel({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [messages, setMessages] = useState<ChatMsg[]>([{ from: "sentinel", text: SENTINEL_STEPS[0].question }]);
  const [stepIdx, setStepIdx] = useState(0);
  const [draft, setDraft] = useState("");
  const [form, setForm] = useState<ReturnType<typeof EMPTY_FORM>>(EMPTY_FORM());
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); inputRef.current?.focus(); }, [messages]);

  function submit(value: string) {
    const val = value.trim();
    const key = SENTINEL_STEPS[stepIdx].key as SentinelKey;
    const newForm = { ...form, [key]: val || null };
    setForm(newForm);
    setDraft("");
    const next = stepIdx + 1;
    if (next >= SENTINEL_STEPS.length) {
      setMessages(m => [...m, { from: "user", text: val || "(übersprungen)" }, { from: "sentinel", text: `Erstelle Eintrag für „${newForm.name}"…` }]);
      setDone(true); setSaving(true);
      fetch("/api/investors-crm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newForm) })
        .then(async r => { if (!r.ok) throw new Error((await r.json()).error ?? "Fehler"); setMessages(m => [...m, { from: "sentinel", text: "✓ Gespeichert." }]); onCreated(); })
        .catch(e => setErr(e.message))
        .finally(() => setSaving(false));
    } else {
      setMessages(m => [...m, { from: "user", text: val || "(übersprungen)" }, { from: "sentinel", text: SENTINEL_STEPS[next].question }]);
      setStepIdx(next);
    }
  }

  function reset() {
    setMessages([{ from: "sentinel", text: SENTINEL_STEPS[0].question }]);
    setStepIdx(0); setDraft(""); setForm(EMPTY_FORM()); setDone(false); setErr(null);
  }

  return (
    <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 360, zIndex: 500, background: "#0c0c0e", borderLeft: "1px solid rgba(255,255,255,0.08)", display: "flex", flexDirection: "column", boxShadow: "-12px 0 40px rgba(0,0,0,0.6)" }}>
      <div style={{ padding: "13px 16px", borderBottom: "1px solid rgba(255,255,255,0.07)", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <MessageSquare size={14} color="rgba(255,255,255,0.5)" strokeWidth={1.65} />
        <span style={{ fontSize: 13, fontWeight: 700, color: "#e4e4e7", fontFamily: T, flex: 1 }}>Sentinel · Neuer Kontakt</span>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", fontFamily: T }}>{done ? "Fertig" : `${stepIdx + 1} / ${SENTINEL_STEPS.length}`}</span>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", cursor: "pointer", padding: 2, display: "flex" }}><X size={14} /></button>
      </div>
      <div style={{ height: 1, background: "rgba(255,255,255,0.06)", flexShrink: 0 }}>
        <div style={{ height: "100%", background: "rgba(255,255,255,0.35)", width: `${((done ? SENTINEL_STEPS.length : stepIdx) / SENTINEL_STEPS.length) * 100}%`, transition: "width 300ms ease" }} />
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "14px", display: "flex", flexDirection: "column", gap: 8 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.from === "user" ? "flex-end" : "flex-start" }}>
            <div style={{ maxWidth: "82%", padding: "7px 11px", borderRadius: m.from === "user" ? "12px 12px 3px 12px" : "12px 12px 12px 3px", background: m.from === "user" ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)", border: `1px solid rgba(255,255,255,${m.from === "user" ? "0.12" : "0.06"})`, fontSize: 12, color: m.from === "user" ? "#e4e4e7" : "rgba(255,255,255,0.6)", fontFamily: T, lineHeight: 1.55 }}>
              {m.text}
            </div>
          </div>
        ))}
        {err && <div style={{ color: "#f87171", fontSize: 11, textAlign: "center", fontFamily: T }}>{err}</div>}
        <div ref={bottomRef} />
      </div>
      {!done && (
        <div style={{ padding: "10px 12px 14px", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", gap: 8, flexShrink: 0 }}>
          <input ref={inputRef} value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); submit(draft); } }} placeholder="Antwort eingeben…" style={{ flex: 1, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 7, color: "#e4e4e7", fontSize: 12, padding: "7px 10px", fontFamily: T, outline: "none" }} />
          <button onClick={() => submit(draft)} disabled={saving} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 7, padding: "0 12px", color: "rgba(255,255,255,0.6)", cursor: "pointer", display: "flex", alignItems: "center" }}><Send size={13} /></button>
        </div>
      )}
      {done && !saving && (
        <div style={{ padding: "12px 12px 14px", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", gap: 8, flexShrink: 0 }}>
          <button onClick={reset} style={{ flex: 1, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 7, padding: "7px", color: "#e4e4e7", cursor: "pointer", fontSize: 12, fontFamily: T, fontWeight: 600 }}><ChevronRight size={12} style={{ display: "inline", marginRight: 4 }} />Weiteren hinzufügen</button>
          <button onClick={onClose} style={{ flex: 1, background: "transparent", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 7, padding: "7px", color: "rgba(255,255,255,0.35)", cursor: "pointer", fontSize: 12, fontFamily: T }}>Schließen</button>
        </div>
      )}
    </div>
  );
}

// ── Main view ──────────────────────────────────────────────────────────────────

export function OnboardingView() {
  const [rows, setRows]           = useState<Investor[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState("");
  const [sentinelOpen, setSentinelOpen] = useState(false);
  // active cell: "rowId:colIdx"
  const [activeCell, setActiveCell] = useState<string | null>(null);
  const savingRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await fetch("/api/investors-crm"); if (r.ok) setRows(await r.json()); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function activateCell(rowId: string, colIdx: number) {
    setActiveCell(`${rowId}:${colIdx}`);
  }

  function deactivate() { setActiveCell(null); }

  function moveNext(rowId: string, colIdx: number) {
    const nextCol = colIdx + 1;
    if (nextCol < COLS.length) { activateCell(rowId, nextCol); return; }
    const rowIdx = filtered.findIndex(r => r.id === rowId);
    if (rowIdx < filtered.length - 1) activateCell(filtered[rowIdx + 1].id, 0);
    else deactivate();
  }

  function movePrev(rowId: string, colIdx: number) {
    const prevCol = colIdx - 1;
    if (prevCol >= 0) { activateCell(rowId, prevCol); return; }
    const rowIdx = filtered.findIndex(r => r.id === rowId);
    if (rowIdx > 0) activateCell(filtered[rowIdx - 1].id, COLS.length - 1);
    else deactivate();
  }

  async function patch(id: string, key: keyof Investor, value: string | null) {
    if (savingRef.current) return;
    savingRef.current = true;
    setRows(prev => prev.map(r => r.id === id ? { ...r, [key]: value } : r));
    try { await fetch(`/api/investors-crm/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [key]: value }) }); }
    finally { savingRef.current = false; }
  }

  async function del(id: string) {
    if (!confirm("Löschen?")) return;
    await fetch(`/api/investors-crm/${id}`, { method: "DELETE" });
    setRows(prev => prev.filter(r => r.id !== id));
  }

  const nrMap = Object.fromEntries(rows.map((r, i) => [r.id, i + 1]));

  const filtered = rows.filter(r => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (["name", "unternehmen", "email", "telefon", "notizen"] as (keyof Investor)[])
      .some(k => (r[k] ?? "").toString().toLowerCase().includes(q));
  });

  const isEmpty = !loading && filtered.length === 0;

  const warmCount   = rows.filter(r => r.status === "Warm Commitment").length;
  const bereitCount = rows.filter(r => r.status === "Bereit für Onboarding").length;
  const pipeline    = rows.filter(r => !["Abgesagt", "Später kontaktieren"].includes(r.status)).length;
  const capital     = estimateCapital(rows);

  const th: React.CSSProperties = {
    padding: "0 8px", height: 30, textAlign: "left", fontSize: 10, fontWeight: 700,
    color: "rgba(255,255,255,0.58)", fontFamily: T, letterSpacing: "0.06em",
    textTransform: "uppercase", whiteSpace: "nowrap", userSelect: "none",
    borderBottom: "1px solid rgba(255,255,255,0.1)",
  };
  const td: React.CSSProperties = {
    padding: "0 8px", height: 34, verticalAlign: "middle",
    borderBottom: "1px solid rgba(255,255,255,0.04)", whiteSpace: "nowrap",
    overflow: "hidden",
  };

  return (
    <div
      style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, background: "#0a0a0c", color: "#e4e4e7", position: "relative" }}
      onClick={() => deactivate()}
    >
      {/* ── Single header row ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 14px", height: 46, flexShrink: 0, borderBottom: "1px solid rgba(255,255,255,0.07)" }}
        onClick={e => e.stopPropagation()}>
        <span style={{ fontSize: 13, fontWeight: 800, color: "rgba(255,255,255,0.7)", fontFamily: T, flexShrink: 0, letterSpacing: "0.01em" }}>Onboarding</span>
        <input
          style={{ width: 150, flexShrink: 0, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 5, color: "#e4e4e7", fontSize: 12, padding: "4px 9px", fontFamily: T, outline: "none" }}
          placeholder="Suche…" value={search} onChange={e => setSearch(e.target.value)}
        />
        <div style={{ flex: 1, display: "flex", alignItems: "center", overflow: "hidden" }}>
          {[
            { label: "Investoren", value: String(rows.length) },
            { label: "Kapital",    value: capital },
            { label: "Warm",       value: String(warmCount) },
            { label: "Bereit",     value: String(bereitCount) },
            { label: "Pipeline",   value: String(pipeline) },
          ].map((k, i) => (
            <div key={k.label} style={{ display: "flex", alignItems: "baseline", gap: 4, padding: "0 13px", borderLeft: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.28)", fontFamily: T, letterSpacing: "0.07em", textTransform: "uppercase" }}>{k.label}</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: "#e4e4e7", fontFamily: T }}>{k.value}</span>
            </div>
          ))}
        </div>
        <button onClick={() => setSentinelOpen(true)} style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, padding: "5px 12px", color: "rgba(255,255,255,0.6)", cursor: "pointer", fontSize: 11, fontWeight: 700, fontFamily: T, letterSpacing: "0.04em" }}>
          <MessageSquare size={12} strokeWidth={1.65} />Sentinel
        </button>
      </div>

      {/* ── Table ── */}
      <div style={{ flex: 1, minHeight: 0, overflowX: "auto", overflowY: "auto", position: "relative" }}
        onClick={e => e.stopPropagation()}>
        {loading ? (
          <div style={{ padding: 32, textAlign: "center", color: "rgba(255,255,255,0.2)", fontSize: 12, fontFamily: T }}>Lädt…</div>
        ) : (
          <>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1200, tableLayout: "fixed" }}>
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
                    {COLS.map((c, ci) => {
                      const cellId = `${row.id}:${ci}`;
                      const isActive = activeCell === cellId;
                      return (
                        <td key={c.key} style={{ ...td, width: c.w, background: isActive ? "rgba(255,255,255,0.06)" : undefined, boxShadow: isActive ? "inset 0 0 0 1px rgba(255,255,255,0.15)" : undefined }}>
                          <Cell
                            colKey={c.key}
                            value={row[c.key] as string | null}
                            isActive={isActive}
                            onActivate={() => activateCell(row.id, ci)}
                            onSave={v => patch(row.id, c.key, v)}
                            onNext={() => moveNext(row.id, ci)}
                            onPrev={() => movePrev(row.id, ci)}
                          />
                        </td>
                      );
                    })}
                    <td style={{ ...td, width: 34 }}>
                      <button onClick={() => del(row.id)} style={{ background: "none", border: "none", color: "rgba(239,68,68,0.35)", cursor: "pointer", fontSize: 13, padding: "2px 4px" }} title="Löschen">✕</button>
                    </td>
                  </tr>
                ))}

                {/* Ghost rows */}
                {isEmpty && Array.from({ length: GHOST_ROWS }).map((_, gi) => (
                  <tr key={`ghost-${gi}`} style={{ opacity: Math.max(0, 1 - gi * 0.14), pointerEvents: "none" }}>
                    <td style={{ ...td, width: 36, paddingLeft: 14 }}><span style={{ fontSize: 10, color: "rgba(255,255,255,0.18)", fontFamily: T }}>{gi + 1}</span></td>
                    {COLS.map(c => (
                      <td key={c.key} style={{ ...td, width: c.w }}>
                        <span style={{ display: "block", height: 8, borderRadius: 4, background: "rgba(255,255,255,0.05)", width: `${40 + ((gi * 7 + c.w / 10) % 45)}%` }} />
                      </td>
                    ))}
                    <td style={{ ...td, width: 34 }} />
                  </tr>
                ))}
              </tbody>
            </table>

            {isEmpty && (
              <div style={{ position: "sticky", bottom: 0, left: 0, right: 0, height: 100, pointerEvents: "none", background: "linear-gradient(to bottom, transparent, #0a0a0c)", marginTop: -100, zIndex: 5 }} />
            )}
            {isEmpty && (
              <div style={{ padding: "12px 0 24px", textAlign: "center", color: "rgba(255,255,255,0.18)", fontSize: 11, fontFamily: T, letterSpacing: "0.05em" }}>
                {rows.length === 0 ? "Noch keine Kontakte — Sentinel starten" : "Keine Treffer für diese Suche"}
              </div>
            )}
          </>
        )}
      </div>

      {sentinelOpen && <SentinelPanel onClose={() => setSentinelOpen(false)} onCreated={load} />}
    </div>
  );
}
