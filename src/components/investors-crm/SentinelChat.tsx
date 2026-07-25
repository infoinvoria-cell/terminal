"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ── Options (shared with the CRM) ─────────────────────────────────────────────
const KONTAKTQUELLE   = ["Persönlicher Kontakt","Empfehlung","Vermittler","Netzwerk / Event","LinkedIn","Sonstiges"];
const KAPITALRAHMEN   = ["unter 25.000 EUR","25.000–50.000 EUR","50.000–100.000 EUR","100.000–250.000 EUR","250.000–500.000 EUR","über 500.000 EUR","noch offen"];
const STATUS_OPTS     = ["Neu","Kontaktiert","Early Access gesendet","Interesse bestätigt","Gespräch geplant","Warm Commitment","Unterlagen ausstehend","Bereit für Onboarding","Später kontaktieren","Abgesagt"];
const NAECHSTER_OPTS  = ["Erstkontakt","PDF senden","Rückruf","Gespräch vereinbaren","Follow-up senden","Unterlagen anfordern","Auf Launch warten","Kein weiterer Schritt"];
const ZUSTAENDIG_OPTS = ["Jeroen","Partner 2","Partner 3"];

// ── Guided conversation steps ─────────────────────────────────────────────────
type FieldKey =
  | "name" | "unternehmen" | "email" | "telefon" | "kontaktquelle"
  | "kapitalrahmen" | "verfuegbar_ab" | "status" | "zustaendig"
  | "naechster_schritt" | "notizen";

type QStep = {
  key: FieldKey | "done";
  bot: string;
  type: "text" | "email" | "tel" | "date" | "select" | "textarea";
  options?: string[];
  optional?: boolean;
};

const STEPS: QStep[] = [
  { key: "name",              bot: "Wie heißt die Person, die du aufnehmen möchtest?", type: "text" },
  { key: "unternehmen",       bot: "Bei welchem Unternehmen ist die Person?",          type: "text",     optional: true },
  { key: "email",             bot: "Hast du eine E-Mail-Adresse?",                     type: "email",    optional: true },
  { key: "telefon",           bot: "Und eine Telefonnummer?",                          type: "tel",      optional: true },
  { key: "kontaktquelle",     bot: "Wie kam der Kontakt zustande?",                    type: "select",   options: KONTAKTQUELLE, optional: true },
  { key: "kapitalrahmen",     bot: "Welcher Kapitalrahmen ist realistisch?",           type: "select",   options: KAPITALRAHMEN, optional: true },
  { key: "verfuegbar_ab",     bot: "Ab wann wäre Kapital verfügbar?",                  type: "date",     optional: true },
  { key: "status",            bot: "Wo steht der Kontakt aktuell?",                    type: "select",   options: STATUS_OPTS },
  { key: "zustaendig",        bot: "Wer von euch ist zuständig?",                      type: "select",   options: ZUSTAENDIG_OPTS, optional: true },
  { key: "naechster_schritt", bot: "Was ist der nächste Schritt?",                     type: "select",   options: NAECHSTER_OPTS, optional: true },
  { key: "notizen",           bot: "Zum Schluss – möchtest du eine Notiz hinterlegen?",type: "textarea", optional: true },
  { key: "done",              bot: "",                                                  type: "text" },
];

type ChatMsg = { from: "bot" | "user"; text: string };

const GOLD = "#e2ca7a";

export function SentinelChat({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  /** Called with the freshly-created investor name after a successful save. */
  onSaved: (createdName: string) => void;
}) {
  const [step, setStep]     = useState(0);
  const [msgs, setMsgs]     = useState<ChatMsg[]>([{ from: "bot", text: STEPS[0].bot }]);
  const [draft, setDraft]   = useState("");
  const [form, setForm]     = useState<Record<string, string | null>>({ status: "Neu" });
  const [saving, setSaving] = useState(false);
  const [done, setDone]     = useState(false);
  const listRef  = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }); }, [msgs]);
  useEffect(() => { if (!done && !saving) { const t = setTimeout(() => inputRef.current?.focus(), 90); return () => clearTimeout(t); } }, [step, done, saving]);
  // Esc closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const current = STEPS[step];

  const advance = useCallback(async (value: string | null) => {
    setMsgs(m => [...m, { from: "user", text: value || "— übersprungen —" }]);
    const newForm = { ...form, ...(current.key !== "done" ? { [current.key]: value } : {}) };
    setForm(newForm);
    const next = step + 1;

    if (STEPS[next]?.key === "done") {
      setSaving(true);
      setMsgs(m => [...m, { from: "bot", text: "Einen Moment, ich speichere …" }]);
      try {
        const r = await fetch("/api/investors-crm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...newForm, status: newForm.status ?? "Neu" }),
        });
        if (r.ok) {
          setMsgs(m => [...m.slice(0, -1), { from: "bot", text: `✓ ${newForm.name} ist gespeichert. Du findest die Person jetzt in der Tabelle.` }]);
          setDone(true);
          onSaved(String(newForm.name ?? ""));
        } else {
          const e = await r.json().catch(() => ({}));
          setMsgs(m => [...m.slice(0, -1), { from: "bot", text: `Das hat nicht geklappt: ${e.error ?? "unbekannter Fehler"}` }]);
          setSaving(false);
        }
      } catch {
        setMsgs(m => [...m.slice(0, -1), { from: "bot", text: "Verbindungsfehler – bitte nochmal versuchen." }]);
        setSaving(false);
      }
      return;
    }

    setStep(next);
    setDraft("");
    setMsgs(m => [...m, { from: "bot", text: STEPS[next].bot }]);
  }, [step, form, current, onSaved]);

  const submit = () => {
    const val = draft.trim() || null;
    if (!val && !current.optional) return;
    advance(val);
  };

  const isSelect = current.type === "select" && !done && !saving;
  const showInput = !isSelect && !done && !saving;

  const inpS: React.CSSProperties = {
    flex: 1, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: 12, padding: "11px 15px", color: "#fff", fontSize: 16,
    fontFamily: "var(--font-montserrat,sans-serif)", outline: "none",
    touchAction: "manipulation", WebkitAppearance: "none", boxSizing: "border-box",
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 3000,
        background: "rgba(4,5,7,0.72)", backdropFilter: "blur(8px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "16px",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: "min(420px, 94vw)",
          height: "min(560px, 78dvh)",
          display: "flex", flexDirection: "column",
          background: "linear-gradient(180deg,#15161a 0%,#101114 100%)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 18,
          boxShadow: "0 24px 70px -20px rgba(0,0,0,0.8)",
          overflow: "hidden",
          animation: "sentinelPop 220ms cubic-bezier(0.16,1,0.3,1) both",
        }}
      >
        <style>{`
          @keyframes sentinelPop { from { opacity: 0; transform: translateY(14px) scale(0.97); } to { opacity: 1; transform: none; } }
          @keyframes msgIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        `}</style>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
          <div style={{ width: 30, height: 30, borderRadius: 9, background: "rgba(226,202,122,0.14)", border: "1px solid rgba(226,202,122,0.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#fff", fontFamily: "var(--font-montserrat,sans-serif)", lineHeight: 1.1 }}>Sentinel</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", fontFamily: "var(--font-montserrat,sans-serif)" }}>Investor aufnehmen</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.45)", fontSize: 18, cursor: "pointer", padding: "2px 6px", lineHeight: 1 }}>✕</button>
        </div>

        {/* Messages */}
        <div ref={listRef} style={{ flex: 1, overflowY: "auto", padding: "16px 14px", display: "flex", flexDirection: "column", gap: 9 }}>
          {msgs.map((m, i) => (
            <div key={i} style={{
              alignSelf: m.from === "bot" ? "flex-start" : "flex-end",
              maxWidth: "82%",
              background: m.from === "bot" ? "rgba(255,255,255,0.07)" : "rgba(226,202,122,0.16)",
              border: `1px solid ${m.from === "bot" ? "rgba(255,255,255,0.09)" : "rgba(226,202,122,0.28)"}`,
              borderRadius: m.from === "bot" ? "4px 15px 15px 15px" : "15px 4px 15px 15px",
              padding: "9px 13px", fontSize: 13.5, lineHeight: 1.45,
              fontFamily: "var(--font-montserrat,sans-serif)",
              color: m.from === "bot" ? "rgba(255,255,255,0.9)" : GOLD,
              animation: "msgIn 200ms ease both",
              whiteSpace: "pre-wrap", wordBreak: "break-word",
            }}>
              {m.text}
            </div>
          ))}
        </div>

        {/* Input zone */}
        {isSelect && (
          <div style={{ padding: "12px 12px 14px", borderTop: "1px solid rgba(255,255,255,0.07)", flexShrink: 0, display: "flex", flexWrap: "wrap", gap: 7, maxHeight: 190, overflowY: "auto" }}>
            {(current.options ?? []).map(o => (
              <button key={o} onClick={() => advance(o)} style={{
                background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 16,
                padding: "8px 13px", color: "rgba(255,255,255,0.85)", fontSize: 12.5, fontWeight: 600,
                fontFamily: "var(--font-montserrat,sans-serif)", cursor: "pointer", touchAction: "manipulation", WebkitTapHighlightColor: "transparent",
              }}>{o}</button>
            ))}
            {current.optional && (
              <button onClick={() => advance(null)} style={{
                background: "none", border: "1px dashed rgba(255,255,255,0.14)", borderRadius: 16,
                padding: "8px 13px", color: "rgba(255,255,255,0.4)", fontSize: 12.5,
                fontFamily: "var(--font-montserrat,sans-serif)", cursor: "pointer", touchAction: "manipulation",
              }}>Überspringen</button>
            )}
          </div>
        )}

        {showInput && (
          <div style={{ padding: "12px 12px 14px", borderTop: "1px solid rgba(255,255,255,0.07)", flexShrink: 0, display: "flex", gap: 8, alignItems: "flex-end" }}>
            {current.type === "textarea" ? (
              <textarea ref={inputRef as React.RefObject<HTMLTextAreaElement>} value={draft} onChange={e => setDraft(e.target.value)} placeholder="Antwort tippen …" rows={2} style={{ ...inpS, resize: "none" }} />
            ) : (
              <input
                ref={inputRef as React.RefObject<HTMLInputElement>}
                type={current.type === "email" ? "email" : current.type === "tel" ? "tel" : current.type === "date" ? "date" : "text"}
                value={draft} onChange={e => setDraft(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
                placeholder="Antwort tippen …" style={inpS}
              />
            )}
            <button onClick={submit} style={{ flexShrink: 0, width: 44, height: 44, borderRadius: 13, background: GOLD, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", touchAction: "manipulation" }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </button>
            {current.optional && (
              <button onClick={() => advance(null)} title="Überspringen" style={{ flexShrink: 0, height: 44, padding: "0 12px", borderRadius: 13, background: "none", border: "1px dashed rgba(255,255,255,0.14)", color: "rgba(255,255,255,0.4)", fontSize: 11, fontFamily: "var(--font-montserrat,sans-serif)", cursor: "pointer", touchAction: "manipulation" }}>Skip</button>
            )}
          </div>
        )}

        {done && (
          <div style={{ padding: "12px 14px 16px", borderTop: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
            <button onClick={onClose} style={{ width: "100%", background: "rgba(226,202,122,0.16)", border: "1px solid rgba(226,202,122,0.32)", borderRadius: 13, padding: "13px", color: GOLD, fontSize: 14, fontWeight: 800, fontFamily: "var(--font-montserrat,sans-serif)", cursor: "pointer" }}>Fertig</button>
          </div>
        )}
      </div>
    </div>
  );
}
