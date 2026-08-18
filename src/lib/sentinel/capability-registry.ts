// Read-only capability registry — describes what Sentinel can genuinely do
// right now, grounded in actual wiring (not aspirational). This does NOT
// grant new access; it only reports the state of existing code paths so
// the UI and Sentinel's own "what can you do" answers stay honest.
import fs from "fs";
import path from "path";
import { getSentinelEnvConfig, getBrainContextStatus } from "./providers/provider-status";

export type CapabilityAvailability = "AVAILABLE" | "AVAILABLE_LOCAL" | "PARTIAL" | "BLOCKED" | "NOT_ALLOWED";

export type Capability = {
  id: string;
  name: string;
  category:
    | "brain" | "graphify" | "white_swan" | "core_invest" | "globe"
    | "monitoring" | "physical_intelligence" | "market_data" | "voice"
    | "provider_routing" | "conversation_memory";
  accessMode: "read" | "write" | "read_write";
  source: string;
  availability: CapabilityAvailability;
  requiresLocalRuntime: boolean;
  requiresRemoteProvider: boolean;
  allowedExternally: boolean;
  note: string;
};

const FORBIDDEN_PERMISSIONS = [
  "PLACE_ORDER", "CANCEL_ORDER", "MOVE_MONEY", "MODIFY_BROKER",
  "READ_SECRET", "WRITE_ARBITRARY_FILE", "BYPASS_AUTH",
] as const;

const GRANTED_PERMISSIONS = [
  "READ_PRODUCT_DATA", "READ_MARKET_DATA", "READ_BRAIN_CONTEXT",
  "READ_PHYSICAL_DATA", "READ_MONITORING", "USE_GRAPHIFY",
] as const;

export function getCapabilityRegistry(): Capability[] {
  const config = getSentinelEnvConfig();
  const brain = getBrainContextStatus(config);

  let graphifyAvailable = false;
  try {
    // Presence check only — do not import the module here (keeps this
    // registry side-effect-free and cheap to call from a status route).
    graphifyAvailable = fs.existsSync(path.join(process.cwd(), "graphify-out", "graph.json"));
  } catch { /* best-effort */ }

  const brainAvail: CapabilityAvailability = brain.available ? "AVAILABLE" : "BLOCKED";

  return [
    {
      id: "brain_context",
      name: "Capitalife Brain context",
      category: "brain",
      accessMode: "read",
      source: "CAPITALIFE_BRAIN_PATH (local filesystem)",
      availability: brainAvail,
      requiresLocalRuntime: true,
      requiresRemoteProvider: false,
      allowedExternally: false,
      note: brain.available
        ? "Live Brain files are injected into the system prompt and take priority over static fallback context."
        : "Brain path not reachable from this runtime (e.g. Vercel without a local bridge) — falls back to static, non-numeric background context only.",
    },
    {
      id: "graphify_stats",
      name: "Graphify codebase graph",
      category: "graphify",
      accessMode: "read",
      source: "graphify-out/graph.json",
      availability: graphifyAvailable ? "AVAILABLE" : "BLOCKED",
      requiresLocalRuntime: true,
      requiresRemoteProvider: false,
      allowedExternally: false,
      note: "Registered as a diagnostic tool (get_graph_stats) but not wired into the live Connect chat loop — available via /api/sentinel/tools, not mid-conversation.",
    },
    {
      id: "white_swan_context",
      name: "White Swan strategy data",
      category: "white_swan",
      accessMode: "read",
      source: "public/data/white-swan/v7/*.json (canonical, same files the product UI reads) via get_white_swan_risk_modes / get_white_swan_sp_comparison tools, wired into live Connect chat via tool-router.ts",
      availability: "AVAILABLE_LOCAL",
      requiresLocalRuntime: true,
      requiresRemoteProvider: false,
      allowedExternally: false,
      note: "Genuinely callable from a normal user message through /api/sentinel/connect — verified live against a real server with real Groq+Mistral providers (not mocked): \"What is White Swan €15k MaxDD?\" correctly returned 20.17% with zero occurrences of the old stale figure. Marked AVAILABLE_LOCAL, not AVAILABLE, because the underlying public/data/white-swan/v7/ artifacts remain untracked in git — this works on any machine that physically has those files (this one does), but NOT on a fresh checkout, CI, or the deployed Vercel environment, where the tool correctly reports BLOCKED rather than guessing. Deployment readiness requires a separate decision about committing/serving that data, which is outside Sentinel's ownership.",
    },
    {
      id: "core_invest_context",
      name: "Core Invest state",
      category: "core_invest",
      accessMode: "read",
      source: "public/data/core-invest/v2/*.json (canonical, same files the product reads) via get_core_invest_metrics / get_core_invest_live_readiness tools, wired into live Connect chat via tool-router.ts",
      availability: "AVAILABLE_LOCAL",
      requiresLocalRuntime: true,
      requiresRemoteProvider: false,
      allowedExternally: false,
      note: "Genuinely callable from a normal user message through /api/sentinel/connect, verified via integration tests (mocked provider transport, real dispatch/tool logic). Live-readiness is sourced from CORE_INVEST_EXECUTION_STATE.json and always reports the RESEARCH_ONLY classification and wouldTradeToday reason verbatim — never upgraded to \"live ready\". Marked AVAILABLE_LOCAL, not AVAILABLE: public/data/core-invest/v2/ is untracked in git (same class of gap as White Swan v7), so this works wherever those files physically exist on disk but not on a fresh checkout or Vercel.",
    },
    {
      id: "physical_intelligence_context",
      name: "Physical Intelligence (Corn/Soy/Wheat/Crude)",
      category: "physical_intelligence",
      accessMode: "read",
      source: "data/white-swan/physical-intelligence/forward/2026-08-17-v2.json via get_physical_intelligence tool, wired into live Connect chat via tool-router.ts",
      availability: "AVAILABLE_LOCAL",
      requiresLocalRuntime: true,
      requiresRemoteProvider: false,
      allowedExternally: false,
      note: "Genuinely callable from a normal user message through /api/sentinel/connect for Corn/Soy/Wheat (real USDA/NOAA observations) and Crude (honestly reports its UNAVAILABLE observation status, never fabricated). Trading impact and edge status are derived from the source file's own `mode` field (currently SHADOW_OBSERVATION_ONLY -> NONE/SHADOW_OBSERVATION) rather than hardcoded, so this stays correct if the canonical mode ever changes. Marked AVAILABLE_LOCAL, not AVAILABLE: this file lives outside public/ (at data/, not public/data/), which is a DIFFERENT and more severe packaging risk than White Swan/Core Invest — Next.js does not serve arbitrary root-level data/ directories to the runtime bundle by default, so this is unlikely to work on Vercel even if the file were committed (it currently is tracked in git, unlike the other two domains, but the path itself needs verification against actual Next.js file-tracing behavior before assuming Vercel would find it).",
    },
    {
      id: "globe_context",
      name: "Globe panel context (selected asset/region/overlay)",
      category: "globe",
      accessMode: "read",
      source: "Not yet wired — reserved contract",
      availability: "BLOCKED",
      requiresLocalRuntime: false,
      requiresRemoteProvider: false,
      allowedExternally: false,
      note: "No Globe-to-Sentinel context channel exists yet in this build. Reserve the shape (selectedAsset, selectedRegion, activeOverlays, chartSymbol) for a future Globe-side integration; Sentinel does not currently receive it.",
    },
    {
      id: "monitoring_context",
      name: "Monitoring summary",
      category: "monitoring",
      accessMode: "read",
      source: "Not yet wired",
      availability: "BLOCKED",
      requiresLocalRuntime: false,
      requiresRemoteProvider: false,
      allowedExternally: false,
      note: "No Monitoring data tool is wired into Sentinel's answering path in this build.",
    },
    {
      id: "market_data",
      name: "Live market data",
      category: "market_data",
      accessMode: "read",
      source: "Not yet wired",
      availability: "BLOCKED",
      requiresLocalRuntime: false,
      requiresRemoteProvider: false,
      allowedExternally: false,
      note: "Sentinel has no live market-data tool call; any market commentary comes from general LLM knowledge only, not a live feed.",
    },
    {
      id: "provider_routing",
      name: "Free-only multi-provider routing",
      category: "provider_routing",
      accessMode: "read",
      source: "/api/sentinel/connect",
      availability: "AVAILABLE",
      requiresLocalRuntime: false,
      requiresRemoteProvider: true,
      allowedExternally: true,
      note: "Free Firewall enforced — paid/unknown-pricing providers are blocked before dispatch. TPM rolling-window guard prevents aggregate rate-limit breaches.",
    },
    {
      id: "conversation_memory",
      name: "Conversation history",
      category: "conversation_memory",
      accessMode: "read_write",
      source: "Client localStorage, per-session",
      availability: "AVAILABLE",
      requiresLocalRuntime: false,
      requiresRemoteProvider: false,
      allowedExternally: false,
      note: "History persists client-side only; each request resends the trimmed recent turns to the provider.",
    },
    {
      id: "voice_tts",
      name: "Text-to-speech (browser SpeechSynthesis)",
      category: "voice",
      accessMode: "read",
      source: "Browser-native, client-side only",
      availability: "AVAILABLE",
      requiresLocalRuntime: false,
      requiresRemoteProvider: false,
      allowedExternally: false,
      note: "Auto-speaks the newest completed reply when unmuted; mute cancels active playback. Same wiring on desktop and /m/sentinel mobile.",
    },
    {
      id: "voice_stt",
      name: "Speech-to-text (browser SpeechRecognition)",
      category: "voice",
      accessMode: "read",
      source: "Browser-native, client-side only",
      availability: "PARTIAL",
      requiresLocalRuntime: false,
      requiresRemoteProvider: false,
      allowedExternally: false,
      note: "Requires a real user gesture and mic permission; unsupported browsers hide the mic button and text chat remains fully functional.",
    },
  ];
}

export const PERMISSIONS = {
  granted: GRANTED_PERMISSIONS,
  forbidden: FORBIDDEN_PERMISSIONS,
  liveOrderAuthority: "NO" as const,
};

export function summarizeCapabilitiesForPrompt(): string {
  const caps = getCapabilityRegistry();
  const lines = caps.map((c) => `- ${c.name}: ${c.availability}${c.note ? ` — ${c.note}` : ""}`);
  return [
    "## Sentinel Capability Awareness",
    "Wenn nach Faehigkeiten gefragt wird (\"was kannst du\", \"kannst du X sehen\"), antworte ehrlich basierend auf diesem Status — nicht generisch:",
    ...lines,
    "",
    `Erlaubte Berechtigungen: ${GRANTED_PERMISSIONS.join(", ")}.`,
    `NIEMALS erlaubt: ${FORBIDDEN_PERMISSIONS.join(", ")}.`,
    "Live-Order-Autoritaet: NEIN. Sentinel analysiert, erklaert und simuliert — es fuehrt keine echten Trades aus.",
  ].join("\n");
}
