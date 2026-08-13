// Token budget manager for Sentinel chat requests
// No external imports — built-in types only

export type OutputProfile = "brief" | "normal" | "detailed" | "deep" | "maximum";

export type SentinelTokenBudget = {
  modelContextWindow: number;
  systemTokens: number;
  userRequestTokens: number;
  recentConversationTokens: number;
  conversationSummaryTokens: number;
  brainTokens: number;
  graphTokens: number;
  documentTokens: number;
  toolResultTokens: number;
  imageTokens: number;
  reservedReasoningTokens: number;
  reservedOutputTokens: number;
  protocolOverheadTokens: number;
  safetyMarginTokens: number;
  totalInputTokens: number;
  remainingTokens: number;
};

export type BudgetAllocationRequest = {
  modelContextWindow: number;
  modelMaxOutputTokens: number;
  profile: OutputProfile;
  systemPromptLength: number;
  userMessageLength: number;
  conversationTurns: number;
  avgTurnLength: number;
  hasBrainContext: boolean;
  hasGraphContext: boolean;
  hasToolResults: boolean;
  hasImages: boolean;
  outputTokenHint?: number;
};

export type ContextCompressionAudit = {
  tokensBeforeDeduplicate: number;
  tokensAfterDeduplicate: number;
  tokensAfterRetrievalFilter: number;
  tokensAfterCompression: number;
  selectedModel: string;
  finalInputTokens: number;
  reservedOutputTokens: number;
  droppedSourceCount: number;
  reasonCodes: string[];
};

// ─── Constants ───────────────────────────────────────────────────────────────

const PROTOCOL_OVERHEAD = 200;
const SAFETY_MARGIN_PERCENT = 0.05;
const REASONING_RESERVE = 0;
const CHARS_PER_TOKEN = 3.5;

const OUTPUT_PROFILE_TOKENS: Record<Exclude<OutputProfile, "maximum">, number> = {
  brief: 1_500,
  normal: 4_000,
  detailed: 8_000,
  deep: 16_000,
};

// ─── Static model lookup ──────────────────────────────────────────────────────

type ModelSpec = { contextWindow: number; maxOutputTokens: number };

const MODEL_SPECS: Record<string, ModelSpec> = {
  "gemini-1.5-flash":        { contextWindow: 1_048_576, maxOutputTokens: 8_192 },
  "gemini-2.0-flash-exp":    { contextWindow: 1_048_576, maxOutputTokens: 8_192 },
  "llama-3.3-70b-versatile": { contextWindow: 131_072,   maxOutputTokens: 32_768 },
  "llama-3.1-8b-instant":    { contextWindow: 131_072,   maxOutputTokens: 8_192 },
  "llama-3.3-70b":           { contextWindow: 128_000,   maxOutputTokens: 8_192 },
  "mistral-small-latest":    { contextWindow: 128_000,   maxOutputTokens: 4_096 },
  "command-r-plus":          { contextWindow: 128_000,   maxOutputTokens: 4_096 },
};

const DEFAULT_MODEL_SPEC: ModelSpec = { contextWindow: 32_768, maxOutputTokens: 4_096 };

function lookupModel(provider: string, model: string): ModelSpec {
  // Cerebras hosts llama-3.3-70b
  const key = provider.toLowerCase() === "cerebras" ? model : model;
  return MODEL_SPECS[key] ?? DEFAULT_MODEL_SPEC;
}

// ─── detectOutputProfile ──────────────────────────────────────────────────────

export function detectOutputProfile(userMessage: string): OutputProfile {
  const msg = userMessage.toLowerCase();

  // Deep indicators: large code blocks or specific task keywords
  const hasCodeBlock = (userMessage.match(/```/g) ?? []).length >= 2;
  if (
    hasCodeBlock ||
    msg.includes("migrate all") ||
    msg.includes("refactor entire") ||
    msg.includes("complete implementation")
  ) {
    return "deep";
  }

  // Detailed indicators
  if (
    msg.includes("ausführlich") ||
    msg.includes("vollständig") ||
    msg.includes("tiefgehend") ||
    msg.includes("gesamte analyse") ||
    msg.includes("comprehensive") ||
    msg.includes("detailed") ||
    msg.includes(" full ") ||
    msg.startsWith("full ") ||
    msg.endsWith(" full") ||
    msg.includes("complete") ||
    msg.includes("thorough") ||
    msg.includes("in depth") ||
    msg.includes("in-depth")
  ) {
    return "detailed";
  }

  // Brief indicators
  if (
    msg.includes("kurz") ||
    msg.includes("brief") ||
    msg.includes("quick") ||
    msg.includes("schnell") ||
    msg.includes("summary")
  ) {
    return "brief";
  }

  // Normal: long message or multiple questions
  const questionCount = (userMessage.match(/\?/g) ?? []).length;
  if (userMessage.length > 500 || questionCount > 1) {
    return "normal";
  }

  return "normal";
}

// ─── calculateTokenBudget ─────────────────────────────────────────────────────

export function calculateTokenBudget(request: BudgetAllocationRequest): SentinelTokenBudget {
  const {
    modelContextWindow,
    modelMaxOutputTokens,
    profile,
    systemPromptLength,
    userMessageLength,
    conversationTurns,
    avgTurnLength,
    hasBrainContext,
    hasGraphContext,
    hasToolResults,
    hasImages,
  } = request;

  // 1. Safety margin
  const safetyMarginTokens = Math.floor(modelContextWindow * SAFETY_MARGIN_PERCENT);

  // 2. Protocol overhead
  const protocolOverheadTokens = PROTOCOL_OVERHEAD;

  // 3. Reserved output tokens
  let reservedOutputTokens: number;
  if (profile === "maximum") {
    reservedOutputTokens = Math.min(modelMaxOutputTokens, Math.floor(modelContextWindow * 0.4));
  } else {
    reservedOutputTokens = OUTPUT_PROFILE_TOKENS[profile];
  }
  // Honour explicit user hint
  if (request.outputTokenHint != null) {
    reservedOutputTokens = request.outputTokenHint;
  }
  reservedOutputTokens = Math.max(512, Math.min(reservedOutputTokens, modelMaxOutputTokens));

  // Reserved reasoning (0 by default)
  const reservedReasoningTokens = REASONING_RESERVE;

  // 4. Total fixed
  const totalFixed = safetyMarginTokens + protocolOverheadTokens + reservedOutputTokens + reservedReasoningTokens;

  // 5. Available input
  const availableInput = Math.max(0, modelContextWindow - totalFixed);

  // 6. System tokens
  const systemTokens = Math.min(
    Math.ceil(systemPromptLength / CHARS_PER_TOKEN),
    Math.floor(availableInput * 0.35),
  );

  // 7. User request tokens
  const userRequestTokens = Math.min(
    Math.ceil(userMessageLength / CHARS_PER_TOKEN),
    Math.floor(availableInput * 0.20),
  );

  // 8. Remaining after system + user
  const remaining1 = availableInput - systemTokens - userRequestTokens;

  // 9. Recent conversation tokens
  const recentConversationTokens = Math.min(
    conversationTurns * Math.ceil(avgTurnLength / CHARS_PER_TOKEN),
    Math.floor(remaining1 * 0.30),
  );

  // 10. Remaining after conversation
  const remaining2 = remaining1 - recentConversationTokens;

  // 11–15. Context source allocations
  const brainTokens    = hasBrainContext  ? Math.min(Math.floor(remaining2 * 0.35), 8_000) : 0;
  const graphTokens    = hasGraphContext  ? Math.min(Math.floor(remaining2 * 0.15), 3_000) : 0;
  const toolResultTokens = hasToolResults ? Math.min(Math.floor(remaining2 * 0.15), 4_000) : 0;
  const documentTokens =                   Math.min(Math.floor(remaining2 * 0.20), 6_000);
  const imageTokens    = hasImages        ? Math.min(Math.floor(remaining2 * 0.10), 2_000) : 0;

  // 16. Conversation summary absorbs the leftover
  const conversationSummaryTokens = Math.max(
    0,
    remaining2 - brainTokens - graphTokens - toolResultTokens - documentTokens - imageTokens,
  );

  // 17. Total input
  const totalInputTokens =
    systemTokens +
    userRequestTokens +
    recentConversationTokens +
    brainTokens +
    graphTokens +
    toolResultTokens +
    documentTokens +
    imageTokens +
    conversationSummaryTokens;

  // 18. Remaining
  const remainingTokens =
    modelContextWindow -
    totalInputTokens -
    reservedOutputTokens -
    safetyMarginTokens -
    protocolOverheadTokens;

  return {
    modelContextWindow,
    systemTokens,
    userRequestTokens,
    recentConversationTokens,
    conversationSummaryTokens,
    brainTokens,
    graphTokens,
    documentTokens,
    toolResultTokens,
    imageTokens,
    reservedReasoningTokens,
    reservedOutputTokens,
    protocolOverheadTokens,
    safetyMarginTokens,
    totalInputTokens,
    remainingTokens,
  };
}

// ─── getOutputBudgetForModel ──────────────────────────────────────────────────

export function getOutputBudgetForModel(
  provider: string,
  model: string,
  profile: OutputProfile,
  inputTokens: number,
): number {
  const spec = lookupModel(provider, model);
  const { contextWindow, maxOutputTokens } = spec;

  let reservedOutput: number;
  if (profile === "maximum") {
    reservedOutput = Math.min(maxOutputTokens, Math.floor(contextWindow * 0.4));
  } else {
    reservedOutput = OUTPUT_PROFILE_TOKENS[profile];
  }
  reservedOutput = Math.max(512, Math.min(reservedOutput, maxOutputTokens));

  const safetyMargin = Math.floor(contextWindow * SAFETY_MARGIN_PERCENT);
  const remaining = contextWindow - inputTokens - PROTOCOL_OVERHEAD - safetyMargin - reservedOutput;

  return Math.max(512, Math.min(reservedOutput, remaining > 0 ? reservedOutput : 512));
}
