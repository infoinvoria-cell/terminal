import { describe, expect, it } from "vitest";
import { classifyPrivacy, canSendToRemote, getTextForProvider } from "../connect/privacy-classifier";

describe("privacy classifier", () => {
  it("flags credential patterns as LOCAL_ONLY", () => {
    const r = classifyPrivacy("my api_key is super-secret-value-here");
    expect(r.level).toBe("LOCAL_ONLY");
    expect(r.triggers).toContain("credential detected");
  });

  it("flags local path references as LOCAL_ONLY", () => {
    const r = classifyPrivacy("the path is CAPITALIFE_BRAIN_PATH/09_AI");
    expect(r.level).toBe("LOCAL_ONLY");
  });

  it("marks generic finance definitions as REMOTE_SAFE", () => {
    const r = classifyPrivacy("what is cagr?");
    expect(r.level).toBe("REMOTE_SAFE");
  });

  it("marks White Swan queries as REMOTE_REDACTED", () => {
    const r = classifyPrivacy("What is the White Swan MaxDD?");
    expect(r.level).toBe("REMOTE_REDACTED");
    expect(r.sanitizedText).toBeDefined();
  });

  it("force local mode overrides everything", () => {
    const r = classifyPrivacy("what is cagr?", { forceLocal: true });
    expect(r.level).toBe("LOCAL_ONLY");
    expect(r.triggers).toContain("user_requested");
  });

  it("canSendToRemote returns false for LOCAL_ONLY", () => {
    const r = classifyPrivacy("api_key=abc");
    expect(canSendToRemote(r)).toBe(false);
  });

  it("canSendToRemote returns true for REMOTE_SAFE", () => {
    const r = classifyPrivacy("what is futures?");
    expect(canSendToRemote(r)).toBe(true);
  });

  it("canSendToRemote returns true for REMOTE_REDACTED", () => {
    const r = classifyPrivacy("White Swan live track record performance");
    expect(canSendToRemote(r)).toBe(true);
  });

  it("sanitizes local paths in REMOTE_REDACTED text", () => {
    const r = classifyPrivacy("check track record in C:\\Users\\joris\\Brain");
    if (r.level === "REMOTE_REDACTED") {
      expect(r.sanitizedText).not.toContain("joris");
    }
  });

  it("flags broker credential patterns as LOCAL_ONLY", () => {
    const r = classifyPrivacy("my broker password is hunter2");
    expect(r.level).toBe("LOCAL_ONLY");
  });

  it("marks ambiguous text as REMOTE_REDACTED by default", () => {
    const r = classifyPrivacy("Tell me about my trading performance this month in detail");
    expect(["REMOTE_REDACTED", "LOCAL_ONLY"]).toContain(r.level);
    // Must NOT be marked safe for something potentially private
    expect(r.level).not.toBe("REMOTE_SAFE");
  });

  it("getTextForProvider returns original for LOCAL_ONLY", () => {
    const r = classifyPrivacy("api_key=abc", { forceLocal: true });
    expect(getTextForProvider(r, "original text")).toBe("original text");
  });
});
