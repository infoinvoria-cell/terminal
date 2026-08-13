// Read-only Sentinel tool registry — no write/shell/trading tools
import fs from "fs";
import path from "path";

export type SentinelTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (input: unknown) => Promise<unknown>;
};

const readCurrentDatetimeTool: SentinelTool = {
  name: "read_current_datetime",
  description: "Returns current date and time in Europe/Berlin timezone",
  inputSchema: { type: "object", properties: {} },
  handler: async () => ({
    datetime: new Date().toLocaleString("de-DE", { timeZone: "Europe/Berlin" }),
    utc: new Date().toISOString(),
    timezone: "Europe/Berlin",
  }),
};

const getBrainStatusTool: SentinelTool = {
  name: "get_brain_status",
  description: "Returns Capitalife Brain availability and configured file status",
  inputSchema: { type: "object", properties: {} },
  handler: async () => {
    const brainPath = process.env.CAPITALIFE_BRAIN_PATH?.trim() || null;
    if (!brainPath) return { available: false, pathConfigured: false };
    const brainFile = path.join(brainPath, "09_AI", "AI_PROJECT_BRAIN_CURRENT.md");
    const snapshotFile = path.join(brainPath, "09_AI", "dashboard_snapshot.json");
    const brainExists = fs.existsSync(brainFile);
    const snapshotExists = fs.existsSync(snapshotFile);
    return {
      available: brainExists && snapshotExists,
      pathConfigured: true,
      brainFile: brainExists,
      snapshotFile: snapshotExists,
    };
  },
};

const getGraphStatsTool: SentinelTool = {
  name: "get_graph_stats",
  description: "Returns codebase graph statistics from graphify",
  inputSchema: { type: "object", properties: {} },
  handler: async () => {
    try {
      const { getGraphStats } = await import("./graphify-retrieval");
      return getGraphStats();
    } catch {
      return { available: false, note: "graphify not initialized" };
    }
  },
};

export const SENTINEL_TOOLS: SentinelTool[] = [
  readCurrentDatetimeTool,
  getBrainStatusTool,
  getGraphStatsTool,
];

export async function executeTool(
  name: string,
  input: unknown,
): Promise<{ result: unknown; error?: string; durationMs: number }> {
  const tool = SENTINEL_TOOLS.find((t) => t.name === name);
  if (!tool) {
    return { result: null, error: `Unknown tool: ${name}`, durationMs: 0 };
  }
  const start = Date.now();
  try {
    const result = await tool.handler(input);
    return { result, durationMs: Date.now() - start };
  } catch (error) {
    return {
      result: null,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - start,
    };
  }
}
