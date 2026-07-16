import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

/**
 * GET /api/monitoring/intraday-strategy-outputs
 *
 * Returns per-symbol output availability for all 4 intraday assets.
 * Priority:
 *   1. workspace/monitoring_strategy_infrastructure/intraday/<SYM>/dashboard_outputs/  (Codex Run 3)
 *   2. workspace/output/monitoring/wave1_strategy_outputs/intraday/<sym>/              (wave1 fallback)
 *
 * Status per Codex Run 3:
 *   READY:  DAX_1H
 *   WEAK:   DAX_2H, GBPUSD_30M, EURUSD_30M  (OOS/WF not robust, live_ready=false)
 *
 * Never aggregates or invents data.
 */

const INTRADAY_SYMBOLS = ["DAX_1H","DAX_2H","GBPUSD_30M","EURUSD_30M"] as const;
const WEAK_SYMBOLS = new Set(["DAX_2H","GBPUSD_30M","EURUSD_30M"]);

const CWD = process.cwd(); // .../frontend

function infraDir(sym: string) {
  return path.join(CWD, "..", "workspace", "monitoring_strategy_infrastructure", "intraday", sym);
}

function wave1Dir(sym: string) {
  return path.join(CWD, "..", "workspace", "output", "monitoring", "wave1_strategy_outputs", "intraday", sym.toLowerCase());
}

function tryReadJson(filePath: string): Record<string, unknown> | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function fileExists(filePath: string): boolean {
  try { return fs.existsSync(filePath); } catch { return false; }
}

function resolveSymbol(sym: string) {
  const infraBase = path.join(infraDir(sym), "dashboard_outputs");
  const wave1Base = wave1Dir(sym);

  const codexStatus = tryReadJson(path.join(infraBase, "strategy_status.json"));
  const wave1Signal = tryReadJson(path.join(wave1Base, "signal_summary.json"));
  const wave1Strategy = tryReadJson(path.join(wave1Base, "strategy_output.json"));

  const isCodexReady = codexStatus !== null
    && codexStatus["source"] !== "wave1_placeholder_pending_codex_run3";

  // Codex file availability
  const equityCsvCodex  = fileExists(path.join(infraBase, "equity_curve.csv"));
  const drawdownCsvCodex = fileExists(path.join(infraBase, "drawdown.csv"));
  const tradesCsvCodex  = fileExists(path.join(infraDir(sym), "trade_history", "trades.csv"));
  const wfCsvCodex      = fileExists(path.join(infraDir(sym), "walkforward", "walkforward_summary.csv"));
  const oosCsvCodex     = fileExists(path.join(infraDir(sym), "oos", "oos_summary.csv"));
  const liveSnapCodex   = fileExists(path.join(infraDir(sym), "live_snapshot", "live_snapshot.json"));
  const signalStateCodex = fileExists(path.join(infraDir(sym), "live_snapshot", "signal_state.json"));

  // Wave1 availability flags
  const equityWave1  = fileExists(path.join(wave1Base, "equity_curve.json"));
  const tradesWave1  = fileExists(path.join(wave1Base, "trades.json"));
  const signalWave1  = wave1Signal !== null;

  const signalStatus = isCodexReady
    ? (codexStatus?.["signal_status"] as string | undefined) ?? "unknown"
    : (wave1Signal?.["signal_status"] as string | undefined) ?? "unknown";

  const lastPrice = isCodexReady
    ? (codexStatus?.["last_price"] as number | undefined) ?? null
    : (wave1Signal?.["last_price"] as number | undefined) ?? null;

  const lastBarTime = isCodexReady
    ? (codexStatus?.["last_bar_time"] as string | undefined) ?? null
    : (wave1Signal?.["last_bar_time"] as string | undefined) ?? null;

  const isWeak = WEAK_SYMBOLS.has(sym);
  const status = isWeak ? "WEAK" : "READY";

  // Codex sets live_ready explicitly for intraday; agrar inferred from statusReasons
  const statusReasons = isCodexReady
    ? ((codexStatus?.["statusReasons"] as string[] | undefined) ?? [])
    : [];
  const liveReady = isCodexReady
    ? Boolean(codexStatus?.["live_ready"] ?? !isWeak)
    : !isWeak;

  const excludedFromPortfolio = isWeak;

  return {
    id: sym,
    group: "intraday",
    status,
    weakNonBlocking: isWeak,
    liveReady,
    excludedFromPortfolio,
    statusReasons,
    wave1Ready: true,
    activeSource: isCodexReady ? "codex_run3" : "wave1_fallback",
    signalStatus,
    lastPrice,
    lastBarTime,
    availability: {
      strategyStatus: {
        codex: codexStatus !== null,
        wave1: wave1Strategy !== null,
      },
      equityCurve: {
        codex: equityCsvCodex,
        wave1: equityWave1,
        available: equityCsvCodex || equityWave1,
        note: equityCsvCodex ? "codex_run3" : equityWave1 ? "wave1_fallback" : "No equity curve",
      },
      drawdown: {
        codex: drawdownCsvCodex,
        available: drawdownCsvCodex,
        note: drawdownCsvCodex ? "codex_run3" : "No drawdown data",
      },
      trades: {
        codex: tradesCsvCodex,
        wave1: tradesWave1,
        available: tradesCsvCodex || tradesWave1,
        note: tradesCsvCodex ? "codex_run3" : tradesWave1 ? "wave1_trades" : "No trade history",
      },
      walkforward: {
        codex: wfCsvCodex,
        available: wfCsvCodex,
        note: wfCsvCodex ? "codex_run3" : "WF/OOS missing",
      },
      oos: {
        codex: oosCsvCodex,
        available: oosCsvCodex,
        note: oosCsvCodex ? "codex_run3" : "WF/OOS missing",
      },
      liveSnapshot: {
        codex: liveSnapCodex,
        available: liveSnapCodex,
        note: liveSnapCodex ? "codex_run3" : "No live snapshot",
      },
      signalState: {
        codex: signalStateCodex,
        wave1: signalWave1,
        available: signalStateCodex || signalWave1,
        note: signalStateCodex ? "codex_run3" : signalWave1 ? "wave1_signal" : "No signal state",
      },
    },
    // WEAK assets excluded from portfolio aggregation
    canAggregateEquity: !isWeak && equityCsvCodex,
    canAggregateTrades: !isWeak && tradesCsvCodex,
    notes: isCodexReady
      ? isWeak
        ? "WEAK — Codex Run 3 outputs present but excluded from portfolio/live"
        : "Codex Run 3 outputs present"
      : "Awaiting Codex Run 3 — wave1 as interim",
  };
}

export async function GET() {
  const symbols = INTRADAY_SYMBOLS.map(resolveSymbol);

  const readyCount   = symbols.filter((s) => s.status === "READY").length;
  const weakCount    = symbols.filter((s) => s.status === "WEAK").length;
  const codexCount   = symbols.filter((s) => s.activeSource === "codex_run3").length;

  return NextResponse.json({
    group: "intraday",
    symbolCount: symbols.length,
    readyCount,
    weakCount,
    codexOutputsPresent: codexCount,
    wave1FallbackActive: codexCount < symbols.length,
    canBuildPortfolioEquity: symbols.filter((s) => !s.excludedFromPortfolio && s.canAggregateEquity).length > 0,
    portfolioReadyCount:   symbols.filter((s) => !s.excludedFromPortfolio && s.status === "READY").length,
    portfolioExcludedCount: symbols.filter((s) => s.excludedFromPortfolio).length,
    checkedAt: new Date().toISOString(),
    symbols,
  });
}
