// Model capabilities registry — single source of truth for context windows, output limits, streaming support
import type { SentinelProviderId } from "./types";

export type ModelCapabilities = {
  provider: SentinelProviderId;
  model: string;
  /** Actual model context window in tokens (from provider API / docs). */
  contextWindow: number;
  maxOutputTokens: number;
  supportsStreaming: boolean;
  supportsTools: boolean;
  supportsVision: boolean;
  latencyClass: "fast" | "medium" | "slow";
  qualityClass: "basic" | "balanced" | "strong";
  freeTier: boolean;
  /**
   * Account-level tokens-per-minute rate limit.
   * Separate from contextWindow — do NOT use for context trimming.
   * Use for rate-limit tracking / delay logic only.
   */
  tokensPerMinute?: number;
  /** Requests per minute account limit. */
  requestsPerMinute?: number;
  /**
   * Conservative operational prompt budget for trimming.
   * When set, trimToContextBudget() uses this instead of contextWindow.
   * Typically derived from TPM or a known practical prompt limit — labeled clearly,
   * never confused with contextWindow.
   */
  safePromptBudgetTokens?: number;
};

export const MODEL_REGISTRY: Record<string, ModelCapabilities> = {
  "groq:llama-3.3-70b-versatile": { provider: "groq", model: "llama-3.3-70b-versatile", contextWindow: 128000, maxOutputTokens: 32768, supportsStreaming: true, supportsTools: true, supportsVision: false, latencyClass: "fast", qualityClass: "strong", freeTier: true },
  "groq:llama-3.1-8b-instant": { provider: "groq", model: "llama-3.1-8b-instant", contextWindow: 131072, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: true, supportsVision: false, latencyClass: "fast", qualityClass: "basic", freeTier: true },
  // Groq compound models — context_window verified via /v1/models API (2026-08-17).
  // tokensPerMinute: 8000 is the ACCOUNT RATE LIMIT (observed from 413 error on this free account).
  // safePromptBudgetTokens: conservative operational limit derived from 8K TPM - output reserve - safety.
  // Do NOT use tokensPerMinute as contextWindow — they are different.
  "groq:groq/compound":       { provider: "groq", model: "groq/compound",       contextWindow: 131072, maxOutputTokens: 8192,  supportsStreaming: false, supportsTools: false, supportsVision: false, latencyClass: "fast", qualityClass: "strong", freeTier: true, tokensPerMinute: 8000, safePromptBudgetTokens: 6000 },
  "groq:groq/compound-mini":  { provider: "groq", model: "groq/compound-mini",  contextWindow: 131072, maxOutputTokens: 8192,  supportsStreaming: false, supportsTools: false, supportsVision: false, latencyClass: "fast", qualityClass: "basic",  freeTier: true, tokensPerMinute: 8000, safePromptBudgetTokens: 6000 },
  "groq:openai/gpt-oss-120b": { provider: "groq", model: "openai/gpt-oss-120b", contextWindow: 131072, maxOutputTokens: 65536, supportsStreaming: false, supportsTools: true,  supportsVision: false, latencyClass: "fast", qualityClass: "strong", freeTier: true, tokensPerMinute: 8000, safePromptBudgetTokens: 6000 },
  "groq:openai/gpt-oss-20b":  { provider: "groq", model: "openai/gpt-oss-20b",  contextWindow: 131072, maxOutputTokens: 65536, supportsStreaming: false, supportsTools: true,  supportsVision: false, latencyClass: "fast", qualityClass: "basic",  freeTier: true, tokensPerMinute: 8000, safePromptBudgetTokens: 6000 },
  "cerebras:llama-3.3-70b": { provider: "cerebras", model: "llama-3.3-70b", contextWindow: 8192, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: false, supportsVision: false, latencyClass: "fast", qualityClass: "strong", freeTier: true },
  "mistral:mistral-small-latest": { provider: "mistral", model: "mistral-small-latest", contextWindow: 32768, maxOutputTokens: 4096, supportsStreaming: true, supportsTools: true, supportsVision: false, latencyClass: "medium", qualityClass: "balanced", freeTier: true },
  "cohere:command-r-plus": { provider: "cohere", model: "command-r-plus", contextWindow: 128000, maxOutputTokens: 4096, supportsStreaming: true, supportsTools: true, supportsVision: false, latencyClass: "medium", qualityClass: "strong", freeTier: true },
  "anthropic:claude-3-5-sonnet-latest": { provider: "anthropic", model: "claude-3-5-sonnet-latest", contextWindow: 200000, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: true, supportsVision: true, latencyClass: "medium", qualityClass: "strong", freeTier: false },
  "local:auto": { provider: "local", model: "auto", contextWindow: 8192, maxOutputTokens: 4096, supportsStreaming: true, supportsTools: false, supportsVision: false, latencyClass: "slow", qualityClass: "balanced", freeTier: true },
  "gemini:gemini-1.5-flash": { provider: "gemini" as SentinelProviderId, model: "gemini-1.5-flash", contextWindow: 1048576, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: true, supportsVision: false, latencyClass: "fast", qualityClass: "balanced", freeTier: true },
  "gemini:gemini-2.0-flash-exp": { provider: "gemini" as SentinelProviderId, model: "gemini-2.0-flash-exp", contextWindow: 1048576, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: true, supportsVision: false, latencyClass: "fast", qualityClass: "strong", freeTier: true },
  "openrouter:meta-llama/llama-3.3-70b-instruct:free": { provider: "openrouter" as SentinelProviderId, model: "meta-llama/llama-3.3-70b-instruct:free", contextWindow: 131072, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: false, supportsVision: false, latencyClass: "medium", qualityClass: "strong", freeTier: true },
  "openrouter:mistralai/mistral-7b-instruct:free": { provider: "openrouter" as SentinelProviderId, model: "mistralai/mistral-7b-instruct:free", contextWindow: 32768, maxOutputTokens: 4096, supportsStreaming: true, supportsTools: false, supportsVision: false, latencyClass: "fast", qualityClass: "basic", freeTier: true },
  "github-models:meta-llama-3.1-8b-instruct": { provider: "github-models" as SentinelProviderId, model: "meta-llama-3.1-8b-instruct", contextWindow: 131072, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: false, supportsVision: false, latencyClass: "medium", qualityClass: "basic", freeTier: true },
  "cloudflare:@cf/meta/llama-3.1-8b-instruct": { provider: "cloudflare" as SentinelProviderId, model: "@cf/meta/llama-3.1-8b-instruct", contextWindow: 128000, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: false, supportsVision: false, latencyClass: "medium", qualityClass: "basic", freeTier: true },
};

export function getCapabilities(provider: string, model: string): ModelCapabilities | null {
  return MODEL_REGISTRY[`${provider}:${model}`] ?? null;
}

export function getDefaultModel(provider: string): string {
  const defaults: Record<string, string> = {
    groq: "llama-3.3-70b-versatile",
    cerebras: "llama-3.3-70b",
    mistral: "mistral-small-latest",
    cohere: "command-r-plus",
    anthropic: "claude-3-5-sonnet-latest",
    local: "auto",
    ollama: "auto",
    custom: "auto",
  };
  return defaults[provider] ?? "auto";
}

export function calculateOutputBudget(
  provider: string,
  model: string,
  estimatedInputTokens: number,
  requestedOutput = 4096,
): number {
  const caps = getCapabilities(provider, model);
  if (!caps) return Math.min(requestedOutput ?? 8192, 8192);
  const safetyMargin = 500;
  const maxFromCtx = caps.contextWindow - estimatedInputTokens - safetyMargin;
  return Math.min(requestedOutput, caps.maxOutputTokens, Math.max(512, maxFromCtx));
}

export function getContextWindow(provider: string, model: string): number {
  const caps = getCapabilities(provider, model);
  return caps?.contextWindow ?? 128000;
}

export function getMaxOutputTokens(provider: string, model: string): number {
  const caps = getCapabilities(provider, model);
  return caps?.maxOutputTokens ?? 8192;
}

/**
 * Returns the operational prompt budget for context trimming.
 * When safePromptBudgetTokens is set (e.g. derived from account TPM rate limit),
 * use that — it is intentionally lower than contextWindow and labeled separately.
 * Otherwise falls back to contextWindow.
 * Never confuse this with the model's actual context window capacity.
 */
export function getSafePromptBudget(provider: string, model: string): number {
  const caps = getCapabilities(provider, model);
  if (caps?.safePromptBudgetTokens !== undefined) return caps.safePromptBudgetTokens;
  return caps?.contextWindow ?? 128000;
}

export function getTokensPerMinute(provider: string, model: string): number | undefined {
  return getCapabilities(provider, model)?.tokensPerMinute;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}
