import { describe, it, expect } from "vitest";
import {
  detectOutputProfile,
  calculateTokenBudget,
  getOutputBudgetForModel,
  type BudgetAllocationRequest,
} from "../context/token-budget-manager";

// ─── detectOutputProfile ──────────────────────────────────────────────────────

describe("detectOutputProfile()", () => {
  it('returns "detailed" for "ausführlich erkläre mir..."', () => {
    expect(detectOutputProfile("ausführlich erkläre mir die Strategie")).toBe("detailed");
  });

  it('returns "brief" for "kurz zusammengefasst"', () => {
    expect(detectOutputProfile("kurz zusammengefasst bitte")).toBe("brief");
  });

  it('returns "deep" for a message with a code block (two ``` fences)', () => {
    const msg = "Kannst du das refactoren?\n```ts\nconst x = 1;\n```";
    expect(detectOutputProfile(msg)).toBe("deep");
  });

  it('returns "normal" for a plain short message', () => {
    expect(detectOutputProfile("Was ist der Status?")).toBe("normal");
  });

  it('returns "detailed" for "tiefgehend analysiere"', () => {
    expect(detectOutputProfile("tiefgehend analysiere die Performance")).toBe("detailed");
  });

  it('returns "detailed" for "comprehensive" keyword', () => {
    expect(detectOutputProfile("Give me a comprehensive overview")).toBe("detailed");
  });

  it('returns "detailed" for "detailed" keyword', () => {
    expect(detectOutputProfile("Provide a detailed explanation")).toBe("detailed");
  });

  it('returns "brief" for "quick" keyword', () => {
    expect(detectOutputProfile("A quick summary please")).toBe("brief");
  });

  it('returns "brief" for "summary" keyword', () => {
    expect(detectOutputProfile("Give me a summary")).toBe("brief");
  });

  it('returns "deep" for "migrate all" keyword', () => {
    expect(detectOutputProfile("migrate all components to the new API")).toBe("deep");
  });

  it('returns "deep" for "refactor entire" keyword', () => {
    expect(detectOutputProfile("refactor entire module")).toBe("deep");
  });

  it('returns "normal" for a long message without specific markers', () => {
    const long = "a".repeat(600);
    expect(detectOutputProfile(long)).toBe("normal");
  });
});

// ─── calculateTokenBudget ─────────────────────────────────────────────────────

function baseRequest(overrides: Partial<BudgetAllocationRequest> = {}): BudgetAllocationRequest {
  return {
    modelContextWindow: 32768,
    modelMaxOutputTokens: 4096,
    profile: "normal",
    systemPromptLength: 500,
    userMessageLength: 200,
    conversationTurns: 2,
    avgTurnLength: 300,
    hasBrainContext: false,
    hasGraphContext: false,
    hasToolResults: false,
    hasImages: false,
    ...overrides,
  };
}

describe("calculateTokenBudget()", () => {
  it("small context (4096 window): total input + reserved output + safety + overhead <= contextWindow", () => {
    const budget = calculateTokenBudget(baseRequest({ modelContextWindow: 4096, modelMaxOutputTokens: 512 }));
    const total =
      budget.totalInputTokens +
      budget.reservedOutputTokens +
      budget.safetyMarginTokens +
      budget.protocolOverheadTokens;
    expect(total).toBeLessThanOrEqual(budget.modelContextWindow);
  });

  it("gemini 1M context: brainTokens > 0 when hasBrainContext = true", () => {
    const budget = calculateTokenBudget(
      baseRequest({ modelContextWindow: 1_048_576, modelMaxOutputTokens: 8192, hasBrainContext: true }),
    );
    expect(budget.brainTokens).toBeGreaterThan(0);
  });

  it("gemini 1M context: graphTokens > 0 when hasGraphContext = true", () => {
    const budget = calculateTokenBudget(
      baseRequest({ modelContextWindow: 1_048_576, modelMaxOutputTokens: 8192, hasGraphContext: true }),
    );
    expect(budget.graphTokens).toBeGreaterThan(0);
  });

  it('reservedOutputTokens = 8000 for "detailed" profile (capped at modelMaxOutputTokens)', () => {
    const budget = calculateTokenBudget(
      baseRequest({ profile: "detailed", modelMaxOutputTokens: 8192 }),
    );
    expect(budget.reservedOutputTokens).toBe(8000);
  });

  it('reservedOutputTokens = 1500 for "brief" profile', () => {
    const budget = calculateTokenBudget(baseRequest({ profile: "brief" }));
    expect(budget.reservedOutputTokens).toBe(1500);
  });

  it('reservedOutputTokens = 4000 for "normal" profile', () => {
    const budget = calculateTokenBudget(baseRequest({ profile: "normal" }));
    expect(budget.reservedOutputTokens).toBe(4000);
  });

  it("totalInputTokens + reservedOutputTokens + safetyMarginTokens + protocolOverheadTokens <= contextWindow", () => {
    const budget = calculateTokenBudget(
      baseRequest({ modelContextWindow: 131072, modelMaxOutputTokens: 32768, profile: "detailed" }),
    );
    const total =
      budget.totalInputTokens +
      budget.reservedOutputTokens +
      budget.safetyMarginTokens +
      budget.protocolOverheadTokens;
    expect(total).toBeLessThanOrEqual(budget.modelContextWindow);
  });

  it('"maximum" profile: reservedOutput = min(modelMaxOutputTokens, 40% of contextWindow)', () => {
    const contextWindow = 32768;
    const modelMaxOutputTokens = 4096;
    const expected = Math.min(modelMaxOutputTokens, Math.floor(contextWindow * 0.4));
    const budget = calculateTokenBudget(
      baseRequest({ profile: "maximum", modelContextWindow: contextWindow, modelMaxOutputTokens }),
    );
    expect(budget.reservedOutputTokens).toBe(expected);
  });

  it("outputTokenHint overrides profile budget when provided", () => {
    const budget = calculateTokenBudget(
      baseRequest({ profile: "brief", outputTokenHint: 2000, modelMaxOutputTokens: 4096 }),
    );
    expect(budget.reservedOutputTokens).toBe(2000);
  });

  it("reservedOutputTokens is always >= 512", () => {
    const budget = calculateTokenBudget(
      baseRequest({ profile: "brief", outputTokenHint: 100, modelMaxOutputTokens: 512 }),
    );
    expect(budget.reservedOutputTokens).toBeGreaterThanOrEqual(512);
  });

  it("modelContextWindow is echoed back correctly", () => {
    const budget = calculateTokenBudget(baseRequest({ modelContextWindow: 65536 }));
    expect(budget.modelContextWindow).toBe(65536);
  });

  it("brainTokens = 0 when hasBrainContext = false", () => {
    const budget = calculateTokenBudget(baseRequest({ hasBrainContext: false }));
    expect(budget.brainTokens).toBe(0);
  });

  it("imageTokens = 0 when hasImages = false", () => {
    const budget = calculateTokenBudget(baseRequest({ hasImages: false }));
    expect(budget.imageTokens).toBe(0);
  });

  it("toolResultTokens = 0 when hasToolResults = false", () => {
    const budget = calculateTokenBudget(baseRequest({ hasToolResults: false }));
    expect(budget.toolResultTokens).toBe(0);
  });
});

// ─── getOutputBudgetForModel ──────────────────────────────────────────────────

describe("getOutputBudgetForModel()", () => {
  it('gemini-1.5-flash with "normal" profile and 1000 input tokens returns 4000', () => {
    // normal profile = 4000 tokens; well within gemini's 1M window
    const result = getOutputBudgetForModel("gemini", "gemini-1.5-flash", "normal", 1000);
    expect(result).toBe(4000);
  });

  it('unknown model with "detailed" profile returns a value >= 512', () => {
    const result = getOutputBudgetForModel("unknown-provider", "unknown-model-xyz", "detailed", 500);
    expect(result).toBeGreaterThanOrEqual(512);
  });

  it('"maximum" profile for groq llama-3.3-70b-versatile returns up to 32768 or contextWindow fraction', () => {
    const result = getOutputBudgetForModel("groq", "llama-3.3-70b-versatile", "maximum", 1000);
    // max output for this model is 32768, 40% of 131072 = 52428 → capped at 32768
    expect(result).toBe(32768);
  });

  it("result is always >= 512 for any valid input", () => {
    const profiles = ["brief", "normal", "detailed", "deep", "maximum"] as const;
    for (const profile of profiles) {
      const result = getOutputBudgetForModel("gemini", "gemini-1.5-flash", profile, 100);
      expect(result).toBeGreaterThanOrEqual(512);
    }
  });

  it('"brief" profile returns 1500 for gemini-1.5-flash with low input tokens', () => {
    const result = getOutputBudgetForModel("gemini", "gemini-1.5-flash", "brief", 500);
    expect(result).toBe(1500);
  });

  it("falls back to default spec for unknown model", () => {
    // Default spec: contextWindow=32768, maxOutputTokens=4096; detailed=8000 capped to 4096
    const result = getOutputBudgetForModel("any", "no-such-model", "detailed", 100);
    expect(result).toBe(4096);
  });
});
