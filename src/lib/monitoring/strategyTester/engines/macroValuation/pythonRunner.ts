import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { MvaEngineRawTrade, MvaEngineLiveSignal, MvaCostSummary } from "./types";
import type { MonitoringDataCoverageEntry, MonitoringResolverDiagnostics } from "@/lib/monitoring/strategyTester/types";

type PythonBinary = { command: string; args: string[] };

type PythonEngineResponse = {
  ok: boolean;
  symbol: string;
  displayName: string;
  latestBarTime: string | null;
  rawTrades: MvaEngineRawTrade[];
  openTrade: MvaEngineRawTrade | null;
  liveSignal: MvaEngineLiveSignal | null;
  warnings: string[];
  dataCoverage: MonitoringDataCoverageEntry[];
  resolverDiagnostics: MonitoringResolverDiagnostics;
  costSummary: MvaCostSummary | null;
  engineSource: string;
};

const PROJECT_ROOT = process.cwd();
const PYTHON_RUNNER = path.join(PROJECT_ROOT, "workspace", "tools", "custom_strategy_engines", "runners", "run_mva_agriculture_engine.py");

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function detectPython(): Promise<PythonBinary | null> {
  const candidates: PythonBinary[] = [
    { command: "python", args: [] },
    { command: "py", args: ["-3"] },
    { command: "python3", args: [] },
  ];
  for (const candidate of candidates) {
    const ok = await new Promise<boolean>((resolve) => {
      const child = spawn(candidate.command, [...candidate.args, "--version"], { stdio: "ignore" });
      child.once("error", () => resolve(false));
      child.once("exit", (code) => resolve(code === 0));
    });
    if (ok) return candidate;
  }
  return null;
}

export async function runMacroValuationPythonEngine(payload: Record<string, unknown>): Promise<PythonEngineResponse> {
  if (!(await fileExists(PYTHON_RUNNER))) {
    throw new Error(`Python runner missing: ${PYTHON_RUNNER}`);
  }
  const python = await detectPython();
  if (!python) {
    throw new Error("Python executable not found");
  }

  return new Promise<PythonEngineResponse>((resolve, reject) => {
    const child = spawn(python.command, [...python.args, PYTHON_RUNNER], {
      cwd: PROJECT_ROOT,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `Python runner failed with code ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout) as PythonEngineResponse);
      } catch (error) {
        reject(new Error(`Invalid python runner JSON: ${stdout.slice(0, 400)} | ${String(error)}`));
      }
    });

    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}
