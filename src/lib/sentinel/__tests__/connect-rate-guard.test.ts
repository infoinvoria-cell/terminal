// TPM aggregate rate-limit guard tests.
// Verifies that concurrent workers cannot double-count the remaining TPM budget,
// and that when the Groq budget is exhausted the call is blocked (not sent).
//
// These are deterministic unit tests — no network calls.
import { describe, it, expect, beforeEach } from "vitest";
import {
  reserveCapacity,
  reconcileUsage,
  getWindowState,
  _testSetReserved,
  _testResetWindow,
} from "../connect/provider-rate-guard";

const GROQ = "groq";
const GROQ_TPM = 8000;

beforeEach(() => {
  // Reset the Groq window to zero before each test (clean isolation)
  _testResetWindow(GROQ);
  _testResetWindow("mistral");
  _testResetWindow("cohere");
});

describe("reserveCapacity — basic reservation", () => {
  it("allows a small reservation when window is empty", () => {
    const ok = reserveCapacity(GROQ, 300, 200);
    expect(ok).toBe(true);
  });

  it("reservation is reflected in window state", () => {
    reserveCapacity(GROQ, 300, 200);
    const w = getWindowState(GROQ);
    expect(w.reservedTokens).toBe(500);
    expect(w.requests).toBe(1);
  });

  it("blocks reservation when combined would exceed TPM limit", () => {
    // Fill window to near-capacity
    _testSetReserved(GROQ, 7900); // 100 tokens remaining of 8000
    // Try to reserve 500 tokens total (400 input + 100 output) — would exceed
    const ok = reserveCapacity(GROQ, 400, 100);
    expect(ok).toBe(false);
  });

  it("window state is unchanged after a rejected reservation", () => {
    _testSetReserved(GROQ, 7900);
    const before = getWindowState(GROQ).reservedTokens;
    reserveCapacity(GROQ, 400, 100); // rejected
    const after = getWindowState(GROQ).reservedTokens;
    expect(after).toBe(before); // no change
  });

  it("allows reservation that exactly fills the remaining budget", () => {
    _testSetReserved(GROQ, 7500); // 500 remaining
    const ok = reserveCapacity(GROQ, 300, 200); // exactly 500
    expect(ok).toBe(true);
  });

  it("blocks reservation that exceeds budget by 1 token", () => {
    _testSetReserved(GROQ, 7500); // 500 remaining
    const ok = reserveCapacity(GROQ, 300, 201); // 501 total — over by 1
    expect(ok).toBe(false);
  });

  it("providers without known TPM limits always allowed", () => {
    const ok = reserveCapacity("unknown-free-provider", 5000, 2000);
    expect(ok).toBe(true);
  });
});

describe("reserveCapacity — concurrent worker atomicity", () => {
  // Simulate two concurrent workers both calling reserveCapacity before either await.
  // This mirrors Promise.all([runWorker(w1), runWorker(w2)]) where both workers
  // call reserveCapacity synchronously before their first await ask().

  it("two sequential reservations both see accumulated state (no double-counting)", () => {
    const ok1 = reserveCapacity(GROQ, 300, 200); // 500 total → window at 500
    const ok2 = reserveCapacity(GROQ, 300, 200); // 500 more → window at 1000
    expect(ok1).toBe(true);
    expect(ok2).toBe(true);
    expect(getWindowState(GROQ).reservedTokens).toBe(1000);
    expect(getWindowState(GROQ).requests).toBe(2);
  });

  it("second reservation correctly sees first reservation's cost when budget is tight", () => {
    _testSetReserved(GROQ, 7600); // 400 remaining
    const ok1 = reserveCapacity(GROQ, 200, 150); // 350 — fits, window → 7950
    const ok2 = reserveCapacity(GROQ, 100, 100); // 200 — would push to 8150, rejected
    expect(ok1).toBe(true);
    expect(ok2).toBe(false);
    // Window should only have the first reservation added
    expect(getWindowState(GROQ).reservedTokens).toBe(7950);
  });

  it("PAID=0 UNKNOWN=0: mistral (FREE) can still reserve when Groq is exhausted", () => {
    _testSetReserved(GROQ, 7900); // Groq exhausted
    const groqOk = reserveCapacity(GROQ, 400, 100);
    const mistralOk = reserveCapacity("mistral", 400, 100); // Mistral has no known TPM limit
    expect(groqOk).toBe(false);  // Groq blocked
    expect(mistralOk).toBe(true); // Mistral allowed — no limit applies
  });
});

describe("reconcileUsage — post-call reconciliation", () => {
  it("replaces estimated reservation with observed actual tokens", () => {
    reserveCapacity(GROQ, 500, 200); // reserved 700
    reconcileUsage(GROQ, 700, /* actualInput= */ 308, /* actualOutput= */ 1038);
    // reservedTokens = max(0, 700 - 700 + 1346) = 1346
    const w = getWindowState(GROQ);
    expect(w.reservedTokens).toBe(1346);
    expect(w.observedTokens).toBe(1346);
  });

  it("no-ops when observed values are undefined (call failed before provider responded)", () => {
    reserveCapacity(GROQ, 500, 200);
    const before = getWindowState(GROQ).reservedTokens;
    reconcileUsage(GROQ, 700, undefined, undefined);
    const after = getWindowState(GROQ).reservedTokens;
    expect(after).toBe(before); // unchanged — we keep the reserved estimate
  });

  it("no-ops for unknown provider (reconcileUsage on non-existent window is safe)", () => {
    expect(() => reconcileUsage("nonexistent", 500, 100, 200)).not.toThrow();
  });
});

describe("deterministic rate-limit fallback test", () => {
  // Core spec requirement: "if remaining Groq TPM budget too small → Groq call NOT made →
  // another FREE path or local fallback selected; PAID=0, UNKNOWN=0"

  it("Groq reservation rejected when budget is near-exhausted", () => {
    // Simulate a minute window already at 7700 tokens reserved
    _testSetReserved(GROQ, 7700);

    // Typical R+C worker would estimate ~300 input + 1024 output = ~1324 tokens
    const groqBlocked = !reserveCapacity(GROQ, 300, 1024);
    expect(groqBlocked).toBe(true); // Groq NOT called
  });

  it("Mistral (FREE) still available when Groq is blocked", () => {
    _testSetReserved(GROQ, 7700);

    const groqOk = reserveCapacity(GROQ, 300, 1024); // blocked
    const mistralOk = reserveCapacity("mistral", 300, 1024); // allowed — no TPM limit

    expect(groqOk).toBe(false);  // Groq blocked: PAID=0, UNKNOWN=0 preserved
    expect(mistralOk).toBe(true); // FREE fallback available
  });

  it("window TPM limit field is exposed correctly for diagnostics", () => {
    const w = getWindowState(GROQ);
    expect(w.tpmLimit).toBe(8000);
  });
});
