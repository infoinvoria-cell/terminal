export const MONITORING_SIGNAL_JUMP_KEY = "monitoring_signal_jump_v1";

export type MonitoringSignalJumpPayload = {
  tabId: "agrar" | "metalle_energie" | "indizes" | "aktien" | "invest" | "fx" | "intraday_mt" | "live" | "all";
  targetCode?: string | null;
  targetItemKey?: string | null;
  investStrategyId?: string | null;
  tradeId?: string | null;
};

export function writeMonitoringSignalJump(payload: MonitoringSignalJumpPayload): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MONITORING_SIGNAL_JUMP_KEY, JSON.stringify(payload));
}

export function readMonitoringSignalJump(): MonitoringSignalJumpPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(MONITORING_SIGNAL_JUMP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MonitoringSignalJumpPayload;
    if (!parsed || typeof parsed !== "object" || !parsed.tabId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearMonitoringSignalJump(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(MONITORING_SIGNAL_JUMP_KEY);
}
