import { DATA_SOURCE_PATHS } from "@/config/data-sources";
import type {
  InvoriaReadonlyResult,
  InvoriaSourceDescriptor,
  InvoriaTelemetrySnapshot,
} from "@/lib/invoria/invoria-types";

export function getInvoriaSourceDescriptor(): InvoriaSourceDescriptor {
  return {
    rootPath: DATA_SOURCE_PATHS.invoriaDashboard ?? "Optional: set INVORIA_DASHBOARD_PATH in .env.local",
    bridgeMode: "readonly",
    enabled: process.env.INVORIA_BRIDGE_ENABLED === "true",
    readOnly: true,
  };
}

export async function getInvoriaTelemetrySnapshot(): Promise<
  InvoriaReadonlyResult<InvoriaTelemetrySnapshot>
> {
  return {
    source: "invoria-dashboard",
    readOnly: true,
    data: null,
    warnings: [
      "Invoria bridge is prepared but not activated.",
      "No blind file import is allowed.",
      "Any future mapping must be explicitly reviewed and approved.",
    ],
  };
}

export function assertReadonlyInvoriaBridge() {
  return {
    canExecuteOrders: false,
    canWriteBack: false,
    canLoadSecrets: false,
    requiresManualApproval: true,
  };
}
