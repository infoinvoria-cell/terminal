import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Bar {
  ts:    number;  // unix seconds (UTC)
  date:  string;  // YYYY-MM-DD
  dow:   number;  // 0=Mon … 4=Fri
  open:  number;
  high:  number;
  low:   number;
  close: number;
}

interface RawTrade {
  direction:  "long" | "short";
  entry:      number;
  exit:       number;
  win:        boolean;
  pnl_pct:    number;
  entry_date: string;
  exit_date:  string;
}

interface Trade extends RawTrade { equity: number; }

// ── Local data paths ───────────────────────────────────────────────────────────

const BASE = process.env.LOCAL_DATA_BASE ?? "C:\\Users\\joris\\Desktop";

const LOCAL_PATHS = {
  EURUSD_DIR:   path.join(BASE, "Intraday_alt"),
  EURUSD_PFX:   "OANDA_EURUSD, 30_",
  FDAX_FILE:    path.join(BASE, "Anomalien", "EUREX_FDAX_30min_gesamt_2007-2026.csv"),
  GC_FILE:      path.join(BASE, "Data",      "COMEX_DL_GC1!, 1D_9da73.csv"),
  GLD_FILE:     path.join(BASE, "Anomalien", "GLD.csv"),
  YM_FILE:      path.join(BASE, "Indices",   "CBOT_MINI_DL_YM1!, 1D_60682.csv"),
};

// ── CSV parsing ────────────────────────────────────────────────────────────────

// Module-level cache to avoid re-reading large files on every request
const _rawCache = new Map<string, Bar[]>();

function parseCSV(content: string): Bar[] {
  const lines = content.trim().split(/\r?\n/);
  const bars: Bar[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",");
    if (parts.length < 5) continue;
    const [timeStr, openStr, highStr, lowStr, closeStr] = parts;
    const close = parseFloat(closeStr.trim());
    if (isNaN(close)) continue;
    const raw = timeStr.trim();
    // Support both "YYYY-MM-DD" and ISO-8601 with timezone
    const d = new Date(raw.includes("T") ? raw : raw + "T12:00:00Z");
    const ts = d.getTime() / 1000;
    if (isNaN(ts)) continue;
    bars.push({
      ts,
      date:  d.toISOString().slice(0, 10),
      dow:   (d.getUTCDay() + 6) % 7,
      open:  parseFloat(openStr.trim())  || close,
      high:  parseFloat(highStr.trim())  || close,
      low:   parseFloat(lowStr.trim())   || close,
      close,
    });
  }
  return bars;
}

function readCached(filePath: string): Bar[] {
  if (_rawCache.has(filePath)) return _rawCache.get(filePath)!;
  const content = fs.readFileSync(filePath, "utf-8");
  const bars    = parseCSV(content);
  _rawCache.set(filePath, bars);
  return bars;
}

// Merge all CSV files in a directory whose names start with a given prefix
function readMergedCSV(dir: string, prefix: string): Bar[] {
  const cacheKey = `${dir}/${prefix}`;
  if (_rawCache.has(cacheKey)) return _rawCache.get(cacheKey)!;

  const files = fs.readdirSync(dir)
    .filter(f => f.startsWith(prefix) && f.endsWith(".csv"));

  const all: Bar[] = [];
  for (const f of files) {
    try {
      const content = fs.readFileSync(path.join(dir, f), "utf-8");
      all.push(...parseCSV(content));
    } catch { /* skip unreadable */ }
  }

  // Sort by timestamp, deduplicate
  all.sort((a, b) => a.ts - b.ts);
  const seen = new Set<number>();
  const merged = all.filter(b => { if (seen.has(b.ts)) return false; seen.add(b.ts); return true; });

  _rawCache.set(cacheKey, merged);
  return merged;
}

// Resample 30-min bars into 1H or 2H bars
function resample(bars: Bar[], periodSec: number): Bar[] {
  const groups = new Map<number, Bar[]>();
  for (const b of bars) {
    const key = Math.floor(b.ts / periodSec) * periodSec;
    const g = groups.get(key) ?? [];
    g.push(b);
    groups.set(key, g);
  }
  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, g]) => ({
      ts:    g[0].ts,
      date:  g[0].date,
      dow:   g[0].dow,
      open:  g[0].open,
      high:  Math.max(...g.map(b => b.high)),
      low:   Math.min(...g.map(b => b.low)),
      close: g[g.length - 1].close,
    }));
}

function filterByDate(bars: Bar[], start: string, end: string): Bar[] {
  return bars.filter(b => b.date >= start && b.date <= end);
}

// ── Yahoo Finance (fallback when local files unavailable) ──────────────────────

const YAHOO_SYMBOLS: Record<string, { futures: string; cfd: string }> = {
  EUR_30M:  { futures: "6E=F",   cfd: "EURUSD=X" },
  DAX_1H:   { futures: "^GDAXI", cfd: "^GDAXI"   },
  DAX_2H:   { futures: "^GDAXI", cfd: "^GDAXI"   },
  GC_FRI:   { futures: "GC=F",   cfd: "GC=F"     },
  GLD_THU:  { futures: "GLD",    cfd: "GLD"       },
  YM_TAT:   { futures: "YM=F",   cfd: "^DJI"     },
};

type Interval = "30m" | "1h" | "2h" | "1d";

const STRAT_INTERVAL: Record<string, Interval> = {
  EUR_30M: "30m", DAX_1H: "1h", DAX_2H: "2h",
  GC_FRI: "1d", GLD_THU: "1d", YM_TAT: "1d",
};

const SIGNAL_RANGE: Record<string, string> = {
  EUR_30M: "60d", DAX_1H: "6mo", DAX_2H: "6mo",
  GC_FRI: "1y", GLD_THU: "1y", YM_TAT: "1y",
};

async function fetchFromYahoo(url: string, symbol: string): Promise<Bar[]> {
  const resp = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Accept": "application/json",
    },
    cache: "no-store",
  });
  if (!resp.ok) throw new Error(`Yahoo Finance ${resp.status} for ${symbol}`);

  const json = await resp.json() as {
    chart: {
      result?: [{
        timestamp: number[];
        indicators: { quote: [{ open: number[]; high: number[]; low: number[]; close: number[] }] };
      }];
      error?: { description: string };
    };
  };

  if (json.chart.error) throw new Error(`Yahoo: ${json.chart.error.description}`);
  const r = json.chart.result?.[0];
  if (!r?.timestamp?.length) throw new Error(`No data for ${symbol}`);

  const q = r.indicators.quote[0];
  return r.timestamp.map((ts, i) => {
    const c = q.close[i];
    const d = new Date(ts * 1000);
    return { ts, date: d.toISOString().slice(0, 10), dow: (d.getUTCDay() + 6) % 7,
      open: q.open[i] ?? c, high: q.high[i] ?? c, low: q.low[i] ?? c, close: c };
  }).filter(b => b.close != null && !isNaN(b.close));
}

async function fetchBars(symbol: string, interval: Interval, start: string, end: string): Promise<Bar[]> {
  const p1 = Math.floor(new Date(start).getTime() / 1000);
  const p2 = Math.floor(new Date(end + "T23:59:59Z").getTime() / 1000);
  return fetchFromYahoo(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?interval=${interval}&period1=${p1}&period2=${p2}&includePrePost=false`,
    symbol
  );
}

async function fetchBarsRange(symbol: string, interval: Interval, range: string): Promise<Bar[]> {
  return fetchFromYahoo(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?interval=${interval}&range=${range}&includePrePost=false`,
    symbol
  );
}

// ── Data loader: local CSV first, Yahoo fallback ───────────────────────────────

async function loadBars(
  strategy: string, assetType: string, start: string, end: string
): Promise<{ bars: Bar[]; source: string }> {
  try {
    let raw: Bar[] | null = null;

    switch (strategy) {
      case "EUR_30M":
        raw = readMergedCSV(LOCAL_PATHS.EURUSD_DIR, LOCAL_PATHS.EURUSD_PFX);
        break;
      case "DAX_1H": {
        const src = readCached(LOCAL_PATHS.FDAX_FILE);
        raw = resample(src, 3600);  // 30min → 1H
        break;
      }
      case "DAX_2H": {
        const src = readCached(LOCAL_PATHS.FDAX_FILE);
        raw = resample(src, 7200);  // 30min → 2H
        break;
      }
      case "GC_FRI":  raw = readCached(LOCAL_PATHS.GC_FILE);  break;
      case "GLD_THU": raw = readCached(LOCAL_PATHS.GLD_FILE); break;
      case "YM_TAT":  raw = readCached(LOCAL_PATHS.YM_FILE);  break;
    }

    if (raw && raw.length >= 10) {
      const bars = filterByDate(raw, start, end);
      if (bars.length >= 10) return { bars, source: "local CSV" };
    }
  } catch { /* local files unavailable → fall through */ }

  // Yahoo Finance fallback
  const sym    = YAHOO_SYMBOLS[strategy];
  const ticker = assetType === "cfd" ? sym.cfd : sym.futures;
  const bars   = await fetchBars(ticker, STRAT_INTERVAL[strategy], start, end);
  return { bars, source: "Yahoo Finance" };
}

// ── Math helpers ───────────────────────────────────────────────────────────────

function calcEMA(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  let e = values[0];
  return values.map(v => { e = v * k + e * (1 - k); return e; });
}

function calcATR(bars: Bar[], period: number): number[] {
  const tr = bars.map((b, i) => {
    const pc = i === 0 ? b.close : bars[i - 1].close;
    return Math.max(b.high - b.low, Math.abs(b.high - pc), Math.abs(b.low - pc));
  });
  return calcEMA(tr, period);
}

function r(v: number, d = 2) { return Math.round(v * 10 ** d) / 10 ** d; }

// ── Strategy runners ───────────────────────────────────────────────────────────

function runEmaCross(bars: Bar[], fastP: number, slowP: number, slDist: number, tpDist: number): RawTrade[] {
  const close = bars.map(b => b.close);
  const fast  = calcEMA(close, fastP);
  const slow  = calcEMA(close, slowP);
  const trades: RawTrade[] = [];
  type Pos = { dir: "long" | "short"; entry: number; sl: number; tp: number; date: string } | null;
  let pos: Pos = null;

  for (let i = Math.max(fastP, slowP) + 1; i < bars.length; i++) {
    const b = bars[i];
    const crossUp   = fast[i - 1] <= slow[i - 1] && fast[i] > slow[i];
    const crossDown = fast[i - 1] >= slow[i - 1] && fast[i] < slow[i];

    if (pos) {
      let exitPrice: number | null = null;
      let win = false;
      if (pos.dir === "long") {
        if (b.low  <= pos.sl)        { exitPrice = pos.sl;  win = false; }
        else if (b.high >= pos.tp)   { exitPrice = pos.tp;  win = true; }
        else if (crossDown)          { exitPrice = b.close; win = b.close > pos.entry; }
      } else {
        if (b.high >= pos.sl)        { exitPrice = pos.sl;  win = false; }
        else if (b.low  <= pos.tp)   { exitPrice = pos.tp;  win = true; }
        else if (crossUp)            { exitPrice = b.close; win = b.close < pos.entry; }
      }
      if (exitPrice !== null) {
        const pnl = pos.dir === "long"
          ? (exitPrice - pos.entry) / pos.entry
          : (pos.entry - exitPrice) / pos.entry;
        trades.push({ direction: pos.dir, entry: pos.entry, exit: exitPrice, win, pnl_pct: pnl, entry_date: pos.date, exit_date: b.date });
        pos = null;
      }
    }

    if (!pos) {
      if (crossUp)        pos = { dir: "long",  entry: b.close, sl: b.close - slDist, tp: b.close + tpDist, date: b.date };
      else if (crossDown) pos = { dir: "short", entry: b.close, sl: b.close + slDist, tp: b.close - tpDist, date: b.date };
    }
  }
  return trades;
}

function runDax2H(bars: Bar[]): RawTrade[] {
  const close = bars.map(b => b.close);
  const ema4  = calcEMA(close, 4);
  const atr14 = calcATR(bars, 14);
  const trades: RawTrade[] = [];
  type Pos = { entry: number; sl: number; tp: number; date: string; risk: number; beHit: boolean };
  let pos: Pos | null = null;

  for (let i = 10; i < bars.length; i++) {
    const b = bars[i];
    if (pos) {
      if (!pos.beHit && b.high >= pos.entry + pos.risk) { pos.beHit = true; pos.sl = pos.entry; }
      let exitPrice: number | null = null;
      let win = false;
      if      (b.low  <= pos.sl)             { exitPrice = pos.sl;  win = pos.sl > pos.entry; }
      else if (b.high >= pos.tp)             { exitPrice = pos.tp;  win = true; }
      else if (ema4[i] < ema4[i - 1])       { exitPrice = b.close; win = b.close > pos.entry; }
      if (exitPrice !== null) {
        const pnl = (exitPrice - pos.entry) / pos.entry;
        trades.push({ direction: "long", entry: pos.entry, exit: exitPrice, win, pnl_pct: pnl, entry_date: pos.date, exit_date: b.date });
        pos = null;
      }
    }
    if (!pos && b.low < bars[i - 1].low && b.close > b.open && ema4[i] > ema4[i - 1] && atr14[i] > 0) {
      const risk = atr14[i] * 0.8;
      pos = { entry: b.close, sl: b.close - risk, tp: b.close + risk * 3, date: b.date, risk, beHit: false };
    }
  }
  return trades;
}

function runGCFriday(bars: Bar[]): RawTrade[] {
  const atr4  = calcATR(bars, 4);
  const atr14 = calcATR(bars, 14);
  const trades: RawTrade[] = [];
  type Pos = { entry: number; sl: number; tp: number; date: string };
  let pos: Pos | null = null;

  for (let i = 15; i < bars.length; i++) {
    const b = bars[i];
    if (pos) {
      let exitPrice: number | null = null;
      let win = false;
      if      (b.low  <= pos.sl)       { exitPrice = pos.sl;  win = false; }
      else if (b.high >= pos.tp)       { exitPrice = pos.tp;  win = true; }
      else if (b.date !== pos.date)    { exitPrice = b.close; win = b.close > pos.entry; }
      if (exitPrice !== null) {
        trades.push({ direction: "long", entry: pos.entry, exit: exitPrice, win, pnl_pct: (exitPrice - pos.entry) / pos.entry, entry_date: pos.date, exit_date: b.date });
        pos = null;
      }
    }
    if (!pos && b.dow === 4 && atr4[i] <= atr14[i] * 1.5) {
      const risk = atr14[i] * 0.75;
      pos = { entry: b.close, sl: b.close - risk, tp: b.close + risk * 1.25, date: b.date };
    }
  }
  return trades;
}

function runGLDThursday(bars: Bar[]): RawTrade[] {
  const atr14 = calcATR(bars, 14);
  const trades: RawTrade[] = [];
  type Pos = { entry: number; sl: number; tp: number; date: string };
  let pos: Pos | null = null;

  for (let i = 15; i < bars.length; i++) {
    const b = bars[i];
    if (pos) {
      let exitPrice: number | null = null;
      let win = false;
      if      (b.low  <= pos.sl) { exitPrice = pos.sl;  win = false; }
      else if (b.high >= pos.tp) { exitPrice = pos.tp;  win = true; }
      else if (b.dow  === 4)     { exitPrice = b.close; win = b.close > pos.entry; }
      if (exitPrice !== null) {
        trades.push({ direction: "long", entry: pos.entry, exit: exitPrice, win, pnl_pct: (exitPrice - pos.entry) / pos.entry, entry_date: pos.date, exit_date: b.date });
        pos = null;
      }
    }
    if (!pos && b.dow === 3) {
      const risk = atr14[i] * 1.5;
      pos = { entry: b.close, sl: b.close - risk, tp: b.close + risk * 2, date: b.date };
    }
  }
  return trades;
}

function runYMTAT(bars: Bar[]): RawTrade[] {
  const atr14 = calcATR(bars, 14);
  const trades: RawTrade[] = [];
  type Pos = { entry: number; sl: number; tp: number; date: string };
  let pos: Pos | null = null;

  for (let i = 2; i < bars.length; i++) {
    const b = bars[i], prev = bars[i - 1], pp = bars[i - 2];
    if (pos) {
      let exitPrice: number | null = null;
      let win = false;
      if      (b.low  <= pos.sl) { exitPrice = pos.sl;  win = false; }
      else if (b.high >= pos.tp) { exitPrice = pos.tp;  win = true; }
      else if (b.dow  === 2)     { exitPrice = b.close; win = b.close > pos.entry; }
      if (exitPrice !== null) {
        trades.push({ direction: "long", entry: pos.entry, exit: exitPrice, win, pnl_pct: (exitPrice - pos.entry) / pos.entry, entry_date: pos.date, exit_date: b.date });
        pos = null;
      }
    }
    if (!pos && b.dow === 1 && prev.dow === 0 && prev.close < pp.close) {
      const risk = atr14[i] * 1.0;
      pos = { entry: b.close, sl: b.close - risk, tp: b.close + risk * 2, date: b.date };
    }
  }
  return trades;
}

// ── Equity + metrics ───────────────────────────────────────────────────────────

function withEquity(trades: RawTrade[]): Trade[] {
  let eq = 100;
  return trades.map(t => { eq = r(eq * (1 + t.pnl_pct), 4); return { ...t, equity: eq }; });
}

function computeMetrics(trades: Trade[], startDate: string, endDate: string) {
  if (!trades.length) return null;
  const curve: number[] = [100, ...trades.map(t => t.equity)];
  const pnls  = trades.map(t => t.pnl_pct);
  const years = Math.max(0.01, (new Date(endDate).getTime() - new Date(startDate).getTime()) / (365.25 * 24 * 3600 * 1000));

  const finalEq = curve[curve.length - 1];
  const cagr    = (Math.pow(finalEq / 100, 1 / years) - 1) * 100;

  let peak = curve[0]; let maxDD = 0;
  const drawdown = curve.map(v => {
    if (v > peak) peak = v;
    const dd = (v - peak) / peak * 100;
    if (dd < maxDD) maxDD = dd;
    return r(dd, 3);
  });

  const mean  = pnls.reduce((a, b) => a + b, 0) / pnls.length;
  const std   = Math.sqrt(pnls.reduce((a, b) => a + (b - mean) ** 2, 0) / pnls.length);
  const tpy   = trades.length / years;
  const sharpe = std > 0 ? (mean / std) * Math.sqrt(tpy) : 0;

  const wins   = pnls.filter(p => p > 0);
  const losses = pnls.filter(p => p <= 0);
  const grossP = wins.reduce((a, b) => a + b, 0);
  const grossL = Math.abs(losses.reduce((a, b) => a + b, 0));

  return {
    metrics: {
      cagr:         r(cagr, 2),
      sharpe:       r(sharpe, 2),
      maxDD:        r(maxDD, 2),
      calmar:       maxDD !== 0 ? r(cagr / Math.abs(maxDD), 2) : 0,
      trades:       trades.length,
      winRate:      r(wins.length / trades.length * 100, 1),
      profitFactor: r(grossL > 0 ? grossP / grossL : 99, 2),
      avgWin:       r(wins.length   ? wins.reduce((a, b) => a + b, 0)   / wins.length   * 100 : 0, 3),
      avgLoss:      r(losses.length ? losses.reduce((a, b) => a + b, 0) / losses.length * 100 : 0, 3),
      bestTrade:    r(Math.max(...pnls) * 100, 3),
      worstTrade:   r(Math.min(...pnls) * 100, 3),
    },
    equity:   curve.map(v => r(v, 2)),
    drawdown,
    trades:   trades.slice(-300),
  };
}

// ── Signal ─────────────────────────────────────────────────────────────────────

function emaSignal(bars: Bar[], fastP: number, slowP: number) {
  const close = bars.map(b => b.close);
  const fast  = calcEMA(close, fastP);
  const slow  = calcEMA(close, slowP);
  const n = bars.length - 1;
  let lastCrossBars: number | null = null, lastCrossDate: string | null = null;
  for (let i = n - 1; i > 0; i--) {
    const wasCross =
      (fast[i - 1] <= slow[i - 1] && fast[i] > slow[i]) ||
      (fast[i - 1] >= slow[i - 1] && fast[i] < slow[i]);
    if (wasCross) { lastCrossBars = n - i; lastCrossDate = bars[i].date; break; }
  }
  return {
    direction:       fast[n] > slow[n] ? "long" : "short",
    entry:           r(bars[n].close, 6),
    sl: 0, tp: 0,
    ema_fast_val:    r(fast[n], 6),
    ema_slow_val:    r(slow[n], 6),
    last_cross_bars: lastCrossBars,
    last_cross_date: lastCrossDate,
  };
}

// ── API handler ────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: Record<string, string>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { action, strategy, asset_type, start_date, end_date } = body;
  if (!strategy || !YAHOO_SYMBOLS[strategy]) {
    return NextResponse.json({ error: `Unknown strategy: ${strategy}` }, { status: 400 });
  }

  const start = start_date ?? "2019-01-01";
  const end   = end_date   ?? new Date().toISOString().slice(0, 10);

  // ── Backtest ────────────────────────────────────────────────────────────────
  if (action === "backtest") {
    try {
      const { bars, source } = await loadBars(strategy, asset_type ?? "futures", start, end);

      if (bars.length < 10) {
        return NextResponse.json({ error: `Zu wenig Daten: ${bars.length} Bars (${source}). Für 30min-Daten limitiert Yahoo Finance auf ~60 Tage.` });
      }

      let rawTrades: RawTrade[];
      switch (strategy) {
        case "EUR_30M":  rawTrades = runEmaCross(bars, 20, 50, 0.0013, 0.0039); break;
        case "DAX_1H":   rawTrades = runEmaCross(bars, 20, 50, 35, 126);        break;
        case "DAX_2H":   rawTrades = runDax2H(bars);                            break;
        case "GC_FRI":   rawTrades = runGCFriday(bars);                         break;
        case "GLD_THU":  rawTrades = runGLDThursday(bars);                      break;
        case "YM_TAT":   rawTrades = runYMTAT(bars);                            break;
        default: return NextResponse.json({ error: `Unknown strategy: ${strategy}` }, { status: 400 });
      }

      const trades = withEquity(rawTrades);
      const result = computeMetrics(trades, bars[0].date, bars[bars.length - 1].date);

      if (!result) return NextResponse.json({ error: "Keine Trades generiert. Datenfenster zu klein oder Bedingungen nicht erfüllt." });
      return NextResponse.json({ ...result, source, bars: bars.length });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
    }
  }

  // ── Signal ─────────────────────────────────────────────────────────────────
  if (action === "signal") {
    try {
      // For signal, use the last N bars of local data or fetch from Yahoo
      let bars: Bar[] | null = null;
      try {
        const today = new Date().toISOString().slice(0, 10);
        const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 3600 * 1000).toISOString().slice(0, 10);
        const { bars: localBars, source } = await loadBars(strategy, asset_type ?? "futures", sixMonthsAgo, today);
        if (localBars.length >= 10) { bars = localBars; void source; }
      } catch { /* fall through */ }

      if (!bars) {
        const sym    = YAHOO_SYMBOLS[strategy];
        const ticker = (asset_type === "cfd" ? sym.cfd : sym.futures);
        bars = await fetchBarsRange(ticker, STRAT_INTERVAL[strategy], SIGNAL_RANGE[strategy]);
      }

      if (bars.length < 10) throw new Error("Nicht genug Signal-Daten");

      if (strategy === "EUR_30M" || strategy === "DAX_1H") return NextResponse.json(emaSignal(bars, 20, 50));
      if (strategy === "DAX_2H")  return NextResponse.json(emaSignal(bars, 4, 20));

      const last = bars[bars.length - 1];
      return NextResponse.json({ direction: "flat", entry: r(last.close, 6), sl: 0, tp: 0 });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}
