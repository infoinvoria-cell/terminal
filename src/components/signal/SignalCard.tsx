"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { getMonitoringAssetIconUrl } from "@/lib/monitoring/monitoringAssetIcons";
import type { SignalCardModel } from "@/lib/signals/signal-types";

// ── Props ─────────────────────────────────────────────────────────────────────

export interface SignalCardProps {
  symbol: string;
  assetName: string;
  icon: string;
  strategyName: string;
  direction: "LONG" | "SHORT";
  tp: number;
  sl: number;
  state: "open" | "closed_tp" | "closed_sl" | "pending_invalid" | "pending_valid";
  pnl?: number;
  targetTime?: Date;
  closedAt?: Date;
  isActive?: boolean;
  onClick?: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatPercentage(value: number): string {
  const absoluteValue = Math.abs(value)
    .toFixed(2)
    .replace(/\.00$/, "")
    .replace(/(\.\d)0$/, "$1");
  if (value > 0) return `+${absoluteValue}%`;
  if (value < 0) return `-${absoluteValue}%`;
  return "0%";
}

function formatDateTime(date?: Date): string {
  if (!date) return "–";
  const now = new Date();
  const isToday =
    now.getFullYear() === date.getFullYear() &&
    now.getMonth() === date.getMonth() &&
    now.getDate() === date.getDate();
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const time = new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
  return `${isToday ? "Heute " : ""}${day}.${month} · ${time}`;
}

function getRemainingSeconds(targetTime?: Date): number {
  if (!targetTime) return 0;
  return Math.max(0, Math.ceil((targetTime.getTime() - Date.now()) / 1000));
}

function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")} min`;
}

function isImageSource(icon: string): boolean {
  return /^(https?:\/\/|\/|data:image\/)/i.test(icon);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ChartIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 32 32"
      style={{ height: 24, width: 24, color: "rgba(255,255,255,0.40)" }}
      fill="none"
    >
      <path
        d="M5.5 4.5v22h22"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="m9 22 5-5 4.2 3 8-9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <span
      aria-label="Valides Signal"
      style={{
        display: "inline-flex",
        height: 18,
        width: 18,
        flexShrink: 0,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "50%",
        background: "#d8bc67",
        color: "#171717",
      }}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        style={{ height: 12, width: 12 }}
        fill="none"
      >
        <path
          d="m5 10.2 3.1 3.1L15.2 6"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function AssetIcon({ icon, assetName }: { icon: string; assetName: string }) {
  return (
    <span
      style={{
        display: "flex",
        height: 30,
        width: 30,
        flexShrink: 0,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        borderRadius: "50%",
        background: "rgba(255,255,255,0.035)",
        fontSize: 22,
        lineHeight: 1,
      }}
    >
      {isImageSource(icon) ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={icon}
          alt={`${assetName} Icon`}
          style={{
            height: "100%",
            width: "100%",
            borderRadius: "50%",
            objectFit: "cover",
          }}
        />
      ) : (
        <span aria-hidden="true">{icon}</span>
      )}
    </span>
  );
}

// ── SignalCard ────────────────────────────────────────────────────────────────

export function SignalCard({
  symbol,
  assetName,
  icon,
  strategyName,
  direction,
  tp,
  sl,
  state,
  pnl = 0,
  targetTime,
  closedAt,
  isActive = false,
  onClick,
}: SignalCardProps) {
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [openedAt] = useState(() => new Date());
  const isPending = state === "pending_invalid" || state === "pending_valid";
  const [remainingSeconds, setRemainingSeconds] = useState(() =>
    getRemainingSeconds(targetTime),
  );

  useEffect(() => {
    if (!isPending) return;
    const updateCountdown = () => setRemainingSeconds(getRemainingSeconds(targetTime));
    updateCountdown();
    countdownIntervalRef.current = setInterval(updateCountdown, 1000);
    return () => {
      if (countdownIntervalRef.current !== null) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
    };
  }, [isPending, targetTime]);

  const displayDate = useMemo(() => {
    if (isPending) return targetTime;
    if (state === "closed_tp" || state === "closed_sl") return closedAt;
    return openedAt;
  }, [closedAt, isPending, openedAt, state, targetTime]);

  const cardBackground: CSSProperties = isActive
    ? {
        backgroundColor: "#151719",
        backgroundImage: `
          radial-gradient(circle at 100% 100%, rgba(247,226,157,0.34) 0%, rgba(216,188,103,0.20) 24%, rgba(216,188,103,0.07) 48%, rgba(216,188,103,0) 72%),
          linear-gradient(145deg, rgba(255,255,255,0.035), rgba(255,255,255,0))
        `,
      }
    : {
        backgroundColor: "#121417",
        backgroundImage: `linear-gradient(145deg, rgba(255,255,255,0.025), rgba(255,255,255,0))`,
      };

  const renderState = () => {
    const base: CSSProperties = {
      whiteSpace: "nowrap",
      fontSize: 15,
      fontWeight: 600,
      lineHeight: 1,
    };
    switch (state) {
      case "open":
        return (
          <span style={{ ...base, color: pnl >= 0 ? "#22c55e" : "#ef4444" }}>
            {formatPercentage(pnl)}
          </span>
        );
      case "closed_tp":
        return (
          <span style={{ ...base, color: "#22c55e" }}>
            TP {formatPercentage(tp)}
          </span>
        );
      case "closed_sl":
        return (
          <span style={{ ...base, color: "#ef4444" }}>
            SL {formatPercentage(sl)}
          </span>
        );
      case "pending_valid":
        return (
          <span
            style={{
              ...base,
              display: "flex",
              alignItems: "center",
              gap: 6,
              color: "#d8bc67",
            }}
          >
            {formatCountdown(remainingSeconds)}
            <CheckCircleIcon />
          </span>
        );
      case "pending_invalid":
        return (
          <span style={{ ...base, color: "rgba(255,255,255,0.55)" }}>
            {formatCountdown(remainingSeconds)}
          </span>
        );
    }
  };

  const isLong = direction === "LONG";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      style={{
        ...cardBackground,
        position: "relative",
        display: "flex",
        height: 168,
        width: "100%",
        minWidth: 0,
        flexDirection: "column",
        overflow: "hidden",
        borderRadius: 20,
        border: isActive
          ? "1px solid transparent"
          : "1px solid rgba(255,255,255,0.075)",
        padding: 18,
        textAlign: "left",
        boxShadow: isActive
          ? "0 16px 42px rgba(0,0,0,0.30)"
          : "0 12px 32px rgba(0,0,0,0.20)",
        transition:
          "transform 200ms ease-out, background-color 200ms ease-out, box-shadow 200ms ease-out",
        cursor: onClick ? "pointer" : "default",
      }}
    >
      {/* Row 1: Icon + Symbol + State chip */}
      <div
        style={{
          display: "grid",
          minWidth: 0,
          gridTemplateColumns: "minmax(0,1fr) auto",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div
          style={{
            display: "flex",
            minWidth: 0,
            alignItems: "center",
            gap: 10,
          }}
        >
          <AssetIcon icon={icon} assetName={assetName} />
          <div
            style={{
              display: "flex",
              minWidth: 0,
              alignItems: "baseline",
              gap: 8,
            }}
          >
            <span
              title={symbol}
              style={{
                maxWidth: 108,
                flexShrink: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontSize: 18,
                fontWeight: 700,
                lineHeight: 1,
                letterSpacing: "-0.025em",
                color: "#fff",
              }}
            >
              {symbol}
            </span>
            <span
              title={assetName}
              style={{
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontSize: 13,
                fontWeight: 500,
                lineHeight: 1,
                color: "rgba(255,255,255,0.35)",
              }}
            >
              {assetName}
            </span>
          </div>
        </div>
        <div style={{ flexShrink: 0 }}>{renderState()}</div>
      </div>

      {/* Row 2: Strategy + Date */}
      <div
        style={{
          marginTop: 18,
          display: "grid",
          minWidth: 0,
          gridTemplateColumns: "minmax(0,1fr) auto",
          alignItems: "center",
          gap: 12,
          fontSize: 11,
          fontWeight: 500,
          lineHeight: 1,
          letterSpacing: "-0.01em",
          color: "rgba(255,255,255,0.45)",
        }}
      >
        <span
          title={strategyName}
          style={{
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {strategyName}
        </span>
        <span suppressHydrationWarning style={{ flexShrink: 0, whiteSpace: "nowrap" }}>
          {formatDateTime(displayDate)}
        </span>
      </div>

      {/* Row 3: TP / SL */}
      <div
        style={{
          marginTop: 20,
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          columnGap: 12,
          rowGap: 4,
          fontSize: 12,
          fontWeight: 600,
          lineHeight: 1,
        }}
      >
        <span style={{ color: "#22c55e" }}>TP: {formatPercentage(tp)}</span>
        <span style={{ color: "#ef4444" }}>SL: {formatPercentage(sl)}</span>
      </div>

      {/* Row 4: Direction + Chart icon */}
      <div
        style={{
          marginTop: "auto",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <span
          style={{
            fontSize: 15,
            fontWeight: 700,
            lineHeight: 1,
            letterSpacing: "0.01em",
            color: isLong ? "#22c55e" : "#ef4444",
          }}
        >
          {isLong ? "▲" : "▼"} {direction}
        </span>
        <ChartIcon />
      </div>
    </button>
  );
}

// ── Data mapping from SignalCardModel ─────────────────────────────────────────

function parseTargetDate(label: string | undefined): Date | undefined {
  if (!label) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(label)) {
    const d = new Date(`${label}T15:00:00`);
    return isFinite(d.getTime()) && d > new Date() ? d : undefined;
  }
  const m = label.match(/(\d{1,2})\.(\d{1,2})\./);
  if (m) {
    const today = new Date();
    const day = parseInt(m[1]!, 10);
    const month = parseInt(m[2]!, 10) - 1;
    const d = new Date(today.getFullYear(), month, day, 15, 0, 0);
    if (d < today) d.setFullYear(today.getFullYear() + 1);
    return d;
  }
  return undefined;
}

function deriveState(card: SignalCardModel): SignalCardProps["state"] {
  if (card.status === "OPEN") return "open";
  if (card.status === "CLOSED") {
    return (card.changePct ?? 0) >= 0 ? "closed_tp" : "closed_sl";
  }
  const targetTime = parseTargetDate(card.nextSignalLabel);
  if (
    targetTime &&
    (card.status === "VALIDATION" || card.status === "PAPER_ONLY")
  ) {
    return "pending_valid";
  }
  return "pending_invalid";
}

// ── Default export: wrapper accepting SignalCardModel ─────────────────────────

export default function SignalCardFromModel({
  card,
  active,
  onSelect,
}: {
  card: SignalCardModel;
  active: boolean;
  onSelect: (card: SignalCardModel) => void;
}) {
  const iconUrl = getMonitoringAssetIconUrl({
    code: card.assetSymbol,
    assetId: card.iconKey,
    name: card.assetName,
    displaySymbol: card.displaySymbol,
  });

  const direction =
    card.direction === "LONG" || card.direction === "SHORT"
      ? card.direction
      : "LONG";

  const state = deriveState(card);
  const targetTime = parseTargetDate(card.nextSignalLabel);
  const closedAt =
    card.status === "CLOSED" && card.signalDate
      ? new Date(`${card.signalDate}T12:00:00`)
      : undefined;

  return (
    <SignalCard
      symbol={card.displaySymbol}
      assetName={card.assetName}
      icon={iconUrl ?? card.displaySymbol.charAt(0)}
      strategyName={card.strategyName}
      direction={direction}
      tp={card.tp ?? 0}
      sl={card.sl ?? 0}
      state={state}
      pnl={card.changePct ?? 0}
      targetTime={targetTime}
      closedAt={closedAt}
      isActive={active}
      onClick={() => onSelect(card)}
    />
  );
}
