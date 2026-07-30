import { describe, expect, it } from "vitest";
import { collectDarwinexSnapshotBundle } from "@/lib/track-record/darwinex";
import { collectMyfxbookSnapshotBundle } from "@/lib/track-record/myfxbook";
import { buildTrackRecordOverview, runTrackRecordSync } from "@/lib/track-record/service";

describe("track record sync", () => {
  it("collects mock Myfxbook snapshots without losing normalized series", async () => {
    const bundle = await collectMyfxbookSnapshotBundle({ mode: "mock" });

    expect(bundle.rawSnapshots.length).toBe(7);
    expect(bundle.accounts.length).toBe(1);
    expect(bundle.dailyReturns.length).toBeGreaterThan(0);
    expect(bundle.dailyEquity.length).toBeGreaterThan(0);
    expect(bundle.closedTrades.length).toBeGreaterThan(0);
    expect(bundle.syncStatus[0]?.health).toBe("ok");
    expect(bundle.unavailable).toEqual([]);
  });

  it("collects mock Darwinex snapshots and keeps source separation", async () => {
    const bundle = await collectDarwinexSnapshotBundle({ mode: "mock" });

    expect(bundle.rawSnapshots.length).toBe(3);
    expect(bundle.accounts[0]?.source).toBe("darwinex_darwin");
    expect(bundle.dailyReturns.every((row) => row.source === "darwinex_darwin")).toBe(true);
    expect(bundle.metrics.some((row) => row.metricName === "darwin_quote")).toBe(true);
  });

  it("builds a read-only overview even without live credentials", async () => {
    const overview = await buildTrackRecordOverview();

    expect(overview.historical.baselinePeriod).toBeTruthy();
    expect(Array.isArray(overview.notes)).toBe(true);
    expect(Array.isArray(overview.live.badges)).toBe(true);
  });

  it("runs a mock sync in non-persistent mode", async () => {
    const result = await runTrackRecordSync({
      provider: "all",
      mode: "mock",
      persist: false,
    });

    expect(result.provider).toBe("all");
    expect(result.bundles).toHaveLength(3);
    expect(result.persistence).toHaveLength(0);
  });
});
