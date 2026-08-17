/**
 * Kokoro Browser Worker — runs Kokoro-82M ONNX off the main thread.
 *
 * Protocol:
 *   → { type: "load" }
 *   ← { type: "load:done", device, loadMs } | { type: "load:error", error }
 *   → { type: "synth", text, voice, speed }
 *   ← { type: "synth:done", audio: ArrayBuffer, synthMs } | { type: "synth:error", error }
 */

let tts: unknown = null;
let device: "webgpu" | "wasm" | null = null;

async function loadModel() {
  const t0 = performance.now();
  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error — kokoro-js has no bundled types; loaded only at runtime in browser workers
    const { KokoroTTS } = await import("kokoro-js");
    const hasWebGPU = typeof navigator !== "undefined" && "gpu" in navigator;
    device = hasWebGPU ? "webgpu" : "wasm";

    tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
      dtype: device === "webgpu" ? "fp32" : "q8",
      device,
    });

    const loadMs = performance.now() - t0;
    postMessage({ type: "load:done", device, loadMs });
  } catch (err) {
    postMessage({ type: "load:error", error: err instanceof Error ? err.message : String(err) });
  }
}

async function synth(text: string, voice: string, speed: number) {
  if (!tts) {
    postMessage({ type: "synth:error", error: "model not loaded" });
    return;
  }
  const t0 = performance.now();
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const audio = await (tts as any).generate(text, { voice, speed });
    const blob: Blob = await audio.toBlob();
    const buf = await blob.arrayBuffer();
    const synthMs = performance.now() - t0;
    // @ts-expect-error — DOM worker transferable overload
    postMessage({ type: "synth:done", audio: buf, synthMs, device }, [buf]);
  } catch (err) {
    postMessage({ type: "synth:error", error: err instanceof Error ? err.message : String(err) });
  }
}

self.onmessage = (e: MessageEvent) => {
  const msg = e.data;
  if (msg?.type === "load") loadModel();
  else if (msg?.type === "synth") synth(msg.text, msg.voice, msg.speed ?? 1.0);
};
