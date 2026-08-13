import { getFSPortfolioSnapshot } from "@/lib/fsportfolio/backtest";
import { getCapalifeData } from "@/lib/capitalife-data";
import { getTradesData } from "@/lib/load-trades";
import { computeDashboardKpis, type SerializedTrade } from "@/lib/trades-analytics";
import type { ParsedReportTrade, ParsedBalanceRow } from "@/lib/mt-report-parser";
import { loadDashboardSnapshotAsync } from "@/lib/brain/dashboard-snapshot-loader";
import type { UniversalKpiStrings } from "@/components/dashboard/universal-kpi-strip";
import { buildTrackRecordOverview } from "@/lib/track-record/service";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

// ── Account view types ────────────────────────────────────────────────────────

export type AccountViewId = "account_a" | "account_b" | "combined";

export type AccountViewData = {
  id: AccountViewId;
  label: string;
  broker: string;
  platform: string;
  currency: string;
  tradeEventSeries: TradeEventPoint[];
  totalReturn24m: string | null;
  maxDrawdown: string | null;
  annualizedReturn: string | null;
  calmar: string | null;
  sharpe: string | null;
  volatility: string | null;
  profitFactor: string | null;
  positiveMonths: string | null;
  portfolioTotalTrades: number;
  portfolioStartDate: string | null;
  portfolioEndDate: string | null;
  assetsUnderManagementEur: number | null;
  methodologyLabel: string;
};

interface PortfolioSnapshotSummary {
  totalReturn: number | null;
  annualizedReturn: number | null;
  maxDrawdown: number | null;
  volatility: number | null;
  sharpe: number | null;
  calmar: number | null;
  positiveMonths: number | null;
  totalMonths: number | null;
  profitFactor: number | null;
  startDateUtc: string | null;
  endDateUtc: string | null;
  totalTrades: number;
  assetsUnderManagementEur: number | null;
}

interface PortfolioSnapshotCoverage {
  status: string;
  startDateUtc: string;
  endDateUtc: string;
  note: string;
}

interface PortfolioSnapshot {
  totalReturn: number;
  startDate: string;
  endDate: string;
  summary?: PortfolioSnapshotSummary;
  coverage?: PortfolioSnapshotCoverage;
  diagnostics: { totalTrades: number };
  dailyPoints?: Array<{ dateUtc: string; cumulativeReturn?: number; portfolioIndex?: number; portfolioDailyReturn?: number | null }>;
}

export interface TradeEventPoint {
  sequence: number;
  tradeId: string;
  accountId: string;
  closeTimeUtc: string;
  closeTimeEpoch: number;
  symbol: string;
  side: "buy" | "sell";
  netProfitLocal: number;
  accountCurrency: string;
  portfolioCapitalBeforeEur: number;
  tradeReturnOnPortfolio: number;
  cumulativeIndex: number;
  cumulativeReturn: number;
  source: string;
}

interface TradeEventFile {
  series: TradeEventPoint[];
  finalReturn: number;
  pointCount: number;
  firstTradeCloseUtc: string | null;
  lastTradeCloseUtc: string | null;
}

function loadPortfolioSnapshot(): PortfolioSnapshot | null {
  try {
    const path = resolve(process.cwd(), ".runtime", "track-record", "portfolio.json");
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf-8")) as PortfolioSnapshot;
  } catch {
    return null;
  }
}

function loadTradeEventSeries(): TradeEventFile | null {
  try {
    const path = resolve(process.cwd(), ".runtime", "track-record", "trade-event-series.json");
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf-8")) as TradeEventFile;
  } catch {
    return null;
  }
}

// Combined additive track record (primary return source)

interface AccountCumulativePointRaw {
  sequence: number;
  tradeId: string;
  closeTimeEpoch: number;
  closeTimeUtc: string;
  symbol: string;
  side: "buy" | "sell";
  netProfit: number;
  currency: string;
  accountCumulativeReturn: number;
}

interface AccountSeriesRaw {
  accountId: string;
  currency: string;
  finalCumulativeReturn: number;
  tradeCount: number;
  points: AccountCumulativePointRaw[];
}

interface CombinedTrackRecordFile {
  summary: {
    combinedCumulativeTrackRecordReturn: number;
    account1CumulativeReturn: number;
    account2CumulativeReturn: number;
    annualizedReturn: number | null;
    maxDrawdown: number | null;
    volatility: number | null;
    sharpe: number | null;
    calmar: number | null;
    positiveMonths: number | null;
    totalMonths: number | null;
    profitFactor: number | null;
    startDateUtc: string;
    endDateUtc: string;
    totalTrades: number;
    account1Trades: number;
    account2Trades: number;
    assetsUnderManagementEur: number | null;
    inceptionStartUtc: string;
  };
  combinedSeries: Array<{
    sequence: number;
    tradeId: string;
    accountId: string;
    closeTimeEpoch: number;
    closeTimeUtc: string;
    symbol: string;
    side: "buy" | "sell";
    combinedCumulativeReturn: number;
    account1CumulativeReturn: number;
    account2CumulativeReturn: number;
    source: string;
  }>;
  account1Series?: AccountSeriesRaw;
  account2Series?: AccountSeriesRaw;
}

// ── Per-account view computation ─────────────────────────────────────────────

function computeAccountView(
  series: AccountSeriesRaw,
  id: AccountViewId,
  label: string,
  broker: string,
  platform: string,
  aumEur: number | null,
): AccountViewData {
  const points = series.points;
  const sign = (n: number) => n >= 0 ? "+" : "";
  const fmtPct = (n: number, digits = 2) => `${sign(n)}${n.toFixed(digits)}%`;

  if (points.length === 0) {
    return {
      id, label, broker, platform, currency: series.currency,
      tradeEventSeries: [],
      totalReturn24m: null, maxDrawdown: null, annualizedReturn: null,
      calmar: null, sharpe: null, volatility: null, profitFactor: null,
      positiveMonths: null, portfolioTotalTrades: 0,
      portfolioStartDate: null, portfolioEndDate: null,
      assetsUnderManagementEur: aumEur,
      methodologyLabel: `${broker} · ${platform} · ${series.currency} · 0 Trades · Net after recorded trading costs`,
    };
  }

  const totalReturn = series.finalCumulativeReturn;
  const startDate = points[0].closeTimeUtc.slice(0, 10);
  const endDate = points[points.length - 1].closeTimeUtc.slice(0, 10);

  const elapsedDays =
    (new Date(endDate + "T00:00:00Z").getTime() - new Date(startDate + "T00:00:00Z").getTime()) / 86400000;

  const annualizedReturn =
    elapsedDays > 30 ? Math.pow(1 + totalReturn, 365.2425 / elapsedDays) - 1 : null;

  // Max drawdown (peak-to-trough in cumulative return)
  let peak = -Infinity;
  let maxDD = 0;
  for (const p of points) {
    if (p.accountCumulativeReturn > peak) peak = p.accountCumulativeReturn;
    const dd = p.accountCumulativeReturn - peak;
    if (dd < maxDD) maxDD = dd;
  }

  const calmar =
    annualizedReturn !== null && maxDD !== 0 ? annualizedReturn / Math.abs(maxDD) : null;

  // Profit factor from trade netProfit values
  const grossProfit = points
    .filter((p) => p.netProfit > 0)
    .reduce((s, p) => s + p.netProfit, 0);
  const grossLoss = Math.abs(
    points.filter((p) => p.netProfit < 0).reduce((s, p) => s + p.netProfit, 0),
  );
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : null;

  // Positive months — last cumReturn per month, compute month-over-month change
  const monthLastReturn: Record<string, number> = {};
  for (const p of points) {
    monthLastReturn[p.closeTimeUtc.slice(0, 7)] = p.accountCumulativeReturn;
  }
  const sortedMonths = Object.keys(monthLastReturn).sort();
  let prevEnd = 0;
  let positiveMonths = 0;
  for (const month of sortedMonths) {
    const end = monthLastReturn[month];
    if (end - prevEnd > 0) positiveMonths++;
    prevEnd = end;
  }
  const totalMonths = sortedMonths.length;

  // Chart series (mapped to TradeEventPoint format)
  const tradeEventSeries: TradeEventPoint[] = points.map((p) => ({
    sequence: p.sequence,
    tradeId: p.tradeId,
    accountId: series.accountId,
    closeTimeUtc: p.closeTimeUtc,
    closeTimeEpoch: p.closeTimeEpoch,
    symbol: p.symbol,
    side: p.side,
    netProfitLocal: p.netProfit,
    accountCurrency: series.currency,
    portfolioCapitalBeforeEur: 0,
    tradeReturnOnPortfolio: 0,
    cumulativeIndex: 100 * (1 + p.accountCumulativeReturn),
    cumulativeReturn: p.accountCumulativeReturn,
    source: "",
  }));

  return {
    id, label, broker, platform, currency: series.currency,
    tradeEventSeries,
    totalReturn24m: fmtPct(totalReturn * 100),
    maxDrawdown: maxDD !== 0 ? fmtPct(maxDD * 100) : null,
    annualizedReturn: annualizedReturn !== null ? fmtPct(annualizedReturn * 100, 1) : null,
    calmar: calmar !== null ? calmar.toFixed(1) : null,
    sharpe: null,    // requires daily series — not available per-account
    volatility: null, // requires daily series — not available per-account
    profitFactor: profitFactor !== null ? profitFactor.toFixed(2) : null,
    positiveMonths: totalMonths > 0 ? `${positiveMonths}/${totalMonths}` : null,
    portfolioTotalTrades: series.tradeCount,
    portfolioStartDate: startDate,
    portfolioEndDate: endDate,
    assetsUnderManagementEur: aumEur,
    methodologyLabel: `${broker} · ${platform} · ${series.currency} · ${series.tradeCount} Trades · Net after recorded trading costs`,
  };
}

function loadCombinedTrackRecord(): CombinedTrackRecordFile | null {
  try {
    const path = resolve(
      process.cwd(), ".runtime", "track-record", "combined-track-record.json"
    );
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf-8")) as CombinedTrackRecordFile;
  } catch {
    return null;
  }
}

/** Read the earliest cashflow UTC date for inception (first capital deployment). */
function loadInceptionDateUtc(): string | null {
  try {
    const path = resolve(process.cwd(), ".runtime", "track-record", "full-cashflow-ledger.json");
    if (!existsSync(path)) return null;
    const data = JSON.parse(readFileSync(path, "utf-8")) as {
      cashFlows: Array<{ timeUtc: string }>;
    };
    if (!Array.isArray(data.cashFlows) || data.cashFlows.length === 0) return null;
    const sorted = [...data.cashFlows].sort((a, b) => a.timeUtc.localeCompare(b.timeUtc));
    return sorted[0].timeUtc.slice(0, 10); // "2024-04-11"
  } catch {
    return null;
  }
}

const EMPTY_TRADES = {
  rows: [] as Parameters<typeof computeDashboardKpis>[0],
  serialized: [] as SerializedTrade[],
  reportTrades: [] as ParsedReportTrade[],
  balanceRows: [] as ParsedBalanceRow[],
};

export async function getDashboardPageData() {
  const [tradesResult, snap, trackRecordOverview] = await Promise.all([
    getTradesData().catch(() => EMPTY_TRADES),
    loadDashboardSnapshotAsync().catch(() => null),
    buildTrackRecordOverview().catch(() => null),
  ]);

  const portfolioSnapshot    = loadPortfolioSnapshot();
  const tradeEventFile       = loadTradeEventSeries();
  const combinedTrackRecord  = loadCombinedTrackRecord();
  const inceptionDateUtc     = loadInceptionDateUtc();
const { rows, serialized, reportTrades, balanceRows } = tradesResult;
  const fsportfolio = await getFSPortfolioSnapshot().catch(() => undefined);
  const portfolioKpisBaseline = computeDashboardKpis(rows);

  const kpis = portfolioKpisBaseline;
  const sign = (n: number) => (n >= 0 ? "+" : "");
  const fmtPct = (n: number, digits = 2) => `${sign(n)}${n.toFixed(digits)}%`;
  const sk = snap?._track_kpis;

  // Primary KPI source: combined-track-record.json (additive multi-account return).
  // Fallback to portfolio.json for any field not yet in the combined file.
  // No hardcoded percentage values. Null means data not yet available.
  const ctr = combinedTrackRecord?.summary;
  const ps  = portfolioSnapshot?.summary;

  // Primary return: additive combined (account1CumulativeReturn + account2CumulativeReturn)
  const totalReturnStr = ctr?.combinedCumulativeTrackRecordReturn != null
    ? fmtPct(ctr.combinedCumulativeTrackRecordReturn * 100)
    : (ps?.totalReturn != null ? fmtPct(ps.totalReturn * 100) : null);

  const maxDrawdownStr = ctr?.maxDrawdown != null
    ? fmtPct(ctr.maxDrawdown * 100)
    : (ps?.maxDrawdown != null
        ? fmtPct(ps.maxDrawdown * 100)
        : (rows.length ? `-${kpis.maxDrawdownPct.toFixed(2)}%` : (sk?.maxDrawdown ?? null)));

  const annualizedReturnStr = ctr?.annualizedReturn != null
    ? fmtPct(ctr.annualizedReturn * 100, 1)
    : (ps?.annualizedReturn != null ? fmtPct(ps.annualizedReturn * 100, 1) : null);

  const volatilityStr = ctr?.volatility != null
    ? fmtPct(ctr.volatility * 100, 1)
    : (ps?.volatility != null ? fmtPct(ps.volatility * 100, 1) : null);

  const sharpeStr = ctr?.sharpe != null
    ? ctr.sharpe.toFixed(2)
    : (ps?.sharpe != null ? ps.sharpe.toFixed(2) : null);

  const calmarStr = ctr?.calmar != null
    ? ctr.calmar.toFixed(2)
    : (ps?.calmar != null ? ps.calmar.toFixed(2) : null);

  const positiveMonthsStr =
    ctr?.positiveMonths != null && ctr?.totalMonths != null
      ? `${ctr.positiveMonths}/${ctr.totalMonths}`
      : (ps?.positiveMonths != null && ps?.totalMonths != null
          ? `${ps.positiveMonths}/${ps.totalMonths}`
          : null);

  const profitFactorStr = ctr?.profitFactor != null
    ? ctr.profitFactor.toFixed(2)
    : (ps?.profitFactor != null ? ps.profitFactor.toFixed(2) : null);

  const coverageStatus = portfolioSnapshot?.coverage?.status ?? null;
  const coverageNote = portfolioSnapshot?.coverage?.note ?? null;

  // inceptionDateUtc: first cashflow (capital deployment). firstTradeDateUtc: first trade close.
  const firstTradeDateUtc = ctr?.startDateUtc ?? ps?.startDateUtc ?? portfolioSnapshot?.startDate ?? null;
  const startDateUtc = inceptionDateUtc ?? firstTradeDateUtc;
  const endDateUtc = ctr?.endDateUtc ?? ps?.endDateUtc ?? portfolioSnapshot?.endDate ?? null;

  // AUM: raw number from combined-track-record, formatted for display. null stays null (never 0).
  const aumEur: number | null = ctr?.assetsUnderManagementEur ?? ps?.assetsUnderManagementEur ?? null;
  const aumDisplay = aumEur !== null
    ? `EUR ${Math.round(aumEur).toLocaleString("de-DE")}`
    : "EUR —";

  // Pass actual daily series for the chart (cumulativeReturn per point).
  const performanceSeries = portfolioSnapshot?.dailyPoints ?? [];

  // Primary chart series: combined additive track record (one point per closed trade).
  // Map combinedCumulativeReturn → cumulativeReturn for chart compatibility.
  const combinedChartSeries: TradeEventPoint[] =
    combinedTrackRecord?.combinedSeries.map((p) => ({
      sequence: p.sequence,
      tradeId: p.tradeId,
      accountId: p.accountId,
      closeTimeUtc: p.closeTimeUtc,
      closeTimeEpoch: p.closeTimeEpoch,
      symbol: p.symbol,
      side: p.side,
      netProfitLocal: 0, // not needed for chart rendering
      accountCurrency: "",
      portfolioCapitalBeforeEur: 0,
      tradeReturnOnPortfolio: 0,
      cumulativeIndex: 100 * (1 + p.combinedCumulativeReturn),
      cumulativeReturn: p.combinedCumulativeReturn,
      source: p.source,
    })) ?? [];

  // Fallback to legacy trade-event series if combined is not yet built
  const tradeEventSeries: TradeEventPoint[] =
    combinedChartSeries.length > 0
      ? combinedChartSeries
      : (tradeEventFile?.series ?? []);

  const universal: UniversalKpiStrings = {
    riskAdjustedAum: aumDisplay,
    marketVolume: "EUR 0",
    totalReturn24m: totalReturnStr,
    maxDrawdown: maxDrawdownStr,
    annualizedReturn: annualizedReturnStr,
    volatility: volatilityStr,
    sharpe: sharpeStr,
    calmar: calmarStr,
    positiveMonths: positiveMonthsStr,
    profitFactor: profitFactorStr,
    portfolioTotalTrades: ctr?.totalTrades ?? ps?.totalTrades ?? portfolioSnapshot?.diagnostics.totalTrades,
    portfolioStartDate: startDateUtc,
    portfolioEndDate: endDateUtc,
    coverageStatus,
    coverageNote,
    performanceSeries,
    tradeEventSeries: tradeEventSeries.length > 0 ? tradeEventSeries : undefined,
    // AUM raw number (for testid assertions — never coerced to 0)
    assetsUnderManagementEur: aumEur,
    // Separate dates: inception (first cashflow) vs first trade close
    inceptionDateUtc: inceptionDateUtc,
    firstTradeDateUtc: firstTradeDateUtc,
  };

  const capalifeData = getCapalifeData();

  // ── Per-account views ──────────────────────────────────────────────────────
  // Build Account A and Account B view data from the per-account series in
  // combined-track-record.json. Combined view re-uses the already-built universal.
  const accountViews: AccountViewData[] = [];

  if (combinedTrackRecord?.account1Series && combinedTrackRecord.account1Series.points.length > 0) {
    accountViews.push(
      computeAccountView(
        combinedTrackRecord.account1Series,
        "account_a",
        "Account A",
        "RoboForex",
        "MT4",
        null, // per-account AUM not separately tracked
      ),
    );
  }

  if (combinedTrackRecord?.account2Series && combinedTrackRecord.account2Series.points.length > 0) {
    accountViews.push(
      computeAccountView(
        combinedTrackRecord.account2Series,
        "account_b",
        "Account B",
        "Vantage",
        "MT5",
        null, // per-account AUM not separately tracked
      ),
    );
  }

  // Combined view entry (KPIs already in universal, series already in tradeEventSeries)
  const combinedMethodologyLabel =
    `RoboForex + Vantage · Additive cumulative return · ${ctr?.totalTrades ?? 0} Trades · Net after recorded trading costs`;
  accountViews.push({
    id: "combined",
    label: "Combined",
    broker: "RoboForex + Vantage",
    platform: "MT4 + MT5",
    currency: "EUR",
    tradeEventSeries: tradeEventSeries.length > 0 ? tradeEventSeries : [],
    totalReturn24m: totalReturnStr,
    maxDrawdown: maxDrawdownStr,
    annualizedReturn: annualizedReturnStr,
    calmar: calmarStr,
    sharpe: sharpeStr,
    volatility: volatilityStr,
    profitFactor: profitFactorStr,
    positiveMonths: positiveMonthsStr,
    portfolioTotalTrades: ctr?.totalTrades ?? ps?.totalTrades ?? portfolioSnapshot?.diagnostics.totalTrades ?? 0,
    portfolioStartDate: startDateUtc,
    portfolioEndDate: endDateUtc,
    assetsUnderManagementEur: aumEur,
    methodologyLabel: combinedMethodologyLabel,
  });

  return {
    serialized,
    reportTrades,
    balanceRows,
    portfolioKpisBaseline,
    universal,
    fsportfolio,
    capalifeData,
    trackRecordOverview,
    accountViews,
  };
}
