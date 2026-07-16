import { NextRequest, NextResponse } from "next/server";
import type { MonitoringStrategyRunResponse, MonitoringStrategyTestResult } from "@/lib/monitoring/strategyTester/types";

export const runtime = "nodejs";

// ─── Adapter registry ─────────────────────────────────────────────────────────

type InvestAdapterMeta = {
  symbol: string;
  displayName: string;
  instrument: string;
  strategyName: string;
  eventsUrl?: string;
  csvUrl?: string;
  csvSource?: string;
};

const INVEST_ADAPTERS: Record<string, InvestAdapterMeta> = {
  QQQ_PINE_1: {
    symbol: "QQQ_PINE_1",
    displayName: "QQQ Pine 1",
    instrument: "QQQ",
    strategyName: "Pine 1",
    eventsUrl: "/generated/monitoring/strategies/BATS_QQQ_pine1_events.json",
  },
  QQQ_PINE_2_EMA: {
    symbol: "QQQ_PINE_2_EMA",
    displayName: "QQQ Pine 2 EMA",
    instrument: "QQQ",
    strategyName: "Pine 2 EMA",
    eventsUrl: "/generated/monitoring/strategies/BATS_QQQ_pine2_events.json",
  },
  COPPER_HG: {
    symbol: "COPPER_HG",
    displayName: "Copper / HG",
    instrument: "HG1!",
    strategyName: "Valuation / EMA",
    eventsUrl: "/generated/monitoring/strategies/COMEX_HG1_events.json",
  },
  CHF_6S: {
    symbol: "CHF_6S",
    displayName: "CHF / 6S",
    instrument: "6S1!",
    strategyName: "EMA + Valuation PRO MTF + Regime",
    // Primary source: full TradingView Pine Backtest CSV (491 trades, 2001–2026)
    csvUrl: "/generated/monitoring/strategies/CME_6S1_tv_backtest_2026-04-26.csv",
    csvSource: "EMA_+_Valuation_Strategy_PRO_MTF_+_Regime_CME_6S1!_2026-04-26",
    // Fallback events.json (6 trades, derived subset) kept for reference only
  },
};

// ─── Types ────────────────────────────────────────────────────────────────────

type OhlcBar = { date: string; open: number; high: number; low: number; close: number };

// ─── Events-JSON path (for QQQ/Copper adapters) ───────────────────────────────

type EventTrade = {
  direction?: "long" | "short";
  entryTime?: string;
  exitTime?: string | null;
  entry?: number;
  exit?: number | null;
  sl?: number | null;
  tp?: number | null;
  exitReason?: string | null;
};

type EventPayload = { trades?: EventTrade[] };

function eventsToTradeRows(trades: EventTrade[]): MonitoringStrategyTestResult["trades"] {
  let cumulative = 0;
  return trades
    .filter((t) => t.entryTime && t.exitTime && t.entry != null && t.exit != null)
    .map((t, index) => {
      const entryPrice = Number(t.entry);
      const exitPrice = Number(t.exit);
      const isShort = t.direction === "short";
      const returnPct = entryPrice > 0
        ? ((isShort ? entryPrice - exitPrice : exitPrice - entryPrice) / entryPrice) * 100
        : 0;
      cumulative += returnPct;
      return {
        tradeNo: index + 1,
        direction: isShort ? "SHORT" : "LONG",
        entryDate: String(t.entryTime).slice(0, 10),
        exitDate: String(t.exitTime).slice(0, 10),
        entryPrice,
        exitPrice,
        returnPct: Number(returnPct.toFixed(4)),
        pnlNet: Number(returnPct.toFixed(4)),
        cumulativePnl: Number(cumulative.toFixed(4)),
        cumulativeReturnPct: Number(cumulative.toFixed(4)),
      };
    });
}

// ─── TV CSV path (for CHF_6S) ─────────────────────────────────────────────────

/**
 * Parses TradingView German-locale Pine Strategy export CSV.
 * Each trade = 2 rows: "Long-Einstieg" (entry) + "Long-Ausstieg" (exit).
 * Columns (German): Trade #, Typ, Datum und Uhrzeit, Signal,
 *   Preis USD, Größe (Menge), Größe (Wert), G&V netto USD, G&V netto %,
 *   Positive Exkursion USD, Positive Exkursion %, Negative Exkursion USD,
 *   Negative Exkursion %, Kumulativer G&V USD, Kumulativer G&V %
 */
function parseTvCsv(csvText: string): MonitoringStrategyTestResult["trades"] {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const header = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  const colIdx = (name: string) => header.indexOf(name);

  const idxTradeNo = colIdx("Trade #");
  const idxTyp = colIdx("Typ");
  const idxDatum = colIdx("Datum und Uhrzeit");
  const idxSignal = colIdx("Signal");
  const idxPreis = colIdx("Preis USD");
  const idxPnlPct = colIdx("G&V netto %");
  const idxCumPct = colIdx("Kumulativer G&V %");

  // Group rows by trade number
  const tradeMap = new Map<
    string,
    { entry: string[] | null; exit: string[] | null }
  >();

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    const tradeNo = cols[idxTradeNo];
    const typ = cols[idxTyp];
    if (!tradeNo) continue;
    if (!tradeMap.has(tradeNo)) tradeMap.set(tradeNo, { entry: null, exit: null });
    const rec = tradeMap.get(tradeNo)!;
    if (typ === "Long-Einstieg") rec.entry = cols;
    else if (typ === "Long-Ausstieg") rec.exit = cols;
  }

  const result: MonitoringStrategyTestResult["trades"] = [];
  let tradeNo = 1;
  for (const [, rec] of tradeMap) {
    const { entry, exit } = rec;
    if (!entry || !exit) continue;

    const entryDate = String(entry[idxDatum] ?? "").slice(0, 10);
    const exitDate = String(exit[idxDatum] ?? "").slice(0, 10);
    const signal = String(exit[idxSignal] ?? "");
    const isOpen = signal === "Offen";

    // Skip open trades (no exit yet) from closed-trade metrics
    if (isOpen) continue;

    const entryPrice = parseFloat(entry[idxPreis] ?? "0") || 0;
    const exitPrice = parseFloat(exit[idxPreis] ?? "0") || 0;
    const returnPct = parseFloat(exit[idxPnlPct] ?? "0") || 0;
    const cumulativeReturnPct = parseFloat(exit[idxCumPct] ?? "0") || 0;

    result.push({
      tradeNo: tradeNo++,
      direction: "LONG",
      entryDate,
      exitDate,
      entryPrice,
      exitPrice,
      returnPct: Number(returnPct.toFixed(4)),
      pnlNet: Number(returnPct.toFixed(4)),
      cumulativePnl: Number(cumulativeReturnPct.toFixed(4)),
      cumulativeReturnPct: Number(cumulativeReturnPct.toFixed(4)),
    });
  }

  return result;
}

// ─── Shared metrics + equity ──────────────────────────────────────────────────

function buildEquityCurve(
  trades: MonitoringStrategyTestResult["trades"]
): MonitoringStrategyTestResult["equityCurve"] {
  return trades.map((t) => ({ date: t.exitDate, cumulativeReturnPct: t.cumulativeReturnPct }));
}

function computeMetrics(
  trades: MonitoringStrategyTestResult["trades"],
  bars: OhlcBar[]
): MonitoringStrategyTestResult["metrics"] {
  const returns = trades.map((t) => t.returnPct);
  const wins = returns.filter((v) => v > 0).length;
  const losses = returns.filter((v) => v < 0).length;
  const totalTrades = trades.length;
  const netReturnPct = trades.at(-1)?.cumulativeReturnPct ?? 0;
  const grossWins = returns.filter((v) => v > 0).reduce((s, v) => s + v, 0);
  const grossLossesAbs = Math.abs(returns.filter((v) => v < 0).reduce((s, v) => s + v, 0));
  let peak = 0; let maxDrawdownPct = 0;
  for (const t of trades) {
    peak = Math.max(peak, t.cumulativeReturnPct);
    maxDrawdownPct = Math.min(maxDrawdownPct, t.cumulativeReturnPct - peak);
  }
  const firstDate = bars[0]?.date ?? trades[0]?.entryDate ?? null;
  const lastDate = bars.at(-1)?.date ?? trades.at(-1)?.exitDate ?? null;
  let cagr: number | null = null;
  if (firstDate && lastDate) {
    const years = (Date.parse(`${lastDate}T00:00:00Z`) - Date.parse(`${firstDate}T00:00:00Z`)) / (365.25 * 86400000);
    if (years > 0) cagr = (Math.pow(1 + netReturnPct / 100, 1 / years) - 1) * 100;
  }
  return {
    totalTrades,
    longTrades: totalTrades,
    shortTrades: 0,
    wins,
    losses,
    breakEven: returns.filter((v) => v === 0).length,
    winratePct: totalTrades ? (wins / totalTrades) * 100 : 0,
    netReturnPct: Number(netReturnPct.toFixed(4)),
    profitFactor: grossLossesAbs > 0 ? Number((grossWins / grossLossesAbs).toFixed(4)) : grossWins > 0 ? 999 : 0,
    maxDrawdownPct: Number(Math.abs(maxDrawdownPct).toFixed(4)),
    avgReturnPct: Number((totalTrades ? returns.reduce((s, v) => s + v, 0) / totalTrades : 0).toFixed(4)),
    bestTradePct: totalTrades ? Math.max(...returns) : 0,
    worstTradePct: totalTrades ? Math.min(...returns) : 0,
    avgWinPct: wins ? grossWins / wins : 0,
    avgLossPct: losses ? -grossLossesAbs / losses : 0,
    sharpeRatio: null,
    sortinoRatio: null,
    cagr,
    initialCapital: 10000,
  };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const selected = String(request.nextUrl.searchParams.get("symbol") ?? "QQQ_PINE_1").trim().toUpperCase();
  const adapter = INVEST_ADAPTERS[selected];
  if (!adapter) {
    return NextResponse.json({
      runId: `invest-${Date.now()}`,
      symbol: selected,
      strategyKind: "invest",
      status: "blocked",
      blocker: `Unknown invest strategy: ${selected}`,
    } satisfies MonitoringStrategyRunResponse, { status: 400 });
  }

  const origin = request.nextUrl.origin;

  // ── CHF_6S: parse TV CSV (491 trades) ────────────────────────────────────
  if (adapter.csvUrl) {
    const [csvResponse, ohlcResponse] = await Promise.all([
      fetch(new URL(adapter.csvUrl, origin), { cache: "no-store" }),
      fetch(new URL(`/api/core-invest/ohlc?symbol=${encodeURIComponent(adapter.instrument)}`, origin), { cache: "no-store" }),
    ]);

    if (!csvResponse.ok) {
      return NextResponse.json({
        runId: `invest-${Date.now()}`,
        symbol: adapter.symbol,
        strategyKind: "invest",
        status: "blocked",
        blocker: `CHF/6S TV CSV source not readable: HTTP ${csvResponse.status}. Source: ${adapter.csvUrl}`,
      } satisfies MonitoringStrategyRunResponse, { status: 502 });
    }

    const csvText = await csvResponse.text();
    const trades = parseTvCsv(csvText);

    if (trades.length === 0) {
      return NextResponse.json({
        runId: `invest-${Date.now()}`,
        symbol: adapter.symbol,
        strategyKind: "invest",
        status: "blocked",
        blocker: "CHF/6S TV CSV parsed 0 closed trades. Check source file format.",
      } satisfies MonitoringStrategyRunResponse, { status: 502 });
    }

    const ohlcJson = (await ohlcResponse.json()) as { bars?: OhlcBar[] };
    const bars = Array.isArray(ohlcJson.bars) ? ohlcJson.bars : [];

    const result: MonitoringStrategyTestResult = {
      symbol: adapter.symbol,
      strategyKind: "invest",
      runMode: "trade_export_replay",
      metrics: computeMetrics(trades, bars),
      trades,
      equityCurve: buildEquityCurve(trades),
      cacheIdentity: {
        symbol: adapter.symbol,
        strategyKind: "invest",
        inputsHash: "tv_csv_chf_6s",
        historicalCsvFingerprint: adapter.csvUrl,
        strategyCsvFingerprint: adapter.csvSource ?? adapter.csvUrl,
        engineVersionHash: "tv_csv_parser_v1",
        executionProfileVersion: "tv_csv_parser_v1",
        quantValidationMode: "tv_csv_backtest_replay",
        generatedAt: new Date().toISOString(),
        inputMode: "missing_xlsx_metric_only",
        parityBasis: "tradingview_export_metrics_only",
      },
      parityStatus: "PASS_TRADE_EXPORT_PARITY_INPUTS_UNKNOWN",
      inputAvailability: "not_applicable",
      warnings: [
        `Source: TradingView Pine Backtest CSV — EMA + Valuation Strategy PRO MTF + Regime (CME:6S1!, Daily, 2001–2026-04).`,
        `Parsed ${trades.length} closed trades from CSV. Open trade excluded from metrics.`,
        `Live engine: missing (engineMode=csv_source). Parity validation: pending.`,
        `No live execution. Research/validation status only.`,
      ],
    };

    return NextResponse.json({
      runId: `invest-${Date.now()}`,
      symbol: adapter.symbol,
      strategyKind: "invest",
      status: "passed",
      result,
      selectedSymbols: [adapter.symbol],
      focusedSymbol: adapter.symbol,
      mode: "single",
      portfolioMode: "single",
    } satisfies MonitoringStrategyRunResponse);
  }

  // ── Events-JSON path (QQQ_PINE_1, QQQ_PINE_2_EMA, COPPER_HG) ─────────────
  const [eventsResponse, ohlcResponse] = await Promise.all([
    fetch(new URL(adapter.eventsUrl!, origin), { cache: "no-store" }),
    fetch(new URL(`/api/core-invest/ohlc?symbol=${encodeURIComponent(adapter.instrument)}`, origin), { cache: "no-store" }),
  ]);

  const eventsJson = (await eventsResponse.json()) as EventPayload;
  const ohlcJson = (await ohlcResponse.json()) as { bars?: OhlcBar[] };
  const trades = eventsToTradeRows(Array.isArray(eventsJson.trades) ? eventsJson.trades : []);
  const bars = Array.isArray(ohlcJson.bars) ? ohlcJson.bars : [];

  const result: MonitoringStrategyTestResult = {
    symbol: adapter.symbol,
    strategyKind: "invest",
    runMode: "trade_export_replay",
    metrics: computeMetrics(trades, bars),
    trades,
    equityCurve: buildEquityCurve(trades),
    cacheIdentity: {
      symbol: adapter.symbol,
      strategyKind: "invest",
      inputsHash: "invest_adapter",
      historicalCsvFingerprint: adapter.eventsUrl!,
      strategyCsvFingerprint: adapter.eventsUrl!,
      engineVersionHash: "invest_adapter_v1",
      executionProfileVersion: "invest_adapter_v1",
      quantValidationMode: "trade_export_replay",
      generatedAt: new Date().toISOString(),
      inputMode: "missing_xlsx_metric_only",
      parityBasis: "tradingview_export_metrics_only",
    },
    parityStatus: "PASS_TRADE_EXPORT_PARITY_INPUTS_UNKNOWN",
    inputAvailability: "not_applicable",
    warnings: [`Inputs are adapter-driven for ${adapter.displayName}.`],
  };

  return NextResponse.json({
    runId: `invest-${Date.now()}`,
    symbol: adapter.symbol,
    strategyKind: "invest",
    status: "passed",
    result,
    selectedSymbols: [adapter.symbol],
    focusedSymbol: adapter.symbol,
    mode: "single",
    portfolioMode: "single",
  } satisfies MonitoringStrategyRunResponse);
}
