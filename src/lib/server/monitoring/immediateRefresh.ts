import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

type ImmediateRefreshLock = {
  running: boolean;
  startedAt: string | null;
};

const REFRESH_LOCK_STALE_MS = 30 * 60 * 1000;

declare global {
  // eslint-disable-next-line no-var
  var __monitoringImmediateRefreshLock__: ImmediateRefreshLock | undefined;
}

function getLock(): ImmediateRefreshLock {
  if (!globalThis.__monitoringImmediateRefreshLock__) {
    globalThis.__monitoringImmediateRefreshLock__ = { running: false, startedAt: null };
  }
  return globalThis.__monitoringImmediateRefreshLock__;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function repoRootCandidates(): string[] {
  const cwd = process.cwd();
  const extras = process.env.INVORIA_WORKSPACE_PATH ? [process.env.INVORIA_WORKSPACE_PATH] : [];
  return Array.from(new Set([
    ...extras,
    cwd,
    path.resolve(cwd, ".."),
    path.resolve(cwd, "..", ".."),
  ]));
}

async function resolveRefreshScript(): Promise<{ scriptPath: string; repoRoot: string } | null> {
  for (const root of repoRootCandidates()) {
    const fullWrapper = path.join(root, "workspace", "tools", "tradingview_data", "refresh_agri_full.py");
    if (await fileExists(fullWrapper)) {
      return { scriptPath: fullWrapper, repoRoot: root };
    }
    const candidate = path.join(root, "workspace", "tools", "tradingview_data", "refresh_all_assets.py");
    if (await fileExists(candidate)) {
      return { scriptPath: candidate, repoRoot: root };
    }
  }
  return null;
}

async function resolveFundManagerTvcScript(): Promise<string | null> {
  const cwd = process.cwd();
  const candidate = path.join(cwd, "tools", "monitoring", "refresh-tvc-cache.py");
  return (await fileExists(candidate)) ? candidate : null;
}

async function resolveIntradayLongPrimaryScript(repoRoot: string): Promise<string | null> {
  const candidate = path.join(repoRoot, "workspace", "tools", "rebuild_intraday_long_primary.py");
  return await fileExists(candidate) ? candidate : null;
}

// DAX live-OHLC fetch scripts (OANDA:DE30EUR 1H/2H via TradingView).
const DAX_FETCH_SPECS = [
  { tf: "1H", expectedMinutes: 60, script: ["workspace", "tools", "strategy_import", "engines", "fetch_intraday_1h_cache.py"], cache: ["1H", "OANDA_DE30EUR_1H.json"] },
  { tf: "2H", expectedMinutes: 120, script: ["workspace", "tools", "strategy_import", "engines", "fetch_intraday_2h_cache.py"], cache: ["2H", "OANDA_DE30EUR_2H.json"] },
] as const;

function daxCachePath(repoRoot: string, cache: readonly string[]): string {
  return path.join(repoRoot, "frontend", "public", "generated", "monitoring", "tradingview_data_cache", ...cache);
}

async function readCacheLastBar(filePath: string): Promise<string | null> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const json = JSON.parse(raw) as { bars?: Array<{ time?: string }> };
    const bars = json.bars ?? [];
    return bars.length ? String(bars[bars.length - 1]?.time ?? "") || null : null;
  } catch {
    return null;
  }
}

/** A freshly fetched intraday cache must parse, hold a real intraday history, and
 *  keep intraday cadence at the tail — never a sparse/daily file. */
async function isValidIntradayCache(filePath: string, expectedMinutes: number): Promise<boolean> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const json = JSON.parse(raw) as { bars?: Array<{ time?: string }> };
    const bars = json.bars ?? [];
    if (bars.length < 500) return false;
    const tail = bars.slice(-50);
    let intraday = 0;
    for (let i = 1; i < tail.length; i += 1) {
      const a = new Date(String(tail[i - 1].time)).getTime();
      const b = new Date(String(tail[i].time)).getTime();
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
      const deltaMin = Math.abs(b - a) / 60000;
      if (deltaMin > 0 && deltaMin <= expectedMinutes * 3) intraday += 1;
    }
    // Majority of recent deltas must be intraday cadence (not 1-bar-per-day).
    return intraday >= Math.floor((tail.length - 1) * 0.5);
  } catch {
    return false;
  }
}

type DaxFetchOutcome = {
  fetched: string[];
  restored: string[];
  errors: string[];
};

/** Fetch DAX 1H/2H live OHLC. Each cache is backed up first; on a failed fetch or an
 *  invalid (sparse/short) result, the previous valid cache is restored so the chart
 *  never loses good data. The subsequent rebuild merges the CSV backbone + live tail. */
async function fetchDaxLiveOhlc(
  python: { command: string; args: string[] },
  repoRoot: string,
): Promise<DaxFetchOutcome> {
  const outcome: DaxFetchOutcome = { fetched: [], restored: [], errors: [] };
  for (const spec of DAX_FETCH_SPECS) {
    const scriptPath = path.join(repoRoot, ...spec.script);
    if (!(await fileExists(scriptPath))) {
      outcome.errors.push(`${spec.tf}: fetch script missing`);
      continue;
    }
    const cachePath = daxCachePath(repoRoot, spec.cache);
    let backup: string | null = null;
    try {
      backup = await fs.readFile(cachePath, "utf-8");
    } catch {
      backup = null; // no prior cache; nothing to restore to
    }
    const fetchErrors = await runPythonScript(python, [scriptPath], repoRoot);
    const valid = await isValidIntradayCache(cachePath, spec.expectedMinutes);
    if (fetchErrors.length === 0 && valid) {
      outcome.fetched.push(spec.tf);
    } else {
      if (backup != null) {
        await fs.writeFile(cachePath, backup, "utf-8").catch(() => undefined);
        outcome.restored.push(spec.tf);
      }
      outcome.errors.push(`${spec.tf}: ${fetchErrors.length ? fetchErrors.slice(-1)[0] : "invalid/sparse fetch result"} (kept previous valid cache)`);
    }
  }
  return outcome;
}

async function detectPython(): Promise<{ command: string; args: string[] } | null> {
  const candidates = [
    { command: "python", args: [] as string[] },
    { command: "py", args: ["-3"] },
    { command: "python3", args: [] as string[] },
  ];
  for (const candidate of candidates) {
    const ok = await new Promise<boolean>((resolve) => {
      const child = spawn(candidate.command, [...candidate.args, "--version"], { stdio: "ignore", windowsHide: true });
      child.once("error", () => resolve(false));
      child.once("exit", (code) => resolve(code === 0));
    });
    if (ok) return candidate;
  }
  return null;
}

async function readManifestGeneratedAt(repoRoot: string): Promise<string | null> {
  const manifestPath = path.join(
    repoRoot, "frontend", "public", "generated", "monitoring",
    "tradingview_data_cache", "cache_manifest_full.json",
  );
  try {
    const raw = await fs.readFile(manifestPath, "utf-8");
    const json = JSON.parse(raw) as { generatedAt?: string };
    return json.generatedAt ?? null;
  } catch {
    return null;
  }
}

async function acquireRefreshFileLock(repoRoot: string, startedAt: string): Promise<{ acquired: boolean; lockPath: string }> {
  const lockDir = path.join(repoRoot, "workspace", "output", "monitoring");
  const lockPath = path.join(lockDir, "monitoring_refresh_now.lock.json");
  await fs.mkdir(lockDir, { recursive: true });

  const tryCreate = async (): Promise<boolean> => {
    try {
      await fs.writeFile(lockPath, JSON.stringify({ startedAt, pid: process.pid }, null, 2), { flag: "wx" });
      return true;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err?.code !== "EEXIST") return false;
      try {
        const stat = await fs.stat(lockPath);
        if ((Date.now() - stat.mtimeMs) > REFRESH_LOCK_STALE_MS) {
          await fs.unlink(lockPath);
          await fs.writeFile(lockPath, JSON.stringify({ startedAt, pid: process.pid }, null, 2), { flag: "wx" });
          return true;
        }
      } catch {
        return false;
      }
      return false;
    }
  };

  const acquired = await tryCreate();
  return { acquired, lockPath };
}

async function runPythonScript(
  python: { command: string; args: string[] },
  scriptArgs: string[],
  cwd: string,
  timeoutMs = 12 * 60 * 1000,
): Promise<string[]> {
  return new Promise<string[]>((resolve) => {
    const child = spawn(python.command, [...python.args, ...scriptArgs], {
      cwd,
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    });

    const stderrLines: string[] = [];
    let settled = false;
    const finish = (value: string[]) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };

    // Timeout-Schutz: kill a hung script so it can never hold the refresh lock open
    // indefinitely; the run is reported as an error and the caller releases the lock.
    const timer = setTimeout(() => {
      try { child.kill("SIGKILL"); } catch { /* already gone */ }
      finish([`timeout after ${Math.round(timeoutMs / 1000)}s: ${scriptArgs[0] ?? "script"}`]);
    }, timeoutMs);

    child.stderr?.on("data", (chunk: Buffer) => {
      const line = chunk.toString().trim();
      if (line) stderrLines.push(line);
    });

    child.once("error", (err) => {
      finish([String(err.message || err)]);
    });

    child.once("close", (code) => {
      finish(code !== 0 ? stderrLines.slice(-5) : []);
    });
  });
}

export type ImmediateRefreshResult = {
  ok: boolean;
  alreadyRunning?: boolean;
  status: "started_and_finished" | "already_running" | "error" | "script_not_found" | "python_not_found" | "no_new_data";
  startedAt: string | null;
  finishedAt: string | null;
  manifestUpdatedAt: string | null;
  v2EngineRan: boolean;
  v2EngineErrors: string[];
  errors: string[];
  intraday?: {
    ran: boolean;
    fetched: string[];
    restored: string[];
    noNewData: boolean;
    daxLastBarBefore: Record<string, string | null>;
    daxLastBarAfter: Record<string, string | null>;
    errors: string[];
  };
};

export function getImmediateRefreshLockState(): { running: boolean; startedAt: string | null } {
  return getLock();
}

// The refresh is always global (every tab/category). The previous `intraday` option is
// accepted for backward compatibility but ignored — every call runs the full pipeline.
export async function triggerImmediateRefresh(
  _options: { intraday?: boolean } = {},
): Promise<ImmediateRefreshResult> {
  void _options;
  const lock = getLock();

  if (lock.running) {
    return {
      ok: true,
      alreadyRunning: true,
      status: "already_running",
      startedAt: lock.startedAt,
      finishedAt: null,
      manifestUpdatedAt: null,
      v2EngineRan: false,
      v2EngineErrors: [],
      errors: [],
    };
  }

  const [script, tvcScriptStandalone, python] = await Promise.all([
    resolveRefreshScript(),
    resolveFundManagerTvcScript(),
    detectPython(),
  ]);

  if (!python) {
    return {
      ok: false,
      status: "python_not_found",
      startedAt: null,
      finishedAt: null,
      manifestUpdatedAt: null,
      v2EngineRan: false,
      v2EngineErrors: [],
      errors: ["Python executable not found (tried python, py -3, python3)"],
    };
  }

  // If neither script exists, bail out.
  if (!script && !tvcScriptStandalone) {
    return {
      ok: false,
      status: "script_not_found",
      startedAt: null,
      finishedAt: null,
      manifestUpdatedAt: null,
      v2EngineRan: false,
      v2EngineErrors: [],
      errors: ["refresh wrapper script not found in expected path"],
    };
  }

  // If only the Fund Manager TVC script is available (no Invoria install), run it standalone.
  if (!script && tvcScriptStandalone) {
    lock.running = true;
    lock.startedAt = new Date().toISOString();
    const startedAt = lock.startedAt;
    const fileLock = await acquireRefreshFileLock(process.cwd(), startedAt);
    if (!fileLock.acquired) {
      lock.running = false;
      return { ok: true, alreadyRunning: true, status: "already_running", startedAt, finishedAt: null, manifestUpdatedAt: null, v2EngineRan: false, v2EngineErrors: [], errors: [] };
    }
    try {
      const tvcErrors = await runPythonScript(python, [tvcScriptStandalone], process.cwd(), 10 * 60 * 1000);
      const finishedAt = new Date().toISOString();
      lock.running = false;
      await fs.unlink(fileLock.lockPath).catch(() => undefined);
      return {
        ok: tvcErrors.length === 0,
        status: tvcErrors.length === 0 ? "started_and_finished" : "error",
        startedAt,
        finishedAt,
        manifestUpdatedAt: new Date().toISOString(),
        v2EngineRan: false,
        v2EngineErrors: [],
        errors: tvcErrors,
      };
    } catch {
      lock.running = false;
      await fs.unlink(fileLock.lockPath).catch(() => undefined);
      return { ok: false, status: "error", startedAt, finishedAt: new Date().toISOString(), manifestUpdatedAt: null, v2EngineRan: false, v2EngineErrors: [], errors: ["tvc refresh failed unexpectedly"] };
    }
  }

  // script is guaranteed non-null here (both guards above returned if script was null).
  lock.running = true;
  lock.startedAt = new Date().toISOString();
  const startedAt = lock.startedAt;
  const fileLock = await acquireRefreshFileLock(script!.repoRoot, startedAt);
  if (!fileLock.acquired) {
    lock.running = false;
    return {
      ok: true,
      alreadyRunning: true,
      status: "already_running",
      startedAt,
      finishedAt: null,
      manifestUpdatedAt: null,
      v2EngineRan: false,
      v2EngineErrors: [],
      errors: [],
    };
  }

  try {
    // GLOBAL refresh — ALWAYS run the full data + engine pipeline. refresh_agri_full.py
    // wraps refresh_all_assets.py (TradingView OHLC for EVERY asset across all tabs) +
    // run_v2_agri_all.py + run_intraday_engine_refresh.py (intraday engines + live-state).
    // One click/auto-tick therefore updates every category, never just the active tab.
    const dataErrors = await runPythonScript(
      python,
      [script!.scriptPath, "--concurrency", "4", "--retries", "2"],
      script!.repoRoot,
    );

    // Always also refresh the Fund Manager TVC cache (tvdatafeed → daily OHLC for all
    // 43 production assets). Runs after the Invoria pipeline so both caches are fresh.
    const tvcErrors = tvcScriptStandalone
      ? await runPythonScript(python, [tvcScriptStandalone], process.cwd(), 10 * 60 * 1000)
      : [];

    // Always also fetch the DAX 1H/2H live tail (part of the global refresh). A failed or
    // sparse fetch restores the previous valid cache, so good candles are never lost; such
    // a soft outcome is reported under `intraday` but does NOT hard-fail the refresh.
    const lastBarBefore: Record<string, string | null> = {};
    for (const spec of DAX_FETCH_SPECS) {
      lastBarBefore[spec.tf] = await readCacheLastBar(daxCachePath(script!.repoRoot, spec.cache));
    }
    const daxOutcome = await fetchDaxLiveOhlc(python, script!.repoRoot);
    const intradayInfo: NonNullable<ImmediateRefreshResult["intraday"]> = {
      ran: true,
      fetched: daxOutcome.fetched,
      restored: daxOutcome.restored,
      noNewData: false,
      daxLastBarBefore: lastBarBefore,
      daxLastBarAfter: {},
      errors: daxOutcome.errors,
    };

    // rebuild_intraday_long_primary merges the CSV backbone + the fresh live tail.
    const postProcessScript = await resolveIntradayLongPrimaryScript(script!.repoRoot);
    const postProcessErrors = postProcessScript
      ? await runPythonScript(python, [postProcessScript], script!.repoRoot)
      : [];

    const lastBarAfter: Record<string, string | null> = {};
    for (const spec of DAX_FETCH_SPECS) {
      lastBarAfter[spec.tf] = await readCacheLastBar(daxCachePath(script!.repoRoot, spec.cache));
    }
    intradayInfo.daxLastBarAfter = lastBarAfter;
    intradayInfo.noNewData = DAX_FETCH_SPECS.every(
      (spec) => (lastBarAfter[spec.tf] ?? null) === (lastBarBefore[spec.tf] ?? null),
    );

    // Hard errors = the main data + rebuild pipeline (what determines global success).
    // DAX live-tail issues are soft (previous cache kept) and reported, not failed on.
    const hardErrors = [...dataErrors, ...postProcessErrors, ...tvcErrors];
    const finishedAt = new Date().toISOString();
    const manifestUpdatedAt = await readManifestGeneratedAt(script!.repoRoot);

    return {
      ok: hardErrors.length === 0,
      status: hardErrors.length === 0 ? "started_and_finished" : "error",
      startedAt,
      finishedAt,
      manifestUpdatedAt,
      v2EngineRan: hardErrors.length === 0,
      v2EngineErrors: [],
      errors: hardErrors,
      intraday: intradayInfo,
    };
  } finally {
    lock.running = false;
    await fs.unlink(fileLock.lockPath).catch(() => undefined);
  }
}
