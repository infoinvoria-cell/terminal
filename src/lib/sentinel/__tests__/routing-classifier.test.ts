import { describe, it, expect } from "vitest";
import { classifyTask, TASK_REQUIREMENTS, SentinelTask } from "../routing/task-classifier";
import { detectToolFirstOpportunity } from "../routing/tool-first-detector";

// ─── classifyTask ────────────────────────────────────────────────────────────

describe("classifyTask", () => {
  it("1. simple math question → simple_chat", () => {
    expect(classifyTask("Was ist 2+2?")).toBe("simple_chat");
  });

  it("2. trades count today → simple_dashboard_lookup", () => {
    expect(classifyTask("Wie viel Trades hatten wir heute?")).toBe("simple_dashboard_lookup");
  });

  it("3. write a TypeScript function → coding", () => {
    expect(classifyTask("Schreibe eine TypeScript Funktion die Arrays sortiert")).toBe("coding");
  });

  it("4. sharpe ratio question → financial_analysis", () => {
    expect(classifyTask("Der Drawdown des Portfolios liegt bei 5%")).toBe("financial_analysis");
  });

  it("5. very long backtest explanation prompt → long_context", () => {
    const long = "Erkläre die gesamte Backtest-Methodik im Detail: " + "x".repeat(12_100);
    expect(classifyTask(long)).toBe("long_context");
  });

  it("6. summarize this document → summarization", () => {
    expect(classifyTask("Fasse diesen Text kurz zusammen")).toBe("summarization");
  });

  it("7. review this code for errors → code_review", () => {
    expect(classifyTask("Review diesen Code bitte")).toBe("code_review");
  });

  it("8. structured JSON output request → structured_output", () => {
    expect(classifyTask("Gib mir eine strukturierte JSON-Antwort mit allen Positionen")).toBe(
      "structured_output",
    );
  });

  it("9. analyse this image → vision", () => {
    expect(classifyTask("Analysiere dieses Bild")).toBe("vision");
  });

  it("10. think through: why... → reasoning", () => {
    // "Denke durch: warum" — warum triggers REASONING_KEYWORDS
    expect(classifyTask("Denke durch: warum ist die Strategie so volatil?")).toBe("reasoning");
  });

  it("11. fetch current portfolio data → tool_calling", () => {
    expect(classifyTask("Fetch die live Signale")).toBe("tool_calling");
  });

  it("12. message with sensitive account data → privacy", () => {
    expect(classifyTask("Dieser Vorgang enthält sensible Kontodaten mit IBAN DE89370400440532013000")).toBe(
      "privacy",
    );
  });

  it("13. look in the brain graph → graph_rag", () => {
    expect(
      classifyTask("Zeige mir den Graph im Brain"),
    ).toBe("graph_rag");
  });

  it("14. TASK_REQUIREMENTS has entry for every SentinelTask value", () => {
    const allTasks: SentinelTask[] = [
      "simple_dashboard_lookup",
      "simple_chat",
      "summarization",
      "coding",
      "code_review",
      "reasoning",
      "financial_analysis",
      "long_context",
      "vision",
      "structured_output",
      "tool_calling",
      "brain_rag",
      "graph_rag",
      "reranking",
      "privacy",
    ];
    for (const task of allTasks) {
      expect(TASK_REQUIREMENTS).toHaveProperty(task);
    }
  });

  it("15. minContextWindow >= 0 for all tasks", () => {
    for (const [, req] of Object.entries(TASK_REQUIREMENTS)) {
      expect(req.minContextWindow).toBeGreaterThanOrEqual(0);
    }
  });

  it("16. long message (>12000 chars) without keywords → long_context", () => {
    const filler = "a".repeat(12_500);
    expect(classifyTask(filler)).toBe("long_context");
  });
});

// ─── detectToolFirstOpportunity ──────────────────────────────────────────────

describe("detectToolFirstOpportunity", () => {
  it("17. trade count query → trades_count, shouldUseTool=true, high confidence", () => {
    const result = detectToolFirstOpportunity("Wie viele Trades haben wir?");
    expect(result.category).toBe("trades_count");
    expect(result.shouldUseTool).toBe(true);
    expect(result.confidence).toBe("high");
  });

  it("18. engine feed live? → feed_status or engine_diagnostics, shouldUseTool=true", () => {
    const result = detectToolFirstOpportunity("Ist der Engine Feed live?");
    expect(["feed_status", "engine_diagnostics"]).toContain(result.category);
    expect(result.shouldUseTool).toBe(true);
  });

  it("19. weather question → none, shouldUseTool=false", () => {
    const result = detectToolFirstOpportunity("Was ist das Wetter?");
    expect(result.category).toBe("none");
    expect(result.shouldUseTool).toBe(false);
  });

  it("20. AUM query → aum_query, shouldUseTool=true", () => {
    const result = detectToolFirstOpportunity("AUM aktuell?");
    expect(result.category).toBe("aum_query");
    expect(result.shouldUseTool).toBe(true);
  });

  it("21. explain futures → none, shouldUseTool=false", () => {
    const result = detectToolFirstOpportunity("Erkläre mir Futures");
    expect(result.category).toBe("none");
    expect(result.shouldUseTool).toBe(false);
  });

  it("22. estimatedTokenSavings > 0 when shouldUseTool, 0 when not", () => {
    const tool = detectToolFirstOpportunity("Wie viele Trades haben wir?");
    expect(tool.shouldUseTool).toBe(true);
    expect(tool.estimatedTokenSavings).toBeGreaterThan(0);

    const noTool = detectToolFirstOpportunity("Was ist das Wetter?");
    expect(noTool.shouldUseTool).toBe(false);
    expect(noTool.estimatedTokenSavings).toBe(0);
  });
});
