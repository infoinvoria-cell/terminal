// DO NOT EDIT — GENERATED FILE
// Run: node scripts/generate-canonical-params.mjs
// Source: candidate_lock.json (generatedAtUtc: 2026-08-08T00:00:00Z)
// This file generated at: 2026-08-10T15:52:09.135Z

export const CANONICAL_STRATEGY_PARAMS = {
  "trend_momentum_dax_2h": {
    strategyId: "trend_momentum_dax_2h",
    instrument: "DE30EUR",
    timeframe: "2H",
    source: "PRODUCTION_V1",
    aggregation: "30M → Berlin 2H",
    parameterConvention: "RR_RATIO",
    sl_atr: 0.8,
    tp_rr: 4,
    be_atr: 0.5,
    parameterHash: "cd588fe5acf417df9318c99d5f4e45b53be9c2f5fe2420cf08df465d3a8abe86",
    lockedAtUtc: "2026-08-08T00:00:00Z",
  },
  "mt_dax_1h": {
    strategyId: "mt_dax_1h",
    instrument: "DE30EUR",
    timeframe: "1H",
    source: "PRODUCTION_V1",
    aggregation: "30M → Berlin 1H",
    parameterConvention: "ATR_MULTIPLE",
    sl_atr: 1,
    tp_atr: 5,
    be_atr: 0.5,
    parameterHash: "aff22a7cbaf9314c01f1cb1e30cbb01c1976125ef2116ef5a991089d4ce2b9ac",
    lockedAtUtc: "2026-08-08T00:00:00Z",
  },
  "eurusd_mt_30m": {
    strategyId: "eurusd_mt_30m",
    instrument: "EURUSD",
    timeframe: "30M",
    source: "PRODUCTION_V1",
    aggregation: "native 30M",
    researchStatus: "PRODUCTION_READY_WITH_ROBUSTNESS_WARNING",
    parameterConvention: "ATR_MULTIPLE",
    sl_atr: 1,
    tp_atr: 5,
    be_atr: 0.75,
    parameterHash: "a4f5faeb3607077448dbf36d8c77ae971b6fe80668854bb5006dacf650b944f8",
    lockedAtUtc: "2026-08-08T00:00:00Z",
  },
} as const;

export type CanonicalStrategyId = keyof typeof CANONICAL_STRATEGY_PARAMS;
