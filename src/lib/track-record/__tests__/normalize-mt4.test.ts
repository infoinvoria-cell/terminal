/**
 * Unit tests for the MT4 normalizer (normalizeMt4).
 * All filesystem access is mocked — no real files read.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock fs BEFORE importing the module under test
vi.mock("fs", () => ({
  existsSync:   vi.fn(),
  readFileSync: vi.fn(),
}));

import { existsSync, readFileSync } from "fs";
import { normalizeMt4 } from "../normalize-mt4";

const mockExists = vi.mocked(existsSync);
const mockRead   = vi.mocked(readFileSync);

const SNAPSHOT_PATH = "/fake/account_1-snapshot.json";
const HISTORY_PATH  = "/fake/account_1-history.json";
const NOW_EPOCH = Math.floor(Date.now() / 1000);

function makeSnap(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    account_id:               "account_1",
    platform:                 "MT4",
    broker:                   "RoboForex Ltd",
    server:                   "RoboForex-ECN-2",
    login_masked:             "****1234",
    account_currency:         "EUR",
    leverage:                 500,
    balance:                  10000,
    equity:                   10050,
    margin:                   500,
    free_margin:              9550,
    margin_level:             2010,
    floating_profit:          50,
    connected:                true,
    generated_at_utc:         new Date(NOW_EPOCH * 1000).toISOString(),
    gmt_time_epoch:           NOW_EPOCH,
    server_utc_offset_seconds:7200,
    complete:                 true,
    ...overrides,
  });
}

function makeHist(trades: object[]): string {
  return JSON.stringify({
    account_id:                "account_1",
    server_utc_offset_seconds: 7200,
    trades,
  });
}

const BASE_TRADE = {
  ticket:                    10001,
  record_type:               "trade",
  symbol:                    "EURUSD",
  order_type:                "buy",
  lots:                      0.1,
  open_time_server_epoch:    1700000000,
  close_time_server_epoch:   1700003600,
  open_price:                1.0850,
  close_price:               1.0870,
  stop_loss:                 1.0800,
  take_profit:               1.0900,
  commission:                -2.0,
  swap:                      -0.5,
  profit:                    20.0,
  magic_number:              77,
  comment:                   "[tp]",
};

beforeEach(() => {
  mockExists.mockImplementation((p: unknown) => {
    const s = String(p);
    return s.includes("snapshot") || s.includes("history");
  });
  mockRead.mockImplementation((p: unknown) => {
    if (String(p).includes("history")) return makeHist([BASE_TRADE]);
    return makeSnap();
  });
});

afterEach(() => vi.clearAllMocks());

// ── Buy order ─────────────────────────────────────────────────────────────────

describe("buy order", () => {
  it("produces NormalizedTrade with side=buy and status=closed", () => {
    const r = normalizeMt4(SNAPSHOT_PATH, HISTORY_PATH);
    expect(r.closedTrades).toHaveLength(1);
    const t = r.closedTrades[0];
    expect(t.side).toBe("buy");
    expect(t.status).toBe("closed");
  });

  it("sets source=mt4_file and accountId=account_1", () => {
    const r = normalizeMt4(SNAPSHOT_PATH, HISTORY_PATH);
    const t = r.closedTrades[0];
    expect(t.source).toBe("mt4_file");
    expect(t.accountId).toBe("account_1");
  });
});

// ── Sell order ────────────────────────────────────────────────────────────────

describe("sell order", () => {
  it("produces NormalizedTrade with side=sell", () => {
    mockRead.mockImplementation((p: unknown) => {
      if (String(p).includes("history"))
        return makeHist([{ ...BASE_TRADE, ticket: 10002, order_type: "sell", profit: -15 }]);
      return makeSnap();
    });
    const r = normalizeMt4(SNAPSHOT_PATH, HISTORY_PATH);
    expect(r.closedTrades[0].side).toBe("sell");
  });
});

// ── netProfit calculation ─────────────────────────────────────────────────────

describe("netProfit", () => {
  it("equals grossProfit + commission + swap", () => {
    const r = normalizeMt4(SNAPSHOT_PATH, HISTORY_PATH);
    const t = r.closedTrades[0];
    expect(t.netProfit).toBeCloseTo(t.grossProfit + t.commission + t.swap, 8);
  });

  it("grossProfit equals raw profit field", () => {
    const r = normalizeMt4(SNAPSHOT_PATH, HISTORY_PATH);
    expect(r.closedTrades[0].grossProfit).toBe(20.0);
  });
});

// ── Deposit cashflow ──────────────────────────────────────────────────────────

describe("deposit cash flow", () => {
  it("maps balance record (profit >= 0) to type=deposit", () => {
    mockRead.mockImplementation((p: unknown) => {
      if (String(p).includes("history"))
        return makeHist([
          { ...BASE_TRADE, ticket: 20001, record_type: "balance", order_type: "unknown", profit: 5000 },
        ]);
      return makeSnap();
    });
    const r = normalizeMt4(SNAPSHOT_PATH, HISTORY_PATH);
    expect(r.cashFlows).toHaveLength(1);
    expect(r.cashFlows[0].type).toBe("deposit");
    expect(r.cashFlows[0].amount).toBe(5000);
  });
});

// ── Withdrawal cashflow ───────────────────────────────────────────────────────

describe("withdrawal cash flow", () => {
  it("maps balance record (profit < 0) to type=withdrawal", () => {
    mockRead.mockImplementation((p: unknown) => {
      if (String(p).includes("history"))
        return makeHist([
          { ...BASE_TRADE, ticket: 20002, record_type: "balance", order_type: "unknown", profit: -1000 },
        ]);
      return makeSnap();
    });
    const r = normalizeMt4(SNAPSHOT_PATH, HISTORY_PATH);
    expect(r.cashFlows[0].type).toBe("withdrawal");
  });

  it("maps explicit withdrawal record_type to type=withdrawal", () => {
    mockRead.mockImplementation((p: unknown) => {
      if (String(p).includes("history"))
        return makeHist([
          { ...BASE_TRADE, ticket: 20003, record_type: "withdrawal", order_type: "unknown", profit: -500 },
        ]);
      return makeSnap();
    });
    const r = normalizeMt4(SNAPSHOT_PATH, HISTORY_PATH);
    expect(r.cashFlows[0].type).toBe("withdrawal");
  });
});

// ── Credit cashflow ───────────────────────────────────────────────────────────

describe("credit cash flow", () => {
  it("maps credit record_type to type=credit", () => {
    mockRead.mockImplementation((p: unknown) => {
      if (String(p).includes("history"))
        return makeHist([
          { ...BASE_TRADE, ticket: 20004, record_type: "credit", order_type: "unknown", profit: 100 },
        ]);
      return makeSnap();
    });
    const r = normalizeMt4(SNAPSHOT_PATH, HISTORY_PATH);
    expect(r.cashFlows[0].type).toBe("credit");
  });
});

// ── Duplicate ticket ──────────────────────────────────────────────────────────

describe("duplicate ticket", () => {
  it("skips the second occurrence and adds a warning", () => {
    mockRead.mockImplementation((p: unknown) => {
      if (String(p).includes("history"))
        return makeHist([
          BASE_TRADE,
          { ...BASE_TRADE }, // same ticket 10001
        ]);
      return makeSnap();
    });
    const r = normalizeMt4(SNAPSHOT_PATH, HISTORY_PATH);
    expect(r.closedTrades).toHaveLength(1);
    expect(r.warnings.some((w) => w.includes("duplicate") && w.includes("10001"))).toBe(true);
  });
});

// ── loginMasked privacy ───────────────────────────────────────────────────────

describe("loginMasked", () => {
  it("never contains an unmasked digit sequence longer than 6 chars", () => {
    const r = normalizeMt4(SNAPSHOT_PATH, HISTORY_PATH);
    const login = r.account?.loginMasked ?? "";
    const unmaskedDigits = login.replace(/\*/g, "");
    expect(unmaskedDigits.length).toBeLessThanOrEqual(6);
  });

  it("starts with ****", () => {
    const r = normalizeMt4(SNAPSHOT_PATH, HISTORY_PATH);
    expect(r.account?.loginMasked.startsWith("****")).toBe(true);
  });
});

// ── Missing snapshot ──────────────────────────────────────────────────────────

describe("missing snapshot", () => {
  it("returns null account and a warning", () => {
    mockExists.mockReturnValue(false);
    const r = normalizeMt4(SNAPSHOT_PATH, HISTORY_PATH);
    expect(r.account).toBeNull();
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});

// ── Trade vs cashflow separation ──────────────────────────────────────────────

describe("trade vs cashflow separation", () => {
  it("does not place a trade record in cashFlows", () => {
    const r = normalizeMt4(SNAPSHOT_PATH, HISTORY_PATH);
    expect(r.cashFlows).toHaveLength(0);
    expect(r.closedTrades).toHaveLength(1);
  });

  it("does not place a deposit in closedTrades", () => {
    mockRead.mockImplementation((p: unknown) => {
      if (String(p).includes("history"))
        return makeHist([
          { ...BASE_TRADE, ticket: 30001, record_type: "balance", order_type: "unknown", profit: 5000 },
        ]);
      return makeSnap();
    });
    const r = normalizeMt4(SNAPSHOT_PATH, HISTORY_PATH);
    expect(r.closedTrades).toHaveLength(0);
    expect(r.cashFlows).toHaveLength(1);
  });
});
