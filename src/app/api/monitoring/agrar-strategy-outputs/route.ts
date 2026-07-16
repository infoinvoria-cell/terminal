import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

/**
 * GET /api/monitoring/agrar-strategy-outputs
 *
 * Returns per-symbol output availability for all 8 agrar assets.
 * Priority:
 *   1. workspace/monitoring_strategy_infrastructure/agrar/<SYM>/dashboard_outputs/  (Codex Run 3)
 *   2. workspace/output/monitoring/wave1_strategy_outputs/agrar/<sym>/              (wave1 fallback)
 *
 * Never aggregates or invents data.
 * Missing files → flagged with available: false.
 */

const AGRAR_SYMBOLS = ["ZW1","ZC1","ZS1","CC1","KC1","SB1","CT1","OJ1"] as const;
const WEAK_SYMBOLS = new Set(["SB1","CT1"]);

const CWD = process.cwd(); // .../frontend

function infraDir(sym: string) {
  return path.join(CWD, "..", "workspace", "monitoring_strategy_infrastructure", "agrar", sym);
}

function wave1Dir(sym: string) {
  return path.join(CWD, "..", "workspace", "output", "monitoring", "wave1_strategy_outputs", "agrar", sym.toLowerCase());
}

function tryReadJson(filePath: string): object | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
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

  // Check which source provides strategy_status.json
  const codexStatus = tryReadJson(path.join(infraBase, "strategy_status.json")) as Record<string, unknown> | null;
  const wave1Signal = tryReadJson(path.join(wave1Base, "signal_summary.json")) as Record<string, unknown> | null;
  const wave1Strategy = tryReadJson(path.join(wave1Base, "strategy_output.json")) as Record<string, unknown> | null;

  const isCodexReady = codexStatus !== null
    && codexStatus["source"] !== "wave1_placeholder_pending_codex_run3";

  // Codex output availability flags
  const equityCsvCodex = fileExists(path.join(infraBase, "equity_curve.csv"));
  const drawdownCsvCodex = fileExists(path.join(infraBase, "drawdown.csv"));
  const tradesCsvCodex = fileExists(path.join(infraDir(sym), "trade_history", "trades.csv"));
  const wfCsvCodex = fileExists(path.join(infraDir(sym), "walkforward", "walkforward_summary.csv"));
  const oosCsvCodex = fileExists(path.join(infraDir(sym), "oos", "oos_summary.csv"));
  const liveSnapCodex = fileExists(path.join(infraDir(sym), "live_snapshot", "live_snapshot.json"));
  const signalStateCodex = fileExists(path.join(infraDir(sym), "live_snapshot", "signal_state.json"));

  // Wave1 availability flags
  const equityWave1 = fileExists(path.join(wave1Base, "equity_curve.json"));
  const tradesWave1 = fileExists(path.join(wave1Base, "trades.json"));
  const signalWave1 = wave1Signal !== null;

  // Derive effective signal status from whichever source is available
  const signalStatus = isCodexReady
    ? (codexStatus?.["signal_status"] as string | undefined) ?? "unknown"
    : (wave1Signal?.["signal_status"] as string | undefined) ?? "unknown";

  const openPosition = isCodexReady
    ? Boolean(codexStatus?.["open_position"])
    : Boolean(wave1Signal?.["open_position"] ?? false);

  const lastPrice = isCodexReady
    ? (codexStatus?.["last_price"] as number | undefined) ?? null
    : (wave1Signal?.["last_price"] as number | undefined) ?? null;

  const lastBarTime = isCodexReady
    ? (codexStatus?.["last_bar_time"] as string | undefined) ?? null
    : (wave1Signal?.["last_bar_time"] as string | undefined) ?? null;

  const isWeak = WEAK_SYMBOLS.has(sym);
  const status = isWeak ? "WEAK" : "READY";

  // Read statusReasons from Codex to surface live_ready determination
  const statusReasons = isCodexReady
    ? ((codexStatus?.["statusReasons"] as string[] | undefined) ?? [])
    : [];
  const liveReady = isWeak
    ? false  // SB1/CT1 are explicitly not live_ready
    : isCodexReady && !statusReasons.some((r) => r.startsWith("live_ready_false"));

  // WEAK assets are excluded from portfolio equity aggregation
  const excludedFromPortfolio = isWeak;

  return {
    id: sym,
    group: "agrar",
    status,
    weakNonBlocking: isWeak,
    liveReady,
    excludedFromPortfolio,
    statusReasons,
    wave1Ready: true,
    // Which source is active
    activeSource: isCodexReady ? "codex_run3" : "wave1_fallback",
    // Signal info from active source
    signalStatus,
    openPosition,
    lastPrice,
    lastBarTime,
    // File availability per category
    availability: {
      strategyStatus: {
        codex: codexStatus !== null,
        wave1: wave1Strategy !== null,
      },
      equityCurve: {
        codex: equityCsvCodex,
        wave1: equityWave1,
        available: equityCsvCodex || equityWave1,
        note: equityCsvCodex
          ? "codex_run3"
          : equityWave1
          ? "wave1_placeholder_only"
          : "No equity curve",
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
        note: tradesCsvCodex
          ? "codex_run3"
          : tradesWave1
          ? "wave1_trades"
          : "No trade history",
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
        note: signalStateCodex
          ? "codex_run3"
          : signalWave1
          ? "wave1_signal"
          : "No signal state",
      },
    },
    // Aggregation guard — READY + codex data required; WEAK assets excluded
    canAggregateEquity: !isWeak && equityCsvCodex,
    canAggregateTrades: !isWeak && tradesCsvCodex,
    notes: isCodexReady
      ? "Codex Run 3 outputs present"
      : "Awaiting Codex Run 3 — wave1 signal as interim",
  };
}

export async function GET() {
  const symbols = AGRAR_SYMBOLS.map(resolveSymbol);

  const readyCount = symbols.filter((s) => s.status === "READY").length;
  const weakCount = symbols.filter((s) => s.status === "WEAK").length;
  const codexCount = symbols.filter((s) => s.activeSource === "codex_run3").length;

  return NextResponse.json({
    group: "agrar",
    symbolCount: symbols.length,
    readyCount,
    weakCount,
    codexOutputsPresent: codexCount,
    wave1FallbackActive: codexCount < symbols.length,
    // Only READY (non-weak) assets count toward portfolio equity
    canBuildPortfolioEquity: symbols.filter((s) => !s.excludedFromPortfolio && s.canAggregateEquity).length > 0,
    portfolioReadyCount: symbols.filter((s) => !s.excludedFromPortfolio && s.status === "READY").length,
    portfolioExcludedCount: symbols.filter((s) => s.excludedFromPortfolio).length,
    checkedAt: new Date().toISOString(),
    symbols,
  });
}
