// Model capabilities registry — single source of truth for context windows, output limits, streaming support
import type { SentinelProviderId } from "./types";

export type ModelCapabilities = {
  provider: SentinelProviderId;
  model: string;
  contextWindow: number;
  maxOutputTokens: number;
  supportsStreaming: boolean;
  supportsTools: boolean;
  supportsVision: boolean;
  latencyClass: "fast" | "medium" | "slow";
  qualityClass: "basic" | "balanced" | "strong";
  freeTier: boolean;
};

export const MODEL_REGISTRY: Record<string, ModelCapabilities> = {
  "groq:llama-3.3-70b-versatile": { provider: "groq", model: "llama-3.3-70b-versatile", contextWindow: 128000, maxOutputTokens: 32768, supportsStreaming: true, supportsTools: true, supportsVision: false, latencyClass: "fast", qualityClass: "strong", freeTier: true },
  "groq:llama-3.1-8b-instant": { provider: "groq", model: "llama-3.1-8b-instant", contextWindow: 131072, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: true, supportsVision: false, latencyClass: "fast", qualityClass: "basic", freeTier: true },
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
  return caps?.contextWindow ?? 128000; // conservative default
}

export function getMaxOutputTokens(provider: string, model: string): number {
  const caps = getCapabilities(provider, model);
  return caps?.maxOutputTokens ?? 8192;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}
