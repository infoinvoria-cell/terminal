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
import { ask, stream as providerStream } from "../providers/provider-router";
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

  // Post-Brain outbound gate: re-classify privacy after Brain injection.
  // Brain context (STATIC_CONTEXT) may contain Capitalife-private terms.
  // Escalate only — never downgrade privacy level after Brain injection.
  let postBrainPrivacy: PrivacyClassification = privacy;
  if (brainUsed && privacy.level !== "LOCAL_ONLY") {
    const systemContent = messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join(" ");
    const reClassified = classifyPrivacy(systemContent);
    if (reClassified.level === "LOCAL_ONLY") {
      postBrainPrivacy = reClassified;
      route = "LOCAL_ONLY"; // credential pattern in Brain content — block external
    } else if (reClassified.level === "REMOTE_REDACTED" && privacy.level === "REMOTE_SAFE") {
      postBrainPrivacy = reClassified;
    }
  }

  const effectivePrivacy = postBrainPrivacy;

  // Prepare messages for external use: sanitize user + system messages when needed.
  const externalMessages = effectivePrivacy.level !== "REMOTE_SAFE"
    ? messages.map((m) => {
        const lastUserIdx = messages.findLastIndex((x) => x.role === "user");
        const isLastUser = m.role === "user" && messages.indexOf(m) === lastUserIdx;
        if (isLastUser) return { ...m, content: getTextForProvider(effectivePrivacy, m.content) };
        if (m.role === "system" && brainUsed) {
          return { ...m, content: getTextForProvider(effectivePrivacy, m.content) };
        }
        return m;
      })
    : messages;

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

    } else if (route === "REASONER_PLUS_CRITIC" && canSendToRemote(privacy)) {
      const ensemble = await runReasonerPlusCritic(externalMessages, req.signal);
      answer = ensemble.synthesized;
      provider = "ensemble";
      agreements = ensemble.agreements;
      disagreements = ensemble.disagreements;
      workers.push(...ensemble.workerRecords);
      totalTokens = ensemble.outputs.reduce((s, o) => s + o.tokensUsed, 0);
      model = ensemble.outputs.map((o) => o.provider).join("+");

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
        inputTokens: Math.ceil((result.tokensUsed ?? 0) * 0.7),
        outputTokens: Math.ceil((result.tokensUsed ?? 0) * 0.3),
        tokenAccounting: "ESTIMATED" as const,
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
  const tokenAccountingType: TokenAccountingType = "ESTIMATED";

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
    synthesisProvider: provider === "ensemble" ? "local-heuristic" : provider as SentinelProviderId,
    totalInputTokens: Math.ceil(totalTokens * 0.7),
    totalOutputTokens: Math.ceil(totalTokens * 0.3),
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
