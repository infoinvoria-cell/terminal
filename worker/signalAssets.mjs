// worker/signalAssets.mjs
// Single source of truth for EVERY asset the terminal uses, with its timeframes,
// strategy affiliation, tab, and the free provider assigned to it.
//
// Provider rule (keys you have: FINNHUB, TWELVE_DATA, FRED; TradingView = main):
//   - Exchange futures (CME/CBOT/COMEX/NYMEX/EUREX/ICE) -> "tradingview" (tv_live_feed)
//   - US stocks (NASDAQ)                                 -> "finnhub"
//   - FX pairs + ETFs + cash indices                    -> "twelvedata"
//   - Macro series                                       -> "fred"
//
// provider "tradingview" means the running tv_live_feed.py worker handles it
// (live_quotes + intraday bars) — the API worker skips those. The API worker
// (index.mjs) fetches the finnhub/twelvedata/fred assets.

export const ASSETS = [
  // ── Agrar (White Swan) — TradingView ──────────────────────────────
  { symbol: "ZC1!", name: "Corn",       source: "CBOT:ZC1!",  tabs: ["Agrar"],   timeframes: ["D"], strategy: "White Swan Agri",        provider: "tradingview" },
  { symbol: "ZW1!", name: "Wheat",      source: "CBOT:ZW1!",  tabs: ["Agrar"],   timeframes: ["D"], strategy: "White Swan Agri",        provider: "tradingview" },
  { symbol: "ZS1!", name: "Soybeans",   source: "CBOT:ZS1!",  tabs: ["Agrar"],   timeframes: ["D"], strategy: "White Swan Agri",        provider: "tradingview" },
  { symbol: "CC1!", name: "Cocoa",      source: "ICEUS:CC1!", tabs: ["Agrar"],   timeframes: ["D"], strategy: "White Swan Agri",        provider: "tradingview" },
  { symbol: "OJ1!", name: "Orange Juice", source: "ICEUS:OJ1!", tabs: ["Agrar"], timeframes: ["D"], strategy: "White Swan Agri",        provider: "tradingview" },
  { symbol: "SB1!", name: "Sugar",      source: "ICEUS:SB1!", tabs: ["Agrar"],   timeframes: ["D"], strategy: "White Swan Agri",        provider: "tradingview" },
  { symbol: "KC1!", name: "Coffee",     source: "ICEUS:KC1!", tabs: ["Agrar"],   timeframes: ["D"], strategy: "White Swan Agri",        provider: "tradingview" },
  { symbol: "CT1!", name: "Cotton",     source: "ICEUS:CT1!", tabs: ["Agrar"],   timeframes: ["D"], strategy: "White Swan Macro A",     provider: "tradingview" },

  // ── Metalle / Energie — TradingView ───────────────────────────────
  { symbol: "GC1!", name: "Gold",       source: "COMEX:GC1!", tabs: ["Metalle","Anomaly"], timeframes: ["D","60min"], strategy: "White Swan Friday / Anomaly", provider: "tradingview" },
  { symbol: "SI1!", name: "Silver",     source: "COMEX:SI1!", tabs: ["Metalle"], timeframes: ["D"], strategy: "Metals",                 provider: "tradingview" },
  { symbol: "PA1!", name: "Palladium",  source: "NYMEX:PA1!", tabs: ["Metalle"], timeframes: ["D"], strategy: "Metals",                 provider: "tradingview" },
  { symbol: "PL1!", name: "Platinum",   source: "NYMEX:PL1!", tabs: ["Metalle"], timeframes: ["D"], strategy: "Metals",                 provider: "tradingview" },
  { symbol: "HG1!", name: "Copper",     source: "COMEX:HG1!", tabs: ["Metalle","Invest"], timeframes: ["D"], strategy: "Core Invest Copper/HG", provider: "tradingview" },
  { symbol: "CL1!", name: "Crude Oil",  source: "NYMEX:CL1!", tabs: ["Energie"], timeframes: ["D"], strategy: "Energy",                 provider: "tradingview" },
  { symbol: "NG1!", name: "Natural Gas", source: "NYMEX:NG1!", tabs: ["Energie"], timeframes: ["D"], strategy: "Energy",                 provider: "tradingview" },
  { symbol: "RB1!", name: "Gasoline",   source: "NYMEX:RB1!", tabs: ["Energie"], timeframes: ["D"], strategy: "Energy",                 provider: "tradingview" },

  // ── Indizes — TradingView (UKX index -> TwelveData) ───────────────
  { symbol: "YM1!", name: "Dow Futures", source: "CBOT_MINI:YM1!", tabs: ["Indizes","Anomaly"], timeframes: ["D"], strategy: "White Swan TAT / Anomaly", provider: "tradingview" },
  { symbol: "NQ1!", name: "Nasdaq Futures", source: "CME_MINI:NQ1!", tabs: ["Indizes","Invest"], timeframes: ["D"], strategy: "White Swan Trend / E-Step Invest", provider: "tradingview" },
  { symbol: "ES1!", name: "S&P Futures", source: "CME_MINI:ES1!", tabs: ["Indizes"], timeframes: ["D"], strategy: "Index",              provider: "tradingview" },
  { symbol: "FDAX1!", name: "DAX Future", source: "EUREX:FDAX1!", tabs: ["Indizes","Intraday MT","Anomaly"], timeframes: ["D","1H","2H"], strategy: "Anomaly + Intraday MT (DAX 1H/2H)", provider: "tradingview" },
  { symbol: "UKX!", name: "FTSE 100",   source: "TVC:UKX!",   tabs: ["Indizes"], timeframes: ["D"], strategy: "White Swan Valuation",   provider: "twelvedata", apiSymbol: "UKX" },

  // ── FX Futures (CME currencies) — TradingView ─────────────────────
  { symbol: "6E1!", name: "Euro FX Future", source: "CME:6E1!", tabs: ["FX","Intraday MT"], timeframes: ["D","30M"], strategy: "Intraday MT Euro 30M", provider: "tradingview" },
  { symbol: "6B1!", name: "GBP FX Future", source: "CME:6B1!", tabs: ["FX","Intraday MT"], timeframes: ["D","30M"], strategy: "Intraday MT GBP 30M", provider: "tradingview" },
  { symbol: "6S1!", name: "CHF Future",  source: "CME:6S1!",  tabs: ["FX","Invest"], timeframes: ["D"], strategy: "Core Invest CHF/6S",  provider: "tradingview" },
  { symbol: "NOK1!", name: "NOK Future", source: "CME:NOK1!", tabs: ["FX"],      timeframes: ["1W"], strategy: "White Swan Macro NOK",   provider: "tradingview" },

  // ── FX Pairs — TwelveData ─────────────────────────────────────────
  { symbol: "EURGBP", name: "EUR/GBP",  source: "VANTAGE:EURGBP", tabs: ["FX"], timeframes: ["D"], strategy: "FX", provider: "twelvedata", apiSymbol: "EUR/GBP" },
  { symbol: "GBPJPY", name: "GBP/JPY",  source: "VANTAGE:GBPJPY", tabs: ["FX"], timeframes: ["D"], strategy: "FX", provider: "twelvedata", apiSymbol: "GBP/JPY" },
  { symbol: "MXNUSD", name: "MXN/USD",  source: "FX_IDC:MXNUSD",  tabs: ["FX"], timeframes: ["D"], strategy: "FX", provider: "twelvedata", apiSymbol: "MXN/USD" },
  { symbol: "CLPUSD", name: "CLP/USD",  source: "FX_IDC:CLPUSD",  tabs: ["FX"], timeframes: ["D"], strategy: "FX", provider: "twelvedata", apiSymbol: "CLP/USD" },
  { symbol: "SEKUSD", name: "SEK/USD",  source: "FX_IDC:SEKUSD",  tabs: ["FX"], timeframes: ["D"], strategy: "FX", provider: "twelvedata", apiSymbol: "SEK/USD" },
  { symbol: "BRLUSD", name: "BRL/USD",  source: "FX_IDC:BRLUSD",  tabs: ["FX"], timeframes: ["D"], strategy: "FX", provider: "twelvedata", apiSymbol: "BRL/USD" },
  { symbol: "ZARUSD", name: "ZAR/USD",  source: "FX_IDC:ZARUSD",  tabs: ["FX"], timeframes: ["D"], strategy: "FX", provider: "twelvedata", apiSymbol: "ZAR/USD" },

  // ── Aktien — Finnhub ──────────────────────────────────────────────
  { symbol: "AAPL", name: "Apple",     source: "NASDAQ:AAPL",  tabs: ["Aktien"], timeframes: ["D"], strategy: "Aktien", provider: "finnhub", apiSymbol: "AAPL" },
  { symbol: "MSFT", name: "Microsoft", source: "NASDAQ:MSFT",  tabs: ["Aktien"], timeframes: ["D"], strategy: "Aktien", provider: "finnhub", apiSymbol: "MSFT" },
  { symbol: "NVDA", name: "Nvidia",    source: "NASDAQ:NVDA",  tabs: ["Aktien"], timeframes: ["D"], strategy: "Aktien", provider: "finnhub", apiSymbol: "NVDA" },
  { symbol: "AMZN", name: "Amazon",    source: "NASDAQ:AMZN",  tabs: ["Aktien"], timeframes: ["D"], strategy: "Aktien", provider: "finnhub", apiSymbol: "AMZN" },
  { symbol: "GOOGL", name: "Alphabet", source: "NASDAQ:GOOGL", tabs: ["Aktien"], timeframes: ["D"], strategy: "Aktien", provider: "finnhub", apiSymbol: "GOOGL" },
  { symbol: "META", name: "Meta",      source: "NASDAQ:META",  tabs: ["Aktien"], timeframes: ["D"], strategy: "Aktien", provider: "finnhub", apiSymbol: "META" },

  // ── Invest ETFs — TwelveData ──────────────────────────────────────
  { symbol: "QQQ",  name: "Nasdaq ETF (QQQ)", source: "NASDAQ:QQQ", tabs: ["Invest"], timeframes: ["D"], strategy: "Core Invest QQQ Pine", provider: "twelvedata", apiSymbol: "QQQ" },

  // ── Anleihen — TradingView ────────────────────────────────────────
  { symbol: "ZB1!", name: "30Y T-Bond", source: "CBOT:ZB1!", tabs: ["Anleihen"], timeframes: ["D"], strategy: "Pine2 comparison", provider: "tradingview" },

  // ── Makro (Globe / comparisons) — FRED ────────────────────────────
  { symbol: "VIX",  name: "VIX",          source: "FRED:VIXCLS",           tabs: ["Makro"], timeframes: ["D"], strategy: "Macro", provider: "fred", fredId: "VIXCLS" },
  { symbol: "DXY",  name: "Dollar Index", source: "FRED:DTWEXBGS",         tabs: ["Makro"], timeframes: ["D"], strategy: "Macro", provider: "fred", fredId: "DTWEXBGS" },
  { symbol: "TNX",  name: "10Y Treasury", source: "FRED:DGS10",            tabs: ["Makro"], timeframes: ["D"], strategy: "Macro", provider: "fred", fredId: "DGS10" },
  { symbol: "DGS2", name: "2Y Treasury",  source: "FRED:DGS2",             tabs: ["Makro"], timeframes: ["D"], strategy: "Macro", provider: "fred", fredId: "DGS2" },
  { symbol: "CL_SPOT", name: "WTI Spot",  source: "FRED:DCOILWTICO",       tabs: ["Makro"], timeframes: ["D"], strategy: "Macro", provider: "fred", fredId: "DCOILWTICO" },
  { symbol: "GC_SPOT", name: "Gold Fix",  source: "FRED:GOLDAMGBD228NLBM", tabs: ["Makro"], timeframes: ["D"], strategy: "Macro", provider: "fred", fredId: "GOLDAMGBD228NLBM" },
];

export const byProvider = (name) => ASSETS.filter((a) => a.provider === name);
export const apiAssets = () => ASSETS.filter((a) => a.provider !== "tradingview"); // handled by index.mjs
export const tradingViewAssets = () => ASSETS.filter((a) => a.provider === "tradingview"); // handled by tv_live_feed

export const SUMMARY = {
  total: ASSETS.length,
  tradingview: byProvider("tradingview").length,
  finnhub: byProvider("finnhub").length,
  twelvedata: byProvider("twelvedata").length,
  fred: byProvider("fred").length,
};
