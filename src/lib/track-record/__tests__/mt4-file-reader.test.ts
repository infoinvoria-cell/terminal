import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readMt4FileSnapshot, SNAPSHOT_SCHEMA_VERSION } from "../mt4-file-reader";

// ── fs mocks ──────────────────────────────────────────────────────
vi.mock("fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

import { existsSync, readFileSync } from "fs";
const mockExists = vi.mocked(existsSync);
const mockRead   = vi.mocked(readFileSync);

const DATA_PATH  = "C:\\MT4\\RoboForex";
const ACCOUNT_ID = "account_1";

const nowEpoch = () => Math.floor(Date.now() / 1000);

function validSnap(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schema_version:          SNAPSHOT_SCHEMA_VERSION,
    account_id:              ACCOUNT_ID,
    platform:                "MT4",
    broker:                  "RoboForex",
    server:                  "RoboForex-Pro",
    login_masked:            "****1234",
    account_currency:        "EUR",
    leverage:                100,
    balance:                 10000.00,
    equity:                  10050.00,
    margin:                  500.00,
    free_margin:             9550.00,
    margin_level:            2010.00,
    floating_profit:         50.00,
    connected:               true,
    trade_allowed:           false,
    generated_at_utc:        new Date().toISOString(),
    server_time_epoch:       nowEpoch(),
    gmt_time_epoch:          nowEpoch(),
    local_time_epoch:        nowEpoch(),
    server_utc_offset_seconds: 7200,
    complete:                true,
    ...overrides,
  });
}

function validHist(): string {
  return JSON.stringify({
    schema_version:           SNAPSHOT_SCHEMA_VERSION,
    account_id:               ACCOUNT_ID,
    generated_at_utc:         new Date().toISOString(),
    server_utc_offset_seconds: 7200,
    record_count:             2,
    trades: [
      { ticket: 10001, record_type: "trade", symbol: "EURUSD", order_type: "buy",
        lots: 0.1, open_time_server_epoch: 1700000000, close_time_server_epoch: 1700003600,
        open_price: 1.0850, close_price: 1.0870, stop_loss: 0, take_profit: 0,
        commission: -2.0, swap: 0, profit: 20.0, magic_number: 0, comment: "" },
      { ticket: 10002, record_type: "balance", symbol: "", order_type: "unknown",
        lots: 0, open_time_server_epoch: 1700000000, close_time_server_epoch: 0,
        open_price: 0, close_price: 0, stop_loss: 0, take_profit: 0,
        commission: 0, swap: 0, profit: 5000.0, magic_number: 0, comment: "Deposit" },
    ],
    complete: true,
  });
}

// Default: snapshot exists, history does not
beforeEach(() => {
  mockExists.mockImplementation((p: unknown) => {
    return String(p).includes("snapshot");
  });
  mockRead.mockImplementation((p: unknown) => {
    if (String(p).includes("snapshot")) return validSnap();
    return "{}";
  });
});

afterEach(() => vi.clearAllMocks());

const opts = { dataPath: DATA_PATH, accountId: ACCOUNT_ID };

// ── Valid snapshot ────────────────────────────────────────────────
describe("valid snapshot", () => {
  it("returns ok=true and connectorReady", () => {
    const r = readMt4FileSnapshot(opts);
    expect(r.ok).toBe(true);
    expect(r.status.connectorReady).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it("exposes status fields", () => {
    const r = readMt4FileSnapshot(opts);
    expect(r.status.fileFound).toBe(true);
    expect(r.status.jsonValid).toBe(true);
    expect(r.status.complete).toBe(true);
    expect(r.status.fresh).toBe(true);
    expect(r.status.connected).toBe(true);
    expect(r.status.utcOffsetReceived).toBe(true);
  });

  it("never returns raw login, balance, or broker in errors", () => {
    const r = readMt4FileSnapshot(opts);
    for (const e of r.errors) {
      expect(e).not.toMatch(/10000/);
      expect(e).not.toMatch(/1234/);
      expect(e).not.toMatch(/RoboForex/);
    }
  });
});

// ── Missing file ──────────────────────────────────────────────────
describe("missing snapshot file", () => {
  it("returns ok=false and fileFound=false", () => {
    mockExists.mockReturnValue(false);
    const r = readMt4FileSnapshot(opts);
    expect(r.ok).toBe(false);
    expect(r.status.fileFound).toBe(false);
    expect(r.errors).toContain("snapshot file not found");
  });
});

// ── Invalid JSON ──────────────────────────────────────────────────
describe("invalid JSON", () => {
  it("returns jsonValid=false", () => {
    mockRead.mockReturnValue("not json {{{");
    const r = readMt4FileSnapshot(opts);
    expect(r.status.jsonValid).toBe(false);
    expect(r.errors).toContain("snapshot JSON parse error");
  });
});

// ── complete: false ───────────────────────────────────────────────
describe("complete: false", () => {
  it("returns complete=false and errors", () => {
    mockRead.mockReturnValue(validSnap({ complete: false }));
    const r = readMt4FileSnapshot(opts);
    expect(r.status.complete).toBe(false);
    expect(r.errors.some(e => e.includes("complete"))).toBe(true);
  });
});

// ── Stale snapshot ────────────────────────────────────────────────
describe("stale snapshot", () => {
  it("returns fresh=false when gmt_time_epoch is old", () => {
    const staleEpoch = nowEpoch() - 3600;
    mockRead.mockReturnValue(validSnap({
      gmt_time_epoch: staleEpoch,
      server_time_epoch: staleEpoch,
    }));
    const r = readMt4FileSnapshot({ ...opts, maxAgeSeconds: 300 });
    expect(r.status.fresh).toBe(false);
    expect(r.errors.some(e => e.includes("stale"))).toBe(true);
  });
});

// ── Wrong account_id ──────────────────────────────────────────────
describe("wrong account_id", () => {
  it("returns error about account_id mismatch", () => {
    mockRead.mockReturnValue(validSnap({ account_id: "account_2" }));
    const r = readMt4FileSnapshot(opts);
    expect(r.errors).toContain("account_id mismatch");
  });
});

// ── Wrong platform ────────────────────────────────────────────────
describe("wrong platform", () => {
  it("returns error about platform", () => {
    mockRead.mockReturnValue(validSnap({ platform: "MT5" }));
    const r = readMt4FileSnapshot(opts);
    expect(r.errors).toContain("platform is not MT4");
  });
});

// ── Invalid numbers ───────────────────────────────────────────────
describe("invalid numbers", () => {
  it("rejects NaN balance", () => {
    mockRead.mockReturnValue(validSnap({ balance: NaN }));
    const r = readMt4FileSnapshot(opts);
    expect(r.errors.some(e => e.includes("balance"))).toBe(true);
  });

  it("rejects Infinity equity", () => {
    mockRead.mockReturnValue(validSnap({ equity: Infinity }));
    const r = readMt4FileSnapshot(opts);
    expect(r.errors.some(e => e.includes("equity"))).toBe(true);
  });

  it("rejects null margin", () => {
    mockRead.mockReturnValue(validSnap({ margin: null }));
    const r = readMt4FileSnapshot(opts);
    expect(r.errors.some(e => e.includes("margin"))).toBe(true);
  });
});

// ── Invalid epoch ─────────────────────────────────────────────────
describe("invalid epoch values", () => {
  it("rejects zero server_time_epoch", () => {
    mockRead.mockReturnValue(validSnap({ server_time_epoch: 0 }));
    const r = readMt4FileSnapshot(opts);
    expect(r.errors.some(e => e.includes("server_time_epoch"))).toBe(true);
  });

  it("rejects negative gmt_time_epoch", () => {
    mockRead.mockReturnValue(validSnap({ gmt_time_epoch: -1 }));
    const r = readMt4FileSnapshot(opts);
    expect(r.errors.some(e => e.includes("gmt_time_epoch"))).toBe(true);
  });
});

// ── Duplicate history ticket ──────────────────────────────────────
describe("duplicate history ticket", () => {
  it("flags duplicate tickets in history", () => {
    const hist = JSON.stringify({
      schema_version: SNAPSHOT_SCHEMA_VERSION,
      account_id: ACCOUNT_ID,
      generated_at_utc: new Date().toISOString(),
      server_utc_offset_seconds: 7200,
      record_count: 2,
      trades: [
        { ticket: 10001, record_type: "trade", symbol: "EURUSD", order_type: "buy",
          lots: 0.1, open_time_server_epoch: 1700000000, close_time_server_epoch: 1700003600,
          open_price: 1.0850, close_price: 1.0870, stop_loss: 0, take_profit: 0,
          commission: 0, swap: 0, profit: 20, magic_number: 0, comment: "" },
        { ticket: 10001, record_type: "trade", symbol: "EURUSD", order_type: "sell",
          lots: 0.1, open_time_server_epoch: 1700003600, close_time_server_epoch: 1700007200,
          open_price: 1.0870, close_price: 1.0850, stop_loss: 0, take_profit: 0,
          commission: 0, swap: 0, profit: -20, magic_number: 0, comment: "" },
      ],
      complete: true,
    });
    mockExists.mockImplementation(() => true);
    mockRead.mockImplementation((p: unknown) => {
      if (String(p).includes("history")) return hist;
      return validSnap();
    });
    const r = readMt4FileSnapshot(opts);
    expect(r.errors.some(e => e.includes("duplicate ticket"))).toBe(true);
  });
});

// ── Path traversal ────────────────────────────────────────────────
describe("path traversal guard", () => {
  it("rejects malicious accountId containing path traversal", () => {
    // accountId comes from env — guard ensures it cannot escape dataPath
    const r = readMt4FileSnapshot({
      dataPath: DATA_PATH,
      accountId: "../../../../../../Windows/System32/evil",
    });
    // Guard triggers (throws internally) → ok=false, traversal error
    expect(r.ok).toBe(false);
    expect(r.errors).toContain("path traversal guard triggered");
  });
});

// ── Broker TZ empty, UTC offset present ──────────────────────────
describe("broker timezone empty, UTC offset present", () => {
  it("still returns connectorReady when utcOffsetReceived is true", () => {
    mockRead.mockReturnValue(validSnap({ server_utc_offset_seconds: 10800 }));
    const r = readMt4FileSnapshot(opts);
    expect(r.status.utcOffsetReceived).toBe(true);
    expect(r.status.connectorReady).toBe(true);
  });
});

// ── Valid history alongside snapshot ─────────────────────────────
describe("valid history alongside snapshot", () => {
  it("sets historyReceived when trades exist", () => {
    mockExists.mockReturnValue(true);
    mockRead.mockImplementation((p: unknown) => {
      if (String(p).includes("history")) return validHist();
      return validSnap();
    });
    const r = readMt4FileSnapshot(opts);
    expect(r.status.historyReceived).toBe(true);
    expect(r.history?.trades.length).toBe(2);
  });

  it("preserves deposit record_type", () => {
    mockExists.mockReturnValue(true);
    mockRead.mockImplementation((p: unknown) => {
      if (String(p).includes("history")) return validHist();
      return validSnap();
    });
    const r = readMt4FileSnapshot(opts);
    const deposit = r.history?.trades.find(t => t.ticket === 10002);
    expect(deposit?.record_type).toBe("balance");
  });
});
