/**
 * bridge_intraday_mt.mjs
 *
 * Bridges freshly-scraped intraday futures bars (from tv_datafeed_collector.py)
 * into the shape the dashboard + seeder expect, and upserts them straight into
 * Supabase `monitoring_ohlc` — surgically, only the Intraday MT targets, so we
 * never re-seed the whole 56-asset manifest.
 *
 * For each target in intraday_mt.targets.json it:
 *   1. Loads bars from the collector output  <cache>/history/<symbol>_<interval>.json
 *      (falls back to the existing public cache file if the collector hasn't run).
 *   2. Writes/refreshes the public cache file  public/.../<TF>/<EXCHANGE>_<SYM>_<TF>.json
 *   3. Upserts a manifest entry into cache_manifest_full.json (asset=<sym>_<tf>).
 *   4. Upserts the bars into monitoring_ohlc  (asset=<sym>_<tf>, timeframe=<TF>,
 *      date=full ISO timestamp for intraday so each bar is unique).
 *
 * Run:  node tools/market-data/bridge_intraday_mt.mjs
 * Env (.env.local):  NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *                    TRADINGVIEW_CACHE_DIR (optional, collector output dir)
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");
loadEnv({ path: join(REPO_ROOT, ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌  NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing in .env.local");
  process.exit(1);
}
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

// Collector default cache dir. tv_datafeed_collector.py uses parents[2] of the
// tool file = the repo root, so the cache lives at <repo>/.capitalife-cache/...
// (TRADINGVIEW_CACHE_DIR overrides). Must match the collector or the bridge finds nothing.
const COLLECTOR_CACHE =
  process.env.TRADINGVIEW_CACHE_DIR ||
  resolve(REPO_ROOT, ".capitalife-cache", "market-data", "tradingview");

const cfg = JSON.parse(readFileSync(join(__dirname, "intraday_mt.targets.json"), "utf-8"));
const PUBLIC_CACHE_DIR = join(REPO_ROOT, cfg.publicCacheDir);
const MANIFEST_PATH = join(REPO_ROOT, cfg.manifestPath);

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Read bars from collector history first, else the existing public cache file.
function loadBars(target) {
  const collectorFile = join(COLLECTOR_CACHE, "history", `${target.symbol}_${target.interval}.json`);
  const publicFile = join(PUBLIC_CACHE_DIR, target.publicCacheRel);
  let src = null;
  let raw = null;
  if (existsSync(collectorFile)) {
    raw = JSON.parse(readFileSync(collectorFile, "utf-8"));
    src = "collector";
  } else if (existsSync(publicFile)) {
    raw = JSON.parse(readFileSync(publicFile, "utf-8"));
    src = "public-cache";
  } else {
    return { bars: [], src: "missing" };
  }
  const list = Array.isArray(raw) ? raw : raw.bars ?? raw.data ?? [];
  const bars = [];
  for (const r of list) {
    const t = String(r.date ?? r.time ?? r.Date ?? r.Time ?? "");
    const o = num(r.open ?? r.Open);
    const h = num(r.high ?? r.High);
    const l = num(r.low ?? r.Low);
    const c = num(r.close ?? r.Close);
    if (!t || o === null || h === null || l === null || c === null || c <= 0) continue;
    bars.push({ time: t, open: o, high: h, low: l, close: c, volume: num(r.volume ?? r.Volume) });
  }
  bars.sort((a, b) => a.time.localeCompare(b.time));
  return { bars, src, collectorFile, publicFile };
}

// Public cache uses full ISO for intraday; keep the raw timestamp the collector gave.
function writePublicCache(publicFile, bars) {
  mkdirSync(dirname(publicFile), { recursive: true });
  writeFileSync(
    publicFile,
    JSON.stringify({ bars: bars.map((b) => ({ date: b.time, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume })) }, null, 2),
    "utf-8",
  );
}

function upsertManifestEntry(manifest, target) {
  manifest.assets = manifest.assets ?? [];
  const cachePath = `${cfg.publicCacheDir}/${target.publicCacheRel}`;
  const idx = manifest.assets.findIndex((a) => a.asset === target.asset && (a.timeframe ?? "D") === target.tf);
  const entry = { asset: target.asset, source: target.tvSource, tab: target.tab, timeframe: target.tf, cachePath };
  if (idx >= 0) manifest.assets[idx] = { ...manifest.assets[idx], ...entry };
  else manifest.assets.push(entry);
}

// Intraday date key: full ISO (unique per bar); daily would slice to 10.
function dbDate(t) {
  return t.length > 10 ? t.slice(0, 19).replace(" ", "T") : t.slice(0, 10);
}

async function upsertMonitoringOhlc(target, bars) {
  const byDate = new Map();
  for (const b of bars) byDate.set(dbDate(b.time), b);
  const rows = [...byDate.entries()].map(([date, b]) => ({
    asset: target.asset,
    timeframe: target.tf,
    date,
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
    volume: b.volume ?? null,
  }));
  const BATCH = 500;
  let n = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const { error } = await db.from("monitoring_ohlc").upsert(chunk, { onConflict: "asset,timeframe,date" });
    if (error) throw new Error(`upsert ${target.asset}: ${error.message}`);
    n += chunk.length;
  }
  return n;
}

async function main() {
  const manifest = existsSync(MANIFEST_PATH) ? JSON.parse(readFileSync(MANIFEST_PATH, "utf-8")) : { assets: [] };
  console.log(`Bridge: collector cache = ${COLLECTOR_CACHE}`);
  let seeded = 0;
  for (const target of cfg.targets) {
    const { bars, src } = loadBars(target);
    if (!bars.length) {
      console.warn(`  ⚠️  ${target.asset.padEnd(12)} — no bars (${src}); scrape ${target.tvSource} @ ${target.interval} first`);
      continue;
    }
    const publicFile = join(PUBLIC_CACHE_DIR, target.publicCacheRel);
    if (src === "collector") writePublicCache(publicFile, bars);
    upsertManifestEntry(manifest, target);
    const n = await upsertMonitoringOhlc(target, bars);
    seeded += n;
    console.log(`  ✅  ${target.asset.padEnd(12)} ${String(n).padStart(5)} bars  [${bars[0].time} → ${bars[bars.length - 1].time}]  src=${src}`);
  }
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), "utf-8");
  console.log(`\nDone. ${seeded} intraday-MT bars upserted to monitoring_ohlc; manifest updated.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
