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
  LOCAL_ONLY: "bg-white/8 text-white/80 border-white/15",       // LOCAL → white (most secure)
  REMOTE_REDACTED: "bg-[#C9A84C]/10 text-[#C9A84C] border-[#C9A84C]/25", // SANITIZED → gold (note-worthy)
  REMOTE_SAFE: "bg-white/5 text-white/50 border-white/10",      // REMOTE → dim white (neutral)
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
