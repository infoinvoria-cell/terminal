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
import { ASSETS, apiAssets, byProvider, SUMMARY } from "./signalAssets.mjs";

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

// ── Provider router (asset.provider -> PROVIDERS) ──────────────────────────────
// TradingView assets are handled by the separate tv_live_feed worker; this API
// worker only fetches finnhub / twelvedata / fred assets from signalAssets.mjs.
const PROVIDER_BY_NAME = {
  finnhub: PROVIDERS.FINNHUB,
  twelvedata: PROVIDERS.TWELVE_DATA,
  fred: PROVIDERS.FRED,
  barchart: PROVIDERS.BARCHART,
  alpaca: PROVIDERS.ALPACA,
};
function providerFor(asset) { return PROVIDER_BY_NAME[asset.provider] ?? null; }

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

// ── Fetch jobs (asset-driven from signalAssets.mjs; API assets only) ───────────
async function fetchApiAsset(asset, timeframe, limit) {
  const provider = providerFor(asset);
  if (!provider || !providerReady(provider)) return false;
  const apiSym = asset.apiSymbol ?? asset.symbol;
  const bars = await fetchBars(provider, apiSym, timeframe, limit);
  await sleep(provider.delay);
  if (!bars.length) return false;
  const tf = timeframe === "1D" ? "D" : timeframe;
  await writeOhlc(asset.symbol, tf, bars);
  const last = bars[bars.length - 1];
  await writeLiveQuote(asset.symbol, last);
  await checkSignalTrigger(asset.symbol, last);
  return true;
}

async function fetchFredData() {
  const rows = await fetchFredLatest(PROVIDERS.FRED);
  for (const r of rows) {
    await writeOhlc(r.symbol, "D", [{ time: r.date, open: r.close, high: r.close, low: r.close, close: r.close, volume: null }]);
    await writeLiveQuote(r.symbol, { open: r.close, high: r.close, low: r.close, close: r.close, volume: null });
  }
  if (rows.length) console.log(`[fred] ${rows.length} macro series updated`);
}

// Daily EOD for all finnhub/twelvedata assets + FRED macro.
async function fetchDailyApi() {
  const list = apiAssets().filter((a) => a.provider !== "fred");
  let n = 0;
  for (const a of list) if (await fetchApiAsset(a, "1D", 30)) n++;
  await fetchFredData();
  console.log(`[daily-api] ${n}/${list.length} assets refreshed + fred`);
}

// Live prices (latest bars) for all finnhub/twelvedata assets — feeds the Globe.
async function fetchGlobeApi() {
  const list = apiAssets().filter((a) => a.provider !== "fred");
  let n = 0;
  for (const a of list) if (await fetchApiAsset(a, "1D", 2)) n++;
  if (n) console.log(`[globe-api] ${n} live prices refreshed`);
}

// ── Scheduler ──────────────────────────────────────────────────────────────────
// NOTE: TradingView assets (all exchange futures) are handled by tv_live_feed.py.
// This worker only covers the finnhub/twelvedata/fred assets from signalAssets.
function startScheduler() {
  cron.schedule("*/10 8-22 * * 1-5", () => fetchGlobeApi()); // live prices every 10 min
  cron.schedule("0 23 * * 1-5", () => fetchDailyApi());       // EOD after US close
  cron.schedule("0 20 * * 1-5", () => fetchFredData());       // macro
  cron.schedule("0 6 * * 1-5", () => fetchDailyApi());        // morning full sync
  console.log("✅ Scheduler active — all API jobs registered");
}

// ── Boot ─────────────────────────────────────────────────────────────────────
const ready = Object.values(PROVIDERS).filter(providerReady).map((p) => p.name);
console.log(`Capitalife worker. Assets: ${SUMMARY.total} (tv:${SUMMARY.tradingview} finnhub:${SUMMARY.finnhub} twelvedata:${SUMMARY.twelvedata} fred:${SUMMARY.fred}).`);
console.log(`Providers ready: ${ready.length ? ready.join(", ") : "NONE (all keys placeholder — add to worker/.env)"}`);
startScheduler();
if (process.argv.includes("--once")) {
  fetchDailyApi().then(() => fetchGlobeApi()).then(() => console.log("one-off done"));
}
void ASSETS; void byProvider;
