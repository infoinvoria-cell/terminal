// Pure type definitions for discovered models — no imports from other new files.

export type ModelAvailability =
  | "available"
  | "rate_limited"
  | "quota_exhausted"
  | "deprecated"
  | "unavailable"
  | "unknown";

export type ModelPricing = {
  verifiedFree: boolean;
  inputPriceUsdPerMillion: number | null;
  outputPriceUsdPerMillion: number | null;
  source: string | null;
  verifiedAtUtc: string | null;
};

export type ModelCapabilityProfile = {
  text: boolean;
  vision: boolean;
  audioInput: boolean;
  audioOutput: boolean;
  streaming: boolean;
  nativeTools: boolean;
  structuredOutput: boolean;
  reasoning: boolean;
  embeddings: boolean;
  reranking: boolean;
};

export type ModelLimits = {
  contextWindow: number | null;
  maxOutputTokens: number | null;
  requestsPerMinute: number | null;
  requestsPerDay: number | null;
  tokensPerMinute: number | null;
  tokensPerDay: number | null;
};

export type ModelStatusSource =
  | "provider_api"
  | "provider_headers"
  | "official_config"
  | "capability_probe"
  | "unknown";

export type DiscoveredModel = {
  provider: string;
  modelId: string;
  displayName: string;
  availability: ModelAvailability;
  pricing: ModelPricing;
  capabilities: ModelCapabilityProfile;
  limits: ModelLimits;
  statusSource: ModelStatusSource;
  fetchedAtUtc: string;
  expiresAtUtc: string;
};

export type TaskClass =
  | "fast_chat"
  | "strong_general"
  | "reasoning"
  | "coding"
  | "long_context"
  | "vision"
  | "multilingual"
  | "structured_output"
  | "tool_calling"
  | "summarization"
  | "embeddings"
  | "reranking";

export type ModelPool = {
  taskClass: TaskClass;
  models: DiscoveredModel[];
  lastUpdated: string;
};

export type RoutingDecision = {
  taskClass: TaskClass;
  selectedProvider: string;
  selectedModel: string;
  selectionReason: string;
  candidateModels: string[];
  rejectedCandidates: { modelId: string; reason: string }[];
  fallbackChain: string[];
  freeQuotaState: Record<string, "available" | "limited" | "exhausted">;
  capabilityMatch: boolean;
};
