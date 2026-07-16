"use client";

import type { SentinelCurrentRun, SentinelProviderStatus, SentinelStatusPayload } from "@/lib/sentinel/sentinel-session-store";

type StatusChipTone = {
  dot: string;
  border: string;
  background: string;
  label: string;
  value: string;
};

function providerTone(provider: Pick<SentinelProviderStatus, "usable" | "available" | "reason" | "active">): StatusChipTone {
  if (provider.active) {
    return { dot: "#d6b86c", border: "rgba(214,184,108,0.28)", background: "rgba(214,184,108,0.08)", label: "#f3ead2", value: "rgba(243,234,210,0.92)" };
  }
  if (provider.usable || provider.available) {
    return { dot: "#5dd39e", border: "rgba(93,211,158,0.18)", background: "rgba(93,211,158,0.06)", label: "rgba(219,230,225,0.82)", value: "rgba(223,232,240,0.82)" };
  }
  if (provider.reason === "key_missing" || provider.reason === "endpoint_missing") {
    return { dot: "rgba(214,184,108,0.78)", border: "rgba(214,184,108,0.18)", background: "rgba(214,184,108,0.06)", label: "rgba(209,195,160,0.86)", value: "rgba(188,176,140,0.82)" };
  }
  return { dot: "#ff7b86", border: "rgba(255,123,134,0.2)", background: "rgba(255,123,134,0.06)", label: "rgba(226,193,197,0.84)", value: "rgba(216,162,168,0.82)" };
}

function providerValue(provider: SentinelProviderStatus) {
  if (provider.reason === "disabled") return "disabled";
  if (!provider.configured && provider.id === "custom") return "missing";
  if (provider.reason === "error") return "error";
  if (!provider.usable && provider.available) return "limited";
  if (provider.available) {
    if (provider.id === "local") return "online";
    return "ready";
  }
  if (provider.reason === "key_missing") return "key missing";
  if (provider.reason === "endpoint_missing") return "endpoint missing";
  if (provider.reason === "disabled") return "disabled";
  return "offline";
}

function modeTone(mode: SentinelStatusPayload["mode"]): StatusChipTone {
  return {
    dot: mode === "auto" ? "rgba(196,203,212,0.8)" : "#d6b86c",
    border: "rgba(255,255,255,0.08)",
    background: mode === "auto" ? "rgba(255,255,255,0.06)" : "rgba(214,184,108,0.08)",
    label: "rgba(180,188,198,0.82)",
    value: mode === "auto" ? "rgba(226,232,238,0.88)" : "#f3ead2",
  };
}

function brainTone(brain: SentinelStatusPayload["brain"]): StatusChipTone {
  if (brain.loaded) {
    return { dot: "#5dd39e", border: "rgba(93,211,158,0.18)", background: "rgba(93,211,158,0.06)", label: "rgba(219,230,225,0.82)", value: "rgba(223,232,240,0.82)" };
  }
  return { dot: "rgba(214,184,108,0.78)", border: "rgba(214,184,108,0.18)", background: "rgba(214,184,108,0.06)", label: "rgba(209,195,160,0.86)", value: "rgba(188,176,140,0.82)" };
}

function StatusChip({ label, value, title, tone, compact = false }: { label: string; value?: string; title?: string; tone: StatusChipTone; compact?: boolean }) {
  return (
    <div className={`sps-chip${compact ? " sps-chip-compact" : ""}`} title={title} style={{ borderColor: tone.border, background: tone.background }}>
      <span className="sps-dot" style={{ background: tone.dot }} />
      <span className="sps-label" style={{ color: tone.label }}>{label}</span>
      {value ? <span className="sps-value" style={{ color: tone.value }}>{`: ${value}`}</span> : null}
    </div>
  );
}

export function SentinelProviderStatusBar({
  status,
  currentRun,
  queueCount = 0,
}: {
  status: SentinelStatusPayload | null;
  currentRun?: SentinelCurrentRun | null;
  queueCount?: number;
}) {
  if (!status) return null;
  const localProvider = status.providers.find((provider) => provider.id === "local") ?? null;
  const localLabel = localProvider?.label ?? "Local";
  const localStatus = localProvider ? providerValue(localProvider) : "offline";
  const localTitle = localProvider
    ? `${localLabel}: ${localStatus}${localProvider.model ? ` | ${localProvider.model}` : ""}`
    : `${localLabel}: offline`;
  const runningProvider = localProvider?.id === currentRun?.provider ? localLabel : currentRun?.provider ?? status.activeProvider;

  return (
    <div className="sps-wrap" aria-label="Sentinel Status">
      <div className="sps-row">
        {localProvider ? (
          <StatusChip
            label={localLabel}
            value={localStatus}
            title={localTitle}
            tone={providerTone(localProvider)}
            compact
          />
        ) : null}
        <StatusChip label="Brain" value={status.brain.loaded ? "loaded" : "missing"} title={`Brain: ${status.brain.loaded ? "loaded" : "missing"}`} tone={brainTone(status.brain)} compact />
        <StatusChip label="Mode" value={status.mode} title={`Router mode: ${status.mode}`} tone={modeTone(status.mode)} compact />
        <StatusChip
          label="APIs"
          value={status.apisDisabled ? "disabled" : "enabled"}
          title={status.apisDisabled ? "Paid APIs disabled" : "Paid APIs enabled"}
          tone={{
            dot: "rgba(196,203,212,0.82)",
            border: "rgba(255,255,255,0.12)",
            background: "rgba(255,255,255,0.05)",
            label: "rgba(214,220,226,0.82)",
            value: "#ffffff",
          }}
          compact
        />
        {status.activeProvider ? (
          <StatusChip
            label="Active"
            value={localProvider?.id === status.activeProvider ? localLabel : status.activeProvider}
            title={`Active provider: ${status.activeProvider}`}
            tone={{
              dot: "#f4efe6",
              border: "rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.06)",
              label: "rgba(214,220,226,0.86)",
              value: "#ffffff",
            }}
            compact
          />
        ) : null}
        {currentRun?.status === "streaming" || currentRun?.status === "queued" ? (
          <StatusChip
            label="Running"
            value={runningProvider ? `yes / ${runningProvider}` : "yes"}
            title={`Run status: ${currentRun.status}`}
            tone={{
              dot: "#d6b86c",
              border: "rgba(214,184,108,0.22)",
              background: "rgba(214,184,108,0.07)",
              label: "rgba(243,234,210,0.86)",
              value: "#f4efe6",
            }}
            compact
          />
        ) : null}
        {queueCount > 0 ? (
          <StatusChip
            label="Queue"
            value={String(queueCount)}
            title={`Queued prompts: ${queueCount}`}
            tone={{
              dot: "rgba(196,203,212,0.82)",
              border: "rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.05)",
              label: "rgba(214,220,226,0.82)",
              value: "#ffffff",
            }}
            compact
          />
        ) : null}
      </div>
      <style jsx>{`
        .sps-wrap { max-width:min(100%, 640px); min-width:0; overflow:hidden; padding-top:2px; }
        .sps-row { display:flex; align-items:center; gap:10px; min-width:0; flex-wrap:wrap; overflow:hidden; padding-bottom:4px; }
        .sps-row::-webkit-scrollbar { display:none; }
        .sps-chip { display:inline-flex; align-items:center; gap:7px; flex:0 0 auto; min-height:28px; padding:5px 11px; border-radius:999px; border:1px solid rgba(255,255,255,0.14); background:linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04)); backdrop-filter:blur(12px); box-shadow:inset 0 1px 0 rgba(255,255,255,0.035), 0 8px 24px rgba(0,0,0,0.18); white-space:nowrap; }
        .sps-chip-compact { gap:7px; }
        .sps-dot { width:7px; height:7px; border-radius:999px; box-shadow:0 0 0 1px rgba(255,255,255,0.07), 0 0 10px rgba(255,255,255,0.05); flex:0 0 auto; }
        .sps-label, .sps-value { font-size:11px; line-height:1; }
        .sps-label { letter-spacing:0.01em; opacity:0.92; }
        .sps-value { opacity:0.98; margin-left:1px; }
        @media (max-width: 1100px) {
          .sps-wrap { max-width:560px; }
        }
        @media (max-width: 860px) {
          .sps-wrap { max-width:420px; }
          .sps-row { gap:8px; }
          .sps-chip { min-height:26px; padding:4px 9px; }
        }
      `}</style>
    </div>
  );
}
