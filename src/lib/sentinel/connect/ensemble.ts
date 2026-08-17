// Parallel ensemble: runs multiple providers concurrently with distinct roles,
// then consolidates their outputs into one Sentinel answer.
// Free Firewall: only FREE-classified models are eligible for ensemble slots in auto mode.
import { ask } from "../providers/provider-router";
import { getBillingClass } from "./billing-registry";
import type { ChatMessage, SentinelProviderId } from "../providers/types";
import type { WorkerRecord } from "./connect-run";

export type WorkerRole = "analyst" | "skeptic" | "critic" | "synthesizer";

export type WorkerAssignment = {
  provider: SentinelProviderId;
  role: WorkerRole;
  systemSuffix: string;
};

export type WorkerOutput = {
  provider: SentinelProviderId;
  role: WorkerRole;
  answer: string;
  model: string;
  tokensUsed: number;
  latencyMs: number;
  success: boolean;
  error?: string;
};

export type EnsembleResult = {
  outputs: WorkerOutput[];
  agreements: string[];
  disagreements: string[];
  synthesized: string;
  workerRecords: WorkerRecord[];
};

const ROLE_SUFFIXES: Record<WorkerRole, string> = {
  analyst: "\n\n[Deine Rolle: Analyst — gib eine strukturierte, ausgewogene Analyse.]",
  skeptic: "\n\n[Deine Rolle: Skeptiker — hinterfrage Annahmen, benenne Risiken und Gegenargumente.]",
  critic: "\n\n[Deine Rolle: Qualitätsprüfer — prüfe ob Zahlen, Fakten und Logik stimmen. Weise Fehler direkt aus.]",
  synthesizer: "\n\n[Deine Rolle: Synthesizer — fasse die wichtigsten Punkte prägnant zusammen.]",
};

// Configured providers only — gemini/openrouter excluded (API keys not configured).
// Cerebras is FREE-classified; circuit breaker handles 402 quota errors transparently.
const ENSEMBLE_PROVIDERS: SentinelProviderId[] = ["groq", "mistral", "cohere", "cerebras"];

const ENSEMBLE_DEFAULT_MODELS: Partial<Record<SentinelProviderId, string>> = {
  groq: "groq/compound",
  mistral: "mistral-small-latest",
  cohere: "command-r-plus-08-2024",
  cerebras: "gemma-4-31b",
};

function getFreeEnsembleProviders(): SentinelProviderId[] {
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

  return roles.map((role, i) => ({
    provider: freeProviders[i % freeProviders.length]!,
    role,
    systemSuffix: ROLE_SUFFIXES[role],
  }));
}

async function runWorker(
  assignment: WorkerAssignment,
  messages: ChatMessage[],
  signal?: AbortSignal,
): Promise<WorkerOutput> {
  const start = Date.now();
  const augmentedMessages: ChatMessage[] = messages.map((m, i) =>
    i === messages.length - 1 && m.role === "user"
      ? { ...m, content: m.content + assignment.systemSuffix }
      : m,
  );

  try {
    const result = await ask(augmentedMessages, {
      requestedProvider: assignment.provider,
      signal,
    });
    return {
      provider: assignment.provider,
      role: assignment.role,
      answer: result.answer,
      model: result.model,
      tokensUsed: result.tokensUsed ?? 0,
      latencyMs: Date.now() - start,
      success: true,
    };
  } catch (error) {
    return {
      provider: assignment.provider,
      role: assignment.role,
      answer: "",
      model: "unknown",
      tokensUsed: 0,
      latencyMs: Date.now() - start,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function extractAgreements(outputs: WorkerOutput[]): { agreements: string[]; disagreements: string[] } {
  const successful = outputs.filter((o) => o.success);
  if (successful.length < 2) return { agreements: [], disagreements: [] };

  // Very simple heuristic: find short phrases (≤5 words) that appear in ≥2 answers
  const agreements: string[] = [];
  const disagreements: string[] = [];

  // Look for numerical conflicts
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

  // Analyst vs skeptic role comparison
  const analyst = successful.find((o) => o.role === "analyst");
  const skeptic = successful.find((o) => o.role === "skeptic");
  if (analyst && skeptic) {
    const analystPos = /positiv|gut|stark|stark|excellent|good|improves?/i.test(analyst.answer);
    const skepticNeg = /risiko|risk|aber|however|jedoch|caveat|concern/i.test(skeptic.answer);
    if (analystPos && skepticNeg) disagreements.push("Analyst positive / Skeptic cautionary");
    if (!analystPos && !skepticNeg) agreements.push("Both neutral/negative on the question");
  }

  return { agreements, disagreements };
}

function synthesizeLocal(outputs: WorkerOutput[]): string {
  const successful = outputs.filter((o) => o.success);
  if (successful.length === 0) return "Keine Worker-Antwort verfügbar.";
  if (successful.length === 1) return successful[0]!.answer;

  // Find the most substantive answer (longest successful) and use it as base,
  // then append unique critical points from other workers.
  const sorted = [...successful].sort((a, b) => b.answer.length - a.answer.length);
  const primary = sorted[0]!;
  const others = sorted.slice(1);

  const criticalPoints: string[] = [];
  const critic = others.find((o) => o.role === "critic");
  if (critic) {
    // Extract sentences containing risk/error/concern words from critic
    const sentences = critic.answer.split(/[.!?]\s+/);
    for (const s of sentences) {
      if (/risiko|fehler|problem|falsch|incorrect|error|concern|jedoch|aber\s+(?!auch)/i.test(s) && s.length > 20) {
        criticalPoints.push(s.trim());
      }
    }
  }

  const skeptic = others.find((o) => o.role === "skeptic");
  if (skeptic && criticalPoints.length === 0) {
    const sentences = skeptic.answer.split(/[.!?]\s+/);
    for (const s of sentences) {
      if (/risiko|caveat|aber|jedoch|however|concern/i.test(s) && s.length > 20) {
        criticalPoints.push(s.trim());
      }
    }
  }

  if (criticalPoints.length === 0) return primary.answer;

  return `${primary.answer}\n\n**Kritische Punkte:**\n${criticalPoints.map((p) => `- ${p}`).join("\n")}`;
}

export async function runEnsemble(
  messages: ChatMessage[],
  count: 2 | 3 | 4 = 3,
  signal?: AbortSignal,
): Promise<EnsembleResult> {
  const workers = pickWorkers(count);
  const results = await Promise.all(workers.map((w) => runWorker(w, messages, signal)));
  const { agreements, disagreements } = extractAgreements(results);
  const synthesized = synthesizeLocal(results);

  const workerRecords: WorkerRecord[] = results.map((r) => ({
    provider: r.provider,
    model: r.model,
    role: r.role === "analyst" ? "analyst"
      : r.role === "skeptic" ? "skeptic"
      : r.role === "critic" ? "critic"
      : "synthesizer",
    inputTokens: Math.ceil(r.tokensUsed * 0.7),
    outputTokens: Math.ceil(r.tokensUsed * 0.3),
    tokenAccounting: "ESTIMATED" as const, // provider returns total; 70/30 split is estimation
    latencyMs: r.latencyMs,
    success: r.success,
    error: r.error,
  }));

  return { outputs: results, agreements, disagreements, synthesized, workerRecords };
}

export async function runReasonerPlusCritic(
  messages: ChatMessage[],
  signal?: AbortSignal,
): Promise<EnsembleResult> {
  return runEnsemble(messages, 2, signal);
}
