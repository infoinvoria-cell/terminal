import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type BenchmarkInfo = {
  diff: string;        // e.g. "+52.1%" — colour-coded by diffColor
  diffColor: "gold" | "red" | "muted";
  spyValue: string;    // e.g. "45.1%" — always red
};

// Keep old type for backward-compat (unused by new callers, but kept to avoid TS breaks)
type BenchmarkDelta = {
  text: string;
  color: "gold" | "red" | "muted";
};

type KpiCardProps = {
  label: string;
  value: string;
  className?: string;
  valueVariant?: "default" | "negative";
  subtitle?: string;
  title?: string;
  /** Decorative icon shown top-right */
  icon?: ReactNode;
  /** New benchmark mini-layout: diff | separator | spy value | spy logo */
  benchmarkInfo?: BenchmarkInfo;
  /** @deprecated use benchmarkInfo instead */
  benchmarkDelta?: BenchmarkDelta;
};

const DIFF_COLORS: Record<BenchmarkInfo["diffColor"], string> = {
  gold: "#C9A84C",
  red: "#ef4444",
  muted: "#6b7280",
};

export function KpiCard({
  label,
  value,
  className,
  valueVariant = "default",
  subtitle,
  title,
  icon,
  benchmarkInfo,
  benchmarkDelta,
}: KpiCardProps) {
  // Prefer new benchmarkInfo; fall back to old benchmarkDelta (legacy)
  const mini: BenchmarkInfo | null =
    benchmarkInfo ??
    (benchmarkDelta
      ? { diff: benchmarkDelta.text, diffColor: benchmarkDelta.color, spyValue: "" }
      : null);

  return (
    <div
      title={title}
      className={cn(
        "flex h-full min-h-[132px] flex-col justify-between rounded-[14px] border border-white/[0.055] bg-gradient-to-b from-[#26262d] to-[#111114] px-5 pb-5 pt-5 shadow-[0_20px_40px_-16px_rgba(0,0,0,0.55)]",
        title && "cursor-help",
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="shrink-0 text-[14px] font-medium leading-snug text-[rgba(180,192,210,0.6)] [font-family:var(--font-montserrat,'Montserrat',sans-serif)]">
          {label}
        </p>
        {icon && (
          <span style={{ flexShrink: 0, lineHeight: 0 }}>
            {icon}
          </span>
        )}
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <p
            className={cn(
              "shrink-0 text-[30px] font-bold leading-none tracking-tight [font-family:var(--font-numbers,'Nunito',sans-serif)]",
              valueVariant === "negative"
                ? "text-[#D6B24A]"
                : "text-[#F0F2F6]"
            )}
          >
            {value}
          </p>
          {subtitle ? (
            <p className="mt-1 text-[11px] text-[rgba(180,192,210,0.45)] [font-family:var(--font-montserrat,'Montserrat',sans-serif)]">
              {subtitle}
            </p>
          ) : null}
        </div>

        {/* Benchmark mini row: diff | separator | S&P value | logo */}
        {mini && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              flexShrink: 0,
              paddingBottom: 2,
            }}
          >
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: DIFF_COLORS[mini.diffColor],
                fontFamily: "var(--font-numbers,'Nunito',sans-serif)",
                whiteSpace: "nowrap",
                letterSpacing: "-0.01em",
              }}
            >
              {mini.diff}
            </span>
            {mini.spyValue && (
              <>
                <span
                  style={{
                    width: 1,
                    height: 12,
                    background: "rgba(255,255,255,0.13)",
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#ef5555",
                    fontFamily: "var(--font-numbers,'Nunito',sans-serif)",
                    whiteSpace: "nowrap",
                    letterSpacing: "-0.01em",
                  }}
                >
                  {mini.spyValue}
                </span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/assets/invest/spy.png"
                  alt="SPY"
                  style={{
                    width: 15,
                    height: 15,
                    borderRadius: "50%",
                    objectFit: "cover",
                    flexShrink: 0,
                  }}
                />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
