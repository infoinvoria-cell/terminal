/**
 * TEST/REPLAY multi-strategy fixture.
 * Maps one chartKey to two real strategies that share the same production market
 * (NAS100USD / Nasdaq 100 futures). Used ONLY for Eye multi-strategy QA.
 * Does NOT alter production registry truth.
 */
export const MULTI_STRATEGY_TEST_FIXTURE: Array<{
  chartKey: string;    // "SYMBOL|TIMEFRAME"
  market: string;
  timeframe: string;
  strategyIds: string[];
  label: string;
}> = [
  {
    chartKey: "NAS100USD|D",
    market: "NAS100USD (Nasdaq 100)",
    timeframe: "D",
    strategyIds: ["e_step_invest_nas100usd_d", "only_long_valuation_trend_ema_nas100usd_d"],
    label: "TEST: NAS100USD D — 2 strategies (E-Step + Only-Long Valuation)",
  },
];
