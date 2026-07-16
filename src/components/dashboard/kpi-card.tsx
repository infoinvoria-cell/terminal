import { cn } from "@/lib/utils";

type KpiCardProps = {
  label: string;
  value: string;
  className?: string;
  /** When set, value uses subtle color (e.g. drawdown) */
  valueVariant?: "default" | "negative";
  /** Small note shown below the value */
  subtitle?: string;
  /** Native browser tooltip on hover */
  title?: string;
};

export function KpiCard({
  label,
  value,
  className,
  valueVariant = "default",
  subtitle,
  title,
}: KpiCardProps) {
  return (
    <div
      title={title}
      className={cn(
        "flex h-full min-h-[132px] flex-col justify-between rounded-[20px] border border-white/[0.06] bg-gradient-to-b from-[#1c1d20] to-[#141517] px-5 pb-6 pt-5 shadow-[0_20px_40px_-16px_rgba(0,0,0,0.55)]",
        title && "cursor-help",
        className
      )}
    >
      <p className="shrink-0 text-[14px] font-medium leading-snug text-[color:var(--dash-muted)] [font-family:var(--font-montserrat),sans-serif]">
        {label}
      </p>
      <div>
        <p
          className={cn(
            "shrink-0 text-[30px] font-bold leading-none tracking-tight [font-family:var(--font-nunito),sans-serif]",
            valueVariant === "negative"
              ? "text-zinc-400"
              : "text-white"
          )}
        >
          {value}
        </p>
        {subtitle ? (
          <p className="mt-1 text-[11px] text-zinc-500 [font-family:var(--font-montserrat),sans-serif]">
            {subtitle}
          </p>
        ) : null}
      </div>
    </div>
  );
}
