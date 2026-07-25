"use client";

import { useState, useEffect, useRef } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import {
  WS_STRATEGIES, PILLAR_META, type StrategyRow, type Pillar,
  CI_STRATEGIES, CI_META, type CoreInvestRow, type CIPillar,
  WS_PORTFOLIO_KPIS, CI_PORTFOLIO_KPIS,
} from "@/lib/components/ws-strategy-data";

// ── design tokens ──────────────────────────────────────────────────────────────
const GOLD  = "#e2ca7a";
const MUTED = "#737373";
const BG    = "#0c0d10";
const CARD  = "linear-gradient(180deg,#1c1d20 0%,#141517 100%)";
const CBORD = "rgba(255,255,255,0.06)";
const RBORD = "rgba(255,255,255,0.04)";

// ── asset icon map ─────────────────────────────────────────────────────────────
const AI = "/asset-icons/";
const TICKER_ICON: Record<string, string> = {
  "ES1!": AI+"es_s&p.png","NQ1!": AI+"nasdaq.png","YM1!": AI+"dow_jones.png",
  "GC1!": AI+"gold.png","GLD": AI+"gold.png","SI1!": AI+"silver.png",
  "HG1!": AI+"Kupfer.webp","PL1!": AI+"platinum.png","PA1!": AI+"palladium.png",
  "CL1!": AI+"crude_oil.png","NG1!": AI+"crude_oil.png","RB1!": AI+"crude_oil.png",
  "CT1!": AI+"cotton.png","SB1!": AI+"sugar.png","OJ1!": AI+"orange_juice.jpg",
  "ZC1!": AI+"corn.png","ZW1!": AI+"wheat.png","ZS1!": AI+"soybeans.png",
  "CC1!": AI+"cocoa.webp","KC1!": AI+"coffee.png",
  "FDAX1!": AI+"dax.png","UKX!": AI+"gbp.png",
  "GOOGL": AI+"google.png","NVDA": AI+"nvidia.png","MSFT": AI+"microsoft.png",
  "AAPL": AI+"apple.png","META": AI+"meta.png","AMZN": AI+"amazon.png",
  "6E1!": AI+"eurusd.png","GBPUSD 30M": AI+"gbpusd.png",
  "DAX 1H / MT": AI+"dax.png","DAX 2H": AI+"dax.png",
  "QQQ": AI+"nasdaq.png","SPY": AI+"es_s&p.png","SPMO": AI+"es_s&p.png",
  "6S1!": AI+"chf.png",
};

// ── types ─────────────────────────────────────────────────────────────────────
type Portfolio = "ws" | "ci";
type SortKey = "weight" | "sharpeOos" | "cagr" | "maxDd" | "pf" | "trades";
type SortDir = "desc" | "asc";

interface DisplayRow {
  id: string; section: Portfolio;
  ticker: string; label: string; group: string; engine: string;
  pillarKey: string; pillarLabel: string;
  weight: number | null; sharpeOos: number | null;
  cagr: string | null; maxDd: string | null;
  pf: number | null; trades: number | null;
  wfWin: string | null; calmar: number | null;
  status: string;
  dataFile?: string; intradayId?: string;
  codexGroup?: string; codexSymbol?: string;
  isNotes?: string; exchange?: string;
}

function wsRow(r: StrategyRow): DisplayRow {
  return {
    id: r.id, section: "ws",
    ticker: r.ticker, label: r.label, group: r.group, engine: r.engine,
    pillarKey: r.pillar, pillarLabel: PILLAR_META[r.pillar as Pillar].label,
    weight: r.weight, sharpeOos: r.sharpeOos,
    cagr: r.cagr, maxDd: r.maxDd, pf: r.pf, trades: r.trades,
    wfWin: r.wfOos, calmar: r.calmar, status: r.status,
    dataFile: r.dataFile, intradayId: r.intradayId,
    codexGroup: r.codexGroup, codexSymbol: r.codexSymbol,
    isNotes: r.isNotes, exchange: r.exchange,
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

const WS_KPIS = [
  { label: "Sharpe OOS", value: WS_PORTFOLIO_KPIS.sharpe },
  { label: "CAGR OOS",   value: WS_PORTFOLIO_KPIS.cagr   },
  { label: "Max DD",     value: WS_PORTFOLIO_KPIS.maxDd  },
  { label: "Calmar",     value: WS_PORTFOLIO_KPIS.calmar  },
  { label: "Strategien", value: WS_PORTFOLIO_KPIS.strategies },
];
const CI_KPIS = [
  { label: "Sharpe OOS", value: CI_PORTFOLIO_KPIS.sharpe    },
  { label: "CAGR OOS",   value: CI_PORTFOLIO_KPIS.cagr      },
  { label: "Max DD",     value: CI_PORTFOLIO_KPIS.maxDd     },
  { label: "Calmar",     value: CI_PORTFOLIO_KPIS.calmar     },
  { label: "Positionen", value: CI_PORTFOLIO_KPIS.positions  },
];

// ── OHLC cache ─────────────────────────────────────────────────────────────────
type OhlcCacheEntry = { bars: OhlcBar[]; ts: number };
const OHLC_CACHE = new Map<string, OhlcCacheEntry>();
const OHLC_CACHE_TTL = 60_000;
const OHLC_SYMBOL: Record<string, string> = {
  "DAX 1H / MT":"FDAX1!","DAX 2H":"FDAX1!","GBPUSD 30M":"6B1!","GLD":"GC1!",
};
function toOhlcSymbol(t: string): string { return OHLC_SYMBOL[t] ?? t.split(" ")[0]; }

// ── live feed ─────────────────────────────────────────────────────────────────
interface LiveFeedItem {
  symbol: string; lastClose: number | null; changePct: number | null;
  lastDate: string | null; dataStatus: "live"|"daily"|"missing";
}
const LIVE_MAP: Record<string, string[]> = {
  "6E1!":["6E1!","EURUSD"],"DAX 1H / MT":["FDAX1!","DAX","DAX40"],
  "DAX 2H":["FDAX1!","DAX"],"FDAX1!":["FDAX1!","DAX"],
  "ES1!":["ES1!","S&P500"],"NQ1!":["NQ1!","NAS100"],
  "YM1!":["YM1!","US30"],"GC1!":["GC1!","GOLD","XAU"],
  "GLD":["GLD","GC1!","GOLD"],"GOOGL":["GOOGL","GOOGLE"],
};
function matchLive(ticker: string, live: Map<string, LiveFeedItem>): LiveFeedItem | null {
  const cands = LIVE_MAP[ticker] ?? [ticker, ticker.replace("1!",""), ticker.split(" ")[0]];
  for (const k of cands) { const v = live.get(k); if (v) return v; }
  for (const [key, val] of live) {
    const base = ticker.split(" ")[0].replace("1!","").toUpperCase();
    if (key.toUpperCase().startsWith(base)) return val;
  }
  return null;
}
function fmtPrice(v: number, ticker: string): string {
  const isFx = /EURUSD|GBPUSD|6E|6B|6S|ZARUSD/.test(ticker) && !/1H|2H/.test(ticker);
  if (isFx && v < 100) return v.toFixed(4);
  if (v > 10000) return v.toLocaleString("de", { maximumFractionDigits: 0 });
  if (v > 100) return v.toFixed(2);
  return v.toFixed(3);
}

// ── data types ─────────────────────────────────────────────────────────────────
interface EP { time: string; value: number; }
interface OhlcBar { time: string; open: number; high: number; low: number; close: number; }
interface StrategyData {
  summary: { oos: { sharpe: number; cagr: number; maxDrawdownPercent: number; profitFactor: number; tradeCount: number; winRate: number; finalEquity: number } };
  equityCurve: { oos: EP[] }; drawdownCurve: { oos: EP[] };
}
interface IntradayCurvePoint { date: string; equity: number; }
interface IntradayStrategy {
  id: string;
  oos: { curve: IntradayCurvePoint[]; stats: { cagr: number; maxDD: number; mar?: number; sharpe: number; pf: number; n: number; wr: number } };
}

// ── helpers ───────────────────────────────────────────────────────────────────
const fmtN = (v: number | null, d = 2) => v === null ? "—" : v.toFixed(d);
function strNumColor(s: string | null): string {
  if (!s || s === "—") return "rgba(255,255,255,0.2)";
  if (s.startsWith("−") || s.startsWith("-")) return GOLD;
  return "rgba(255,255,255,0.82)";
}
function sortRows(rows: DisplayRow[], key: SortKey, dir: SortDir): DisplayRow[] {
  return [...rows].sort((a, b) => {
    let av: number, bv: number;
    if (key === "cagr" || key === "maxDd") {
      const p = (s: string | null) => parseFloat((s ?? "").replace(/[^0-9.-]/g, "")) || 0;
      av = p(a[key]); bv = p(b[key]);
    } else {
      av = (a[key] as number | null) ?? -Infinity;
      bv = (b[key] as number | null) ?? -Infinity;
    }
    return dir === "desc" ? bv - av : av - bv;
  });
}
function syntheticCurves(cagrStr: string | null, maxDdStr: string | null) {
  const cagrPct = parseFloat((cagrStr ?? "").replace(/[^0-9.-]/g, ""));
  const ddPct   = Math.abs(parseFloat((maxDdStr ?? "").replace(/[^0-9.-]/g, "")));
  if (!isFinite(cagrPct) || !isFinite(ddPct)) return null;
  const mr = Math.pow(1 + cagrPct / 100, 1 / 12) - 1;
  const eq: EP[] = []; const dd: EP[] = [];
  let equity = 10000, peak = 10000;
  const now = new Date(); const endY = now.getFullYear(); const endM = now.getMonth() + 1;
  for (let y = 2019, m = 1; y < endY || (y === endY && m <= endM); ) {
    const i = (y - 2019) * 12 + (m - 1);
    equity *= (1 + mr + Math.sin(i * 0.41) * 0.008 + Math.sin(i * 1.17) * 0.004);
    if (equity > peak) peak = equity;
    const t = `${y}-${String(m).padStart(2,"0")}-01`;
    eq.push({ time: t, value: Math.round(equity) });
    dd.push({ time: t, value: Math.round(Math.max(-ddPct, peak > 0 ? ((equity - peak) / peak) * 100 : 0) * 100) / 100 });
    m++; if (m > 12) { m = 1; y++; }
  }
  return { eq, dd };
}
function inferDirection(engine: string): string {
  const e = engine.toLowerCase();
  if (e.includes("long-only") || e.includes("long only")) return "Long Only";
  if (e.includes("short-only") || e.includes("short only")) return "Short Only";
  if (e.includes("long") && e.includes("short")) return "Long & Short";
  if (e.includes("long")) return "Long";
  return "Long & Short";
}
function pillarDesc(pillar: string): string {
  const m: Record<string, string> = {
    valuation: "Fundamentale Über-/Unterbewertung.",
    macro: "Makroökonomischer Filter.",
    trend: "EMA-basierter Trendfolge-Ansatz.",
    seasonal: "Kalender-basiertes Muster.",
    anomaly: "Wochentagsanomalie.",
    intraday: "Intraday Mean-Reversion / Momentum.",
  };
  return m[pillar] ?? "Multi-Asset Strategie.";
}

// ── Chip ──────────────────────────────────────────────────────────────────────
function Chip({ status }: { status: string }) {
  const cfg: Record<string, { label: string; c: string }> = {
    active: { label: "Aktiv", c: "rgba(255,255,255,0.5)" },
    watch: { label: "Watch", c: GOLD },
    archived: { label: "Archiviert", c: "rgba(255,255,255,0.15)" },
    research: { label: "Research", c: "rgba(255,255,255,0.3)" },
    validation: { label: "Validation", c: "rgba(255,255,255,0.45)" },
    parity_pending: { label: "Pending", c: GOLD },
  };
  const s = cfg[status] ?? { label: status, c: MUTED };
  return (
    <span style={{ fontSize: 10, fontWeight: 600, color: s.c, display: "inline-flex", alignItems: "center", gap: 3, fontFamily: "var(--font-montserrat),sans-serif", whiteSpace: "nowrap" }}>
      <span style={{ width: 4, height: 4, borderRadius: "50%", background: s.c, flexShrink: 0 }} />
      {s.label}
    </span>
  );
}

// ── CandleChart ───────────────────────────────────────────────────────────────
function MobileCandleChart({ ticker }: { ticker: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const sym = toOhlcSymbol(ticker);
  const ck = sym + ":1D";
  const cached = OHLC_CACHE.get(ck);
  const [bars, setBars] = useState<OhlcBar[] | null>(cached ? cached.bars : null);

  useEffect(() => {
    if (!cached || Date.now() - cached.ts > OHLC_CACHE_TTL) {
      fetch(`/api/monitoring/ohlc?symbol=${encodeURIComponent(sym)}&timeframe=1D`)
        .then(r => r.json()).then(d => {
          const b: OhlcBar[] = Array.isArray(d.bars) && d.bars.length ? d.bars : [];
          OHLC_CACHE.set(ck, { bars: b, ts: Date.now() });
          setBars(b);
        }).catch(() => { if (!OHLC_CACHE.has(ck)) setBars([]); });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker]);

  useEffect(() => {
    if (!ref.current || !bars?.length) return;
    let destroyed = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let chart: any = null;
    import("lightweight-charts").then(({ createChart, CandlestickSeries, CrosshairMode, ColorType, LineStyle }) => {
      if (destroyed || !ref.current) return;
      const el = ref.current;
      chart = createChart(el, {
        width: el.clientWidth, height: 160,
        layout: { background: { type: ColorType.Solid, color: BG }, textColor: "rgba(228,236,248,0.68)", fontSize: 9, attributionLogo: false },
        grid: { vertLines: { visible: false }, horzLines: { visible: false } },
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: { borderVisible: false, textColor: "rgba(228,236,248,0.68)" },
        timeScale: { borderVisible: false, timeVisible: false, rightOffset: 2 },
        handleScroll: { mouseWheel: false, pressedMouseMove: true },
        handleScale: { mouseWheel: false, pinch: true },
      });
      const series = chart.addSeries(CandlestickSeries, {
        upColor: "#FFFFFF", downColor: "#D6B44B", borderVisible: false,
        wickUpColor: "#FFFFFF", wickDownColor: "#D6B44B",
        priceLineVisible: false, lastValueVisible: false,
      });
      const pre = bars.filter((b: OhlcBar) =>
        b.time >= "2019-01-01" && (b.high - b.low) / Math.max(b.close, 0.0001) > 0.0002
      );
      const filtered = pre.filter((b: OhlcBar, i: number) => {
        if (i === 0) return true;
        return Math.abs(b.open - pre[i-1].close) / Math.max(pre[i-1].close, 0.0001) < 0.40;
      });
      series.setData(filtered);
      const total = filtered.length;
      if (total > 20) chart.timeScale().setVisibleLogicalRange({ from: total - 20, to: total + 2 });
      else chart.timeScale().fitContent();
      const last = filtered[filtered.length - 1];
      if (last?.close) series.createPriceLine({ price: last.close, color: "rgba(255,255,255,0.40)", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "" });
    });
    return () => { destroyed = true; if (chart) { try { chart.remove(); } catch { /**/ } } };
  }, [bars]);

  if (bars === null) return <div style={{ height: 160, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "rgba(255,255,255,0.2)", fontFamily: "var(--font-montserrat),sans-serif", background: BG, borderRadius: 6 }}>Lade OHLC…</div>;
  if (!bars.length) return <div style={{ height: 40, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "rgba(255,255,255,0.15)", fontFamily: "var(--font-montserrat),sans-serif" }}>Keine Daten</div>;
  return <div ref={ref} style={{ width: "100%", height: 160, borderRadius: 6, overflow: "hidden", background: BG }} />;
}

// ── InfoBox ───────────────────────────────────────────────────────────────────
function InfoBox({ title, items }: { title: string; items: Array<{ k: string; v: string }> }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${RBORD}`, borderRadius: 10, padding: "10px 12px" }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: MUTED, letterSpacing: ".09em", textTransform: "uppercase", fontFamily: "var(--font-montserrat),sans-serif", borderBottom: `1px solid ${RBORD}`, paddingBottom: 5, marginBottom: 7 }}>{title}</div>
      {items.map(({ k, v }) => (
        <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 10, color: MUTED, fontFamily: "var(--font-montserrat),sans-serif", flexShrink: 0 }}>{k}</span>
          <span style={{ fontSize: 10, color: strNumColor(v), fontFamily: "var(--font-montserrat),sans-serif", textAlign: "right", wordBreak: "break-word" }}>{v}</span>
        </div>
      ))}
    </div>
  );
}

// ── Expanded panel (fits one screen: smaller charts, 3×2 KPI grid) ────────────
function ExpandedPanel({ row }: { row: DisplayRow }) {
  const [data, setData]         = useState<StrategyData | null>(null);
  const [intraday, setIntraday] = useState<IntradayStrategy | null>(null);
  const [codexEq, setCodexEq]   = useState<EP[] | null>(null);
  const [tab, setTab]           = useState<"charts"|"info">("charts");

  useEffect(() => {
    if (!row.dataFile) return;
    fetch(`/data/${row.dataFile}`).then(r => r.json()).then(setData).catch(() => {});
  }, [row.dataFile]);

  useEffect(() => {
    if (!row.codexGroup || !row.codexSymbol || row.dataFile || row.intradayId) return;
    const g = row.codexGroup, s = row.codexSymbol;
    fetch(`/api/monitoring/codex-equity-curve?group=${g}&symbol=${s}&type=equity`)
      .then(r => r.json())
      .then((d: { rows?: Array<{ date: string; value: number }> }) => {
        if (d.rows?.length) setCodexEq(d.rows.map(p => ({ time: p.date.length === 7 ? p.date + "-01" : p.date, value: p.value })));
      }).catch(() => {});
  }, [row.codexGroup, row.codexSymbol, row.dataFile, row.intradayId]);

  useEffect(() => {
    if (!row.intradayId || row.dataFile) return;
    fetch("/data/intraday-equity.json")
      .then(r => r.json())
      .then((d: { strategies: IntradayStrategy[] }) => {
        setIntraday(d.strategies.find(x => x.id === row.intradayId) ?? null);
      }).catch(() => {});
  }, [row.intradayId, row.dataFile]);

  const eqOos = data?.equityCurve?.oos;
  const oos   = data?.summary?.oos;
  const ist   = intraday?.oos?.stats;
  const intradayEq: EP[] | null = intraday?.oos?.curve?.length
    ? intraday.oos.curve.map(p => ({ time: p.date + "-01", value: p.equity })) : null;
  const synthAll = syntheticCurves(row.cagr, row.maxDd);
  const activeEq: EP[] = eqOos?.length ? eqOos : intradayEq?.length ? intradayEq : codexEq?.length ? codexEq! : synthAll?.eq ?? [];
  const isSynth = !(eqOos?.length || codexEq?.length || intradayEq?.length);
  const activeDd: EP[] = (() => {
    if (!activeEq.length) return synthAll?.dd ?? [];
    let peak = activeEq[0]?.value ?? 0;
    return activeEq.map(p => { if (p.value > peak) peak = p.value; return { time: p.time, value: Math.round(((p.value - peak) / peak) * 10000) / 100 }; });
  })();

  // exactly 6 KPIs for 3×2 grid
  const kpis: Array<{ label: string; value: string }> = [];
  if (row.sharpeOos !== null)          kpis.push({ label: "Sharpe OOS",    value: fmtN(row.sharpeOos) });
  else if (ist?.sharpe != null)        kpis.push({ label: "Sharpe OOS",    value: fmtN(ist.sharpe) });
  if (oos?.cagr != null)               kpis.push({ label: "CAGR OOS",      value: `${oos.cagr > 0 ? "+" : ""}${oos.cagr.toFixed(2)}%` });
  else if (ist?.cagr != null)          kpis.push({ label: "CAGR OOS",      value: `+${fmtN(ist.cagr)}%` });
  else if (row.cagr)                   kpis.push({ label: "CAGR",          value: row.cagr });
  if (oos?.maxDrawdownPercent != null) kpis.push({ label: "Max DD",        value: `−${Math.abs(oos.maxDrawdownPercent).toFixed(2)}%` });
  else if (ist?.maxDD != null)         kpis.push({ label: "Max DD",        value: `−${fmtN(ist.maxDD)}%` });
  else if (row.maxDd)                  kpis.push({ label: "Max DD",        value: row.maxDd });
  if (row.pf != null)                  kpis.push({ label: "Profit Factor", value: fmtN(row.pf) });
  else if (ist?.pf != null)            kpis.push({ label: "Profit Factor", value: fmtN(ist.pf) });
  if (row.trades != null)              kpis.push({ label: "Trades",        value: String(row.trades) });
  else if (ist?.n != null)             kpis.push({ label: "Trades",        value: String(ist.n) });
  if (row.calmar != null)              kpis.push({ label: "Calmar",        value: fmtN(row.calmar) });
  else if (ist?.mar != null)           kpis.push({ label: "Calmar",        value: fmtN(ist.mar) });
  else if (ist?.wr != null)            kpis.push({ label: "Win Rate",      value: `${(ist.wr * 100).toFixed(1)}%` });
  else if (oos?.winRate != null)       kpis.push({ label: "Win Rate",      value: `${oos.winRate.toFixed(1)}%` });
  const kpi6 = kpis.slice(0, 6);

  const dir = inferDirection(row.engine);
  const pfV = row.pf ?? ist?.pf ?? oos?.profitFactor ?? null;
  const tradesV = row.trades ?? ist?.n ?? oos?.tradeCount ?? null;
  const wrV = ist?.wr != null ? ist.wr * 100 : oos?.winRate ?? null;
  const calmarV = ist?.mar ?? row.calmar ?? null;
  const sharpeV = row.sharpeOos ?? ist?.sharpe ?? null;

  const TICK = { fill: "rgba(255,255,255,0.28)", fontSize: 8 };
  const CM   = { top: 2, right: 38, bottom: 0, left: 0 };
  const CMX  = { top: 0, right: 38, bottom: 0, left: 0 };

  const tabBtn = (t: "charts"|"info") => ({
    flex: 1, padding: "8px 0", fontSize: 10, fontWeight: 600,
    fontFamily: "var(--font-montserrat),sans-serif", letterSpacing: ".07em",
    textTransform: "uppercase" as const, cursor: "pointer", border: "none",
    background: "none", color: tab === t ? "#fff" : MUTED,
    borderBottom: `2px solid ${tab === t ? "rgba(255,255,255,0.4)" : "transparent"}`,
  });

  return (
    <div style={{ background: "rgba(0,0,0,0.25)", borderTop: `1px solid ${RBORD}` }}>
      <div style={{ display: "flex", borderBottom: `1px solid ${RBORD}` }}>
        <button style={tabBtn("charts")} onClick={() => setTab("charts")}>Charts & KPIs</button>
        <button style={tabBtn("info")} onClick={() => setTab("info")}>Strategie-Info</button>
      </div>

      {tab === "charts" && (
        <div style={{ padding: "10px 12px 14px" }}>
          <div style={{ fontSize: 8, color: MUTED, fontFamily: "var(--font-montserrat),sans-serif", letterSpacing: ".07em", textTransform: "uppercase", marginBottom: 5 }}>
            OHLC · {row.ticker} · Daily
          </div>
          <MobileCandleChart ticker={row.ticker} />

          {activeEq.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 8, color: MUTED, fontFamily: "var(--font-montserrat),sans-serif", letterSpacing: ".07em", textTransform: "uppercase", marginBottom: 3 }}>
                {isSynth ? "Equity (Sim)" : "Equity OOS"}
              </div>
              <ResponsiveContainer width="100%" height={72}>
                <AreaChart data={activeEq.map(p => ({ t: p.time.slice(0,7), v: Math.round(p.value*100)/100 }))} margin={CM}>
                  <defs><linearGradient id="mxeq" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#fff" stopOpacity={0.12}/><stop offset="95%" stopColor="#fff" stopOpacity={0.01}/></linearGradient></defs>
                  <YAxis tick={TICK} tickLine={false} axisLine={false} width={34} tickFormatter={(v: number) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : `${v.toFixed(0)}`} />
                  <Tooltip contentStyle={{ background: "#1c1d20", border: `1px solid ${CBORD}`, borderRadius: 8, fontSize: 10 }}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={(v: any) => [`$${Number(v??0).toLocaleString("de",{maximumFractionDigits:0})}`, "Equity"]} />
                  <Area type="monotone" dataKey="v" stroke="#fff" strokeWidth={1.4} strokeOpacity={0.75} fill="url(#mxeq)" dot={false} activeDot={{ r: 2, fill: "#fff", strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {activeDd.length > 0 && (
            <div style={{ marginTop: 4 }}>
              <div style={{ fontSize: 8, color: MUTED, fontFamily: "var(--font-montserrat),sans-serif", letterSpacing: ".07em", textTransform: "uppercase", marginBottom: 3 }}>Drawdown</div>
              <ResponsiveContainer width="100%" height={48}>
                <AreaChart data={activeDd.map(p => ({ t: p.time.slice(0,7), v: Math.round(p.value*100)/100 }))} margin={CMX}>
                  <defs><linearGradient id="mxdd" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={GOLD} stopOpacity={0.28}/><stop offset="95%" stopColor={GOLD} stopOpacity={0.02}/></linearGradient></defs>
                  <XAxis dataKey="t" tick={TICK} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis tick={TICK} tickLine={false} axisLine={false} width={34} tickFormatter={(v: number) => `${v.toFixed(0)}%`} />
                  <Tooltip contentStyle={{ background: "#1c1d20", border: `1px solid ${CBORD}`, borderRadius: 8, fontSize: 10 }}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={(v: any) => [`${Number(v??0).toFixed(2)}%`, "DD"]} />
                  <Area type="monotone" dataKey="v" stroke={GOLD} strokeWidth={1.2} fill="url(#mxdd)" dot={false} activeDot={{ r: 2, fill: GOLD, strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* 3×2 KPI grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 5, marginTop: 10 }}>
            {kpi6.map(k => (
              <div key={k.label} style={{ background: CARD, border: `1px solid ${CBORD}`, borderRadius: 9, padding: "7px 9px" }}>
                <div style={{ fontSize: 8, fontWeight: 600, color: MUTED, letterSpacing: ".06em", textTransform: "uppercase", fontFamily: "var(--font-montserrat),sans-serif", marginBottom: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{k.label}</div>
                <div style={{ fontSize: 13, fontWeight: 700, fontFamily: "var(--font-montserrat),sans-serif", color: strNumColor(k.value) }}>{k.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "info" && (
        <div style={{ padding: "10px 12px 14px", display: "flex", flexDirection: "column", gap: 7 }}>
          <InfoBox title="Asset & Strategie" items={[
            { k: "Asset", v: row.label },{ k: "Ticker", v: row.ticker },
            { k: "Exchange", v: row.exchange ?? "—" },{ k: "Pillar", v: row.pillarLabel },
            { k: "Engine", v: row.engine },{ k: "Richtung", v: dir },
          ]} />
          <InfoBox title="Performance OOS" items={[
            { k: "Sharpe OOS", v: fmtN(sharpeV) },{ k: "CAGR OOS", v: row.cagr ?? "—" },
            { k: "Max DD", v: row.maxDd ?? "—" },{ k: "Calmar/MAR", v: fmtN(calmarV) },
            { k: "Profit Factor", v: fmtN(pfV) },
          ]} />
          <InfoBox title="Handel & Statistik" items={[
            { k: "# Trades", v: tradesV != null ? String(tradesV) : "—" },
            { k: "Win Rate", v: wrV != null ? `${Number(wrV).toFixed(1)}%` : "—" },
            { k: "WF / OOS", v: row.wfWin ?? "—" },
            { k: "Final Equity", v: oos?.finalEquity != null ? `${oos.finalEquity.toFixed(0)}` : "—" },
          ]} />
          <InfoBox title="Kontext & Zeitraum" items={[
            { k: "Status", v: row.status },{ k: "Beschreibung", v: pillarDesc(row.pillarKey) },
            ...(row.isNotes ? [{ k: "Notiz", v: row.isNotes }] : []),
          ]} />
        </div>
      )}
    </div>
  );
}

// ── Clickable column header with aggregate + sort ─────────────────────────────
function ColHeader({ label, agg, k, sortKey, sortDir, onSort, w, align = "left" }: {
  label: string; agg: string; k: SortKey; sortKey: SortKey; sortDir: SortDir;
  onSort: (k: SortKey) => void; w: string; align?: "left"|"right";
}) {
  const active = sortKey === k;
  return (
    <div onClick={() => onSort(k)} style={{ width: w, flexShrink: 0, paddingRight: 4, cursor: "pointer", userSelect: "none", textAlign: align }}>
      <div style={{ fontSize: 8, fontWeight: 600, color: active ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.32)", letterSpacing: ".05em", fontFamily: "var(--font-montserrat),sans-serif", marginBottom: 1, whiteSpace: "nowrap" }}>{agg}</div>
      <div style={{ fontSize: 8, fontWeight: 700, color: active ? "rgba(255,255,255,0.65)" : MUTED, letterSpacing: ".08em", textTransform: "uppercase", fontFamily: "var(--font-montserrat),sans-serif", display: "flex", alignItems: "center", gap: 2, justifyContent: align === "right" ? "flex-end" : "flex-start" }}>
        {label}
        {active && <span style={{ opacity: 0.6, fontSize: 8 }}>{sortDir === "desc" ? "↓" : "↑"}</span>}
      </div>
    </div>
  );
}

// ── Strategy row ──────────────────────────────────────────────────────────────
function StrategyRow({ row, num, liveData, liveOn }: {
  row: DisplayRow; num: number;
  liveData: Map<string, LiveFeedItem>; liveOn: boolean;
}) {
  const [open, setOpen] = useState(false);
  const iconSrc = TICKER_ICON[row.ticker];
  const live = liveOn ? matchLive(row.ticker, liveData) : null;

  return (
    <div style={{ borderBottom: `1px solid ${RBORD}` }}>
      <button onClick={() => setOpen(v => !v)} style={{
        width: "100%", background: "none", border: "none", cursor: "pointer",
        padding: "9px 12px", textAlign: "left", WebkitTapHighlightColor: "transparent",
      }}>
        {/* ticker row */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.55)", fontFamily: "var(--font-montserrat),sans-serif", width: 18, flexShrink: 0, textAlign: "right" }}>{num}</span>
          {iconSrc && <img src={iconSrc} alt="" width={15} height={15} style={{ width: 15, height: 15, objectFit: "contain", borderRadius: 3, flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />}
          <span style={{ fontSize: 12, fontWeight: 700, fontFamily: "var(--font-montserrat),sans-serif", color: "#fff", flexShrink: 0 }}>{row.ticker}</span>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontFamily: "var(--font-montserrat),sans-serif", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{row.label}</span>
          <Chip status={row.status} />
          <svg width={10} height={10} viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0, marginLeft: 2, transform: open ? "rotate(180deg)" : "none", transition: "transform .18s", color: MUTED }}>
            <path d="M1.5 3l3.5 3.5L8.5 3" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        {/* metric columns */}
        <div style={{ display: "flex", alignItems: "flex-end", paddingLeft: 20 }}>
          <MCol label="Pillar"  value={row.pillarLabel} w="22%" dim />
          <MCol label="Gew."   value={row.weight != null ? `${row.weight}%` : "—"} w="11%" />
          <MCol label="Sharpe" value={row.sharpeOos != null ? row.sharpeOos.toFixed(2) : "—"} w="14%" />
          <MCol label="CAGR"   value={row.cagr ?? "—"} w="15%" color={strNumColor(row.cagr)} />
          <MCol label="Max DD" value={row.maxDd ?? "—"} w="17%" color={strNumColor(row.maxDd)} />
          <MCol label="PF"     value={row.pf != null ? row.pf.toFixed(2) : "—"} w="12%" />
          <MCol label="Trades" value={row.trades != null ? String(row.trades) : "—"} w="9%" />
        </div>
        {/* live row */}
        {liveOn && (
          <div style={{ display: "flex", alignItems: "flex-end", paddingLeft: 20, marginTop: 5 }}>
            <MCol label="Preis" value={live?.lastClose != null ? fmtPrice(live.lastClose, row.ticker) : "—"} w="25%" />
            <MCol label="Δ%" value={live?.changePct != null ? `${live.changePct >= 0 ? "+" : ""}${live.changePct.toFixed(2)}%` : "—"} w="20%"
              color={live?.changePct != null ? (live.changePct >= 0 ? "rgba(255,255,255,0.8)" : GOLD) : undefined} />
            <MCol label="WF/Win%" value={row.wfWin ?? "—"} w="22%" />
          </div>
        )}
      </button>
      {open && <ExpandedPanel row={row} />}
    </div>
  );
}

function MCol({ label, value, w, color, dim }: { label: string; value: string; w: string; color?: string; dim?: boolean }) {
  return (
    <div style={{ width: w, flexShrink: 0, paddingRight: 4 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: dim ? "rgba(255,255,255,0.5)" : (color ?? "rgba(255,255,255,0.78)"), fontFamily: "var(--font-montserrat),sans-serif", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
    </div>
  );
}

// ── ToggleBtn ─────────────────────────────────────────────────────────────────
function ToggleBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      fontSize: 10, fontWeight: 600, color: active ? "#fff" : MUTED,
      background: active ? "rgba(255,255,255,0.08)" : "transparent",
      border: `1px solid ${active ? "rgba(255,255,255,0.22)" : RBORD}`,
      borderRadius: 20, padding: "4px 11px", cursor: "pointer",
      fontFamily: "var(--font-montserrat),sans-serif", letterSpacing: ".07em",
      textTransform: "uppercase", WebkitTapHighlightColor: "transparent",
      flexShrink: 0, whiteSpace: "nowrap",
    }}>
      {children}
    </button>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────
export function MobileKomponentenView() {
  const [portfolio, setPortfolio] = useState<Portfolio>("ws");
  const [pillarFilter, setPillarFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("weight");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [liveOn, setLiveOn] = useState(false);
  const [liveData, setLiveData] = useState<Map<string, LiveFeedItem>>(new Map());
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!liveOn) return;
    const fetchLive = () => {
      fetch("/api/monitoring/live-feed")
        .then(r => r.json())
        .then((d: unknown) => {
          const items: LiveFeedItem[] = Array.isArray(d) ? d as LiveFeedItem[] : ((d as { items?: LiveFeedItem[] }).items ?? []);
          const m = new Map<string, LiveFeedItem>();
          items.forEach(i => m.set(i.symbol, i));
          setLiveData(m);
        }).catch(() => {});
    };
    fetchLive();
    const id = setInterval(fetchLive, 30_000);
    return () => clearInterval(id);
  }, [liveOn]);

  const handleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortKey(k); setSortDir("desc"); }
  };

  const rawRows = portfolio === "ws" ? WS_ROWS : CI_ROWS;
  const kpis    = portfolio === "ws" ? WS_KPIS : CI_KPIS;

  const pillars = portfolio === "ws"
    ? ["all", "valuation", "macro", "trend", "seasonal", "anomaly", "intraday"]
    : ["all", "etf-core", "strategy-sleeve"];

  const pillarLabel: Record<string, string> = {
    all: "Alle", valuation: "Valuation", macro: "Macro", trend: "Trend",
    seasonal: "Seasonal", anomaly: "Anomaly", intraday: "Intraday",
    "etf-core": "ETF-Core", "strategy-sleeve": "Sleeve",
  };

  const filtered = sortRows(
    rawRows.filter(r => {
      if (r.status === "archived") return false;
      if (pillarFilter !== "all" && r.pillarKey !== pillarFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return r.ticker.toLowerCase().includes(q) || r.label.toLowerCase().includes(q);
      }
      return true;
    }),
    sortKey, sortDir,
  );

  // aggregates for column headers
  const nums = (fn: (r: DisplayRow) => number | null) => filtered.map(fn).filter((v): v is number => v !== null);
  const avg = (arr: number[]) => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2) : "—";
  const sum = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0).toFixed(0) : "—";
  const parseNum = (s: string | null) => { const v = parseFloat((s ?? "").replace(/[^0-9.-]/g, "")); return isFinite(v) ? v : null; };

  const aggWeight  = sum(nums(r => r.weight));
  const aggSharpe  = avg(nums(r => r.sharpeOos));
  const aggCagr    = avg(nums(r => parseNum(r.cagr)));
  const aggMaxDd   = avg(nums(r => parseNum(r.maxDd)));
  const aggPf      = avg(nums(r => r.pf));
  const aggTrades  = sum(nums(r => r.trades));

  const pillarsWithSearch = (
    <div style={{ position: "relative" }}>
      {/* pill row: mini search | Alle | … (scrollable with fade) */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", position: "relative" }}>
        {/* mini search input */}
        <div style={{ flexShrink: 0, position: "relative", width: 90 }}>
          <input
            type="search"
            placeholder="Suchen…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: "100%", boxSizing: "border-box",
              background: "rgba(255,255,255,0.05)", border: `1px solid ${RBORD}`,
              borderRadius: 20, padding: "4px 8px 4px 22px",
              fontSize: 10, color: "#fff", fontFamily: "var(--font-montserrat),sans-serif",
              outline: "none", appearance: "none",
            }}
          />
          <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            style={{ position: "absolute", left: 7, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
        </div>

        {/* scrollable pills with right fade */}
        <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none", paddingRight: 20 } as React.CSSProperties}>
            {pillars.map(p => (
              <button key={p} onClick={() => setPillarFilter(p)}
                style={{
                  flexShrink: 0, fontSize: 10, fontWeight: 600,
                  letterSpacing: ".07em", textTransform: "uppercase",
                  fontFamily: "var(--font-montserrat),sans-serif",
                  padding: "4px 11px", borderRadius: 20, cursor: "pointer",
                  background: pillarFilter === p ? "rgba(255,255,255,0.07)" : "transparent",
                  border: `1px solid ${pillarFilter === p ? "rgba(255,255,255,0.18)" : RBORD}`,
                  color: pillarFilter === p ? "#fff" : MUTED,
                  WebkitTapHighlightColor: "transparent",
                }}>
                {pillarLabel[p] ?? p}
              </button>
            ))}
          </div>
          {/* right fade */}
          <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 24, background: `linear-gradient(to right, transparent, ${BG})`, pointerEvents: "none" }} />
        </div>

        {/* live toggle */}
        <ToggleBtn active={liveOn} onClick={() => setLiveOn(v => !v)}>
          {liveOn ? "● Live" : "Live"}
        </ToggleBtn>
      </div>
    </div>
  );

  // two-row height ≈ 90px used for bottom fade overlap
  const NAV_H = "calc(76px + env(safe-area-inset-bottom, 34px))";
  const FADE_H = 90; // px — ~2 list rows

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: BG, overflow: "hidden" }}>

      {/* ── STICKY HEADER (never scrolls) ─────────────────────────────────── */}
      <div style={{ flexShrink: 0, background: BG, zIndex: 10 }}>

        {/* Portfolio tabs */}
        <div style={{ display: "flex", borderBottom: `1px solid ${RBORD}` }}>
          {([
            { id: "ws", label: "White Swan",  logo: "/branding/white-swan-icon.png" },
            { id: "ci", label: "Core Invest", logo: "/branding/capitalife-favicon.png" },
          ] as { id: Portfolio; label: string; logo: string }[]).map(p => (
            <button key={p.id}
              onClick={() => { setPortfolio(p.id); setPillarFilter("all"); setSortKey("weight"); setSortDir("desc"); }}
              style={{
                flex: 1, padding: "11px 0", fontSize: 11, fontWeight: 700,
                fontFamily: "var(--font-montserrat),sans-serif", letterSpacing: ".07em",
                textTransform: "uppercase", border: "none", cursor: "pointer", background: "none",
                color: portfolio === p.id ? "#fff" : MUTED,
                borderBottom: `2px solid ${portfolio === p.id ? "rgba(255,255,255,0.5)" : "transparent"}`,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                WebkitTapHighlightColor: "transparent",
              }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.logo} alt="" width={16} height={16}
                style={{ width: 16, height: 16, objectFit: "contain", opacity: portfolio === p.id ? 1 : 0.35, flexShrink: 0 }} />
              {p.label}
            </button>
          ))}
        </div>

        {/* KPI strip — 5 cards, full width grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6, padding: "18px 10px 0" }}>
          {kpis.map(k => (
            <div key={k.label} style={{ background: CARD, border: `1px solid ${CBORD}`, borderRadius: 10, padding: "7px 8px" }}>
              <div style={{ fontSize: 7, fontWeight: 600, color: MUTED, letterSpacing: ".06em", textTransform: "uppercase", fontFamily: "var(--font-montserrat),sans-serif", marginBottom: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{k.label}</div>
              <div style={{ fontSize: 13, fontWeight: 700, fontFamily: "var(--font-montserrat),sans-serif", color: "#fff", letterSpacing: "-.02em", lineHeight: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{k.value}</div>
            </div>
          ))}
        </div>

        {/* Filter pills + mini search + live — more spacing above */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "16px 12px 10px" }}>
          {/* mini search */}
          <div style={{ flexShrink: 0, position: "relative", width: 90 }}>
            <input type="search" placeholder="Suchen…" value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: "100%", boxSizing: "border-box",
                background: "rgba(255,255,255,0.05)", border: `1px solid ${RBORD}`,
                borderRadius: 20, padding: "4px 8px 4px 22px",
                fontSize: 10, color: "#fff", fontFamily: "var(--font-montserrat),sans-serif",
                outline: "none", appearance: "none",
              }}
            />
            <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              style={{ position: "absolute", left: 7, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </div>

          {/* scrollable pills with right fade */}
          <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none", paddingRight: 20 } as React.CSSProperties}>
              {pillars.map(p => (
                <button key={p} onClick={() => setPillarFilter(p)}
                  style={{
                    flexShrink: 0, fontSize: 10, fontWeight: 600,
                    letterSpacing: ".07em", textTransform: "uppercase",
                    fontFamily: "var(--font-montserrat),sans-serif",
                    padding: "4px 11px", borderRadius: 20, cursor: "pointer",
                    background: pillarFilter === p ? "rgba(255,255,255,0.07)" : "transparent",
                    border: `1px solid ${pillarFilter === p ? "rgba(255,255,255,0.18)" : RBORD}`,
                    color: pillarFilter === p ? "#fff" : MUTED,
                    WebkitTapHighlightColor: "transparent",
                  }}>
                  {pillarLabel[p] ?? p}
                </button>
              ))}
            </div>
            <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 24, background: `linear-gradient(to right, transparent, ${BG})`, pointerEvents: "none" }} />
          </div>

          {/* live toggle */}
          <ToggleBtn active={liveOn} onClick={() => setLiveOn(v => !v)}>
            {liveOn ? "● Live" : "Live"}
          </ToggleBtn>
        </div>

        {/* Column headers — more gap above table */}
        <div style={{ display: "flex", alignItems: "flex-end", padding: "2px 12px 7px", paddingLeft: 44, borderBottom: `1px solid ${RBORD}` }}>
          <ColHeader label="Pillar"  agg={`${filtered.length}`}              k="weight"   sortKey={sortKey} sortDir={sortDir} onSort={handleSort} w="22%" />
          <ColHeader label="Gew."   agg={aggWeight ? `${aggWeight}%` : "—"}  k="weight"   sortKey={sortKey} sortDir={sortDir} onSort={handleSort} w="11%" />
          <ColHeader label="Sharpe" agg={aggSharpe}                          k="sharpeOos" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} w="14%" />
          <ColHeader label="CAGR"   agg={aggCagr ? `${aggCagr}%` : "—"}     k="cagr"      sortKey={sortKey} sortDir={sortDir} onSort={handleSort} w="15%" />
          <ColHeader label="Max DD" agg={aggMaxDd ? `${aggMaxDd}%` : "—"}   k="maxDd"     sortKey={sortKey} sortDir={sortDir} onSort={handleSort} w="17%" />
          <ColHeader label="PF"     agg={aggPf}                              k="pf"        sortKey={sortKey} sortDir={sortDir} onSort={handleSort} w="12%" />
          <ColHeader label="Trades" agg={aggTrades}                          k="trades"    sortKey={sortKey} sortDir={sortDir} onSort={handleSort} w="9%" />
        </div>

        {/* subtle bottom fade so rows dissolve as they slide behind header */}
        <div style={{ height: 16, background: `linear-gradient(to bottom, ${BG} 30%, transparent)`, marginBottom: -16, position: "relative", zIndex: 2, pointerEvents: "none" }} />
      </div>

      {/* ── SCROLLABLE LIST ────────────────────────────────────────────────── */}
      <div style={{
        flex: 1,
        overflowY: "auto",
        overflowX: "hidden",
        // hide scrollbar cross-browser
        scrollbarWidth: "none",
        msOverflowStyle: "none",
        WebkitOverflowScrolling: "touch",
      } as React.CSSProperties}>
        <style>{`::-webkit-scrollbar{display:none}`}</style>

        {filtered.map((row, i) => (
          <StrategyRow key={row.id} row={row} num={i + 1} liveData={liveData} liveOn={liveOn} />
        ))}
        {filtered.length === 0 && (
          <div style={{ padding: "40px 24px", textAlign: "center", fontSize: 12, color: MUTED, fontFamily: "var(--font-montserrat),sans-serif" }}>
            Keine Strategien gefunden
          </div>
        )}

        {/* bottom spacer so last rows aren't hidden under nav + fade */}
        <div style={{ height: `calc(${NAV_H} + ${FADE_H}px)` }} />
      </div>

      {/* ── BOTTOM FADE — ~2 row heights, very subtle ──────────────────────── */}
      <div style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        height: `calc(${NAV_H} + ${FADE_H}px)`,
        background: `linear-gradient(to bottom, transparent 0%, rgba(12,13,16,0.4) 45%, ${BG} 90%)`,
        pointerEvents: "none",
        zIndex: 6,
      }} />
    </div>
  );
}
