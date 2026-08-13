import { cn } from "@/lib/utils";
import { deserializeTrades, compoundGains } from "@/lib/trades-analytics";
import type { DashboardKpis, SerializedTrade } from "@/lib/trades-analytics";
import type { CapalifeData } from "@/lib/capitalife-data";
import type { SpyBenchmarkKpis } from "@/lib/benchmark/spy-kpis";
import type { UniversalKpiStrings } from "@/components/dashboard/universal-kpi-strip";

type SecondaryKpiRowProps = {
  kpis: DashboardKpis;
  trades?: SerializedTrade[];
  capalifeData?: CapalifeData;
  showBenchmark?: boolean;
  spyKpis?: SpyBenchmarkKpis | null;
  /** Portfolio API KPIs — takes precedence over capalifeData official_kpis when present */
  universal?: Pick<UniversalKpiStrings, "calmar" | "sharpe" | "profitFactor" | "positiveMonths" | "volatility" | "portfolioStartDate">;
};

type BenchmarkMini = {
  diff: string;
  diffColor: "gold" | "red" | "muted";
  spyValue: string;
};

function computeMonthlyStats(trades: SerializedTrade[], maxDrawdownPct?: number) {
  if (!trades.length) return null;
  const rows = deserializeTrades(trades);
  const map = new Map<string, number[]>();
  for (const r of rows) {
    const key = `${r.date.getFullYear()}-${String(r.date.getMonth() + 1).padStart(2, "0")}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r.gainPct);
  }
  const monthly = [...map.values()].map((gains) => compoundGains(gains));
  if (!monthly.length) return null;
  const best = Math.max(...monthly);
  const worst = Math.min(...monthly);
  const pos = monthly.filter((m) => m >= 0).length;
  const total = monthly.length;
  const totalReturn = compoundGains(monthly);
  const dd = maxDrawdownPct != null && maxDrawdownPct > 0.01 ? maxDrawdownPct : null;
  const calmar = dd != null
    ? ((Math.pow(1 + totalReturn / 100, 12 / total) - 1) * 100) / dd
    : null;
  return { best, worst, pos, total, calmar };
}

type SecondaryCardProps = {
  label: string;
  value: string;
  benchmarkMini?: BenchmarkMini;
  sub?: string;
  title?: string;
};

const DIFF_COLORS: Record<BenchmarkMini["diffColor"], string> = {
  gold: "#C9A84C",
  red: "#ef4444",
  muted: "#6b7280",
};

function SecondaryCard({ label, value, benchmarkMini, sub, title }: SecondaryCardProps) {
  return (
    <div
      title={title}
      className={cn(
        "flex min-h-[118px] w-full min-w-0 flex-col justify-between rounded-[14px] border border-white/[0.055] bg-gradient-to-b from-[#26262d] to-[#111114] px-4 pb-4 pt-4 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.55)]",
        title && "cursor-help"
      )}
    >
      <p className="shrink-0 text-[13px] font-medium leading-snug text-[color:var(--dash-muted)] [font-family:var(--font-text),sans-serif]">
        {label}
      </p>
      <div className="flex min-h-0 w-full min-w-0 flex-col gap-0.5">
        <div className="flex w-full min-w-0 flex-row items-end justify-between gap-2">
          <p className="min-w-0 flex-1 truncate text-[26px] font-bold leading-none tracking-tight text-white [font-family:var(--font-numbers),sans-serif]">
            {value}
          </p>
          {/* Benchmark mini: diff | separator | S&P value | logo */}
          {benchmarkMini && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 3,
                flexShrink: 0,
                paddingBottom: 2,
              }}
            >
              <span
                style={{
                  fontSize: 11.5,
                  fontWeight: 700,
                  color: DIFF_COLORS[benchmarkMini.diffColor],
                  fontFamily: "var(--font-numbers,'Nunito',sans-serif)",
                  whiteSpace: "nowrap",
                }}
              >
                {benchmarkMini.diff}
              </span>
              {benchmarkMini.spyValue && (
                <>
                  <span
                    style={{
                      width: 1,
                      height: 11,
                      background: "rgba(255,255,255,0.12)",
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      fontSize: 11.5,
                      fontWeight: 700,
                      color: "#ef5555",
                      fontFamily: "var(--font-numbers,'Nunito',sans-serif)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {benchmarkMini.spyValue}
                  </span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/assets/invest/spy.png"
                    alt="SPY"
                    style={{
                      width: 14,
                      height: 14,
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
        {sub ? (
          <p className="text-[10px] text-zinc-600 [font-family:var(--font-text),sans-serif]">
            {sub}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function computeMonthlyStatsFromJson(data: CapalifeData) {
  const rows = data.performanceMonthly.monthly_returns;
  if (!rows.length) return null;
  const monthly = rows.map((r) => r.return_pct);
  const best = Math.max(...monthly);
  const worst = Math.min(...monthly);
  const pos = monthly.filter((m) => m >= 0).length;
  const total = monthly.length;
  const officialCalmar = data.whiteSwanCombinedEvidence?.official_kpis?.calmar;
  const calmar = (officialCalmar != null && officialCalmar > 0) ? officialCalmar : null;
  return { best, worst, pos, total, calmar };
}

function numDelta(portfolioVal: number, spyVal: number, higherIsBetter: boolean): BenchmarkMini {
  const diff = portfolioVal - spyVal;
  const better = higherIsBetter ? diff > 0 : diff < 0;
  const diffColor: BenchmarkMini["diffColor"] =
    Math.abs(diff) < 0.005 ? "muted" : better ? "gold" : "red";
  const sign = diff >= 0 ? "+" : "";
  return {
    diff: `${sign}${diff.toFixed(2)}`,
    diffColor,
    spyValue: spyVal.toFixed(2),
  };
}

export function SecondaryKpiRow({ kpis, trades, capalifeData, showBenchmark, spyKpis, universal }: SecondaryKpiRowProps) {
  const m = (trades && trades.length > 0)
    ? computeMonthlyStats(trades, kpis.maxDrawdownPct)
    : (capalifeData ? computeMonthlyStatsFromJson(capalifeData) : null);
  const fmtPct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
  void fmtPct;

  const active = showBenchmark && spyKpis != null;

  // Primary: use portfolio API values from universal (combined-track-record.json).
  // Fallback to capalifeData official_kpis only when universal values are absent.
  const officialKpis = capalifeData?.whiteSwanCombinedEvidence?.official_kpis;

  const calmar = (() => {
    if (universal?.calmar != null) { const n = parseFloat(universal.calmar); return isNaN(n) ? null : n; }
    const c = officialKpis?.calmar; return c != null && c > 0 ? c : m?.calmar ?? null;
  })();
  const sharpe = (() => {
    if (universal?.sharpe != null) { const n = parseFloat(universal.sharpe); return isNaN(n) ? null : n; }
    return officialKpis?.sharpe ?? null;
  })();
  const pf = (() => {
    if (universal?.profitFactor != null) { const n = parseFloat(universal.profitFactor); return isNaN(n) ? null : n; }
    return officialKpis?.profit_factor ?? null;
  })();

  // Positive months: prefer universal (from portfolio API daily series)
  const posMonthoStr = universal?.positiveMonths ?? null; // e.g. "16/29"

  // Annualized volatility: prefer universal (from portfolio API daily series std dev × √252)
  const volatility = (() => {
    if (universal?.volatility != null) {
      const n = parseFloat(universal.volatility.replace(/[^0-9.\-]/g, ""));
      return isNaN(n) ? null : n;
    }
    // Legacy: std dev of monthly returns × √12
    const rows = capalifeData?.performanceMonthly?.monthly_returns;
    if (!rows || rows.length < 2) return null;
    const vals = rows.map(r => r.return_pct);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / (vals.length - 1);
    return Math.sqrt(variance) * Math.sqrt(12);
  })();

  // Pos.Months benchmark: integer diff + SPY count
  // Parse positive months from universal if available (format: "16/29")
  const parsedPosMonths = posMonthoStr ? (() => {
    const parts = posMonthoStr.split("/");
    const pos = parseInt(parts[0] ?? "", 10);
    const total = parseInt(parts[1] ?? "", 10);
    return (!isNaN(pos) && !isNaN(total)) ? { pos, total } : null;
  })() : null;
  const posMonthsDisplay = parsedPosMonths
    ? `${parsedPosMonths.pos} / ${parsedPosMonths.total}`
    : (m ? `${m.pos} / ${m.total}` : "—");
  const posMini: BenchmarkMini | undefined = (() => {
    if (!active || !spyKpis) return undefined;
    const portfPos = parsedPosMonths?.pos ?? m?.pos;
    if (portfPos == null) return undefined;
    const spyPos = spyKpis.posMonths;
    const diff = portfPos - spyPos;
    const diffColor: BenchmarkMini["diffColor"] =
      Math.abs(diff) < 1 ? "muted" : diff > 0 ? "gold" : "red";
    return {
      diff: `${diff >= 0 ? "+" : ""}${diff}`,
      diffColor,
      spyValue: `${spyPos}/${spyKpis.totalMonths}`,
    };
  })();

  return (
    <div className="w-full min-w-0">
      <div className="grid w-full grid-cols-6 gap-3">
        <SecondaryCard
          label="Calmar Ratio"
          value={calmar != null ? calmar.toFixed(1) : "—"}
          title="Calmar Ratio = Annualized Return / Max Drawdown. Source: official performance statement KPIs."
          benchmarkMini={
            active && calmar != null
              ? numDelta(calmar, spyKpis!.calmar, true)
              : undefined
          }
        />
        <SecondaryCard
          label="Sharpe Ratio"
          value={sharpe != null && sharpe > 0 ? sharpe.toFixed(1) : "—"}
          title="Risk-adjusted return (Sharpe Ratio). Source: official performance statement KPIs."
          benchmarkMini={
            active && sharpe != null
              ? numDelta(sharpe, spyKpis!.sharpe, true)
              : undefined
          }
        />
        <SecondaryCard
          label="Profit Factor"
          value={pf != null && pf > 0 ? pf.toFixed(2) : "—"}
          title="Gross profit / gross loss (Profit Factor). Source: official performance statement KPIs."
        />
        <SecondaryCard
          label="Pos. Months"
          value={posMonthsDisplay}
          title="Positive months of total months in track record. Source: portfolio API daily series."
          benchmarkMini={posMini}
        />
        <SecondaryCard
          label="Volatility"
          value={volatility != null ? `${volatility.toFixed(1)}%` : "—"}
          title="Annualized volatility (std dev of monthly returns × √12)."
          benchmarkMini={
            active && spyKpis != null && volatility != null
              ? numDelta(volatility, spyKpis.volatilityPct, false)
              : undefined
          }
        />
        <SecondaryCard
          label="Start Date"
          value={(() => {
            const d = universal?.portfolioStartDate;
            if (!d) return "15.04.2024";
            try {
              const dt = new Date(d);
              return `${String(dt.getUTCDate()).padStart(2, "0")}.${String(dt.getUTCMonth() + 1).padStart(2, "0")}.${dt.getUTCFullYear()}`;
            } catch { return d; }
          })()}
          title="Track record inception date (UTC)."
        />
      </div>
    </div>
  );
}
