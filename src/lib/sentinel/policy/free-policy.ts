// Central free-only billing enforcement for Sentinel.
// All LLM calls must pass checkFreePolicy before dispatch.

export type FreePolicyViolationReason =
  | "model_not_free"
  | "pricing_unknown"
  | "free_quota_exhausted"
  | "paid_fallback_blocked"
  | "billing_required"
  | "provider_not_verified";

export type FreePolicyResult =
  | { allowed: true }
  | { allowed: false; reason: FreePolicyViolationReason; detail: string };

export const BILLING_POLICY = {
  freeOnly: true as const,
  allowUnknownPricing: false as const,
  allowPaidFallback: false as const,
  allowBillingActivation: false as const,
  maxRequestCostUsd: 0 as const,
} as const;

type ModelPricingInput = {
  pricing: {
    verifiedFree: boolean;
    inputPriceUsdPerMillion: number | null;
    outputPriceUsdPerMillion: number | null;
  };
};

export function checkFreePolicy(model: ModelPricingInput): FreePolicyResult {
  const { verifiedFree, inputPriceUsdPerMillion, outputPriceUsdPerMillion } = model.pricing;

  if (!verifiedFree) {
    return {
      allowed: false,
      reason: "model_not_free",
      detail: "Model is not marked as verified free. Paid models are blocked by billing policy.",
    };
  }

  if (inputPriceUsdPerMillion === null || outputPriceUsdPerMillion === null) {
    return {
      allowed: false,
      reason: "pricing_unknown",
      detail: "Model pricing is unknown. Cannot verify zero cost — request blocked by billing policy.",
    };
  }

  if (inputPriceUsdPerMillion > 0 || outputPriceUsdPerMillion > 0) {
    return {
      allowed: false,
      reason: "model_not_free",
      detail: `Model has non-zero pricing (input: $${inputPriceUsdPerMillion}/M, output: $${outputPriceUsdPerMillion}/M). Only free models are permitted.`,
    };
  }

  return { allowed: true };
}

export function assertFreePolicy(model: ModelPricingInput): void {
  const result = checkFreePolicy(model);
  if (!result.allowed) {
    throw new Error(`[Sentinel] Free policy violation (${result.reason}): ${result.detail}`);
  }
}

export function isFreeModel(model: ModelPricingInput): boolean {
  return checkFreePolicy(model).allowed;
}
