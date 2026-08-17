// Local router: Layer 0 (deterministic heuristic) + Layer 1 (Qwen3 classifier).
// Layer 0 handles obvious LOCAL_ONLY, credentials, and tool-first cases (<5ms).
// Layer 1 (Qwen3:1.7b via Ollama) classifies ambiguous cases (~1-2s warm).
// Falls back to Layer 0 heuristic when Qwen is offline, slow, or returns invalid JSON.
import { classifyTask } from "../routing/task-classifier";
import { detectToolFirstOpportunity } from "../routing/tool-first-detector";
import { queryGraph } from "../graphify-retrieval";
import type { ConnectRoutingMode } from "./connect-types";
import { qwenRoute } from "./qwen-router";

export type LocalRouterDecision = {
  intent: string;
  complexity: "trivial" | "simple" | "normal" | "complex" | "deep";
  requiresBrain: boolean;
  requiresTools: boolean;
  requiresGraphify: boolean;
  suggestedMode: ConnectRoutingMode;
  parallelism: 1 | 2 | 3 | 4;
  synthesisMode: "single" | "local" | "remote";
  estimatedTokens: number;
  latencyMs: number;
  source: "heuristic" | "qwen";
};

// Complexity indicators
const DEEP_PATTERNS = [
  /compare.{0,60}(portfolio|strategy|backtest|sleeve)/i,
  /analyse?|analyze.{0,60}(risk|performance|drawdown)/i,
  /what.{0,30}improv.{0,40}(portfolio|quality|sharpe)/i,
  /contradikt|disagree|conflikt|widerspruch/i,
  /multi.step|several.step|step.by.step/i,
];

const COMPLEX_PATTERNS = [
  /white\s+swan.{0,80}(maxdd|sharpe|cagr|strategy)/i,
  /explain.{0,60}(strategy|strategie|system|approach)/i,
  /how.{0,50}(works?|funktioniert|arbeitet)/i,
  /risk.{0,40}(assessment|analyse|review)/i,
  /backtest.{0,40}(result|ergebnis|performance)/i,
];

const BRAIN_PATTERNS = [
  /white\s+swan/i,
  /track\s+record|live\s+record/i,
  /capitalife\s+(status|system|strategie|strategy)/i,
  /open\s+issues?|nächste\s+aktionen|next\s+actions/i,
  /aktuelle?\s+(status|stand|lage)/i,
  /maxdd|max\s+drawdown|sharpe.{0,10}ratio|cagr/i,
  /sleeve\b|fsportfolio/i,
  /invest\s+portfolio|core\s+invest/i,
];

const GRAPHIFY_PATTERNS = [
  /wo\s+ist|where\s+is.{0,30}(component|page|function|hook)/i,
  /welche\s+datei|which\s+file/i,
  /code.{0,30}(structure|struktur|aufbau)/i,
  /component.{0,30}(uses?|benutzt|referenced)/i,
  /how\s+is.{0,30}implemented/i,
];

function detectComplexity(msg: string): LocalRouterDecision["complexity"] {
  if (DEEP_PATTERNS.some((p) => p.test(msg))) return "deep";
  if (COMPLEX_PATTERNS.some((p) => p.test(msg))) return "complex";
  const words = msg.trim().split(/\s+/).length;
  if (words < 8) return "trivial";
  if (words < 20) return "simple";
  return "normal";
}

function selectMode(
  complexity: LocalRouterDecision["complexity"],
  requiresBrain: boolean,
  toolFirst: boolean,
): ConnectRoutingMode {
  if (toolFirst) return "LOCAL_ONLY";
  if (complexity === "trivial") return "LOCAL_ONLY";
  if (complexity === "simple" && !requiresBrain) return "FASTEST_FREE";
  if (complexity === "deep") return "PARALLEL_ENSEMBLE";
  if (complexity === "complex") return "REASONER_PLUS_CRITIC";
  return "SINGLE_BEST";
}

function modeParallelism(mode: ConnectRoutingMode): 1 | 2 | 3 | 4 {
  if (mode === "PARALLEL_ENSEMBLE") return 3;
  if (mode === "REASONER_PLUS_CRITIC") return 2;
  return 1;
}

function estimateTokens(msg: string, requiresBrain: boolean, complexity: string): number {
  const inputWords = msg.split(/\s+/).length;
  const brainOverhead = requiresBrain ? 4000 : 0;
  const outputTokens = complexity === "deep" ? 600 : complexity === "complex" ? 400 : 200;
  return inputWords * 1.3 + brainOverhead + outputTokens;
}

// Layer 0: decide immediately if the case is obviously LOCAL_ONLY (no Qwen needed).
function isObviousLocalOnly(
  toolFirst: ReturnType<typeof detectToolFirstOpportunity>,
  userMessage: string,
): boolean {
  if (toolFirst.shouldUseTool) return true;
  const wordCount = userMessage.trim().split(/\s+/).length;
  if (wordCount < 4) return true;
  const CRED_PATTERNS = [
    /api[_\s-]?key|secret|password|passwort|token\b|bearer\b/i,
    /sk-[a-z0-9]{10,}/i,
    /[A-Z0-9]{20,}/,
    /\/[a-z]+\/[a-z]+\/|C:\\|D:\\/i,
    /\b(ib|broker|tws|ibkr)\b.*\b(login|auth|cred)/i,
  ];
  return CRED_PATTERNS.some((p) => p.test(userMessage));
}

export async function routeLocally(userMessage: string, forceLocal = false): Promise<LocalRouterDecision> {
  const start = Date.now();
  const toolFirst = detectToolFirstOpportunity(userMessage);
  const requiresTools = toolFirst.shouldUseTool;
  const requiresGraphify = GRAPHIFY_PATTERNS.some((p) => p.test(userMessage));

  // Layer 0: obvious cases decided without Qwen
  if (forceLocal || isObviousLocalOnly(toolFirst, userMessage)) {
    const task = classifyTask(userMessage);
    const requiresBrain = BRAIN_PATTERNS.some((p) => p.test(userMessage));
    const complexity = forceLocal ? "simple" : detectComplexity(userMessage);
    if (requiresGraphify) {
      try { queryGraph({ query: userMessage, maxNodes: 5 }); } catch { /* non-blocking */ }
    }
    return {
      intent: task,
      complexity,
      requiresBrain,
      requiresTools,
      requiresGraphify,
      suggestedMode: "LOCAL_ONLY",
      parallelism: 1,
      synthesisMode: "single",
      estimatedTokens: estimateTokens(userMessage, requiresBrain, complexity),
      latencyMs: Date.now() - start,
      source: "heuristic",
    };
  }

  // Layer 1: try Qwen for intent classification
  const qwen = await qwenRoute(userMessage);
  if (qwen) {
    const requiresBrain = qwen.brain_required || BRAIN_PATTERNS.some((p) => p.test(userMessage));
    const parallelism = modeParallelism(qwen.routing_mode);
    if (requiresGraphify) {
      try { queryGraph({ query: userMessage, maxNodes: 5 }); } catch { /* non-blocking */ }
    }
    return {
      intent: qwen.intent,
      complexity: qwen.complexity,
      requiresBrain,
      requiresTools: qwen.tools_required || requiresTools,
      requiresGraphify,
      suggestedMode: qwen.routing_mode,
      parallelism,
      synthesisMode: parallelism > 1 ? "local" : "single",
      estimatedTokens: estimateTokens(userMessage, requiresBrain, qwen.complexity),
      latencyMs: Date.now() - start,
      source: "qwen",
    };
  }

  // Layer 0 fallback: heuristic
  const task = classifyTask(userMessage);
  const requiresBrain = BRAIN_PATTERNS.some((p) => p.test(userMessage));
  const complexity = detectComplexity(userMessage);
  const suggestedMode = selectMode(complexity, requiresBrain, requiresTools);
  const parallelism = modeParallelism(suggestedMode);
  if (requiresGraphify) {
    try { queryGraph({ query: userMessage, maxNodes: 5 }); } catch { /* non-blocking */ }
  }
  return {
    intent: task,
    complexity,
    requiresBrain,
    requiresTools,
    requiresGraphify,
    suggestedMode,
    parallelism,
    synthesisMode: parallelism > 1 ? "local" : "single",
    estimatedTokens: estimateTokens(userMessage, requiresBrain, complexity),
    latencyMs: Date.now() - start,
    source: "heuristic",
  };
}
