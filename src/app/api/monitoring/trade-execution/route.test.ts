import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { GET, POST, buildTradeExecutionIntentId, getTradingSafetyState } from "./route";

const ORIGINAL_ENV = {
  GLOBAL_TRADING_DISABLED: process.env.GLOBAL_TRADING_DISABLED,
  PAPER_TRADING_ENABLED: process.env.PAPER_TRADING_ENABLED,
  LIVE_TRADING_ENABLED: process.env.LIVE_TRADING_ENABLED,
  MANUAL_TICKET_ENABLED: process.env.MANUAL_TICKET_ENABLED,
  TRADE_EXECUTION_INTENT_STORE_PATH: process.env.TRADE_EXECUTION_INTENT_STORE_PATH,
};

let tempIntentStorePath = "";

beforeEach(() => {
  tempIntentStorePath = path.join(
    os.tmpdir(),
    `capitalife-trade-intents-${Date.now()}-${Math.random().toString(16).slice(2)}.json`,
  );
  process.env.TRADE_EXECUTION_INTENT_STORE_PATH = tempIntentStorePath;
});

afterEach(() => {
  process.env.GLOBAL_TRADING_DISABLED = ORIGINAL_ENV.GLOBAL_TRADING_DISABLED;
  process.env.PAPER_TRADING_ENABLED = ORIGINAL_ENV.PAPER_TRADING_ENABLED;
  process.env.LIVE_TRADING_ENABLED = ORIGINAL_ENV.LIVE_TRADING_ENABLED;
  process.env.MANUAL_TICKET_ENABLED = ORIGINAL_ENV.MANUAL_TICKET_ENABLED;
  process.env.TRADE_EXECUTION_INTENT_STORE_PATH = ORIGINAL_ENV.TRADE_EXECUTION_INTENT_STORE_PATH;
  if (tempIntentStorePath && fs.existsSync(tempIntentStorePath)) {
    fs.unlinkSync(tempIntentStorePath);
  }
});

describe("trade-execution route", () => {
  it("returns safe defaults on GET", async () => {
    delete process.env.GLOBAL_TRADING_DISABLED;
    delete process.env.PAPER_TRADING_ENABLED;
    delete process.env.LIVE_TRADING_ENABLED;
    delete process.env.MANUAL_TICKET_ENABLED;

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.safety).toEqual(getTradingSafetyState());
    expect(payload.safety.globalTradingDisabled).toBe(true);
    expect(payload.safety.paperOrderSubmissionAllowed).toBe(false);
    expect(payload.safety.liveOrderSubmissionAllowed).toBe(false);
  });

  it("rejects malformed payloads", async () => {
    const request = new Request("http://localhost/api/monitoring/trade-execution", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "paper" }),
    });

    const response = await POST(request as never);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.action).toBe("invalid_request");
  });

  it("blocks paper order submission by default", async () => {
    delete process.env.GLOBAL_TRADING_DISABLED;
    delete process.env.PAPER_TRADING_ENABLED;

    const request = new Request("http://localhost/api/monitoring/trade-execution", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mode: "paper",
        asset: "FDAX1!",
        strategyId: "fdax1_fdax1_d",
        direction: "long",
        entry: 100,
        stopLoss: 95,
        takeProfit: 120,
        riskUsd: 50,
        quantity: 1,
        brokerSpec: { broker: "ibkr", routeSymbol: "FDAX", currency: "EUR" },
        status: "paper_created",
      }),
    });

    const response = await POST(request as never);
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.action).toBe("blocked");
    expect(payload.blockedReasons[0]).toMatch(/Paper Trading ist blockiert|Paper Trading ist nicht aktiviert/);
  });

  it("creates stable intent ids for identical requests", () => {
    const one = buildTradeExecutionIntentId({
      mode: "manual",
      asset: "FDAX1!",
      strategyId: "mt_dax_1h",
      direction: "short",
      entry: 100,
      stopLoss: 105,
      takeProfit: 90,
      riskUsd: 25,
      quantity: 2,
      brokerSpec: {
        broker: "ibkr",
        routeSymbol: "FDAX",
        tickSize: null,
        tickValue: null,
        pointValue: null,
        contractMultiplier: null,
        minOrderSize: null,
        orderStep: null,
        maxOrderSize: null,
        currency: "EUR",
        marginEstimate: null,
        commissionEstimate: null,
        slippageEstimate: null,
      },
      status: "manual_marked_executed",
    });

    const two = buildTradeExecutionIntentId({
      mode: "manual",
      asset: "FDAX1!",
      strategyId: "mt_dax_1h",
      direction: "short",
      entry: 100,
      stopLoss: 105,
      takeProfit: 90,
      riskUsd: 25,
      quantity: 2,
      brokerSpec: {
        broker: "ibkr",
        routeSymbol: "FDAX",
        tickSize: null,
        tickValue: null,
        pointValue: null,
        contractMultiplier: null,
        minOrderSize: null,
        orderStep: null,
        maxOrderSize: null,
        currency: "EUR",
        marginEstimate: null,
        commissionEstimate: null,
        slippageEstimate: null,
      },
      status: "manual_marked_executed",
    });

    expect(one).toBe(two);
  });

  it("rejects unknown strategies", async () => {
    const request = new Request("http://localhost/api/monitoring/trade-execution", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mode: "manual",
        asset: "FDAX1!",
        strategyId: "unknown_strategy",
        direction: "long",
        entry: 100,
        stopLoss: 95,
        takeProfit: 120,
        riskUsd: 50,
        quantity: 1,
        brokerSpec: { broker: "ibkr", routeSymbol: "FDAX", currency: "EUR" },
        status: "manual_marked_executed",
      }),
    });

    const response = await POST(request as never);
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.blockedReasons).toContain("Unbekannte Strategie.");
  });

  it("rejects duplicate intents persistently", async () => {
    const payload = {
      mode: "manual",
      asset: "FDAX1!",
      strategyId: "fdax1_fdax1_d",
      direction: "long",
      entry: 100,
      stopLoss: 95,
      takeProfit: 120,
      riskUsd: 50,
      quantity: 1,
      brokerSpec: { broker: "ibkr", routeSymbol: "FDAX", currency: "EUR" },
      status: "manual_marked_executed",
    };

    const first = await POST(
      new Request("http://localhost/api/monitoring/trade-execution", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      }) as never,
    );
    const second = await POST(
      new Request("http://localhost/api/monitoring/trade-execution", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      }) as never,
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
    expect((await second.json()).blockedReasons).toContain("Duplicate intent abgelehnt.");
  });
});
