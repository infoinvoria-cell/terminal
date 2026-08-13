import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import type { ExecutionBrokerSpec, TradeDirection } from "@/lib/trading/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type TradeExecutionMode = "paper" | "manual";
type TradeExecutionStatus =
  | "paper_created"
  | "manual_marked_executed"
  | "manual_ticket_copied";

type TradeExecutionPayload = {
  mode?: unknown;
  asset?: unknown;
  strategyId?: unknown;
  direction?: unknown;
  entry?: unknown;
  stopLoss?: unknown;
  takeProfit?: unknown;
  riskUsd?: unknown;
  quantity?: unknown;
  brokerSpec?: unknown;
  status?: unknown;
};

type TradingSafetyState = {
  globalTradingDisabled: boolean;
  paperTradingEnabled: boolean;
  liveTradingEnabled: boolean;
  manualTicketEnabled: boolean;
  paperOrderSubmissionAllowed: boolean;
  liveOrderSubmissionAllowed: boolean;
};

type TradeExecutionCatalog = {
  validStrategies: Set<string>;
  validAssets: Set<string>;
};

type IntentRecord = {
  intentId: string;
  createdAtUtc: string;
  mode: TradeExecutionMode;
  asset: string;
  strategyId: string | null;
  status: TradeExecutionStatus;
};

type NormalizedTradeExecutionRequest = {
  mode: TradeExecutionMode;
  asset: string;
  strategyId: string | null;
  direction: TradeDirection;
  entry: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  riskUsd: number | null;
  quantity: number | null;
  brokerSpec: ExecutionBrokerSpec | null;
  status: TradeExecutionStatus;
};

const ROUTES_PATH = path.join(
  process.cwd(),
  "public",
  "generated",
  "monitoring",
  "config",
  "strategy_runtime_routes.json",
);

function getIntentStorePath(): string {
  return process.env.TRADE_EXECUTION_INTENT_STORE_PATH
    ? path.resolve(process.env.TRADE_EXECUTION_INTENT_STORE_PATH)
    : path.join(process.cwd(), ".runtime", "monitoring", "trade_execution_intents.json");
}

function parseBooleanEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw == null) return fallback;
  const value = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  return fallback;
}

export function getTradingSafetyState(): TradingSafetyState {
  const globalTradingDisabled = parseBooleanEnv("GLOBAL_TRADING_DISABLED", true);
  const paperTradingEnabled = parseBooleanEnv("PAPER_TRADING_ENABLED", false);
  const liveTradingEnabled = parseBooleanEnv("LIVE_TRADING_ENABLED", false);
  const manualTicketEnabled = parseBooleanEnv("MANUAL_TICKET_ENABLED", true);

  return {
    globalTradingDisabled,
    paperTradingEnabled,
    liveTradingEnabled,
    manualTicketEnabled,
    paperOrderSubmissionAllowed: !globalTradingDisabled && paperTradingEnabled,
    liveOrderSubmissionAllowed: !globalTradingDisabled && liveTradingEnabled,
  };
}

function toFiniteOrNull(value: unknown): number | null {
  const numeric = typeof value === "string" && value.trim() === "" ? Number.NaN : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeAssetCode(value: unknown): string {
  return normalizeText(value).toUpperCase().replace(/[^A-Z0-9!]/g, "");
}

async function loadTradeExecutionCatalog(): Promise<TradeExecutionCatalog> {
  try {
    const raw = await fs.readFile(ROUTES_PATH, "utf8");
    const parsed = JSON.parse(raw) as {
      routes?: Array<{ strategyId?: string; asset?: string; tvSymbol?: string }>;
    };
    const validStrategies = new Set<string>();
    const validAssets = new Set<string>();

    for (const route of parsed.routes ?? []) {
      const strategyId = normalizeText(route.strategyId);
      const asset = normalizeAssetCode(route.asset);
      const tvAsset = normalizeAssetCode(String(route.tvSymbol || "").split(":").at(-1));
      if (strategyId) validStrategies.add(strategyId);
      if (asset) validAssets.add(asset);
      if (tvAsset) validAssets.add(tvAsset);
    }

    return { validStrategies, validAssets };
  } catch {
    return { validStrategies: new Set(), validAssets: new Set() };
  }
}

async function readIntentStore(): Promise<Record<string, IntentRecord>> {
  const intentStorePath = getIntentStorePath();
  try {
    const raw = await fs.readFile(intentStorePath, "utf8");
    return JSON.parse(raw) as Record<string, IntentRecord>;
  } catch {
    return {};
  }
}

async function persistIntentRecord(record: IntentRecord): Promise<{ duplicate: boolean }> {
  const intentStorePath = getIntentStorePath();
  const store = await readIntentStore();
  if (store[record.intentId]) {
    return { duplicate: true };
  }

  store[record.intentId] = record;
  await fs.mkdir(path.dirname(intentStorePath), { recursive: true });
  await fs.writeFile(intentStorePath, JSON.stringify(store, null, 2));
  return { duplicate: false };
}

function normalizeBrokerSpec(value: unknown): ExecutionBrokerSpec | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;

  return {
    broker: normalizeText(input.broker),
    routeSymbol: normalizeText(input.routeSymbol),
    tickSize: toFiniteOrNull(input.tickSize),
    tickValue: toFiniteOrNull(input.tickValue),
    pointValue: toFiniteOrNull(input.pointValue),
    contractMultiplier: toFiniteOrNull(input.contractMultiplier),
    minOrderSize: toFiniteOrNull(input.minOrderSize),
    orderStep: toFiniteOrNull(input.orderStep),
    maxOrderSize: toFiniteOrNull(input.maxOrderSize),
    currency: normalizeText(input.currency),
    marginEstimate: toFiniteOrNull(input.marginEstimate),
    commissionEstimate: toFiniteOrNull(input.commissionEstimate),
    slippageEstimate: toFiniteOrNull(input.slippageEstimate),
  };
}

function normalizeTradeExecutionPayload(body: TradeExecutionPayload): NormalizedTradeExecutionRequest | null {
  const mode = body.mode === "paper" || body.mode === "manual" ? body.mode : null;
  const direction = body.direction === "long" || body.direction === "short" ? body.direction : null;
  const status =
    body.status === "paper_created"
    || body.status === "manual_marked_executed"
    || body.status === "manual_ticket_copied"
      ? body.status
      : null;

  if (!mode || !direction || !status) return null;

  return {
    mode,
    asset: normalizeText(body.asset),
    strategyId: normalizeText(body.strategyId) || null,
    direction,
    entry: toFiniteOrNull(body.entry),
    stopLoss: toFiniteOrNull(body.stopLoss),
    takeProfit: toFiniteOrNull(body.takeProfit),
    riskUsd: toFiniteOrNull(body.riskUsd),
    quantity: toFiniteOrNull(body.quantity),
    brokerSpec: normalizeBrokerSpec(body.brokerSpec),
    status,
  };
}

export function buildTradeExecutionIntentId(input: NormalizedTradeExecutionRequest): string {
  const digest = createHash("sha256")
    .update(JSON.stringify({
      mode: input.mode,
      asset: input.asset,
      strategyId: input.strategyId,
      direction: input.direction,
      entry: input.entry,
      stopLoss: input.stopLoss,
      takeProfit: input.takeProfit,
      riskUsd: input.riskUsd,
      quantity: input.quantity,
      routeSymbol: input.brokerSpec?.routeSymbol ?? null,
      status: input.status,
    }))
    .digest("hex");

  return `te_${digest.slice(0, 20)}`;
}

export function validateTradeExecutionRequest(
  input: NormalizedTradeExecutionRequest,
  safety: TradingSafetyState,
  catalog: TradeExecutionCatalog,
): string[] {
  const issues: string[] = [];

  if (!input.asset) issues.push("Asset fehlt.");
  if (input.entry == null) issues.push("Entry fehlt.");
  if (input.asset && catalog.validAssets.size > 0 && !catalog.validAssets.has(normalizeAssetCode(input.asset))) {
    issues.push("Unbekanntes Asset.");
  }
  if (input.strategyId && catalog.validStrategies.size > 0 && !catalog.validStrategies.has(input.strategyId)) {
    issues.push("Unbekannte Strategie.");
  }
  if (input.quantity == null) issues.push("Quantity fehlt.");
  if (input.quantity != null && input.quantity <= 0) issues.push("Quantity muss positiv sein.");
  if (input.riskUsd != null && input.riskUsd < 0) issues.push("Risk USD darf nicht negativ sein.");
  if (input.mode === "paper" && input.stopLoss == null) issues.push("Stop Loss fehlt fuer Paper Trade.");
  if (input.mode === "paper" && input.takeProfit == null) issues.push("Take Profit fehlt fuer Paper Trade.");

  if (input.mode === "paper" && !safety.paperOrderSubmissionAllowed) {
    issues.push(
      safety.globalTradingDisabled
        ? "Paper Trading ist blockiert: GLOBAL_TRADING_DISABLED=true."
        : "Paper Trading ist nicht aktiviert: PAPER_TRADING_ENABLED=false.",
    );
  }

  if (input.mode === "manual" && !safety.manualTicketEnabled) {
    issues.push("Manual Ticket Logging ist deaktiviert.");
  }

  if (safety.liveOrderSubmissionAllowed) {
    issues.push("Live Trading darf hier nicht verarbeitet werden.");
  }

  return issues;
}

export async function GET() {
  const safety = getTradingSafetyState();

  return NextResponse.json({
    ok: true,
    action: "status",
    message: safety.paperOrderSubmissionAllowed
      ? "Paper Trading ist freigegeben."
      : "Trading Safety aktiv. Live bleibt deaktiviert.",
    safety,
  });
}

export async function POST(request: NextRequest) {
  let body: TradeExecutionPayload;

  try {
    body = (await request.json()) as TradeExecutionPayload;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        action: "invalid_request",
        message: "Ungueltiger JSON-Body.",
      },
      { status: 400 },
    );
  }

  const normalized = normalizeTradeExecutionPayload(body);
  if (!normalized) {
    return NextResponse.json(
      {
        ok: false,
        action: "invalid_request",
        message: "Ungueltige Trade-Execution-Anfrage.",
      },
      { status: 400 },
    );
  }

  const [safety, catalog] = await Promise.all([
    Promise.resolve(getTradingSafetyState()),
    loadTradeExecutionCatalog(),
  ]);
  const blockedReasons = validateTradeExecutionRequest(normalized, safety, catalog);
  const intentId = buildTradeExecutionIntentId(normalized);

  if (blockedReasons.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        action: "blocked",
        message: blockedReasons[0],
        blockedReasons,
        intentId,
        safety,
      },
      { status: 403 },
    );
  }

  const persistence = await persistIntentRecord({
    intentId,
    createdAtUtc: new Date().toISOString(),
    mode: normalized.mode,
    asset: normalized.asset,
    strategyId: normalized.strategyId,
    status: normalized.status,
  });

  if (persistence.duplicate) {
    return NextResponse.json(
      {
        ok: false,
        action: "blocked",
        message: "Duplicate intent abgelehnt.",
        blockedReasons: ["Duplicate intent abgelehnt."],
        intentId,
        safety,
      },
      { status: 409 },
    );
  }

  return NextResponse.json({
    ok: true,
    action: normalized.mode === "paper" ? "paper_preview_logged" : "manual_logged",
    message:
      normalized.mode === "paper"
        ? "Paper Trade validiert. Kein Live-Submit ausgefuehrt."
        : "Manueller Execution-Status protokolliert.",
    intentId,
    safety,
    preview: {
      mode: normalized.mode,
      asset: normalized.asset,
      strategyId: normalized.strategyId,
      direction: normalized.direction,
      quantity: normalized.quantity,
      riskUsd: normalized.riskUsd,
      status: normalized.status,
      routeSymbol: normalized.brokerSpec?.routeSymbol ?? null,
    },
  });
}
