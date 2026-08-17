import { describe, it, expect, vi } from "vitest";

// sentinel-voice.ts uses browser APIs — stub them at the top
vi.stubGlobal("localStorage", {
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
});
vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: false } as Response)));

import {
  SENTINEL_VOICES,
  DEFAULT_VOICE_ID,
  extractSpokenBrief,
  normalizePronunciation,
} from "../sentinel-voice";

// ── Voice registry ───────────────────────────────────────────────────────────

describe("SENTINEL_VOICES registry", () => {
  it("has at least one voice", () => {
    expect(SENTINEL_VOICES.length).toBeGreaterThan(0);
  });

  it("has exactly one default voice", () => {
    const defaults = SENTINEL_VOICES.filter(v => v.isDefault);
    expect(defaults).toHaveLength(1);
  });

  it("default voice id matches DEFAULT_VOICE_ID", () => {
    const def = SENTINEL_VOICES.find(v => v.isDefault);
    expect(def?.id).toBe(DEFAULT_VOICE_ID);
  });

  it("all voices have required fields", () => {
    for (const v of SENTINEL_VOICES) {
      expect(v.id).toBeTruthy();
      expect(v.label).toBeTruthy();
      expect(v.engine).toMatch(/^(kokoro|browser)$/);
      expect(v.lang).toBeTruthy();
    }
  });

  it("includes browser fallback voice", () => {
    const browser = SENTINEL_VOICES.find(v => v.engine === "browser");
    expect(browser).toBeDefined();
  });
});

// ── extractSpokenBrief ───────────────────────────────────────────────────────

describe("extractSpokenBrief", () => {
  it("never exceeds 60 words", () => {
    const longAnswer = Array.from({ length: 20 }, (_, i) =>
      `Sentence number ${i + 1} is here with several words to pad it out.`
    ).join(" ");
    const brief = extractSpokenBrief(longAnswer);
    const wordCount = brief.trim().split(/\s+/).filter(Boolean).length;
    expect(wordCount).toBeLessThanOrEqual(60);
  });

  it("strips markdown headers", () => {
    const brief = extractSpokenBrief("## Risk Report\nMarkets are stable.");
    expect(brief).not.toContain("#");
  });

  it("strips bold/italic markdown", () => {
    const brief = extractSpokenBrief("**Important**: markets are *stable* today.");
    expect(brief).not.toMatch(/\*\*|\*/);
  });

  it("strips URLs", () => {
    const brief = extractSpokenBrief("See https://example.com for details. Markets are stable.");
    expect(brief).not.toContain("https://");
  });

  it("strips code blocks", () => {
    const brief = extractSpokenBrief("```python\nprint('hello')\n```\nMarkets are stable.");
    expect(brief).not.toContain("```");
    expect(brief).not.toContain("print(");
  });

  it("strips markdown tables", () => {
    const table = "| Col A | Col B |\n|---|---|\n| 1 | 2 |\n";
    const brief = extractSpokenBrief(table + "Markets are stable.");
    expect(brief).not.toContain("|");
  });

  it("returns empty string for empty input", () => {
    expect(extractSpokenBrief("")).toBe("");
  });

  it("returns empty string for whitespace-only input", () => {
    expect(extractSpokenBrief("   \n  ")).toBe("");
  });

  it("returns non-empty string for normal text", () => {
    const brief = extractSpokenBrief("Markets are broadly stable. No action required.");
    expect(brief.trim().length).toBeGreaterThan(0);
  });

  it("does not break on code-only answer", () => {
    const codeOnly = "```typescript\nconst x = 1;\n```";
    expect(() => extractSpokenBrief(codeOnly)).not.toThrow();
  });

  it("drops heading text instead of gluing it onto the next sentence", () => {
    const brief = extractSpokenBrief("## Research Summary\nFindings show no robust edge.");
    expect(brief).not.toMatch(/^Research Summary/);
    expect(brief).toContain("Findings show no robust edge.");
  });

  it("does not mangle multi-underscore identifiers", () => {
    const brief = extractSpokenBrief("Verdict: NO_ROBUST_EDGE_FOUND. Family A is rejected.");
    expect(brief).toContain("NO_ROBUST_EDGE_FOUND");
  });

  it("still strips single-underscore italic phrases", () => {
    const brief = extractSpokenBrief("Markets are _quite_ stable today.");
    expect(brief).not.toContain("_quite_");
    expect(brief).toContain("quite");
  });
});

// ── normalizePronunciation ───────────────────────────────────────────────────

describe("normalizePronunciation", () => {
  it("expands EUR/USD", () => {
    const result = normalizePronunciation("EUR/USD is trading at 1.18");
    expect(result.toLowerCase()).toContain("euro");
    expect(result).not.toContain("EUR/USD");
  });

  it("replaces IBKR with Interactive Brokers", () => {
    const result = normalizePronunciation("Connect via IBKR gateway.");
    expect(result).toContain("Interactive Brokers");
  });

  it("does not crash on empty string", () => {
    expect(normalizePronunciation("")).toBe("");
  });

  it("does not alter unrelated text", () => {
    const plain = "Markets are broadly stable today.";
    expect(normalizePronunciation(plain)).toBe(plain);
  });
});

// ── TTS failure safety ───────────────────────────────────────────────────────

describe("TTS failure safety", () => {
  it("extractSpokenBrief does not throw on malformed markdown", () => {
    const malformed = "##\n**bold without close\n| table | no close\n```no close";
    expect(() => extractSpokenBrief(malformed)).not.toThrow();
  });
});
