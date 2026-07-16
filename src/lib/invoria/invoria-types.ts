export type InvoriaBridgeMode = "readonly";

export type InvoriaSystemHealth = "healthy" | "degraded" | "offline" | "unknown";

export type InvoriaTelemetrySnapshot = {
  capturedAt: string;
  systemHealth: InvoriaSystemHealth;
  strategyCount?: number;
  activeAlerts?: number;
  notes?: string[];
};

export type InvoriaSourceDescriptor = {
  rootPath: string;
  bridgeMode: InvoriaBridgeMode;
  enabled: boolean;
  readOnly: true;
};

export type InvoriaReadonlyResult<T> = {
  source: "invoria-dashboard";
  readOnly: true;
  data: T | null;
  warnings: string[];
};
