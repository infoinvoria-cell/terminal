import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

const INVEST_FOLDER = "C:\\Users\\joris\\Desktop\\Invest Portfolio";
const CONFIG_PATH = path.join(process.cwd(), "src", "data", "capitalife", "core-invest.config.json");
const VALIDATION_PATH = path.join(process.cwd(), "src", "data", "core-invest", "core-invest-validation.json");

const SYMBOL_FILE_MAP: Record<string, string[]> = {
  QQQ: ["QQQ.csv", "QQQ(1).csv", "QQQ(2).csv"],
  SPY: ["SPY.csv", "SPY(1).csv"],
  SPMO: ["SPMO.csv"],
  GLD: ["GLD.csv", "GLD(1).csv"],
  "HG1!": ["COMEX_DL_HG1!, 1D_9fc12.csv", "COMEX_DL_HG1!, 1D_9fc12(1).csv", "COMEX_DL_HG1!, 1D_9fc12(2).csv"],
  "6S1!": ["CME_DL_6S1!, 1D_b8f81.csv", "CME_DL_6S1!, 1D_b8f81(1).csv", "CME_DL_6S1!, 1D_b8f81(2).csv"],
};

function checkDataFile(symbol: string): { found: boolean; file: string | null } {
  const candidates = SYMBOL_FILE_MAP[symbol] ?? [];
  for (const fname of candidates) {
    if (fs.existsSync(path.join(INVEST_FOLDER, fname))) {
      return { found: true, file: fname };
    }
  }
  return { found: false, file: null };
}

export async function GET() {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));

  let validation: Record<string, unknown> | null = null;
  if (fs.existsSync(VALIDATION_PATH)) {
    try { validation = JSON.parse(fs.readFileSync(VALIDATION_PATH, "utf-8")); } catch { /* ignore */ }
  }

  const dataStatus: Record<string, { found: boolean; file: string | null }> = {};
  for (const sym of ["SPY", "SPMO", "QQQ", "GLD", "HG1!", "6S1!"]) {
    dataStatus[sym] = checkDataFile(sym);
  }

  const missingSymbols = Object.entries(dataStatus).filter(([, v]) => !v.found).map(([k]) => k);

  const pineFiles: Record<string, { found: boolean }> = {};
  for (const fname of ["QQQ_pine1.txt", "pine2.txt"]) {
    pineFiles[fname] = { found: fs.existsSync(path.join(INVEST_FOLDER, fname)) };
  }

  return NextResponse.json({
    portfolioName: config.portfolio_name,
    version: config.version,
    config,
    dataStatus,
    missingSymbols,
    pineFiles,
    validation,
    investFolderPath: INVEST_FOLDER,
    dataFolderAccessible: fs.existsSync(INVEST_FOLDER),
  });
}
