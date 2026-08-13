import { describe, expect, it } from "vitest";
import {
  WHITE_SWAN_ANALYTICS_GROUPS,
  WHITE_SWAN_COMPONENT_KPIS,
  WHITE_SWAN_PORTFOLIO_TRUTH,
  activeWhiteSwanComponents,
} from "@/lib/white-swan/portfolio-truth";

describe("white swan portfolio truth", () => {
  it("tracks the exact active white swan membership from the current registry truth", () => {
    expect(WHITE_SWAN_PORTFOLIO_TRUTH.activeWhiteSwanStrategies).toBe(17);
    expect(activeWhiteSwanComponents).toHaveLength(17);
    expect(WHITE_SWAN_COMPONENT_KPIS.strategies).toBe("17");
  });

  it("normalizes active portfolio weights to exactly 100 percent while preserving reserve separately", () => {
    expect(WHITE_SWAN_PORTFOLIO_TRUTH.rawRegistryWeightSumPct).toBe(91);
    expect(WHITE_SWAN_PORTFOLIO_TRUTH.activeWeightSumPct).toBe(100);
    expect(WHITE_SWAN_PORTFOLIO_TRUTH.cashMarginReservePct).toBe(9);
    expect(WHITE_SWAN_PORTFOLIO_TRUTH.cashMarginReserveUsd).toBe(900);
  });

  it("keeps watch and research rows outside the active aggregate set", () => {
    expect(WHITE_SWAN_PORTFOLIO_TRUTH.watchRows).toBe(1);
    expect(WHITE_SWAN_PORTFOLIO_TRUTH.researchRows).toBe(15);
  });

  it("derives analytics groups from the active canonical portfolio truth", () => {
    expect(WHITE_SWAN_ANALYTICS_GROUPS.map((group) => group.id)).toEqual([
      "Seasonal Sleeve",
      "GLD Thursday Long",
      "YM1 TAT",
      "Intraday MT v3-F",
    ]);
    expect(WHITE_SWAN_ANALYTICS_GROUPS.reduce((sum, group) => sum + group.weight, 0)).toBe(100);
  });
});
