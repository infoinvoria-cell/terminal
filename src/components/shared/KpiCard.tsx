"use client";

import { cn } from "@/lib/utils";
import type { CSSProperties } from "react";

/**
 * Master KPI Card — single source of truth for all KPI/metric tiles.
 * Style master: src/components/dashboard/kpi-card.tsx (Home dashboard).
 *
 * Variants:
 * - default: Home-style gradient card (min-h 132px, 30px value)
 * - compact: Smaller card for charts/panels (no min-height, 20px value)
 */

export interface KpiCardProps {
  label: string;
  value: string | number;
  /** Optional colour override for the value (e.g. green for profit, gold for metric) */
  color?: string;
  /** Negative variant: value rendered in zinc-400 */
  valueVariant?: "default" | "negative";
  /** Small note below the value */
  subtitle?: string;
  /** Delta badge label (e.g. "+2.1%") */
  delta?: string;
  /** Delta badge colour */
  deltaColor?: string;
  /** "default" = Home-style gradient full card | "compact" = small inline card */
  variant?: "default" | "compact";
  /** Native tooltip on hover */
  title?: string;
  className?: string;
  style?: CSSProperties;
}

export function KpiCard({
  label,
  value,
  color,
  valueVariant = "default",
  subtitle,
  delta,
  deltaColor = "#D8C16B",
  variant = "default",
  title,
  className,
  style,
}: KpiCardProps) {
  if (variant === "compact") {
    return (
      <div
        title={title}
        style={{
          background: "linear-gradient(to bottom, #26262d, #111114)",
          border: "1px solid rgba(255,255,255,0.055)",
          borderRadius: 10,
          padding: "10px 14px",
          ...style,
        }}
        className={className}
      >
        <div style={{
          fontFamily: "var(--font-text, sans-serif)",
          fontSize: 9,
          fontWeight: 700,
          color: "#5A6070",
          textTransform: "uppercase",
          letterSpacing: "1px",
          marginBottom: 6,
        }}>
          {label}
        </div>
        <div style={{
          fontFamily: "var(--font-numbers, sans-serif)",
          fontSize: 20,
          fontWeight: 600,
          color: color ?? (valueVariant === "negative" ? "#A1A1AA" : "#F0F0F0"),
          fontVariantNumeric: "tabular-nums",
        }}>
          {value}
        </div>
        {subtitle && (
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.30)", marginTop: 4 }}>
            {subtitle}
          </div>
        )}
        {delta && (
          <span style={{
            fontSize: 10, fontWeight: 700, color: deltaColor,
            marginTop: 4, display: "inline-block",
          }}>
            {delta}
          </span>
        )}
      </div>
    );
  }

  // default — Home gradient card
  return (
    <div
      title={title}
      style={style}
      className={cn(
        "flex h-full min-h-[132px] flex-col justify-between rounded-[14px] border border-white/[0.055]",
        "bg-gradient-to-b from-[#26262d] to-[#111114]",
        "px-5 pb-6 pt-5 shadow-[0_20px_40px_-16px_rgba(0,0,0,0.55)]",
        title && "cursor-help",
        className,
      )}
    >
      <p className="shrink-0 text-[14px] font-medium leading-snug text-[color:var(--dash-muted)] [font-family:var(--font-text),sans-serif]">
        {label}
      </p>
      <div>
        <p
          style={color ? { color } : undefined}
          className={cn(
            "shrink-0 text-[30px] font-bold leading-none tracking-tight [font-family:var(--font-numbers),sans-serif]",
            !color && (valueVariant === "negative" ? "text-zinc-400" : "text-white"),
          )}
        >
          {value}
        </p>
        {subtitle && (
          <p className="mt-1 text-[11px] text-zinc-500 [font-family:var(--font-text),sans-serif]">
            {subtitle}
          </p>
        )}
        {delta && (
          <span style={{ color: deltaColor }} className="mt-1 block text-[11px] font-bold">
            {delta}
          </span>
        )}
      </div>
    </div>
  );
}

export default KpiCard;
