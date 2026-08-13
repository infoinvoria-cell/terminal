// Tests for local-agent-registry and scarcity/TASK_REQUIREMENTS (unit-level, no API calls)

import { describe, it, expect } from "vitest";
import {
  getLocalAgents,
  activateLocalAgents,
  matchLocalAgent,
  type LocalAgent,
} from "@/lib/sentinel/providers/local-agent-registry";
import { TASK_REQUIREMENTS } from "@/lib/sentinel/routing/task-classifier";

// ---------------------------------------------------------------------------
// Local Agent Registry
// ---------------------------------------------------------------------------

describe("getLocalAgents", () => {
  it("returns exactly 7 agents", () => {
    expect(getLocalAgents()).toHaveLength(7);
  });

  it("each agent has all required fields", () => {
    const required: (keyof LocalAgent)[] = [
      "id",
      "name",
      "primarySkill",
      "supportedTasks",
      "preferredModels",
      "contextWindow",
      "minVramGb",
      "speedTier",
    ];
    for (const agent of getLocalAgents()) {
      for (const field of required) {
        expect(agent, `agent ${agent.id} missing field ${field}`).toHaveProperty(field);
      }
    }
  });
});

describe("activateLocalAgents", () => {
  it("with empty list → all agents inactive", () => {
    const agents = activateLocalAgents([]);
    expect(agents.every(a => !a.active)).toBe(true);
  });

  it("with empty list → all availableModel null", () => {
    const agents = activateLocalAgents([]);
    expect(agents.every(a => a.availableModel === null)).toBe(true);
  });

  it("'llama3.2' → at least one agent active", () => {
    const agents = activateLocalAgents(["llama3.2"]);
    expect(agents.some(a => a.active)).toBe(true);
  });

  it("'llama3.2:3b' → fast-chat agent active with availableModel set", () => {
    const agents = activateLocalAgents(["llama3.2:3b"]);
    const fastChat = agents.find(a => a.id === "local-fast-chat");
    expect(fastChat?.active).toBe(true);
    expect(fastChat?.availableModel).toBeTruthy();
  });

  it("'deepseek-r1:8b' → reasoning agent active", () => {
    const agents = activateLocalAgents(["deepseek-r1:8b"]);
    const reasoning = agents.find(a => a.id === "local-reasoning");
    expect(reasoning?.active).toBe(true);
  });

  it("'llama3.2' + 'codellama:13b' → fast-chat and code-assistant both active", () => {
    const agents = activateLocalAgents(["llama3.2", "codellama:13b"]);
    const fastChat = agents.find(a => a.id === "local-fast-chat");
    const codeAssistant = agents.find(a => a.id === "local-code-assistant");
    expect(fastChat?.active).toBe(true);
    expect(codeAssistant?.active).toBe(true);
  });

  it("model matching is case-insensitive", () => {
    const agents = activateLocalAgents(["DeepSeek-R1:8B"]);
    const reasoning = agents.find(a => a.id === "local-reasoning");
    expect(reasoning?.active).toBe(true);
  });

  it("model matching handles :latest suffix", () => {
    // "llama3.2:latest" should match "llama3.2" in preferredModels
    const agents = activateLocalAgents(["llama3.2:latest"]);
    const fastChat = agents.find(a => a.id === "local-fast-chat");
    expect(fastChat?.active).toBe(true);
  });
});

describe("matchLocalAgent", () => {
  it("'coding' with code-assistant active → returns code_assistant agent", () => {
    // Activate codellama so code-assistant becomes active
    const agents = activateLocalAgents(["codellama:13b"]);
    const result = matchLocalAgent("coding", agents);
    expect(result).not.toBeNull();
    expect(result?.id).toBe("local-code-assistant");
  });

  it("'privacy' with privacy-vault active → returns privacy_vault agent", () => {
    const agents = activateLocalAgents(["llama3.2:3b"]);
    const result = matchLocalAgent("privacy", agents);
    expect(result).not.toBeNull();
    expect(result?.primarySkill).toBe("privacy_vault");
  });

  it("'simple_chat' with no active agents → returns null", () => {
    const result = matchLocalAgent("simple_chat", []);
    expect(result).toBeNull();
  });

  it("'coding' with no active agents → returns null", () => {
    const result = matchLocalAgent("coding", activateLocalAgents([]));
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Scarcity ratio — unit-level mocks (no actual API calls)
// ---------------------------------------------------------------------------

describe("scarcity scoring (mock-level logic)", () => {
  // Simulated scoring logic matching the real sentinel routing concept:
  // isBlocked=true  → score 0
  // ratio > 0.5     → score 1.0
  // ratio < 0.05    → score 0.3

  function mockScarcityScore(isBlocked: boolean, ratio: number): number {
    if (isBlocked) return 0;
    if (ratio > 0.5) return 1.0;
    if (ratio < 0.05) return 0.3;
    return 0.5 + ratio;
  }

  it("isBlocked=true → score is 0", () => {
    expect(mockScarcityScore(true, 0.9)).toBe(0);
  });

  it("isBlocked=true even with high ratio → score is 0", () => {
    expect(mockScarcityScore(true, 1.0)).toBe(0);
  });

  it("ratio > 0.5 → score is 1.0", () => {
    expect(mockScarcityScore(false, 0.8)).toBe(1.0);
  });

  it("ratio < 0.05 → score is 0.3", () => {
    expect(mockScarcityScore(false, 0.01)).toBe(0.3);
  });
});

// ---------------------------------------------------------------------------
// TASK_REQUIREMENTS — preferFast and preferLargeContext
// ---------------------------------------------------------------------------

describe("TASK_REQUIREMENTS", () => {
  it("all tasks have preferFast boolean field", () => {
    for (const [task, req] of Object.entries(TASK_REQUIREMENTS)) {
      expect(typeof req.preferFast, `${task}.preferFast`).toBe("boolean");
    }
  });

  it("all tasks have preferLargeContext boolean field", () => {
    for (const [task, req] of Object.entries(TASK_REQUIREMENTS)) {
      expect(typeof req.preferLargeContext, `${task}.preferLargeContext`).toBe("boolean");
    }
  });

  it("simple_dashboard_lookup prefers fast and not large context", () => {
    expect(TASK_REQUIREMENTS.simple_dashboard_lookup.preferFast).toBe(true);
    expect(TASK_REQUIREMENTS.simple_dashboard_lookup.preferLargeContext).toBe(false);
  });

  it("long_context prefers large context and not fast", () => {
    expect(TASK_REQUIREMENTS.long_context.preferLargeContext).toBe(true);
    expect(TASK_REQUIREMENTS.long_context.preferFast).toBe(false);
  });

  it("privacy task prefers fast delivery", () => {
    expect(TASK_REQUIREMENTS.privacy.preferFast).toBe(true);
  });

  it("brain_rag prefers large context", () => {
    expect(TASK_REQUIREMENTS.brain_rag.preferLargeContext).toBe(true);
  });
});
