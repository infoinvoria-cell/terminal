import { describe, it, expect, vi, beforeEach } from "vitest";

// localStorage stub
vi.stubGlobal("localStorage", (() => {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
  };
})());

const mockAudioEl = { pause: vi.fn(), play: vi.fn(() => Promise.resolve()), src: "" };
vi.stubGlobal("Audio", vi.fn(function AudioMock() { return mockAudioEl; }));
vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:mock"), revokeObjectURL: vi.fn() });

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import {
  checkLocalTTSHealth,
  invalidateTTSHealthCache,
  synthesizeKokoro,
  stopAudio,
  playAudioBlob,
  getCachedAudio,
  setCachedAudio,
} from "../sentinel-voice";

beforeEach(() => {
  fetchMock.mockReset();
  mockAudioEl.pause.mockReset();
  mockAudioEl.play.mockReset().mockReturnValue(Promise.resolve());
  invalidateTTSHealthCache();
});

// ── Backend / health selection ───────────────────────────────────────────────

describe("checkLocalTTSHealth — backend availability detection", () => {
  it("returns false when the sidecar is unreachable (fetch throws)", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(checkLocalTTSHealth()).resolves.toBe(false);
  });

  it("returns true when the sidecar responds ok", async () => {
    fetchMock.mockResolvedValue({ ok: true } as Response);
    await expect(checkLocalTTSHealth()).resolves.toBe(true);
  });

  it("returns false when the sidecar responds non-ok (model not loaded)", async () => {
    fetchMock.mockResolvedValue({ ok: false } as Response);
    await expect(checkLocalTTSHealth()).resolves.toBe(false);
  });

  it("does not throw on network timeout", async () => {
    fetchMock.mockRejectedValue(new DOMException("aborted", "AbortError"));
    await expect(checkLocalTTSHealth()).resolves.toBe(false);
  });
});

// ── synthesizeKokoro fallback safety ─────────────────────────────────────────

describe("synthesizeKokoro — offline/failure safety", () => {
  it("returns null (never throws) when the proxy is unreachable", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    const result = await synthesizeKokoro("Test", "kokoro:bm_george", 1.0);
    expect(result).toBeNull();
  });

  it("returns null when the sidecar returns a non-ok response (model load failure)", async () => {
    fetchMock.mockResolvedValue({ ok: false } as Response);
    const result = await synthesizeKokoro("Test", "kokoro:bm_george", 1.0);
    expect(result).toBeNull();
  });

  it("returns a blob and caches it on success", async () => {
    const blob = new Blob(["fake-wav"], { type: "audio/wav" });
    fetchMock.mockResolvedValue({ ok: true, blob: () => Promise.resolve(blob) } as unknown as Response);
    const result = await synthesizeKokoro("Unique cache test line.", "kokoro:bm_fable", 1.0);
    expect(result).toBe(blob);
    expect(getCachedAudio("kokoro:bm_fable", "Unique cache test line.", 1.0)).toBe(blob);
  });

  it("serves from cache without a second network call", async () => {
    const blob = new Blob(["cached"], { type: "audio/wav" });
    setCachedAudio("kokoro:bm_daniel", "Cached line.", 1.0, blob);
    const result = await synthesizeKokoro("Cached line.", "kokoro:bm_daniel", 1.0);
    expect(result).toBe(blob);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ── Playback cancellation (new answer replaces old audio) ───────────────────

describe("playback control — new answer cancels previous audio", () => {
  it("playAudioBlob pauses and clears any existing element before starting new playback", () => {
    const onStart = vi.fn();
    const onEnd = vi.fn();
    playAudioBlob(new Blob(["a"]), onStart, onEnd);
    playAudioBlob(new Blob(["b"]), onStart, onEnd);
    expect(mockAudioEl.pause).toHaveBeenCalled();
  });

  it("stopAudio pauses and clears the element without throwing when nothing is playing", () => {
    expect(() => stopAudio()).not.toThrow();
  });
});
