/**
 * agri-v2-registry.ts
 *
 * Static asset → strategy availability map derived from
 * Agrar v2.0 Vault (INVORIA_AGRI_SAFETY_STOP_MACRO_v2, 2026-07-13).
 *
 * Source of truth: _Incoming/Invoria_Agri_Safety_Stop_Macro_Vault_v2.0/
 *   07_TERMINAL/config/strategy_registry.json
 *   05_PORTFOLIO/portfolio_core_default.json
 *
 * Rules:
 * - FINAL_CORE = defaultEnabled true
 * - FINAL_LIMITED = defaultEnabled false
 * - No invented strategies, no fake data.
 * - Paper-only, research/monitoring only.
 * - Safety Stop: modeled risk limit, not guaranteed fill.
 */

export type AgriStrategyKind = "valuation" | "seasonal" | "macro";

export type AgriStrategyTier = "FINAL_CORE" | "FINAL_LIMITED";

export type AgriStrategyEngineStatus =
  | "engine_missing"   // No seasonal/macro engine implemented yet
  | "evidence_only";   // Evidence from vault available, no live engine

export type AgriStrategyEntry = {
  id: string;
  kind: AgriStrategyKind;
  tier: AgriStrategyTier;
  displayLabel: string;
  direction: "LONG" | "SHORT" | "BOTH";
  entryDateHint?: string;   // e.g. "15 Feb" for seasonal
  holdingBars?: number;
  atrStopMultiplier?: number;
  evidenceAvailable: boolean;
  engineStatus: AgriStrategyEngineStatus;
  notes?: string;
};

export type AgriAssetStrategyMap = {
  symbol: string;      // e.g. "ZC1!"
  assetId: string;     // e.g. "corn"
  displayName: string;
  exchange: string;
  kinds: {
    valuation: boolean;
    seasonal: boolean;
    macro: boolean;
  };
  strategies: AgriStrategyEntry[];
};

// ── Per-asset strategy maps ───────────────────────────────────────────────────

const AGRI_ASSET_STRATEGIES: AgriAssetStrategyMap[] = [
  {
    symbol: "ZC1!",
    assetId: "corn",
    displayName: "Corn",
    exchange: "CBOT",
    kinds: { valuation: false, seasonal: true, macro: true },
    strategies: [
      { id: "SEA_SAFE_ZC_SHORT_06_08_h14_s1p5_v1", kind: "seasonal", tier: "FINAL_CORE",    displayLabel: "S (Core)", direction: "SHORT", entryDateHint: "08 Jun", holdingBars: 14, atrStopMultiplier: 1.5, evidenceAvailable: true, engineStatus: "engine_missing" },
      { id: "SEA_SAFE_ZC_LONG_02_25_h5_s2p5_v1",   kind: "seasonal", tier: "FINAL_LIMITED", displayLabel: "S (Lim.)", direction: "LONG",  entryDateHint: "25 Feb", holdingBars: 5,  atrStopMultiplier: 2.5, evidenceAvailable: true, engineStatus: "engine_missing" },
      { id: "SEA_SAFE_ZC_LONG_11_10_h14_s2p5_v1",  kind: "seasonal", tier: "FINAL_LIMITED", displayLabel: "S (Lim.)", direction: "LONG",  entryDateHint: "10 Nov", holdingBars: 14, atrStopMultiplier: 2.5, evidenceAvailable: true, engineStatus: "engine_missing" },
      { id: "MAC_HARVEST_ZC_STAGE_GATED_STOP8_v1", kind: "macro",    tier: "FINAL_LIMITED", displayLabel: "M (Lim.)", direction: "LONG",  evidenceAvailable: true, engineStatus: "engine_missing", notes: "Requires Satellite/USDA pipeline" },
    ],
  },
  {
    symbol: "ZW1!",
    assetId: "wheat",
    displayName: "Wheat",
    exchange: "CBOT",
    kinds: { valuation: true, seasonal: true, macro: true },
    strategies: [
      { id: "SEA_SAFE_ZW_SHORT_02_15_h23_s1p5_v1",  kind: "seasonal",  tier: "FINAL_CORE",    displayLabel: "S (Core)", direction: "SHORT", entryDateHint: "15 Feb", holdingBars: 23, atrStopMultiplier: 1.5, evidenceAvailable: true, engineStatus: "engine_missing" },
      { id: "VAL_ZW_JPY_RELATIVE_LONG_v1",           kind: "valuation", tier: "FINAL_LIMITED", displayLabel: "V (Lim.)", direction: "LONG",  evidenceAvailable: true, engineStatus: "evidence_only", notes: "NO_PRISTINE_OOS" },
      { id: "SEA_SAFE_ZW_LONG_04_11_h27_s5p0_v1",   kind: "seasonal",  tier: "FINAL_LIMITED", displayLabel: "S (Lim.)", direction: "LONG",  entryDateHint: "11 Apr", holdingBars: 27, atrStopMultiplier: 5.0, evidenceAvailable: true, engineStatus: "engine_missing" },
      { id: "SEA_SAFE_ZW_SHORT_11_21_h17_s1p5_v1",  kind: "seasonal",  tier: "FINAL_LIMITED", displayLabel: "S (Lim.)", direction: "SHORT", entryDateHint: "21 Nov", holdingBars: 17, atrStopMultiplier: 1.5, evidenceAvailable: true, engineStatus: "engine_missing" },
      { id: "MAC_HARVEST_ZW_STAGE_GATED_STOP8_v1",  kind: "macro",     tier: "FINAL_LIMITED", displayLabel: "M (Lim.)", direction: "LONG",  evidenceAvailable: true, engineStatus: "engine_missing", notes: "Requires Satellite/USDA pipeline" },
    ],
  },
  {
    symbol: "ZS1!",
    assetId: "soybeans",
    displayName: "Soybeans",
    exchange: "CBOT",
    kinds: { valuation: false, seasonal: true, macro: false },
    strategies: [
      { id: "SEA_SAFE_ZS_SHORT_06_09_h12_s2p0_v1", kind: "seasonal", tier: "FINAL_CORE",    displayLabel: "S (Core)", direction: "SHORT", entryDateHint: "09 Jun", holdingBars: 12, atrStopMultiplier: 2.0, evidenceAvailable: true, engineStatus: "engine_missing" },
      { id: "SEA_SAFE_ZS_SHORT_07_22_h12_s1p5_v1", kind: "seasonal", tier: "FINAL_CORE",    displayLabel: "S (Core)", direction: "SHORT", entryDateHint: "22 Jul", holdingBars: 12, atrStopMultiplier: 1.5, evidenceAvailable: true, engineStatus: "engine_missing", notes: "URGENT: entry window open 2026-07-22" },
      { id: "SEA_SAFE_ZS_LONG_04_05_h22_s2p5_v1",  kind: "seasonal", tier: "FINAL_LIMITED", displayLabel: "S (Lim.)", direction: "LONG",  entryDateHint: "05 Apr", holdingBars: 22, atrStopMultiplier: 2.5, evidenceAvailable: true, engineStatus: "engine_missing" },
      { id: "SEA_SAFE_ZS_LONG_10_11_h17_s2p0_v1",  kind: "seasonal", tier: "FINAL_LIMITED", displayLabel: "S (Lim.)", direction: "LONG",  entryDateHint: "11 Okt", holdingBars: 17, atrStopMultiplier: 2.0, evidenceAvailable: true, engineStatus: "engine_missing" },
    ],
  },
  {
    symbol: "CC1!",
    assetId: "cocoa",
    displayName: "Cocoa",
    exchange: "ICEUS",
    kinds: { valuation: true, seasonal: true, macro: false },
    strategies: [
      { id: "VAL_CC_GOLD_RELATIVE_LONG_v1",          kind: "valuation", tier: "FINAL_LIMITED", displayLabel: "V (Lim.)", direction: "LONG", evidenceAvailable: true, engineStatus: "evidence_only", notes: "NO_PRISTINE_OOS" },
      { id: "SEA_SAFE_CC_LONG_04_03_h16_s1p5_v1",   kind: "seasonal",  tier: "FINAL_LIMITED", displayLabel: "S (Lim.)", direction: "LONG", entryDateHint: "03 Apr", holdingBars: 16, atrStopMultiplier: 1.5, evidenceAvailable: true, engineStatus: "engine_missing" },
      { id: "SEA_SAFE_CC_LONG_06_04_h23_s1p5_v1",   kind: "seasonal",  tier: "FINAL_LIMITED", displayLabel: "S (Lim.)", direction: "LONG", entryDateHint: "04 Jun", holdingBars: 23, atrStopMultiplier: 1.5, evidenceAvailable: true, engineStatus: "engine_missing" },
      { id: "SEA_SAFE_CC_LONG_08_15_h7_s1p5_v1",    kind: "seasonal",  tier: "FINAL_LIMITED", displayLabel: "S (Lim.)", direction: "LONG", entryDateHint: "15 Aug", holdingBars: 7,  atrStopMultiplier: 1.5, evidenceAvailable: true, engineStatus: "engine_missing" },
    ],
  },
  {
    symbol: "KC1!",
    assetId: "coffee",
    displayName: "Coffee",
    exchange: "ICEUS",
    kinds: { valuation: true, seasonal: true, macro: false },
    strategies: [
      { id: "SEA_SAFE_KC_SHORT_06_08_h10_s2p0_v1",  kind: "seasonal",  tier: "FINAL_CORE",    displayLabel: "S (Core)", direction: "SHORT", entryDateHint: "08 Jun", holdingBars: 10, atrStopMultiplier: 2.0, evidenceAvailable: true, engineStatus: "engine_missing" },
      { id: "VAL_KC_EURO_GOLD_LONG_v1",              kind: "valuation", tier: "FINAL_LIMITED", displayLabel: "V (Lim.)", direction: "LONG",  evidenceAvailable: true, engineStatus: "evidence_only", notes: "NO_PRISTINE_OOS" },
      { id: "SEA_SAFE_KC_SHORT_03_10_h3_s1p5_v1",   kind: "seasonal",  tier: "FINAL_LIMITED", displayLabel: "S (Lim.)", direction: "SHORT", entryDateHint: "10 Mär", holdingBars: 3,  atrStopMultiplier: 1.5, evidenceAvailable: true, engineStatus: "engine_missing" },
      { id: "SEA_SAFE_KC_LONG_08_01_h27_s1p5_v1",   kind: "seasonal",  tier: "FINAL_LIMITED", displayLabel: "S (Lim.)", direction: "LONG",  entryDateHint: "01 Aug", holdingBars: 27, atrStopMultiplier: 1.5, evidenceAvailable: true, engineStatus: "engine_missing" },
      { id: "SEA_SAFE_KC_LONG_10_25_h22_s1p5_v1",   kind: "seasonal",  tier: "FINAL_LIMITED", displayLabel: "S (Lim.)", direction: "LONG",  entryDateHint: "25 Okt", holdingBars: 22, atrStopMultiplier: 1.5, evidenceAvailable: true, engineStatus: "engine_missing" },
    ],
  },
  {
    symbol: "SB1!",
    assetId: "sugar",
    displayName: "Sugar",
    exchange: "ICEUS",
    kinds: { valuation: false, seasonal: true, macro: false },
    strategies: [
      { id: "SEA_SAFE_SB_SHORT_02_24_h20_s2p0_v1", kind: "seasonal", tier: "FINAL_CORE",    displayLabel: "S (Core)", direction: "SHORT", entryDateHint: "24 Feb", holdingBars: 20, atrStopMultiplier: 2.0, evidenceAvailable: true, engineStatus: "engine_missing" },
      { id: "SEA_SAFE_SB_LONG_09_23_h22_s2p5_v1",  kind: "seasonal", tier: "FINAL_LIMITED", displayLabel: "S (Lim.)", direction: "LONG",  entryDateHint: "23 Sep", holdingBars: 22, atrStopMultiplier: 2.5, evidenceAvailable: true, engineStatus: "engine_missing" },
    ],
  },
  {
    symbol: "CT1!",
    assetId: "cotton",
    displayName: "Cotton",
    exchange: "ICEUS",
    kinds: { valuation: true, seasonal: true, macro: false },
    strategies: [
      { id: "VAL_CT_GLOBAL_ENERGY_LONG_v1",          kind: "valuation", tier: "FINAL_CORE",    displayLabel: "V (Core)", direction: "LONG", evidenceAvailable: true, engineStatus: "evidence_only" },
      { id: "SEA_SAFE_CT_LONG_04_11_h5_s6p0_v1",    kind: "seasonal",  tier: "FINAL_CORE",    displayLabel: "S (Core)", direction: "LONG", entryDateHint: "11 Apr", holdingBars: 5,  atrStopMultiplier: 6.0, evidenceAvailable: true, engineStatus: "engine_missing" },
      { id: "SEA_SAFE_CT_LONG_01_03_h12_s1p5_v1",   kind: "seasonal",  tier: "FINAL_LIMITED", displayLabel: "S (Lim.)", direction: "LONG", entryDateHint: "03 Jan", holdingBars: 12, atrStopMultiplier: 1.5, evidenceAvailable: true, engineStatus: "engine_missing" },
      { id: "SEA_SAFE_CT_LONG_12_19_h20_s1p5_v1",   kind: "seasonal",  tier: "FINAL_LIMITED", displayLabel: "S (Lim.)", direction: "LONG", entryDateHint: "19 Dez", holdingBars: 20, atrStopMultiplier: 1.5, evidenceAvailable: true, engineStatus: "engine_missing" },
      { id: "SEA_SAFE_CT_SHORT_09_12_h8_s1p5_v1",   kind: "seasonal",  tier: "FINAL_LIMITED", displayLabel: "S (Lim.)", direction: "SHORT", entryDateHint: "12 Sep", holdingBars: 8, atrStopMultiplier: 1.5, evidenceAvailable: true, engineStatus: "engine_missing" },
    ],
  },
  {
    symbol: "OJ1!",
    assetId: "orange_juice",
    displayName: "Orange Juice",
    exchange: "ICEUS",
    kinds: { valuation: false, seasonal: true, macro: false },
    strategies: [
      { id: "SEA_SAFE_OJ_LONG_06_29_h10_s1p5_v1",   kind: "seasonal", tier: "FINAL_CORE",    displayLabel: "S (Core)", direction: "LONG",  entryDateHint: "29 Jun", holdingBars: 10, atrStopMultiplier: 1.5, evidenceAvailable: true, engineStatus: "engine_missing" },
      { id: "SEA_SAFE_OJ_LONG_05_04_h20_s1p5_v1",   kind: "seasonal", tier: "FINAL_LIMITED", displayLabel: "S (Lim.)", direction: "LONG",  entryDateHint: "04 Mai", holdingBars: 20, atrStopMultiplier: 1.5, evidenceAvailable: true, engineStatus: "engine_missing" },
      { id: "SEA_SAFE_OJ_SHORT_01_01_h10_s2p0_v1",  kind: "seasonal", tier: "FINAL_LIMITED", displayLabel: "S (Lim.)", direction: "SHORT", entryDateHint: "01 Jan", holdingBars: 10, atrStopMultiplier: 2.0, evidenceAvailable: true, engineStatus: "engine_missing" },
    ],
  },
];

// ── Lookups ───────────────────────────────────────────────────────────────────

const BY_SYMBOL = new Map(AGRI_ASSET_STRATEGIES.map((a) => [a.symbol, a]));
const BY_ASSET_ID = new Map(AGRI_ASSET_STRATEGIES.map((a) => [a.assetId, a]));

export function getAgriAssetStrategyMap(symbolOrId: string): AgriAssetStrategyMap | undefined {
  return BY_SYMBOL.get(symbolOrId) ?? BY_ASSET_ID.get(symbolOrId);
}

export function getAgriKindsForAsset(symbolOrId: string): { valuation: boolean; seasonal: boolean; macro: boolean } {
  return getAgriAssetStrategyMap(symbolOrId)?.kinds ?? { valuation: false, seasonal: false, macro: false };
}

export function isAgriV2Asset(symbolOrId: string): boolean {
  return BY_SYMBOL.has(symbolOrId) || BY_ASSET_ID.has(symbolOrId);
}

export function getAllAgriAssets(): AgriAssetStrategyMap[] {
  return AGRI_ASSET_STRATEGIES;
}

export function getAgriStrategiesForKind(symbolOrId: string, kind: AgriStrategyKind): AgriStrategyEntry[] {
  return (getAgriAssetStrategyMap(symbolOrId)?.strategies ?? []).filter((s) => s.kind === kind);
}

export function getCoreStrategiesForKind(symbolOrId: string, kind: AgriStrategyKind): AgriStrategyEntry[] {
  return getAgriStrategiesForKind(symbolOrId, kind).filter((s) => s.tier === "FINAL_CORE");
}
