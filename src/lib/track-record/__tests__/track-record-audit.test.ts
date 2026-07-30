import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildInnoTrackRecordRuntimeModel } from "@/lib/about/inno-track-record-model";
import { validateAndRepairOhlc } from "@/lib/market-data/ohlc-quality";
import { buildHistoricalTrackRecordBundle, getHistoricalAnnualizationMethods } from "@/lib/track-record/historical";
import { computeMetricsFromDailySeries } from "@/lib/track-record/metrics";
import { buildTrackRecordOverview } from "@/lib/track-record/service";
import { parseBrokerLocalTimestamp } from "@/lib/track-record/utils";

describe("track record quantitative audit", () => {
  it("ships an idempotent service-role-only database migration", () => {
    const migration = readFileSync(
      path.join(process.cwd(), "supabase/migrations/20260730_track_record_pipeline.sql"),
      "utf8",
    );

    expect(migration).toContain("create table if not exists public.track_record_raw_snapshots");
    expect(migration).toContain("create unique index if not exists track_record_closed_trades_identity_idx");
    expect(migration).toContain("revoke all on table public.%I from anon, authenticated");
    expect(migration).toContain("for all to service_role");
    expect(migration).toContain("grant usage, select on all sequences in schema public to service_role");
    expect(migration).not.toContain("tablename = table_name");
  });

  it("annualizes equity over actual elapsed calendar time", () => {
    const metrics = computeMetricsFromDailySeries({
      source: "internal_computed",
      provider: "historical",
      providerAccountId: "test",
      equityRows: [
        equity("2025-01-01", 100),
        equity("2026-01-01", 121),
      ],
      returnRows: [
        dailyReturn("2025-01-02", 1),
        dailyReturn("2025-01-03", -0.5),
        dailyReturn("2025-01-06", 0.75),
      ],
      calculationSource: "manual regression fixture",
    });

    expect(metric(metrics, "annualized_return_pct")).toBeCloseTo(21, 1);
    expect(metric(metrics, "max_drawdown_pct")).toBe(0);
    expect(metric(metrics, "sharpe_ratio_annualized_zero_rf")).toBeTypeOf("number");
    expect(metrics.some((row) => row.metricName.includes("proxy"))).toBe(false);
  });

  it("classifies the three annualization values by non-equivalent return bases", () => {
    const methods = getHistoricalAnnualizationMethods();

    expect(methods.reported.valuePct).toBe(35.2);
    expect(methods.reported.formula).toContain("nicht dokumentiert");
    expect(methods.recalculatedCombined.valuePct).toBeCloseTo(35.77, 2);
    expect(methods.recalculatedCombined.returnSeries).toContain("97,2");
    expect(methods.monthlyGeometric.valuePct).toBeCloseTo(41.01, 2);
    expect(methods.monthlyGeometric.returnSeries).toContain("114,48");
    expect(methods.monthlyGeometric.partialMonths).toContain("unvollständiger Randperioden");
    expect(methods.monthlyGeometric.cashflows).toContain("Keine eigenständige");
  });

  it("normalizes the historical basis without inventing daily equity", () => {
    const bundle = buildHistoricalTrackRecordBundle();

    expect(bundle.monthlyReturns).toHaveLength(28);
    expect(bundle.dailyEquity).toHaveLength(0);
    expect(bundle.rawSnapshots).toHaveLength(0);
    expect(bundle.accounts.every((row) => row.accountNumberMasked === null)).toBe(true);
    expect(bundle.metrics.some((row) => row.metricName === "annualization_difference_percentage_points")).toBe(true);
    expect(metric(bundle.metrics, "annualized_return_recalculated_pct")).toBeCloseTo(35.77, 2);
    expect(metric(bundle.metrics, "monthly_geometric_annualized_return_pct")).toBeCloseTo(41.01, 1);
  });

  it("audits the historical source without duplicates or artificial completion", async () => {
    const overview = await buildTrackRecordOverview();
    const audit = overview.historical.importAudit;

    expect(audit.monthly).toMatchObject({
      count: 28,
      duplicateCount: 0,
      sorted: true,
      finitePercentValues: true,
      firstMonth: "2024-04",
      lastMonth: "2026-07",
    });
    expect(audit.partialTrades).toMatchObject({
      count: 89,
      duplicateCount: 0,
      sorted: true,
      invalidCount: 0,
      costRows: 89,
      accountCount: 1,
    });
    expect(audit.partialTrades.symbols).toEqual(["DE40", "EURUSD", "GBPJPY", "GBPUSD"]);
    expect(audit.partialTrades.classification).toContain("Teilhistorie");
    expect(overview.historical.historicalDataQuality).toBe("partial");
  });

  it("keeps Myfxbook-visible history separate from broker history", () => {
    const bundle = buildHistoricalTrackRecordBundle();
    const sources = new Set(bundle.closedTrades.map((trade) => `${trade.source}:${trade.providerAccountId}`));

    expect([...sources].every((key) => key.includes("historical-tactical-account-1")
      || key.includes("historical-tactical-account-2-visible"))).toBe(true);
    expect(bundle.closedTrades.every((trade) => !trade.providerAccountId.match(/^\d+$/))).toBe(true);
  });

  it("builds the same runtime model for desktop and mobile consumers", async () => {
    const overview = await buildTrackRecordOverview();
    const desktop = buildInnoTrackRecordRuntimeModel(overview);
    const mobile = buildInnoTrackRecordRuntimeModel(overview);

    expect(desktop).toEqual(mobile);
    expect(desktop.heroMetrics).toHaveLength(4);
    expect(desktop.readiness).toHaveLength(9);
    expect(desktop.myfxbookStatus).not.toBe("Live");
    expect(desktop.darwinexStatus).not.toBe("Live");
    expect(desktop.dataAgeStatus).toBe("Kein echter Live-Sync");
    expect(desktop.databaseStatus).toMatch(/Migration|verifiziert/);
  });

  it("normalizes broker-local timestamps with the configured IANA timezone", () => {
    expect(parseBrokerLocalTimestamp("2026-07-01T12:00:00", "Europe/Berlin").utc)
      .toBe("2026-07-01T10:00:00.000Z");
    expect(parseBrokerLocalTimestamp("2026-01-01T12:00:00", "Europe/Berlin").utc)
      .toBe("2026-01-01T11:00:00.000Z");
    expect(parseBrokerLocalTimestamp("2026-07-01T12:00:00", null).utc).toBeNull();
  });
});

describe("OHLC quality pipeline", () => {
  it("quarantines zero prices and retains the original row", () => {
    const bad = bar("2026-07-29", 100, 101, 99, 0);
    const result = validateAndRepairOhlc([bad], { intraday: false, nowMs: Date.parse("2026-07-30T00:00:00Z") });

    expect(result.accepted).toHaveLength(0);
    expect(result.quarantined).toEqual([bad]);
    expect(result.events[0]).toMatchObject({ flag: "non_positive", original: bad, corrected: null });
  });

  it("repairs an invalid body range with a traceable event", () => {
    const invalid = bar("2026-07-29", 100, 99, 101, 102);
    const result = validateAndRepairOhlc([invalid], { intraday: false, nowMs: Date.parse("2026-07-30T00:00:00Z") });

    expect(result.accepted[0]).toMatchObject({ high: 102, low: 100 });
    expect(result.events[0]?.flag).toBe("body_outside_range");
    expect(result.events[0]?.original).toEqual(invalid);
  });

  it("quarantines a cross-series close outlier", () => {
    const result = validateAndRepairOhlc([
      bar("2026-07-27", 100, 102, 99, 101),
      bar("2026-07-28", 101, 103, 100, 102),
      bar("2026-07-29", 1, 1.1, 0.9, 1),
    ], { intraday: false, nowMs: Date.parse("2026-07-30T00:00:00Z") });

    expect(result.accepted).toHaveLength(2);
    expect(result.events.some((event) => event.flag === "close_outlier")).toBe(true);
  });
});

function equity(dateUtc: string, value: number) {
  return {
    source: "internal_computed" as const,
    provider: "historical" as const,
    providerAccountId: "test",
    dateUtc,
    equity: value,
    balance: value,
    floatingPl: 0,
    brokerLocalDate: null,
    brokerTimezone: null,
  };
}

function dailyReturn(dateUtc: string, value: number) {
  return {
    source: "internal_computed" as const,
    provider: "historical" as const,
    providerAccountId: "test",
    dateUtc,
    returnPct: value,
    profit: null,
    brokerLocalDate: null,
    brokerTimezone: null,
  };
}

function metric(rows: ReturnType<typeof computeMetricsFromDailySeries>, name: string) {
  return rows.find((row) => row.metricName === name)?.metricValue;
}

function bar(time: string, open: number, high: number, low: number, close: number) {
  return { time, open, high, low, close };
}
