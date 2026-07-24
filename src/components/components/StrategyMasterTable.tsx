"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { TrendingUp, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import {
  WS_STRATEGIES, PILLAR_META, type StrategyRow, type Pillar,
  CI_STRATEGIES, CI_META, type CoreInvestRow, type CIPillar,
} from "@/lib/components/ws-strategy-data";

// ── design tokens ─────────────────────────────────────────────────────────────
const GOLD  = "#e2ca7a";
const MUTED = "#737373";
const DIM   = "#2e2e2e";
const RED   = "#c0392b";
const BG    = "#0c0d10";
const CARD  = "linear-gradient(180deg,#1c1d20 0%,#141517 100%)";
const CBORD = "rgba(255,255,255,0.06)";
const RBORD = "rgba(255,255,255,0.04)";

// ── icon map (strategy ticker → /asset-icons/ filename) ──────────────────────
const AI = "/asset-icons/";
const TICKER_ICON: Record<string, string | null> = {
  "ES1!":         AI + "es_s&p.png",
  "NQ1!":         AI + "nasdaq.png",
  "YM1!":         AI + "dow_jones.png",
  "GC1!":         AI + "gold.png",
  "GLD":          AI + "gold.png",
  "SI1!":         AI + "silver.png",
  "HG1!":         AI + "Kupfer.webp",
  "PL1!":         AI + "platinum.png",
  "PA1!":         AI + "palladium.png",
  "CL1!":         AI + "crude_oil.png",
  "NG1!":         AI + "crude_oil.png",
  "RB1!":         AI + "crude_oil.png",
  "CT1!":         AI + "cotton.png",
  "SB1!":         AI + "sugar.png",
  "OJ1!":         AI + "orange_juice.jpg",
  "ZC1!":         AI + "corn.png",
  "ZW1!":         AI + "wheat.png",
  "ZS1!":         AI + "soybeans.png",
  "CC1!":         AI + "cocoa.webp",
  "KC1!":         AI + "coffee.png",
  "FDAX1!":       AI + "dax.png",
  "UKX!":         AI + "gbp.png",
  "GOOGL":        AI + "google.png",
  "NVDA":         AI + "nvidia.png",
  "MSFT":         AI + "microsoft.png",
  "AAPL":         AI + "apple.png",
  "META":         AI + "meta.png",
  "AMZN":         AI + "amazon.png",
  "EURUSD 30M":   AI + "eurusd.png",
  "GBPUSD 30M":   AI + "gbpusd.png",
  "DAX 1H / MT":  AI + "dax.png",
  "DAX 2H":       AI + "dax.png",
  "QQQ":          AI + "nasdaq.png",
  "SPY":          AI + "es_s&p.png",
  "SPMO":         AI + "es_s&p.png",
  "6S1!":         AI + "chf.png",
};

function TickerIcon({ ticker }: { ticker: string }) {
  const src = TICKER_ICON[ticker] ?? null;
  if (!src) return null;
  return (
    <img
      src={src} alt="" width={14} height={14}
      style={{ width: 14, height: 14, objectFit: "contain", borderRadius: 3, flexShrink: 0 }}
      onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
    />
  );
}

// ── portfolio types ───────────────────────────────────────────────────────────
type Portfolio = "ws" | "ci";
type SortKey = "ticker"|"label"|"pillar"|"weight"|"sharpeOos"|"cagr"|"maxDd"|"pf"|"trades"|"wfWin"|"status";
type SortDir = "desc"|"asc";

const WS_KPIS = [
  { label: "Sharpe OOS", value: "1.526" },
  { label: "CAGR OOS",   value: "+8.36%" },
  { label: "Max DD",     value: "−8.71%" },
  { label: "Calmar",     value: "0.78" },
  { label: "Strategien", value: "28" },
];
const CI_KPIS = [
  { label: "Sharpe OOS", value: "1.152" },
  { label: "CAGR OOS",   value: "+17.11%" },
  { label: "Max DD",     value: "−21.7%" },
  { label: "Calmar",     value: "0.787" },
  { label: "Positionen", value: "8" },
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
  status: string; dataFile?: string; isNotes?: string; exchange?: string;
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
    wfWin: r.winRate, calmar: null, status: r.status, isNotes: r.notes,
  };
}

const WS_ROWS = WS_STRATEGIES.map(wsRow);
const CI_ROWS = CI_STRATEGIES.map(ciRow);

// ── live feed types ───────────────────────────────────────────────────────────
interface LiveItem { symbol: string; lastClose: number | null; changePct: number | null; lastDate: string | null; firstDate: string | null; dataStatus?: string; }

function matchLive(ticker: string, live: Map<string, LiveItem>): LiveItem | null {
  const keys = [
    ticker,
    ticker.replace(" 30M", "").replace(" / MT", "").replace("1H", "").trim(),
    ticker.replace(/[\s/].*/, ""),
    ticker.replace("1!", "").replace("1", ""),
    ticker.split(" ")[0],
  ];
  for (const k of keys) {
    const v = live.get(k);
    if (v) return v;
  }
  return null;
}

function fmtPrice(v: number | null, ticker: string): string {
  if (v === null) return "—";
  const isFx = /USD|EUR|GBP|JPY|AUD|CHF|CAD|NZD/.test(ticker) && !/1!/.test(ticker);
  if (isFx) return v.toFixed(4);
  if (v > 10000) return v.toLocaleString("de", { maximumFractionDigits: 0 });
  if (v > 100) return v.toFixed(2);
  return v.toFixed(4);
}

// ── data types for charts ─────────────────────────────────────────────────────
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
  if (!s) return "rgba(255,255,255,0.45)";
  if (s.startsWith("+")) return "rgba(255,255,255,0.85)";
  if (s.startsWith("−") || s.startsWith("-")) return RED;
  return "rgba(255,255,255,0.6)";
}

function SwanIcon({ size = 14 }: { size?: number }) {
  return <img src="/branding/white-swan-logo.png" alt="WS" width={size} height={size} style={{ width: size, height: size, objectFit: "contain" }} />;
}

// ── compact KPI card (header right side) ─────────────────────────────────────
function HKpi({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${CBORD}`, borderRadius: 12, padding: "8px 14px", textAlign: "left" as const, boxShadow: "0 6px 18px -8px rgba(0,0,0,0.6)", minWidth: 80 }}>
      <div style={{ fontFamily: "var(--font-montserrat),sans-serif", fontSize: 9, fontWeight: 600, color: MUTED, letterSpacing: ".08em", textTransform: "uppercase" as const, marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: "var(--font-montserrat),sans-serif", fontSize: 18, fontWeight: 700, letterSpacing: "-.02em", color: "#fff", lineHeight: 1 }}>{value}</div>
    </div>
  );
}

// ── expanded KPI mini-card (white positive, gold negative) ───────────────────
function EKpi({ label, value }: { label: string; value: string }) {
  const isNeg = value.startsWith("−") || value.startsWith("-");
  return (
    <div style={{ background: CARD, border: `1px solid ${CBORD}`, borderRadius: 10, padding: "8px 12px", minWidth: 80, flex: 1 }}>
      <div style={{ fontFamily: "var(--font-montserrat),sans-serif", fontSize: 9, fontWeight: 600, color: MUTED, letterSpacing: ".07em", textTransform: "uppercase" as const, marginBottom: 5 }}>{label}</div>
      <div style={{ fontFamily: "var(--font-montserrat),sans-serif", fontSize: 16, fontWeight: 700, letterSpacing: "-.02em", color: isNeg ? GOLD : "#fff" }}>{value}</div>
    </div>
  );
}

// ── section filter pill ───────────────────────────────────────────────────────
function Pill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      fontFamily: "var(--font-montserrat),sans-serif",
      fontSize: 10, fontWeight: 600, letterSpacing: ".07em", textTransform: "uppercase" as const,
      padding: "4px 11px", borderRadius: 20, cursor: "pointer",
      background: active ? "rgba(255,255,255,0.07)" : "transparent",
      border: active ? "1px solid rgba(255,255,255,0.18)" : `1px solid ${RBORD}`,
      color: active ? "#fff" : MUTED,
      transition: "all .1s",
    }}>{label}</button>
  );
}

// ── status chip ───────────────────────────────────────────────────────────────
function Chip({ status }: { status: string }) {
  const cfg: Record<string, { label: string; c: string }> = {
    active:         { label: "Aktiv",      c: "rgba(255,255,255,0.55)" },
    watch:          { label: "Watch",      c: GOLD },
    archived:       { label: "Archiviert", c: "rgba(255,255,255,0.18)" },
    research:       { label: "Research",   c: "rgba(255,255,255,0.3)" },
    validation:     { label: "Validation", c: "rgba(255,255,255,0.45)" },
    parity_pending: { label: "Pending",    c: GOLD },
  };
  const s = cfg[status] ?? { label: status, c: MUTED };
  return (
    <span style={{ fontFamily: "var(--font-montserrat),sans-serif", fontSize: 10, fontWeight: 600, color: s.c, display: "inline-flex", alignItems: "center", gap: 4 }}>
      <span style={{ width: 4, height: 4, borderRadius: "50%", background: s.c, flexShrink: 0 }} />
      {s.label}
    </span>
  );
}

// ── candlestick chart ─────────────────────────────────────────────────────────
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
        width: el.clientWidth, height: 200,
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
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 10, color: MUTED, fontFamily: "var(--font-montserrat),sans-serif", letterSpacing: ".07em", textTransform: "uppercase" as const, marginBottom: 5 }}>OHLC 2019 – 2026 · Entry / Exit</div>
      <div ref={ref} style={{ borderRadius: 8, overflow: "hidden" }} />
    </div>
  );
}

function EqChart({ pts, label }: { pts: EP[]; label: string }) {
  const step = Math.max(1, Math.floor(pts.length / 120));
  const d = pts.filter((_,i) => i % step === 0 || i === pts.length-1).map(p => ({ t: p.time.slice(0,7), v: Math.round(p.value) }));
  return (
    <div>
      <div style={{ fontSize: 10, color: MUTED, fontFamily: "var(--font-montserrat),sans-serif", letterSpacing: ".07em", textTransform: "uppercase" as const, marginBottom: 5 }}>{label}</div>
      <ResponsiveContainer width="100%" height={100}>
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
      <div style={{ fontSize: 10, color: MUTED, fontFamily: "var(--font-montserrat),sans-serif", letterSpacing: ".07em", textTransform: "uppercase" as const, marginBottom: 5 }}>Drawdown OOS</div>
      <ResponsiveContainer width="100%" height={70}>
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
    <div style={{ padding: "16px 18px 20px", background: "rgba(255,255,255,0.012)", borderTop: `1px solid ${RBORD}` }}>
      <div style={{ fontFamily: "var(--font-montserrat),sans-serif", fontSize: 11, color: MUTED, marginBottom: 12 }}>
        {[row.engine, row.exchange, row.group].filter(Boolean).join(" · ")}
      </div>
      {row.isNotes && (
        <div style={{ fontFamily: "var(--font-montserrat),sans-serif", fontSize: 11, color: GOLD, background: "rgba(226,202,122,0.05)", border: `1px solid rgba(226,202,122,0.12)`, borderRadius: 8, padding: "6px 10px", marginBottom: 12 }}>
          {row.isNotes}
        </div>
      )}
      {kpis.length > 0 && (
        <div style={{ display: "flex", gap: 7, marginBottom: 16, flexWrap: "wrap" as const }}>
          {kpis.map(k => <EKpi key={k.label} label={k.label} value={k.value} />)}
        </div>
      )}
      {trades.length > 0 && <CandleChart ticker={row.ticker} trades={trades} />}
      {eqOos && eqOos.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: 16 }}>
          <EqChart pts={eqOos} label={`Equity OOS${oos?.cagr != null ? ` · +${oos.cagr.toFixed(2)}% CAGR` : ""}`} />
          {ddOos && ddOos.length > 0 && <DdChart pts={ddOos} />}
        </div>
      )}
    </div>
  );
}

// ── sortable column header ────────────────────────────────────────────────────
function Th({ label, k, sortKey, sortDir, onSort, style }: {
  label: string; k: SortKey; sortKey: SortKey | null; sortDir: SortDir;
  onSort: (k: SortKey) => void; style?: React.CSSProperties;
}) {
  const active = sortKey === k;
  return (
    <th
      onClick={() => onSort(k)}
      style={{
        fontFamily: "var(--font-montserrat),sans-serif",
        fontSize: 10, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase" as const,
        color: active ? "rgba(255,255,255,0.7)" : MUTED,
        padding: "0 8px 9px", whiteSpace: "nowrap" as const,
        borderBottom: `1px solid ${RBORD}`, background: BG, userSelect: "none" as const,
        cursor: "pointer", transition: "color .1s",
        ...style,
      }}
    >
      {label}
      {active && <span style={{ marginLeft: 3, fontSize: 9, opacity: 0.7 }}>{sortDir === "desc" ? "↓" : "↑"}</span>}
    </th>
  );
}

// ── live countdown ring ───────────────────────────────────────────────────────
function LiveTimer({ secs, max }: { secs: number; max: number }) {
  const r = 7, circ = 2 * Math.PI * r;
  const pct = secs / max;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <svg width={16} height={16} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={8} cy={8} r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={1.5} />
        <circle cx={8} cy={8} r={r} fill="none" stroke={GOLD} strokeWidth={1.5}
          strokeDasharray={`${circ * pct} ${circ}`} strokeLinecap="round" />
      </svg>
      <span style={{ fontFamily: "var(--font-montserrat),sans-serif", fontSize: 10, color: MUTED, fontVariantNumeric: "tabular-nums" }}>
        {secs}s
      </span>
    </span>
  );
}

// ── main ──────────────────────────────────────────────────────────────────────
export default function StrategyMasterTable() {
  const [portfolio, setPortfolio] = useState<Portfolio>("ws");
  const [section, setSection]     = useState<string>("all");
  const [expandedId, setExpId]    = useState<string | null>(null);
  const [sortKey, setSortKey]     = useState<SortKey | null>("weight");
  const [sortDir, setSortDir]     = useState<SortDir>("desc");
  const [liveCols, setLiveCols]   = useState(false);
  const [liveData, setLiveData]   = useState<Map<string, LiveItem>>(new Map());
  const [liveTimer, setLiveTimer] = useState(30);
  const LIVE_INTERVAL = 30;

  // live feed polling
  useEffect(() => {
    if (!liveCols) return;
    let timer = LIVE_INTERVAL;
    const fetchLive = () => {
      fetch("/api/monitoring/live-feed")
        .then(r => r.json())
        .then((items: LiveItem[]) => {
          const m = new Map<string, LiveItem>();
          items.forEach(i => { if (i.symbol) m.set(i.symbol, i); });
          setLiveData(m);
          timer = LIVE_INTERVAL;
        })
        .catch(() => {});
    };
    fetchLive();
    const poll = setInterval(fetchLive, LIVE_INTERVAL * 1000);
    const tick = setInterval(() => {
      timer = Math.max(0, timer - 1);
      setLiveTimer(timer);
    }, 1000);
    return () => { clearInterval(poll); clearInterval(tick); };
  }, [liveCols]);

  const switchPortfolio = useCallback((p: Portfolio) => {
    setPortfolio(p); setSection("all"); setExpId(null); setSortKey("weight"); setSortDir("desc");
  }, []);

  const handleSort = useCallback((k: SortKey) => {
    setSortKey(prev => {
      if (prev === k) { setSortDir(d => d === "desc" ? "asc" : "desc"); return k; }
      setSortDir("desc"); return k;
    });
  }, []);

  const toggle = useCallback((id: string) => setExpId(prev => prev === id ? null : id), []);

  // filter rows
  const baseRows: DisplayRow[] = portfolio === "ws" ? WS_ROWS : CI_ROWS;
  let rows = baseRows;
  if (section === "active") rows = rows.filter(r => r.status !== "archived");
  else if (section !== "all") rows = rows.filter(r => r.pillarKey === section);

  // sort
  if (sortKey) {
    rows = [...rows].sort((a, b) => {
      let va: string | number, vb: string | number;
      switch (sortKey) {
        case "ticker":    va = a.ticker;    vb = b.ticker;    break;
        case "label":     va = a.label;     vb = b.label;     break;
        case "pillar":    va = a.pillarLabel; vb = b.pillarLabel; break;
        case "status":    va = a.status;    vb = b.status;    break;
        case "weight":    va = a.weight ?? -Infinity; vb = b.weight ?? -Infinity; break;
        case "sharpeOos": va = a.sharpeOos ?? -Infinity; vb = b.sharpeOos ?? -Infinity; break;
        case "pf":        va = a.pf ?? -Infinity; vb = b.pf ?? -Infinity; break;
        case "trades":    va = a.trades ?? -Infinity; vb = b.trades ?? -Infinity; break;
        case "cagr":      va = parseFloat((a.cagr??"").replace(/[^0-9.-]/g,"")) || -Infinity; vb = parseFloat((b.cagr??"").replace(/[^0-9.-]/g,"")) || -Infinity; break;
        case "maxDd":     va = parseFloat((a.maxDd??"").replace(/[^0-9.-]/g,"")) || -Infinity; vb = parseFloat((b.maxDd??"").replace(/[^0-9.-]/g,"")) || -Infinity; break;
        case "wfWin":     va = parseFloat((a.wfWin??"").replace(/[^0-9.]/g,"")) || 0; vb = parseFloat((b.wfWin??"").replace(/[^0-9.]/g,"")) || 0; break;
        default:          return 0;
      }
      if (typeof va === "string" && typeof vb === "string") {
        const cmp = va.localeCompare(vb);
        return sortDir === "asc" ? cmp : -cmp;
      }
      const nva = va as number, nvb = vb as number;
      return sortDir === "desc" ? nvb - nva : nva - nvb;
    });
  }

  const wsSections = [
    { key: "all",       label: "Alle" },
    { key: "active",    label: "Nur Aktive" },
    { key: "valuation", label: "Valuation" },
    { key: "macro",     label: "Macro" },
    { key: "trend",     label: "Trend" },
    { key: "seasonal",  label: "Seasonal" },
    { key: "anomaly",   label: "Anomaly" },
    { key: "intraday",  label: "Intraday" },
  ];
  const ciSections = [
    { key: "all",       label: "Alle" },
    { key: "etf_core",  label: "ETF-Core" },
    { key: "ci_sleeve", label: "Sleeve" },
  ];
  const sections = portfolio === "ws" ? wsSections : ciSections;
  const kpis = portfolio === "ws" ? WS_KPIS : CI_KPIS;

  const thBase: React.CSSProperties = { textAlign: "right" as const };
  const thL: React.CSSProperties = { textAlign: "left" as const };
  let rowNum = 0;

  const LIVE_COLS = 3;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", padding: "14px 20px 0", background: BG, fontFamily: "var(--font-montserrat),sans-serif" }}>
      <style>{`.kmp-scroll::-webkit-scrollbar{display:none}.kmp-scroll{scrollbar-width:none;-ms-overflow-style:none}`}</style>

      {/* ── top bar: left (title + switcher) · right (KPI cards) ── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12, flexShrink: 0, gap: 16 }}>

        {/* left: title + portfolio switcher */}
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#fff", letterSpacing: "-.02em", margin: "0 0 8px" }}>Komponenten</h1>
          <div style={{ display: "flex", gap: 6 }}>
            {([
              { id: "ws" as Portfolio, label: "White Swan",  icon: <SwanIcon size={13} /> },
              { id: "ci" as Portfolio, label: "Core Invest", icon: <TrendingUp size={13} strokeWidth={1.8} /> },
            ]).map(item => (
              <button
                key={item.id} type="button"
                onClick={() => switchPortfolio(item.id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors [font-family:var(--font-montserrat),sans-serif]",
                  portfolio === item.id
                    ? "border-white/40 bg-white/[0.06] text-white"
                    : "border-transparent text-zinc-500 hover:border-white/[0.08] hover:text-zinc-300",
                )}
              >
                {item.icon}{item.label}
              </button>
            ))}
          </div>
        </div>

        {/* right: compact KPI cards */}
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" as const, justifyContent: "flex-end" }}>
          {kpis.map(k => <HKpi key={k.label} label={k.label} value={k.value} />)}
        </div>
      </div>

      {/* ── filter bar + live toggle ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 9, flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" as const }}>
          {sections.map(s => (
            <Pill key={s.key} label={s.label} active={section === s.key}
              onClick={() => { setSection(s.key); setExpId(null); }} />
          ))}
        </div>

        {/* live columns toggle */}
        <button
          onClick={() => setLiveCols(v => !v)}
          title={liveCols ? "Live-Spalten ausblenden" : "Live-Spalten einblenden"}
          style={{
            display: "flex", alignItems: "center", gap: 5,
            fontFamily: "var(--font-montserrat),sans-serif", fontSize: 10, fontWeight: 600,
            letterSpacing: ".06em", textTransform: "uppercase" as const,
            padding: "4px 10px", borderRadius: 8, cursor: "pointer",
            background: liveCols ? "rgba(226,202,122,0.08)" : "transparent",
            border: liveCols ? `1px solid rgba(226,202,122,0.25)` : `1px solid ${RBORD}`,
            color: liveCols ? GOLD : MUTED,
            transition: "all .15s", flexShrink: 0,
          }}
        >
          <LayoutGrid size={12} />
          Live
          {liveCols && <LiveTimer secs={liveTimer} max={LIVE_INTERVAL} />}
        </button>
      </div>

      {/* ── table wrapper ── */}
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        <div className="kmp-scroll" style={{ height: "100%", overflowY: "auto", borderRadius: "9px 9px 0 0", border: `1px solid ${RBORD}`, borderBottom: "none" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead style={{ position: "sticky", top: 0, zIndex: 2 }}>
              <tr>
                {/* # */}
                <th style={{ fontFamily: "var(--font-montserrat),sans-serif", fontSize: 10, fontWeight: 600, letterSpacing: ".08em", color: MUTED, padding: "0 6px 9px", textAlign: "right" as const, borderBottom: `1px solid ${RBORD}`, background: BG, width: 28 }}>#</th>
                <th style={{ width: 20, padding: 0, borderBottom: `1px solid ${RBORD}`, background: BG }} />
                <Th label="Ticker"   k="ticker"    sortKey={sortKey} sortDir={sortDir} onSort={handleSort} style={thL} />
                <Th label="Asset"    k="label"     sortKey={sortKey} sortDir={sortDir} onSort={handleSort} style={thL} />
                <Th label="Pillar"   k="pillar"    sortKey={sortKey} sortDir={sortDir} onSort={handleSort} style={thL} />
                <Th label="Gew."     k="weight"    sortKey={sortKey} sortDir={sortDir} onSort={handleSort} style={thBase} />
                <Th label="Sharpe"   k="sharpeOos" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} style={thBase} />
                <Th label="CAGR"     k="cagr"      sortKey={sortKey} sortDir={sortDir} onSort={handleSort} style={thBase} />
                <Th label="Max DD"   k="maxDd"     sortKey={sortKey} sortDir={sortDir} onSort={handleSort} style={thBase} />
                <Th label="PF"       k="pf"        sortKey={sortKey} sortDir={sortDir} onSort={handleSort} style={thBase} />
                <Th label="Trades"   k="trades"    sortKey={sortKey} sortDir={sortDir} onSort={handleSort} style={thBase} />
                <Th label="WF/Win%"  k="wfWin"     sortKey={sortKey} sortDir={sortDir} onSort={handleSort} style={thBase} />
                <Th label="Status"   k="status"    sortKey={sortKey} sortDir={sortDir} onSort={handleSort} style={thL} />
                {liveCols && <>
                  <th style={{ fontFamily: "var(--font-montserrat),sans-serif", fontSize: 10, fontWeight: 600, letterSpacing: ".08em", color: GOLD, padding: "0 8px 9px", textAlign: "right" as const, borderBottom: `1px solid ${RBORD}`, background: BG, whiteSpace: "nowrap" as const, borderLeft: `1px solid rgba(226,202,122,0.12)` }}>Preis</th>
                  <th style={{ fontFamily: "var(--font-montserrat),sans-serif", fontSize: 10, fontWeight: 600, letterSpacing: ".08em", color: GOLD, padding: "0 8px 9px", textAlign: "right" as const, borderBottom: `1px solid ${RBORD}`, background: BG, whiteSpace: "nowrap" as const }}>Δ%</th>
                  <th style={{ fontFamily: "var(--font-montserrat),sans-serif", fontSize: 10, fontWeight: 600, letterSpacing: ".08em", color: GOLD, padding: "0 8px 9px", textAlign: "right" as const, borderBottom: `1px solid ${RBORD}`, background: BG, whiteSpace: "nowrap" as const }}>Von–Bis</th>
                </>}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const isArchived = row.status === "archived";
                const isExp = expandedId === row.id;
                if (!isArchived) rowNum++;
                const live = liveCols ? matchLive(row.ticker, liveData) : null;

                const dataRow = (
                  <tr
                    key={row.id}
                    onClick={() => !isArchived && toggle(row.id)}
                    style={{
                      opacity: isArchived ? 0.22 : 1,
                      cursor: isArchived ? "default" : "pointer",
                      borderBottom: `1px solid ${RBORD}`,
                      background: isExp ? "rgba(255,255,255,0.022)" : "transparent",
                      transition: "background .1s",
                    }}
                    onMouseEnter={e => { if (!isArchived && !isExp) (e.currentTarget as HTMLTableRowElement).style.background = "rgba(255,255,255,0.015)"; }}
                    onMouseLeave={e => { if (!isExp) (e.currentTarget as HTMLTableRowElement).style.background = isArchived ? "transparent" : "transparent"; }}
                  >
                    {/* # */}
                    <td style={{ padding: "6px 6px", textAlign: "right" as const, fontSize: 9, color: DIM, width: 28, fontFamily: "var(--font-montserrat),sans-serif" }}>
                      {isArchived ? "" : rowNum}
                    </td>
                    {/* expand arrow */}
                    <td style={{ padding: "6px 4px", width: 20, textAlign: "center" as const }}>
                      {!isArchived && (
                        <span style={{ fontSize: 10, color: isExp ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.18)", display: "inline-block", transform: isExp ? "rotate(90deg)" : "none", transition: "transform .2s", lineHeight: 1 }}>›</span>
                      )}
                    </td>
                    {/* ticker + icon */}
                    <td style={{ padding: "6px 8px" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <TickerIcon ticker={row.ticker} />
                        <span style={{ fontWeight: 700, fontSize: 11, color: "rgba(255,255,255,0.9)", letterSpacing: ".02em", fontVariantNumeric: "tabular-nums" }}>{row.ticker}</span>
                      </span>
                    </td>
                    {/* asset */}
                    <td style={{ padding: "6px 8px", color: "rgba(255,255,255,0.38)", fontSize: 10 }}>{row.label}</td>
                    {/* pillar */}
                    <td style={{ padding: "6px 8px", fontSize: 9, color: "rgba(255,255,255,0.26)", letterSpacing: ".04em" }}>{row.pillarLabel}</td>
                    {/* weight */}
                    <td style={{ padding: "6px 8px", textAlign: "right" as const, color: row.weight ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.15)", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                      {row.weight != null ? `${row.weight}%` : "—"}
                    </td>
                    {/* sharpe */}
                    <td style={{ padding: "6px 8px", textAlign: "right" as const, fontWeight: 700, fontVariantNumeric: "tabular-nums",
                      color: row.sharpeOos !== null ? (row.sharpeOos >= 0.5 ? "#fff" : row.sharpeOos < 0 ? RED : "rgba(255,255,255,0.55)") : "rgba(255,255,255,0.15)" }}>
                      {row.sharpeOos !== null ? fmtN(row.sharpeOos) : "—"}
                    </td>
                    {/* cagr */}
                    <td style={{ padding: "6px 8px", textAlign: "right" as const, color: valColor(row.cagr), fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{row.cagr ?? "—"}</td>
                    {/* maxdd */}
                    <td style={{ padding: "6px 8px", textAlign: "right" as const, color: row.maxDd ? RED : "rgba(255,255,255,0.15)", fontVariantNumeric: "tabular-nums" }}>{row.maxDd ?? "—"}</td>
                    {/* pf */}
                    <td style={{ padding: "6px 8px", textAlign: "right" as const, color: (row.pf ?? 0) >= 1.3 ? "rgba(255,255,255,0.75)" : row.pf ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.15)", fontVariantNumeric: "tabular-nums" }}>
                      {row.pf != null ? fmtN(row.pf) : "—"}
                    </td>
                    {/* trades */}
                    <td style={{ padding: "6px 8px", textAlign: "right" as const, color: "rgba(255,255,255,0.3)", fontSize: 10, fontVariantNumeric: "tabular-nums" }}>
                      {row.trades != null ? row.trades.toLocaleString("de") : "—"}
                    </td>
                    {/* wf/win */}
                    <td style={{ padding: "6px 8px", textAlign: "right" as const, color: "rgba(255,255,255,0.3)", fontSize: 10 }}>{row.wfWin ?? "—"}</td>
                    {/* status */}
                    <td style={{ padding: "6px 8px" }}><Chip status={row.status} /></td>

                    {/* live columns */}
                    {liveCols && (() => {
                      const price = live?.lastClose ?? null;
                      const chg   = live?.changePct ?? null;
                      const from  = live?.firstDate  ? live.firstDate.slice(0,7).replace("-","/") : "—";
                      const to    = live?.lastDate   ? live.lastDate.slice(5,10).replace("-",".") : "—";
                      const chgColor = chg === null ? "rgba(255,255,255,0.25)" : chg >= 0 ? "rgba(255,255,255,0.8)" : RED;
                      return (
                        <>
                          <td style={{ padding: "6px 8px", textAlign: "right" as const, fontVariantNumeric: "tabular-nums", color: price !== null ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.2)", borderLeft: `1px solid rgba(226,202,122,0.09)`, fontSize: 11, fontWeight: 600 }}>
                            {price !== null ? fmtPrice(price, row.ticker) : "—"}
                          </td>
                          <td style={{ padding: "6px 8px", textAlign: "right" as const, fontVariantNumeric: "tabular-nums", color: chgColor, fontSize: 10 }}>
                            {chg !== null ? `${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%` : "—"}
                          </td>
                          <td style={{ padding: "6px 8px", textAlign: "right" as const, color: "rgba(255,255,255,0.25)", fontSize: 9, whiteSpace: "nowrap" as const }}>
                            {from !== "—" ? `${from} – ${to}` : "—"}
                          </td>
                        </>
                      );
                    })()}
                  </tr>
                );

                const expRow = (
                  <tr key={`${row.id}_x`}>
                    <td colSpan={13 + (liveCols ? LIVE_COLS : 0)} style={{ padding: 0, border: "none" }}>
                      <div style={{ maxHeight: isExp ? "720px" : "0", overflow: "hidden", transition: "max-height 0.38s cubic-bezier(0.4,0,0.2,1)" }}>
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

        {/* bottom gradient — stronger/taller */}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 140, background: `linear-gradient(to bottom, transparent 0%, ${BG}cc 60%, ${BG} 100%)`, pointerEvents: "none", zIndex: 3 }} />
      </div>
    </div>
  );
}
