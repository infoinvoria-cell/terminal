import type { DiscoveredModel, TaskClass } from "./discovered-model-types";

const nowUtc = () => new Date().toISOString();
const ttlUtc = (ttlMs: number) => new Date(Date.now() + ttlMs).toISOString();

const CATALOG_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

// -- Static free model definitions -------------------------------------------

const STATIC_MODELS: DiscoveredModel[] = [
  // Groq
  {
    provider: "groq",
    modelId: "llama-3.3-70b-versatile",
    displayName: "Llama 3.3 70B (Groq)",
    availability: "available",
    pricing: { verifiedFree: true, inputPriceUsdPerMillion: 0, outputPriceUsdPerMillion: 0, source: "groq-free-tier", verifiedAtUtc: "2025-01-01T00:00:00Z" },
    capabilities: { text: true, vision: false, audioInput: false, audioOutput: false, streaming: true, nativeTools: true, structuredOutput: true, reasoning: false, embeddings: false, reranking: false },
    limits: { contextWindow: 131072, maxOutputTokens: 32768, requestsPerMinute: 30, requestsPerDay: 14400, tokensPerMinute: 6000, tokensPerDay: null },
    statusSource: "official_config",
    fetchedAtUtc: nowUtc(),
    expiresAtUtc: ttlUtc(CATALOG_TTL_MS),
  },
  {
    provider: "groq",
    modelId: "llama-3.1-8b-instant",
    displayName: "Llama 3.1 8B Instant (Groq)",
    availability: "available",
    pricing: { verifiedFree: true, inputPriceUsdPerMillion: 0, outputPriceUsdPerMillion: 0, source: "groq-free-tier", verifiedAtUtc: "2025-01-01T00:00:00Z" },
    capabilities: { text: true, vision: false, audioInput: false, audioOutput: false, streaming: true, nativeTools: true, structuredOutput: false, reasoning: false, embeddings: false, reranking: false },
    limits: { contextWindow: 131072, maxOutputTokens: 8192, requestsPerMinute: 30, requestsPerDay: 14400, tokensPerMinute: 20000, tokensPerDay: null },
    statusSource: "official_config",
    fetchedAtUtc: nowUtc(),
    expiresAtUtc: ttlUtc(CATALOG_TTL_MS),
  },
  // Cerebras
  {
    provider: "cerebras",
    modelId: "llama-3.3-70b",
    displayName: "Llama 3.3 70B (Cerebras)",
    availability: "available",
    pricing: { verifiedFree: true, inputPriceUsdPerMillion: 0, outputPriceUsdPerMillion: 0, source: "cerebras-free-tier", verifiedAtUtc: "2025-01-01T00:00:00Z" },
    capabilities: { text: true, vision: false, audioInput: false, audioOutput: false, streaming: true, nativeTools: false, structuredOutput: false, reasoning: false, embeddings: false, reranking: false },
    limits: { contextWindow: 128000, maxOutputTokens: 8192, requestsPerMinute: 30, requestsPerDay: 1000, tokensPerMinute: null, tokensPerDay: null },
    statusSource: "official_config",
    fetchedAtUtc: nowUtc(),
    expiresAtUtc: ttlUtc(CATALOG_TTL_MS),
  },
  // Mistral
  {
    provider: "mistral",
    modelId: "mistral-small-latest",
    displayName: "Mistral Small (Mistral)",
    availability: "available",
    pricing: { verifiedFree: true, inputPriceUsdPerMillion: 0, outputPriceUsdPerMillion: 0, source: "mistral-la-plateforme-free", verifiedAtUtc: "2025-01-01T00:00:00Z" },
    capabilities: { text: true, vision: false, audioInput: false, audioOutput: false, streaming: true, nativeTools: true, structuredOutput: true, reasoning: false, embeddings: false, reranking: false },
    limits: { contextWindow: 128000, maxOutputTokens: 8192, requestsPerMinute: 5, requestsPerDay: null, tokensPerMinute: null, tokensPerDay: null },
    statusSource: "official_config",
    fetchedAtUtc: nowUtc(),
    expiresAtUtc: ttlUtc(CATALOG_TTL_MS),
  },
  // Gemini
  {
    provider: "gemini",
    modelId: "gemini-1.5-flash",
    displayName: "Gemini 1.5 Flash (Google)",
    availability: "available",
    pricing: { verifiedFree: true, inputPriceUsdPerMillion: 0, outputPriceUsdPerMillion: 0, source: "google-free-tier", verifiedAtUtc: "2025-01-01T00:00:00Z" },
    capabilities: { text: true, vision: true, audioInput: false, audioOutput: false, streaming: true, nativeTools: true, structuredOutput: true, reasoning: false, embeddings: false, reranking: false },
    limits: { contextWindow: 1048576, maxOutputTokens: 8192, requestsPerMinute: 15, requestsPerDay: 1500, tokensPerMinute: 1000000, tokensPerDay: null },
    statusSource: "official_config",
    fetchedAtUtc: nowUtc(),
    expiresAtUtc: ttlUtc(CATALOG_TTL_MS),
  },
  {
    provider: "gemini",
    modelId: "gemini-2.0-flash-exp",
    displayName: "Gemini 2.0 Flash Exp (Google)",
    availability: "available",
    pricing: { verifiedFree: true, inputPriceUsdPerMillion: 0, outputPriceUsdPerMillion: 0, source: "google-free-tier", verifiedAtUtc: "2025-01-01T00:00:00Z" },
    capabilities: { text: true, vision: true, audioInput: false, audioOutput: false, streaming: true, nativeTools: true, structuredOutput: true, reasoning: false, embeddings: false, reranking: false },
    limits: { contextWindow: 1048576, maxOutputTokens: 8192, requestsPerMinute: 10, requestsPerDay: 1000, tokensPerMinute: 1000000, tokensPerDay: null },
    statusSource: "official_config",
    fetchedAtUtc: nowUtc(),
    expiresAtUtc: ttlUtc(CATALOG_TTL_MS),
  },
  // OpenRouter (free models)
  {
    provider: "openrouter",
    modelId: "meta-llama/llama-3.3-70b-instruct:free",
    displayName: "Llama 3.3 70B Instruct (OpenRouter Free)",
    availability: "available",
    pricing: { verifiedFree: true, inputPriceUsdPerMillion: 0, outputPriceUsdPerMillion: 0, source: "openrouter-free-suffix", verifiedAtUtc: "2025-01-01T00:00:00Z" },
    capabilities: { text: true, vision: false, audioInput: false, audioOutput: false, streaming: true, nativeTools: false, structuredOutput: false, reasoning: false, embeddings: false, reranking: false },
    limits: { contextWindow: 131072, maxOutputTokens: 8192, requestsPerMinute: 20, requestsPerDay: null, tokensPerMinute: null, tokensPerDay: null },
    statusSource: "official_config",
    fetchedAtUtc: nowUtc(),
    expiresAtUtc: ttlUtc(CATALOG_TTL_MS),
  },
  {
    provider: "openrouter",
    modelId: "mistralai/mistral-7b-instruct:free",
    displayName: "Mistral 7B Instruct (OpenRouter Free)",
    availability: "available",
    pricing: { verifiedFree: true, inputPriceUsdPerMillion: 0, outputPriceUsdPerMillion: 0, source: "openrouter-free-suffix", verifiedAtUtc: "2025-01-01T00:00:00Z" },
    capabilities: { text: true, vision: false, audioInput: false, audioOutput: false, streaming: true, nativeTools: false, structuredOutput: false, reasoning: false, embeddings: false, reranking: false },
    limits: { contextWindow: 32768, maxOutputTokens: 4096, requestsPerMinute: 20, requestsPerDay: null, tokensPerMinute: null, tokensPerDay: null },
    statusSource: "official_config",
    fetchedAtUtc: nowUtc(),
    expiresAtUtc: ttlUtc(CATALOG_TTL_MS),
  },
  // GitHub Models
  {
    provider: "github-models",
    modelId: "meta-llama-3.1-8b-instruct",
    displayName: "Llama 3.1 8B (GitHub Models)",
    availability: "unknown",
    pricing: { verifiedFree: true, inputPriceUsdPerMillion: 0, outputPriceUsdPerMillion: 0, source: "github-models-free-tier", verifiedAtUtc: "2025-01-01T00:00:00Z" },
    capabilities: { text: true, vision: false, audioInput: false, audioOutput: false, streaming: true, nativeTools: false, structuredOutput: false, reasoning: false, embeddings: false, reranking: false },
    limits: { contextWindow: 128000, maxOutputTokens: 8192, requestsPerMinute: 15, requestsPerDay: 150, tokensPerMinute: null, tokensPerDay: null },
    statusSource: "official_config",
    fetchedAtUtc: nowUtc(),
    expiresAtUtc: ttlUtc(CATALOG_TTL_MS),
  },
  // Cohere
  {
    provider: "cohere",
    modelId: "command-r7b-12-2024",
    displayName: "Command R7B (Cohere Free)",
    availability: "available",
    pricing: { verifiedFree: true, inputPriceUsdPerMillion: 0, outputPriceUsdPerMillion: 0, source: "cohere-free-tier", verifiedAtUtc: "2025-06-01T00:00:00Z" },
    capabilities: { text: true, vision: false, audioInput: false, audioOutput: false, streaming: true, nativeTools: true, structuredOutput: true, reasoning: false, embeddings: false, reranking: false },
    limits: { contextWindow: 128000, maxOutputTokens: 4096, requestsPerMinute: 20, requestsPerDay: 1000, tokensPerMinute: null, tokensPerDay: null },
    statusSource: "official_config",
    fetchedAtUtc: nowUtc(),
    expiresAtUtc: ttlUtc(CATALOG_TTL_MS),
  },
  // Groq — additional free models
  {
    provider: "groq",
    modelId: "deepseek-r1-distill-llama-70b",
    displayName: "DeepSeek R1 Distill Llama 70B (Groq)",
    availability: "available",
    pricing: { verifiedFree: true, inputPriceUsdPerMillion: 0, outputPriceUsdPerMillion: 0, source: "groq-free-tier", verifiedAtUtc: "2025-06-01T00:00:00Z" },
    capabilities: { text: true, vision: false, audioInput: false, audioOutput: false, streaming: true, nativeTools: false, structuredOutput: false, reasoning: true, embeddings: false, reranking: false },
    limits: { contextWindow: 131072, maxOutputTokens: 16384, requestsPerMinute: 30, requestsPerDay: 1000, tokensPerMinute: 6000, tokensPerDay: null },
    statusSource: "official_config",
    fetchedAtUtc: nowUtc(),
    expiresAtUtc: ttlUtc(CATALOG_TTL_MS),
  },
  {
    provider: "groq",
    modelId: "llama-3.1-70b-versatile",
    displayName: "Llama 3.1 70B Versatile (Groq)",
    availability: "available",
    pricing: { verifiedFree: true, inputPriceUsdPerMillion: 0, outputPriceUsdPerMillion: 0, source: "groq-free-tier", verifiedAtUtc: "2025-01-01T00:00:00Z" },
    capabilities: { text: true, vision: false, audioInput: false, audioOutput: false, streaming: true, nativeTools: true, structuredOutput: true, reasoning: false, embeddings: false, reranking: false },
    limits: { contextWindow: 131072, maxOutputTokens: 32768, requestsPerMinute: 30, requestsPerDay: 14400, tokensPerMinute: 6000, tokensPerDay: null },
    statusSource: "official_config",
    fetchedAtUtc: nowUtc(),
    expiresAtUtc: ttlUtc(CATALOG_TTL_MS),
  },
  // Gemini 2.5 Flash — best free context window (1M)
  {
    provider: "gemini",
    modelId: "gemini-2.5-flash",
    displayName: "Gemini 2.5 Flash (Google)",
    availability: "available",
    pricing: { verifiedFree: true, inputPriceUsdPerMillion: 0, outputPriceUsdPerMillion: 0, source: "google-free-tier", verifiedAtUtc: "2025-06-01T00:00:00Z" },
    capabilities: { text: true, vision: true, audioInput: false, audioOutput: false, streaming: true, nativeTools: true, structuredOutput: true, reasoning: true, embeddings: false, reranking: false },
    limits: { contextWindow: 1048576, maxOutputTokens: 65536, requestsPerMinute: 10, requestsPerDay: 500, tokensPerMinute: 250000, tokensPerDay: null },
    statusSource: "official_config",
    fetchedAtUtc: nowUtc(),
    expiresAtUtc: ttlUtc(CATALOG_TTL_MS),
  },
  // Gemini 2.0 Flash — faster, larger daily limit
  {
    provider: "gemini",
    modelId: "gemini-2.0-flash",
    displayName: "Gemini 2.0 Flash (Google)",
    availability: "available",
    pricing: { verifiedFree: true, inputPriceUsdPerMillion: 0, outputPriceUsdPerMillion: 0, source: "google-free-tier", verifiedAtUtc: "2025-01-01T00:00:00Z" },
    capabilities: { text: true, vision: true, audioInput: false, audioOutput: false, streaming: true, nativeTools: true, structuredOutput: true, reasoning: false, embeddings: false, reranking: false },
    limits: { contextWindow: 1048576, maxOutputTokens: 8192, requestsPerMinute: 15, requestsPerDay: 1500, tokensPerMinute: 1000000, tokensPerDay: null },
    statusSource: "official_config",
    fetchedAtUtc: nowUtc(),
    expiresAtUtc: ttlUtc(CATALOG_TTL_MS),
  },
  // OpenRouter — additional free models
  {
    provider: "openrouter",
    modelId: "google/gemma-3-27b-it:free",
    displayName: "Gemma 3 27B (OpenRouter Free)",
    availability: "available",
    pricing: { verifiedFree: true, inputPriceUsdPerMillion: 0, outputPriceUsdPerMillion: 0, source: "openrouter-free-suffix", verifiedAtUtc: "2025-06-01T00:00:00Z" },
    capabilities: { text: true, vision: false, audioInput: false, audioOutput: false, streaming: true, nativeTools: false, structuredOutput: false, reasoning: false, embeddings: false, reranking: false },
    limits: { contextWindow: 131072, maxOutputTokens: 8192, requestsPerMinute: 20, requestsPerDay: null, tokensPerMinute: null, tokensPerDay: null },
    statusSource: "official_config",
    fetchedAtUtc: nowUtc(),
    expiresAtUtc: ttlUtc(CATALOG_TTL_MS),
  },
  {
    provider: "openrouter",
    modelId: "deepseek/deepseek-r1:free",
    displayName: "DeepSeek R1 (OpenRouter Free)",
    availability: "available",
    pricing: { verifiedFree: true, inputPriceUsdPerMillion: 0, outputPriceUsdPerMillion: 0, source: "openrouter-free-suffix", verifiedAtUtc: "2025-06-01T00:00:00Z" },
    capabilities: { text: true, vision: false, audioInput: false, audioOutput: false, streaming: true, nativeTools: false, structuredOutput: false, reasoning: true, embeddings: false, reranking: false },
    limits: { contextWindow: 131072, maxOutputTokens: 16384, requestsPerMinute: 20, requestsPerDay: null, tokensPerMinute: null, tokensPerDay: null },
    statusSource: "official_config",
    fetchedAtUtc: nowUtc(),
    expiresAtUtc: ttlUtc(CATALOG_TTL_MS),
  },
  // Groq — Qwen QwQ 32B reasoning model
  {
    provider: "groq",
    modelId: "qwen-qwq-32b",
    displayName: "Qwen QwQ 32B (Groq)",
    availability: "available",
    pricing: { verifiedFree: true, inputPriceUsdPerMillion: 0, outputPriceUsdPerMillion: 0, source: "groq-free-tier", verifiedAtUtc: "2025-06-01T00:00:00Z" },
    capabilities: { text: true, vision: false, audioInput: false, audioOutput: false, streaming: true, nativeTools: false, structuredOutput: false, reasoning: true, embeddings: false, reranking: false },
    limits: { contextWindow: 131072, maxOutputTokens: 32768, requestsPerMinute: 30, requestsPerDay: 100, tokensPerMinute: 6000, tokensPerDay: null },
    statusSource: "official_config",
    fetchedAtUtc: nowUtc(),
    expiresAtUtc: ttlUtc(CATALOG_TTL_MS),
  },
  // Gemini 2.5 Flash Thinking — experimental reasoning variant
  {
    provider: "gemini",
    modelId: "gemini-2.5-flash-thinking-exp",
    displayName: "Gemini 2.5 Flash Thinking (Google Free)",
    availability: "available",
    pricing: { verifiedFree: true, inputPriceUsdPerMillion: 0, outputPriceUsdPerMillion: 0, source: "google-free-tier", verifiedAtUtc: "2025-06-01T00:00:00Z" },
    capabilities: { text: true, vision: true, audioInput: false, audioOutput: false, streaming: true, nativeTools: false, structuredOutput: false, reasoning: true, embeddings: false, reranking: false },
    limits: { contextWindow: 1048576, maxOutputTokens: 65536, requestsPerMinute: 10, requestsPerDay: 500, tokensPerMinute: 250000, tokensPerDay: null },
    statusSource: "official_config",
    fetchedAtUtc: nowUtc(),
    expiresAtUtc: ttlUtc(CATALOG_TTL_MS),
  },
];

// -- Capability pool assignment ------------------------------------------------

const TASK_CAPABILITY_MAP: Record<TaskClass, (m: DiscoveredModel) => boolean> = {
  fast_chat: (m) => m.capabilities.text && (m.limits.requestsPerMinute ?? 0) >= 15,
  strong_general: (m) => m.capabilities.text && (m.limits.contextWindow ?? 0) >= 128000,
  reasoning: (m) => m.capabilities.reasoning, // strict — only real reasoning models
  coding: (m) => m.capabilities.nativeTools || m.capabilities.structuredOutput,
  long_context: (m) => (m.limits.contextWindow ?? 0) >= 500000,
  vision: (m) => m.capabilities.vision,
  multilingual: (m) => m.capabilities.text,
  structured_output: (m) => m.capabilities.structuredOutput,
  tool_calling: (m) => m.capabilities.nativeTools,
  summarization: (m) => m.capabilities.text && (m.limits.contextWindow ?? 0) >= 32000,
  embeddings: (m) => m.capabilities.embeddings,
  reranking: (m) => m.capabilities.reranking,
};

// -- Public API ---------------------------------------------------------------

export function getAllModels(): DiscoveredModel[] {
  return STATIC_MODELS.filter((m) => m.pricing.verifiedFree);
}

export function getModelsForProvider(provider: string): DiscoveredModel[] {
  return getAllModels().filter((m) => m.provider === provider);
}

export function getModelsForTask(taskClass: TaskClass): DiscoveredModel[] {
  const filter = TASK_CAPABILITY_MAP[taskClass];
  return getAllModels().filter((m) => m.availability !== "unavailable" && m.availability !== "deprecated" && filter(m));
}

export function getBestModelForTask(taskClass: TaskClass, configuredProviders: string[]): DiscoveredModel | null {
  const candidates = getModelsForTask(taskClass).filter((m) => configuredProviders.includes(m.provider));
  if (!candidates.length) return null;
  // Prefer higher context window for most tasks
  return candidates.sort((a, b) => (b.limits.contextWindow ?? 0) - (a.limits.contextWindow ?? 0))[0] ?? null;
}

/**
 * Returns the best available model from the given provider for the given task.
 * Uses TASK_CAPABILITY_MAP to filter eligible models, then ranks by quality:
 *   - For "fast_chat": prefer smallest context window that still qualifies (lower latency)
 *   - For all other tasks: prefer reasoning > structuredOutput > general,
 *     with context window as tiebreaker.
 *
 * Pass a TaskClass string or any string label — unknown task classes return null.
 */
export function getPreferredModelForTask(
  task: TaskClass | string,
  providerId: string,
): DiscoveredModel | null {
  const filter = TASK_CAPABILITY_MAP[task as TaskClass];
  if (!filter) return null;

  const candidates = getAllModels().filter(
    (m) =>
      m.provider === providerId &&
      m.availability !== "unavailable" &&
      m.availability !== "deprecated" &&
      filter(m),
  );

  if (!candidates.length) return null;

  if (task === "fast_chat") {
    // Smallest context window that still satisfies the filter — fastest response
    return candidates.sort(
      (a, b) => (a.limits.contextWindow ?? 0) - (b.limits.contextWindow ?? 0),
    )[0] ?? null;
  }

  // Quality sort: reasoning first, then structuredOutput, then context window descending
  return candidates.sort((a, b) => {
    const qualityScore = (m: DiscoveredModel) =>
      (m.capabilities.reasoning ? 2 : 0) +
      (m.capabilities.structuredOutput ? 1 : 0);
    const qDiff = qualityScore(b) - qualityScore(a);
    if (qDiff !== 0) return qDiff;
    return (b.limits.contextWindow ?? 0) - (a.limits.contextWindow ?? 0);
  })[0] ?? null;
}

export function getCatalogSummary() {
  const all = getAllModels();
  const byProvider: Record<string, number> = {};
  for (const m of all) {
    byProvider[m.provider] = (byProvider[m.provider] ?? 0) + 1;
  }
  return { totalModels: all.length, byProvider, freePolicyEnforced: true };
}
