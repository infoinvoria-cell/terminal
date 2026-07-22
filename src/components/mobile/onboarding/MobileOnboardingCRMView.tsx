"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Investor } from "@/components/investors-crm/InvestorsCRMView";
import { SentinelChat } from "@/components/investors-crm/SentinelChat";

// ── Design tokens ─────────────────────────────────────────────────────────────
const CARD_BG     = "linear-gradient(180deg,#1c1d20 0%,#141517 100%)";
const CARD_BORDER = "rgba(255,255,255,0.06)";
const CARD_SHADOW = "0 8px 20px -8px rgba(0,0,0,0.55)";
const MUTED       = "rgba(255,255,255,0.38)";
const PAGE_BG     = "#0c0d10";
const GOLD        = "#e2ca7a";

// ── Options ────────────────────────────────────────────────────────────────────
const KONTAKTQUELLE   = ["Persönlicher Kontakt","Empfehlung","Vermittler","Netzwerk / Event","LinkedIn","Sonstiges"];
const KAPITALRAHMEN   = ["unter 25.000 EUR","25.000–50.000 EUR","50.000–100.000 EUR","100.000–250.000 EUR","250.000–500.000 EUR","über 500.000 EUR","noch offen"];
const STATUS_OPTS     = ["Neu","Kontaktiert","Early Access gesendet","Interesse bestätigt","Gespräch geplant","Warm Commitment","Unterlagen ausstehend","Bereit für Onboarding","Später kontaktieren","Abgesagt"];
const NAECHSTER_OPTS  = ["Erstkontakt","PDF senden","Rückruf","Gespräch vereinbaren","Follow-up senden","Unterlagen anfordern","Auf Launch warten","Kein weiterer Schritt"];
const ZUSTAENDIG_OPTS = ["Jeroen","Partner 2","Partner 3"];

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

// ── Category icons (lucide-style paths) ───────────────────────────────────────
function CatIcon({ name }: { name: string }) {
  const p: Record<string, React.ReactNode> = {
    user:      <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>,
    building:  <><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M9 6h.01M15 6h.01M9 10h.01M15 10h.01M9 14h.01M15 14h.01"/></>,
    activity:  <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>,
    mail:      <><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/></>,
    phone:     <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>,
    share:     <><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.59 13.51 6.83 3.98M15.41 6.51l-6.82 3.98"/></>,
    euro:      <path d="M14 20a6 6 0 1 1 0-12M4 11h8M4 15h6"/>,
    calendar:  <><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></>,
    clock:     <><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></>,
    arrow:     <path d="M5 12h14M12 5l7 7-7 7"/>,
    check:     <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m16 11 2 2 4-4"/></>,
    note:      <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></>,
  };
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      {p[name] ?? p.note}
    </svg>
  );
}

// ── Row definitions (categories as rows) ─────────────────────────────────────
type RowDef = { key: keyof Investor; label: string; abbr: string; icon: string };
const ROWS: RowDef[] = [
  { key: "name",              label: "Name",             abbr: "Name",    icon: "user"     },
  { key: "unternehmen",       label: "Unternehmen",      abbr: "Firma",   icon: "building" },
  { key: "status",            label: "Status",           abbr: "Status",  icon: "activity" },
  { key: "email",             label: "E-Mail",           abbr: "Mail",    icon: "mail"     },
  { key: "telefon",           label: "Telefon",          abbr: "Tel",     icon: "phone"    },
  { key: "kontaktquelle",     label: "Quelle",           abbr: "Quelle",  icon: "share"    },
  { key: "kapitalrahmen",     label: "Kapital",          abbr: "Kapital", icon: "euro"     },
  { key: "verfuegbar_ab",     label: "Verfügbar ab",     abbr: "Verf.",   icon: "calendar" },
  { key: "letzter_kontakt",   label: "Letzter Kontakt",  abbr: "L.Kont.", icon: "clock"    },
  { key: "naechster_schritt", label: "Nächster Schritt", abbr: "Schritt", icon: "arrow"    },
  { key: "zustaendig",        label: "Zuständig",        abbr: "Zust.",   icon: "check"    },
  { key: "notizen",           label: "Notizen",          abbr: "Notiz",   icon: "note"     },
];

const CAT_W_OPEN   = 116; // px — category column expanded (icon + name)
const CAT_W_CLOSED = 46;  // px — category column collapsed (icon only)
const INV_COL_W    = 138; // px per investor column
const CELL_H       = 46;  // px row height
const CAT_TRANS    = "width 280ms cubic-bezier(0.22,1,0.36,1)";

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{
      background: CARD_BG, border: `1px solid ${CARD_BORDER}`,
      borderRadius: 10, boxShadow: CARD_SHADOW,
      padding: "9px 9px 11px",
      display: "flex", flexDirection: "column", justifyContent: "space-between",
      gap: 6, flex: 1, minWidth: 0,
    }}>
      <p style={{ margin: 0, fontSize: 8, fontWeight: 600, color: MUTED, fontFamily: "var(--font-montserrat,sans-serif)", textTransform: "uppercase", letterSpacing: "0.01em", lineHeight: 1.2, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
        {label}
      </p>
      <p style={{ margin: 0, fontSize: 13, fontWeight: 700, lineHeight: 1, letterSpacing: "-0.02em", fontFamily: "var(--font-nunito,sans-serif)", color: "#ffffff" }}>
        {value}
      </p>
    </div>
  );
}

// ── Inline cell editor — 16px font so iOS never zooms ─────────────────────────
function CellEditor({ rowKey, value, onSave, onClose }: {
  rowKey: keyof Investor; value: string | null;
  onSave: (v: string | null) => void; onClose: () => void;
}) {
  const [draft, setDraft] = useState(value ?? "");
  const ref = useRef<HTMLInputElement & HTMLSelectElement & HTMLTextAreaElement>(null);

  useEffect(() => { const t = setTimeout(() => ref.current?.focus(), 60); return () => clearTimeout(t); }, []);

  const commit = () => { onSave(draft.trim() || null); onClose(); };

  const isDropdown = ["kontaktquelle","kapitalrahmen","status","naechster_schritt","zustaendig"].includes(rowKey);
  const isDate     = rowKey === "verfuegbar_ab" || rowKey === "letzter_kontakt";
  const opts = rowKey === "kontaktquelle" ? KONTAKTQUELLE
    : rowKey === "kapitalrahmen" ? KAPITALRAHMEN
    : rowKey === "status" ? STATUS_OPTS
    : rowKey === "naechster_schritt" ? NAECHSTER_OPTS
    : rowKey === "zustaendig" ? ZUSTAENDIG_OPTS : [];

  const s: React.CSSProperties = {
    width: "100%", boxSizing: "border-box", border: "none", outline: "none",
    background: "transparent", color: "#fff",
    fontSize: 16, fontFamily: "var(--font-montserrat,sans-serif)",
    padding: 0, touchAction: "manipulation",
  };

  if (isDropdown) return (
    <select ref={ref as React.RefObject<HTMLSelectElement>} value={draft}
      onChange={e => { onSave(e.target.value || null); onClose(); }} style={s}>
      <option value="">—</option>
      {opts.map(o => <option key={o}>{o}</option>)}
    </select>
  );
  if (isDate) return (
    <input ref={ref as React.RefObject<HTMLInputElement>} type="date" value={draft}
      onChange={e => setDraft(e.target.value)} onBlur={commit} style={s} />
  );
  return (
    <input ref={ref as React.RefObject<HTMLInputElement>}
      type={rowKey === "email" ? "email" : rowKey === "telefon" ? "tel" : "text"}
      value={draft} onChange={e => setDraft(e.target.value)}
      onBlur={commit} onKeyDown={e => e.key === "Enter" && commit()} style={s} />
  );
}

// ── Main View ─────────────────────────────────────────────────────────────────
export function MobileOnboardingCRMView() {
  const [rows, setRows]             = useState<Investor[]>([]);
  const [loading, setLoading]       = useState(true);
  const [sentinelOpen, setSentinel] = useState(false);
  const [editCell, setEditCell]     = useState<{ id: string; key: keyof Investor } | null>(null);
  const [newIds, setNewIds]         = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed]   = useState(false);
  const tableRef                    = useRef<HTMLDivElement>(null);
  const peekTimeout                 = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/investors-crm");
      if (r.ok) setRows(await r.json());
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Collapse when scrolled right, expand when back at start.
  const onScroll = useCallback(() => {
    const el = tableRef.current;
    if (!el) return;
    if (el.scrollLeft <= 8) {
      if (peekTimeout.current) { clearTimeout(peekTimeout.current); peekTimeout.current = null; }
      setCollapsed(false);
    } else {
      setCollapsed(true);
    }
  }, []);

  // Tap the collapsed icon rail → peek labels for 2 s.
  const onCatTap = useCallback(() => {
    if (!collapsed) return;
    if (peekTimeout.current) clearTimeout(peekTimeout.current);
    setCollapsed(false);
    peekTimeout.current = setTimeout(() => {
      if (tableRef.current && tableRef.current.scrollLeft > 8) setCollapsed(true);
    }, 2000);
  }, [collapsed]);

  const handleSaved = useCallback(async () => {
    const r = await fetch("/api/investors-crm");
    if (!r.ok) return;
    const fresh: Investor[] = await r.json();
    const prev = new Set(rows.map(x => x.id));
    const addedIds = fresh.filter(x => !prev.has(x.id)).map(x => x.id);
    setNewIds(new Set(addedIds));
    setRows(fresh);
    setTimeout(() => { tableRef.current?.scrollTo({ left: tableRef.current.scrollWidth, behavior: "smooth" }); }, 90);
    setTimeout(() => setNewIds(new Set()), 1300);
  }, [rows]);

  async function patch(id: string, key: keyof Investor, value: string | null) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [key]: value } : r));
    await fetch(`/api/investors-crm/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [key]: value }) });
  }

  const total      = rows.length;
  const warmCommit = rows.filter(r => r.status === "Warm Commitment").length;
  const bereit     = rows.filter(r => r.status === "Bereit für Onboarding").length;
  const abgesagt   = rows.filter(r => r.status === "Abgesagt").length;
  const offen      = rows.filter(r => r.status === "Neu" || r.status === "Kontaktiert").length;

  const catW = collapsed ? CAT_W_CLOSED : CAT_W_OPEN;

  return (
    <>
      <style>{`
        @keyframes colSlideIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: none; } }
      `}</style>

      <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", background: PAGE_BG, color: "#e4e4e7" }}>

        {/* ── Page header ── */}
        <div style={{ padding: "12px 14px 10px", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h1 style={{ margin: 0, fontSize: 15, fontWeight: 800, fontFamily: "var(--font-montserrat,sans-serif)", color: "#fff" }}>Investor Onboarding</h1>
          <button onClick={() => setSentinel(true)} style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(226,202,122,0.1)", border: "1px solid rgba(226,202,122,0.25)", borderRadius: 20, padding: "6px 12px", color: GOLD, fontSize: 11, fontWeight: 700, fontFamily: "var(--font-montserrat,sans-serif)", cursor: "pointer", touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            Sentinel
          </button>
        </div>

        {/* ── KPI row ── */}
        <div style={{ display: "flex", gap: 6, padding: "0 14px 10px", flexShrink: 0 }}>
          <KpiCard label="Gesamt"      value={total} />
          <KpiCard label="Warm Commit" value={warmCommit} />
          <KpiCard label="Onboarding"  value={bereit} />
          <KpiCard label="Offen"       value={offen} />
          <KpiCard label="Abgesagt"    value={abgesagt} />
        </div>

        {/* ── Transposed table: categories = rows, investors = columns ── */}
        <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
          {/* Stronger right → black fade, above headers too */}
          <div style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: 72, zIndex: 40, background: `linear-gradient(to right, rgba(12,13,16,0) 0%, rgba(12,13,16,0.75) 55%, ${PAGE_BG} 100%)`, pointerEvents: "none" }} />

          <div ref={tableRef} onScroll={onScroll} style={{ height: "100%", overflowX: "auto", overflowY: "auto" }}>
            {loading ? (
              <div style={{ padding: 32, textAlign: "center", color: MUTED, fontSize: 12, fontFamily: "var(--font-montserrat,sans-serif)" }}>Lädt…</div>
            ) : (
              <table style={{ borderCollapse: "collapse", tableLayout: "fixed" }}>
                <colgroup>
                  <col style={{ width: catW, transition: CAT_TRANS }} />
                  {rows.map(r => <col key={r.id} style={{ width: INV_COL_W }} />)}
                </colgroup>

                <thead>
                  <tr style={{ position: "sticky", top: 0, zIndex: 20 }}>
                    {/* Sticky top-left corner — tap when collapsed to peek labels */}
                    <th onClick={onCatTap} style={{
                      position: "sticky", left: 0, zIndex: 21,
                      background: PAGE_BG,
                      width: catW, minWidth: catW, transition: CAT_TRANS,
                      height: CELL_H,
                      borderBottom: "1px solid rgba(255,255,255,0.08)",
                      borderRight: "1px solid rgba(255,255,255,0.06)",
                      textAlign: "left", verticalAlign: "middle", paddingLeft: 12,
                      cursor: collapsed ? "pointer" : "default",
                      WebkitTapHighlightColor: "transparent",
                    }}>
                      <span style={{ fontSize: 8.5, fontWeight: 800, color: MUTED, fontFamily: "var(--font-montserrat,sans-serif)", textTransform: "uppercase", letterSpacing: "0.08em", opacity: collapsed ? 0 : 1, transition: "opacity 160ms" }}>
                        Feld
                      </span>
                    </th>

                    {/* Investor headers — number on top, name below */}
                    {rows.map((inv, ci) => {
                      const isNew = newIds.has(inv.id);
                      return (
                        <th key={inv.id} style={{
                          height: CELL_H, width: INV_COL_W, minWidth: INV_COL_W,
                          background: PAGE_BG,
                          borderBottom: "1px solid rgba(255,255,255,0.08)",
                          borderRight: "1px solid rgba(255,255,255,0.04)",
                          paddingLeft: 12, paddingRight: 6,
                          textAlign: "left", verticalAlign: "middle",
                          animation: isNew ? "colSlideIn 300ms ease both" : undefined,
                        }}>
                          <span style={{ fontSize: 13, fontWeight: 800, color: GOLD, fontFamily: "var(--font-montserrat,sans-serif)", letterSpacing: "0.02em" }}>
                            {ci + 1}
                          </span>
                        </th>
                      );
                    })}
                  </tr>
                </thead>

                <tbody>
                  {ROWS.map((rowDef, ri) => {
                    const stripeBg = ri % 2 === 0 ? PAGE_BG : "#0f1012";
                    return (
                      <tr key={rowDef.key} style={{ background: ri % 2 === 0 ? "transparent" : "rgba(255,255,255,0.018)" }}>
                        {/* Sticky category label — tap when collapsed to peek labels */}
                        <td onClick={onCatTap} style={{
                          position: "sticky", left: 0, zIndex: 5,
                          background: stripeBg,
                          width: catW, minWidth: catW, transition: CAT_TRANS,
                          height: CELL_H,
                          paddingLeft: 12, paddingRight: 8,
                          borderBottom: "1px solid rgba(255,255,255,0.04)",
                          borderRight: "1px solid rgba(255,255,255,0.06)",
                          verticalAlign: "middle",
                          cursor: collapsed ? "pointer" : "default",
                          WebkitTapHighlightColor: "transparent",
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 9, color: MUTED, minWidth: 0 }}>
                            <span style={{ flexShrink: 0, display: "flex", color: "rgba(255,255,255,0.55)" }}>
                              <CatIcon name={rowDef.icon} />
                            </span>
                            <span style={{
                              fontSize: 9.5, fontWeight: 700, color: MUTED,
                              fontFamily: "var(--font-montserrat,sans-serif)", textTransform: "uppercase",
                              letterSpacing: "0.05em", whiteSpace: "nowrap", overflow: "hidden",
                              opacity: collapsed ? 0 : 1,
                              maxWidth: collapsed ? 0 : 70,
                              transition: "opacity 160ms ease, max-width 280ms cubic-bezier(0.22,1,0.36,1)",
                            }}>
                              {rowDef.abbr}
                            </span>
                          </div>
                        </td>

                        {/* One cell per investor */}
                        {rows.length === 0 ? (
                          <td><span style={{ fontSize: 11, color: MUTED, fontFamily: "var(--font-montserrat,sans-serif)", paddingLeft: 12 }}>Noch keine Einträge</span></td>
                        ) : rows.map(inv => {
                          const isNew     = newIds.has(inv.id);
                          const isEditing = editCell?.id === inv.id && editCell?.key === rowDef.key;
                          const raw       = inv[rowDef.key] as string | null;
                          const sc        = rowDef.key === "status" ? (STATUS_COLOR[raw ?? ""] ?? STATUS_COLOR["Neu"]) : null;

                          return (
                            <td key={inv.id}
                              onClick={() => setEditCell({ id: inv.id, key: rowDef.key })}
                              style={{
                                height: CELL_H, paddingLeft: 12, paddingRight: 6,
                                borderBottom: "1px solid rgba(255,255,255,0.04)",
                                borderRight: "1px solid rgba(255,255,255,0.04)",
                                verticalAlign: "middle", cursor: "text",
                                whiteSpace: isEditing ? "normal" : "nowrap",
                                overflow: isEditing ? "visible" : "hidden",
                                animation: isNew ? "colSlideIn 300ms ease both" : undefined,
                              }}>
                              {isEditing ? (
                                <CellEditor rowKey={rowDef.key} value={raw} onSave={v => patch(inv.id, rowDef.key, v)} onClose={() => setEditCell(null)} />
                              ) : rowDef.key === "status" && sc ? (
                                <span style={{ display: "inline-block", padding: "2px 7px", borderRadius: 4, fontSize: 10, fontWeight: 700, fontFamily: "var(--font-montserrat,sans-serif)", background: sc.bg, color: sc.text, whiteSpace: "nowrap" }}>
                                  {raw ?? "Neu"}
                                </span>
                              ) : (rowDef.key === "verfuegbar_ab" || rowDef.key === "letzter_kontakt") ? (
                                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", fontFamily: "var(--font-montserrat,sans-serif)" }}>{fmtDate(raw)}</span>
                              ) : (
                                <span style={{ fontSize: 11, color: raw ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.18)", fontFamily: "var(--font-montserrat,sans-serif)", display: "block", overflow: "hidden", textOverflow: "ellipsis" }}>
                                  {raw ?? "—"}
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {sentinelOpen && (
        <SentinelChat onClose={() => setSentinel(false)} onSaved={handleSaved} />
      )}
    </>
  );
}
