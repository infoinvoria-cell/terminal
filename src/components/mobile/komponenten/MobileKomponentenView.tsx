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
function toOhlcSymbol(ticker: string): string {
  return OHLC_SYMBOL[ticker] ?? ticker.split(" ")[0];
}

// ── live feed ─────────────────────────────────────────────────────────────────
interface LiveFeedItem {
  symbol: string; lastClose: number | null; changePct: number | null;
  lastDate: string | null; dataStatus: "live"|"daily"|"missing";
}

const LIVE_SYMBOL_MAP: Record<string, string[]> = {
  "6E1!":        ["6E1!", "EURUSD", "EUR/USD"],
  "DAX 1H / MT": ["FDAX1!", "DAX", "DAX40", "GER40"],
  "DAX 2H":      ["FDAX1!", "DAX", "DAX40"],
  "FDAX1!":      ["FDAX1!", "DAX"],
  "ES1!":        ["ES1!", "S&P500", "US500"],
  "NQ1!":        ["NQ1!", "NAS100"],
  "YM1!":        ["YM1!", "US30"],
  "GC1!":        ["GC1!", "GOLD", "XAU"],
  "GLD":         ["GLD", "GC1!", "GOLD"],
  "CT1!":        ["CT1!", "COTTON"],
  "GOOGL":       ["GOOGL", "GOOGLE"],
};

function matchLive(ticker: string, live: Map<string, LiveFeedItem>): LiveFeedItem | null {
  const candidates = LIVE_SYMBOL_MAP[ticker] ?? [ticker, ticker.replace("1!", ""), ticker.split(" ")[0]];
  for (const k of candidates) { const v = live.get(k); if (v) return v; }
  for (const [key, val] of live) {
    const base = ticker.split(" ")[0].replace("1!", "").toUpperCase();
    if (key.toUpperCase().startsWith(base) || base.startsWith(key.replace("1!", "").toUpperCase())) return val;
  }
  return null;
}

function fmtPrice(v: number, ticker: string): string {
  const isFx = /EURUSD|GBPUSD|6E|6B|6S|ZARUSD|BRLUSD|SEKUSD/.test(ticker) && !/1H|2H/.test(ticker);
  if (isFx && v < 100) return v.toFixed(4);
  if (v > 10000) return v.toLocaleString("de", { maximumFractionDigits: 0 });
  if (v > 100) return v.toFixed(2);
  return v.toFixed(3);
}

// ── live state (open trades) ──────────────────────────────────────────────────
interface LiveTrade { symbol: string; direction: string; entry_price: number; }

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
  return "rgba(255,255,255,0.82)";
}

function sortRows(rows: DisplayRow[], key: SortKey, dir: SortDir): DisplayRow[] {
  return [...rows].sort((a, b) => {
    let av: number, bv: number;
    if (key === "cagr" || key === "maxDd") {
      const parse = (s: string | null) => parseFloat((s ?? "").replace(/[^0-9.-]/g, "")) || 0;
      av = parse(a[key]); bv = parse(b[key]);
    } else {
      av = (a[key] as number | null) ?? -Infinity;
      bv = (b[key] as number | null) ?? -Infinity;
    }
    return dir === "desc" ? bv - av : av - bv;
  });
}

function syntheticCurves(cagrStr: string | null, maxDdStr: string | null): { eq: EP[]; dd: EP[] } | null {
  const cagrPct = parseFloat((cagrStr ?? "").replace(/[^0-9.-]/g, ""));
  const ddPct   = Math.abs(parseFloat((maxDdStr ?? "").replace(/[^0-9.-]/g, "")));
  if (!isFinite(cagrPct) || !isFinite(ddPct)) return null;
  const monthlyRate = Math.pow(1 + cagrPct / 100, 1 / 12) - 1;
  const eq: EP[] = []; const dd: EP[] = [];
  let equity = 10000; let peak = 10000;
  const now = new Date(); const endY = now.getFullYear(); const endM = now.getMonth() + 1;
  for (let y = 2019, m = 1; y < endY || (y === endY && m <= endM); ) {
    const idx = (y - 2019) * 12 + (m - 1);
    const wave = Math.sin(idx * 0.41) * 0.008 + Math.sin(idx * 1.17) * 0.004;
    equity = equity * (1 + monthlyRate + wave);
    if (equity > peak) peak = equity;
    const drawdown = peak > 0 ? ((peak - equity) / peak) * -100 : 0;
    const time = `${y}-${String(m).padStart(2, "0")}-01`;
    eq.push({ time, value: Math.round(equity) });
    dd.push({ time, value: Math.round(Math.max(-ddPct, drawdown) * 100) / 100 });
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
    case "valuation": return "Fundamentale Über-/Unterbewertung als Einstiegssignal.";
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
    <span style={{ fontSize: 10, fontWeight: 600, color: s.c, display: "inline-flex", alignItems: "center", gap: 3, fontFamily: "var(--font-montserrat),sans-serif", whiteSpace: "nowrap" }}>
      <span style={{ width: 4, height: 4, borderRadius: "50%", background: s.c, flexShrink: 0 }} />
      {s.label}
    </span>
  );
}

// ── CandleChart (mobile) ───────────────────────────────────────────────────────
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
        return Math.abs(b.open - pre[i-1].close) / Math.max(pre[i-1].close, 0.0001) < 0.40;
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

  if (bars === null) return <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "rgba(255,255,255,0.2)", fontFamily: "var(--font-montserrat),sans-serif", background: BG, borderRadius: 6 }}>Lade OHLC…</div>;
  if (!bars.length) return <div style={{ height: 60, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "rgba(255,255,255,0.15)", fontFamily: "var(--font-montserrat),sans-serif" }}>Keine Daten</div>;
  return <div ref={ref} style={{ width: "100%", height: 200, borderRadius: 6, overflow: "hidden", background: BG }} />;
}

// ── Expanded detail panel ─────────────────────────────────────────────────────
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
        const s = d.strategies.find(x => x.id === row.intradayId);
        setIntraday(s ?? null);
      }).catch(() => {});
  }, [row.intradayId, row.dataFile]);

  const eqOos = data?.equityCurve?.oos;
  const oos   = data?.summary?.oos;
  const ist   = intraday?.oos?.stats;
  const intradayEq: EP[] | null = intraday?.oos?.curve?.length
    ? intraday.oos.curve.map(p => ({ time: p.date + "-01", value: p.equity }))
    : null;

  const synthAll = syntheticCurves(row.cagr, row.maxDd);
  const activeEq: EP[] = eqOos?.length ? eqOos : intradayEq?.length ? intradayEq : codexEq?.length ? codexEq! : synthAll?.eq ?? [];
  const isSynthetic = !(eqOos?.length || codexEq?.length || intradayEq?.length);

  const activeDd: EP[] = (() => {
    if (!activeEq.length) return synthAll?.dd ?? [];
    let peak = activeEq[0]?.value ?? 0;
    return activeEq.map(p => {
      if (p.value > peak) peak = p.value;
      return { time: p.time, value: Math.round(((p.value - peak) / peak) * 10000) / 100 };
    });
  })();

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
  const pfV = row.pf ?? ist?.pf ?? oos?.profitFactor ?? null;
  const tradesV = row.trades ?? ist?.n ?? oos?.tradeCount ?? null;
  const wrV = ist?.wr != null ? ist.wr * 100 : oos?.winRate ?? null;
  const calmarV = ist?.mar ?? row.calmar ?? null;
  const sharpeV = row.sharpeOos ?? ist?.sharpe ?? null;

  const CHART_M  = { top: 2, right: 40, bottom: 0, left: 0 };
  const CHART_MX = { top: 0, right: 40, bottom: 0, left: 0 };
  const TICK     = { fill: "rgba(255,255,255,0.28)", fontSize: 8 };

  const tabBtn = (t: "charts"|"info") => ({
    flex: 1, padding: "9px 0", fontSize: 10, fontWeight: 600,
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
        <div style={{ padding: "12px 12px 16px" }}>
          <div style={{ fontSize: 9, color: MUTED, fontFamily: "var(--font-montserrat),sans-serif", letterSpacing: ".07em", textTransform: "uppercase", marginBottom: 6 }}>
            OHLC · {row.ticker} · Daily
          </div>
          <MobileCandleChart ticker={row.ticker} />

          {activeEq.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 9, color: MUTED, fontFamily: "var(--font-montserrat),sans-serif", letterSpacing: ".07em", textTransform: "uppercase", marginBottom: 4 }}>
                {isSynthetic ? "Equity (Sim)" : "Equity OOS"}
              </div>
              <ResponsiveContainer width="100%" height={90}>
                <AreaChart data={activeEq.map(p => ({ t: p.time.slice(0,7), v: Math.round(p.value*100)/100 }))} margin={CHART_M}>
                  <defs><linearGradient id="mexp_eq" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#fff" stopOpacity={0.12}/><stop offset="95%" stopColor="#fff" stopOpacity={0.01}/></linearGradient></defs>
                  <YAxis tick={TICK} tickLine={false} axisLine={false} width={36} tickFormatter={(v: number) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : `${v.toFixed(0)}`} />
                  <Tooltip contentStyle={{ background: "#1c1d20", border: `1px solid ${CBORD}`, borderRadius: 8, fontSize: 10 }}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={(v: any) => [`$${Number(v??0).toLocaleString("de",{maximumFractionDigits:0})}`, "Equity"]} />
                  <Area type="monotone" dataKey="v" stroke="#fff" strokeWidth={1.5} strokeOpacity={0.75} fill="url(#mexp_eq)" dot={false} activeDot={{ r: 3, fill: "#fff", strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {activeDd.length > 0 && (
            <div style={{ marginTop: 6 }}>
              <div style={{ fontSize: 9, color: MUTED, fontFamily: "var(--font-montserrat),sans-serif", letterSpacing: ".07em", textTransform: "uppercase", marginBottom: 4 }}>Drawdown</div>
              <ResponsiveContainer width="100%" height={60}>
                <AreaChart data={activeDd.map(p => ({ t: p.time.slice(0,7), v: Math.round(p.value*100)/100 }))} margin={CHART_MX}>
                  <defs><linearGradient id="mexp_dd" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={GOLD} stopOpacity={0.28}/><stop offset="95%" stopColor={GOLD} stopOpacity={0.02}/></linearGradient></defs>
                  <XAxis dataKey="t" tick={TICK} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis tick={TICK} tickLine={false} axisLine={false} width={36} tickFormatter={(v: number) => `${v.toFixed(0)}%`} />
                  <Tooltip contentStyle={{ background: "#1c1d20", border: `1px solid ${CBORD}`, borderRadius: 8, fontSize: 10 }}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={(v: any) => [`${Number(v??0).toFixed(2)}%`, "DD"]} />
                  <Area type="monotone" dataKey="v" stroke={GOLD} strokeWidth={1.2} fill="url(#mexp_dd)" dot={false} activeDot={{ r: 3, fill: GOLD, strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

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
            { k: "Status",       v: row.status },
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
      transition: "all .12s",
    }}>
      {children}
    </button>
  );
}

// ── SortBtn ───────────────────────────────────────────────────────────────────
function SortBtn({ label, k, sortKey, sortDir, onSort }: {
  label: string; k: SortKey; sortKey: SortKey; sortDir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  const active = sortKey === k;
  return (
    <button onClick={() => onSort(k)} style={{
      fontSize: 10, fontWeight: 600,
      color: active ? "#fff" : MUTED,
      background: active ? "rgba(255,255,255,0.07)" : "transparent",
      border: `1px solid ${active ? "rgba(255,255,255,0.18)" : RBORD}`,
      borderRadius: 20, padding: "4px 10px", cursor: "pointer",
      fontFamily: "var(--font-montserrat),sans-serif", letterSpacing: ".06em",
      textTransform: "uppercase", WebkitTapHighlightColor: "transparent",
      flexShrink: 0, whiteSpace: "nowrap",
    }}>
      {label}{active && <span style={{ marginLeft: 3, opacity: 0.6 }}>{sortDir === "desc" ? "↓" : "↑"}</span>}
    </button>
  );
}

// ── Strategy row (table-like) ─────────────────────────────────────────────────
function StrategyRow({ row, num, liveData, liveOn }: {
  row: DisplayRow; num: number;
  liveData: Map<string, LiveFeedItem>;
  liveOn: boolean;
}) {
  const [open, setOpen] = useState(false);
  const iconSrc = TICKER_ICON[row.ticker];
  const live = liveOn ? matchLive(row.ticker, liveData) : null;

  return (
    <div style={{ borderBottom: `1px solid ${RBORD}` }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: "100%", background: "none", border: "none", cursor: "pointer",
          padding: "9px 12px", textAlign: "left",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        {/* Row 1: num + icon + ticker + label + status */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 7 }}>
          <span style={{ fontSize: 9, color: "rgba(255,255,255,0.22)", fontFamily: "var(--font-montserrat),sans-serif", width: 14, flexShrink: 0, textAlign: "right" }}>{num}</span>
          {iconSrc && (
            <img src={iconSrc} alt="" width={15} height={15}
              style={{ width: 15, height: 15, objectFit: "contain", borderRadius: 3, flexShrink: 0 }}
              onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          )}
          <span style={{ fontSize: 12, fontWeight: 700, fontFamily: "var(--font-montserrat),sans-serif", color: "#fff", flexShrink: 0 }}>{row.ticker}</span>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontFamily: "var(--font-montserrat),sans-serif", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{row.label}</span>
          <Chip status={row.status} />
          <svg width={11} height={11} viewBox="0 0 11 11" fill="none"
            style={{ flexShrink: 0, marginLeft: 2, transform: open ? "rotate(180deg)" : "none", transition: "transform .18s", color: MUTED }}>
            <path d="M2 3.5l3.5 3.5 3.5-3.5" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        {/* Row 2: columns — no horizontal scroll, all fit */}
        <div style={{ display: "flex", alignItems: "flex-end", paddingLeft: 20, gap: 0 }}>
          <Col label="Pillar"  value={row.pillarLabel} w="22%" color="rgba(255,255,255,0.5)" />
          <Col label="Gew."   value={row.weight != null ? `${row.weight}%` : "—"} w="11%" />
          <Col label="Sharpe" value={row.sharpeOos != null ? row.sharpeOos.toFixed(2) : "—"} w="14%" />
          <Col label="CAGR"   value={row.cagr ?? "—"} w="15%" color={strNumColor(row.cagr)} />
          <Col label="Max DD" value={row.maxDd ?? "—"} w="17%" color={strNumColor(row.maxDd)} />
          <Col label="PF"     value={row.pf != null ? row.pf.toFixed(2) : "—"} w="12%" />
          <Col label="Trades" value={row.trades != null ? String(row.trades) : "—"} w="12%" />
        </div>

        {/* Row 3: live data (when Live is on) */}
        {liveOn && (
          <div style={{ display: "flex", alignItems: "flex-end", paddingLeft: 20, marginTop: 5, gap: 0 }}>
            <Col label="Preis" value={live?.lastClose != null ? fmtPrice(live.lastClose, row.ticker) : "—"} w="25%" />
            <Col label="Δ%"    value={live?.changePct != null ? `${live.changePct > 0 ? "+" : ""}${live.changePct.toFixed(2)}%` : "—"} w="20%"
              color={live?.changePct != null ? (live.changePct >= 0 ? "rgba(255,255,255,0.8)" : GOLD) : undefined} />
            <Col label="WF/Win%" value={row.wfWin ?? "—"} w="22%" />
            <Col label="Status" value={live?.dataStatus ?? "—"} w="33%" color={live?.dataStatus === "live" ? "rgba(255,255,255,0.7)" : MUTED} />
          </div>
        )}
      </button>

      {open && <ExpandedPanel row={row} />}
    </div>
  );
}

function Col({ label, value, w, color }: { label: string; value: string; w: string; color?: string }) {
  return (
    <div style={{ width: w, flexShrink: 0, paddingRight: 4 }}>
      <div style={{ fontSize: 8, fontWeight: 600, color: MUTED, letterSpacing: ".06em", textTransform: "uppercase", fontFamily: "var(--font-montserrat),sans-serif", whiteSpace: "nowrap", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 11, fontWeight: 600, color: color ?? "rgba(255,255,255,0.78)", fontFamily: "var(--font-montserrat),sans-serif", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
    </div>
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

  // Live feed polling
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
        })
        .catch(() => {});
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
    sortKey,
    sortDir,
  );

  const active = filtered.filter(r => r.status === "active");
  const sharpes = active.map(r => r.sharpeOos).filter((v): v is number => v !== null);
  const avgSharpe = sharpes.length ? (sharpes.reduce((a, b) => a + b, 0) / sharpes.length).toFixed(2) : "—";

  return (
    <div style={{ height: "100%", overflowY: "auto", background: BG, WebkitOverflowScrolling: "touch" } as React.CSSProperties}>

      {/* Portfolio tabs */}
      <div style={{ display: "flex", borderBottom: `1px solid ${RBORD}`, background: BG, position: "sticky", top: 0, zIndex: 10 }}>
        {(["ws", "ci"] as Portfolio[]).map(p => (
          <button key={p} onClick={() => { setPortfolio(p); setPillarFilter("all"); setSortKey("weight"); setSortDir("desc"); }}
            style={{
              flex: 1, padding: "13px 0", fontSize: 11, fontWeight: 700,
              fontFamily: "var(--font-montserrat),sans-serif", letterSpacing: ".07em",
              textTransform: "uppercase", border: "none", cursor: "pointer", background: "none",
              color: portfolio === p ? "#fff" : MUTED,
              borderBottom: `2px solid ${portfolio === p ? "rgba(255,255,255,0.5)" : "transparent"}`,
            }}>
            {p === "ws" ? "White Swan" : "Core Invest"}
          </button>
        ))}
      </div>

      {/* Portfolio KPI strip */}
      <div style={{ display: "flex", gap: 0, overflowX: "auto", padding: "10px 12px", scrollbarWidth: "none" } as React.CSSProperties}>
        {kpis.map(k => (
          <div key={k.label} style={{ flexShrink: 0, marginRight: 8, background: CARD, border: `1px solid ${CBORD}`, borderRadius: 10, padding: "8px 12px", minWidth: 68 }}>
            <div style={{ fontSize: 8, fontWeight: 600, color: MUTED, letterSpacing: ".07em", textTransform: "uppercase", fontFamily: "var(--font-montserrat),sans-serif", marginBottom: 4, whiteSpace: "nowrap" }}>{k.label}</div>
            <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "var(--font-montserrat),sans-serif", color: "#fff", letterSpacing: "-.02em", lineHeight: 1 }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Pillar filter pills */}
      <div style={{ display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none", padding: "0 12px 8px", paddingBottom: 2 } as React.CSSProperties}>
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

      {/* Search */}
      <div style={{ padding: "8px 12px 6px" }}>
        <input type="search" placeholder="Ticker oder Name suchen…" value={search}
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

      {/* Toolbar: count + sort + live toggle */}
      <div style={{ padding: "4px 12px 8px", display: "flex", flexDirection: "column", gap: 6 }}>
        {/* Row 1: count + live button */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 10, color: MUTED, fontFamily: "var(--font-montserrat),sans-serif" }}>
            {filtered.length} {filtered.length === 1 ? "Strategie" : "Strategien"} · Aktiv {active.length} · Ø Sharpe {avgSharpe}
          </span>
          <ToggleBtn active={liveOn} onClick={() => setLiveOn(v => !v)}>
            {liveOn ? "● Live" : "Live"}
          </ToggleBtn>
        </div>
        {/* Row 2: sort buttons */}
        <div style={{ display: "flex", gap: 5, overflowX: "auto", scrollbarWidth: "none" } as React.CSSProperties}>
          <SortBtn label="Gew." k="weight"   sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
          <SortBtn label="Sharpe" k="sharpeOos" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
          <SortBtn label="CAGR"   k="cagr"      sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
          <SortBtn label="Max DD" k="maxDd"     sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
          <SortBtn label="PF"     k="pf"        sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
          <SortBtn label="Trades" k="trades"    sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
        </div>
      </div>

      {/* Column header labels */}
      <div style={{ display: "flex", alignItems: "flex-end", padding: "0 12px 5px", paddingLeft: 44, borderBottom: `1px solid ${RBORD}` }}>
        {[
          { label: "Pillar",  w: "22%" },
          { label: "Gew.",    w: "11%" },
          { label: "Sharpe",  w: "14%" },
          { label: "CAGR",    w: "15%" },
          { label: "Max DD",  w: "17%" },
          { label: "PF",      w: "12%" },
          { label: "Trades",  w: "12%" },
        ].map(c => (
          <div key={c.label} style={{ width: c.w, flexShrink: 0 }}>
            <span style={{ fontSize: 8, fontWeight: 600, color: "rgba(255,255,255,0.3)", letterSpacing: ".06em", textTransform: "uppercase", fontFamily: "var(--font-montserrat),sans-serif" }}>{c.label}</span>
          </div>
        ))}
      </div>

      {/* Strategy list */}
      <div>
        {filtered.map((row, i) => (
          <StrategyRow key={row.id} row={row} num={i + 1} liveData={liveData} liveOn={liveOn} />
        ))}
        {filtered.length === 0 && (
          <div style={{ padding: "40px 24px", textAlign: "center", fontSize: 12, color: MUTED, fontFamily: "var(--font-montserrat),sans-serif" }}>
            Keine Strategien gefunden
          </div>
        )}
      </div>

      <div style={{ height: "calc(76px + env(safe-area-inset-bottom, 34px) + 20px)" }} />
    </div>
  );
}
