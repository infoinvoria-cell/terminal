import { describe, expect, it } from "vitest";
import config from "@/data/capitalife/core-invest.config.json";
import { INNO_IBKR_ROWS, INNO_SEASONAL_PATTERNS, INNO_STRATEGY_CARDS } from "@/lib/about/about-inno-data";
import { getAnalyticsDataset } from "@/lib/analytics/portfolio-data";
import { toMobileUrl } from "@/components/dashboard/sidebar";
import { desktopToMobile, mobileToDesktop } from "@/components/mobile/MobileRedirect";
import { CI_PORTFOLIO_KPIS, CI_STRATEGIES, CI_WEIGHTS } from "@/lib/components/ws-strategy-data";
import { CORE_INVEST_MODEL, getCoreInvestWeightTotal, CORE_INVEST_ETF_SYMBOLS, CORE_INVEST_MF_SYMBOLS } from "@/lib/core-invest/core-invest-model";
import { validateAndRepairOhlc } from "@/lib/market-data/ohlc-quality";
import type { CapalifeData } from "@/lib/capitalife-data";

describe("Core Invest Active Alpha 2 source-of-truth consistency", () => {
  it("has ETF Factor Sleeve with 9 entries (8 ETFs + BIL) summing to 100% net", () => {
    expect(CORE_INVEST_MODEL.etfFactorSleeve).toHaveLength(9);
    // Net exposure = 140% gross - 40% BIL = 100%
    expect(getCoreInvestWeightTotal()).toBeCloseTo(1.0, 8);
    // ETF symbols correct count (BIL excluded)
    expect(CORE_INVEST_ETF_SYMBOLS).toHaveLength(8);
  });

  it("has Managed Futures Overlay with 12 roots", () => {
    expect(CORE_INVEST_MODEL.managedFuturesOverlay).toHaveLength(12);
    expect(CORE_INVEST_MF_SYMBOLS).toHaveLength(12);
  });

  it("has correct Active Alpha 2 ablation KPIs", () => {
    expect(CORE_INVEST_MODEL.ablationKpis.sharpe).toBeCloseTo(0.663, 3);
    expect(CORE_INVEST_MODEL.ablationKpis.netCagrPct).toBeCloseTo(14.66, 2);
    expect(CORE_INVEST_MODEL.ablationKpis.maxDrawdownPct).toBeCloseTo(-28.33, 2);
    // Portfolio KPI display values match Brain source
    expect(CI_PORTFOLIO_KPIS.version).toBe("Active Alpha 2");
    expect(CI_PORTFOLIO_KPIS.cagr).toBe("+14.66%");
    expect(CI_PORTFOLIO_KPIS.sharpe).toBe("0.663");
  });

  it("has ETF weights matching config and CI_WEIGHTS", () => {
    const etfSleeveWeights = config.etf_factor_sleeve.weights;
    const configEtfSymbols = Object.keys(etfSleeveWeights).sort();
    const ciWeightsSymbols = Object.keys(CI_WEIGHTS).sort();
    expect(configEtfSymbols).toEqual(ciWeightsSymbols);
    for (const sym of configEtfSymbols) {
      const cfgW = etfSleeveWeights[sym as keyof typeof etfSleeveWeights];
      const ciW  = CI_WEIGHTS[sym as keyof typeof CI_WEIGHTS];
      expect(cfgW).toBeCloseTo(ciW as number, 6);
    }
  });

  it("does not expose rejected aggregate metrics as validated live KPIs", () => {
    expect(CORE_INVEST_MODEL.validation.rollingWalkForwardValid).toBe(false);
    expect(CORE_INVEST_MODEL.validation.liveReady).toBe(false);
    expect(CORE_INVEST_MODEL.validation.realLiveDataVerified).toBe(false);
    // No live_validated rows in CI_STRATEGIES
    expect(CI_STRATEGIES.some((row) => String(row.status) === "live_validated")).toBe(false);
  });

  it("has CI_STRATEGIES with correct sleeve structure", () => {
    const etfRows = CI_STRATEGIES.filter((r) => r.pillar === "etf_factor");
    const mfRows  = CI_STRATEGIES.filter((r) => r.pillar === "managed_futures");
    expect(etfRows).toHaveLength(9);   // 8 ETFs + BIL
    expect(mfRows).toHaveLength(12);   // 12 MF roots
    // All ETF rows are historical_reference
    expect(etfRows.every((r) => r.status === "historical_reference")).toBe(true);
    // BIL is included as cash financing
    expect(etfRows.some((r) => r.ticker === "BIL" && r.weight === -40)).toBe(true);
  });

  it("keeps the seasonal evidence register at seven found and three explicit gaps", () => {
    expect(INNO_SEASONAL_PATTERNS).toHaveLength(10);
    expect(INNO_SEASONAL_PATTERNS.filter((row) => row.found)).toHaveLength(7);
    expect(INNO_SEASONAL_PATTERNS.filter((row) => !row.found)).toHaveLength(3);
    expect(INNO_SEASONAL_PATTERNS.every((row) => row.productionReady === false)).toBe(true);
  });

  it("keeps the IBKR matrix explicit and non-production-ready", () => {
    expect(INNO_IBKR_ROWS).toHaveLength(12);
    expect(INNO_IBKR_ROWS.every((row) => row.conId === "Nicht belegt")).toBe(true);
    expect(INNO_IBKR_ROWS.every((row) => row.status === "Nicht produktionsbereit")).toBe(true);
    expect(INNO_IBKR_ROWS.some((row) => row.productType === "CFD")).toBe(false);
  });

  it("blocks both analytics modes until the canonical engine has parity", () => {
    const data = {} as CapalifeData;
    for (const mode of ["backtest", "live"] as const) {
      const dataset = getAnalyticsDataset("invest", mode, undefined, data);
      expect(dataset.performanceSeries).toEqual([]);
      expect(dataset.metrics.status).toBe("Validation blockiert");
    }
  });

  it("keeps Core Invest separate in the INNO preparation with correct track-record label", () => {
    const card = INNO_STRATEGY_CARDS.find((row) => row.id === "core-invest");
    expect(card).toBeDefined();
    expect(card?.rows.some((row) => row.key === "Track-Record-Status" && row.value.includes("Kein Live-Track-Record"))).toBe(true);
  });

  it("maps every audited desktop surface to its dedicated mobile route", () => {
    expect(toMobileUrl("/komponenten")).toBe("/m/komponenten");
    expect(toMobileUrl("/monitoring")).toBe("/m/monitoring");
    expect(toMobileUrl("/analytics")).toBe("/m/analytics");
    expect(toMobileUrl("/about")).toBe("/m/about");
    expect(toMobileUrl("/about/inno")).toBe("/m/about/inno");
    expect(desktopToMobile("/about")).toBe("/m/about");
    expect(desktopToMobile("/about/inno")).toBe("/m/about/inno");
    expect(mobileToDesktop("/m/about")).toBe("/about");
    expect(mobileToDesktop("/m/about/inno")).toBe("/about/inno");
  });

  it("records ordering, duplicate and interval quality events", () => {
    const result = validateAndRepairOhlc([
      { time: "2026-01-12", open: 102, high: 103, low: 101, close: 102 },
      { time: "2026-01-02", open: 100, high: 101, low: 99, close: 100 },
      { time: "2026-01-02", open: 100, high: 101, low: 99, close: 100 },
    ], { intraday: false, nowMs: Date.parse("2026-02-01T00:00:00Z") });

    expect(result.accepted.map((row) => row.time)).toEqual(["2026-01-02", "2026-01-12"]);
    expect(result.flags).toEqual(expect.arrayContaining(["unsorted_input", "duplicate_timestamp", "interval_gap"]));
  });
});
