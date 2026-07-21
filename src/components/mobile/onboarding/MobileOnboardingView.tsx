"use client";

import { useState, useEffect, useRef, useCallback } from "react";

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

// ── Field definitions ─────────────────────────────────────────────────────────

type FieldType = "text" | "select" | "date" | "status";
type FieldDef = {
  key: keyof Investor;
  label: string;
  abbr: string;
  type: FieldType;
  opts?: string[];
  rowH?: number;
};

const STATUS_OPTS = [
  "Neu","Kontaktiert","Early Access gesendet","Interesse bestätigt",
  "Gespräch geplant","Warm Commitment","Unterlagen ausstehend",
  "Bereit für Onboarding","Später kontaktieren","Abgesagt",
];
const KONTAKTQUELLE   = ["LinkedIn","Empfehlung","Event","Website","Kalt-Akquise","Andere"];
const KAPITALRAHMEN   = ["< 50k","50k–100k","100k–250k","250k–500k","500k–1M","> 1M"];
const NAECHSTER       = ["Erstgespräch","Unterlagen senden","Vertragsabschluss","Kein Interesse","Warten"];
const ZUSTAENDIG_OPTS = ["Joris","Jeroen","Jan Luca"];

const FIELDS: FieldDef[] = [
  { key: "name",              label: "Name",           abbr: "Nam", type: "text"   },
  { key: "unternehmen",       label: "Unternehmen",    abbr: "Co",  type: "text"   },
  { key: "email",             label: "E-Mail",         abbr: "Mail",type: "text"   },
  { key: "telefon",           label: "Telefon",        abbr: "Tel", type: "text"   },
  { key: "kontaktquelle",     label: "Quelle",         abbr: "Src", type: "select", opts: KONTAKTQUELLE   },
  { key: "kapitalrahmen",     label: "Kapital",        abbr: "€",   type: "select", opts: KAPITALRAHMEN   },
  { key: "verfuegbar_ab",     label: "Verfügbar ab",   abbr: "Ab",  type: "date"   },
  { key: "status",            label: "Status",         abbr: "Stat",type: "status", opts: STATUS_OPTS     },
  { key: "letzter_kontakt",   label: "Letzt. Kont.",   abbr: "Kont",type: "date"   },
  { key: "naechster_schritt", label: "Nächster Schr.", abbr: "Next",type: "select", opts: NAECHSTER       },
  { key: "zustaendig",        label: "Zuständig",      abbr: "Who", type: "select", opts: ZUSTAENDIG_OPTS },
  { key: "notizen",           label: "Notizen",        abbr: "Info",type: "text",   rowH: 56              },
];

const BASE_ROW_H = 44;
const COL_W      = 164; // investor column width
const LABEL_WIDE = 92;  // left column when expanded
const LABEL_SLIM = 44;  // left column when collapsed

// ── Status styling ────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  "Neu":                    { bg: "rgba(113,113,122,0.15)", color: "#a1a1aa" },
  "Kontaktiert":            { bg: "rgba(59,130,246,0.15)",  color: "#60a5fa" },
  "Early Access gesendet":  { bg: "rgba(99,102,241,0.15)",  color: "#818cf8" },
  "Interesse bestätigt":    { bg: "rgba(6,182,212,0.15)",   color: "#22d3ee" },
  "Gespräch geplant":       { bg: "rgba(168,85,247,0.15)",  color: "#c084fc" },
  "Warm Commitment":        { bg: "rgba(245,158,11,0.15)",  color: "#fbbf24" },
  "Unterlagen ausstehend":  { bg: "rgba(249,115,22,0.15)",  color: "#fb923c" },
  "Bereit für Onboarding":  { bg: "rgba(34,197,94,0.15)",   color: "#4ade80" },
  "Später kontaktieren":    { bg: "rgba(63,63,70,0.3)",     color: "#71717a" },
  "Abgesagt":               { bg: "rgba(239,68,68,0.15)",   color: "#f87171" },
};

// ── Inline cell ───────────────────────────────────────────────────────────────

function Cell({
  investor, field, onSave,
}: {
  investor: Investor;
  field: FieldDef;
  onSave: (id: string, key: keyof Investor, value: string | null) => void;
}) {
  const raw   = investor[field.key] as string | null;
  const rowH  = field.rowH ?? BASE_ROW_H;
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft  ] = useState(raw ?? "");

  // keep draft in sync when investor data updates externally
  useEffect(() => { setDraft(raw ?? ""); }, [raw]);

  const commit = useCallback(() => {
    setEditing(false);
    const v = draft.trim() || null;
    if (v !== (raw?.trim() || null)) onSave(investor.id, field.key, v);
  }, [draft, raw, investor.id, field.key, onSave]);

  const inputStyle: React.CSSProperties = {
    width: "100%", background: "#1b1c21",
    border: "1px solid rgba(255,255,255,0.18)",
    borderRadius: 4, color: "#e4e4e7", fontSize: 11,
    padding: "4px 6px", outline: "none", boxSizing: "border-box",
  };

  // ── Status badge with inline select ──────────────────────────────────────
  if (field.type === "status") {
    const st = STATUS_STYLE[raw ?? ""] ?? STATUS_STYLE["Neu"];
    if (!editing) return (
      <div onClick={() => setEditing(true)} style={{ height: rowH, display: "flex", alignItems: "center", padding: "0 8px", cursor: "pointer" }}>
        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: st.bg, color: st.color, whiteSpace: "nowrap" }}>
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

  // ── Select ────────────────────────────────────────────────────────────────
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

  // ── Text / date ───────────────────────────────────────────────────────────
  if (!editing) return (
    <div onClick={() => { setDraft(raw ?? ""); setEditing(true); }}
      style={{ height: rowH, display: "flex", alignItems: "flex-start", padding: field.rowH ? "8px 8px 0" : "0 8px", cursor: "pointer", overflow: "hidden" }}>
      <span style={{ fontSize: 11, color: raw ? "rgba(255,255,255,0.78)" : "rgba(255,255,255,0.18)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: field.rowH ? "pre-wrap" : "nowrap", lineHeight: "1.4" }}>
        {raw ?? "—"}
      </span>
    </div>
  );
  return (
    <div style={{ height: rowH, display: "flex", alignItems: "center", padding: "0 6px" }}>
      <input autoFocus type={field.type === "date" ? "date" : "text"}
        value={draft} onChange={e => setDraft(e.target.value)}
        onBlur={commit} onKeyDown={e => e.key === "Enter" && commit()}
        style={inputStyle}
      />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function MobileOnboardingView() {
  const [investors, setInvestors] = useState<Investor[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [slim,      setSlim]      = useState(false); // left column collapsed during swipe

  const rightRef      = useRef<HTMLDivElement>(null);
  const labelBodyRef  = useRef<HTMLDivElement>(null);
  const swipeTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastScrollX   = useRef(0);

  // Fetch
  useEffect(() => {
    fetch("/api/investors-crm")
      .then(r => r.json())
      .then(d => { setInvestors(d.data ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  // Save patch
  const save = useCallback(async (id: string, key: keyof Investor, value: string | null) => {
    setInvestors(prev => prev.map(inv => inv.id === id ? { ...inv, [key]: value } : inv));
    await fetch(`/api/investors-crm/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [key]: value }),
    }).catch(() => {});
  }, []);

  // Sync vertical scroll of label column + detect horizontal swipe for slim mode
  const onRightScroll = useCallback(() => {
    const el = rightRef.current;
    if (!el) return;

    // Sync label column vertical scroll
    if (labelBodyRef.current) {
      labelBodyRef.current.scrollTop = el.scrollTop;
    }

    // Detect horizontal movement → collapse label
    const dx = Math.abs(el.scrollLeft - lastScrollX.current);
    lastScrollX.current = el.scrollLeft;
    if (dx > 2) {
      setSlim(true);
      if (swipeTimer.current) clearTimeout(swipeTimer.current);
      swipeTimer.current = setTimeout(() => setSlim(false), 700);
    }
  }, []);

  // Add investor
  const addInvestor = async () => {
    const body = { name: "Neuer Investor", status: "Neu" };
    try {
      const res = await fetch("/api/investors-crm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (d.data) {
        setInvestors(prev => [...prev, d.data]);
        // Scroll right to the new investor
        setTimeout(() => {
          if (rightRef.current) {
            rightRef.current.scrollLeft = rightRef.current.scrollWidth;
          }
        }, 80);
      }
    } catch {}
  };

  const totalContentH = FIELDS.reduce((a, f) => a + (f.rowH ?? BASE_ROW_H), 0);
  const HEADER_ROW_H  = 36;

  if (loading) return (
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.28)", fontSize: 13 }}>
      Lädt…
    </div>
  );

  return (
    <>
      <style>{`
        .mob-ob-scroll::-webkit-scrollbar { display: none; }
      `}</style>

      <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden", background: "#0c0d10" }}>

        {/* ── Mini header ─────────────────────────────────────────────── */}
        <div style={{
          flexShrink: 0,
          display: "flex", alignItems: "center",
          padding: "9px 12px 8px",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          gap: 10,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.88)", fontFamily: "var(--font-montserrat,sans-serif)", letterSpacing: "-0.01em" }}>
              Investor Onboarding
            </div>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginTop: 1 }}>
              {investors.length} Investor{investors.length !== 1 ? "en" : "in"} · wischen zum Navigieren
            </div>
          </div>
          <button onClick={addInvestor} style={{
            flexShrink: 0,
            background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 6, color: "rgba(255,255,255,0.7)",
            fontSize: 11, fontWeight: 600,
            padding: "5px 12px", cursor: "pointer",
            WebkitTapHighlightColor: "transparent",
          } as React.CSSProperties}>
            + Neu
          </button>
        </div>

        {/* ── Transposed table ─────────────────────────────────────────── */}
        <div style={{ flex: 1, minHeight: 0, display: "flex", overflow: "hidden" }}>

          {/* Left label column */}
          <div style={{
            flexShrink: 0,
            width: slim ? LABEL_SLIM : LABEL_WIDE,
            transition: "width 200ms cubic-bezier(.4,0,.2,1)",
            display: "flex", flexDirection: "column",
            borderRight: "1px solid rgba(255,255,255,0.07)",
            background: "#0c0d10",
            zIndex: 2,
            overflow: "hidden",
          }}>
            {/* Corner header */}
            <div style={{
              height: HEADER_ROW_H, flexShrink: 0,
              borderBottom: "1px solid rgba(255,255,255,0.06)",
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "#0e0f14",
            }}>
              <span style={{ fontSize: 8, fontWeight: 800, color: "rgba(255,255,255,0.2)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                {slim ? "▶" : "Feld"}
              </span>
            </div>

            {/* Label rows — vertical scroll locked to right panel */}
            <div ref={labelBodyRef} style={{ flex: 1, overflowY: "hidden" }}>
              {FIELDS.map(f => (
                <div key={f.key} style={{
                  height: f.rowH ?? BASE_ROW_H,
                  display: "flex", alignItems: "center",
                  padding: "0 6px",
                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                  gap: 5, overflow: "hidden",
                }}>
                  {/* Abbreviation chip */}
                  <span style={{
                    flexShrink: 0,
                    fontSize: 8, fontWeight: 800,
                    color: "rgba(255,255,255,0.52)",
                    background: "rgba(255,255,255,0.06)",
                    borderRadius: 3, padding: "2px 4px",
                    letterSpacing: "0.04em",
                    fontFamily: "monospace",
                    whiteSpace: "nowrap",
                    minWidth: 0,
                  }}>
                    {f.abbr}
                  </span>
                  {/* Full label — fades/collapses with slim mode */}
                  <span style={{
                    fontSize: 9, color: "rgba(255,255,255,0.38)",
                    overflow: "hidden", whiteSpace: "nowrap",
                    opacity: slim ? 0 : 1,
                    maxWidth: slim ? 0 : 120,
                    transition: "opacity 160ms ease, max-width 160ms ease",
                    display: "block",
                  }}>
                    {f.label}
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
            style={{
              flex: 1,
              overflowX: "auto",
              overflowY: "auto",
              scrollSnapType: "x mandatory",
              WebkitOverflowScrolling: "touch",
            } as React.CSSProperties}
          >
            {investors.length === 0 ? (
              <div style={{
                minHeight: "100%", display: "flex",
                alignItems: "center", justifyContent: "center",
                color: "rgba(255,255,255,0.2)", fontSize: 12,
                padding: 24, textAlign: "center",
              }}>
                Noch keine Investoren.{"\n"}Tippe auf + Neu.
              </div>
            ) : (
              <div style={{
                display: "flex",
                minWidth: investors.length * COL_W,
              }}>
                {investors.map((inv, idx) => (
                  <div key={inv.id} style={{
                    width: COL_W,
                    flexShrink: 0,
                    scrollSnapAlign: "start",
                    borderRight: "1px solid rgba(255,255,255,0.04)",
                  }}>
                    {/* Investor header — sticky top */}
                    <div style={{
                      height: HEADER_ROW_H,
                      display: "flex", alignItems: "center",
                      padding: "0 8px", gap: 6,
                      background: "#0e0f14",
                      borderBottom: "1px solid rgba(255,255,255,0.06)",
                      position: "sticky", top: 0, zIndex: 1,
                    }}>
                      <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.28)", flexShrink: 0 }}>
                        {String(idx + 1).padStart(2, "0")}
                      </span>
                      <span style={{
                        fontSize: 11, fontWeight: 700,
                        color: "rgba(255,255,255,0.78)",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {inv.name || "—"}
                      </span>
                    </div>

                    {/* Field cells */}
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
    </>
  );
}
