/**
 * Security test: assembled output must never contain forbidden key fragments
 * anywhere in its object tree.
 */

import { describe, it, expect } from "vitest";
import type { NormalizedTrackRecord } from "../normalized-types";

// ── Helper: recursive forbidden-key scanner ───────────────────────────────────

const FORBIDDEN_FRAGMENTS = [
  "password",
  "investor_password",
  "secret",
  "token",
  "api_key",
  "authorization",
  "terminal_path",
  "data_path",
];

function findForbiddenKeys(obj: unknown, forbidden: string[]): string[] {
  const found: string[] = [];

  function walk(val: unknown, path: string) {
    if (val && typeof val === "object") {
      for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
        if (forbidden.some((f) => k.toLowerCase().includes(f.toLowerCase()))) {
          found.push(`${path}.${k}`);
        }
        walk(v, `${path}.${k}`);
      }
    }
  }

  walk(obj, "root");
  return found;
}

// ── Minimal clean assembled output ────────────────────────────────────────────

const NOW = Math.floor(Date.now() / 1000);

const CLEAN_OUTPUT: NormalizedTrackRecord = {
  schemaVersion:   1,
  generatedAtUtc:  new Date(NOW * 1000).toISOString(),
  generatedAtEpoch:NOW,
  accounts: [
    {
      accountId:      "account_1",
      platform:       "MT4",
      broker:         "TestBroker",
      loginMasked:    "****1234",
      server:         "Test-Server",
      currency:       "EUR",
      balance:        10000,
      equity:         10050,
      floatingProfit: 50,
      margin:         500,
      freeMargin:     9550,
      marginLevel:    2010,
      leverage:       100,
      connected:      true,
      generatedAtUtc:  new Date(NOW * 1000).toISOString(),
      generatedAtEpoch:NOW,
      source:         "mt4_file",
      sourceFresh:    true,
    },
  ],
  closedTrades:  [],
  openPositions: [],
  cashFlows:     [],
  balanceCurves: { account_1: [] },
  equitySnapshots: [],
  kpis: {
    account_1: {
      accountId:             "account_1",
      currency:              "EUR",
      closedTradeCount:      0,
      winners:               0,
      losers:                0,
      winRate:               null,
      grossProfit:           0,
      grossLoss:             0,
      netProfit:             0,
      profitFactor:          null,
      averageWin:            null,
      averageLoss:           null,
      bestTrade:             null,
      worstTrade:            null,
      averageTrade:          null,
      payoffRatio:           null,
      currentBalance:        10000,
      currentEquity:         10050,
      currentFloatingPnl:    50,
      totalDeposits:         0,
      totalWithdrawals:      0,
      balanceDrawdown:       null,
      balanceDrawdownReason: "insufficient_balance_events",
      equityDrawdown:        null,
      equityDrawdownReason:  "insufficient_equity_snapshots",
    },
  },
  warnings:     [],
  sourceStatus: { account_1: { ok: true } },
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("security: no forbidden keys in clean assembled output", () => {
  it("finds no forbidden keys in a typical clean output", () => {
    const forbidden = findForbiddenKeys(CLEAN_OUTPUT, FORBIDDEN_FRAGMENTS);
    expect(forbidden).toHaveLength(0);
  });
});

describe("security: findForbiddenKeys helper correctly detects violations", () => {
  it("detects top-level password key", () => {
    const contaminated = { ...CLEAN_OUTPUT, password: "hunter2" };
    const found = findForbiddenKeys(contaminated, FORBIDDEN_FRAGMENTS);
    expect(found.some((p) => p.includes("password"))).toBe(true);
  });

  it("detects nested api_key", () => {
    const contaminated = { ...CLEAN_OUTPUT, meta: { api_key: "abc123" } };
    const found = findForbiddenKeys(contaminated, FORBIDDEN_FRAGMENTS);
    expect(found.some((p) => p.includes("api_key"))).toBe(true);
  });

  it("detects investor_password in nested account object", () => {
    const contaminated = {
      ...CLEAN_OUTPUT,
      accounts: [{ ...CLEAN_OUTPUT.accounts[0], investor_password: "secret" }],
    };
    const found = findForbiddenKeys(contaminated, FORBIDDEN_FRAGMENTS);
    expect(found.some((p) => p.includes("investor_password"))).toBe(true);
  });

  it("detects terminal_path", () => {
    const contaminated = { ...CLEAN_OUTPUT, terminal_path: "C:\\MT4\\RoboForex" };
    const found = findForbiddenKeys(contaminated, FORBIDDEN_FRAGMENTS);
    expect(found.some((p) => p.includes("terminal_path"))).toBe(true);
  });

  it("detects data_path", () => {
    const contaminated = { ...CLEAN_OUTPUT, data_path: "C:\\MT4\\Data" };
    const found = findForbiddenKeys(contaminated, FORBIDDEN_FRAGMENTS);
    expect(found.some((p) => p.includes("data_path"))).toBe(true);
  });

  it("detects secret anywhere in tree", () => {
    const contaminated = {
      ...CLEAN_OUTPUT,
      sourceStatus: { account_1: { ok: true, secret: "leak" } },
    };
    const found = findForbiddenKeys(contaminated, FORBIDDEN_FRAGMENTS);
    expect(found.some((p) => p.includes("secret"))).toBe(true);
  });
});

describe("security: loginMasked invariant", () => {
  it("all accounts have loginMasked starting with ****", () => {
    for (const acct of CLEAN_OUTPUT.accounts) {
      expect(acct.loginMasked.startsWith("****")).toBe(true);
    }
  });

  it("loginMasked does not expose more than 6 unmasked digits", () => {
    for (const acct of CLEAN_OUTPUT.accounts) {
      const unmasked = acct.loginMasked.replace(/\*/g, "");
      expect(unmasked.length).toBeLessThanOrEqual(6);
    }
  });
});
