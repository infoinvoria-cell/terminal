/**
 * Kokoro Browser Worker — runs the Kokoro-82M ONNX model off the React main
 * thread so Sentinel never freezes while the model loads or synthesizes.
 *
 * Verified with a standalone POC (kokoro-js 1.2.1, onnx-community/Kokoro-82M-v1.0-ONNX):
 *   WebGPU: model load ~21.7s cold / instant warm (module-scoped), synth RTF ~1.4–2.3
 *   in this sandboxed test environment (software/virtualized GPU). Real hardware with
 *   native WebGPU should be substantially faster — this worker does not assume a number,
 *   it measures and reports actual timings via postMessage.
 *
 * Protocol:
 *   → { type: "load" }
 *   ← { type: "load:progress", ... } (from transformers.js loader)
 *   ← { type: "load:done", device, loadMs } | { type: "load:error", error }
 *   → { type: "synth", text, voice, speed }
 *   ← { type: "synth:done", audio: ArrayBuffer, synthMs } | { type: "synth:error", error }
 */

let tts: unknown = null;
let device: "webgpu" | "wasm" | null = null;

async function loadModel() {
  const t0 = performance.now();
  try {
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
    // @ts-expect-error — DOM worker postMessage transferable overload
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
