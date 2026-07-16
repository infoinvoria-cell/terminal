"use client";

import { useCallback, useEffect, useState } from "react";
import type { AgriStrategyKind } from "@/lib/agri/agri-v2-registry";

const STORAGE_KEY = "capitalife.monitoring.agri.strategySelection.v2";

type AgriSelection = Record<string, AgriStrategyKind[]>;

function loadFromStorage(): AgriSelection {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || Array.isArray(parsed) || parsed === null) return {};
    return parsed as AgriSelection;
  } catch {
    return {};
  }
}

function saveToStorage(selection: AgriSelection): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(selection));
  } catch {
    // ignore quota errors
  }
}

export function useAgriStrategySelection() {
  const [selection, setSelection] = useState<AgriSelection>({});
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setSelection(loadFromStorage());
    setMounted(true);
  }, []);

  const getActiveKinds = useCallback(
    (
      symbol: string,
      available?: { valuation: boolean; seasonal: boolean; macro: boolean },
    ): AgriStrategyKind[] => {
      if (!mounted) return [];
      if (selection[symbol] !== undefined) return selection[symbol];
      // No stored selection → all available kinds active by default
      if (!available) return [];
      return (["valuation", "seasonal", "macro"] as AgriStrategyKind[]).filter(
        (k) => available[k],
      );
    },
    [mounted, selection],
  );

  const toggleKind = useCallback(
    (symbol: string, kind: AgriStrategyKind) => {
      setSelection((prev) => {
        const current = prev[symbol] ?? [];
        const next = current.includes(kind)
          ? current.filter((k) => k !== kind)
          : [...current, kind];
        const updated: AgriSelection = { ...prev, [symbol]: next };
        saveToStorage(updated);
        return updated;
      });
    },
    [],
  );

  const setKinds = useCallback(
    (symbol: string, kinds: AgriStrategyKind[]) => {
      setSelection((prev) => {
        const updated: AgriSelection = { ...prev, [symbol]: kinds };
        saveToStorage(updated);
        return updated;
      });
    },
    [],
  );

  return { getActiveKinds, toggleKind, setKinds, mounted };
}
