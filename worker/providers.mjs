import "./env.mjs"; // load .env before reading process.env below (ESM hoisting-safe)
// worker/providers.mjs
// Provider config + fetch functions for the Railway master data worker.
// Node 18+ global fetch, no axios. Missing/placeholder keys => provider skips
// gracefully (returns []), so the worker deploys and runs before keys are added.
//
// IMPORTANT: never Yahoo Finance. Providers below are the sanctioned sources.

const env = (k, d = "") => (process.env[k] ?? d).trim();
const hasKey = (v) => Boolean(v) && v !== "PLACEHOLDER" && v !== "null";

export const PROVIDERS = {
  BARCHART: {
    name: "barchart",
    baseUrl: "https://ondemand.websol.barchart.com/getQuote.json",
    key: env("BARCHART_API_KEY", "PLACEHOLDER"),
    delay: 1000,
    // Barchart symbol -> our symbol (asset key in monitoring_ohlc)
    symbolMap: {
      CLY00: "CL1!", NGY00: "NG1!", HOY00: "HO1!", RBY00: "RB1!", BZY00: "BZ1!",
      GCY00: "GC1!", SIY00: "SI1!", HGY00: "HG1!", PAY00: "PA1!", PLY00: "PL1!",
      ZWY00: "ZW1!", ZCY00: "ZC1!", ZSY00: "ZS1!", CCY00: "CC1!", CTY00: "CT1!",
      KCY00: "KC1!", SBY00: "SB1!", OJY00: "OJ1!",
      ESY00: "ES1!", NQY00: "NQ1!", YMY00: "YM1!",
    },
  },
  FINNHUB: {
    name: "finnhub",
    baseUrl: "https://finnhub.io/api/v1",
    key: env("FINNHUB_API_KEY", "PLACEHOLDER"),
    delay: 1100,
    symbolMap: {
      "OANDA:EUR_USD": "6E1!", "OANDA:GBP_USD": "6B1!", "OANDA:USD_JPY": "6J1!",
      "OANDA:USD_CHF": "6S1!", "OANDA:AUD_USD": "6A1!", "OANDA:USD_CAD": "6C1!",
    },
  },
  ALPACA: {
    name: "alpaca",
    baseUrl: "https://data.alpaca.markets/v2",
    key: env("ALPACA_API_KEY", "PLACEHOLDER"),
    secret: env("ALPACA_SECRET", "PLACEHOLDER"),
    delay: 350,
  },
  TWELVE_DATA: {
    name: "twelvedata",
    baseUrl: "https://api.twelvedata.com",
    key: env("TWELVE_DATA_KEY", "PLACEHOLDER"),
    delay: 8000, // free tier = 8 credits/min → ~1 call / 8s stays compliant
    symbolMap: { FDAX: "FDAX1!", FESX: "FESX1!", FGBL: "FGBL1!" },
  },
  FRED: {
    name: "fred",
    baseUrl: "https://api.stlouisfed.org/fred/series/observations",
    key: env("FRED_API_KEY", "PLACEHOLDER"),
    delay: 600,
    series: [
      { fredId: "DCOILWTICO", symbol: "CL_SPOT" },
      { fredId: "GOLDAMGBD228NLBM", symbol: "GC_SPOT" },
      { fredId: "DGS10", symbol: "TNX" },
      { fredId: "DGS2", symbol: "DGS2" },
      { fredId: "DTWEXBGS", symbol: "DXY" },
      { fredId: "VIXCLS", symbol: "VIX" },
    ],
  },
};

export function providerReady(p) {
  if (p.name === "alpaca") return hasKey(p.key) && hasKey(p.secret);
  return hasKey(p.key);
}

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

// Interval mapping to each provider's own notation.
const TF = {
  barchart: { "1D": "daily", "30min": "30min", "1H": "60min", "2H": "120min", "60min": "60min" },
  twelvedata: { "1D": "1day", "30min": "30min", "1H": "1h", "2H": "2h", "60min": "1h" },
  alpaca: { "1D": "1Day", "30min": "30Min", "1H": "1Hour", "2H": "2Hour", "60min": "1Hour" },
};

// Returns [{ time: ISO, open, high, low, close, volume }] ascending, or [].
export async function fetchBars(provider, ourSymbol, timeframe, limit = 60) {
  if (!providerReady(provider)) return [];
  try {
    if (provider.name === "barchart") return await barchartBars(provider, ourSymbol, timeframe, limit);
    if (provider.name === "twelvedata") return await twelveBars(provider, ourSymbol, timeframe, limit);
    if (provider.name === "alpaca") return await alpacaBars(provider, ourSymbol, timeframe, limit);
    if (provider.name === "finnhub") return await finnhubBars(provider, ourSymbol, timeframe, limit);
    return [];
  } catch (e) {
    console.error(`[${provider.name}] ${ourSymbol} ${timeframe}: ${e?.message || e}`);
    return [];
  }
}

function ourToProvider(provider, ourSymbol) {
  const entry = Object.entries(provider.symbolMap ?? {}).find(([, v]) => v === ourSymbol);
  return entry ? entry[0] : ourSymbol;
}

async function barchartBars(p, ourSymbol, timeframe, limit) {
  const sym = ourToProvider(p, ourSymbol);
  const type = TF.barchart[timeframe] ?? "daily";
  const url = `https://ondemand.websol.barchart.com/getHistory.json?apikey=${encodeURIComponent(p.key)}&symbol=${encodeURIComponent(sym)}&type=${type}&maxRecords=${limit}&order=asc`;
  const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!r.ok) return [];
  const j = await r.json();
  return (j?.results ?? []).map((b) => ({
    time: new Date(b.timestamp ?? b.tradingDay).toISOString(),
    open: num(b.open), high: num(b.high), low: num(b.low), close: num(b.close), volume: num(b.volume),
  })).filter((b) => b.close != null);
}

async function twelveBars(p, ourSymbol, timeframe, limit) {
  const sym = ourToProvider(p, ourSymbol);
  const interval = TF.twelvedata[timeframe] ?? "1day";
  const url = `${p.baseUrl}/time_series?symbol=${encodeURIComponent(sym)}&interval=${interval}&outputsize=${limit}&order=ASC&apikey=${encodeURIComponent(p.key)}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!r.ok) return [];
  const j = await r.json();
  return (j?.values ?? []).map((b) => ({
    time: new Date(b.datetime.replace(" ", "T") + "Z").toISOString(),
    open: num(b.open), high: num(b.high), low: num(b.low), close: num(b.close), volume: num(b.volume),
  })).filter((b) => b.close != null);
}

async function alpacaBars(p, ourSymbol, timeframe, limit) {
  const tf = TF.alpaca[timeframe] ?? "1Day";
  const url = `${p.baseUrl}/stocks/${encodeURIComponent(ourSymbol)}/bars?timeframe=${tf}&limit=${limit}`;
  const r = await fetch(url, {
    headers: { "APCA-API-KEY-ID": p.key, "APCA-API-SECRET-KEY": p.secret },
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) return [];
  const j = await r.json();
  return (j?.bars ?? []).map((b) => ({
    time: new Date(b.t).toISOString(),
    open: num(b.o), high: num(b.h), low: num(b.l), close: num(b.c), volume: num(b.v),
  })).filter((b) => b.close != null);
}

async function finnhubBars(p, ourSymbol, timeframe, limit) {
  // Finnhub free tier: quote endpoint (single latest price) — used for live quotes.
  const sym = ourToProvider(p, ourSymbol);
  const url = `${p.baseUrl}/quote?symbol=${encodeURIComponent(sym)}&token=${encodeURIComponent(p.key)}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!r.ok) return [];
  const j = await r.json();
  if (j?.c == null) return [];
  return [{ time: new Date((j.t ? j.t * 1000 : Date.now())).toISOString(), open: num(j.o), high: num(j.h), low: num(j.l), close: num(j.c), volume: null }];
}

// FRED: EOD macro series -> latest observation as a synthetic close bar.
export async function fetchFredLatest(provider) {
  if (!providerReady(provider)) return [];
  const out = [];
  for (const s of provider.series) {
    try {
      const url = `${provider.baseUrl}?series_id=${s.fredId}&api_key=${encodeURIComponent(provider.key)}&file_type=json&sort_order=desc&limit=1`;
      const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!r.ok) continue;
      const j = await r.json();
      const obs = j?.observations?.[0];
      const val = num(obs?.value);
      if (val == null) continue;
      out.push({ symbol: s.symbol, date: obs.date, close: val });
      await new Promise((res) => setTimeout(res, provider.delay));
    } catch (e) {
      console.error(`[fred] ${s.symbol}: ${e?.message || e}`);
    }
  }
  return out;
}
