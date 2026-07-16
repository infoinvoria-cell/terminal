// Monitoring Strategy Tester — Symbol-to-Strategy Registry
// Maps every monitoring asset to available strategy kinds with data paths.
// No cross-asset fallback. No invented defaults.
// All parity claims backed by TradingView trade export files.

import type {
  MonitoringAssetGroup,
  MonitoringStrategyKind,
  MonitoringSymbolStrategyBinding,
  MonitoringSymbolStrategyMapping,
  QuantModuleInfo,
} from "./types";
import { AGRI_DISABLED_MACRO_SYMBOLS } from "./constants";

// ── Macro Valuation Alpha V1 — symbol definitions ────────────────────────────
// inputParamsXlsx: workspace/input/strategy_parameters_xlsx/  (V1 dated 2026-05-20)
// tradeExportXlsx: workspace/input/tradingview_strategy_tester_exports/ (2026-05-08)
// tradeExportCsv:  capitalife_portfolio/ (2026-04-27 to 2026-05-08)

type MvaSymbolDef = {
  assetId: string;
  displayName: string;
  tradingViewSymbol: string;
  group: MonitoringAssetGroup;
  monitoringCode?: string; // the code used in the monitoring page (e.g. "ZW1!")
  inputParamsXlsx: string | null;  // relative to project root
  tradeExportXlsx: string | null;  // relative to project root
  tradeExportCsv: string | null;   // relative to project root
};

const MVA_SYMBOLS: MvaSymbolDef[] = [
  {
    assetId: "orange_juice",
    displayName: "Orange Juice",
    tradingViewSymbol: "OJ1!",
    group: "agriculture",
    monitoringCode: "OJ1!",
    inputParamsXlsx: "workspace/input/strategy_parameters_xlsx/Macro_Valuation_Alpha_-_Capitalife_V1_ICEUS_OJ1!_2026-05-20_990d0.xlsx",
    tradeExportXlsx: "workspace/input/tradingview_strategy_tester_exports/Macro_Valuation_Alpha_-_Capitalife_ICEUS_OJ1!_2026-05-08_72351.xlsx",
    tradeExportCsv: "capitalife_portfolio/Macro_Valuation_Alpha_-_Capitalife_ICEUS_OJ1!_2026-04-27_5dc71.csv",
  },
  {
    assetId: "wheat",
    displayName: "Wheat",
    tradingViewSymbol: "ZW1!",
    group: "agriculture",
    monitoringCode: "ZW1!",
    inputParamsXlsx: "workspace/input/strategy_parameters_xlsx/Macro_Valuation_Alpha_-_Capitalife_V1_CBOT_ZW1!_2026-05-20_83eb2.xlsx",
    tradeExportXlsx: "workspace/input/tradingview_strategy_tester_exports/Macro_Valuation_Alpha_-_Capitalife_CBOT_ZW1!_2026-05-08_17e15.xlsx",
    tradeExportCsv: "capitalife_portfolio/Macro_Valuation_Alpha_-_Capitalife_CBOT_ZW1!_2026-04-27_fb573.csv",
  },
  {
    assetId: "cocoa",
    displayName: "Cocoa",
    tradingViewSymbol: "CC1!",
    group: "agriculture",
    monitoringCode: "CC1!",
    inputParamsXlsx: "workspace/input/strategy_parameters_xlsx/Macro_Valuation_Alpha_-_Capitalife_V1_ICEUS_CC1!_2026-05-20_1d3c9.xlsx",
    tradeExportXlsx: "workspace/input/tradingview_strategy_tester_exports/Macro_Valuation_Alpha_-_Capitalife_ICEUS_CC1!_2026-05-08_5f7ad.xlsx",
    tradeExportCsv: "capitalife_portfolio/Macro_Valuation_Alpha_-_Capitalife_ICEUS_CC1!_2026-04-27_fd533.csv",
  },
  {
    assetId: "sugar",
    displayName: "Sugar",
    tradingViewSymbol: "SB1!",
    group: "agriculture",
    monitoringCode: "SB1!",
    inputParamsXlsx: null, // V1 params XLSX not found (only has ICEUS CC1 and OJ1)
    tradeExportXlsx: "workspace/input/tradingview_strategy_tester_exports/Macro_Valuation_Alpha_-_Capitalife_ICEUS_SB1!_2026-05-08_acafd.xlsx",
    tradeExportCsv: "capitalife_portfolio/Macro_Valuation_Alpha_-_Capitalife_ICEUS_SB1!_2026-04-27_57c49.csv",
  },
  {
    assetId: "corn",
    displayName: "Corn",
    tradingViewSymbol: "ZC1!",
    group: "agriculture",
    monitoringCode: "ZC1!",
    inputParamsXlsx: "workspace/input/strategy_parameters_xlsx/Macro_Valuation_Alpha_-_Capitalife_V1_CBOT_ZC1!_2026-05-20_e974f.xlsx",
    tradeExportXlsx: "workspace/input/tradingview_strategy_tester_exports/Macro_Valuation_Alpha_-_Capitalife_CBOT_ZC1!_2026-05-08_6119d.xlsx",
    tradeExportCsv: null,
  },
  {
    assetId: "soybeans",
    displayName: "Soybeans",
    tradingViewSymbol: "ZS1!",
    group: "agriculture",
    monitoringCode: "ZS1!",
    inputParamsXlsx: "workspace/monitoring_strategy_data/agrar/03_parameters_xlsx/Macro_Valuation_Alpha_-_Capitalife_V1.1_CBOT_ZS1!_2026-06-04_25e90.xlsx",
    tradeExportXlsx: "workspace/input/tradingview_strategy_tester_exports/Macro_Valuation_Alpha_-_Capitalife_V1.1_CBOT_ZS1!_2026-06-04_25e90.xlsx",
    tradeExportCsv: "workspace/monitoring_strategy_data/agrar/02_backtest_csv/Macro_Valuation_Alpha_-_Capitalife_V1.1_CBOT_ZS1!_2026-06-04_d81c3.csv",
  },
  {
    assetId: "coffee",
    displayName: "Coffee",
    tradingViewSymbol: "KC1!",
    group: "agriculture",
    monitoringCode: "KC1!",
    inputParamsXlsx: "workspace/monitoring_strategy_data/agrar/03_parameters_xlsx/Macro_Valuation_Alpha_-_Capitalife_V1.1_ICEUS_KC1!_2026-06-03_7f6a2.xlsx",
    tradeExportXlsx: "workspace/input/tradingview_strategy_tester_exports/Macro_Valuation_Alpha_-_Capitalife_V1.1_ICEUS_KC1!_2026-06-03_7f6a2.xlsx",
    tradeExportCsv: "workspace/monitoring_strategy_data/agrar/02_backtest_csv/Macro_Valuation_Alpha_-_Capitalife_V1.1_ICEUS_KC1!_2026-06-03_4dc88.csv",
  },
  {
    assetId: "cotton",
    displayName: "Cotton",
    tradingViewSymbol: "CT1!",
    group: "agriculture",
    monitoringCode: "CT1!",
    inputParamsXlsx: null,
    tradeExportXlsx: null,
    tradeExportCsv: null,
  },
  {
    assetId: "sp500",
    displayName: "S&P 500 (E-Mini)",
    tradingViewSymbol: "ES1!",
    group: "indices",
    monitoringCode: "ES1!",
    inputParamsXlsx: "workspace/input/strategy_parameters_xlsx/Macro_Valuation_Alpha_-_Capitalife_V1_CME_MINI_ES1!_2026-05-20_6d68d.xlsx",
    tradeExportXlsx: "workspace/input/tradingview_strategy_tester_exports/Macro_Valuation_Alpha_-_Capitalife_CME_MINI_ES1!_2026-05-08_c412a.xlsx",
    tradeExportCsv: "capitalife_portfolio/Macro_Valuation_Alpha_-_Capitalife_CME_MINI_ES1!_2026-04-28_e7158.csv",
  },
  {
    assetId: "nasdaq100",
    displayName: "Nasdaq 100 (E-Mini)",
    tradingViewSymbol: "NQ1!",
    group: "indices",
    monitoringCode: "NQ1!",
    inputParamsXlsx: null, // Not in strategy_parameters_xlsx V1
    tradeExportXlsx: "workspace/input/tradingview_strategy_tester_exports/Macro_Valuation_Alpha_-_Capitalife_CME_MINI_NQ1!_2026-05-08_22f20.xlsx",
    tradeExportCsv: "capitalife_portfolio/Macro_Valuation_Alpha_-_Capitalife_CME_MINI_NQ1!_2026-04-28_af347.csv",
  },
  {
    assetId: "dowjones",
    displayName: "Dow Jones (Mini)",
    tradingViewSymbol: "YM1!",
    group: "indices",
    monitoringCode: "YM1!",
    inputParamsXlsx: "workspace/input/strategy_parameters_xlsx/Macro_Valuation_Alpha_-_Capitalife_V1_CBOT_MINI_YM1!_2026-05-20_c76f3.xlsx",
    tradeExportXlsx: "workspace/input/tradingview_strategy_tester_exports/Macro_Valuation_Alpha_-_Capitalife_CBOT_MINI_YM1!_2026-05-08_a9575.xlsx",
    tradeExportCsv: "capitalife_portfolio/Macro_Valuation_Alpha_-_Capitalife_CBOT_MINI_YM1!_2026-04-28_6f480.csv",
  },
  {
    assetId: "dax40",
    displayName: "DAX (FDAX)",
    tradingViewSymbol: "FDAX1!",
    group: "indices",
    monitoringCode: "FDAX1!",
    inputParamsXlsx: "workspace/input/strategy_parameters_xlsx/Macro_Valuation_Alpha_-_Capitalife_V1_EUREX_FDAX1!_2026-05-20_7bfeb.xlsx",
    tradeExportXlsx: "workspace/input/tradingview_strategy_tester_exports/Macro_Valuation_Alpha_-_Capitalife_EUREX_FDAX1!_2026-05-08_5c4f6.xlsx",
    tradeExportCsv: "capitalife_portfolio/Macro_Valuation_Alpha_-_Capitalife_EUREX_FDAX1!_2026-04-28_9b58a.csv",
  },
  {
    assetId: "gold",
    displayName: "Gold",
    tradingViewSymbol: "GC1!",
    group: "metals",
    monitoringCode: "GC1!",
    inputParamsXlsx: "workspace/input/strategy_parameters_xlsx/Macro_Valuation_Alpha_-_Capitalife_V1_COMEX_GC1!_2026-05-20_1ad9c.xlsx",
    tradeExportXlsx: "workspace/input/tradingview_strategy_tester_exports/Macro_Valuation_Alpha_-_Capitalife_COMEX_GC1!_2026-05-08_59336.xlsx",
    tradeExportCsv: null,
  },
  {
    assetId: "silver",
    displayName: "Silver",
    tradingViewSymbol: "SI1!",
    group: "metals",
    monitoringCode: "SI1!",
    inputParamsXlsx: "workspace/input/strategy_parameters_xlsx/Macro_Valuation_Alpha_-_Capitalife_V1_COMEX_SI1!_2026-05-20_f03e1.xlsx",
    tradeExportXlsx: "workspace/input/tradingview_strategy_tester_exports/Macro_Valuation_Alpha_-_Capitalife_COMEX_SI1!_2026-05-08_fed61.xlsx",
    tradeExportCsv: "capitalife_portfolio/Macro_Valuation_Alpha_-_Capitalife_COMEX_SI1!_2026-04-28_47d60.csv",
  },
  {
    assetId: "wti_spot",
    displayName: "Crude Oil WTI",
    tradingViewSymbol: "CL1!",
    group: "energy",
    monitoringCode: "CL1!",
    inputParamsXlsx: "workspace/input/strategy_parameters_xlsx/Macro_Valuation_Alpha_-_Capitalife_V1_NYMEX_CL1!_2026-05-20_0d46d.xlsx",
    tradeExportXlsx: "workspace/input/tradingview_strategy_tester_exports/Macro_Valuation_Alpha_-_Capitalife_NYMEX_CL1!_2026-05-08_da366.xlsx",
    tradeExportCsv: "capitalife_portfolio/Macro_Valuation_Alpha_-_Capitalife_NYMEX_CL1!_2026-04-28_ca2ad.csv",
  },
  {
    assetId: "palladium",
    displayName: "Palladium",
    tradingViewSymbol: "PA1!",
    group: "metals",
    monitoringCode: "PA1!",
    inputParamsXlsx: "workspace/input/strategy_parameters_xlsx/Macro_Valuation_Alpha_-_Capitalife_V1_NYMEX_PA1!_2026-05-20_c57f7.xlsx",
    tradeExportXlsx: "workspace/input/tradingview_strategy_tester_exports/Macro_Valuation_Alpha_-_Capitalife_NYMEX_PA1!_2026-05-08_04fa9.xlsx",
    tradeExportCsv: "capitalife_portfolio/Macro_Valuation_Alpha_-_Capitalife_NYMEX_PA1!_2026-04-28_ed560.csv",
  },
  {
    assetId: "platinum",
    displayName: "Platinum",
    tradingViewSymbol: "PL1!",
    group: "metals",
    monitoringCode: "PL1!",
    inputParamsXlsx: "workspace/input/strategy_parameters_xlsx/Macro_Valuation_Alpha_-_Capitalife_V1_NYMEX_PL1!_2026-05-20_d7381.xlsx",
    tradeExportXlsx: "workspace/input/tradingview_strategy_tester_exports/Macro_Valuation_Alpha_-_Capitalife_NYMEX_PL1!_2026-05-08_8a2b6.xlsx",
    tradeExportCsv: "capitalife_portfolio/Macro_Valuation_Alpha_-_Capitalife_NYMEX_PL1!_2026-04-28_8a05e.csv",
  },
  {
    assetId: "aapl",
    displayName: "Apple",
    tradingViewSymbol: "AAPL",
    group: "stocks",
    monitoringCode: "AAPL",
    inputParamsXlsx: "workspace/input/strategy_parameters_xlsx/Macro_Valuation_Alpha_-_Capitalife_V1_NASDAQ_AAPL_2026-05-20_b7244.xlsx",
    tradeExportXlsx: "workspace/input/tradingview_strategy_tester_exports/Macro_Valuation_Alpha_-_Capitalife_NASDAQ_AAPL_2026-05-08_e85a5.xlsx",
    tradeExportCsv: null,
  },
  {
    assetId: "amzn",
    displayName: "Amazon",
    tradingViewSymbol: "AMZN",
    group: "stocks",
    monitoringCode: "AMZN",
    inputParamsXlsx: "workspace/input/strategy_parameters_xlsx/Macro_Valuation_Alpha_-_Capitalife_V1_NASDAQ_AMZN_2026-05-20_55045.xlsx",
    tradeExportXlsx: "workspace/input/tradingview_strategy_tester_exports/Macro_Valuation_Alpha_-_Capitalife_NASDAQ_AMZN_2026-05-08_87bb2.xlsx",
    tradeExportCsv: null,
  },
  {
    assetId: "googl",
    displayName: "Alphabet (GOOGL)",
    tradingViewSymbol: "GOOGL",
    group: "stocks",
    monitoringCode: "GOOGL",
    inputParamsXlsx: "workspace/input/strategy_parameters_xlsx/Macro_Valuation_Alpha_-_Capitalife_V1_NASDAQ_GOOGL_2026-05-20_1e7bf.xlsx",
    tradeExportXlsx: "workspace/input/tradingview_strategy_tester_exports/Macro_Valuation_Alpha_-_Capitalife_NASDAQ_GOOGL_2026-05-08_fc370.xlsx",
    tradeExportCsv: null,
  },
  {
    assetId: "meta",
    displayName: "Meta",
    tradingViewSymbol: "META",
    group: "stocks",
    monitoringCode: "META",
    inputParamsXlsx: "workspace/input/strategy_parameters_xlsx/Macro_Valuation_Alpha_-_Capitalife_V1_NASDAQ_META_2026-05-20_c38d7.xlsx",
    tradeExportXlsx: "workspace/input/tradingview_strategy_tester_exports/Macro_Valuation_Alpha_-_Capitalife_NASDAQ_META_2026-05-08_c7991.xlsx",
    tradeExportCsv: null,
  },
  {
    assetId: "msft",
    displayName: "Microsoft",
    tradingViewSymbol: "MSFT",
    group: "stocks",
    monitoringCode: "MSFT",
    inputParamsXlsx: "workspace/input/strategy_parameters_xlsx/Macro_Valuation_Alpha_-_Capitalife_V1_NASDAQ_MSFT_2026-05-20_10c5b.xlsx",
    tradeExportXlsx: "workspace/input/tradingview_strategy_tester_exports/Macro_Valuation_Alpha_-_Capitalife_NASDAQ_MSFT_2026-05-08_16d48.xlsx",
    tradeExportCsv: null,
  },
  {
    assetId: "nvda",
    displayName: "Nvidia",
    tradingViewSymbol: "NVDA",
    group: "stocks",
    monitoringCode: "NVDA",
    inputParamsXlsx: "workspace/input/strategy_parameters_xlsx/Macro_Valuation_Alpha_-_Capitalife_V1_NASDAQ_NVDA_2026-05-20_fb678.xlsx",
    tradeExportXlsx: "workspace/input/tradingview_strategy_tester_exports/Macro_Valuation_Alpha_-_Capitalife_NASDAQ_NVDA_2026-05-08_3ed6c.xlsx",
    tradeExportCsv: null,
  },
];

// ── Intraday strategy symbols ─────────────────────────────────────────────────
// These exist as CSV trade exports in capitalife_portfolio/ but have no XLSX
// parameter inputs in strategy_parameters_xlsx/.

const INTRADAY_SYMBOLS: Array<{
  kind: MonitoringStrategyKind;
  assetId: string;
  displayName: string;
  tradingViewSymbol: string;
  group: MonitoringAssetGroup;
  tradeExportCsv: string | null;
  blockedReason: string;
}> = [
  {
    kind: "intraday_1",
    assetId: "dax_mt_1h",
    displayName: "DAX 1H (MT)",
    tradingViewSymbol: "DE30EUR",
    group: "indices",
    tradeExportCsv: "capitalife_portfolio/MT_DAX_1h_Master_BE_Regimes_OANDA_DE30EUR_2026-05-03_7e30c.csv",
    blockedReason: "No XLSX strategy parameter inputs found in workspace/input/strategy_parameters_xlsx/. Trade export CSV present but XLSX inputs required for strategy tester.",
  },
  {
    kind: "intraday_2",
    assetId: "gbpusd_30m",
    displayName: "GBPUSD 30m",
    tradingViewSymbol: "GBPUSD",
    group: "forex",
    tradeExportCsv: "capitalife_portfolio/GBPUSD_30m_Master_BE_Regimes_OANDA_GBPUSD_2026-05-03_aca52.csv",
    blockedReason: "No XLSX strategy parameter inputs found. Trade export CSV present.",
  },
  {
    kind: "intraday_3",
    assetId: "dax_2h",
    displayName: "DAX 2H (Trend Momentum)",
    tradingViewSymbol: "DE30EUR",
    group: "indices",
    tradeExportCsv: "capitalife_portfolio/Trend_Momentum_2h_Dax_Macro_OANDA_DE30EUR_2026-05-03_da9bc.csv",
    blockedReason: "No XLSX strategy parameter inputs found. Trade export CSV present.",
  },
  {
    kind: "intraday_4",
    assetId: "eurusd_30m",
    displayName: "EURUSD 30m",
    tradingViewSymbol: "EURUSD",
    group: "forex",
    tradeExportCsv: "capitalife_portfolio/EURUSD_30m_Master_Regime_Full_OANDA_EURUSD_2026-05-03_1e94e.csv",
    blockedReason: "No XLSX strategy parameter inputs found. Trade export CSV present.",
  },
];

// ── Registry builder ──────────────────────────────────────────────────────────

function buildMvaBinding(sym: MvaSymbolDef): MonitoringSymbolStrategyBinding {
  if (AGRI_DISABLED_MACRO_SYMBOLS.includes(sym.monitoringCode as (typeof AGRI_DISABLED_MACRO_SYMBOLS)[number])) {
    return {
      strategyKind: "macro_valuation",
      displayName: "Macro Valuation",
      defaultEnabled: false,
      inputSource: "missing",
      supported: false,
      availabilityStatus: "unsupported",
      blockedReason: `${sym.tradingViewSymbol} is intentionally disabled in the current frozen agri macro sleeve.`,
      inputAvailability: "not_applicable",
      canLoadXlsxDefaults: false,
      canRunWithXlsxDefaults: false,
      canRunMetricParity: false,
      canRunCustomInputs: false,
    };
  }

  const hasInputs = sym.inputParamsXlsx !== null;
  const hasTradeExport = sym.tradeExportXlsx !== null || sym.tradeExportCsv !== null;

  if (!hasTradeExport) {
    return {
      strategyKind: "macro_valuation",
      displayName: "Macro Valuation",
      defaultEnabled: false,
      inputSource: hasInputs ? "xlsx" : "missing",
      inputSourcePath: sym.inputParamsXlsx ?? undefined,
      tradingViewExportPath: undefined,
      supported: false,
      availabilityStatus: "blocked_missing_strategy_csv",
      blockedReason: `No TradingView trade export found for ${sym.tradingViewSymbol}. XLSX params: ${hasInputs ? "present" : "missing"}.`,
      inputAvailability: "not_applicable",
      canLoadXlsxDefaults: false,
      canRunWithXlsxDefaults: false,
      canRunMetricParity: false,
      canRunCustomInputs: false,
    };
  }

  const exportPath = sym.tradeExportXlsx ?? sym.tradeExportCsv ?? undefined;

  if (hasInputs) {
    // Full exact parity: trade export + input XLSX both present
    return {
      strategyKind: "macro_valuation",
      displayName: "Macro Valuation",
      defaultEnabled: true,
      inputSource: "xlsx",
      inputSourcePath: sym.inputParamsXlsx ?? undefined,
      tradingViewExportPath: exportPath,
      strategyEnginePath: "frontend/app/api/monitoring/strategy-tester/run/route.ts",
      supported: true,
      availabilityStatus: "available_exact_parity",
      inputAvailability: "xlsx_params_available",
      canLoadXlsxDefaults: true,
      canRunWithXlsxDefaults: true,
      canRunMetricParity: true,
      canRunCustomInputs: true,
    };
  }

  // Metric parity only: trade export present, input XLSX missing
  return {
    strategyKind: "macro_valuation",
    displayName: "Macro Valuation",
    defaultEnabled: true,
    inputSource: "missing",
    tradingViewExportPath: exportPath,
    strategyEnginePath: "frontend/app/api/monitoring/strategy-tester/run/route.ts",
    supported: true,
    availabilityStatus: "available_metric_parity_missing_input_xlsx",
    blockedReason: `Trade export present but no V1 XLSX parameter file in workspace/input/strategy_parameters_xlsx/ for ${sym.tradingViewSymbol}. Metric parity only.`,
    inputAvailability: "missing_input_xlsx",
    canLoadXlsxDefaults: false,
    canRunWithXlsxDefaults: false,
    canRunMetricParity: true,
    canRunCustomInputs: true,
  };
}

const BLOCKED_INTRADAY: MonitoringSymbolStrategyBinding[] = ["intraday_1", "intraday_2", "intraday_3", "intraday_4"].map(
  (kind) => ({
    strategyKind: kind as MonitoringStrategyKind,
    displayName: kind === "intraday_1" ? "Intraday 1"
               : kind === "intraday_2" ? "Intraday 2"
               : kind === "intraday_3" ? "Intraday 3"
               : "Intraday 4",
    defaultEnabled: false,
    inputSource: "missing" as const,
    supported: false,
    availabilityStatus: "blocked_missing_inputs" as const,
    blockedReason: "Intraday strategies are only available for specific Forex/Indices symbols, not for this asset.",
    inputAvailability: "not_applicable" as const,
    canLoadXlsxDefaults: false,
    canRunWithXlsxDefaults: false,
    canRunMetricParity: false,
    canRunCustomInputs: false,
  }),
);

const BLOCKED_INVEST: MonitoringSymbolStrategyBinding = {
  strategyKind: "invest",
  displayName: "Invest",
  defaultEnabled: false,
  inputSource: "missing",
  supported: false,
  availabilityStatus: "blocked_missing_inputs",
  blockedReason: "No Invest strategy XLSX parameter inputs found for this symbol.",
  inputAvailability: "not_applicable",
  canLoadXlsxDefaults: false,
  canRunWithXlsxDefaults: false,
  canRunMetricParity: false,
  canRunCustomInputs: false,
};

// Build the full registry
export const MONITORING_STRATEGY_REGISTRY: MonitoringSymbolStrategyMapping[] = MVA_SYMBOLS.map((sym) => ({
  symbol: sym.tradingViewSymbol,
  assetId: sym.assetId,
  displayName: sym.displayName,
  group: sym.group,
  availableStrategies: [
    buildMvaBinding(sym),
    ...BLOCKED_INTRADAY,
    BLOCKED_INVEST,
  ],
}));

// Intraday-specific mappings (one entry per intraday symbol)
export const INTRADAY_STRATEGY_REGISTRY: MonitoringSymbolStrategyMapping[] = INTRADAY_SYMBOLS.map((sym) => ({
  symbol: sym.tradingViewSymbol,
  assetId: sym.assetId,
  displayName: sym.displayName,
  group: sym.group,
  availableStrategies: [
    {
      strategyKind: sym.kind,
      displayName: sym.kind === "intraday_1" ? "Intraday 1"
                 : sym.kind === "intraday_2" ? "Intraday 2"
                 : sym.kind === "intraday_3" ? "Intraday 3"
                 : "Intraday 4",
      defaultEnabled: false,
      inputSource: "missing" as const,
      tradingViewExportPath: sym.tradeExportCsv ?? undefined,
      supported: false,
      availabilityStatus: "blocked_missing_inputs" as const,
      blockedReason: sym.blockedReason,
      inputAvailability: "not_applicable" as const,
      canLoadXlsxDefaults: false,
      canRunWithXlsxDefaults: false,
      canRunMetricParity: false,
      canRunCustomInputs: false,
    },
    {
      strategyKind: "macro_valuation" as MonitoringStrategyKind,
      displayName: "Macro Valuation",
      defaultEnabled: false,
      inputSource: "missing" as const,
      supported: false,
      availabilityStatus: "blocked_missing_inputs" as const,
      blockedReason: "Macro Valuation Alpha V1 is only available for commodities and NASDAQ stocks, not for intraday forex/indices.",
      inputAvailability: "not_applicable" as const,
      canLoadXlsxDefaults: false,
      canRunWithXlsxDefaults: false,
      canRunMetricParity: false,
      canRunCustomInputs: false,
    },
    {
      strategyKind: "invest" as MonitoringStrategyKind,
      displayName: "Invest",
      defaultEnabled: false,
      inputSource: "missing" as const,
      supported: false,
      availabilityStatus: "blocked_missing_inputs" as const,
      blockedReason: "No Invest strategy data for this symbol.",
      inputAvailability: "not_applicable" as const,
      canLoadXlsxDefaults: false,
      canRunWithXlsxDefaults: false,
      canRunMetricParity: false,
      canRunCustomInputs: false,
    },
  ],
}));

// Lookup by assetId or TV symbol
export function getMvaSymbolDef(assetIdOrSymbol: string): MvaSymbolDef | undefined {
  const s = assetIdOrSymbol.toLowerCase();
  return MVA_SYMBOLS.find(
    (sym) =>
      sym.assetId === s ||
      sym.tradingViewSymbol.toLowerCase() === s ||
      (sym.monitoringCode?.toLowerCase() ?? "") === s,
  );
}

export function getStrategyMappingBySymbol(tvSymbol: string): MonitoringSymbolStrategyMapping | undefined {
  return (
    MONITORING_STRATEGY_REGISTRY.find((m) => m.symbol.toLowerCase() === tvSymbol.toLowerCase()) ??
    INTRADAY_STRATEGY_REGISTRY.find((m) => m.symbol.toLowerCase() === tvSymbol.toLowerCase())
  );
}

export function getMvaSymbolDefs(): MvaSymbolDef[] {
  return MVA_SYMBOLS;
}

// ── Quant Validation Module Info ──────────────────────────────────────────────

export const QUANT_MODULES: QuantModuleInfo[] = [
  {
    mode: "fixed_backtest",
    label: "Fixed Backtest",
    status: "implemented",
  },
  {
    mode: "in_sample_out_of_sample",
    label: "In-Sample / Out-of-Sample",
    status: "prepared_not_implemented",
    blockedReason: "Types and config defined. UI and computation not yet implemented.",
  },
  {
    mode: "walk_forward",
    label: "Walk-Forward",
    status: "prepared_not_implemented",
    blockedReason: "WalkForwardConfig defined. Requires engine simulation mode with reoptimizable inputs. Blocked pending engine implementation.",
  },
  {
    mode: "parameter_sensitivity",
    label: "Parameter Sensitivity",
    status: "prepared_not_implemented",
    blockedReason: "Requires engine simulation mode to sweep input ranges. Blocked pending engine implementation.",
  },
  {
    mode: "monte_carlo_bootstrap",
    label: "Monte Carlo / Bootstrap",
    status: "prepared_not_implemented",
    blockedReason: "Can be computed from trade return series. Implementation pending.",
  },
  {
    mode: "risk_analysis",
    label: "Risk Analysis",
    status: "prepared_not_implemented",
    blockedReason: "DrawdownCurve available from trade export. Extended risk metrics implementation pending.",
  },
];
