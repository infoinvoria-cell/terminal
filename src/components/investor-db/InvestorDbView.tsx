"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { RefreshCw, AlertCircle } from "lucide-react";

// ── Canonical type — matches actual Supabase investors_crm schema ─────────────

export type InvestorCrm = {
  id: string;                      // UUID (Supabase auto-generated)
  name: string;                    // primary contact person name
  rolle: string | null;            // contact role/title (ADD COLUMN in Supabase)
  unternehmen: string | null;      // company/organisation
  typ: string | null;              // investor category (ADD COLUMN in Supabase)
  email: string | null;
  telefon: string | null;
  linkedin: string | null;         // ADD COLUMN in Supabase
  kontaktquelle: string | null;    // source (Supabase: "kontaktquelle")
  kapitalrahmen: string | null;    // ticket size (Supabase: "kapitalrahmen")
  verfuegbar_ab: string | null;
  status: string;
  letzter_kontakt: string | null;
  naechster_schritt: string | null;
  zustaendig: string | null;
  notizen: string | null;
  ort: string | null;              // ADD COLUMN in Supabase
  website: string | null;          // ADD COLUMN in Supabase
  source_url: string | null;       // ADD COLUMN in Supabase
  research_status: string | null;  // ADD COLUMN in Supabase
  created_at: string | null;
};

// InvestorDb is the public alias (backward compat for any imports)
export type InvestorDb = InvestorCrm;

// Row in component state — adds computed score
export type InvestorRow = InvestorCrm & { score: number };

// ── Deterministic scoring (no jitter — fully explainable) ─────────────────────

const ticketScores: Record<string, number> = {
  "25k–50k": 8,   "25k–75k": 12, "25k–200k": 16,
  "50k+": 18,     "50k–100k": 18, "50k–200k": 22,
  "100k+": 28,    "100k–300k": 28, "100k–500k": 33,
  "250k–1M": 40,  "500k+": 48,
};
const typScores: Record<string, number> = {
  "Family Office": 22, "HNWI": 18, "Angel": 15,
  "Unternehmer": 10,   "VC": 7,    "Privat": 3,
};
const quelleScores: Record<string, number> = {
  "BaFin": 16, "Bundesanzeiger": 14, "BAND": 12,
  "BVK": 10,   "LinkedIn": 7,        "Manual": 5,
};

export function calcScore(inv: InvestorCrm): number {
  let s = 0;
  s += ticketScores[inv.kapitalrahmen ?? ""] ?? 8;
  s += typScores[inv.typ ?? ""] ?? 7;
  s += quelleScores[inv.kontaktquelle ?? ""] ?? 5;
  // Completeness/evidence bonus
  if (inv.email)    s += 8;
  if (inv.linkedin) s += 5;
  if (inv.website)  s += 3;
  if (inv.rolle)    s += 4;
  return Math.min(100, Math.max(5, s));
}

export function toStars(score: number): number {
  // CSV score IS already the star count (1–5) — batch-writer stores stars, not raw 0-100
  if (score >= 1 && score <= 5) return Math.round(score);
  // Legacy path for raw 0–100 input
  if (score >= 80) return 5;
  if (score >= 65) return 4;
  if (score >= 45) return 3;
  if (score >= 25) return 2;
  return 1;
}

// ── CSV parser (robust quoted-field state machine) ────────────────────────────

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === "," && !inQuotes) { result.push(current); current = ""; }
    else { current += ch; }
  }
  result.push(current);
  return result;
}

// Maps CSV columns → Supabase column names (plus _csvScore for star display)
type ParsedRow = Omit<InvestorCrm, "id" | "created_at"> & { _csvScore: number | null };
function parseCsv(text: string): ParsedRow[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const rawHeaders = parseCsvLine(lines[0]).map(h => h.trim().replace(/"/g, ""));
  const hl = rawHeaders.map(h => h.toLowerCase());

  function get(vals: string[], key: string): string | null {
    const idx = hl.indexOf(key.toLowerCase());
    return idx >= 0 ? (vals[idx]?.trim() || null) : null;
  }

  const parsed = lines.slice(1).filter(Boolean).map(line => {
    const v = parseCsvLine(line);
    const rawName  = get(v, "name") ?? "";
    const rawFirma = get(v, "unternehmen") ?? get(v, "firma") ?? null;

    // Firm-only record: name === company → contact unknown
    const resolvedName = (rawName && rawName !== rawFirma) ? rawName : "";
    const rawScore = parseInt(get(v, "score") ?? "", 10);

    return {
      name:             resolvedName,
      rolle:            get(v, "rolle"),
      unternehmen:      rawFirma,
      typ:              get(v, "typ"),
      email:            get(v, "email") ?? get(v, "e-mail"),
      telefon:          null,
      linkedin:         get(v, "linkedin"),
      kontaktquelle:    get(v, "quelle") ?? get(v, "kontaktquelle"),   // CSV uses "quelle"
      kapitalrahmen:    get(v, "kapital") ?? get(v, "kapitalrahmen"),  // CSV uses "kapital"
      verfuegbar_ab:    null,
      status:           get(v, "status") ?? "Neu",
      letzter_kontakt:  null,
      naechster_schritt:null,
      zustaendig:       null,
      notizen:          null,
      ort:              get(v, "ort"),
      website:          get(v, "website"),
      source_url:       get(v, "source_url"),
      research_status:  "NEEDS_CONTACT",
      _csvScore:        isNaN(rawScore) ? null : rawScore,
    };
  }).filter(r => r.name.length > 0 || !!r.unternehmen);

  return parsed;
}

// ── UI constants ──────────────────────────────────────────────────────────────

const T = "var(--font-text)";

const TYP_OPTS    = ["Family Office","HNWI","Angel","Unternehmer","VC","Privat"];
const QUELLE_OPTS = ["BaFin","Bundesanzeiger","BAND","BVK","LinkedIn","Manual"];
const STATUS_OPTS = ["Neu","Kontaktiert","Geantwortet","Call","Investor"];
const RS_OPTS     = ["NEEDS_CONTACT","NEEDS_EMAIL","NEEDS_LINKEDIN","COMPLETE","NEEDS_REVIEW"];
const SCHRITT_OPTS = ["Erstkontakt senden","Erstgespräch anfragen","Follow-up","Call planen","NDA senden","Angebot senden","Onboarding","Research","Warten auf Antwort","Kein weiterer Schritt"];

// ── Colour palettes ───────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string,{bg:string;text:string;border:string}> = {
  "Neu":         {bg:"rgba(255,255,255,0.06)", text:"rgba(255,255,255,0.5)",  border:"rgba(255,255,255,0.09)"},
  "Kontaktiert": {bg:"rgba(59,130,246,0.13)",  text:"rgba(147,197,253,0.85)",border:"rgba(59,130,246,0.22)"},
  "Geantwortet": {bg:"rgba(212,175,55,0.13)",  text:"rgba(212,175,55,0.85)", border:"rgba(212,175,55,0.22)"},
  "Call":        {bg:"rgba(251,146,60,0.13)",  text:"rgba(251,191,36,0.85)", border:"rgba(251,146,60,0.22)"},
  "Investor":    {bg:"rgba(34,197,94,0.13)",   text:"rgba(134,239,172,0.85)",border:"rgba(34,197,94,0.22)"},
};
const TYP_COLOR: Record<string,{bg:string;text:string;border:string}> = {
  "HNWI":          {bg:"rgba(255,255,255,0.06)",text:"rgba(255,255,255,0.62)",border:"rgba(255,255,255,0.09)"},
  "Angel":         {bg:"rgba(255,255,255,0.06)",text:"rgba(255,255,255,0.62)",border:"rgba(255,255,255,0.09)"},
  "Family Office": {bg:"rgba(255,255,255,0.06)",text:"rgba(255,255,255,0.62)",border:"rgba(255,255,255,0.09)"},
  "Unternehmer":   {bg:"rgba(255,255,255,0.06)",text:"rgba(255,255,255,0.62)",border:"rgba(255,255,255,0.09)"},
  "VC":            {bg:"rgba(255,255,255,0.06)",text:"rgba(255,255,255,0.62)",border:"rgba(255,255,255,0.09)"},
  "Privat":        {bg:"rgba(255,255,255,0.04)",text:"rgba(255,255,255,0.38)",border:"rgba(255,255,255,0.06)"},
};

// ── Shared button style ───────────────────────────────────────────────────────

const btnSt: React.CSSProperties = {
  display:"flex", alignItems:"center", gap:5,
  background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.09)",
  borderRadius:5, padding:"5px 11px", color:"rgba(255,255,255,0.55)",
  cursor:"pointer", fontSize:11, fontWeight:700, fontFamily:T, letterSpacing:"0.04em",
};
const inp: React.CSSProperties = {
  width:"100%", boxSizing:"border-box", background:"rgba(255,255,255,0.04)",
  border:"1px solid rgba(255,255,255,0.08)", borderRadius:4, color:"#e4e4e7",
  fontSize:12, fontFamily:T, padding:"4px 9px", outline:"none",
};
const editSt: React.CSSProperties = {
  width:"100%", boxSizing:"border-box", background:"transparent", border:"none",
  borderBottom:"1px solid rgba(255,255,255,0.4)", color:"#f0f0f2",
  fontSize:12, fontFamily:T, padding:"0 2px", outline:"none", caretColor:"#fff",
};
const selSt: React.CSSProperties = { ...editSt, background:"#141416", cursor:"pointer" };

// ── Subcomponents ─────────────────────────────────────────────────────────────

function Badge({ label, map }: { label:string|null; map:Record<string,{bg:string;text:string;border:string}> }) {
  if (!label) return null;
  const NEUTRAL = {bg:"rgba(255,255,255,0.06)",text:"rgba(255,255,255,0.55)",border:"rgba(255,255,255,0.09)"};
  const c = map[label] ?? NEUTRAL;
  return (
    <span style={{ display:"inline-block", padding:"2px 7px", borderRadius:3, fontSize:10, fontWeight:700, fontFamily:T, letterSpacing:"0.03em", background:c.bg, color:c.text, border:`1px solid ${c.border}`, whiteSpace:"nowrap", lineHeight:"16px" }}>
      {label}
    </span>
  );
}

function StarRow({ score }: { score: number }) {
  const filled = toStars(score);
  const starColor = filled === 5 ? "#D4AF37"
                  : filled === 4 ? "#b8942a"
                  : filled === 3 ? "rgba(255,255,255,0.32)"
                  : "rgba(255,255,255,0.15)";
  return (
    <span style={{ display:"inline-flex", gap:1, alignItems:"center" }} title={`${filled} von 5 Sternen`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} style={{ color: i < filled ? starColor : "rgba(255,255,255,0.07)", fontSize:11, lineHeight:1 }}>★</span>
      ))}
    </span>
  );
}

function SourceBadge({ quelle, sourceUrl }: { quelle: string | null; sourceUrl: string | null }) {
  if (!quelle) return null;
  const inner = (
    <span style={{ display:"inline-block", padding:"2px 6px", borderRadius:3, fontSize:10, fontWeight:600, fontFamily:T, whiteSpace:"nowrap", lineHeight:"16px", background:"rgba(255,255,255,0.06)", color:"rgba(255,255,255,0.55)", border:"1px solid rgba(255,255,255,0.08)", cursor: sourceUrl ? "pointer" : "default" }}>
      {quelle}
    </span>
  );
  if (sourceUrl) {
    const href = sourceUrl.startsWith("http") ? sourceUrl : `https://${sourceUrl}`;
    return <a href={href} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} title={sourceUrl} style={{ display:"inline-flex" }}>{inner}</a>;
  }
  return inner;
}

// ── Column definitions ─────────────────────────────────────────────────────────

type ColKey = keyof Omit<InvestorRow, "id" | "created_at" | "verfuegbar_ab" | "telefon" | "zustaendig">;

type Col = { key: ColKey; label: string; w: number; sortable?: boolean };

const COLS: Col[] = [
  { key:"unternehmen",   label:"UNTERNEHMEN", w:196, sortable:true },
  { key:"typ",           label:"TYP",         w:124, sortable:true },
  { key:"ort",           label:"ORT",         w:112 },
  { key:"name",          label:"KONTAKT",     w:152, sortable:true },
  { key:"rolle",         label:"ROLLE",       w:148 },
  { key:"email",         label:"E-MAIL",      w:200 },
  { key:"linkedin",      label:"LI",          w:32  },
  { key:"website",       label:"WEB",         w:32  },
  { key:"kontaktquelle", label:"QUELLE",      w:104 },
  { key:"score",         label:"SCORE",       w:90,  sortable:true },
  { key:"status",        label:"STATUS",      w:100, sortable:true },
];

const NUM_W  = 44;
const ACT_W  = 36;
const ROW_H  = 30;
const HEAD_H = 32;

const TABS = ["Alle","Neu","Kontaktiert","Geantwortet","Call","Investor"] as const;
type Tab = typeof TABS[number];

// ── Edit cell ─────────────────────────────────────────────────────────────────

function EditCell({ col, value, onSave, onClose }: {
  col: ColKey; value: string | null; onSave: (v: string | null) => void; onClose: () => void;
}) {
  const [draft, setDraft] = useState(value ?? "");
  const commit = (v: string) => { onSave(v.trim() || null); onClose(); };

  const dropOpts: string[] | null =
    col === "typ"             ? TYP_OPTS :
    col === "kontaktquelle"   ? QUELLE_OPTS :
    col === "status"          ? STATUS_OPTS :
    col === "research_status" ? RS_OPTS :
    col === "naechster_schritt" ? SCHRITT_OPTS : null;

  if (dropOpts) return (
    <select autoFocus style={selSt} value={draft}
      onChange={e => { setDraft(e.target.value); commit(e.target.value); }}
      onBlur={() => commit(draft)}>
      <option value="">—</option>
      {dropOpts.map(o => <option key={o}>{o}</option>)}
    </select>
  );

  return (
    <input autoFocus
      type={col === "email" ? "email" : "text"}
      style={editSt} value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => commit(draft)}
      onKeyDown={e => e.key === "Enter" && commit(draft)} />
  );
}

// ── Add modal ─────────────────────────────────────────────────────────────────

function AddModal({ onClose, onAdd }: {
  onClose: () => void;
  onAdd: (row: Omit<InvestorCrm, "id" | "created_at">) => void;
}) {
  const [form, setForm] = useState<Partial<Omit<InvestorCrm,"id"|"created_at">>>({ status: "Neu" });
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof form, v: string | null) => setForm(f => ({ ...f, [k]: v }));
  const lbl = (text: string) => (
    <label style={{ display:"block", fontSize:9, fontWeight:700, color:"rgba(255,255,255,0.28)", fontFamily:T, letterSpacing:"0.07em", textTransform:"uppercase" as const, marginBottom:3 }}>{text}</label>
  );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.unternehmen?.trim() && !form.name?.trim()) {
      setErr("Unternehmen oder Kontaktname ist Pflichtfeld"); return;
    }
    onAdd({
      name: form.name?.trim() ?? "",
      rolle: form.rolle ?? null,
      unternehmen: form.unternehmen ?? null,
      typ: form.typ ?? null,
      email: form.email ?? null,
      telefon: null,
      linkedin: form.linkedin ?? null,
      kontaktquelle: form.kontaktquelle ?? null,
      kapitalrahmen: null,
      verfuegbar_ab: null,
      status: form.status ?? "Neu",
      letzter_kontakt: null,
      naechster_schritt: null,
      zustaendig: null,
      notizen: null,
      ort: form.ort ?? null,
      website: form.website ?? null,
      source_url: null,
      research_status: "NEEDS_CONTACT",
    });
    onClose();
  }

  return (
    <div style={{ position:"fixed", inset:0, zIndex:2000, background:"rgba(0,0,0,0.65)", display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ background:"#0c0d10", border:"1px solid rgba(255,255,255,0.08)", borderRadius:8, width:"100%", maxWidth:580, maxHeight:"88vh", overflowY:"auto", padding:24 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
          <span style={{ fontSize:13, fontWeight:800, color:"rgba(255,255,255,0.7)", fontFamily:T }}>Investor hinzufügen</span>
          <button onClick={onClose} style={{ background:"none", border:"none", color:"rgba(255,255,255,0.35)", cursor:"pointer", fontSize:16 }}>✕</button>
        </div>
        <form onSubmit={submit}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            {([
              {k:"unternehmen",   label:"Unternehmen *"},
              {k:"name",          label:"Kontakt"},
              {k:"rolle",         label:"Rolle / Titel"},
              {k:"email",         label:"E-Mail"},
              {k:"linkedin",      label:"LinkedIn URL"},
              {k:"website",       label:"Website"},
              {k:"ort",           label:"Stadt / Ort"},
            ] as {k:keyof typeof form;label:string}[]).map(({k,label}) => (
              <div key={k}>{lbl(label)}<input style={inp} value={(form[k] as string) ?? ""} onChange={e => set(k, e.target.value || null)} /></div>
            ))}
            {([
              {k:"typ",           label:"Typ",    opts:TYP_OPTS},
              {k:"kontaktquelle", label:"Quelle", opts:QUELLE_OPTS},
              {k:"status",        label:"Status", opts:STATUS_OPTS},
            ] as {k:keyof typeof form;label:string;opts:string[]}[]).map(({k,label,opts}) => (
              <div key={k}>{lbl(label)}
                <select style={inp} value={(form[k] as string) ?? ""} onChange={e => set(k, e.target.value || null)}>
                  <option value="">—</option>
                  {opts.map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
            ))}
          </div>
          {err && <p style={{ color:"#f87171", fontSize:11, marginTop:6, fontFamily:T }}>{err}</p>}
          <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop:16 }}>
            <button type="button" onClick={onClose} style={btnSt}>Abbrechen</button>
            <button type="submit" style={{ ...btnSt, color:"rgba(255,255,255,0.8)", borderColor:"rgba(255,255,255,0.18)" }}>Hinzufügen</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Migration modal — schema check + server-side idempotent seed ──────────────

const MIGRATION_SQL = `-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New query)
ALTER TABLE investors_crm ADD COLUMN IF NOT EXISTS rolle TEXT;
ALTER TABLE investors_crm ADD COLUMN IF NOT EXISTS typ TEXT;
ALTER TABLE investors_crm ADD COLUMN IF NOT EXISTS linkedin TEXT;
ALTER TABLE investors_crm ADD COLUMN IF NOT EXISTS ort TEXT;
ALTER TABLE investors_crm ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE investors_crm ADD COLUMN IF NOT EXISTS source_url TEXT;
ALTER TABLE investors_crm ADD COLUMN IF NOT EXISTS research_status TEXT DEFAULT 'NEEDS_CONTACT';
ALTER TABLE investors_crm ADD COLUMN IF NOT EXISTS researched_at TIMESTAMPTZ;
ALTER TABLE investors_crm ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();`;

function MigrateModal({ onClose, onMigrated, schemaState }: {
  onClose: () => void;
  onMigrated: () => void;
  schemaState: string;
}) {
  const [phase, setPhase] = useState<"idle"|"checking"|"running"|"done"|"error">("idle");
  const [report, setReport]   = useState<Record<string, unknown> | null>(null);
  const [errMsg, setErrMsg]   = useState("");
  const [copied, setCopied]   = useState(false);

  const schemaReady = schemaState === "SUPABASE_READY" || schemaState === "MIGRATING";

  async function run() {
    setPhase("checking");
    try {
      // Re-verify schema immediately before seeding
      const statusRes = await fetch("/api/investors-crm/schema-status");
      const status = await statusRes.json() as { state: string };
      if (status.state === "LEGACY_CSV") {
        setErrMsg("Schema-Migration noch nicht durchgeführt. Führe das SQL oben zuerst im Supabase Dashboard aus.");
        setPhase("error"); return;
      }

      setPhase("running");
      const csvRes = await fetch("/data/investors_real.csv");
      if (!csvRes.ok) throw new Error("investors_real.csv nicht gefunden");
      const csvText = await csvRes.text();

      const res = await fetch("/api/investors-crm/migrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csvText }),
      });
      const result = await res.json() as Record<string, unknown>;
      if (!res.ok || !result.ok) {
        setErrMsg((result.detail as string) ?? (result.error as string) ?? "Unbekannter Fehler");
        setPhase("error"); return;
      }
      setReport(result);
      setPhase("done");
      onMigrated();
    } catch (e) {
      setErrMsg(String(e)); setPhase("error");
    }
  }

  function copySQL() {
    navigator.clipboard.writeText(MIGRATION_SQL).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div style={{ position:"fixed", inset:0, zIndex:2000, background:"rgba(0,0,0,0.72)", display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ background:"#0c0d10", border:"1px solid rgba(255,255,255,0.1)", borderRadius:8, width:"100%", maxWidth:560, padding:24 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
          <span style={{ fontSize:13, fontWeight:800, color:"rgba(255,255,255,0.75)", fontFamily:T }}>Migration · CSV → Supabase</span>
          <button onClick={onClose} style={{ background:"none", border:"none", color:"rgba(255,255,255,0.35)", cursor:"pointer", fontSize:16 }}>✕</button>
        </div>

        {!schemaReady && phase !== "error" && (
          <>
            <div style={{ background:"rgba(212,175,55,0.07)", border:"1px solid rgba(212,175,55,0.18)", borderRadius:5, padding:"10px 14px", marginBottom:14 }}>
              <div style={{ fontSize:10, fontWeight:700, color:"rgba(212,175,55,0.75)", fontFamily:T, letterSpacing:"0.06em", marginBottom:6 }}>SCHRITT 1 · SCHEMA MIGRATION ERFORDERLICH</div>
              <div style={{ fontSize:11, color:"rgba(255,255,255,0.45)", fontFamily:T, lineHeight:1.6 }}>
                Die Supabase-Tabelle fehlt noch die erweiterten Spalten. Führe das SQL im{" "}
                <strong style={{ color:"rgba(255,255,255,0.65)" }}>Supabase Dashboard → SQL Editor</strong> aus, dann klicke auf „Schema prüfen".
              </div>
            </div>
            <pre style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:4, padding:12, fontSize:10, fontFamily:"monospace", color:"rgba(255,255,255,0.55)", overflowX:"auto", marginBottom:10, whiteSpace:"pre-wrap" }}>
              {MIGRATION_SQL}
            </pre>
            <div style={{ display:"flex", justifyContent:"space-between", gap:8 }}>
              <button onClick={copySQL} style={{ ...btnSt, color: copied ? "rgba(134,239,172,0.85)" : "rgba(255,255,255,0.5)" }}>{copied ? "✓ Kopiert" : "SQL kopieren"}</button>
              <div style={{ display:"flex", gap:8 }}>
                <button onClick={onClose} style={btnSt}>Abbrechen</button>
                <button onClick={run} style={{ ...btnSt, color:"rgba(255,255,255,0.65)", borderColor:"rgba(255,255,255,0.14)" }}>Schema prüfen &amp; starten</button>
              </div>
            </div>
          </>
        )}

        {schemaReady && phase === "idle" && (
          <>
            <div style={{ background:"rgba(34,197,94,0.07)", border:"1px solid rgba(34,197,94,0.2)", borderRadius:5, padding:"8px 14px", marginBottom:14 }}>
              <div style={{ fontSize:10, fontWeight:700, color:"rgba(134,239,172,0.75)", fontFamily:T, letterSpacing:"0.06em" }}>SCHEMA BEREIT</div>
            </div>
            <p style={{ fontSize:12, color:"rgba(255,255,255,0.4)", fontFamily:T, margin:"0 0 16px", lineHeight:1.6 }}>
              246 Kontakte aus <code style={{ fontFamily:"monospace", color:"rgba(255,255,255,0.55)" }}>investors_real.csv</code> werden idempotent in Supabase migriert. Bereits vorhandene Firmen werden übersprungen.
            </p>
            <div style={{ display:"flex", justifyContent:"flex-end", gap:8 }}>
              <button onClick={onClose} style={btnSt}>Abbrechen</button>
              <button onClick={run} style={{ ...btnSt, color:"rgba(255,255,255,0.85)", borderColor:"rgba(255,255,255,0.2)" }}>Migration starten</button>
            </div>
          </>
        )}

        {(phase === "checking" || phase === "running") && (
          <p style={{ fontSize:12, color:"rgba(255,255,255,0.45)", fontFamily:T }}>
            {phase === "checking" ? "Schema wird geprüft…" : "Migration läuft… 246 Datensätze werden verarbeitet."}
          </p>
        )}

        {phase === "done" && report && (
          <>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8, marginBottom:16 }}>
              {([
                { l:"Gelesen",       v:report.csvRowsRead,  c:"rgba(255,255,255,0.55)" },
                { l:"Erstellt",      v:report.created,      c:"rgba(134,239,172,0.85)" },
                { l:"Übersprungen",  v:report.skipped,      c:"rgba(255,255,255,0.35)" },
                { l:"Fehler",        v:report.failed,       c:"rgba(248,113,113,0.85)" },
              ] as {l:string;v:unknown;c:string}[]).map(({l,v,c}) => (
                <div key={l} style={{ textAlign:"center" }}>
                  <div style={{ fontSize:22, fontWeight:800, color:c, fontFamily:T }}>{String(v)}</div>
                  <div style={{ fontSize:9, fontWeight:700, color:"rgba(255,255,255,0.28)", fontFamily:T, letterSpacing:"0.06em", textTransform:"uppercase" as const }}>{l}</div>
                </div>
              ))}
            </div>
            {(report.failed as number) > 0 && (
              <div style={{ background:"rgba(248,113,113,0.07)", border:"1px solid rgba(248,113,113,0.18)", borderRadius:4, padding:"8px 12px", marginBottom:12, fontSize:11, color:"rgba(248,113,113,0.75)", fontFamily:T }}>
                {report.failed as number} Zeilen konnten nicht migriert werden. Prüfe die Supabase-Logs.
              </div>
            )}
            <div style={{ display:"flex", justifyContent:"flex-end" }}>
              <button onClick={onClose} style={{ ...btnSt, color:"rgba(255,255,255,0.85)" }}>Schließen</button>
            </div>
          </>
        )}

        {phase === "error" && (
          <>
            <div style={{ background:"rgba(248,113,113,0.07)", border:"1px solid rgba(248,113,113,0.18)", borderRadius:5, padding:"10px 14px", marginBottom:12 }}>
              <div style={{ fontSize:11, color:"#f87171", fontFamily:T, lineHeight:1.6, wordBreak:"break-word" as const }}>{errMsg}</div>
            </div>
            <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
              <button onClick={() => setPhase("idle")} style={btnSt}>Zurück</button>
              <button onClick={onClose} style={btnSt}>Schließen</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Main view ──────────────────────────────────────────────────────────────────

export function InvestorDbView() {
  const [rows, setRows]             = useState<InvestorRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [loadErr, setLoadErr]       = useState<string | null>(null);
  const [search, setSearch]         = useState("");
  const [tab, setTab]               = useState<Tab>("Alle");
  const [activeCell, setActiveCell] = useState<string | null>(null);
  const [sortCol, setSortCol]       = useState<ColKey>("score");
  const [sortDir, setSortDir]       = useState<"asc" | "desc">("desc");

  // ── Load from local CSV (canonical local source) ──────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    setLoadErr(null);
    try {
      const csvRes = await fetch("/data/investors_real.csv");
      if (!csvRes.ok) throw new Error("investors_real.csv nicht gefunden");
      const csvText = await csvRes.text();
      const parsed = parseCsv(csvText);
      setRows(parsed.map((r, i) => {
        const csvStars = r._csvScore;
        const score = (csvStars != null && csvStars >= 1 && csvStars <= 5)
          ? csvStars
          : toStars(calcScore(r as unknown as InvestorCrm));
        return { ...r, id: `csv-${i}`, created_at: null, score } as InvestorRow;
      }));
    } catch (e) {
      setLoadErr(String(e));
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSort = useCallback((col: ColKey) => {
    setSortCol(prev => {
      if (prev !== col) { setSortDir("asc"); return col; }
      setSortDir(d => d === "asc" ? "desc" : "asc");
      return prev;
    });
  }, []);

  const tabCount = (t: Tab) => t === "Alle" ? rows.length : rows.filter(r => r.status === t).length;

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    let result = rows.filter(r => {
      if (tab !== "Alle" && r.status !== tab) return false;
      if (!q) return true;
      return (
        (r.name          ?? "").toLowerCase().includes(q) ||
        (r.unternehmen   ?? "").toLowerCase().includes(q) ||
        (r.email         ?? "").toLowerCase().includes(q) ||
        (r.rolle         ?? "").toLowerCase().includes(q) ||
        (r.typ           ?? "").toLowerCase().includes(q) ||
        (r.ort           ?? "").toLowerCase().includes(q)
      );
    });
    result = [...result].sort((a, b) => {
      const va = a[sortCol]; const vb = b[sortCol];
      const na = typeof va === "number" ? va : parseFloat(String(va ?? ""));
      const nb = typeof vb === "number" ? vb : parseFloat(String(vb ?? ""));
      const isNum = !isNaN(na) && !isNaN(nb);
      const cmp = isNum ? na - nb : String(va ?? "").localeCompare(String(vb ?? ""), "de");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return result;
  }, [rows, tab, search, sortCol, sortDir]);

  // ── Virtual scroll ─────────────────────────────────────────────────────────

  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_H,
    overscan: 24,
  });
  const vItems = virtualizer.getVirtualItems();

  const totalW = NUM_W + COLS.reduce((s, c) => s + c.w, 0);

  // ── Render cell ────────────────────────────────────────────────────────────

  function renderCell(row: InvestorRow, col: Col): React.ReactNode {
    const key = col.key;
    const val = row[key as keyof InvestorRow];

    if (key === "status")        return <Badge label={val as string|null} map={STATUS_COLOR} />;
    if (key === "typ")           return <Badge label={val as string|null} map={TYP_COLOR} />;
    if (key === "kontaktquelle") return <SourceBadge quelle={val as string|null} sourceUrl={row.source_url} />;
    if (key === "score") {
      const tip = row.score === 5 ? "★★★★★ Verifiziert — direkte E-Mail, LinkedIn & Website bestätigt"
                : row.score === 4 ? "★★★★☆ Gut — E-Mail oder LinkedIn vorhanden, Profil vollständig"
                : row.score === 3 ? "★★★☆☆ Mittel — Firma bekannt, Kontakt teilweise verifiziert"
                : row.score === 2 ? "★★☆☆☆ Schwach — wenige verifizierte Angaben"
                :                   "★☆☆☆☆ Minimal — nur Firmenname, kein direkter Kontakt";
      return <span title={tip}><StarRow score={row.score} /></span>;
    }

    if (key === "linkedin") {
      if (!val) return null;
      const href = (val as string).startsWith("http") ? (val as string) : `https://${val as string}`;
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} title={val as string}>
          <img src="/logos/linkedin.jpg" alt="LinkedIn" style={{ height:16, width:16, objectFit:"contain", display:"block", borderRadius:2, opacity:0.82 }} />
        </a>
      );
    }

    if (key === "email") {
      if (!val) return null;
      return (
        <a href={`mailto:${val as string}`} onClick={e => e.stopPropagation()} title={val as string}
          style={{ fontSize:12, fontFamily:T, color:"rgba(147,197,253,0.8)", display:"block", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", textDecoration:"none" }}>
          {val as string}
        </a>
      );
    }

    if (key === "name") {
      if (!val) return <span style={{ fontSize:11, fontFamily:T, color:"rgba(255,255,255,0.18)", fontStyle:"italic" }}>—</span>;
      const parts: string[] = [];
      if (row.rolle)        parts.push(row.rolle);
      if (row.unternehmen)  parts.push(row.unternehmen);
      if (row.kapitalrahmen) parts.push(`Ticket: ${row.kapitalrahmen}`);
      if (row.ort)          parts.push(row.ort);
      if (row.email)        parts.push(row.email);
      const tip = parts.join(" · ");
      return <span title={tip} style={{ fontSize:12, fontFamily:T, color:"rgba(255,255,255,0.88)", display:"block", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", cursor:"default" }}>{val as string}</span>;
    }

    if (key === "unternehmen") {
      if (!val) return null;
      const label = <span style={{ fontSize:12, fontFamily:T, color: row.website ? "rgba(147,197,253,0.85)" : "rgba(255,255,255,0.8)", display:"block", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{val as string}</span>;
      if (row.website) {
        const href = row.website.startsWith("http") ? row.website : `https://${row.website}`;
        return <a href={href} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} title={row.website} style={{ display:"block", overflow:"hidden", textDecoration:"none", width:"100%" }}>{label}</a>;
      }
      return label;
    }

    if (key === "ort") {
      if (!val) return null;
      return <span style={{ fontSize:11, fontFamily:T, color:"rgba(255,255,255,0.45)", display:"block", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{val as string}</span>;
    }

    if (key === "website") {
      if (!row.website) return null;
      const href = row.website.startsWith("http") ? row.website : `https://${row.website}`;
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} title={row.website}
          style={{ display:"flex", alignItems:"center", justifyContent:"center", width:22, height:22, borderRadius:3, background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.08)", color:"rgba(255,255,255,0.4)", fontSize:10, textDecoration:"none" }}>
          ↗
        </a>
      );
    }

    if (key === "rolle") {
      if (!val) return <span style={{ fontSize:11, fontFamily:T, color:"rgba(255,255,255,0.18)", fontStyle:"italic" }}>—</span>;
      return <span style={{ fontSize:11, fontFamily:T, color:"rgba(255,255,255,0.52)", display:"block", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{val as string}</span>;
    }

    if (!val) return null;
    return <span style={{ fontSize:12, fontFamily:T, color:"rgba(255,255,255,0.62)", display:"block", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{val as string}</span>;
  }

  // ── Cell base styles (true flex vertical centering) ────────────────────────

  const cellBase: React.CSSProperties = {
    display:"flex", alignItems:"center", justifyContent:"flex-start",
    height:"100%", padding:"0 10px",
    boxSizing:"border-box", overflow:"hidden", flexShrink:0,
  };
  const headCellBase: React.CSSProperties = {
    display:"flex", alignItems:"center",
    height:HEAD_H, padding:"0 10px",
    boxSizing:"border-box", flexShrink:0,
    fontSize:10, fontWeight:700, color:"rgba(255,255,255,0.42)",
    fontFamily:T, letterSpacing:"0.07em", textTransform:"uppercase" as const,
    whiteSpace:"nowrap" as const, userSelect:"none" as const,
    borderBottom:"1px solid rgba(255,255,255,0.07)",
  };

  // ── Loading / Error states ─────────────────────────────────────────────────

  if (loading) return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", alignItems:"center", justifyContent:"center", background:"#0a0a0c", color:"rgba(255,255,255,0.32)", fontFamily:T, fontSize:12, gap:12 }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <RefreshCw size={18} style={{ opacity:0.35, animation:"spin 1.2s linear infinite" }} />
      <span>Lade Investor-Daten…</span>
    </div>
  );

  if (loadErr) return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", alignItems:"center", justifyContent:"center", background:"#0a0a0c", fontFamily:T, gap:14 }}>
      <AlertCircle size={22} style={{ color:"rgba(248,113,113,0.65)" }} />
      <div style={{ fontSize:13, color:"rgba(255,255,255,0.55)", fontWeight:700 }}>Daten nicht verfügbar</div>
      <div style={{ fontSize:11, color:"rgba(255,255,255,0.28)", maxWidth:380, textAlign:"center", lineHeight:1.6 }}>{loadErr}</div>
      <button onClick={load} style={{ ...btnSt, color:"rgba(255,255,255,0.65)", marginTop:4 }}>
        <RefreshCw size={11} />Erneut versuchen
      </button>
    </div>
  );

  // ── Full render ────────────────────────────────────────────────────────────

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", minHeight:0, background:"#0a0a0c", color:"#e4e4e7", position:"relative" }}>
      <style>{`
        .inv-scroll::-webkit-scrollbar{width:4px;height:4px}
        .inv-scroll::-webkit-scrollbar-track{background:transparent}
        .inv-scroll::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.17);border-radius:2px}
        @keyframes spin{to{transform:rotate(360deg)}}
      `}</style>

      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"11px 24px", flexShrink:0, borderBottom:"1px solid rgba(255,255,255,0.06)" }} onClick={e => e.stopPropagation()}>
        <span style={{ fontSize:12, fontWeight:800, color:"rgba(255,255,255,0.58)", fontFamily:T, flexShrink:0 }}>Investor DB</span>
        <input
          style={{ width:210, flexShrink:0, background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:4, color:"#e4e4e7", fontSize:11, padding:"4px 10px", fontFamily:T, outline:"none" }}
          placeholder="Suche Name, Firma, E-Mail, Rolle…"
          value={search} onChange={e => setSearch(e.target.value)}
        />
        <div style={{ flex:1, display:"flex", alignItems:"center", overflow:"hidden" }}>
          {[
            { label:"Gesamt",     value:String(rows.length) },
            { label:"Investoren", value:String(rows.filter(r => r.status==="Investor").length) },
            { label:"Warm",       value:String(rows.filter(r => ["Geantwortet","Call"].includes(r.status)).length) },
            { label:"Gefiltert",  value:String(filtered.length) },
          ].map(k => (
            <div key={k.label} style={{ display:"flex", alignItems:"baseline", gap:4, padding:"0 12px", borderLeft:"1px solid rgba(255,255,255,0.06)", flexShrink:0 }}>
              <span style={{ fontSize:9, fontWeight:700, color:"rgba(255,255,255,0.24)", fontFamily:T, letterSpacing:"0.07em", textTransform:"uppercase" }}>{k.label}</span>
              <span style={{ fontSize:13, fontWeight:800, color:"rgba(255,255,255,0.62)", fontFamily:T }}>{k.value}</span>
            </div>
          ))}
        </div>
        <button onClick={load} title="Aktualisieren" style={{ ...btnSt, padding:"5px 8px", flexShrink:0 }}><RefreshCw size={11} strokeWidth={1.8} /></button>
      </div>

      {/* Tabs */}
      <div style={{ display:"flex", borderBottom:"1px solid rgba(255,255,255,0.06)", paddingLeft:24, paddingTop:2, flexShrink:0 }} onClick={e => e.stopPropagation()}>
        {TABS.map(t => {
          const active = tab === t;
          return (
            <button key={t} onClick={() => setTab(t)} style={{
              background:"none", border:"none",
              borderBottom: active ? "2px solid rgba(212,175,55,0.7)" : "2px solid transparent",
              padding:"6px 14px", cursor:"pointer",
              color: active ? "rgba(255,255,255,0.72)" : "rgba(255,255,255,0.26)",
              fontSize:10, fontWeight:700, fontFamily:T, letterSpacing:"0.06em",
              textTransform:"uppercase", transition:"color 120ms, border-color 120ms",
              marginBottom:-1, display:"flex", alignItems:"center", gap:5,
            }}>
              {t}
              <span style={{ color: active ? "rgba(255,255,255,0.32)" : "rgba(255,255,255,0.15)", fontWeight:600 }}>
                {tabCount(t)}
              </span>
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div ref={parentRef} className="inv-scroll"
        style={{ flex:1, minHeight:0, overflow:"auto", scrollbarWidth:"thin", scrollbarColor:"rgba(255,255,255,0.17) transparent" }}
        onClick={e => e.stopPropagation()}>

        {/* Sticky header */}
        <div style={{ position:"sticky", top:0, zIndex:10, background:"#0a0a0c", minWidth:totalW }}>
          <div style={{ display:"flex", width:"100%", height:HEAD_H }}>
            <div style={{ ...headCellBase, width:NUM_W, minWidth:NUM_W, paddingLeft:14 }}>#</div>
            {COLS.map(c => {
              const isSorted = sortCol === c.key;
              return (
                <div key={c.key} style={{ ...headCellBase, width:c.w, minWidth:c.w, cursor:c.sortable?"pointer":"default", background:isSorted?"rgba(255,255,255,0.015)":"transparent" }}
                  onClick={c.sortable ? () => handleSort(c.key) : undefined}>
                  <span style={{ display:"inline-flex", alignItems:"center", gap:3 }}>
                    {c.label}
                    {c.sortable && (isSorted
                      ? <span style={{ color:"rgba(212,175,55,0.7)", fontSize:8 }}>{sortDir==="asc"?"▲":"▼"}</span>
                      : <span style={{ color:"rgba(255,255,255,0.14)", fontSize:8 }}>⇅</span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Empty state */}
        {rows.length === 0 && (
          <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:160 }}>
            <span style={{ fontSize:11, color:"rgba(255,255,255,0.18)", fontFamily:T }}>Keine Daten</span>
          </div>
        )}

        {/* Virtual rows */}
        <div style={{ height:virtualizer.getTotalSize(), position:"relative", minWidth:totalW }}>
          {vItems.map(vRow => {
            const row = filtered[vRow.index];
            const ri  = vRow.index;
            return (
              <div key={vRow.key}
                style={{
                  position:"absolute", top:0, left:0, width:"100%",
                  transform:`translateY(${vRow.start}px)`,
                  height:ROW_H, display:"flex", alignItems:"center",
                  background: ri%2===0 ? "transparent" : "rgba(255,255,255,0.01)",
                  borderBottom:"1px solid rgba(255,255,255,0.028)",
                  minWidth:totalW,
                }}>
                {/* # */}
                <div style={{ ...cellBase, width:NUM_W, minWidth:NUM_W, paddingLeft:14 }}>
                  <span style={{ fontSize:10, color:"rgba(255,255,255,0.2)", fontFamily:T }}>{ri+1}</span>
                </div>
                {/* Data columns — read-only */}
                {COLS.map(col => (
                  <div key={col.key} style={{ ...cellBase, width:col.w, minWidth:col.w }}>
                    {renderCell(row, col)}
                  </div>
                ))}
              </div>
            );
          })}

          {filtered.length === 0 && rows.length > 0 && (
            <div style={{ position:"absolute", top:0, left:0, right:0, display:"flex", alignItems:"center", justifyContent:"center", height:60, color:"rgba(255,255,255,0.16)", fontSize:11, fontFamily:T }}>
              Keine Treffer
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
