// Local Agent Registry — named Ollama agents with dedicated skill profiles.
// These agents are always "ready to activate" — when Ollama runs on a VPS
// and the named model is pulled, the corresponding agent automatically becomes available.
//
// Usage: call getLocalAgents() to get the full registry.
// Call matchLocalAgent(task) to find the best local agent for a given SentinelTask.
//
// NOTE: Ollama being offline must NOT affect systemStatus in the capacity API.
// Hardware checks are INFORMATIONAL only — never block a model that Ollama says works.

import type { SentinelTask } from "@/lib/sentinel/routing/task-classifier";

export type LocalAgentSkill =
  | "fast_chat"         // Quick conversational answers, < 2s latency
  | "code_assistant"    // Code generation, debugging, refactoring
  | "financial_analyst" // Trading, portfolio, market analysis
  | "long_context"      // Large document processing, RAG
  | "reasoning"         // Complex analysis, multi-step thinking
  | "privacy_vault"     // Sensitive data — never leaves local machine
  | "summarizer"        // Document and chat summarization
  | "embedding"         // Text embeddings for vector search (future)
  | "general";          // General-purpose fallback

export type LocalAgent = {
  id: string;
  name: string;
  description: string;
  primarySkill: LocalAgentSkill;
  supportedTasks: SentinelTask[];
  preferredModels: string[];   // Ordered: first available model wins
  contextWindow: number;       // Expected context window in tokens
  minVramGb: number;           // Minimum VRAM needed (for VPS sizing)
  speedTier: "fast" | "balanced" | "quality";
  active: boolean;             // Set at runtime based on model availability
  availableModel: string | null; // Filled in when healthcheck finds the model
};

// --- Hardware profile ---

export type LocalHardwareProfile = {
  ramGb: number | null;
  vramGb: number | null;
  gpuAvailable: boolean;
  estimatedMaxModelSize: number; // max model parameter size in B that can run
};

export type LocalAgentStatus = "available" | "not_installed" | "insufficient_hardware" | "ready";

export type LocalAgentWithStatus = LocalAgent & {
  status: LocalAgentStatus;
  statusReason: string;
};

// --- Agent definitions ---

const LOCAL_AGENTS: LocalAgent[] = [
  {
    id: "local-fast-chat",
    name: "FastChat",
    description: "Schnelle Antworten, < 1s auf GPU, für einfache Fragen und Dashboard-Lookups",
    primarySkill: "fast_chat",
    supportedTasks: ["simple_chat", "simple_dashboard_lookup", "tool_calling"],
    preferredModels: [
      "llama3.2:3b",
      "llama3.2",
      "llama3.1:8b",
      "llama3:8b",
      "phi3:mini",
      "qwen2.5:3b",
      "gemma2:2b",
    ],
    contextWindow: 128000,
    minVramGb: 4,
    speedTier: "fast",
    active: false,
    availableModel: null,
  },
  {
    id: "local-code-assistant",
    name: "CodeAssistant",
    description: "Code schreiben, debuggen, refactorn — lokal und privat",
    primarySkill: "code_assistant",
    supportedTasks: ["coding", "code_review", "structured_output"],
    preferredModels: [
      "codellama:13b",
      "codellama:7b",
      "deepseek-coder:6.7b",
      "deepseek-coder:1.3b",
      "qwen2.5-coder:7b",
      "qwen2.5-coder:3b",
      "llama3.1:8b",
      "llama3.2",
    ],
    contextWindow: 16384,
    minVramGb: 8,
    speedTier: "balanced",
    active: false,
    availableModel: null,
  },
  {
    id: "local-financial-analyst",
    name: "FinancialAnalyst",
    description: "Trading-Analyse, Strategien, Portfolio — mit vollständiger Datenprivatsphäre",
    primarySkill: "financial_analyst",
    supportedTasks: ["financial_analysis", "reasoning", "summarization"],
    preferredModels: [
      "llama3.1:70b",
      "llama3.3:70b",
      "mistral:7b",
      "llama3.1:8b",
      "qwen2.5:7b",
      "llama3.2",
    ],
    contextWindow: 131072,
    minVramGb: 16,
    speedTier: "quality",
    active: false,
    availableModel: null,
  },
  {
    id: "local-long-context",
    name: "LongContext",
    description: "Große Dokumente, Brain-RAG, lange Konversationen — lokal verarbeitet",
    primarySkill: "long_context",
    supportedTasks: ["long_context", "brain_rag", "graph_rag", "summarization"],
    preferredModels: [
      "llama3.1:70b",
      "llama3.3:70b",
      "mistral:7b",
      "llama3.1:8b",
      "qwen2.5:14b",
      "llama3.2",
    ],
    contextWindow: 131072,
    minVramGb: 16,
    speedTier: "balanced",
    active: false,
    availableModel: null,
  },
  {
    id: "local-reasoning",
    name: "ReasoningEngine",
    description: "Komplexe Analysen, mehrstufiges Denken, Strategiebewertung",
    primarySkill: "reasoning",
    supportedTasks: ["reasoning", "code_review", "financial_analysis"],
    preferredModels: [
      "deepseek-r1:8b",
      "deepseek-r1:7b",
      "phi4:14b",
      "llama3.1:70b",
      "llama3.1:8b",
      "llama3.2",
    ],
    contextWindow: 131072,
    minVramGb: 8,
    speedTier: "quality",
    active: false,
    availableModel: null,
  },
  {
    id: "local-privacy-vault",
    name: "PrivacyVault",
    description: "Für sensible Daten — API-Keys, Credentials, persönliche Infos — niemals Cloud",
    primarySkill: "privacy_vault",
    supportedTasks: ["privacy", "simple_chat", "simple_dashboard_lookup"],
    preferredModels: [
      "llama3.2:3b",
      "llama3.2",
      "llama3.1:8b",
      "phi3:mini",
    ],
    contextWindow: 128000,
    minVramGb: 4,
    speedTier: "fast",
    active: false,
    availableModel: null,
  },
  {
    id: "local-summarizer",
    name: "Summarizer",
    description: "Dokumente, Chats und Brain-Inhalte zusammenfassen",
    primarySkill: "summarizer",
    supportedTasks: ["summarization", "brain_rag"],
    preferredModels: [
      "mistral:7b",
      "llama3.1:8b",
      "qwen2.5:7b",
      "llama3.2",
      "phi3:mini",
    ],
    contextWindow: 32768,
    minVramGb: 6,
    speedTier: "balanced",
    active: false,
    availableModel: null,
  },
];

// --- Runtime activation ---

// Call this after Ollama healthCheck returns the available model list.
// Returns a new list with active/availableModel filled in.
export function activateLocalAgents(availableModels: string[]): LocalAgent[] {
  const normalizedAvailable = availableModels.map(m => m.toLowerCase().replace(/\s+/g, ""));

  return LOCAL_AGENTS.map(agent => {
    const found = agent.preferredModels.find(preferred => {
      const norm = preferred.toLowerCase().replace(/\s+/g, "");
      return normalizedAvailable.some(avail =>
        avail === norm || avail.startsWith(norm.replace(/:.*$/, "") + ":") || avail === norm.split(":")[0]
      );
    });
    return { ...agent, active: !!found, availableModel: found ?? null };
  });
}

// --- Hardware-aware assessment ---

// Derive approximate max runnable model size in billion parameters from hardware.
// Heuristic: larger of (vramGb) or (ramGb / 2), in billions.
function deriveMaxModelSize(hardware: LocalHardwareProfile): number {
  const fromVram = hardware.vramGb ?? 0;
  const fromRam = hardware.ramGb != null ? hardware.ramGb / 2 : 0;
  return Math.max(fromVram, fromRam);
}

// Estimate the minimum parameter size (in B) required to run a model name.
// Based on common naming conventions: llama3.1:70b → 70, codellama:13b → 13, etc.
function estimateModelSizeB(modelName: string): number | null {
  const match = modelName.match(/[:\-_](\d+(?:\.\d+)?)b/i);
  if (match) return parseFloat(match[1]);
  // Fallbacks for names without explicit size
  if (modelName.includes("mini") || modelName.includes("2b")) return 2;
  if (modelName.includes("3b")) return 3;
  return null; // Unknown — skip hardware check
}

// Minimum estimatedMaxModelSize threshold for a given model parameter count.
// Conservative — aligned with practical VRAM/RAM requirements.
function minHardwareThresholdForSize(modelSizeB: number): number {
  if (modelSizeB >= 65) return 50;  // 70B needs ~40GB VRAM or ~80GB RAM
  if (modelSizeB >= 12) return 10;  // 13B needs ~8GB VRAM
  if (modelSizeB >= 6)  return 6;   // 7-8B needs ~5GB VRAM
  if (modelSizeB >= 2)  return 2;   // 3B needs ~2GB VRAM
  return 1;
}

// Assess all agents for availability and hardware compatibility.
// Hardware check is INFORMATIONAL only — if Ollama says a model is available, it runs.
// This function adds a status hint but never blocks a working model.
export function assessLocalAgents(
  availableModels: string[],
  hardware?: LocalHardwareProfile,
): LocalAgentWithStatus[] {
  const activated = activateLocalAgents(availableModels);

  return activated.map(agent => {
    if (!agent.active) {
      // Model not installed in Ollama
      const firstPreferred = agent.preferredModels[0] ?? "unknown";
      return {
        ...agent,
        status: "not_installed" as LocalAgentStatus,
        statusReason: `Modell nicht geladen: pull ${firstPreferred}`,
      };
    }

    // Model is installed — check hardware if profile is available
    if (hardware) {
      const maxSize = hardware.estimatedMaxModelSize > 0
        ? hardware.estimatedMaxModelSize
        : deriveMaxModelSize(hardware);

      const modelName = agent.availableModel ?? agent.preferredModels[0] ?? "";
      const modelSizeB = estimateModelSizeB(modelName);

      if (modelSizeB !== null) {
        const threshold = minHardwareThresholdForSize(modelSizeB);
        if (maxSize > 0 && maxSize < threshold) {
          return {
            ...agent,
            status: "insufficient_hardware" as LocalAgentStatus,
            statusReason:
              `Hardware möglicherweise zu schwach für ${modelName} ` +
              `(benötigt ~${threshold}B Kapazität, geschätzt: ${maxSize}B). ` +
              `Läuft trotzdem wenn Ollama es akzeptiert.`,
          };
        }
      }

      return {
        ...agent,
        status: "ready" as LocalAgentStatus,
        statusReason: `Bereit (${agent.availableModel ?? modelName})`,
      };
    }

    // No hardware info — assume it works if installed
    return {
      ...agent,
      status: "available" as LocalAgentStatus,
      statusReason: `Verfügbar (${agent.availableModel ?? "unbekanntes Modell"})`,
    };
  });
}

// --- Hardware detection (server-side Node.js only) ---

// Attempts to read system memory info from /proc/meminfo (Linux).
// Returns null on Windows or any read error.
// This is a best-effort hint — absence of hardware info never blocks anything.
export async function estimateHardwareFromOllama(): Promise<LocalHardwareProfile | null> {
  // Windows: hardware check not supported via /proc — skip gracefully.
  if (process.platform === "win32") return null;

  try {
    const fs = await import("fs/promises");
    const meminfo = await fs.readFile("/proc/meminfo", "utf-8");

    let totalRamKb: number | null = null;
    for (const line of meminfo.split("\n")) {
      const match = line.match(/^MemTotal:\s+(\d+)\s+kB/i);
      if (match) {
        totalRamKb = parseInt(match[1], 10);
        break;
      }
    }

    const ramGb = totalRamKb != null ? Math.round(totalRamKb / 1024 / 1024) : null;

    // VRAM detection via /proc is not reliable — would need nvidia-smi or similar.
    // Leave vramGb null; deriveMaxModelSize will fall back to ramGb/2.
    const vramGb: number | null = null;
    const gpuAvailable = false; // Conservative — can't detect without nvidia-smi

    const estimatedMaxModelSize =
      vramGb != null
        ? Math.max(vramGb, ramGb != null ? ramGb / 2 : 0)
        : ramGb != null
          ? ramGb / 2
          : 0;

    return { ramGb, vramGb, gpuAvailable, estimatedMaxModelSize };
  } catch {
    // /proc/meminfo not available or permission denied — return null
    return null;
  }
}

// Find the best active local agent for a given task.
export function matchLocalAgent(task: SentinelTask, agents: LocalAgent[]): LocalAgent | null {
  const active = agents.filter(a => a.active && a.supportedTasks.includes(task));
  if (!active.length) return null;
  // Prefer primary skill match, then fastest
  const primary = active.find(a => {
    if (task === "privacy" && a.primarySkill === "privacy_vault") return true;
    if ((task === "coding" || task === "code_review") && a.primarySkill === "code_assistant") return true;
    if ((task === "financial_analysis") && a.primarySkill === "financial_analyst") return true;
    if ((task === "long_context" || task === "brain_rag" || task === "graph_rag") && a.primarySkill === "long_context") return true;
    if ((task === "reasoning") && a.primarySkill === "reasoning") return true;
    if ((task === "summarization") && a.primarySkill === "summarizer") return true;
    return false;
  });
  return primary ?? active[0] ?? null;
}

// Get all agent definitions (static, without activation).
export function getLocalAgents(): LocalAgent[] {
  return LOCAL_AGENTS;
}

// Get active agents only.
export function getActiveLocalAgents(availableModels: string[]): LocalAgent[] {
  return activateLocalAgents(availableModels).filter(a => a.active);
}
