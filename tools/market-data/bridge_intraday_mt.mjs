/**
 * bridge_intraday_mt.mjs
 *
 * Legacy helper for refreshing the public intraday cache and manifest.
 *
 * Phase-4 production rule:
 * - canonical writer = Python
 * - this bridge is import/cache only by default
 * - monitoring_ohlc writes require explicit opt-in
 *
 * Modes:
 * - default / import_only: update public cache + manifest, no DB writes
 * - write_monitoring_ohlc: legacy emergency mode, also upsert monitoring_ohlc
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

const BRIDGE_MODE_DEFAULT = "import_only";
const BRIDGE_MODE = process.env.BRIDGE_INTRADAY_MODE || BRIDGE_MODE_DEFAULT;
const WRITES_MONITORING_OHLC = BRIDGE_MODE === "write_monitoring_ohlc";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");
loadEnv({ path: join(REPO_ROOT, ".env.local") });

let db = null;
if (WRITES_MONITORING_OHLC) {
  const { createClient } = await import("@supabase/supabase-js");
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing in .env.local");
    process.exit(1);
  }
  db = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const COLLECTOR_CACHE =
  process.env.TRADINGVIEW_CACHE_DIR ||
  resolve(REPO_ROOT, ".capitalife-cache", "market-data", "tradingview");

const cfg = JSON.parse(readFileSync(join(__dirname, "intraday_mt.targets.json"), "utf-8"));
const PUBLIC_CACHE_DIR = join(REPO_ROOT, cfg.publicCacheDir);
const MANIFEST_PATH = join(REPO_ROOT, cfg.manifestPath);

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

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
  for (const row of list) {
    const time = String(row.date ?? row.time ?? row.Date ?? row.Time ?? "");
    const open = num(row.open ?? row.Open);
    const high = num(row.high ?? row.High);
    const low = num(row.low ?? row.Low);
    const close = num(row.close ?? row.Close);
    if (!time || open === null || high === null || low === null || close === null || close <= 0) continue;
    bars.push({
      time,
      open,
      high,
      low,
      close,
      volume: num(row.volume ?? row.Volume),
    });
  }

  bars.sort((a, b) => a.time.localeCompare(b.time));
  return { bars, src };
}

function writePublicCache(publicFile, bars) {
  mkdirSync(dirname(publicFile), { recursive: true });
  writeFileSync(
    publicFile,
    JSON.stringify(
      {
        bars: bars.map((bar) => ({
          date: bar.time,
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
          volume: bar.volume,
        })),
      },
      null,
      2,
    ),
    "utf-8",
  );
}

function upsertManifestEntry(manifest, target) {
  manifest.assets = manifest.assets ?? [];
  const cachePath = `${cfg.publicCacheDir}/${target.publicCacheRel}`;
  const next = {
    asset: target.asset,
    source: target.tvSource,
    tab: target.tab,
    timeframe: target.tf,
    cachePath,
  };
  const index = manifest.assets.findIndex(
    (entry) => entry.asset === target.asset && (entry.timeframe ?? "D") === target.tf,
  );
  if (index >= 0) manifest.assets[index] = { ...manifest.assets[index], ...next };
  else manifest.assets.push(next);
}

function dbDate(value) {
  return value.length > 10 ? value.slice(0, 19).replace(" ", "T") : value.slice(0, 10);
}

async function upsertMonitoringOhlc(target, bars) {
  if (!db) return 0;

  const byDate = new Map();
  for (const bar of bars) byDate.set(dbDate(bar.time), bar);
  const rows = [...byDate.entries()].map(([date, bar]) => ({
    asset: target.asset,
    timeframe: target.tf,
    date,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume ?? null,
  }));

  const batchSize = 500;
  let written = 0;
  for (let index = 0; index < rows.length; index += batchSize) {
    const chunk = rows.slice(index, index + batchSize);
    const { error } = await db.from("monitoring_ohlc").upsert(chunk, {
      onConflict: "asset,timeframe,date",
    });
    if (error) throw new Error(`upsert ${target.asset}: ${error.message}`);
    written += chunk.length;
  }
  return written;
}

async function main() {
  const manifest = existsSync(MANIFEST_PATH)
    ? JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"))
    : { assets: [] };

  console.log(`Bridge: collector cache = ${COLLECTOR_CACHE}`);
  console.log(
    `Bridge: mode = ${BRIDGE_MODE}${WRITES_MONITORING_OHLC ? " (legacy DB write enabled)" : " (cache/import only)"}`,
  );

  let seeded = 0;
  for (const target of cfg.targets) {
    const { bars, src } = loadBars(target);
    if (!bars.length) {
      console.warn(`  WARN  ${target.asset.padEnd(12)} no bars (${src}); scrape ${target.tvSource} @ ${target.interval} first`);
      continue;
    }

    const publicFile = join(PUBLIC_CACHE_DIR, target.publicCacheRel);
    if (src === "collector") writePublicCache(publicFile, bars);
    upsertManifestEntry(manifest, target);

    const written = WRITES_MONITORING_OHLC ? await upsertMonitoringOhlc(target, bars) : 0;
    seeded += written;
    console.log(
      `  OK    ${target.asset.padEnd(12)} ${String(bars.length).padStart(5)} cache bars  [${bars[0].time} -> ${bars[bars.length - 1].time}]  src=${src}${WRITES_MONITORING_OHLC ? `  db=${written}` : ""}`,
    );
  }

  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), "utf-8");
  console.log(
    WRITES_MONITORING_OHLC
      ? `Done. ${seeded} intraday bars upserted to monitoring_ohlc; manifest updated.`
      : "Done. Public cache + manifest updated. monitoring_ohlc write path stayed disabled.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
