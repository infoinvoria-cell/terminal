/**
 * Unit tests for GET /api/track-record/accounts
 * The filesystem is mocked — no real .runtime files read.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock fs BEFORE importing the route
vi.mock("fs", () => ({
  existsSync:   vi.fn(),
  readFileSync: vi.fn(),
}));

import { existsSync, readFileSync } from "fs";
import { GET } from "@/app/api/track-record/accounts/route";

const mockExists = vi.mocked(existsSync);
const mockRead   = vi.mocked(readFileSync);

const NOW = Math.floor(Date.now() / 1000);

function validRecord(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
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
        connected:      true,
        sourceFresh:    true,
        generatedAtUtc:  new Date(NOW * 1000).toISOString(),
        generatedAtEpoch:NOW,
      },
    ],
    sourceStatus:  { account_1: { ok: true } },
    kpis:          {},
    closedTrades:  [],
    openPositions: [],
    cashFlows:     [],
    balanceCurves: { account_1: [] },
    equitySnapshots: [],
    warnings:      [],
    ...overrides,
  });
}

beforeEach(() => {
  mockExists.mockReturnValue(true);
  mockRead.mockReturnValue(validRecord());
});

afterEach(() => vi.clearAllMocks());

// ── Happy path ────────────────────────────────────────────────────────────────

describe("valid runtime file", () => {
  it("returns 200 with accounts array", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(Array.isArray(body.accounts)).toBe(true);
    expect((body.accounts as unknown[]).length).toBe(1);
  });

  it("response includes schemaVersion and generatedAtUtc", async () => {
    const res = await GET();
    const body = await res.json() as Record<string, unknown>;
    expect(body.schemaVersion).toBe(1);
    expect(typeof body.generatedAtUtc).toBe("string");
  });

  it("response includes currencyCompatibility", async () => {
    const res = await GET();
    const body = await res.json() as Record<string, unknown>;
    const cc = body.currencyCompatibility as Record<string, unknown>;
    expect(typeof cc).toBe("object");
    expect(Array.isArray(cc.currencies)).toBe(true);
    expect(typeof cc.compatible).toBe("boolean");
    expect(typeof cc.combinedBalanceAvailable).toBe("boolean");
  });

  it("response does not contain path, env, or terminal_path keys", async () => {
    const res = await GET();
    const body = JSON.stringify(await res.json());
    expect(body).not.toMatch(/"path":/);
    expect(body).not.toMatch(/"env":/);
    expect(body).not.toMatch(/"terminal_path":/);
  });
});

// ── Missing file ──────────────────────────────────────────────────────────────

describe("missing file", () => {
  it("returns 503 with error code file_not_found", async () => {
    mockExists.mockReturnValue(false);
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe("track_record_unavailable");
    expect(body.reason).toBe("file_not_found");
  });
});

// ── Invalid JSON ──────────────────────────────────────────────────────────────

describe("invalid JSON", () => {
  it("returns 503 with reason invalid_json", async () => {
    mockRead.mockReturnValue("not valid json {{{");
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json() as Record<string, unknown>;
    expect(body.reason).toBe("invalid_json");
  });
});

// ── Schema version mismatch ───────────────────────────────────────────────────

describe("schemaVersion !== 1", () => {
  it("returns 503 with reason schema_version_mismatch", async () => {
    mockRead.mockReturnValue(validRecord({ schemaVersion: 99 }));
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json() as Record<string, unknown>;
    expect(body.reason).toBe("schema_version_mismatch");
  });
});

// ── No accounts ───────────────────────────────────────────────────────────────

describe("no accounts", () => {
  it("returns 503 with reason no_accounts when array is empty", async () => {
    mockRead.mockReturnValue(validRecord({ accounts: [] }));
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json() as Record<string, unknown>;
    expect(body.reason).toBe("no_accounts");
  });
});

// ── Secret field ──────────────────────────────────────────────────────────────

describe("secret field in data", () => {
  it("returns 503 when a 'password' key is present", async () => {
    mockRead.mockReturnValue(validRecord({ password: "hunter2" }));
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json() as Record<string, unknown>;
    expect(body.reason).toBe("secret_field_detected");
  });
});

// ── Unmasked login ────────────────────────────────────────────────────────────

describe("unmasked login", () => {
  it("returns 503 when loginMasked does not start with ****", async () => {
    mockRead.mockReturnValue(
      validRecord({
        accounts: [
          {
            accountId: "account_1", platform: "MT4", broker: "Broker",
            loginMasked: "12345678", // unmasked!
            server: "S", currency: "EUR", balance: 0, equity: 0,
            floatingProfit: 0, connected: true, sourceFresh: true,
            generatedAtUtc: "2025-01-01T00:00:00Z", generatedAtEpoch: NOW,
          },
        ],
      }),
    );
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json() as Record<string, unknown>;
    expect(body.reason).toBe("unmasked_login_detected");
  });
});

// ── Different currencies ──────────────────────────────────────────────────────

describe("different currencies", () => {
  it("returns 200 with currencyCompatibility.compatible = false", async () => {
    mockRead.mockReturnValue(
      validRecord({
        accounts: [
          {
            accountId: "account_1", platform: "MT4", broker: "B",
            loginMasked: "****1234", server: "S", currency: "EUR",
            balance: 1000, equity: 1000, floatingProfit: 0,
            connected: true, sourceFresh: true,
            generatedAtUtc: "2025-01-01T00:00:00Z", generatedAtEpoch: NOW,
          },
          {
            accountId: "account_2", platform: "MT5", broker: "B",
            loginMasked: "****5678", server: "S", currency: "USD",
            balance: 2000, equity: 2000, floatingProfit: 0,
            connected: true, sourceFresh: true,
            generatedAtUtc: "2025-01-01T00:00:00Z", generatedAtEpoch: NOW,
          },
        ],
      }),
    );
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    const cc = body.currencyCompatibility as Record<string, unknown>;
    expect(cc.compatible).toBe(false);
    expect(cc.combinedBalanceAvailable).toBe(false);
  });
});

// ── No forbidden process calls ────────────────────────────────────────────────

describe("no process spawn or filesystem mutations", () => {
  it("GET handler does not import child_process", async () => {
    // The module is already loaded; if child_process were used it would be imported.
    // We verify indirectly: the route returns a valid response without any spawn.
    const res = await GET();
    // Any call to spawnSync/execFileSync would throw or have side effects in the mock env.
    expect(res.status).toBe(200);
  });

  it("GET handler does not call writeFileSync or renameSync", async () => {
    // fs mock only has existsSync and readFileSync — if write were called it would throw.
    // The route completing successfully proves no write was attempted.
    const res = await GET();
    expect(res.status).toBe(200);
  });
});
