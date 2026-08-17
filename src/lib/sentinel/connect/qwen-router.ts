// Qwen Layer 1 Router — uses local qwen3:1.7b via Ollama to classify intent/routing.
// Falls back to heuristic (Layer 0) when Ollama is offline or response is invalid/slow.
// Never called for obvious LOCAL_ONLY cases already decided by Layer 0.

import type { ConnectRoutingMode } from "./connect-types";

const OLLAMA_URL = process.env.OLLAMA_API_URL ?? "http://localhost:11434";
const QWEN_MODEL = "qwen3:1.7b";
const QWEN_TIMEOUT_MS = 4000; // 4s wall-clock limit; fall back to heuristic if exceeded

// Qwen3 requires think=false AND /no_think prefix to suppress CoT tokens.
const SYSTEM_PROMPT = `/no_think You are a routing classifier for a financial AI assistant. Return ONLY valid JSON, no explanation.

Privacy rules:
- LOCAL_ONLY: credentials, API keys, file paths, broker passwords, account numbers
- REMOTE_SAFE: generic finance definitions, general coding questions, public knowledge
- REMOTE_REDACTED: Capitalife-specific data (White Swan, FSPortfolio, track record, live positions) — can go external if sanitized

Routing rules:
- LOCAL_ONLY mode: credentials/paths, trivial (<5 words), tool queries (trades count/status)
- FASTEST_FREE mode: simple generic questions
- SINGLE_BEST mode: normal questions needing a provider
- REASONER_PLUS_CRITIC mode: complex analysis
- PARALLEL_ENSEMBLE mode: deep multi-angle research

JSON schema: {"intent":"string","complexity":"trivial|simple|normal|complex|deep","privacy":"LOCAL_ONLY|REMOTE_SAFE|REMOTE_REDACTED","brain_required":boolean,"tools_required":boolean,"routing_mode":"LOCAL_ONLY|FASTEST_FREE|SINGLE_BEST|REASONER_PLUS_CRITIC|PARALLEL_ENSEMBLE","worker_count":1,"confidence":0.0}`;

export type QwenDecision = {
  intent: string;
  complexity: "trivial" | "simple" | "normal" | "complex" | "deep";
  privacy: "LOCAL_ONLY" | "REMOTE_SAFE" | "REMOTE_REDACTED";
  brain_required: boolean;
  tools_required: boolean;
  routing_mode: ConnectRoutingMode;
  worker_count: number;
  confidence: number;
};

let _ollamaAvailable: boolean | null = null;
let _lastOllamaCheck = 0;
const OLLAMA_CHECK_TTL = 30_000; // re-probe every 30s

async function isOllamaAvailable(): Promise<boolean> {
  if (_ollamaAvailable !== null && Date.now() - _lastOllamaCheck < OLLAMA_CHECK_TTL) {
    return _ollamaAvailable;
  }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1500);
    const r = await fetch(`${OLLAMA_URL}/api/tags`, { signal: ctrl.signal });
    clearTimeout(t);
    _ollamaAvailable = r.ok;
  } catch {
    _ollamaAvailable = false;
  }
  _lastOllamaCheck = Date.now();
  return _ollamaAvailable;
}

function stripThinkTags(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

function parseQwenResponse(raw: string): QwenDecision | null {
  const cleaned = stripThinkTags(raw);
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const obj = JSON.parse(jsonMatch[0]) as Partial<QwenDecision>;
    const validModes: ConnectRoutingMode[] = [
      "LOCAL_ONLY", "FASTEST_FREE", "SINGLE_BEST",
      "REASONER_PLUS_CRITIC", "PARALLEL_ENSEMBLE", "FALLBACK_CHAIN",
    ];
    const validComplexities = ["trivial", "simple", "normal", "complex", "deep"];
    const validPrivacy = ["LOCAL_ONLY", "REMOTE_SAFE", "REMOTE_REDACTED"];
    if (
      !obj.routing_mode || !validModes.includes(obj.routing_mode) ||
      !obj.complexity || !validComplexities.includes(obj.complexity) ||
      !obj.privacy || !validPrivacy.includes(obj.privacy)
    ) return null;
    return {
      intent: typeof obj.intent === "string" ? obj.intent : "unknown",
      complexity: obj.complexity,
      privacy: obj.privacy,
      brain_required: Boolean(obj.brain_required),
      tools_required: Boolean(obj.tools_required),
      routing_mode: obj.routing_mode,
      worker_count: typeof obj.worker_count === "number" ? obj.worker_count : 1,
      confidence: typeof obj.confidence === "number" ? obj.confidence : 0.5,
    };
  } catch {
    return null;
  }
}

export async function qwenRoute(userMessage: string): Promise<QwenDecision | null> {
  if (!(await isOllamaAvailable())) return null;

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), QWEN_TIMEOUT_MS);

  try {
    const body = JSON.stringify({
      model: QWEN_MODEL,
      think: false,
      stream: false,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `/no_think Classify: "${userMessage}"` },
      ],
    });

    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: ctrl.signal,
    });

    if (!res.ok) return null;
    const data = (await res.json()) as { message?: { content?: string } };
    const content = data?.message?.content ?? "";
    return parseQwenResponse(content);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export function invalidateOllamaCache(): void {
  _ollamaAvailable = null;
}
