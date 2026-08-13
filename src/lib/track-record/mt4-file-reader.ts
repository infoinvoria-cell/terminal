/**
 * Server-only MT4 FILE-bridge reader.
 * Reads the snapshot written by CapitalifeTrackRecordBridge.mq4.
 * NEVER logs field values. NEVER exposes secrets.
 */

import { readFileSync, existsSync } from "fs";
import { resolve, normalize } from "path";

// ── Public types ──────────────────────────────────────────────────

export const SNAPSHOT_SCHEMA_VERSION = "1";
export const MAX_SNAPSHOT_AGE_SECONDS = 300; // 5 minutes default

export type Mt4SnapshotRaw = {
  schema_version: string;
  account_id: string;
  platform: string;
  broker: string;
  server: string;
  login_masked: string;
  account_currency: string;
  leverage: number;
  balance: number;
  equity: number;
  margin: number;
  free_margin: number;
  margin_level: number;
  floating_profit: number;
  connected: boolean;
  trade_allowed: boolean;
  generated_at_utc: string;
  server_time_epoch: number;
  gmt_time_epoch: number;
  local_time_epoch: number;
  server_utc_offset_seconds: number;
  complete: boolean;
};

export type Mt4HistoryRecord = {
  ticket: number;
  record_type: string;
  symbol: string;
  order_type: string;
  lots: number;
  open_time_server_epoch: number;
  close_time_server_epoch: number;
  open_price: number;
  close_price: number;
  stop_loss: number;
  take_profit: number;
  commission: number;
  swap: number;
  profit: number;
  magic_number: number;
  comment: string;
};

export type Mt4HistoryRaw = {
  schema_version: string;
  account_id: string;
  generated_at_utc: string;
  server_utc_offset_seconds: number;
  record_count: number;
  trades: Mt4HistoryRecord[];
  complete: boolean;
};

export type Mt4ReadResult = {
  ok: boolean;
  snapshot: Mt4SnapshotRaw | null;
  history: Mt4HistoryRaw | null;
  errors: string[];
  status: {
    fileFound: boolean;
    jsonValid: boolean;
    complete: boolean;
    fresh: boolean;
    connected: boolean;
    utcOffsetReceived: boolean;
    historyReceived: boolean;
    connectorReady: boolean;
  };
};

// ── Path resolution ───────────────────────────────────────────────

function resolveSnapshotPath(dataPath: string, accountId: string): string {
  const expected = resolve(
    normalize(dataPath),
    "MQL4", "Files", "capitalife",
    `${accountId}-snapshot.json`,
  );
  // Guard: resolved path must remain inside dataPath
  const root = resolve(normalize(dataPath));
  if (!expected.startsWith(root + "\\") && !expected.startsWith(root + "/")) {
    throw new Error("Path traversal detected");
  }
  return expected;
}

function resolveHistoryPath(dataPath: string, accountId: string): string {
  const expected = resolve(
    normalize(dataPath),
    "MQL4", "Files", "capitalife",
    `${accountId}-history.json`,
  );
  const root = resolve(normalize(dataPath));
  if (!expected.startsWith(root + "\\") && !expected.startsWith(root + "/")) {
    throw new Error("Path traversal detected");
  }
  return expected;
}

// ── Validators ────────────────────────────────────────────────────

function isFiniteNum(v: unknown): v is number {
  return typeof v === "number" && isFinite(v);
}

function isPositiveEpoch(v: unknown): v is number {
  return isFiniteNum(v) && (v as number) > 0;
}

function validateSnapshot(
  raw: unknown,
  accountId: string,
  maxAgeSeconds: number,
): { snap: Mt4SnapshotRaw | null; errors: string[] } {
  const errors: string[] = [];
  if (!raw || typeof raw !== "object") {
    return { snap: null, errors: ["snapshot is not an object"] };
  }
  const s = raw as Record<string, unknown>;

  if (s.schema_version !== SNAPSHOT_SCHEMA_VERSION)
    errors.push(`unexpected schema_version: ${s.schema_version}`);
  if (s.account_id !== accountId)
    errors.push("account_id mismatch");
  if (s.platform !== "MT4")
    errors.push("platform is not MT4");
  if (s.complete !== true)
    errors.push("complete is not true");

  for (const field of ["balance", "equity", "margin", "free_margin", "floating_profit"] as const) {
    if (!isFiniteNum(s[field])) errors.push(`${field} is not a finite number`);
  }

  for (const field of ["server_time_epoch", "gmt_time_epoch", "local_time_epoch"] as const) {
    if (!isPositiveEpoch(s[field])) errors.push(`${field} is not a valid epoch`);
  }

  if (typeof s.server_utc_offset_seconds !== "number")
    errors.push("server_utc_offset_seconds missing");

  // Freshness check
  const nowEpoch = Math.floor(Date.now() / 1000);
  const snapEpoch = typeof s.gmt_time_epoch === "number" ? s.gmt_time_epoch : 0;
  if (nowEpoch - snapEpoch > maxAgeSeconds)
    errors.push(`snapshot is stale (age ${nowEpoch - snapEpoch}s > ${maxAgeSeconds}s)`);

  if (errors.length > 0) return { snap: null, errors };

  return { snap: s as unknown as Mt4SnapshotRaw, errors: [] };
}

function validateHistory(
  raw: unknown,
  accountId: string,
): { hist: Mt4HistoryRaw | null; errors: string[] } {
  const errors: string[] = [];
  if (!raw || typeof raw !== "object") {
    return { hist: null, errors: ["history is not an object"] };
  }
  const h = raw as Record<string, unknown>;

  if (h.account_id !== accountId) errors.push("history account_id mismatch");
  if (h.complete !== true) errors.push("history complete is not true");
  if (!Array.isArray(h.trades)) {
    errors.push("trades is not an array");
    return { hist: null, errors };
  }

  // Deduplicate check
  const tickets = new Set<number>();
  for (const t of h.trades as Mt4HistoryRecord[]) {
    if (typeof t.ticket !== "number") { errors.push("trade missing ticket"); continue; }
    if (tickets.has(t.ticket)) errors.push(`duplicate ticket: ${t.ticket}`);
    tickets.add(t.ticket);
  }

  if (errors.length > 0) return { hist: null, errors };
  return { hist: h as unknown as Mt4HistoryRaw, errors: [] };
}

// ── Main reader ───────────────────────────────────────────────────

export type Mt4FileReaderOptions = {
  dataPath: string;
  accountId: string;
  maxAgeSeconds?: number;
};

export function readMt4FileSnapshot(opts: Mt4FileReaderOptions): Mt4ReadResult {
  const { dataPath, accountId, maxAgeSeconds = MAX_SNAPSHOT_AGE_SECONDS } = opts;

  const result: Mt4ReadResult = {
    ok: false,
    snapshot: null,
    history: null,
    errors: [],
    status: {
      fileFound: false,
      jsonValid: false,
      complete: false,
      fresh: false,
      connected: false,
      utcOffsetReceived: false,
      historyReceived: false,
      connectorReady: false,
    },
  };

  // ── Resolve and guard path ────────────────────────────────────
  let snapPath: string;
  let histPath: string;
  try {
    snapPath = resolveSnapshotPath(dataPath, accountId);
    histPath = resolveHistoryPath(dataPath, accountId);
  } catch {
    result.errors.push("path traversal guard triggered");
    return result;
  }

  // ── Snapshot file ─────────────────────────────────────────────
  if (!existsSync(snapPath)) {
    result.errors.push("snapshot file not found");
    return result;
  }
  result.status.fileFound = true;

  let parsed: unknown;
  try {
    const raw = readFileSync(snapPath, "utf-8");
    parsed = JSON.parse(raw);
    result.status.jsonValid = true;
  } catch {
    result.errors.push("snapshot JSON parse error");
    return result;
  }

  result.status.complete = (parsed as Record<string, unknown>)?.complete === true;

  const { snap, errors: snapErrors } = validateSnapshot(parsed, accountId, maxAgeSeconds);
  result.errors.push(...snapErrors);

  if (snap) {
    result.snapshot = snap;
    result.status.fresh = true;
    result.status.connected = snap.connected;
    result.status.utcOffsetReceived = typeof snap.server_utc_offset_seconds === "number";
  }

  // ── History file (optional) ───────────────────────────────────
  if (existsSync(histPath)) {
    try {
      const rawHist = readFileSync(histPath, "utf-8");
      const parsedHist = JSON.parse(rawHist);
      const { hist, errors: histErrors } = validateHistory(parsedHist, accountId);
      if (hist) {
        result.history = hist;
        result.status.historyReceived = hist.trades.length > 0;
      }
      result.errors.push(...histErrors);
    } catch {
      result.errors.push("history JSON parse error");
    }
  }

  // ── Overall ready ─────────────────────────────────────────────
  result.status.connectorReady =
    result.status.fileFound &&
    result.status.jsonValid &&
    result.status.complete &&
    result.status.fresh &&
    result.status.connected &&
    result.status.utcOffsetReceived;

  result.ok = result.errors.length === 0 && result.status.connectorReady;

  return result;
}
