/**
 * Tests for mt5-snapshot-reader.ts
 * Uses Vitest (project default).
 * All data is fake — no real credentials or account values.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import { readMt5Snapshot, MAX_SNAPSHOT_AGE_SECONDS } from "../mt5-snapshot-reader";

// ── Mock fs so we never touch the real filesystem ─────────────────────────────
vi.mock("fs");

const mockExistsSync  = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);

const SAFE_PATH = resolve(".runtime/track-record/account_2-snapshot.json");

// ── Factory for a valid snapshot ──────────────────────────────────────────────
function makeSnap(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const nowEpoch = Math.floor(Date.now() / 1000);
  return {
    schema_version:      1,
    complete:            true,
    account_id:          "account_2",
    platform:            "MT5",
    broker:              "Vantage",
    login_masked:        "****5678",
    server:              "Vantage-Live",
    currency:            "USD",
    company:             "Vantage Markets",
    leverage:            100,
    balance:             10_000.0,
    equity:              10_050.0,
    profit:              50.0,
    margin:              200.0,
    margin_free:         9_850.0,
    margin_level:        5_025.0,
    connected:           true,
    terminal_connected:  true,
    trade_allowed:       false,
    positions:           [],
    generated_at_utc:    new Date().toISOString(),
    generated_at_epoch:  nowEpoch,
    mt5_package_version: "5.0.45",
    terminal_version:    "5.00.4000",
    ...overrides,
  };
}

function setupMocks(snap: Record<string, unknown>, historyExists = false): void {
  mockExistsSync.mockImplementation((p) => {
    const s = String(p);
    if (s.endsWith("account_2-snapshot.json")) return true;
    if (s.endsWith("account_2-history.json")) return historyExists;
    return false;
  });
  mockReadFileSync.mockImplementation((p) => {
    const s = String(p);
    if (s.endsWith("account_2-snapshot.json")) return JSON.stringify(snap);
    return "";
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("readMt5Snapshot", () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("valid snapshot passes", () => {
    const snap = makeSnap();
    setupMocks(snap);
    const result = readMt5Snapshot(SAFE_PATH);
    expect(result.snapshot.account_id).toBe("account_2");
    expect(result.snapshot.complete).toBe(true);
  });

  it("missing file throws", () => {
    mockExistsSync.mockReturnValue(false);
    expect(() => readMt5Snapshot(SAFE_PATH)).toThrow("snapshot file not found");
  });

  it("invalid JSON throws", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("not-json{{{{");
    expect(() => readMt5Snapshot(SAFE_PATH)).toThrow("invalid JSON");
  });

  it("complete: false throws", () => {
    setupMocks(makeSnap({ complete: false }));
    expect(() => readMt5Snapshot(SAFE_PATH)).toThrow("complete must be true");
  });

  it("snapshot older than 24h throws (stale)", () => {
    const staleEpoch = Math.floor(Date.now() / 1000) - MAX_SNAPSHOT_AGE_SECONDS - 1;
    setupMocks(makeSnap({ generated_at_epoch: staleEpoch }));
    expect(() => readMt5Snapshot(SAFE_PATH)).toThrow("stale");
  });

  it("wrong account_id throws", () => {
    setupMocks(makeSnap({ account_id: "account_1" }));
    expect(() => readMt5Snapshot(SAFE_PATH)).toThrow('account_id must be "account_2"');
  });

  it("wrong platform throws", () => {
    setupMocks(makeSnap({ platform: "MT4" }));
    expect(() => readMt5Snapshot(SAFE_PATH)).toThrow('platform must be "MT5"');
  });

  it("wrong broker throws", () => {
    setupMocks(makeSnap({ broker: "Darwinex" }));
    expect(() => readMt5Snapshot(SAFE_PATH)).toThrow('broker must be "Vantage"');
  });

  it("login_masked containing full digits (not masked) throws", () => {
    // 8+ digits — likely full login, not masked
    setupMocks(makeSnap({ login_masked: "12345678" }));
    expect(() => readMt5Snapshot(SAFE_PATH)).toThrow("login_masked must match");
  });

  it("snapshot containing 'password' field throws", () => {
    setupMocks(makeSnap({ password: "secret123" }));
    expect(() => readMt5Snapshot(SAFE_PATH)).toThrow('must not contain field "password"');
  });

  it("snapshot containing 'investor_password' field throws", () => {
    setupMocks(makeSnap({ investor_password: "secret123" }));
    expect(() => readMt5Snapshot(SAFE_PATH)).toThrow('must not contain field "investor_password"');
  });

  it("non-finite balance throws", () => {
    setupMocks(makeSnap({ balance: NaN }));
    expect(() => readMt5Snapshot(SAFE_PATH)).toThrow('"balance" must be a finite number');
  });

  it("negative/zero epoch throws", () => {
    setupMocks(makeSnap({ generated_at_epoch: 0 }));
    expect(() => readMt5Snapshot(SAFE_PATH)).toThrow("generated_at_epoch must be a positive number");
  });

  it("duplicate position ticket throws", () => {
    const snap = makeSnap({
      positions: [
        { ticket: 111, identifier: 111, symbol: "EURUSD", position_type: "buy",
          volume: 0.1, open_time_epoch: 1700000000, open_price: 1.1, current_price: 1.1,
          stop_loss: 0, take_profit: 0, swap: 0, profit: 0, magic: 0, comment: "" },
        { ticket: 111, identifier: 222, symbol: "GBPUSD", position_type: "sell",
          volume: 0.1, open_time_epoch: 1700000001, open_price: 1.3, current_price: 1.3,
          stop_loss: 0, take_profit: 0, swap: 0, profit: 0, magic: 0, comment: "" },
      ],
    });
    setupMocks(snap);
    expect(() => readMt5Snapshot(SAFE_PATH)).toThrow("duplicate position ticket 111");
  });

  it("duplicate deal ticket in history throws", () => {
    const snap = makeSnap();
    const nowEpoch = Math.floor(Date.now() / 1000);
    const history = {
      schema_version: 1,
      account_id: "account_2",
      deals: [
        { ticket: 999, order: 1, position_id: 1, symbol: "EURUSD", deal_type: 0,
          deal_entry: 0, volume: 0.1, time_epoch: nowEpoch - 100, time_msc: 0,
          price: 1.1, commission: 0, swap: 0, fee: 0, profit: 10, magic: 0,
          reason: 0, comment: "", external_id: "", record_type: "trade" },
        { ticket: 999, order: 2, position_id: 2, symbol: "EURUSD", deal_type: 1,
          deal_entry: 1, volume: 0.1, time_epoch: nowEpoch - 50, time_msc: 0,
          price: 1.11, commission: 0, swap: 0, fee: 0, profit: -10, magic: 0,
          reason: 0, comment: "", external_id: "", record_type: "trade" },
      ],
    };
    mockExistsSync.mockImplementation((p) => {
      const s = String(p);
      return s.endsWith("account_2-snapshot.json") || s.endsWith("account_2-history.json");
    });
    mockReadFileSync.mockImplementation((p) => {
      const s = String(p);
      if (s.endsWith("account_2-snapshot.json")) return JSON.stringify(snap);
      if (s.endsWith("account_2-history.json")) return JSON.stringify(history);
      return "";
    });
    expect(() => readMt5Snapshot(SAFE_PATH)).toThrow("duplicate deal ticket 999");
  });

  it("empty currency config is allowed (does not throw)", () => {
    // The reader does not validate currency against config — that's the Python layer
    setupMocks(makeSnap({ currency: "" }));
    expect(() => readMt5Snapshot(SAFE_PATH)).not.toThrow();
  });

  it("path outside .runtime is rejected", () => {
    const outsidePath = resolve("src/lib/track-record/account_2-snapshot.json");
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(makeSnap()));
    expect(() => readMt5Snapshot(outsidePath)).toThrow("path must be inside .runtime/");
  });

  it("connected: false throws", () => {
    setupMocks(makeSnap({ connected: false }));
    expect(() => readMt5Snapshot(SAFE_PATH)).toThrow("connected must be true");
  });

  it("terminal_connected: false throws", () => {
    setupMocks(makeSnap({ terminal_connected: false }));
    expect(() => readMt5Snapshot(SAFE_PATH)).toThrow("terminal_connected must be true");
  });

  it("schema_version mismatch throws", () => {
    setupMocks(makeSnap({ schema_version: 2 }));
    expect(() => readMt5Snapshot(SAFE_PATH)).toThrow("schema_version must be 1");
  });

  it("valid snapshot with positions passes", () => {
    const snap = makeSnap({
      positions: [
        { ticket: 42, identifier: 42, symbol: "EURUSD", position_type: "buy",
          volume: 1.0, open_time_epoch: 1700000000, open_price: 1.1, current_price: 1.105,
          stop_loss: 1.09, take_profit: 1.12, swap: -0.5, profit: 50.0, magic: 0, comment: "" },
      ],
    });
    setupMocks(snap);
    const result = readMt5Snapshot(SAFE_PATH);
    expect(result.snapshot.positions).toHaveLength(1);
  });
});
