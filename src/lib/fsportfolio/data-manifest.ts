import "server-only";

import fs from "node:fs";
import path from "node:path";
import type { FSPortfolioDataManifest, ManifestFileEntry } from "@/lib/fsportfolio/types";
import { getTradingViewBars, getTradingViewManifest } from "@/lib/market-data/tradingview-cache";

const BASE_DIR = path.join(process.cwd(), "src", "data", "capitalife", "fsportfolio");
const OHLC_DIR = path.join(BASE_DIR, "ohlc");
const WHITE_SWAN_DIR = path.join(BASE_DIR, "white-swan");
const RESEARCH_DIR = path.join(BASE_DIR, "research");

function safeStat(filePath: string) {
  try {
    return fs.statSync(filePath);
  } catch {
    return null;
  }
}

function normalizeHeaderName(value: string) {
  return value.trim().toLowerCase();
}

function detectFrequency(dates: string[]) {
  if (dates.length < 2) return "unknown" as const;
  try {
    const left = new Date(`${dates[0]!.slice(0, 10)}T00:00:00Z`);
    const right = new Date(`${dates[1]!.slice(0, 10)}T00:00:00Z`);
    const delta = (right.getTime() - left.getTime()) / 86_400_000;
    if (delta >= 1 && delta <= 5) return "daily" as const;
    if (delta >= 6 && delta <= 9) return "weekly" as const;
    if (delta >= 25 && delta <= 35) return "monthly" as const;
  } catch {}
  return "unknown" as const;
}

function inspectOhlcCsv(filePath: string, required: boolean, core: boolean): ManifestFileEntry {
  const stat = safeStat(filePath);
  if (!stat || stat.size <= 0) {
    return { path: null, status: "missing", required, core };
  }

  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const header = lines[0] ?? "";
  const headers = header.split(",").map((item) => item.trim());
  const normalized = headers.map(normalizeHeaderName);
  const dateColumn =
    headers[normalized.indexOf("time")] ??
    headers[normalized.indexOf("date")] ??
    headers[normalized.indexOf("datetime")] ??
    null;
  const openIndex = normalized.indexOf("open");
  const highIndex = normalized.indexOf("high");
  const lowIndex = normalized.indexOf("low");
  const closeIndex = normalized.indexOf("close");
  const dateIndex =
    normalized.indexOf("time") >= 0
      ? normalized.indexOf("time")
      : normalized.indexOf("date") >= 0
        ? normalized.indexOf("date")
        : normalized.indexOf("datetime");

  const dates: string[] = [];
  let parseableDates = 0;
  let missingCloseValues = 0;
  for (const line of lines.slice(1)) {
    const cells = line.split(",").map((item) => item.trim());
    const date = dateIndex >= 0 ? (cells[dateIndex] ?? "").slice(0, 10) : "";
    if (date) {
      dates.push(date);
      if (!Number.isNaN(Date.parse(date))) parseableDates += 1;
    }
    if (closeIndex >= 0 && !(cells[closeIndex] ?? "").length) missingCloseValues += 1;
  }

  let sorted = true;
  for (let index = 1; index < dates.length; index += 1) {
    if (dates[index - 1]! > dates[index]!) {
      sorted = false;
      break;
    }
  }

  const duplicates = new Set<string>();
  const seen = new Set<string>();
  for (const date of dates) {
    if (seen.has(date)) duplicates.add(date);
    seen.add(date);
  }

  return {
    path: filePath,
    status: "present",
    required,
    core,
    size_bytes: stat.size,
    header,
    rows: Math.max(lines.length - 1, 0),
    first_date: dates[0] ?? null,
    last_date: dates.at(-1) ?? null,
    date_column: dateColumn,
    ohlc_columns_recognized: openIndex >= 0 && highIndex >= 0 && lowIndex >= 0 && closeIndex >= 0,
    parseable_dates: parseableDates,
    sorted,
    duplicate_dates: duplicates.size,
    frequency: detectFrequency(dates),
    missing_close_values: missingCloseValues,
  };
}

function inspectTradingViewHistory(symbol: string, required: boolean, core: boolean): ManifestFileEntry | null {
  const bars = getTradingViewBars(symbol, "1D");
  if (!bars.length) return null;
  const manifest = getTradingViewManifest();
  const status = manifest.symbols[symbol]?.intervals?.["1D"];
  return {
    path: status?.path ?? null,
    status: "present",
    required,
    core,
    rows: bars.length,
    first_date: bars[0]?.date ?? null,
    last_date: bars.at(-1)?.date ?? null,
    date_column: "date",
    ohlc_columns_recognized: true,
    parseable_dates: bars.length,
    sorted: true,
    duplicate_dates: 0,
    frequency: "daily",
    missing_close_values: 0,
    notes: ["Loaded from TradingView Datafeed cache."],
  };
}

function inspectTradeExport(filePath: string): ManifestFileEntry {
  const stat = safeStat(filePath);
  if (!stat || stat.size <= 0) {
    return { path: null, status: "missing", notes: ["Trade export file not found."] };
  }

  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const header = lines[0] ?? "";
  const headers = header.split(",").map((item) => item.trim());
  const dateIndex = headers.indexOf("Datum und Uhrzeit");
  const typeIndex = headers.indexOf("Typ");
  const rows = lines.slice(1).map((line) => line.split(",").map((item) => item.trim()));
  const dates = rows.map((cells) => (dateIndex >= 0 ? (cells[dateIndex] ?? "").slice(0, 10) : "")).filter(Boolean);
  const hasOnlyLongCash = rows.every((cells) => {
    const value = typeIndex >= 0 ? (cells[typeIndex] ?? "") : "";
    return value.startsWith("Long-") || value === "";
  });

  return {
    path: filePath,
    status: "present",
    size_bytes: stat.size,
    header,
    rows: rows.length,
    first_date: dates[0] ?? null,
    last_date: dates.at(-1) ?? null,
    date_column: dateIndex >= 0 ? headers[dateIndex]! : null,
    ohlc_columns_recognized: false,
    parseable_dates: dates.filter((date) => !Number.isNaN(Date.parse(date))).length,
    sorted: false,
    duplicate_dates: 0,
    frequency: "unknown",
    missing_close_values: 0,
    notes: [
      "TradingView strategy export detected.",
      hasOnlyLongCash ? "Only long entry/exit rows detected." : "Non-long rows detected; manual review required.",
    ],
  };
}

function inspectTextReference(filePath: string): ManifestFileEntry {
  const stat = safeStat(filePath);
  if (!stat || stat.size <= 0) {
    return { path: null, status: "missing", notes: ["Reference file not found."] };
  }
  const raw = fs.readFileSync(filePath, "utf8");
  return {
    path: filePath,
    status: "present",
    size_bytes: stat.size,
    rows: raw.split(/\r?\n/).length,
    notes: [
      /\/\/@version|strategy\(|indicator\(/.test(raw) ? "Pine script markers detected." : "No explicit Pine header detected.",
      /long/i.test(raw) ? "Contains long logic references." : "No clear long logic marker detected.",
    ],
  };
}

export function loadFSPortfolioDataManifest(): FSPortfolioDataManifest {
  const spmoLocal = inspectOhlcCsv(path.join(OHLC_DIR, "SPMO.csv"), true, true);
  const spmoCache = spmoLocal.status === "present" ? null : inspectTradingViewHistory("SPMO", true, true);
  const coreRequired = {
    SPY: inspectOhlcCsv(path.join(OHLC_DIR, "SPY.csv"), true, true),
    SPMO: spmoCache ?? spmoLocal,
    QQQ: inspectOhlcCsv(path.join(OHLC_DIR, "QQQ.csv"), true, true),
    GLD: inspectOhlcCsv(path.join(OHLC_DIR, "GLD.csv"), true, true),
  };
  const tradeExport = inspectTradeExport(path.join(WHITE_SWAN_DIR, "Invest_NAS_EMA_TRADES.csv"));
  const pineReference = inspectTextReference(path.join(WHITE_SWAN_DIR, "QQQ_pine.txt"));
  const researchOptional = {
    DBC: inspectOhlcCsv(path.join(RESEARCH_DIR, "DBC.csv"), false, false),
  };
  const missing = Object.entries(coreRequired)
    .filter(([, entry]) => entry.status !== "present")
    .map(([symbol]) => symbol);

  return {
    portfolio: "FSPortfolio Live Core v2",
    updated_at: new Date().toISOString(),
    core_required: coreRequired,
    white_swan: {
      implementation_instrument: "QQQ",
      trade_export: tradeExport,
      pine_reference: pineReference,
    },
    research_optional: researchOptional,
    missing,
    can_run_final_core_backtest: missing.length === 0,
    reason: missing.length ? `${missing.join(", ")}.csv missing` : null,
  };
}
