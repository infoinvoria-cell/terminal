/**
 * SENTINEL RESTART PERSISTENCE TESTS
 *
 * Verifies that usage data persists across process restarts.
 * Uses an isolated tmpDir so this suite never touches the real .runtime/sentinel
 * store — eliminates interference from parallel vitest workers.
 *
 * Test flow:
 *   1. Read current values (before state)
 *   2. Record a request (writes to disk atomically via writeFileSync → renameSync)
 *   3. Spawn a fresh node process that reads the file (simulates fresh server start)
 *   4. Verify fresh process sees the same value as the current process
 *   5. Record another request (post-restart increment)
 *   6. Verify counters continue from persisted state (not reset)
 */

import { describe, it, expect, afterAll, beforeAll, vi } from "vitest";
import { execSync } from "child_process";
import { existsSync, readFileSync, mkdtempSync, rmSync } from "fs";
import path from "path";
import os from "os";

// ---------------------------------------------------------------------------
// Isolated store — fresh tmpDir per run, never touches real .runtime/sentinel
// ---------------------------------------------------------------------------

let tmpDir: string;
let STORE_PATH: string;

// Bound to the fresh module instance loaded in beforeAll
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let storeModule: any;

const TEST_PROVIDER = `test-restart-${Date.now()}`;

beforeAll(async () => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "restart-test-"));
  STORE_PATH = path.join(tmpDir, ".runtime", "sentinel", "provider-usage.json");

  // Load usage-store with mocked cwd so its STORE_PATH constant bakes in tmpDir
  vi.resetModules();
  vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
  storeModule = await import("@/lib/sentinel/store/usage-store");
  // Restore cwd — STORE_PATH is already computed in the module
  vi.restoreAllMocks();
});

afterAll(() => {
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function readStoreFile(): Record<string, { requestCount: number; inputTokens: number; outputTokens: number }> {
  if (!existsSync(STORE_PATH)) return {};
  try {
    return JSON.parse(readFileSync(STORE_PATH, "utf-8")) as Record<string, { requestCount: number; inputTokens: number; outputTokens: number }>;
  } catch {
    return {};
  }
}

function readProviderFromFreshProcess(provider: string): {
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
} {
  // Spawn a NEW node process — no module cache, no in-memory state.
  // Paths passed via env to avoid Windows quoting issues with backslashes.
  const inlineScript = [
    "const fs=require('fs');",
    "const p=process.env.STORE_PATH;",
    "let d={};",
    "try{d=JSON.parse(fs.readFileSync(p,'utf-8'));}catch{}",
    "const k=process.env.PROV_KEY+':'+new Date().toISOString().slice(0,10);",
    "const e=d[k]||{requestCount:0,inputTokens:0,outputTokens:0};",
    "console.log(JSON.stringify({requestCount:e.requestCount,inputTokens:e.inputTokens,outputTokens:e.outputTokens}));",
  ].join("");

  const output = execSync(`node -e "${inlineScript}"`, {
    encoding: "utf-8",
    timeout: 10_000,
    env: { ...process.env, STORE_PATH, PROV_KEY: provider },
  }).trim();

  return JSON.parse(output) as { requestCount: number; inputTokens: number; outputTokens: number };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Usage store — restart persistence", () => {
  it("1. Before state: fresh provider has zero requests and tokens", () => {
    const before = storeModule.getProviderState(TEST_PROVIDER);
    expect(before.requestCount).toBe(0);
    expect(before.inputTokens).toBe(0);
    expect(before.outputTokens).toBe(0);
  });

  it("2. recordRequest writes to disk atomically", () => {
    storeModule.recordRequest({
      provider: TEST_PROVIDER,
      inputTokens: 100,
      outputTokens: 42,
      success: true,
    });

    const store = readStoreFile();
    const key = `${TEST_PROVIDER}:${today()}`;
    expect(store[key]).toBeDefined();
    expect(store[key]!.requestCount).toBe(1);
    expect(store[key]!.inputTokens).toBe(100);
    expect(store[key]!.outputTokens).toBe(42);
  });

  it("3. Fresh child process (= server restart) reads the persisted value", () => {
    storeModule.recordRequest({
      provider: TEST_PROVIDER,
      inputTokens: 50,
      outputTokens: 20,
      success: true,
    });

    const currentCount = storeModule.getDailyRequests(TEST_PROVIDER);
    const currentTokens = storeModule.getDailyTokens(TEST_PROVIDER);

    const fromFreshProcess = readProviderFromFreshProcess(TEST_PROVIDER);

    expect(fromFreshProcess.requestCount).toBe(currentCount);
    expect(fromFreshProcess.inputTokens + fromFreshProcess.outputTokens).toBe(currentTokens);
  });

  it("4. Today's counts are unchanged after simulated restart", () => {
    const countBeforeRestart = storeModule.getDailyRequests(TEST_PROVIDER);
    const tokensBeforeRestart = storeModule.getDailyTokens(TEST_PROVIDER);

    const fromFreshProcess = readProviderFromFreshProcess(TEST_PROVIDER);

    expect(fromFreshProcess.requestCount).toBe(countBeforeRestart);
    expect(fromFreshProcess.inputTokens + fromFreshProcess.outputTokens).toBe(tokensBeforeRestart);
  });

  it("5. Post-restart: new requests increment from persisted state (not from zero)", () => {
    const countBeforeRestart = storeModule.getDailyRequests(TEST_PROVIDER);

    const fromFreshProcess = readProviderFromFreshProcess(TEST_PROVIDER);
    expect(fromFreshProcess.requestCount).toBe(countBeforeRestart);

    storeModule.recordRequest({
      provider: TEST_PROVIDER,
      inputTokens: 25,
      outputTokens: 10,
      success: true,
    });

    const countAfter = storeModule.getDailyRequests(TEST_PROVIDER);

    expect(countAfter).toBe(countBeforeRestart + 1);
    expect(countAfter).toBeGreaterThan(1);
  });

  it("6. Atomic write: .tmp file is absent after successful write (no partial-write artifact)", () => {
    const tmpPath = STORE_PATH + ".tmp";
    storeModule.recordRequest({
      provider: TEST_PROVIDER,
      inputTokens: 1,
      outputTokens: 1,
      success: true,
    });
    expect(existsSync(tmpPath)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Cross-provider isolation: one provider's usage does not affect another
// ---------------------------------------------------------------------------

describe("Usage store — provider isolation across restart", () => {
  const PROVIDER_A = `test-isolation-a-${Date.now()}`;
  const PROVIDER_B = `test-isolation-b-${Date.now()}`;

  it("Provider A's usage does not bleed into Provider B after restart", () => {
    storeModule.recordRequest({ provider: PROVIDER_A, inputTokens: 500, outputTokens: 200, success: true });
    storeModule.recordRequest({ provider: PROVIDER_A, inputTokens: 300, outputTokens: 100, success: true });

    const countB = storeModule.getDailyRequests(PROVIDER_B);
    expect(countB).toBe(0);

    const aFromFresh = readProviderFromFreshProcess(PROVIDER_A);
    const bFromFresh = readProviderFromFreshProcess(PROVIDER_B);

    expect(aFromFresh.requestCount).toBe(2);
    expect(bFromFresh.requestCount).toBe(0);
    expect(aFromFresh.inputTokens).toBe(800);
    expect(bFromFresh.inputTokens).toBe(0);
  });
});
