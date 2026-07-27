// worker/index.mjs — Capitalife master data worker (Railway)
// Provider API -> this worker -> Supabase -> Terminal.
// Writes to the REAL schema: monitoring_ohlc(asset,timeframe,date,ohlcv) and the
// existing live_quotes(symbol,ohlc,timestamp,updated_at). No Yahoo Finance.
//
// Run:  node worker/index.mjs
// Env:  SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL), SUPABASE_SERVICE_KEY (or
//       SUPABASE_SERVICE_ROLE_KEY), plus provider keys (see providers.mjs).

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { config as loadEnv } from "dotenv";
import cron from "node-cron";
import { createClient } from "@supabase/supabase-js";
import { PROVIDERS, providerReady, fetchBars, fetchFredLatest } from "./providers.mjs";

// Load worker/.env (provider keys) and the repo .env.local (Supabase) if present.
const HERE = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(HERE, ".env") });
loadEnv({ path: join(HERE, "..", ".env.local") });

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ SUPABASE_URL / SUPABASE_SERVICE_KEY missing — aborting");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Provider router (our symbol -> provider) ───────────────────────────────────
const FUTURES_BARCHART = new Set(["CL1!","NG1!","HO1!","RB1!","BZ1!","GC1!","SI1!","HG1!","PA1!","PL1!","ZW1!","ZC1!","ZS1!","CC1!","CT1!","KC1!","SB1!","OJ1!","ES1!","NQ1!","YM1!"]);
const FUTURES_FINNHUB = new Set(["6E1!","6B1!","6J1!","6S1!","6A1!","6C1!"]);
const FUTURES_TWELVE = new Set(["FDAX1!","FESX1!","FGBL1!"]);

function getProvider(symbol) {
  if (FUTURES_FINNHUB.has(symbol)) return PROVIDERS.FINNHUB;
  if (FUTURES_TWELVE.has(symbol)) return PROVIDERS.TWELVE_DATA;
  if (FUTURES_BARCHART.has(symbol)) return PROVIDERS.BARCHART;
  return PROVIDERS.ALPACA; // ETFs + stocks
}

// Daily uses YYYY-MM-DD; intraday keeps the full ISO timestamp (matches the app).
function dbDate(isoTime, timeframe) {
  return timeframe === "1D" || timeframe === "D" ? String(isoTime).slice(0, 10) : String(isoTime).slice(0, 19) + "Z";
}

async function writeOhlc(asset, timeframe, bars) {
  if (!bars.length) return 0;
  const rows = bars
    .filter((b) => b.close != null && b.close > 0)
    .map((b) => ({
      asset, timeframe,
      date: dbDate(b.time, timeframe),
      open: b.open ?? b.close, high: b.high ?? b.close, low: b.low ?? b.close, close: b.close,
      volume: b.volume ?? null,
    }));
  if (!rows.length) return 0;
  const { error } = await supabase.from("monitoring_ohlc").upsert(rows, { onConflict: "asset,timeframe,date" });
  if (error) { console.error(`[ohlc] ${asset}/${timeframe}: ${error.message}`); return 0; }
  return rows.length;
}

async function writeLiveQuote(symbol, bar) {
  if (bar?.close == null) return;
  const now = new Date().toISOString();
  const { error } = await supabase.from("live_quotes").upsert({
    symbol, open: bar.open ?? bar.close, high: bar.high ?? bar.close, low: bar.low ?? bar.close,
    close: bar.close, volume: bar.volume ?? 0, timestamp: now, updated_at: now,
  }, { onConflict: "symbol" });
  if (error) console.error(`[live_quotes] ${symbol}: ${error.message}`);
}

// Best-effort forward P&L: forward_signals lacks entry/current price columns in the
// base schema, so this only runs if those columns exist (errors are swallowed).
async function checkSignalTrigger(symbol, bar) {
  try {
    const { data: signals } = await supabase.from("forward_signals").select("*").eq("symbol", symbol).eq("in_position", true);
    for (const s of signals ?? []) {
      const entry = Number(s.entry_price);
      if (!Number.isFinite(entry) || entry === 0) continue;
      const chg = ((bar.close - entry) / entry) * 100;
      await supabase.from("forward_signals").update({
        current_price: bar.close,
        live_pnl_pct: String(s.direction).toUpperCase() === "SHORT" ? -chg : chg,
      }).eq("id", s.id);
    }
  } catch { /* columns may not exist — ignore */ }
}

// ── Fetch jobs ─────────────────────────────────────────────────────────────────
async function fetchIntraday(symbols, timeframe, barType) {
  console.log(`[${barType}] ${timeframe}: ${symbols.join(", ")}`);
  for (const symbol of symbols) {
    const provider = getProvider(symbol);
    if (!providerReady(provider)) { console.log(`  skip ${symbol} (${provider.name} key missing)`); continue; }
    const bars = await fetchBars(provider, symbol, timeframe, 60);
    if (bars.length) {
      await writeOhlc(symbol, timeframe, bars);
      const last = bars[bars.length - 1];
      await writeLiveQuote(symbol, last);
      if (barType === "POST_CLOSE") await checkSignalTrigger(symbol, last);
      console.log(`  ${symbol} ${timeframe}: ${bars.length} bars, last ${last.close}`);
    }
    await sleep(provider.delay);
  }
}

async function fetchDaily(symbols, tag) {
  console.log(`[daily/${tag}] ${symbols.join(", ")}`);
  for (const symbol of symbols) {
    const provider = getProvider(symbol);
    if (!providerReady(provider)) continue;
    const bars = await fetchBars(provider, symbol, "1D", 30);
    if (bars.length) { await writeOhlc(symbol, "D", bars); await writeLiveQuote(symbol, bars[bars.length - 1]); }
    await sleep(provider.delay);
  }
}

async function fetchFredData() {
  const rows = await fetchFredLatest(PROVIDERS.FRED);
  for (const r of rows) {
    await writeOhlc(r.symbol, "D", [{ time: r.date, open: r.close, high: r.close, low: r.close, close: r.close, volume: null }]);
    await writeLiveQuote(r.symbol, { open: r.close, high: r.close, low: r.close, close: r.close, volume: null });
  }
  if (rows.length) console.log(`[fred] ${rows.length} macro series updated`);
}

// Globe watchlist live prices — latest close per liquid asset, via each asset's provider.
async function fetchGlobePrices() {
  const all = [...FUTURES_BARCHART, ...FUTURES_FINNHUB, ...FUTURES_TWELVE, "QQQ","SPY","GLD","SPMO","AAPL","MSFT","NVDA","AMZN","GOOGL","META"];
  let n = 0;
  for (const symbol of all) {
    const provider = getProvider(symbol);
    if (!providerReady(provider)) continue;
    const bars = await fetchBars(provider, symbol, "1D", 2);
    if (bars.length) { await writeLiveQuote(symbol, bars[bars.length - 1]); n++; }
    await sleep(provider.delay);
  }
  if (n) console.log(`[globe] ${n} live prices refreshed`);
}

async function fullDailySync() {
  console.log("[full-sync] daily refresh of all mapped assets");
  await fetchDaily([...FUTURES_BARCHART], "futures");
  await fetchDaily(["QQQ","SPY","GLD","SPMO","AAPL","MSFT","NVDA","AMZN","GOOGL","META","TLT","IEF","HYG","LQD"], "etf");
  await fetchDaily([...FUTURES_TWELVE], "eurex");
  await fetchFredData();
}

// ── Scheduler ──────────────────────────────────────────────────────────────────
function startScheduler() {
  cron.schedule("28,58 * * * 1-5", () => fetchIntraday(["6E1!","6B1!"], "30min", "PRE_CLOSE"));
  cron.schedule("1,31 * * * 1-5", () => fetchIntraday(["6E1!","6B1!"], "30min", "POST_CLOSE"));
  cron.schedule("57 * * * 1-5", () => fetchIntraday(["FDAX1!"], "1H", "PRE_CLOSE"));
  cron.schedule("2 * * * 1-5", () => fetchIntraday(["FDAX1!"], "1H", "POST_CLOSE"));
  cron.schedule("57 0,2,4,6,8,10,12,14,16,18,20,22 * * 1-5", () => fetchIntraday(["FDAX1!"], "2H", "PRE_CLOSE"));
  cron.schedule("2 1,3,5,7,9,11,13,15,17,19,21,23 * * 1-5", () => fetchIntraday(["FDAX1!"], "2H", "POST_CLOSE"));
  cron.schedule("55 * * * 1-5", () => fetchIntraday(["GC1!"], "60min", "PRE_CLOSE"));
  cron.schedule("3 * * * 1-5", () => fetchIntraday(["GC1!"], "60min", "POST_CLOSE"));
  cron.schedule("0 22 * * 1-5", () => fetchDaily(["GLD","YM1!","FDAX1!","GC1!"], "ANOMALY_EOD"));
  cron.schedule("0 8,22 * * 1-5", () => fetchDaily(["GC1!","GLD","YM1!","CT1!","NQ1!"], "WHITE_SWAN"));
  cron.schedule("0 23 * * 1-5", () => fetchDaily(["QQQ","SPY","GLD","SPMO","HG1!","6S1!"], "CORE_INVEST"));
  cron.schedule("*/5 8-22 * * 1-5", () => fetchGlobePrices());
  cron.schedule("0 20 * * 1-5", () => fetchFredData());
  cron.schedule("0 6 * * 1-5", () => fullDailySync());
  console.log("✅ Scheduler active — all jobs registered");
}

// ── Boot ─────────────────────────────────────────────────────────────────────
const ready = Object.values(PROVIDERS).filter(providerReady).map((p) => p.name);
console.log(`Capitalife worker starting. Providers ready: ${ready.length ? ready.join(", ") : "NONE (all keys placeholder)"}`);
startScheduler();
if (process.argv.includes("--once")) {
  // One-off run for manual testing / first seed.
  fullDailySync().then(() => fetchGlobePrices()).then(() => { console.log("one-off done"); });
}
