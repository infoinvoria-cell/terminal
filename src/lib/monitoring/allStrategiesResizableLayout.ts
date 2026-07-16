export const ALL_STRATEGIES_RESIZABLE_COLUMNS_KEY = "monitoring.allStrategies.resizableColumns.v2";

export const ALL_STRATEGIES_COLUMN_SPLIT_DEFAULT = 50;
export const ALL_STRATEGIES_ROWS_DEFAULT: [number, number, number] = [32, 34, 34];

export const ALL_STRATEGIES_COL_MIN = 32;
export const ALL_STRATEGIES_COL_MAX = 68;
export const ALL_STRATEGIES_ROW_MIN = 18;
export const ALL_STRATEGIES_ROW_MAX = 55;

export type AllStrategiesResizableLayoutState = {
  columnSplit: number;
  leftRows: [number, number, number];
  rightRows: [number, number, number];
};

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function defaultAllStrategiesResizableLayout(): AllStrategiesResizableLayoutState {
  return {
    columnSplit: ALL_STRATEGIES_COLUMN_SPLIT_DEFAULT,
    leftRows: [...ALL_STRATEGIES_ROWS_DEFAULT],
    rightRows: [...ALL_STRATEGIES_ROWS_DEFAULT],
  };
}

function isValidRowTriple(rows: number[]): rows is [number, number, number] {
  if (rows.length !== 3 || rows.some((value) => !Number.isFinite(value))) return false;
  const [r1, r2, r3] = rows;
  const sum = r1 + r2 + r3;
  if (Math.abs(sum - 100) > 0.25) return false;
  return (
    r1 >= ALL_STRATEGIES_ROW_MIN && r1 <= ALL_STRATEGIES_ROW_MAX
    && r2 >= ALL_STRATEGIES_ROW_MIN && r2 <= ALL_STRATEGIES_ROW_MAX
    && r3 >= ALL_STRATEGIES_ROW_MIN && r3 <= ALL_STRATEGIES_ROW_MAX
  );
}

export function parsePersistedAllStrategiesResizableLayout(raw: unknown): AllStrategiesResizableLayoutState | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const columnSplit = Number(obj.columnSplit ?? obj.column);
  const leftRowsRaw = Array.isArray(obj.leftRows) ? obj.leftRows.map(Number) : null;
  const rightRowsRaw = Array.isArray(obj.rightRows) ? obj.rightRows.map(Number) : null;
  const legacyRowsRaw = Array.isArray(obj.rows) ? obj.rows.map(Number) : null;

  if (!Number.isFinite(columnSplit)) return null;
  if (columnSplit < ALL_STRATEGIES_COL_MIN || columnSplit > ALL_STRATEGIES_COL_MAX) return null;

  let leftRows = leftRowsRaw;
  let rightRows = rightRowsRaw;
  if ((!leftRows || !rightRows) && legacyRowsRaw) {
    leftRows = legacyRowsRaw;
    rightRows = legacyRowsRaw;
  }
  if (!leftRows || !rightRows || !isValidRowTriple(leftRows) || !isValidRowTriple(rightRows)) {
    return null;
  }

  return {
    columnSplit: round2(columnSplit),
    leftRows: [round2(leftRows[0]), round2(leftRows[1]), round2(leftRows[2])],
    rightRows: [round2(rightRows[0]), round2(rightRows[1]), round2(rightRows[2])],
  };
}

export function adjustRowPair(first: number, second: number, delta: number): [number, number] {
  const total = first + second;
  const minFirst = Math.max(ALL_STRATEGIES_ROW_MIN, total - ALL_STRATEGIES_ROW_MAX);
  const maxFirst = Math.min(ALL_STRATEGIES_ROW_MAX, total - ALL_STRATEGIES_ROW_MIN);
  const nextFirst = clamp(first + delta, minFirst, maxFirst);
  return [round2(nextFirst), round2(total - nextFirst)];
}

export function persistAllStrategiesResizableLayout(layout: AllStrategiesResizableLayoutState): void {
  try {
    window.localStorage.setItem(ALL_STRATEGIES_RESIZABLE_COLUMNS_KEY, JSON.stringify(layout));
  } catch {
    // ignore storage errors
  }
}

export function loadAllStrategiesResizableLayout(): AllStrategiesResizableLayoutState {
  const fallback = defaultAllStrategiesResizableLayout();
  try {
    const raw = window.localStorage.getItem(ALL_STRATEGIES_RESIZABLE_COLUMNS_KEY);
    if (!raw) return fallback;
    return parsePersistedAllStrategiesResizableLayout(JSON.parse(raw)) ?? fallback;
  } catch {
    return fallback;
  }
}
