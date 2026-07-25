"use client";

import { useState } from "react";
import { Bar, CartesianGrid, ComposedChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { AnchoredWalkForwardFold, WalkForwardExperiment } from "@/lib/seasonality/walkForward/types";

const COLOR_GOLD = "#dcc476";
const COLOR_BULL = "#0dff00";
const COLOR_BEAR = "#ff0000";
const COLOR_MUTED = "#8a8a8a";
const BOX_CLASS = "rounded-[14px] border border-[rgba(220,196,118,0.18)] bg-[#0b0b0b] p-4 shadow-[inset_0_1px_0_rgba(220,196,118,0.08)]";
const INPUT_CLASS = "h-8 rounded-[6px] border border-[#1f1f1f] bg-[#080808] px-2 text-xs text-white outline-none w-full";

type ActiveTab = "config" | "folds" | "stitched";

interface Props {
  assetId: string;
  experiment: WalkForwardExperiment | null;
  loading: boolean;
  error: string;
  onRun: (config: V2Config) => void;
}

export interface V2Config {
  anchorYear: number;
  oosBlockYears: number;
  minInitialTrainYears: number;
  holdingDaysMin: number;
  holdingDaysMax: number;
  transactionCostBps: number;
}

function pct(v: number): string {
  return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(2)}%`;
}

function FoldStatusBadge({ status }: { status: AnchoredWalkForwardFold["validityStatus"] }) {
  const map: Record<string, { color: string; label: string }> = {
    VALID_OOS: { color: COLOR_BULL, label: "VALID" },
    VALID_OOS_USER_ATTESTED: { color: COLOR_BULL, label: "ATTESTED" },
    PROVISIONAL_INCOMPLETE_OOS: { color: COLOR_GOLD, label: "PROVISIONAL" },
    INVALID_LEAKAGE: { color: COLOR_BEAR, label: "LEAKAGE" },
    INVALID_MISSING_DATA: { color: COLOR_BEAR, label: "NO DATA" },
    BLOCKED_NOT_FROZEN: { color: COLOR_BEAR, label: "BLOCKED" },
  };
  const s = map[status] ?? { color: COLOR_MUTED, label: status };
  return <span style={{ color: s.color }} className="text-[8px]">{s.label}</span>;
}

function FoldsTable({ folds }: { folds: AnchoredWalkForwardFold[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[10px]">
        <thead>
          <tr className="border-b border-[#1a1a1a]">
            {["Fold", "Train", "OOS Period", "Direction", "Entry", "Hold", "OOS Net", "Status"].map((h) => (
              <th key={h} className="pb-1.5 pr-3 text-left text-[8px] uppercase tracking-widest text-[#4a4a4a]">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {folds.map((fold) => {
            const rule = fold.oosTrades[0];
            const netRet = fold.oosMetrics?.compoundedReturn;
            return (
              <tr key={fold.foldId} className="border-b border-[#0d0d0d] hover:bg-[#0d0d0d]">
                <td className="py-1.5 pr-3 text-[#5a5a5a]">{fold.foldId}</td>
                <td className="py-1.5 pr-3 text-[#5a5a5a]">{fold.trainingStartYear}–{fold.trainingEndYear}</td>
                <td className="py-1.5 pr-3 text-[#dcc476]">{fold.oosStartYear}–{fold.oosEndYear}</td>
                <td className="py-1.5 pr-3" style={{ color: rule?.direction === "LONG" ? COLOR_BULL : rule?.direction === "SHORT" ? COLOR_BEAR : COLOR_MUTED }}>
                  {rule?.direction ?? "—"}
                </td>
                <td className="py-1.5 pr-3 text-white">{rule?.plannedEntryMonthDay ?? "—"}</td>
                <td className="py-1.5 pr-3 text-[#8a8a8a]">{fold.oosTrades.length > 0 ? `${fold.oosTrades.length}t` : "—"}</td>
                <td className="py-1.5 pr-3" style={{ color: netRet != null ? (netRet >= 0 ? COLOR_BULL : COLOR_BEAR) : COLOR_MUTED }}>
                  {netRet != null ? pct(netRet) : "—"}
                </td>
                <td className="py-1.5"><FoldStatusBadge status={fold.validityStatus} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function StitchedOosView({ experiment }: { experiment: WalkForwardExperiment }) {
  const s = experiment.stitchedOosResult;
  if (!s) return <div className="py-4 text-center text-[11px] text-[#5a5a5a]">No stitched OOS result.</div>;

  const gateColor = s.researchGate.status === "PASSED_RESEARCH_GATE" ? COLOR_BULL : s.researchGate.status === "FAILED_RESEARCH_GATE" ? COLOR_BEAR : COLOR_MUTED;

  // Build equity curve from valid folds
  const validFolds = experiment.folds.filter((f) => s.validFoldIds.includes(f.foldId));
  let equity = 1;
  const eqData: { label: string; ret: number; equity: number }[] = [];
  for (const fold of validFolds) {
    for (const trade of fold.oosTrades) {
      equity *= 1 + trade.netReturn;
      eqData.push({
        label: `${trade.year}`,
        ret: parseFloat((trade.netReturn * 100).toFixed(2)),
        equity: parseFloat(((equity - 1) * 100).toFixed(2)),
      });
    }
  }

  return (
    <div className="space-y-3">
      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-2 text-[11px]">
        {[
          { label: "OOS Trades", value: String(s.oosTradeCount), color: undefined },
          { label: "Win Rate", value: `${s.oosWinRate.toFixed(0)}%`, color: s.oosWinRate >= 50 ? COLOR_BULL : COLOR_BEAR },
          { label: "Avg Return", value: pct(s.oosAverageReturn), color: s.oosAverageReturn >= 0 ? COLOR_BULL : COLOR_BEAR },
          { label: "Compounded", value: pct(s.oosCompoundedReturn), color: s.oosCompoundedReturn >= 0 ? COLOR_BULL : COLOR_BEAR },
          { label: "Max DD", value: `-${(s.oosMaxDrawdown * 100).toFixed(1)}%`, color: COLOR_MUTED },
          { label: "Profit Factor", value: s.oosProfitFactor.toFixed(2), color: s.oosProfitFactor >= 1.5 ? COLOR_BULL : s.oosProfitFactor >= 1 ? COLOR_GOLD : COLOR_BEAR },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-[6px] border border-[#1a1a1a] bg-[#060606] px-2 py-2">
            <div className="text-[8px] text-[#4a4a4a]">{label}</div>
            <div style={{ color: color ?? "#ffffff" }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Research gate */}
      <div className="flex items-center gap-2 rounded-[6px] border border-[#1a1a1a] bg-[#060606] px-3 py-2">
        <span className="text-[9px] text-[#5a5a5a]">Research Gate:</span>
        <span className="text-[11px] font-medium" style={{ color: gateColor }}>
          {s.researchGate.status === "PASSED_RESEARCH_GATE" ? "PASSED" : s.researchGate.status === "FAILED_RESEARCH_GATE" ? "FAILED" : "INSUFFICIENT DATA"}
        </span>
        {s.researchGate.failures.length > 0 && (
          <span className="text-[9px] text-[#5a5a5a]">· {s.researchGate.failures.length} failure(s)</span>
        )}
        {s.smallSampleWarning && <span className="text-[9px] text-[#dcc476]">· small sample</span>}
        {s.profitConcentrationWarning && <span className="text-[9px] text-[#dcc476]">· profit concentration</span>}
      </div>

      {/* OOS equity chart */}
      {eqData.length > 0 && (
        <div className="h-[140px]">
          <div className="mb-1 text-[9px] text-[#5a5a5a]">Annual OOS Returns (valid folds)</div>
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
            <ComposedChart data={eqData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#111" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: COLOR_MUTED, fontSize: 8 }} axisLine={{ stroke: "#1f1f1f" }} tickLine={false} />
              <YAxis tick={{ fill: COLOR_MUTED, fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v}%`} width={36} />
              <Tooltip
                formatter={(value: any) => [`${Number(value) >= 0 ? "+" : ""}${Number(value).toFixed(2)}%`]}
                contentStyle={{ background: "#0b0b0b", border: "1px solid #1f1f1f", fontSize: 10, borderRadius: 6 }}
                labelStyle={{ color: COLOR_MUTED }}
              />
              <ReferenceLine y={0} stroke="#2a2a2a" strokeDasharray="4 2" />
              <Bar dataKey="ret" fill="rgba(220,196,118,0.4)" radius={2} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="text-[8px] text-[#3a3a3a]">
        V2 Anchored Expanding OOS · Valid folds: {s.validFoldIds.join(", ")} · usedAsLiveSignal=false
      </div>
    </div>
  );
}

export function AnchoredExperimentPanel({ assetId, experiment, loading, error, onRun }: Props) {
  const [tab, setTab] = useState<ActiveTab>("config");
  const [anchorYear, setAnchorYear] = useState(2007);
  const [oosBlockYears, setOosBlockYears] = useState(2);
  const [minInitialTrainYears, setMinInitialTrainYears] = useState(5);
  const [holdingMin, setHoldingMin] = useState(5);
  const [holdingMax, setHoldingMax] = useState(20);
  const [costBps, setCostBps] = useState(0);

  function handleRun() {
    onRun({ anchorYear, oosBlockYears, minInitialTrainYears, holdingDaysMin: holdingMin, holdingDaysMax: holdingMax, transactionCostBps: costBps });
  }

  const tabs: { key: ActiveTab; label: string }[] = [
    { key: "config", label: "Config" },
    { key: "folds", label: `Folds${experiment ? ` (${experiment.folds.length})` : ""}` },
    { key: "stitched", label: "Stitched OOS" },
  ];

  return (
    <div className={BOX_CLASS}>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[11px] font-medium text-[#dcc476]">V2 Anchored Expanding OOS</span>
        <div className="flex gap-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`rounded-[5px] border px-2.5 py-1 text-[10px] ${tab === t.key ? "border-[#dcc476] bg-[rgba(220,196,118,0.12)] text-[#dcc476]" : "border-transparent text-[#5a5a5a] hover:text-[#8a8a8a]"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "config" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[9px] uppercase tracking-widest text-[#5a5a5a]">Anchor Year</label>
              <input type="number" className={INPUT_CLASS} value={anchorYear} min={2007} max={2020} onChange={(e) => setAnchorYear(Number(e.target.value))} />
            </div>
            <div>
              <label className="mb-1 block text-[9px] uppercase tracking-widest text-[#5a5a5a]">OOS Block Years</label>
              <input type="number" className={INPUT_CLASS} value={oosBlockYears} min={1} max={5} onChange={(e) => setOosBlockYears(Number(e.target.value))} />
            </div>
            <div>
              <label className="mb-1 block text-[9px] uppercase tracking-widest text-[#5a5a5a]">Min Initial Train Yrs</label>
              <input type="number" className={INPUT_CLASS} value={minInitialTrainYears} min={3} max={15} onChange={(e) => setMinInitialTrainYears(Number(e.target.value))} />
            </div>
            <div>
              <label className="mb-1 block text-[9px] uppercase tracking-widest text-[#5a5a5a]">Transaction Cost (bps)</label>
              <input type="number" className={INPUT_CLASS} value={costBps} min={0} max={500} onChange={(e) => setCostBps(Number(e.target.value))} />
            </div>
            <div>
              <label className="mb-1 block text-[9px] uppercase tracking-widest text-[#5a5a5a]">Holding Min (days)</label>
              <input type="number" className={INPUT_CLASS} value={holdingMin} min={1} max={60} onChange={(e) => setHoldingMin(Number(e.target.value))} />
            </div>
            <div>
              <label className="mb-1 block text-[9px] uppercase tracking-widest text-[#5a5a5a]">Holding Max (days)</label>
              <input type="number" className={INPUT_CLASS} value={holdingMax} min={1} max={60} onChange={(e) => setHoldingMax(Number(e.target.value))} />
            </div>
          </div>

          <button
            type="button"
            onClick={handleRun}
            disabled={loading}
            className="w-full rounded-[6px] border border-[rgba(220,196,118,0.3)] bg-[rgba(220,196,118,0.06)] py-2 text-[11px] text-[#dcc476] disabled:opacity-40 hover:bg-[rgba(220,196,118,0.12)]"
          >
            {loading ? "Computing…" : `Run V2 Anchored OOS · ${assetId}`}
          </button>

          {error && (
            <div className="rounded-[6px] border border-[rgba(255,0,0,0.2)] bg-[rgba(255,0,0,0.05)] px-3 py-2 text-[10px] text-[#ff4444]">
              {error}
            </div>
          )}
        </div>
      )}

      {tab === "folds" && (
        <div>
          {!experiment ? (
            <div className="py-6 text-center text-[11px] text-[#5a5a5a]">Run the V2 engine first.</div>
          ) : (
            <FoldsTable folds={experiment.folds} />
          )}
        </div>
      )}

      {tab === "stitched" && (
        <div>
          {!experiment ? (
            <div className="py-6 text-center text-[11px] text-[#5a5a5a]">Run the V2 engine first.</div>
          ) : (
            <StitchedOosView experiment={experiment} />
          )}
        </div>
      )}

      <div className="mt-3 border-t border-[#111] pt-2 text-[8px] text-[#3a3a3a]">
        V2 Anchored Expanding · AUTO_GRID · SYSTEM_FROZEN_BEFORE_OOS · usedAsLiveSignal=false
      </div>
    </div>
  );
}
