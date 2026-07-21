import fs from "fs";
import path from "path";
import type { DashboardSnapshot } from "./dashboard-snapshot-types";
import { getCapitalifeBrainPath } from "./brain-path";
import { createSupabaseServiceClient } from "@/lib/supabase-server";

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

let _supabaseCache: { data: DashboardSnapshot; ts: number } | null = null;

export async function loadDashboardSnapshotAsync(): Promise<DashboardSnapshot | null> {
  const sync = loadDashboardSnapshot();
  if (sync) return sync;

  const now = Date.now();
  if (_supabaseCache && now - _supabaseCache.ts < CACHE_TTL_MS) return _supabaseCache.data;

  try {
    const db = createSupabaseServiceClient();
    const { data, error } = await db
      .from("dashboard_snapshot")
      .select("data")
      .eq("key", "latest")
      .single();
    if (error || !data) return null;
    const snapshot = data.data as DashboardSnapshot;
    _supabaseCache = { data: snapshot, ts: now };
    return snapshot;
  } catch {
    return null;
  }
}
