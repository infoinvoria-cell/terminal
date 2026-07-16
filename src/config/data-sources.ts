import { getCapitalifeBrainPath, getInvoriaDashboardPath } from "@/lib/brain/brain-path";

export type DataSourceSystem =
  | "capitalife-brain"
  | "invoria-dashboard"
  | "fund-manager-dashboard";

export type DataSourceMode = "readonly" | "disabled";

export type DataSourceRecord = {
  id: string;
  system: DataSourceSystem;
  label: string;
  description: string;
  rootPath: string;
  sourceOfTruth: boolean;
  mode: DataSourceMode;
  enabled: boolean;
  capabilities: string[];
  constraints: string[];
};

const bridgeMode = (process.env.INVORIA_BRIDGE_MODE ?? "readonly") as DataSourceMode;
const bridgeEnabled = process.env.INVORIA_BRIDGE_ENABLED === "true";

export const DATA_SOURCE_PATHS = {
  capitalifeBrain: getCapitalifeBrainPath(),
  invoriaDashboard: getInvoriaDashboardPath(),
  fundManagerDashboard: process.cwd(),
} as const;

export const DATA_SOURCE_REGISTRY: DataSourceRecord[] = [
  {
    id: "capitalife-brain",
    system: "capitalife-brain",
    label: "Capitalife Brain",
    description: "Source of truth for documentation, governance, and approved reference data.",
    rootPath: DATA_SOURCE_PATHS.capitalifeBrain ?? "Set CAPITALIFE_BRAIN_PATH in .env.local",
    sourceOfTruth: true,
    mode: "readonly",
    enabled: true,
    capabilities: [
      "documentation",
      "data-room-index",
      "governance-register",
      "source-contracts",
    ],
    constraints: [
      "No secrets copied into dashboard repo",
      "No automated blind imports",
      "No execution authority",
    ],
  },
  {
    id: "invoria-dashboard",
    system: "invoria-dashboard",
    label: "Invoria Dashboard",
    description: "Technical source for monitoring, trading telemetry, and system status.",
    rootPath: DATA_SOURCE_PATHS.invoriaDashboard ?? "Optional: set INVORIA_DASHBOARD_PATH in .env.local",
    sourceOfTruth: true,
    mode: bridgeMode,
    enabled: bridgeEnabled,
    capabilities: [
      "monitoring",
      "telemetry",
      "strategy-status",
      "paper-trading-preparation",
    ],
    constraints: [
      "Read-only adapter only",
      "No order routing",
      "No live execution",
      "No secret discovery",
    ],
  },
  {
    id: "fund-manager-dashboard",
    system: "fund-manager-dashboard",
    label: "Capitalife Terminal",
    description: "Presentation layer that consumes approved bridge metadata only.",
    rootPath: DATA_SOURCE_PATHS.fundManagerDashboard,
    sourceOfTruth: false,
    mode: bridgeMode,
    enabled: true,
    capabilities: ["ui", "reporting", "manual-review-ready-views"],
    constraints: [
      "No source ownership for external systems",
      "No mutation of Capitalife Brain or Invoria data",
      "Bridge activation remains off by default",
    ],
  },
];

export function getDataSourceRecord(id: DataSourceRecord["id"]) {
  return DATA_SOURCE_REGISTRY.find((source) => source.id === id);
}
