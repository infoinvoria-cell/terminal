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

/** Intraday MT validated mode — OOS 2018–2026, PAPER_ONLY */
function itMode(
  label: string,
  id: string,
  m: { cagr?: string; maxDrawdown?: string; calmar?: string; sharpe?: string; profitFactor?: string; trades?: string; winrate?: string; wfOos?: string },
  opts?: { archived?: boolean; detailNames?: string[] },
): AssetStrategyMode {
  return {
    id,
    label,
    stats: {
      count: 1,
      cagr:          m.cagr         ?? "—",
      maxDrawdown:   m.maxDrawdown  ?? "—",
      calmar:        m.calmar       ?? "—",
      sharpe:        m.sharpe       ?? "—",
      profitFactor:  m.profitFactor ?? "—",
      trades:        m.trades       ?? "—",
      winrate:       m.winrate      ?? "—",
      wfOos:         m.wfOos        ?? "—",
      status:        opts?.archived ? "archived" : "paper_only",
      source:        opts?.archived ? "vIT-1.0 — kein Edge" : "vIT-1.0 OOS 2018–2026",
      placeholder:   false,
    },
    detailNames: opts?.detailNames,
  };
}

/** WS v1.1 validated mode — OOS 2019–2026, PAPER_ONLY */
function wsMode(
  label: string,
  id: string,
  m: { sharpe?: string; cagr?: string; maxDrawdown?: string; calmar?: string; trades?: string; winrate?: string; wfOos?: string; profitFactor?: string },
): AssetStrategyMode {
  return {
    id,
    label,
    stats: {
      count: 1,
      sharpe: m.sharpe ?? "—",
      cagr: m.cagr ?? "—",
      maxDrawdown: m.maxDrawdown ?? "—",
      calmar: m.calmar ?? "—",
      profitFactor: m.profitFactor ?? "—",
      trades: m.trades ?? "—",
      winrate: m.winrate ?? "—",
      wfOos: m.wfOos ?? "—",
      status: "paper_only",
      source: "WS v1.1 OOS 2019–2026",
      placeholder: false,
    },
  };
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
  // WS-v1.1-archived: AAPL — Trend/Valuation/Momentum (kein Pass)
  phAsset("AAPL",  "Apple",     "NASDAQ", [], "/asset-icons/apple.png"),
  {
    // WS-v1.1-archived modes: Trend · Momentum
    symbol: "MSFT", symbolDisplay: "MSFT", label: "Microsoft", assetId: "msft",
    exchange: "NASDAQ", iconFile: "/asset-icons/microsoft.png", version: "WS-1.1", dataCoverage: "ab 2019",
    modes: [
      wsMode("Valuation", "valuation", { sharpe: "0.409", cagr: "+2.9%", maxDrawdown: "-30.7%", calmar: "0.09", trades: "143", wfOos: "88%", profitFactor: "1.23", winrate: "53.8%" }),
    ],
  },
  {
    // WS-v1.1-archived modes: Trend · Momentum
    symbol: "NVDA", symbolDisplay: "NVDA", label: "Nvidia", assetId: "nvda",
    exchange: "NASDAQ", iconFile: "/asset-icons/nvidia.png", version: "WS-1.1", dataCoverage: "ab 2019",
    modes: [
      wsMode("Valuation", "valuation", { sharpe: "0.823", cagr: "+21.3%", maxDrawdown: "-32.3%", calmar: "0.66", trades: "270", wfOos: "83%", profitFactor: "1.25", winrate: "54.8%" }),
    ],
  },
  {
    // WS-v1.1-archived modes: Valuation · Momentum
    symbol: "GOOGL", symbolDisplay: "GOOGL", label: "Alphabet", assetId: "googl",
    exchange: "NASDAQ", iconFile: "/asset-icons/google.png", version: "WS-1.1", dataCoverage: "ab 2019",
    modes: [
      wsMode("Trend", "trend", { sharpe: "0.657", cagr: "+16.9%", maxDrawdown: "-36.1%", calmar: "0.47", trades: "121", wfOos: "77%", profitFactor: "1.45", winrate: "42.1%" }),
    ],
  },
  // WS-v1.1-archived: META — Trend/Valuation/Momentum (kein Pass)
  phAsset("META",  "Meta",      "NASDAQ", [], "/asset-icons/meta.png"),
  // WS-v1.1-archived: AMZN — Trend/Valuation/Momentum (kein Pass)
  phAsset("AMZN",  "Amazon",    "NASDAQ", [], "/asset-icons/amazon.png"),
];

const METALLE_ENERGIE: AssetComponent[] = [
  {
    // WS-v1.1-archived modes: Trend
    symbol: "GC1!", symbolDisplay: "GC1!", label: "Gold", assetId: "gc1_",
    exchange: "COMEX", iconFile: "/asset-icons/gold.png", version: "WS-1.1", dataCoverage: "ab 2019",
    modes: [
      wsMode("Valuation", "valuation", { sharpe: "0.623", cagr: "+8.1%", maxDrawdown: "-23.6%", calmar: "0.34", trades: "180", wfOos: "71%", profitFactor: "1.33", winrate: "57.8%" }),
      wsMode("Macro", "macro", { sharpe: "0.560", cagr: "+5.6%", maxDrawdown: "-25.5%", calmar: "0.22", trades: "136", wfOos: "100%", profitFactor: "1.29", winrate: "59.6%" }),
    ],
  },
  // WS-v1.1-archived: SI1 · HG1 · PL1 · PA1 · CL1 · NG1 · RB1 (kein Pass)
  phAsset("SI1!", "Silver",        "COMEX", [], "/asset-icons/silver.png"),
  phAsset("HG1!", "Copper",        "COMEX", [], "/asset-icons/Kupfer.webp"),
  phAsset("PL1!", "Platinum",      "NYMEX", [], "/asset-icons/platinum.png"),
  phAsset("PA1!", "Palladium",     "NYMEX", [], "/asset-icons/palladium.png"),
  phAsset("CL1!", "Crude Oil WTI", "NYMEX", [], "/asset-icons/crude_oil.png"),
  phAsset("NG1!", "Natural Gas",   "NYMEX", []),
  phAsset("RB1!", "RBOB Gasoline", "NYMEX", []),
];

const FX: AssetComponent[] = [
  // WS-v1.1-archived: EURGBP · GBPJPY · MXNUSD · NOKUSD · CLPUSD (kein Pass)
  phAsset("EURGBP", "EUR/GBP", "FX", [], "/asset-icons/eur.png"),
  phAsset("GBPJPY", "GBP/JPY", "FX", [], "/asset-icons/gbp.png"),
  phAsset("MXNUSD", "MXN/USD", "FX", []),
  phAsset("NOKUSD", "NOK/USD", "FX", []),
  phAsset("CLPUSD", "CLP/USD", "FX", []),
  {
    // WS-v1.1-archived modes: Trend · Macro
    symbol: "SEKUSD", symbolDisplay: "SEKUSD", label: "SEK/USD", assetId: "sekusd",
    exchange: "FX", version: "WS-1.1", dataCoverage: "ab 2019",
    modes: [
      wsMode("Valuation", "valuation", { sharpe: "0.314", cagr: "+1.9%", maxDrawdown: "-20.6%", calmar: "0.09", trades: "170", wfOos: "75%", profitFactor: "1.16", winrate: "52.4%" }),
    ],
  },
  {
    // WS-v1.1-archived modes: Trend · Macro
    symbol: "BRLUSD", symbolDisplay: "BRLUSD", label: "BRL/USD", assetId: "brlusd",
    exchange: "FX", version: "WS-1.1", dataCoverage: "ab 2019",
    modes: [
      wsMode("Valuation", "valuation", { sharpe: "0.320", cagr: "+2.4%", maxDrawdown: "-28.6%", calmar: "0.08", trades: "124", wfOos: "57%", profitFactor: "1.20", winrate: "55.6%" }),
    ],
  },
  {
    // WS-v1.1-archived modes: Trend · Macro
    symbol: "ZARUSD", symbolDisplay: "ZARUSD", label: "ZAR/USD", assetId: "zarusd",
    exchange: "FX", version: "WS-1.1", dataCoverage: "ab 2019",
    modes: [
      wsMode("Valuation", "valuation", { sharpe: "0.624", cagr: "+2.0%", maxDrawdown: "-26.9%", calmar: "0.07", trades: "249", wfOos: "91%", profitFactor: "1.27", winrate: "58.6%" }),
    ],
  },
];

const INDIZES: AssetComponent[] = [
  {
    // WS-v1.1-archived modes: Trend · Valuation · Macro
    symbol: "FDAX1!", symbolDisplay: "FDAX1!", label: "DAX Futures", assetId: "fdax1_",
    exchange: "EUREX", iconFile: "/asset-icons/dax.png", version: "WS-1.1", dataCoverage: "ab 2019",
    modes: [
      wsMode("Seasonal", "seasonal", { sharpe: "0.582", cagr: "+2.7%", maxDrawdown: "-2.4%", calmar: "1.13", trades: "7", wfOos: "70%", profitFactor: "5.69", winrate: "57.1%" }),
    ],
  },
  {
    // WS-v1.1-archived modes: Macro
    symbol: "ES1!", symbolDisplay: "ES1!", label: "S&P 500 Futures", assetId: "es1_",
    exchange: "CME", iconFile: "/asset-icons/SP.png", version: "WS-1.1", dataCoverage: "ab 2019",
    modes: [
      wsMode("Trend", "trend", { sharpe: "0.322", cagr: "+4.8%", maxDrawdown: "-34.1%", calmar: "0.14", trades: "128", wfOos: "65%", profitFactor: "1.22", winrate: "37.5%" }),
      wsMode("Valuation", "valuation", { sharpe: "0.891", cagr: "+6.8%", maxDrawdown: "-18.0%", calmar: "0.38", trades: "125", wfOos: "82%", profitFactor: "1.74", winrate: "62.4%" }),
      wsMode("Seasonal", "seasonal", { sharpe: "0.355", cagr: "+1.2%", maxDrawdown: "-6.6%", calmar: "0.18", trades: "7", wfOos: "75%", profitFactor: "2.38", winrate: "71.4%" }),
    ],
  },
  {
    // WS-v1.1-archived modes: Trend · Macro
    symbol: "YM1!", symbolDisplay: "YM1!", label: "Dow Jones Futures", assetId: "ym1_",
    exchange: "CBOT", iconFile: "/asset-icons/dow_jones.png", version: "WS-1.1", dataCoverage: "ab 2019",
    modes: [
      wsMode("Valuation", "valuation", { sharpe: "0.559", cagr: "+7.4%", maxDrawdown: "-35.8%", calmar: "0.21", trades: "140", wfOos: "93%", profitFactor: "1.39", winrate: "56.4%" }),
    ],
  },
  {
    // WS-v1.1-archived modes: Macro
    symbol: "NQ1!", symbolDisplay: "NQ1!", label: "Nasdaq 100 Fut.", assetId: "nq1_",
    exchange: "CME", iconFile: "/asset-icons/nasdaq.png", version: "WS-1.1", dataCoverage: "ab 2019",
    modes: [
      wsMode("Trend", "trend", { sharpe: "0.444", cagr: "+8.3%", maxDrawdown: "-35.9%", calmar: "0.23", trades: "96", wfOos: "94%", profitFactor: "1.35", winrate: "39.6%" }),
      wsMode("Valuation", "valuation", { sharpe: "0.421", cagr: "+5.0%", maxDrawdown: "-13.5%", calmar: "0.37", trades: "328", wfOos: "100%", profitFactor: "1.16", winrate: "53.4%" }),
    ],
  },
  {
    // WS-v1.1-archived modes: Trend
    symbol: "UKX!", symbolDisplay: "UKX!", label: "FTSE 100", assetId: "ukx_",
    exchange: "LSE", version: "WS-1.1", dataCoverage: "ab 2019",
    modes: [
      wsMode("Valuation", "valuation", { sharpe: "0.950", cagr: "+11.8%", maxDrawdown: "-21.1%", calmar: "0.56", trades: "41", wfOos: "97%", profitFactor: "0.93", winrate: "58.5%" }),
    ],
  },
];

const INVEST: AssetComponent[] = [
  phAsset("NAS100USD_E_STEP_INVEST",                 "E-Step Invest",  "OANDA", [phMode("Portfolio Sleeve", "portfolio_sleeve")], "/asset-icons/nasdaq.png"),
  phAsset("NAS100USD_ONLY_LONG_VALUATION_TREND_EMA", "Long Val. EMA",  "OANDA", [phMode("Portfolio Sleeve", "portfolio_sleeve")], "/asset-icons/nasdaq.png"),
  phAsset("USDCHF_CHF_INVEST",                       "CHF Invest",     "OANDA", [phMode("Portfolio Sleeve", "portfolio_sleeve")], "/asset-icons/chf.png"),
];

const INTRADAY_MT: AssetComponent[] = [
  {
    symbol: "DE30EUR_2H", symbolDisplay: "DE30EUR 2H", label: "DAX 2H",
    assetId: "de30eur_2h", exchange: "OANDA", iconFile: "/asset-icons/dax.png",
    version: "IT-1.0", dataCoverage: "IS 2007–2017",
    modes: [
      itMode("Intraday", "intraday",
        { wfOos: "5/8", profitFactor: "1.478", trades: "81",
          cagr: "+5.4%", maxDrawdown: "-19.9%", calmar: "0.270", winrate: "44.4%", sharpe: "1.526" },
        { detailNames: ["Gewicht: 15% · V4 Long-Only · 7/8 OOS-Jahre +", "IS PF 1.453 · Sweep+EMA · Sess 09–11 UTC", "SL ATR×0.8 · TP 3R · IB 1.5pt / ~50pt SL"] }),
    ],
  },
  {
    symbol: "DE30EUR_1H", symbolDisplay: "DE30EUR 1H", label: "DAX 1H",
    assetId: "de30eur_1h", exchange: "OANDA", iconFile: "/asset-icons/dax.png",
    version: "IT-1.0", dataCoverage: "IS 2007–2017",
    modes: [
      itMode("Intraday", "intraday",
        { wfOos: "5/8", profitFactor: "1.484", trades: "335",
          cagr: "+10.7%", maxDrawdown: "-12.4%", calmar: "0.865", winrate: "33.4%", sharpe: "2.683" },
        { detailNames: ["Gewicht: 40% · Archiv SL40/TP2.5R/BE1.5R", "SL 40pt · TP 2.5R · BE 1.5R next-bar · EMA 2", "IB 1.5pt RT / 40pt SL · Long-only · 07–12 UTC"] }),
    ],
  },
  {
    symbol: "EURUSD_30M", symbolDisplay: "EURUSD 30M", label: "EUR 30m",
    assetId: "eurusd_30m", exchange: "OANDA", iconFile: "/asset-icons/eurusd.png",
    version: "IT-1.0", dataCoverage: "IS 2007–2017",
    modes: [
      itMode("Intraday", "intraday",
        { wfOos: "7/8", profitFactor: "1.325", trades: "1 358",
          cagr: "+21.4%", maxDrawdown: "-18.7%", calmar: "1.145", winrate: "25.5%" },
        { detailNames: ["Gewicht: 40% · Anker-Strategie · WF 7/8", "SL 13 Pip · TP 3.0R · BE 1R next-bar · EMA 5", "IB 1 pip RT · require_engulfing · 08–12:30 UTC"] }),
    ],
  },
  {
    symbol: "GBPUSD_30M", symbolDisplay: "GBPUSD 30M", label: "GBP 30m",
    assetId: "gbpusd_30m", exchange: "OANDA", iconFile: "/asset-icons/gbpusd.png",
    version: "IT-1.0", dataCoverage: "IS 2007–2017",
    modes: [
      itMode("Intraday", "intraday",
        { wfOos: "8/8 IS", profitFactor: "1.743 IS", trades: "763 IS",
          cagr: "+35.5% IS", maxDrawdown: "-14.7% IS", calmar: "2.414 IS", winrate: "24.4%" },
        { detailNames: ["Gewicht: 5% · IS-Edge 8/8 · OOS Gate-Fail", "SL 10 Pip · TP 3.5R · BE 1R next-bar · 09–10:30", "IB 2 pip RT / 10 pip SL · Korr EUR −0.17"] }),
    ],
  },
];

const INTRADAY_PORTFOLIO: AssetComponent[] = [
  {
    symbol: "IT_PORTFOLIO", symbolDisplay: "IT Portfolio", label: "v3-F · 4 Strategien",
    assetId: "it_portfolio", exchange: "OANDA", iconFile: "/asset-icons/eurusd.png",
    version: "IT-1.0", dataCoverage: "OOS 2018–2026",
    modes: [
      itMode("Portfolio", "portfolio",
        { cagr: "+14.1%", maxDrawdown: "-8.1%", calmar: "1.732", trades: "2 520", sharpe: "1.526" },
        { detailNames: ["EUR 40% · DAX1H 40% · GBP 5% · DAX2H 15%", "MAR 1.732 · MaxDD −8.1% · n=2 520", "v3-F eingefroren 2026-07-18 · Grid-Sweep 49 Kombi"] }),
    ],
  },
];

// ── exported groups ──────────────────────────────────────────────────────────

export const COMPONENT_GROUPS: ComponentGroup[] = [
  { id: "agrar",           title: "Agrar",             sourceTab: "agrar",           meta: "CBOT/ICEUS · Paper-only",   assets: AGRI_COMPONENTS },
  { id: "aktien",          title: "Aktien",            sourceTab: "aktien",          meta: "NASDAQ · offen",            assets: AKTIEN },
  { id: "metalle_energie", title: "Metalle + Energie", sourceTab: "metalle_energie", meta: "COMEX/NYMEX · offen",       assets: METALLE_ENERGIE },
  { id: "fx",              title: "FX — Forex8",       sourceTab: "fx",              meta: "Spot FX · offen",           assets: FX },
  { id: "indizes",         title: "Indizes",           sourceTab: "indizes",         meta: "EUREX/CME/LSE · offen",     assets: INDIZES },
  { id: "invest",          title: "Invest",            sourceTab: "invest",          meta: "OANDA · offen",             assets: INVEST },
  { id: "intraday_mt",        title: "Intraday MT",           sourceTab: "intraday_mt",        meta: "OANDA · vIT-1.0 · PAPER_ONLY · v3-F", assets: INTRADAY_MT },
  { id: "intraday_portfolio", title: "Intraday Portfolio MT", sourceTab: "intraday_portfolio", meta: "4 Strategien · OOS 2018–2026 · v3-F", assets: INTRADAY_PORTFOLIO },
];

// ── layout: left/right bento arrangement ─────────────────────────────────────

export const GROUP_LAYOUT: Record<string, GroupLayout> = {
  agrar:           { colStart: 1,  colSpan: 8, row: 1 },
  aktien:          { colStart: 9,  colSpan: 8, row: 1 },
  metalle_energie: { colStart: 1,  colSpan: 8, row: 2 },
  indizes:         { colStart: 9,  colSpan: 5, row: 2 },
  invest:          { colStart: 14, colSpan: 3, row: 2 },
  fx:              { colStart: 1,  colSpan: 8, row: 3 },
  intraday_mt:        { colStart: 9,  colSpan: 4, row: 3 },
  intraday_portfolio: { colStart: 13, colSpan: 4, row: 3 },
};

export function buildComponentsCache() {
  return { groups: COMPONENT_GROUPS, layout: GROUP_LAYOUT };
}
