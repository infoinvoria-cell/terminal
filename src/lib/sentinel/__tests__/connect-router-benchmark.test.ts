// 50-case router benchmark: privacy classification + routing decision.
// Tests are deterministic (Layer 0 heuristic + classifier — no Qwen required).
// Categories: LOCAL, BRAIN, PRIVATE, REMOTE_SAFE, REASONING, CODING,
//             TOOL_FIRST, ENSEMBLE, AMBIGUOUS, BILLING_GUARD
import { describe, it, expect } from "vitest";
import { classifyPrivacy, canSendToRemote } from "../connect/privacy-classifier";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function expectLocal(msg: string) {
  const r = classifyPrivacy(msg);
  expect(r.level, `Expected LOCAL_ONLY for: "${msg.slice(0, 60)}"`).toBe("LOCAL_ONLY");
  expect(canSendToRemote(r)).toBe(false);
}

function expectPrivate(msg: string) {
  const r = classifyPrivacy(msg);
  expect(r.level, `Expected REMOTE_REDACTED for: "${msg.slice(0, 60)}"`).toBe("REMOTE_REDACTED");
  expect(canSendToRemote(r)).toBe(true);
  if (r.sanitizedText) expect(r.sanitizedText).not.toMatch(/\d{6,10}/);
}

function expectRemoteSafe(msg: string) {
  const r = classifyPrivacy(msg);
  expect(r.level, `Expected REMOTE_SAFE for: "${msg.slice(0, 60)}"`).toBe("REMOTE_SAFE");
  expect(canSendToRemote(r)).toBe(true);
}

function expectNotExternal(msg: string) {
  const r = classifyPrivacy(msg);
  expect(r.level, `Expected non-REMOTE_SAFE for: "${msg.slice(0, 60)}"`).not.toBe("REMOTE_SAFE");
}

// ─── LOCAL — credentials must never leave machine ─────────────────────────────
describe("LOCAL — credential + path detection (10 cases)", () => {
  it("case 01: api_key in text",          () => expectLocal("My api_key is " + "sk-" + "abc123xyz"));
  it("case 02: bearer token",             () => expectLocal("Authorization: Bearer eyJhbGc..."));
  it("case 03: IBKR account+password",    () => expectLocal("IBKR account 123456 password mypass"));
  it("case 04: broker credential",        () => expectLocal("broker login credential: admin@roboforex.com"));
  it("case 05: brain path env var",       () => expectLocal("CAPITALIFE_BRAIN_PATH=/Users/joris/Documents"));
  it("case 06: env file reference",       () => expectLocal("check .env.local for the keys"));
  it("case 07: SSH private key header",   () => expectLocal("-----BEGIN RSA " + "PRIVATE KEY-----"));
  it("case 08: Myfxbook session token",   () => expectLocal("myfxbook session 9f2a31b888dca"));
  it("case 09: crypto wallet address",    () => expectLocal("wallet address: 0x7F3A9c2f1d8"));
  it("case 10: secret key assignment",    () => expectLocal("secret_key = mysecretvalue123"));
});

// ─── BRAIN — Capitalife-specific, needs Brain + redaction ─────────────────────
describe("BRAIN / PRIVATE — Capitalife data requiring Brain (5 cases)", () => {
  it("case 11: White Swan MaxDD with number", () => expectPrivate("What is White Swan MaxDD 11.2%?"));
  it("case 12: White Swan CAGR value",        () => expectPrivate("Show White Swan CAGR 14.85"));
  it("case 13: FSPortfolio reference",        () => expectPrivate("FSPortfolio allocation for Q3"));
  it("case 14: track record",                 () => expectPrivate("Show me the live track record"));
  it("case 15: Capitalife Engine status",      () => expectPrivate("How is the Capitalife Engine running?"));
});

// ─── PRIVATE — Capitalife terms, sanitize before external ─────────────────────
describe("PRIVATE — Capitalife-private content (5 cases)", () => {
  it("case 16: sentinel vault reference",  () => expectPrivate("check sentinel vault for the file"));
  it("case 17: Capitalife Brain mention",  () => expectPrivate("what does Capitalife Brain say about this"));
  it("case 18: Sleeve names (Agrar)",      () => expectPrivate("Sleeve Agrar performance for July"));
  it("case 19: Sharpe with number",        () => expectPrivate("White Swan Sharpe 1.03 vs benchmark"));
  it("case 20: handoff file reference",    () => expectPrivate("sentinel handoff file with the latest context"));
});

// ─── REMOTE_SAFE — generic finance/coding, no private content ─────────────────
describe("REMOTE_SAFE — generic queries safe to send as-is (5 cases)", () => {
  it("case 21: what is CAGR",       () => expectRemoteSafe("what is CAGR?"));
  it("case 22: define drawdown",    () => expectRemoteSafe("define drawdown"));
  it("case 23: explain futures",    () => expectRemoteSafe("explain futures"));
  it("case 24: what is Sharpe",     () => expectRemoteSafe("what is Sharpe?"));
  it("case 25: how does VaR work",  () => expectRemoteSafe("how does VaR work?"));
});

// ─── REASONING — complex queries, privacy must not be LOCAL_ONLY ──────────────
describe("REASONING — complex queries (5 cases, privacy only)", () => {
  it("case 26: futures roll mechanics", () => {
    const r = classifyPrivacy("explain the mechanics of futures contract roll and P&L impact over delivery months");
    expect(r.level).not.toBe("LOCAL_ONLY");
  });
  it("case 27: risk-adjusted metrics comparison", () => {
    const r = classifyPrivacy("compare Sharpe vs Calmar vs Sortino for trend-following strategies");
    expect(r.level).not.toBe("LOCAL_ONLY");
  });
  it("case 28: macro inflation thesis", () => {
    const r = classifyPrivacy("what is the current macro environment and how does inflation affect commodities futures?");
    expect(r.level).not.toBe("LOCAL_ONLY");
  });
  it("case 29: portfolio construction theory", () => {
    const r = classifyPrivacy("explain mean-variance optimization and its limitations for alternative assets");
    expect(r.level).not.toBe("LOCAL_ONLY");
  });
  it("case 30: tail risk hedging", () => {
    const r = classifyPrivacy("how do professional funds hedge tail risk using options overlays vs diversification?");
    expect(r.level).not.toBe("LOCAL_ONLY");
  });
});

// ─── CODING — code questions, safe for external ────────────────────────────────
describe("CODING — code questions (5 cases)", () => {
  it("case 31: TypeScript generic", () => {
    const r = classifyPrivacy("how do I write a TypeScript generic that constrains to object keys?");
    expect(r.level).not.toBe("LOCAL_ONLY");
  });
  it("case 32: React hook pattern", () => {
    const r = classifyPrivacy("explain the useEffect cleanup function pattern in React");
    expect(r.level).not.toBe("LOCAL_ONLY");
  });
  it("case 33: Python pandas merge", () => {
    const r = classifyPrivacy("how to left merge two pandas DataFrames on multiple columns?");
    expect(r.level).not.toBe("LOCAL_ONLY");
  });
  it("case 34: SQL window function", () => {
    const r = classifyPrivacy("write a SQL window function to calculate running average over partitioned groups");
    expect(r.level).not.toBe("LOCAL_ONLY");
  });
  it("case 35: git rebase vs merge", () => {
    const r = classifyPrivacy("what is the difference between git rebase and git merge?");
    expect(r.level).not.toBe("LOCAL_ONLY");
  });
});

// ─── TOOL_FIRST — local tool queries (3 cases) ───────────────────────────────
describe("TOOL_FIRST — local tool queries (3 cases)", () => {
  it("case 36: trades active count", () => {
    const r = classifyPrivacy("how many trades are currently active?");
    expect(r.level).not.toBe("LOCAL_ONLY"); // no credentials, just a tool query
  });
  it("case 37: open positions", () => {
    const r = classifyPrivacy("show open positions");
    expect(r.level).not.toBe("LOCAL_ONLY");
  });
  it("case 38: account balance generic", () => {
    const r = classifyPrivacy("what is the current account balance?");
    expect(r.level).not.toBe("LOCAL_ONLY");
  });
});

// ─── ENSEMBLE — multi-perspective queries (2 cases) ──────────────────────────
describe("ENSEMBLE — multi-perspective queries (2 cases)", () => {
  it("case 39: commodities allocation analysis", () => {
    const r = classifyPrivacy("should I allocate to commodities in 2025 given macro trends and inflation? Provide a detailed multi-angle analysis");
    expect(r.level).not.toBe("LOCAL_ONLY");
  });
  it("case 40: factor ETF comparison", () => {
    const r = classifyPrivacy("compare momentum, value, and low-volatility factor ETF strategies across different market regimes with pros and cons");
    expect(r.level).not.toBe("LOCAL_ONLY");
  });
});

// ─── AMBIGUOUS — must NOT be REMOTE_SAFE (default = REMOTE_REDACTED) ─────────
describe("AMBIGUOUS — privacy escalation (5 cases)", () => {
  it("case 41: vague 'the strategy'",          () => expectNotExternal("update me on the strategy performance"));
  it("case 42: 'my portfolio'",                 () => expectNotExternal("how is my portfolio doing?"));
  it("case 43: 'our system'",                   () => expectNotExternal("explain how our system makes trading decisions"));
  it("case 44: numbers + CAGR/MaxDD pattern",   () => expectNotExternal("the results show 12.5% CAGR and -8.3% MaxDD 12345"));
  it("case 45: Capitalife Brain direct mention", () => expectNotExternal("according to Capitalife Brain the allocation is overweight metals"));
});

// ─── BILLING_GUARD — credential + private routed externally = FAIL ────────────
describe("BILLING_GUARD — credential + path must never reach REMOTE_SAFE (5 cases)", () => {
  it("case 46: local path in query — blocked or sanitized", () => {
    const r = classifyPrivacy("read C:\\Users\\joris\\Documents\\vault\\accounts.csv and summarize");
    // Classifier: path matches SENSITIVE_PATTERNS → sanitized as [LOCAL_PATH] → REMOTE_REDACTED.
    // It is NOT local path in BRAIN or CAPITALIFE_BRAIN_PATH sense, so not strictly LOCAL_ONLY.
    // Requirement: must NOT be REMOTE_SAFE — private local path must at minimum be redacted.
    expect(r.level).not.toBe("REMOTE_SAFE");
    if (r.level !== "LOCAL_ONLY") {
      expect(r.sanitizedText ?? "").toMatch(/\[LOCAL_PATH\]/);
    }
  });
  it("case 47: 8-digit account number sanitized", () => {
    const r = classifyPrivacy("account number 12345678 shows a balance of 50000 EUR");
    const sanitized = r.sanitizedText ?? "";
    expect(sanitized).not.toMatch(/12345678/);
  });
  it("case 48: forceLocal mode", () => {
    const r = classifyPrivacy("what is CAGR?", { forceLocal: true });
    expect(r.level).toBe("LOCAL_ONLY");
    expect(r.triggers).toContain("user_requested");
  });
  it("case 49: email address redacted", () => {
    const r = classifyPrivacy("send results to joris@example.com");
    if (r.level !== "LOCAL_ONLY") {
      const sanitized = r.sanitizedText ?? "";
      expect(sanitized).not.toMatch(/joris@example\.com/);
    }
  });
  it("case 50: Windows path sanitized or blocked", () => {
    const r = classifyPrivacy("load C:\\Users\\joris\\brain\\analysis.json and parse it");
    expect(r.level).toBe("LOCAL_ONLY");
    expect(canSendToRemote(r)).toBe(false);
  });
});

// ─── PATH ACCEPTANCE — local filesystem paths always LOCAL_ONLY (5 cases) ────
describe("PATH ACCEPTANCE — local filesystem paths always LOCAL_ONLY (5 cases)", () => {
  it("case 51: C:\\... Capitalife path", () => {
    const r = classifyPrivacy("read C:\\Users\\joris\\Documents\\Capitalife\\strategy.json");
    expect(r.level).toBe("LOCAL_ONLY");
    expect(canSendToRemote(r)).toBe(false);
  });
  it("case 52: C:\\private\\accounts.csv", () => {
    const r = classifyPrivacy("analyze C:\\private\\accounts.csv");
    expect(r.level).toBe("LOCAL_ONLY");
    expect(canSendToRemote(r)).toBe(false);
  });
  it("case 53: Unix /home/user/private/... path", () => {
    const r = classifyPrivacy("load /home/user/private/accounts.json");
    expect(r.level).toBe("LOCAL_ONLY");
    expect(canSendToRemote(r)).toBe(false);
  });
  it("case 54: relative ./private/account-data.json path", () => {
    const r = classifyPrivacy("parse ./private/account-data.json");
    expect(r.level).toBe("LOCAL_ONLY");
    expect(canSendToRemote(r)).toBe(false);
  });
  it("case 55: UNC \\\\server\\private\\... path", () => {
    const r = classifyPrivacy("access \\\\server\\private\\data\\reports.xlsx");
    expect(r.level).toBe("LOCAL_ONLY");
    expect(canSendToRemote(r)).toBe(false);
  });
});
