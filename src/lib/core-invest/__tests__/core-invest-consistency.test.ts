import { describe, expect, it } from "vitest";
import config from "@/data/capitalife/core-invest.config.json";
import { INNO_IBKR_ROWS, INNO_SEASONAL_PATTERNS, INNO_STRATEGY_CARDS } from "@/lib/about/about-inno-data";
import { getAnalyticsDataset } from "@/lib/analytics/portfolio-data";
import { toMobileUrl } from "@/components/dashboard/sidebar";
import { desktopToMobile, mobileToDesktop } from "@/components/mobile/MobileRedirect";
import { CI_PORTFOLIO_KPIS, CI_STRATEGIES, CI_WEIGHTS } from "@/lib/components/ws-strategy-data";
import { CORE_INVEST_MODEL, getCoreInvestWeightTotal } from "@/lib/core-invest/core-invest-model";
import { validateAndRepairOhlc } from "@/lib/market-data/ohlc-quality";
import type { CapalifeData } from "@/lib/capitalife-data";

describe("Core Invest source-of-truth consistency", () => {
  it("keeps the frozen eight-component allocation at 100 percent", () => {
    expect(CORE_INVEST_MODEL.components).toHaveLength(8);
    expect(getCoreInvestWeightTotal()).toBeCloseTo(1, 12);
    expect(CORE_INVEST_MODEL.components.map((row) => row.id).sort()).toEqual(Object.keys(config.weights).sort());
    expect(CORE_INVEST_MODEL.components.map((row) => row.id).sort()).toEqual(Object.keys(CI_WEIGHTS).sort());
    for (const component of CORE_INVEST_MODEL.components) {
      expect(component.weight).toBe(config.weights[component.id as keyof typeof config.weights]);
      expect(component.weight).toBe(CI_WEIGHTS[component.id as keyof typeof CI_WEIGHTS]);
    }
  });

  it("does not expose rejected aggregate metrics as validated KPIs", () => {
    expect(CORE_INVEST_MODEL.validation.aggregateBacktestValid).toBe(false);
    expect(CORE_INVEST_MODEL.validation.rollingWalkForwardValid).toBe(false);
    expect(CORE_INVEST_MODEL.validation.liveReady).toBe(false);
    expect(CORE_INVEST_MODEL.validation.liveReadyComponents).toBe(0);
    expect(CORE_INVEST_MODEL.validation.historicalSeriesReady).toBe(4);
    expect(CORE_INVEST_MODEL.components.every((row) => row.liveReady === false)).toBe(true);
    expect(CORE_INVEST_MODEL.components.every((row) => row.ibkrMappingStatus === "offen")).toBe(true);
    expect(CI_PORTFOLIO_KPIS.cagr).toBe("nicht validiert");
    expect(CI_PORTFOLIO_KPIS.sharpe).toBe("nicht validiert");
    expect(CI_STRATEGIES.some((row) => String(row.status) === "live_validated")).toBe(false);
    expect(CI_STRATEGIES.filter((row) => row.status === "historical_reference")).toHaveLength(4);
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
      expect(dataset.metrics.components).toBe("8");
    }
  });

  it("keeps Core Invest separate in the INNO preparation", () => {
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
