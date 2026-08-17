import { describe, expect, it } from "vitest";
import { generateRunId } from "../connect/connect-run";

describe("connect run", () => {
  it("generates unique run IDs", () => {
    const ids = new Set([...Array(20)].map(() => generateRunId()));
    expect(ids.size).toBe(20);
  });

  it("run IDs start with cr_", () => {
    const id = generateRunId();
    expect(id).toMatch(/^cr_[a-z0-9]+_[a-z0-9]+$/);
  });

  it("run IDs are reasonable length", () => {
    const id = generateRunId();
    expect(id.length).toBeGreaterThan(8);
    expect(id.length).toBeLessThan(30);
  });
});
