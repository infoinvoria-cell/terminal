import fs from "node:fs";
import path from "node:path";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { buildTerminalUniverse } from "@/lib/market-data/terminal-universe";
import { buildTerminalUniverseContract, type TerminalUniverseContract } from "@/lib/market-data/terminal-universe-contract";

type RuntimeStatus =
  | "READY"
  | "MISSING_HISTORY"
  | "HISTORY_STALE"
  | "LIVE_UNAVAILABLE"
  | "LIVE_STALE"
  | "PROVIDER_UNAVAILABLE"
  | "MARKET_CLOSED"
  | "CONFIG_ERROR";

type CoverageStatus = "FULL" | "PARTIAL" | "STALE" | "MISSING" | "INVALID";
type DatasetStatus = "COMPLETE" | "PARTIAL" | "STALE" | "MISSING" | "INVALID";
type SourceRole = "AUTHORITATIVE" | "LEGACY" | "RESEARCH_ONLY" | "PROXY" | "UNUSED";
type LiveSourceQuality = "realtime" | "delayed" | "stale" | "historical_only" | "unavailable";

type HistoricalStoreInventory = {
  instrumentId: string;
  ticker: string;
  timeframe: string;
  pathOrSource: string;
  format: "csv" | "json" | "supabase";
  sourceRole: SourceRole;
  firstTimestampUtc: string | null;
  lastTimestampUtc: string | null;
  rowCount: number;
  timezone: string | null;
  schema: string[];
  duplicates: number;
  outOfOrderRows: number;
  invalidOHLCCount: number;
  realGapCount: number;
  expectedClosedCount: number;
  status: DatasetStatus;
};

export type AllAssetAuditRow = {
  instrumentId: string;
  ticker: string;
  usedBy: string[];
  timeframe: string;
  historicalConfigured: boolean;
  historicalVerified: boolean;
  historySource: string | null;
  historyPath: string | null;
  historyStart: string | null;
  historyEnd: string | null;
  rowCount: number;
  coverageStatus: CoverageStatus;
  realGapCount: number;
  liveConfigured: boolean;
  liveVerified: boolean;
  liveProvider: string | null;
  providerSymbol: string | null;
  latestPrice: number | null;
  providerTimestampUtc: string | null;
  freshnessSeconds: number | null;
  effectiveDelaySeconds: number | null;
  sourceQuality: LiveSourceQuality;
  openBarPresent: boolean;
  openBarBucket: string | null;
  openBarLastUpdateUtc: string | null;
  runtimeStatus: RuntimeStatus;
};

export type WriterAuditEntry = {
  file: string;
  kind: "historical_write" | "live_quote_write" | "open_bar_write";
  target: string;
  language: "python" | "node" | "typescript" | "unknown";
  classification: "PRODUCTION_WRITER" | "MAINTENANCE_WRITER" | "TEST_ONLY" | "READ_ONLY";
};

export type AllAssetAuditReport = {
  generatedAtUtc: string;
  universeCounts: ReturnType<typeof buildTerminalUniverse>["counts"];
  universeList: Array<{ instrumentId: string; ticker: string; sources: string[] }>;
  terminalUniverseContract: TerminalUniverseContract;
  runtimeSnapshotAtUtc: string;
  historicalStores: HistoricalStoreInventory[];
  writerAudit: WriterAuditEntry[];
  rows: AllAssetAuditRow[];
  summary: {
    totalPairs: number;
    historyFull: number;
    historyPartial: number;
    historyStale: number;
    historyMissing: number;
    historyInvalid: number;
    liveReady: number;
    liveDelayed: number;
    liveStale: number;
    liveUnavailable: number;
    marketClosed: number;
    openBarsActive: number;
    openBarsMissingWhileMarketOpen: number;
    realGaps: number;
    duplicates: number;
    invalidOHLC: number;
  };
};

type ParsedBar = {
  timestampUtc: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
};

type OpenBarRuntime = {
  req_sym?: string;
  tf?: string;
  ts_epoch?: number;
  firstReceivedUtc?: string;
  lastReceivedUtc?: string;
};

const REPO_ROOT = process.cwd();
const RUNTIME_DIR = path.join(REPO_ROOT, ".runtime", "market-data");
const MONITORING_CACHE_DIR = path.join(REPO_ROOT, "public", "generated", "monitoring", "tradingview_data_cache");
const CORE_INVEST_CANONICAL_DIR = path.join(REPO_ROOT, "data", "core-invest", "canonical");
const LEGACY_HISTORICAL_DIR = path.join(REPO_ROOT, "data", "historical");
const OPEN_BARS_PATH = path.resolve(REPO_ROOT, "..", "Capitalife Engine", ".runtime", "engine", "open_bars.json");
const WRITER_SCAN_TARGETS = [
  path.join(REPO_ROOT, "tools"),
  path.join(REPO_ROOT, "engine"),
  path.join(REPO_ROOT, "src"),
];

function ensureRuntimeDir() {
  fs.mkdirSync(RUNTIME_DIR, { recursive: true });
}

function safeReadJson<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function parseNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeTimeframe(value: string): string {
  const raw = String(value || "").trim().toUpperCase();
  if (raw === "1D") return "D";
  return raw;
}

function timeframeToSeconds(timeframe: string): number {
  const tf = normalizeTimeframe(timeframe);
  if (tf === "D") return 86400;
  const match = /^(\d+)([MH])$/.exec(tf);
  if (!match) return 86400;
  const size = Number(match[1]);
  return match[2] === "H" ? size * 3600 : size * 60;
}

function inferCsvPathForTicker(ticker: string): string | null {
  const base = ticker.replace(/1!$/i, "").replace(/[^A-Z0-9]/gi, "");
  if (!base) return null;
  const exact = path.join(CORE_INVEST_CANONICAL_DIR, `${base}.csv`);
  return fs.existsSync(exact) ? exact : null;
}

function getMonitoringProxyPath(ticker: string): string | null {
  const fileName = ticker.replace(/!/g, "").replace(/[^A-Z0-9_]/gi, "");
  const candidates = walkFiles(MONITORING_CACHE_DIR, [".json"]).filter((file) => file.toUpperCase().includes(fileName.toUpperCase()));
  return candidates[0] ?? null;
}

function walkFiles(dirPath: string, extensions: string[]): string[] {
  if (!fs.existsSync(dirPath)) return [];
  const result: string[] = [];
  const stack = [dirPath];
  while (stack.length) {
    const current = stack.pop() as string;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (extensions.includes(path.extname(entry.name).toLowerCase())) {
        result.push(full);
      }
    }
  }
  return result;
}

function parseCsvDataset(filePath: string): ParsedBar[] {
  const raw = fs.readFileSync(filePath, "utf8").trim();
  if (!raw) return [];
  const [headerLine, ...lines] = raw.split(/\r?\n/);
  const headers = headerLine.split(",").map((part) => part.trim().toLowerCase());
  const timeIdx = headers.findIndex((h) => ["time", "date", "timestamp"].includes(h));
  const openIdx = headers.indexOf("open");
  const highIdx = headers.indexOf("high");
  const lowIdx = headers.indexOf("low");
  const closeIdx = headers.indexOf("close");
  const volumeIdx = headers.indexOf("volume");
  return lines
    .map((line) => line.split(","))
    .map((cols) => {
      const rawTime = String(cols[timeIdx] ?? "").trim();
      const timestampUtc = normalizeTimestamp(rawTime);
      return {
        timestampUtc,
        open: parseNumber(cols[openIdx]),
        high: parseNumber(cols[highIdx]),
        low: parseNumber(cols[lowIdx]),
        close: parseNumber(cols[closeIdx]),
        volume: volumeIdx >= 0 ? parseNumber(cols[volumeIdx]) : null,
      };
    })
    .filter((row) => row.timestampUtc);
}

function parseJsonBarsDataset(filePath: string): ParsedBar[] {
  const json = safeReadJson<unknown>(filePath, {});
  const bars =
    Array.isArray(json)
      ? json
      : typeof json === "object" && json !== null && Array.isArray((json as { bars?: unknown[] }).bars)
        ? (json as { bars: unknown[] }).bars
        : [];
  return bars
    .map((row) => {
      const value = typeof row === "object" && row !== null ? (row as Record<string, unknown>) : {};
      return {
        timestampUtc: normalizeTimestamp(value.time ?? value.date ?? value.timestamp),
        open: parseNumber(value.open),
        high: parseNumber(value.high),
        low: parseNumber(value.low),
        close: parseNumber(value.close),
        volume: parseNumber(value.volume),
      };
    })
    .filter((row: ParsedBar) => row.timestampUtc);
}

function normalizeTimestamp(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `${raw}T00:00:00.000Z`;
  const date = new Date(raw.endsWith("Z") ? raw : raw.includes("T") ? `${raw}Z` : raw);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function analyzeBars(
  bars: ParsedBar[],
  timeframe: string,
  timezone: string | null,
): Omit<HistoricalStoreInventory, "instrumentId" | "ticker" | "timeframe" | "pathOrSource" | "format" | "sourceRole" | "status"> & { status: DatasetStatus } {
  if (bars.length === 0) {
    return {
      firstTimestampUtc: null,
      lastTimestampUtc: null,
      rowCount: 0,
      timezone,
      schema: ["time", "open", "high", "low", "close", "volume"],
      duplicates: 0,
      outOfOrderRows: 0,
      invalidOHLCCount: 0,
      realGapCount: 0,
      expectedClosedCount: 0,
      status: "MISSING",
    };
  }

  const timestamps = bars.map((bar) => bar.timestampUtc);
  const seen = new Set<string>();
  let duplicates = 0;
  let outOfOrderRows = 0;
  let invalidOHLCCount = 0;
  let previousMs = 0;
  for (const bar of bars) {
    const tsMs = new Date(bar.timestampUtc).getTime();
    if (seen.has(bar.timestampUtc)) duplicates += 1;
    seen.add(bar.timestampUtc);
    if (previousMs && tsMs < previousMs) outOfOrderRows += 1;
    previousMs = tsMs;
    const open = bar.open;
    const high = bar.high;
    const low = bar.low;
    const close = bar.close;
    // CME daily futures settlement: close (official settlement price) may lie slightly
    // outside the intraday traded H/L range. Open is always within the traded range.
    // This is standard futures semantics — not an invalid bar. Deviation is typically < 1%.
    const isSettlementOutsideTradeRange =
      open != null && high != null && low != null && close != null &&
      high >= low &&
      open >= low && open <= high &&
      (close < low || close > high) &&
      Math.abs(close - (close < low ? low : high)) / Math.abs(close < low ? low : high) < 0.01;
    const invalid =
      open == null ||
      high == null ||
      low == null ||
      close == null ||
      Number.isNaN(open) ||
      Number.isNaN(high) ||
      Number.isNaN(low) ||
      Number.isNaN(close) ||
      high < low ||
      (!isSettlementOutsideTradeRange && (high < Math.max(open, close) || low > Math.min(open, close)));
    if (invalid) invalidOHLCCount += 1;
  }

  const sortedMs = timestamps
    .map((value) => new Date(value).getTime())
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  const stepMs = timeframeToSeconds(timeframe) * 1000;
  let realGapCount = 0;
  let expectedClosedCount = 0;
  for (let index = 1; index < sortedMs.length; index += 1) {
    const delta = sortedMs[index] - sortedMs[index - 1];
    if (delta <= stepMs) continue;
    const missingBuckets = Math.max(0, Math.round(delta / stepMs) - 1);
    const from = new Date(sortedMs[index - 1] + stepMs);
    const to = new Date(sortedMs[index]);
    const classified = classifyMissingBuckets(from, to, timeframe, timezone);
    expectedClosedCount += classified.expectedClosedCount;
    realGapCount += Math.max(0, missingBuckets - classified.expectedClosedCount);
  }

  const firstTimestampUtc = bars[0]?.timestampUtc ?? null;
  const lastTimestampUtc = bars[bars.length - 1]?.timestampUtc ?? null;
  const ageDays = lastTimestampUtc ? (Date.now() - new Date(lastTimestampUtc).getTime()) / 86400000 : Number.POSITIVE_INFINITY;
  const status: DatasetStatus =
    invalidOHLCCount > 0 || outOfOrderRows > 0
      ? "INVALID"
      : bars.length === 0
        ? "MISSING"
        : realGapCount > 0
          ? "PARTIAL"
          : ageDays > 14
            ? "STALE"
            : "COMPLETE";

  return {
    firstTimestampUtc,
    lastTimestampUtc,
    rowCount: bars.length,
    timezone,
    schema: ["time", "open", "high", "low", "close", "volume"],
    duplicates,
    outOfOrderRows,
    invalidOHLCCount,
    realGapCount,
    expectedClosedCount,
    status,
  };
}

function classifyMissingBuckets(from: Date, to: Date, timeframe: string, timezone: string | null) {
  const stepMs = timeframeToSeconds(timeframe) * 1000;
  let expectedClosedCount = 0;
  for (let ts = from.getTime(); ts < to.getTime(); ts += stepMs) {
    if (!isExpectedTradingBucket(new Date(ts), timeframe, timezone)) {
      expectedClosedCount += 1;
    }
  }
  return { expectedClosedCount };
}

function getLocalParts(date: Date, timezone: string | null) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone || "UTC",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    dow: weekdayMap[parts.weekday ?? "Sun"] ?? 0,
    hour: Number(parts.hour ?? "0"),
    minute: Number(parts.minute ?? "0"),
  };
}

// US NYSE/CME market holidays — computed algorithmically, no hardcoded list.
// Returns a Set of "YYYY-MM-DD" strings for the given year.
function getUSMarketHolidays(year: number): Set<string> {
  const holidays = new Set<string>();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  // Nearest weekday rule: if holiday falls on Saturday → Friday; Sunday → Monday
  const nearest = (d: Date): Date => {
    const result = new Date(d);
    const dow = result.getUTCDay();
    if (dow === 6) result.setUTCDate(result.getUTCDate() - 1);
    else if (dow === 0) result.setUTCDate(result.getUTCDate() + 1);
    return result;
  };

  // New Year's Day
  holidays.add(fmt(nearest(new Date(Date.UTC(year, 0, 1)))));

  // MLK Day: 3rd Monday of January
  const mlk = new Date(Date.UTC(year, 0, 1));
  let mondays = 0;
  while (mondays < 3) { if (mlk.getUTCDay() === 1) mondays++; if (mondays < 3) mlk.setUTCDate(mlk.getUTCDate() + 1); }
  holidays.add(fmt(mlk));

  // Presidents Day: 3rd Monday of February
  const pres = new Date(Date.UTC(year, 1, 1));
  mondays = 0;
  while (mondays < 3) { if (pres.getUTCDay() === 1) mondays++; if (mondays < 3) pres.setUTCDate(pres.getUTCDate() + 1); }
  holidays.add(fmt(pres));

  // Good Friday: Easter Sunday - 2 days (Anonymous Gregorian algorithm)
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d2 = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d2 - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  const goodFriday = new Date(Date.UTC(year, month, day - 2));
  holidays.add(fmt(goodFriday));

  // Memorial Day: last Monday of May
  const mem = new Date(Date.UTC(year, 4, 31));
  while (mem.getUTCDay() !== 1) mem.setUTCDate(mem.getUTCDate() - 1);
  holidays.add(fmt(mem));

  // Juneteenth: June 19 (observed since 2022)
  if (year >= 2022) holidays.add(fmt(nearest(new Date(Date.UTC(year, 5, 19)))));

  // Independence Day: July 4
  holidays.add(fmt(nearest(new Date(Date.UTC(year, 6, 4)))));

  // Labor Day: 1st Monday of September
  const labor = new Date(Date.UTC(year, 8, 1));
  while (labor.getUTCDay() !== 1) labor.setUTCDate(labor.getUTCDate() + 1);
  holidays.add(fmt(labor));

  // Thanksgiving: 4th Thursday of November
  const tg = new Date(Date.UTC(year, 10, 1));
  let thursdays = 0;
  while (thursdays < 4) { if (tg.getUTCDay() === 4) thursdays++; if (thursdays < 4) tg.setUTCDate(tg.getUTCDate() + 1); }
  holidays.add(fmt(tg));

  // Christmas: December 25
  holidays.add(fmt(nearest(new Date(Date.UTC(year, 11, 25)))));

  return holidays;
}

const _usHolidayCache = new Map<number, Set<string>>();
function isUSMarketHoliday(date: Date): boolean {
  // Use UTC date string for lookup — daily bars are date-keyed in UTC
  const dateStr = date.toISOString().slice(0, 10);
  const year = parseInt(dateStr.slice(0, 4));
  if (!_usHolidayCache.has(year)) _usHolidayCache.set(year, getUSMarketHolidays(year));
  return _usHolidayCache.get(year)!.has(dateStr);
}

const US_TIMEZONES = new Set([
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "US/Eastern", "US/Central", "US/Mountain", "US/Pacific",
]);

const EU_EXCHANGE_TIMEZONES = new Set(["Europe/Berlin", "Europe/Paris", "Europe/Amsterdam", "Europe/Zurich", "Europe/London"]);

// German/Xetra exchange holidays beyond standard US calendar.
// These affect DE30EUR, FDAX, and other Xetra-listed instruments.
function getEUExchangeHolidays(year: number): Set<string> {
  const holidays = new Set<string>();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const nearest = (d: Date): Date => {
    const result = new Date(d);
    const dow = result.getUTCDay();
    if (dow === 6) result.setUTCDate(result.getUTCDate() - 1);
    else if (dow === 0) result.setUTCDate(result.getUTCDate() + 1);
    return result;
  };
  // New Year's Day
  holidays.add(fmt(nearest(new Date(Date.UTC(year, 0, 1)))));
  // Good Friday + Easter Monday (reuse Easter calc from US holidays)
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d2 = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d2 - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  const easterSunday = new Date(Date.UTC(year, month, day));
  const goodFriday = new Date(easterSunday); goodFriday.setUTCDate(goodFriday.getUTCDate() - 2);
  const easterMonday = new Date(easterSunday); easterMonday.setUTCDate(easterMonday.getUTCDate() + 1);
  holidays.add(fmt(goodFriday));
  holidays.add(fmt(easterMonday));
  // Labour Day: May 1
  holidays.add(fmt(nearest(new Date(Date.UTC(year, 4, 1)))));
  // Christmas Eve (Xetra closes early / full close)
  holidays.add(fmt(new Date(Date.UTC(year, 11, 24))));
  // Christmas Day / Boxing Day
  holidays.add(fmt(nearest(new Date(Date.UTC(year, 11, 25)))));
  holidays.add(fmt(nearest(new Date(Date.UTC(year, 11, 26)))));
  // New Year's Eve (Xetra closes early / full close)
  holidays.add(fmt(new Date(Date.UTC(year, 11, 31))));
  return holidays;
}

const _euHolidayCache = new Map<number, Set<string>>();
function isEUExchangeHoliday(date: Date): boolean {
  const dateStr = date.toISOString().slice(0, 10);
  const year = parseInt(dateStr.slice(0, 4));
  if (!_euHolidayCache.has(year)) _euHolidayCache.set(year, getEUExchangeHolidays(year));
  return _euHolidayCache.get(year)!.has(dateStr);
}

function isExpectedTradingBucket(date: Date, timeframe: string, timezone: string | null) {
  const tf = normalizeTimeframe(timeframe);
  const { dow, hour } = getLocalParts(date, timezone);
  if (tf === "D") {
    if (dow < 1 || dow > 5) return false;
    if (timezone && US_TIMEZONES.has(timezone) && isUSMarketHoliday(date)) return false;
    if (timezone && EU_EXCHANGE_TIMEZONES.has(timezone) && isEUExchangeHoliday(date)) return false;
    return true;
  }
  if (tf === "1W" || tf === "W") return true; // weekly bars: one per week, gaps are real
  if (dow === 6) return false;
  if (dow === 0 && hour < 17) return false;
  if (dow === 5 && hour >= 17) return false;
  if (hour === 16) return false;
  // Exclude US exchange holidays for intraday US instruments (full-day close)
  if (timezone && US_TIMEZONES.has(timezone) && isUSMarketHoliday(date)) return false;
  // Exclude EU exchange holidays for intraday EU instruments
  if (timezone && EU_EXCHANGE_TIMEZONES.has(timezone) && isEUExchangeHoliday(date)) return false;
  return true;
}

function readOpenBars(): Record<string, OpenBarRuntime> {
  return safeReadJson<Record<string, OpenBarRuntime>>(OPEN_BARS_PATH, {});
}

function computeRuntimeStatus(params: {
  marketOpen: boolean;
  historicalVerified: boolean;
  liveConfigured: boolean;
  liveVerified: boolean;
  coverageStatus: CoverageStatus;
  sourceQuality: LiveSourceQuality;
}): RuntimeStatus {
  if (!params.historicalVerified) return "MISSING_HISTORY";
  if (params.coverageStatus === "STALE") return "HISTORY_STALE";
  if (!params.liveConfigured) return params.marketOpen ? "PROVIDER_UNAVAILABLE" : "MARKET_CLOSED";
  if (!params.marketOpen) return "MARKET_CLOSED";
  if (!params.liveVerified) return "LIVE_UNAVAILABLE";
  if (params.sourceQuality === "stale") return "LIVE_STALE";
  if (params.sourceQuality === "unavailable") return "LIVE_UNAVAILABLE";
  return "READY";
}

function coverageStatusFromDataset(status: DatasetStatus): CoverageStatus {
  if (status === "COMPLETE") return "FULL";
  if (status === "PARTIAL") return "PARTIAL";
  if (status === "STALE") return "STALE";
  if (status === "INVALID") return "INVALID";
  return "MISSING";
}

function resolveRuntimeKey(
  contract: TerminalUniverseContract,
  instrumentId: string,
  timeframe: string,
  fallbackTicker: string,
  fallbackProviderSymbol: string | null,
) {
  const mapping = contract.strategyMappings.find(
    (entry) => entry.instrumentId === instrumentId && normalizeTimeframe(entry.timeframe) === normalizeTimeframe(timeframe),
  );
  if (mapping?.runtimeKey) return mapping.runtimeKey;
  if (normalizeTimeframe(timeframe) === "D") return fallbackTicker;
  return `${fallbackProviderSymbol ?? fallbackTicker}_${timeframe}`;
}

function scanWriterAudit(): WriterAuditEntry[] {
  const entries: WriterAuditEntry[] = [];
  const hasTargetedWrite = (raw: string, target: string) => {
    if (target === "open_bars.json") {
      return new RegExp(
        `open_bars\\.json[\\s\\S]{0,240}(writeFileSync\\s*\\(|appendFileSync\\s*\\(|json\\.dump\\s*\\()|(writeFileSync\\s*\\(|appendFileSync\\s*\\(|json\\.dump\\s*\\()[\\s\\S]{0,240}open_bars\\.json`,
        "i",
      ).test(raw);
    }
    const escapedTarget = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const mutationRegex = new RegExp(
      `(from|table)\\(["'\`]${escapedTarget}["'\`]\\)[\\s\\S]{0,400}?\\.(upsert|insert|update|delete)\\b`,
      "i",
    );
    return mutationRegex.test(raw);
  };
  for (const root of WRITER_SCAN_TARGETS) {
    for (const file of walkFiles(root, [".py", ".mjs", ".ts", ".tsx"])) {
      const raw = fs.readFileSync(file, "utf8");
      const rel = path.relative(REPO_ROOT, file).replace(/\\/g, "/");
      const language = file.endsWith(".py")
        ? "python"
        : file.endsWith(".mjs")
          ? "node"
          : file.endsWith(".ts") || file.endsWith(".tsx")
            ? "typescript"
            : "unknown";
      const matches: Array<{ needle: string; kind: WriterAuditEntry["kind"]; target: string }> = [
        { needle: "monitoring_ohlc", kind: "historical_write", target: "monitoring_ohlc" },
        { needle: "invest_ohlc", kind: "historical_write", target: "invest_ohlc" },
        { needle: "live_quotes", kind: "live_quote_write", target: "live_quotes" },
        { needle: "open_bars.json", kind: "open_bar_write", target: "open_bars.json" },
      ];
      for (const match of matches) {
        if (!raw.includes(match.needle)) continue;
        const writes = hasTargetedWrite(raw, match.target);
        const isTest = /(^|\/)(__tests__|.*(?:test|spec)\.(?:py|mjs|ts|tsx)$)/.test(rel);
        const bridgeImportOnly =
          rel === "tools/market-data/bridge_intraday_mt.mjs" &&
          raw.includes("BRIDGE_MODE_DEFAULT = \"import_only\"");
        const isMaintenancePath = /(cleanup|seed_|import-|refresh-|manifest|dry_run|bridge_)/.test(rel);
        if (!writes) {
          entries.push({
            file: rel,
            kind: match.kind,
            target: match.target,
            language,
            classification: "READ_ONLY",
          });
          continue;
        }
        entries.push({
          file: rel,
          kind: match.kind,
          target: match.target,
          language,
          classification:
            isTest
              ? "TEST_ONLY"
              : bridgeImportOnly || isMaintenancePath
                ? "MAINTENANCE_WRITER"
                : "PRODUCTION_WRITER",
        });
      }
    }
  }
  return entries.sort((a, b) => a.file.localeCompare(b.file) || a.target.localeCompare(b.target));
}

function toCsv(rows: AllAssetAuditRow[]) {
  const headers = [
    "instrumentId",
    "ticker",
    "usedBy",
    "timeframe",
    "historicalConfigured",
    "historicalVerified",
    "historySource",
    "historyPath",
    "historyStart",
    "historyEnd",
    "rowCount",
    "coverageStatus",
    "realGapCount",
    "liveConfigured",
    "liveVerified",
    "liveProvider",
    "providerSymbol",
    "latestPrice",
    "providerTimestampUtc",
    "freshnessSeconds",
    "effectiveDelaySeconds",
    "sourceQuality",
    "openBarPresent",
    "openBarBucket",
    "openBarLastUpdateUtc",
    "runtimeStatus",
  ];
  const escape = (value: unknown) => {
    const raw = Array.isArray(value) ? value.join("|") : value == null ? "" : String(value);
    return /[",\n]/.test(raw) ? `"${raw.replace(/"/g, "\"\"")}"` : raw;
  };
  return [headers.join(","), ...rows.map((row) => headers.map((header) => escape((row as Record<string, unknown>)[header])).join(","))].join("\n");
}

function toStrategyMappingCsv(rows: TerminalUniverseContract["strategyMappings"]) {
  const headers = [
    "strategyId",
    "underlyingId",
    "instrumentId",
    "marketType",
    "venue",
    "timeframe",
    "historicalSource",
    "liveSource",
    "runtimeKey",
    "sourceConfigPath",
    "sourceConfigRef",
  ];
  const escape = (value: unknown) => {
    const raw = value == null ? "" : String(value);
    return /[",\n]/.test(raw) ? `"${raw.replace(/"/g, "\"\"")}"` : raw;
  };
  return [headers.join(","), ...rows.map((row) => headers.map((header) => escape((row as Record<string, unknown>)[header])).join(","))].join("\n");
}

export async function runAllAssetAudit() {
  ensureRuntimeDir();
  const supabase = createSupabaseServiceClient();
  const universe = buildTerminalUniverse();
  const contract = buildTerminalUniverseContract();
  const openBars = readOpenBars();
  const historicalStores: HistoricalStoreInventory[] = [];
  const rows: AllAssetAuditRow[] = [];

  for (const entry of universe.entries) {
    for (const configuredTimeframe of entry.configuredTimeframes) {
      const timeframe = normalizeTimeframe(configuredTimeframe);
      const marketOpen = isExpectedTradingBucket(new Date(), timeframe, entry.timezone);

      let historicalStore: HistoricalStoreInventory | null = null;
      let authoritativePath: string | null = null;
      let historySource = entry.historicalSource;

      if (entry.sources.includes("core_invest")) {
        const csvPath = inferCsvPathForTicker(entry.ticker);
        if (csvPath) {
          const parsed = parseCsvDataset(csvPath);
          const analyzed = analyzeBars(parsed, timeframe, entry.timezone);
          historicalStore = {
            instrumentId: entry.instrumentId,
            ticker: entry.ticker,
            timeframe,
            pathOrSource: path.relative(REPO_ROOT, csvPath).replace(/\\/g, "/"),
            format: "csv",
            sourceRole: "AUTHORITATIVE",
            ...analyzed,
          };
          authoritativePath = historicalStore.pathOrSource;
          historySource = "core_invest_canonical_csv";
          historicalStores.push(historicalStore);
        }
      }

      if (!historicalStore) {
        const assetKey = resolveRuntimeKey(contract, entry.instrumentId, timeframe, entry.ticker, entry.providerSymbol);
        const table = entry.sources.includes("core_invest") && timeframe === "D" ? "invest_ohlc" : "monitoring_ohlc";
        const column = table === "invest_ohlc" ? "symbol" : "asset";
        const selectCols = table === "invest_ohlc" ? "symbol,date,open,high,low,close,volume" : "asset,date,open,high,low,close,volume";
        // Paginate: Supabase default limit is 1000 rows. Fetch in pages until exhausted.
        const PAGE_SIZE = 1000;
        let allRawRows: Array<Record<string, unknown>> = [];
        let page = 0;
        while (true) {
          let q = supabase
            .from(table)
            .select(selectCols)
            .eq(column, assetKey)
            .order("date", { ascending: true })
            .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
          if (table === "monitoring_ohlc") q = q.eq("timeframe", timeframe);
          const { data } = await q;
          const pageRows = (data ?? []) as Array<Record<string, unknown>>;
          allRawRows = allRawRows.concat(pageRows);
          if (pageRows.length < PAGE_SIZE) break;
          page++;
        }
        const rawRows = allRawRows;
        const parsed = rawRows.map((row) => ({
          timestampUtc: normalizeTimestamp(row.date),
          open: parseNumber(row.open),
          high: parseNumber(row.high),
          low: parseNumber(row.low),
          close: parseNumber(row.close),
          volume: parseNumber(row.volume),
        }));
        const analyzed = analyzeBars(parsed, timeframe, entry.timezone);
        historicalStore = {
          instrumentId: entry.instrumentId,
          ticker: entry.ticker,
          timeframe,
          pathOrSource: `supabase:${table}:${assetKey}`,
          format: "supabase",
          sourceRole: "AUTHORITATIVE",
          ...analyzed,
        };
        authoritativePath = historicalStore.pathOrSource;
        historySource = table;
        historicalStores.push(historicalStore);
      }

      const proxyPath = getMonitoringProxyPath(entry.ticker);
      if (proxyPath) {
        const proxyBars = parseJsonBarsDataset(proxyPath);
        historicalStores.push({
          instrumentId: entry.instrumentId,
          ticker: entry.ticker,
          timeframe,
          pathOrSource: path.relative(REPO_ROOT, proxyPath).replace(/\\/g, "/"),
          format: "json",
          sourceRole: "PROXY",
          ...analyzeBars(proxyBars, timeframe, entry.timezone),
        });
      }

      const legacyMatches = walkFiles(LEGACY_HISTORICAL_DIR, [".csv"]).filter((file) => file.toUpperCase().includes(entry.ticker.replace(/!/g, "").toUpperCase()));
      for (const legacyFile of legacyMatches.slice(0, 3)) {
        const legacyBars = parseCsvDataset(legacyFile);
        // Detect actual bar spacing of the legacy file to avoid analyzing daily CSVs at intraday resolution.
        // If the file's median bar spacing does not match the configured timeframe, skip gap analysis.
        const legacyStepMs = timeframeToSeconds(timeframe) * 1000;
        let legacyTimeframeMismatch = false;
        if (legacyBars.length >= 2) {
          const deltas: number[] = [];
          for (let i = 1; i < Math.min(legacyBars.length, 20); i++) {
            const d = new Date(legacyBars[i].timestampUtc).getTime() - new Date(legacyBars[i - 1].timestampUtc).getTime();
            if (d > 0) deltas.push(d);
          }
          if (deltas.length > 0) {
            deltas.sort((a, b) => a - b);
            const medianDelta = deltas[Math.floor(deltas.length / 2)];
            // If actual bar spacing is more than 4× the configured step, timeframe mismatch
            legacyTimeframeMismatch = medianDelta > legacyStepMs * 4;
          }
        }
        historicalStores.push({
          instrumentId: entry.instrumentId,
          ticker: entry.ticker,
          timeframe,
          pathOrSource: path.relative(REPO_ROOT, legacyFile).replace(/\\/g, "/"),
          format: "csv",
          sourceRole: "LEGACY",
          ...(legacyTimeframeMismatch
            ? { ...analyzeBars([], timeframe, entry.timezone), status: "MISSING" as const, rowCount: legacyBars.length }
            : analyzeBars(legacyBars, timeframe, entry.timezone)),
        });
      }

      const liveCandidates = [entry.providerSymbol, entry.ticker].filter(Boolean) as string[];
      let liveRow: Record<string, unknown> | null = null;
      for (const candidate of [...new Set(liveCandidates)]) {
        const { data } = await supabase
          .from("live_quotes")
          .select("symbol,close,timestamp,updated_at")
          .eq("symbol", candidate)
          .limit(1)
          .order("updated_at", { ascending: false });
        if (data?.[0]) {
          liveRow = data[0] as Record<string, unknown>;
          break;
        }
      }

      const providerTimestampUtc = normalizeTimestamp(liveRow?.timestamp ?? liveRow?.updated_at ?? "");
      const freshnessSeconds = providerTimestampUtc ? Math.max(0, Math.round((Date.now() - new Date(providerTimestampUtc).getTime()) / 1000)) : null;
      const expectedDelaySeconds = entry.expectedDelaySeconds ?? 0;
      const liveVerified = parseNumber(liveRow?.close) != null;
      const effectiveDelaySeconds = freshnessSeconds == null ? null : Math.max(expectedDelaySeconds, freshnessSeconds);
      const sourceQuality: LiveSourceQuality =
        !liveVerified
          ? "unavailable"
          : freshnessSeconds != null && freshnessSeconds <= Math.max(30, expectedDelaySeconds + 30)
            ? expectedDelaySeconds > 0
              ? "delayed"
              : "realtime"
            : "stale";

      const openBarKey = resolveRuntimeKey(contract, entry.instrumentId, timeframe, entry.ticker, entry.providerSymbol);
      const openBar = openBars[openBarKey] ?? null;
      const openBarPresent = Boolean(openBar?.ts_epoch);
      const openBarBucket = openBar?.ts_epoch ? new Date(openBar.ts_epoch * 1000).toISOString() : null;
      const openBarLastUpdateUtc = openBar?.lastReceivedUtc ?? null;

      rows.push({
        instrumentId: entry.instrumentId,
        ticker: entry.ticker,
        usedBy: [...entry.sources],
        timeframe,
        historicalConfigured: Boolean(entry.historicalSource),
        historicalVerified: historicalStore.status !== "MISSING" && historicalStore.status !== "INVALID",
        historySource,
        historyPath: authoritativePath,
        historyStart: historicalStore.firstTimestampUtc,
        historyEnd: historicalStore.lastTimestampUtc,
        rowCount: historicalStore.rowCount,
        coverageStatus: coverageStatusFromDataset(historicalStore.status),
        realGapCount: historicalStore.realGapCount,
        liveConfigured: Boolean(entry.liveSource),
        liveVerified,
        liveProvider: entry.liveSource,
        providerSymbol: entry.providerSymbol,
        latestPrice: parseNumber(liveRow?.close),
        providerTimestampUtc,
        freshnessSeconds,
        effectiveDelaySeconds,
        sourceQuality,
        openBarPresent,
        openBarBucket,
        openBarLastUpdateUtc,
        runtimeStatus: computeRuntimeStatus({
          marketOpen,
          historicalVerified: historicalStore.status !== "MISSING" && historicalStore.status !== "INVALID",
          liveConfigured: Boolean(entry.liveSource),
          liveVerified,
          coverageStatus: coverageStatusFromDataset(historicalStore.status),
          sourceQuality,
        }),
      });
    }
  }

  const writerAudit = scanWriterAudit();
  const report: AllAssetAuditReport = {
    generatedAtUtc: new Date().toISOString(),
    universeCounts: universe.counts,
    universeList: universe.entries.map((entry) => ({
      instrumentId: entry.instrumentId,
      ticker: entry.ticker,
      sources: [...entry.sources],
    })),
    terminalUniverseContract: contract,
    runtimeSnapshotAtUtc: new Date().toISOString(),
    historicalStores,
    writerAudit,
    rows,
    summary: {
      totalPairs: rows.length,
      historyFull: rows.filter((row) => row.coverageStatus === "FULL").length,
      historyPartial: rows.filter((row) => row.coverageStatus === "PARTIAL").length,
      historyStale: rows.filter((row) => row.coverageStatus === "STALE").length,
      historyMissing: rows.filter((row) => row.coverageStatus === "MISSING").length,
      historyInvalid: rows.filter((row) => row.coverageStatus === "INVALID").length,
      liveReady: rows.filter((row) => row.sourceQuality === "realtime").length,
      liveDelayed: rows.filter((row) => row.sourceQuality === "delayed").length,
      liveStale: rows.filter((row) => row.sourceQuality === "stale").length,
      liveUnavailable: rows.filter((row) => row.sourceQuality === "unavailable").length,
      marketClosed: rows.filter((row) => row.runtimeStatus === "MARKET_CLOSED").length,
      openBarsActive: rows.filter((row) => row.openBarPresent).length,
      openBarsMissingWhileMarketOpen: rows.filter((row) => !row.openBarPresent && row.runtimeStatus !== "MARKET_CLOSED").length,
      realGaps: historicalStores.filter((s) => s.sourceRole === "AUTHORITATIVE").reduce((sum, store) => sum + store.realGapCount, 0),
      duplicates: historicalStores.filter((s) => s.sourceRole === "AUTHORITATIVE").reduce((sum, store) => sum + store.duplicates, 0),
      invalidOHLC: historicalStores.filter((s) => s.sourceRole === "AUTHORITATIVE").reduce((sum, store) => sum + store.invalidOHLCCount, 0),
    },
  };

  fs.writeFileSync(path.join(RUNTIME_DIR, "terminal-universe.json"), JSON.stringify(contract, null, 2), "utf8");
  fs.writeFileSync(path.join(RUNTIME_DIR, "all-asset-audit.json"), JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(path.join(RUNTIME_DIR, "all-asset-audit.csv"), toCsv(rows), "utf8");
  fs.writeFileSync(path.join(RUNTIME_DIR, "strategy-mappings.json"), JSON.stringify(contract.strategyMappings, null, 2), "utf8");
  fs.writeFileSync(path.join(RUNTIME_DIR, "strategy-mappings.csv"), toStrategyMappingCsv(contract.strategyMappings), "utf8");

  return report;
}
