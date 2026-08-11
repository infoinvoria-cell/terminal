"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { MessageSquare, Upload } from "lucide-react";

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

// ── Deterministic 10 000-entry generator ──────────────────────────────────────

const firstNames = [
  "Thomas","Michael","Andreas","Stefan","Klaus","Markus","Jan","Peter","Christian","Daniel",
  "Sabine","Julia","Andrea","Lisa","Petra","Anna","Maria","Laura","Sandra","Claudia",
  "Hans","Wolfgang","Jürgen","Rainer","Bernd","Frank","Dirk","Sven","Oliver","Tobias",
  "Kai","Florian","Sebastian","Patrick","Matthias","Alexander","Benjamin","Philipp","Lukas","Nico",
  "Monika","Susanne","Birgit","Christine","Katharina","Elisabeth","Nicole","Stefanie","Anja","Heike",
  "Werner","Gerhard","Helmut","Heinrich","Dieter","Karl","Friedrich","Günter","Ernst","Josef",
];
const lastNames = [
  "Müller","Schmidt","Schneider","Fischer","Weber","Meyer","Wagner","Becker","Schulz","Hoffmann",
  "Koch","Richter","Klein","Wolf","Schröder","Neumann","Braun","Zimmermann","Hartmann","Krause",
  "Lehmann","Lange","Kramer","Huber","Maier","Walter","König","Werner","Peters","Schulze",
  "Roth","Köhler","Bauer","Frank","Haas","Schäfer","Herrmann","Kaiser","Fuchs","Lang",
  "Scholz","Vogel","Albrecht","Schwarz","Brandt","Winkler","Ludwig","Baumann","Keller","Möller",
  "Pfeiffer","Sommer","Gruber","Bergmann","Dietrich","Heinrich","Busch","Engel","Hahn","Schubert",
  "Lauer","Ziegler","Freund","Vogt","Berger","Krämer","Stein","Ernst","Jäger","Kühn",
];
const companyTypes = [
  "Capital GmbH","Holding AG","Ventures","Invest GmbH","Family Office",
  "Vermögensverwaltung","Beteiligungen GmbH","Unternehmensgruppe","Finanz GmbH",
  "Management GmbH","Consulting GmbH","Immobilien GmbH","Industrie AG","Beteiligungs AG",
  "Treuhand GmbH","Wirtschaftsberatung","Investmenthaus","Private Equity",
];
const tickets = ["25k–50k","25k–75k","50k–100k","50k–200k","100k–300k","100k–500k","250k–1M","500k+"];

const sourceWeights = [
  ...Array(50).fill("LinkedIn"),
  ...Array(20).fill("BaFin"),
  ...Array(15).fill("Bundesanzeiger"),
  ...Array(10).fill("BAND"),
  ...Array(5).fill("Manual"),
];

const typeWeights = [
  ...Array(35).fill("HNWI"),
  ...Array(25).fill("Unternehmer"),
  ...Array(20).fill("Angel"),
  ...Array(12).fill("Family Office"),
  ...Array(5).fill("VC"),
  ...Array(3).fill("Privat"),
];

const statusWeights = [
  ...Array(70).fill("Neu"),
  ...Array(15).fill("Kontaktiert"),
  ...Array(8).fill("Geantwortet"),
  ...Array(4).fill("Call"),
  ...Array(3).fill("Investor"),
];

const MOCK: InvestorDb[] = Array.from({ length: 10000 }, (_, i) => {
  const fIdx    = i % firstNames.length;
  const lIdx    = Math.floor(i / firstNames.length) % lastNames.length;
  const cIdx    = (i * 3 + Math.floor(i / lastNames.length)) % companyTypes.length;
  const firstName = firstNames[fIdx];
  const lastName  = lastNames[lIdx];
  const source    = sourceWeights[i % sourceWeights.length];
  const typ       = typeWeights[i % typeWeights.length];
  const status    = statusWeights[i % statusWeights.length];
  const score     = 60 + ((i * 13 + (i % 7) * 5) % 39);
  const ticket    = tickets[i % tickets.length];
  const base      = lastName.toLowerCase().replace(/[^a-z]/g, "");
  const sfx       = companyTypes[cIdx].split(" ")[0].toLowerCase().replace(/[^a-z]/g, "");
  const fn        = firstName.toLowerCase().replace(/[^a-z]/g, "");
  const ln        = lastName.toLowerCase().replace(/[^a-z]/g, "");

  return {
    id: i + 1,
    name: `${firstName} ${lastName}`,
    unternehmen: `${lastName} ${companyTypes[cIdx]}`,
    typ,
    email: `${fn[0]}.${ln}@${base}-${sfx}.de`,
    linkedin: source === "LinkedIn" ? `linkedin.com/in/${fn}${ln}${i > 999 ? i : ""}` : "",
    kapital: ticket,
    quelle: source,
    score,
    status,
    naechsterSchritt: null,
    letzterKont: null,
    notizen: "",
  };
});

// ── Options ────────────────────────────────────────────────────────────────────

const TYP_OPTS     = ["HNWI","Angel","Family Office","VC","Unternehmer","Privat"];
const QUELLE_OPTS  = ["BaFin","Bundesanzeiger","LinkedIn","BAND","Manual"];
const STATUS_OPTS  = ["Neu","Kontaktiert","Geantwortet","Call","Investor"];
const SCHRITT_OPTS = ["Erstkontakt senden","Erstgespräch anfragen","Follow-up","Call planen","NDA senden","Angebot senden","Onboarding","Research","Warten auf Antwort","Kein weiterer Schritt"];

// ── Colour palettes ───────────────────────────────────────────────────────────

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

const NEUTRAL_BADGE = {bg:"rgba(255,255,255,0.07)",text:"rgba(255,255,255,0.65)",border:"rgba(255,255,255,0.1)"};

// ── Quelle cell ───────────────────────────────────────────────────────────────

function QuelleCell({ quelle }: { quelle: string | null }) {
  if (!quelle) return null;
  if (quelle === "LinkedIn") {
    return (
      <img
        src="/logos/linkedin.jpg"
        alt="LinkedIn"
        title="LinkedIn"
        style={{ height:16, width:"auto", objectFit:"contain", display:"block", borderRadius:2 }}
      />
    );
  }
  return (
    <span style={{ display:"inline-block", padding:"2px 6px", borderRadius:4, fontSize:10, fontWeight:600, fontFamily:T, background:NEUTRAL_BADGE.bg, color:NEUTRAL_BADGE.text, border:`1px solid ${NEUTRAL_BADGE.border}`, whiteSpace:"nowrap" }}>
      {quelle}
    </span>
  );
}

// ── Badge ─────────────────────────────────────────────────────────────────────

const T = "var(--font-text)";

function Badge({ label, map }: { label:string|null; map:Record<string,{bg:string;text:string;border:string}> }) {
  if (!label) return null;
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
        <span key={i} style={{ color:i<=Math.round(v/20)?"#D4AF37":"rgba(255,255,255,0.15)", fontSize:11, lineHeight:1 }}>★</span>
      ))}
    </span>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

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

// ── Column definitions — only 10 visible columns ──────────────────────────────

type ColKey = keyof Omit<InvestorDb,"id">;
type Col = { key:ColKey; label:string; w:number; sortable?:boolean };

const COLS: Col[] = [
  { key:"name",        label:"NAME",        w:150, sortable:true },
  { key:"unternehmen", label:"UNTERNEHMEN", w:160, sortable:true },
  { key:"typ",         label:"TYP",         w:115, sortable:true },
  { key:"email",       label:"E-MAIL",      w:185 },
  { key:"linkedin",    label:"LINKEDIN",    w:85  },
  { key:"kapital",     label:"KAPITAL",     w:115, sortable:true },
  { key:"quelle",      label:"QUELLE",      w:130 },
  { key:"score",       label:"SCORE",       w:90,  sortable:true },
  { key:"status",      label:"STATUS",      w:115, sortable:true },
];

const TABS = ["Alle","Neu","Kontaktiert","Geantwortet","Call","Investor"] as const;
type Tab = typeof TABS[number];

const ROW_H = 34;

// ── Edit cell ─────────────────────────────────────────────────────────────────

function EditCell({ col, value, onSave, onClose }: { col:ColKey; value:string|null; onSave:(v:string|null)=>void; onClose:()=>void }) {
  const [draft, setDraft] = useState(value ?? "");
  const commit = (v:string) => { onSave(v.trim()||null); onClose(); };
  const dropOpts =
    col==="typ"    ? TYP_OPTS :
    col==="quelle" ? QUELLE_OPTS :
    col==="status" ? STATUS_OPTS :
    col==="naechsterSchritt" ? SCHRITT_OPTS : null;

  if (col==="score") return (
    <select autoFocus style={selSt} value={draft} onChange={e=>{ setDraft(e.target.value); commit(e.target.value); }} onBlur={()=>commit(draft)}>
      <option value="">—</option>
      {Array.from({length:39},(_,i)=>60+i).map(n=><option key={n} value={n}>{n}</option>)}
    </select>
  );
  if (dropOpts) return (
    <select autoFocus style={selSt} value={draft} onChange={e=>{ setDraft(e.target.value); commit(e.target.value); }} onBlur={()=>commit(draft)}>
      <option value="">—</option>
      {dropOpts.map(o=><option key={o}>{o}</option>)}
    </select>
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
  const [err, setErr] = useState<string|null>(null);
  const set = (k:keyof Omit<InvestorDb,"id">, v:string|null) => setForm(f=>({...f,[k]:v}));
  const lbl = (text:string) => (
    <label style={{ display:"block", fontSize:9, fontWeight:700, color:"rgba(255,255,255,0.28)", fontFamily:T, letterSpacing:"0.07em", textTransform:"uppercase" as const, marginBottom:4 }}>{text}</label>
  );

  function submit(e:React.FormEvent) {
    e.preventDefault();
    if (!form.name?.trim()) { setErr("Name ist Pflichtfeld"); return; }
    onAdd({ name:form.name.trim(), unternehmen:form.unternehmen??null, typ:form.typ??null, email:form.email??null, linkedin:form.linkedin??null, kapital:form.kapital??null, quelle:form.quelle??null, score:form.score??null, status:form.status??"Neu", naechsterSchritt:null, letzterKont:null, notizen:"" });
    onClose();
  }

  return (
    <div style={{ position:"fixed", inset:0, zIndex:2000, background:"rgba(0,0,0,0.6)", display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ background:"#0c0d10", border:"1px solid rgba(255,255,255,0.08)", borderRadius:8, width:"100%", maxWidth:560, maxHeight:"88vh", overflowY:"auto", padding:22 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
          <span style={{ fontSize:13, fontWeight:800, color:"rgba(255,255,255,0.7)", fontFamily:T }}>Investor hinzufügen</span>
          <button onClick={onClose} style={{ background:"none", border:"none", color:"rgba(255,255,255,0.35)", cursor:"pointer", fontSize:16, lineHeight:1 }}>✕</button>
        </div>
        <form onSubmit={submit}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            {([{k:"name" as const,label:"Name *"},{k:"unternehmen" as const,label:"Unternehmen"},{k:"email" as const,label:"E-Mail"},{k:"linkedin" as const,label:"LinkedIn URL"},{k:"kapital" as const,label:"Kapital"}] as {k:keyof Omit<InvestorDb,"id">;label:string}[]).map(({k,label})=>(
              <div key={k}>{lbl(label)}<input style={inp} value={(form[k] as string)??"" } onChange={e=>set(k,e.target.value||null)} /></div>
            ))}
            {([{k:"typ" as const,label:"Typ",opts:TYP_OPTS},{k:"quelle" as const,label:"Quelle",opts:QUELLE_OPTS},{k:"status" as const,label:"Status",opts:STATUS_OPTS}] as {k:keyof Omit<InvestorDb,"id">;label:string;opts:string[]}[]).map(({k,label,opts})=>(
              <div key={k}>{lbl(label)}<select style={inp} value={(form[k] as string)??"" } onChange={e=>set(k,e.target.value||null)}><option value="">—</option>{opts.map(o=><option key={o}>{o}</option>)}</select></div>
            ))}
            <div>{lbl("Score (60–98)")}<input style={inp} type="number" min={60} max={98} value={form.score?.toString()??"" } onChange={e=>set("score" as keyof Omit<InvestorDb,"id">,e.target.value||null)} /></div>
          </div>
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
      rows.push({ name:row.name, unternehmen:row.unternehmen??null, typ:row.typ??null, email:row.email??null, linkedin:row.linkedin??null, kapital:row.kapital??null, quelle:row.quelle??null, score:row.score?parseInt(row.score):null, status:row.status??"Neu", naechsterSchritt:null, letzterKont:null, notizen:"" });
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
        <p style={{ margin:"0 0 8px", fontSize:10, color:"rgba(255,255,255,0.3)", fontFamily:T }}>Spalten: name, unternehmen, typ, email, linkedin, kapital, quelle, score, status</p>
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
  const [sortCol, setSortCol]   = useState<ColKey>("score");
  const [sortDir, setSortDir]   = useState<"asc"|"desc">("desc");

  const handleSort = useCallback((col: ColKey) => {
    setSortCol(prev => {
      if (prev !== col) { setSortDir("asc"); }
      else { setSortDir(d => d === "asc" ? "desc" : "asc"); }
      return col;
    });
  }, []);

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

    result = [...result].sort((a,b) => {
      const va = a[sortCol];
      const vb = b[sortCol];
      const na = typeof va === "number" ? va : parseFloat(String(va ?? ""));
      const nb = typeof vb === "number" ? vb : parseFloat(String(vb ?? ""));
      const isNum = !isNaN(na) && !isNaN(nb);
      const cmp = isNum ? na - nb : String(va ?? "").localeCompare(String(vb ?? ""), "de");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return result;
  }, [rows, tab, search, sortCol, sortDir]);

  // ── Virtual scroll ──────────────────────────────────────────────────────────
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_H,
    overscan: 20,
  });
  const vItems = virtualizer.getVirtualItems();

  // ── Table column widths ─────────────────────────────────────────────────────
  const thS: React.CSSProperties = {
    padding:"0 8px", height:30, textAlign:"left", fontSize:10, fontWeight:700,
    color:"rgba(255,255,255,0.55)", fontFamily:T, letterSpacing:"0.07em",
    textTransform:"uppercase", whiteSpace:"nowrap", userSelect:"none",
    borderBottom:"1px solid rgba(255,255,255,0.1)",
  };
  const tdS: React.CSSProperties = {
    padding:"0 8px", height:ROW_H, verticalAlign:"middle",
    whiteSpace:"nowrap", overflow:"hidden",
  };

  function renderCell(row:InvestorDb, col:Col) {
    const key=col.key; const val=row[key];
    if (key==="status")  return <Badge label={val as string|null} map={STATUS_COLOR} />;
    if (key==="typ")     return <Badge label={val as string|null} map={TYP_COLOR} />;
    if (key==="quelle")  return <QuelleCell quelle={val as string|null} />;
    if (key==="score")   return (
      <span style={{ fontSize:11, color:"rgba(255,255,255,0.65)", fontFamily:T, fontWeight:600 }}>{val as number|null ?? ""}</span>
    );
    if (key==="linkedin" && val) return (
      <a href={`https://${(val as string).replace(/^https?:\/\//,"")}`} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()} style={{ color:"rgba(255,255,255,0.4)", fontSize:11, display:"block" }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="#0A66C2" style={{ verticalAlign:"middle" }}><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12" fill="#0A66C2"/><circle cx="4" cy="4" r="2" fill="#0A66C2"/></svg>
      </a>
    );
    if (!val) return null;
    return <span style={{ fontSize:12, fontFamily:T, color:"rgba(255,255,255,0.72)", display:"block", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{val as string}</span>;
  }

  const totalW = 36 + COLS.reduce((s,c)=>s+c.w,0) + 34;

  return (
    <div
      style={{ display:"flex", flexDirection:"column", height:"100%", minHeight:0, background:"#0a0a0c", color:"#e4e4e7", position:"relative" }}
      onClick={()=>setActiveCell(null)}
    >
      {/* ── Header ── */}
      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"0 14px", height:46, flexShrink:0, borderBottom:"1px solid rgba(255,255,255,0.07)" }} onClick={e=>e.stopPropagation()}>
        <span style={{ fontSize:13, fontWeight:800, color:"rgba(255,255,255,0.7)", fontFamily:T, flexShrink:0, letterSpacing:"0.01em" }}>Investor DB</span>
        <input
          style={{ width:160, flexShrink:0, background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:5, color:"#e4e4e7", fontSize:12, padding:"4px 9px", fontFamily:T, outline:"none" }}
          placeholder="Suche Name, Firma, E-Mail…" value={search} onChange={e=>setSearch(e.target.value)}
        />
        <div style={{ flex:1, display:"flex", alignItems:"center", overflow:"hidden" }}>
          {[
            { label:"Gesamt",    value:String(rows.length) },
            { label:"Investoren",value:String(rows.filter(r=>r.status==="Investor").length) },
            { label:"Warm",      value:String(rows.filter(r=>["Geantwortet","Call"].includes(r.status)).length) },
            { label:"Gefiltert", value:String(filtered.length) },
          ].map(k=>(
            <div key={k.label} style={{ display:"flex", alignItems:"baseline", gap:4, padding:"0 13px", borderLeft:"1px solid rgba(255,255,255,0.07)", flexShrink:0 }}>
              <span style={{ fontSize:9, fontWeight:700, color:"rgba(255,255,255,0.28)", fontFamily:T, letterSpacing:"0.07em", textTransform:"uppercase" }}>{k.label}</span>
              <span style={{ fontSize:14, fontWeight:800, color:"rgba(255,255,255,0.72)", fontFamily:T }}>{k.value}</span>
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

      {/* ── Tabs ── */}
      <div style={{ display:"flex", borderBottom:"1px solid rgba(255,255,255,0.07)", paddingLeft:14, flexShrink:0 }} onClick={e=>e.stopPropagation()}>
        {TABS.map(t => {
          const active = tab===t;
          return (
            <button key={t} onClick={()=>setTab(t)} style={{
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

      {/* ── Scrollable table wrapper ── */}
      <div
        ref={parentRef}
        style={{ flex:1, minHeight:0, overflow:"auto", scrollbarWidth:"thin", scrollbarColor:"rgba(212,175,55,0.3) transparent" }}
        onClick={e=>e.stopPropagation()}
      >
        <style>{`
          .inv-scroll::-webkit-scrollbar{width:4px;height:4px}
          .inv-scroll::-webkit-scrollbar-track{background:transparent}
          .inv-scroll::-webkit-scrollbar-thumb{background:rgba(212,175,55,0.3);border-radius:2px}
        `}</style>

        {/* Sticky column header */}
        <div style={{ position:"sticky", top:0, zIndex:10, background:"#0a0a0c", minWidth:totalW }}>
          <div style={{ display:"flex", alignItems:"center", borderBottom:"1px solid rgba(255,255,255,0.1)" }}>
            <div style={{ ...thS, width:36, paddingLeft:14, flexShrink:0 }}>#</div>
            {COLS.map(c => {
              const isSorted = sortCol===c.key;
              return (
                <div key={c.key} style={{ ...thS, width:c.w, flexShrink:0, cursor:c.sortable?"pointer":"default", background:isSorted?"rgba(255,255,255,0.02)":"transparent" }}
                  onClick={c.sortable?()=>handleSort(c.key):undefined}>
                  <span style={{ display:"inline-flex", alignItems:"center", gap:3 }}>
                    {c.label}
                    {c.sortable && (
                      isSorted
                        ? <span style={{ color:"rgba(212,175,55,0.8)", fontSize:9 }}>{sortDir==="asc"?"▲":"▼"}</span>
                        : <span style={{ color:"rgba(255,255,255,0.18)", fontSize:9 }}>⇅</span>
                    )}
                  </span>
                </div>
              );
            })}
            <div style={{ ...thS, width:34, flexShrink:0 }} />
          </div>
        </div>

        {/* Virtual rows */}
        <div style={{ height:virtualizer.getTotalSize(), position:"relative", minWidth:totalW }}>
          {vItems.map(vRow => {
            const row = filtered[vRow.index];
            const ri  = vRow.index;
            return (
              <div
                key={vRow.key}
                style={{
                  position:"absolute", top:0, left:0, width:"100%",
                  transform:`translateY(${vRow.start}px)`,
                  height:ROW_H, display:"flex", alignItems:"center",
                  background:ri%2===0?"transparent":"rgba(255,255,255,0.012)",
                  borderBottom:"1px solid rgba(255,255,255,0.035)",
                }}
              >
                {/* # */}
                <div style={{ ...tdS, width:36, paddingLeft:14, flexShrink:0 }}>
                  <span style={{ fontSize:10, color:"rgba(255,255,255,0.28)", fontFamily:T }}>{ri+1}</span>
                </div>
                {/* Columns */}
                {COLS.map(col => {
                  const cellId=`${row.id}:${col.key}`;
                  const isActive=activeCell===cellId;
                  return (
                    <div key={col.key}
                      style={{ ...tdS, width:col.w, flexShrink:0, background:isActive?"rgba(255,255,255,0.06)":undefined, boxShadow:isActive?"inset 0 0 0 1px rgba(255,255,255,0.15)":undefined }}
                      onClick={e=>{ e.stopPropagation(); setActiveCell(cellId); }}>
                      {isActive ? (
                        <EditCell col={col.key} value={row[col.key]?.toString()??null}
                          onSave={v=>patch(row.id,col.key,v)} onClose={()=>setActiveCell(null)} />
                      ) : renderCell(row,col)}
                    </div>
                  );
                })}
                {/* Delete */}
                <div style={{ ...tdS, width:34, flexShrink:0 }}>
                  <button onClick={e=>{ e.stopPropagation(); del(row.id); }} style={{ background:"none", border:"none", color:"rgba(239,68,68,0.28)", cursor:"pointer", fontSize:13, padding:"2px 4px" }} title="Löschen">✕</button>
                </div>
              </div>
            );
          })}
          {filtered.length===0 && (
            <div style={{ position:"absolute", top:0, left:0, right:0, display:"flex", alignItems:"center", justifyContent:"center", height:60, color:"rgba(255,255,255,0.18)", fontSize:11, fontFamily:T, letterSpacing:"0.05em" }}>
              Keine Treffer
            </div>
          )}
        </div>
      </div>

      {showAdd && <AddModal onClose={()=>setShowAdd(false)} onAdd={addRow} />}
      {showCsv && <CsvModal onClose={()=>setShowCsv(false)} onImport={importRows} />}
    </div>
  );
}
