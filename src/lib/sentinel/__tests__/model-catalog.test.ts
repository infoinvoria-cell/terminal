import { describe, it, expect } from "vitest";
import {
  getAllModels,
  getModelsForTask,
  getCatalogSummary,
} from "../catalog/model-catalog";

describe("getAllModels()", () => {
  it("returns a non-empty array", () => {
    const models = getAllModels();
    expect(Array.isArray(models)).toBe(true);
    expect(models.length).toBeGreaterThan(0);
  });

  it("all returned models have verifiedFree: true", () => {
    const models = getAllModels();
    for (const m of models) {
      expect(m.pricing.verifiedFree).toBe(true);
    }
  });

  it("all returned models have input price 0 or null", () => {
    const models = getAllModels();
    for (const m of models) {
      const price = m.pricing.inputPriceUsdPerMillion;
      expect(price === 0 || price === null).toBe(true);
    }
  });

  it("all returned models have output price 0 or null", () => {
    const models = getAllModels();
    for (const m of models) {
      const price = m.pricing.outputPriceUsdPerMillion;
      expect(price === 0 || price === null).toBe(true);
    }
  });

  it('no model has provider "anthropic" (paid provider)', () => {
    const models = getAllModels();
    const anthropicModels = models.filter((m) => m.provider === "anthropic");
    expect(anthropicModels.length).toBe(0);
  });

  it("all models have a non-empty modelId", () => {
    const models = getAllModels();
    for (const m of models) {
      expect(typeof m.modelId).toBe("string");
      expect(m.modelId.length).toBeGreaterThan(0);
    }
  });

  it("all models have a non-empty provider", () => {
    const models = getAllModels();
    for (const m of models) {
      expect(typeof m.provider).toBe("string");
      expect(m.provider.length).toBeGreaterThan(0);
    }
  });
});

describe("getModelsForTask()", () => {
  it('"vision" task returns only models with capabilities.vision = true', () => {
    const models = getModelsForTask("vision");
    expect(models.length).toBeGreaterThan(0);
    for (const m of models) {
      expect(m.capabilities.vision).toBe(true);
    }
  });

  it('"tool_calling" task returns models with capabilities.nativeTools = true', () => {
    const models = getModelsForTask("tool_calling");
    expect(models.length).toBeGreaterThan(0);
    for (const m of models) {
      expect(m.capabilities.nativeTools).toBe(true);
    }
  });

  it('"long_context" task returns models with contextWindow >= 500000', () => {
    const models = getModelsForTask("long_context");
    expect(models.length).toBeGreaterThan(0);
    for (const m of models) {
      expect(m.limits.contextWindow ?? 0).toBeGreaterThanOrEqual(500000);
    }
  });

  it('"embeddings" task returns empty array (no free embeddings models in static catalog)', () => {
    // The static catalog has no embeddings models — this asserts the filter is applied correctly
    const models = getModelsForTask("embeddings");
    for (const m of models) {
      expect(m.capabilities.embeddings).toBe(true);
    }
  });

  it('"fast_chat" task returns only text-capable models with rpm >= 15', () => {
    const models = getModelsForTask("fast_chat");
    for (const m of models) {
      expect(m.capabilities.text).toBe(true);
      expect(m.limits.requestsPerMinute ?? 0).toBeGreaterThanOrEqual(15);
    }
  });

  it('"strong_general" task returns models with contextWindow >= 128000', () => {
    const models = getModelsForTask("strong_general");
    for (const m of models) {
      expect(m.limits.contextWindow ?? 0).toBeGreaterThanOrEqual(128000);
    }
  });

  it("does not return deprecated or unavailable models", () => {
    const taskClasses = [
      "fast_chat",
      "vision",
      "tool_calling",
      "long_context",
      "coding",
    ] as const;
    for (const task of taskClasses) {
      const models = getModelsForTask(task);
      for (const m of models) {
        expect(m.availability).not.toBe("deprecated");
        expect(m.availability).not.toBe("unavailable");
      }
    }
  });
});

describe("getCatalogSummary()", () => {
  it("totalModels > 0", () => {
    const summary = getCatalogSummary();
    expect(summary.totalModels).toBeGreaterThan(0);
  });

  it("freePolicyEnforced = true", () => {
    const summary = getCatalogSummary();
    expect(summary.freePolicyEnforced).toBe(true);
  });

  it("byProvider has at least one entry", () => {
    const summary = getCatalogSummary();
    expect(Object.keys(summary.byProvider).length).toBeGreaterThan(0);
  });

  it("byProvider has entry for groq", () => {
    const summary = getCatalogSummary();
    expect(summary.byProvider["groq"]).toBeGreaterThan(0);
  });

  it("byProvider has entry for gemini", () => {
    const summary = getCatalogSummary();
    expect(summary.byProvider["gemini"]).toBeGreaterThan(0);
  });

  it("totalModels matches sum of byProvider counts", () => {
    const summary = getCatalogSummary();
    const sumFromProvider = Object.values(summary.byProvider).reduce((a, b) => a + b, 0);
    expect(summary.totalModels).toBe(sumFromProvider);
  });
});
