import { describe, it, expect, vi, beforeEach } from "vitest";

describe("isBrowserKokoroSupported — capability detection", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("returns false in a non-browser (SSR) environment", async () => {
    vi.stubGlobal("window", undefined);
    const { isBrowserKokoroSupported } = await import("../browser-kokoro");
    expect(isBrowserKokoroSupported()).toBe(false);
  });

  it("returns false when Worker is unavailable", async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("Worker", undefined);
    vi.stubGlobal("WebAssembly", {});
    const { isBrowserKokoroSupported } = await import("../browser-kokoro");
    expect(isBrowserKokoroSupported()).toBe(false);
  });

  it("returns false when WebAssembly is unavailable", async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("Worker", class {});
    vi.stubGlobal("WebAssembly", undefined);
    const { isBrowserKokoroSupported } = await import("../browser-kokoro");
    expect(isBrowserKokoroSupported()).toBe(false);
  });

  it("returns false on very low-memory devices (deviceMemory < 2GB)", async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("Worker", class {});
    vi.stubGlobal("WebAssembly", {});
    vi.stubGlobal("navigator", { deviceMemory: 1 });
    const { isBrowserKokoroSupported } = await import("../browser-kokoro");
    expect(isBrowserKokoroSupported()).toBe(false);
  });

  it("returns true when Worker + WebAssembly are present and memory is adequate", async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("Worker", class {});
    vi.stubGlobal("WebAssembly", {});
    vi.stubGlobal("navigator", { deviceMemory: 8 });
    const { isBrowserKokoroSupported } = await import("../browser-kokoro");
    expect(isBrowserKokoroSupported()).toBe(true);
  });

  it("does not require deviceMemory to be present at all (older browsers)", async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("Worker", class {});
    vi.stubGlobal("WebAssembly", {});
    vi.stubGlobal("navigator", {});
    const { isBrowserKokoroSupported } = await import("../browser-kokoro");
    expect(isBrowserKokoroSupported()).toBe(true);
  });
});

describe("browser-kokoro state safety", () => {
  it("loadBrowserKokoro resolves with status=unsupported instead of throwing on an incapable device", async () => {
    vi.resetModules();
    vi.unstubAllGlobals();
    vi.stubGlobal("window", {});
    vi.stubGlobal("Worker", undefined);
    vi.stubGlobal("WebAssembly", undefined);
    const { loadBrowserKokoro } = await import("../browser-kokoro");
    const result = await loadBrowserKokoro();
    expect(result.status).toBe("unsupported");
  });
});
