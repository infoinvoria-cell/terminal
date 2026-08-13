export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { computeSentinelSystemStatus, RUNTIME_PROBEABLE_PROVIDERS } from "@/lib/sentinel/status/system-status";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FreeEntitlement = "verified_free" | "trial" | "unknown";
type ProviderStatus = "ready" | "not_configured" | "not_authorized" | "error" | "key_only";
type SystemStatus = "healthy" | "limited" | "local_fallback" | "offline";

interface ProviderResult {
  id: string;
  configured: boolean;
  authorized: boolean | null;
  runtimeVerified: boolean;
  freeEntitlement: FreeEntitlement;
  availableModels: string[];
  largestContextWindow: number | null;
  streaming: boolean;
  toolCalling: boolean;
  vision: boolean;
  rpm: number | null;
  rpd: number | null;
  tpm: number | null;
  status: ProviderStatus;
}

interface OllamaStatus {
  online: boolean;
  models: string[];
  activeAgents: number;
}

// ---------------------------------------------------------------------------
// Static capabilities per provider (what we know without probing)
// ---------------------------------------------------------------------------

const PROVIDER_CAPS: Record<
  string,
  Pick<ProviderResult, "streaming" | "toolCalling" | "vision" | "rpm" | "rpd" | "tpm">
> = {
  groq: {
    streaming: true,
    toolCalling: true,
    vision: false,
    rpm: 30,
    rpd: 14400,
    tpm: 6000,
  },
  gemini: {
    streaming: true,
    toolCalling: true,
    vision: true,
    rpm: 15,
    rpd: 1500,
    tpm: 1000000,
  },
  cerebras: {
    streaming: true,
    toolCalling: true,
    vision: false,
    rpm: 30,
    rpd: null,
    tpm: 60000,
  },
  mistral: {
    streaming: true,
    toolCalling: true,
    vision: false,
    rpm: 1,
    rpd: 200,
    tpm: 500000,
  },
  cohere: {
    streaming: true,
    toolCalling: true,
    vision: false,
    rpm: 20,
    rpd: 1000,
    tpm: null,
  },
  openrouter: {
    streaming: true,
    toolCalling: true,
    vision: true,
    rpm: null,
    rpd: null,
    tpm: null,
  },
  github_models: {
    streaming: true,
    toolCalling: true,
    vision: true,
    rpm: 15,
    rpd: 150,
    tpm: null,
  },
  cloudflare: {
    streaming: true,
    toolCalling: false,
    vision: false,
    rpm: null,
    rpd: null,
    tpm: null,
  },
  huggingface: {
    streaming: true,
    toolCalling: false,
    vision: false,
    rpm: null,
    rpd: null,
    tpm: null,
  },
};

// ---------------------------------------------------------------------------
// Probe helpers
// ---------------------------------------------------------------------------

async function probeGroq(key: string): Promise<{ ok: boolean; models: string[] }> {
  const res = await fetch("https://api.groq.com/openai/v1/models", {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) return { ok: false, models: [] };
  const data = await res.json();
  const models: string[] = Array.isArray(data.data)
    ? data.data.map((m: { id: string }) => m.id)
    : [];
  return { ok: true, models };
}

async function probeGemini(key: string): Promise<{ ok: boolean; models: string[] }> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`, {
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) return { ok: false, models: [] };
  const data = await res.json();
  const models: string[] = Array.isArray(data.models)
    ? data.models.map((m: { name: string }) => m.name.replace("models/", ""))
    : [];
  return { ok: true, models };
}

async function probeMistral(key: string): Promise<{ ok: boolean; models: string[] }> {
  const res = await fetch("https://api.mistral.ai/v1/models", {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) return { ok: false, models: [] };
  const data = await res.json();
  const models: string[] = Array.isArray(data.data)
    ? data.data.map((m: { id: string }) => m.id)
    : [];
  return { ok: true, models };
}

async function probeOpenRouter(key: string): Promise<{ ok: boolean; models: string[] }> {
  const res = await fetch(
    "https://openrouter.ai/api/v1/models?supported_parameters=free",
    {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(6000),
    }
  );
  if (!res.ok) return { ok: false, models: [] };
  const data = await res.json();
  const models: string[] = Array.isArray(data.data)
    ? data.data.map((m: { id: string }) => m.id)
    : [];
  return { ok: true, models };
}

async function probeOllama(): Promise<OllamaStatus> {
  try {
    const res = await fetch("http://localhost:11434/api/tags", {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return { online: false, models: [], activeAgents: 0 };
    const data = await res.json();
    const models: string[] = Array.isArray(data.models)
      ? data.models.map((m: { name: string }) => m.name)
      : [];
    return { online: true, models, activeAgents: 0 };
  } catch {
    return { online: false, models: [], activeAgents: 0 };
  }
}

// ---------------------------------------------------------------------------
// Build provider entry (key-only, no probe)
// ---------------------------------------------------------------------------

function keyOnly(id: string): ProviderResult {
  const caps = PROVIDER_CAPS[id] ?? {
    streaming: false,
    toolCalling: false,
    vision: false,
    rpm: null,
    rpd: null,
    tpm: null,
  };
  return {
    id,
    configured: true,
    authorized: null,
    runtimeVerified: false,
    freeEntitlement: "unknown",
    availableModels: [],
    largestContextWindow: null,
    ...caps,
    status: "key_only",
  };
}

function notConfigured(id: string): ProviderResult {
  const caps = PROVIDER_CAPS[id] ?? {
    streaming: false,
    toolCalling: false,
    vision: false,
    rpm: null,
    rpd: null,
    tpm: null,
  };
  return {
    id,
    configured: false,
    authorized: null,
    runtimeVerified: false,
    freeEntitlement: "unknown",
    availableModels: [],
    largestContextWindow: null,
    ...caps,
    status: "not_configured",
  };
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function GET() {
  const groqKey = process.env.GROQ_API_KEY?.trim() || null;
  const geminiKey = process.env.GEMINI_API_KEY?.trim() || null;
  const cerebrasKey = process.env.CEREBRAS_API_KEY?.trim() || null;
  const mistralKey = process.env.MISTRAL_API_KEY?.trim() || null;
  const cohereKey = process.env.COHERE_API_KEY?.trim() || null;
  const openrouterKey = process.env.OPENROUTER_API_KEY?.trim() || null;
  const githubKey = process.env.GITHUB_MODELS_API_KEY?.trim() || null;
  const cloudflareKey = process.env.CLOUDFLARE_AI_API_KEY?.trim() || null;
  const huggingfaceKey = process.env.HUGGINGFACE_API_KEY?.trim() || null;

  // Run all probes in parallel
  const [groqProbe, geminiProbe, mistralProbe, openrouterProbe, ollamaStatus] =
    await Promise.allSettled([
      groqKey ? probeGroq(groqKey) : Promise.resolve(null),
      geminiKey ? probeGemini(geminiKey) : Promise.resolve(null),
      mistralKey ? probeMistral(mistralKey) : Promise.resolve(null),
      openrouterKey ? probeOpenRouter(openrouterKey) : Promise.resolve(null),
      probeOllama(),
    ]);

  function resolveProbe(
    settled: PromiseSettledResult<{ ok: boolean; models: string[] } | null>
  ): { ok: boolean; models: string[] } | null {
    if (settled.status === "fulfilled") return settled.value;
    return null;
  }

  const groqResult = resolveProbe(groqProbe);
  const geminiResult = resolveProbe(geminiProbe);
  const mistralResult = resolveProbe(mistralProbe);
  const openrouterResult = resolveProbe(openrouterProbe);
  const ollama: OllamaStatus =
    ollamaStatus.status === "fulfilled"
      ? ollamaStatus.value
      : { online: false, models: [], activeAgents: 0 };

  const caps = PROVIDER_CAPS;

  // Build providers array
  const providers: ProviderResult[] = [];

  // Groq
  if (!groqKey) {
    providers.push(notConfigured("groq"));
  } else if (!groqResult) {
    providers.push({ ...keyOnly("groq"), status: "error" });
  } else if (!groqResult.ok) {
    providers.push({ ...keyOnly("groq"), authorized: false, status: "not_authorized" });
  } else {
    providers.push({
      id: "groq",
      configured: true,
      authorized: true,
      runtimeVerified: true,
      freeEntitlement: "verified_free",
      availableModels: groqResult.models,
      largestContextWindow: 128000,
      ...caps.groq,
      status: "ready",
    });
  }

  // Gemini
  if (!geminiKey) {
    providers.push(notConfigured("gemini"));
  } else if (!geminiResult) {
    providers.push({ ...keyOnly("gemini"), status: "error" });
  } else if (!geminiResult.ok) {
    providers.push({ ...keyOnly("gemini"), authorized: false, status: "not_authorized" });
  } else {
    providers.push({
      id: "gemini",
      configured: true,
      authorized: true,
      runtimeVerified: true,
      freeEntitlement: "verified_free",
      availableModels: geminiResult.models,
      largestContextWindow: 1000000,
      ...caps.gemini,
      status: "ready",
    });
  }

  // Cerebras — key format check only
  if (!cerebrasKey) {
    providers.push(notConfigured("cerebras"));
  } else {
    // Cerebras keys start with "csk-"
    const validFormat = cerebrasKey.startsWith("csk-");
    providers.push({
      id: "cerebras",
      configured: true,
      authorized: null,
      runtimeVerified: false,
      freeEntitlement: "trial",
      availableModels: [],
      largestContextWindow: 8192,
      ...caps.cerebras,
      status: validFormat ? "key_only" : "not_authorized",
    });
  }

  // Mistral
  if (!mistralKey) {
    providers.push(notConfigured("mistral"));
  } else if (!mistralResult) {
    providers.push({ ...keyOnly("mistral"), status: "error" });
  } else if (!mistralResult.ok) {
    providers.push({ ...keyOnly("mistral"), authorized: false, status: "not_authorized" });
  } else {
    providers.push({
      id: "mistral",
      configured: true,
      authorized: true,
      runtimeVerified: true,
      freeEntitlement: "verified_free",
      availableModels: mistralResult.models,
      largestContextWindow: 128000,
      ...caps.mistral,
      status: "ready",
    });
  }

  // Cohere — key-only
  if (!cohereKey) {
    providers.push(notConfigured("cohere"));
  } else {
    providers.push(keyOnly("cohere"));
  }

  // OpenRouter
  if (!openrouterKey) {
    providers.push(notConfigured("openrouter"));
  } else if (!openrouterResult) {
    providers.push({ ...keyOnly("openrouter"), status: "error" });
  } else if (!openrouterResult.ok) {
    providers.push({ ...keyOnly("openrouter"), authorized: false, status: "not_authorized" });
  } else {
    providers.push({
      id: "openrouter",
      configured: true,
      authorized: true,
      runtimeVerified: true,
      freeEntitlement: "verified_free",
      availableModels: openrouterResult.models.slice(0, 50), // cap list length
      largestContextWindow: null,
      ...caps.openrouter,
      status: "ready",
    });
  }

  // GitHub Models — key-only
  if (!githubKey) {
    providers.push(notConfigured("github_models"));
  } else {
    providers.push(keyOnly("github_models"));
  }

  // Cloudflare — key-only
  if (!cloudflareKey) {
    providers.push(notConfigured("cloudflare"));
  } else {
    providers.push(keyOnly("cloudflare"));
  }

  // HuggingFace — key-only
  if (!huggingfaceKey) {
    providers.push(notConfigured("huggingface"));
  } else {
    providers.push(keyOnly("huggingface"));
  }

  // System status — shared function, same logic as capacity endpoint
  const systemStatus: SystemStatus = computeSentinelSystemStatus(
    providers.map((p) => ({
      id: p.id,
      effectivelyReady: p.runtimeVerified && RUNTIME_PROBEABLE_PROVIDERS.has(p.id),
      blocked: false,
    })),
    ollama.online,
  );

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    freeOnlyPolicy: true,
    systemStatus,
    providers,
    ollamaStatus: ollama,
  });
}

export async function POST() {
  return NextResponse.json({ error: "unavailable in cloud preview" }, { status: 503 });
}
