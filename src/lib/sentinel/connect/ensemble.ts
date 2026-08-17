// Parallel ensemble: runs multiple providers concurrently with distinct roles,
// then consolidates their outputs into one Sentinel answer via Qwen (primary) or heuristic (fallback).
// Free Firewall: only FREE-classified models are eligible for ensemble slots in auto mode.
// Context budget: each worker's messages are trimmed to fit the model's safe input window.
import { ask } from "../providers/provider-router";
import { getBillingClass } from "./billing-registry";
import { getSafePromptBudget, getMaxOutputTokens, estimateTokens } from "../providers/model-capabilities";
import { synthesizeWorkerOutputs } from "./qwen-synthesizer";
import { reserveCapacity, reconcileUsage } from "./provider-rate-guard";
import type { ChatMessage, SentinelProviderId } from "../providers/types";
import type { WorkerRecord } from "./connect-run";
import type { SynthesisResult } from "./qwen-synthesizer";

export type WorkerRole = "analyst" | "skeptic" | "critic" | "synthesizer";

export type WorkerAssignment = {
  provider: SentinelProviderId;
  model: string;
  role: WorkerRole;
  systemSuffix: string;
};

export type WorkerOutput = {
  provider: SentinelProviderId;
  role: WorkerRole;
  answer: string;
  model: string;
  tokensUsed: number;
  inputTokens?: number;
  outputTokens?: number;
  hasRealCounts?: boolean;
  latencyMs: number;
  success: boolean;
  error?: string;
};

export type EnsembleResult = {
  outputs: WorkerOutput[];
  agreements: string[];
  disagreements: string[];
  synthesized: string;
  synthesisResult: SynthesisResult;
  workerRecords: WorkerRecord[];
};

const ROLE_SUFFIXES: Record<WorkerRole, string> = {
  analyst: "\n\n[Deine Rolle: Analyst — gib eine strukturierte, ausgewogene Analyse.]",
  skeptic: "\n\n[Deine Rolle: Skeptiker — hinterfrage Annahmen, benenne Risiken und Gegenargumente.]",
  critic: "\n\n[Deine Rolle: Qualitätsprüfer — prüfe ob Zahlen, Fakten und Logik stimmen. Weise Fehler direkt aus.]",
  synthesizer: "\n\n[Deine Rolle: Synthesizer — fasse die wichtigsten Punkte prägnant zusammen.]",
};

// Groq compound (openai/gpt-oss-120b): 8K TPM — registered in MODEL_REGISTRY so budget trimmer uses correct window.
// Context trimmer will reduce Brain context to fit within safe input budget before calling the provider.
const ENSEMBLE_PROVIDERS: SentinelProviderId[] = ["groq", "mistral", "cohere", "cerebras"];

const ENSEMBLE_DEFAULT_MODELS: Partial<Record<SentinelProviderId, string>> = {
  groq: "openai/gpt-oss-120b",   // actual model served by Groq on this account (compound alias)
  mistral: "mistral-small-latest",
  cohere: "command-r-plus-08-2024",
  cerebras: "gemma-4-31b",
};

// System overhead reserved on top of output tokens (prompt structure, formatting)
const SYSTEM_OVERHEAD_TOKENS = 300;
const SAFETY_MARGIN_TOKENS = 400;

/**
 * Trim messages to fit within the provider/model's safe prompt budget.
 * Uses getSafePromptBudget() — for models with a known TPM rate limit (e.g. Groq compound),
 * this is the TPM-derived safePromptBudgetTokens, NOT the full contextWindow.
 * contextWindow and TPM are separate: trimming uses the operational budget only.
 */
function trimToContextBudget(messages: ChatMessage[], provider: string, model: string): ChatMessage[] {
  const promptBudget = getSafePromptBudget(provider, model);
  const reservedOutput = Math.min(getMaxOutputTokens(provider, model), 1024);
  const maxInputTokens = promptBudget - reservedOutput - SYSTEM_OVERHEAD_TOKENS - SAFETY_MARGIN_TOKENS;

  const currentTokens = estimateTokens(JSON.stringify(messages));
  if (currentTokens <= maxInputTokens) return messages;

  const overage = currentTokens - maxInputTokens;

  // Strategy: shorten system message Brain context first (it's the largest injected block).
  // The Brain context was appended with \n\n at the end of the system message.
  // We trim that section proportionally, keeping base system prompt intact.
  const result = messages.map((m) => {
    if (m.role !== "system") return m;

    const brainMarker = m.content.lastIndexOf("\n\n###");
    if (brainMarker === -1) return m;

    const baseSystem = m.content.slice(0, brainMarker);
    const brainSection = m.content.slice(brainMarker);
    const brainTokens = estimateTokens(brainSection);
    if (brainTokens <= overage * 1.2) {
      // Drop entire Brain section
      return { ...m, content: baseSystem + "\n\n[Brain context omitted — context budget]" };
    }
    // Trim Brain section to fit
    const keepChars = Math.max(200, brainSection.length - Math.ceil(overage * 3.5 * 1.2));
    return { ...m, content: baseSystem + brainSection.slice(0, keepChars) + "\n...[trimmed]" };
  });

  // If still over after system trim, drop oldest history (keep system + last 2 turns)
  const trimmedTokens = estimateTokens(JSON.stringify(result));
  if (trimmedTokens > maxInputTokens) {
    const system = result.filter((m) => m.role === "system");
    const nonSystem = result.filter((m) => m.role !== "system");
    const keep = nonSystem.slice(-2); // keep last user+assistant pair
    return [...system, ...keep];
  }
  return result;
}

export function getFreeEnsembleProviders(): SentinelProviderId[] {
  return ENSEMBLE_PROVIDERS.filter((p) => {
    const model = ENSEMBLE_DEFAULT_MODELS[p] ?? "";
    return getBillingClass(p, model) === "FREE";
  });
}

function pickWorkers(count: 2 | 3 | 4): WorkerAssignment[] {
  const roles: WorkerRole[] = count === 2
    ? ["analyst", "critic"]
    : count === 3
    ? ["analyst", "skeptic", "critic"]
    : ["analyst", "skeptic", "critic", "synthesizer"];

  const freeProviders = getFreeEnsembleProviders();
  if (freeProviders.length === 0) freeProviders.push("groq" as SentinelProviderId);

  return roles.map((role, i) => {
    const provider = freeProviders[i % freeProviders.length]!;
    const model = ENSEMBLE_DEFAULT_MODELS[provider] ?? "auto";
    return { provider, model, role, systemSuffix: ROLE_SUFFIXES[role] };
  });
}

async function runWorker(
  assignment: WorkerAssignment,
  messages: ChatMessage[],
  signal?: AbortSignal,
): Promise<WorkerOutput> {
  const start = Date.now();

  // Trim to context budget before calling provider
  const budgetedMessages = trimToContextBudget(messages, assignment.provider, assignment.model);

  const augmentedMessages: ChatMessage[] = budgetedMessages.map((m, i) =>
    i === budgetedMessages.length - 1 && m.role === "user"
      ? { ...m, content: m.content + assignment.systemSuffix }
      : m,
  );

  // TPM aggregate rate-limit guard — synchronous reservation, atomic across concurrent workers.
  // reserveCapacity() has no await, so all concurrent workers in Promise.all() reserve before any
  // HTTP call is made. This prevents two workers from both assuming the full remaining TPM budget.
  const estimatedInput = estimateTokens(JSON.stringify(augmentedMessages));
  const estimatedOutput = Math.min(getMaxOutputTokens(assignment.provider, assignment.model), 1024);
  const hasCapacity = reserveCapacity(assignment.provider, estimatedInput, estimatedOutput);

  if (!hasCapacity) {
    return {
      provider: assignment.provider,
      role: assignment.role,
      answer: "",
      model: assignment.model,
      tokensUsed: 0,
      latencyMs: Date.now() - start,
      success: false,
      error: `rate-limit-guard: estimated ${estimatedInput + estimatedOutput} tokens would exceed ${assignment.provider} TPM budget for this minute`,
    };
  }

  async function attempt(msgs: ChatMessage[]): Promise<WorkerOutput> {
    const result = await ask(msgs, {
      requestedProvider: assignment.provider,
      signal,
    });
    // Reconcile: replace the reserved estimate with actual observed token counts
    reconcileUsage(assignment.provider, estimatedInput + estimatedOutput, result.inputTokens, result.outputTokens);
    return {
      provider: assignment.provider,
      role: assignment.role,
      answer: result.answer,
      model: result.model,
      tokensUsed: result.tokensUsed ?? 0,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      hasRealCounts: result.hasRealCounts,
      latencyMs: Date.now() - start,
      success: true,
    };
  }

  try {
    return await attempt(augmentedMessages);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    // 413 one-time retry: trim context to ~60% of original and retry once
    if (msg.includes("413")) {
      try {
        const hardTrimmed = budgetedMessages.map((m) => {
          if (m.role !== "system") return m;
          return { ...m, content: m.content.slice(0, Math.ceil(m.content.length * 0.6)) + "\n...[retry trim]" };
        });
        const reAugmented: ChatMessage[] = hardTrimmed.map((m, i) =>
          i === hardTrimmed.length - 1 && m.role === "user"
            ? { ...m, content: m.content + assignment.systemSuffix }
            : m,
        );
        return await attempt(reAugmented);
      } catch (retryError) {
        const retryMsg = retryError instanceof Error ? retryError.message : String(retryError);
        return { provider: assignment.provider, role: assignment.role, answer: "", model: "unknown", tokensUsed: 0, latencyMs: Date.now() - start, success: false, error: `413-retry-failed: ${retryMsg}` };
      }
    }
    return { provider: assignment.provider, role: assignment.role, answer: "", model: "unknown", tokensUsed: 0, latencyMs: Date.now() - start, success: false, error: msg };
  }
}

function extractAgreements(outputs: WorkerOutput[]): { agreements: string[]; disagreements: string[] } {
  const successful = outputs.filter((o) => o.success);
  if (successful.length < 2) return { agreements: [], disagreements: [] };

  const agreements: string[] = [];
  const disagreements: string[] = [];

  const numbers = successful.map((o) => {
    const matches = o.answer.match(/\b\d+[\.,]?\d*\s*%/g) ?? [];
    return new Set<string>(matches);
  });

  if (numbers.length >= 2) {
    const allNums: string[] = [...new Set<string>([...numbers].flatMap((s) => [...s]))];
    for (const num of allNums) {
      const count = numbers.filter((s) => s.has(num)).length;
      if (count >= 2) agreements.push(`Consistent figure: ${num}`);
      else if (count === 1) disagreements.push(`Disputed: ${num}`);
    }
  }

  const analyst = successful.find((o) => o.role === "analyst");
  const skeptic = successful.find((o) => o.role === "skeptic");
  if (analyst && skeptic) {
    const analystPos = /positiv|gut|stark|excellent|good|improves?/i.test(analyst.answer);
    const skepticNeg = /risiko|risk|aber|however|jedoch|caveat|concern/i.test(skeptic.answer);
    if (analystPos && skepticNeg) disagreements.push("Analyst positive / Skeptic cautionary");
    if (!analystPos && !skepticNeg) agreements.push("Both neutral/negative on the question");
  }

  return { agreements, disagreements };
}

export async function runEnsemble(
  messages: ChatMessage[],
  count: 2 | 3 | 4 = 3,
  signal?: AbortSignal,
): Promise<EnsembleResult> {
  const workers = pickWorkers(count);
  const results = await Promise.all(workers.map((w) => runWorker(w, messages, signal)));
  const { agreements, disagreements } = extractAgreements(results);

  const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const synthResult = await synthesizeWorkerOutputs(results, lastUser);

  const workerRecords: WorkerRecord[] = results.map((r) => ({
    provider: r.provider,
    model: r.model,
    role: r.role === "analyst" ? "analyst"
      : r.role === "skeptic" ? "skeptic"
      : r.role === "critic" ? "critic"
      : "synthesizer",
    inputTokens: r.hasRealCounts && r.inputTokens !== undefined ? r.inputTokens : Math.ceil(r.tokensUsed * 0.7),
    outputTokens: r.hasRealCounts && r.outputTokens !== undefined ? r.outputTokens : Math.ceil(r.tokensUsed * 0.3),
    tokenAccounting: r.hasRealCounts ? ("OBSERVED" as const) : ("ESTIMATED" as const),
    latencyMs: r.latencyMs,
    success: r.success,
    error: r.error,
  }));

  return { outputs: results, agreements, disagreements, synthesized: synthResult.answer, synthesisResult: synthResult, workerRecords };
}

export async function runReasonerPlusCritic(
  messages: ChatMessage[],
  signal?: AbortSignal,
): Promise<EnsembleResult> {
  return runEnsemble(messages, 2, signal);
}
