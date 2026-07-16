"use client";

import { useEffect } from "react";

type UseGlobalRefreshOptions = {
  enabled?: boolean;
  intervalMs?: number;
  hiddenIntervalMs?: number;
};

export function useGlobalRefresh(
  callback: () => void,
  { enabled = true, intervalMs = 60000, hiddenIntervalMs = 120000 }: UseGlobalRefreshOptions = {},
) {
  useEffect(() => {
    if (!enabled) return;

    let timer: number | null = null;

    const schedule = () => {
      if (timer !== null) window.clearInterval(timer);
      timer = window.setInterval(callback, document.hidden ? hiddenIntervalMs : intervalMs);
    };

    schedule();
    const handleVisibility = () => schedule();
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      if (timer !== null) window.clearInterval(timer);
    };
  }, [callback, enabled, hiddenIntervalMs, intervalMs]);
}
