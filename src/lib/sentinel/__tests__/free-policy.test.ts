import { describe, it, expect } from "vitest";
import {
  checkFreePolicy,
  assertFreePolicy,
  isFreeModel,
  BILLING_POLICY,
} from "../policy/free-policy";

function makeModel(
  verifiedFree: boolean,
  inputPrice: number | null,
  outputPrice: number | null,
) {
  return {
    pricing: {
      verifiedFree,
      inputPriceUsdPerMillion: inputPrice,
      outputPriceUsdPerMillion: outputPrice,
    },
  };
}

describe("BILLING_POLICY constants", () => {
  it("freeOnly is true", () => {
    expect(BILLING_POLICY.freeOnly).toBe(true);
  });

  it("allowUnknownPricing is false", () => {
    expect(BILLING_POLICY.allowUnknownPricing).toBe(false);
  });

  it("allowPaidFallback is false", () => {
    expect(BILLING_POLICY.allowPaidFallback).toBe(false);
  });

  it("allowBillingActivation is false", () => {
    expect(BILLING_POLICY.allowBillingActivation).toBe(false);
  });

  it("maxRequestCostUsd is 0", () => {
    expect(BILLING_POLICY.maxRequestCostUsd).toBe(0);
  });
});

describe("checkFreePolicy()", () => {
  it("allows verified free model with zero prices", () => {
    const result = checkFreePolicy(makeModel(true, 0, 0));
    expect(result.allowed).toBe(true);
  });

  it("blocks model with verifiedFree: false", () => {
    const result = checkFreePolicy(makeModel(false, 0, 0));
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe("model_not_free");
    }
  });

  it("blocks model with null input pricing", () => {
    const result = checkFreePolicy(makeModel(true, null, 0));
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe("pricing_unknown");
    }
  });

  it("blocks model with null output pricing", () => {
    const result = checkFreePolicy(makeModel(true, 0, null));
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe("pricing_unknown");
    }
  });

  it("blocks model with both prices null", () => {
    const result = checkFreePolicy(makeModel(true, null, null));
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe("pricing_unknown");
    }
  });

  it("blocks model with input price > 0", () => {
    const result = checkFreePolicy(makeModel(true, 1.5, 0));
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe("model_not_free");
    }
  });

  it("blocks model with output price > 0", () => {
    const result = checkFreePolicy(makeModel(true, 0, 2.0));
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe("model_not_free");
    }
  });

  it("blocks model with verifiedFree: false and null pricing (verifiedFree check fires first)", () => {
    const result = checkFreePolicy(makeModel(false, null, null));
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe("model_not_free");
    }
  });

  it("returns detail string when blocked", () => {
    const result = checkFreePolicy(makeModel(false, 0, 0));
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(typeof result.detail).toBe("string");
      expect(result.detail.length).toBeGreaterThan(0);
    }
  });
});

describe("assertFreePolicy()", () => {
  it("does not throw for a verified free model", () => {
    expect(() => assertFreePolicy(makeModel(true, 0, 0))).not.toThrow();
  });

  it("throws for a paid model (verifiedFree: false)", () => {
    expect(() => assertFreePolicy(makeModel(false, 0, 0))).toThrow(
      /free policy violation/i,
    );
  });

  it("throws for a model with non-zero input price", () => {
    expect(() => assertFreePolicy(makeModel(true, 3.0, 0))).toThrow();
  });

  it("throws for a model with unknown pricing", () => {
    expect(() => assertFreePolicy(makeModel(true, null, null))).toThrow();
  });

  it("error message includes violation reason", () => {
    try {
      assertFreePolicy(makeModel(false, 0, 0));
      expect.fail("should have thrown");
    } catch (e) {
      expect((e as Error).message).toContain("model_not_free");
    }
  });
});

describe("isFreeModel()", () => {
  it("returns true for verified free model with zero prices", () => {
    expect(isFreeModel(makeModel(true, 0, 0))).toBe(true);
  });

  it("returns false for model with verifiedFree: false", () => {
    expect(isFreeModel(makeModel(false, 0, 0))).toBe(false);
  });

  it("returns false for model with null pricing", () => {
    expect(isFreeModel(makeModel(true, null, null))).toBe(false);
  });

  it("returns false for model with price > 0", () => {
    expect(isFreeModel(makeModel(true, 0.5, 0))).toBe(false);
  });
});
