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

const TICKER_VON: Record<string, string> = {
  "CT1!":"01.01.1970","ZC1!":"01.01.1970","SB1!":"01.01.1970","OJ1!":"01.01.1970",
  "ZW1!":"01.01.1970","ZS1!":"01.01.1970","CC1!":"01.01.1970","KC1!":"01.01.1970",
  "GC1!":"01.01.1975","SI1!":"01.01.1975","HG1!":"01.01.1988",
  "CL1!":"01.01.1983","NG1!":"01.01.1991",
  "ES1!":"01.01.1993","NQ1!":"01.01.1996","YM1!":"01.01.1997",
  "FDAX1!":"01.01.2000","UKX!":"01.01.2001",
  "6E1!":"13.01.2003","6S1!":"01.01.2003",
  "GOOGL":"19.08.2004","AAPL":"12.12.1980","MSFT":"13.03.1986","NVDA":"22.01.1999",
  "META":"18.05.2012","AMZN":"15.05.1997",
  "QQQ":"10.03.1999","SPY":"22.01.1993","GLD":"18.11.2004",
  "ZARUSD":"01.01.2003","SEKUSD":"01.01.2003","BRLUSD":"01.01.2003",
};

const OHLC_SYMBOL: Record<string, string> = {
  "DAX 1H / MT":"FDAX1!","DAX 2H":"FDAX1!","GBPUSD 30M":"6B1!","GLD":"GC1!",
};
function toOhlcSymbol(ticker: string): string {
  return OHLC_SYMBOL[ticker] ?? ticker.split(" ")[0];
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
  id: string; title: string;
  oos: { curve: IntradayCurvePoint[]; stats: { cagr: number; maxDD: number; mar?: number; sharpe: number; pf: number; n: number; wr: number } };
}

// ── helpers ───────────────────────────────────────────────────────────────────
const fmtN = (v: number | null, d = 2) => v === null ? "—" : v.toFixed(d);
function strNumColor(s: string | null): string {
  if (!s || s === "—") return "rgba(255,255,255,0.2)";
  if (s.startsWith("−") || s.startsWith("-")) return GOLD;
  return "rgba(255,255,255,0.8)";
}

function syntheticCurves(cagrStr: string | null, maxDdStr: string | null): { eq: EP[]; dd: EP[] } | null {
  const cagrPct = parseFloat((cagrStr ?? "").replace(/[^0-9.-]/g, ""));
  const ddPct   = Math.abs(parseFloat((maxDdStr ?? "").replace(/[^0-9.-]/g, "")));
  if (!isFinite(cagrPct) || !isFinite(ddPct)) return null;
  const monthlyRate = Math.pow(1 + cagrPct / 100, 1 / 12) - 1;
  const eq: EP[] = []; const dd: EP[] = [];
  let equity = 10000; let peak = 10000;
  const startY = 2019; const startM = 1;
  const now = new Date(); const endY = now.getFullYear(); const endM = now.getMonth() + 1;
  for (let y = startY, m = startM; y < endY || (y === endY && m <= endM); ) {
    const idx = (y - startY) * 12 + (m - 1);
    const wave = Math.sin(idx * 0.41) * 0.008 + Math.sin(idx * 1.17) * 0.004;
    equity = equity * (1 + monthlyRate + wave);
    if (equity > peak) peak = equity;
    const drawdown = peak > 0 ? ((peak - equity) / peak) * -100 : 0;
    const scaledDd = Math.max(-ddPct, drawdown);
    const time = `${y}-${String(m).padStart(2, "0")}-01`;
    eq.push({ time, value: Math.round(equity) });
    dd.push({ time, value: Math.round(scaledDd * 100) / 100 });
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

function pillarDescription(pillar: string): string {
  switch (pillar) {
    case "valuation": return "Fundamentale Überbewertung / Unterbewertung als Einstiegssignal.";
    case "macro":     return "Makroökonomischer Filter. Hält Positionen über Wochen.";
    case "trend":     return "EMA-basierter Trendfolge-Ansatz.";
    case "seasonal":  return "Kalender-basiertes Muster (festes Datum Ein-/Ausstieg).";
    case "anomaly":   return "Wochentagsanomalie. Marktstruktur-basiert.";
    case "intraday":  return "Intraday Mean-Reversion / Momentum. Keine Overnight-Positionen.";
    default:          return "Multi-Asset Strategie.";
  }
}

// ── sub-components ─────────────────────────────────────────────────────────────

function Chip({ status }: { status: string }) {
  const cfg: Record<string, { label: string; c: string }> = {
    active:         { label: "Aktiv",      c: "rgba(255,255,255,0.5)" },
    watch:          { label: "Watch",      c: GOLD },
    archived:       { label: "Archiviert", c: "rgba(255,255,255,0.15)" },
    research:       { label: "Research",   c: "rgba(255,255,255,0.3)" },
    validation:     { label: "Validation", c: "rgba(255,255,255,0.45)" },
    parity_pending: { label: "Pending",    c: GOLD },
  };
  const s = cfg[status] ?? { label: status, c: MUTED };
  return (
    <span style={{ fontSize: 10, fontWeight: 600, color: s.c, display: "inline-flex", alignItems: "center", gap: 3, fontFamily: "var(--font-montserrat),sans-serif" }}>
      <span style={{ width: 4, height: 4, borderRadius: "50%", background: s.c, flexShrink: 0 }} />
      {s.label}
    </span>
  );
}

function MiniEqChart({ pts, isSynth }: { pts: EP[]; isSynth: boolean }) {
  const d = pts.map(p => ({ t: p.time.slice(0, 7), v: Math.round(p.value * 100) / 100 }));
  const vals = d.map(p => p.v);
  const mn = Math.min(...vals); const mx = Math.max(...vals);
  return (
    <ResponsiveContainer width="100%" height={60}>
      <AreaChart data={d} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="meqg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#fff" stopOpacity={isSynth ? 0.06 : 0.12}/>
            <stop offset="95%" stopColor="#fff" stopOpacity={0.01}/>
          </linearGradient>
        </defs>
        <YAxis domain={[mn * 0.99, mx * 1.01]} hide />
        <Area type="monotone" dataKey="v" stroke={isSynth ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.65)"}
          strokeWidth={1.2} strokeDasharray={isSynth ? "3 3" : undefined}
          fill="url(#meqg)" dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function MiniDdChart({ pts }: { pts: EP[] }) {
  const d = pts.map(p => ({ t: p.time.slice(0, 7), v: Math.round(p.value * 100) / 100 }));
  const vals = d.map(p => p.v);
  const mn = Math.min(...vals, -0.01);
  return (
    <ResponsiveContainer width="100%" height={36}>
      <AreaChart data={d} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="mddg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={GOLD} stopOpacity={0.25}/>
            <stop offset="95%" stopColor={GOLD} stopOpacity={0.02}/>
          </linearGradient>
        </defs>
        <YAxis domain={[mn * 1.1, 0]} hide />
        <Area type="monotone" dataKey="v" stroke={GOLD} strokeWidth={1} fill="url(#mddg)" dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ── CandleChart (mobile — height 200) ─────────────────────────────────────────
function MobileCandleChart({ ticker }: { ticker: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const sym = toOhlcSymbol(ticker);
  const cacheKey = sym + ":1D";
  const cached = OHLC_CACHE.get(cacheKey);
  const [bars, setBars] = useState<OhlcBar[] | null>(cached ? cached.bars : null);

  useEffect(() => {
    if (!cached || Date.now() - cached.ts > OHLC_CACHE_TTL) {
      fetch(`/api/monitoring/ohlc?symbol=${encodeURIComponent(sym)}&timeframe=1D`)
        .then(r => r.json())
        .then(d => {
          const b: OhlcBar[] = Array.isArray(d.bars) && d.bars.length ? d.bars : [];
          OHLC_CACHE.set(cacheKey, { bars: b, ts: Date.now() });
          setBars(b);
        })
        .catch(() => { if (!OHLC_CACHE.has(cacheKey)) setBars([]); });
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
        width: el.clientWidth, height: 200,
        layout: { background: { type: ColorType.Solid, color: BG }, textColor: "rgba(228,236,248,0.68)", fontSize: 9, attributionLogo: false },
        grid: { vertLines: { visible: false }, horzLines: { visible: false } },
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: { borderVisible: false, textColor: "rgba(228,236,248,0.68)" },
        timeScale: { borderVisible: false, timeVisible: false, rightOffset: 2 },
        handleScroll: { mouseWheel: false, pressedMouseMove: true },
        handleScale: { mouseWheel: false, pinch: true },
      });
      const series = chart.addSeries(CandlestickSeries, {
        upColor: "#FFFFFF", downColor: "#D6B44B",
        borderVisible: false, wickUpColor: "#FFFFFF", wickDownColor: "#D6B44B",
        priceLineVisible: false, lastValueVisible: false,
      });
      const pre = bars.filter((b: OhlcBar) =>
        b.time >= "2019-01-01" && (b.high - b.low) / Math.max(b.close, 0.0001) > 0.0002
      );
      const filtered = pre.filter((b: OhlcBar, i: number) => {
        if (i === 0) return true;
        const prev = pre[i - 1];
        return Math.abs(b.open - prev.close) / Math.max(prev.close, 0.0001) < 0.40;
      });
      series.setData(filtered);
      const total = filtered.length;
      if (total > 20) chart.timeScale().setVisibleLogicalRange({ from: total - 20, to: total + 2 });
      else chart.timeScale().fitContent();
      const lastBar = filtered[filtered.length - 1];
      if (lastBar?.close) {
        series.createPriceLine({ price: lastBar.close, color: "rgba(255,255,255,0.40)", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "" });
      }
    });

    return () => {
      destroyed = true;
      if (chart) { try { chart.remove(); } catch { /* ignore */ } }
    };
  }, [bars]);

  if (bars === null) return (
    <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "rgba(255,255,255,0.2)", fontFamily: "var(--font-montserrat),sans-serif", background: BG, borderRadius: 6 }}>
      Lade OHLC…
    </div>
  );
  if (!bars.length) return (
    <div style={{ height: 60, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "rgba(255,255,255,0.15)", fontFamily: "var(--font-montserrat),sans-serif" }}>
      Keine OHLC-Daten
    </div>
  );
  return <div ref={ref} style={{ width: "100%", height: 200, borderRadius: 6, overflow: "hidden", background: BG }} />;
}

// ── Expanded detail panel ─────────────────────────────────────────────────────
function ExpandedPanel({ row }: { row: DisplayRow }) {
  const [data, setData]         = useState<StrategyData | null>(null);
  const [intraday, setIntraday] = useState<IntradayStrategy | null>(null);
  const [codexEq, setCodexEq]   = useState<EP[] | null>(null);
  const [codexDd, setCodexDd]   = useState<EP[] | null>(null);
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
    fetch(`/api/monitoring/codex-equity-curve?group=${g}&symbol=${s}&type=drawdown`)
      .then(r => r.json())
      .then((d: { rows?: Array<{ date: string; value: number }> }) => {
        if (d.rows?.length) setCodexDd(d.rows.map(p => ({ time: p.date.length === 7 ? p.date + "-01" : p.date, value: p.value })));
      }).catch(() => {});
  }, [row.codexGroup, row.codexSymbol, row.dataFile, row.intradayId]);

  useEffect(() => {
    if (!row.intradayId || row.dataFile) return;
    fetch("/data/intraday-equity.json")
      .then(r => r.json())
      .then((d: { strategies: IntradayStrategy[] }) => {
        const s = d.strategies.find(x => x.id === row.intradayId);
        setIntraday(s ?? null);
      }).catch(() => {});
  }, [row.intradayId, row.dataFile]);

  const eqOos = data?.equityCurve?.oos;
  const ddOos = data?.drawdownCurve?.oos;
  const oos   = data?.summary?.oos;
  const ist   = intraday?.oos?.stats;

  const intradayEq: EP[] | null = intraday?.oos?.curve?.length
    ? intraday.oos.curve.map(p => ({ time: p.date + "-01", value: p.equity }))
    : null;

  const hasRealEq = (eqOos?.length ?? 0) > 0 || (codexEq?.length ?? 0) > 0 || (intradayEq?.length ?? 0) > 0;
  const synthAll  = syntheticCurves(row.cagr, row.maxDd);
  const activeEq: EP[] = eqOos?.length ? eqOos : intradayEq?.length ? intradayEq : codexEq?.length ? codexEq : synthAll?.eq ?? [];
  const activeDd: EP[] = (() => {
    if (!activeEq.length) return synthAll?.dd ?? [];
    let peak = activeEq[0]?.value ?? 0;
    return activeEq.map(p => {
      if (p.value > peak) peak = p.value;
      const dd = peak > 0 ? ((p.value - peak) / peak) * 100 : 0;
      return { time: p.time, value: Math.round(dd * 100) / 100 };
    });
  })();
  const isSynthetic = !hasRealEq;

  // KPIs
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
  if (ist?.wr != null)                 kpis.push({ label: "Win Rate",      value: `${(ist.wr * 100).toFixed(1)}%` });
  else if (oos?.winRate != null)       kpis.push({ label: "Win Rate",      value: `${oos.winRate.toFixed(1)}%` });

  const dir = inferDirection(row.engine);
  const pfV  = row.pf ?? ist?.pf ?? oos?.profitFactor ?? null;
  const tradesV = row.trades ?? ist?.n ?? oos?.tradeCount ?? null;
  const wrV = ist?.wr != null ? ist.wr * 100 : oos?.winRate ?? null;
  const calmarV = ist?.mar ?? row.calmar ?? null;
  const sharpeV = row.sharpeOos ?? ist?.sharpe ?? null;

  const tabStyle = (t: "charts"|"info") => ({
    flex: 1, padding: "8px 0", fontSize: 10, fontWeight: 600,
    fontFamily: "var(--font-montserrat),sans-serif", letterSpacing: ".07em",
    textTransform: "uppercase" as const, cursor: "pointer", border: "none",
    background: "none", color: tab === t ? "#fff" : MUTED,
    borderBottom: `1px solid ${tab === t ? "rgba(255,255,255,0.4)" : RBORD}`,
  });

  return (
    <div style={{ background: "rgba(0,0,0,0.3)", borderTop: `1px solid ${RBORD}` }}>
      {/* Tab bar */}
      <div style={{ display: "flex", borderBottom: `1px solid ${RBORD}` }}>
        <button style={tabStyle("charts")} onClick={() => setTab("charts")}>Charts & KPIs</button>
        <button style={tabStyle("info")} onClick={() => setTab("info")}>Strategie-Info</button>
      </div>

      {tab === "charts" && (
        <div style={{ padding: "12px 12px 16px" }}>
          {/* OHLC */}
          <div style={{ fontSize: 9, color: MUTED, fontFamily: "var(--font-montserrat),sans-serif", letterSpacing: ".07em", textTransform: "uppercase", marginBottom: 6 }}>
            OHLC · {row.ticker} · Daily
          </div>
          <MobileCandleChart ticker={row.ticker} />

          {/* Equity */}
          {activeEq.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 9, color: MUTED, fontFamily: "var(--font-montserrat),sans-serif", letterSpacing: ".07em", textTransform: "uppercase", marginBottom: 4 }}>
                {isSynthetic ? "Equity (Sim)" : "Equity OOS"}
              </div>
              <ResponsiveContainer width="100%" height={90}>
                <AreaChart data={activeEq.map(p => ({ t: p.time.slice(0, 7), v: Math.round(p.value * 100) / 100 }))} margin={{ top: 2, right: 40, bottom: 0, left: 0 }}>
                  <defs><linearGradient id="expeqg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#fff" stopOpacity={0.12}/><stop offset="95%" stopColor="#fff" stopOpacity={0.01}/></linearGradient></defs>
                  <YAxis tick={{ fill: "rgba(255,255,255,0.28)", fontSize: 8 }} tickLine={false} axisLine={false} width={36}
                    orientation="left"
                    tickFormatter={(v: number) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : `${v.toFixed(0)}`} />
                  <Tooltip contentStyle={{ background: "#1c1d20", border: `1px solid ${CBORD}`, borderRadius: 8, fontSize: 10 }}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={(v: any) => [`$${Number(v ?? 0).toLocaleString("de", { maximumFractionDigits: 0 })}`, "Equity"]} />
                  <Area type="monotone" dataKey="v" stroke="#fff" strokeWidth={1.5} strokeOpacity={0.75} fill="url(#expeqg)" dot={false} activeDot={{ r: 3, fill: "#fff", strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Drawdown */}
          {activeDd.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 9, color: MUTED, fontFamily: "var(--font-montserrat),sans-serif", letterSpacing: ".07em", textTransform: "uppercase", marginBottom: 4 }}>
                Drawdown
              </div>
              <ResponsiveContainer width="100%" height={64}>
                <AreaChart data={activeDd.map(p => ({ t: p.time.slice(0, 7), v: Math.round(p.value * 100) / 100 }))} margin={{ top: 0, right: 40, bottom: 0, left: 0 }}>
                  <defs><linearGradient id="expddg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={GOLD} stopOpacity={0.28}/><stop offset="95%" stopColor={GOLD} stopOpacity={0.02}/></linearGradient></defs>
                  <XAxis dataKey="t" tick={{ fill: "rgba(255,255,255,0.28)", fontSize: 8 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fill: "rgba(255,255,255,0.28)", fontSize: 8 }} tickLine={false} axisLine={false} width={36}
                    tickFormatter={(v: number) => `${v.toFixed(0)}%`} />
                  <Tooltip contentStyle={{ background: "#1c1d20", border: `1px solid ${CBORD}`, borderRadius: 8, fontSize: 10 }}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={(v: any) => [`${Number(v ?? 0).toFixed(2)}%`, "DD"]} />
                  <Area type="monotone" dataKey="v" stroke={GOLD} strokeWidth={1.2} fill="url(#expddg)" dot={false} activeDot={{ r: 3, fill: GOLD, strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* KPI grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginTop: 14 }}>
            {kpis.map(k => (
              <div key={k.label} style={{ background: CARD, border: `1px solid ${CBORD}`, borderRadius: 10, padding: "8px 10px" }}>
                <div style={{ fontSize: 8, fontWeight: 600, color: MUTED, letterSpacing: ".07em", textTransform: "uppercase", fontFamily: "var(--font-montserrat),sans-serif", marginBottom: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{k.label}</div>
                <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "var(--font-montserrat),sans-serif", color: strNumColor(k.value) }}>{k.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "info" && (
        <div style={{ padding: "12px 12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
          {/* Asset & Strategie */}
          <InfoBox title="Asset & Strategie" items={[
            { k: "Asset",    v: row.label },
            { k: "Ticker",   v: row.ticker },
            { k: "Exchange", v: row.exchange ?? "—" },
            { k: "Pillar",   v: row.pillarLabel },
            { k: "Engine",   v: row.engine },
            { k: "Richtung", v: dir },
          ]} />
          <InfoBox title="Performance OOS" items={[
            { k: "Sharpe OOS",    v: fmtN(sharpeV) },
            { k: "CAGR OOS",      v: row.cagr ?? "—" },
            { k: "Max DD",        v: row.maxDd ?? "—" },
            { k: "Calmar/MAR",    v: fmtN(calmarV) },
            { k: "Profit Factor", v: fmtN(pfV) },
          ]} />
          <InfoBox title="Handel & Statistik" items={[
            { k: "# Trades", v: tradesV != null ? String(tradesV) : "—" },
            { k: "Win Rate", v: wrV != null ? `${Number(wrV).toFixed(1)}%` : "—" },
            { k: "WF / OOS", v: row.wfWin ?? "—" },
            { k: "Final Equity", v: oos?.finalEquity != null ? `${oos.finalEquity.toFixed(0)}` : "—" },
          ]} />
          <InfoBox title="Kontext & Zeitraum" items={[
            { k: "Status",      v: row.status },
            { k: "Beschreibung", v: pillarDescription(row.pillarKey) },
            ...(row.isNotes ? [{ k: "Notiz", v: row.isNotes }] : []),
          ]} />
        </div>
      )}
    </div>
  );
}

function InfoBox({ title, items }: { title: string; items: Array<{ k: string; v: string }> }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${RBORD}`, borderRadius: 10, padding: "10px 12px" }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: MUTED, letterSpacing: ".09em", textTransform: "uppercase", fontFamily: "var(--font-montserrat),sans-serif", borderBottom: `1px solid ${RBORD}`, paddingBottom: 6, marginBottom: 8 }}>{title}</div>
      {items.map(({ k, v }) => (
        <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 5 }}>
          <span style={{ fontSize: 10, color: MUTED, fontFamily: "var(--font-montserrat),sans-serif", flexShrink: 0 }}>{k}</span>
          <span style={{ fontSize: 10, color: strNumColor(v), fontFamily: "var(--font-montserrat),sans-serif", textAlign: "right", wordBreak: "break-word" }}>{v}</span>
        </div>
      ))}
    </div>
  );
}

// ── Strategy card ─────────────────────────────────────────────────────────────
function StrategyCard({ row, num, showLive }: { row: DisplayRow; num: number; showLive: boolean }) {
  const [open, setOpen] = useState(false);

  // Mini equity curve for card preview
  const synth = syntheticCurves(row.cagr, row.maxDd);
  const eqPts = synth?.eq ?? [];
  const ddPts = synth?.dd ?? [];

  const iconSrc = TICKER_ICON[row.ticker];

  return (
    <div style={{ borderBottom: `1px solid ${RBORD}` }}>
      {/* Card header row */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: "100%", background: "none", border: "none", cursor: "pointer",
          padding: "10px 12px", textAlign: "left",
          WebkitTapHighlightColor: "transparent",
          display: "flex", flexDirection: "column", gap: 0,
        }}
      >
        {/* Row 1: num + icon + ticker + label + status */}
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
          <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", fontFamily: "var(--font-montserrat),sans-serif", fontVariantNumeric: "tabular-nums", width: 16, flexShrink: 0 }}>{num}</span>
          {iconSrc && <img src={iconSrc} alt="" width={16} height={16} style={{ width: 16, height: 16, objectFit: "contain", borderRadius: 3, flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />}
          <span style={{ fontSize: 12, fontWeight: 700, fontFamily: "var(--font-montserrat),sans-serif", color: "#fff", letterSpacing: "-.01em", flexShrink: 0 }}>{row.ticker}</span>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", fontFamily: "var(--font-montserrat),sans-serif", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.label}</span>
          <Chip status={row.status} />
        </div>

        {/* Row 2: metrics */}
        <div style={{ display: "flex", alignItems: "center", gap: 0, paddingLeft: 23 }}>
          <MetricCell label="Pillar" value={row.pillarLabel} color="rgba(255,255,255,0.55)" />
          <MetricCell label="Gew." value={row.weight != null ? `${row.weight}%` : "—"} />
          <MetricCell label="Sharpe" value={row.sharpeOos != null ? row.sharpeOos.toFixed(2) : "—"} />
          <MetricCell label="CAGR" value={row.cagr ?? "—"} color={strNumColor(row.cagr)} />
          <MetricCell label="Max DD" value={row.maxDd ?? "—"} color={strNumColor(row.maxDd)} />
          <MetricCell label="PF" value={row.pf != null ? row.pf.toFixed(2) : "—"} />
          <div style={{ flex: 1 }} />
          {/* Mini equity spark */}
          {eqPts.length > 0 && (
            <div style={{ width: 60, flexShrink: 0 }}>
              <MiniEqChart pts={eqPts} isSynth={true} />
            </div>
          )}
          {/* Chevron */}
          <svg width={12} height={12} viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0, marginLeft: 6, transform: open ? "rotate(180deg)" : "none", transition: "transform .2s", color: MUTED }}>
            <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        {/* Row 3 (optional): live data when toggled */}
        {showLive && (
          <div style={{ display: "flex", gap: 12, paddingLeft: 23, marginTop: 4 }}>
            <MetricCell label="WF/Win%" value={row.wfWin ?? "—"} />
            <MetricCell label="Trades" value={row.trades != null ? String(row.trades) : "—"} />
          </div>
        )}
      </button>

      {open && <ExpandedPanel row={row} />}
    </div>
  );
}

function MetricCell({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", marginRight: 10, flexShrink: 0 }}>
      <span style={{ fontSize: 8, fontWeight: 600, color: MUTED, letterSpacing: ".06em", textTransform: "uppercase", fontFamily: "var(--font-montserrat),sans-serif", whiteSpace: "nowrap" }}>{label}</span>
      <span style={{ fontSize: 11, fontWeight: 600, color: color ?? "rgba(255,255,255,0.78)", fontFamily: "var(--font-montserrat),sans-serif", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{value}</span>
    </div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────
export function MobileKomponentenView() {
  const [portfolio, setPortfolio] = useState<Portfolio>("ws");
  const [pillarFilter, setPillarFilter] = useState<string>("all");
  const [showLive, setShowLive] = useState(false);
  const [search, setSearch] = useState("");

  const rows = portfolio === "ws" ? WS_ROWS : CI_ROWS;
  const kpis = portfolio === "ws" ? WS_KPIS : CI_KPIS;

  // Pillar options
  const pillars = portfolio === "ws"
    ? ["all", "valuation", "macro", "trend", "seasonal", "anomaly", "intraday"]
    : ["all", "etf-core", "strategy-sleeve"];

  const pillarLabel: Record<string, string> = {
    all: "Alle", valuation: "Valuation", macro: "Macro", trend: "Trend",
    seasonal: "Seasonal", anomaly: "Anomaly", intraday: "Intraday",
    "etf-core": "ETF-Core", "strategy-sleeve": "Sleeve",
  };

  const filtered = rows.filter(r => {
    if (r.status === "archived") return false;
    if (pillarFilter !== "all" && r.pillarKey !== pillarFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.ticker.toLowerCase().includes(q) || r.label.toLowerCase().includes(q);
    }
    return true;
  });

  let num = 0;

  return (
    <div style={{ height: "100%", overflowY: "auto", background: BG, WebkitOverflowScrolling: "touch" } as React.CSSProperties}>

      {/* Portfolio tab switcher */}
      <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${RBORD}`, background: "#0c0d10", position: "sticky", top: 0, zIndex: 10 }}>
        {(["ws", "ci"] as Portfolio[]).map(p => (
          <button
            key={p}
            onClick={() => { setPortfolio(p); setPillarFilter("all"); }}
            style={{
              flex: 1, padding: "12px 0", fontSize: 11, fontWeight: 700,
              fontFamily: "var(--font-montserrat),sans-serif", letterSpacing: ".07em",
              textTransform: "uppercase", border: "none", cursor: "pointer",
              background: "none",
              color: portfolio === p ? "#fff" : MUTED,
              borderBottom: `2px solid ${portfolio === p ? "rgba(255,255,255,0.5)" : "transparent"}`,
            }}
          >
            {p === "ws" ? "White Swan" : "Core Invest"}
          </button>
        ))}
      </div>

      {/* Portfolio KPI strip */}
      <div style={{ display: "flex", gap: 0, overflowX: "auto", padding: "10px 12px", scrollbarWidth: "none" }}>
        {kpis.map(k => (
          <div key={k.label} style={{ flexShrink: 0, marginRight: 10, background: CARD, border: `1px solid ${CBORD}`, borderRadius: 10, padding: "8px 12px", minWidth: 72 }}>
            <div style={{ fontSize: 8, fontWeight: 600, color: MUTED, letterSpacing: ".07em", textTransform: "uppercase", fontFamily: "var(--font-montserrat),sans-serif", marginBottom: 4, whiteSpace: "nowrap" }}>{k.label}</div>
            <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "var(--font-montserrat),sans-serif", color: "#fff", letterSpacing: "-.02em", lineHeight: 1 }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Pillar filter + search bar */}
      <div style={{ padding: "0 12px 8px" }}>
        <div style={{ display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none", marginBottom: 8, paddingBottom: 2 }}>
          {pillars.map(p => (
            <button
              key={p}
              onClick={() => setPillarFilter(p)}
              style={{
                flexShrink: 0, fontSize: 10, fontWeight: 600,
                letterSpacing: ".07em", textTransform: "uppercase",
                fontFamily: "var(--font-montserrat),sans-serif",
                padding: "4px 11px", borderRadius: 20, cursor: "pointer",
                background: pillarFilter === p ? "rgba(255,255,255,0.07)" : "transparent",
                border: pillarFilter === p ? "1px solid rgba(255,255,255,0.18)" : `1px solid ${RBORD}`,
                color: pillarFilter === p ? "#fff" : MUTED,
                WebkitTapHighlightColor: "transparent",
              }}
            >
              {pillarLabel[p] ?? p}
            </button>
          ))}
        </div>
        {/* Search */}
        <input
          type="search"
          placeholder="Ticker oder Name suchen…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: "100%", boxSizing: "border-box",
            background: "rgba(255,255,255,0.04)", border: `1px solid ${RBORD}`,
            borderRadius: 8, padding: "7px 12px",
            fontSize: 12, color: "#fff", fontFamily: "var(--font-montserrat),sans-serif",
            outline: "none", appearance: "none",
          }}
        />
      </div>

      {/* Row count + live toggle */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 12px 6px" }}>
        <span style={{ fontSize: 10, color: MUTED, fontFamily: "var(--font-montserrat),sans-serif" }}>
          {filtered.length} {filtered.length === 1 ? "Strategie" : "Strategien"}
        </span>
        <button
          onClick={() => setShowLive(v => !v)}
          style={{
            fontSize: 10, fontWeight: 600, color: showLive ? "#fff" : MUTED,
            background: showLive ? "rgba(255,255,255,0.07)" : "transparent",
            border: `1px solid ${showLive ? "rgba(255,255,255,0.18)" : RBORD}`,
            borderRadius: 20, padding: "3px 10px", cursor: "pointer",
            fontFamily: "var(--font-montserrat),sans-serif", letterSpacing: ".07em", textTransform: "uppercase",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          + WF/Trades
        </button>
      </div>

      {/* Aggregate row */}
      {filtered.length > 0 && (() => {
        const active = filtered.filter(r => r.status === "active");
        const sharpes = active.map(r => r.sharpeOos).filter((v): v is number => v !== null);
        const avgSharpe = sharpes.length ? (sharpes.reduce((a, b) => a + b, 0) / sharpes.length).toFixed(2) : "—";
        return (
          <div style={{ display: "flex", gap: 0, overflowX: "auto", padding: "4px 12px 8px", scrollbarWidth: "none", borderBottom: `1px solid ${RBORD}` }}>
            <MetricCell label="Gesamt" value={String(filtered.length)} />
            <MetricCell label="Aktiv" value={String(active.length)} />
            <MetricCell label="Ø Sharpe" value={avgSharpe} />
          </div>
        );
      })()}

      {/* Strategy list */}
      <div>
        {filtered.map(row => {
          if (row.status !== "archived") num++;
          return <StrategyCard key={row.id} row={row} num={num} showLive={showLive} />;
        })}
        {filtered.length === 0 && (
          <div style={{ padding: "40px 24px", textAlign: "center", fontSize: 12, color: MUTED, fontFamily: "var(--font-montserrat),sans-serif" }}>
            Keine Strategien gefunden
          </div>
        )}
      </div>

      {/* Bottom padding for nav bar */}
      <div style={{ height: "calc(76px + env(safe-area-inset-bottom, 34px) + 20px)" }} />
    </div>
  );
}
