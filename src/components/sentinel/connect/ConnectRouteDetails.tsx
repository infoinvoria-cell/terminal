"use client";

import { useState } from "react";
import type { ConnectRoutingMode } from "@/lib/sentinel/connect/connect-types";

interface WorkerInfo {
  provider: string;
  role: string;
  model: string;
  latencyMs: number;
  success: boolean;
}

interface ConnectRouteDetailsProps {
  runId?: string;
  route?: ConnectRoutingMode;
  privacy?: string;
  brainUsed?: boolean;
  graphifyUsed?: boolean;
  workers?: WorkerInfo[];
  agreements?: string[];
  disagreements?: string[];
  latencyMs?: number;
  fallbackUsed?: boolean;
  className?: string;
}

const ROUTE_LABELS: Record<ConnectRoutingMode, string> = {
  LOCAL_ONLY: "Local",
  SINGLE_BEST: "Single Best",
  FASTEST_FREE: "Fastest Free",
  PARALLEL_ENSEMBLE: "Parallel Ensemble",
  REASONER_PLUS_CRITIC: "Reasoner + Critic",
  FALLBACK_CHAIN: "Fallback",
};

export function ConnectRouteDetails({
  runId,
  route,
  privacy,
  brainUsed,
  graphifyUsed,
  workers = [],
  agreements = [],
  disagreements = [],
  latencyMs,
  fallbackUsed,
  className = "",
}: ConnectRouteDetailsProps) {
  const [open, setOpen] = useState(false);

  if (!route && !runId) return null;

  return (
    <div className={`text-xs ${className}`}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-[10px] text-foreground/30 hover:text-foreground/50 transition-colors"
      >
        <span className="font-mono">{open ? "▾" : "▸"}</span>
        <span>Route Details</span>
        {latencyMs != null && (
          <span className="ml-1 opacity-60">{(latencyMs / 1000).toFixed(1)}s</span>
        )}
      </button>

      {open && (
        <div className="mt-2 p-2 rounded border border-border/30 bg-background/40 space-y-1.5 font-mono text-[10px] text-foreground/50">
          {route && (
            <Row label="Route" value={ROUTE_LABELS[route] ?? route} />
          )}
          {privacy && (
            <Row label="Privacy" value={privacy} />
          )}
          {brainUsed != null && (
            <Row label="Brain" value={brainUsed ? "used" : "not used"} />
          )}
          {graphifyUsed && (
            <Row label="Graphify" value="used" />
          )}
          {workers.length > 0 && (
            <div>
              <span className="text-foreground/30">Workers:</span>
              {workers.map((w, i) => (
                <div key={i} className="ml-2 flex gap-2">
                  <span className={w.success ? "text-foreground/70" : "text-foreground/40"}>
                    {w.success ? "✓" : "✗"}
                  </span>
                  <span>{w.provider}</span>
                  <span className="opacity-60">({w.role})</span>
                  <span className="opacity-40">{w.latencyMs}ms</span>
                </div>
              ))}
            </div>
          )}
          {agreements.length > 0 && (
            <div>
              <span className="text-foreground/30">Agreements:</span>
              {agreements.map((a, i) => <div key={i} className="ml-2 text-foreground/50">✓ {a}</div>)}
            </div>
          )}
          {disagreements.length > 0 && (
            <div>
              <span className="text-foreground/30">Disagreements:</span>
              {disagreements.map((d, i) => <div key={i} className="ml-2 text-amber-400/50">⚡ {d}</div>)}
            </div>
          )}
          {fallbackUsed && (
            <Row label="Fallback" value="used" highlight />
          )}
          {runId && (
            <Row label="Run" value={runId} />
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex gap-2">
      <span className="text-foreground/30 w-16 shrink-0">{label}:</span>
      <span className={highlight ? "text-amber-400/60" : ""}>{value}</span>
    </div>
  );
}
