"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { MessageSquare, Upload, ChevronLeft, ChevronRight } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

export type InvestorDb = {
  id: number;
  name: string;
  unternehmen: string | null;
  typ: string | null;
  email: string | null;
  linkedin: string | null;
  kapital: string | null;
  quelle: string | null;
  score: number | null;
  status: string;
  naechsterSchritt: string | null;
  letzterKont: string | null;
  notizen: string | null;
};

// ── Deterministic 1 000-entry generator ───────────────────────────────────────

const firstNames = ["Thomas","Michael","Andreas","Stefan","Klaus","Markus","Jan","Peter","Christian","Daniel","Sabine","Julia","Andrea","Lisa","Petra","Anna","Maria","Laura","Sandra","Claudia","Hans","Wolfgang","Jürgen","Rainer","Bernd","Frank","Dirk","Sven","Oliver","Tobias"];
const lastNames  = ["Müller","Schmidt","Schneider","Fischer","Weber","Meyer","Wagner","Becker","Schulz","Hoffmann","Koch","Richter","Klein","Wolf","Schröder","Neumann","Braun","Zimmermann","Hartmann","Krause","Lehmann","Lange","Kramer","Huber","Maier","Walter","König","Werner","Peters","Schulze"];
const companies  = ["Capital GmbH","Holding AG","Ventures","Invest","Family Office","Vermögensverwaltung","Beteiligungen GmbH","Unternehmensgruppe","Finanz GmbH","Asset Management"];
const tickets    = ["25k–50k","25k–75k","50k–100k","50k–200k","100k–300k","100k–500k","250k–1M","500k+"];
const sources    = ["LinkedIn","LinkedIn","LinkedIn","BaFin","Bundesanzeiger","BAND","Manual"];
const types      = ["HNWI","HNWI","Angel","Unternehmer","Family Office","VC","Privat"];
const statuses   = ["Neu","Neu","Neu","Kontaktiert","Kontaktiert","Geantwortet","Call","Investor"];

const MOCK: InvestorDb[] = Array.from({ length: 1000 }, (_, i) => {
  const firstName    = firstNames[i % firstNames.length];
  const lastName     = lastNames[Math.floor(i / firstNames.length) % lastNames.length];
  const companySuffix = companies[i % companies.length];
  const ticket       = tickets[i % tickets.length];
  const source       = sources[i % sources.length];
  const typ          = types[i % types.length];
  const status       = statuses[i % statuses.length];
  const score        = 1 + (i * 3 % 5);
  const base         = lastName.toLowerCase().replace(/[^a-z]/g,"");
  const sfx          = companySuffix.split(" ")[0].toLowerCase().replace(/[^a-z]/g,"");
  const domain       = `${base}-${sfx}.de`;
  const fn           = firstName.toLowerCase();
  const ln           = lastName.toLowerCase().replace(/[^a-z]/g,"");
  const naechsterSchritt =
    status === "Neu"         ? "Erstkontakt senden" :
    status === "Kontaktiert" ? "Follow-up" :
    status === "Geantwortet" ? "Call planen" : "";
  const day = String((i % 28) + 1).padStart(2,"0");

  return {
    id: i + 1,
    name: `${firstName} ${lastName}`,
    unternehmen: `${lastName} ${companySuffix}`,
    typ,
    email: `${fn[0]}.${ln}@${domain}`,
    linkedin: source === "LinkedIn" ? `linkedin.com/in/${fn}${ln}` : "",
    kapital: ticket,
    quelle: source,
    score,
    status,
    naechsterSchritt,
    letzterKont: status !== "Neu" ? `${day}.01.25` : null,
    notizen: "",
  };
});

// ── Options ────────────────────────────────────────────────────────────────────

const TYP_OPTS     = ["HNWI","Angel","Family Office","VC","Unternehmer","Privat"];
const QUELLE_OPTS  = ["BaFin","Bundesanzeiger","LinkedIn","BAND","Manual"];
const STATUS_OPTS  = ["Neu","Kontaktiert","Geantwortet","Call","Investor"];
const SCHRITT_OPTS = ["Erstkontakt senden","Erstgespräch anfragen","Follow-up","Call planen","NDA senden","Angebot senden","Onboarding","Research","Warten auf Antwort","Kein weiterer Schritt"];

// ── Colour palettes — muted ────────────────────────────────────────────────────

const STATUS_COLOR: Record<string,{bg:string;text:string;border:string}> = {
  "Neu":         {bg:"rgba(255,255,255,0.07)", text:"rgba(255,255,255,0.6)",  border:"rgba(255,255,255,0.1)"},
  "Kontaktiert": {bg:"rgba(59,130,246,0.15)",  text:"rgba(147,197,253,0.9)", border:"rgba(59,130,246,0.25)"},
  "Geantwortet": {bg:"rgba(212,175,55,0.15)",  text:"rgba(212,175,55,0.9)",  border:"rgba(212,175,55,0.25)"},
  "Call":        {bg:"rgba(251,146,60,0.15)",  text:"rgba(251,191,36,0.9)",  border:"rgba(251,146,60,0.25)"},
  "Investor":    {bg:"rgba(34,197,94,0.15)",   text:"rgba(134,239,172,0.9)", border:"rgba(34,197,94,0.25)"},
};

const TYP_COLOR: Record<string,{bg:string;text:string;border:string}> = {
  "HNWI":          {bg:"rgba(212,175,55,0.15)", text:"rgba(212,175,55,0.9)", border:"rgba(212,175,55,0.25)"},
  "Angel":         {bg:"rgba(255,255,255,0.07)",text:"rgba(255,255,255,0.7)",border:"rgba(255,255,255,0.1)"},
  "Family Office": {bg:"rgba(255,255,255,0.07)",text:"rgba(255,255,255,0.7)",border:"rgba(255,255,255,0.1)"},
  "Unternehmer":   {bg:"rgba(255,255,255,0.07)",text:"rgba(255,255,255,0.7)",border:"rgba(255,255,255,0.1)"},
  "VC":            {bg:"rgba(255,255,255,0.07)",text:"rgba(255,255,255,0.7)",border:"rgba(255,255,255,0.1)"},
  "Privat":        {bg:"rgba(255,255,255,0.05)",text:"rgba(255,255,255,0.5)",border:"rgba(255,255,255,0.08)"},
};

const NEUTRAL_BADGE = {bg:"rgba(255,255,255,0.07)",text:"rgba(255,255,255,0.6)",border:"rgba(255,255,255,0.1)"};

// ── Quelle renderer (logos + neutral fallback) ────────────────────────────────

const LOGO: Record<string,string> = {
  "BaFin":          "/logos/bafin.png",
  "LinkedIn":       "/logos/linkedin.jpg",
  "Bundesanzeiger": "/logos/bundesanzeiger.jpg",
};

function QuelleCell({ quelle }: { quelle: string | null }) {
  if (!quelle) return <span style={{ color:"rgba(255,255,255,0.18)", fontSize:10 }}>—</span>;
  const src = LOGO[quelle];
  if (src) {
    return (
      <img
        src={src}
        alt={quelle}
        title={quelle}
        style={{ height:18, maxWidth:56, objectFit:"contain", display:"block", mixBlendMode:"luminosity", opacity:0.85 }}
      />
    );
  }
  return (
    <span style={{ display:"inline-block", padding:"2px 7px", borderRadius:4, fontSize:10, fontWeight:700, fontFamily:T, letterSpacing:"0.03em", background:NEUTRAL_BADGE.bg, color:NEUTRAL_BADGE.text, border:`1px solid ${NEUTRAL_BADGE.border}`, whiteSpace:"nowrap" }}>
      {quelle}
    </span>
  );
}

// ── Badge helper ───────────────────────────────────────────────────────────────

const T = "var(--font-text)";

function Badge({ label, map }: { label:string|null; map:Record<string,{bg:string;text:string;border:string}> }) {
  if (!label) return <span style={{ color:"rgba(255,255,255,0.18)", fontSize:10 }}>—</span>;
  const c = map[label] ?? NEUTRAL_BADGE;
  return (
    <span style={{ display:"inline-block", padding:"2px 7px", borderRadius:4, fontSize:10, fontWeight:700, fontFamily:T, letterSpacing:"0.03em", background:c.bg, color:c.text, border:`1px solid ${c.border}`, whiteSpace:"nowrap" }}>
      {label}
    </span>
  );
}

function Stars({ n }: { n:number|null }) {
  const v = n ?? 0;
  return (
    <span style={{ display:"inline-flex", gap:1 }}>
      {[1,2,3,4,5].map(i => (
        <span key={i} style={{ color:i<=v?"#D4AF37":"rgba(255,255,255,0.15)", fontSize:11, lineHeight:1 }}>★</span>
      ))}
    </span>
  );
}

// ── Shared styles ──────────────────────────────────────────────────────────────

const inp: React.CSSProperties = {
  width:"100%", boxSizing:"border-box", background:"rgba(255,255,255,0.04)",
  border:"1px solid rgba(255,255,255,0.08)", borderRadius:5, color:"#e4e4e7",
  fontSize:12, fontFamily:T, padding:"4px 9px", outline:"none",
};
const editSt: React.CSSProperties = {
  width:"100%", boxSizing:"border-box", background:"transparent", border:"none",
  borderBottom:"1px solid rgba(255,255,255,0.5)", color:"#f0f0f2",
  fontSize:12, fontFamily:T, padding:"0 2px", outline:"none", caretColor:"#fff",
};
const selSt: React.CSSProperties = { ...editSt, background:"#141416", cursor:"pointer" };
const btnSt: React.CSSProperties = {
  display:"flex", alignItems:"center", gap:5,
  background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)",
  borderRadius:6, padding:"5px 12px", color:"rgba(255,255,255,0.6)",
  cursor:"pointer", fontSize:11, fontWeight:700, fontFamily:T, letterSpacing:"0.04em",
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(iso:string|null) {
  if (!iso) return "";
  if (/^\d{2}\.\d{2}\.\d{2}$/.test(iso)) return iso;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString("de-DE",{day:"2-digit",month:"2-digit",year:"2-digit"});
}

// ── Column definitions ─────────────────────────────────────────────────────────

type ColKey = keyof Omit<InvestorDb,"id">;
type Col = { key:ColKey; label:string; w:number; sortable?:boolean };

const COLS: Col[] = [
  { key:"name",             label:"Name",             w:140, sortable:true },
  { key:"unternehmen",      label:"Unternehmen",      w:140, sortable:true },
  { key:"typ",              label:"Typ",              w:110, sortable:true },
  { key:"email",            label:"E-Mail",           w:165 },
  { key:"linkedin",         label:"LinkedIn",         w:80  },
  { key:"kapital",          label:"Kapital",          w:110, sortable:true },
  { key:"quelle",           label:"Quelle",           w:120 },
  { key:"score",            label:"Score",            w:90,  sortable:true },
  { key:"status",           label:"Status",           w:115, sortable:true },
  { key:"naechsterSchritt", label:"Nächster Schritt", w:160 },
  { key:"letzterKont",      label:"Letzter Kont.",    w:100, sortable:true },
  { key:"notizen",          label:"Notizen",          w:180 },
];

const TABS = ["Alle","Neu","Kontaktiert","Geantwortet","Call","Investor"] as const;
type Tab = typeof TABS[number];

const PAGE_SIZE = 50;

// ── Edit cell ─────────────────────────────────────────────────────────────────

function EditCell({ col, value, onSave, onClose }: { col:ColKey; value:string|null; onSave:(v:string|null)=>void; onClose:()=>void }) {
  const [draft, setDraft] = useState(value ?? "");
  const commit = (v:string) => { onSave(v.trim()||null); onClose(); };
  const dropOpts =
    col==="typ"              ? TYP_OPTS     :
    col==="quelle"           ? QUELLE_OPTS  :
    col==="status"           ? STATUS_OPTS  :
    col==="naechsterSchritt" ? SCHRITT_OPTS : null;

  if (col==="score") return (
    <select autoFocus style={selSt} value={draft} onChange={e=>{ setDraft(e.target.value); commit(e.target.value); }} onBlur={()=>commit(draft)}>
      <option value="">—</option>
      {[1,2,3,4,5].map(n=><option key={n} value={n}>{n}</option>)}
    </select>
  );
  if (dropOpts) return (
    <select autoFocus style={selSt} value={draft} onChange={e=>{ setDraft(e.target.value); commit(e.target.value); }} onBlur={()=>commit(draft)}>
      <option value="">—</option>
      {dropOpts.map(o=><option key={o}>{o}</option>)}
    </select>
  );
  if (col==="letzterKont") return (
    <input autoFocus type="date" style={editSt} value={draft} onChange={e=>setDraft(e.target.value)} onBlur={()=>commit(draft)} />
  );
  return (
    <input autoFocus type={col==="email"?"email":"text"} style={editSt} value={draft}
      onChange={e=>setDraft(e.target.value)} onBlur={()=>commit(draft)}
      onKeyDown={e=>e.key==="Enter"&&commit(draft)} />
  );
}

// ── Add modal ─────────────────────────────────────────────────────────────────

function AddModal({ onClose, onAdd }: { onClose:()=>void; onAdd:(row:Omit<InvestorDb,"id">)=>void }) {
  const [form, setForm] = useState<Partial<Omit<InvestorDb,"id">>>({ status:"Neu" });
  const [err, setErr]   = useState<string|null>(null);
  const set = (k:keyof Omit<InvestorDb,"id">, v:string|null) => setForm(f=>({...f,[k]:v}));
  const lbl = (text:string) => (
    <label style={{ display:"block", fontSize:9, fontWeight:700, color:"rgba(255,255,255,0.28)", fontFamily:T, letterSpacing:"0.07em", textTransform:"uppercase" as const, marginBottom:4 }}>{text}</label>
  );

  function submit(e:React.FormEvent) {
    e.preventDefault();
    if (!form.name?.trim()) { setErr("Name ist Pflichtfeld"); return; }
    onAdd({ name:form.name.trim(), unternehmen:form.unternehmen??null, typ:form.typ??null, email:form.email??null, linkedin:form.linkedin??null, kapital:form.kapital??null, quelle:form.quelle??null, score:form.score??null, status:form.status??"Neu", naechsterSchritt:form.naechsterSchritt??null, letzterKont:form.letzterKont??null, notizen:form.notizen??null });
    onClose();
  }

  return (
    <div style={{ position:"fixed", inset:0, zIndex:2000, background:"rgba(0,0,0,0.6)", display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ background:"#0c0d10", border:"1px solid rgba(255,255,255,0.08)", borderRadius:8, width:"100%", maxWidth:580, maxHeight:"88vh", overflowY:"auto", padding:22 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
          <span style={{ fontSize:13, fontWeight:800, color:"rgba(255,255,255,0.7)", fontFamily:T }}>Investor hinzufügen</span>
          <button onClick={onClose} style={{ background:"none", border:"none", color:"rgba(255,255,255,0.35)", cursor:"pointer", fontSize:16, lineHeight:1 }}>✕</button>
        </div>
        <form onSubmit={submit}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            {([{k:"name" as const,label:"Name *"},{k:"unternehmen" as const,label:"Unternehmen"},{k:"email" as const,label:"E-Mail"},{k:"linkedin" as const,label:"LinkedIn URL"},{k:"kapital" as const,label:"Kapital"}] as {k:keyof Omit<InvestorDb,"id">;label:string}[]).map(({k,label})=>(
              <div key={k}>{lbl(label)}<input style={inp} value={(form[k] as string)??"" } onChange={e=>set(k,e.target.value||null)} /></div>
            ))}
            {([{k:"typ" as const,label:"Typ",opts:TYP_OPTS},{k:"quelle" as const,label:"Quelle",opts:QUELLE_OPTS},{k:"status" as const,label:"Status",opts:STATUS_OPTS},{k:"naechsterSchritt" as const,label:"Nächster Schritt",opts:SCHRITT_OPTS}] as {k:keyof Omit<InvestorDb,"id">;label:string;opts:string[]}[]).map(({k,label,opts})=>(
              <div key={k}>{lbl(label)}<select style={inp} value={(form[k] as string)??"" } onChange={e=>set(k,e.target.value||null)}><option value="">—</option>{opts.map(o=><option key={o}>{o}</option>)}</select></div>
            ))}
            <div>{lbl("Score")}<select style={inp} value={form.score?.toString()??"" } onChange={e=>set("score" as keyof Omit<InvestorDb,"id">,e.target.value||null)}><option value="">—</option>{[1,2,3,4,5].map(n=><option key={n} value={n}>{n} ★</option>)}</select></div>
            <div>{lbl("Letzter Kontakt")}<input style={inp} type="date" value={form.letzterKont??""} onChange={e=>set("letzterKont",e.target.value||null)} /></div>
          </div>
          <div style={{ marginTop:10 }}>{lbl("Notizen")}<textarea style={{...inp,height:60,resize:"vertical"}} value={form.notizen??""} onChange={e=>set("notizen",e.target.value||null)} /></div>
          {err && <p style={{ color:"#f87171", fontSize:11, marginTop:6, fontFamily:T }}>{err}</p>}
          <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop:14 }}>
            <button type="button" onClick={onClose} style={btnSt}>Abbrechen</button>
            <button type="submit" style={btnSt}>Hinzufügen</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── CSV modal ─────────────────────────────────────────────────────────────────

function CsvModal({ onClose, onImport }: { onClose:()=>void; onImport:(rows:Omit<InvestorDb,"id">[])=>void }) {
  const [text, setText] = useState("");
  const [err, setErr]   = useState<string|null>(null);

  function parse() {
    const lines = text.trim().split("\n").filter(Boolean);
    if (lines.length<2) { setErr("Mindestens eine Kopfzeile + eine Datenzeile."); return; }
    const headers = lines[0].split(",").map(h=>h.trim().toLowerCase());
    const rows: Omit<InvestorDb,"id">[] = [];
    for (let i=1;i<lines.length;i++) {
      const vals=lines[i].split(",").map(v=>v.trim());
      const row:Record<string,string>={};
      headers.forEach((h,idx)=>{ if(vals[idx]) row[h]=vals[idx]; });
      if (!row.name) continue;
      rows.push({ name:row.name, unternehmen:row.unternehmen??null, typ:row.typ??null, email:row.email??null, linkedin:row.linkedin??null, kapital:row.kapital??null, quelle:row.quelle??null, score:row.score?parseInt(row.score):null, status:row.status??"Neu", naechsterSchritt:row.naechsterschritt??null, letzterKont:row.letzterkont??null, notizen:row.notizen??null });
    }
    if (!rows.length) { setErr("Keine gültigen Zeilen."); return; }
    onImport(rows); onClose();
  }

  return (
    <div style={{ position:"fixed", inset:0, zIndex:2000, background:"rgba(0,0,0,0.6)", display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ background:"#0c0d10", border:"1px solid rgba(255,255,255,0.08)", borderRadius:8, width:"100%", maxWidth:500, padding:22 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
          <span style={{ fontSize:13, fontWeight:800, color:"rgba(255,255,255,0.7)", fontFamily:T }}>CSV importieren</span>
          <button onClick={onClose} style={{ background:"none", border:"none", color:"rgba(255,255,255,0.35)", cursor:"pointer", fontSize:16, lineHeight:1 }}>✕</button>
        </div>
        <p style={{ margin:"0 0 8px", fontSize:10, color:"rgba(255,255,255,0.3)", fontFamily:T }}>Kopfzeile: name, unternehmen, typ, email, linkedin, kapital, quelle, score, status, naechsterschritt, notizen</p>
        <textarea style={{...inp,height:150,resize:"vertical"}} placeholder={"name,email,status\nMax Mustermann,max@example.com,Neu"} value={text} onChange={e=>setText(e.target.value)} />
        {err && <p style={{ color:"#f87171", fontSize:11, marginTop:4, fontFamily:T }}>{err}</p>}
        <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop:12 }}>
          <button onClick={onClose} style={btnSt}>Abbrechen</button>
          <button onClick={parse} style={btnSt}>Importieren</button>
        </div>
      </div>
    </div>
  );
}

// ── Main view ──────────────────────────────────────────────────────────────────

export function InvestorDbView() {
  const nextId = useRef(MOCK.length + 1);
  const [rows, setRows]         = useState<InvestorDb[]>(MOCK);
  const [search, setSearch]     = useState("");
  const [tab, setTab]           = useState<Tab>("Alle");
  const [activeCell, setActiveCell] = useState<string|null>(null);
  const [showAdd, setShowAdd]   = useState(false);
  const [showCsv, setShowCsv]   = useState(false);
  const [sortCol, setSortCol]   = useState<ColKey|null>(null);
  const [sortDir, setSortDir]   = useState<"asc"|"desc">("asc");
  const [page, setPage]         = useState(1);

  const handleSort = useCallback((col: ColKey) => {
    setSortCol(prev => {
      if (prev === col) return prev;
      return col;
    });
    setSortDir(prev => {
      if (sortCol === col) return prev === "asc" ? "desc" : "asc";
      return "asc";
    });
    setPage(1);
  }, [sortCol]);

  const patch = useCallback((id:number, key:ColKey, value:string|null) => {
    setRows(prev => prev.map(r => r.id===id ? {...r,[key]:key==="score"?(value?parseInt(value):null):value} : r));
  }, []);

  function del(id:number) {
    if (!confirm("Löschen?")) return;
    setRows(prev => prev.filter(r => r.id!==id));
  }
  function addRow(row:Omit<InvestorDb,"id">) {
    setRows(prev=>[...prev,{...row,id:nextId.current++}]);
  }
  function importRows(newRows:Omit<InvestorDb,"id">[]) {
    setRows(prev=>[...prev,...newRows.map(r=>({...r,id:nextId.current++}))]);
  }

  const tabCount = (t:Tab) => t==="Alle" ? rows.length : rows.filter(r=>r.status===t).length;

  const filtered = useMemo(() => {
    let result = rows.filter(r => {
      if (tab!=="Alle" && r.status!==tab) return false;
      if (!search) return true;
      const q=search.toLowerCase();
      return (["name","unternehmen","email"] as ColKey[]).some(k=>(r[k]??"").toString().toLowerCase().includes(q));
    });

    if (sortCol) {
      result = [...result].sort((a,b) => {
        const va = (a[sortCol] ?? "").toString();
        const vb = (b[sortCol] ?? "").toString();
        const numA = parseFloat(va);
        const numB = parseFloat(vb);
        const isNum = !isNaN(numA) && !isNaN(numB);
        const cmp = isNum ? numA - numB : va.localeCompare(vb, "de");
        return sortDir==="asc" ? cmp : -cmp;
      });
    }
    return result;
  }, [rows, tab, search, sortCol, sortDir]);

  const totalPages  = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage    = Math.min(page, totalPages);
  const pageRows    = filtered.slice((safePage-1)*PAGE_SIZE, safePage*PAGE_SIZE);
  const nrOffset    = (safePage-1)*PAGE_SIZE;

  const th: React.CSSProperties = {
    padding:"0 8px", height:30, textAlign:"left", fontSize:10, fontWeight:700,
    color:"rgba(255,255,255,0.58)", fontFamily:T, letterSpacing:"0.06em",
    textTransform:"uppercase", whiteSpace:"nowrap", userSelect:"none",
    borderBottom:"1px solid rgba(255,255,255,0.1)",
  };
  const td: React.CSSProperties = {
    padding:"0 8px", height:34, verticalAlign:"middle",
    borderBottom:"1px solid rgba(255,255,255,0.04)", whiteSpace:"nowrap", overflow:"hidden",
  };

  function renderCell(row:InvestorDb, col:Col) {
    const key=col.key; const val=row[key];
    if (key==="status")  return <Badge label={val as string|null} map={STATUS_COLOR} />;
    if (key==="typ")     return <Badge label={val as string|null} map={TYP_COLOR} />;
    if (key==="quelle")  return <QuelleCell quelle={val as string|null} />;
    if (key==="score")   return <Stars n={val as number|null} />;
    if (key==="letzterKont") return <span style={{ fontSize:12, fontFamily:T, color:val?"rgba(255,255,255,0.6)":"rgba(255,255,255,0.2)" }}>{fmtDate(val as string|null)||"—"}</span>;
    if (key==="linkedin" && val) return (
      <a href={`https://${(val as string).replace(/^https?:\/\//,"")}`} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()} style={{ color:"rgba(255,255,255,0.45)", fontSize:11, display:"block" }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ verticalAlign:"middle" }}><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>
      </a>
    );
    return <span style={{ fontSize:12, fontFamily:T, color:val?"rgba(255,255,255,0.75)":"rgba(255,255,255,0.2)", display:"block", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{(val as string|null)??"—"}</span>;
  }

  return (
    <div
      style={{ display:"flex", flexDirection:"column", height:"100%", minHeight:0, background:"#0a0a0c", color:"#e4e4e7", position:"relative" }}
      onClick={()=>setActiveCell(null)}
    >
      {/* ── Header row ── */}
      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"0 14px", height:46, flexShrink:0, borderBottom:"1px solid rgba(255,255,255,0.07)" }} onClick={e=>e.stopPropagation()}>
        <span style={{ fontSize:13, fontWeight:800, color:"rgba(255,255,255,0.7)", fontFamily:T, flexShrink:0, letterSpacing:"0.01em" }}>Investor DB</span>
        <input
          style={{ width:150, flexShrink:0, background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:5, color:"#e4e4e7", fontSize:12, padding:"4px 9px", fontFamily:T, outline:"none" }}
          placeholder="Suche…" value={search} onChange={e=>{ setSearch(e.target.value); setPage(1); }}
        />
        <div style={{ flex:1, display:"flex", alignItems:"center", overflow:"hidden" }}>
          {[
            { label:"Gesamt",     value:String(rows.length) },
            { label:"Investoren", value:String(rows.filter(r=>r.status==="Investor").length) },
            { label:"Warm",       value:String(rows.filter(r=>["Geantwortet","Call"].includes(r.status)).length) },
            { label:"Gefiltert",  value:String(filtered.length) },
          ].map(k=>(
            <div key={k.label} style={{ display:"flex", alignItems:"baseline", gap:4, padding:"0 13px", borderLeft:"1px solid rgba(255,255,255,0.07)", flexShrink:0 }}>
              <span style={{ fontSize:9, fontWeight:700, color:"rgba(255,255,255,0.28)", fontFamily:T, letterSpacing:"0.07em", textTransform:"uppercase" }}>{k.label}</span>
              <span style={{ fontSize:14, fontWeight:800, color:"rgba(255,255,255,0.75)", fontFamily:T }}>{k.value}</span>
            </div>
          ))}
        </div>
        <div style={{ display:"flex", gap:6, flexShrink:0 }}>
          <button onClick={()=>setShowCsv(true)} style={{...btnSt,color:"rgba(255,255,255,0.5)"}}>
            <Upload size={11} strokeWidth={1.8} />CSV
          </button>
          <button onClick={()=>setShowAdd(true)} style={btnSt}>
            <MessageSquare size={11} strokeWidth={1.65} />+ Investor
          </button>
        </div>
      </div>

      {/* ── Filter tabs ── */}
      <div style={{ display:"flex", borderBottom:"1px solid rgba(255,255,255,0.07)", paddingLeft:14, flexShrink:0 }} onClick={e=>e.stopPropagation()}>
        {TABS.map(t => {
          const active = tab===t;
          return (
            <button key={t} onClick={()=>{ setTab(t); setPage(1); }} style={{
              background:"none", border:"none",
              borderBottom:active?"1.5px solid rgba(212,175,55,0.75)":"1.5px solid transparent",
              padding:"6px 12px", cursor:"pointer",
              color:active?"rgba(255,255,255,0.7)":"rgba(255,255,255,0.28)",
              fontSize:10, fontWeight:700, fontFamily:T, letterSpacing:"0.06em",
              textTransform:"uppercase", transition:"color 120ms, border-color 120ms",
              marginBottom:-1, display:"flex", alignItems:"center", gap:5,
            }}>
              {t} <span style={{ color:active?"rgba(255,255,255,0.35)":"rgba(255,255,255,0.15)", fontWeight:600 }}>{tabCount(t)}</span>
            </button>
          );
        })}
      </div>

      {/* ── Table ── */}
      <div style={{ flex:1, minHeight:0, overflowX:"auto", overflowY:"auto", position:"relative" }} onClick={e=>e.stopPropagation()}>
        <table style={{ width:"100%", borderCollapse:"collapse", minWidth:1300, tableLayout:"fixed" }}>
          <thead style={{ position:"sticky", top:0, zIndex:10, background:"#0a0a0c" }}>
            <tr>
              <th style={{...th, width:36, paddingLeft:14}}>#</th>
              {COLS.map(c => {
                const isSorted = sortCol===c.key;
                return (
                  <th key={c.key} style={{ ...th, width:c.w, cursor:c.sortable?"pointer":"default", background:isSorted?"rgba(255,255,255,0.025)":"transparent" }}
                    onClick={c.sortable ? ()=>handleSort(c.key) : undefined}>
                    <span style={{ display:"inline-flex", alignItems:"center", gap:3 }}>
                      {c.label}
                      {c.sortable && (
                        isSorted
                          ? <span style={{ color:"rgba(212,175,55,0.8)", fontSize:9, lineHeight:1 }}>{sortDir==="asc"?"▲":"▼"}</span>
                          : <span style={{ color:"rgba(255,255,255,0.2)", fontSize:9, lineHeight:1 }}>⇅</span>
                      )}
                    </span>
                  </th>
                );
              })}
              <th style={{...th, width:34}} />
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row,ri) => (
              <tr key={row.id} style={{ background:ri%2===0?"transparent":"rgba(255,255,255,0.013)" }}>
                <td style={{...td, width:36, paddingLeft:14}}>
                  <span style={{ fontSize:10, color:"rgba(255,255,255,0.35)", fontFamily:T, fontWeight:500 }}>{nrOffset+ri+1}</span>
                </td>
                {COLS.map(col => {
                  const cellId=`${row.id}:${col.key}`;
                  const isActive=activeCell===cellId;
                  return (
                    <td key={col.key} style={{ ...td, width:col.w, background:isActive?"rgba(255,255,255,0.06)":undefined, boxShadow:isActive?"inset 0 0 0 1px rgba(255,255,255,0.15)":undefined }}
                      onClick={e=>{ e.stopPropagation(); setActiveCell(cellId); }}>
                      {isActive ? (
                        <EditCell col={col.key} value={row[col.key]?.toString()??null}
                          onSave={v=>patch(row.id,col.key,v)} onClose={()=>setActiveCell(null)} />
                      ) : renderCell(row,col)}
                    </td>
                  );
                })}
                <td style={{...td, width:34}}>
                  <button onClick={e=>{ e.stopPropagation(); del(row.id); }} style={{ background:"none", border:"none", color:"rgba(239,68,68,0.3)", cursor:"pointer", fontSize:13, padding:"2px 4px" }} title="Löschen">✕</button>
                </td>
              </tr>
            ))}
            {pageRows.length===0 && (
              <tr><td colSpan={COLS.length+2} style={{...td,textAlign:"center",color:"rgba(255,255,255,0.18)",fontSize:11,fontFamily:T,letterSpacing:"0.05em",height:48}}>
                Keine Treffer
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ── */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:12, height:44, flexShrink:0, borderTop:"1px solid rgba(255,255,255,0.06)", background:"#0a0a0c" }} onClick={e=>e.stopPropagation()}>
        <button
          onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={safePage<=1}
          style={{ ...btnSt, padding:"4px 10px", opacity:safePage<=1?0.35:1 }}>
          <ChevronLeft size={12} strokeWidth={2} />Zurück
        </button>
        <span style={{ fontSize:11, color:"rgba(255,255,255,0.45)", fontFamily:T, minWidth:120, textAlign:"center" }}>
          Seite{" "}
          <span style={{ color:"rgba(212,175,55,0.9)", fontWeight:700 }}>{safePage}</span>
          {" "}von{" "}
          <span style={{ color:"rgba(212,175,55,0.9)", fontWeight:700 }}>{totalPages}</span>
          {"  ·  "}{filtered.length} Einträge
        </span>
        <button
          onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={safePage>=totalPages}
          style={{ ...btnSt, padding:"4px 10px", opacity:safePage>=totalPages?0.35:1 }}>
          Weiter<ChevronRight size={12} strokeWidth={2} />
        </button>
      </div>

      {showAdd && <AddModal onClose={()=>setShowAdd(false)} onAdd={addRow} />}
      {showCsv && <CsvModal onClose={()=>setShowCsv(false)} onImport={importRows} />}
    </div>
  );
}
