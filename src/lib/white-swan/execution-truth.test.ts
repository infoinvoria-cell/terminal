import { describe, expect, it } from "vitest";
import {
  WHITE_SWAN_EXECUTION_ARTIFACT,
  WHITE_SWAN_FUTURES_ONLY_COUNTS,
  WHITE_SWAN_FUTURES_ONLY_PROFILE,
  WHITE_SWAN_EXECUTION_PROFILES,
  WHITE_SWAN_EXECUTION_TRUTH,
  WHITE_SWAN_EXECUTION_WEIGHT_SUM,
  getWhiteSwanExecutionStatus,
} from "@/lib/white-swan/execution-truth";

describe("white swan execution truth", () => {
  it("locks the canonical 17-strategy membership and 100 percent weight sum", () => {
    expect(WHITE_SWAN_EXECUTION_TRUTH).toHaveLength(17);
    expect(WHITE_SWAN_EXECUTION_WEIGHT_SUM).toBe(100);
    expect(WHITE_SWAN_EXECUTION_ARTIFACT.membershipCount).toBe(17);
    expect(WHITE_SWAN_EXECUTION_ARTIFACT.weightSumPct).toBe(100);
  });

  it("defines both 10k execution profiles", () => {
    expect(Object.keys(WHITE_SWAN_EXECUTION_PROFILES)).toEqual([
      "WHITE_SWAN_IBKR_10K_USD_V1",
      "WHITE_SWAN_IBKR_10K_EUR_V1",
    ]);
    expect(WHITE_SWAN_EXECUTION_PROFILES.WHITE_SWAN_IBKR_10K_USD_V1.accountEquity).toBe(10_000);
    expect(WHITE_SWAN_EXECUTION_PROFILES.WHITE_SWAN_IBKR_10K_EUR_V1.accountEquity).toBe(10_000);
  });

  it("locks the futures-only profile as the central execution invariant", () => {
    expect(WHITE_SWAN_FUTURES_ONLY_PROFILE.id).toBe("WHITE_SWAN_FUTURES_ONLY_V1");
    expect(WHITE_SWAN_FUTURES_ONLY_PROFILE.allowedSecType).toBe("FUT");
    expect(WHITE_SWAN_FUTURES_ONLY_COUNTS.strategies).toBe(17);
    expect(WHITE_SWAN_FUTURES_ONLY_COUNTS.canonicalWeightSumPct).toBe(100);
    expect(WHITE_SWAN_FUTURES_ONLY_COUNTS.futuresDecisionResolved).toBe(17);
    expect(WHITE_SWAN_FUTURES_ONLY_COUNTS.futuresMapped).toBe(17);
    expect(WHITE_SWAN_FUTURES_ONLY_COUNTS.nonFutureExecutionRows).toBe(0);
    expect(WHITE_SWAN_FUTURES_ONLY_COUNTS.cfdExecutionRows).toBe(0);
    expect(WHITE_SWAN_FUTURES_ONLY_COUNTS.stockExecutionRows).toBe(0);
    expect(WHITE_SWAN_FUTURES_ONLY_COUNTS.cashFxExecutionRows).toBe(0);
    expect(WHITE_SWAN_FUTURES_ONLY_COUNTS.fractionalFuturesOrders).toBe(0);
    expect(WHITE_SWAN_EXECUTION_ARTIFACT.version).toBe("WHITE_SWAN_FUTURES_ONLY_EXECUTION_V1");
  });

  it("has a deterministic execution verdict for every strategy in both profiles", () => {
    for (const entry of WHITE_SWAN_EXECUTION_TRUTH) {
      expect(entry.secType).toBe("FUT");
      expect(getWhiteSwanExecutionStatus(entry, "WHITE_SWAN_IBKR_10K_USD_V1")).toBeTruthy();
      expect(getWhiteSwanExecutionStatus(entry, "WHITE_SWAN_IBKR_10K_EUR_V1")).toBeTruthy();
      expect(entry.entryReference).toBeTruthy();
      expect(entry.riskDefinition).toBeTruthy();
      expect(entry.multiplier).not.toBeNull();
      expect(entry.tickSize).not.toBeNull();
      expect(entry.tickValue).not.toBeNull();
      expect(entry.smallerContractSymbol).toBeTruthy();
    }
    expect(WHITE_SWAN_EXECUTION_ARTIFACT.unresolvedExecution).toBe(0);
  });

  it("removes legacy stock and spot-fx execution routes for cross-instrument signals", () => {
    const executionById = new Map(
      WHITE_SWAN_EXECUTION_TRUTH.map((entry) => [entry.canonicalStrategyId, entry]),
    );

    const eurusd = executionById.get("eurusd_mt_30m_eurusd_30m");
    const gld = executionById.get("FP10_GLD_THURSDAY_LONG");
    const spy = executionById.get("spy_sea");
    const eem = executionById.get("eem_sea");
    const iwm = executionById.get("iwm_sea");
    const dax1h = executionById.get("mt_dax_1h_de30eur_1h");
    const dax2h = executionById.get("trend_momentum_dax_2h_de30eur_2h");

    expect(eurusd?.secType).toBe("FUT");
    expect(eurusd?.exchange).not.toBe("IDEALPRO");
    expect(eurusd?.ibkrSymbol).toBe("M6E");

    expect(gld?.secType).toBe("FUT");
    expect(gld?.ibkrSymbol).not.toBe("GLD");

    expect(spy?.secType).toBe("FUT");
    expect(spy?.ibkrSymbol).not.toBe("SPY");

    expect(eem?.secType).toBe("FUT");
    expect(eem?.ibkrSymbol).not.toBe("EEM");

    expect(iwm?.secType).toBe("FUT");
    expect(iwm?.ibkrSymbol).not.toBe("IWM");

    expect(dax1h?.secType).toBe("FUT");
    expect(dax2h?.secType).toBe("FUT");
  });

  it("keeps status counts aligned with membership in both profiles", () => {
    const usd =
      WHITE_SWAN_EXECUTION_ARTIFACT.statusCounts.usd10k.native +
      WHITE_SWAN_EXECUTION_ARTIFACT.statusCounts.usd10k.smallerContract +
      WHITE_SWAN_EXECUTION_ARTIFACT.statusCounts.usd10k.validatedProxy +
      WHITE_SWAN_EXECUTION_ARTIFACT.statusCounts.usd10k.notExecutable;
    const eur =
      WHITE_SWAN_EXECUTION_ARTIFACT.statusCounts.eur10k.native +
      WHITE_SWAN_EXECUTION_ARTIFACT.statusCounts.eur10k.smallerContract +
      WHITE_SWAN_EXECUTION_ARTIFACT.statusCounts.eur10k.validatedProxy +
      WHITE_SWAN_EXECUTION_ARTIFACT.statusCounts.eur10k.notExecutable;

    expect(usd).toBe(17);
    expect(eur).toBe(17);
  });

  it("keeps executable strategies fully populated and step-valid", () => {
    for (const entry of WHITE_SWAN_EXECUTION_TRUTH) {
      for (const [profileId, sizingFields] of [
        ["WHITE_SWAN_IBKR_10K_USD_V1", entry.usd10k] as const,
        ["WHITE_SWAN_IBKR_10K_EUR_V1", entry.eur10k] as const,
      ]) {
        expect(sizingFields.executionQuantity).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(sizingFields.executionQuantity)).toBe(true);
        const status = getWhiteSwanExecutionStatus(entry, profileId);
        if (status === "NOT_EXECUTABLE_10K") continue;
        expect(sizingFields.riskPerMinimumUnit).toBeGreaterThan(0);
        expect(sizingFields.executionQuantity).toBeGreaterThan(0);
        expect(sizingFields.initialMargin).toBeGreaterThan(0);
        if (entry.quantityStep != null && entry.quantityStep > 0) {
          expect((sizingFields.executionQuantity ?? 0) % entry.quantityStep).toBe(0);
        }
      }
    }
  });

  it("keeps executable risk within policy and no profile-level null counters", () => {
    expect(WHITE_SWAN_EXECUTION_ARTIFACT.executableStrategiesWithNullRisk.usd10k).toBe(0);
    expect(WHITE_SWAN_EXECUTION_ARTIFACT.executableStrategiesWithNullRisk.eur10k).toBe(0);
    expect(WHITE_SWAN_EXECUTION_ARTIFACT.executableStrategiesWithNullQty.usd10k).toBe(0);
    expect(WHITE_SWAN_EXECUTION_ARTIFACT.executableStrategiesWithNullQty.eur10k).toBe(0);
    expect(WHITE_SWAN_EXECUTION_ARTIFACT.executableStrategiesWithNullMargin.usd10k).toBe(0);
    expect(WHITE_SWAN_EXECUTION_ARTIFACT.executableStrategiesWithNullMargin.eur10k).toBe(0);

    for (const entry of WHITE_SWAN_EXECUTION_TRUTH) {
      const usdStatus = getWhiteSwanExecutionStatus(entry, "WHITE_SWAN_IBKR_10K_USD_V1");
      const eurStatus = getWhiteSwanExecutionStatus(entry, "WHITE_SWAN_IBKR_10K_EUR_V1");
      if (usdStatus !== "NOT_EXECUTABLE_10K") {
        expect(entry.usd10k.riskPerTradeAccountCurrency).toBeLessThanOrEqual(50);
      }
      if (eurStatus !== "NOT_EXECUTABLE_10K") {
        expect(entry.eur10k.riskPerTradeAccountCurrency).toBeLessThanOrEqual(50);
      }
    }
  });
});
