/**
 * Browser-local Kokoro — runs Kokoro-82M entirely on the user's device via a
 * Web Worker (kokoro-js / transformers.js, WebGPU with WASM fallback).
 *
 * This is the Mobile/Vercel path: Sentinel Mobile on a public deployment has
 * no access to localhost:5050, so it cannot reach the Python sidecar. This
 * module lets it synthesize speech locally in the browser instead, without
 * sending any Sentinel answer to a third-party API.
 *
 * Real-world verification: a standalone POC (kokoro-js 1.2.1) was run in this
 * environment's browser pane and produced valid, non-silent 48kHz audio via
 * WebGPU (cold load ~21.7s, warm synth RTF ~1.4 in this sandboxed/software-GPU
 * environment). Real hardware will vary — capability is measured at runtime,
 * never assumed.
 */

export type BrowserKokoroStatus = "idle" | "unsupported" | "loading" | "ready" | "error";

export interface BrowserKokoroState {
  status: BrowserKokoroStatus;
  device: "webgpu" | "wasm" | null;
  error: string | null;
}

let worker: Worker | null = null;
let state: BrowserKokoroState = { status: "idle", device: null, error: null };
let loadPromise: Promise<BrowserKokoroState> | null = null;
const listeners = new Set<(s: BrowserKokoroState) => void>();

function setState(patch: Partial<BrowserKokoroState>) {
  state = { ...state, ...patch };
  for (const l of listeners) l(state);
}

export function onBrowserKokoroState(cb: (s: BrowserKokoroState) => void): () => void {
  listeners.add(cb);
  cb(state);
  return () => listeners.delete(cb);
}

export function getBrowserKokoroState(): BrowserKokoroState {
  return state;
}

/**
 * Minimal capability check. A device that fails this should never attempt to
 * load an 80M-parameter model — text chat must stay fully usable regardless.
 */
export function isBrowserKokoroSupported(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof Worker === "undefined") return false;
  // WASM is the floor requirement (transformers.js always needs it); WebGPU is opportunistic.
  if (typeof WebAssembly === "undefined") return false;
  // Rough low-end guard: avoid loading an 80M-param model on very constrained devices.
  const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory;
  if (typeof mem === "number" && mem > 0 && mem < 2) return false;
  return true;
}

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("../../workers/kokoro-browser.worker.ts", import.meta.url), {
      type: "module",
    });
  }
  return worker;
}

/**
 * Loads the model once and caches it for the lifetime of the page — never
 * re-downloads on every Sentinel response. The underlying transformers.js
 * loader also caches the ONNX weights in the browser Cache Storage API
 * across page reloads.
 */
export function loadBrowserKokoro(): Promise<BrowserKokoroState> {
  if (state.status === "ready") return Promise.resolve(state);
  if (loadPromise) return loadPromise;

  if (!isBrowserKokoroSupported()) {
    setState({ status: "unsupported" });
    return Promise.resolve(state);
  }

  setState({ status: "loading" });
  loadPromise = new Promise((resolve) => {
    const w = getWorker();
    const timeout = setTimeout(() => {
      setState({ status: "error", error: "model load timed out" });
      resolve(state);
    }, 60_000);

    w.onmessage = (e: MessageEvent) => {
      const msg = e.data;
      if (msg?.type === "load:done") {
        clearTimeout(timeout);
        setState({ status: "ready", device: msg.device, error: null });
        resolve(state);
      } else if (msg?.type === "load:error") {
        clearTimeout(timeout);
        setState({ status: "error", error: msg.error });
        resolve(state);
      }
    };
    w.onerror = (e) => {
      clearTimeout(timeout);
      setState({ status: "error", error: e.message || "worker error" });
      resolve(state);
    };
    w.postMessage({ type: "load" });
  });

  return loadPromise;
}

export function synthesizeBrowserKokoro(
  text: string,
  voice: string,
  speed: number
): Promise<Blob | null> {
  return new Promise((resolve) => {
    if (state.status !== "ready" || !worker) {
      resolve(null);
      return;
    }
    const w = worker;
    const timeout = setTimeout(() => resolve(null), 30_000);

    const handler = (e: MessageEvent) => {
      const msg = e.data;
      if (msg?.type === "synth:done") {
        clearTimeout(timeout);
        w.removeEventListener("message", handler);
        resolve(new Blob([msg.audio], { type: "audio/wav" }));
      } else if (msg?.type === "synth:error") {
        clearTimeout(timeout);
        w.removeEventListener("message", handler);
        resolve(null);
      }
    };
    w.addEventListener("message", handler);
    w.postMessage({ type: "synth", text, voice, speed });
  });
}

export function disposeBrowserKokoro(): void {
  worker?.terminate();
  worker = null;
  loadPromise = null;
  setState({ status: "idle", device: null, error: null });
}
