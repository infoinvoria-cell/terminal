import fs from "node:fs";
import path from "node:path";
import { DATA_SOURCE_PATHS } from "@/config/data-sources";
import { getInvoriaDashboardPath } from "@/lib/brain/brain-path";
import { getMarketDataStatus } from "@/lib/market-data/tradingview-cache";

export type ServiceState = "ok" | "warn" | "missing" | "error" | "starting" | "stale";

export type LocalSystemHealth = {
  dashboard: {
    status: ServiceState;
    rootPath: string;
    hasPackageJson: boolean;
    hasEnvLocal: boolean;
  };
  brain: {
    status: ServiceState;
    path: string;
  };
  sentinel: {
    status: ServiceState;
    ollamaReachable: boolean;
    openaiConfigured: boolean;
    providerMode: string;
  };
  ollama: {
    status: ServiceState;
    url: string;
    models: string[];
  };
  marketData: {
    status: ServiceState;
    cacheDir: string;
    overallStatus: string;
    cacheAvailable: boolean;
  };
  invoriaCache: {
    status: ServiceState;
    invoriaPath: string;
    invoriaExists: boolean;
    cachePath: string;
    cacheExists: boolean;
  };
  timestamp: string;
};

const DASHBOARD_ROOT = process.cwd();
const PACKAGE_JSON_PATH = path.join(DASHBOARD_ROOT, "package.json");
const ENV_LOCAL_PATH = path.join(DASHBOARD_ROOT, ".env.local");
const OLLAMA_URL = process.env.OLLAMA_API_URL ?? "http://127.0.0.1:11434";
const INVORIA_PATH = getInvoriaDashboardPath();
const INVORIA_CACHE_PATH =
  process.env.TRADINGVIEW_CACHE_DIR?.trim() ??
  path.join(DASHBOARD_ROOT, ".capitalife-cache", "market-data", "tradingview");

async function getOllamaInfo() {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) {
      return { status: "warn" as const, models: [] };
    }
    const payload = (await response.json()) as {
      models?: { name?: string | null }[];
    };
    return {
      status: "ok" as const,
      models: (payload.models ?? []).map((entry) => entry.name).filter(Boolean) as string[],
    };
  } catch {
    return { status: "warn" as const, models: [] };
  }
}

export async function getLocalSystemHealth(): Promise<LocalSystemHealth> {
  const hasPackageJson = fs.existsSync(PACKAGE_JSON_PATH);
  const hasEnvLocal = fs.existsSync(ENV_LOCAL_PATH);
  const brainExists = DATA_SOURCE_PATHS.capitalifeBrain ? fs.existsSync(DATA_SOURCE_PATHS.capitalifeBrain) : false;
  const invoriaExists = INVORIA_PATH ? fs.existsSync(INVORIA_PATH) : false;
  const cacheExists = fs.existsSync(INVORIA_CACHE_PATH);
  const marketData = getMarketDataStatus();
  const ollama = await getOllamaInfo();

  return {
    dashboard: {
      status: hasPackageJson ? "ok" : "missing",
      rootPath: DASHBOARD_ROOT,
      hasPackageJson,
      hasEnvLocal,
    },
    brain: {
      status: brainExists ? "ok" : "missing",
      path: DATA_SOURCE_PATHS.capitalifeBrain ?? "Not configured",
    },
    sentinel: {
      status: ollama.status === "ok" || hasEnvLocal ? "ok" : "warn",
      ollamaReachable: ollama.status === "ok",
      openaiConfigured: Boolean(process.env.OPENAI_API_KEY?.trim()),
      providerMode: process.env.SENTINEL_PROVIDER ?? "auto",
    },
    ollama: {
      status: ollama.status,
      url: OLLAMA_URL,
      models: ollama.models,
    },
    marketData: {
      status:
        marketData.overallStatus === "ok"
          ? "ok"
          : marketData.overallStatus === "stale"
            ? "stale"
            : marketData.cacheAvailable
              ? "warn"
              : "missing",
      cacheDir: marketData.cacheDir ?? INVORIA_CACHE_PATH,
      overallStatus: marketData.overallStatus ?? "missing",
      cacheAvailable: marketData.cacheAvailable,
    },
    invoriaCache: {
      status: invoriaExists && cacheExists ? "ok" : invoriaExists || cacheExists ? "warn" : "missing",
      invoriaPath: INVORIA_PATH ?? "Not configured",
      invoriaExists,
      cachePath: INVORIA_CACHE_PATH,
      cacheExists,
    },
    timestamp: new Date().toISOString(),
  };
}
