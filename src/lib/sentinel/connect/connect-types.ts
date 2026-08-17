// Shared types for Sentinel Connect — no circular imports.

export type ConnectRoutingMode =
  | "LOCAL_ONLY"
  | "SINGLE_BEST"
  | "FASTEST_FREE"
  | "PARALLEL_ENSEMBLE"
  | "REASONER_PLUS_CRITIC"
  | "FALLBACK_CHAIN";

export type ConnectMode = "auto" | "local" | "deep";
