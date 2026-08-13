/**
 * Server-only MT5 snapshot reader for Account 2 (Vantage).
 * Validates the snapshot written by tools/mt5-account-2/mt5_snapshot.py.
 *
 * NEVER logs field values. NEVER exposes credentials.
 * Server-only: do not import from client components.
 */

import { readFileSync, existsSync } from "fs";
import { resolve, normalize } from "path";

// ── Constants ─────────────────────────────────────────────────────────────────

export const MT5_SNAPSHOT_SCHEMA_VERSION = 1;
export const MAX_SNAPSHOT_AGE_SECONDS    = 86_400; // 24 hours

/** Safe runtime base for snapshots — must stay inside .runtime/ */
const SAFE_PATH_SEGMENT = ".runtime";

// ── Types ─────────────────────────────────────────────────────────────────────

export type Mt5PositionRaw = {
  ticket:          number;
  identifier:      number;
  symbol:          string;
  position_type:   string;
  volume:          number;
  open_time_epoch: number;
  open_price:      number;
  current_price:   number;
  stop_loss:       number;
  take_profit:     number;
  swap:            number;
  profit:          number;
  magic:           number;
  comment:         string;
};

export type Mt5DealRaw = {
  ticket:       number;
  order:        number;
  position_id:  number;
  symbol:       string;
  deal_type:    number;
  deal_entry:   number;
  volume:       number;
  time_epoch:   number;
  time_msc:     number;
  price:        number;
  commission:   number;
  swap:         number;
  fee:          number;
  profit:       number;
  magic:        number;
  reason:       number;
  comment:      string;
  external_id:  string;
  record_type:  string;
};

export type Mt5SnapshotRaw = {
  schema_version:     number;
  complete:           boolean;
  account_id:         string;
  platform:           string;
  broker:             string;
  login_masked:       string;
  server:             string;
  currency:           string;
  company:            string;
  leverage:           number;
  balance:            number;
  equity:             number;
  profit:             number;
  margin:             number;
  margin_free:        number;
  margin_level:       number;
  connected:          boolean;
  terminal_connected: boolean;
  trade_allowed:      boolean;
  positions:          Mt5PositionRaw[];
  generated_at_utc:   string;
  generated_at_epoch: number;
  mt5_package_version: string;
  terminal_version:   string;
};

export type Mt5HistoryRaw = {
  schema_version: number;
  account_id:     string;
  deals:          Mt5DealRaw[];
};

export type Mt5SnapshotResult = {
  snapshot:    Mt5SnapshotRaw;
  snapshotPath: string;
  historyPath?: string;
  history?:    Mt5HistoryRaw;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const FORBIDDEN_FIELDS = [
  "password", "investor_password", "secret", "token", "api_key",
];

function assertFinite(value: unknown, field: string): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`mt5-snapshot: field "${field}" must be a finite number`);
  }
}

// ── Main reader ───────────────────────────────────────────────────────────────

/**
 * Read, validate and return the MT5 Account 2 snapshot.
 * Throws a sanitized error (no credential values) on any validation failure.
 */
export function readMt5Snapshot(snapshotPath?: string): Mt5SnapshotResult {
  const resolvedPath = snapshotPath
    ? resolve(normalize(snapshotPath))
    : resolve(normalize(".runtime/track-record/account_2-snapshot.json"));

  // ── Path safety: must be inside .runtime/ ────────────────────────────────
  const safeBase = resolve(normalize(SAFE_PATH_SEGMENT));
  if (!resolvedPath.startsWith(safeBase + "\\") &&
      !resolvedPath.startsWith(safeBase + "/") &&
      resolvedPath !== safeBase) {
    throw new Error("mt5-snapshot: snapshot path must be inside .runtime/");
  }

  // ── File existence ────────────────────────────────────────────────────────
  if (!existsSync(resolvedPath)) {
    throw new Error("mt5-snapshot: snapshot file not found");
  }

  // ── Parse JSON ────────────────────────────────────────────────────────────
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(resolvedPath, "utf-8"));
  } catch {
    throw new Error("mt5-snapshot: invalid JSON");
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("mt5-snapshot: root must be a JSON object");
  }

  const raw = parsed as Record<string, unknown>;

  // ── Forbidden fields ──────────────────────────────────────────────────────
  for (const field of FORBIDDEN_FIELDS) {
    if (field in raw) {
      throw new Error(`mt5-snapshot: snapshot must not contain field "${field}"`);
    }
  }

  // ── schema_version ────────────────────────────────────────────────────────
  if (raw["schema_version"] !== MT5_SNAPSHOT_SCHEMA_VERSION) {
    throw new Error(
      `mt5-snapshot: schema_version must be ${MT5_SNAPSHOT_SCHEMA_VERSION}`
    );
  }

  // ── complete ──────────────────────────────────────────────────────────────
  if (raw["complete"] !== true) {
    throw new Error("mt5-snapshot: complete must be true");
  }

  // ── account_id ────────────────────────────────────────────────────────────
  if (raw["account_id"] !== "account_2") {
    throw new Error('mt5-snapshot: account_id must be "account_2"');
  }

  // ── platform ─────────────────────────────────────────────────────────────
  if (raw["platform"] !== "MT5") {
    throw new Error('mt5-snapshot: platform must be "MT5"');
  }

  // ── broker ────────────────────────────────────────────────────────────────
  if (raw["broker"] !== "Vantage") {
    throw new Error('mt5-snapshot: broker must be "Vantage"');
  }

  // ── login_masked ──────────────────────────────────────────────────────────
  const loginMasked = String(raw["login_masked"] ?? "");
  if (!/^\*{4}\d{1,4}$/.test(loginMasked)) {
    throw new Error(
      "mt5-snapshot: login_masked must match /^\\*{4}\\d{1,4}$/ (credentials not allowed)"
    );
  }

  // ── Freshness ─────────────────────────────────────────────────────────────
  const epoch = raw["generated_at_epoch"];
  if (typeof epoch !== "number" || epoch <= 0) {
    throw new Error("mt5-snapshot: generated_at_epoch must be a positive number");
  }
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (nowSeconds - epoch > MAX_SNAPSHOT_AGE_SECONDS) {
    throw new Error("mt5-snapshot: snapshot is stale (older than 24 hours)");
  }

  // ── connected / terminal_connected ───────────────────────────────────────
  if (raw["connected"] !== true) {
    throw new Error("mt5-snapshot: connected must be true");
  }
  if (raw["terminal_connected"] !== true) {
    throw new Error("mt5-snapshot: terminal_connected must be true");
  }

  // ── Numeric fields ────────────────────────────────────────────────────────
  for (const field of ["balance", "equity", "profit", "margin", "margin_free"]) {
    assertFinite(raw[field], field);
  }

  // ── Positions: no duplicates ──────────────────────────────────────────────
  const positions = Array.isArray(raw["positions"])
    ? (raw["positions"] as unknown[])
    : [];
  const posTickets = new Set<number>();
  for (const pos of positions) {
    const p = pos as Record<string, unknown>;
    const t = Number(p["ticket"]);
    if (posTickets.has(t)) {
      throw new Error(`mt5-snapshot: duplicate position ticket ${t}`);
    }
    posTickets.add(t);
  }

  const snapshot = raw as unknown as Mt5SnapshotRaw;

  // ── Read history (optional, validated separately) ─────────────────────────
  const historyPath = resolvedPath.replace(
    "account_2-snapshot.json",
    "account_2-history.json"
  );

  let history: Mt5HistoryRaw | undefined;
  if (existsSync(historyPath)) {
    try {
      const h = JSON.parse(readFileSync(historyPath, "utf-8")) as Mt5HistoryRaw;
      // Validate no duplicate deal tickets
      const dealTickets = new Set<number>();
      for (const deal of h.deals ?? []) {
        const t = Number(deal.ticket);
        if (dealTickets.has(t)) {
          throw new Error(`mt5-snapshot: duplicate deal ticket ${t}`);
        }
        dealTickets.add(t);
      }
      history = h;
    } catch (err) {
      // Re-throw validation errors; ignore parse errors for history
      if (err instanceof Error && err.message.startsWith("mt5-snapshot:")) {
        throw err;
      }
    }
  }

  return {
    snapshot,
    snapshotPath:  resolvedPath,
    historyPath:   existsSync(historyPath) ? historyPath : undefined,
    history,
  };
}
