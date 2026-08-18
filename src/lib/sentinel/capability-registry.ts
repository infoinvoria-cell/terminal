// Read-only capability registry — describes what Sentinel can genuinely do
// right now, grounded in actual wiring (not aspirational). This does NOT
// grant new access; it only reports the state of existing code paths so
// the UI and Sentinel's own "what can you do" answers stay honest.
import fs from "fs";
import path from "path";
import { getSentinelEnvConfig, getBrainContextStatus } from "./providers/provider-status";

export type CapabilityAvailability = "AVAILABLE" | "PARTIAL" | "BLOCKED" | "NOT_ALLOWED";

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
      source: "public/data/white-swan/v7/*.json (canonical, same files the product UI reads) via get_white_swan_risk_modes / get_white_swan_sp_comparison tools",
      availability: "PARTIAL",
      requiresLocalRuntime: false,
      requiresRemoteProvider: false,
      allowedExternally: false,
      note: "A real, tested read-only adapter now exists and reads current v7 data, verified against the corrected drawdown methodology (running-peak, not the previously-fixed stale bug). Marked PARTIAL, not AVAILABLE, because it is only reachable via /api/sentinel/tools — it is NOT wired into the live Connect chat loop's tool-calling, since that would require a Connect architecture change outside this task's scope. Sentinel cannot yet call it mid-conversation automatically.",
    },
    {
      id: "core_invest_context",
      name: "Core Invest state",
      category: "core_invest",
      accessMode: "read",
      source: "Brain live files, when available",
      availability: brain.available ? "PARTIAL" : "BLOCKED",
      requiresLocalRuntime: true,
      requiresRemoteProvider: false,
      allowedExternally: false,
      note: "No dedicated Core Invest tool/endpoint is wired into Sentinel yet — only whatever Brain markdown mentions it. Live-readiness claims must not be asserted beyond what Brain data states.",
    },
    {
      id: "physical_intelligence_context",
      name: "Physical Intelligence (Corn/Soy/Wheat/Crude)",
      category: "physical_intelligence",
      accessMode: "read",
      source: "Brain live files, when available",
      availability: "BLOCKED",
      requiresLocalRuntime: true,
      requiresRemoteProvider: false,
      allowedExternally: false,
      note: "No dedicated Physical Intelligence data tool is wired into Sentinel's answering path in this build. Not to be confused with data existing elsewhere in the product — Sentinel specifically cannot read it yet.",
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
