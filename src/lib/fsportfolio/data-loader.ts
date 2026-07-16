import "server-only";

import fs from "node:fs";
import path from "node:path";
import type { DataQualityStatus, OhlcBar } from "@/lib/fsportfolio/types";
import { getTradingViewBars, getTradingViewManifest } from "@/lib/market-data/tradingview-cache";

const DOWNLOADS_DIR = "C:/Users/joris/Downloads";
const INVORIA_DIR = "C:/Users/joris/Documents/Invoria Dashboard";
const LOCAL_FS_DIR = path.join(process.cwd(), "src", "data", "capitalife", "fsportfolio");
const LOCAL_CAPITALIFE_DIR = path.join(process.cwd(), "src", "data", "capitalife");

const OHLC_PATTERNS: Record<string, string[]> = {
  SPY: ["SPY.csv", "BATS_SPY", "AMEX_SPY"],
  SPMO: ["SPMO.csv", "BATS_SPMO"],
  QQQ: ["QQQ.csv", "BATS_QQQ"],
  GLD: ["GLD.csv", "BATS_GLD", "AMEX_GLD"],
  DBC: ["DBC.csv", "BATS_DBC", "AMEX_DBC"],
  NAS100USD: ["NAS100USD.csv", "OANDA_NAS100USD", "NAS100USD"],
};

export type LoadedOhlcSeries = {
  symbol: string;
  bars: OhlcBar[];
  quality: DataQualityStatus;
};

export type LoadedOhlcBundle = {
  series: Record<string, OhlcBar[]>;
  quality: DataQualityStatus[];
};

function normalizeColumn(name: string) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function exists(filePath: string) {
  try {
    fs.accessSync(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function listFiles(dirPath: string): fs.Dirent[] {
  try {
    return fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }
}

function readCsvBars(filePath: string) {
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return { bars: [] as OhlcBar[], warnings: ["csv_too_short"] };

  const headers = lines[0]!.split(",").map((item) => item.trim());
  const headerMap = new Map(headers.map((header, index) => [normalizeColumn(header), index]));
  const dateIndex =
    headerMap.get("date") ??
    headerMap.get("time") ??
    headerMap.get("datetime");
  const openIndex = headerMap.get("open");
  const highIndex = headerMap.get("high");
  const lowIndex = headerMap.get("low");
  const closeIndex = headerMap.get("close");
  const volumeIndex = headerMap.get("volume");

  if (
    dateIndex === undefined ||
    openIndex === undefined ||
    highIndex === undefined ||
    lowIndex === undefined ||
    closeIndex === undefined
  ) {
    return { bars: [] as OhlcBar[], warnings: ["missing_required_columns"] };
  }

  const deduped = new Map<string, OhlcBar>();
  for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
    const cells = lines[lineIndex]!.split(",").map((item) => item.trim());
    const dateRaw = cells[dateIndex];
    const date = dateRaw?.slice(0, 10) ?? "";
    const open = Number(cells[openIndex]);
    const high = Number(cells[highIndex]);
    const low = Number(cells[lowIndex]);
    const close = Number(cells[closeIndex]);
    const volume =
      volumeIndex === undefined ? null : Number(cells[volumeIndex] ?? "");

    if (!date || !Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) {
      continue;
    }

    deduped.set(date, {
      date,
      open,
      high,
      low,
      close,
      volume: Number.isFinite(volume) ? volume : null,
    });
  }

  return {
    bars: [...deduped.values()].sort((left, right) => left.date.localeCompare(right.date)),
    warnings: [] as string[],
  };
}

function readInvoriaJsonBars(filePath: string) {
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as {
    bars?: Array<{ date?: string; open?: number; high?: number; low?: number; close?: number; volume?: number }>;
  };
  const deduped = new Map<string, OhlcBar>();

  for (const row of parsed.bars ?? []) {
    if (
      !row.date ||
      !Number.isFinite(row.open) ||
      !Number.isFinite(row.high) ||
      !Number.isFinite(row.low) ||
      !Number.isFinite(row.close)
    ) {
      continue;
    }
    deduped.set(row.date, {
      date: row.date,
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      volume: Number.isFinite(row.volume) ? Number(row.volume) : null,
    });
  }

  return {
    bars: [...deduped.values()].sort((left, right) => left.date.localeCompare(right.date)),
    warnings: [] as string[],
  };
}

function readTradingViewCacheBars(symbol: string) {
  const bars = getTradingViewBars(symbol, "1D")
    .map((row) => ({
      date: row.date,
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      volume: row.volume ?? null,
    }))
    .filter((row) => row.date && [row.open, row.high, row.low, row.close].every((value) => Number.isFinite(value)));
  const manifest = getTradingViewManifest();
  const status = manifest.symbols[symbol]?.intervals?.["1D"];
  return {
    bars,
    sourcePath: status?.path ?? null,
    warnings: bars.length ? [] : ["tradingview_cache_missing"],
  };
}

function buildQuality(
  symbol: string,
  sourcePath: string | null,
  format: DataQualityStatus["format"],
  bars: OhlcBar[],
  warnings: string[],
): DataQualityStatus {
  return {
    symbol,
    found: Boolean(sourcePath && bars.length),
    sourcePath,
    format,
    rowCount: bars.length,
    startDate: bars[0]?.date ?? null,
    endDate: bars.at(-1)?.date ?? null,
    warnings,
  };
}

function scanDirectoryForSymbol(dirPath: string, symbol: string): string | null {
  const patterns = OHLC_PATTERNS[symbol] ?? [symbol];
  const entries = listFiles(dirPath);
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      const nested = scanDirectoryForSymbol(fullPath, symbol);
      if (nested) return nested;
      continue;
    }
    const lower = entry.name.toLowerCase();
    if (!patterns.some((pattern) => lower.includes(pattern.toLowerCase()))) continue;
    if (lower.endsWith(".csv")) return fullPath;
    if (symbol === "NAS100USD" && lower.endsWith(".json")) return fullPath;
    if (lower.endsWith(".xlsx")) return fullPath;
  }
  return null;
}

export function loadOhlcSeries(symbol: string): LoadedOhlcSeries {
  const localFile =
    scanDirectoryForSymbol(path.join(LOCAL_FS_DIR, "ohlc"), symbol) ??
    scanDirectoryForSymbol(LOCAL_FS_DIR, symbol) ??
    scanDirectoryForSymbol(LOCAL_CAPITALIFE_DIR, symbol) ??
    scanDirectoryForSymbol(DOWNLOADS_DIR, symbol) ??
    (symbol === "NAS100USD"
      ? scanDirectoryForSymbol(
          path.join(INVORIA_DIR, "frontend", "public", "generated", "monitoring", "tradingview_data_cache"),
          symbol,
        )
      : null);

  if (!localFile || !exists(localFile)) {
    const tradingViewCached = readTradingViewCacheBars(symbol);
    if (tradingViewCached.bars.length) {
      return {
        symbol,
        bars: tradingViewCached.bars,
        quality: buildQuality(symbol, tradingViewCached.sourcePath, "json", tradingViewCached.bars, tradingViewCached.warnings),
      };
    }
    return {
      symbol,
      bars: [],
      quality: buildQuality(symbol, null, "unknown", [], ["missing_file"]),
    };
  }

  if (localFile.toLowerCase().endsWith(".xlsx")) {
    return {
      symbol,
      bars: [],
      quality: buildQuality(symbol, localFile, "xlsx", [], ["xlsx_found_but_not_parsed_yet"]),
    };
  }

  const parsed =
    localFile.toLowerCase().endsWith(".json")
      ? readInvoriaJsonBars(localFile)
      : readCsvBars(localFile);
  const format = localFile.toLowerCase().endsWith(".json") ? "json" : "csv";

  return {
    symbol,
    bars: parsed.bars,
    quality: buildQuality(symbol, localFile, format, parsed.bars, parsed.warnings),
  };
}

export function loadRequiredOhlcSeries(symbols: string[]): LoadedOhlcBundle {
  const loaded = symbols.map((symbol) => loadOhlcSeries(symbol));
  return {
    series: Object.fromEntries(loaded.map((item) => [item.symbol, item.bars])),
    quality: loaded.map((item) => item.quality),
  };
}
