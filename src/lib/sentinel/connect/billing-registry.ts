// Billing registry: tracks billing class (FREE / PAID / UNKNOWN) at model level.
// Auto mode may ONLY use FREE models. PAID and UNKNOWN are never auto-selected.
// Source values indicate evidence quality: "provider_docs" > "assumed" > "unknown".

export type BillingClass = "FREE" | "PAID" | "UNKNOWN";

export type ModelBillingRecord = {
  provider: string;
  model: string; // exact match or prefix (startsWith check); empty string = wildcard for provider
  billingClass: BillingClass;
  source: "provider_docs" | "account_metadata" | "config" | "assumed";
  verifiedAt: string; // YYYY-MM-DD
  notes?: string;
};

// Registry — verified or assumed at 2026-08-17.
// Groq: All models on free API tier per groq.com/pricing (free plan with rate limits).
// Mistral: mistral-small documented free tier on platform.mistral.ai.
// Cohere: command-* documented free trial on docs.cohere.com.
// Cerebras: free tier per cloud.cerebras.ai/pricing (currently 402 = quota exhausted, not paid).
// Local/Ollama: zero cost, always FREE.
// Anthropic/OpenAI: PAID — no free API tier.
const BILLING_REGISTRY: ModelBillingRecord[] = [
  // ── Local ──────────────────────────────────────────────────────────────────
  { provider: "local",   model: "",                    billingClass: "FREE",    source: "provider_docs", verifiedAt: "2026-08-17", notes: "local Ollama, no cost" },
  { provider: "ollama",  model: "",                    billingClass: "FREE",    source: "provider_docs", verifiedAt: "2026-08-17", notes: "local Ollama, no cost" },

  // ── Groq ───────────────────────────────────────────────────────────────────
  { provider: "groq",    model: "groq/compound",       billingClass: "FREE",    source: "provider_docs", verifiedAt: "2026-08-17" },
  { provider: "groq",    model: "groq/compound-mini",  billingClass: "FREE",    source: "provider_docs", verifiedAt: "2026-08-17" },
  { provider: "groq",    model: "openai/gpt-oss-20b",  billingClass: "FREE",    source: "provider_docs", verifiedAt: "2026-08-17", notes: "Groq-hosted OSS model" },
  { provider: "groq",    model: "openai/gpt-oss-120b", billingClass: "FREE",    source: "provider_docs", verifiedAt: "2026-08-17", notes: "Groq-hosted OSS model" },
  { provider: "groq",    model: "qwen/qwen3.6-27b",    billingClass: "FREE",    source: "provider_docs", verifiedAt: "2026-08-17" },
  { provider: "groq",    model: "",                    billingClass: "UNKNOWN", source: "assumed",       verifiedAt: "2026-08-17", notes: "unlisted Groq model" },

  // ── Cerebras ───────────────────────────────────────────────────────────────
  { provider: "cerebras", model: "gemma-4-31b",        billingClass: "FREE",    source: "provider_docs", verifiedAt: "2026-08-17" },
  { provider: "cerebras", model: "gpt-oss-120b",       billingClass: "FREE",    source: "provider_docs", verifiedAt: "2026-08-17" },
  { provider: "cerebras", model: "zai-glm-4.7",        billingClass: "FREE",    source: "provider_docs", verifiedAt: "2026-08-17" },
  { provider: "cerebras", model: "",                   billingClass: "UNKNOWN", source: "assumed",       verifiedAt: "2026-08-17" },

  // ── Mistral ────────────────────────────────────────────────────────────────
  { provider: "mistral",  model: "mistral-small-latest",  billingClass: "FREE",    source: "provider_docs", verifiedAt: "2026-08-17" },
  { provider: "mistral",  model: "mistral-small",          billingClass: "FREE",    source: "provider_docs", verifiedAt: "2026-08-17" },
  { provider: "mistral",  model: "open-mistral-nemo",      billingClass: "FREE",    source: "provider_docs", verifiedAt: "2026-08-17" },
  { provider: "mistral",  model: "mistral-large",          billingClass: "PAID",    source: "provider_docs", verifiedAt: "2026-08-17" },
  { provider: "mistral",  model: "mistral-medium",         billingClass: "PAID",    source: "provider_docs", verifiedAt: "2026-08-17" },
  { provider: "mistral",  model: "codestral-latest",       billingClass: "PAID",    source: "provider_docs", verifiedAt: "2026-08-17" },
  { provider: "mistral",  model: "",                       billingClass: "UNKNOWN", source: "assumed",       verifiedAt: "2026-08-17" },

  // ── Cohere ─────────────────────────────────────────────────────────────────
  { provider: "cohere",   model: "command-r-plus-08-2024", billingClass: "FREE",    source: "assumed",       verifiedAt: "2026-08-17", notes: "free trial tier" },
  { provider: "cohere",   model: "command-r-plus",         billingClass: "FREE",    source: "assumed",       verifiedAt: "2026-08-17" },
  { provider: "cohere",   model: "command-r",              billingClass: "FREE",    source: "assumed",       verifiedAt: "2026-08-17" },
  { provider: "cohere",   model: "",                       billingClass: "UNKNOWN", source: "assumed",       verifiedAt: "2026-08-17" },

  // ── Anthropic — PAID ───────────────────────────────────────────────────────
  { provider: "anthropic", model: "",                      billingClass: "PAID",    source: "provider_docs", verifiedAt: "2026-08-17", notes: "no free API tier" },

  // ── Gemini ─────────────────────────────────────────────────────────────────
  { provider: "gemini",   model: "gemini-2.0-flash",       billingClass: "FREE",    source: "provider_docs", verifiedAt: "2026-08-17" },
  { provider: "gemini",   model: "gemini-1.5-flash",       billingClass: "FREE",    source: "provider_docs", verifiedAt: "2026-08-17" },
  { provider: "gemini",   model: "gemini-1.5-pro",         billingClass: "PAID",    source: "provider_docs", verifiedAt: "2026-08-17" },
  { provider: "gemini",   model: "gemini-2.0-pro",         billingClass: "PAID",    source: "provider_docs", verifiedAt: "2026-08-17" },
  { provider: "gemini",   model: "",                       billingClass: "UNKNOWN", source: "assumed",       verifiedAt: "2026-08-17" },

  // ── OpenRouter ─────────────────────────────────────────────────────────────
  { provider: "openrouter", model: "",                     billingClass: "UNKNOWN", source: "assumed",       verifiedAt: "2026-08-17", notes: "varies per routed model" },

  // ── Custom / GitHub ────────────────────────────────────────────────────────
  { provider: "custom",   model: "",                       billingClass: "UNKNOWN", source: "assumed",       verifiedAt: "2026-08-17" },
  { provider: "github",   model: "",                       billingClass: "UNKNOWN", source: "assumed",       verifiedAt: "2026-08-17" },
];

function lookupBilling(provider: string, model: string): ModelBillingRecord {
  const exact = BILLING_REGISTRY.find((r) => r.provider === provider && r.model === model);
  if (exact) return exact;
  const prefix = BILLING_REGISTRY.find((r) => r.provider === provider && r.model.length > 0 && model.startsWith(r.model));
  if (prefix) return prefix;
  const fallback = BILLING_REGISTRY.find((r) => r.provider === provider && r.model === "");
  if (fallback) return fallback;
  return { provider, model, billingClass: "UNKNOWN", source: "assumed", verifiedAt: "2026-08-17" };
}

export function getBillingClass(provider: string, model: string): BillingClass {
  return lookupBilling(provider, model).billingClass;
}

export function isFreeModel(provider: string, model: string): boolean {
  return getBillingClass(provider, model) === "FREE";
}

export function getBillingRecord(provider: string, model: string): ModelBillingRecord {
  return lookupBilling(provider, model);
}

export function getAllRegistryRecords(): ModelBillingRecord[] {
  return BILLING_REGISTRY;
}
