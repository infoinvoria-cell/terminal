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

// ── Anomaly Pillar (WS clean audit 2026-08-09 · GLD KEEP · DAX REJECT) ──
// clean audit 2026-08-09: DAX TAT REJECT — holdout 2021+ PF 0.995 (gate needs >1.0). WFO 6/9 positive PF 1.191 confirmed edge but post-2020 regime shift absorbs it. GLD sole active anomaly sleeve.
const ANOMALY: StrategyRow[] = [
  {
    id: "gc1_friday", ticker: "GC1!", label: "Gold", group: "Anomaly",
    engine: "Friday Long · Fri 18:00 UTC close → Mon close · ATR SL/TP", pillar: "anomaly", weight: null,
    sharpeOos: null, cagr: "+3.08%", maxDd: "−25.32%", calmar: 0.12, pf: 1.12, trades: 600, wfOos: "6/12",
    status: "watch", dataFile: "anomaly/gc1_friday_long.json", exchange: "COMEX",
    isNotes: "v2 audit 2026-08-09 · DXY-filtered WFO OOS PF 1.332 (11/13 folds positive) · DXY regime: close<SMA20 — META-SELECTION BIAS disclosed (chosen from 3 candidates on same OOS data) · PnL concentration PASS (best year 19.8% of total) · GC/GLD Pearson correlation −0.254 (0 simultaneous drawdown years, 6/13 diverge) · KHV 2021-2026 DXY-filtered PF 0.767 CAGR −3.57% (not pristine holdout) · Classification D: GLD+GC genuinely complementary — portfolio Sharpe 1.973 vs GC alone 0.975 · diversification ratio 1.532 · locked: ATR=10 SL=0.75× RR=1.25 · DXY frozen — no param change after KHV · production weight PENDING forward live confirmation",
  },
  {
    // ── Column reconciliation (2026-08-09 rev2) ────────────────────────────────
    // Column          | Field        | Value    | Source / Period
    // Status          | status       | "active" | confirmed all gates
    // PF              | pf           | 1.41     | v3 Phase 7 holdout 2021-2026 (locked params ATR=10 SL=0.75 no-TP)
    // Trades          | trades       | 274      | v3 Phase 7 holdout 2021-2026
    // CAGR            | cagr         | +4.96%   | v3 Phase 7 holdout 2021-2026
    // MaxDD           | maxDd        | −5.64%   | v3 Phase 7 holdout 2021-2026
    // Calmar          | calmar       | 0.88     | v3 Phase 7 holdout 2021-2026 (4.96/5.64)
    // Sharpe OOS      | sharpeOos    | null     | ISSUE 3: no pure WFO OOS Sharpe computable without daily return series.
    //                                             JSON OOS 0.506 spans WFO OOS 2019-2020 + KHV 2021-2026 (mixed phases).
    //                                             Set null; combined-period value documented in isNotes only.
    // WF Folds        | wfOos        | "11/12"  | v2 audit 12-fold WFO OOS 2009-2020 (5yr IS / 1yr OOS)
    // White Swan wt   | weight       | 9        | WS v1.3 allocation 2026-07-29
    // Exchange        | exchange     | "ARCA"   | GLD ETF listed NYSE Arca
    // Data file       | dataFile     | anomaly/gld_thursday_long.json | /public/data/; equity curve ends 2026-07-06
    // ──────────────────────────────────────────────────────────────────────────
    // ADDITIONAL VERIFIED METRICS (in isNotes — not displayed as table columns):
    //   IS 2004-2020 locked params (GoldFamily-v2):  818 trades  PF 1.573  Win% 55.9%  CAGR 8.85%  MaxDD 12.09%
    //   IS signal PF(R) pre-2021 (v2 Layer A):       817 trades  PF(R) 1.364  Win% 55.94%  AvgR 0.0604
    //   WFO v3 6-fold OOS 2015-2020:                 6/6 pos     Avg PF 1.375  Avg CAGR +4.05%  MinDD 5.74%  290 trades
    //   WFO v2 12-fold OOS 2009-2020:                11/12 pos   Agg PF 1.4516 CAGR +3.54%  MaxDD 5.74%  579 trades
    //     Refresh run (run_white_swan_gld_refresh.py): Agg PF 1.5825 610 trades (fold-boundary diff; both 11/12 positive)
    //   KNOWN HISTORICAL VALIDATION 2021-2026 (GoldFamily-v2, NOT pristine OOS):
    //     276 trades  PF 1.463  Win% 53.6%  CAGR +7.87%  MaxDD 8.69%
    //   Refresh run KHV:  276 trades  PF 1.4726  CAGR +7.92%  MaxDD 8.63%  Calmar 0.918
    //   JSON OOS 2019-2026 (gld_thursday_long.json, summary.oos): 379 trades Sharpe 0.506 PF 1.212 CAGR +3.38% MaxDD 7.29%
    //     — period mixes WFO OOS 2019-2020 + KHV 2021-2026; NOT a pure WFO OOS Sharpe
    //   2× cost stress (v3 Phase 10):                PF 1.261  CAGR +3.47%  MaxDD 6.15%  Calmar 0.563
    //
    // ── ISSUE 1: GLD data source map ─────────────────────────────────────────
    //   Backtrader canonical: Downloads/BATS_GLD, 1D_4975f.csv
    //     5437 lines (1 header + 5436 data rows)  2004-11-18 to 2026-07-01
    //   Alt file (older):     Downloads/BATS_GLD, 1D_76cae.csv
    //     5425 lines  2004-11-18 to 2026-06-12 (not used in v2/v3 audits)
    //   JSON equity source:   gld_thursday_long.json ends 2026-07-06 — generated from a
    //     separate newer data source not found on local disk (not BATS_GLD 1D_4975f.csv)
    //   "GLD(2).csv" (5440 rows, 2026-07-07 — referenced by coordinator): NOT FOUND on disk
    //   2026-07-02 IS a Thursday → one additional trade signal if data includes that bar
    //
    // ── ISSUE 2: live/forward tracking — RESOLVED 2026-08-09 ─────────────────
    //   liveStart: 2026-08-09 — FORWARD SIGNAL TRACKING commenced
    //   Event file: public/generated/monitoring/strategies/ARCA_GLD_thursday_long_events.json
    //   Pine script: WhiteSwan_GLD_Thursday_Close.pine — FIXED ATR=10 SL=0.75 (was PROVISIONAL ATR=14 SL=1.0)
    //   Forward trades: 0 (data ends 2026-07-01; next Thursday signal = 2026-08-14)
    //   trackingType: FORWARD_SIGNAL (signal-only, no broker execution)
    id: "gld_thursday", ticker: "GLD", label: "Gold ETF — Thursday Long", group: "Anomaly",
    engine: "Thursday Close → Friday Close · ATR=10 SL=0.75× · no-TP", pillar: "anomaly", weight: 9,
    sharpeOos: null, cagr: "+4.96%", maxDd: "−5.64%", calmar: 0.88, pf: 1.41, trades: 274, wfOos: "11/12",
    status: "active", dataFile: "anomaly/gld_thursday_long.json", exchange: "ARCA",
    isNotes: "v3 + v2 + GoldFamily-v2 + refresh 2026-08-09 — CONFIRMED KEEP · IS 2004–2020: 818 trades PF 1.573 Win% 55.9% CAGR +8.85% (GoldFamily-v2) · Refresh IS: 817 trades PF 1.569 CAGR +8.77% (run_white_swan_gld_refresh.py) · WFO v2 12-fold (OOS 2009–2020): 11/12 positive Agg PF 1.4516 579 trades · Refresh WFO: 11/12 Agg PF 1.5825 610 trades (fold-boundary diff — not discrepancy) · WFO v3 6-fold (OOS 2015–2020): 6/6 positive Avg PF 1.375 290 trades · HOLDOUT v3 2021–2026 (NOT PRISTINE OOS): CAGR +4.96% MaxDD 5.64% PF 1.412 Calmar 0.880 274 trades · KHV 2021–2026 (NOT PRISTINE OOS): PF 1.463–1.473 CAGR +7.87–7.92% MaxDD 8.63–8.69% 276 trades · Combined-period Sharpe 0.506 (JSON OOS 2019–2026, NOT pure WFO OOS) · 2× cost stress: PF 1.261 · locked: ATR=10 SL=0.75× no-TP · GLD CSV: BATS_GLD 1D_4975f.csv 5436 rows 2004-11-18→2026-07-01 · GLD(2).csv (5440 rows to 2026-07-07) PENDING — re-run refresh when available · Pine: ATR=10 SL=0.75 (fixed 2026-08-09) · liveStart: 2026-08-09 — FORWARD SIGNAL TRACKING · eventFile: ARCA_GLD_thursday_long_events.json · forwardTrades: 0 (next signal 2026-08-14)",
  },
  {
    id: "ym1_tat", ticker: "YM1!", label: "Dow Jones — TAT", group: "Anomaly",
    engine: "Tue Long after neg Mon · Mon close → Tue close · ATR=14 SL=1.0× TP=2R", pillar: "anomaly", weight: 9,
    sharpeOos: null, cagr: null, maxDd: null, calmar: 0.14, pf: 1.22, trades: 307, wfOos: "10/14",
    status: "active", dataFile: "anomaly/ym1_tat.json", exchange: "CBOT",
    isNotes: "KEEP — strategy confirmed · patch v1 2026-08-09 · Data: CBOT_MINI_DL YM1! 1D ff3f0.csv 6102 rows 2002-04-05→2026-06-22 · IS 2002–2018: PF 1.492 Win% 54.2% AvgR 0.093 (neg_monday filter) · IS plateau (120 combos ATR×SL×RR): 100% PF>1 min=1.047 median=1.166 max=1.506 · PRE-2021 WFO OOS 14-fold (OOS 2007–2020): 10/14 positive Agg PF 1.218 Exp +0.056R Total R +17.10 Calmar-R 0.143 CAGR +1.18% MaxDD −8.32% · KHV 2021–2025 (NOT PRISTINE OOS): 111 trades PF 1.191 Exp +0.039R · Roll audit: non-roll PF 1.284 / roll PF 1.193 — no artifact inflation · Cost model YM: avg ATR pre-2021 243pts 1R=$1,215 RT cost 0.012R net-exp +0.044R (PASS 2× stress) · GLD/YM corr −0.19 (0 simultaneous losing years 2009–2020) · Portfolio: all splits 30/70–70/30 Calmar>2.0; current 9%+9% equal-weight falls in robust plateau · locked: ATR=14 SL=1.0× RR=2.0 filter=neg_monday · ⚠ neg_monday filter provenance uncertain — original spec had 873 IS trades (unfiltered); filter was added post-spec; pre-2021 WFO test confirms filter improves edge (unfiltered PF 1.113 vs 1.218) but meta-selection bias cannot be fully excluded · weak cluster 2009–2012 (GFC aftermath) · allocation confirmed in robust plateau · scripts: run_white_swan_dow_tat_audit_v1.py / run_white_swan_dow_tat_patch.py",
  },
  {
    id: "fdax_tat", ticker: "FDAX1!", label: "DAX — Turnaround Tuesday", group: "Anomaly",
    engine: "TAT · Mon 17:30 Berlin close → Wed 17:30 · daily ATR SL/TP",
    pillar: "anomaly", weight: null,
    sharpeOos: null, cagr: null, maxDd: null, calmar: null, pf: 1.191, trades: 439, wfOos: "6/9",
    status: "archived", exchange: "EUREX",
    isNotes: "clean audit 2026-08-09 · FINAL VERDICT: REJECT · no regime filter · WFO 9 folds (2012-2020) 6/9 positive PF 1.191 Exp +0.051R Win% 54.4% N=439 — edge confirmed IS/WFO · holdout 2021+: PF 0.995 N=272 CAGR −0.19% MaxDD −8.0% — holdout gate FAILED (needs PF>1.0) · FDXS cost stress 1.5×: PF 1.171 (pass) · VIX filter already permanently rejected (v3c) · no regime filter resolves the cost-model gates but not the holdout · post-2020 regime shift absorbs edge · locked IS params: ATR=7 SL=1.25 RR=2.0",
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
  anomaly:   { label: "Anomaly",   weight: "27%",      color: "#f472b6", count: 4 },
  intraday:  { label: "Intraday",  weight: "33%",      color: "#94a3b8", count: 3 },
};

// ── Core Invest Active Alpha 2 (Final, 2026-08-02) ───────────────────────────
// Version: Active Alpha 2 · Stand: 2026-08-02
// Sleeve 1: ETF Factor (8 ETFs, 140% gross, -40% BIL cash-financing)
// Sleeve 2: Managed Futures Overlay (12 roots, trend L/S)
// Sleeve 3: Risk Scaling (1.4× multiplier, 1.6× long cap)
// Final ablation: CAGR 14.66% · Vol 22.30% · MaxDD -28.33% · Sharpe 0.663
// Source: Brain/05_Portfolios/Core_Invest/ — updated 2026-08-02

export type CIPillar = "etf_factor" | "managed_futures";
export type CIStatus =
  | "historical_reference"
  | "research"
  | "partial_validation"
  | "parity_partial"
  | "parity_pending"
  | "rejected"
  | "validiert"
  | "active_overlay"
  | "live_position";

export interface CoreInvestRow {
  id: string;
  ticker: string;
  label: string;
  group: string;
  engine: string;
  pillar: CIPillar;
  weight: number;
  sharpe: number | null;
  pf: number | null;
  cagr: string | null;
  maxDd: string | null;
  calmar: number | null;
  trades: number | null;
  winRate: string | null;
  totalReturn: string | null;
  status: CIStatus;
  notes?: string;
}

// ── Sleeve 1: ETF Factor ──────────────────────────────────────────────────────
// Brutto-Long 140% + BIL -40% = Net 100%
const CI_ETF_FACTOR: CoreInvestRow[] = [
  {
    id: "spy_aa2", ticker: "SPY", label: "S&P 500 ETF", group: "ETF Factor",
    engine: "Buy & Hold", pillar: "etf_factor", weight: 56,
    sharpe: 0.56, pf: 1.00, cagr: "+9.17%", maxDd: "-56.47%", calmar: 0.16, trades: 1, winRate: "100% Hold", totalReturn: "+472.12%", status: "historical_reference",
    notes: "S&P 500 Core; 56% Zielgewicht; historische B&H-Referenz ab 1993.",
  },
  {
    id: "qqq_aa2", ticker: "QQQ", label: "Nasdaq 100 ETF", group: "ETF Factor",
    engine: "Buy & Hold", pillar: "etf_factor", weight: 28,
    sharpe: 0.81, pf: 1.00, cagr: "+15.74%", maxDd: "-53.55%", calmar: 0.29, trades: 1, winRate: "100% Hold", totalReturn: "+1728.90%", status: "historical_reference",
    notes: "Growth/Nasdaq Core; 28% Zielgewicht.",
  },
  {
    id: "vlue_aa2", ticker: "VLUE", label: "iShares MSCI USA Value Factor", group: "ETF Factor",
    engine: "Buy & Hold", pillar: "etf_factor", weight: 16,
    sharpe: null, pf: 1.00, cagr: null, maxDd: null, calmar: null, trades: 1, winRate: "100% Hold", totalReturn: null, status: "historical_reference",
    notes: "Value Factor; 16% Zielgewicht; inception 2013.",
  },
  {
    id: "rsp_aa2", ticker: "RSP", label: "Invesco S&P 500 Equal Weight", group: "ETF Factor",
    engine: "Buy & Hold", pillar: "etf_factor", weight: 8.4,
    sharpe: null, pf: 1.00, cagr: null, maxDd: null, calmar: null, trades: 1, winRate: "100% Hold", totalReturn: null, status: "historical_reference",
    notes: "Equal Weight S&P 500; 8.4% Zielgewicht; inception 2003.",
  },
  {
    id: "qual_aa2", ticker: "QUAL", label: "iShares MSCI USA Quality Factor", group: "ETF Factor",
    engine: "Buy & Hold", pillar: "etf_factor", weight: 8.4,
    sharpe: null, pf: 1.00, cagr: null, maxDd: null, calmar: null, trades: 1, winRate: "100% Hold", totalReturn: null, status: "historical_reference",
    notes: "Quality Factor; 8.4% Zielgewicht; inception 2013.",
  },
  {
    id: "mtum_aa2", ticker: "MTUM", label: "iShares MSCI USA Momentum Factor", group: "ETF Factor",
    engine: "Buy & Hold", pillar: "etf_factor", weight: 8.4,
    sharpe: null, pf: 1.00, cagr: null, maxDd: null, calmar: null, trades: 1, winRate: "100% Hold", totalReturn: null, status: "historical_reference",
    notes: "Momentum Factor; 8.4% Zielgewicht; inception 2013.",
  },
  {
    id: "usmv_aa2", ticker: "USMV", label: "iShares MSCI USA Min Vol Factor", group: "ETF Factor",
    engine: "Buy & Hold", pillar: "etf_factor", weight: 8.4,
    sharpe: null, pf: 1.00, cagr: null, maxDd: null, calmar: null, trades: 1, winRate: "100% Hold", totalReturn: null, status: "historical_reference",
    notes: "Low Volatility Factor; 8.4% Zielgewicht; inception 2011.",
  },
  {
    id: "iwm_aa2", ticker: "IWM", label: "iShares Russell 2000 Small Cap", group: "ETF Factor",
    engine: "Buy & Hold", pillar: "etf_factor", weight: 6.4,
    sharpe: null, pf: 1.00, cagr: null, maxDd: null, calmar: null, trades: 1, winRate: "100% Hold", totalReturn: null, status: "historical_reference",
    notes: "Small Cap Factor; 6.4% Zielgewicht; inception 2000.",
  },
  {
    id: "bil_aa2", ticker: "BIL", label: "T-Bill ETF (Cash-Finanzierung)", group: "ETF Factor",
    engine: "Cash Financing (Short)", pillar: "etf_factor", weight: -40,
    sharpe: null, pf: null, cagr: null, maxDd: null, calmar: null, trades: null, winRate: "Short", totalReturn: null, status: "historical_reference",
    notes: "-40% BIL: Cash-Finanzierung für 140% Brutto-Long-Exposure; kein direktes Return-Asset.",
  },
];

// ── Sleeve 2: Managed Futures Overlay ────────────────────────────────────────
// 12 Roots, trendbasiert Long/Short. Live-Position 2026-07-31: 6J short 2 Kontrakte.
// Execution via Micro-Kontrakte (MES, MNQ, M6E, MJY, M6B, MSF, 1OZ, MHG, MCL, MNG, MZC, MZS).
const CI_MF_OVERLAY: CoreInvestRow[] = [
  { id: "es_aa2",  ticker: "ES1!",  label: "S&P 500 Futures (MES)",   group: "Equity",      engine: "Trend Long/Short", pillar: "managed_futures", weight: 0, sharpe: null, pf: null, cagr: null, maxDd: null, calmar: null, trades: null, winRate: null, totalReturn: null, status: "research", notes: "Equity Overlay; Micro: MES. Teil des Managed Futures Overlay." },
  { id: "nq_aa2",  ticker: "NQ1!",  label: "Nasdaq Futures (MNQ)",    group: "Equity",      engine: "Trend Long/Short", pillar: "managed_futures", weight: 0, sharpe: null, pf: null, cagr: null, maxDd: null, calmar: null, trades: null, winRate: null, totalReturn: null, status: "research", notes: "Equity Overlay; Micro: MNQ." },
  { id: "6e_aa2",  ticker: "6E1!",  label: "EUR/USD Futures (M6E)",   group: "FX",          engine: "Trend Long/Short", pillar: "managed_futures", weight: 0, sharpe: null, pf: null, cagr: null, maxDd: null, calmar: null, trades: null, winRate: null, totalReturn: null, status: "research", notes: "FX Overlay; Micro: M6E." },
  { id: "6j_aa2",  ticker: "6J1!",  label: "JPY/USD Futures (MJY)",   group: "FX",          engine: "Trend Long/Short", pillar: "managed_futures", weight: 0, sharpe: null, pf: null, cagr: null, maxDd: null, calmar: null, trades: null, winRate: null, totalReturn: null, status: "live_position", notes: "FX Overlay; Micro: MJY. LIVE: short 2 Kontrakte (2026-07-31)." },
  { id: "6b_aa2",  ticker: "6B1!",  label: "GBP/USD Futures (M6B)",   group: "FX",          engine: "Trend Long/Short", pillar: "managed_futures", weight: 0, sharpe: null, pf: null, cagr: null, maxDd: null, calmar: null, trades: null, winRate: null, totalReturn: null, status: "research", notes: "FX Overlay; Micro: M6B." },
  { id: "6s_aa2",  ticker: "6S1!",  label: "CHF/USD Futures (MSF)",   group: "FX",          engine: "Trend Long/Short", pillar: "managed_futures", weight: 0, sharpe: null, pf: null, cagr: null, maxDd: null, calmar: null, trades: null, winRate: null, totalReturn: null, status: "research", notes: "FX Overlay; Micro: MSF." },
  { id: "gc_aa2",  ticker: "GC1!",  label: "Gold Futures (1OZ)",      group: "Metals",      engine: "Trend Long/Short", pillar: "managed_futures", weight: 0, sharpe: null, pf: null, cagr: null, maxDd: null, calmar: null, trades: null, winRate: null, totalReturn: null, status: "research", notes: "Metals Overlay; 1OZ (scaled proxy)." },
  { id: "hg_aa2",  ticker: "HG1!",  label: "Copper Futures (MHG)",    group: "Metals",      engine: "Trend Long/Short", pillar: "managed_futures", weight: 0, sharpe: null, pf: null, cagr: null, maxDd: null, calmar: null, trades: null, winRate: null, totalReturn: null, status: "research", notes: "Metals Overlay; Micro: MHG." },
  { id: "cl_aa2",  ticker: "CL1!",  label: "Crude Oil Futures (MCL)", group: "Energy",      engine: "Trend Long/Short", pillar: "managed_futures", weight: 0, sharpe: null, pf: null, cagr: null, maxDd: null, calmar: null, trades: null, winRate: null, totalReturn: null, status: "research", notes: "Energy Overlay; Micro: MCL." },
  { id: "ng_aa2",  ticker: "NG1!",  label: "Nat. Gas Futures (MNG)",  group: "Energy",      engine: "Trend Long/Short", pillar: "managed_futures", weight: 0, sharpe: null, pf: null, cagr: null, maxDd: null, calmar: null, trades: null, winRate: null, totalReturn: null, status: "research", notes: "Energy Overlay; Micro: MNG." },
  { id: "zc_aa2",  ticker: "ZC1!",  label: "Corn Futures (MZC)",      group: "Agriculture", engine: "Trend Long/Short", pillar: "managed_futures", weight: 0, sharpe: null, pf: null, cagr: null, maxDd: null, calmar: null, trades: null, winRate: null, totalReturn: null, status: "research", notes: "Agriculture Overlay; MZC (synthetic history)." },
  { id: "zs_aa2",  ticker: "ZS1!",  label: "Soybean Futures (MZS)",   group: "Agriculture", engine: "Trend Long/Short", pillar: "managed_futures", weight: 0, sharpe: null, pf: null, cagr: null, maxDd: null, calmar: null, trades: null, winRate: null, totalReturn: null, status: "research", notes: "Agriculture Overlay; MZS (synthetic history)." },
];

export const CI_STRATEGIES: CoreInvestRow[] = [...CI_ETF_FACTOR, ...CI_MF_OVERLAY];

export const CI_META: Record<CIPillar, { label: string; weight: string; color: string }> = {
  etf_factor:      { label: "ETF Factor Sleeve", weight: "140% gross / 100% net", color: "#3d8bcd" },
  managed_futures: { label: "Managed Futures Overlay", weight: "12 Roots L/S",    color: "#a78bfa" },
};

// ── Canonical portfolio KPIs (OOS 2019–2026, frozen) ────────────────────────
export const WS_PORTFOLIO_KPIS = {
  sharpe:     "nicht validiert",
  cagr:       "nicht validiert",
  maxDd:      "nicht validiert",
  calmar:     "nicht validiert",
  strategies: "6",
  version:    "v1.3",
} as const;

// Final ablation KPIs — Core Invest Active Alpha 2 (2026-08-02)
// Source: Brain/05_Portfolios/Core_Invest/Core Invest Strategy.md
// Period: full backtest; Status: Research / Pre-Fund
export const CI_PORTFOLIO_KPIS = {
  sharpe:     "0.663",
  cagr:       "+14.66%",
  maxDd:      "−28.33%",
  calmar:     "0.517",
  components: "21",
  version:    "Active Alpha 2",
} as const;

// Active Alpha 2 canonical ETF Factor target weights (gross, decimals)
// Managed Futures Overlay: dynamic L/S per signal — no fixed weight
export const CI_WEIGHTS = {
  SPY:  0.56,
  QQQ:  0.28,
  VLUE: 0.16,
  RSP:  0.084,
  QUAL: 0.084,
  MTUM: 0.084,
  USMV: 0.084,
  IWM:  0.064,
  BIL:  -0.40,  // cash financing
} as const;
