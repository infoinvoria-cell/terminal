"use client";

import { useEffect, useMemo, useState } from "react";
import { MACRO_EVENTS, MACRO_TYPE_ICON as TYPE_ICON } from "@/lib/globe/macroEvents";

type Props = { onClose: () => void };

function fmtCountdown(ms: number): string {
  if (ms <= 0) return "live";
  const totalMin = Math.floor(ms / 60000);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function EconomicCalendar({ onClose }: Props) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const iv = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(iv);
  }, []);

  const upcoming = useMemo(() => {
    return MACRO_EVENTS.map((e) => ({ ...e, ms: new Date(e.iso).getTime() - now }))
      .filter((e) => e.ms > -3 * 3600 * 1000) // keep events up to 3h after start
      .sort((a, b) => a.ms - b.ms)
      .slice(0, 8);
  }, [now]);

  return (
    <div
      className="absolute left-3 top-12 z-40 flex w-[250px] flex-col overflow-hidden rounded-[10px] backdrop-blur-md"
      style={{ maxHeight: 340, background: "rgba(9,10,14,0.96)", border: "1px solid rgba(212,175,55,0.4)", boxShadow: "0 10px 30px rgba(0,0,0,0.6)" }}
    >
      <div className="flex items-center gap-1.5 px-2.5 py-2" style={{ borderBottom: "1px solid rgba(212,175,55,0.2)" }}>
        <span className="text-[11px]">📅</span>
        <span className="text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: "#C9A84C" }}>Economic Calendar</span>
        <button type="button" onClick={onClose} className="ml-auto text-[13px] leading-none text-white/40 transition hover:text-white/80" aria-label="Close">×</button>
      </div>
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto py-1">
        {upcoming.length === 0 && <div className="py-6 text-center text-[10px] text-white/30">Keine Termine</div>}
        {upcoming.map((e) => {
          const imminent = e.ms <= 48 * 3600 * 1000;
          const live = e.ms <= 0;
          return (
            <div
              key={e.iso}
              className="flex items-center gap-2 px-2.5 py-1.5"
              style={{ background: live ? "rgba(74,222,128,0.08)" : imminent ? "rgba(212,175,55,0.07)" : "transparent" }}
            >
              <span className="text-[12px]">{TYPE_ICON[e.type] ?? "•"}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[10.5px] font-medium text-white/85">{e.label}</div>
                <div className="truncate text-[8.5px] text-white/40">{e.impact.join(" · ")}</div>
              </div>
              <span
                className="shrink-0 rounded px-1.5 py-[2px] text-[9px] font-bold tabular-nums"
                style={{
                  color: live ? "#22C55E" : imminent ? "#C9A84C" : "rgba(255,255,255,0.5)",
                  background: live ? "rgba(74,222,128,0.14)" : imminent ? "rgba(212,175,55,0.12)" : "rgba(255,255,255,0.05)",
                }}
              >
                {fmtCountdown(e.ms)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
