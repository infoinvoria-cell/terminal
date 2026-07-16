import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

const REFRESH_INTERVAL_MS = 300_000; // 5 minutes: data refresh + V2 engine recompute

type PythonBinary = {
  command: string;
  args: string[];
};

type LiveRefreshLoopState = {
  pid: number | null;
  startedAt: string | null;
  command: string | null;
  args: string[];
  cwd: string | null;
};

declare global {
  // eslint-disable-next-line no-var
  var __monitoringLiveRefreshLoopState__: LiveRefreshLoopState | undefined;
}

function state(): LiveRefreshLoopState {
  if (!globalThis.__monitoringLiveRefreshLoopState__) {
    globalThis.__monitoringLiveRefreshLoopState__ = {
      pid: null,
      startedAt: null,
      command: null,
      args: [],
      cwd: null,
    };
  }
  return globalThis.__monitoringLiveRefreshLoopState__;
}

function processAlive(pid: number | null): boolean {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
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
    // Prefer the full wrapper (data + V2 engine) when available
    const fullWrapper = path.join(root, "workspace", "tools", "tradingview_data", "refresh_agri_full.py");
    if (await fileExists(fullWrapper)) {
      return { scriptPath: fullWrapper, repoRoot: root };
    }
    // Fallback to data-only refresh
    const candidate = path.join(root, "workspace", "tools", "tradingview_data", "refresh_all_assets.py");
    if (await fileExists(candidate)) {
      return { scriptPath: candidate, repoRoot: root };
    }
  }
  return null;
}

async function detectPython(): Promise<PythonBinary | null> {
  const candidates: PythonBinary[] = [
    { command: "python", args: [] },
    { command: "py", args: ["-3"] },
    { command: "python3", args: [] },
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

export async function ensureMonitoringLiveRefreshLoop(): Promise<{
  ok: boolean;
  started: boolean;
  refreshIntervalMs: number;
  pid: number | null;
  startedAt: string | null;
  commandLine: string | null;
  reason?: string;
}> {
  const current = state();
  if (processAlive(current.pid)) {
    return {
      ok: true,
      started: false,
      refreshIntervalMs: REFRESH_INTERVAL_MS,
      pid: current.pid,
      startedAt: current.startedAt,
      commandLine: current.command ? [current.command, ...current.args].join(" ") : null,
    };
  }

  const script = await resolveRefreshScript();
  if (!script) {
    return {
      ok: false,
      started: false,
      refreshIntervalMs: REFRESH_INTERVAL_MS,
      pid: null,
      startedAt: null,
      commandLine: null,
      reason: "refresh_script_not_found",
    };
  }
  const python = await detectPython();
  if (!python) {
    return {
      ok: false,
      started: false,
      refreshIntervalMs: REFRESH_INTERVAL_MS,
      pid: null,
      startedAt: null,
      commandLine: null,
      reason: "python_not_found",
    };
  }

  const args = [
    ...python.args,
    script.scriptPath,
    "--concurrency",
    "4",
    "--retries",
    "2",
    "--loop",
    "--loop-seconds",
    String(Math.floor(REFRESH_INTERVAL_MS / 1000)),
  ];

  const child = spawn(python.command, args, {
    cwd: script.repoRoot,
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();

  current.pid = child.pid ?? null;
  current.startedAt = new Date().toISOString();
  current.command = python.command;
  current.args = args;
  current.cwd = script.repoRoot;

  return {
    ok: true,
    started: true,
    refreshIntervalMs: REFRESH_INTERVAL_MS,
    pid: current.pid,
    startedAt: current.startedAt,
    commandLine: [python.command, ...args].join(" "),
  };
}

export function getMonitoringLiveRefreshLoopState(): {
  refreshIntervalMs: number;
  pid: number | null;
  alive: boolean;
  startedAt: string | null;
  commandLine: string | null;
} {
  const current = state();
  return {
    refreshIntervalMs: REFRESH_INTERVAL_MS,
    pid: current.pid,
    alive: processAlive(current.pid),
    startedAt: current.startedAt,
    commandLine: current.command ? [current.command, ...current.args].join(" ") : null,
  };
}
