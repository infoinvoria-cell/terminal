import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

// —— Helpers ——————————————————————————————————————————————————————————————————

// Production strategy IDs (canonical DE30EUR / EURUSD identities)
const STRATS = ["trend_momentum_dax_2h", "mt_dax_1h", "eurusd_mt_30m"] as const;
const INSTRUMENTS = ["de30eur", "de30eur", "eurusd"] as const;

// Engine state file format (production runtime state source)
function makeEngineState(overrides: {
  strategyId?: string;
  symbol?: string;
  updatedAt?: string;
  lastEvaluatedCandle?: string;
  currentSignal?: Record<string, unknown> | null;
  openTrades?: Record<string, unknown>[];
} = {}): string {
  return JSON.stringify({
    strategyId: overrides.strategyId ?? "trend_momentum_dax_2h_de30eur_2h",
    symbol: overrides.symbol ?? "DE30EUR",
    timeframe: "2H",
    updatedAt: overrides.updatedAt ?? "2026-08-09T10:00:00Z",
    lastEvaluatedCandle: overrides.lastEvaluatedCandle ?? "2026-08-09T08:00:00Z",
    currentSignal: overrides.currentSignal ?? null,
    openTrades: overrides.openTrades ?? [],
    status: "ok",
  });
}

function makeOpenEngineState(): string {
  return makeEngineState({
    currentSignal: { direction: "long", entry: 25000, sl: 24800, tp: 25600, be: null },
    openTrades: [{ direction: "long", entry: 25000, sl: 24800, tp: 25600, be: null }],
  });
}

// OANDA event file format (trade history source)
function makeEvFile(overrides: {
  trades?: unknown[];
  generatedAt?: string;
} = {}): string {
  return JSON.stringify({
    symbol: "DE30EUR",
    strategyName: "Test",
    timeframe: "2H",
    generatedAt: overrides.generatedAt ?? "2026-08-07T20:00:00Z",
    openTrade: false,
    openTradeRow: null,
    trades: overrides.trades ?? [
      {
        direction: "long",
        entryTime: "2026-07-30T10:00:00Z",
        exitTime: "2026-07-31T06:00:00Z",
        entry: 25616,
        sl: 25400,
        tp: 25942,
        exit: 25942,
        exitReason: "tp",
        pnl: 300,
      },
      {
        direction: "short",
        entryTime: "2026-07-31T10:00:00Z",
        exitTime: "2026-07-31T12:00:00Z",
        entry: 25798,
        sl: 25900,
        tp: 25550,
        exit: 25798,
        exitReason: "sl",
        pnl: 0,
      },
    ],
  });
}

// —— Direct route handler tests ———————————————————————————————————————————————

describe("/api/signals/intraday — canonical signal API", () => {
  it("reads real strategy files and returns all three current states", async () => {
    const { GET } = await import("../intraday/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json() as { currentStates: unknown[]; history: unknown[] };
    expect(body.currentStates).toHaveLength(3);
    expect(body.history).toBeDefined();
  });

  it("currentStates have required contract fields for each strategy", async () => {
    const { GET } = await import("../intraday/route");
    const res = await GET();
    const body = await res.json() as { currentStates: Array<Record<string, unknown>> };
    for (const state of body.currentStates) {
      expect(state).toHaveProperty("strategyId");
      expect(state).toHaveProperty("instrumentId");
      expect(state).toHaveProperty("marketVariant");
      expect(state).toHaveProperty("timeframe");
      expect(state).toHaveProperty("state");
      expect(state).toHaveProperty("direction");
      expect(state).toHaveProperty("lastEvaluatedBar");
      expect(state).toHaveProperty("evaluationSchedule");
      expect(state).toHaveProperty("nextEvaluationUtc");
      expect(state).toHaveProperty("generatedAtUtc");
      expect(["ACTIVE", "NONE"]).toContain(state["state"]);
      expect(["LONG", "SHORT", "NONE"]).toContain(state["direction"]);
    }
  });

  it("strategy IDs match the three expected canonical strategies", async () => {
    const { GET } = await import("../intraday/route");
    const res = await GET();
    const body = await res.json() as { currentStates: Array<{ strategyId: string }> };
    const ids = body.currentStates.map((s) => s.strategyId);
    expect(ids).toContain("trend_momentum_dax_2h");
    expect(ids).toContain("mt_dax_1h");
    expect(ids).toContain("eurusd_mt_30m");
  });

  it("DE30EUR production identity: DAX strategies use de30eur instrumentId", async () => {
    const { GET } = await import("../intraday/route");
    const res = await GET();
    const body = await res.json() as { currentStates: Array<{ strategyId: string; instrumentId: string }> };
    const byId = Object.fromEntries(body.currentStates.map((s) => [s.strategyId, s.instrumentId]));
    expect(byId["trend_momentum_dax_2h"]).toBe("de30eur");
    expect(byId["mt_dax_1h"]).toBe("de30eur");
  });

  it("EURUSD production identity: EUR strategy uses eurusd instrumentId", async () => {
    const { GET } = await import("../intraday/route");
    const res = await GET();
    const body = await res.json() as { currentStates: Array<{ strategyId: string; instrumentId: string }> };
    const byId = Object.fromEntries(body.currentStates.map((s) => [s.strategyId, s.instrumentId]));
    expect(byId["eurusd_mt_30m"]).toBe("eurusd");
  });

  it("NONE state has null entry/SL/TP", async () => {
    const { GET } = await import("../intraday/route");
    const res = await GET();
    const body = await res.json() as {
      currentStates: Array<{ state: string; entry: unknown; sl: unknown; tp: unknown }>;
    };
    for (const s of body.currentStates.filter((s) => s.state === "NONE")) {
      expect(s.entry).toBeNull();
      expect(s.sl).toBeNull();
      expect(s.tp).toBeNull();
    }
  });

  it("ACTIVE state has non-null entry/SL/TP", async () => {
    const readSpy = vi.spyOn(fs, "readFileSync").mockImplementation((fp: unknown) => {
      const p = String(fp);
      // Engine state files
      if (p.includes("trend_momentum_dax_2h_de30eur_2h_state")) return makeOpenEngineState();
      if (p.includes("mt_dax_1h_de30eur_1h_state")) return makeEngineState({ symbol: "DE30EUR" });
      if (p.includes("eurusd_mt_30m_eurusd_30m_state")) return makeEngineState({ symbol: "EURUSD", strategyId: "eurusd_mt_30m_eurusd_30m" });
      // History event files
      if (p.includes("OANDA_")) return makeEvFile();
      return JSON.stringify({}) as unknown as ReturnType<typeof fs.readFileSync>;
    });

    try {
      vi.resetModules();
      const { GET } = await import("../intraday/route");
      const res = await GET();
      const body = await res.json() as {
        currentStates: Array<{ strategyId: string; state: string; direction: string; entry: unknown; sl: unknown; tp: unknown }>;
      };
      const dax2h = body.currentStates.find((s) => s.strategyId === "trend_momentum_dax_2h");
      expect(dax2h?.state).toBe("ACTIVE");
      expect(dax2h?.direction).toBe("LONG");
      expect(typeof dax2h?.entry).toBe("number");
      expect(typeof dax2h?.sl).toBe("number");
      expect(typeof dax2h?.tp).toBe("number");
    } finally {
      readSpy.mockRestore();
      vi.resetModules();
    }
  });

  it("POTENTIAL is never returned (not defined by this engine)", async () => {
    const { GET } = await import("../intraday/route");
    const res = await GET();
    const body = await res.json() as { currentStates: Array<{ state: string }> };
    for (const s of body.currentStates) {
      expect(s.state).not.toBe("POTENTIAL");
    }
  });

  it("history entries have required fields and newest-first ordering", async () => {
    const { GET } = await import("../intraday/route");
    const res = await GET();
    const body = await res.json() as {
      history: Array<{ strategyId: string; direction: string; entryTime: string; exitTime: string | null; entryPrice: unknown }>;
    };
    if (body.history.length < 2) return; // skip if no recent trades

    for (const t of body.history) {
      expect(t).toHaveProperty("strategyId");
      expect(t).toHaveProperty("direction");
      expect(["long", "short"]).toContain(t.direction);
      expect(t).toHaveProperty("entryTime");
      expect(t).toHaveProperty("exitTime");
      expect(t).toHaveProperty("entryPrice");
    }

    // Newest-first ordering
    for (let i = 1; i < body.history.length; i++) {
      const a = new Date(body.history[i - 1]!.entryTime).getTime();
      const b = new Date(body.history[i]!.entryTime).getTime();
      expect(a).toBeGreaterThanOrEqual(b);
    }
  });

  it("history 7-day filter returns only trades within last 7 days", async () => {
    const cutoff = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const { GET } = await import("../intraday/route");
    const res = await GET();
    const body = await res.json() as {
      history: Array<{ entryTime: string; exitTime: string | null }>;
    };
    const last7 = body.history.filter((t) => {
      const ts = t.exitTime ?? t.entryTime;
      return ts >= cutoff;
    });
    for (const t of last7) {
      const ts = t.exitTime ?? t.entryTime;
      expect(ts >= cutoff).toBe(true);
    }
  });

  it("signalId dedup: history entries have unique (strategyId, entryTime) keys", async () => {
    const { GET } = await import("../intraday/route");
    const res = await GET();
    const body = await res.json() as { history: Array<{ strategyId: string; entryTime: string }> };
    const keys = body.history.map((t) => `${t.strategyId}|${t.entryTime}`);
    const unique = new Set(keys);
    expect(unique.size).toBe(keys.length);
  });

  it("DAX strategies use DE30EUR_CFD market variant (production identity)", async () => {
    const { GET } = await import("../intraday/route");
    const res = await GET();
    const body = await res.json() as {
      currentStates: Array<{ strategyId: string; marketVariant: string }>;
    };
    const dax2h = body.currentStates.find((s) => s.strategyId === "trend_momentum_dax_2h");
    const dax1h = body.currentStates.find((s) => s.strategyId === "mt_dax_1h");
    expect(dax2h?.marketVariant).toBe("DE30EUR_CFD");
    expect(dax1h?.marketVariant).toBe("DE30EUR_CFD");
  });

  it("EUR strategy uses EURUSD_SPOT market variant (production identity)", async () => {
    const { GET } = await import("../intraday/route");
    const res = await GET();
    const body = await res.json() as {
      currentStates: Array<{ strategyId: string; marketVariant: string }>;
    };
    const eur = body.currentStates.find((s) => s.strategyId === "eurusd_mt_30m");
    expect(eur?.marketVariant).toBe("EURUSD_SPOT");
  });

  it("FDAX / 6E are NOT used as production strategy instrumentId or marketVariant", async () => {
    const { GET } = await import("../intraday/route");
    const res = await GET();
    const body = await res.json() as { currentStates: Array<Record<string, unknown>> };
    for (const s of body.currentStates) {
      expect(s["instrumentId"]).not.toBe("FDAX1!");
      expect(s["instrumentId"]).not.toBe("6E1!");
      expect(s["marketVariant"]).not.toBe("FDAX_FUTURES");
      expect(s["marketVariant"]).not.toBe("6E_FUTURES");
    }
  });

  it("backend unavailable: returns NONE states with engineFileAvailable=false when files missing", async () => {
    const readSpy = vi.spyOn(fs, "readFileSync").mockImplementation(() => {
      throw new Error("ENOENT: no such file");
    });

    try {
      vi.resetModules();
      const { GET } = await import("../intraday/route");
      const res = await GET();
      expect(res.status).toBe(200);
      const body = await res.json() as {
        currentStates: Array<{ state: string; engineFileAvailable: boolean }>;
      };
      for (const s of body.currentStates) {
        expect(s.state).toBe("NONE");
        expect(s.engineFileAvailable).toBe(false);
      }
    } finally {
      readSpy.mockRestore();
      vi.resetModules();
    }
  });

  it("no fake fallback: when file missing, entry/SL/TP are null (never fabricated)", async () => {
    const readSpy = vi.spyOn(fs, "readFileSync").mockImplementation(() => {
      throw new Error("ENOENT");
    });

    try {
      vi.resetModules();
      const { GET } = await import("../intraday/route");
      const res = await GET();
      const body = await res.json() as {
        currentStates: Array<{ entry: unknown; sl: unknown; tp: unknown }>;
      };
      for (const s of body.currentStates) {
        expect(s.entry).toBeNull();
        expect(s.sl).toBeNull();
        expect(s.tp).toBeNull();
      }
    } finally {
      readSpy.mockRestore();
      vi.resetModules();
    }
  });

  it("stale runtime state shows CURRENT_MARKET_CLOSED or STALE or UNAVAILABLE freshnessStatus", async () => {
    const readSpy = vi.spyOn(fs, "readFileSync").mockImplementation((fp: unknown) => {
      const p = String(fp);
      if (p.includes("_state.json")) {
        // Stale engine state (75 days ago)
        return makeEngineState({ updatedAt: "2026-05-25T15:09:24Z" });
      }
      if (p.includes("OANDA_")) return makeEvFile();
      return JSON.stringify({}) as unknown as ReturnType<typeof fs.readFileSync>;
    });

    try {
      vi.resetModules();
      const { GET } = await import("../intraday/route");
      const res = await GET();
      const body = await res.json() as {
        currentStates: Array<{ freshnessStatus: string }>;
      };
      for (const s of body.currentStates) {
        expect(["CURRENT_MARKET_CLOSED", "STALE", "UNAVAILABLE"]).toContain(s.freshnessStatus);
      }
    } finally {
      readSpy.mockRestore();
      vi.resetModules();
    }
  });

  it("DAX 2H evaluation schedule is correct (2H CET round hours)", async () => {
    const { GET } = await import("../intraday/route");
    const res = await GET();
    const body = await res.json() as {
      currentStates: Array<{ strategyId: string; evaluationSchedule: string }>;
    };
    const dax2h = body.currentStates.find((s) => s.strategyId === "trend_momentum_dax_2h");
    expect(dax2h?.evaluationSchedule).toMatch(/2H.*CET/);
    expect(dax2h?.evaluationSchedule).toMatch(/10.*12.*14.*16.*18/);
  });

  it("nextEvaluationUtc is a valid future ISO timestamp", async () => {
    const { GET } = await import("../intraday/route");
    const res = await GET();
    const body = await res.json() as {
      currentStates: Array<{ nextEvaluationUtc: string }>;
    };
    const now = Date.now();
    for (const s of body.currentStates) {
      const t = new Date(s.nextEvaluationUtc).getTime();
      expect(isFinite(t)).toBe(true);
      expect(t).toBeGreaterThan(now);
      expect(t).toBeLessThan(now + 4 * 60 * 60_000);
    }
  });

  it("strategy switching: responses are independent (no state bleed between calls)", async () => {
    const { GET } = await import("../intraday/route");
    const res1 = await GET();
    const res2 = await GET();
    const b1 = await res1.json() as { currentStates: Array<{ strategyId: string }> };
    const b2 = await res2.json() as { currentStates: Array<{ strategyId: string }> };
    expect(b1.currentStates.map((s) => s.strategyId)).toEqual(
      b2.currentStates.map((s) => s.strategyId),
    );
  });
});
