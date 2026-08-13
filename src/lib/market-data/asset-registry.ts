/**
 * Unified Asset Registry
 *
 * Single source of truth for all ~80 assets:
 * - TradingView symbol (canonical)
 * - Supabase live_quotes symbol
 * - Dukascopy instrument (Forex/CFD only)
 * - Asset class → poll interval + provider chain
 */

import type { AssetDefinition, AssetClass, ProviderId } from "./types";

function def(
  id: string,
  name: string,
  cls: AssetClass,
  tvSymbol: string,
  liveQuotesSymbol: string,
  dukascopyInstrument: string | null,
  historyProviders: ProviderId[],
  sessionTimezone = "America/New_York",
): AssetDefinition {
  const isIntraday = cls === "intraday_forex" || cls === "intraday_futures";
  return {
    id,
    name,
    class: cls,
    tvSymbol,
    liveQuotesSymbol,
    dukascopyInstrument,
    historyProviders,
    pollIntervalMs: isIntraday ? 5_000 : 30_000,
    liveDelayMinutes: 15,
    sessionTimezone,
  };
}

/**
 * Complete asset registry — add new assets here only.
 * Components and API routes read from this, never from their own local maps.
 */
export const ASSET_REGISTRY: AssetDefinition[] = [
  // ── Intraday MT (Forex futures) ──────────────────────────────────────
  def("eurusd_30m",  "EUR/USD 30M",  "intraday_forex",   "CME:6E1!",        "6E1!",   "EUR/USD", ["supabase_quotes", "tv_cache", "local_csv"], "Europe/Berlin"),
  def("gbpusd_30m",  "GBP/USD 30M",  "intraday_forex",   "CME:6B1!",        "6B1!",   "GBP/USD", ["supabase_quotes", "tv_cache", "local_csv"], "Europe/Berlin"),
  def("dax_1h",      "DAX 1H",       "intraday_futures", "EUREX:FDAX1!",    "FDAX1!", null,      ["supabase_quotes", "tv_cache", "local_csv"], "Europe/Berlin"),
  def("dax_2h",      "DAX 2H",       "intraday_futures", "EUREX:FDAX1!",    "FDAX1!", null,      ["supabase_quotes", "tv_cache", "local_csv"], "Europe/Berlin"),

  // ── White Swan Portfolio ─────────────────────────────────────────────
  def("gld_etf",  "GLD ETF",         "daily_etf",        "AMEX:GLD",        "GLD",    null,      ["tv_cache", "supabase_ohlc"]),
  def("gld_ci",   "Gold (CI)",        "daily_etf",        "AMEX:GLD",        "GLD",    null,      ["tv_cache", "supabase_ohlc"]),
  def("gc1",      "Gold Futures",     "daily_futures",    "COMEX:GC1!",      "GC1!",   "XAU/USD", ["tv_cache", "supabase_ohlc", "local_csv"]),
  def("ym1",      "Dow Futures",      "daily_futures",    "CME_MINI:YM1!",   "YM1!",   null,      ["tv_cache", "supabase_ohlc"]),
  def("nq1",      "Nasdaq Futures",   "daily_futures",    "CME_MINI:NQ1!",   "NQ1!",   null,      ["tv_cache", "supabase_ohlc"]),
  def("ct1",      "Cotton Futures",   "daily_commodities","ICEUS:CT1!",      "CT1!",   null,      ["tv_cache", "supabase_ohlc"]),
  def("ukx",      "FTSE 100",         "daily_index",      "TVC:UKX",         "UKX",    null,      ["tv_cache", "supabase_ohlc"], "Europe/London"),

  // ── Core Invest ──────────────────────────────────────────────────────
  def("qqq",   "QQQ ETF",         "daily_etf",     "BATS:QQQ",        "QQQ",    null, ["tv_cache", "supabase_ohlc"]),
  def("spmo",  "SPMO ETF",        "daily_etf",     "BATS:SPMO",       "SPMO",   null, ["tv_cache", "supabase_ohlc"]),
  def("spy",   "SPY ETF",         "daily_etf",     "BATS:SPY",        "SPY",    null, ["tv_cache", "supabase_ohlc"]),
  def("hg1",   "Copper Futures",  "daily_futures", "COMEX:HG1!",      "HG1!",   null, ["tv_cache", "supabase_ohlc"]),
  def("6s1",   "CHF Futures",     "daily_fx",      "CME:6S1!",        "6S1!",   "USD/CHF", ["tv_cache", "supabase_ohlc"], "Europe/Zurich"),
  def("glgg",  "GLGG.L",          "daily_etf",     "LSE:GLGG",        "GLGG",   null, ["tv_cache", "supabase_ohlc"], "Europe/London"),
  def("fiw",   "FIW ETF",         "daily_etf",     "BATS:FIW",        "FIW",    null, ["tv_cache", "supabase_ohlc"]),

  // ── CME Forex Futures ────────────────────────────────────────────────
  def("6e1",    "EUR/USD Futures", "daily_fx",      "CME:6E1!",        "6E1!",   "EUR/USD", ["tv_cache", "supabase_ohlc", "local_csv"], "Europe/Berlin"),
  def("6b1",    "GBP/USD Futures", "daily_fx",      "CME:6B1!",        "6B1!",   "GBP/USD", ["tv_cache", "supabase_ohlc", "local_csv"], "Europe/London"),
  def("6j1",    "JPY Futures",     "daily_fx",      "CME:6J1!",        "6J1!",   "USD/JPY", ["tv_cache", "supabase_ohlc", "local_csv"], "Asia/Tokyo"),
  def("6s1_fx", "CHF Futures",     "daily_fx",      "CME:6S1!",        "6S1!",   "USD/CHF", ["tv_cache", "supabase_ohlc", "local_csv"], "Europe/Zurich"),
  def("6a1",    "AUD Futures",     "daily_fx",      "CME:6A1!",        "6A1!",   "AUD/USD", ["tv_cache", "supabase_ohlc", "local_csv"], "Australia/Sydney"),
  def("6c1",    "CAD Futures",     "daily_fx",      "CME:6C1!",        "6C1!",   "USD/CAD", ["tv_cache", "supabase_ohlc", "local_csv"], "America/Toronto"),

  // ── Macro ────────────────────────────────────────────────────────────
  def("dxy",  "US Dollar Index",  "daily_index",   "TVC:DXY",         "DXY",    null, ["tv_cache", "supabase_ohlc"]),
  def("vix",  "VIX",              "daily_index",   "TVC:VIX",         "VIX",    null, ["tv_cache", "supabase_ohlc"]),
  def("tnx",  "US 10Y Yield",     "daily_bonds",   "TVC:US10Y",       "TNX",    null, ["tv_cache", "supabase_ohlc"]),
  def("us2y", "US 2Y Yield",      "daily_bonds",   "TVC:US02Y",       "DGS2",   null, ["tv_cache", "supabase_ohlc"]),

  // ── Major FX (spot) ──────────────────────────────────────────────────
  def("usdjpy",    "USD/JPY",  "daily_fx", "OANDA:USDJPY",  "USDJPY",  "USD/JPY", ["tv_cache", "local_csv"], "Asia/Tokyo"),
  def("audusd",    "AUD/USD",  "daily_fx", "OANDA:AUDUSD",  "AUDUSD",  "AUD/USD", ["tv_cache", "local_csv"], "Australia/Sydney"),
  def("usdcad",    "USD/CAD",  "daily_fx", "OANDA:USDCAD",  "USDCAD",  "USD/CAD", ["tv_cache", "local_csv"], "America/Toronto"),
  def("nzdusd",    "NZD/USD",  "daily_fx", "OANDA:NZDUSD",  "NZDUSD",  "NZD/USD", ["tv_cache", "local_csv"], "Pacific/Auckland"),
  def("usdchf_fx", "USD/CHF",  "daily_fx", "OANDA:USDCHF",  "USDCHF",  "USD/CHF", ["tv_cache", "local_csv"], "Europe/Zurich"),

  // ── Cross Pairs ──────────────────────────────────────────────────────
  def("eurgbp_fx", "EUR/GBP", "daily_fx", "OANDA:EURGBP", "EURGBP", "EUR/GBP", ["tv_cache", "local_csv"], "Europe/London"),
  def("eurjpy_fx", "EUR/JPY", "daily_fx", "OANDA:EURJPY", "EURJPY", "EUR/JPY", ["tv_cache", "local_csv"], "Asia/Tokyo"),
  def("gbpjpy_fx", "GBP/JPY", "daily_fx", "OANDA:GBPJPY", "GBPJPY", "GBP/JPY", ["tv_cache", "local_csv"], "Asia/Tokyo"),
  def("audcad_fx", "AUD/CAD", "daily_fx", "OANDA:AUDCAD", "AUDCAD", "AUD/CAD", ["tv_cache"], "Australia/Sydney"),
  def("eurchf_fx", "EUR/CHF", "daily_fx", "OANDA:EURCHF", "EURCHF", "EUR/CHF", ["tv_cache"], "Europe/Zurich"),
  def("usdmxn_fx", "USD/MXN", "daily_fx", "OANDA:USDMXN", "USDMXN", "USD/MXN", ["tv_cache"]),
  def("usdzar_fx", "USD/ZAR", "daily_fx", "OANDA:USDZAR", "USDZAR", "USD/ZAR", ["tv_cache"]),
  def("usdtry_fx", "USD/TRY", "daily_fx", "OANDA:USDTRY", "USDTRY", "USD/TRY", ["tv_cache"]),

  // ── Equity Indices ───────────────────────────────────────────────────
  def("sp500_idx",     "S&P 500",      "daily_index", "CME_MINI:ES1!",   "ES1!",    null, ["tv_cache", "supabase_ohlc"]),
  def("nasdaq_idx",    "Nasdaq 100",   "daily_index", "CME_MINI:NQ1!",   "NQ1!",    null, ["tv_cache", "supabase_ohlc"]),
  def("dow_idx",       "Dow Jones",    "daily_index", "CME_MINI:YM1!",   "YM1!",    null, ["tv_cache", "supabase_ohlc"]),
  def("russell2k",     "Russell 2000", "daily_index", "CME_MINI:RTY1!",  "RTY1!",   null, ["tv_cache", "supabase_ohlc"]),
  def("dax_idx",       "DAX",          "daily_index", "EUREX:FDAX1!",    "FDAX1!",  null, ["tv_cache", "supabase_ohlc"], "Europe/Berlin"),
  def("cac40_idx",     "CAC 40",       "daily_index", "EURONEXT:CAC40",  "CAC40",   null, ["tv_cache"], "Europe/Paris"),
  def("eurostoxx_idx", "Euro Stoxx 50","daily_index", "EUREX:FESX1!",    "FESX1!",  null, ["tv_cache"], "Europe/Berlin"),
  def("nikkei_idx",    "Nikkei 225",   "daily_index", "OSE:NK225",       "NK225",   null, ["tv_cache"], "Asia/Tokyo"),
  def("hsi_idx",       "Hang Seng",    "daily_index", "HKEX:HSI",        "HSI",     null, ["tv_cache"], "Asia/Hong_Kong"),
  def("asx200_idx",    "ASX 200",      "daily_index", "ASX:XJO",         "XJO",     null, ["tv_cache"], "Australia/Sydney"),
  def("ibex_idx",      "IBEX 35",      "daily_index", "BME:IBEX",        "IBEX",    null, ["tv_cache"], "Europe/Madrid"),
  def("mib_idx",       "FTSE MIB",     "daily_index", "MIL:FTSEMIB",     "FTSEMIB", null, ["tv_cache"], "Europe/Rome"),

  // ── Stocks ───────────────────────────────────────────────────────────
  def("aapl",   "Apple",       "daily_stocks", "BATS:AAPL",  "AAPL",  null, ["tv_cache", "supabase_ohlc"]),
  def("msft",   "Microsoft",   "daily_stocks", "BATS:MSFT",  "MSFT",  null, ["tv_cache", "supabase_ohlc"]),
  def("nvda",   "NVIDIA",      "daily_stocks", "BATS:NVDA",  "NVDA",  null, ["tv_cache", "supabase_ohlc"]),
  def("tsla",   "Tesla",       "daily_stocks", "BATS:TSLA",  "TSLA",  null, ["tv_cache", "supabase_ohlc"]),
  def("meta_s", "Meta",        "daily_stocks", "BATS:META",  "META",  null, ["tv_cache", "supabase_ohlc"]),
  def("amzn",   "Amazon",      "daily_stocks", "BATS:AMZN",  "AMZN",  null, ["tv_cache", "supabase_ohlc"]),
  def("googl",  "Alphabet",    "daily_stocks", "BATS:GOOGL", "GOOGL", null, ["tv_cache", "supabase_ohlc"]),
  def("jpm",    "JPMorgan",    "daily_stocks", "NYSE:JPM",   "JPM",   null, ["tv_cache", "supabase_ohlc"]),
  def("bac",    "Bank of Amer","daily_stocks", "NYSE:BAC",   "BAC",   null, ["tv_cache", "supabase_ohlc"]),
  def("gs",     "Goldman",     "daily_stocks", "NYSE:GS",    "GS",    null, ["tv_cache", "supabase_ohlc"]),
  def("xom",    "ExxonMobil",  "daily_stocks", "NYSE:XOM",   "XOM",   null, ["tv_cache", "supabase_ohlc"]),
  def("cvx",    "Chevron",     "daily_stocks", "NYSE:CVX",   "CVX",   null, ["tv_cache", "supabase_ohlc"]),
  def("tsm",    "TSMC",        "daily_stocks", "NYSE:TSM",   "TSM",   null, ["tv_cache", "supabase_ohlc"]),
  def("sap_de", "SAP",         "daily_stocks", "XETR:SAP",   "SAP",   null, ["tv_cache"], "Europe/Berlin"),

  // ── Metals ───────────────────────────────────────────────────────────
  def("silver",      "Silver",    "daily_futures", "COMEX:SI1!",  "SI1!",  "XAG/USD", ["tv_cache", "supabase_ohlc"]),
  def("platinum",    "Platinum",  "daily_futures", "NYMEX:PL1!",  "PL1!",  "XPT/USD", ["tv_cache", "supabase_ohlc"]),
  def("palladium",   "Palladium", "daily_futures", "NYMEX:PA1!",  "PA1!",  null,      ["tv_cache", "supabase_ohlc"]),
  def("copper_spot", "Copper",    "daily_futures", "COMEX:HG1!",  "HG1!",  null,      ["tv_cache", "supabase_ohlc"]),

  // ── Energy ───────────────────────────────────────────────────────────
  def("crude",       "WTI Crude",    "daily_futures",    "NYMEX:CL1!", "CL1!",  null, ["tv_cache", "supabase_ohlc"]),
  def("brent",       "Brent Crude",  "daily_futures",    "NYMEX:BB1!", "BZ1!",  null, ["tv_cache", "supabase_ohlc"]),
  def("natgas",      "Natural Gas",  "daily_futures",    "NYMEX:NG1!", "NG1!",  null, ["tv_cache", "supabase_ohlc"]),
  def("heating_oil", "Heating Oil",  "daily_futures",    "NYMEX:HO1!", "HO1!",  null, ["tv_cache"]),
  def("gasoline",    "Gasoline",     "daily_futures",    "NYMEX:RB1!", "RB1!",  null, ["tv_cache"]),
  def("uranium",     "Uranium ETF",  "daily_etf",        "NYSE:URA",   "URA",   null, ["tv_cache"]),

  // ── Agriculture ──────────────────────────────────────────────────────
  def("corn_f",    "Corn",    "daily_commodities", "CBOT:ZC1!",    "ZC1!",  null, ["tv_cache", "supabase_ohlc"]),
  def("wheat_f",   "Wheat",   "daily_commodities", "CBOT:ZW1!",    "ZW1!",  null, ["tv_cache", "supabase_ohlc"]),
  def("soybean_f", "Soybean", "daily_commodities", "CBOT:ZS1!",    "ZS1!",  null, ["tv_cache", "supabase_ohlc"]),
  def("coffee_f",  "Coffee",  "daily_commodities", "ICEUS:KC1!",   "KC1!",  null, ["tv_cache", "supabase_ohlc"]),
  def("cocoa_f",   "Cocoa",   "daily_commodities", "ICEUS:CC1!",   "CC1!",  null, ["tv_cache"]),
  def("sugar_f",   "Sugar",   "daily_commodities", "ICEUS:SB1!",   "SB1!",  null, ["tv_cache"]),
  def("oj_f",      "OJ",      "daily_commodities", "ICEUS:OJ1!",   "OJ1!",  null, ["tv_cache"]),
  def("cattle_f",  "Cattle",  "daily_commodities", "CME:LE1!",     "LE1!",  null, ["tv_cache"]),
  def("hogs_f",    "Hogs",    "daily_commodities", "CME:HE1!",     "HE1!",  null, ["tv_cache"]),
  def("lumber_f",  "Lumber",  "daily_commodities", "CME:LBS1!",    "LBS1!", null, ["tv_cache"]),

  // ── Bonds ────────────────────────────────────────────────────────────
  def("zb1", "30Y T-Bond",  "daily_bonds", "CBOT:ZB1!", "ZB1!", null, ["tv_cache", "supabase_ohlc"]),
  def("zn1", "10Y T-Note",  "daily_bonds", "CBOT:ZN1!", "ZN1!", null, ["tv_cache", "supabase_ohlc"]),
];

// ── Lookup helpers ────────────────────────────────────────────────────────────

const _byId = new Map(ASSET_REGISTRY.map(a => [a.id, a]));
const _byLiveSymbol = new Map(ASSET_REGISTRY.map(a => [a.liveQuotesSymbol, a]));
const _byTvSymbol = new Map(ASSET_REGISTRY.map(a => [a.tvSymbol, a]));

export function getAssetById(id: string): AssetDefinition | undefined {
  return _byId.get(id.toLowerCase());
}

export function getAssetByLiveSymbol(symbol: string): AssetDefinition | undefined {
  return _byLiveSymbol.get(symbol.toUpperCase());
}

export function getAssetByTvSymbol(tvSymbol: string): AssetDefinition | undefined {
  return _byTvSymbol.get(tvSymbol);
}

/** All intraday assets — poll every 5s, eligible for Dukascopy confirmation */
export const INTRADAY_ASSETS = ASSET_REGISTRY.filter(
  a => a.class === "intraday_forex" || a.class === "intraday_futures"
);

/** All Forex/CFD assets with Dukascopy instrument — eligible for real-time confirmation */
export const DUKASCOPY_ELIGIBLE = ASSET_REGISTRY.filter(
  a => a.dukascopyInstrument !== null
);

/** Map: liveQuotesSymbol → AssetDefinition (for fast O(1) lookup in pollers) */
export const LIVE_SYMBOL_MAP: ReadonlyMap<string, AssetDefinition> = _byLiveSymbol;

/** Globe: asset id → liveQuotesSymbol */
export const GLOBE_ID_TO_LIVE_SYMBOL: Record<string, string> = Object.fromEntries(
  ASSET_REGISTRY.map(a => [a.id, a.liveQuotesSymbol])
);

/** Timeseries: asset id → TradingView symbol */
export const ASSET_TV_MAP: Record<string, string> = Object.fromEntries(
  ASSET_REGISTRY.map(a => [a.id, a.tvSymbol])
);
