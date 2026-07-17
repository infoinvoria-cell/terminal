/**
 * Shared path resolution for local dev tools.
 *
 * Resolution order: CAPITALIFE_BRAIN_PATH -> sibling folder next to the repo -> null.
 * Never throws; callers decide whether a missing Brain is fatal via requireBrainPath().
 *
 * Runtime code under src/ must not import this — it resolves the Brain through
 * src/lib/brain/brain-path.ts, which stays null on Vercel by design.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../..");

function envPath(name) {
  const raw = process.env[name];
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  return trimmed.length > 0 ? trimmed : null;
}

export function getBrainPath() {
  const fromEnv = envPath("CAPITALIFE_BRAIN_PATH");
  if (fromEnv) return fromEnv;

  const sibling = path.resolve(REPO_ROOT, "../Capitalife Brain");
  return fs.existsSync(sibling) ? sibling : null;
}

export function requireBrainPath(toolName) {
  const resolved = getBrainPath();
  if (!resolved) {
    console.error(`${toolName}: Brain path not found.`);
    console.error(`  Set CAPITALIFE_BRAIN_PATH, or place the vault next to the repo as "../Capitalife Brain".`);
    process.exit(1);
  }
  return resolved;
}

/** Invest Portfolio source folder. Override with CORE_INVEST_FOLDER. */
export function getInvestFolder() {
  return (
    envPath("CORE_INVEST_FOLDER") ??
    path.join(os.homedir(), "Desktop", "Invest Portfolio")
  );
}

export { REPO_ROOT };
