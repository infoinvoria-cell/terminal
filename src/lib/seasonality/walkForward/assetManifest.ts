// Seasonal CSV Asset Manifest — Research Only. No live signals.
// Enabled assets are built from the central Monitoring-aligned registry.

export type SeasonalAssetCategory = "Agrar" | "Metalle" | "Energie" | "Indizes" | "FX" | "Aktien";

export interface SeasonalAssetDef {
  assetId: string;
  symbol: string;
  displayName: string;
  displayNameShort: string;
  category: SeasonalAssetCategory;
  /** Filename only — relative to csvDir (or workspace/output/tradingview_data_test if csvDir absent) */
  csvFile: string;
  /** Optional override: path relative to workspace root. If absent, uses workspace/output/tradingview_data_test */
  csvDir?: string;
  exchange: string;
  backadjustmentStatus: "confirmed_backadjusted" | "assumed_backadjusted" | "unknown";
  marketType: "continuous_futures" | "spot";
  iconKey: string;
  firstDateEstimate: string;
  lastDateEstimate: string;
  completeYearsEstimate: number;
}

export {
  SEASONAL_CSV_ASSETS,
  getAssetDef,
  DEFAULT_SEASONAL_ASSET_ID,
} from "@/lib/seasonality/seasonalityAssetRegistry";
