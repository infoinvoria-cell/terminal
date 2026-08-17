// Tests for provider-aware context budget trimming and rate-limit separation.
// Key invariant: contextWindow (model capacity) ≠ tokensPerMinute (account rate limit).
import { describe, it, expect } from "vitest";
import { getContextWindow, getMaxOutputTokens, getSafePromptBudget, getTokensPerMinute, estimateTokens } from "../providers/model-capabilities";
import { getFreeEnsembleProviders } from "../connect/ensemble";

describe("provider-aware context budget — contextWindow vs TPM", () => {
  it("groq compound has 131072 contextWindow (API-verified, NOT the 8K TPM limit)", () => {
    const ctxWindow = getContextWindow("groq", "groq/compound");
    expect(ctxWindow).toBe(131072);
  });

  it("groq openai/gpt-oss-120b has 131072 contextWindow (API-verified)", () => {
    const ctxWindow = getContextWindow("groq", "openai/gpt-oss-120b");
    expect(ctxWindow).toBe(131072);
  });

  it("groq compound tokensPerMinute = 8000 (account rate limit, separate from contextWindow)", () => {
    const tpm = getTokensPerMinute("groq", "groq/compound");
    expect(tpm).toBe(8000);
  });

  it("groq compound safePromptBudgetTokens < contextWindow (conservative operational budget from TPM)", () => {
    const promptBudget = getSafePromptBudget("groq", "groq/compound");
    const ctxWindow = getContextWindow("groq", "groq/compound");
    expect(promptBudget).toBeLessThan(ctxWindow);
    expect(promptBudget).toBeGreaterThan(3000); // must fit budgeted Brain context + system + user
  });

  it("mistral small has at least 32K contextWindow", () => {
    const ctxWindow = getContextWindow("mistral", "mistral-small-latest");
    expect(ctxWindow).toBeGreaterThanOrEqual(32000);
  });

  it("mistral does not have a TPM rate-limit override (no safePromptBudgetTokens)", () => {
    const promptBudget = getSafePromptBudget("mistral", "mistral-small-latest");
    const ctxWindow = getContextWindow("mistral", "mistral-small-latest");
    // Without explicit safePromptBudgetTokens, getSafePromptBudget falls back to contextWindow
    expect(promptBudget).toBe(ctxWindow);
  });

  it("estimateTokens is non-zero for non-empty text", () => {
    const tokens = estimateTokens("This is a test sentence with several words.");
    expect(tokens).toBeGreaterThan(0);
  });

  it("groq compound safe trim budget leaves room for budgeted Brain + system + user (≈3300 tokens)", () => {
    const promptBudget = getSafePromptBudget("groq", "groq/compound");
    const reservedOutput = Math.min(getMaxOutputTokens("groq", "groq/compound"), 1024);
    const maxInput = promptBudget - reservedOutput - 300 - 400; // overhead + margin
    // budgeted Brain (3000) + SENTINEL_SYSTEM_PROMPT (249) + user question (50) ≈ 3299 tokens
    expect(maxInput).toBeGreaterThan(3300);
  });

  it("groq llama-3.3-70b-versatile has large contextWindow in registry (future-proofing)", () => {
    const ctxWindow = getContextWindow("groq", "llama-3.3-70b-versatile");
    expect(ctxWindow).toBeGreaterThanOrEqual(128000);
  });
});

describe("free firewall — ensemble providers all FREE", () => {
  it("all free ensemble providers are classified FREE", () => {
    const free = getFreeEnsembleProviders();
    expect(free.length).toBeGreaterThan(0);
    expect(free).not.toContain("anthropic");
    expect(free).not.toContain("openai");
  });

  it("groq is in free provider set", () => {
    const free = getFreeEnsembleProviders();
    expect(free).toContain("groq");
  });
});
