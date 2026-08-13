/**
 * GET /api/track-record/accounts
 *
 * Reads the pre-assembled .runtime/track-record/track-record.json and returns
 * a sanitized, schema-validated view. Never triggers a refresh, never reads env
 * vars, never outputs file paths or secrets.
 *
 * Server-only (Node.js runtime). No edge runtime.
 */

import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

// ── Forbidden key fragments (case-insensitive substring match) ────────────────

const FORBIDDEN_KEY_FRAGMENTS = [
  "password",
  "investor_password",
  "secret",
  "token",
  "api_key",
  "authorization",
];

function hasForbiddenKey(obj: unknown): string | null {
  if (!obj || typeof obj !== "object") return null;
  for (const key of Object.keys(obj as Record<string, unknown>)) {
    const kl = key.toLowerCase();
    for (const frag of FORBIDDEN_KEY_FRAGMENTS) {
      if (kl.includes(frag)) return key;
    }
    const nested = hasForbiddenKey((obj as Record<string, unknown>)[key]);
    if (nested) return `${key}.${nested}`;
  }
  return null;
}

// ── Minimal shape guard ───────────────────────────────────────────────────────

interface AccountEntry {
  accountId: string;
  platform: string;
  broker: string;
  loginMasked: string;
  server: string;
  currency: string;
  balance: number;
  equity: number;
  floatingProfit: number;
  connected: boolean;
  sourceFresh: boolean;
  generatedAtUtc: string;
  generatedAtEpoch: number;
}

interface TrackRecordFile {
  schemaVersion: number;
  generatedAtUtc: string;
  generatedAtEpoch?: number;
  accounts: AccountEntry[];
  sourceStatus: Record<string, { ok: boolean; reason?: string }>;
  kpis: Record<string, object>;
  closedTrades: object[];
  openPositions: object[];
  cashFlows: object[];
  balanceCurves: Record<string, object[]>;
  equitySnapshots: object[];
  warnings: string[];
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(): Promise<NextResponse> {
  // Resolve path relative to cwd — never hardcoded absolute
  const filePath = resolve(process.cwd(), ".runtime", "track-record", "track-record.json");

  // ── File exists ───────────────────────────────────────────────────────────
  if (!existsSync(filePath)) {
    return NextResponse.json(
      { error: "track_record_unavailable", reason: "file_not_found" },
      { status: 503 },
    );
  }

  // ── Parse JSON ────────────────────────────────────────────────────────────
  let raw: TrackRecordFile;
  try {
    raw = JSON.parse(readFileSync(filePath, "utf-8")) as TrackRecordFile;
  } catch {
    return NextResponse.json(
      { error: "track_record_unavailable", reason: "invalid_json" },
      { status: 503 },
    );
  }

  // ── Schema version ────────────────────────────────────────────────────────
  if (raw.schemaVersion !== 1) {
    return NextResponse.json(
      { error: "track_record_unavailable", reason: "schema_version_mismatch" },
      { status: 503 },
    );
  }

  // ── Accounts array ────────────────────────────────────────────────────────
  if (!Array.isArray(raw.accounts) || raw.accounts.length < 1) {
    return NextResponse.json(
      { error: "track_record_unavailable", reason: "no_accounts" },
      { status: 503 },
    );
  }

  // ── Array fields ──────────────────────────────────────────────────────────
  if (
    !Array.isArray(raw.closedTrades) ||
    !Array.isArray(raw.openPositions) ||
    !Array.isArray(raw.cashFlows)
  ) {
    return NextResponse.json(
      { error: "track_record_unavailable", reason: "invalid_structure" },
      { status: 503 },
    );
  }

  // ── Secret key scan ───────────────────────────────────────────────────────
  const forbiddenKey = hasForbiddenKey(raw);
  if (forbiddenKey) {
    return NextResponse.json(
      { error: "track_record_unavailable", reason: "secret_field_detected" },
      { status: 503 },
    );
  }

  // ── Login mask check ──────────────────────────────────────────────────────
  for (const acct of raw.accounts) {
    if (!acct.loginMasked || !acct.loginMasked.startsWith("****")) {
      return NextResponse.json(
        { error: "track_record_unavailable", reason: "unmasked_login_detected" },
        { status: 503 },
      );
    }
  }

  // ── Build sanitized account list (only allowed fields) ───────────────────
  const accounts = raw.accounts.map((a) => ({
    accountId:       a.accountId,
    platform:        a.platform,
    broker:          a.broker,
    loginMasked:     a.loginMasked,
    server:          a.server,
    currency:        a.currency,
    balance:         a.balance,
    equity:          a.equity,
    floatingProfit:  a.floatingProfit,
    connected:       a.connected,
    sourceFresh:     a.sourceFresh,
    generatedAtUtc:  a.generatedAtUtc,
    generatedAtEpoch:a.generatedAtEpoch,
  }));

  // ── Currency compatibility ─────────────────────────────────────────────────
  const currencies = [...new Set(accounts.map((a) => a.currency))];
  const compatible = currencies.length === 1;
  const currencyCompatibility = {
    compatible,
    currencies,
    combinedBalanceAvailable: compatible,
  };

  // ── Build response ────────────────────────────────────────────────────────
  const response = {
    generatedAtUtc:       raw.generatedAtUtc,
    schemaVersion:        raw.schemaVersion,
    accounts,
    sourceStatus:         raw.sourceStatus ?? {},
    kpis:                 raw.kpis ?? {},
    closedTrades:         raw.closedTrades,
    openPositions:        raw.openPositions,
    cashFlows:            raw.cashFlows,
    balanceCurves:        raw.balanceCurves ?? {},
    equitySnapshots:      Array.isArray(raw.equitySnapshots) ? raw.equitySnapshots : [],
    warnings:             Array.isArray(raw.warnings) ? raw.warnings : [],
    currencyCompatibility,
  };

  return NextResponse.json(response, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}
