"use client";

import type { ManualTradeLevels } from "@/lib/trading/types";

export type TradeLevelHit = "entry" | "sl" | "tp" | null;

export function getManualLevelLineColor(type: Exclude<TradeLevelHit, null>): string {
  if (type === "entry") return "#F59E0B";
  if (type === "sl") return "#FF3B30";
  return "#22C55E";
}

export function getVisibleManualLevels(levels: ManualTradeLevels): Array<{ key: Exclude<TradeLevelHit, null>; value: number }> {
  const out: Array<{ key: Exclude<TradeLevelHit, null>; value: number }> = [];
  if (typeof levels.entry === "number" && Number.isFinite(levels.entry)) out.push({ key: "entry", value: levels.entry });
  if (typeof levels.stopLoss === "number" && Number.isFinite(levels.stopLoss)) out.push({ key: "sl", value: levels.stopLoss });
  if (typeof levels.takeProfit === "number" && Number.isFinite(levels.takeProfit)) out.push({ key: "tp", value: levels.takeProfit });
  return out;
}
