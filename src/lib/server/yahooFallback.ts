/**
 * Minimal Yahoo symbol resolver stub for Capitalife Terminal.
 * Mirrors the resolveYahooSymbol API from Invoria's yahooFallback.ts
 * without Invoria-specific data dependencies.
 */

export const YAHOO_SYMBOL_ALIASES: Record<string, string> = {
  "DXY": "DX-Y.NYB",
  "DX-Y.NYB": "DX-Y.NYB",
  "GOLD": "GC=F",
  "SILVER": "SI=F",
  "CRUDE": "CL=F",
  "OIL": "CL=F",
  "WHEAT": "ZW=F",
  "CORN": "ZC=F",
  "SOYBEANS": "ZS=F",
  "COCOA": "CC=F",
  "COFFEE": "KC=F",
  "SUGAR": "SB=F",
  "COTTON": "CT=F",
  "COPPER": "HG=F",
  "PALLADIUM": "PA=F",
  "PLATINUM": "PL=F",
  "XAUUSD": "GC=F",
  "XAGUSD": "SI=F",
  "SPX": "^GSPC",
  "SP500": "^GSPC",
  "NDX": "^NDX",
  "DAX": "^GDAXI",
};

export function resolveYahooSymbol(rawSymbol: string): string {
  const normalized = String(rawSymbol || "").trim().toUpperCase();
  if (!normalized) return "";
  const alias = YAHOO_SYMBOL_ALIASES[normalized];
  if (alias) return alias;
  if (/^[A-Z]{6}$/.test(normalized)) {
    return `${normalized}=X`;
  }
  return rawSymbol;
}

export function hasExistingYahooMapping(symbol: string): boolean {
  const normalized = String(symbol || "").trim().toUpperCase();
  if (!normalized) return false;
  if (YAHOO_SYMBOL_ALIASES[normalized]) return true;
  if (/^[A-Z]{6}$/.test(normalized)) return true;
  return false;
}
