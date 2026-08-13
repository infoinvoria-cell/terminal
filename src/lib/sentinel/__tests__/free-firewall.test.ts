import { describe, it, expect } from "vitest";
import {
  isFreeModel,
  checkFreePolicy,
  assertFreePolicy,
  BILLING_POLICY,
} from "../policy/free-policy";
import {
  getAllModels,
  getModelsForProvider,
} from "../catalog/model-catalog";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const verifiedFreeModel = {
  pricing: { verifiedFree: true, inputPriceUsdPerMillion: 0, outputPriceUsdPerMillion: 0 },
};

const paidModel = {
  pricing: { verifiedFree: false, inputPriceUsdPerMillion: 3.0, outputPriceUsdPerMillion: 15.0 },
};

const paidModelMarkedFree = {
  // Contradictory: verifiedFree=true but positive price (should still be rejected by price check)
  pricing: { verifiedFree: true, inputPriceUsdPerMillion: 1.0, outputPriceUsdPerMillion: 2.0 },
};

const unknownPricingNotFree = {
  pricing: { verifiedFree: false, inputPriceUsdPerMillion: null, outputPriceUsdPerMillion: null },
};

const unknownPricingMarkedFree = {
  // verifiedFree=true but null prices — should fail the null price guard
  pricing: { verifiedFree: true, inputPriceUsdPerMillion: null, outputPriceUsdPerMillion: null },
};

const freeInputPaidOutput = {
  pricing: { verifiedFree: true, inputPriceUsdPerMillion: 0, outputPriceUsdPerMillion: 5.0 },
};

// ---------------------------------------------------------------------------
// 1. isFreeModel
// ---------------------------------------------------------------------------

describe("isFreeModel", () => {
  it("returns true for a verifiedFree=true model with zero prices", () => {
    expect(isFreeModel(verifiedFreeModel)).toBe(true);
  });

  it("returns false for a verifiedFree=false model", () => {
    expect(isFreeModel(paidModel)).toBe(false);
  });

  it("returns false for a model with unknown pricing (null) and verifiedFree=false", () => {
    expect(isFreeModel(unknownPricingNotFree)).toBe(false);
  });

  it("returns false when verifiedFree=true but prices are null (unconfirmed zero cost)", () => {
    expect(isFreeModel(unknownPricingMarkedFree)).toBe(false);
  });

  it("returns false when verifiedFree=true but outputPrice is positive", () => {
    expect(isFreeModel(freeInputPaidOutput)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. checkFreePolicy
// ---------------------------------------------------------------------------

describe("checkFreePolicy", () => {
  it("allows a verified-free model", () => {
    const result = checkFreePolicy(verifiedFreeModel);
    expect(result.allowed).toBe(true);
  });

  it("blocks a paid model (verifiedFree=false)", () => {
    const result = checkFreePolicy(paidModel);
    expect(result.allowed).toBe(false);
  });

  it("blocks a paid model with reason 'model_not_free'", () => {
    const result = checkFreePolicy(paidModel);
    if (!result.allowed) {
      expect(result.reason).toBe("model_not_free");
    }
  });

  it("detail message mentions billing for a paid model", () => {
    const result = checkFreePolicy(paidModel);
    if (!result.allowed) {
      expect(result.detail.toLowerCase()).toMatch(/billing|paid|free/);
    }
  });

  it("blocks a model with null pricing (unknown cost) even when verifiedFree=true", () => {
    const result = checkFreePolicy(unknownPricingMarkedFree);
    expect(result.allowed).toBe(false);
  });

  it("returns reason 'pricing_unknown' for null-price model", () => {
    const result = checkFreePolicy(unknownPricingMarkedFree);
    if (!result.allowed) {
      expect(result.reason).toBe("pricing_unknown");
    }
  });

  it("blocks verifiedFree=false even if prices happen to be zero", () => {
    const zeroPriceNotVerified = {
      pricing: { verifiedFree: false, inputPriceUsdPerMillion: 0, outputPriceUsdPerMillion: 0 },
    };
    const result = checkFreePolicy(zeroPriceNotVerified);
    expect(result.allowed).toBe(false);
  });

  it("blocks model with positive output price even when verifiedFree=true", () => {
    const result = checkFreePolicy(freeInputPaidOutput);
    expect(result.allowed).toBe(false);
  });

  it("blocks model with positive input price even when verifiedFree=true", () => {
    const result = checkFreePolicy(paidModelMarkedFree);
    expect(result.allowed).toBe(false);
  });

  it("result shape has 'allowed: false' with both reason and detail for blocked models", () => {
    const result = checkFreePolicy(paidModel);
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(typeof result.reason).toBe("string");
      expect(typeof result.detail).toBe("string");
      expect(result.detail.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. assertFreePolicy
// ---------------------------------------------------------------------------

describe("assertFreePolicy", () => {
  it("does not throw for a verified-free model", () => {
    expect(() => assertFreePolicy(verifiedFreeModel)).not.toThrow();
  });

  it("throws for a paid model", () => {
    expect(() => assertFreePolicy(paidModel)).toThrow();
  });

  it("throws with [Sentinel] prefix for a paid model", () => {
    expect(() => assertFreePolicy(paidModel)).toThrowError(/\[Sentinel\]/);
  });

  it("throws for unknown pricing (null prices)", () => {
    expect(() => assertFreePolicy(unknownPricingMarkedFree)).toThrow();
  });

  it("throws containing the violation reason in the message", () => {
    expect(() => assertFreePolicy(paidModel)).toThrowError(/model_not_free/);
  });

  it("throws containing the violation reason for unknown pricing", () => {
    expect(() => assertFreePolicy(unknownPricingMarkedFree)).toThrowError(/pricing_unknown/);
  });
});

// ---------------------------------------------------------------------------
// 4. BILLING_POLICY constant
// ---------------------------------------------------------------------------

describe("BILLING_POLICY", () => {
  it("enforces freeOnly=true", () => {
    expect(BILLING_POLICY.freeOnly).toBe(true);
  });

  it("disallows paid fallback", () => {
    expect(BILLING_POLICY.allowPaidFallback).toBe(false);
  });

  it("disallows billing activation", () => {
    expect(BILLING_POLICY.allowBillingActivation).toBe(false);
  });

  it("sets maxRequestCostUsd to 0", () => {
    expect(BILLING_POLICY.maxRequestCostUsd).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 5. Model catalog
// ---------------------------------------------------------------------------

describe("getAllModels", () => {
  it("returns more than 0 models", () => {
    expect(getAllModels().length).toBeGreaterThan(0);
  });

  it("every model has a provider field", () => {
    for (const m of getAllModels()) {
      expect(typeof m.provider).toBe("string");
      expect(m.provider.length).toBeGreaterThan(0);
    }
  });

  it("every model has a modelId field", () => {
    for (const m of getAllModels()) {
      expect(typeof m.modelId).toBe("string");
      expect(m.modelId.length).toBeGreaterThan(0);
    }
  });

  it("every model has a pricing object", () => {
    for (const m of getAllModels()) {
      expect(m.pricing).toBeDefined();
      expect(typeof m.pricing.verifiedFree).toBe("boolean");
    }
  });

  it("all models from getAllModels() have verifiedFree=true", () => {
    for (const m of getAllModels()) {
      expect(m.pricing.verifiedFree).toBe(true);
    }
  });

  it("no model has inputPriceUsdPerMillion > 0 AND verifiedFree=true (contradiction)", () => {
    const contradictions = getAllModels().filter(
      (m) =>
        m.pricing.verifiedFree === true &&
        m.pricing.inputPriceUsdPerMillion !== null &&
        m.pricing.inputPriceUsdPerMillion > 0,
    );
    expect(contradictions).toHaveLength(0);
  });

  it("no model has outputPriceUsdPerMillion > 0 AND verifiedFree=true (contradiction)", () => {
    const contradictions = getAllModels().filter(
      (m) =>
        m.pricing.verifiedFree === true &&
        m.pricing.outputPriceUsdPerMillion !== null &&
        m.pricing.outputPriceUsdPerMillion > 0,
    );
    expect(contradictions).toHaveLength(0);
  });
});

describe("getModelsForProvider", () => {
  it("returns Groq models when querying 'groq'", () => {
    const models = getModelsForProvider("groq");
    expect(models.length).toBeGreaterThan(0);
    for (const m of models) {
      expect(m.provider).toBe("groq");
    }
  });

  it("returns Gemini models when querying 'gemini'", () => {
    const models = getModelsForProvider("gemini");
    expect(models.length).toBeGreaterThan(0);
    for (const m of models) {
      expect(m.provider).toBe("gemini");
    }
  });

  it("returns empty array for an unknown provider", () => {
    expect(getModelsForProvider("nonexistent-provider-xyz")).toHaveLength(0);
  });

  it("all returned models pass checkFreePolicy", () => {
    for (const m of getAllModels()) {
      const result = checkFreePolicy(m);
      expect(result.allowed).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 6. Free Firewall end-to-end logic
// ---------------------------------------------------------------------------

describe("Free Firewall end-to-end", () => {
  it("paid model → checkFreePolicy → allowed=false", () => {
    const model = {
      pricing: { verifiedFree: false, inputPriceUsdPerMillion: 10.0, outputPriceUsdPerMillion: 30.0 },
    };
    const result = checkFreePolicy(model);
    expect(result.allowed).toBe(false);
  });

  it("unknown model (no verifiedFree flag) → checkFreePolicy → allowed=false by default", () => {
    const unknownModel = {
      pricing: { verifiedFree: false, inputPriceUsdPerMillion: null, outputPriceUsdPerMillion: null },
    };
    const result = checkFreePolicy(unknownModel);
    expect(result.allowed).toBe(false);
  });

  it("verified-free model → checkFreePolicy → allowed=true", () => {
    const [firstFreeModel] = getAllModels();
    expect(firstFreeModel).toBeDefined();
    const result = checkFreePolicy(firstFreeModel!);
    expect(result.allowed).toBe(true);
  });

  it("paid model → assertFreePolicy → throws, verified-free → does not throw", () => {
    const paid = { pricing: { verifiedFree: false, inputPriceUsdPerMillion: 5.0, outputPriceUsdPerMillion: 15.0 } };
    const free = { pricing: { verifiedFree: true, inputPriceUsdPerMillion: 0, outputPriceUsdPerMillion: 0 } };

    expect(() => assertFreePolicy(paid)).toThrow();
    expect(() => assertFreePolicy(free)).not.toThrow();
  });

  it("all catalog models pass the firewall end-to-end", () => {
    const models = getAllModels();
    for (const m of models) {
      expect(() => assertFreePolicy(m)).not.toThrow();
    }
  });
});
