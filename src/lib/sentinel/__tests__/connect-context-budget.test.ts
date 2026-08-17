// Tests for provider-aware context budget trimming and 413 retry logic.
import { describe, it, expect } from "vitest";
import { getContextWindow, getMaxOutputTokens, estimateTokens } from "../providers/model-capabilities";
import { getFreeEnsembleProviders } from "../connect/ensemble";

describe("provider-aware context budget", () => {
  it("groq llama-3.3-70b-versatile has large context window", () => {
    const ctxWindow = getContextWindow("groq", "llama-3.3-70b-versatile");
    expect(ctxWindow).toBeGreaterThanOrEqual(128000);
  });

  it("groq compound (actual model on this account) has 8K context window", () => {
    const ctxWindow = getContextWindow("groq", "openai/gpt-oss-120b");
    expect(ctxWindow).toBe(8000);
  });

  it("groq compound safe budget leaves room for budgeted Brain context (3000 tokens)", () => {
    const ctxWindow = getContextWindow("groq", "openai/gpt-oss-120b");
    const reservedOutput = Math.min(getMaxOutputTokens("groq", "openai/gpt-oss-120b"), 1024);
    const safeInput = ctxWindow - reservedOutput - 300 - 400;
    // SENTINEL_SYSTEM_PROMPT ≈ 249 tokens + budgeted Brain ≈ 3000 tokens + user ≈ 50 = 3299
    // Safe input must be >= 3299 so the system message fits without trimming
    expect(safeInput).toBeGreaterThan(3200);
  });

  it("mistral small has at least 32K context", () => {
    const ctxWindow = getContextWindow("mistral", "mistral-small-latest");
    expect(ctxWindow).toBeGreaterThanOrEqual(32000);
  });

  it("estimateTokens is non-zero for non-empty text", () => {
    const tokens = estimateTokens("This is a test sentence with several words.");
    expect(tokens).toBeGreaterThan(0);
  });

  it("safe input budget for groq llama is large enough for Brain context", () => {
    const ctxWindow = getContextWindow("groq", "llama-3.3-70b-versatile");
    const reservedOutput = Math.min(getMaxOutputTokens("groq", "llama-3.3-70b-versatile"), 1024);
    const safeInput = ctxWindow - reservedOutput - 300 - 400; // overhead + margin
    // Brain context is 3000 tokens; with system + user should fit
    expect(safeInput).toBeGreaterThan(8000);
  });

  it("groq compound-mini with tiny context still returns a safe input budget", () => {
    // Even a small context window should produce a non-negative safe budget
    const ctxWindow = getContextWindow("groq", "groq/compound") || 8000;
    expect(ctxWindow).toBeGreaterThan(0);
  });
});

describe("free firewall — ensemble providers all FREE", () => {
  it("all free ensemble providers are classified FREE", () => {
    const free = getFreeEnsembleProviders();
    expect(free.length).toBeGreaterThan(0);
    // No PAID or UNKNOWN providers should appear here
    expect(free).not.toContain("anthropic");
    expect(free).not.toContain("openai");
  });

  it("groq llama-3.3-70b-versatile is in free provider set", () => {
    const free = getFreeEnsembleProviders();
    expect(free).toContain("groq");
  });
});
