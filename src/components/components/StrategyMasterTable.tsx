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
const GOLD     = "#e2ca7a";
const MUTED    = "#737373";
const BG       = "#0c0d10";
const CARD     = "linear-gradient(180deg,#1c1d20 0%,#141517 100%)";
const CBORD    = "rgba(255,255,255,0.06)";
const RBORD    = "rgba(255,255,255,0.04)";

// ── asset icon map ────────────────────────────────────────────────────────────
const AI = "/asset-icons/";
const TICKER_ICON: Record<string, string> = {
  "ES1!": AI + "es_s&p.png", "NQ1!": AI + "nasdaq.png", "YM1!": AI + "dow_jones.png",
  "GC1!": AI + "gold.png",   "GLD":  AI + "gold.png",   "SI1!": AI + "silver.png",
  "HG1!": AI + "Kupfer.webp","PL1!": AI + "platinum.png","PA1!": AI + "palladium.png",
  "CL1!": AI + "crude_oil.png","NG1!": AI + "crude_oil.png","RB1!": AI + "crude_oil.png",
  "CT1!": AI + "cotton.png", "SB1!": AI + "sugar.png",  "OJ1!": AI + "orange_juice.jpg",
  "ZC1!": AI + "corn.png",   "ZW1!": AI + "wheat.png",  "ZS1!": AI + "soybeans.png",
  "CC1!": AI + "cocoa.webp", "KC1!": AI + "coffee.png",
  "FDAX1!": AI + "dax.png",  "UKX!": AI + "gbp.png",
  "GOOGL": AI + "google.png","NVDA": AI + "nvidia.png", "MSFT": AI + "microsoft.png",
  "AAPL":  AI + "apple.png", "META": AI + "meta.png",   "AMZN": AI + "amazon.png",
  "6E1!": AI + "eurusd.png", "GBPUSD 30M": AI + "gbpusd.png",
  "DAX 1H / MT": AI + "dax.png", "DAX 2H": AI + "dax.png",
  "QQQ": AI + "nasdaq.png",  "SPY":  AI + "es_s&p.png", "SPMO": AI + "es_s&p.png",
  "6S1!": AI + "chf.png",
};

function TickerIcon({ ticker }: { ticker: string }) {
  const src = TICKER_ICON[ticker];
  if (!src) return null;
  return (
    <img src={src} alt="" width={14} height={14}
      style={{ width: 14, height: 14, objectFit: "contain", borderRadius: 3, flexShrink: 0 }}
      onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
    />
  );
}

// ── types ─────────────────────────────────────────────────────────────────────
type Portfolio = "ws" | "ci";
type SortKey   = "ticker"|"label"|"pillar"|"weight"|"sharpeOos"|"cagr"|"maxDd"|"pf"|"trades"|"wfWin"|"status";
type SortDir   = "desc"|"asc";

const WS_KPIS = [
  { label: "Sharpe OOS", value: "1.526" }, { label: "CAGR OOS",   value: "+8.36%" },
  { label: "Max DD",     value: "−8.71%" }, { label: "Calmar",     value: "0.78"   },
  { label: "Strategien", value: "27"      },
];
const CI_KPIS = [
  { label: "Sharpe OOS", value: "1.152"   }, { label: "CAGR OOS", value: "+17.11%" },
  { label: "Max DD",     value: "−21.7%"  }, { label: "Calmar",   value: "0.787"   },
  { label: "Positionen", value: "8"        },
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
    pillarKey: r.pillar, pillarLabel: PILLAR_META[r.pillar as Pillar].label,
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

// ── live feed ─────────────────────────────────────────────────────────────────
interface LiveFeedItem {
  symbol: string; tab: string; source: string;
  lastClose: number | null; changePct: number | null;
  lastDate: string | null; firstDate: string | null; refreshedAt: string | null;
  barCount: number | null; dataStatus: "live"|"daily"|"missing"; liveRefreshSeconds: number | null;
}

// ── live state (open trades) ──────────────────────────────────────────────────
interface LiveTrade {
  symbol: string; direction: string; entry_price: number;
  entry_date: string; strategy_id: string; pnl: number | null; notes: string | null;
}

const LIVE_SYMBOL_MAP: Record<string, string[]> = {
  "6E1!":        ["6E1!", "EURUSD", "EUR/USD", "6E"],
  "DAX 1H / MT": ["FDAX1!", "DAX", "DAX40", "GER40"],
  "DAX 2H":      ["FDAX1!", "DAX", "DAX40"],
  "ES1!":        ["ES1!", "S&P500", "US500"],
  "NQ1!":        ["NQ1!", "NAS100", "NASDAQ"],
  "YM1!":        ["YM1!", "US30", "DOW30"],
  "GC1!":        ["GC1!", "GOLD", "XAU"],
  "GLD":         ["GLD", "GC1!", "GOLD"],
  "CT1!":        ["CT1!", "COTTON"],
  "GOOGL":       ["GOOGL", "GOOGLE"],
  "FDAX1!":      ["FDAX1!", "DAX", "DAX40"],
};

function matchLive(ticker: string, live: Map<string, LiveFeedItem>): LiveFeedItem | null {
  const candidates = LIVE_SYMBOL_MAP[ticker] ?? [ticker, ticker.replace("1!", ""), ticker.split(" ")[0]];
  for (const k of candidates) {
    const v = live.get(k);
    if (v) return v;
  }
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

function fmtVon(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!isFinite(d.getTime())) return "—";
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(2)}`;
}

function fmtBisNow(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// ── data types ────────────────────────────────────────────────────────────────
interface EP { time: string; value: number; }
interface OhlcBar { time: string; open: number; high: number; low: number; close: number; }
interface StrategyData {
  summary: { oos: { sharpe: number; cagr: number; maxDrawdownPercent: number; profitFactor: number; tradeCount: number; winRate: number; finalEquity: number } };
  equityCurve: { oos: EP[] }; drawdownCurve: { oos: EP[] };
}

// ── helpers ───────────────────────────────────────────────────────────────────
const fmtN = (v: number | null, d = 2) => v === null ? "—" : v.toFixed(d);

function numColor(v: number | null): string {
  if (v === null) return "rgba(255,255,255,0.2)";
  return v < 0 ? GOLD : "rgba(255,255,255,0.85)";
}
function strNumColor(s: string | null): string {
  if (!s || s === "—") return "rgba(255,255,255,0.2)";
  if (s.startsWith("−") || s.startsWith("-")) return GOLD;
  return "rgba(255,255,255,0.8)";
}

function SwanIcon({ size = 13 }: { size?: number }) {
  return <img src="/branding/white-swan-logo.png" alt="WS" width={size} height={size} style={{ width: size, height: size, objectFit: "contain" }} />;
}

// ── KPI cards ─────────────────────────────────────────────────────────────────
function HKpi({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${CBORD}`, borderRadius: 12, padding: "8px 14px", boxShadow: "0 6px 18px -8px rgba(0,0,0,0.6)", minWidth: 78 }}>
      <div style={{ fontFamily: "var(--font-montserrat),sans-serif", fontSize: 9, fontWeight: 600, color: MUTED, letterSpacing: ".08em", textTransform: "uppercase" as const, marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: "var(--font-montserrat),sans-serif", fontSize: 18, fontWeight: 700, letterSpacing: "-.02em", color: "#fff", lineHeight: 1 }}>{value}</div>
    </div>
  );
}

function EKpi({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${CBORD}`, borderRadius: 10, padding: "8px 12px", minWidth: 78, flex: "1 1 auto" }}>
      <div style={{ fontFamily: "var(--font-montserrat),sans-serif", fontSize: 9, fontWeight: 600, color: MUTED, letterSpacing: ".07em", textTransform: "uppercase" as const, marginBottom: 5 }}>{label}</div>
      <div style={{ fontFamily: "var(--font-montserrat),sans-serif", fontSize: 16, fontWeight: 700, letterSpacing: "-.02em", color: strNumColor(value) }}>{value}</div>
    </div>
  );
}

// ── filter pill ───────────────────────────────────────────────────────────────
function Pill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      fontFamily: "var(--font-montserrat),sans-serif", fontSize: 10, fontWeight: 600,
      letterSpacing: ".07em", textTransform: "uppercase" as const,
      padding: "4px 11px", borderRadius: 20, cursor: "pointer",
      background: active ? "rgba(255,255,255,0.07)" : "transparent",
      border: active ? "1px solid rgba(255,255,255,0.18)" : `1px solid ${RBORD}`,
      color: active ? "#fff" : MUTED, transition: "all .1s",
    }}>{label}</button>
  );
}

// ── status chip ───────────────────────────────────────────────────────────────
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
    <span style={{ fontFamily: "var(--font-montserrat),sans-serif", fontSize: 10, fontWeight: 600, color: s.c, display: "inline-flex", alignItems: "center", gap: 4 }}>
      <span style={{ width: 4, height: 4, borderRadius: "50%", background: s.c, flexShrink: 0 }} />
      {s.label}
    </span>
  );
}

// ── signal cell — gray checkmark for pending, dash for no signal ──────────────
function SignalCell({ hasTrade }: { hasTrade: boolean }) {
  if (!hasTrade) {
    return <span style={{ fontSize: 9, color: "rgba(255,255,255,0.2)" }}>—</span>;
  }
  // gray checkmark (pending_valid style matching signals page)
  return (
    <svg width={13} height={13} viewBox="0 0 13 13" fill="none" style={{ display: "inline-block", verticalAlign: "middle" }}>
      <circle cx={6.5} cy={6.5} r={5.5} stroke="rgba(255,255,255,0.22)" strokeWidth={1} />
      <path d="M4 6.5l2 2 3-3" stroke="rgba(255,255,255,0.38)" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── sortable th ───────────────────────────────────────────────────────────────
function Th({ label, k, sortKey, sortDir, onSort, align = "left" }: {
  label: string; k: SortKey; sortKey: SortKey | null; sortDir: SortDir;
  onSort: (k: SortKey) => void; align?: "left"|"right";
}) {
  const active = sortKey === k;
  return (
    <th onClick={() => onSort(k)} style={{
      fontFamily: "var(--font-montserrat),sans-serif",
      fontSize: 10, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase" as const,
      color: active ? "rgba(255,255,255,0.65)" : MUTED,
      padding: "0 8px 9px", whiteSpace: "nowrap" as const, textAlign: align,
      borderBottom: `1px solid ${RBORD}`, background: BG,
      userSelect: "none" as const, cursor: "pointer", transition: "color .1s",
    }}>
      {label}{active && <span style={{ marginLeft: 3, fontSize: 9, opacity: 0.65 }}>{sortDir === "desc" ? "↓" : "↑"}</span>}
    </th>
  );
}

// ── live countdown ring ───────────────────────────────────────────────────────
function LiveTimer({ secs, max }: { secs: number; max: number }) {
  const r = 6, circ = 2 * Math.PI * r;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <svg width={14} height={14} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={7} cy={7} r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={1.5} />
        <circle cx={7} cy={7} r={r} fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth={1.5}
          strokeDasharray={`${circ * (secs / max)} ${circ}`} strokeLinecap="round" />
      </svg>
      <span style={{ fontFamily: "var(--font-montserrat),sans-serif", fontSize: 10, color: MUTED, fontVariantNumeric: "tabular-nums" }}>{secs}s</span>
    </span>
  );
}

// ── candle chart — matches MonitoringChart, ~20 visible bars, optional signal overlay ──
function CandleChart({ ticker }: { ticker: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [bars, setBars] = useState<OhlcBar[] | null>(null);
  const [trade, setTrade] = useState<LiveTrade | null>(null);

  useEffect(() => {
    const sym = encodeURIComponent(ticker.split(" ")[0]);
    fetch(`/api/monitoring/ohlc?symbol=${sym}&timeframe=1D`)
      .then(r => r.json())
      .then(d => setBars(Array.isArray(d.bars) && d.bars.length ? d.bars : []))
      .catch(() => setBars([]));

    fetch("/api/monitoring/live-state")
      .then(r => r.json())
      .then((d: unknown) => {
        const trades: LiveTrade[] = Array.isArray(d) ? (d as LiveTrade[]) : ((d as { trades?: LiveTrade[] }).trades ?? []);
        const base = ticker.split(" ")[0].replace("1!", "").toUpperCase();
        const match = trades.find(t => {
          const ts = (t.symbol ?? "").replace("1!", "").toUpperCase();
          return ts === base || ts.startsWith(base) || base.startsWith(ts);
        });
        setTrade(match ?? null);
      })
      .catch(() => {});
  }, [ticker]);

  useEffect(() => {
    if (!ref.current || !bars?.length) return;
    let destroyed = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let chart: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let ro: any = null;

    import("lightweight-charts").then(({ createChart, CandlestickSeries, CrosshairMode, ColorType }) => {
      if (destroyed || !ref.current) return;
      const el = ref.current;
      chart = createChart(el, {
        width: el.clientWidth,
        height: 240,
        layout: {
          background: { type: ColorType.Solid, color: BG },
          textColor: "rgba(228,236,248,0.68)",
          fontSize: 10,
          fontFamily: "-apple-system,BlinkMacSystemFont,'Trebuchet MS',Roboto,Ubuntu,sans-serif",
          attributionLogo: false,
        },
        grid: { vertLines: { visible: false }, horzLines: { visible: false } },
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: { color: "rgba(163,180,199,0.42)", width: 1, labelVisible: true, labelBackgroundColor: "rgba(22,26,32,0.9)" },
          horzLine: { color: "rgba(163,180,199,0.42)", width: 1, labelVisible: true, labelBackgroundColor: "rgba(22,26,32,0.9)" },
        },
        rightPriceScale: { borderVisible: false, textColor: "rgba(228,236,248,0.68)" },
        timeScale: { borderVisible: false, timeVisible: false, rightOffset: 4 },
        handleScroll: { mouseWheel: false, pressedMouseMove: true },
        handleScale: { mouseWheel: true, pinch: true },
      });

      const series = chart.addSeries(CandlestickSeries, {
        upColor: "#FFFFFF", downColor: "#D6B44B",
        borderVisible: false,
        wickUpColor: "#FFFFFF", wickDownColor: "#D6B44B",
        priceLineVisible: false, lastValueVisible: false,
      });

      const filtered = bars.filter((b: OhlcBar) => b.time >= "2019-01-01");
      series.setData(filtered);

      // show ~20 visible candles
      const total = filtered.length;
      if (total > 20) {
        chart.timeScale().setVisibleLogicalRange({ from: total - 20, to: total + 2 });
      } else {
        chart.timeScale().fitContent();
      }

      // live signal overlay — entry line only (no SL/TP available from API)
      if (trade?.entry_price) {
        const isLong = (trade.direction ?? "").toLowerCase() === "long";
        series.createPriceLine({
          price: trade.entry_price,
          color: isLong ? "rgba(255,255,255,0.7)" : GOLD,
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: `Einstieg ${isLong ? "▲" : "▼"}`,
        });
      }

      ro = new ResizeObserver(() => {
        if (!el || !chart) return;
        chart.applyOptions({ width: el.clientWidth });
      });
      ro.observe(el);
    });

    return () => {
      destroyed = true;
      ro?.disconnect();
      if (chart) { try { chart.remove(); } catch { /* ignore */ } }
    };
  }, [bars, trade]);

  if (bars === null) return (
    <div style={{ height: 240, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "rgba(255,255,255,0.2)", fontFamily: "var(--font-montserrat),sans-serif", background: BG, borderRadius: 6 }}>
      Lade OHLC…
    </div>
  );
  if (!bars.length) return (
    <div style={{ height: 60, display: "flex", alignItems: "center", fontSize: 11, color: "rgba(255,255,255,0.15)", fontFamily: "var(--font-montserrat),sans-serif" }}>
      Keine OHLC-Daten
    </div>
  );
  return <div ref={ref} style={{ width: "100%", height: 240, borderRadius: 6, overflow: "hidden", background: BG }} />;
}

// ── equity / drawdown charts ──────────────────────────────────────────────────
function EqChart({ pts, label }: { pts: EP[]; label: string }) {
  const step = Math.max(1, Math.floor(pts.length / 120));
  const d = pts.filter((_, i) => i % step === 0 || i === pts.length - 1).map(p => ({ t: p.time.slice(0, 7), v: Math.round(p.value) }));
  return (
    <div>
      <div style={{ fontSize: 9, color: MUTED, fontFamily: "var(--font-montserrat),sans-serif", letterSpacing: ".07em", textTransform: "uppercase" as const, marginBottom: 5 }}>{label}</div>
      <ResponsiveContainer width="100%" height={90}>
        <AreaChart data={d} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <defs><linearGradient id="eqg2" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#fff" stopOpacity={0.12} /><stop offset="95%" stopColor="#fff" stopOpacity={0.01} /></linearGradient></defs>
          <XAxis dataKey="t" hide /><YAxis hide domain={["auto", "auto"]} />
          <Tooltip contentStyle={{ background: "#1c1d20", border: `1px solid ${CBORD}`, borderRadius: 8, fontSize: 10, fontFamily: "var(--font-montserrat),sans-serif", color: "#fff" }}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={(v: any) => [`$${Number(v ?? 0).toLocaleString("de", { maximumFractionDigits: 0 })}`, "Equity"]} />
          <Area type="monotone" dataKey="v" stroke="#fff" strokeWidth={1.5} strokeOpacity={0.6} fill="url(#eqg2)" dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function DdChart({ pts }: { pts: EP[] }) {
  const step = Math.max(1, Math.floor(pts.length / 120));
  const d = pts.filter((_, i) => i % step === 0 || i === pts.length - 1).map(p => ({ t: p.time.slice(0, 7), v: Math.round(p.value * 100) / 100 }));
  return (
    <div>
      <div style={{ fontSize: 9, color: MUTED, fontFamily: "var(--font-montserrat),sans-serif", letterSpacing: ".07em", textTransform: "uppercase" as const, marginBottom: 5 }}>Drawdown (Jordan Curve)</div>
      <ResponsiveContainer width="100%" height={65}>
        <AreaChart data={d} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <defs><linearGradient id="ddg2" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={GOLD} stopOpacity={0.25} /><stop offset="95%" stopColor={GOLD} stopOpacity={0.02} /></linearGradient></defs>
          <XAxis dataKey="t" hide /><YAxis hide />
          <Tooltip contentStyle={{ background: "#1c1d20", border: `1px solid ${CBORD}`, borderRadius: 8, fontSize: 10, fontFamily: "var(--font-montserrat),sans-serif", color: "#fff" }}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={(v: any) => [`${Number(v ?? 0).toFixed(2)}%`, "DD"]} />
          <Area type="monotone" dataKey="v" stroke={GOLD} strokeWidth={1.5} fill="url(#ddg2)" dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── expanded row — candle chart left, equity/drawdown/KPIs right ──────────────
function ExpandedRow({ row }: { row: DisplayRow }) {
  const [data, setData] = useState<StrategyData | null>(null);
  useEffect(() => {
    if (!row.dataFile) return;
    fetch(`/data/${row.dataFile}`).then(r => r.json()).then(setData).catch(() => {});
  }, [row.dataFile]);

  const eqOos = data?.equityCurve?.oos;
  const ddOos = data?.drawdownCurve?.oos;
  const oos   = data?.summary?.oos;

  const kpis: Array<{ label: string; value: string }> = [];
  if (row.sharpeOos !== null) kpis.push({ label: "Sharpe OOS", value: fmtN(row.sharpeOos) });
  if (oos?.cagr != null)      kpis.push({ label: "CAGR OOS",    value: `${oos.cagr > 0 ? "+" : ""}${oos.cagr.toFixed(2)}%` });
  else if (row.cagr)          kpis.push({ label: row.section === "ci" ? "Total Return" : "CAGR", value: row.cagr });
  if (oos?.maxDrawdownPercent != null) kpis.push({ label: "Max DD",       value: `${oos.maxDrawdownPercent.toFixed(2)}%` });
  else if (row.maxDd)         kpis.push({ label: "Max DD",        value: row.maxDd });
  if (row.pf != null)         kpis.push({ label: "Profit Factor", value: fmtN(row.pf) });
  if (row.trades != null)     kpis.push({ label: "Trades",        value: String(row.trades) });
  if (row.wfWin)              kpis.push({ label: row.section === "ci" ? "Win Rate" : "WF / OOS", value: row.wfWin });
  if (row.calmar != null)     kpis.push({ label: "Calmar",        value: fmtN(row.calmar) });

  return (
    <div style={{ padding: "14px 16px 18px", background: "rgba(255,255,255,0.012)", borderTop: `1px solid ${RBORD}` }}>
      {/* two-column: left = candle, right = equity + drawdown + KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <div style={{ fontSize: 9, color: MUTED, fontFamily: "var(--font-montserrat),sans-serif", letterSpacing: ".07em", textTransform: "uppercase" as const, marginBottom: 6 }}>
            OHLC · {row.ticker} · Daily
          </div>
          <CandleChart ticker={row.ticker} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {eqOos && eqOos.length > 0 && (
            <EqChart pts={eqOos} label={`Equity OOS${oos?.cagr != null ? ` · +${oos.cagr.toFixed(2)}% CAGR` : ""}`} />
          )}
          {ddOos && ddOos.length > 0 && <DdChart pts={ddOos} />}
          {!row.dataFile && (
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.15)", fontFamily: "var(--font-montserrat),sans-serif" }}>
              Equity-Kurve wird im Portfolio-Kontext berechnet.
            </div>
          )}
          {kpis.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 6, marginTop: 4 }}>
              {kpis.map(k => <EKpi key={k.label} label={k.label} value={k.value} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────
export default function StrategyMasterTable() {
  const [portfolio, setPortfolio] = useState<Portfolio>("ws");
  const [section, setSection]     = useState<string>("all");
  const [expandedId, setExpId]    = useState<string | null>(null);
  const [sortKey, setSortKey]     = useState<SortKey | null>("weight");
  const [sortDir, setSortDir]     = useState<SortDir>("desc");
  const [liveCols, setLiveCols]   = useState(false);
  const [liveData, setLiveData]   = useState<Map<string, LiveFeedItem>>(new Map());
  const [liveTrades, setLiveTrades] = useState<LiveTrade[]>([]);
  const [liveTimer, setLiveTimer] = useState(30);
  const [tick, setTick]           = useState(0);
  const LIVE_INTERVAL = 30;

  // live feed + live state — same polling pattern as signals page
  useEffect(() => {
    if (!liveCols) return;
    let secs = LIVE_INTERVAL;

    const fetchLive = () => {
      secs = LIVE_INTERVAL;
      setLiveTimer(LIVE_INTERVAL);
      fetch("/api/monitoring/live-feed")
        .then(r => r.json())
        .then((d: unknown) => {
          const items: LiveFeedItem[] = Array.isArray(d)
            ? (d as LiveFeedItem[])
            : (((d as { items?: LiveFeedItem[] }).items) ?? []);
          const m = new Map<string, LiveFeedItem>();
          items.forEach(i => { if (i?.symbol) m.set(i.symbol, i); });
          setLiveData(m);
        })
        .catch(() => {});

      fetch("/api/monitoring/live-state")
        .then(r => r.json())
        .then((d: unknown) => {
          const trades: LiveTrade[] = Array.isArray(d) ? (d as LiveTrade[]) : ((d as { trades?: LiveTrade[] }).trades ?? []);
          setLiveTrades(trades);
        })
        .catch(() => {});
    };

    fetchLive();
    const poll = setInterval(fetchLive, LIVE_INTERVAL * 1000);
    const countdown = setInterval(() => {
      secs = Math.max(0, secs - 1);
      setLiveTimer(secs);
      setTick(t => t + 1);
    }, 1000);

    return () => { clearInterval(poll); clearInterval(countdown); };
  }, [liveCols]);

  void tick;

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

  // filter
  const baseRows: DisplayRow[] = portfolio === "ws" ? WS_ROWS : CI_ROWS;
  let rows = baseRows;
  if (section === "active") rows = rows.filter(r => r.status !== "archived");
  else if (section !== "all") rows = rows.filter(r => r.pillarKey === section);

  // sort — archived always pinned at bottom
  const archOrder = (s: string) => s === "archived" ? 1 : 0;

  if (sortKey) {
    rows = [...rows].sort((a, b) => {
      const ao = archOrder(a.status) - archOrder(b.status);
      if (ao !== 0) return ao;
      if (sortKey === "weight") {
        const wa = a.weight ?? -0.001;
        const wb = b.weight ?? -0.001;
        return sortDir === "desc" ? wb - wa : wa - wb;
      }
      let va: string | number, vb: string | number;
      switch (sortKey) {
        case "ticker":    va = a.ticker;      vb = b.ticker;      break;
        case "label":     va = a.label;       vb = b.label;       break;
        case "pillar":    va = a.pillarLabel; vb = b.pillarLabel; break;
        case "status":    va = a.status;      vb = b.status;      break;
        case "sharpeOos": va = a.sharpeOos ?? -Infinity; vb = b.sharpeOos ?? -Infinity; break;
        case "pf":        va = a.pf       ?? -Infinity; vb = b.pf       ?? -Infinity; break;
        case "trades":    va = a.trades   ?? -Infinity; vb = b.trades   ?? -Infinity; break;
        case "cagr":      va = parseFloat((a.cagr  ?? "").replace(/[^0-9.-]/g, "")) || -Infinity; vb = parseFloat((b.cagr  ?? "").replace(/[^0-9.-]/g, "")) || -Infinity; break;
        case "maxDd":     va = parseFloat((a.maxDd ?? "").replace(/[^0-9.-]/g, "")) || -Infinity; vb = parseFloat((b.maxDd ?? "").replace(/[^0-9.-]/g, "")) || -Infinity; break;
        case "wfWin":     va = parseFloat((a.wfWin ?? "").replace(/[^0-9.]/g,  "")) || 0;         vb = parseFloat((b.wfWin ?? "").replace(/[^0-9.]/g,  "")) || 0;         break;
        default:          return 0;
      }
      if (typeof va === "string" && typeof vb === "string") { const c = va.localeCompare(vb); return sortDir === "asc" ? c : -c; }
      return sortDir === "desc" ? (vb as number) - (va as number) : (va as number) - (vb as number);
    });
  } else {
    rows = [...rows].sort((a, b) => archOrder(a.status) - archOrder(b.status));
  }

  const wsSecs = [
    { key: "all",       label: "Alle"       }, { key: "active",   label: "Nur Aktive" },
    { key: "valuation", label: "Valuation"  }, { key: "macro",    label: "Macro"      },
    { key: "trend",     label: "Trend"      }, { key: "seasonal", label: "Seasonal"   },
    { key: "anomaly",   label: "Anomaly"    }, { key: "intraday", label: "Intraday"   },
  ];
  const ciSecs = [
    { key: "all", label: "Alle" }, { key: "etf_core", label: "ETF-Core" }, { key: "ci_sleeve", label: "Sleeve" },
  ];
  const sections = portfolio === "ws" ? wsSecs : ciSecs;
  const kpis     = portfolio === "ws" ? WS_KPIS : CI_KPIS;
  const LIVE_EXTRA = 3;
  let rowNum = 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", padding: "18px 20px 0", background: BG, fontFamily: "var(--font-montserrat),sans-serif" }}>
      <style>{`.kmp::-webkit-scrollbar{display:none}.kmp{scrollbar-width:none;-ms-overflow-style:none}`}</style>

      {/* top bar */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16, flexShrink: 0, gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#fff", letterSpacing: "-.02em", margin: "0 0 10px" }}>Komponenten</h1>
          <div style={{ display: "flex", gap: 5 }}>
            {([
              { id: "ws" as Portfolio, label: "White Swan",  icon: <SwanIcon /> },
              { id: "ci" as Portfolio, label: "Core Invest", icon: <TrendingUp size={12} strokeWidth={1.8} /> },
            ] as const).map(item => (
              <button key={item.id} type="button" onClick={() => switchPortfolio(item.id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors [font-family:var(--font-montserrat),sans-serif]",
                  portfolio === item.id
                    ? "border-white/40 bg-white/[0.06] text-white"
                    : "border-transparent text-zinc-500 hover:border-white/[0.08] hover:text-zinc-300",
                )}>
                {item.icon}{item.label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" as const, justifyContent: "flex-end" }}>
          {kpis.map(k => <HKpi key={k.label} label={k.label} value={k.value} />)}
        </div>
      </div>

      {/* filter bar + live toggle */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" as const }}>
          {sections.map(s => (
            <Pill key={s.key} label={s.label} active={section === s.key}
              onClick={() => { setSection(s.key); setExpId(null); }} />
          ))}
        </div>
        <button
          onClick={() => setLiveCols(v => !v)}
          title={liveCols ? "Live ausblenden" : "Live einblenden"}
          style={{
            display: "flex", alignItems: "center", gap: 5, flexShrink: 0,
            fontFamily: "var(--font-montserrat),sans-serif", fontSize: 10, fontWeight: 600,
            letterSpacing: ".06em", textTransform: "uppercase" as const,
            padding: "4px 10px", borderRadius: 8, cursor: "pointer",
            background: liveCols ? "rgba(255,255,255,0.06)" : "transparent",
            border: liveCols ? "1px solid rgba(255,255,255,0.2)" : `1px solid ${RBORD}`,
            color: liveCols ? "#fff" : MUTED, transition: "all .15s",
          }}>
          <LayoutGrid size={11} />
          Live
          {liveCols && <LiveTimer secs={liveTimer} max={LIVE_INTERVAL} />}
        </button>
      </div>

      {/* table */}
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        <div className="kmp" style={{ height: "100%", overflowY: "auto", borderRadius: "9px 9px 0 0", border: `1px solid ${RBORD}`, borderBottom: "none" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead style={{ position: "sticky", top: 0, zIndex: 2 }}>
              <tr>
                <th style={{ fontFamily: "var(--font-montserrat),sans-serif", fontSize: 10, fontWeight: 600, letterSpacing: ".08em", color: MUTED, padding: "0 6px 9px", textAlign: "left", borderBottom: `1px solid ${RBORD}`, background: BG, width: 26 }}>#</th>
                <th style={{ width: 18, padding: 0, borderBottom: `1px solid ${RBORD}`, background: BG }} />
                <Th label="Ticker"  k="ticker"    sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="left" />
                <Th label="Asset"   k="label"     sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="left" />
                <Th label="Pillar"  k="pillar"    sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="left" />
                <Th label="Gew."    k="weight"    sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="left" />
                <Th label="Sharpe"  k="sharpeOos" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="left" />
                <Th label="CAGR"    k="cagr"      sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="left" />
                <Th label="Max DD"  k="maxDd"     sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="left" />
                <Th label="PF"      k="pf"        sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="left" />
                <Th label="Trades"  k="trades"    sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="left" />
                <Th label="WF/Win%" k="wfWin"     sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="left" />
                <Th label="Status"  k="status"    sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="left" />
                {liveCols && <>
                  <th style={{ fontFamily: "var(--font-montserrat),sans-serif", fontSize: 10, fontWeight: 600, letterSpacing: ".08em", color: MUTED, padding: "0 8px 9px", textAlign: "left", borderBottom: `1px solid ${RBORD}`, background: BG, borderLeft: "1px solid rgba(255,255,255,0.05)" }}>Preis</th>
                  <th style={{ fontFamily: "var(--font-montserrat),sans-serif", fontSize: 10, fontWeight: 600, letterSpacing: ".08em", color: MUTED, padding: "0 8px 9px", textAlign: "left", borderBottom: `1px solid ${RBORD}`, background: BG }}>Signal</th>
                  <th style={{ fontFamily: "var(--font-montserrat),sans-serif", fontSize: 10, fontWeight: 600, letterSpacing: ".08em", color: MUTED, padding: "0 8px 9px", textAlign: "left", borderBottom: `1px solid ${RBORD}`, background: BG, whiteSpace: "nowrap" as const }}>Von – Bis</th>
                </>}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const isArch = row.status === "archived";
                const isExp  = expandedId === row.id;
                if (!isArch) rowNum++;
                const live = liveCols ? matchLive(row.ticker, liveData) : null;

                // price color: positive day = bright white, negative = gold
                const priceChg = live?.changePct ?? null;
                const priceColor = live == null ? "rgba(255,255,255,0.18)"
                  : priceChg != null && priceChg > 0.01 ? "rgba(255,255,255,0.92)"
                  : priceChg != null && priceChg < -0.01 ? "#d8bc67"
                  : "rgba(255,255,255,0.78)";

                // signal: check if there's an open trade matching this ticker
                const hasTrade = liveCols && liveTrades.some(t => {
                  const base = row.ticker.split(" ")[0].replace("1!", "").toUpperCase();
                  const ts = (t.symbol ?? "").replace("1!", "").toUpperCase();
                  return ts === base || ts.startsWith(base) || base.startsWith(ts);
                });

                const dataRow = (
                  <tr key={row.id}
                    onClick={() => !isArch && toggle(row.id)}
                    style={{ opacity: isArch ? 0.18 : 1, cursor: isArch ? "default" : "pointer", borderBottom: `1px solid ${RBORD}`, background: isExp ? "rgba(255,255,255,0.02)" : "transparent", transition: "background .1s" }}
                    onMouseEnter={e => { if (!isArch && !isExp) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.012)"; }}
                    onMouseLeave={e => { if (!isExp) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                  >
                    <td style={{ padding: "5px 6px", textAlign: "left", fontSize: 9, color: "rgba(255,255,255,0.65)", fontWeight: 600, width: 26, fontVariantNumeric: "tabular-nums" }}>{isArch ? "" : rowNum}</td>
                    <td style={{ padding: "5px 3px", width: 18, textAlign: "center" }}>
                      {!isArch && <span style={{ fontSize: 10, color: isExp ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.15)", display: "inline-block", transform: isExp ? "rotate(90deg)" : "none", transition: "transform .2s" }}>›</span>}
                    </td>
                    <td style={{ padding: "5px 8px" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <TickerIcon ticker={row.ticker} />
                        <span style={{ fontWeight: 700, fontSize: 11, color: "rgba(255,255,255,0.88)", letterSpacing: ".02em", fontVariantNumeric: "tabular-nums" }}>{row.ticker}</span>
                      </span>
                    </td>
                    <td style={{ padding: "5px 8px", color: "rgba(255,255,255,0.35)", fontSize: 10, textAlign: "left" }}>{row.label}</td>
                    <td style={{ padding: "5px 8px", fontSize: 9, color: "rgba(255,255,255,0.22)", letterSpacing: ".04em", textAlign: "left" }}>{row.pillarLabel}</td>
                    <td style={{ padding: "5px 8px", textAlign: "left", color: row.weight ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.15)", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                      {row.weight != null ? `${row.weight}%` : "—"}
                    </td>
                    <td style={{ padding: "5px 8px", textAlign: "left", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: numColor(row.sharpeOos) }}>
                      {row.sharpeOos != null ? fmtN(row.sharpeOos) : "—"}
                    </td>
                    <td style={{ padding: "5px 8px", textAlign: "left", color: strNumColor(row.cagr), fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{row.cagr ?? "—"}</td>
                    <td style={{ padding: "5px 8px", textAlign: "left", color: strNumColor(row.maxDd), fontVariantNumeric: "tabular-nums" }}>{row.maxDd ?? "—"}</td>
                    <td style={{ padding: "5px 8px", textAlign: "left", color: (row.pf ?? 0) >= 1.3 ? "rgba(255,255,255,0.75)" : row.pf ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.15)", fontVariantNumeric: "tabular-nums" }}>
                      {row.pf != null ? fmtN(row.pf) : "—"}
                    </td>
                    <td style={{ padding: "5px 8px", textAlign: "left", color: "rgba(255,255,255,0.28)", fontSize: 10, fontVariantNumeric: "tabular-nums" }}>{row.trades != null ? row.trades.toLocaleString("de") : "—"}</td>
                    <td style={{ padding: "5px 8px", textAlign: "left", color: "rgba(255,255,255,0.28)", fontSize: 10 }}>{row.wfWin ?? "—"}</td>
                    <td style={{ padding: "5px 8px" }}><Chip status={row.status} /></td>

                    {liveCols && (() => {
                      const price = live?.lastClose ?? null;
                      const from  = live?.firstDate ?? null;
                      return (
                        <>
                          <td style={{ padding: "5px 8px", textAlign: "left", fontVariantNumeric: "tabular-nums", color: priceColor, borderLeft: "1px solid rgba(255,255,255,0.05)", fontWeight: price != null ? 600 : 400 }}>
                            {price != null ? fmtPrice(price, row.ticker) : "—"}
                          </td>
                          <td style={{ padding: "5px 8px", textAlign: "left" }}>
                            <SignalCell hasTrade={hasTrade} />
                          </td>
                          <td suppressHydrationWarning style={{ padding: "5px 8px", textAlign: "left", color: "rgba(255,255,255,0.28)", fontSize: 9, whiteSpace: "nowrap" as const }}>
                            {from ? `${fmtVon(from)} – ${fmtBisNow()}` : "—"}
                          </td>
                        </>
                      );
                    })()}
                  </tr>
                );

                const expRow = (
                  <tr key={`${row.id}_x`}>
                    <td colSpan={13 + (liveCols ? LIVE_EXTRA : 0)} style={{ padding: 0, border: "none" }}>
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

        {/* bottom gradient */}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 140, background: `linear-gradient(to bottom, transparent 0%, ${BG}cc 55%, ${BG} 100%)`, pointerEvents: "none", zIndex: 3 }} />
      </div>
    </div>
  );
}
