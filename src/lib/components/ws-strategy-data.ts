/**
 * White Swan v1.1 + Anomaly v1.2 — complete strategy registry
 * Source: White_Swan_v1.1_Portfolio.md (Brain 2026-07-17) + ws_paper_trading_config_v1_2.json
 */

export type Pillar = "valuation" | "macro" | "trend" | "seasonal" | "anomaly" | "intraday";
export type RowStatus = "active" | "archived" | "watch";

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

// ── Valuation Pillar (24% of portfolio · top 4 → 3%, rest → 2%) ─────────────
const VALUATION: StrategyRow[] = [
  {
    id: "es1_val", ticker: "ES1!", label: "S&P 500", group: "Indizes",
    engine: "Valuation", pillar: "valuation", weight: 3,
    sharpeOos: 0.876, cagr: "+6.8%", maxDd: "−18.0%", calmar: 0.38, pf: 1.74, trades: 125, wfOos: "82%",
    status: "active", exchange: "CME",
  },
  {
    id: "nvda_val", ticker: "NVDA", label: "Nvidia", group: "Aktien",
    engine: "Valuation", pillar: "valuation", weight: 3,
    sharpeOos: 0.611, cagr: "+21.3%", maxDd: "−32.3%", calmar: 0.66, pf: 1.25, trades: 270, wfOos: "83%",
    status: "active", exchange: "NASDAQ", brainPath: "stocks/NVDA",
  },
  {
    id: "zarusd_val", ticker: "ZARUSD", label: "ZAR/USD", group: "Forex",
    engine: "Valuation", pillar: "valuation", weight: 3,
    sharpeOos: 0.605, cagr: "+2.0%", maxDd: "−26.9%", calmar: 0.07, pf: 1.27, trades: 249, wfOos: "91%",
    status: "active", exchange: "FX", brainPath: "forex/ZARUSD",
  },
  {
    id: "gc1_val", ticker: "GC1!", label: "Gold", group: "Metalle",
    engine: "Valuation", pillar: "valuation", weight: 3,
    sharpeOos: 0.609, cagr: "+8.1%", maxDd: "−23.6%", calmar: 0.34, pf: 1.33, trades: 180, wfOos: "71%",
    status: "active", exchange: "COMEX", brainPath: "metals_energy/GC1",
  },
  {
    id: "ym1_val", ticker: "YM1!", label: "Dow Jones", group: "Indizes",
    engine: "Valuation", pillar: "valuation", weight: 2,
    sharpeOos: 0.545, cagr: "+7.4%", maxDd: "−35.8%", calmar: 0.21, pf: 1.39, trades: 140, wfOos: "93%",
    status: "active", exchange: "CBOT",
  },
  {
    id: "nq1_val", ticker: "NQ1!", label: "Nasdaq 100", group: "Indizes",
    engine: "Valuation", pillar: "valuation", weight: 2,
    sharpeOos: 0.411, cagr: "+5.0%", maxDd: "−13.5%", calmar: 0.37, pf: 1.16, trades: 328, wfOos: "100%",
    status: "active", exchange: "CME",
  },
  {
    id: "msft_val", ticker: "MSFT", label: "Microsoft", group: "Aktien",
    engine: "Valuation", pillar: "valuation", weight: 2,
    sharpeOos: 0.409, cagr: "+2.9%", maxDd: "−30.7%", calmar: 0.09, pf: 1.23, trades: 143, wfOos: "88%",
    status: "active", exchange: "NASDAQ", brainPath: "stocks/MSFT",
  },
  {
    id: "brlusd_val", ticker: "BRLUSD", label: "BRL/USD", group: "Forex",
    engine: "Valuation", pillar: "valuation", weight: 2,
    sharpeOos: 0.295, cagr: "+2.4%", maxDd: "−28.6%", calmar: 0.08, pf: 1.20, trades: 124, wfOos: "57%",
    status: "active", exchange: "FX", brainPath: "forex/BRLUSD",
  },
  {
    id: "sekusd_val", ticker: "SEKUSD", label: "SEK/USD", group: "Forex",
    engine: "Valuation", pillar: "valuation", weight: 2,
    sharpeOos: 0.283, cagr: "+1.9%", maxDd: "−20.6%", calmar: 0.09, pf: 1.16, trades: 170, wfOos: "75%",
    status: "active", exchange: "FX", brainPath: "forex/SEKUSD",
  },
  {
    id: "ukx_val", ticker: "UKX!", label: "FTSE 100", group: "Indizes",
    engine: "Valuation", pillar: "valuation", weight: 2,
    // Reproduced from Brain ws_step14_final_portfolio.py on 2026-07-26.
    sharpeOos: -0.064, cagr: "−0.50%", maxDd: "−17.42%", calmar: null, pf: 0.93, trades: 41, wfOos: null,
    status: "active",
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

// ── Macro Pillar (18% of portfolio = 60% × 30%, 2 × 9%) ─────────────────────
const MACRO: StrategyRow[] = [
  {
    id: "ct1_macro", ticker: "CT1!", label: "Cotton / Baumwolle", group: "Agrar",
    engine: "MacroA Filter", pillar: "macro", weight: 9,
    sharpeOos: 0.758, cagr: "+9.5%", maxDd: "−28.7%", calmar: 0.33, pf: 1.47, trades: 142, wfOos: "75%",
    status: "active", exchange: "ICEUS", codexGroup: "agrar", codexSymbol: "CT1",
  },
  {
    id: "gc1_macro", ticker: "GC1!", label: "Gold", group: "Metalle",
    engine: "MacroC", pillar: "macro", weight: 9,
    sharpeOos: 0.466, cagr: "+5.6%", maxDd: "−25.5%", calmar: 0.22, pf: 1.29, trades: 136, wfOos: "100%",
    status: "active", exchange: "COMEX", dataFile: "anomaly/gc1_friday_long.json",
  },
];

// ── Trend Pillar (9% of portfolio = 60% × 15%, 3 × 3%) ──────────────────────
const TREND: StrategyRow[] = [
  {
    id: "googl_trend", ticker: "GOOGL", label: "Alphabet", group: "Aktien",
    engine: "EMA 10/200", pillar: "trend", weight: 3,
    sharpeOos: 0.657, cagr: "+16.9%", maxDd: "−36.1%", calmar: 0.47, pf: 1.45, trades: 121, wfOos: "77%",
    status: "active", exchange: "NASDAQ",
  },
  {
    id: "nq1_trend", ticker: "NQ1!", label: "Nasdaq 100", group: "Indizes",
    engine: "combF<20 Long-Only", pillar: "trend", weight: 3,
    sharpeOos: 0.436, cagr: "+8.3%", maxDd: "−35.9%", calmar: 0.23, pf: 1.35, trades: 96, wfOos: "94%",
    status: "active", exchange: "CME",
  },
  {
    id: "es1_trend", ticker: "ES1!", label: "S&P 500", group: "Indizes",
    engine: "EMA 10/100", pillar: "trend", weight: 3,
    sharpeOos: 0.312, cagr: "+4.8%", maxDd: "−34.1%", calmar: 0.14, pf: 1.22, trades: 128, wfOos: "65%",
    status: "active", exchange: "CME",
  },
];

// ── Seasonal Pillar (9% of portfolio · top 2 → 2%, rest → 1%) ───────────────
const SEASONAL: StrategyRow[] = [
  {
    id: "fdax1_sea", ticker: "FDAX1!", label: "DAX Futures", group: "Indizes",
    engine: "M11D15 Long", pillar: "seasonal", weight: 2,
    sharpeOos: 0.173, cagr: "+2.7%", maxDd: "−2.4%", calmar: 1.13, pf: 5.69, trades: 7, wfOos: "70%",
    status: "active", exchange: "EUREX",
  },
  {
    id: "ct1_sea", ticker: "CT1!", label: "Cotton", group: "Agrar",
    engine: "M01D03 Long", pillar: "seasonal", weight: 2,
    sharpeOos: 0.139, cagr: "+2.4%", maxDd: "−1.9%", calmar: 1.26, pf: 13.96, trades: 8, wfOos: "75%",
    status: "active", exchange: "ICEUS", codexGroup: "agrar", codexSymbol: "CT1",
  },
  {
    id: "oj1_sea", ticker: "OJ1!", label: "Orange Juice", group: "Agrar",
    engine: "M06D28 Long", pillar: "seasonal", weight: 1,
    sharpeOos: 0.163, cagr: "+0.77%", maxDd: "−6.23%", calmar: 0.123, pf: 5.55, trades: 8, wfOos: null,
    status: "active", exchange: "ICEUS", codexGroup: "agrar", codexSymbol: "OJ1",
    isNotes: "OOS 2019–2026 · Brain engine rerun 2026-07-26 · 8 Trades · PF 5.55",
  },
  {
    id: "sb1_sea_s", ticker: "SB1!", label: "Sugar (Short)", group: "Agrar",
    engine: "M02D25 Short", pillar: "seasonal", weight: 1,
    sharpeOos: 0.123, cagr: "+6.2%", maxDd: "−6.7%", calmar: 0.93, pf: 3.85, trades: 8, wfOos: "100%",
    status: "active", exchange: "ICEUS", codexGroup: "agrar", codexSymbol: "SB1",
  },
  {
    id: "es1_sea", ticker: "ES1!", label: "S&P 500", group: "Indizes",
    engine: "M11D15 Long", pillar: "seasonal", weight: 1,
    sharpeOos: 0.065, cagr: "+1.2%", maxDd: "−6.6%", calmar: 0.18, pf: 2.38, trades: 7, wfOos: "75%",
    status: "active", exchange: "CME",
  },
  {
    id: "sb1_sea_l", ticker: "SB1!", label: "Sugar (Long)", group: "Agrar",
    engine: "M09D24 Long", pillar: "seasonal", weight: 1,
    sharpeOos: 0.093, cagr: "+3.8%", maxDd: "−4.2%", calmar: null, pf: null, trades: 7, wfOos: null,
    status: "active", exchange: "ICEUS", codexGroup: "agrar", codexSymbol: "SB1",
  },
  {
    id: "zc1_sea", ticker: "ZC1!", label: "Corn", group: "Agrar",
    engine: "M03D29 Long", pillar: "seasonal", weight: 1,
    sharpeOos: 0.040, cagr: "+0.3%", maxDd: "−5.3%", calmar: 0.06, pf: 3.20, trades: 8, wfOos: "62%",
    status: "active", exchange: "CBOT", codexGroup: "agrar", codexSymbol: "ZC1",
  },
];

const SEASONAL_ARCHIVED: StrategyRow[] = [
  { id: "zw1_arch", ticker: "ZW1!", label: "Wheat",    group: "Agrar", engine: "—", pillar: "seasonal", weight: null, sharpeOos: null, cagr: null, maxDd: null, calmar: null, pf: null, trades: null, wfOos: null, status: "archived", exchange: "CBOT" },
  { id: "zs1_arch", ticker: "ZS1!", label: "Soybeans", group: "Agrar", engine: "—", pillar: "seasonal", weight: null, sharpeOos: null, cagr: null, maxDd: null, calmar: null, pf: null, trades: null, wfOos: null, status: "archived", exchange: "CBOT" },
  { id: "cc1_arch", ticker: "CC1!", label: "Cocoa",    group: "Agrar", engine: "—", pillar: "seasonal", weight: null, sharpeOos: null, cagr: null, maxDd: null, calmar: null, pf: null, trades: null, wfOos: null, status: "archived", exchange: "ICEUS" },
  { id: "kc1_arch", ticker: "KC1!", label: "Coffee",   group: "Agrar", engine: "—", pillar: "seasonal", weight: null, sharpeOos: null, cagr: null, maxDd: null, calmar: null, pf: null, trades: null, wfOos: null, status: "archived", exchange: "ICEUS" },
];

// ── Anomaly Pillar (WS v1.2 · Source: ws_paper_trading_config_v1_2.json 2026-07-19) ─────────
// v1.2 WS-internal ratio GC1:GLD:YM1 = 10:10:20; portfolio share → 2%:2%:4% = 8% total
const ANOMALY: StrategyRow[] = [
  {
    id: "gc1_friday", ticker: "GC1!", label: "Gold", group: "Anomaly",
    engine: "Friday Long", pillar: "anomaly", weight: 2,
    sharpeOos: 1.54, cagr: "+4.18%", maxDd: "−6.87%", calmar: null, pf: 2.28, trades: 377, wfOos: null,
    status: "active", dataFile: "anomaly/gc1_friday_long.json", exchange: "COMEX",
    isNotes: "OOS 2019–2026 · Walk-Forward approved · IS 2004–2018 (1096 trades) · v1.2 config weight 10%",
  },
  {
    id: "gld_thursday", ticker: "GLD", label: "Gold ETF", group: "Anomaly",
    engine: "Thursday Long", pillar: "anomaly", weight: 2,
    sharpeOos: 0.506, cagr: "+3.38%", maxDd: "−7.29%", calmar: null, pf: 1.21, trades: 379, wfOos: null,
    status: "active", dataFile: "anomaly/gld_thursday_long.json", exchange: "NYSE",
    isNotes: "OOS 2019–2026 · Walk-Forward approved · IS 2004–2018 (717 trades) · v1.2 config weight 10%",
  },
  {
    id: "ym1_tat", ticker: "YM1!", label: "Dow Jones — TAT", group: "Anomaly",
    engine: "Turnaround Tuesday", pillar: "anomaly", weight: 4,
    sharpeOos: 0.348, cagr: "+1.24%", maxDd: "−6.64%", calmar: null, pf: 1.21, trades: 164, wfOos: null,
    status: "active", dataFile: "anomaly/ym1_tat.json", exchange: "CBOT",
    isNotes: "OOS 2019–2026 · Walk-Forward approved · IS 2002–2018 (873 trades) · v1.2 config weight 20% (highest diversification)",
  },
];

// ── Intraday components within White Swan ───────────────────────────────────
// These are individual White Swan components, not a separate portfolio.
// GBP was removed after failing the standalone OOS gate.
const INTRADAY: StrategyRow[] = [
  {
    id: "eurusd_30m", ticker: "6E1!", label: "EUR/USD Futures · 6E", group: "Intraday",
    engine: "SL 13pip · TP 3.0R · BE 1R · 08–12:30 UTC", pillar: "intraday", weight: 14,
    sharpeOos: 1.535, cagr: "+21.4%", maxDd: "−18.7%", calmar: 1.145, pf: 1.325, trades: 1358, wfOos: "7/8",
    status: "active", exchange: "CME", intradayId: "EUR30m", codexGroup: "intraday", codexSymbol: "EURUSD_30M",
  },
  {
    id: "dax_1h", ticker: "DAX 1H / MT", label: "DAX 1H", group: "Intraday",
    engine: "SL 40pt · TP 2.5R · BE 1.5R · 07–12 UTC", pillar: "intraday", weight: 14,
    sharpeOos: 2.683, cagr: "+10.7%", maxDd: "−12.4%", calmar: 0.865, pf: 1.484, trades: 335, wfOos: "5/8",
    status: "active", exchange: "OANDA", intradayId: "DAX1H", codexGroup: "intraday", codexSymbol: "DAX_1H",
  },
  {
    id: "dax_2h", ticker: "DAX 2H", label: "DAX 2H", group: "Intraday",
    engine: "SL ATR×0.8 · TP 3R · V4 Long-Only · 09–11 UTC", pillar: "intraday", weight: 4,
    sharpeOos: 2.459, cagr: "+5.4%", maxDd: "−19.9%", calmar: 0.270, pf: 1.478, trades: 81, wfOos: "5/8",
    status: "active", exchange: "OANDA", intradayId: "DAX2H", codexGroup: "intraday", codexSymbol: "DAX_2H",
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
  valuation: { label: "Valuation", weight: "40%", color: "#3d8bcd", count: 10 },
  macro:     { label: "Macro",     weight: "30%", color: "#e8a020", count: 2 },
  trend:     { label: "Trend",     weight: "15%", color: "#00c8a0", count: 3 },
  seasonal:  { label: "Seasonal",  weight: "15%", color: "#a78bfa", count: 7 },
  anomaly:   { label: "Anomaly",   weight: "v1.2", color: "#f472b6", count: 3 },
  intraday:  { label: "Intraday",  weight: "32%", color: "#94a3b8", count: 3 },
};

// ── Core Invest (Research / Pre-Fund) ────────────────────────────────────────
export type CIPillar = "etf_core" | "ci_sleeve";
export type CIStatus = "research" | "partial_validation" | "parity_pending" | "rejected";

export interface CoreInvestRow {
  id: string;
  ticker: string;
  label: string;
  group: string;
  engine: string;
  pillar: CIPillar;
  weight: number;
  pf: number | null;
  cagr: string | null;
  maxDd: string | null;
  trades: number | null;
  winRate: string | null;
  totalReturn: string | null;
  status: CIStatus;
  notes?: string;
}

// v2.0 weights: ETF-Core 80% (QQQ 45%, GLD 25%, SPMO 5%, SPY 5%) + Sleeves 20% (4×5%)
// Weights frozen 2026-07-20. Strategy engine and account-level validation failed.
export const CI_STRATEGIES: CoreInvestRow[] = [
  // ETF-Core (80%)
  {
    id: "qqq_etf_ci", ticker: "QQQ", label: "Nasdaq 100 ETF (passiv)", group: "ETF-Core",
    engine: "Buy & Hold", pillar: "etf_core", weight: 45,
    pf: null, cagr: "+15.74%", maxDd: "−53.55%", trades: null, winRate: null, totalReturn: "+1728.90%", status: "research",
    notes: "TradingView OHLC cache 2006-08-18 bis 2026-07-07; Buy-&-Hold Referenz, keine Strategy Engine.",
  },
  {
    id: "gld_ci", ticker: "GLD", label: "Gold ETF", group: "ETF-Core",
    engine: "Crisis Protection / Portfolio Hedge", pillar: "etf_core", weight: 25,
    pf: null, cagr: "+9.60%", maxDd: "−45.56%", trades: null, winRate: null, totalReturn: "+518.43%", status: "research",
    notes: "TradingView OHLC cache 2006-08-18 bis 2026-07-07; Buy-&-Hold Referenz, keine Strategy Engine.",
  },
  {
    id: "spmo_ci", ticker: "SPMO", label: "Invesco S&P 500 Momentum", group: "ETF-Core",
    engine: "Momentum / Alpha", pillar: "etf_core", weight: 5,
    pf: null, cagr: "+18.04%", maxDd: "−31.31%", trades: null, winRate: null, totalReturn: "+493.17%", status: "research",
    notes: "TradingView OHLC cache 2015-10-12 bis 2026-07-07; Buy-&-Hold Referenz, keine Strategy Engine.",
  },
  {
    id: "spy_ci", ticker: "SPY", label: "S&P 500 ETF", group: "ETF-Core",
    engine: "Buy & Hold / Benchmark", pillar: "etf_core", weight: 5,
    pf: null, cagr: "+9.17%", maxDd: "−56.47%", trades: null, winRate: null, totalReturn: "+472.12%", status: "research",
    notes: "TradingView OHLC cache 2006-08-18 bis 2026-07-07; Buy-&-Hold Benchmark.",
  },
  // Strategy Sleeves (20% · 4×5%)
  {
    id: "qqq_pine1", ticker: "QQQ", label: "QQQ Pine 1", group: "Strategy Sleeve",
    engine: "SMA(400) + SMA(5) · Long/Cash · TP 2% · SL 25%", pillar: "ci_sleeve", weight: 5,
    pf: 1.602, cagr: null, maxDd: "−8.71%", trades: 642, winRate: "69.31%", totalReturn: "+95.19%", status: "partial_validation",
    notes: "TradingView QQQ Daily: 642 Trades, PF 1.602, MaxDD 8.71%, +95.19%. Lokale Trade-Paritaet fehlt.",
  },
  {
    id: "qqq_pine2", ticker: "QQQ", label: "QQQ Pine 2 EMA", group: "Strategy Sleeve",
    engine: "EMA(20)/EMA(50) + Valuation · Long/Cash · TP 4% · SL 2%", pillar: "ci_sleeve", weight: 5,
    pf: null, cagr: null, maxDd: null, trades: null, winRate: null, totalReturn: null, status: "rejected",
    notes: "Abgelehnt: schwache TradingView-Referenz (+14.12%, PF 1.082, MaxDD 30.04%) und keine Python/TV Trade-Paritaet.",
  },
  {
    id: "hg1_ci", ticker: "HG1!", label: "Copper / HG", group: "Strategy Sleeve",
    engine: "Pine 2 EMA · Long/Cash · TP 4% · SL 2%", pillar: "ci_sleeve", weight: 5,
    pf: null, cagr: null, maxDd: null, trades: null, winRate: null, totalReturn: null, status: "rejected",
    notes: "Abgelehnt: alte Engine ignorierte Futures-Pointvalue; korrekte 5%-Sleeve-Groesse kann keinen HG1!-Kontrakt halten.",
  },
  {
    id: "6s1_ci", ticker: "6S1!", label: "CHF / Swiss Franc", group: "Strategy Sleeve",
    engine: "Pine 2 EMA · Long/Cash · TP 4% · SL 2%", pillar: "ci_sleeve", weight: 5,
    pf: null, cagr: null, maxDd: null, trades: null, winRate: null, totalReturn: null, status: "rejected",
    notes: "Abgelehnt: alte Engine ignorierte Futures-Pointvalue; korrekte 5%-Sleeve-Groesse kann keinen 6S1!-Kontrakt halten.",
  },
];

export const CI_META: Record<CIPillar, { label: string; weight: string; color: string }> = {
  etf_core:  { label: "ETF-Core",        weight: "80%", color: "#3d8bcd" },
  ci_sleeve: { label: "Strategy Sleeve", weight: "20%", color: "#a78bfa" },
};

// ── Canonical portfolio KPIs (OOS 2019–2026, frozen) ────────────────────────
// No verified aggregate exists for the current WS + Anomaly + Intraday blend.
// Never display KPIs from the older 22-strategy v1.1 run as current portfolio KPIs.
export const WS_PORTFOLIO_KPIS = {
  sharpe:     "nicht validiert",
  cagr:       "nicht validiert",
  maxDd:      "nicht validiert",
  calmar:     "nicht validiert",
  strategies: "28",
} as const;

// The current aggregate includes strategy sleeves without exact Pine execution
// parity. Historical approximation metrics must not be shown as validated OOS.
export const CI_PORTFOLIO_KPIS = {
  sharpe:     "ETF-Core 1.18",
  cagr:       "ETF-Core +13.89%",
  maxDd:      "ETF-Core −21.32%",
  calmar:     "ETF-Core 0.65",
  positions:  "8",
} as const;

// Core Invest v2.0 canonical allocation weights (decimals, must sum to 1.0)
export const CI_WEIGHTS = {
  QQQ_PASSIVE:    0.45,
  GLD:            0.25,
  SPMO:           0.05,
  SPY:            0.05,
  QQQ_PINE_1:     0.05,
  QQQ_PINE_2_EMA: 0.05,
  COPPER_HG:      0.05,
  CHF_6S:         0.05,
} as const;
