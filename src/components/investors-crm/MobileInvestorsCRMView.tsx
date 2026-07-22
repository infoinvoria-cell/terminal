"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Investor } from "./InvestorsCRMView";

// ── Design tokens (same as MobileHomeView) ────────────────────────────────────
const CARD_BG     = "linear-gradient(180deg,#1c1d20 0%,#141517 100%)";
const CARD_BORDER = "rgba(255,255,255,0.06)";
const CARD_SHADOW = "0 8px 20px -8px rgba(0,0,0,0.55)";
const MUTED       = "rgba(255,255,255,0.38)";

// ── Options ────────────────────────────────────────────────────────────────────
const KONTAKTQUELLE    = ["Persönlicher Kontakt","Empfehlung","Vermittler","Netzwerk / Event","LinkedIn","Sonstiges"];
const KAPITALRAHMEN    = ["unter 25.000 EUR","25.000–50.000 EUR","50.000–100.000 EUR","100.000–250.000 EUR","250.000–500.000 EUR","über 500.000 EUR","noch offen"];
const STATUS_OPTS      = ["Neu","Kontaktiert","Early Access gesendet","Interesse bestätigt","Gespräch geplant","Warm Commitment","Unterlagen ausstehend","Bereit für Onboarding","Später kontaktieren","Abgesagt"];
const NAECHSTER_OPTS   = ["Erstkontakt","PDF senden","Rückruf","Gespräch vereinbaren","Follow-up senden","Unterlagen anfordern","Auf Launch warten","Kein weiterer Schritt"];
const ZUSTAENDIG_OPTS  = ["Jeroen","Partner 2","Partner 3"];

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
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// ── KPI Card (TopKpi design) ──────────────────────────────────────────────────
function KpiCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{
      background: CARD_BG, border: `1px solid ${CARD_BORDER}`,
      borderRadius: 10, boxShadow: CARD_SHADOW,
      padding: "9px 9px 11px",
      display: "flex", flexDirection: "column", justifyContent: "space-between",
      gap: 6, flex: 1, minWidth: 0,
    }}>
      <p style={{
        margin: 0, fontSize: 8, fontWeight: 600, color: MUTED,
        fontFamily: "var(--font-montserrat,sans-serif)",
        textTransform: "uppercase", letterSpacing: "0.01em", lineHeight: 1.2,
        overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis",
      }}>
        {label}
      </p>
      <p style={{
        margin: 0, fontSize: 13, fontWeight: 700, lineHeight: 1,
        letterSpacing: "-0.02em",
        fontFamily: "var(--font-nunito,sans-serif)",
        color: "#ffffff",
      }}>
        {value}
      </p>
    </div>
  );
}

// ── Column definitions ────────────────────────────────────────────────────────
type ColKey = keyof Investor;
const COLS: { key: ColKey; label: string; w: number }[] = [
  { key: "name",              label: "Name",            w: 140 },
  { key: "unternehmen",       label: "Unternehmen",     w: 120 },
  { key: "status",            label: "Status",          w: 160 },
  { key: "email",             label: "E-Mail",          w: 160 },
  { key: "telefon",           label: "Telefon",         w: 110 },
  { key: "kontaktquelle",     label: "Quelle",          w: 130 },
  { key: "kapitalrahmen",     label: "Kapital",         w: 150 },
  { key: "verfuegbar_ab",     label: "Verfügbar ab",    w: 100 },
  { key: "letzter_kontakt",   label: "Letzter Kontakt", w: 100 },
  { key: "naechster_schritt", label: "Nächster Schritt",w: 160 },
  { key: "zustaendig",        label: "Zuständig",       w: 90  },
  { key: "notizen",           label: "Notizen",         w: 180 },
];

// ── Inline cell editor ────────────────────────────────────────────────────────
function CellEditor({
  colKey, value, onSave, onClose,
}: { colKey: ColKey; value: string | null; onSave: (v: string | null) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(value ?? "");
  const ref = useRef<HTMLInputElement & HTMLSelectElement & HTMLTextAreaElement>(null);

  useEffect(() => {
    // Small delay so keyboard animation is smooth on iOS
    const t = setTimeout(() => ref.current?.focus(), 60);
    return () => clearTimeout(t);
  }, []);

  const commit = () => { onSave(draft.trim() || null); onClose(); };

  const isDropdown = ["kontaktquelle","kapitalrahmen","status","naechster_schritt","zustaendig"].includes(colKey);
  const isDate     = colKey === "verfuegbar_ab" || colKey === "letzter_kontakt";
  const opts = colKey === "kontaktquelle" ? KONTAKTQUELLE
    : colKey === "kapitalrahmen" ? KAPITALRAHMEN
    : colKey === "status" ? STATUS_OPTS
    : colKey === "naechster_schritt" ? NAECHSTER_OPTS
    : colKey === "zustaendig" ? ZUSTAENDIG_OPTS : [];

  // iOS no-zoom: font-size must be >= 16px
  const inputStyle: React.CSSProperties = {
    width: "100%", boxSizing: "border-box", border: "none", outline: "none",
    background: "transparent", color: "#fff",
    fontSize: 16, fontFamily: "var(--font-montserrat,sans-serif)",
    padding: 0, touchAction: "manipulation",
  };

  if (isDropdown) return (
    <select ref={ref as React.RefObject<HTMLSelectElement>} value={draft}
      onChange={e => { setDraft(e.target.value); onSave(e.target.value || null); onClose(); }}
      style={inputStyle}>
      <option value="">—</option>
      {opts.map(o => <option key={o}>{o}</option>)}
    </select>
  );
  if (isDate) return (
    <input ref={ref as React.RefObject<HTMLInputElement>} type="date" value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit} style={inputStyle} />
  );
  return (
    <input ref={ref as React.RefObject<HTMLInputElement>}
      type={colKey === "email" ? "email" : colKey === "telefon" ? "tel" : "text"}
      value={draft} onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => e.key === "Enter" && commit()}
      style={inputStyle} />
  );
}

// ── Guided Sentinel Chat ──────────────────────────────────────────────────────
type QStep = {
  key: keyof Investor | "done";
  bot: string;
  type: "text" | "email" | "tel" | "date" | "select" | "textarea";
  options?: string[];
  optional?: boolean;
};

const STEPS: QStep[] = [
  { key: "name",              bot: "Wie heißt die Person?",                    type: "text" },
  { key: "unternehmen",       bot: "Welches Unternehmen? (optional)",           type: "text",     optional: true },
  { key: "email",             bot: "E-Mail-Adresse? (optional)",                type: "email",    optional: true },
  { key: "telefon",           bot: "Telefonnummer? (optional)",                 type: "tel",      optional: true },
  { key: "kontaktquelle",     bot: "Wie kam der Kontakt zustande?",             type: "select",   options: KONTAKTQUELLE, optional: true },
  { key: "kapitalrahmen",     bot: "Welcher Kapitalrahmen kommt infrage?",      type: "select",   options: KAPITALRAHMEN, optional: true },
  { key: "verfuegbar_ab",     bot: "Ab wann verfügbar? (optional)",             type: "date",     optional: true },
  { key: "status",            bot: "Aktueller Status?",                         type: "select",   options: STATUS_OPTS },
  { key: "zustaendig",        bot: "Wer ist zuständig?",                        type: "select",   options: ZUSTAENDIG_OPTS, optional: true },
  { key: "naechster_schritt", bot: "Nächster Schritt?",                         type: "select",   options: NAECHSTER_OPTS, optional: true },
  { key: "notizen",           bot: "Notizen? (optional)",                       type: "textarea", optional: true },
  { key: "done",              bot: "",                                           type: "text" },
];

type ChatMsg = { from: "bot" | "user"; text: string };

function SentinelChat({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [step, setStep]       = useState(0);
  const [msgs, setMsgs]       = useState<ChatMsg[]>([{ from: "bot", text: STEPS[0].bot }]);
  const [draft, setDraft]     = useState("");
  const [form, setForm]       = useState<Record<string, string | null>>({ status: "Neu" });
  const [saving, setSaving]   = useState(false);
  const [done, setDone]       = useState(false);
  const listRef               = useRef<HTMLDivElement>(null);
  const inputRef              = useRef<HTMLInputElement & HTMLTextAreaElement & HTMLSelectElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs]);

  useEffect(() => {
    if (!done) setTimeout(() => inputRef.current?.focus(), 80);
  }, [step, done]);

  const current = STEPS[step];

  const advance = useCallback(async (value: string | null) => {
    const userText = value || (current.optional ? "—" : "");
    setMsgs(m => [...m, { from: "user", text: userText || "—" }]);

    const newForm = { ...form, ...(current.key !== "done" && { [current.key]: value }) };
    setForm(newForm);

    const nextStep = step + 1;

    if (STEPS[nextStep].key === "done") {
      // Save
      setSaving(true);
      setMsgs(m => [...m, { from: "bot", text: "Speichere…" }]);
      try {
        const r = await fetch("/api/investors-crm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...newForm, status: newForm.status ?? "Neu" }),
        });
        if (r.ok) {
          setMsgs(m => [...m.slice(0, -1), { from: "bot", text: `✓ ${newForm.name} wurde gespeichert.` }]);
          setDone(true);
          onSaved();
        } else {
          const e = await r.json();
          setMsgs(m => [...m.slice(0, -1), { from: "bot", text: `Fehler: ${e.error}` }]);
        }
      } catch {
        setMsgs(m => [...m.slice(0, -1), { from: "bot", text: "Verbindungsfehler. Bitte nochmal versuchen." }]);
      } finally { setSaving(false); }
      return;
    }

    setStep(nextStep);
    setDraft("");
    setMsgs(m => [...m, { from: "bot", text: STEPS[nextStep].bot }]);
  }, [step, form, current, onSaved]);

  const submit = () => {
    const val = draft.trim() || null;
    if (!val && !current.optional) return;
    advance(val);
  };

  const skip = () => advance(null);

  const isSelect = current.type === "select";

  // iOS no-zoom: 16px on all inputs
  const inpStyle: React.CSSProperties = {
    flex: 1, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 20, padding: "10px 16px",
    color: "#fff", fontSize: 16, fontFamily: "var(--font-montserrat,sans-serif)",
    outline: "none", touchAction: "manipulation",
    WebkitAppearance: "none",
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 2000,
      background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)",
      display: "flex", flexDirection: "column", justifyContent: "flex-end",
    }} onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "#111214",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: "20px 20px 0 0",
          display: "flex", flexDirection: "column",
          maxHeight: "85dvh",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        {/* Handle + header */}
        <div style={{ padding: "12px 16px 10px", borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.15)", margin: "0 auto 12px" }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#fff", fontFamily: "var(--font-montserrat,sans-serif)" }}>
              Investor aufnehmen
            </span>
            <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 18, cursor: "pointer", padding: "0 4px" }}>✕</button>
          </div>
        </div>

        {/* Messages */}
        <div ref={listRef} style={{ flex: 1, overflowY: "auto", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
          {msgs.map((m, i) => (
            <div key={i} style={{
              alignSelf: m.from === "bot" ? "flex-start" : "flex-end",
              maxWidth: "80%",
              background: m.from === "bot" ? "rgba(255,255,255,0.08)" : "rgba(226,202,122,0.15)",
              border: `1px solid ${m.from === "bot" ? "rgba(255,255,255,0.1)" : "rgba(226,202,122,0.25)"}`,
              borderRadius: m.from === "bot" ? "4px 14px 14px 14px" : "14px 4px 14px 14px",
              padding: "8px 12px",
              fontSize: 13, fontFamily: "var(--font-montserrat,sans-serif)",
              color: m.from === "bot" ? "rgba(255,255,255,0.85)" : "#e2ca7a",
              lineHeight: 1.45,
            }}>
              {m.text}
            </div>
          ))}
        </div>

        {/* Input area */}
        {!done && !saving && (
          <div style={{ padding: "10px 12px", borderTop: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
            {isSelect ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: current.optional ? 8 : 0 }}>
                {(current.options ?? []).map(o => (
                  <button key={o} onClick={() => advance(o)}
                    style={{
                      background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.14)",
                      borderRadius: 16, padding: "7px 12px",
                      color: "rgba(255,255,255,0.8)", fontSize: 12,
                      fontFamily: "var(--font-montserrat,sans-serif)", fontWeight: 600,
                      cursor: "pointer", touchAction: "manipulation", WebkitTapHighlightColor: "transparent",
                    }}>
                    {o}
                  </button>
                ))}
                {current.optional && (
                  <button onClick={skip} style={{ background: "none", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: "7px 12px", color: "rgba(255,255,255,0.35)", fontSize: 12, fontFamily: "var(--font-montserrat,sans-serif)", cursor: "pointer", touchAction: "manipulation" }}>
                    Überspringen
                  </button>
                )}
              </div>
            ) : (
              <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                {current.type === "textarea" ? (
                  <textarea ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                    value={draft} onChange={e => setDraft(e.target.value)}
                    placeholder="Tippen…" rows={2}
                    style={{ ...inpStyle, borderRadius: 12, resize: "none" }} />
                ) : (
                  <input ref={inputRef as React.RefObject<HTMLInputElement>}
                    type={current.type === "email" ? "email" : current.type === "tel" ? "tel" : current.type === "date" ? "date" : "text"}
                    value={draft} onChange={e => setDraft(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && submit()}
                    placeholder="Tippen…"
                    style={inpStyle} />
                )}
                <button onClick={submit}
                  style={{ flexShrink: 0, width: 40, height: 40, borderRadius: "50%", background: "#e2ca7a", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", touchAction: "manipulation" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                  </svg>
                </button>
                {current.optional && (
                  <button onClick={skip} style={{ flexShrink: 0, height: 40, padding: "0 12px", borderRadius: 20, background: "none", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.35)", fontSize: 11, cursor: "pointer", touchAction: "manipulation" }}>
                    Skip
                  </button>
                )}
              </div>
            )}
          </div>
        )}
        {done && (
          <div style={{ padding: "12px 16px", borderTop: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
            <button onClick={onClose} style={{ width: "100%", background: "rgba(226,202,122,0.15)", border: "1px solid rgba(226,202,122,0.3)", borderRadius: 12, padding: "12px", color: "#e2ca7a", fontSize: 14, fontWeight: 700, fontFamily: "var(--font-montserrat,sans-serif)", cursor: "pointer" }}>
              Fertig
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main view ──────────────────────────────────────────────────────────────────
export function MobileInvestorsCRMView() {
  const [rows, setRows]           = useState<Investor[]>([]);
  const [loading, setLoading]     = useState(true);
  const [sentinelOpen, setSentinel] = useState(false);
  const [editCell, setEditCell]   = useState<{ id: string; key: ColKey } | null>(null);
  const [colsVisible, setColsVisible] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/investors-crm");
      if (r.ok) setRows(await r.json());
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Trigger column drop-in animation after first load
  useEffect(() => {
    if (!loading) {
      const t = setTimeout(() => setColsVisible(true), 30);
      return () => clearTimeout(t);
    }
    setColsVisible(false);
  }, [loading]);

  async function patch(id: string, key: ColKey, value: string | null) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [key]: value } : r));
    await fetch(`/api/investors-crm/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [key]: value }),
    });
  }

  // KPIs computed from rows
  const total      = rows.length;
  const warmCommit = rows.filter(r => r.status === "Warm Commitment").length;
  const bereit     = rows.filter(r => r.status === "Bereit für Onboarding").length;
  const abgesagt   = rows.filter(r => r.status === "Abgesagt").length;
  const offen      = rows.filter(r => r.status === "Neu" || r.status === "Kontaktiert").length;

  const nrMap = Object.fromEntries(rows.map((r, i) => [r.id, i + 1]));

  // Cell height for table
  const ROW_H = 44;
  const TH_H  = 34;

  return (
    <>
      {/* CSS for column drop-in animation */}
      <style>{`
        @keyframes colDropIn {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div style={{
        display: "flex", flexDirection: "column",
        height: "100%", overflow: "hidden",
        background: "#0c0d10", color: "#e4e4e7",
      }}>
        {/* ── Page header ── */}
        <div style={{ padding: "12px 14px 10px", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h1 style={{ margin: 0, fontSize: 15, fontWeight: 800, fontFamily: "var(--font-montserrat,sans-serif)", color: "#fff" }}>
            Investor Onboarding
          </h1>
          <button
            onClick={() => setSentinel(true)}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              background: "rgba(226,202,122,0.1)", border: "1px solid rgba(226,202,122,0.25)",
              borderRadius: 20, padding: "6px 12px",
              color: "#e2ca7a", fontSize: 11, fontWeight: 700,
              fontFamily: "var(--font-montserrat,sans-serif)",
              cursor: "pointer", touchAction: "manipulation", WebkitTapHighlightColor: "transparent",
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            Sentinel
          </button>
        </div>

        {/* ── KPI row ── */}
        <div style={{ display: "flex", gap: 6, padding: "0 14px 10px", flexShrink: 0 }}>
          <KpiCard label="Gesamt"       value={total} />
          <KpiCard label="Warm Commit"  value={warmCommit} />
          <KpiCard label="Onboarding"   value={bereit} />
          <KpiCard label="Offen"        value={offen} />
          <KpiCard label="Abgesagt"     value={abgesagt} />
        </div>

        {/* ── Table ── */}
        <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
          {/* Right fade overlay */}
          <div style={{
            position: "absolute", top: 0, right: 0, bottom: 0, width: 40, zIndex: 10,
            background: "linear-gradient(to right, transparent, #0c0d10)",
            pointerEvents: "none",
          }} />

          <div style={{ height: "100%", overflowX: "auto", overflowY: "auto" }}>
            {loading ? (
              <div style={{ padding: 32, textAlign: "center", color: MUTED, fontSize: 12, fontFamily: "var(--font-montserrat,sans-serif)" }}>Lädt…</div>
            ) : rows.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", color: MUTED, fontSize: 12, fontFamily: "var(--font-montserrat,sans-serif)" }}>
                Noch keine Interessenten eingetragen.
              </div>
            ) : (
              <table style={{ borderCollapse: "collapse", tableLayout: "fixed" }}>
                <thead>
                  <tr style={{ background: "#0c0d10", position: "sticky", top: 0, zIndex: 5 }}>
                    {/* Nr col */}
                    <th style={{
                      width: 36, minWidth: 36, height: TH_H,
                      fontSize: 9, fontWeight: 700, color: MUTED,
                      fontFamily: "var(--font-montserrat,sans-serif)",
                      textTransform: "uppercase", letterSpacing: "0.06em",
                      textAlign: "left", paddingLeft: 8,
                      borderBottom: "1px solid rgba(255,255,255,0.07)",
                      verticalAlign: "middle",
                    }}>#</th>
                    {COLS.map((c, ci) => (
                      <th key={c.key} style={{
                        width: c.w, minWidth: c.w, height: TH_H,
                        fontSize: 9, fontWeight: 700, color: MUTED,
                        fontFamily: "var(--font-montserrat,sans-serif)",
                        textTransform: "uppercase", letterSpacing: "0.06em",
                        textAlign: "left", paddingLeft: 10,
                        borderBottom: "1px solid rgba(255,255,255,0.07)",
                        whiteSpace: "nowrap", verticalAlign: "middle",
                        opacity: colsVisible ? 1 : 0,
                        animation: colsVisible ? `colDropIn 220ms ease ${ci * 22}ms both` : "none",
                      }}>
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, ri) => (
                    <tr key={row.id} style={{ background: ri % 2 === 0 ? "transparent" : "rgba(255,255,255,0.018)" }}>
                      {/* Nr */}
                      <td style={{
                        height: ROW_H, paddingLeft: 8, paddingRight: 4,
                        fontSize: 9, color: "rgba(255,255,255,0.25)", fontFamily: "var(--font-montserrat,sans-serif)",
                        borderBottom: "1px solid rgba(255,255,255,0.04)", verticalAlign: "middle",
                        whiteSpace: "nowrap",
                      }}>
                        {nrMap[row.id]}
                      </td>

                      {COLS.map((c, ci) => {
                        const isEditing = editCell?.id === row.id && editCell?.key === c.key;
                        const raw = row[c.key] as string | null;
                        const sc  = c.key === "status" ? (STATUS_COLOR[raw ?? ""] ?? STATUS_COLOR["Neu"]) : null;

                        return (
                          <td
                            key={c.key}
                            onClick={() => setEditCell({ id: row.id, key: c.key })}
                            style={{
                              height: ROW_H, paddingLeft: 10, paddingRight: 6,
                              borderBottom: "1px solid rgba(255,255,255,0.04)",
                              verticalAlign: "middle",
                              whiteSpace: isEditing ? "normal" : "nowrap",
                              cursor: "text",
                              opacity: colsVisible ? 1 : 0,
                              animation: colsVisible ? `colDropIn 220ms ease ${ci * 22}ms both` : "none",
                              maxWidth: c.w,
                              overflow: isEditing ? "visible" : "hidden",
                            }}
                          >
                            {isEditing ? (
                              <CellEditor
                                colKey={c.key}
                                value={raw}
                                onSave={v => patch(row.id, c.key, v)}
                                onClose={() => setEditCell(null)}
                              />
                            ) : c.key === "status" && sc ? (
                              <span style={{
                                display: "inline-block",
                                padding: "2px 7px", borderRadius: 4,
                                fontSize: 10, fontWeight: 700,
                                fontFamily: "var(--font-montserrat,sans-serif)",
                                background: sc.bg, color: sc.text,
                                whiteSpace: "nowrap",
                              }}>
                                {raw}
                              </span>
                            ) : (c.key === "verfuegbar_ab" || c.key === "letzter_kontakt") ? (
                              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", fontFamily: "var(--font-montserrat,sans-serif)" }}>
                                {fmtDate(raw)}
                              </span>
                            ) : (
                              <span style={{
                                fontSize: 11, color: raw ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.18)",
                                fontFamily: "var(--font-montserrat,sans-serif)",
                                display: "block", overflow: "hidden", textOverflow: "ellipsis",
                              }}>
                                {raw ?? "—"}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Sentinel Chat Sheet */}
      {sentinelOpen && (
        <SentinelChat
          onClose={() => setSentinel(false)}
          onSaved={() => { load(); }}
        />
      )}
    </>
  );
}
