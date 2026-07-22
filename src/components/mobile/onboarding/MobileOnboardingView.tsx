"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { MessageSquare, Send, X, ChevronRight, Trash2 } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Investor = {
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

// ── Dropdown options — identical to desktop ───────────────────────────────────

const STATUS_OPTS = [
  "Neu","Kontaktiert","Early Access gesendet","Interesse bestätigt",
  "Gespräch geplant","Warm Commitment","Unterlagen ausstehend",
  "Bereit für Onboarding","Später kontaktieren","Abgesagt",
];
const KONTAKTQUELLE   = ["Persönlicher Kontakt","Empfehlung","Vermittler","Netzwerk / Event","LinkedIn","Sonstiges"];
const KAPITALRAHMEN   = ["unter 25.000 EUR","25.000–50.000 EUR","50.000–100.000 EUR","100.000–250.000 EUR","250.000–500.000 EUR","über 500.000 EUR","noch offen"];
const NAECHSTER       = ["Erstkontakt","PDF senden","Rückruf","Gespräch vereinbaren","Follow-up senden","Unterlagen anfordern","Auf Launch warten","Kein weiterer Schritt"];
const ZUSTAENDIG_OPTS = ["Jeroen","Partner 2","Partner 3"];

// ── Inline SVG icons ──────────────────────────────────────────────────────────

function FieldIcon({ d, size = 13 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0 }}>
      <path d={d} />
    </svg>
  );
}

const ICONS: Record<string, string> = {
  name:              "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  unternehmen:       "M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9z M3 9l2.45-4.9A2 2 0 0 1 7.24 3h9.52a2 2 0 0 1 1.8 1.1L21 9",
  email:             "M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z M22 6l-10 7L2 6",
  telefon:           "M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z",
  kontaktquelle:     "M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z M12 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
  kapitalrahmen:     "M12 1v22 M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
  status:            "M22 11.08V12a10 10 0 1 1-5.93-9.14 M22 4L12 14.01l-3-3",
  letzter_kontakt:   "M3 12a9 9 0 1 0 18 0A9 9 0 0 0 3 12z M12 7v5l4 2",
  naechster_schritt: "M5 12h14 M12 5l7 7-7 7",
  zustaendig:        "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  verfuegbar_ab:     "M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01",
  notizen:           "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8",
};

// ── Field definitions ─────────────────────────────────────────────────────────

type FieldType = "text" | "select" | "date" | "status";
type FieldDef = {
  key: keyof Investor;
  label: string;
  short: string;
  icon: string;
  type: FieldType;
  opts?: string[];
  rowH?: number;
};

const FIELDS: FieldDef[] = [
  { key: "name",              label: "Name",           short: "Name",    icon: ICONS.name,              type: "text"   },
  { key: "unternehmen",       label: "Unternehmen",    short: "Firma",   icon: ICONS.unternehmen,       type: "text"   },
  { key: "email",             label: "E-Mail",         short: "E-Mail",  icon: ICONS.email,             type: "text"   },
  { key: "telefon",           label: "Telefon",        short: "Tel.",    icon: ICONS.telefon,           type: "text"   },
  { key: "kontaktquelle",     label: "Quelle",         short: "Quelle",  icon: ICONS.kontaktquelle,     type: "select", opts: KONTAKTQUELLE   },
  { key: "kapitalrahmen",     label: "Kapital",        short: "Kapital", icon: ICONS.kapitalrahmen,     type: "select", opts: KAPITALRAHMEN   },
  { key: "status",            label: "Status",         short: "Status",  icon: ICONS.status,            type: "status", opts: STATUS_OPTS     },
  { key: "letzter_kontakt",   label: "Letzt. Kont.",   short: "Kontakt", icon: ICONS.letzter_kontakt,   type: "date"   },
  { key: "naechster_schritt", label: "Nächster Schr.", short: "Nächst.", icon: ICONS.naechster_schritt, type: "select", opts: NAECHSTER       },
  { key: "zustaendig",        label: "Zuständig",      short: "Wer",     icon: ICONS.zustaendig,        type: "select", opts: ZUSTAENDIG_OPTS },
  { key: "verfuegbar_ab",     label: "Verfügbar ab",   short: "Ab",      icon: ICONS.verfuegbar_ab,     type: "date"   },
  { key: "notizen",           label: "Notizen",        short: "Notizen", icon: ICONS.notizen,           type: "text",   rowH: 56              },
];

const BASE_ROW_H = 44;
const COL_W      = 168;
const LABEL_WIDE = 88;
const LABEL_SLIM = 44;

// ── Capital estimate ──────────────────────────────────────────────────────────

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

// ── Status styling ────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  "Neu":                    { bg: "rgba(113,113,122,0.18)", color: "#a1a1aa", border: "rgba(113,113,122,0.35)" },
  "Kontaktiert":            { bg: "rgba(59,130,246,0.18)",  color: "#60a5fa", border: "rgba(59,130,246,0.35)" },
  "Early Access gesendet":  { bg: "rgba(99,102,241,0.18)",  color: "#818cf8", border: "rgba(99,102,241,0.35)" },
  "Interesse bestätigt":    { bg: "rgba(6,182,212,0.18)",   color: "#22d3ee", border: "rgba(6,182,212,0.35)" },
  "Gespräch geplant":       { bg: "rgba(168,85,247,0.18)",  color: "#c084fc", border: "rgba(168,85,247,0.35)" },
  "Warm Commitment":        { bg: "rgba(245,158,11,0.18)",  color: "#fbbf24", border: "rgba(245,158,11,0.35)" },
  "Unterlagen ausstehend":  { bg: "rgba(249,115,22,0.18)",  color: "#fb923c", border: "rgba(249,115,22,0.35)" },
  "Bereit für Onboarding":  { bg: "rgba(34,197,94,0.18)",   color: "#4ade80", border: "rgba(34,197,94,0.35)" },
  "Später kontaktieren":    { bg: "rgba(63,63,70,0.35)",    color: "#71717a", border: "rgba(63,63,70,0.55)" },
  "Abgesagt":               { bg: "rgba(239,68,68,0.18)",   color: "#f87171", border: "rgba(239,68,68,0.35)" },
};

// ── Inline cell ───────────────────────────────────────────────────────────────

function Cell({
  investor, field, onSave,
}: {
  investor: Investor;
  field: FieldDef;
  onSave: (id: string, key: keyof Investor, value: string | null) => void;
}) {
  const raw  = investor[field.key] as string | null;
  const rowH = field.rowH ?? BASE_ROW_H;
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft  ] = useState(raw ?? "");

  useEffect(() => { setDraft(raw ?? ""); }, [raw]);

  const commit = useCallback(() => {
    setEditing(false);
    const v = draft.trim() || null;
    if (v !== (raw?.trim() || null)) onSave(investor.id, field.key, v);
  }, [draft, raw, investor.id, field.key, onSave]);

  const inputStyle: React.CSSProperties = {
    width: "100%", background: "#1b1c21",
    border: "1px solid rgba(255,255,255,0.18)",
    borderRadius: 4, color: "#e4e4e7", fontSize: 12,
    padding: "5px 7px", outline: "none", boxSizing: "border-box",
    fontFamily: T,
  };

  if (field.type === "status") {
    const st = STATUS_STYLE[raw ?? ""] ?? STATUS_STYLE["Neu"];
    if (!editing) return (
      <div onClick={() => setEditing(true)} style={{ height: rowH, display: "flex", alignItems: "center", padding: "0 8px", cursor: "pointer" }}>
        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: st.bg, color: st.color, border: `1px solid ${st.border}`, whiteSpace: "nowrap" }}>
          {raw ?? "Neu"}
        </span>
      </div>
    );
    return (
      <div style={{ height: rowH, display: "flex", alignItems: "center", padding: "0 6px" }}>
        <select autoFocus value={draft}
          onChange={e => { const v = e.target.value; setDraft(v); onSave(investor.id, field.key, v); setEditing(false); }}
          onBlur={() => setEditing(false)}
          style={inputStyle}
        >
          {STATUS_OPTS.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
    );
  }

  if (field.type === "select") {
    if (!editing) return (
      <div onClick={() => setEditing(true)} style={{ height: rowH, display: "flex", alignItems: "center", padding: "0 8px", cursor: "pointer" }}>
        <span style={{ fontSize: 11, color: raw ? "rgba(255,255,255,0.78)" : "rgba(255,255,255,0.18)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {raw ?? "—"}
        </span>
      </div>
    );
    return (
      <div style={{ height: rowH, display: "flex", alignItems: "center", padding: "0 6px" }}>
        <select autoFocus value={draft}
          onChange={e => { const v = e.target.value; setDraft(v); onSave(investor.id, field.key, v || null); setEditing(false); }}
          onBlur={() => setEditing(false)}
          style={inputStyle}
        >
          <option value="">—</option>
          {(field.opts ?? []).map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
    );
  }

  if (!editing) return (
    <div onClick={() => { setDraft(raw ?? ""); setEditing(true); }}
      style={{ height: rowH, display: "flex", alignItems: "flex-start", padding: field.rowH ? "8px 8px 0" : "0 8px", cursor: "pointer", overflow: "hidden" }}>
      <span style={{ fontSize: 11, color: raw ? "rgba(255,255,255,0.78)" : "rgba(255,255,255,0.18)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: field.rowH ? "pre-wrap" : "nowrap", lineHeight: 1.4 }}>
        {raw ?? "—"}
      </span>
    </div>
  );

  return (
    <div style={{ height: rowH, display: "flex", alignItems: "center", padding: "0 6px" }}>
      <input autoFocus type={field.key === "email" ? "email" : field.type === "date" ? "date" : "text"}
        value={draft} onChange={e => setDraft(e.target.value)}
        onBlur={commit} onKeyDown={e => e.key === "Enter" && commit()}
        style={inputStyle}
      />
    </div>
  );
}

// ── Sentinel Bottom Sheet ─────────────────────────────────────────────────────

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

function SentinelSheet({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [messages, setMessages] = useState<ChatMsg[]>([{ from: "sentinel", text: SENTINEL_STEPS[0].question }]);
  const [stepIdx,  setStepIdx]  = useState(0);
  const [draft,    setDraft]    = useState("");
  const [form,     setForm]     = useState<ReturnType<typeof EMPTY_FORM>>(EMPTY_FORM());
  const [done,     setDone]     = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [err,      setErr]      = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);

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
        .catch(e => setErr(String(e)))
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
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.55)" }} />
      {/* Sheet */}
      <div style={{
        position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 201,
        height: "70dvh", background: "#0c0c0e",
        borderTop: "1px solid rgba(255,255,255,0.10)",
        borderRadius: "16px 16px 0 0",
        display: "flex", flexDirection: "column",
        boxShadow: "0 -12px 48px rgba(0,0,0,0.7)",
      }}>
        {/* Handle */}
        <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 4px" }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.15)" }} />
        </div>

        {/* Header */}
        <div style={{ padding: "4px 16px 10px", display: "flex", alignItems: "center", gap: 10, flexShrink: 0, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <MessageSquare size={14} color="rgba(255,255,255,0.5)" strokeWidth={1.65} />
          <span style={{ fontSize: 13, fontWeight: 700, color: "#e4e4e7", fontFamily: T, flex: 1 }}>Sentinel · Neuer Kontakt</span>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", fontFamily: T }}>{done ? "Fertig" : `${stepIdx + 1} / ${SENTINEL_STEPS.length}`}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", cursor: "pointer", padding: 2, display: "flex" }}><X size={14} /></button>
        </div>

        {/* Progress bar */}
        <div style={{ height: 2, background: "rgba(255,255,255,0.06)", flexShrink: 0 }}>
          <div style={{ height: "100%", background: "rgba(255,255,255,0.35)", width: `${((done ? SENTINEL_STEPS.length : stepIdx) / SENTINEL_STEPS.length) * 100}%`, transition: "width 300ms ease" }} />
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
          {messages.map((m, i) => (
            <div key={i} style={{ display: "flex", justifyContent: m.from === "user" ? "flex-end" : "flex-start" }}>
              <div style={{
                maxWidth: "82%", padding: "8px 12px",
                borderRadius: m.from === "user" ? "12px 12px 3px 12px" : "12px 12px 12px 3px",
                background: m.from === "user" ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)",
                border: `1px solid rgba(255,255,255,${m.from === "user" ? "0.12" : "0.06"})`,
                fontSize: 13, color: m.from === "user" ? "#e4e4e7" : "rgba(255,255,255,0.6)",
                fontFamily: T, lineHeight: 1.55,
              }}>
                {m.text}
              </div>
            </div>
          ))}
          {err && <div style={{ color: "#f87171", fontSize: 12, textAlign: "center", fontFamily: T }}>{err}</div>}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        {!done && (
          <div style={{ padding: "10px 12px 20px", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", gap: 8, flexShrink: 0 }}>
            <input
              ref={inputRef}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); submit(draft); } }}
              placeholder="Antwort eingeben…"
              style={{ flex: 1, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 8, color: "#e4e4e7", fontSize: 14, padding: "10px 12px", fontFamily: T, outline: "none" }}
            />
            <button onClick={() => submit(draft)} disabled={saving}
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "0 14px", color: "rgba(255,255,255,0.6)", cursor: "pointer", display: "flex", alignItems: "center", WebkitTapHighlightColor: "transparent" } as React.CSSProperties}>
              <Send size={15} />
            </button>
          </div>
        )}
        {done && !saving && (
          <div style={{ padding: "10px 12px 20px", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", gap: 8, flexShrink: 0 }}>
            <button onClick={reset}
              style={{ flex: 1, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "10px", color: "#e4e4e7", cursor: "pointer", fontSize: 13, fontFamily: T, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, WebkitTapHighlightColor: "transparent" } as React.CSSProperties}>
              <ChevronRight size={13} />Weiteren hinzufügen
            </button>
            <button onClick={onClose}
              style={{ flex: 1, background: "transparent", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, padding: "10px", color: "rgba(255,255,255,0.35)", cursor: "pointer", fontSize: 13, fontFamily: T, WebkitTapHighlightColor: "transparent" } as React.CSSProperties}>
              Schließen
            </button>
          </div>
        )}
      </div>
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function MobileOnboardingView() {
  const [investors,     setInvestors]     = useState<Investor[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [slim,          setSlim]          = useState(false);
  const [sentinelOpen,  setSentinelOpen]  = useState(false);

  const rightRef     = useRef<HTMLDivElement>(null);
  const labelBodyRef = useRef<HTMLDivElement>(null);
  const swipeTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastScrollX  = useRef(0);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/investors-crm");
      if (r.ok) setInvestors(await r.json() as Investor[]);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = useCallback(async (id: string, key: keyof Investor, value: string | null) => {
    setInvestors(prev => prev.map(inv => inv.id === id ? { ...inv, [key]: value } : inv));
    await fetch(`/api/investors-crm/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [key]: value }),
    }).catch(() => {});
  }, []);

  const del = useCallback(async (id: string) => {
    if (!confirm("Investor löschen?")) return;
    await fetch(`/api/investors-crm/${id}`, { method: "DELETE" }).catch(() => {});
    setInvestors(prev => prev.filter(inv => inv.id !== id));
  }, []);

  const onRightScroll = useCallback(() => {
    const el = rightRef.current;
    if (!el) return;
    if (labelBodyRef.current) labelBodyRef.current.scrollTop = el.scrollTop;
    const dx = Math.abs(el.scrollLeft - lastScrollX.current);
    lastScrollX.current = el.scrollLeft;
    if (dx > 2) {
      setSlim(true);
      if (swipeTimer.current) clearTimeout(swipeTimer.current);
      swipeTimer.current = setTimeout(() => setSlim(false), 700);
    }
  }, []);

  const addInvestor = useCallback(async () => {
    try {
      const r = await fetch("/api/investors-crm", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Neuer Investor", status: "Neu" }),
      });
      const d = await r.json() as { data?: Investor } | Investor;
      const inv = (d as { data?: Investor }).data ?? (d as Investor);
      if (inv?.id) {
        setInvestors(prev => [...prev, inv]);
        setTimeout(() => { if (rightRef.current) rightRef.current.scrollLeft = rightRef.current.scrollWidth; }, 80);
      }
    } catch { /* ignore */ }
  }, []);

  // KPIs
  const warmCount   = investors.filter(r => r.status === "Warm Commitment").length;
  const bereitCount = investors.filter(r => r.status === "Bereit für Onboarding").length;
  const pipeline    = investors.filter(r => !["Abgesagt", "Später kontaktieren"].includes(r.status)).length;
  const capital     = estimateCapital(investors);

  if (loading) return (
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.28)", fontSize: 13, fontFamily: T }}>
      Lädt…
    </div>
  );

  return (
    <>
      <style>{`.mob-ob-scroll::-webkit-scrollbar { display: none; }`}</style>

      <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden", background: "#0e0f16" }}>

        {/* ── Header ── */}
        <div style={{ flexShrink: 0, padding: "10px 12px 8px", borderBottom: "1px solid rgba(255,255,255,0.07)", background: "#0c0d10" }}>
          {/* Title row */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: "rgba(255,255,255,0.88)", fontFamily: T, flex: 1, letterSpacing: "-0.01em" }}>
              Investor Onboarding
            </span>
            <button onClick={() => setSentinelOpen(true)}
              style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 6, padding: "5px 10px", color: "rgba(255,255,255,0.6)", cursor: "pointer", fontSize: 11, fontWeight: 700, fontFamily: T, WebkitTapHighlightColor: "transparent" } as React.CSSProperties}>
              <MessageSquare size={11} strokeWidth={1.65} />Sentinel
            </button>
            <button onClick={() => void addInvestor()}
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 6, color: "rgba(255,255,255,0.7)", fontSize: 11, fontWeight: 700, padding: "5px 10px", cursor: "pointer", fontFamily: T, WebkitTapHighlightColor: "transparent" } as React.CSSProperties}>
              + Neu
            </button>
          </div>
          {/* KPI chips */}
          <div style={{ display: "flex", gap: 6, flexWrap: "nowrap", overflowX: "auto" }}>
            {[
              { label: "Investoren", value: String(investors.length) },
              { label: "Kapital",    value: capital },
              { label: "Warm",       value: String(warmCount) },
              { label: "Bereit",     value: String(bereitCount) },
              { label: "Pipeline",   value: String(pipeline) },
            ].map(k => (
              <div key={k.label} style={{ flexShrink: 0, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 6, padding: "4px 8px", display: "flex", flexDirection: "column", alignItems: "center", minWidth: 44 }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: "#e4e4e7", fontFamily: T, lineHeight: 1.1 }}>{k.value}</span>
                <span style={{ fontSize: 8, fontWeight: 700, color: "rgba(255,255,255,0.28)", fontFamily: T, letterSpacing: "0.06em", textTransform: "uppercase", marginTop: 2 }}>{k.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Transposed table ── */}
        <div style={{ flex: 1, minHeight: 0, display: "flex", overflow: "hidden" }}>

          {/* Left label column */}
          <div style={{
            flexShrink: 0,
            width: slim ? LABEL_SLIM : LABEL_WIDE,
            transition: "width 200ms cubic-bezier(.4,0,.2,1)",
            display: "flex", flexDirection: "column",
            borderRight: "1px solid rgba(255,255,255,0.07)",
            background: "#0c0d10", zIndex: 2, overflow: "hidden",
          }}>
            <div style={{ height: 36, flexShrink: 0, borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "center", background: "#0e0f14" }}>
              <span style={{ fontSize: 8, fontWeight: 800, color: "rgba(255,255,255,0.2)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                {slim ? "▶" : "Feld"}
              </span>
            </div>
            <div ref={labelBodyRef} style={{ flex: 1, overflowY: "hidden" }}>
              {FIELDS.map(f => (
                <div key={f.key} style={{ height: f.rowH ?? BASE_ROW_H, display: "flex", alignItems: "center", padding: "0 8px", borderBottom: "1px solid rgba(255,255,255,0.06)", gap: 6, overflow: "hidden" }}>
                  <span style={{ color: "rgba(255,255,255,0.6)", flexShrink: 0, display: "flex", alignItems: "center" }}>
                    <FieldIcon d={f.icon} size={13} />
                  </span>
                  <span style={{ fontSize: 9.5, fontWeight: 600, color: "rgba(255,255,255,0.65)", overflow: "hidden", whiteSpace: "nowrap", opacity: slim ? 0 : 1, maxWidth: slim ? 0 : 80, transition: "opacity 160ms ease, max-width 180ms ease", display: "block", letterSpacing: "0.01em" }}>
                    {f.short}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Right investor columns */}
          <div
            ref={rightRef}
            className="mob-ob-scroll"
            onScroll={onRightScroll}
            style={{ flex: 1, overflowX: "auto", overflowY: "auto", scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch" } as React.CSSProperties}
          >
            {investors.length === 0 ? (
              <div style={{ minHeight: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.2)", fontSize: 13, padding: 24, textAlign: "center", fontFamily: T }}>
                Noch keine Investoren.{"\n"}Sentinel starten oder + Neu tippen.
              </div>
            ) : (
              <div style={{ display: "flex", minWidth: investors.length * COL_W }}>
                {investors.map((inv, idx) => (
                  <div key={inv.id} style={{ width: COL_W, flexShrink: 0, scrollSnapAlign: "start", borderRight: "1px solid rgba(255,255,255,0.04)" }}>
                    {/* Investor header — sticky top */}
                    <div style={{ height: 36, display: "flex", alignItems: "center", padding: "0 8px", gap: 6, background: "#0e0f14", borderBottom: "1px solid rgba(255,255,255,0.06)", position: "sticky", top: 0, zIndex: 1 }}>
                      <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.28)", flexShrink: 0 }}>
                        {String(idx + 1).padStart(2, "0")}
                      </span>
                      <span style={{ flex: 1, fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.78)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {inv.name || "—"}
                      </span>
                      <button onClick={() => void del(inv.id)}
                        style={{ flexShrink: 0, background: "none", border: "none", color: "rgba(239,68,68,0.35)", cursor: "pointer", padding: "2px 3px", display: "flex", alignItems: "center", WebkitTapHighlightColor: "transparent" } as React.CSSProperties}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                    {FIELDS.map(f => (
                      <div key={f.key} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                        <Cell investor={inv} field={f} onSave={save} />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {sentinelOpen && <SentinelSheet onClose={() => setSentinelOpen(false)} onCreated={() => { void load(); setSentinelOpen(false); }} />}
    </>
  );
}
