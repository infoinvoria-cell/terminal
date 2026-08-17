/**
 * LEGACY CHAT STREAM — REGRESSION TESTS
 *
 * Proves that the /api/sentinel/chat streaming adapter correctly handles
 * provider SSE framing and delivers non-empty plain-text chunks to the client.
 *
 * Root cause documented: Cohere v2 SSE lines are prefixed with "data: ".
 * The original parser called JSON.parse(trimmed) without stripping the prefix,
 * causing silent SyntaxError on every chunk → empty stream → "Sentinel hat
 * keine Antwort gesendet." displayed in all three legacy consumers.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Helpers: build realistic mock SSE responses in Cohere v2 format
// ---------------------------------------------------------------------------

function makeCohereSSEBody(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const events: string[] = [
    `data: {"type":"message-start","id":"test-id","delta":{"message":{"role":"assistant","content":[]}}}\n`,
    `data: {"type":"content-start","index":0,"delta":{"message":{"content":{"index":0,"type":"text","text":""}}}}\n`,
    ...chunks.map(
      (t, i) =>
        `data: {"type":"content-delta","index":${i},"delta":{"message":{"content":{"index":0,"type":"text","text":${JSON.stringify(t)}}}}}\n`,
    ),
    `data: {"type":"content-end","index":0}\n`,
    `data: {"type":"message-end","delta":{"finish_reason":"COMPLETE","usage":{"tokens":{"input_tokens":20,"output_tokens":${chunks.length * 3}}}}}\n`,
  ];

  return new ReadableStream({
    start(controller) {
      for (const ev of events) controller.enqueue(encoder.encode(ev));
      controller.close();
    },
  });
}

function makeOpenAISSEBody(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const events: string[] = [
    ...chunks.map(
      (t) =>
        `data: {"choices":[{"delta":{"content":${JSON.stringify(t)}},"finish_reason":null}]}\n`,
    ),
    `data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":${chunks.length * 2}}}\n`,
    "data: [DONE]\n",
  ];

  return new ReadableStream({
    start(controller) {
      for (const ev of events) controller.enqueue(encoder.encode(ev));
      controller.close();
    },
  });
}

// Drain a ReadableStream<Uint8Array> to a string
async function drain(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let result = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value, { stream: true });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Unit-test the Cohere streaming parser in isolation by invoking the module's
// internal logic via the exported provider object.
// ---------------------------------------------------------------------------

describe("Cohere streamMessage — SSE prefix handling", () => {
  let savedKey: string | undefined;
  beforeEach(() => {
    savedKey = process.env.COHERE_API_KEY;
    process.env.COHERE_API_KEY = "test-mock-key";
  });
  afterEach(() => {
    if (savedKey === undefined) delete process.env.COHERE_API_KEY;
    else process.env.COHERE_API_KEY = savedKey;
  });

  it("emits non-empty text when provider returns data:-prefixed SSE lines", async () => {
    const { cohereProvider } = await import("@/lib/sentinel/providers/cohere-provider");

    // Patch fetch to return a realistic Cohere v2 SSE response
    const words = ["CAGR", " steht", " für", " Compound", " Annual", " Growth", " Rate."];
    const mockBody = makeCohereSSEBody(words);

    const originalFetch = global.fetch;
    global.fetch = async () =>
      new Response(mockBody, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });

    try {
      const resultStream = await cohereProvider.streamMessage!({
        messages: [{ role: "user", content: "Was ist CAGR?" }],
        category: "general",
      });

      const text = await drain(resultStream);

      expect(text.length).toBeGreaterThan(0);
      expect(text).toContain("CAGR");
      expect(text).not.toMatch(/^data:/);  // SSE prefix must not leak to client
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("stream terminates without hanging when message-end event is received", async () => {
    const { cohereProvider } = await import("@/lib/sentinel/providers/cohere-provider");

    const words = ["Hello", " world"];
    const mockBody = makeCohereSSEBody(words);

    const originalFetch = global.fetch;
    global.fetch = async () =>
      new Response(mockBody, { status: 200, headers: { "Content-Type": "text/event-stream" } });

    try {
      const resultStream = await cohereProvider.streamMessage!({
        messages: [{ role: "user", content: "Hi" }],
        category: "general",
      });

      // Should resolve within a reasonable time (hangs if stream never closes)
      const text = await Promise.race([
        drain(resultStream),
        new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error("stream did not terminate")), 3000),
        ),
      ]);

      expect(text).toContain("Hello");
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("handles malformed SSE frames without throwing — skips them silently", async () => {
    const { cohereProvider } = await import("@/lib/sentinel/providers/cohere-provider");

    const encoder = new TextEncoder();
    const corruptBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("data: {INVALID JSON}\n"));
        controller.enqueue(
          encoder.encode(
            `data: {"type":"content-delta","index":0,"delta":{"message":{"content":{"index":0,"type":"text","text":"ok"}}}}\n`,
          ),
        );
        controller.enqueue(
          encoder.encode(
            `data: {"type":"message-end","delta":{"finish_reason":"COMPLETE","usage":{"tokens":{"input_tokens":5,"output_tokens":1}}}}\n`,
          ),
        );
        controller.close();
      },
    });

    const originalFetch = global.fetch;
    global.fetch = async () =>
      new Response(corruptBody, { status: 200, headers: { "Content-Type": "text/event-stream" } });

    try {
      const resultStream = await cohereProvider.streamMessage!({
        messages: [{ role: "user", content: "test" }],
        category: "general",
      });

      // Must not throw — must still deliver the valid chunk
      const text = await drain(resultStream);
      expect(text).toBe("ok");
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("non-data lines (event:, id:, :comments) are not exposed to client", async () => {
    const { cohereProvider } = await import("@/lib/sentinel/providers/cohere-provider");

    const encoder = new TextEncoder();
    const bodyWithMetaLines = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("event: content-delta\n"));
        controller.enqueue(encoder.encode("id: msg-42\n"));
        controller.enqueue(encoder.encode(": keep-alive\n"));
        controller.enqueue(
          encoder.encode(
            `data: {"type":"content-delta","index":0,"delta":{"message":{"content":{"index":0,"type":"text","text":"answer"}}}}\n`,
          ),
        );
        controller.enqueue(
          encoder.encode(
            `data: {"type":"message-end","delta":{"finish_reason":"COMPLETE","usage":{"tokens":{"input_tokens":3,"output_tokens":1}}}}\n`,
          ),
        );
        controller.close();
      },
    });

    const originalFetch = global.fetch;
    global.fetch = async () =>
      new Response(bodyWithMetaLines, { status: 200, headers: { "Content-Type": "text/event-stream" } });

    try {
      const resultStream = await cohereProvider.streamMessage!({
        messages: [{ role: "user", content: "test" }],
        category: "general",
      });

      const text = await drain(resultStream);
      expect(text).toBe("answer");
      expect(text).not.toContain("event:");
      expect(text).not.toContain("id:");
      expect(text).not.toContain(": keep-alive");
    } finally {
      global.fetch = originalFetch;
    }
  });
});

// ---------------------------------------------------------------------------
// OpenAI-compatible SSE (Groq / Mistral path via makeOpenAISSEStream)
// ---------------------------------------------------------------------------

describe("makeOpenAISSEStream — baseline correctness (Groq / Mistral path)", () => {
  it("delivers non-empty text and strips SSE framing", async () => {
    const { makeOpenAISSEStream } = await import("@/lib/sentinel/usage/streaming");

    const words = ["Groq", " antwortet", " korrekt."];
    const mockBody = makeOpenAISSEBody(words);

    const mockResponse = new Response(mockBody, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    });

    const resultStream = makeOpenAISSEStream(mockResponse, {
      providerId: "groq",
      modelId: "llama-3.1-8b-instant",
    });

    const text = await drain(resultStream);

    expect(text.length).toBeGreaterThan(0);
    expect(text).toBe("Groq antwortet korrekt.");
    expect(text).not.toMatch(/^data:/);
    expect(text).not.toContain("[DONE]");
  });

  it("handles [DONE] sentinel correctly — stream closes without error", async () => {
    const { makeOpenAISSEStream } = await import("@/lib/sentinel/usage/streaming");

    const mockBody = makeOpenAISSEBody(["done"]);
    const mockResponse = new Response(mockBody, { status: 200 });
    const resultStream = makeOpenAISSEStream(mockResponse, { providerId: "mistral", modelId: "mistral-small" });

    const text = await drain(resultStream);
    expect(text).toBe("done");
  });
});

// ---------------------------------------------------------------------------
// Consumer contract — static verification that the three legacy consumers
// make a fetch call compatible with the route's streaming contract.
// ---------------------------------------------------------------------------

describe("Legacy consumer contract — static API compatibility", () => {
  it("use-sentinel-chat sends stream:true and reads body as byte stream", async () => {
    const src = await import("fs").then(fs =>
      fs.readFileSync("src/hooks/use-sentinel-chat.ts", "utf-8")
    );
    // Sends streaming request (object literal, so format is "stream: true")
    expect(src).toContain("stream: true");
    // Reads response body with getReader() — plain byte stream, no SSE parsing
    expect(src).toContain("getReader()");
    // Decodes with TextDecoder
    expect(src).toContain("TextDecoder");
    // Route is the legacy chat path
    expect(src).toContain("/api/sentinel/chat");
  });

  it("GlobeSentinelChat.tsx fetches the legacy chat route", async () => {
    const src = await import("fs").then(fs =>
      fs.readFileSync("src/components/globe/GlobeSentinelChat.tsx", "utf-8")
    );
    expect(src).toContain("/api/sentinel/chat");
  });

  it("SentinelPanel.tsx fetches the legacy chat route", async () => {
    const src = await import("fs").then(fs =>
      fs.readFileSync("src/components/monitoring/SentinelPanel.tsx", "utf-8")
    );
    expect(src).toContain("/api/sentinel/chat");
  });
});
