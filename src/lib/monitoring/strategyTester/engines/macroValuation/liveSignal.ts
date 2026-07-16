import type { MvaEngineLiveSignal } from "./types";

export function markLiveSignalStale(signal: MvaEngineLiveSignal | null, latestBar: string | null): MvaEngineLiveSignal | null {
  if (!signal || !latestBar) return signal;
  const ageMs = Date.now() - new Date(latestBar).getTime();
  return {
    ...signal,
    stale: !Number.isFinite(ageMs) || ageMs > 5 * 86400000,
  };
}
