/**
 * Static datasource map for entries that need server-side resolution
 * (canonical OHLC CSVs, pre-computed series JSON).
 *
 * Analytics-backed entries (portfolios, WS strategies, Core Invest strategies)
 * are NOT listed here — they resolve synchronously from analytics-generated.json
 * via the existing `resolveSubjectSeries` path in ModelingStudio.
 */

export type OhlcSource = {
  type: "ohlc";
  csvFile: string;           // filename within data/core-invest/canonical/
  benchmarkCsvFile?: string; // optional: SPY.csv for benchmark overlay
  label: string;
  selectionType: "asset";
};

export type SeriesJsonSource = {
  type: "series-json";
  jsonPath: string;          // relative to project root
  equityArrayField: string;  // top-level field containing the array
  dateField: string;         // field name for date within each element
  valueField: string;        // field name for equity value within each element
  valueBase: number;         // the starting value to normalize to 100
  label: string;
  selectionType: "strategy" | "asset";
};

export type DataSource = OhlcSource | SeriesJsonSource;

/**
 * Map of selectionId → data source descriptor.
 * Adding an entry here makes it AVAILABLE in the selector (see availability.ts).
 */
export const DATASOURCE_MAP: Record<string, DataSource> = {
  // ── Core Invest Assets ──────────────────────────────────────────────────────
  "asset-GLD": {
    type: "ohlc", csvFile: "GLD.csv", benchmarkCsvFile: "SPY.csv",
    label: "GLD (Gold ETF)", selectionType: "asset",
  },
  "asset-SPY": {
    type: "ohlc", csvFile: "SPY.csv",
    label: "SPY (S&P 500 ETF)", selectionType: "asset",
  },
  "asset-QQQ": {
    type: "ohlc", csvFile: "QQQ.csv", benchmarkCsvFile: "SPY.csv",
    label: "QQQ (Nasdaq ETF)", selectionType: "asset",
  },
  "asset-COPPER": {
    type: "ohlc", csvFile: "HG.csv", benchmarkCsvFile: "SPY.csv",
    label: "HG (Copper Futures)", selectionType: "asset",
  },
  "asset-CHF": {
    type: "ohlc", csvFile: "6S.csv",
    label: "6S (CHF Futures)", selectionType: "asset",
  },
  "asset-QQQ-pine": {
    type: "series-json",
    jsonPath: "src/data/capitalife/fsportfolio/backtests/qqq-invest-pine-series.json",
    equityArrayField: "equity",
    dateField: "date",
    valueField: "cumulativeReturnPct",
    valueBase: 0,  // cumulativeReturnPct starts at 0 → we shift to 100
    label: "QQQ Pine Strategy",
    selectionType: "strategy",
  },

  // ── Agrar ───────────────────────────────────────────────────────────────────
  "agrar-ZC1": {
    type: "ohlc", csvFile: "ZC.csv",
    label: "ZC (Corn)", selectionType: "asset",
  },
  "agrar-ZS1": {
    type: "ohlc", csvFile: "ZS.csv",
    label: "ZS (Soybean)", selectionType: "asset",
  },

  // ── Metalle ─────────────────────────────────────────────────────────────────
  "metalle-GC1": {
    type: "ohlc", csvFile: "GC.csv",
    label: "GC (Gold Futures)", selectionType: "asset",
  },
  "metalle-HG1": {
    type: "ohlc", csvFile: "HG.csv",
    label: "HG (Copper)", selectionType: "asset",
  },

  // ── Energie ─────────────────────────────────────────────────────────────────
  "energie-CL1": {
    type: "ohlc", csvFile: "CL.csv",
    label: "CL (Crude Oil)", selectionType: "asset",
  },
  "energie-NG1": {
    type: "ohlc", csvFile: "NG.csv",
    label: "NG (Natural Gas)", selectionType: "asset",
  },

  // ── Indizes ─────────────────────────────────────────────────────────────────
  "indiz-ES1": {
    type: "ohlc", csvFile: "ES.csv", benchmarkCsvFile: "SPY.csv",
    label: "ES (S&P 500 Futures)", selectionType: "asset",
  },
  "indiz-NQ1": {
    type: "ohlc", csvFile: "NQ.csv", benchmarkCsvFile: "SPY.csv",
    label: "NQ (Nasdaq Futures)", selectionType: "asset",
  },

  // ── FX ──────────────────────────────────────────────────────────────────────
  "fx-6E1": {
    type: "ohlc", csvFile: "6E.csv",
    label: "6E (Euro Futures)", selectionType: "asset",
  },
  "fx-6B1": {
    type: "ohlc", csvFile: "6B.csv",
    label: "6B (GBP Futures)", selectionType: "asset",
  },
  "fx-6S1": {
    type: "ohlc", csvFile: "6S.csv",
    label: "6S (CHF Futures)", selectionType: "asset",
  },
};

/** Set of all selectionIds that have a datasource entry. */
export const API_BACKED_IDS = new Set(Object.keys(DATASOURCE_MAP));
