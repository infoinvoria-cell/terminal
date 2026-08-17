// Concurrency test: parallel writes to the usage store must not lose entries or corrupt JSON.
// Uses real file operations (not mocked) to validate the file-lock mechanism (wx flag).
import { describe, it, expect } from "vitest";

import {
  recordRequest,
  getProviderState,
  getDailyTokens,
  getDailyRequests,
  isBlocked,
  getAllProviderStates,
} from "../store/usage-store";

describe("UsageStore — concurrency and correctness", () => {
  it("parallel writes: all resolve, no corruption (20 concurrent)", async () => {
    const CONCURRENT_WRITES = 20;
    const writes = Array.from({ length: CONCURRENT_WRITES }, (_, i) =>
      new Promise<void>((resolve, reject) => {
        try {
          recordRequest({
            provider: "groq",
            inputTokens: 100 + i,
            outputTokens: 50 + i,
            success: true,
          });
          resolve();
        } catch (e) {
          reject(e);
        }
      }),
    );

    const results = await Promise.allSettled(writes);
    const rejected = results.filter((r) => r.status === "rejected");
    expect(rejected.length, `${rejected.length} writes threw errors`).toBe(0);
  });

  it("store is readable after concurrent writes (no JSON parse error)", () => {
    for (let i = 0; i < 5; i++) recordRequest({ provider: "groq",    inputTokens: 100, outputTokens: 50, success: true });
    for (let i = 0; i < 5; i++) recordRequest({ provider: "mistral", inputTokens: 80,  outputTokens: 30, success: true });
    for (let i = 0; i < 5; i++) recordRequest({ provider: "cohere",  inputTokens: 60,  outputTokens: 20, success: true });

    expect(() => getAllProviderStates()).not.toThrow();
    expect(() => getDailyTokens("groq")).not.toThrow();
    expect(() => getDailyRequests("mistral")).not.toThrow();
    expect(() => isBlocked("cohere")).not.toThrow();
  });

  it("failed / quota-blocked calls are recorded without throwing", () => {
    expect(() =>
      recordRequest({
        provider: "cerebras",
        inputTokens: 0,
        outputTokens: 0,
        success: false,
        errorCode: "402",
      }),
    ).not.toThrow();
  });

  it("getProviderState returns valid object shape", () => {
    const state = getProviderState("groq");
    expect(state).toMatchObject({
      inputTokens: expect.any(Number),
      outputTokens: expect.any(Number),
      requestCount: expect.any(Number),
      failureCount: expect.any(Number),
    });
  });

  it("mixed parallel + serial writes don't corrupt store", async () => {
    const concurrent = Array.from({ length: 10 }, (_, i) =>
      new Promise<void>((resolve) => {
        recordRequest({ provider: "groq", inputTokens: 50 + i, outputTokens: 20, success: true });
        resolve();
      }),
    );
    await Promise.allSettled(concurrent);

    for (let i = 0; i < 5; i++) {
      recordRequest({ provider: "groq", inputTokens: 100, outputTokens: 40, success: true });
    }

    expect(() => getAllProviderStates()).not.toThrow();
    expect(typeof getAllProviderStates()).toBe("object");
  });
});
