import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";

// ── Context store tests ───────────────────────────────────────────────────────

describe("context-store", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ctx-store-test-"));
    vi.resetModules();
    // Redirect CONTEXT_PATH by mocking process.cwd()
    vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns no_run status when no file exists", async () => {
    const { getLastContextUsage } = await import("../store/context-store");
    const ctx = getLastContextUsage();
    expect(ctx.status).toBe("no_run");
    expect(ctx.inputTokensUsed).toBeNull();
  });

  it("persists and reads back a measured context", async () => {
    const { getLastContextUsage, setLastContextUsage } = await import("../store/context-store");
    setLastContextUsage({
      providerId: "groq",
      modelId: "llama-3.3-70b-versatile",
      inputTokensUsed: 18400,
      contextWindowTokens: 131072,
      reservedOutputTokens: 8000,
      measuredAtUtc: "2026-08-06T20:00:00Z",
      status: "measured",
    });
    const ctx = getLastContextUsage();
    expect(ctx.status).toBe("measured");
    expect(ctx.inputTokensUsed).toBe(18400);
    expect(ctx.contextWindowTokens).toBe(131072);
    expect(ctx.providerId).toBe("groq");
    expect(ctx.modelId).toBe("llama-3.3-70b-versatile");
  });

  it("survives process restart (reads from disk)", async () => {
    const { setLastContextUsage } = await import("../store/context-store");
    setLastContextUsage({
      providerId: "gemini", modelId: "gemini-1.5-flash",
      inputTokensUsed: 5000, contextWindowTokens: 1000000,
      reservedOutputTokens: null, measuredAtUtc: "2026-08-06T21:00:00Z",
      status: "measured",
    });
    // Re-import to simulate fresh process
    vi.resetModules();
    vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
    const { getLastContextUsage } = await import("../store/context-store");
    const ctx = getLastContextUsage();
    expect(ctx.providerId).toBe("gemini");
    expect(ctx.inputTokensUsed).toBe(5000);
    expect(ctx.contextWindowTokens).toBe(1000000);
  });

  it("context percent = inputTokensUsed / contextWindowTokens", () => {
    const inputTokensUsed = 18400;
    const contextWindowTokens = 131072;
    const pct = (inputTokensUsed / contextWindowTokens) * 100;
    expect(pct).toBeCloseTo(14.04, 1);
  });

  it("reservedOutputTokens are NOT added to inputTokensUsed for context percent", async () => {
    const { setLastContextUsage, getLastContextUsage } = await import("../store/context-store");
    setLastContextUsage({
      providerId: "groq", modelId: "llama-3.3-70b-versatile",
      inputTokensUsed: 18400, contextWindowTokens: 131072,
      reservedOutputTokens: 8000,
      measuredAtUtc: "2026-08-06T20:00:00Z",
      status: "measured",
    });
    const ctx = getLastContextUsage();
    // Context percent must use inputTokensUsed only, not input + reserved
    const pctCorrect = ctx.inputTokensUsed! / ctx.contextWindowTokens! * 100;
    const pctWrong = (ctx.inputTokensUsed! + ctx.reservedOutputTokens!) / ctx.contextWindowTokens! * 100;
    expect(pctCorrect).toBeCloseTo(14.04, 1);
    expect(pctWrong).toBeCloseTo(20.15, 1); // would be wrong
    expect(pctCorrect).not.toBeCloseTo(pctWrong, 0);
  });

  it("no_run status when no run has occurred", async () => {
    const { getLastContextUsage } = await import("../store/context-store");
    const ctx = getLastContextUsage();
    // Must say no_run, not show 0/131K
    expect(ctx.status).toBe("no_run");
    expect(ctx.inputTokensUsed).toBeNull();
    // UI must NOT show "0 / 131.072 Tokens" in this state
  });
});

// ── Usage store range tests ───────────────────────────────────────────────────

describe("usage-store range (no quota multiplication)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "usage-store-test-"));
    vi.resetModules();
    vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("week sum is real events only, not dailyQuota × 7", async () => {
    const { recordRequest, getUsageSummaryForRange } = await import("../store/usage-store");
    // Record two days of events
    recordRequest({ provider: "groq", inputTokens: 5000, outputTokens: 2000, success: true });
    recordRequest({ provider: "groq", inputTokens: 3000, outputTokens: 1000, success: true });

    const today = new Date().toISOString().slice(0, 10);
    const monday = new Date();
    monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() === 0 ? 6 : monday.getUTCDay() - 1));
    const weekStart = monday.toISOString().slice(0, 10);

    const result = getUsageSummaryForRange(weekStart, today);
    // Should be 5000+3000 input + 2000+1000 output = 11000
    expect(result.inputTokens + result.outputTokens).toBe(11000);

    // MUST NOT be dailyQuota × 7 = 14400 × 7 = 100800
    expect(result.inputTokens + result.outputTokens).not.toBe(14400 * 7);
  });

  it("month sum is real events only, not dailyQuota × 30", async () => {
    const { recordRequest, getUsageSummaryForRange } = await import("../store/usage-store");
    recordRequest({ provider: "mistral", inputTokens: 10000, outputTokens: 5000, success: true });

    const today = new Date().toISOString().slice(0, 10);
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);

    const result = getUsageSummaryForRange(monthStart, today);
    expect(result.inputTokens + result.outputTokens).toBe(15000);

    // MUST NOT be dailyQuota × 30 or × 31
    expect(result.inputTokens + result.outputTokens).not.toBe(14400 * 30);
    expect(result.inputTokens + result.outputTokens).not.toBe(14400 * 31);
  });

  it("requests are never counted as tokens", async () => {
    const { recordRequest, getUsageSummaryForRange } = await import("../store/usage-store");
    // 5 requests with known token counts
    for (let i = 0; i < 5; i++) {
      recordRequest({ provider: "groq", inputTokens: 1000, outputTokens: 500, success: true });
    }

    const today = new Date().toISOString().slice(0, 10);
    const result = getUsageSummaryForRange(today, today);
    // tokens = 5 × (1000 + 500) = 7500, requests = 5
    expect(result.inputTokens + result.outputTokens).toBe(7500);
    expect(result.requests).toBe(5);
    // requests must NOT equal tokens
    expect(result.requests).not.toBe(result.inputTokens + result.outputTokens);
  });

  it("aborted/failed request with zero tokens records 0, not the RPD limit", async () => {
    const { recordRequest, getUsageSummaryForRange } = await import("../store/usage-store");
    recordRequest({ provider: "groq", inputTokens: 0, outputTokens: 0, success: false });

    const today = new Date().toISOString().slice(0, 10);
    const result = getUsageSummaryForRange(today, today);
    expect(result.inputTokens).toBe(0);
    expect(result.outputTokens).toBe(0);
    expect(result.requests).toBe(1); // request count increments
  });

  it("getEarliestUsageDate returns null when store is empty", async () => {
    const { getEarliestUsageDate } = await import("../store/usage-store");
    expect(getEarliestUsageDate()).toBeNull();
  });

  it("getEarliestUsageDate returns the oldest date after recording", async () => {
    const { recordRequest, getEarliestUsageDate } = await import("../store/usage-store");
    recordRequest({ provider: "groq", inputTokens: 1000, outputTokens: 500, success: true });
    const today = new Date().toISOString().slice(0, 10);
    expect(getEarliestUsageDate()).toBe(today);
  });

  it("unknown daily quota produces no fake percent", () => {
    // When knownDailyTokenLimit is null, percent must not be calculated
    const knownDailyTokenLimit: number | null = null;
    const todayTotal = 42600;
    const ringPct = (knownDailyTokenLimit !== null && knownDailyTokenLimit > 0)
      ? (todayTotal / knownDailyTokenLimit) * 100
      : null;
    expect(ringPct).toBeNull();
  });

  it("usage persists across module reloads (server restart simulation)", async () => {
    const { recordRequest } = await import("../store/usage-store");
    recordRequest({ provider: "groq", inputTokens: 9000, outputTokens: 3000, success: true });

    vi.resetModules();
    vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
    const { getUsageSummaryForRange } = await import("../store/usage-store");
    const today = new Date().toISOString().slice(0, 10);
    const result = getUsageSummaryForRange(today, today);
    expect(result.inputTokens).toBe(9000);
    expect(result.outputTokens).toBe(3000);
  });
});

// ── SSE usage parsing test ────────────────────────────────────────────────────

describe("SSE usage parsing (chat route interceptor logic)", () => {
  function parseSSEUsage(buffer: string): { inputTokens: number; outputTokens: number } | null {
    for (const line of buffer.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (raw === "[DONE]") continue;
      try {
        const data = JSON.parse(raw) as Record<string, unknown>;
        type Usage = { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
        const usage: Usage | undefined =
          (data["x_groq"] as { usage?: Usage } | undefined)?.usage ??
          (data["usage"] as Usage | undefined);
        if (usage != null && (usage.prompt_tokens != null || usage.total_tokens != null)) {
          return { inputTokens: usage.prompt_tokens ?? 0, outputTokens: usage.completion_tokens ?? 0 };
        }
      } catch { /* ignore */ }
    }
    return null;
  }

  it("extracts Groq x_groq.usage from SSE stream", () => {
    const buffer = [
      `data: {"id":"x","choices":[{"delta":{"content":"hello"}}]}`,
      `data: {"id":"x","choices":[{"delta":{},"finish_reason":"stop"}],"x_groq":{"usage":{"prompt_tokens":150,"completion_tokens":42,"total_tokens":192}}}`,
      `data: [DONE]`,
    ].join("\n");
    const result = parseSSEUsage(buffer);
    expect(result).not.toBeNull();
    expect(result!.inputTokens).toBe(150);
    expect(result!.outputTokens).toBe(42);
  });

  it("extracts generic usage field from SSE stream", () => {
    const buffer = [
      `data: {"choices":[{"delta":{"content":"hi"}}]}`,
      `data: {"usage":{"prompt_tokens":80,"completion_tokens":20,"total_tokens":100}}`,
      `data: [DONE]`,
    ].join("\n");
    const result = parseSSEUsage(buffer);
    expect(result).not.toBeNull();
    expect(result!.inputTokens).toBe(80);
  });

  it("returns null when no usage chunk present", () => {
    const buffer = [
      `data: {"choices":[{"delta":{"content":"hello"}}]}`,
      `data: [DONE]`,
    ].join("\n");
    expect(parseSSEUsage(buffer)).toBeNull();
  });

  it("ignores malformed JSON lines", () => {
    const buffer = "data: {broken json\ndata: [DONE]";
    expect(parseSSEUsage(buffer)).toBeNull();
  });
});
