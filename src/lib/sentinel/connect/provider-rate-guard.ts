// Process-local rolling token/request rate-limit guard.
// Tracks tokens reserved (synchronously, before the call) and reconciles with observed counts (after the call).
// NOT persisted across restarts — process-local memory, sufficient for local-first architecture.
//
// Key invariant: reserveCapacity() is synchronous → atomic between concurrent Promise.all workers.
// When worker A and worker B both start via Promise.all, worker A runs synchronously until its first await.
// reserveCapacity() has no await, so both workers reserve before either HTTP call is made.
// This prevents double-counting of remaining budget across concurrent workers (R+C, PARALLEL_ENSEMBLE).

type ProviderWindow = {
  // Tokens claimed (before responses arrive) — includes both estimate inputs + outputs
  reservedTokens: number;
  // Tokens confirmed via provider-reported usage (accumulated post-request)
  observedTokens: number;
  requests: number;
  windowStart: number; // epoch ms when this window opened
};

// Known account-level tokens-per-minute limits.
// These are RATE LIMITS, not model context windows — stored separately (see model-capabilities.ts).
const KNOWN_TPM: Record<string, number> = {
  groq: 8000,
};

// Known account-level requests-per-minute limits (conservative free-tier defaults).
const KNOWN_RPM: Record<string, number> = {
  groq: 30,
};

const WINDOW_MS = 60_000; // 1 minute rolling window

// Module-level state: one window per provider, reset after WINDOW_MS.
const windows: Record<string, ProviderWindow> = {};

function getOrResetWindow(provider: string): ProviderWindow {
  const now = Date.now();
  const w = windows[provider];
  if (!w || now - w.windowStart >= WINDOW_MS) {
    windows[provider] = { reservedTokens: 0, observedTokens: 0, requests: 0, windowStart: now };
  }
  return windows[provider]!;
}

/**
 * Reserve capacity for an upcoming provider call.
 * Returns false if the estimated usage would exceed the known TPM or RPM for this minute window.
 * Mutates the window state synchronously — atomically safe across concurrent workers in Promise.all.
 *
 * If the provider has no known limit, always returns true (no restriction applied).
 */
export function reserveCapacity(
  provider: string,
  estimatedInputTokens: number,
  estimatedOutputTokens: number,
): boolean {
  const tpmLimit = KNOWN_TPM[provider];
  const rpmLimit = KNOWN_RPM[provider];
  const w = getOrResetWindow(provider);

  const estimatedTotal = estimatedInputTokens + estimatedOutputTokens;

  if (tpmLimit !== undefined && w.reservedTokens + estimatedTotal > tpmLimit) return false;
  if (rpmLimit !== undefined && w.requests + 1 > rpmLimit) return false;

  w.reservedTokens += estimatedTotal;
  w.requests += 1;
  return true;
}

/**
 * After a provider call completes, reconcile the reservation with actual observed counts.
 * Replaces the estimated reservation with observed real usage so future reservations are accurate.
 * Safe to call with undefined observed values (no-op in that case).
 */
export function reconcileUsage(
  provider: string,
  reservedEstimate: number,
  observedInputTokens: number | undefined,
  observedOutputTokens: number | undefined,
): void {
  const w = windows[provider];
  if (!w) return;
  const observed = (observedInputTokens ?? 0) + (observedOutputTokens ?? 0);
  if (observed > 0) {
    // Replace estimated reservation with real observed count
    w.reservedTokens = Math.max(0, w.reservedTokens - reservedEstimate + observed);
    w.observedTokens += observed;
  }
}

/**
 * Read the current window state for a provider (for tests and diagnostics).
 * Never used in production response paths.
 */
export function getWindowState(
  provider: string,
): ProviderWindow & { tpmLimit?: number; rpmLimit?: number } {
  const w = getOrResetWindow(provider);
  return { ...w, tpmLimit: KNOWN_TPM[provider], rpmLimit: KNOWN_RPM[provider] };
}

/**
 * FOR TESTING ONLY: manually set the reserved token count for a provider window.
 * Simulates a near-exhausted budget to verify the fallback path.
 * This function must never be imported or called from production code paths.
 */
export function _testSetReserved(provider: string, reservedTokens: number): void {
  const w = getOrResetWindow(provider);
  w.reservedTokens = reservedTokens;
}

/**
 * FOR TESTING ONLY: reset a provider's window to zero (clean state between tests).
 */
export function _testResetWindow(provider: string): void {
  delete windows[provider];
}
