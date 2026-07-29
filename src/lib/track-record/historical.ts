import account1Mt4Trades from "@/data/capitalife/account1-mt4-trades.json";
import performanceMonthly from "@/data/capitalife/performance-monthly.json";
import whiteSwanOfficialKpis from "@/data/capitalife/white-swan-official-kpis.json";
import { account2Trades, whiteSwanCombinedEvidence } from "@/lib/capitalife-data";

export function getHistoricalTrackRecordSummary() {
  return {
    monthlySource: "src/data/capitalife/performance-monthly.json",
    statementSource: "src/data/capitalife/account1-mt4-trades.json",
    myfxbookVisibleSource: "src/data/capitalife/account2-myfxbook-visible-trades.json",
    officialKpisSource: "src/data/capitalife/white-swan-official-kpis.json",
    baselinePeriod: performanceMonthly.meta.period,
    account1: {
      broker: account1Mt4Trades.meta.broker,
      statementGenerated: account1Mt4Trades.meta.statement_generated,
      statementPeriodFirstClose: account1Mt4Trades.meta.statement_period_first_close,
      statementPeriodLastClose: account1Mt4Trades.meta.statement_period_last_close,
      totalClosedTrades: account1Mt4Trades.meta.total_closed_trades,
    },
    account2: {
      source: account2Trades.meta.source,
      visibleTrades: account2Trades.meta.total_visible_trades,
      note: account2Trades.meta.note,
    },
    official: {
      combinedReturnPct: whiteSwanOfficialKpis.official_kpis.combined_return_pct,
      compoundedReturnPct: whiteSwanOfficialKpis.official_kpis.compounded_return_pct,
      maxDrawdownPct: whiteSwanOfficialKpis.official_kpis.max_drawdown_pct,
      annualizedReturnPct: whiteSwanOfficialKpis.official_kpis.annualized_return_pct,
    },
    evidenceSources: whiteSwanCombinedEvidence.meta.sources,
  };
}
