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

// ── Options ────────────────────────────────────────────────────────────────────

const KONTAKTQUELLE = ["Persönlicher Kontakt", "Empfehlung", "Vermittler", "Netzwerk / Event", "LinkedIn", "Sonstiges"];
const KAPITALRAHMEN = ["unter 25.000 EUR", "25.000–50.000 EUR", "50.000–100.000 EUR", "100.000–250.000 EUR", "250.000–500.000 EUR", "über 500.000 EUR", "noch offen"];
const STATUS_OPTS = ["Neu", "Kontaktiert", "Early Access gesendet", "Interesse bestätigt", "Gespräch geplant", "Warm Commitment", "Unterlagen ausstehend", "Bereit für Onboarding", "Später kontaktieren", "Abgesagt"];
const NAECHSTER_SCHRITT_OPTS = ["Erstkontakt", "PDF senden", "Rückruf", "Gespräch vereinbaren", "Follow-up senden", "Unterlagen anfordern", "Auf Launch warten", "Kein weiterer Schritt"];
const ZUSTAENDIG_OPTS = ["Jeroen", "Partner 2", "Partner 3"];

const KAPITAL_LOWER: Record<string, number> = {
  "unter 25.000 EUR": 0,
  "25.000–50.000 EUR": 25_000,
  "50.000–100.000 EUR": 50_000,
  "100.000–250.000 EUR": 100_000,
  "250.000–500.000 EUR": 250_000,
  "über 500.000 EUR": 500_000,
  "noch offen": 0,
};

function estimateCapital(rows: Investor[]): string {
  const total = rows.reduce((s, r) => s + (KAPITAL_LOWER[r.kapitalrahmen ?? ""] ?? 0), 0);
  if (total === 0) return "—";
  if (total >= 1_000_000) return `≥ EUR ${(total / 1_000_000).toFixed(1)}M`;
  return `≥ EUR ${Math.round(total / 1_000)}k`;
}

// ── Status colors ──────────────────────────────────────────────────────────────

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

const T = "var(--font-montserrat,sans-serif)";

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_COLOR[status] ?? STATUS_COLOR["Neu"];
  return (
    <span style={{
      display: "inline-block", padding: "2px 7px", borderRadius: 4,
      fontSize: 10, fontWeight: 700, fontFamily: T,
      letterSpacing: "0.03em", background: c.bg, color: c.text,
      border: `1px solid ${c.border}`, whiteSpace: "nowrap",
    }}>{status}</span>
  );
}

// ── Inline editable cell ───────────────────────────────────────────────────────

const cellInp: React.CSSProperties = {
  width: "100%", boxSizing: "border-box",
  background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.2)",
  borderRadius: 4, color: "#e4e4e7", fontSize: 12,
  fontFamily: T, padding: "2px 6px", outline: "none",
};

function EditCell({ colKey, value, onSave }: { colKey: keyof Investor; value: string | null; onSave: (v: string | null) => void }) {
  const [draft, setDraft] = useState(value ?? "");
  const isDate = colKey === "verfuegbar_ab" || colKey === "letzter_kontakt";
  const isDropdown = ["kontaktquelle", "kapitalrahmen", "status", "naechster_schritt", "zustaendig"].includes(colKey);
  const opts = colKey === "kontaktquelle" ? KONTAKTQUELLE
    : colKey === "kapitalrahmen" ? KAPITALRAHMEN
    : colKey === "status" ? STATUS_OPTS
    : colKey === "naechster_schritt" ? NAECHSTER_SCHRITT_OPTS
    : colKey === "zustaendig" ? ZUSTAENDIG_OPTS : [];

  const commit = () => onSave(draft.trim() || null);

  if (isDropdown) return (
    <select autoFocus style={cellInp} value={draft}
      onChange={e => { setDraft(e.target.value); onSave(e.target.value || null); }}
      onBlur={commit} onClick={e => e.stopPropagation()}>
      <option value="">—</option>
      {opts.map(o => <option key={o}>{o}</option>)}
    </select>
  );
  if (isDate) return (
    <input autoFocus type="date" style={cellInp} value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit} onClick={e => e.stopPropagation()} />
  );
  return (
    <input autoFocus type={colKey === "email" ? "email" : "text"} style={cellInp} value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit} onClick={e => e.stopPropagation()} />
  );
}

// ── Sentinel panel (scripted — no LLM API, no tokens) ─────────────────────────

type Step = { key: keyof Omit<Investor, "id" | "created_at">; question: string; opts?: string[] };

const STEPS: Step[] = [
  { key: "name",              question: "Wie heißt der Interessent?" },
  { key: "unternehmen",       question: "Welches Unternehmen?" },
  { key: "email",             question: "E-Mail-Adresse?" },
  { key: "telefon",           question: "Telefonnummer?" },
  { key: "kontaktquelle",     question: "Wie wurde der Kontakt hergestellt?", opts: KONTAKTQUELLE },
  { key: "kapitalrahmen",     question: "Welcher Kapitalrahmen?",             opts: KAPITALRAHMEN },
  { key: "status",            question: "Aktueller Status?",                  opts: STATUS_OPTS },
  { key: "naechster_schritt", question: "Nächster Schritt?",                  opts: NAECHSTER_SCHRITT_OPTS },
  { key: "zustaendig",        question: "Wer ist zuständig?",                 opts: ZUSTAENDIG_OPTS },
  { key: "notizen",           question: "Notizen? (Enter = überspringen)" },
];

type ChatMsg = { from: "sentinel" | "user"; text: string };

const EMPTY_FORM: Omit<Investor, "id" | "created_at"> = {
  name: "", unternehmen: null, email: null, telefon: null,
  kontaktquelle: null, kapitalrahmen: null, verfuegbar_ab: null,
  status: "Neu", letzter_kontakt: null, naechster_schritt: null,
  zustaendig: null, notizen: null,
};

function SentinelPanel({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [messages, setMessages] = useState<ChatMsg[]>([{ from: "sentinel", text: STEPS[0].question }]);
  const [stepIdx, setStepIdx] = useState(0);
  const [draft, setDraft] = useState("");
  const [form, setForm] = useState<Omit<Investor, "id" | "created_at">>({ ...EMPTY_FORM });
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    inputRef.current?.focus();
  }, [messages]);

  const currentStep = STEPS[stepIdx];

  function submit(value: string) {
    const val = value.trim();
    const newForm = { ...form, [currentStep.key]: val || null };
    setForm(newForm);
    setDraft("");
    const next = stepIdx + 1;

    if (next >= STEPS.length) {
      setMessages(m => [...m,
        { from: "user", text: val || "(übersprungen)" },
        { from: "sentinel", text: `Erstelle Eintrag für „${newForm.name}"…` },
      ]);
      setDone(true);
      setSaving(true);
      // Only calls Supabase via /api/investors-crm — no LLM, no AI tokens
      fetch("/api/investors-crm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newForm),
      }).then(async r => {
        if (!r.ok) throw new Error((await r.json()).error ?? "Fehler");
        setMessages(m => [...m, { from: "sentinel", text: "✓ Gespeichert." }]);
        onCreated();
      }).catch(e => setErr(e.message))
        .finally(() => setSaving(false));
    } else {
      setMessages(m => [...m,
        { from: "user", text: val || "(übersprungen)" },
        { from: "sentinel", text: STEPS[next].question },
      ]);
      setStepIdx(next);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") { e.preventDefault(); submit(draft); }
  }

  function reset() {
    setMessages([{ from: "sentinel", text: STEPS[0].question }]);
    setStepIdx(0); setDraft(""); setForm({ ...EMPTY_FORM }); setDone(false); setErr(null);
  }

  return (
    <div style={{
      position: "fixed", top: 0, right: 0, bottom: 0, width: 360, zIndex: 500,
      background: "#0c0c0e", borderLeft: "1px solid rgba(255,255,255,0.08)",
      display: "flex", flexDirection: "column", boxShadow: "-12px 0 40px rgba(0,0,0,0.6)",
    }}>
      {/* Header */}
      <div style={{ padding: "13px 16px", borderBottom: "1px solid rgba(255,255,255,0.07)", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <MessageSquare size={14} color="rgba(255,255,255,0.5)" strokeWidth={1.65} />
        <span style={{ fontSize: 13, fontWeight: 700, color: "#e4e4e7", fontFamily: T, flex: 1 }}>Sentinel · Neuer Kontakt</span>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", fontFamily: T }}>
          {done ? "Fertig" : `${stepIdx + 1} / ${STEPS.length}`}
        </span>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", cursor: "pointer", padding: 2, display: "flex" }}>
          <X size={14} />
        </button>
      </div>

      {/* Progress bar */}
      <div style={{ height: 1, background: "rgba(255,255,255,0.06)", flexShrink: 0 }}>
        <div style={{
          height: "100%", background: "rgba(255,255,255,0.35)",
          width: `${((done ? STEPS.length : stepIdx) / STEPS.length) * 100}%`,
          transition: "width 300ms ease",
        }} />
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "14px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.from === "user" ? "flex-end" : "flex-start" }}>
            <div style={{
              maxWidth: "82%", padding: "7px 11px",
              borderRadius: m.from === "user" ? "12px 12px 3px 12px" : "12px 12px 12px 3px",
              background: m.from === "user" ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)",
              border: `1px solid rgba(255,255,255,${m.from === "user" ? "0.12" : "0.06"})`,
              fontSize: 12,
              color: m.from === "user" ? "#e4e4e7" : "rgba(255,255,255,0.6)",
              fontFamily: T, lineHeight: 1.55,
            }}>
              {m.text}
            </div>
          </div>
        ))}
        {err && <div style={{ color: "#f87171", fontSize: 11, textAlign: "center", fontFamily: T }}>{err}</div>}
        <div ref={bottomRef} />
      </div>

      {/* Option chips */}
      {!done && currentStep.opts && (
        <div style={{ padding: "0 12px 10px", display: "flex", flexWrap: "wrap", gap: 5, flexShrink: 0 }}>
          {currentStep.opts.map(o => (
            <button key={o} onClick={() => submit(o)} style={{
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 20, padding: "3px 10px", fontSize: 11, color: "rgba(255,255,255,0.55)",
              fontFamily: T, cursor: "pointer", transition: "background 100ms, color 100ms",
            }}
              onMouseEnter={e => { const b = e.currentTarget; b.style.background = "rgba(255,255,255,0.1)"; b.style.color = "#e4e4e7"; }}
              onMouseLeave={e => { const b = e.currentTarget; b.style.background = "rgba(255,255,255,0.04)"; b.style.color = "rgba(255,255,255,0.55)"; }}
            >
              {o}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      {!done && (
        <div style={{ padding: "10px 12px 14px", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", gap: 8, flexShrink: 0 }}>
          <input
            ref={inputRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Antwort eingeben…"
            style={{
              flex: 1, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)",
              borderRadius: 7, color: "#e4e4e7", fontSize: 12, padding: "7px 10px",
              fontFamily: T, outline: "none",
            }}
          />
          <button onClick={() => submit(draft)} disabled={saving} style={{
            background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 7, padding: "0 12px", color: "rgba(255,255,255,0.6)", cursor: "pointer", display: "flex", alignItems: "center",
          }}>
            <Send size={13} />
          </button>
        </div>
      )}

      {done && !saving && (
        <div style={{ padding: "12px 12px 14px", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", gap: 8, flexShrink: 0 }}>
          <button onClick={reset} style={{
            flex: 1, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 7, padding: "7px", color: "#e4e4e7", cursor: "pointer", fontSize: 12,
            fontFamily: T, fontWeight: 600,
          }}>
            <ChevronRight size={12} style={{ display: "inline", marginRight: 4 }} />
            Weiteren hinzufügen
          </button>
          <button onClick={onClose} style={{
            flex: 1, background: "transparent", border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 7, padding: "7px", color: "rgba(255,255,255,0.35)", cursor: "pointer", fontSize: 12,
            fontFamily: T,
          }}>
            Schließen
          </button>
        </div>
      )}
    </div>
  );
}

// ── KPI strip ──────────────────────────────────────────────────────────────────

function KpiStrip({ rows }: { rows: Investor[] }) {
  const warmCommitments  = rows.filter(r => r.status === "Warm Commitment").length;
  const bereitOnboarding = rows.filter(r => r.status === "Bereit für Onboarding").length;
  const pipeline         = rows.filter(r => !["Abgesagt", "Später kontaktieren"].includes(r.status)).length;
  const capital          = estimateCapital(rows);

  const kpis = [
    { label: "Investoren",      value: String(rows.length) },
    { label: "Kapital",         value: capital },
    { label: "Warm Commitment", value: String(warmCommitments) },
    { label: "Bereit",          value: String(bereitOnboarding) },
    { label: "Pipeline aktiv",  value: String(pipeline) },
  ];

  return (
    <div style={{
      display: "flex", gap: 0, borderBottom: "1px solid rgba(255,255,255,0.06)",
      flexShrink: 0, overflowX: "auto",
    }}>
      {kpis.map((k, i) => (
        <div key={k.label} style={{
          padding: "10px 20px", flexShrink: 0,
          borderRight: i < kpis.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
        }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.25)", fontFamily: T, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 3 }}>
            {k.label}
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#e4e4e7", fontFamily: T, lineHeight: 1 }}>
            {k.value}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Column definitions ─────────────────────────────────────────────────────────

type Col = { key: keyof Investor; label: string; w: number };
const COLS: Col[] = [
  { key: "name",              label: "Name",             w: 150 },
  { key: "unternehmen",       label: "Unternehmen",      w: 120 },
  { key: "email",             label: "E-Mail",           w: 160 },
  { key: "status",            label: "Status",           w: 175 },
  { key: "kapitalrahmen",     label: "Kapital",          w: 155 },
  { key: "kontaktquelle",     label: "Quelle",           w: 130 },
  { key: "naechster_schritt", label: "Nächst. Schritt",  w: 160 },
  { key: "zustaendig",        label: "Zuständig",        w: 90  },
  { key: "letzter_kontakt",   label: "Letzter Kont.",    w: 105 },
  { key: "notizen",           label: "Notizen",          w: 190 },
];

// 8 ghost rows shown when table is empty — fade via gradient overlay
const GHOST_ROWS = 8;

function fmtDate(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

// ── Main view ──────────────────────────────────────────────────────────────────

export function OnboardingView() {
  const [rows, setRows] = useState<Investor[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingCol, setEditingCol] = useState<keyof Investor | null>(null);
  const [search, setSearch] = useState("");
  const [sentinelOpen, setSentinelOpen] = useState(false);
  const savingRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/investors-crm");
      if (r.ok) setRows(await r.json());
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function patch(id: string, key: keyof Investor, value: string | null) {
    if (savingRef.current) return;
    savingRef.current = true;
    setRows(prev => prev.map(r => r.id === id ? { ...r, [key]: value } : r));
    try {
      await fetch(`/api/investors-crm/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
    } finally { savingRef.current = false; }
  }

  async function del(id: string) {
    if (!confirm("Löschen?")) return;
    await fetch(`/api/investors-crm/${id}`, { method: "DELETE" });
    setRows(prev => prev.filter(r => r.id !== id));
    if (editingId === id) setEditingId(null);
  }

  const nrMap = Object.fromEntries(rows.map((r, i) => [r.id, i + 1]));

  const filtered = rows.filter(r => {
    if (!search) return true;
    const q = search.toLowerCase();
    return ["name", "unternehmen", "email", "telefon", "notizen"].some(
      k => (r[k as keyof Investor] ?? "").toString().toLowerCase().includes(q)
    );
  });

  const isEmpty = !loading && filtered.length === 0;

  const th: React.CSSProperties = {
    padding: "0 8px", height: 30, textAlign: "left", fontSize: 10, fontWeight: 700,
    color: "rgba(255,255,255,0.3)", fontFamily: T, letterSpacing: "0.07em",
    textTransform: "uppercase", whiteSpace: "nowrap", userSelect: "none",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
  };
  const td: React.CSSProperties = {
    padding: "0 8px", height: 34, verticalAlign: "middle",
    borderBottom: "1px solid rgba(255,255,255,0.04)", whiteSpace: "nowrap",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, background: "#0a0a0c", color: "#e4e4e7", position: "relative" }}>

      {/* KPI strip */}
      <KpiStrip rows={rows} />

      {/* Toolbar */}
      <div style={{ padding: "8px 16px", flexShrink: 0, borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.6)", fontFamily: T, flexShrink: 0 }}>Onboarding</span>
        <input
          style={{
            marginLeft: 2, flex: 1, maxWidth: 200,
            background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 5, color: "#e4e4e7", fontSize: 12, padding: "4px 9px",
            fontFamily: T, outline: "none",
          }}
          placeholder="Suche…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setSentinelOpen(true)}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 6, padding: "5px 12px", color: "rgba(255,255,255,0.7)", cursor: "pointer",
            fontSize: 11, fontWeight: 700, fontFamily: T, letterSpacing: "0.04em",
          }}
        >
          <MessageSquare size={12} strokeWidth={1.65} />
          Sentinel
        </button>
      </div>

      {/* Table area */}
      <div style={{ flex: 1, minHeight: 0, overflowX: "auto", overflowY: "auto", position: "relative" }}>
        {loading ? (
          <div style={{ padding: 32, textAlign: "center", color: "rgba(255,255,255,0.2)", fontSize: 12, fontFamily: T }}>Lädt…</div>
        ) : (
          <>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1200 }}>
              <thead style={{ position: "sticky", top: 0, zIndex: 10, background: "#0a0a0c" }}>
                <tr>
                  <th style={{ ...th, width: 36, paddingLeft: 14 }}>#</th>
                  {COLS.map(c => <th key={c.key} style={{ ...th, width: c.w }}>{c.label}</th>)}
                  <th style={{ ...th, width: 34 }} />
                </tr>
              </thead>
              <tbody>
                {/* Real rows */}
                {filtered.map((row, ri) => {
                  const isRowActive = editingId === row.id;
                  return (
                    <tr
                      key={row.id}
                      style={{
                        background: isRowActive
                          ? "rgba(255,255,255,0.04)"
                          : ri % 2 === 0 ? "transparent" : "rgba(255,255,255,0.012)",
                        cursor: "default",
                      }}
                      onClick={() => { setEditingId(row.id); setEditingCol(null); }}
                    >
                      <td style={{ ...td, paddingLeft: 14 }}>
                        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", fontFamily: T }}>{nrMap[row.id]}</span>
                      </td>
                      {COLS.map(c => {
                        const isEdit = isRowActive && editingCol === c.key;
                        const raw = row[c.key] as string | null;
                        return (
                          <td key={c.key} style={{ ...td, maxWidth: c.w }}
                            onClick={e => { e.stopPropagation(); setEditingId(row.id); setEditingCol(c.key); }}>
                            {isEdit ? (
                              <EditCell colKey={c.key} value={raw} onSave={v => { patch(row.id, c.key, v); setEditingCol(null); }} />
                            ) : c.key === "status" ? (
                              <StatusBadge status={raw ?? "Neu"} />
                            ) : (c.key === "letzter_kontakt" || c.key === "verfuegbar_ab") ? (
                              <span style={{ fontSize: 12, color: "#e4e4e7", fontFamily: T }}>{fmtDate(raw)}</span>
                            ) : (
                              <span style={{ fontSize: 12, color: raw ? "#e4e4e7" : "rgba(255,255,255,0.18)", fontFamily: T, overflow: "hidden", textOverflow: "ellipsis", display: "block", maxWidth: c.w - 16 }}>
                                {raw ?? "—"}
                              </span>
                            )}
                          </td>
                        );
                      })}
                      <td style={td} onClick={e => e.stopPropagation()}>
                        <button onClick={() => del(row.id)}
                          style={{ background: "none", border: "none", color: "rgba(239,68,68,0.4)", cursor: "pointer", fontSize: 13, padding: "2px 4px" }}
                          title="Löschen">✕</button>
                      </td>
                    </tr>
                  );
                })}

                {/* Ghost rows — always shown when empty, faded by gradient overlay */}
                {isEmpty && Array.from({ length: GHOST_ROWS }).map((_, gi) => (
                  <tr key={`ghost-${gi}`} style={{ opacity: Math.max(0, 1 - gi * 0.14), pointerEvents: "none" }}>
                    <td style={{ ...td, paddingLeft: 14 }}>
                      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.12)", fontFamily: T }}>{gi + 1}</span>
                    </td>
                    {COLS.map(c => (
                      <td key={c.key} style={{ ...td, maxWidth: c.w }}>
                        <span style={{
                          display: "block", height: 8, borderRadius: 4,
                          background: "rgba(255,255,255,0.05)",
                          width: `${40 + ((gi * 7 + c.w / 10) % 45)}%`,
                        }} />
                      </td>
                    ))}
                    <td style={td} />
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Gradient fade-out overlay for ghost state */}
            {isEmpty && (
              <div style={{
                position: "sticky", bottom: 0, left: 0, right: 0, height: 120, pointerEvents: "none",
                background: "linear-gradient(to bottom, transparent, #0a0a0c)",
                marginTop: -120, zIndex: 5,
              }} />
            )}

            {/* Empty label under gradient */}
            {isEmpty && (
              <div style={{ padding: "16px 0 24px", textAlign: "center", color: "rgba(255,255,255,0.18)", fontSize: 11, fontFamily: T, letterSpacing: "0.05em" }}>
                {rows.length === 0
                  ? "Noch keine Kontakte — Sentinel starten"
                  : "Keine Treffer für diese Suche"}
              </div>
            )}
          </>
        )}
      </div>

      {sentinelOpen && (
        <SentinelPanel onClose={() => setSentinelOpen(false)} onCreated={load} />
      )}
    </div>
  );
}
