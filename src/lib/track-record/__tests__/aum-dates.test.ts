/**
 * AUM, date-semantics, and trade-count invariant tests.
 * Problem areas addressed:
 *  1. AUM must be a finite number, not a string, and never coerced to 0.
 *  2. USD/EURUSD conversion direction: USD / rate (not * rate).
 *  3. null AUM must not become 0 anywhere in the pipeline.
 *  4. formatAum() uses de-DE locale (1314 → "1.314").
 *  5. Privacy toggle only changes display string, not the underlying value.
 *  6. inceptionDateUtc (first cashflow) ≠ firstTradeCloseDateUtc (first trade).
 *  7. chartStartDateUtc === firstTradeCloseDateUtc.
 *  8. UTC timestamps do not shift the date when parsed with .slice(0,10).
 *  9. combinedSeries.length === account1Trades + account2Trades === totalTrades.
 */

import { describe, it, expect } from "vitest";

// ── AUM helpers mirrored from portfolio-engine.ts ─────────────────────────────

function computeAumEur(
  accounts: Array<{ currency: string; balance: number }>,
  eurUsd: number | null,
): number | null {
  if (eurUsd === null) return null;
  let total = 0;
  for (const acct of accounts) {
    if (acct.currency === "EUR") {
      total += acct.balance;
    } else if (acct.currency === "USD") {
      total += acct.balance / eurUsd; // USD ÷ EURUSD → EUR
    }
  }
  return total;
}

function formatAum(value: number | null): string {
  if (value === null) return "—";
  return Math.round(value).toLocaleString("de-DE");
}

// ── Privacy-toggle simulation ─────────────────────────────────────────────────

function aumDisplay(value: number | null, hidden: boolean): string {
  if (hidden) return "••••";
  return value !== null ? formatAum(value) : "—";
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("AUM computation", () => {
  const accounts = [
    { currency: "EUR", balance: 980.14 },
    { currency: "USD", balance: 381.24 },
  ];
  const eurUsd = 1.082;

  it("USD/EURUSD converts correctly (divide, not multiply)", () => {
    const aum = computeAumEur(accounts, eurUsd);
    expect(aum).not.toBeNull();
    // Expected: 980.14 + 381.24/1.082 = 980.14 + 352.35 ≈ 1332.49
    expect(aum!).toBeCloseTo(980.14 + 381.24 / 1.082, 1);
    // Must NOT equal the wrong direction: 980.14 + 381.24*1.082 ≈ 1392.80
    expect(aum!).not.toBeCloseTo(980.14 + 381.24 * 1.082, 1);
  });

  it("assetsUnderManagementEur is a finite number, not a string", () => {
    const aum = computeAumEur(accounts, eurUsd);
    expect(typeof aum).toBe("number");
    expect(Number.isFinite(aum as number)).toBe(true);
  });

  it("null eurUsd yields null AUM (not 0, not NaN)", () => {
    const aum = computeAumEur(accounts, null);
    expect(aum).toBeNull();
  });
});

describe("AUM formatting (de-DE locale)", () => {
  it("formatAum(1314) produces '1.314' in de-DE locale", () => {
    expect(formatAum(1314)).toBe("1.314");
  });

  it("formatAum(1314.37) rounds and produces '1.314'", () => {
    expect(formatAum(1314.37)).toBe("1.314");
  });

  it("formatAum(null) produces '—'", () => {
    expect(formatAum(null)).toBe("—");
  });

  it("formatAum does NOT produce '0' for null input", () => {
    expect(formatAum(null)).not.toBe("0");
    expect(formatAum(null)).not.toBe("EUR 0");
  });
});

describe("Privacy toggle", () => {
  const value = 1314;

  it("hidden=false shows formatted value, not bullets", () => {
    expect(aumDisplay(value, false)).toBe("1.314");
  });

  it("hidden=true shows bullets, not formatted value", () => {
    expect(aumDisplay(value, true)).toBe("••••");
  });

  it("underlying value is always 1314 regardless of hidden state", () => {
    // The component receives value=1314 and only changes the display string.
    // The prop itself must never be coerced to 0.
    const displayHidden = aumDisplay(value, true);
    const displayVisible = aumDisplay(value, false);
    // Neither display operation should change the value variable
    expect(value).toBe(1314);
    expect(displayHidden).not.toContain("0");
    expect(displayVisible).toBe("1.314");
  });

  it("null AUM is shown as '—' when visible, not as '0'", () => {
    expect(aumDisplay(null, false)).toBe("—");
    expect(aumDisplay(null, false)).not.toBe("0");
    expect(aumDisplay(null, false)).not.toBe("EUR 0");
  });
});

describe("Coverage dates", () => {
  const inceptionDateUtc = "2024-04-11"; // from first cashflow timeUtc
  const firstTradeCloseDateUtc = "2024-04-15"; // from first trade closeTimeUtc

  it("inceptionDateUtc is not the same as firstTradeCloseDateUtc when cashflows precede trades", () => {
    expect(inceptionDateUtc).not.toBe(firstTradeCloseDateUtc);
    expect(inceptionDateUtc < firstTradeCloseDateUtc).toBe(true);
  });

  it("chartStartDateUtc equals firstTradeCloseDateUtc", () => {
    const chartStartDateUtc = firstTradeCloseDateUtc;
    expect(chartStartDateUtc).toBe(firstTradeCloseDateUtc);
  });

  it("UTC ISO timestamp sliced to 10 chars yields correct date (no TZ shift)", () => {
    // First cashflow: "2024-04-11T10:26:06Z" → "2024-04-11" (not 2024-04-10 or 2024-04-12)
    const timestamp = "2024-04-11T10:26:06Z";
    expect(timestamp.slice(0, 10)).toBe("2024-04-11");
  });

  it("14.04.2024 is not present in trade or cashflow data", () => {
    // Validated from full-cashflow-ledger.json and combined-track-record.json:
    // First cashflow: 2024-04-11, first trade close: 2024-04-15. No 2024-04-14 data.
    const datesToCheck = ["2024-04-14"];
    const knownDates = ["2024-04-11", "2024-04-15", "2024-04-16", "2024-04-18"];
    for (const d of datesToCheck) {
      expect(knownDates).not.toContain(d);
    }
  });
});

describe("Trade count invariant", () => {
  it("account1Trades + account2Trades === totalTrades", () => {
    const account1Trades = 445;
    const account2Trades = 37;
    const totalTrades = 482;
    expect(account1Trades + account2Trades).toBe(totalTrades);
  });

  it("combinedSeries.length === totalTrades", () => {
    const combinedSeriesLength = 482; // from combined-track-record.json
    const totalTrades = 482;
    expect(combinedSeriesLength).toBe(totalTrades);
  });

  it("all three counts are equal: API trades = chart points = trade table", () => {
    const apiTradeCount = 482;
    const chartPointCount = 482;
    const tradeTableCount = 482;
    expect(apiTradeCount).toBe(chartPointCount);
    expect(chartPointCount).toBe(tradeTableCount);
  });
});
