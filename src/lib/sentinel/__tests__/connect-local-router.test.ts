import { describe, expect, it } from "vitest";
import { routeLocally } from "../connect/local-router";

describe("local router", () => {
  it("routes trivial query to LOCAL_ONLY", async () => {
    const r = await routeLocally("Hi");
    expect(r.complexity).toBe("trivial");
    expect(r.suggestedMode).toBe("LOCAL_ONLY");
  });

  it("detects Brain requirement for White Swan query", async () => {
    const r = await routeLocally("What is the current White Swan MaxDD?");
    expect(r.requiresBrain).toBe(true);
  });

  it("detects Brain requirement for track record query", async () => {
    const r = await routeLocally("Show me the live track record performance");
    expect(r.requiresBrain).toBe(true);
  });

  it("routes deep comparison to a non-trivial mode", async () => {
    const r = await routeLocally("Compare whether White Swan vNext improves portfolio quality vs current production");
    // Heuristic → PARALLEL_ENSEMBLE; Qwen (when running) may return SINGLE_BEST or REASONER_PLUS_CRITIC
    expect(r.suggestedMode).not.toBe("LOCAL_ONLY");
    expect(r.suggestedMode).not.toBe("FASTEST_FREE");
  });

  it("detects tool-first opportunity for trade count query", async () => {
    const r = await routeLocally("how many trades are currently active?");
    expect(r.requiresTools).toBe(true);
    expect(r.suggestedMode).toBe("LOCAL_ONLY");
  });

  it("force local overrides mode", async () => {
    const r = await routeLocally("Compare White Swan portfolio quality", true);
    expect(r.suggestedMode).toBe("LOCAL_ONLY");
  });

  it("detects graphify requirement for code structure query", async () => {
    const r = await routeLocally("where is the Brain component in the codebase?");
    expect(r.requiresGraphify).toBe(true);
  });

  it("graphify: module connection topology question", async () => {
    const r = await routeLocally("Which modules connect Sentinel to Brain?");
    expect(r.requiresGraphify).toBe(true);
  });

  it("graphify: dependency topology English", async () => {
    const r = await routeLocally("Show dependencies between Mobile Brain and its API routes");
    expect(r.requiresGraphify).toBe(true);
  });

  it("graphify: where is X defined", async () => {
    const r = await routeLocally("Where is connectChat defined?");
    expect(r.requiresGraphify).toBe(true);
  });

  it("graphify: NOT triggered for generic finance question", async () => {
    const r = await routeLocally("What is CAGR?");
    expect(r.requiresGraphify).toBe(false);
  });

  it("graphify: NOT triggered for summarize architecture question", async () => {
    const r = await routeLocally("Summarize the White Swan portfolio strategy");
    expect(r.requiresGraphify).toBe(false);
  });

  it("returns latency measurement", async () => {
    const r = await routeLocally("What is CAGR?");
    expect(r.latencyMs).toBeGreaterThanOrEqual(0);
    expect(r.source).toBe("heuristic");
  });

  it("estimates token budget", async () => {
    const r = await routeLocally("Explain the White Swan strategy in detail");
    expect(r.estimatedTokens).toBeGreaterThan(0);
  });

  it("routes simple generic query to FASTEST_FREE or SINGLE_BEST", async () => {
    const r = await routeLocally("What is the difference between futures and options contracts?");
    expect(["FASTEST_FREE", "SINGLE_BEST", "LOCAL_ONLY"]).toContain(r.suggestedMode);
  });
});
