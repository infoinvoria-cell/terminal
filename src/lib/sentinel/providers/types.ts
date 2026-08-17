export type MessageRole = "system" | "user" | "assistant";

export type SentinelProviderType = "local" | "anthropic" | "custom";
export type SentinelProviderId = "local" | "ollama" | "groq" | "cerebras" | "mistral" | "cohere" | "anthropic" | "custom" | "openrouter" | "gemini" | "github-models" | "cloudflare" | "huggingface";
export type SentinelRouterMode = "auto" | "local" | "ollama" | "groq" | "cerebras" | "mistral" | "cohere" | "anthropic" | "custom" | "openrouter" | "gemini" | "github-models" | "cloudflare" | "huggingface";
export type ProviderAvailabilityReason =
  | "ready"
  | "key_missing"
  | "endpoint_missing"
  | "offline"
  | "brain_missing"
  | "disabled"
  | "partner_mode"
  | "not_configured"
  | "error";

export type ChatMessage = {
  role: MessageRole;
  content: string;
};

export type ChatResult = {
  answer: string;
  model: string;
  provider: SentinelProviderId;
  fallbackUsed?: boolean;
  tokensUsed?: number;
  /** Set when provider returns real per-direction counts (not estimated). */
  inputTokens?: number;
  outputTokens?: number;
  hasRealCounts?: boolean;
};

export type ProviderHealth = {
  configured: boolean;
  available: boolean;
  usable: boolean;
  enabled: boolean;
  reason: ProviderAvailabilityReason;
  message: string;
  model: string | null;
  models: string[];
  supportsStreaming: boolean;
};

export type ProviderStatus = {
  id: SentinelProviderId;
  label: string;
  type: SentinelProviderType;
  configured: boolean;
  enabled: boolean;
  available: boolean;
  usable: boolean;
  reason: ProviderAvailabilityReason;
  message: string;
  model: string | null;
  supportsStreaming: boolean;
  active: boolean;
};

export type SentinelChatArgs = {
  messages: ChatMessage[];
  model?: string;
  category?: "general" | "coding" | "reasoning";
  signal?: AbortSignal;
};

export type SentinelStreamChunk = {
  content: string;
};

export interface SentinelProvider {
  readonly id: SentinelProviderId;
  readonly label: string;
  readonly type: SentinelProviderType;
  readonly supportsStreaming: boolean;
  healthCheck(): Promise<ProviderHealth>;
  sendMessage(args: SentinelChatArgs): Promise<ChatResult>;
  streamMessage?(args: SentinelChatArgs): Promise<ReadableStream<Uint8Array>>;
}
