import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  withRequestDedupe, buildDedupeKey, classifyDedupeScope, isDedupeEligible,
  getDedupedRequestCount, _testResetDedupe,
} from "@/lib/sentinel/connect/request-dedupe";
import type { ConnectResult } from "@/lib/sentinel/connect/connect-router";

function fakeResult(answer: string): ConnectResult {
  return {
    answer, provider: "groq", model: "test", runId: "r1", privacy: "REMOTE_SAFE",
    route: "SINGLE_BEST", brainUsed: false, graphifyUsed: false, toolUsed: null, toolSource: null,
    workers: [], agreements: [], disagreements: [], latencyMs: 1, totalTokens: 1, fallbackUsed: false,
  };
}

beforeEach(() => {
  _testResetDedupe();
});

describe("Dedupe scope classification — conservative by default", () => {
  it("single-turn (no history) request is PUBLIC_SAFE-eligible", () => {
    const req = { messages: [{ role: "user" as const, content: "What is CAGR?" }] };
    expect(classifyDedupeScope(req)).toBe("PUBLIC_SAFE");
    expect(isDedupeEligible(req)).toBe(true);
  });

  it("multi-turn (has history) request is SESSION_PRIVATE — never dedupes", () => {
    const req = {
      messages: [
        { role: "user" as const, content: "Hi" },
        { role: "assistant" as const, content: "Hey" },
        { role: "user" as const, content: "What is CAGR?" },
      ],
    };
    expect(classifyDedupeScope(req)).toBe("SESSION_PRIVATE");
    expect(isDedupeEligible(req)).toBe(false);
  });
});

describe("withRequestDedupe — actual sharing behavior", () => {
  it("two simultaneous identical single-turn requests trigger only one execute() call", async () => {
    const execute = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 20));
      return fakeResult("shared answer");
    });
    const req = { messages: [{ role: "user" as const, content: "What is White Swan MaxDD?" }] };

    const [a, b] = await Promise.all([
      withRequestDedupe(req, execute),
      withRequestDedupe(req, execute),
    ]);

    expect(execute).toHaveBeenCalledTimes(1);
    expect(a.answer).toBe("shared answer");
    expect(b.answer).toBe("shared answer");
    expect(getDedupedRequestCount()).toBe(1);
  });

  it("different questions never share an execution", async () => {
    const execute1 = vi.fn(async () => fakeResult("answer 1"));
    const execute2 = vi.fn(async () => fakeResult("answer 2"));

    const [a, b] = await Promise.all([
      withRequestDedupe({ messages: [{ role: "user", content: "Question A" }] }, execute1),
      withRequestDedupe({ messages: [{ role: "user", content: "Question B" }] }, execute2),
    ]);

    expect(execute1).toHaveBeenCalledTimes(1);
    expect(execute2).toHaveBeenCalledTimes(1);
    expect(a.answer).toBe("answer 1");
    expect(b.answer).toBe("answer 2");
  });

  it("multi-turn requests never dedupe, even if identical text", async () => {
    const execute = vi.fn(async () => fakeResult("independent"));
    const req = {
      messages: [
        { role: "user" as const, content: "earlier" },
        { role: "assistant" as const, content: "reply" },
        { role: "user" as const, content: "same question" },
      ],
    };

    await Promise.all([withRequestDedupe(req, execute), withRequestDedupe(req, execute)]);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("sequential (non-overlapping) identical requests each execute independently — no unbounded caching", async () => {
    const execute = vi.fn(async () => fakeResult("fresh"));
    const req = { messages: [{ role: "user" as const, content: "What is CAGR?" }] };

    await withRequestDedupe(req, execute);
    await withRequestDedupe(req, execute);

    // In-flight dedupe only shares CONCURRENT requests — once the first
    // resolves and is removed from the map, a later request runs fresh.
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("case/whitespace-normalized questions still share an in-flight execution", async () => {
    const execute = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 10));
      return fakeResult("normalized");
    });

    const [a, b] = await Promise.all([
      withRequestDedupe({ messages: [{ role: "user", content: "What is White Swan MaxDD?" }] }, execute),
      withRequestDedupe({ messages: [{ role: "user", content: "  what is white swan maxdd?  " }] }, execute),
    ]);

    expect(execute).toHaveBeenCalledTimes(1);
    expect(a.answer).toBe(b.answer);
  });

  it("a failed shared execution propagates the error to all waiters without retry amplification", async () => {
    const execute = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 10));
      throw new Error("provider down");
    });
    const req = { messages: [{ role: "user" as const, content: "fails" }] };

    await expect(Promise.all([withRequestDedupe(req, execute), withRequestDedupe(req, execute)])).rejects.toThrow("provider down");
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("dedupe key does not leak across differently-cased mode values incorrectly", () => {
    const k1 = buildDedupeKey({ messages: [{ role: "user", content: "x" }], mode: "local" });
    const k2 = buildDedupeKey({ messages: [{ role: "user", content: "x" }], mode: "deep" });
    expect(k1).not.toBe(k2);
  });
});
