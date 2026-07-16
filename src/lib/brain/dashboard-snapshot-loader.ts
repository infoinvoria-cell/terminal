import fs from "fs";
import path from "path";
import type { DashboardSnapshot } from "./dashboard-snapshot-types";
import { getCapitalifeBrainPath } from "./brain-path";

let _cached: DashboardSnapshot | null = null;
let _cacheTs = 0;
const CACHE_TTL_MS = 60_000;

export function loadDashboardSnapshot(): DashboardSnapshot | null {
  const now = Date.now();
  if (_cached && now - _cacheTs < CACHE_TTL_MS) return _cached;
  const brainRoot = getCapitalifeBrainPath();
  if (!brainRoot) return null;
  const snapshotPath = path.join(brainRoot, "09_AI", "dashboard_snapshot.json");

  try {
    const raw = fs.readFileSync(snapshotPath, "utf-8");
    const parsed = JSON.parse(raw) as DashboardSnapshot;
    _cached = parsed;
    _cacheTs = now;
    return parsed;
  } catch {
    return null;
  }
}

export function getDashboardSnapshotPath(): string {
  const brainRoot = getCapitalifeBrainPath();
  return brainRoot
    ? path.join(brainRoot, "09_AI", "dashboard_snapshot.json")
    : "Set CAPITALIFE_BRAIN_PATH in .env.local";
}

export function invalidateSnapshotCache(): void {
  _cached = null;
  _cacheTs = 0;
}
