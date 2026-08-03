// Core Invest Active Alpha 2 — Kanonisches Modell
// Version: Active Alpha 2 · Stand: 2026-08-02
// Quelle: Brain/05_Portfolios/Core_Invest/
// Status: Research / Pre-Fund — kein Live-Trading, keine Broker-Ausführung

export const CORE_INVEST_MODEL = {
  portfolioName: "Core Invest",
  version: "Active Alpha 2",
  frozenDate: "2026-08-02",
  currency: "USD",
  status: "research_pre_fund",
  statusLabel: "Research · Pre-Fund",
  riskMultiplier: 1.4,
  longExposureCap: 1.6,
  grossLongExposure: 1.4,  // 140% ETF Factor Sleeve
  cashFinancing: -0.4,     // BIL -40%
  rebalance: {
    frequency: "quarterly",
    months: [3, 6, 9, 12],
    day: "last_trading_day",
    transactionCostBps: 10,
    toleranceBandRelative: 0.2,
  },
  constraints: {
    noOptions: true,
    noPortfolioLeverage: false,  // leveraged via BIL short
    managedFuturesLongShort: true,
  },
  // ETF Factor Sleeve — 8 positions + BIL cash financing
  etfFactorSleeve: [
    etfComponent("SPY",  "S&P 500 ETF",                       0.56,  "S&P 500 Core"),
    etfComponent("QQQ",  "Nasdaq 100 ETF",                    0.28,  "Growth / Nasdaq"),
    etfComponent("VLUE", "iShares MSCI USA Value Factor",     0.16,  "Value Factor"),
    etfComponent("RSP",  "Invesco S&P 500 Equal Weight",      0.084, "Equal Weight S&P 500"),
    etfComponent("QUAL", "iShares MSCI USA Quality Factor",   0.084, "Quality Factor"),
    etfComponent("MTUM", "iShares MSCI USA Momentum Factor",  0.084, "Momentum Factor"),
    etfComponent("USMV", "iShares MSCI USA Min Vol Factor",   0.084, "Low Volatility"),
    etfComponent("IWM",  "iShares Russell 2000",              0.064, "Small Cap"),
    etfComponent("BIL",  "SPDR 1-3 Month T-Bill (Cash)",    -0.40,  "Cash Financing"),
  ],
  // Managed Futures Overlay — 12 roots, trendbasiert L/S
  managedFuturesOverlay: [
    mfComponent("ES",  "ES1!",  "MES",  "CME",   "Equity",      5,        "Micro execution proxy"),
    mfComponent("NQ",  "NQ1!",  "MNQ",  "CME",   "Equity",      2,        "Micro execution proxy"),
    mfComponent("6E",  "6E1!",  "M6E",  "CME",   "FX",          12500,    "Micro, history differs"),
    mfComponent("6J",  "6J1!",  "MJY",  "CME",   "FX",          1250000,  "Micro, history differs. LIVE: short 2 (2026-07-31)"),
    mfComponent("6B",  "6B1!",  "M6B",  "CME",   "FX",          6250,     "Micro, history differs"),
    mfComponent("6S",  "6S1!",  "MSF",  "CME",   "FX",          12500,    "Micro, history differs"),
    mfComponent("GC",  "GC1!",  "1OZ",  "COMEX", "Metals",      1,        "1OZ scaled proxy"),
    mfComponent("HG",  "HG1!",  "MHG",  "COMEX", "Metals",      2500,     "Micro execution proxy"),
    mfComponent("CL",  "CL1!",  "MCL",  "NYMEX", "Energy",      100,      "Micro execution proxy"),
    mfComponent("NG",  "NG1!",  "MNG",  "NYMEX", "Energy",      1000,     "Micro execution proxy"),
    mfComponent("ZC",  "ZC1!",  "MZC",  "CBOT",  "Agriculture", 5,        "MZC synthetic history"),
    mfComponent("ZS",  "ZS1!",  "MZS",  "CBOT",  "Agriculture", 5,        "MZS synthetic history"),
  ],
  // Final ablation KPIs (Source: Core Invest Strategy.md, updated 2026-08-02)
  ablationKpis: {
    netCagrPct:      14.66,
    volPct:          22.30,
    maxDrawdownPct: -28.33,
    sharpe:           0.663,
    calmar:           0.517,
    period:          "full backtest",
    status:          "research",
  },
  validation: {
    etfSeriesReady:        8,
    managedFuturesReady:  12,
    liveReadyComponents:   1,  // 6J short position live
    aggregateBacktestValid: true,
    rollingWalkForwardValid: false,
    liveReady:             false,
    realLiveDataVerified:  false,
    reason: "Active Alpha 2 backtested; live execution requires full system integration.",
  },
} as const;

function etfComponent(
  symbol: string,
  label: string,
  weight: number,
  role: string,
) {
  return { symbol, label, weight, role, kind: "etf" as const } as const;
}

function mfComponent(
  root: string,
  frontContract: string,
  microSymbol: string,
  exchange: string,
  group: string,
  multiplier: number,
  caveat: string,
) {
  return { root, frontContract, microSymbol, exchange, group, multiplier, caveat, kind: "futures" as const } as const;
}

export const CORE_INVEST_ETF_SYMBOLS = CORE_INVEST_MODEL.etfFactorSleeve
  .filter((c) => c.symbol !== "BIL")
  .map((c) => c.symbol);

export const CORE_INVEST_MF_SYMBOLS = CORE_INVEST_MODEL.managedFuturesOverlay
  .map((c) => c.frontContract);

export const CORE_INVEST_ALL_SYMBOLS = [
  ...CORE_INVEST_MODEL.etfFactorSleeve.map((c) => c.symbol),
  ...CORE_INVEST_MF_SYMBOLS,
];

export function getCoreInvestWeightTotal() {
  return Number(
    CORE_INVEST_MODEL.etfFactorSleeve
      .reduce((sum, c) => sum + c.weight, 0)
      .toFixed(12),
  );
}
