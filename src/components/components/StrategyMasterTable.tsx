"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import {
  WS_STRATEGIES, PILLAR_META, type StrategyRow, type Pillar,
  CI_STRATEGIES, CI_META, type CoreInvestRow, type CIPillar,
} from "@/lib/components/ws-strategy-data";

// ── design tokens ─────────────────────────────────────────────────────────────
const GOLD  = "#e2ca7a";
const MUTED = "#737373";
const DIM   = "#3a3a3a";
const RED   = "#c0392b";
const BG    = "#0c0d10";
const CARD  = "linear-gradient(180deg,#1c1d20 0%,#141517 100%)";
const CBORD = "rgba(255,255,255,0.06)";
const RBORD = "rgba(255,255,255,0.04)";

// ── portfolio config ──────────────────────────────────────────────────────────
type Portfolio = "ws" | "ci";
type WSSection = "all" | "active" | Pillar;
type CISection = "all" | CIPillar;

const WS_KPIS = [
  { label: "Sharpe OOS",   value: "1.526" },
  { label: "CAGR OOS",     value: "+8.36%" },
  { label: "Max DD",       value: "−8.71%" },
  { label: "Calmar",       value: "0.78" },
  { label: "Komponenten",  value: "25" },
];
const CI_KPIS = [
  { label: "Sharpe OOS",  value: "1.152" },
  { label: "CAGR OOS",    value: "+17.11%" },
  { label: "Max DD",      value: "−21.7%" },
  { label: "Calmar",      value: "0.787" },
  { label: "Positionen",  value: "8" },
];

// ── unified display row ───────────────────────────────────────────────────────
interface DisplayRow {
  id: string; section: Portfolio;
  ticker: string; label: string; group: string; engine: string;
  pillarKey: string; pillarLabel: string;
  weight: number | null; sharpeOos: number | null;
  cagr: string | null; maxDd: string | null;
  pf: number | null; trades: number | null;
  wfWin: string | null; calmar: number | null;
  status: string;
  dataFile?: string; isNotes?: string; exchange?: string;
}

function wsRow(r: StrategyRow): DisplayRow {
  return {
    id: r.id, section: "ws",
    ticker: r.ticker, label: r.label, group: r.group, engine: r.engine,
    pillarKey: r.pillar, pillarLabel: PILLAR_META[r.pillar].label,
    weight: r.weight, sharpeOos: r.sharpeOos,
    cagr: r.cagr, maxDd: r.maxDd, pf: r.pf, trades: r.trades,
    wfWin: r.wfOos, calmar: r.calmar, status: r.status,
    dataFile: r.dataFile, isNotes: r.isNotes, exchange: r.exchange,
  };
}
function ciRow(r: CoreInvestRow): DisplayRow {
  return {
    id: r.id, section: "ci",
    ticker: r.ticker, label: r.label, group: r.group, engine: r.engine,
    pillarKey: r.pillar, pillarLabel: CI_META[r.pillar as CIPillar].label,
    weight: r.weight, sharpeOos: null,
    cagr: r.totalReturn ?? null, maxDd: r.maxDd, pf: r.pf, trades: r.trades,
    wfWin: r.winRate, calmar: null, status: r.status,
    isNotes: r.notes,
  };
}

const WS_ROWS = WS_STRATEGIES.map(wsRow);
const CI_ROWS = CI_STRATEGIES.map(ciRow);

// ── data types for JSON ───────────────────────────────────────────────────────
interface EP { time: string; value: number; }
interface Trade { entry_time: string; exit_time: string; entry_price: number; exit_price: number; pnl: number; }
interface OhlcBar { time: string; open: number; high: number; low: number; close: number; }
interface StrategyData {
  summary: { oos: { sharpe: number; cagr: number; maxDrawdownPercent: number; profitFactor: number; tradeCount: number; winRate: number; finalEquity: number; } };
  equityCurve: { oos: EP[] }; drawdownCurve: { oos: EP[] }; trades?: Trade[];
}

// ── helpers ───────────────────────────────────────────────────────────────────
function fmtN(v: number | null, d = 2) { return v === null ? "—" : v.toFixed(d); }

function valColor(s: string | null): string {
  if (!s) return "rgba(255,255,255,0.55)";
  if (s.startsWith("+")) return "#fff";
  if (s.startsWith("−") || s.startsWith("-")) return RED;
  return "rgba(255,255,255,0.8)";
}

// ── SwanIcon ──────────────────────────────────────────────────────────────────
function SwanIcon({ size = 14 }: { size?: number }) {
  return <img src="/branding/white-swan-logo.png" alt="WS" width={size} height={size} style={{ width: size, height: size, objectFit: "contain" }} />;
}

// ── header KPI card (compact, no subtitle) ────────────────────────────────────
function HKpi({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${CBORD}`, borderRadius: 14, padding: "10px 16px", textAlign: "center" as const, boxShadow: "0 8px 24px -10px rgba(0,0,0,0.6)", minWidth: 90 }}>
      <div style={{ fontFamily: "var(--font-montserrat),sans-serif", fontSize: 10, fontWeight: 500, color: MUTED, letterSpacing: ".07em", textTransform: "uppercase" as const, marginBottom: 5 }}>{label}</div>
      <div style={{ fontFamily: "var(--font-montserrat),sans-serif", fontSize: 20, fontWeight: 700, letterSpacing: "-.02em", color: "#fff" }}>{value}</div>
    </div>
  );
}

// ── expand KPI card (white positive, gold negative) ───────────────────────────
function EKpi({ label, value }: { label: string; value: string }) {
  const isNeg = value.startsWith("−") || value.startsWith("-");
  const color = isNeg ? GOLD : "#fff";
  return (
    <div style={{ background: CARD, border: `1px solid ${CBORD}`, borderRadius: 12, padding: "10px 14px", minWidth: 88, flex: 1 }}>
      <div style={{ fontFamily: "var(--font-montserrat),sans-serif", fontSize: 10, fontWeight: 500, color: MUTED, letterSpacing: ".06em", textTransform: "uppercase" as const, marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: "var(--font-montserrat),sans-serif", fontSize: 17, fontWeight: 700, letterSpacing: "-.02em", color }}>{value}</div>
    </div>
  );
}

// ── candlestick ───────────────────────────────────────────────────────────────
function CandleChart({ ticker, trades }: { ticker: string; trades: Trade[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [bars, setBars] = useState<OhlcBar[] | null>(null);
  useEffect(() => {
    const sym = encodeURIComponent(ticker.split(" ")[0]);
    fetch(`/api/monitoring/ohlc?symbol=${sym}&timeframe=1D`)
      .then(r => r.json()).then(d => setBars(Array.isArray(d.bars) && d.bars.length ? d.bars : []))
      .catch(() => setBars([]));
  }, [ticker]);
  useEffect(() => {
    if (!ref.current || !bars || !bars.length) return;
    let inst: { remove: () => void } | null = null;
    import("lightweight-charts").then(({ createChart, CandlestickSeries, createSeriesMarkers }) => {
      if (!ref.current) return;
      const el = ref.current;
      const chart = createChart(el, {
        width: el.clientWidth, height: 220,
        layout: { background: { color: "transparent" }, textColor: MUTED },
        grid: { vertLines: { color: "rgba(255,255,255,0.03)" }, horzLines: { color: "rgba(255,255,255,0.03)" } },
        rightPriceScale: { borderColor: "rgba(255,255,255,0.07)" },
        timeScale: { borderColor: "rgba(255,255,255,0.07)", timeVisible: false },
      });
      inst = chart;
      const series = chart.addSeries(CandlestickSeries, {
        upColor: GOLD, downColor: RED, borderUpColor: GOLD, borderDownColor: RED, wickUpColor: GOLD, wickDownColor: RED,
      });
      series.setData(bars.filter(b => b.time >= "2019-01-01"));
      const seen = new Set<string>();
      const mkrs: Array<{ time: string; position: "belowBar"|"aboveBar"; color: string; shape: "arrowUp"|"arrowDown"; text: string }> = [];
      for (const t of trades) {
        const et = t.entry_time?.slice(0,10);
        if (et && et >= "2019-01-01" && !seen.has(`e${et}`)) { seen.add(`e${et}`); mkrs.push({ time: et, position: "belowBar", color: "rgba(255,255,255,0.4)", shape: "arrowUp", text: "" }); }
        const xt = t.exit_time?.slice(0,10);
        if (xt && xt >= "2019-01-01" && !seen.has(`x${xt}`)) { seen.add(`x${xt}`); mkrs.push({ time: xt, position: "aboveBar", color: t.pnl > 0 ? GOLD : RED, shape: "arrowDown", text: "" }); }
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (typeof createSeriesMarkers === "function") (createSeriesMarkers as any)(series, mkrs.sort((a,b) => a.time.localeCompare(b.time)));
      chart.timeScale().fitContent();
    });
    return () => { inst?.remove(); };
  }, [bars, trades]);
  if (bars === null) return <div style={{ height: 40, display: "flex", alignItems: "center", fontSize: 11, color: DIM, fontFamily: "var(--font-montserrat),sans-serif" }}>Lade Chart…</div>;
  if (!bars.length) return null;
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 10, color: MUTED, fontFamily: "var(--font-montserrat),sans-serif", letterSpacing: ".07em", textTransform: "uppercase" as const, marginBottom: 6 }}>OHLC 2019 – 2026 · Entry / Exit</div>
      <div ref={ref} style={{ borderRadius: 8, overflow: "hidden" }} />
    </div>
  );
}

// ── equity / DD charts ────────────────────────────────────────────────────────
function EqChart({ pts, label }: { pts: EP[]; label: string }) {
  const step = Math.max(1, Math.floor(pts.length / 120));
  const d = pts.filter((_,i) => i % step === 0 || i === pts.length-1).map(p => ({ t: p.time.slice(0,7), v: Math.round(p.value) }));
  return (
    <div>
      <div style={{ fontSize: 10, color: MUTED, fontFamily: "var(--font-montserrat),sans-serif", letterSpacing: ".07em", textTransform: "uppercase" as const, marginBottom: 6 }}>{label}</div>
      <ResponsiveContainer width="100%" height={110}>
        <AreaChart data={d} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <defs><linearGradient id="eqg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#fff" stopOpacity={0.12}/><stop offset="95%" stopColor="#fff" stopOpacity={0.01}/></linearGradient></defs>
          <XAxis dataKey="t" hide /><YAxis hide domain={["auto","auto"]} />
          <Tooltip contentStyle={{ background: "#1c1d20", border: `1px solid ${CBORD}`, borderRadius: 8, fontSize: 11, fontFamily: "var(--font-montserrat),sans-serif", color: "#fff" }}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={(v: any) => [`$${Number(v??0).toLocaleString("de",{maximumFractionDigits:0})}`, "Equity"]} />
          <Area type="monotone" dataKey="v" stroke="#fff" strokeWidth={1.5} strokeOpacity={0.6} fill="url(#eqg)" dot={false}/>
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function DdChart({ pts }: { pts: EP[] }) {
  const step = Math.max(1, Math.floor(pts.length / 120));
  const d = pts.filter((_,i) => i % step === 0 || i === pts.length-1).map(p => ({ t: p.time.slice(0,7), v: Math.round(p.value*100)/100 }));
  return (
    <div>
      <div style={{ fontSize: 10, color: MUTED, fontFamily: "var(--font-montserrat),sans-serif", letterSpacing: ".07em", textTransform: "uppercase" as const, marginBottom: 6 }}>Drawdown OOS</div>
      <ResponsiveContainer width="100%" height={80}>
        <AreaChart data={d} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <defs><linearGradient id="ddg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={RED} stopOpacity={0.3}/><stop offset="95%" stopColor={RED} stopOpacity={0.02}/></linearGradient></defs>
          <XAxis dataKey="t" hide /><YAxis hide />
          <Tooltip contentStyle={{ background: "#1c1d20", border: `1px solid ${CBORD}`, borderRadius: 8, fontSize: 11, fontFamily: "var(--font-montserrat),sans-serif", color: "#fff" }}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={(v: any) => [`${Number(v??0).toFixed(2)}%`, "DD"]} />
          <Area type="monotone" dataKey="v" stroke={RED} strokeWidth={1.5} fill="url(#ddg)" dot={false}/>
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── expanded row ──────────────────────────────────────────────────────────────
function ExpandedRow({ row }: { row: DisplayRow }) {
  const [data, setData] = useState<StrategyData | null>(null);
  useEffect(() => {
    if (!row.dataFile) return;
    fetch(`/data/${row.dataFile}`).then(r => r.json()).then(setData).catch(() => {});
  }, [row.dataFile]);

  const trades = data?.trades ?? [];
  const eqOos  = data?.equityCurve?.oos;
  const ddOos  = data?.drawdownCurve?.oos;
  const oos    = data?.summary?.oos;

  const kpis: Array<{ label: string; value: string }> = [];
  if (row.sharpeOos !== null) kpis.push({ label: "Sharpe OOS", value: fmtN(row.sharpeOos) });
  if (oos?.cagr != null) kpis.push({ label: "CAGR OOS", value: `${oos.cagr > 0 ? "+" : ""}${oos.cagr.toFixed(2)}%` });
  else if (row.cagr) kpis.push({ label: row.section === "ci" ? "Total Return" : "CAGR", value: row.cagr });
  if (oos?.maxDrawdownPercent != null) kpis.push({ label: "Max DD", value: `${oos.maxDrawdownPercent.toFixed(2)}%` });
  else if (row.maxDd) kpis.push({ label: "Max DD", value: row.maxDd });
  if (row.pf != null) kpis.push({ label: "Profit Factor", value: fmtN(row.pf) });
  if (row.trades != null) kpis.push({ label: "Trades", value: String(row.trades) });
  if (row.wfWin) kpis.push({ label: row.section === "ci" ? "Win Rate" : "WF / OOS", value: row.wfWin });
  if (row.calmar != null) kpis.push({ label: "Calmar", value: fmtN(row.calmar) });

  return (
    <div style={{ padding: "18px 20px 22px", background: "rgba(255,255,255,0.015)", borderTop: `1px solid ${RBORD}` }}>
      {/* meta */}
      <div style={{ fontFamily: "var(--font-montserrat),sans-serif", fontSize: 11, color: MUTED, marginBottom: 14 }}>
        {[row.engine, row.exchange, row.group].filter(Boolean).join(" · ")}
      </div>
      {row.isNotes && (
        <div style={{ fontFamily: "var(--font-montserrat),sans-serif", fontSize: 11, color: GOLD, background: "rgba(226,202,122,0.05)", border: `1px solid rgba(226,202,122,0.12)`, borderRadius: 8, padding: "7px 11px", marginBottom: 14 }}>
          {row.isNotes}
        </div>
      )}
      {/* KPI cards */}
      {kpis.length > 0 && (
        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" as const }}>
          {kpis.map(k => <EKpi key={k.label} label={k.label} value={k.value} />)}
        </div>
      )}
      {/* charts */}
      {trades.length > 0 && <CandleChart ticker={row.ticker} trades={trades} />}
      {eqOos && eqOos.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: 20 }}>
          <EqChart pts={eqOos} label={`Equity OOS${oos?.cagr != null ? ` · +${oos.cagr.toFixed(2)}% CAGR` : ""}`} />
          {ddOos && ddOos.length > 0 && <DdChart pts={ddOos} />}
        </div>
      )}
      {!row.dataFile && row.section === "ws" && (
        <div style={{ fontFamily: "var(--font-montserrat),sans-serif", fontSize: 11, color: DIM, paddingTop: 4 }}>
          Keine Equity-Datei — Strategie im Portfolio-Kontext berechnet.
        </div>
      )}
    </div>
  );
}

// ── status chip ───────────────────────────────────────────────────────────────
function Chip({ status }: { status: string }) {
  const cfg: Record<string, { label: string; c: string }> = {
    active:         { label: "Aktiv",       c: "rgba(255,255,255,0.6)" },
    watch:          { label: "Watch",       c: GOLD },
    archived:       { label: "Archived",    c: DIM },
    research:       { label: "Research",    c: "rgba(255,255,255,0.35)" },
    validation:     { label: "Validation",  c: "rgba(255,255,255,0.5)" },
    parity_pending: { label: "Pending",     c: GOLD },
  };
  const s = cfg[status] ?? { label: status, c: DIM };
  return (
    <span style={{ fontFamily: "var(--font-montserrat),sans-serif", fontSize: 10, fontWeight: 600, color: s.c, letterSpacing: ".04em", display: "inline-flex", alignItems: "center", gap: 4 }}>
      <span style={{ width: 4, height: 4, borderRadius: "50%", background: s.c, flexShrink: 0 }} />
      {s.label}
    </span>
  );
}

// ── section filter button ─────────────────────────────────────────────────────
function SectionBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      fontFamily: "var(--font-montserrat),sans-serif",
      fontSize: 10, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase" as const,
      padding: "4px 12px", borderRadius: 20, cursor: "pointer",
      background: active ? "rgba(255,255,255,0.07)" : "transparent",
      border: active ? `1px solid rgba(255,255,255,0.18)` : `1px solid ${RBORD}`,
      color: active ? "#fff" : MUTED,
      transition: "all .12s",
    }}>{label}</button>
  );
}

// ── main ──────────────────────────────────────────────────────────────────────
export default function StrategyMasterTable() {
  const [portfolio, setPortfolio] = useState<Portfolio>("ws");
  const [section, setSection]     = useState<string>("all");
  const [expandedId, setExpId]    = useState<string | null>(null);
  const [sortKey, setSortKey]     = useState<"sharpeOos"|"weight"|"cagr"|null>(null);
  const [sortDir, setSortDir]     = useState<"desc"|"asc">("desc");

  // reset section when switching portfolio
  const switchPortfolio = useCallback((p: Portfolio) => {
    setPortfolio(p);
    setSection("all");
    setExpId(null);
    setSortKey(null);
  }, []);

  const toggleSort = useCallback((key: "sharpeOos"|"weight"|"cagr") => {
    setSortKey(prev => {
      if (prev === key) { setSortDir(d => d === "desc" ? "asc" : "desc"); return key; }
      setSortDir("desc"); return key;
    });
  }, []);

  const toggle = useCallback((id: string) => setExpId(prev => prev === id ? null : id), []);

  // --- build rows ---
  const baseRows: DisplayRow[] = portfolio === "ws" ? WS_ROWS : CI_ROWS;

  let rows = baseRows;
  if (section === "active") {
    rows = rows.filter(r => r.status !== "archived");
  } else if (section !== "all") {
    rows = rows.filter(r => r.pillarKey === section);
  }

  // auto-sort in "all" mode: data-rich first, then by sharpe
  const autoSort = section === "all" && !sortKey;
  if (autoSort) {
    rows = [...rows].sort((a, b) => {
      const aHas = (a.sharpeOos !== null || a.dataFile) ? 1 : 0;
      const bHas = (b.sharpeOos !== null || b.dataFile) ? 1 : 0;
      if (aHas !== bHas) return bHas - aHas;
      return (b.sharpeOos ?? -99) - (a.sharpeOos ?? -99);
    });
  } else if (sortKey) {
    rows = [...rows].sort((a, b) => {
      let va: number, vb: number;
      if (sortKey === "sharpeOos")  { va = a.sharpeOos ?? -Infinity; vb = b.sharpeOos ?? -Infinity; }
      else if (sortKey === "weight"){ va = a.weight ?? -Infinity;     vb = b.weight ?? -Infinity; }
      else { va = parseFloat((a.cagr??"").replace(/[^0-9.-]/g,"")) || -Infinity; vb = parseFloat((b.cagr??"").replace(/[^0-9.-]/g,"")) || -Infinity; }
      return sortDir === "desc" ? vb - va : va - vb;
    });
  }

  // section filter buttons
  const wsSections: Array<{ key: string; label: string }> = [
    { key: "all",       label: "Alle" },
    { key: "active",    label: "Nur Aktive" },
    { key: "valuation", label: "Valuation" },
    { key: "macro",     label: "Macro" },
    { key: "trend",     label: "Trend" },
    { key: "seasonal",  label: "Seasonal" },
    { key: "anomaly",   label: "Anomaly" },
    { key: "intraday",  label: "Intraday" },
  ];
  const ciSections: Array<{ key: string; label: string }> = [
    { key: "all",       label: "Alle" },
    { key: "etf_core",  label: "ETF-Core" },
    { key: "ci_sleeve", label: "Strategy Sleeve" },
  ];
  const sections = portfolio === "ws" ? wsSections : ciSections;
  const kpis = portfolio === "ws" ? WS_KPIS : CI_KPIS;

  const th: React.CSSProperties = {
    fontFamily: "var(--font-montserrat),sans-serif",
    fontSize: 10, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase",
    color: MUTED, padding: "0 10px 10px", textAlign: "left", whiteSpace: "nowrap",
    borderBottom: `1px solid ${RBORD}`, background: BG, userSelect: "none",
  };
  const thR: React.CSSProperties = { ...th, textAlign: "right" };
  const si = (k: typeof sortKey) => sortKey === k ? (sortDir === "desc" ? " ↓" : " ↑") : "";

  let rowNum = 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", padding: "18px 24px 0", background: BG, fontFamily: "var(--font-montserrat),sans-serif" }}>

      {/* ── top bar: title left, portfolio switcher right ─── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexShrink: 0 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#fff", letterSpacing: "-.02em", margin: 0 }}>Komponenten</h1>
        <div style={{ display: "flex", gap: 6 }}>
          {([
            { id: "ws" as Portfolio, label: "White Swan",  icon: <SwanIcon size={14} /> },
            { id: "ci" as Portfolio, label: "Core Invest", icon: <TrendingUp size={14} strokeWidth={1.8} /> },
          ]).map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => switchPortfolio(item.id)}
              className={cn(
                "flex items-center gap-2 rounded-full border px-4 py-2 text-[13px] font-semibold transition-colors [font-family:var(--font-montserrat),sans-serif]",
                portfolio === item.id
                  ? "border-white/40 bg-white/[0.06] text-white"
                  : "border-transparent text-zinc-500 hover:border-white/[0.08] hover:text-zinc-300",
              )}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── KPI cards (centered, compact) ────────────────── */}
      <div style={{ display: "flex", gap: 10, justifyContent: "center", marginBottom: 16, flexShrink: 0 }}>
        {kpis.map(k => <HKpi key={k.label} label={k.label} value={k.value} />)}
      </div>

      {/* ── section filter bar ────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12, flexShrink: 0, flexWrap: "wrap" as const }}>
        {sections.map(s => (
          <SectionBtn key={s.key} label={s.label} active={section === s.key} onClick={() => { setSection(s.key); setExpId(null); setSortKey(null); }} />
        ))}
        {sortKey && (
          <button onClick={() => setSortKey(null)} style={{ marginLeft: "auto", fontFamily: "var(--font-montserrat),sans-serif", fontSize: 10, color: MUTED, background: "transparent", border: `1px solid ${RBORD}`, borderRadius: 20, padding: "4px 10px", cursor: "pointer" }}>
            ✕ Sort
          </button>
        )}
      </div>

      {/* ── table wrapper (relative for gradient overlay) ─── */}
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        {/* invisible scrollbar */}
        <style>{`
          .kmp-scroll::-webkit-scrollbar { display: none; }
          .kmp-scroll { scrollbar-width: none; -ms-overflow-style: none; }
        `}</style>

        <div className="kmp-scroll" style={{ height: "100%", overflowY: "auto", borderRadius: "10px 10px 0 0", border: `1px solid ${RBORD}`, borderBottom: "none" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead style={{ position: "sticky", top: 0, zIndex: 2 }}>
              <tr>
                <th style={{ ...th, width: 32, textAlign: "right" as const }}>#</th>
                <th style={{ ...th, width: 26 }} />
                <th style={th}>Ticker</th>
                <th style={th}>Asset</th>
                <th style={th}>{portfolio === "ws" ? "Pillar" : "Typ"}</th>
                <th style={{ ...thR, cursor: "pointer" }} onClick={() => toggleSort("weight")}>Gew.{si("weight")}</th>
                <th style={{ ...thR, cursor: "pointer" }} onClick={() => toggleSort("sharpeOos")}>Sharpe{si("sharpeOos")}</th>
                <th style={{ ...thR, cursor: "pointer" }} onClick={() => toggleSort("cagr")}>CAGR{si("cagr")}</th>
                <th style={thR}>Max DD</th>
                <th style={thR}>PF</th>
                <th style={thR}>Trades</th>
                <th style={thR}>WF / Win%</th>
                <th style={th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const isArchived = row.status === "archived";
                const isExp = expandedId === row.id;
                if (!isArchived) rowNum++;

                const dataRow = (
                  <tr
                    key={row.id}
                    onClick={() => !isArchived && toggle(row.id)}
                    style={{
                      opacity: isArchived ? 0.28 : 1,
                      cursor: isArchived ? "default" : "pointer",
                      borderBottom: `1px solid ${RBORD}`,
                      background: isExp ? "rgba(255,255,255,0.025)" : "transparent",
                      transition: "background .1s",
                    }}
                    onMouseEnter={e => { if (!isArchived && !isExp) (e.currentTarget as HTMLTableRowElement).style.background = "rgba(255,255,255,0.018)"; }}
                    onMouseLeave={e => { if (!isExp) (e.currentTarget as HTMLTableRowElement).style.background = "transparent"; }}
                  >
                    <td style={{ padding: "7px 10px", textAlign: "right" as const, fontFamily: "var(--font-montserrat),sans-serif", fontSize: 10, color: DIM, width: 32 }}>
                      {isArchived ? "" : rowNum}
                    </td>
                    <td style={{ padding: "7px 6px", width: 26, textAlign: "center" as const }}>
                      {!isArchived && (
                        <span style={{ fontSize: 11, color: isExp ? "rgba(255,255,255,0.6)" : DIM, display: "inline-block", transform: isExp ? "rotate(90deg)" : "none", transition: "transform .2s", lineHeight: 1 }}>›</span>
                      )}
                    </td>
                    <td style={{ padding: "7px 10px", fontWeight: 700, fontSize: 12, color: "rgba(255,255,255,0.88)", letterSpacing: ".02em" }}>{row.ticker}</td>
                    <td style={{ padding: "7px 10px", color: "rgba(255,255,255,0.45)", fontSize: 11 }}>{row.label}</td>
                    <td style={{ padding: "7px 10px", fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: ".04em" }}>{row.pillarLabel}</td>
                    <td style={{ padding: "7px 10px", textAlign: "right", color: row.weight ? "rgba(255,255,255,0.6)" : DIM, fontWeight: 600 }}>
                      {row.weight != null ? `${row.weight}%` : "—"}
                    </td>
                    <td style={{ padding: "7px 10px", textAlign: "right", fontWeight: 700,
                      color: row.sharpeOos !== null ? (row.sharpeOos >= 0.5 ? "#fff" : row.sharpeOos < 0 ? RED : "rgba(255,255,255,0.6)") : DIM }}>
                      {row.sharpeOos !== null ? fmtN(row.sharpeOos) : "—"}
                    </td>
                    <td style={{ padding: "7px 10px", textAlign: "right", color: valColor(row.cagr), fontWeight: row.cagr ? 600 : 400 }}>
                      {row.cagr ?? "—"}
                    </td>
                    <td style={{ padding: "7px 10px", textAlign: "right", color: row.maxDd ? RED : DIM }}>
                      {row.maxDd ?? "—"}
                    </td>
                    <td style={{ padding: "7px 10px", textAlign: "right", color: (row.pf ?? 0) >= 1.3 ? "rgba(255,255,255,0.8)" : row.pf ? "rgba(255,255,255,0.5)" : DIM }}>
                      {row.pf != null ? fmtN(row.pf) : "—"}
                    </td>
                    <td style={{ padding: "7px 10px", textAlign: "right", color: "rgba(255,255,255,0.35)", fontSize: 11 }}>
                      {row.trades != null ? row.trades.toLocaleString("de") : "—"}
                    </td>
                    <td style={{ padding: "7px 10px", textAlign: "right", color: "rgba(255,255,255,0.35)", fontSize: 11 }}>
                      {row.wfWin ?? "—"}
                    </td>
                    <td style={{ padding: "7px 10px" }}><Chip status={row.status} /></td>
                  </tr>
                );

                const expRow = (
                  <tr key={`${row.id}_x`}>
                    <td colSpan={13} style={{ padding: 0, border: "none" }}>
                      <div style={{ maxHeight: isExp ? "700px" : "0", overflow: "hidden", transition: "max-height 0.38s cubic-bezier(0.4,0,0.2,1)" }}>
                        {isExp && <ExpandedRow row={row} />}
                      </div>
                    </td>
                  </tr>
                );

                return [dataRow, expRow];
              })}
            </tbody>
          </table>
        </div>

        {/* bottom fade */}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 72, background: `linear-gradient(to bottom, transparent, ${BG})`, pointerEvents: "none", zIndex: 3 }} />
      </div>
    </div>
  );
}
