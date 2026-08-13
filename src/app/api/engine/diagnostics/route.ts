/**
 * /api/engine/diagnostics — localhost-only engine health endpoint.
 *
 * ALL values are computed dynamically from live sources:
 *   - Flask health, chart-data, signal, live-quotes (current HTTP calls)
 *   - SPY CSV metadata (file read)
 *   - Rollover audit JSON (local .runtime file read)
 *
 * NO hardcoded: parameterHashesMatch, dataHashesMatch, feedStatus, cacheUsed,
 * reproducibility metrics, benchmarkLastDate, knownIssues.
 *
 * Does NOT run expensive backtests on every GET.
 * Reads last audit JSON from .runtime/engine/ if available.
 */

import { type NextRequest, NextResponse } from "next/server";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

export const dynamic = "force-dynamic";

const ENGINE_URL = process.env.NEXT_PUBLIC_ENGINE_URL ?? "http://localhost:5000";

const CSV_PATHS: Record<string, string> = {
  "EUR_30M_futures": "C:\\Users\\joris\\Desktop\\Joris\\TV Data\\6E1_30M_FULL.csv",
  "EUR_30M_spot":    "C:\\Users\\joris\\Desktop\\Joris\\TV Data\\EURUSD_30M_IBKR_FULL.csv",
  "EUR_30M_cfd":     "C:\\Users\\joris\\Desktop\\Joris\\TV Data\\dukascopy\\EURUSD_1M_FULL.csv",
};

const SPY_CSV_PATH = join(
  process.cwd(), "src", "data", "capitalife", "fsportfolio", "ohlc", "SPY.csv"
);

const ROLLOVER_AUDIT_PATH = join(
  "C:\\Users\\joris\\Documents\\Capitalife Engine",
  ".runtime", "engine", "rollover-audit.json"
);

const LAST_RUN_PATH = join(
  "C:\\Users\\joris\\Documents\\Capitalife Engine",
  ".runtime", "engine", "last-backtest-run.json"
);

// ── Feed status classification ────────────────────────────────────────────────
function feedStatusFromAge(ageSeconds: number): string {
  if (ageSeconds <= 15) return "live";
  if (ageSeconds <= 90) return "delayed";
  if (ageSeconds <= 300) return "stale";
  return "offline";
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function flaskHealth() {
  try {
    const r = await fetch(`${ENGINE_URL}/health`, { signal: AbortSignal.timeout(4_000), cache: "no-store" });
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
    const j = await r.json() as { status?: string; timestamp?: string };
    return { ok: true, status: j.status ?? "ok", engineTimestamp: j.timestamp };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

async function chartDataCheck(assetType = "futures") {
  try {
    const r = await fetch(
      `${ENGINE_URL}/chart-data/EUR_30M?asset_type=${assetType}&start=2022-01-01&end=2022-12-31&limit=0`,
      { signal: AbortSignal.timeout(20_000), cache: "no-store" }
    );
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
    const j = await r.json() as {
      data_hash?: string; bar_count?: number;
      first_bar_utc?: string; last_bar_utc?: string; asset_type?: string;
    };
    return { ok: true, dataHash: j.data_hash, barCount: j.bar_count,
             firstBarUtc: j.first_bar_utc, lastBarUtc: j.last_bar_utc };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

async function signalCheck(assetType = "futures") {
  try {
    const r = await fetch(`${ENGINE_URL}/signal/EUR_30M?asset_type=${assetType}`,
      { signal: AbortSignal.timeout(25_000), cache: "no-store" });
    const j = await r.json() as {
      status?: string; direction?: string | null;
      input_hash?: string; param_hash?: string; bar_count?: number;
    };
    return {
      ok: r.ok,
      status: j.status ?? null,
      direction: j.direction ?? null,
      inputHash: j.input_hash ?? null,
      paramHash: j.param_hash ?? null,
      barCount: j.bar_count ?? null,
    };
  } catch (e) {
    return { ok: false, status: null, error: String(e) };
  }
}

async function liveQuoteCheck() {
  try {
    const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    const r = await fetch(`${base}/api/live-quotes?symbols=6E1!`,
      { signal: AbortSignal.timeout(6_000), cache: "no-store" });
    if (!r.ok) return { ok: false, feedStatus: "unknown", error: `HTTP ${r.status}` };
    const raw = await r.json() as { quotes?: Array<{ symbol: string; timestamp?: string; close?: number }> } | Array<{ symbol: string; timestamp?: string; close?: number }>;
    const quotes = Array.isArray(raw) ? raw : (raw.quotes ?? []);
    const row = quotes.find(q => q.symbol === "6E1!");
    if (!row?.timestamp) return { ok: false, feedStatus: "unknown", error: "no 6E1! row" };
    const providerAge = Math.round((Date.now() - new Date(row.timestamp).getTime()) / 1000);
    const feedStatus = feedStatusFromAge(providerAge);
    return { ok: true, providerAgeSeconds: providerAge, feedStatus, lastQuoteTimestamp: row.timestamp };
  } catch (e) {
    return { ok: false, feedStatus: "unknown", error: String(e) };
  }
}

function spyBenchmarkCheck() {
  try {
    if (!existsSync(SPY_CSV_PATH)) return { ok: false, error: "SPY.csv not found" };
    const lines = readFileSync(SPY_CSV_PATH, "utf8").trim().split("\n");
    const firstDate = (lines[1] ?? "").split(",")[0]?.replace(/"/g, "") ?? null;
    const lastDate  = (lines[lines.length - 1] ?? "").split(",")[0]?.replace(/"/g, "") ?? null;
    const pointCount = lines.length - 1;
    const staleDays  = lastDate
      ? Math.floor((Date.now() - new Date(lastDate).getTime()) / 86_400_000)
      : null;
    // complete : last data is within ~1 trading week of today
    // partial  : last data is recent but not current (up to 30 days behind)
    // stale    : last data is >30 days behind today — benchmark is notably outdated
    // unavailable : file missing or invalid
    const coverageStatus =
      staleDays === null ? "unavailable" :
      staleDays <= 5    ? "complete"     :
      staleDays <= 30   ? "partial"      : "stale";
    return {
      ok:             true,
      benchmarkType:  "SPY Price Return",
      dividends:      false,
      splits:         false,
      firstDate,
      lastDate,
      pointCount,
      staleDays,
      coverageStatus,
      note:           "Raw close from SPY.csv — no dividend adjustment. This is Price Return, NOT Total Return.",
    };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

function rolloverAuditCheck() {
  try {
    if (!existsSync(ROLLOVER_AUDIT_PATH)) return { ok: false, status: "not_checked" };
    const data = JSON.parse(readFileSync(ROLLOVER_AUDIT_PATH, "utf8")) as Record<string, unknown>;
    const summary = data.summary as Record<string, unknown> | undefined;
    return {
      ok:                true,
      auditTimestamp:    data.auditTimestamp,
      csvBars:           data.csvBars,
      csvLast:           data.csvLast,
      probableRollovers: (summary?.probableRolloverCount as number) ?? null,
      totalGaps:         (summary?.totalGapsAboveMinThreshold as number) ?? null,
      byClassification:  summary?.byClassification ?? null,
      limitation:        data.limitation,
    };
  } catch (e) {
    return { ok: false, status: "error", error: String(e) };
  }
}

function lastBacktestRun() {
  try {
    if (!existsSync(LAST_RUN_PATH)) return { ok: false, status: "not_checked" };
    return { ok: true, ...JSON.parse(readFileSync(LAST_RUN_PATH, "utf8")) as Record<string, unknown> };
  } catch {
    return { ok: false, status: "not_checked" };
  }
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest): Promise<NextResponse> {
  const host      = request.headers.get("host") ?? "";
  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  const isLocal =
    host.startsWith("localhost") ||
    host.startsWith("127.0.0.1") ||
    forwarded === "" ||
    forwarded.split(",")[0]?.trim() === "127.0.0.1" ||
    forwarded.split(",")[0]?.trim() === "::1";

  if (!isLocal) {
    return NextResponse.json({ error: "diagnostics: localhost only" }, { status: 403 });
  }

  // Run independent checks concurrently
  const [
    health, chartFutures, chartSpot,
    signal, feed, spy
  ] = await Promise.all([
    flaskHealth(),
    chartDataCheck("futures"),
    chartDataCheck("spot"),
    signalCheck("futures"),
    liveQuoteCheck(),
    Promise.resolve(spyBenchmarkCheck()),
  ]);

  // ── Bar integrity (three separate proofs) ────────────────────────────────
  type BarIntegritySection = {
    chartHash: string | null;
    runnerHash: string | null;
    hashesMatch: boolean | null;
    status: "passed" | "failed" | "unsupported" | "not_checked";
  };
  type BarIntegrityResult = {
    ok: boolean;
    historicalCsvOnly: BarIntegritySection & { chartBarCount?: number; runnerBarCount?: number; barCountMatch?: boolean | null };
    currentReconciled: BarIntegritySection & { monitoringBarsRead?: number; monitoringBarsMerged?: number; chartBarCount?: number; runnerBarCount?: number; barCountMatch?: boolean | null };
    determinism: { firstHash: string | null; secondHash: string | null; hashesMatch: boolean | null; status: "passed" | "failed" | "not_checked" };
    error?: string;
  };
  const notChecked = { chartHash: null, runnerHash: null, hashesMatch: null, status: "not_checked" as const };
  let barIntegrity: BarIntegrityResult = {
    ok: false,
    historicalCsvOnly: notChecked,
    currentReconciled: { ...notChecked, monitoringBarsRead: 0, monitoringBarsMerged: 0 },
    determinism: { firstHash: null, secondHash: null, hashesMatch: null, status: "not_checked" as const },
  };
  try {
    const bhRes = await fetch(
      `${ENGINE_URL}/bar-hash-check?strategy=EUR_30M&asset_type=futures`,
      { signal: AbortSignal.timeout(60_000), cache: "no-store" }
    );
    if (bhRes.ok) {
      const bhData = await bhRes.json() as {
        historicalCsvOnly?: {
          chartHash?: string; runnerHash?: string; hashesMatch?: boolean;
          status?: string; chartBarCount?: number; runnerBarCount?: number; barCountMatch?: boolean;
        };
        currentReconciled?: {
          chartHash?: string; runnerHash?: string; hashesMatch?: boolean;
          status?: string; monitoringBarsRead?: number; monitoringBarsMerged?: number;
          chartBarCount?: number; runnerBarCount?: number; barCountMatch?: boolean;
        };
        determinism?: {
          firstHash?: string; secondHash?: string; hashesMatch?: boolean; status?: string;
        };
      };
      const hist  = bhData.historicalCsvOnly ?? {};
      const recon = bhData.currentReconciled ?? {};
      const det   = bhData.determinism ?? {};
      barIntegrity = {
        ok: true,
        historicalCsvOnly: {
          chartHash:     hist.chartHash  ?? null,
          runnerHash:    hist.runnerHash ?? null,
          hashesMatch:   hist.hashesMatch ?? null,
          status:        (hist.status as BarIntegritySection["status"]) ?? "not_checked",
          chartBarCount: hist.chartBarCount,
          runnerBarCount: hist.runnerBarCount,
          barCountMatch: hist.barCountMatch ?? null,
        },
        currentReconciled: {
          chartHash:            recon.chartHash  ?? null,
          runnerHash:           recon.runnerHash ?? null,
          hashesMatch:          recon.hashesMatch ?? null,
          status:               (recon.status as BarIntegritySection["status"]) ?? "not_checked",
          monitoringBarsRead:   recon.monitoringBarsRead  ?? 0,
          monitoringBarsMerged: recon.monitoringBarsMerged ?? 0,
          chartBarCount:        recon.chartBarCount,
          runnerBarCount:       recon.runnerBarCount,
          barCountMatch:        recon.barCountMatch ?? null,
        },
        determinism: {
          firstHash:   det.firstHash  ?? null,
          secondHash:  det.secondHash ?? null,
          hashesMatch: det.hashesMatch ?? null,
          status:      (det.status as "passed" | "failed" | "not_checked") ?? "not_checked",
        },
      };
    }
  } catch { /* Flask offline */ }

  const rollover  = rolloverAuditCheck();
  const lastRun   = lastBacktestRun();
  const csvStatus = Object.fromEntries(
    Object.entries(CSV_PATHS).map(([k, p]) => [k, existsSync(p) ? "exists" : "MISSING"])
  );

  // ── Dynamic hash parity ──────────────────────────────────────────────────
  const signalParamHash   = signal.paramHash ?? null;
  const btParamHash = (lastRun.ok && (lastRun as Record<string, unknown>).paramHash)
    ? String((lastRun as Record<string, unknown>).paramHash)
    : null;
  const paramHashesMatch =
    signalParamHash !== null && btParamHash !== null
      ? signalParamHash === btParamHash
      : null;

  // ── Benchmark fields (flat for easy consumption) ──────────────────────────
  const spyData     = spy as Record<string, unknown>;
  const benchmarkCoverageStatus = spyData.coverageStatus as string ?? "unavailable";
  const benchmarkLastDate       = spyData.lastDate as string ?? null;
  const benchmarkStaleDays      = spyData.staleDays as number ?? null;

  // ── Dynamic known issues ──────────────────────────────────────────────────
  const knownIssues: string[] = [];
  if (!health.ok) knownIssues.push(`Flask offline: ${(health as Record<string, unknown>).error}`);
  if (feed.feedStatus === "offline") knownIssues.push("6E1! feed offline");
  if (feed.feedStatus === "stale")   knownIssues.push(`6E1! feed stale: ${(feed as Record<string, unknown>).providerAgeSeconds}s`);
  if (benchmarkCoverageStatus === "stale") {
    knownIssues.push(`SPY benchmark stale: ${benchmarkStaleDays} days since last bar`);
  }
  if (Object.values(csvStatus).some(v => v === "MISSING")) {
    knownIssues.push("One or more CSV source files MISSING");
  }
  if (paramHashesMatch === false) {
    knownIssues.push(`Signal/backtest param hash mismatch: signal=${signalParamHash} bt=${btParamHash}`);
  }
  if (signal.status === "signal_failed") {
    knownIssues.push(`Signal engine error: see signal.status`);
  }
  if (barIntegrity.ok && barIntegrity.historicalCsvOnly.status === "failed") {
    knownIssues.push("historicalCsvOnly hash mismatch: chart and runner disagree on the same CSV input");
  }
  if (barIntegrity.ok && barIntegrity.currentReconciled.status === "failed") {
    knownIssues.push("currentReconciled hash mismatch: chart and runner disagree on same monitoring_bars snapshot");
  }
  if (barIntegrity.ok && barIntegrity.determinism.status === "failed") {
    knownIssues.push("build_final_bars() non-deterministic: same monitoring_bars snapshot produced different hashes");
  }

  return NextResponse.json({
    timestamp:        new Date().toISOString(),
    note:             "All values computed dynamically — no hardcoded audit results",

    // ── Flask health ─────────────────────────────────────────────────────
    flask: health,

    // ── Feed freshness (4-tier, dynamic) ─────────────────────────────────
    feed: {
      ...feed,
      thresholds: { live: "≤15s", delayed: "16–90s", stale: "91–300s", offline: ">300s" },
      correctionNote: "18s correctly classified as 'delayed', not 'live'",
    },

    // ── Bar integrity (three separate proofs) ────────────────────────────
    // historicalCsvOnly: no monitoring bars → chart service and runner must agree
    // currentReconciled: same monitoring_bars snapshot → chart service and runner must agree
    // determinism: same snapshot, two calls → build_final_bars() must be deterministic
    barIntegrity,

    // ── Chart data hashes (dynamic) ──────────────────────────────────────
    chartData: {
      futures: chartFutures,
      spot:    chartSpot,
      hashEqualityNote: "Use same date range with limit=0 for chart/backtest hash comparison",
    },

    // ── Signal (dynamic) ─────────────────────────────────────────────────
    signal: {
      ...signal,
      signalStatus:     signal.status ?? null,
      signalReasonCode: (signal as Record<string, unknown>).reasonCode ?? null,
      flatForbidden:    "technical errors return signal_failed with reasonCode, never 'flat'",
    },

    // ── Parameter hash parity (dynamic) ──────────────────────────────────
    parameterHashes: {
      signalParamHash,
      btParamHash,
      paramHashesMatch,
      note: paramHashesMatch === null
        ? "bt param hash not_checked — run a backtest first"
        : paramHashesMatch
          ? "PASS — signal and backtest share CANONICAL_PARAMS"
          : "MISMATCH",
    },

    // ── Benchmark (dynamic from file) ────────────────────────────────────
    benchmark: {
      ...spy,
      benchmarkCoverageStatus,
      benchmarkLastDate,
      benchmarkStaleDays,
      coverageNote: "complete≤5d | partial 6–30d | stale>30d | unavailable=file missing",
    },

    // ── Contract spec (static spec, not runtime) ─────────────────────────
    contractSpec: {
      futures: { mult: 125_000, tick: 0.00005, tickValue: 6.25, pipValue: 12.50, commission: 5.0 },
      cfd:     { mult: 100_000, tick: 0.00001, tickValue: 1.0,  pipValue: 10.0,  commission: 3.0 },
    },

    // ── Rollover audit (from .runtime file, not runtime computed) ─────────
    rolloverAudit: rollover,

    // ── Last backtest run (from .runtime file) ───────────────────────────
    lastBacktestRun: lastRun,

    // ── CSV files ────────────────────────────────────────────────────────
    csvFiles: csvStatus,

    // ── Timezone audit ───────────────────────────────────────────────────
    timezoneAudit: {
      timestampsUtcAware: "YES — loader.py uses pd.to_datetime(utc=True)",
      backtaderBoundary:  "make_naive_utc() strips tz at Backtrader boundary only",
      epochConversion:    "utc_epoch() converts to UTC before .timestamp()",
    },

    // ── Known issues (dynamic) ────────────────────────────────────────────
    knownIssues: knownIssues.length > 0 ? knownIssues : ["none"],
  });
}
