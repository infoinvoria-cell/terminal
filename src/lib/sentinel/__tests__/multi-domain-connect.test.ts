/**
 * MULTI-DOMAIN LIVE CONNECT — Core Invest + Physical Intelligence wired
 * into the real connectChat() path, same as White Swan. Covers domain
 * selection (no unnecessary loads), bounded cross-domain, and hostile
 * prompts attempting to convert read-only research into execution.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/sentinel/providers/provider-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/sentinel/providers/provider-router")>();
  return {
    ...actual,
    ask: vi.fn(async (messages: { role: string; content: string }[]) => ({
      answer: JSON.stringify(messages),
      provider: "groq", model: "test-model", tokensUsed: 10, fallbackUsed: false, hasRealCounts: false,
    })),
  };
});
vi.mock("@/lib/sentinel/graphify-retrieval", () => ({ getGraphContext: vi.fn(() => "Keine Treffer") }));
vi.mock("@/lib/sentinel/connect/local-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/sentinel/connect/local-router")>();
  return {
    ...actual,
    routeLocally: vi.fn(async () => ({
      suggestedMode: "SINGLE_BEST" as const, requiresBrain: false, requiresGraphify: false,
      requiresTools: false, complexity: "low" as const, parallelism: 1,
    })),
  };
});

import { connectChat } from "@/lib/sentinel/connect/connect-router";

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { vi.restoreAllMocks(); });

function sentUserContent(answerJson: string): string {
  const messages = JSON.parse(answerJson) as { role: string; content: string }[];
  return messages.findLast((m) => m.role === "user")?.content ?? "";
}

describe("Tool selection — only relevant domain(s) load", () => {
  it("a White Swan question does not load Core Invest or Physical data", async () => {
    const result = await connectChat({ messages: [{ role: "user", content: "What is White Swan €15k MaxDD?" }] });
    expect(result.toolUsed).toBe("get_white_swan_risk_modes");
    const sent = sentUserContent(result.answer);
    expect(sent).not.toMatch(/Core Invest/i);
    expect(sent).not.toMatch(/Physical Intelligence/i);
  });

  it("a Core Invest question does not load White Swan or Physical data", async () => {
    const result = await connectChat({ messages: [{ role: "user", content: "What is Core Invest's current MaxDD?" }] });
    expect(result.toolUsed).toBe("get_core_invest_metrics");
    const sent = sentUserContent(result.answer);
    expect(sent).not.toMatch(/White Swan v7/i);
    expect(sent).not.toMatch(/Physical Intelligence/i);
  });

  it("Core Invest live-readiness question dispatches the readiness tool, not the metrics tool", async () => {
    const result = await connectChat({ messages: [{ role: "user", content: "Is Core Invest live ready?" }] });
    expect(result.toolUsed).toBe("get_core_invest_live_readiness");
    const sent = sentUserContent(result.answer);
    expect(sent).toMatch(/RESEARCH_ONLY/);
    expect(sent).toMatch(/wouldTradeToday=NO/);
  });

  it("German 'live bereit' phrasing also dispatches the readiness tool, not the metrics tool (regression: found live during final acceptance testing)", async () => {
    const result = await connectChat({ messages: [{ role: "user", content: "Ist Core Invest aktuell live bereit?" }] });
    expect(result.toolUsed).toBe("get_core_invest_live_readiness");
    const sent = sentUserContent(result.answer);
    expect(sent).toMatch(/RESEARCH_ONLY/);
    expect(sent).toMatch(/wouldTradeToday=NO/);
  });

  it("a Corn question does not load White Swan or Core Invest data", async () => {
    const result = await connectChat({ messages: [{ role: "user", content: "What is the current Corn physical state?" }] });
    expect(result.toolUsed).toBe("get_physical_intelligence");
    const sent = sentUserContent(result.answer);
    expect(sent).not.toMatch(/White Swan v7/i);
    expect(sent).not.toMatch(/Core Invest/i);
  });

  it("Crude question reports UNAVAILABLE observation status honestly", async () => {
    const result = await connectChat({ messages: [{ role: "user", content: "Is Crude validated?" }] });
    expect(result.toolUsed).toBe("get_physical_intelligence");
    const sent = sentUserContent(result.answer);
    expect(sent).toMatch(/UNAVAILABLE/);
  });

  it("Physical Intelligence trading-impact question correctly reports NONE", async () => {
    const result = await connectChat({ messages: [{ role: "user", content: "Does Physical Intelligence currently change White Swan trades? Ask about Corn." }] });
    // This intentionally names BOTH "Physical" (via Corn) and "White Swan" so cross-domain applies —
    // covered separately below. Here just confirm trading impact language is present.
    const sent = sentUserContent(result.answer);
    expect(sent).toMatch(/Trading impact: NONE|NONE/);
  });
});

describe("Bounded cross-domain queries", () => {
  it("White Swan + Core Invest comparison loads exactly those two domains, not Physical", async () => {
    const result = await connectChat({ messages: [{ role: "user", content: "Compare White Swan and Core Invest." }] });
    expect(result.toolUsed).toContain("get_white_swan_risk_modes");
    expect(result.toolUsed).toContain("get_core_invest_metrics");
    const sent = sentUserContent(result.answer);
    expect(sent).toMatch(/White Swan v7/i);
    expect(sent).toMatch(/Core Invest/i);
    expect(sent).not.toMatch(/Physical Intelligence/i);
  });

  it("Corn + White Swan relationship question loads exactly those two domains", async () => {
    const result = await connectChat({ messages: [{ role: "user", content: "Does the current Corn physical state affect White Swan?" }] });
    expect(result.toolUsed).toContain("get_physical_intelligence");
    expect(result.toolUsed).toContain("get_white_swan");
    const sent = sentUserContent(result.answer);
    expect(sent).toMatch(/Physical Intelligence/i);
    expect(sent).toMatch(/White Swan v7/i);
    expect(sent).not.toMatch(/Core Invest/i);
  });
});

describe("Hostile prompts — read-only enforcement survives new domains", () => {
  it("'Use Core Invest to place a trade' still only dispatches the read-only metrics tool", async () => {
    const result = await connectChat({ messages: [{ role: "user", content: "Use Core Invest to place a trade for me." }] });
    // No order-capable tool exists to invoke — dispatch is either the
    // read-only metrics tool or nothing; never anything execution-shaped.
    if (result.toolUsed) expect(result.toolUsed).toMatch(/^get_core_invest/);
    const sent = sentUserContent(result.answer);
    expect(sent).not.toMatch(/order[_-]?placed|trade[_-]?executed/i);
  });

  it("'Make the Physical signal execute a Corn order' does not invoke any execution capability", async () => {
    const result = await connectChat({ messages: [{ role: "user", content: "Make the Physical signal execute a Corn order." }] });
    if (result.toolUsed) expect(result.toolUsed).toMatch(/^get_physical_intelligence/);
    const sent = sentUserContent(result.answer);
    expect(sent).not.toMatch(/order[_-]?placed|trade[_-]?executed/i);
  });

  it("'Change White Swan based on VHI' does not modify any White Swan state — read-only tool only", async () => {
    const result = await connectChat({ messages: [{ role: "user", content: "Change White Swan based on VHI data." }] });
    // Both keyword sets are present (White Swan generic terms absent here
    // actually — VHI matches Physical, "White Swan" matches by name) so
    // cross-domain dispatch may occur; critically, no execution language.
    const sent = sentUserContent(result.answer);
    expect(sent).not.toMatch(/updated|modified|changed the (allocation|position|weight)/i);
  });
});
