"use client";

import type { PrivacyLevel } from "@/lib/sentinel/connect/privacy-classifier";

interface Props {
  level: PrivacyLevel | null;
  className?: string;
}

const LABELS: Record<PrivacyLevel, string> = {
  LOCAL_ONLY: "LOCAL",
  REMOTE_REDACTED: "SANITIZED REMOTE",
  REMOTE_SAFE: "REMOTE",
};

const COLORS: Record<PrivacyLevel, string> = {
  LOCAL_ONLY: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  REMOTE_REDACTED: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  REMOTE_SAFE: "bg-sky-500/15 text-sky-400 border-sky-500/30",
};

export function ConnectPrivacyBadge({ level, className = "" }: Props) {
  if (!level) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-mono tracking-wider ${COLORS[level]} ${className}`}
      title={level === "LOCAL_ONLY" ? "This query was processed entirely on-device" : level === "REMOTE_REDACTED" ? "Sensitive content was redacted before sending to external providers" : "Query sent to external providers as-is"}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
      {LABELS[level]}
    </span>
  );
}
