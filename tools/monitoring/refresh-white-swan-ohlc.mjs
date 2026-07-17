#!/usr/bin/env node
/**
 * White Swan Monitoring — OHLC Refresh Script
 * Reads the cache_manifest_full.json from Invoria/Fund Manager cache
 * and writes a status manifest to .capitalife-cache/invoria-monitoring/
 *
 * Usage:  node tools/monitoring/refresh-white-swan-ohlc.mjs
 * Or via: npm run monitoring:refresh
 *
 * Target date: 2026-07-09
 * No order execution. Read-only. Monitoring only.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "../..");
const TARGET_DATE = "2026-07-09";

// Paths
const MANIFEST_SRC = path.join(
  PROJECT_ROOT,
  "public/generated/monitoring/tradingview_data_cache/cache_manifest_full.json"
);
const ASSET_REGISTRY = path.join(
  PROJECT_ROOT,
  "src/data/monitoring/white-swan-monitoring-assets.json"
);
const CACHE_DIR = path.resolve(
  process.env.INVORIA_MONITORING_CACHE_DIR ??
    path.join(PROJECT_ROOT, "../../.capitalife-cache/invoria-monitoring")
);
const OUTPUT_MANIFEST = path.join(CACHE_DIR, "manifest.json");

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (e) {
    return null;
  }
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function isOk(lastDate) {
  if (!lastDate) return false;
  // Allow 1 day lag for weekends/holidays
  const d = new Date(lastDate);
  const target = new Date(TARGET_DATE);
  const diffDays = Math.floor((target - d) / 86400000);
  return diffDays <= 3;
}

async function run() {
  console.log("White Swan OHLC Refresh — target:", TARGET_DATE);
  console.log("Cache dir:", CACHE_DIR);
  ensureDir(CACHE_DIR);

  // Load manifest
  const manifest = readJson(MANIFEST_SRC);
  if (!manifest) {
    console.error("ERROR: cache_manifest_full.json not found at:", MANIFEST_SRC);
    process.exit(1);
  }
  console.log(`Manifest loaded: ${manifest.assets?.length ?? 0} assets, generated ${manifest.generatedAt}`);

  // Load asset registry
  const registry = readJson(ASSET_REGISTRY);
  const registryAssets = registry?.assets ?? [];

  // Build per-asset status
  // Dependency entries share the same asset name as a real tab entry but contain a different
  // secondary series (e.g. asset=CL1! tab=Dependency source=TVC:SPX). We process real tabs
  // first so they are not overwritten by Dependency duplicates. Within real tabs, first entry
  // for each asset_timeframe key wins (manifests are already de-duped by Invoria).
  const cacheAssets = manifest.assets ?? [];
  const realFirst = cacheAssets.filter((a) => a.tab !== "Dependency");
  const depOnly = cacheAssets.filter((a) => a.tab === "Dependency");
  const ordered = [...realFirst, ...depOnly];

  const seen = new Set();
  const perAsset = {};

  for (const a of ordered) {
    const key = `${a.asset}_${a.timeframe}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const ok = isOk(a.lastDate);
    const status = a.status !== "loaded" && a.status !== "loaded_from_existing_cache"
      ? "missing" : ok ? "ok" : "stale";

    if (!perAsset[a.asset]) perAsset[a.asset] = { symbol: a.asset, group: a.tab, timeframes: {} };
    perAsset[a.asset].timeframes[a.timeframe ?? "D"] = {
      status,
      last_bar_date: a.lastDate ?? null,
      bars_fetched: a.barsFetched ?? null,
      fetch_error: a.fetchError ?? null,
    };
  }

  // Merge registry symbols not in cache
  for (const ra of registryAssets) {
    if (!perAsset[ra.symbol]) {
      perAsset[ra.symbol] = {
        symbol: ra.symbol,
        group: ra.group,
        timeframes: {
          "1D": { status: "missing", last_bar_date: null, bars_fetched: null, fetch_error: "not in cache" },
        },
      };
    }
  }

  const allEntries = Object.values(perAsset);
  let okCount = 0, staleCount = 0, missingCount = 0;
  let minDate = null, maxDate = null;

  for (const entry of allEntries) {
    for (const tf of Object.values(entry.timeframes)) {
      if (tf.status === "ok") okCount++;
      else if (tf.status === "stale") staleCount++;
      else missingCount++;
      if (tf.last_bar_date) {
        if (!minDate || tf.last_bar_date < minDate) minDate = tf.last_bar_date;
        if (!maxDate || tf.last_bar_date > maxDate) maxDate = tf.last_bar_date;
      }
    }
  }

  const outputManifest = {
    schema: "white_swan_monitoring_manifest_v1",
    updated_at: new Date().toISOString(),
    target_date: TARGET_DATE,
    source_manifest_generated_at: manifest.generatedAt,
    total_assets: allEntries.length,
    total_timeframe_entries: okCount + staleCount + missingCount,
    ok_count: okCount,
    stale_count: staleCount,
    missing_count: missingCount,
    last_bar_date_min: minDate,
    last_bar_date_max: maxDate,
    coverage_note: `${okCount} of ${okCount + staleCount + missingCount} timeframe entries current to within 3 days of ${TARGET_DATE}`,
    assets: allEntries,
  };

  fs.writeFileSync(OUTPUT_MANIFEST, JSON.stringify(outputManifest, null, 2));
  console.log(`\nManifest written: ${OUTPUT_MANIFEST}`);
  console.log(`  ok:      ${okCount}`);
  console.log(`  stale:   ${staleCount}`);
  console.log(`  missing: ${missingCount}`);
  console.log(`  date range: ${minDate} → ${maxDate}`);
  console.log("\nDone. Monitoring only — no order execution.");
}

run().catch((e) => { console.error(e); process.exit(1); });
