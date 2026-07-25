/**
 * Single-icon glyphs for the seasonality asset selector (no dual PNG / pair images).
 */

const DOW_INDEX_EMOJI = "\uD83D\uDCC8";

export const SEASONALITY_SELECTOR_EMOJI_BY_ASSET_ID: Record<string, string> = {
  wheat: "\uD83C\uDF3E",
  soybeans: "\uD83C\uDF31",
  corn: "\uD83C\uDF3D",
  coffee: "\u2615",
  sugar: "\uD83C\uDF6C",
  cocoa: "\uD83C\uDF6B",
  cotton: "\uD83E\uDDF5",
  orangejuice: "\uD83C\uDF4A",
  ng1: "\uD83D\uDD25",
  cl1: "\uD83D\uDEE2",
  rb1: "\u26FD",
  gc1: "\uD83E\uDE99",
  si1: "\uD83E\uDD48",
  hg1: "\uD83D\uDFE4",
  pl1: "\u26AA",
  pa1: "\uD83D\uDC8E",
  fx_6a1: "\uD83C\uDDE6\uD83C\uDDFA",
  fx_6b1: "\uD83C\uDDEC\uD83C\uDDE7",
  fx_6c1: "\uD83C\uDDE8\uD83C\uDDE6",
  fx_6e1: "\uD83C\uDDEA",
  fx_6j1: "\uD83C\uDDEF\uD83C\uDDF5",
  fx_6n1: "\uD83C\uDDF3\uD83C\uDDF5",
  fx_6s1: "\uD83C\uDDE8\uD83C\uDDEA",
  dxy: "\uD83D\uDCB5",
  us30usd: DOW_INDEX_EMOJI,
  ym1: DOW_INDEX_EMOJI,
  nq1: "\uD83D\uDCBB",
  es1: "\uD83D\uDCCA",
  fdax1: "\uD83C\uDDE9\uD83C\uDDEA",
  rty1: "\uD83D\uDCC9",
};

/** FX futures: one flag emoji each (no dual PNG). */
const FX_SINGLE_FLAG: Record<string, string> = {
  "6A1!": "\uD83C\uDDE6\uD83C\uDDFA",
  "6B1!": "\uD83C\uDDEC\uD83C\uDDE7",
  "6C1!": "\uD83C\uDDE8\uD83C\uDDE6",
  "6E1!": "\uD83C\uDDEA\uD83C\uDDFA",
  "6J1!": "\uD83C\uDDEF\uD83C\uDDF5",
  "6N1!": "\uD83C\uDDF3\uD83C\uDDF5",
  "6S1!": "\uD83C\uDDE8\uD83C\uDDEA",
  DXY: "\uD83D\uDCB5",
};

/** US30 mini and YM mini — same Dow visual in selector */
const DOW_INDEX_EMOJI_ALIAS = DOW_INDEX_EMOJI;

export const SEASONALITY_SELECTOR_EMOJI_BY_MONITORING_SYMBOL: Record<string, string> = {
  ...FX_SINGLE_FLAG,
  "ZW1!": "\uD83C\uDF3E",
  "ZS1!": "\uD83C\uDF31",
  "ZC1!": "\uD83C\uDF3D",
  "KC1!": "\u2615",
  "SB1!": "\uD83C\uDF6C",
  "CC1!": "\uD83C\uDF6B",
  "CT1!": "\uD83E\uDDF5",
  "OJ1!": "\uD83C\uDF4A",
  "NG1!": "\uD83D\uDD25",
  "CL1!": "\uD83D\uDEE2",
  "RB1!": "\u26FD",
  "GC1!": "\uD83E\uDE99",
  "SI1!": "\uD83E\uDD48",
  "HG1!": "\uD83E\uDEA8",
  "PL1!": "\u26AA",
  "PA1!": "\uD83D\uDC8E",
  US30USD: DOW_INDEX_EMOJI,
  "YM1!": DOW_INDEX_EMOJI,
  US30: DOW_INDEX_EMOJI,
  YM: DOW_INDEX_EMOJI,
  "NQ1!": "\uD83D\uDCBB",
  "ES1!": "\uD83D\uDCCA",
  "FDAX1!": "\uD83C\uDDE9\uD83C\uDDEA",
  "RTY1!": "\uD83D\uDCC9",
};

const STOCK_MONITORING_OK = new Set(["AAPL", "MSFT", "NVDA", "GOOGL", "META", "AMZN"]);

export function getSeasonalitySelectorEmoji(assetId: string, monitoringSymbol: string): string | null {
  const id = String(assetId || "").trim().toLowerCase();
  if (id && SEASONALITY_SELECTOR_EMOJI_BY_ASSET_ID[id]) {
    return SEASONALITY_SELECTOR_EMOJI_BY_ASSET_ID[id];
  }
  const sym = String(monitoringSymbol || "").trim().toUpperCase();
  if (sym && SEASONALITY_SELECTOR_EMOJI_BY_MONITORING_SYMBOL[sym]) {
    return SEASONALITY_SELECTOR_EMOJI_BY_MONITORING_SYMBOL[sym];
  }
  return null;
}

export function shouldUseMonitoringPngInSelector(monitoringSymbol: string, category?: string): boolean {
  const sym = String(monitoringSymbol || "").trim().toUpperCase();
  if (String(category || "").toLowerCase() === "aktien" && STOCK_MONITORING_OK.has(sym)) {
    return true;
  }
  return false;
}
