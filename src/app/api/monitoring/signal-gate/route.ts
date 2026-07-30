import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { checkStaleness } from "@/lib/monitoring/tradingDayStaleness";
import { getMonitoringStrategyById } from "@/lib/monitoring/monitoringStrategyRegistry";

// ── Types ─────────────────────────────────────────────────────────────────────

export type SignalGateEngineStatus =
  | "ready"
  | "weak"
  | "missing"
  | "placeholder"
  | "stub"
  | "unknown";

export type SignalGateDataStatus =
  | "current"
  | "stale"
  | "single_source_unverified"
  | "no_data";

export type SignalGateValidationStatus =
  | "validated"
  | "single_source_unverified"
  | "unvalidated"
  | "no_data";

export type SignalGateRealtimeStatus =
  | "confirmed"
  | "not_attempted"
  | "failed"
  | "not_applicable";

export type SignalGateResult = {
  assetId: string;
  strategyId: string | null;
  dataStatus: SignalGateDataStatus;
  dataTimestamp: string | null;
  dataAge: number;
  dataSource: string;
  validationStatus: SignalGateValidationStatus;
  engineStatus: SignalGateEngineStatus;
  liveReady: boolean;
  realtimeVerificationStatus: SignalGateRealtimeStatus;
  signalAllowed: boolean;
  blockingReasons: string[];
  meta: {
    checkedAt: string;
    expectedLastTradingDay: string | null;
    tradingDaysStale: number;
    maxTradingDays: number;
  };
};

// ── Strategy IDs explicitly approved for live signal generation ───────────────
// Currently none. All intraday strategies passed wave1 backtest but have NOT
// passed the live approval gate (OOS/WF review per Codex Run 3, 2026-07-30).
const LIVE_READY_STRATEGY_IDS: ReadonlySet<string> = new Set<string>([]);

// ── Asset → strategy ID mapping for the 6 monitoring charts ──────────────────
// These are the monitoring registry IDs, NOT the display symbols.
const ASSET_TF_TO_STRATEGY_ID: Record<string, string> = {
  "FDAX1!_2H":  "DAX_2H",
  "FDAX1!_1H":  "DAX_1H",
  "6E1!_30M":   "EURUSD_30M",
  // GC1!/GLD/YM1! anomaly: no defined strategy ID (all PLACEHOLDER in registry)
};

// ── Assets known to have NO independent local validation ─────────────────────
// GLD has no local TVC cache file; it depends entirely on Supabase invest_ohlc.
const SINGLE_SOURCE_ASSETS: ReadonlySet<string> = new Set(["GLD"]);

// ── Helpers ───────────────────────────────────────────────────────────────────

const REPO = path.resolve(process.cwd());
const MANIFEST_PATH = path.join(
  REPO,
  "public/generated/monitoring/tradingview_data_cache/cache_manifest_full.json",
);

type ManifestAsset = {
  asset?: string;
  source?: string;
  timeframe?: string;
  lastDate?: string;
  lastClose?: number;
  status?: string;
  cachePath?: string;
  cacheFile?: string;
};

type Manifest = { assets?: ManifestAsset[] };

let _manifest: ManifestAsset[] | null = null;

function getManifest(): ManifestAsset[] {
  if (_manifest) return _manifest;
  try {
    const raw = fs.readFileSync(MANIFEST_PATH, "utf8");
    const parsed = JSON.parse(raw) as Manifest;
    _manifest = parsed.assets ?? [];
  } catch {
    _manifest = [];
  }
  return _manifest;
}

/** Find a manifest entry for this asset+timeframe. For daily assets, also
 *  matches by source key (e.g. "COMEX:GC1!" or "CBOT_MINI:YM1!"). */
function findManifestEntry(
  asset: string,
  timeframe: string,
  source?: string,
): ManifestAsset | undefined {
  const manifest = getManifest();
  const tf = timeframe.toUpperCase().replace(/^1D$/i, "D");

  // Intraday: keyed as ASSET_TF
  if (tf !== "D" && tf !== "W") {
    const intradayKey = `${asset}_${tf}`;
    const found = manifest.find((e) => e.asset === intradayKey);
    if (found) return found;
  }

  // Daily: match by asset + timeframe, optionally filtering by source
  const daily = manifest.filter(
    (e) => e.asset === asset && (e.timeframe === tf || e.timeframe === "D"),
  );
  if (source) {
    const bySrc = daily.find((e) => e.source === source);
    if (bySrc) return bySrc;
  }
  return daily[0];
}

/** Read the last bar's date from a TVC cache JSON file.
 *  Files are `{ bars: [ { date, open, high, low, close }, ... ] }`.
 *  For large files, reads only the last 2 KB to find the last bar. */
function readLastBarDateFromFile(filePath: string): string | null {
  try {
    const abs = path.join(REPO, filePath);
    if (!fs.existsSync(abs)) return null;
    const stat = fs.statSync(abs);
    const readLen = Math.min(stat.size, 2048);
    const buf = Buffer.alloc(readLen);
    const fd = fs.openSync(abs, "r");
    fs.readSync(fd, buf, 0, readLen, stat.size - readLen);
    fs.closeSync(fd);
    const tail = buf.toString("utf8");
    // Look for a date field in the last bar: "date":"YYYY-MM-DD" or "date":"YYYY-MM-DDTHH:…"
    const matches = [...tail.matchAll(/"(?:date|time)"\s*:\s*"([^"]+)"/g)];
    if (!matches.length) return null;
    const last = matches[matches.length - 1]![1]!;
    return last.slice(0, 10);
  } catch {
    return null;
  }
}

function resolveDataInfo(
  asset: string,
  timeframe: string,
  source?: string,
): {
  dataSource: string;
  dataTimestamp: string | null;
  validationStatus: SignalGateValidationStatus;
} {
  // GLD has no local cache — Supabase only
  if (SINGLE_SOURCE_ASSETS.has(asset)) {
    return {
      dataSource: "supabase_only",
      dataTimestamp: null,
      validationStatus: "single_source_unverified",
    };
  }

  const entry = findManifestEntry(asset, timeframe, source);
  if (!entry) {
    return { dataSource: "none", dataTimestamp: null, validationStatus: "no_data" };
  }

  // Prefer manifest's lastDate; fall back to reading the cache file
  let lastDate = entry.lastDate ?? null;
  if (!lastDate && entry.cachePath) {
    lastDate = readLastBarDateFromFile(entry.cachePath);
  }

  return {
    dataSource: "tvc_cache",
    dataTimestamp: lastDate,
    validationStatus: lastDate ? "validated" : "unvalidated",
  };
}

function resolveEngineStatus(
  asset: string,
  timeframe: string,
  strategyId: string | null,
): { engineStatus: SignalGateEngineStatus; liveReady: boolean } {
  // run-anomaly endpoint is a stub → assets routed through it have no working engine
  const anomalyAssets = new Set(["GC1!", "GLD", "YM1!"]);
  const tf = timeframe.toUpperCase().replace(/^1D$/i, "D");
  if (anomalyAssets.has(asset) && tf === "D") {
    // GC1! has a metals_energy entry (MISSING), GLD has none, YM1! anomaly = PLACEHOLDER
    if (asset === "GLD") return { engineStatus: "missing", liveReady: false };
    const regEntry = getMonitoringStrategyById(asset === "GC1!" ? "GC1" : "ANOMALY_4");
    if (!regEntry) return { engineStatus: "missing", liveReady: false };
    const status = regEntry.status;
    if (status === "PLACEHOLDER") return { engineStatus: "placeholder", liveReady: false };
    if (status === "MISSING") return { engineStatus: "missing", liveReady: false };
    return { engineStatus: "unknown", liveReady: false };
  }

  if (!strategyId) return { engineStatus: "unknown", liveReady: false };

  const regEntry = getMonitoringStrategyById(strategyId);
  if (!regEntry) return { engineStatus: "missing", liveReady: false };

  const liveReady = LIVE_READY_STRATEGY_IDS.has(strategyId);
  switch (regEntry.status) {
    case "READY":   return { engineStatus: "ready", liveReady };
    case "WEAK":    return { engineStatus: "weak",  liveReady: false };
    case "MISSING": return { engineStatus: "missing", liveReady: false };
    case "PLACEHOLDER": return { engineStatus: "placeholder", liveReady: false };
    case "BLOCKED": return { engineStatus: "stub", liveReady: false };
    default:        return { engineStatus: "unknown", liveReady: false };
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const asset = (searchParams.get("asset") ?? "").trim().toUpperCase();
  const timeframe = (searchParams.get("timeframe") ?? "D").trim().toUpperCase();
  const strategyIdParam = searchParams.get("strategyId")?.trim() ?? null;
  const source = searchParams.get("source")?.trim() ?? undefined;

  if (!asset) {
    return NextResponse.json({ error: "asset param required" }, { status: 400 });
  }

  const tf = timeframe.replace(/^1D$/i, "D");
  const assetTfKey = `${asset}_${tf}`;
  const strategyId = strategyIdParam ?? ASSET_TF_TO_STRATEGY_ID[assetTfKey] ?? null;

  const today = new Date().toISOString().slice(0, 10);
  const checkedAt = new Date().toISOString();

  // ── Data resolution ──────────────────────────────────────────────────────────
  const { dataSource, dataTimestamp, validationStatus } = resolveDataInfo(
    asset,
    tf,
    source,
  );

  // ── Staleness check ──────────────────────────────────────────────────────────
  let dataStatus: SignalGateDataStatus = "no_data";
  let tradingDaysStale = 0;
  let maxTradingDays = 2;
  let expectedLastTradingDay: string | null = null;
  let dataAge = 0;

  if (validationStatus === "single_source_unverified") {
    dataStatus = "single_source_unverified";
  } else if (dataTimestamp) {
    const staleness = checkStaleness(dataTimestamp, tf, today);
    tradingDaysStale = staleness.tradingDaysStale;
    maxTradingDays = staleness.maxTradingDays;
    expectedLastTradingDay = staleness.expectedLastTradingDay;
    dataAge = Math.floor(
      (Date.parse(`${today}T12:00:00Z`) - Date.parse(`${dataTimestamp}T12:00:00Z`)) /
        86_400_000,
    );
    dataStatus = staleness.stale ? "stale" : "current";
  }

  // ── Engine resolution ────────────────────────────────────────────────────────
  const { engineStatus, liveReady } = resolveEngineStatus(asset, tf, strategyId);

  // ── Blocking reasons ─────────────────────────────────────────────────────────
  const blockingReasons: string[] = [];

  if (dataStatus === "no_data") blockingReasons.push("no_data_source");
  if (dataStatus === "stale") blockingReasons.push("stale_data");
  if (dataStatus === "single_source_unverified") blockingReasons.push("single_source_unverified");
  if (validationStatus === "unvalidated") blockingReasons.push("data_not_validated");
  if (validationStatus === "no_data") blockingReasons.push("no_data_source");

  if (engineStatus === "missing") blockingReasons.push("engine_missing");
  if (engineStatus === "placeholder") blockingReasons.push("engine_placeholder");
  if (engineStatus === "stub") blockingReasons.push("engine_stub_503");
  if (engineStatus === "weak") blockingReasons.push("engine_weak_non_blocking");
  if (engineStatus === "unknown") blockingReasons.push("engine_unknown");

  if (!liveReady) blockingReasons.push("live_ready_false");

  const signalAllowed = blockingReasons.length === 0;

  const result: SignalGateResult = {
    assetId: asset,
    strategyId,
    dataStatus,
    dataTimestamp,
    dataAge,
    dataSource,
    validationStatus,
    engineStatus,
    liveReady,
    realtimeVerificationStatus: "not_attempted",
    signalAllowed,
    blockingReasons,
    meta: {
      checkedAt,
      expectedLastTradingDay,
      tradingDaysStale,
      maxTradingDays,
    },
  };

  return NextResponse.json(result);
}

export async function POST() {
  return NextResponse.json({ error: "read only" }, { status: 405 });
}
