// Server-only: Node.js fs — do not import from client code.
import fs from "fs";
import path from "path";

export type ActiveContextUsage = {
  providerId: string | null;
  modelId: string | null;
  inputTokensUsed: number | null;
  contextWindowTokens: number | null;
  reservedOutputTokens: number | null;
  measuredAtUtc: string | null;
  status: "measured" | "estimated" | "no_run" | "unknown";
};

const CONTEXT_PATH = path.join(process.cwd(), ".runtime", "sentinel", "last-context.json");

const NO_RUN: ActiveContextUsage = {
  providerId: null, modelId: null, inputTokensUsed: null,
  contextWindowTokens: null, reservedOutputTokens: null,
  measuredAtUtc: null, status: "no_run",
};

export function getLastContextUsage(): ActiveContextUsage {
  try {
    if (!fs.existsSync(CONTEXT_PATH)) return { ...NO_RUN };
    const raw = fs.readFileSync(CONTEXT_PATH, "utf-8");
    return JSON.parse(raw) as ActiveContextUsage;
  } catch {
    return { ...NO_RUN, status: "unknown" };
  }
}

export function setLastContextUsage(ctx: ActiveContextUsage): void {
  try {
    const dir = path.dirname(CONTEXT_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmp = CONTEXT_PATH + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(ctx, null, 2), "utf-8");
    fs.renameSync(tmp, CONTEXT_PATH);
  } catch { /* best-effort */ }
}
