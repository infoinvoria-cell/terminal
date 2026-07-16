import {
  DATA_SOURCE_REGISTRY,
  DATA_SOURCE_PATHS,
  getDataSourceRecord,
  type DataSourceRecord,
} from "@/config/data-sources";

export type SourceRegistrySnapshot = {
  bridgeEnabled: boolean;
  bridgeMode: string;
  sources: DataSourceRecord[];
};

export function createSourceRegistrySnapshot(): SourceRegistrySnapshot {
  return {
    bridgeEnabled: process.env.INVORIA_BRIDGE_ENABLED === "true",
    bridgeMode: process.env.INVORIA_BRIDGE_MODE ?? "readonly",
    sources: DATA_SOURCE_REGISTRY,
  };
}

export function getSourceOfTruthRecords() {
  return DATA_SOURCE_REGISTRY.filter((source) => source.sourceOfTruth);
}

export function resolveSourcePath(id: DataSourceRecord["id"]) {
  return getDataSourceRecord(id)?.rootPath ?? null;
}

export function validateReadonlyBridgeGuard() {
  const invoria = getDataSourceRecord("invoria-dashboard");
  const capitalife = getDataSourceRecord("capitalife-brain");

  return {
    ok: Boolean(invoria && capitalife),
    mode: process.env.INVORIA_BRIDGE_MODE ?? "readonly",
    enabled: process.env.INVORIA_BRIDGE_ENABLED === "true",
    paths: DATA_SOURCE_PATHS,
    restrictions: [
      "read-only access only",
      "manual review before any mapping changes",
      "no orders, execution, or writeback",
    ],
  };
}
