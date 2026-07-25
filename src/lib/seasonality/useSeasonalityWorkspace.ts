/**
 * Seasonality workspace persistence — plain localStorage utilities, no React state.
 * Stores the user's last UI selections so the page restores them after reload.
 *
 * Key: "seasonality.workspace.uiState.v1"
 * Scope: UI selections only. No computation results, no hover state, no loading flags.
 */

export const WORKSPACE_STORAGE_KEY = "seasonality.workspace.uiState.v1";

export type WorkspaceLockedPatternContext = {
  assetId:     string;
  startSlot:   number;
  holdingDays: number;
  direction:   "LONG" | "SHORT";
};

export type WorkspaceState = {
  selectedAssetId:    string;
  lookbackYears:      number;
  wfView:             "tester" | "scanner" | "strategy_engine" | "filter_lab";
  scannerTimeScope:   "month" | "quarter" | "year";
  scannerAssetScope:  "global" | "group" | "asset";
  testerTab:          "results" | "folds" | "config" | "audit";
  lockedPatternContext: WorkspaceLockedPatternContext | null;
  /** Active oscillator/scanner mode for the bottom chart strip. */
  oscillatorMode:     "WR" | "SR" | "QS";
};

const DEFAULTS: WorkspaceState = {
  selectedAssetId:    "wheat",
  lookbackYears:      20,
  wfView:             "tester",
  scannerTimeScope:   "month",
  scannerAssetScope:  "asset",
  testerTab:          "results",
  lockedPatternContext: null,
  oscillatorMode:     "WR" as const,
};

/** Read the full workspace state from localStorage. Falls back to DEFAULTS on any error. */
export function readWorkspaceState(): WorkspaceState {
  if (typeof window === "undefined") return { ...DEFAULTS };
  try {
    const raw = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<WorkspaceState>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    // Corrupt JSON — remove stale entry and return defaults
    try { window.localStorage.removeItem(WORKSPACE_STORAGE_KEY); } catch { /* ignore */ }
    return { ...DEFAULTS };
  }
}

/** Merge a partial patch into the stored workspace state. */
export function patchWorkspaceState(patch: Partial<WorkspaceState>): void {
  if (typeof window === "undefined") return;
  try {
    const current = readWorkspaceState();
    window.localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify({ ...current, ...patch }));
  } catch { /* storage blocked or quota exceeded — ignore silently */ }
}

/** Remove the workspace state entry entirely (reset to defaults on next load). */
export function clearWorkspaceState(): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(WORKSPACE_STORAGE_KEY); } catch { /* ignore */ }
}
