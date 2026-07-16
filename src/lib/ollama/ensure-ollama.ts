import { spawn } from "child_process";

const OLLAMA_BASE = process.env.OLLAMA_API_URL ?? "http://127.0.0.1:11434";

async function isOllamaRunning(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function waitForOllama(maxMs = 15000, intervalMs = 800): Promise<boolean> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    if (await isOllamaRunning()) return true;
    await new Promise<void>((r) => setTimeout(r, intervalMs));
  }
  return false;
}

function spawnOllamaServe(): void {
  try {
    const proc = spawn("ollama", ["serve"], {
      detached: true,
      stdio: "ignore",
      shell: true, // resolves ollama from PATH on Windows
    });
    proc.unref();
  } catch {
    // spawn failed — ollama likely not in PATH
  }
}

// Module-level dedup: only one start attempt at a time
let startPromise: Promise<boolean> | null = null;

export async function ensureOllamaRunning(): Promise<{ ok: boolean; detail: string }> {
  // Already running — fast path
  if (await isOllamaRunning()) return { ok: true, detail: "already_running" };

  // Deduplicate concurrent requests
  if (startPromise) {
    const ok = await startPromise;
    return ok ? { ok: true, detail: "started_by_other" } : { ok: false, detail: "start_failed" };
  }

  startPromise = (async () => {
    spawnOllamaServe();
    const ok = await waitForOllama(15000, 800);
    // Allow retry after 30 s
    setTimeout(() => { startPromise = null; }, 30_000);
    return ok;
  })();

  const ok = await startPromise;
  return ok
    ? { ok: true, detail: "auto_started" }
    : { ok: false, detail: "start_failed" };
}
