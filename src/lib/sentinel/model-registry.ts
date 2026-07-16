/**
 * Sentinel Model Registry
 * Dynamically selects the best available Ollama model for chat.
 * Never invents model names — always queries /api/tags first.
 */

const OLLAMA_BASE = process.env.OLLAMA_BASE_URL ?? process.env.OLLAMA_API_URL ?? "http://127.0.0.1:11434";
const ENV_MODEL = process.env.OLLAMA_MODEL ?? process.env.SENTINEL_DEFAULT_MODEL ?? "";

type OllamaModel = {
  name: string;
  capabilities: string[];
  details: { family: string };
};

type TagsResponse = {
  models: OllamaModel[];
};

/** Returns true if the model is chat-capable (not embedding-only) */
function isChatModel(m: OllamaModel): boolean {
  return m.capabilities.includes("completion");
}

/** Detect role from model name/family */
function modelRole(m: OllamaModel): "coding" | "reasoning" | "general" {
  const n = m.name.toLowerCase();
  if (n.includes("coder") || n.includes("code")) return "coding";
  if (n.includes("r1") || n.includes("deepseek") || m.capabilities.includes("thinking")) return "reasoning";
  return "general";
}

/** Priority score — higher is preferred for general chat */
function modelPriority(m: OllamaModel): number {
  const n = m.name.toLowerCase();
  // Prefer general/reasoning, large models
  if (n.includes("qwen3")) return 100;
  if (n.includes("gemma3")) return 80;
  if (n.includes("deepseek")) return 70;
  if (n.includes("qwen2")) return 60;
  if (n.includes("llama")) return 50;
  return 30;
}

let cachedModels: OllamaModel[] | null = null;
let cacheTs = 0;
const CACHE_TTL_MS = 60_000;

export async function getAvailableModels(): Promise<OllamaModel[]> {
  if (cachedModels && Date.now() - cacheTs < CACHE_TTL_MS) return cachedModels;
  const res = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`Ollama /api/tags returned ${res.status}`);
  const data = await res.json() as TagsResponse;
  cachedModels = data.models ?? [];
  cacheTs = Date.now();
  return cachedModels;
}

export type RoutedModel = {
  model: string;
  role: "coding" | "reasoning" | "general";
};

/**
 * Select the best model for the given task category.
 * Falls back to the first available chat model if no specialist found.
 */
export async function selectModel(category: "general" | "coding" | "reasoning" = "general"): Promise<RoutedModel> {
  const all = await getAvailableModels();
  const chatModels = all.filter(isChatModel);

  if (chatModels.length === 0) throw new Error("No chat-capable models found");

  // If env specifies a model and it exists, use it
  if (ENV_MODEL) {
    const envMatch = chatModels.find((m) => m.name === ENV_MODEL);
    if (envMatch) return { model: envMatch.name, role: modelRole(envMatch) };
  }

  // For coding, prefer a coding model
  if (category === "coding") {
    const coder = chatModels.find((m) => modelRole(m) === "coding");
    if (coder) return { model: coder.name, role: "coding" };
  }

  // For local-only Sentinel we prefer the strongest stable chat model first.
  // This keeps portfolio/brain prompts on qwen3 when available instead of
  // routing into thinking models that can stream reasoning-only tokens.
  const sorted = [...chatModels].sort((a, b) => modelPriority(b) - modelPriority(a));
  const best = sorted[0]!;
  return { model: best.name, role: category === "reasoning" ? "reasoning" : modelRole(best) };
}

/** Classify a user message to pick the right model category */
export function classifyMessage(text: string): "general" | "coding" | "reasoning" {
  const t = text.toLowerCase();
  if (/code|typescript|javascript|react|next\.js|komponente|bug|error|import|export|function|hook/.test(t)) return "coding";
  if (/portfolio|sleeve|strategie|compliance|regulat|backtest|risiko|gewicht|capitalife|sentinel|performance|rendite|drawdown/.test(t)) return "reasoning";
  return "general";
}
