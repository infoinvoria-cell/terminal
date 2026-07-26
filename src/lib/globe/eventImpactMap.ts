// Mapping: Globe-Event-Region → betroffene Assets + erwarteter Impact
// Used by the Event→Asset Impact correlation feature: click an event marker
// (earthquake / conflict / wildfire) → detect its region → surface the assets
// most exposed to that region and the expected directional bias.

export type ImpactDirection = "up" | "down" | "mixed";

export interface EventImpact {
  /** Display tickers shown in the Impact panel (e.g. "GC1!"). */
  assets: string[];
  direction: ImpactDirection;
  reason: string;
}

export const EVENT_IMPACT_MAP: Record<string, EventImpact> = {
  // ── Geopolitik ──
  red_sea: { assets: ["CL1!", "BZ1!", "GC1!", "6E1!"], direction: "up", reason: "Supply disruption via Suez" },
  ukraine: { assets: ["GC1!", "ZW1!", "NG1!", "PA1!"], direction: "up", reason: "Safe haven + commodity supply" },
  gaza_israel: { assets: ["GC1!", "CL1!", "SI1!"], direction: "up", reason: "Middle East risk premium" },
  sahel: { assets: ["GC1!", "CT1!", "KC1!"], direction: "mixed", reason: "Agricultural + gold mining region" },
  taiwan_strait: { assets: ["NQ1!", "ES1!", "AAPL", "NVDA"], direction: "down", reason: "Tech supply chain risk" },
  iran: { assets: ["CL1!", "BZ1!", "GC1!"], direction: "up", reason: "Strait of Hormuz risk" },

  // ── Naturkatastrophen ──
  japan_eq: { assets: ["6J1!", "NKD1!"], direction: "down", reason: "JPY safe haven + Nikkei impact" },
  us_west_fire: { assets: ["NG1!", "ES1!"], direction: "mixed", reason: "Energy demand + insurance sector" },
  gulf_hurricane: { assets: ["CL1!", "NG1!", "RB1!"], direction: "up", reason: "Gulf of Mexico production halt" },

  // ── Makro-Regionen ──
  china: { assets: ["HG1!", "ZS1!", "ZC1!", "6A1!"], direction: "mixed", reason: "China demand indicator" },
  europe: { assets: ["6E1!", "FDAX1!", "ZW1!"], direction: "mixed", reason: "European macro sensitivity" },
  middle_east: { assets: ["CL1!", "BZ1!", "GC1!"], direction: "up", reason: "Oil supply risk" },
};

// Human-readable region names for the panel header.
export const REGION_LABELS: Record<string, string> = {
  red_sea: "Red Sea",
  ukraine: "Ukraine",
  gaza_israel: "Gaza / Israel",
  sahel: "Sahel",
  taiwan_strait: "Taiwan Strait",
  iran: "Iran",
  japan_eq: "Japan",
  us_west_fire: "US West",
  gulf_hurricane: "Gulf of Mexico",
  china: "China",
  europe: "Europe",
  middle_east: "Middle East",
};

// Resolve the display tickers to actual watchlist asset IDs (from /api/assets)
// so the feature can highlight rows and open charts.
export const IMPACT_SYMBOL_TO_ID: Record<string, string> = {
  "CL1!": "crude",
  "BZ1!": "brent",
  "GC1!": "gc1",
  "6E1!": "6e1",
  "ZW1!": "wheat_f",
  "NG1!": "natgas",
  "PA1!": "palladium",
  "SI1!": "silver",
  "CT1!": "ct1",
  "KC1!": "coffee_f",
  "NQ1!": "nq1",
  "ES1!": "sp500_idx",
  AAPL: "aapl",
  NVDA: "nvda",
  "6J1!": "6j1",
  "NKD1!": "nikkei_idx",
  "RB1!": "gasoline",
  "HG1!": "hg1",
  "ZS1!": "soybean_f",
  "ZC1!": "corn_f",
  "6A1!": "6a1",
  "FDAX1!": "dax_idx",
};

/** Resolve impact tickers → watchlist asset IDs (drops any unmapped). */
export function impactAssetIds(symbols: string[]): string[] {
  return symbols.map((s) => IMPACT_SYMBOL_TO_ID[s]).filter(Boolean) as string[];
}

/** Inverse: watchlist asset ID → display ticker. */
export const ID_TO_IMPACT_SYMBOL: Record<string, string> = Object.fromEntries(
  Object.entries(IMPACT_SYMBOL_TO_ID).map(([ticker, id]) => [id, ticker]),
);

// Region-Detector: welche Region ist ein Event? (rough lat/lng bounding boxes)
export function detectEventRegion(lat: number, lng: number): string | null {
  if (lat > 12 && lat < 22 && lng > 40 && lng < 50) return "red_sea";
  if (lat > 45 && lat < 55 && lng > 25 && lng < 40) return "ukraine";
  if (lat > 28 && lat < 35 && lng > 30 && lng < 36) return "gaza_israel";
  if (lat > 30 && lat < 40 && lng > 44 && lng < 60) return "iran";
  if (lat > 21 && lat < 30 && lng > 118 && lng < 124) return "taiwan_strait";
  if (lat > 30 && lat < 46 && lng > 130 && lng < 146) return "japan_eq";
  if (lat > 20 && lat < 50 && lng > 100 && lng < 130) return "china";
  if (lat > 35 && lat < 60 && lng > -10 && lng < 30) return "europe";
  if (lat > 10 && lat < 25 && lng > -20 && lng < 30) return "sahel";
  if (lat > 10 && lat < 35 && lng > 35 && lng < 60) return "middle_east";
  return null;
}
