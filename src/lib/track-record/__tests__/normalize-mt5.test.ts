/**
 * Unit tests for the MT5 normalizer (normalizeMt5).
 * The mt5-snapshot-reader is mocked so no filesystem reads occur.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Mt5DealRaw, Mt5PositionRaw, Mt5SnapshotRaw, Mt5HistoryRaw } from "../mt5-snapshot-reader";

// ── Mock the reader ──────────────────────────────────────────────────────────

vi.mock("../mt5-snapshot-reader", () => ({
  readMt5Snapshot: vi.fn(),
}));

import { readMt5Snapshot } from "../mt5-snapshot-reader";
import { normalizeMt5 } from "../normalize-mt5";

const mockReadSnapshot = vi.mocked(readMt5Snapshot);

// ── Helpers ───────────────────────────────────────────────────────────────────

const FAKE_PATH = "/fake/account_2-snapshot.json";
const NOW = Math.floor(Date.now() / 1000);

function makeSnapshot(overrides: Partial<Mt5SnapshotRaw> = {}): Mt5SnapshotRaw {
  return {
    schema_version:      1,
    complete:            true,
    account_id:          "account_2",
    platform:            "MT5",
    broker:              "Vantage",
    login_masked:        "****0544",
    server:              "VantageMarkets-Live 6",
    currency:            "USD",
    company:             "Vantage",
    balance:             5000,
    equity:              5100,
    profit:              100,
    margin:              200,
    margin_free:         4800,
    margin_level:        2550,
    leverage:            500,
    connected:           true,
    terminal_connected:  true,
    trade_allowed:       true,
    positions:           [] as Mt5PositionRaw[],
    generated_at_utc:    new Date(NOW * 1000).toISOString(),
    generated_at_epoch:  NOW,
    mt5_package_version: "5.0.0",
    terminal_version:    "5.0.0",
    ...overrides,
  };
}

function makeDeal(overrides: Partial<Mt5DealRaw>): Mt5DealRaw {
  return {
    ticket:      1000,
    order:       1000,
    position_id: 9000,
    time_epoch:  NOW,
    time_msc:    NOW * 1000,
    deal_type:   0,
    deal_entry:  0,
    symbol:      "EURUSD",
    volume:      0.1,
    price:       1.0850,
    commission:  -2,
    swap:        0,
    fee:         0,
    profit:      0,
    magic:       0,
    reason:      0,
    comment:     "",
    external_id: "",
    record_type: "trade",
    ...overrides,
  };
}

function makeHistory(deals: Mt5DealRaw[]): Mt5HistoryRaw {
  return { schema_version: 1, account_id: "account_2", deals };
}

function setupMock(deals: Mt5DealRaw[], positions: Mt5PositionRaw[] = [], snapOverride: Partial<Mt5SnapshotRaw> = {}) {
  mockReadSnapshot.mockReturnValue({
    snapshot:     makeSnapshot({ ...snapOverride, positions }),
    snapshotPath: "/fake/account_2-snapshot.json",
    history:      makeHistory(deals),
  });
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.clearAllMocks());

// ── Entry + Exit → 1 trade ────────────────────────────────────────────────────

describe("entry + exit pair", () => {
  it("produces exactly 1 NormalizedTrade for one IN + one OUT deal", () => {
    const inDeal  = makeDeal({ ticket: 101, deal_entry: 0, deal_type: 0, position_id: 9001, profit: 0 });
    const outDeal = makeDeal({ ticket: 102, deal_entry: 1, deal_type: 1, position_id: 9001, profit: 25 });
    setupMock([inDeal, outDeal]);

    const r = normalizeMt5(FAKE_PATH);
    expect(r.closedTrades).toHaveLength(1);
    expect(r.closedTrades[0].sourceDealIds).toContain(101);
    expect(r.closedTrades[0].sourceDealIds).toContain(102);
  });

  it("entry deal alone does not produce a closed trade", () => {
    const inDeal = makeDeal({ ticket: 201, deal_entry: 0, deal_type: 0, position_id: 9002 });
    setupMock([inDeal]);

    const r = normalizeMt5(FAKE_PATH);
    expect(r.closedTrades).toHaveLength(0);
  });
});

// ── Partial close: 2 OUT deals → 2 trades ────────────────────────────────────

describe("partial close", () => {
  it("produces 2 NormalizedTrade entries for 1 IN + 2 OUT deals", () => {
    const inDeal   = makeDeal({ ticket: 301, deal_entry: 0, deal_type: 0, position_id: 9003, profit: 0 });
    const outDeal1 = makeDeal({ ticket: 302, deal_entry: 1, deal_type: 1, position_id: 9003, profit: 10 });
    const outDeal2 = makeDeal({ ticket: 303, deal_entry: 1, deal_type: 1, position_id: 9003, profit: 15 });
    setupMock([inDeal, outDeal1, outDeal2]);

    const r = normalizeMt5(FAKE_PATH);
    expect(r.closedTrades).toHaveLength(2);
  });
});

// ── Cash flows ────────────────────────────────────────────────────────────────

describe("BALANCE deal (type=2)", () => {
  it("profit >= 0 → type=deposit", () => {
    setupMock([makeDeal({ ticket: 401, deal_type: 2, deal_entry: 0, profit: 1000, symbol: "" })]);
    const r = normalizeMt5(FAKE_PATH);
    expect(r.cashFlows).toHaveLength(1);
    expect(r.cashFlows[0].type).toBe("deposit");
  });

  it("profit < 0 → type=withdrawal", () => {
    setupMock([makeDeal({ ticket: 402, deal_type: 2, deal_entry: 0, profit: -500, symbol: "" })]);
    const r = normalizeMt5(FAKE_PATH);
    expect(r.cashFlows[0].type).toBe("withdrawal");
  });
});

describe("CREDIT deal (type=3)", () => {
  it("→ type=credit", () => {
    setupMock([makeDeal({ ticket: 403, deal_type: 3, deal_entry: 0, profit: 100, symbol: "" })]);
    const r = normalizeMt5(FAKE_PATH);
    expect(r.cashFlows[0].type).toBe("credit");
  });
});

describe("FEE deals (types 4-8)", () => {
  for (const dealType of [4, 5, 6, 7, 8]) {
    it(`deal_type=${dealType} → type=fee`, () => {
      setupMock([makeDeal({ ticket: 410 + dealType, deal_type: dealType, deal_entry: 0, profit: -5, symbol: "" })]);
      const r = normalizeMt5(FAKE_PATH);
      expect(r.cashFlows[0].type).toBe("fee");
    });
  }
});

describe("ADJUSTMENT deals (types 9-10)", () => {
  for (const dealType of [9, 10]) {
    it(`deal_type=${dealType} → type=adjustment`, () => {
      setupMock([makeDeal({ ticket: 420 + dealType, deal_type: dealType, deal_entry: 0, profit: 10, symbol: "" })]);
      const r = normalizeMt5(FAKE_PATH);
      expect(r.cashFlows[0].type).toBe("adjustment");
    });
  }
});

// ── Duplicate deal ticket ─────────────────────────────────────────────────────

describe("duplicate deal ticket", () => {
  it("skips second occurrence and adds a warning", () => {
    const d1 = makeDeal({ ticket: 501, deal_type: 2, deal_entry: 0, profit: 1000, symbol: "" });
    const d2 = makeDeal({ ticket: 501, deal_type: 2, deal_entry: 0, profit: 2000, symbol: "" }); // dupe
    setupMock([d1, d2]);

    const r = normalizeMt5(FAKE_PATH);
    expect(r.cashFlows).toHaveLength(1);
    expect(r.warnings.some((w) => w.includes("501"))).toBe(true);
  });
});

// ── sourceDealIds ─────────────────────────────────────────────────────────────

describe("sourceDealIds", () => {
  it("contains the deal tickets used to build the trade", () => {
    const inDeal  = makeDeal({ ticket: 601, deal_entry: 0, deal_type: 0, position_id: 9010, profit: 0 });
    const outDeal = makeDeal({ ticket: 602, deal_entry: 1, deal_type: 1, position_id: 9010, profit: 30 });
    setupMock([inDeal, outDeal]);

    const r = normalizeMt5(FAKE_PATH);
    expect(r.closedTrades[0].sourceDealIds).toEqual(expect.arrayContaining([601, 602]));
  });
});

// ── accountId ────────────────────────────────────────────────────────────────

describe("accountId", () => {
  it("all trades have accountId=account_2", () => {
    const inDeal  = makeDeal({ ticket: 701, deal_entry: 0, deal_type: 0, position_id: 9020 });
    const outDeal = makeDeal({ ticket: 702, deal_entry: 1, deal_type: 1, position_id: 9020, profit: 20 });
    setupMock([inDeal, outDeal]);

    const r = normalizeMt5(FAKE_PATH);
    expect(r.closedTrades[0].accountId).toBe("account_2");
    expect(r.account?.accountId).toBe("account_2");
  });
});

// ── No double-counting ────────────────────────────────────────────────────────

describe("no double-counting", () => {
  it("entry deal is not counted as a complete trade", () => {
    // Only an entry deal, no exit → 0 closed trades
    const inDeal = makeDeal({ ticket: 801, deal_entry: 0, deal_type: 0, position_id: 9030 });
    setupMock([inDeal]);

    const r = normalizeMt5(FAKE_PATH);
    expect(r.closedTrades).toHaveLength(0);
    expect(r.cashFlows).toHaveLength(0);
  });
});
