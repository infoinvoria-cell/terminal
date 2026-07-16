/**
 * All Komponenten Bento groups + layout.
 * Layout: 16-lane grid, left/right arrangement.
 *   Left (col 1–8): Agrar, Metalle+Energie, FX
 *   Right (col 9–16): Aktien, Indizes+Invest, Intraday
 *
 * No LONG/SHORT. No live signals. Placeholder key stats where data is missing.
 */

import type {
  AssetComponent,
  AssetStrategyMode,
  ComponentGroup,
  ComponentModeStats,
  GroupLayout,
} from "@/lib/components/components-types";
import { AGRI_COMPONENTS } from "@/lib/components/agri-components-data";

// ── helpers ──────────────────────────────────────────────────────────────────

const PH: ComponentModeStats = {
  count: 0,
  cagr: "—",
  maxDrawdown: "—",
  calmar: "—",
  sharpe: "—",
  profitFactor: "—",
  trades: "—",
  winrate: "—",
  wfOos: "—",
  status: "open",
  placeholder: true,
};

function phMode(label: string, id: string): AssetStrategyMode {
  return { id, label, stats: { ...PH } };
}

function phAsset(
  symbol: string,
  label: string,
  exchange: string,
  modes: AssetStrategyMode[],
  iconFile?: string,
): AssetComponent {
  return {
    symbol,
    symbolDisplay: symbol,
    label,
    assetId: symbol.toLowerCase().replace(/[^a-z0-9]/g, "_"),
    exchange,
    iconFile,
    version: "offen",
    dataCoverage: "offen",
    modes,
  };
}

// ── group definitions ─────────────────────────────────────────────────────────

const AKTIEN: AssetComponent[] = [
  phAsset("AAPL",  "Apple",     "NASDAQ", [phMode("Trend", "trend"), phMode("Valuation", "valuation"), phMode("Momentum", "momentum")], "/asset-icons/apple.png"),
  phAsset("MSFT",  "Microsoft", "NASDAQ", [phMode("Trend", "trend"), phMode("Valuation", "valuation"), phMode("Momentum", "momentum")], "/asset-icons/microsoft.png"),
  phAsset("NVDA",  "Nvidia",    "NASDAQ", [phMode("Trend", "trend"), phMode("Valuation", "valuation"), phMode("Momentum", "momentum")], "/asset-icons/nvidia.png"),
  phAsset("GOOGL", "Alphabet",  "NASDAQ", [phMode("Trend", "trend"), phMode("Valuation", "valuation"), phMode("Momentum", "momentum")], "/asset-icons/google.png"),
  phAsset("META",  "Meta",      "NASDAQ", [phMode("Trend", "trend"), phMode("Valuation", "valuation"), phMode("Momentum", "momentum")], "/asset-icons/meta.png"),
  phAsset("AMZN",  "Amazon",    "NASDAQ", [phMode("Trend", "trend"), phMode("Valuation", "valuation"), phMode("Momentum", "momentum")], "/asset-icons/amazon.png"),
];

const METALLE_ENERGIE: AssetComponent[] = [
  phAsset("GC1!", "Gold",          "COMEX", [phMode("Trend", "trend"), phMode("Valuation", "valuation"), phMode("Macro", "macro")], "/asset-icons/gold.png"),
  phAsset("SI1!", "Silver",        "COMEX", [phMode("Trend", "trend"), phMode("Valuation", "valuation"), phMode("Macro", "macro")], "/asset-icons/silver.png"),
  phAsset("HG1!", "Copper",        "COMEX", [phMode("Trend", "trend"), phMode("Valuation", "valuation"), phMode("Macro", "macro")], "/asset-icons/Kupfer.webp"),
  phAsset("PL1!", "Platinum",      "NYMEX", [phMode("Trend", "trend"), phMode("Valuation", "valuation")],                           "/asset-icons/platinum.png"),
  phAsset("PA1!", "Palladium",     "NYMEX", [phMode("Trend", "trend"), phMode("Valuation", "valuation")],                           "/asset-icons/palladium.png"),
  phAsset("CL1!", "Crude Oil WTI", "NYMEX", [phMode("Trend", "trend"), phMode("Valuation", "valuation"), phMode("Macro", "macro")], "/asset-icons/crude_oil.png"),
  phAsset("NG1!", "Natural Gas",   "NYMEX", [phMode("Trend", "trend"), phMode("Seasonal", "seasonal")]),
  phAsset("RB1!", "RBOB Gasoline", "NYMEX", [phMode("Trend", "trend"), phMode("Seasonal", "seasonal")]),
];

const FX: AssetComponent[] = [
  phAsset("EURGBP", "EUR/GBP", "FX", [phMode("Trend", "trend"), phMode("Seasonal", "seasonal"), phMode("Valuation", "valuation")], "/asset-icons/eur.png"),
  phAsset("GBPJPY", "GBP/JPY", "FX", [phMode("Trend", "trend"), phMode("Seasonal", "seasonal"), phMode("Valuation", "valuation")], "/asset-icons/gbp.png"),
  phAsset("MXNUSD", "MXN/USD", "FX", [phMode("Trend", "trend"), phMode("Macro", "macro")]),
  phAsset("NOKUSD", "NOK/USD", "FX", [phMode("Trend", "trend"), phMode("Macro", "macro")]),
  phAsset("CLPUSD", "CLP/USD", "FX", [phMode("Trend", "trend"), phMode("Macro", "macro")]),
  phAsset("SEKUSD", "SEK/USD", "FX", [phMode("Trend", "trend"), phMode("Macro", "macro")]),
  phAsset("BRLUSD", "BRL/USD", "FX", [phMode("Trend", "trend"), phMode("Macro", "macro")]),
  phAsset("ZARUSD", "ZAR/USD", "FX", [phMode("Trend", "trend"), phMode("Macro", "macro")]),
];

const INDIZES: AssetComponent[] = [
  phAsset("FDAX1!", "DAX Futures",       "EUREX", [phMode("Trend", "trend"), phMode("Valuation", "valuation"), phMode("Macro", "macro")], "/asset-icons/dax.png"),
  phAsset("ES1!",   "S&P 500 Futures",   "CME",   [phMode("Trend", "trend"), phMode("Valuation", "valuation"), phMode("Macro", "macro")], "/asset-icons/SP.png"),
  phAsset("YM1!",   "Dow Jones Futures", "CBOT",  [phMode("Trend", "trend"), phMode("Valuation", "valuation"), phMode("Macro", "macro")], "/asset-icons/dow_jones.png"),
  phAsset("NQ1!",   "Nasdaq 100 Fut.",   "CME",   [phMode("Trend", "trend"), phMode("Valuation", "valuation"), phMode("Macro", "macro")], "/asset-icons/nasdaq.png"),
  phAsset("UKX!",   "FTSE 100",          "LSE",   [phMode("Trend", "trend"), phMode("Valuation", "valuation")]),
];

const INVEST: AssetComponent[] = [
  phAsset("NAS100USD_E_STEP_INVEST",                 "E-Step Invest",  "OANDA", [phMode("Portfolio Sleeve", "portfolio_sleeve")], "/asset-icons/nasdaq.png"),
  phAsset("NAS100USD_ONLY_LONG_VALUATION_TREND_EMA", "Long Val. EMA",  "OANDA", [phMode("Portfolio Sleeve", "portfolio_sleeve")], "/asset-icons/nasdaq.png"),
  phAsset("USDCHF_CHF_INVEST",                       "CHF Invest",     "OANDA", [phMode("Portfolio Sleeve", "portfolio_sleeve")], "/asset-icons/chf.png"),
];

const INTRADAY_MT: AssetComponent[] = [
  phAsset("DE30EUR_2H",  "DAX 2H",     "OANDA", [phMode("Intraday", "intraday")], "/asset-icons/dax.png"),
  phAsset("DE30EUR_1H",  "DAX 1H",     "OANDA", [phMode("Intraday", "intraday")], "/asset-icons/dax.png"),
  phAsset("EURUSD_30M",  "EURUSD 30M", "OANDA", [phMode("Intraday", "intraday")], "/asset-icons/eurusd.png"),
  phAsset("GBPUSD_30M",  "GBPUSD 30M", "OANDA", [phMode("Intraday", "intraday")], "/asset-icons/gbpusd.png"),
];

// ── exported groups ──────────────────────────────────────────────────────────

export const COMPONENT_GROUPS: ComponentGroup[] = [
  { id: "agrar",           title: "Agrar",             sourceTab: "agrar",           meta: "CBOT/ICEUS · Paper-only",   assets: AGRI_COMPONENTS },
  { id: "aktien",          title: "Aktien",            sourceTab: "aktien",          meta: "NASDAQ · offen",            assets: AKTIEN },
  { id: "metalle_energie", title: "Metalle + Energie", sourceTab: "metalle_energie", meta: "COMEX/NYMEX · offen",       assets: METALLE_ENERGIE },
  { id: "fx",              title: "FX — Forex8",       sourceTab: "fx",              meta: "Spot FX · offen",           assets: FX },
  { id: "indizes",         title: "Indizes",           sourceTab: "indizes",         meta: "EUREX/CME/LSE · offen",     assets: INDIZES },
  { id: "invest",          title: "Invest",            sourceTab: "invest",          meta: "OANDA · offen",             assets: INVEST },
  { id: "intraday_mt",     title: "Intraday MT",       sourceTab: "intraday_mt",     meta: "OANDA · offen",             assets: INTRADAY_MT },
];

// ── layout: left/right bento arrangement ─────────────────────────────────────

export const GROUP_LAYOUT: Record<string, GroupLayout> = {
  agrar:           { colStart: 1,  colSpan: 8, row: 1 },
  aktien:          { colStart: 9,  colSpan: 8, row: 1 },
  metalle_energie: { colStart: 1,  colSpan: 8, row: 2 },
  indizes:         { colStart: 9,  colSpan: 5, row: 2 },
  invest:          { colStart: 14, colSpan: 3, row: 2 },
  fx:              { colStart: 1,  colSpan: 8, row: 3 },
  intraday_mt:     { colStart: 9,  colSpan: 4, row: 3 },
};
