/**
 * White Swan v1.3 — active portfolio: 3 Intraday + 3 Anomaly (100% weight)
 * All other pillars (Valuation, Macro, Trend, Seasonal) set to "research" — not in portfolio.
 * Source: ws_paper_trading_config_v1_2.json + v1.3 allocation 2026-07-29
 */

export type Pillar = "valuation" | "macro" | "trend" | "seasonal" | "anomaly" | "intraday";
export type RowStatus = "active" | "archived" | "watch" | "research";

export interface StrategyRow {
  id: string;
  ticker: string;
  label: string;
  group: string;
  engine: string;
  pillar: Pillar;
  weight: number | null;       // portfolio weight %
  sharpeOos: number | null;
  cagr: string | null;         // formatted "+2.9%"
  maxDd: string | null;        // formatted "−23.6%"
  calmar: number | null;
  pf: number | null;
  trades: number | null;
  wfOos: string | null;        // "7/8" or "82%"
  status: RowStatus;
  dataFile?: string;           // relative path under /data/ for equity JSON
  intradayId?: string;         // id in /data/intraday-equity.json
  codexGroup?: string;         // group for /api/monitoring/codex-equity-curve
  codexSymbol?: string;        // symbol for /api/monitoring/codex-equity-curve
  isNotes?: string;            // IS-period note
  exchange?: string;
  brainPath?: string;          // key for /api/monitoring/brain-equity?key=... (e.g. "stocks/NVDA")
}

// ── Valuation Pillar — Research (not in v1.3 portfolio) ──────────────────────
const VALUATION: StrategyRow[] = [
  {
    id: "es1_val", ticker: "ES1!", label: "S&P 500", group: "Indizes",
    engine: "Valuation", pillar: "valuation", weight: null,
    sharpeOos: 0.876, cagr: "+6.8%", maxDd: "−18.0%", calmar: 0.38, pf: 1.74, trades: 125, wfOos: "82%",
    status: "research", exchange: "CME",
  },
  {
    id: "nvda_val", ticker: "NVDA", label: "Nvidia", group: "Aktien",
    engine: "Valuation", pillar: "valuation", weight: null,
    sharpeOos: 0.611, cagr: "+21.3%", maxDd: "−32.3%", calmar: 0.66, pf: 1.25, trades: 270, wfOos: "83%",
    status: "research", exchange: "NASDAQ", brainPath: "stocks/NVDA",
  },
  {
    id: "zarusd_val", ticker: "ZARUSD", label: "ZAR/USD", group: "Forex",
    engine: "Valuation", pillar: "valuation", weight: null,
    sharpeOos: 0.605, cagr: "+2.0%", maxDd: "−26.9%", calmar: 0.07, pf: 1.27, trades: 249, wfOos: "91%",
    status: "research", exchange: "FX", brainPath: "forex/ZARUSD",
  },
  {
    id: "gc1_val", ticker: "GC1!", label: "Gold", group: "Metalle",
    engine: "Valuation", pillar: "valuation", weight: null,
    sharpeOos: 0.609, cagr: "+8.1%", maxDd: "−23.6%", calmar: 0.34, pf: 1.33, trades: 180, wfOos: "71%",
    status: "research", exchange: "COMEX", brainPath: "metals_energy/GC1",
  },
  {
    id: "ym1_val", ticker: "YM1!", label: "Dow Jones", group: "Indizes",
    engine: "Valuation", pillar: "valuation", weight: null,
    sharpeOos: 0.545, cagr: "+7.4%", maxDd: "−35.8%", calmar: 0.21, pf: 1.39, trades: 140, wfOos: "93%",
    status: "research", exchange: "CBOT",
  },
  {
    id: "nq1_val", ticker: "NQ1!", label: "Nasdaq 100", group: "Indizes",
    engine: "Valuation", pillar: "valuation", weight: null,
    sharpeOos: 0.411, cagr: "+5.0%", maxDd: "−13.5%", calmar: 0.37, pf: 1.16, trades: 328, wfOos: "100%",
    status: "research", exchange: "CME",
  },
  {
    id: "msft_val", ticker: "MSFT", label: "Microsoft", group: "Aktien",
    engine: "Valuation", pillar: "valuation", weight: null,
    sharpeOos: 0.409, cagr: "+2.9%", maxDd: "−30.7%", calmar: 0.09, pf: 1.23, trades: 143, wfOos: "88%",
    status: "research", exchange: "NASDAQ", brainPath: "stocks/MSFT",
  },
  {
    id: "brlusd_val", ticker: "BRLUSD", label: "BRL/USD", group: "Forex",
    engine: "Valuation", pillar: "valuation", weight: null,
    sharpeOos: 0.295, cagr: "+2.4%", maxDd: "−28.6%", calmar: 0.08, pf: 1.20, trades: 124, wfOos: "57%",
    status: "research", exchange: "FX", brainPath: "forex/BRLUSD",
  },
  {
    id: "sekusd_val", ticker: "SEKUSD", label: "SEK/USD", group: "Forex",
    engine: "Valuation", pillar: "valuation", weight: null,
    sharpeOos: 0.283, cagr: "+1.9%", maxDd: "−20.6%", calmar: 0.09, pf: 1.16, trades: 170, wfOos: "75%",
    status: "research", exchange: "FX", brainPath: "forex/SEKUSD",
  },
  {
    id: "ukx_val", ticker: "UKX!", label: "FTSE 100", group: "Indizes",
    engine: "Valuation", pillar: "valuation", weight: null,
    sharpeOos: -0.064, cagr: "−0.50%", maxDd: "−17.42%", calmar: null, pf: 0.93, trades: 41, wfOos: null,
    status: "research",
    isNotes: "OOS 2019–2026 · Brain engine rerun 2026-07-26 · 41 Trades · PF 0.93 · previous 76-trade variant removed",
    exchange: "LSE",
  },
];

// ── Valuation archived (no WS-v1.1 pass) ────────────────────────────────────
const VALUATION_ARCHIVED: StrategyRow[] = [
  { id: "si1_arch",  ticker: "SI1!",  label: "Silver",     group: "Metalle", engine: "—", pillar: "valuation", weight: null, sharpeOos: null, cagr: null, maxDd: null, calmar: null, pf: null, trades: null, wfOos: null, status: "archived", exchange: "COMEX" },
  { id: "hg1_arch",  ticker: "HG1!",  label: "Copper",     group: "Metalle", engine: "—", pillar: "valuation", weight: null, sharpeOos: null, cagr: null, maxDd: null, calmar: null, pf: null, trades: null, wfOos: null, status: "archived", exchange: "COMEX" },
  { id: "pl1_arch",  ticker: "PL1!",  label: "Platinum",   group: "Metalle", engine: "—", pillar: "valuation", weight: null, sharpeOos: null, cagr: null, maxDd: null, calmar: null, pf: null, trades: null, wfOos: null, status: "archived", exchange: "NYMEX" },
  { id: "pa1_arch",  ticker: "PA1!",  label: "Palladium",  group: "Metalle", engine: "—", pillar: "valuation", weight: null, sharpeOos: null, cagr: null, maxDd: null, calmar: null, pf: null, trades: null, wfOos: null, status: "archived", exchange: "NYMEX" },
  { id: "cl1_arch",  ticker: "CL1!",  label: "Crude Oil",  group: "Energie", engine: "—", pillar: "valuation", weight: null, sharpeOos: null, cagr: null, maxDd: null, calmar: null, pf: null, trades: null, wfOos: null, status: "archived", exchange: "NYMEX" },
  { id: "ng1_arch",  ticker: "NG1!",  label: "Nat. Gas",   group: "Energie", engine: "—", pillar: "valuation", weight: null, sharpeOos: null, cagr: null, maxDd: null, calmar: null, pf: null, trades: null, wfOos: null, status: "archived", exchange: "NYMEX" },
  { id: "rb1_arch",  ticker: "RB1!",  label: "Gasoline",   group: "Energie", engine: "—", pillar: "valuation", weight: null, sharpeOos: null, cagr: null, maxDd: null, calmar: null, pf: null, trades: null, wfOos: null, status: "archived", exchange: "NYMEX" },
  { id: "eurgbp_arch", ticker: "EURGBP", label: "EUR/GBP", group: "Forex",   engine: "—", pillar: "valuation", weight: null, sharpeOos: null, cagr: null, maxDd: null, calmar: null, pf: null, trades: null, wfOos: null, status: "archived", exchange: "FX" },
  { id: "gbpjpy_arch", ticker: "GBPJPY", label: "GBP/JPY", group: "Forex",   engine: "—", pillar: "valuation", weight: null, sharpeOos: null, cagr: null, maxDd: null, calmar: null, pf: null, trades: null, wfOos: null, status: "archived", exchange: "FX" },
  { id: "mxn_arch",  ticker: "MXNUSD", label: "MXN/USD",  group: "Forex",   engine: "—", pillar: "valuation", weight: null, sharpeOos: null, cagr: null, maxDd: null, calmar: null, pf: null, trades: null, wfOos: null, status: "archived", exchange: "FX" },
  { id: "nok_arch",  ticker: "NOKUSD", label: "NOK/USD",  group: "Forex",   engine: "—", pillar: "valuation", weight: null, sharpeOos: null, cagr: null, maxDd: null, calmar: null, pf: null, trades: null, wfOos: null, status: "archived", exchange: "FX" },
  { id: "clp_arch",  ticker: "CLPUSD", label: "CLP/USD",  group: "Forex",   engine: "—", pillar: "valuation", weight: null, sharpeOos: null, cagr: null, maxDd: null, calmar: null, pf: null, trades: null, wfOos: null, status: "archived", exchange: "FX" },
  { id: "aapl_arch", ticker: "AAPL",   label: "Apple",    group: "Aktien",  engine: "—", pillar: "valuation", weight: null, sharpeOos: null, cagr: null, maxDd: null, calmar: null, pf: null, trades: null, wfOos: null, status: "archived", exchange: "NASDAQ" },
  { id: "meta_arch", ticker: "META",   label: "Meta",     group: "Aktien",  engine: "—", pillar: "valuation", weight: null, sharpeOos: null, cagr: null, maxDd: null, calmar: null, pf: null, trades: null, wfOos: null, status: "archived", exchange: "NASDAQ" },
  { id: "amzn_arch", ticker: "AMZN",   label: "Amazon",   group: "Aktien",  engine: "—", pillar: "valuation", weight: null, sharpeOos: null, cagr: null, maxDd: null, calmar: null, pf: null, trades: null, wfOos: null, status: "archived", exchange: "NASDAQ" },
];

// ── Macro Pillar — Research (not in v1.3 portfolio) ──────────────────────────
const MACRO: StrategyRow[] = [
  {
    id: "ct1_macro", ticker: "CT1!", label: "Cotton / Baumwolle", group: "Agrar",
    engine: "MacroA Filter", pillar: "macro", weight: null,
    sharpeOos: 0.758, cagr: "+9.5%", maxDd: "−28.7%", calmar: 0.33, pf: 1.47, trades: 142, wfOos: "75%",
    status: "research", exchange: "ICEUS", codexGroup: "agrar", codexSymbol: "CT1",
  },
  {
    id: "gc1_macro", ticker: "GC1!", label: "Gold", group: "Metalle",
    engine: "MacroC", pillar: "macro", weight: null,
    sharpeOos: 0.466, cagr: "+5.6%", maxDd: "−25.5%", calmar: 0.22, pf: 1.29, trades: 136, wfOos: "100%",
    status: "research", exchange: "COMEX", dataFile: "anomaly/gc1_friday_long.json",
  },
];

// ── Trend Pillar — Research (not in v1.3 portfolio) ──────────────────────────
const TREND: StrategyRow[] = [
  {
    id: "googl_trend", ticker: "GOOGL", label: "Alphabet", group: "Aktien",
    engine: "EMA 10/200", pillar: "trend", weight: null,
    sharpeOos: 0.657, cagr: "+16.9%", maxDd: "−36.1%", calmar: 0.47, pf: 1.45, trades: 121, wfOos: "77%",
    status: "research", exchange: "NASDAQ",
  },
  {
    id: "nq1_trend", ticker: "NQ1!", label: "Nasdaq 100", group: "Indizes",
    engine: "combF<20 Long-Only", pillar: "trend", weight: null,
    sharpeOos: 0.436, cagr: "+8.3%", maxDd: "−35.9%", calmar: 0.23, pf: 1.35, trades: 96, wfOos: "94%",
    status: "research", exchange: "CME",
  },
  {
    id: "es1_trend", ticker: "ES1!", label: "S&P 500", group: "Indizes",
    engine: "EMA 10/100", pillar: "trend", weight: null,
    sharpeOos: 0.312, cagr: "+4.8%", maxDd: "−34.1%", calmar: 0.14, pf: 1.22, trades: 128, wfOos: "65%",
    status: "research", exchange: "CME",
  },
];

// ── Seasonal Pillar — Research (not in v1.3 portfolio) ───────────────────────
// ── Seasonal Pillar (WS v2.0 · 40% portfolio · 12 WF-validated patterns) ─────
// Weights: grade-adjusted WF scores, normalized to 40% portfolio sleeve.
// A+ grade factor 1.0 · A grade factor 0.85 · sorted by weight desc.
const SEASONAL: StrategyRow[] = [
  {
    id: "spy_sea", ticker: "SPY", label: "S&P 500 ETF", group: "Indizes",
    engine: "M10D25 Long +30d", pillar: "seasonal", weight: 4.5,
    sharpeOos: 1.18, cagr: "+4.8%", maxDd: "−6.2%", calmar: 0.77, pf: 5.21, trades: 16, wfOos: "100%",
    status: "active", exchange: "ARCA",
    isNotes: "WF 100% · A+ · Rolling IS=10J, 16 Folds · Approved 2026-08-03",
  },
  {
    id: "zm1_sea", ticker: "ZM1!", label: "Soybean Meal", group: "Agrar",
    engine: "M10D01 Long +22d", pillar: "seasonal", weight: 4.2,
    sharpeOos: 1.12, cagr: "+4.8%", maxDd: "−18.5%", calmar: 0.26, pf: 4.21, trades: 32, wfOos: "93.8%",
    status: "active", exchange: "CBOT", codexGroup: "agrar", codexSymbol: "ZM1",
    isNotes: "WF 93.8% · A+ · Q4 Feed-Demand Peak · Approved 2026-08-03",
  },
  {
    id: "sb1_sea_l", ticker: "SB1!", label: "Sugar Sep LONG", group: "Agrar",
    engine: "M09D24 Long +10d", pillar: "seasonal", weight: 3.9,
    sharpeOos: 0.093, cagr: "+3.8%", maxDd: "−4.2%", calmar: null, pf: null, trades: 13, wfOos: "86.7%",
    status: "active", exchange: "ICEUS", codexGroup: "agrar", codexSymbol: "SB1",
    isNotes: "WF 86.7% · A+ · Brazil Crop-Season Pre-positioning · Approved 2026-08-03",
  },
  {
    id: "eem_sea", ticker: "EEM", label: "EM ETF Dez", group: "Indizes",
    engine: "M12D20 Long +5d", pillar: "seasonal", weight: 3.8,
    sharpeOos: 0.75, cagr: "+2.1%", maxDd: "−3.8%", calmar: 0.55, pf: 5.8, trades: 23, wfOos: "84.6%",
    status: "active", exchange: "ARCA",
    isNotes: "WF 84.6% · A+ · Year-End Window Dressing EM · Approved 2026-08-03",
  },
  {
    id: "hg1_sea", ticker: "HG1!", label: "Copper Feb LONG", group: "Metalle",
    engine: "M02D01 Long +20d", pillar: "seasonal", weight: 3.7,
    sharpeOos: 0.94, cagr: "+4.2%", maxDd: "−14.1%", calmar: 0.30, pf: 3.42, trades: 32, wfOos: "81.3%",
    status: "active", exchange: "COMEX",
    isNotes: "WF 81.3% · A+ · Post-CNY China Industrial Ramp · Approved 2026-08-03",
  },
  {
    id: "gc1_sea", ticker: "GC1!", label: "Gold Jan LONG", group: "Metalle",
    engine: "M01D08 Long +25d", pillar: "seasonal", weight: 3.4,
    sharpeOos: 0.82, cagr: "+3.9%", maxDd: "−12.4%", calmar: 0.31, pf: 3.15, trades: 24, wfOos: "75%",
    status: "active", exchange: "COMEX",
    isNotes: "WF 75% · A+ · India Jewelry Post-Holiday + CNY Demand · Approved 2026-08-03",
  },
  {
    id: "cl1_sea", ticker: "CL1!", label: "Crude Feb LONG", group: "Energie",
    engine: "M02D01 Long +120d", pillar: "seasonal", weight: 3.1,
    sharpeOos: 0.48, cagr: "+5.2%", maxDd: "−22.4%", calmar: 0.23, pf: 3.87, trades: 22, wfOos: "81.8%",
    status: "active", exchange: "NYMEX",
    isNotes: "WF 81.8% · A · Spring/Summer Demand Ramp · Approved 2026-08-03",
  },
  {
    id: "zc1_sea", ticker: "ZC1!", label: "Corn Jul SHORT", group: "Agrar",
    engine: "M07D14 Short +18d", pillar: "seasonal", weight: 3.1,
    sharpeOos: 0.040, cagr: "+0.3%", maxDd: "−5.3%", calmar: 0.06, pf: 3.20, trades: 16, wfOos: "80%",
    status: "active", exchange: "CBOT", codexGroup: "agrar", codexSymbol: "ZC1",
    isNotes: "WF 80% · A · Post-Pollination Harvest Pressure · Approved 2026-08-03",
  },
  {
    id: "zw1_sea", ticker: "ZW1!", label: "Wheat Dez LONG", group: "Agrar",
    engine: "M12D01 Long +20d", pillar: "seasonal", weight: 2.9,
    sharpeOos: 0.71, cagr: "+3.1%", maxDd: "−16.8%", calmar: 0.18, pf: 2.88, trades: 32, wfOos: "75%",
    status: "active", exchange: "CBOT",
    isNotes: "WF 75% · A · Winter Wheat Export Demand N.Africa/Middle East · Approved 2026-08-03",
  },
  {
    id: "zs1_sea", ticker: "ZS1!", label: "Soybean Jul SHORT", group: "Agrar",
    engine: "M07D15 Short +16d", pillar: "seasonal", weight: 2.6,
    sharpeOos: 0.31, cagr: "+2.1%", maxDd: "−8.4%", calmar: 0.25, pf: 2.94, trades: 13, wfOos: "68.8%",
    status: "active", exchange: "CBOT", codexGroup: "agrar", codexSymbol: "ZS1",
    isNotes: "WF 68.8% · A · US Harvest Pressure · Approved 2026-08-03",
  },
  {
    id: "cc1_sea", ticker: "CC1!", label: "Cocoa Apr LONG", group: "Agrar",
    engine: "M04D02 Long +16d", pillar: "seasonal", weight: 2.4,
    sharpeOos: 0.21, cagr: "+1.8%", maxDd: "−9.1%", calmar: 0.20, pf: 2.71, trades: 9, wfOos: "66.7%",
    status: "active", exchange: "ICEUS", codexGroup: "agrar", codexSymbol: "CC1",
    isNotes: "WF 66.7% · A · West Africa Mid-Crop Season · Approved 2026-08-03",
  },
  {
    id: "iwm_sea", ticker: "IWM", label: "Small Cap Mai LONG", group: "Indizes",
    engine: "M05D25 Long +5d", pillar: "seasonal", weight: 2.4,
    sharpeOos: 0.78, cagr: "+1.4%", maxDd: "−3.3%", calmar: 0.42, pf: 4.23, trades: 13, wfOos: "60%",
    status: "active", exchange: "ARCA",
    isNotes: "WF 60% · A · Sell-in-May Reversal Signal · Approved 2026-08-03",
  },
];

const SEASONAL_ARCHIVED: StrategyRow[] = [
  { id: "kc1_arch", ticker: "KC1!", label: "Coffee",   group: "Agrar", engine: "—", pillar: "seasonal", weight: null, sharpeOos: null, cagr: null, maxDd: null, calmar: null, pf: null, trades: null, wfOos: null, status: "archived", exchange: "ICEUS" },
];

// ── Anomaly Pillar (WS v2.0 · 27% portfolio · 3 × 9%) ───────────────────────
const ANOMALY: StrategyRow[] = [
  {
    id: "gc1_friday", ticker: "GC1!", label: "Gold", group: "Anomaly",
    engine: "Friday Long", pillar: "anomaly", weight: 9,
    sharpeOos: 1.54, cagr: "+4.18%", maxDd: "−6.87%", calmar: 0.61, pf: 2.28, trades: 377, wfOos: null,
    status: "active", dataFile: "anomaly/gc1_friday_long.json", exchange: "COMEX",
    isNotes: "OOS 2019–2026 · Walk-Forward approved · IS 2004–2018 (1096 trades) · v1.3 weight 15%",
  },
  {
    id: "gld_thursday", ticker: "GLD", label: "Gold ETF", group: "Anomaly",
    engine: "Thursday Long", pillar: "anomaly", weight: 9,
    sharpeOos: 0.506, cagr: "+3.38%", maxDd: "−7.29%", calmar: 0.46, pf: 1.21, trades: 379, wfOos: null,
    status: "active", dataFile: "anomaly/gld_thursday_long.json", exchange: "ARCA",
    isNotes: "OOS 2019–2026 · Walk-Forward approved · IS 2004–2018 (717 trades) · v1.3 weight 15%",
  },
  {
    id: "ym1_tat", ticker: "YM1!", label: "Dow Jones — TAT", group: "Anomaly",
    engine: "Turnaround Tuesday", pillar: "anomaly", weight: 9,
    sharpeOos: 0.348, cagr: "+1.24%", maxDd: "−6.64%", calmar: 0.19, pf: 1.21, trades: 164, wfOos: null,
    status: "active", dataFile: "anomaly/ym1_tat.json", exchange: "CBOT",
    isNotes: "OOS 2019–2026 · Walk-Forward approved · IS 2002–2018 (873 trades) · v1.3 weight 15%",
  },
];

// ── Intraday components (WS v2.0 · 33% portfolio) ────────────────────────────
// GBP was removed after failing the standalone OOS gate.
const INTRADAY: StrategyRow[] = [
  {
    id: "eurusd_30m", ticker: "6E1!", label: "EUR/USD Futures · 6E", group: "Intraday",
    engine: "Liquidity Sweep · ATR SL · TP 3R · BE 1R · 07–10:30 UTC", pillar: "intraday", weight: 13,
    sharpeOos: 1.535, cagr: "+21.4%", maxDd: "−18.7%", calmar: 1.145, pf: 1.325, trades: 1358, wfOos: "7/8",
    status: "active", exchange: "CME", intradayId: "EUR30m", codexGroup: "intraday", codexSymbol: "EURUSD_30M",
    isNotes: "TV-Parity 80.7% (988/1224) · Backtrader: 268 trades (regime), PF 1.097, Sharpe +0.09 · APPROVED_LIVE 2026-08-01",
  },
  {
    id: "dax_1h", ticker: "DAX 1H / MT", label: "DAX 1H", group: "Intraday",
    engine: "SL 40pt · TP 2.5R · BE 1.5R · 07–12 UTC", pillar: "intraday", weight: 13,
    sharpeOos: 2.683, cagr: "+10.7%", maxDd: "−12.4%", calmar: 0.865, pf: 1.484, trades: 335, wfOos: "5/8",
    status: "active", exchange: "EUREX", intradayId: "DAX1H", codexGroup: "intraday", codexSymbol: "DAX_1H",
  },
  {
    id: "dax_2h", ticker: "DAX 2H", label: "DAX 2H", group: "Intraday",
    engine: "SL ATR×0.8 · TP 3R · V4 Long-Only · 09–11 UTC", pillar: "intraday", weight: 7,
    sharpeOos: 2.459, cagr: "+5.4%", maxDd: "−19.9%", calmar: 0.270, pf: 1.478, trades: 81, wfOos: "5/8",
    status: "active", exchange: "EUREX", intradayId: "DAX2H", codexGroup: "intraday", codexSymbol: "DAX_2H",
  },
];

// ── Full registry (ordered for display) ─────────────────────────────────────
export const WS_STRATEGIES: StrategyRow[] = [
  ...VALUATION,
  ...VALUATION_ARCHIVED,
  ...MACRO,
  ...TREND,
  ...SEASONAL,
  ...SEASONAL_ARCHIVED,
  ...ANOMALY,
  ...INTRADAY,
];

export const PILLAR_META: Record<Pillar, { label: string; weight: string; color: string; count: number }> = {
  valuation: { label: "Valuation", weight: "Research", color: "#3d8bcd", count: 10 },
  macro:     { label: "Macro",     weight: "Research", color: "#e8a020", count: 2 },
  trend:     { label: "Trend",     weight: "Research", color: "#00c8a0", count: 3 },
  seasonal:  { label: "Seasonal",  weight: "40%",      color: "#a78bfa", count: 12 },
  anomaly:   { label: "Anomaly",   weight: "27%",      color: "#f472b6", count: 3 },
  intraday:  { label: "Intraday",  weight: "33%",      color: "#94a3b8", count: 3 },
};

// ── Core Invest (Research / Pre-Fund) ────────────────────────────────────────
export type CIPillar = "etf_core" | "ci_sleeve";
export type CIStatus = "historical_reference" | "research" | "partial_validation" | "parity_partial" | "parity_pending" | "rejected" | "validiert";

export interface CoreInvestRow {
  id: string;
  ticker: string;
  label: string;
  group: string;
  engine: string;
  pillar: CIPillar;
  weight: number;
  sharpe: number;
  pf: number | null;
  cagr: string | null;
  maxDd: string | null;
  calmar: number;
  trades: number | null;
  winRate: string | null;
  totalReturn: string | null;
  status: CIStatus;
  notes?: string;
}

// v2.0 weights: ETF-Core 80% (QQQ 45%, GLD 25%, SPMO 5%, SPY 5%) + Sleeves 20% (4×5%)
// Weights frozen 2026-07-20. Strategy sleeves are active TV-reference sleeves;
// exact Python/TradingView trade parity remains a separate validation layer.
export const CI_STRATEGIES: CoreInvestRow[] = [
  {
    id: "qqq_etf_ci", ticker: "QQQ", label: "Nasdaq 100 ETF (passiv)", group: "ETF-Core",
    engine: "Buy & Hold", pillar: "etf_core", weight: 45,
    sharpe: 0.81, pf: 1.00, cagr: "+15.74%", maxDd: "-53.55%", calmar: 0.29, trades: 1, winRate: "100% Hold", totalReturn: "+1728.90%", status: "historical_reference",
    notes: "TradingView OHLC 2006-08-18 bis 2026-07-07; Buy-and-hold Referenzposition.",
  },
  {
    id: "gld_ci", ticker: "GLD", label: "Gold ETF", group: "ETF-Core",
    engine: "Crisis Protection / Portfolio Hedge", pillar: "etf_core", weight: 25,
    sharpe: 0.63, pf: 1.00, cagr: "+9.60%", maxDd: "-45.56%", calmar: 0.21, trades: 1, winRate: "100% Hold", totalReturn: "+518.43%", status: "historical_reference",
    notes: "TradingView OHLC 2006-08-18 bis 2026-07-07; Buy-and-hold Hedge-Position.",
  },
  {
    id: "spmo_ci", ticker: "SPMO", label: "Invesco S&P 500 Momentum", group: "ETF-Core",
    engine: "Momentum / Alpha", pillar: "etf_core", weight: 5,
    sharpe: 0.92, pf: 1.00, cagr: "+18.04%", maxDd: "-31.31%", calmar: 0.58, trades: 1, winRate: "100% Hold", totalReturn: "+493.17%", status: "historical_reference",
    notes: "TradingView OHLC 2015-10-12 bis 2026-07-07; Buy-and-hold Momentum-Position.",
  },
  {
    id: "spy_ci", ticker: "SPY", label: "S&P 500 ETF", group: "ETF-Core",
    engine: "Buy & Hold / Benchmark", pillar: "etf_core", weight: 5,
    sharpe: 0.56, pf: 1.00, cagr: "+9.17%", maxDd: "-56.47%", calmar: 0.16, trades: 1, winRate: "100% Hold", totalReturn: "+472.12%", status: "historical_reference",
    notes: "TradingView OHLC 2006-08-18 bis 2026-07-07; Buy-and-hold Benchmark.",
  },
  {
    id: "qqq_pine1", ticker: "QQQ", label: "QQQ Pine 1", group: "Strategy Sleeve",
    engine: "SMA(400) + SMA(5) - Long/Cash - TP 2% - SL 25%", pillar: "ci_sleeve", weight: 10,
    sharpe: 1.18, pf: 1.602, cagr: "+3.44%", maxDd: "-8.71%", calmar: 0.40, trades: 642, winRate: "69.31%", totalReturn: "+95.19%", status: "validiert",
    notes: "TradingView-Referenz: 642 Trades, PF 1.602, MaxDD 8.71%, +95.19%; Engine-Parität bestätigt (next_open + intrabar SL/TP).",
  },
  {
    id: "hg1_ci", ticker: "HG1!", label: "Copper / HG", group: "Strategy Sleeve",
    engine: "Pine 2 EMA - Long/Cash - TP 4% - SL 2%", pillar: "ci_sleeve", weight: 5,
    sharpe: 1.36, pf: 2.082, cagr: "+9.23%", maxDd: "-40.43%", calmar: 0.23, trades: 88, winRate: "30.68%", totalReturn: "+483.82%", status: "validiert",
    notes: "TradingView-Referenz: 88 Trades, PF 2.082, MaxDD 40.43%, +483.82%; Engine-Parität bestätigt (EMA20/50, next_open, intrabar SL/TP).",
  },
  {
    id: "6s1_ci", ticker: "6S1!", label: "CHF / Swiss Franc", group: "Strategy Sleeve",
    engine: "Pine 2 EMA - Long/Cash - TP 4% - SL 2%", pillar: "ci_sleeve", weight: 5,
    sharpe: 0.42, pf: 1.266, cagr: "+0.84%", maxDd: "-23.66%", calmar: 0.04, trades: 65, winRate: "32.31%", totalReturn: "+17.92%", status: "validiert",
    notes: "TradingView-Referenz: 65 Trades, PF 1.266, MaxDD 23.66%, +17.92%; Engine-Parität bestätigt (EMA20/50, next_open, intrabar SL/TP).",
  },
];

export const CI_META: Record<CIPillar, { label: string; weight: string; color: string }> = {
  etf_core:  { label: "ETF-Core",        weight: "80%", color: "#3d8bcd" },
  ci_sleeve: { label: "Strategy Sleeve", weight: "20%", color: "#a78bfa" },
};

// ── Canonical portfolio KPIs (OOS 2019–2026, frozen) ────────────────────────
// No verified aggregate exists for the current WS v1.3 blend.
// Never display KPIs from older strategy runs as current portfolio KPIs.
export const WS_PORTFOLIO_KPIS = {
  sharpe:     "nicht validiert",
  cagr:       "nicht validiert",
  maxDd:      "nicht validiert",
  calmar:     "nicht validiert",
  strategies: "6",
  version:    "v1.3",
} as const;

// OOS metrics — Core Invest v2.0 (ohne QQQ_PINE_2_EMA, Pine1 10%).
// Recalculated 2026-07-30 with RF=0%, daily close-to-close returns, 2019-01-02 to 2026-07-07.
// Status: APPROVED_LIVE.
export const CI_PORTFOLIO_KPIS = {
  sharpe:     "1.153",
  cagr:       "+17.69%",
  maxDd:      "−22.49%",
  calmar:     "0.786",
  components: "8",
} as const;

// Core Invest v2.0 canonical allocation weights (decimals, must sum to 1.0)
export const CI_WEIGHTS = {
  QQQ_PASSIVE: 0.45,
  GLD:         0.25,
  SPMO:        0.05,
  SPY:         0.05,
  QQQ_PINE_1:  0.10,
  COPPER_HG:   0.05,
  CHF_6S:      0.05,
} as const;
