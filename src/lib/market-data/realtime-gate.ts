/**
 * RealtimeGate — On-Demand Real-Time Confirmation
 *
 * Activates a zero-delay price fetch ONLY when a signal is within the
 * final minutes of its candle and needs confirmation before entry.
 *
 * Rules:
 *  - Asset must have a dukascopyInstrument in the registry
 *  - Candle must be within CONFIRMATION_WINDOW_MS of close
 *  - Max MAX_CONCURRENT active confirmations at once
 *  - Per-asset cooldown of COOLDOWN_MS after each confirmation
 *  - Entire gate has a global rate budget shared with the Dukascopy provider
 *
 * NOT for permanent polling — call confirm() once per signal bar.
 */

import type { SignalConfirmContext, ConfirmationResult, ProviderId } from "./types"
import { getAssetById } from "./asset-registry"
import { fetchDukascopyQuote } from "./providers/dukascopy"

// ── Config ────────────────────────────────────────────────────────────────────

/** How close to candle close must we be to trigger confirmation (ms) */
const CONFIRMATION_WINDOW_MS = 12 * 60 * 1_000  // last 12 min of candle

/** Max concurrent active confirmations */
const MAX_CONCURRENT = 3

/** Per-asset cooldown after a confirmation attempt */
const COOLDOWN_MS = 60 * 1_000  // 1 min

// ── State ─────────────────────────────────────────────────────────────────────

const _active = new Set<string>()              // assetIds currently being confirmed
const _cooldowns = new Map<string, number>()   // assetId → cooldown expires at

// ── Helpers ───────────────────────────────────────────────────────────────────

function isInConfirmationWindow(candleCloseAt: string): boolean {
  const closeMs = new Date(candleCloseAt).getTime()
  const nowMs = Date.now()
  const remaining = closeMs - nowMs
  // Trigger if: candle closes in the next WINDOW ms, or closed <30s ago
  return remaining >= -30_000 && remaining <= CONFIRMATION_WINDOW_MS
}

function isCooldownActive(assetId: string): boolean {
  const expires = _cooldowns.get(assetId)
  return expires !== undefined && Date.now() < expires
}

function setCooldown(assetId: string): void {
  _cooldowns.set(assetId, Date.now() + COOLDOWN_MS)
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Attempt real-time signal confirmation for the given context.
 *
 * Returns a ConfirmationResult indicating whether the signal threshold
 * is satisfied by the current real-time price.
 *
 * Returns a result with confirmed=false and a reason string if the gate
 * is unavailable, rate-limited, or the asset doesn't support real-time.
 */
export async function confirmSignal(
  ctx: SignalConfirmContext,
): Promise<ConfirmationResult> {
  const base: Omit<ConfirmationResult, "confirmed" | "currentPrice" | "provider" | "delayMinutes"> = {
    thresholdPrice: ctx.thresholdPrice,
    direction: ctx.direction,
    checkedAt: new Date().toISOString(),
    reason: "",
  }

  // Lookup asset
  const asset = getAssetById(ctx.assetId)
  if (!asset || !asset.dukascopyInstrument) {
    return { ...base, confirmed: false, currentPrice: null,
      provider: "supabase_quotes", delayMinutes: 15,
      reason: `Asset ${ctx.assetId} has no real-time provider` }
  }

  // Candle window check
  if (!isInConfirmationWindow(ctx.candleCloseAt)) {
    return { ...base, confirmed: false, currentPrice: null,
      provider: "supabase_quotes", delayMinutes: 15,
      reason: `Outside confirmation window (candle closes ${ctx.candleCloseAt})` }
  }

  // Cooldown check
  if (isCooldownActive(ctx.assetId)) {
    return { ...base, confirmed: false, currentPrice: null,
      provider: "supabase_quotes", delayMinutes: 15,
      reason: `Asset ${ctx.assetId} is in cooldown` }
  }

  // Concurrency check
  if (_active.size >= MAX_CONCURRENT) {
    return { ...base, confirmed: false, currentPrice: null,
      provider: "supabase_quotes", delayMinutes: 15,
      reason: `Max concurrent confirmations (${MAX_CONCURRENT}) reached` }
  }

  // ── Fire Dukascopy ────────────────────────────────────────────────────
  _active.add(ctx.assetId)
  try {
    const quote = await fetchDukascopyQuote(asset.dukascopyInstrument)
    setCooldown(ctx.assetId)

    if (!quote) {
      return { ...base, confirmed: false, currentPrice: null,
        provider: "dukascopy", delayMinutes: 0,
        reason: "Dukascopy returned no data" }
    }

    const price = quote.mid

    // Threshold check
    const confirmed =
      ctx.direction === "long"
        ? price > ctx.thresholdPrice   // long: price must be above level
        : price < ctx.thresholdPrice   // short: price must be below level

    return {
      ...base,
      confirmed,
      currentPrice: price,
      provider: "dukascopy",
      delayMinutes: 0,
      reason: confirmed
        ? `${ctx.direction.toUpperCase()} confirmed: ${price} ${ctx.direction === "long" ? ">" : "<"} ${ctx.thresholdPrice}`
        : `${ctx.direction.toUpperCase()} NOT confirmed: ${price} ${ctx.direction === "long" ? "<=" : ">="} ${ctx.thresholdPrice}`,
    }
  } finally {
    _active.delete(ctx.assetId)
  }
}

/** How many confirmations are currently active */
export function activeConfirmations(): number {
  return _active.size
}

/** Active asset IDs */
export function activeAssets(): string[] {
  return [..._active]
}

/** Clear all state (for testing) */
export function resetGate(): void {
  _active.clear()
  _cooldowns.clear()
}
