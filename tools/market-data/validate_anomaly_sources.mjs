/**
 * validate_anomaly_sources.mjs
 *
 * Multi-source cross-validation for the 6 Monitoring strategy charts.
 *
 * Source A: Local TradingView data cache  (public/generated/monitoring/tradingview_data_cache/)
 * Source B: Pre-computed strategy payload (public/generated/monitoring/all_s-*.json)
 * Source C: Yahoo Finance (yfinance via Python, optional — requires Python + yfinance)
 * Source D: Supabase monitoring_ohlc (requires .env.local)
 *
 * Usage:
 *   node tools/market-data/validate_anomaly_sources.mjs
 *   node tools/market-data/validate_anomaly_sources.mjs --with-supabase
 *
 * Reports discrepancies where |A – B| / A > 0.5% for any OHLC field.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "../..");
loadEnv({ path: resolve(REPO, ".env.local") });

const WITH_SUPABASE = process.argv.includes("--with-supabase");

// ── Instrument definitions ──────────────────────────────────────────────────
const INSTRUMENTS = [
  {
    name: "FDAX1! 2H",
    tvcPath: "public/generated/monitoring/tradingview_data_cache/2H/EUREX_FDAX1_2H.json",
    allsPath: null,
    supabaseAsset: "FDAX1!_2H",
    supabaseTf: "2H",
    priceFloor: 1_000,
    priceCeiling: 100_000,
  },
  {
    name: "FDAX1! 1H",
    tvcPath: "public/generated/monitoring/tradingview_data_cache/1H/EUREX_FDAX1_1H.json",
    allsPath: null,
    supabaseAsset: "FDAX1!_1H",
    supabaseTf: "1H",
    priceFloor: 1_000,
    priceCeiling: 100_000,
  },
  {
    name: "6E1! 30M",
    tvcPath: "public/generated/monitoring/tradingview_data_cache/30M/CME_6E1_30M.json",
    allsPath: null,
    supabaseAsset: "6E1!_30M",
    supabaseTf: "30M",
    priceFloor: 0.5,
    priceCeiling: 3.0,
  },
  {
    name: "GC1! 1D",
    tvcPath: "public/generated/monitoring/tradingview_data_cache/D/COMEX_GC1_D.json",
    allsPath: "public/generated/monitoring/all_s-10-gold-macro-gc1.json",
    supabaseAsset: "GC1!",
    supabaseTf: "D",
    priceFloor: 100,
    priceCeiling: 20_000,
  },
  {
    name: "GLD 1D",
    tvcPath: null,
    allsPath: null,
    supabaseAsset: "GLD",
    supabaseTf: "D",
    priceFloor: 20,
    priceCeiling: 2_000,
  },
  {
    name: "YM1! 1D",
    tvcPath: "public/generated/monitoring/tradingview_data_cache/D/CBOT_MINI_YM1_D.json",
    allsPath: "public/generated/monitoring/all_s-5-dow-macro-ym1.json",
    supabaseAsset: "YM1!",
    supabaseTf: "D",
    priceFloor: 5_000,
    priceCeiling: 200_000,
  },
];

// ── Helpers ─────────────────────────────────────────────────────────────────
function readBars(filePath) {
  const abs = resolve(REPO, filePath);
  if (!existsSync(abs)) return null;
  try {
    const raw = JSON.parse(readFileSync(abs, "utf8"));
    return (raw.bars ?? []).map((b) => ({
      date: String(b.date ?? b.time ?? "").slice(0, 10),
      open: Number(b.open),
      high: Number(b.high),
      low: Number(b.low),
      close: Number(b.close),
    })).filter((b) => b.date && b.close > 0);
  } catch (e) {
    return null;
  }
}

function barMap(bars) {
  const m = new Map();
  for (const b of bars ?? []) m.set(b.date, b);
  return m;
}

function relDiff(a, b) {
  if (!a || !b || a === 0) return null;
  return Math.abs(a - b) / Math.abs(a);
}

const THRESHOLD = 0.005; // 0.5% tolerance for inter-source discrepancies

function compareTwo(nameA, barsA, nameB, barsB, lastNDays = 60) {
  const mapA = barMap(barsA);
  const mapB = barMap(barsB);
  const commonDates = [...mapA.keys()].filter((d) => mapB.has(d)).slice(-lastNDays);
  if (commonDates.length === 0) {
    console.log(`  ⚠️  No overlapping dates between ${nameA} and ${nameB}`);
    return;
  }
  let mismatches = 0;
  for (const date of commonDates) {
    const a = mapA.get(date);
    const b = mapB.get(date);
    for (const field of ["open", "high", "low", "close"]) {
      const diff = relDiff(a[field], b[field]);
      if (diff !== null && diff > THRESHOLD) {
        console.log(`  ❌ ${date} ${field.toUpperCase()}: ${nameA}=${a[field]} vs ${nameB}=${b[field]} diff=${(diff * 100).toFixed(2)}%`);
        mismatches++;
      }
    }
  }
  if (mismatches === 0) {
    console.log(`  ✅ ${nameA} vs ${nameB}: ${commonDates.length} overlapping days — no discrepancies > ${THRESHOLD * 100}%`);
  } else {
    console.log(`  ⚠️  ${nameA} vs ${nameB}: ${mismatches} field mismatch(es) over ${commonDates.length} days`);
  }
}

function checkPriceRange(name, bars, floor, ceiling) {
  if (!bars?.length) return;
  const recentBars = bars.slice(-30);
  let issues = 0;
  for (const b of recentBars) {
    if (b.close < floor || b.close > ceiling) {
      console.log(`  ❌ ${name} ${b.date} close=${b.close} outside [${floor}, ${ceiling}]`);
      issues++;
    }
  }
  const lastBar = recentBars.at(-1);
  if (lastBar) {
    const daysSince = Math.floor(
      (new Date().getTime() - new Date(lastBar.date + "T00:00:00Z").getTime()) / (1000 * 60 * 60 * 24),
    );
    const staleFlag = daysSince > 3 ? " *** STALE ***" : "";
    console.log(`  📅 ${name} last bar: ${lastBar.date} close=${lastBar.close} age=${daysSince}d${staleFlag}`);
  }
  if (!issues) console.log(`  ✅ ${name} recent 30 bars within price range [${floor}, ${ceiling}]`);
}

// ── Supabase fetch ────────────────────────────────────────────────────────────
async function fetchSupabaseBars(asset, timeframe, limit = 90) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const qs = new URLSearchParams({ asset, timeframe, limit: String(limit), order: "date.desc" });
  const res = await fetch(
    `${url}/rest/v1/monitoring_ohlc?${qs}&select=date,open,high,low,close`,
    { headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" } },
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return rows.map((r) => ({
    date: String(r.date).slice(0, 10),
    open: Number(r.open),
    high: Number(r.high),
    low: Number(r.low),
    close: Number(r.close),
  })).reverse();
}

// ── Main ─────────────────────────────────────────────────────────────────────
console.log("=== Monitoring Source Cross-Validation ===");
console.log(`Date: ${new Date().toISOString().slice(0, 10)}`);
if (WITH_SUPABASE) console.log("Mode: TVC cache + all_s + Supabase\n");
else console.log("Mode: TVC cache + all_s (add --with-supabase for DB comparison)\n");

for (const inst of INSTRUMENTS) {
  console.log(`\n── ${inst.name} ──`);
  const tvcBars = inst.tvcPath ? readBars(inst.tvcPath) : null;
  const allsBars = inst.allsPath ? readBars(inst.allsPath) : null;

  if (!tvcBars && !allsBars) {
    console.log("  ⚠️  No local source A or B available — Supabase only");
  }

  if (tvcBars) {
    checkPriceRange(`TVC(${inst.name})`, tvcBars, inst.priceFloor, inst.priceCeiling);
  } else {
    console.log("  ℹ️  No local TVC cache file");
  }

  if (allsBars) {
    checkPriceRange(`AllS(${inst.name})`, allsBars, inst.priceFloor, inst.priceCeiling);
  }

  // Cross-check TVC vs all_s where both exist
  if (tvcBars && allsBars) {
    compareTwo("TVC", tvcBars, "all_s", allsBars);
  }

  if (WITH_SUPABASE) {
    const dbBars = await fetchSupabaseBars(inst.supabaseAsset, inst.supabaseTf);
    if (dbBars?.length) {
      checkPriceRange(`Supabase(${inst.name})`, dbBars, inst.priceFloor, inst.priceCeiling);
      if (tvcBars) compareTwo("TVC", tvcBars, "Supabase", dbBars);
      if (allsBars) compareTwo("all_s", allsBars, "Supabase", dbBars);
    } else {
      console.log("  ⚠️  Supabase returned no data (check credentials or table)");
    }
  }
}

console.log("\n=== Done ===");
console.log("To include Supabase comparison: node tools/market-data/validate_anomaly_sources.mjs --with-supabase");
console.log("To refresh anomaly data from Yahoo Finance: python tools/market-data/seed_anomaly_daily.py");
console.log("To re-seed Supabase from TVC cache: node scripts/seed-monitoring-ohlc.mjs");
