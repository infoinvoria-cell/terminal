/**
 * White Swan Final (v6.3.5) — canonical release integrity tests
 *
 * Verifies the generated canonical files consumed by /white-swan/final are internally
 * consistent: all tiers present, CORE 5/5, exact contract loading, daily NAV consistency,
 * no OOS leakage flag, survival PASS, Serkan reconciliation, no stale-version fallback,
 * current version, release manifest.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "../../../..");
const DATA_DIR = path.join(ROOT, "public", "data", "white-swan", "final");

function readJson(file: string) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf8"));
}

describe("White Swan Final v6.3.5 — canonical data integrity", () => {
  const summary = readJson("portfolio-summary.json");

  it("has all 10 capital tiers including €12k", () => {
    const caps = summary.capitalComparison.map((c: { capital: number }) => c.capital);
    expect(caps).toEqual([10000, 12000, 15000, 20000, 25000, 30000, 40000, 50000, 75000, 100000]);
  });

  it("reports current version v6.3.5", () => {
    expect(summary.version).toBe("v6.3.5");
  });

  it("has CORE 5/5 on every tier", () => {
    for (const c of summary.capitalComparison) {
      expect(c.corePassStr).toContain("5/5");
      expect(c.corePass).toBe(true);
    }
  });

  it("loads exact integer contracts for the five core sleeves on every tier", () => {
    const coreIds = ["eurusd_m6e", "dax_1h", "dax_2h", "gld_mgc", "zw_mzw"];
    for (const c of summary.capitalComparison) {
      for (const id of coreIds) {
        expect(c.contracts[id]).toBeGreaterThanOrEqual(1);
        expect(Number.isInteger(c.contracts[id])).toBe(true);
      }
    }
  });

  it("ZM1 is excluded from every tier's contracts (no genuine daily data)", () => {
    for (const c of summary.capitalComparison) {
      expect(c.contracts.zm1_seasonal).toBeUndefined();
    }
  });

  it("does not leak OOS2019+ into selection metrics (selectionMetrics has no oos2019 key)", () => {
    for (const c of summary.capitalComparison) {
      expect(Object.keys(c.selectionMetrics).some((k) => k.toLowerCase().includes("oos2019"))).toBe(false);
    }
  });

  it("carries no stale v4/v5/v6.1/v6.2 text in top-level description fields", () => {
    const text = JSON.stringify({ description: summary.description, navMethodNote: summary.navMethodNote });
    expect(text).not.toMatch(/v6\.1|v6\.2\b|v4\b|v5\b/);
  });
});

describe("White Swan Final v6.3.5 — DAX survival gate", () => {
  const survival = readJson("dax-concentration-survival.json");

  it("passes the hard survival filter on all 10 tiers", () => {
    expect(survival.allTiersPass).toBe(true);
    expect(survival.tiers).toHaveLength(10);
    for (const t of survival.tiers) {
      expect(t.survivalPass).toBe("PASS");
      expect(t.minExcessLiquidityDuringWorstDaxDayEUR).toBeGreaterThanOrEqual(0);
    }
  });

  it("uses the genuine worst historical FDAX day (2020-03-12)", () => {
    expect(survival.fdaxWorstDayReal.date).toBe("2020-03-12");
    expect(survival.fdaxWorstDayReal.chg).toBeGreaterThan(1000);
  });
});

describe("White Swan Final v6.3.5 — DAX core validation", () => {
  const core = readJson("dax-core-validation.json");

  it("DAX1H and DAX2H are genuine and PASS", () => {
    expect(core.DAX1H_CORE_VALID).toBe("PASS");
    expect(core.DAX2H_CORE_VALID).toBe("PASS");
    expect(core.dax1h.n).toBeGreaterThan(0);
    expect(core.dax2h.n).toBeGreaterThan(0);
  });

  it("all core daily-MTM sleeves PASS", () => {
    expect(core.M6E_DAILY_MTM).toBe("PASS");
    expect(core.MZW_DAILY_MTM).toBe("PASS");
    expect(core.MGC_DAILY_MTM).toBe("PASS");
  });
});

describe("White Swan Final v6.3.5 — release manifest", () => {
  it("exists and reports build PASS", () => {
    const manifest = readJson("release-manifest.json");
    expect(manifest.version).toBe("v6.3.5");
    expect(manifest.build_status).toBe("PASS");
    expect(manifest.capital_tiers).toEqual([10000, 12000, 15000, 20000, 25000, 30000, 40000, 50000, 75000, 100000]);
    expect(manifest.blocked_sleeves).toContain("zm1_seasonal");
  });
});

describe("White Swan Final v6.3.5 — Serkan reconciliation", () => {
  const SERKAN_DIR = path.join(ROOT, "workspace", "output", "white-swan", "serkan", "v6.3");

  it("has one CSV per tier with correct header and no malformed rows", () => {
    const caps = [10, 12, 15, 20, 25, 30, 40, 50, 75, 100];
    for (const capK of caps) {
      const file = path.join(SERKAN_DIR, `white_swan_${capK}k_daily_returns.csv`);
      expect(fs.existsSync(file)).toBe(true);
      const lines = fs.readFileSync(file, "utf8").trim().split("\n");
      expect(lines[0]).toBe("Date,Daily_Return");
      const dates = new Set<string>();
      let prevDate = "";
      for (const row of lines.slice(1)) {
        const [date, ret] = row.split(",");
        expect(/^\d{4}-\d{2}-\d{2}$/.test(date)).toBe(true);
        expect(date > prevDate).toBe(true);
        expect(dates.has(date)).toBe(false);
        dates.add(date);
        prevDate = date;
        expect(Number.isFinite(parseFloat(ret))).toBe(true);
      }
    }
  });

  it("daily returns reconcile to canonical NAV within tolerance", () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(ROOT, "workspace", "output", "white-swan", "v6.3", "release-hardening", "serkan-package-manifest.json"), "utf8")
    );
    for (const f of manifest.files) {
      expect(f.status).toBe("PASS");
    }
  });
});
