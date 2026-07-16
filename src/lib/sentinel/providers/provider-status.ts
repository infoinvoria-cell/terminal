import fs from "node:fs";
import path from "node:path";
import { getCapitalifeBrainPath } from "@/lib/brain/brain-path";
import type { ProviderStatus, SentinelProviderId, SentinelRouterMode } from "./types";

export type SentinelEnvConfig = {
  mode: SentinelRouterMode;
  defaultProvider: SentinelProviderId;
  allowPaidApi: boolean;
  allowCustomApi: boolean;
  requireLocalFallback: boolean;
  localTimeoutMs: number;
  partnerMode: boolean;
  brainPath: string | null;
  brainContextEnabled: boolean;
  ollamaBaseUrl: string;
  ollamaModel: string | null;
  ollamaThink: boolean;
  openaiModel: string | null;
  anthropicModel: string | null;
  customModel: string | null;
  customApiUrl: string | null;
};

export type BrainContextStatus = {
  available: boolean;
  loaded: boolean;
  pathConfigured: boolean;
  path: string | null;
  mode: "capitalife" | "generic";
  message: string;
};

function envText(value: string | undefined | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function envBool(value: string | undefined, fallback: boolean): boolean {
  if (value == null) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function envInt(value: string | undefined, fallback: number): number {
  if (!value?.trim()) return fallback;
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getSentinelEnvConfig(): SentinelEnvConfig {
  const mode = (process.env.SENTINEL_PROVIDER_MODE ?? process.env.SENTINEL_PROVIDER ?? "local").trim().toLowerCase();
  const defaultProvider = (process.env.SENTINEL_DEFAULT_PROVIDER ?? process.env.SENTINEL_PRIMARY_PROVIDER ?? "local").trim().toLowerCase();
  const allowPaidApi = envBool(process.env.SENTINEL_ALLOW_PAID_API, false);
  const allowCustomApi = envBool(process.env.SENTINEL_ALLOW_CUSTOM_API, false);
  const normalizedMode: SentinelRouterMode =
    mode === "local" || mode === "openai" || mode === "anthropic" || mode === "custom" ? mode : "auto";
  const normalizedProvider: SentinelProviderId =
    defaultProvider === "openai" || defaultProvider === "anthropic" || defaultProvider === "custom" ? defaultProvider : "local";
  const enforcedMode: SentinelRouterMode = !allowPaidApi && !allowCustomApi ? "local" : normalizedMode;
  const enforcedProvider: SentinelProviderId = !allowPaidApi && !allowCustomApi ? "local" : normalizedProvider;

  return {
    mode: enforcedMode,
    defaultProvider: enforcedProvider,
    allowPaidApi,
    allowCustomApi,
    requireLocalFallback: envBool(process.env.SENTINEL_REQUIRE_LOCAL_FALLBACK, true),
    localTimeoutMs: envInt(process.env.SENTINEL_LOCAL_TIMEOUT_MS, 30_000),
    partnerMode: envBool(process.env.SENTINEL_PARTNER_MODE, false),
    brainPath: getCapitalifeBrainPath(),
    brainContextEnabled: envBool(process.env.SENTINEL_BRAIN_CONTEXT_ENABLED, true),
    ollamaBaseUrl: envText(process.env.OLLAMA_BASE_URL) ?? envText(process.env.OLLAMA_API_URL) ?? "http://localhost:11434",
    ollamaModel: envText(process.env.OLLAMA_MODEL) ?? envText(process.env.SENTINEL_DEFAULT_MODEL),
    ollamaThink: envBool(process.env.OLLAMA_THINK, false),
    openaiModel: envText(process.env.OPENAI_MODEL) ?? envText(process.env.OPENAI_DEFAULT_MODEL),
    anthropicModel: envText(process.env.ANTHROPIC_MODEL),
    customModel: envText(process.env.CUSTOM_CHAT_MODEL),
    customApiUrl: envText(process.env.CUSTOM_CHAT_API_URL),
  };
}

export function getBrainContextStatus(config = getSentinelEnvConfig()): BrainContextStatus {
  if (!config.brainContextEnabled) {
    return {
      available: false,
      loaded: false,
      pathConfigured: Boolean(config.brainPath),
      path: config.brainPath,
      mode: "generic",
      message: "Brain context disabled",
    };
  }

  if (!config.brainPath) {
    return {
      available: false,
      loaded: false,
      pathConfigured: false,
      path: null,
      mode: "generic",
      message: "Brain path missing",
    };
  }

  const brainFile = path.join(config.brainPath, "09_AI", "AI_PROJECT_BRAIN_CURRENT.md");
  const snapshotFile = path.join(config.brainPath, "09_AI", "dashboard_snapshot.json");
  const available = fs.existsSync(brainFile) && fs.existsSync(snapshotFile);

  if (available) {
    return {
      available: true,
      loaded: true,
      pathConfigured: true,
      path: config.brainPath,
      mode: "capitalife",
      message: "Brain loaded",
    };
  }

  return {
    available: false,
    loaded: false,
    pathConfigured: true,
    path: config.brainPath,
    mode: config.partnerMode ? "generic" : "capitalife",
    message: config.partnerMode
      ? "Brain context unavailable, running generic/local context mode"
      : "Brain context missing",
  };
}

export function buildProviderStatus(
  provider: Pick<ProviderStatus, "id" | "label" | "type" | "supportsStreaming">,
  health: {
    configured: boolean;
    enabled: boolean;
    available: boolean;
    usable: boolean;
    reason: ProviderStatus["reason"];
    message: string;
    model: string | null;
  },
  activeProvider: SentinelProviderId | null,
): ProviderStatus {
  return {
    ...provider,
    configured: health.configured,
    enabled: health.enabled,
    available: health.available,
    usable: health.usable,
    reason: health.reason,
    message: health.message,
    model: health.model,
    active: activeProvider === provider.id,
  };
}
