"use client";

import { useEffect, useState } from "react";
import type { SignalGateResult } from "@/app/api/monitoring/signal-gate/route";

type AssetSpec = {
  asset: string;
  timeframe: string;
  source?: string;
  strategyId?: string;
  label: string;
};

type SignalGateStatusBandProps = {
  assets: AssetSpec[];
};

function StatusPill({
  ok,
  label,
  detail,
}: {
  ok: boolean | null;
  label: string;
  detail?: string;
}) {
  const color = ok === null ? "#5a6270" : ok ? "#2ea043" : "#b94040";
  const icon  = ok === null ? "–" : ok ? "✓" : "✗";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        fontSize: 9,
        fontWeight: 600,
        color,
        letterSpacing: "0.02em",
        whiteSpace: "nowrap",
      }}
      title={detail}
    >
      <span style={{ fontSize: 8 }}>{icon}</span>
      {label}
    </span>
  );
}

function AssetGateCell({ spec }: { spec: AssetSpec }) {
  const [result, setResult] = useState<SignalGateResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams({
      asset: spec.asset,
      timeframe: spec.timeframe,
    });
    if (spec.source) params.set("source", spec.source);
    if (spec.strategyId) params.set("strategyId", spec.strategyId);

    fetch(`/api/monitoring/signal-gate?${params}`)
      .then((r) => r.json())
      .then((data: SignalGateResult) => {
        setResult(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [spec.asset, spec.timeframe, spec.source, spec.strategyId]);

  const borderColor = result
    ? result.signalAllowed
      ? "rgba(46,160,67,0.35)"
      : "rgba(185,64,64,0.35)"
    : "rgba(255,255,255,0.08)";

  return (
    <div
      style={{
        flex: "1 1 0",
        minWidth: 0,
        border: `1px solid ${borderColor}`,
        borderRadius: 6,
        padding: "6px 8px",
        background: "rgba(255,255,255,0.025)",
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: "#c9cdd4",
            letterSpacing: "0.03em",
          }}
        >
          {spec.label}
        </span>
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            padding: "1px 5px",
            borderRadius: 3,
            background: result
              ? result.signalAllowed
                ? "rgba(46,160,67,0.18)"
                : "rgba(185,64,64,0.18)"
              : "rgba(255,255,255,0.06)",
            color: result
              ? result.signalAllowed
                ? "#4ade80"
                : "#f87171"
              : "#5a6270",
          }}
        >
          {loading
            ? "…"
            : result
            ? result.signalAllowed
              ? "FREIGEGEBEN"
              : "GESPERRT"
            : "FEHLER"}
        </span>
      </div>

      {result && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 10px" }}>
          <StatusPill
            ok={
              result.dataStatus === "current"
                ? true
                : result.dataStatus === "no_data"
                ? null
                : false
            }
            label={
              result.dataTimestamp
                ? `Daten ${result.dataTimestamp}`
                : "Keine Daten"
            }
            detail={
              result.dataStatus === "stale"
                ? `${result.meta.tradingDaysStale} Handelstage veraltet (max ${result.meta.maxTradingDays})`
                : result.dataStatus === "single_source_unverified"
                ? "Nur eine Quelle — keine Kreuzvalidierung möglich"
                : undefined
            }
          />
          <StatusPill
            ok={
              result.validationStatus === "validated"
                ? true
                : result.validationStatus === "no_data"
                ? null
                : false
            }
            label={
              result.validationStatus === "validated"
                ? "Validiert"
                : result.validationStatus === "single_source_unverified"
                ? "Einzelquelle"
                : "Ungeprüft"
            }
          />
          <StatusPill
            ok={
              result.engineStatus === "ready"
                ? true
                : ["missing", "placeholder", "stub"].includes(result.engineStatus)
                ? false
                : null
            }
            label={
              result.engineStatus === "ready"
                ? "Engine OK"
                : result.engineStatus === "weak"
                ? "Engine (weak)"
                : result.engineStatus === "missing"
                ? "Engine fehlt"
                : result.engineStatus === "placeholder"
                ? "Engine Placeholder"
                : result.engineStatus === "stub"
                ? "Engine Stub"
                : "Engine ?"
            }
          />
          <StatusPill
            ok={result.signalAllowed}
            label={result.signalAllowed ? "Signal OK" : "Signal gesperrt"}
            detail={
              result.blockingReasons.length
                ? result.blockingReasons.join(", ")
                : undefined
            }
          />
        </div>
      )}

      {result && !result.signalAllowed && result.blockingReasons.length > 0 && (
        <div
          style={{
            fontSize: 8,
            color: "#8a4040",
            lineHeight: 1.4,
            marginTop: 1,
          }}
        >
          {result.blockingReasons
            .filter((r) => r !== "live_ready_false" || result.blockingReasons.length === 1)
            .slice(0, 2)
            .map((r) => reasonLabel(r))
            .join(" · ")}
        </div>
      )}
    </div>
  );
}

function reasonLabel(reason: string): string {
  const MAP: Record<string, string> = {
    stale_data:                 "Daten veraltet",
    no_data_source:             "Keine Datenquelle",
    single_source_unverified:   "Datenquelle nicht unabhängig validiert",
    data_not_validated:         "Daten ungeprüft",
    engine_missing:             "Engine nicht registriert",
    engine_placeholder:         "Engine nicht freigegeben",
    engine_stub_503:            "Engine nicht implementiert",
    engine_weak_non_blocking:   "Engine nicht live-freigegeben",
    engine_unknown:             "Engine unbekannt",
    live_ready_false:           "Keine Live-Freigabe",
  };
  return MAP[reason] ?? reason;
}

/**
 * SignalGateStatusBand — compact per-asset signal gate status strip.
 *
 * Renders a horizontal row of status cells, one per asset. Each cell fetches
 * its own gate result from /api/monitoring/signal-gate and shows:
 *   - last data timestamp
 *   - data validation status
 *   - engine status
 *   - signal allowed / blocked
 *
 * Add above a chart grid for the Intraday and Anomaly tabs.
 */
export default function SignalGateStatusBand({ assets }: SignalGateStatusBandProps) {
  return (
    <div
      style={{
        display: "flex",
        gap: 6,
        padding: "6px 8px",
        background: "rgba(0,0,0,0.18)",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        flexWrap: "nowrap",
        overflowX: "auto",
      }}
      aria-label="Signal-Freigabestatus"
    >
      {assets.map((spec) => (
        <AssetGateCell key={`${spec.asset}_${spec.timeframe}`} spec={spec} />
      ))}
    </div>
  );
}
