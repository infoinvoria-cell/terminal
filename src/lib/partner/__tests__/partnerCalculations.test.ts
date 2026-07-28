import { describe, it, expect } from "vitest";
import {
  calcPerformanceFeeDistribution,
  calcAP,
  resolvePartnerTier,
  tierProgress,
  calcActiveVolume,
  calcMgmtFeeDistribution,
  calcGrandTotal,
} from "../partnerCalculations";

describe("Performance Fee Distribution", () => {
  it("Gold: 100k profit → correct distribution", () => {
    const r = calcPerformanceFeeDistribution(100_000, "gold");
    expect(r.performanceFee).toBe(25_000);
    expect(r.innoInvestShare).toBe(3_125);
    expect(r.clBase).toBe(21_875);
    expect(r.partnerShare).toBe(8_750);
    expect(r.clRemainder).toBe(13_125);
    // Checksum: investor 75k + inno 3.125k + partner 8.75k + cl 13.125k = 100k
    const sum = (100_000 - 25_000) + r.innoInvestShare + r.partnerShare + r.clRemainder;
    expect(sum).toBe(100_000);
  });

  it("Bronze: 20% partner share", () => {
    const r = calcPerformanceFeeDistribution(100_000, "bronze");
    expect(r.partnerShare).toBe(4_375); // 21875 * 0.20
  });

  it("Black: 60% partner share", () => {
    const r = calcPerformanceFeeDistribution(100_000, "black");
    expect(r.partnerShare).toBe(13_125); // 21875 * 0.60
  });

  it("Checksum holds for all tiers", () => {
    for (const tier of ["bronze", "silver", "gold", "platin", "black"] as const) {
      const r = calcPerformanceFeeDistribution(100_000, tier);
      const sum = (100_000 - 25_000) + r.innoInvestShare + r.partnerShare + r.clRemainder;
      expect(sum).toBe(100_000);
    }
  });
});

describe("AP Calculation", () => {
  it("1 year: 0.5%", () => {
    expect(calcAP(100_000, 1).apAmount).toBe(500);
  });
  it("3 years: 1.0%", () => {
    expect(calcAP(100_000, 3).apAmount).toBe(1_000);
  });
  it("5 years: 1.5%", () => {
    expect(calcAP(100_000, 5).apAmount).toBe(1_500);
  });
});

describe("Tier Resolution", () => {
  it("0€ → Bronze", () => {
    expect(resolvePartnerTier(0, false).id).toBe("bronze");
  });
  it("500k → Silber", () => {
    expect(resolvePartnerTier(500_000, false).id).toBe("silver");
  });
  it("1M → Gold", () => {
    expect(resolvePartnerTier(1_000_000, false).id).toBe("gold");
  });
  it("2M → Platin", () => {
    expect(resolvePartnerTier(2_000_000, false).id).toBe("platin");
  });
  it("5M → Black", () => {
    expect(resolvePartnerTier(5_000_000, false).id).toBe("black");
  });
  it("Founder 250k → Silber", () => {
    expect(resolvePartnerTier(250_000, true).id).toBe("silver");
  });
  it("Founder 499k → Silber (not Gold)", () => {
    expect(resolvePartnerTier(499_000, true).id).toBe("silver");
  });
  it("Founder 500k → Gold", () => {
    expect(resolvePartnerTier(500_000, true).id).toBe("gold");
  });
});

describe("Tier Progress", () => {
  it("progress at Bronze level toward Silber", () => {
    const { current, next, progress } = tierProgress(250_000, false);
    expect(current.id).toBe("bronze");
    expect(next?.id).toBe("silver");
    expect(progress).toBeCloseTo(0.5);
  });
  it("at Black: no next, progress=1", () => {
    const { next, progress } = tierProgress(5_000_000, false);
    expect(next).toBeNull();
    expect(progress).toBe(1);
  });
});

describe("Active Volume", () => {
  it("sums own and team volume", () => {
    const r = calcActiveVolume(200_000, 100_000);
    expect(r.totalVolume).toBe(300_000);
    expect(r.ownVolume).toBe(200_000);
    expect(r.teamVolume).toBe(100_000);
  });
});

describe("Management Fee", () => {
  it("1M investment, 1 year, no partner", () => {
    const r = calcMgmtFeeDistribution(1_000_000, 1, null);
    expect(r.grossMgmtFeeEur).toBe(30_000);       // 3%
    expect(r.innoInvestShareEur).toBe(3_750);      // 12.5%
    expect(r.clBaseEur).toBe(26_250);
    expect(r.partnerShareEur).toBe(0);
    expect(r.clNetEur).toBe(26_250);
  });
  it("With 20% partner rate", () => {
    const r = calcMgmtFeeDistribution(1_000_000, 1, 0.2);
    expect(r.partnerShareEur).toBe(5_250);         // 26250 * 0.20
    expect(r.clNetEur).toBe(21_000);
  });
});

describe("Grand Total Checksum", () => {
  it("Gold, 100k profit, 1M investment, 3yr lockup", () => {
    const pf = calcPerformanceFeeDistribution(100_000, "gold");
    const mf = calcMgmtFeeDistribution(1_000_000, 1, null);
    const ap = calcAP(1_000_000, 3);
    const gt = calcGrandTotal(pf, mf, ap);
    // PF checksum: investor + inno + partner + cl = 100000
    expect(gt.checksum).toBe(100_000);
  });
});
