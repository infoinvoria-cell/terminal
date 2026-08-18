// Sentinel Connect: main orchestration entry point.
// Sits above the existing provider-router, adding:
//   - privacy classification (LOCAL_ONLY / REMOTE_REDACTED / REMOTE_SAFE)
//   - local intent/complexity routing decision
//   - Brain retrieval (always first for Capitalife questions)
//   - parallel ensemble / critic modes
//   - ConnectRun provenance tracking
import { routeLocally } from "./local-router";
import { classifyPrivacy, canSendToRemote, getTextForProvider } from "./privacy-classifier";
import { runEnsemble, runReasonerPlusCritic } from "./ensemble";
import { generateRunId, persistRun } from "./connect-run";
import { getCapalifeContextBudgeted } from "../capitalife-context";
import { getGraphContext } from "../graphify-retrieval";
import { dispatchReadOnlyTool } from "../tools/tool-router";
import { ask, stream as providerStream, SENTINEL_SYSTEM_PROMPT } from "../providers/provider-router";
import { buildOutboundContext } from "./outbound-inspector";
import type { ChatMessage, SentinelProviderId } from "../providers/types";
import type { WorkerRecord, ConnectRun, TokenAccountingType } from "./connect-run";
import type { PrivacyLevel, PrivacyClassification } from "./privacy-classifier";
import type { ConnectRoutingMode, ConnectMode } from "./connect-types";

export type { ConnectRoutingMode, ConnectMode };

export const QUOTA_RESERVE_RATIO = 0.20;

export type ConnectRequest = {
  messages: ChatMessage[];
  mode?: ConnectMode;
  signal?: AbortSignal;
};

export type ConnectResult = {
  answer: string;
  provider: SentinelProviderId | "ensemble" | "local";
  model: string;
  runId: string;
  privacy: PrivacyLevel;
  route: ConnectRoutingMode;
  brainUsed: boolean;
  graphifyUsed: boolean;
  toolUsed: string | null;
  toolSource: string | null;
  workers: WorkerRecord[];
  agreements: string[];
  disagreements: string[];
  latencyMs: number;
  totalTokens: number;
  fallbackUsed: boolean;
};

export type ConnectStreamResult = {
  stream: ReadableStream<Uint8Array>;
  provider: SentinelProviderId;
  runId: string;
  privacy: PrivacyLevel;
  route: ConnectRoutingMode;
  brainUsed: boolean;
};

/**
 * Strip Brain section from a system message before sending externally.
 * Brain markers are injected by injectBrainContext() as `\n\n## CAPITALIFE...` or `\n\n### CAPITALIFE...`.
 * This function removes everything from that marker onwards, leaving only the base SENTINEL_SYSTEM_PROMPT.
 * Exported for deterministic unit testing of the Brain outbound privacy guarantee.
 */
export function stripBrainFromSystemMessage(systemContent: string): string {
  const brainStart = systemContent.search(/\n\n(?:##|###)\s*CAPITALIFE/);
  return brainStart > 0 ? systemContent.slice(0, brainStart).trimEnd() : systemContent;
}

function injectBrainContext(messages: ChatMessage[], brainContext: string): ChatMessage[] {
  if (!messages.some((m) => m.role === "system")) return messages;
  return messages.map((m) => {
    if (m.role !== "system") return m;
    if (m.content.includes("CAPITALIFE BRAIN") || m.content.includes("CAPITALIFE KONTEXT")) return m;
    return { ...m, content: `${m.content}\n\n${brainContext}` };
  });
}

function extractBrainSources(context: string): string[] {
  const matches = context.match(/### ([^\n]+)/g) ?? [];
  return matches.map((m) => m.slice(4).trim());
}

export async function connectChat(req: ConnectRequest): Promise<ConnectResult> {
  const start = Date.now();
  const runId = generateRunId();
  const lastUser = req.messages.findLast((m) => m.role === "user")?.content ?? "";

  // 1. Privacy classification
  const privacy = classifyPrivacy(lastUser, { forceLocal: req.mode === "local" });

  // 2. Local routing decision
  const decision = await routeLocally(lastUser, req.mode === "local");

  let route: ConnectRoutingMode = decision.suggestedMode;
  if (req.mode === "local") route = "LOCAL_ONLY";
  if (req.mode === "deep" && route === "SINGLE_BEST") route = "PARALLEL_ENSEMBLE";

  // 3. Brain retrieval first — before any external LLM
  let messages = [...req.messages];
  let brainUsed = false;
  let graphifyUsed = false;
  const brainSources: string[] = [];

  // Ensure a system message exists before Brain injection.
  // injectBrainContext() is a no-op without one; withSystemPrompt() in ask() would otherwise
  // inject the full (unbudgeted) Brain context — causing Groq 413 (8K TPM exceeded).
  if (!messages.some((m) => m.role === "system")) {
    messages = [{ role: "system", content: SENTINEL_SYSTEM_PROMPT }, ...messages];
  }

  if (decision.requiresBrain || route !== "LOCAL_ONLY") {
    try {
      const brainContext = getCapalifeContextBudgeted(3000);
      if (brainContext && brainContext.length > 50) {
        messages = injectBrainContext(messages, brainContext);
        brainSources.push(...extractBrainSources(brainContext));
        brainUsed = true;
      }
    } catch { /* Brain unavailable — continue without */ }
  }

  if (decision.requiresGraphify) {
    try {
      const graphCtx = getGraphContext(lastUser, 1000);
      if (graphCtx && !graphCtx.includes("Keine Treffer")) {
        const idx = messages.findLastIndex((m) => m.role === "user");
        if (idx >= 0) {
          messages[idx] = { ...messages[idx]!, content: `${messages[idx]!.content}\n\n${graphCtx}` };
        }
        graphifyUsed = true;
      }
    } catch { /* Graphify unavailable */ }
  }

  // Build externalMessages: Brain is LOCAL ONLY — strip it from system message before any outbound check.
  // External providers (Groq, Mistral, etc.) receive base SENTINEL_SYSTEM_PROMPT + user question only.
  // Brain vault data (which may contain sensitive local paths/data) NEVER leaves this machine.
  // User content is sanitized per privacy level (removes account numbers, emails, etc.).
  const externalMessages = messages.map((m) => {
    const lastUserIdx = messages.findLastIndex((x) => x.role === "user");
    const isLastUser = m.role === "user" && messages.indexOf(m) === lastUserIdx;
    if (isLastUser) return { ...m, content: getTextForProvider(privacy, m.content) };
    if (m.role === "system" && brainUsed) {
      // Strip Brain section — Brain markers added by injectBrainContext() start with \n\n## CAPITALIFE
      const brainStart = m.content.search(/\n\n(?:##|###)\s*CAPITALIFE/);
      const clean = brainStart > 0 ? m.content.slice(0, brainStart).trimEnd() : m.content;
      return { ...m, content: clean };
    }
    return m;
  });

  // Post-Brain outbound gate: re-classify privacy on what will actually be sent externally.
  // Checks externalMessages only (Brain already stripped), never the full local messages.
  // Escalate only — never downgrade. Route override to LOCAL_ONLY only when outbound content is unsafe.
  let postBrainPrivacy: PrivacyClassification = privacy;
  if (brainUsed && privacy.level !== "LOCAL_ONLY") {
    const externalSystemContent = externalMessages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join(" ");
    const reClassified = classifyPrivacy(externalSystemContent);
    if (reClassified.level === "LOCAL_ONLY") {
      postBrainPrivacy = reClassified;
      route = "LOCAL_ONLY"; // base system prompt still contains a credential — block external
    } else if (reClassified.level === "REMOTE_REDACTED" && privacy.level === "REMOTE_SAFE") {
      postBrainPrivacy = reClassified;
    }
  }

  const effectivePrivacy = postBrainPrivacy;

  // 3b. Bounded, single-shot, read-only product-tool dispatch.
  // Server decides deterministically from the user's own text (keyword match) —
  // the model is never given a function-calling surface, so there is no tool
  // name or permission for a hostile prompt to hijack. Executes at most one
  // tool per request; no loop, no recursion.
  //
  // Appended AFTER the privacy/redaction pipeline (not before, like Graphify)
  // because getTextForProvider() returns a pre-computed REMOTE_REDACTED
  // sanitizedText that ignores later edits to the raw message content —
  // injecting earlier would silently vanish for any redacted request. The
  // tool's own output is already sanitized (no absolute paths/secrets — see
  // tool-router.ts), so appending it post-redaction is safe and doesn't
  // require touching the redaction logic itself.
  let toolUsed: string | null = null;
  let toolSource: string | null = null;
  try {
    const toolResult = dispatchReadOnlyTool(lastUser);
    if (toolResult) {
      toolUsed = toolResult.toolId;
      toolSource = toolResult.source;
      const localIdx = messages.findLastIndex((m) => m.role === "user");
      if (localIdx >= 0) {
        messages[localIdx] = { ...messages[localIdx]!, content: `${messages[localIdx]!.content}\n\n${toolResult.resultText}` };
      }
      const externalIdx = externalMessages.findLastIndex((m) => m.role === "user");
      if (externalIdx >= 0) {
        externalMessages[externalIdx] = { ...externalMessages[externalIdx]!, content: `${externalMessages[externalIdx]!.content}\n\n${toolResult.resultText}` };
      }
    }
  } catch { /* tool execution failure — continue without; chat must stay alive */ }

  // Build outbound context for debugging (never returned to client)
  const _outboundCtx = buildOutboundContext(messages, effectivePrivacy, {
    brainInjected: brainUsed,
    brainChars: brainUsed ? (messages.find((m) => m.role === "system")?.content.length ?? 0) : 0,
    graphifyInjected: graphifyUsed,
  });

  const workers: WorkerRecord[] = [];
  let agreements: string[] = [];
  let disagreements: string[] = [];
  let answer = "";
  let provider: SentinelProviderId | "ensemble" | "local" = "local";
  let model = "local";
  let totalTokens = 0;
  let fallbackUsed = false;
  let synthesisBackend: "qwen" | "heuristic" = "heuristic";
  let synthesisModel = "none";
  let synthesisLatencyMs = 0;

  try {
    if (route === "PARALLEL_ENSEMBLE" && canSendToRemote(privacy)) {
      const count = req.mode === "deep" ? 4 : 3;
      const ensemble = await runEnsemble(externalMessages, count as 2 | 3 | 4, req.signal);
      answer = ensemble.synthesized;
      provider = "ensemble";
      agreements = ensemble.agreements;
      disagreements = ensemble.disagreements;
      workers.push(...ensemble.workerRecords);
      totalTokens = ensemble.outputs.reduce((s, o) => s + o.tokensUsed, 0);
      model = ensemble.outputs.map((o) => o.provider).join("+");
      synthesisBackend = ensemble.synthesisResult.backend;
      synthesisModel = ensemble.synthesisResult.model;
      synthesisLatencyMs = ensemble.synthesisResult.latencyMs;

    } else if (route === "REASONER_PLUS_CRITIC" && canSendToRemote(privacy)) {
      const ensemble = await runReasonerPlusCritic(externalMessages, req.signal);
      answer = ensemble.synthesized;
      provider = "ensemble";
      agreements = ensemble.agreements;
      disagreements = ensemble.disagreements;
      workers.push(...ensemble.workerRecords);
      totalTokens = ensemble.outputs.reduce((s, o) => s + o.tokensUsed, 0);
      model = ensemble.outputs.map((o) => o.provider).join("+");
      synthesisBackend = ensemble.synthesisResult.backend;
      synthesisModel = ensemble.synthesisResult.model;
      synthesisLatencyMs = ensemble.synthesisResult.latencyMs;

    } else {
      const useMessages = privacy.level === "LOCAL_ONLY" ? messages : externalMessages;
      const profile = route === "LOCAL_ONLY" ? "privacy_local" : "auto_balanced";

      const result = await ask(useMessages, { profile, signal: req.signal });
      answer = result.answer;
      provider = result.provider;
      model = result.model;
      totalTokens = result.tokensUsed ?? 0;
      fallbackUsed = result.fallbackUsed ?? false;
      workers.push({
        provider: result.provider,
        model: result.model,
        role: "primary",
        inputTokens: result.hasRealCounts && result.inputTokens !== undefined ? result.inputTokens : Math.ceil((result.tokensUsed ?? 0) * 0.7),
        outputTokens: result.hasRealCounts && result.outputTokens !== undefined ? result.outputTokens : Math.ceil((result.tokensUsed ?? 0) * 0.3),
        tokenAccounting: result.hasRealCounts ? ("OBSERVED" as const) : ("ESTIMATED" as const),
        latencyMs: Date.now() - start,
        success: true,
      });
    }
  } catch {
    try {
      const fallback = await ask(messages, { profile: "privacy_local", signal: req.signal });
      answer = fallback.answer;
      provider = fallback.provider;
      model = fallback.model;
      fallbackUsed = true;
      route = "FALLBACK_CHAIN";
    } catch {
      answer = "Sentinel Connect: Kein Provider verfügbar. Bitte prüfe Netzwerk und API-Keys.";
      fallbackUsed = true;
      route = "FALLBACK_CHAIN";
    }
  }

  const latencyMs = Date.now() - start;
  const allObserved = workers.length > 0 && workers.every((w) => w.tokenAccounting === "OBSERVED");
  const tokenAccountingType: TokenAccountingType = allObserved ? "OBSERVED" : "ESTIMATED";
  const totalIn = allObserved ? workers.reduce((s, w) => s + (w.inputTokens ?? 0), 0) : Math.ceil(totalTokens * 0.7);
  const totalOut = allObserved ? workers.reduce((s, w) => s + (w.outputTokens ?? 0), 0) : Math.ceil(totalTokens * 0.3);

  const run: ConnectRun = {
    id: runId,
    timestamp: new Date().toISOString(),
    requestPreview: lastUser.slice(0, 80),
    privacyLevel: privacy.level,
    postBrainPrivacyLevel: postBrainPrivacy.level,
    route,
    brainSources,
    graphifyHit: graphifyUsed,
    workers,
    synthesisProvider: provider === "ensemble" ? (synthesisBackend === "qwen" ? "local" : "local-heuristic") : provider as SentinelProviderId,
    synthesisBackend,
    synthesisModel,
    synthesisLatencyMs,
    totalInputTokens: totalIn,
    totalOutputTokens: totalOut,
    tokenAccounting: tokenAccountingType,
    totalLatencyMs: latencyMs,
    status: fallbackUsed ? "fallback" : "success",
  };
  persistRun(run);

  return {
    answer,
    provider,
    model,
    runId,
    privacy: privacy.level,
    route,
    brainUsed,
    graphifyUsed,
    toolUsed,
    toolSource,
    workers,
    agreements,
    disagreements,
    latencyMs,
    totalTokens,
    fallbackUsed,
  };
}

export async function connectStream(req: ConnectRequest): Promise<ConnectStreamResult> {
  const runId = generateRunId();
  const lastUser = req.messages.findLast((m) => m.role === "user")?.content ?? "";

  const privacy = classifyPrivacy(lastUser, { forceLocal: req.mode === "local" });
  const decision = await routeLocally(lastUser, req.mode === "local");

  let route: ConnectRoutingMode = decision.suggestedMode;
  if (req.mode === "local") route = "LOCAL_ONLY";

  let messages = [...req.messages];
  let brainUsed = false;

  if (!messages.some((m) => m.role === "system")) {
    messages = [{ role: "system", content: SENTINEL_SYSTEM_PROMPT }, ...messages];
  }

  if (decision.requiresBrain || route !== "LOCAL_ONLY") {
    try {
      const brainContext = getCapalifeContextBudgeted(3000);
      if (brainContext && brainContext.length > 50) {
        messages = injectBrainContext(messages, brainContext);
        brainUsed = true;
      }
    } catch { /* Brain unavailable */ }
  }

  const profile = route === "LOCAL_ONLY" ? "privacy_local" : "auto_balanced";

  try {
    const result = await providerStream(messages, { profile, signal: req.signal });
    return { stream: result.stream, provider: result.provider, runId, privacy: privacy.level, route, brainUsed };
  } catch {
    const fallback = await providerStream(messages, { profile: "privacy_local", signal: req.signal });
    return { stream: fallback.stream, provider: fallback.provider, runId, privacy: privacy.level, route: "FALLBACK_CHAIN", brainUsed };
  }
}
