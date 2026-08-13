import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

// ── Helpers extracted for unit testing ────────────────────────────────────────
// We test the module's exported types and observable behaviour by mocking fs
// and reading the module fresh via dynamic import so mocks are in place first.

const STRATEGIES_ROOT = path.join(process.cwd(), "public", "generated", "monitoring", "strategies");
const ENGINE_STATE_ROOT = path.join(process.cwd(), "public", "generated", "monitoring", "engine_state");

// ── 1. Market identity cannot be relabeled ────────────────────────────────────
describe("INTRADAY_DEFS – market identity", () => {
  it("DE30EUR engine_state files carry symbol=DE30EUR, not FDAX", async () => {
    const dax2h = JSON.parse(fs.readFileSync(
      path.join(ENGINE_STATE_ROOT, "trend_momentum_dax_2h_de30eur_2h_state.json"), "utf8"
    ));
    expect(dax2h.symbol).toBe("DE30EUR");
    expect(dax2h.symbol).not.toMatch(/FDAX/i);
  });

  it("DE30EUR OANDA event files carry symbol=DE30EUR", () => {
    const ev = JSON.parse(fs.readFileSync(
      path.join(STRATEGIES_ROOT, "OANDA_DE30EUR_2H_events.json"), "utf8"
    ));
    expect(ev.symbol).toBe("DE30EUR");
  });

  it("EURUSD engine_state file carries symbol=EURUSD, not 6E", async () => {
    const eur = JSON.parse(fs.readFileSync(
      path.join(ENGINE_STATE_ROOT, "eurusd_mt_30m_eurusd_30m_state.json"), "utf8"
    ));
    expect(eur.symbol).toBe("EURUSD");
    expect(eur.symbol).not.toMatch(/6E/i);
  });

  it("EUREX futures files carry source=engine_futures and symbol=FDAX1!", () => {
    const futures = JSON.parse(fs.readFileSync(
      path.join(STRATEGIES_ROOT, "EUREX_FDAX1_2H_events.json"), "utf8"
    ));
    expect(futures.symbol).toBe("FDAX1!");
    expect(futures.source).toBe("engine_futures");
  });
});

function makeOandaStub(sym = "DE30EUR") {
  return JSON.stringify({ symbol: sym, trades: [], generatedAt: new Date().toISOString() });
}

function makeStateStub(sym = "DE30EUR", overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    strategyId: "stub",
    symbol: sym,
    timeframe: "2H",
    updatedAt: new Date().toISOString(),
    lastEvaluatedCandle: new Date().toISOString(),
    openTrades: [],
    currentSignal: null,
    pendingSignal: null,
    status: "ok",
    trades: [],
    ...overrides,
  });
}

function stubFs(engine: (fp: string) => string, ev: (fp: string) => string) {
  vi.spyOn(fs, "readFileSync").mockImplementation((fp) => {
    const p = String(fp);
    if (p.includes("engine_state")) return engine(p);
    if (p.includes("strategies")) return ev(p);
    throw new Error("unexpected: " + p);
  });
  vi.spyOn(fs, "statSync").mockReturnValue({ mtimeMs: Date.now() } as unknown as fs.Stats);
}

// ── 2. NONE state semantics ───────────────────────────────────────────────────
describe("loadIntradaySignalCards – NONE state", () => {
  afterEach(() => { vi.restoreAllMocks(); vi.resetModules(); });

  it("when engine_state has no open signal → card direction=NONE, all risk fields undefined", async () => {
    stubFs(() => makeStateStub(), (fp) => makeOandaStub(fp.includes("EURUSD") ? "EURUSD" : "DE30EUR"));
    const { loadIntradaySignalCards } = await import("./intraday-signal-cards");
    const cards = loadIntradaySignalCards();

    for (const card of cards) {
      expect(card.signalState).toBe("NONE");
      expect(card.direction).toBe("NONE");
      expect(card.entryAbsolute).toBeUndefined();
      expect(card.slAbsolute).toBeUndefined();
      expect(card.tpAbsolute).toBeUndefined();
      expect(card.beAbsolute).toBeUndefined();
    }
  });

  it("when engine_state is missing (file unreadable) → card dataStatus=missing, freshnessStatus=UNAVAILABLE", async () => {
    vi.spyOn(fs, "readFileSync").mockImplementation((fp) => {
      const p = String(fp);
      if (p.includes("engine_state")) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      return makeOandaStub(p.includes("EURUSD") ? "EURUSD" : "DE30EUR");
    });
    vi.spyOn(fs, "statSync").mockReturnValue({ mtimeMs: Date.now() } as unknown as fs.Stats);

    const { loadIntradaySignalCards } = await import("./intraday-signal-cards");
    const cards = loadIntradaySignalCards();

    for (const card of cards) {
      expect(card.dataStatus).toBe("missing");
      const ext = card as unknown as { freshnessStatus: string };
      expect(ext.freshnessStatus).toBe("UNAVAILABLE");
    }
  });
});

// ── 3. stale ≠ unavailable ───────────────────────────────────────────────────
describe("FreshnessStatus semantics", () => {
  afterEach(() => { vi.restoreAllMocks(); vi.resetModules(); });

  it("an old but present engine_state file → STALE, not UNAVAILABLE", async () => {
    stubFs(
      () => makeStateStub("DE30EUR", { updatedAt: "2026-01-01T00:00:00Z", lastEvaluatedCandle: "2026-01-01T00:00:00Z" }),
      () => makeOandaStub(),
    );
    const { loadIntradaySignalCards } = await import("./intraday-signal-cards");
    const cards = loadIntradaySignalCards();
    const ext = cards[0] as unknown as { freshnessStatus: string };
    expect(ext.freshnessStatus).toBe("STALE");
  });

  it("a LIVE engine_state (recent updatedAt) → freshnessStatus=LIVE", async () => {
    stubFs(
      () => makeStateStub("DE30EUR", { updatedAt: new Date(Date.now() - 5 * 60_000).toISOString() }),
      () => makeOandaStub(),
    );
    const { loadIntradaySignalCards } = await import("./intraday-signal-cards");
    const cards = loadIntradaySignalCards();
    const ext = cards[0] as unknown as { freshnessStatus: string };
    expect(ext.freshnessStatus).toBe("LIVE");
  });
});

// ── 4. Current / history separation ──────────────────────────────────────────
describe("current / history separation", () => {
  afterEach(() => { vi.restoreAllMocks(); vi.resetModules(); });

  it("tradeSets use OANDA event files (DE30EUR/EURUSD), not futures files", async () => {
    const reads: string[] = [];
    vi.spyOn(fs, "readFileSync").mockImplementation((fp) => {
      const p = String(fp);
      reads.push(p);
      if (p.includes("engine_state")) return makeStateStub();
      return makeOandaStub(p.includes("EURUSD") ? "EURUSD" : "DE30EUR");
    });
    vi.spyOn(fs, "statSync").mockReturnValue({ mtimeMs: Date.now() } as unknown as fs.Stats);

    const { loadIntradayTradeSets } = await import("./intraday-signal-cards");
    const sets = loadIntradayTradeSets();

    const historyReads = reads.filter(p => p.includes("strategies"));
    expect(historyReads.every(p => p.includes("OANDA_"))).toBe(true);
    expect(historyReads.some(p => p.includes("EUREX_FDAX"))).toBe(false);
    expect(historyReads.some(p => p.includes("CME_6E"))).toBe(false);
    expect(sets.length).toBe(3);
  });

  it("tradeSets marketVariant matches OANDA symbol identity", async () => {
    stubFs(() => makeStateStub(), (fp) => makeOandaStub(fp.includes("EURUSD") ? "EURUSD" : "DE30EUR"));
    const { loadIntradayTradeSets } = await import("./intraday-signal-cards");
    const sets = loadIntradayTradeSets();

    expect(sets.filter(s => s.marketVariant === "DE30EUR_CFD").length).toBe(2);
    expect(sets.filter(s => s.marketVariant === "EURUSD_SPOT").length).toBe(1);
  });
});

// ── 5. Runtime state precedence ───────────────────────────────────────────────
describe("runtime state precedence", () => {
  afterEach(() => { vi.restoreAllMocks(); vi.resetModules(); });

  it("open signal in engine_state sets card to ACTIVE with entry/sl/tp", async () => {
    const openState = makeStateStub("DE30EUR", {
      strategyId: "mt_dax_1h_de30eur_1h",
      timeframe: "1H",
      updatedAt: new Date(Date.now() - 30 * 60_000).toISOString(),
      openTrades: [{ direction: "long", entry: 25000, sl: 24900, tp: 25300, be: null, atr: 120 }],
    });

    vi.spyOn(fs, "readFileSync").mockImplementation((fp) => {
      const p = String(fp);
      if (p.includes("mt_dax_1h_de30eur_1h_state")) return openState;
      if (p.includes("engine_state")) return makeStateStub();
      return makeOandaStub(p.includes("EURUSD") ? "EURUSD" : "DE30EUR");
    });
    vi.spyOn(fs, "statSync").mockReturnValue({ mtimeMs: Date.now() } as unknown as fs.Stats);

    const { loadIntradaySignalCards } = await import("./intraday-signal-cards");
    const cards = loadIntradaySignalCards();
    const dax1h = cards.find(c => c.id === "intraday-dax-1h")!;

    expect(dax1h.signalState).toBe("ACTIVE");
    expect(dax1h.direction).toBe("LONG");
    expect(dax1h.entryAbsolute).toBe(25000);
    expect(dax1h.slAbsolute).toBe(24900);
    expect(dax1h.tpAbsolute).toBe(25300);
  });
});
