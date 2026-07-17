/**
 * Convert capitalife_portfolio CSV strategy exports to Fund Manager events JSON.
 *
 * Source: Invoria Dashboard/capitalife_portfolio/*.csv
 * Output: Fund Manager public/generated/monitoring/strategies/*_events.json
 *
 * Security: Monitoring only. No execution. No order routing. No secrets.
 *
 * Usage: node tools/monitoring/convert-portfolio-csv-to-events.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FUND_MGR = path.resolve(__dirname, "../..");
const INVORIA = path.resolve(FUND_MGR, "../Invoria Dashboard");
const PORTFOLIO_DIR = path.join(INVORIA, "capitalife_portfolio");
const STRATEGIES_OUT = path.join(FUND_MGR, "public/generated/monitoring/strategies");
const CACHE_DIR = path.join(FUND_MGR, "public/generated/monitoring/tradingview_data_cache/D");

// Map CSV filename prefix → output config
const CSV_MAP = [
  {
    csvPrefix: "Macro_Valuation_Alpha_-_Capitalife_V1.1_VANTAGE_EURGBP",
    outFile: "VANTAGE_EURGBP_events.json",
    symbol: "EURGBP",
    tvSymbol: "VANTAGE:EURGBP",
    strategyName: "Macro Valuation Alpha V1.1 EURGBP",
    ohlcFile: "VANTAGE_EURGBP_D.json",
    sleeve: "Forex8",
  },
  {
    csvPrefix: "Macro_Valuation_Alpha_-_Capitalife_V1.1_VANTAGE_GBPJPY",
    outFile: "VANTAGE_GBPJPY_events.json",
    symbol: "GBPJPY",
    tvSymbol: "VANTAGE:GBPJPY",
    strategyName: "Macro Valuation Alpha V1.1 GBPJPY",
    ohlcFile: "VANTAGE_GBPJPY_D.json",
    sleeve: "Forex8",
  },
  {
    csvPrefix: "Macro_Valuation_Alpha_-_Capitalife_V1.1_FX_IDC_MXNUSD",
    outFile: "FX_IDC_MXNUSD_events.json",
    symbol: "MXNUSD",
    tvSymbol: "FX_IDC:MXNUSD",
    strategyName: "Macro Valuation Alpha V1.1 MXNUSD",
    ohlcFile: null, // no OHLC
    sleeve: "Forex8",
  },
  {
    csvPrefix: "Macro_Valuation_Alpha_-_Capitalife_V1.1_CME_NOK1!",
    outFile: "CME_NOK1_events.json",
    symbol: "NOKUSD",
    tvSymbol: "CME:NOK1!",
    strategyName: "Macro Valuation Alpha V1.1 NOK",
    ohlcFile: null,
    sleeve: "Forex8",
  },
  {
    csvPrefix: "Macro_Valuation_Alpha_-_Capitalife_V1.1_FX_IDC_CLPUSD",
    outFile: "FX_IDC_CLPUSD_events.json",
    symbol: "CLPUSD",
    tvSymbol: "FX_IDC:CLPUSD",
    strategyName: "Macro Valuation Alpha V1.1 CLPUSD",
    ohlcFile: null,
    sleeve: "Forex8",
  },
  {
    csvPrefix: "Macro_Valuation_Alpha_-_Capitalife_V1.1_FX_IDC_SEKUSD",
    outFile: "FX_IDC_SEKUSD_events.json",
    symbol: "SEKUSD",
    tvSymbol: "FX_IDC:SEKUSD",
    strategyName: "Macro Valuation Alpha V1.1 SEKUSD",
    ohlcFile: null,
    sleeve: "Forex8",
  },
  {
    csvPrefix: "Macro_Valuation_Alpha_-_Capitalife_V1.1_FX_IDC_BRLUSD",
    outFile: "FX_IDC_BRLUSD_events.json",
    symbol: "BRLUSD",
    tvSymbol: "FX_IDC:BRLUSD",
    strategyName: "Macro Valuation Alpha V1.1 BRLUSD",
    ohlcFile: null,
    sleeve: "Forex8",
  },
  {
    csvPrefix: "Macro_Valuation_Alpha_-_Capitalife_V1.1_FX_IDC_ZARUSD",
    outFile: "FX_IDC_ZARUSD_events.json",
    symbol: "ZARUSD",
    tvSymbol: "FX_IDC:ZARUSD",
    strategyName: "Macro Valuation Alpha V1.1 ZARUSD",
    ohlcFile: null,
    sleeve: "Forex8",
  },
  {
    csvPrefix: "Macro_Valuation_Alpha_-_Capitalife_V1.1_NYMEX_NG1!",
    outFile: "NYMEX_NG1_events.json",
    symbol: "NG1!",
    tvSymbol: "NYMEX:NG1!",
    strategyName: "Macro Valuation Alpha V1.1 NG1!",
    ohlcFile: "NYMEX_NG1_D.json",
    sleeve: "Energy Robust3",
  },
];

const SIGNAL_MAP = {
  "L":  "long_entry",
  "LX": "long_exit",
  "S":  "short_entry",
  "SX": "short_exit",
};

// Build date→barIndex lookup from OHLC cache if available
function buildDateIndex(ohlcFile) {
  if (!ohlcFile) return null;
  const p = path.join(CACHE_DIR, ohlcFile);
  if (!fs.existsSync(p)) return null;
  try {
    const json = JSON.parse(fs.readFileSync(p, "utf8"));
    const map = new Map();
    (json.bars || []).forEach((b, i) => {
      if (b.date) map.set(b.date, i);
    });
    return map;
  } catch { return null; }
}

function findCsv(prefix) {
  if (!fs.existsSync(PORTFOLIO_DIR)) return null;
  const files = fs.readdirSync(PORTFOLIO_DIR);
  const match = files.find(f => f.startsWith(prefix) && f.endsWith(".csv"));
  return match ? path.join(PORTFOLIO_DIR, match) : null;
}

function parseCsv(filepath) {
  const raw = fs.readFileSync(filepath, "utf8");
  const lines = raw.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  // Parse header — detect column positions
  const header = lines[0].split(",").map(h => h.trim().replace(/"/g, ""));
  const idxNr     = header.findIndex(h => h.includes("Trade-Nummer") || h === "Trade-Nummer");
  const idxTyp    = header.findIndex(h => h === "Typ");
  const idxDate   = header.findIndex(h => h.includes("Datum"));
  const idxSignal = header.findIndex(h => h === "Signal");
  // Price column: "Preis GBP" or "Preis USD" or similar
  const idxPrice  = header.findIndex(h => h.startsWith("Preis"));

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map(c => c.trim().replace(/"/g, ""));
    if (cols.length < 4) continue;
    const nr     = idxNr     >= 0 ? cols[idxNr]     : "";
    const typ    = idxTyp    >= 0 ? cols[idxTyp]    : "";
    const date   = idxDate   >= 0 ? cols[idxDate]   : "";
    const signal = idxSignal >= 0 ? cols[idxSignal] : "";
    const price  = idxPrice  >= 0 ? parseFloat(cols[idxPrice])  : NaN;

    if (!date || !signal) continue;
    // Only keep valid date format YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}/.test(date)) continue;

    rows.push({
      nr: parseInt(nr) || 0,
      typ,
      date: date.slice(0, 10),
      signal,
      price: isFinite(price) ? price : null,
    });
  }
  return rows;
}

const allResults = [];

for (const cfg of CSV_MAP) {
  const csvPath = findCsv(cfg.csvPrefix);
  if (!csvPath) {
    console.log(`[SKIP] ${cfg.symbol}: no CSV found with prefix "${cfg.csvPrefix}"`);
    allResults.push({ symbol: cfg.symbol, status: "csv_not_found", outFile: cfg.outFile });
    continue;
  }

  let rows;
  try {
    rows = parseCsv(csvPath);
  } catch (e) {
    console.log(`[ERROR] ${cfg.symbol}: CSV parse error: ${e.message}`);
    allResults.push({ symbol: cfg.symbol, status: "csv_parse_error", outFile: cfg.outFile, error: e.message });
    continue;
  }

  if (!rows.length) {
    console.log(`[WARN] ${cfg.symbol}: CSV parsed but 0 rows`);
    allResults.push({ symbol: cfg.symbol, status: "csv_empty", outFile: cfg.outFile });
    continue;
  }

  const dateIndex = buildDateIndex(cfg.ohlcFile);

  // Build events — one event per row
  const events = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const evType = SIGNAL_MAP[row.signal];
    if (!evType) continue;

    const barIndex = dateIndex?.get(row.date) ?? i;
    const isEntry = evType === "long_entry" || evType === "short_entry";

    const ev = {
      time: row.date,
      barIndex,
      type: evType,
      price: row.price,
      reason: isEntry ? "strategy_entry" : "strategy_exit",
    };
    if (isEntry) {
      ev.entry = row.price;
      ev.sl = null;
      ev.tp = null;
    }
    events.push(ev);
  }

  // Build trades (pair entries with exits by trade number)
  const tradeMap = new Map();
  for (const row of rows) {
    const n = row.nr;
    if (!tradeMap.has(n)) tradeMap.set(n, { entry: null, exit: null });
    const isEntry = row.signal === "L" || row.signal === "S";
    if (isEntry) tradeMap.get(n).entry = row;
    else tradeMap.get(n).exit = row;
  }

  const trades = [];
  for (const [n, pair] of tradeMap) {
    if (!pair.entry) continue;
    trades.push({
      id: n,
      direction: pair.entry.signal === "L" ? "long" : "short",
      entryTime: pair.entry.date,
      entryPrice: pair.entry.price,
      exitTime: pair.exit?.date || null,
      exitPrice: pair.exit?.price || null,
      exitReason: "strategy_exit",
    });
  }

  const lastEntry = rows.filter(r => r.signal === "L" || r.signal === "S").at(-1);
  const lastExit = rows.filter(r => r.signal === "LX" || r.signal === "SX").at(-1);
  const openTrade = lastEntry && (!lastExit || lastExit.date < lastEntry.date) ? trades.at(-1) : null;

  const firstDate = rows[0]?.date || null;
  const lastDate = rows.at(-1)?.date || null;

  const eventsJson = {
    symbol: cfg.symbol,
    tvSymbol: cfg.tvSymbol,
    sourceResolved: cfg.tvSymbol,
    strategyName: cfg.strategyName,
    sleeve: cfg.sleeve,
    hasStrategy: true,
    status: "generated",
    dataNote: `Events generated from capitalife_portfolio CSV export. Last CSV bar: ${lastDate}. CSV source: ${path.basename(csvPath)}. OHLC: ${cfg.ohlcFile ? `available (${cfg.ohlcFile})` : "NOT available — no TVC cache"}.`,
    warnings: cfg.ohlcFile ? [] : ["no_ohlc_cache_available — OHLC charts not renderable, but strategy events present"],
    securityLabel: "Monitoring only — Forward tracking / not live execution",
    firstDate,
    lastDate,
    eventCount: events.length,
    tradeCount: trades.length,
    events,
    trades,
    openTrade,
    openTradeRow: openTrade ? lastEntry : null,
    generatedAt: new Date().toISOString(),
  };

  const outPath = path.join(STRATEGIES_OUT, cfg.outFile);
  fs.writeFileSync(outPath, JSON.stringify(eventsJson, null, 2), "utf8");

  const result = {
    symbol: cfg.symbol,
    status: "ok",
    outFile: cfg.outFile,
    csvSource: path.basename(csvPath),
    eventCount: events.length,
    tradeCount: trades.length,
    firstDate,
    lastDate,
    hasOhlc: !!cfg.ohlcFile,
  };
  allResults.push(result);
  console.log(`[OK] ${cfg.symbol} → ${cfg.outFile} | ${events.length} events, ${trades.length} trades | ${firstDate} → ${lastDate}`);
}

console.log("\n=== Summary ===");
for (const r of allResults) {
  const ohlc = r.hasOhlc ? "OHLC+Events" : "Events only";
  console.log(`  ${r.symbol}: ${r.status} (${ohlc})`);
}

// Write manifest
const manifestPath = path.join(STRATEGIES_OUT, "_forex8_events_manifest.json");
fs.writeFileSync(manifestPath, JSON.stringify({
  generatedAt: new Date().toISOString(),
  securityLabel: "Monitoring only — Forward tracking / not live execution",
  results: allResults,
}, null, 2), "utf8");
console.log(`\nManifest: ${manifestPath}`);
