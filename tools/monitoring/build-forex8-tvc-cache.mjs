/**
 * Build Forex8 TVC Cache from Invoria Dukascopy hourly data.
 *
 * Source: Invoria Dashboard data/market/cross_*.dukascopy.1d.json (actually hourly despite "1D" label)
 * Output: Fund Manager public/generated/monitoring/tradingview_data_cache/D/*.json
 *
 * Security: Monitoring only. No execution. No order routing. No secrets.
 *
 * Usage: node tools/monitoring/build-forex8-tvc-cache.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FUND_MGR = path.resolve(__dirname, "../..");
const INVORIA = path.resolve(FUND_MGR, "../Invoria Dashboard");
const INVORIA_MARKET = path.join(INVORIA, "data/market");
const CACHE_OUT = path.join(FUND_MGR, "public/generated/monitoring/tradingview_data_cache/D");

const FOREX8_MAP = [
  { symbol: "EURGBP", invoriaCross: "cross_eurgbp", cacheFile: "VANTAGE_EURGBP_D.json", tvSource: "VANTAGE:EURGBP" },
  { symbol: "GBPJPY", invoriaCross: "cross_gbpjpy", cacheFile: "VANTAGE_GBPJPY_D.json", tvSource: "VANTAGE:GBPJPY" },
  // These 6 have NO Dukascopy hourly data in Invoria — documented below
  { symbol: "MXNUSD",  invoriaCross: null, cacheFile: "FX_IDC_MXNUSD_D.json",  tvSource: "FX_IDC:MXNUSD"  },
  { symbol: "NOKUSD",  invoriaCross: null, cacheFile: "CME_NOK1_D.json",         tvSource: "CME:NOK1!"      },
  { symbol: "CLPUSD",  invoriaCross: null, cacheFile: "FX_IDC_CLPUSD_D.json",   tvSource: "FX_IDC:CLPUSD"  },
  { symbol: "SEKUSD",  invoriaCross: null, cacheFile: "FX_IDC_SEKUSD_D.json",   tvSource: "FX_IDC:SEKUSD"  },
  { symbol: "BRLUSD",  invoriaCross: null, cacheFile: "FX_IDC_BRLUSD_D.json",   tvSource: "FX_IDC:BRLUSD"  },
  { symbol: "ZARUSD",  invoriaCross: null, cacheFile: "FX_IDC_ZARUSD_D.json",   tvSource: "FX_IDC:ZARUSD"  },
];

const results = [];

function msToDateStr(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

function aggregateHourlyToDaily(candles) {
  // Group hourly candles by UTC date, then pick open/high/low/close
  const byDate = new Map();
  for (const c of candles) {
    const date = msToDateStr(c.time);
    if (!byDate.has(date)) {
      byDate.set(date, { open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume || 0, count: 1 });
    } else {
      const d = byDate.get(date);
      d.high = Math.max(d.high, c.high);
      d.low = Math.min(d.low, c.low);
      d.close = c.close; // last candle of day = close
      d.volume = (d.volume || 0) + (c.volume || 0);
      d.count++;
    }
  }
  // Sort by date
  const sorted = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, d]) => ({
      time: null,
      date,
      open: Math.round(d.open * 100000) / 100000,
      high: Math.round(d.high * 100000) / 100000,
      low:  Math.round(d.low  * 100000) / 100000,
      close: Math.round(d.close * 100000) / 100000,
      volume: Math.round(d.volume * 100) / 100,
    }));
  return sorted;
}

for (const cfg of FOREX8_MAP) {
  if (!cfg.invoriaCross) {
    // No OHLC source — document as missing
    const stub = {
      schema: "tvc-cache-v1",
      source: cfg.tvSource,
      symbol: cfg.symbol,
      timeframe: "D",
      provider: "none",
      variant: "missing",
      barCount: 0,
      firstDate: null,
      lastDate: null,
      firstCandleTimestamp: null,
      lastCandleTimestamp: null,
      dataStatus: "missing_no_local_source",
      dataNote: `No OHLC data available for ${cfg.symbol}. Searched: Invoria Dukascopy (data/market/), Invoria workspace, Fund Manager cache, capitalife-cache. Strategy events may still be available via strategy CSV. To add OHLC: place a daily OHLC JSON in this file with 'bars' array format matching other D/*.json files.`,
      bars: [],
      generatedAt: new Date().toISOString(),
    };
    const outPath = path.join(CACHE_OUT, cfg.cacheFile);
    if (!fs.existsSync(outPath)) {
      fs.writeFileSync(outPath, JSON.stringify(stub, null, 2), "utf8");
      results.push({ symbol: cfg.symbol, status: "stub_missing_ohlc", file: cfg.cacheFile });
      console.log(`[STUB] ${cfg.symbol} → ${cfg.cacheFile} (no OHLC source)`);
    } else {
      results.push({ symbol: cfg.symbol, status: "skipped_already_exists", file: cfg.cacheFile });
      console.log(`[SKIP] ${cfg.symbol} → ${cfg.cacheFile} (file already exists)`);
    }
    continue;
  }

  const dukascopyPath = path.join(INVORIA_MARKET, `${cfg.invoriaCross}.dukascopy.1d.json`);
  if (!fs.existsSync(dukascopyPath)) {
    results.push({ symbol: cfg.symbol, status: "error_source_missing", file: cfg.cacheFile, error: "Dukascopy file not found" });
    console.log(`[ERROR] ${cfg.symbol}: source file not found: ${dukascopyPath}`);
    continue;
  }

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(dukascopyPath, "utf8"));
  } catch (e) {
    results.push({ symbol: cfg.symbol, status: "error_parse", file: cfg.cacheFile, error: e.message });
    console.log(`[ERROR] ${cfg.symbol}: parse error: ${e.message}`);
    continue;
  }

  const candles = raw.candles || [];
  if (!candles.length) {
    results.push({ symbol: cfg.symbol, status: "error_empty", file: cfg.cacheFile });
    continue;
  }

  const dailyBars = aggregateHourlyToDaily(candles);
  const firstDate = dailyBars[0]?.date || null;
  const lastDate = dailyBars[dailyBars.length - 1]?.date || null;

  const cache = {
    schema: "tvc-cache-v1",
    source: cfg.tvSource,
    symbol: cfg.symbol,
    timeframe: "D",
    provider: "dukascopy",
    variant: "daily-aggregated-from-hourly",
    barCount: dailyBars.length,
    firstDate,
    lastDate,
    firstCandleTimestamp: null,
    lastCandleTimestamp: null,
    dataStatus: "stale",
    dataNote: `OHLC daily bars aggregated from Dukascopy hourly data (Invoria data/market/${cfg.invoriaCross}.dukascopy.1d.json). Last available: ${lastDate}. NOT live — stale since ${lastDate}. To update: refresh Dukascopy data in Invoria and re-run this script.`,
    bars: dailyBars,
    generatedAt: new Date().toISOString(),
  };

  const outPath = path.join(CACHE_OUT, cfg.cacheFile);
  fs.writeFileSync(outPath, JSON.stringify(cache, null, 2), "utf8");
  results.push({ symbol: cfg.symbol, status: "ok_stale", file: cfg.cacheFile, firstDate, lastDate, barCount: dailyBars.length });
  console.log(`[OK-STALE] ${cfg.symbol} → ${cfg.cacheFile} | ${dailyBars.length} bars | ${firstDate} → ${lastDate}`);
}

console.log("\n=== Summary ===");
for (const r of results) {
  console.log(`  ${r.symbol}: ${r.status}${r.lastDate ? ` (last: ${r.lastDate})` : ""}`);
}

// Write manifest
const manifestPath = path.join(CACHE_OUT, "_forex8_build_manifest.json");
fs.writeFileSync(manifestPath, JSON.stringify({
  generatedAt: new Date().toISOString(),
  securityLabel: "Monitoring only — Forward tracking / not live execution",
  results,
}, null, 2), "utf8");
console.log(`\nManifest: ${manifestPath}`);
