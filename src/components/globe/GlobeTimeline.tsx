"use client";

import { useMemo, useState } from "react";
import type { GeoEventItem } from "@/lib/globe/globe-types";

// Known scheduled market events (static). Impact = affected tickers.
export const MARKET_EVENTS_STATIC: Array<{ date: string; type: string; label: string; impact: string[] }> = [
  { date: "2026-07-30", type: "fomc", label: "FOMC Meeting", impact: ["ES1!", "NQ1!", "GC1!"] },
  { date: "2026-07-24", type: "cpi", label: "US CPI Release", impact: ["GC1!", "6E1!", "ES1!"] },
  { date: "2026-07-24", type: "ecb", label: "ECB Decision", impact: ["6E1!", "FDAX1!"] },
  { date: "2026-07-18", type: "fomc", label: "FOMC Minutes", impact: ["ES1!", "GC1!"] },
  { date: "2026-07-11", type: "cpi", label: "US PPI Release", impact: ["GC1!", "ES1!"] },
];

type DotColor = "red" | "orange" | "gold";

type DayBucket = {
  date: string; // YYYY-MM-DD
  labelShort: string; // e.g. "24"
  isMonthStart: boolean;
  monthLabel: string;
  dots: DotColor[];
  events: Array<{ label: string; color: DotColor }>;
};

function eventDotColor(ev: GeoEventItem): DotColor {
  const t = String(ev.type || ev.event_type || "").toLowerCase();
  const sev = String(ev.severity || "").toLowerCase();
  if (t.includes("conflict")) return "red";
  if (t.includes("earthquake")) {
    return sev.includes("high") || sev.includes("critical") || sev.includes("severe") ? "red" : "orange";
  }
  return "orange"; // wildfire + everything else
}

function dotHex(c: DotColor): string {
  if (c === "red") return "#f05252";
  if (c === "gold") return "#C9A84C";
  return "#f59e0b";
}

type Props = {
  geoEvents: GeoEventItem[];
  selectedDay: string | null;
  onSelectDay: (day: string | null) => void;
  onClose: () => void;
  /** Number of days to show (default 30). */
  days?: number;
  /** Today as YYYY-MM-DD; supplied by the parent (client-side). */
  todayIso: string;
};

export default function GlobeTimeline({ geoEvents, selectedDay, onSelectDay, onClose, days = 30, todayIso }: Props) {
  const [hoverDay, setHoverDay] = useState<string | null>(null);

  const buckets = useMemo<DayBucket[]>(() => {
    const end = new Date(`${todayIso}T00:00:00Z`);
    const out: DayBucket[] = [];
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(end);
      d.setUTCDate(end.getUTCDate() - i);
      const iso = d.toISOString().slice(0, 10);
      const dayNum = d.getUTCDate();
      out.push({
        date: iso,
        labelShort: String(dayNum),
        isMonthStart: dayNum === 1 || i === days - 1,
        monthLabel: monthNames[d.getUTCMonth()],
        dots: [],
        events: [],
      });
    }
    const byDate = new Map(out.map((b) => [b.date, b]));
    for (const ev of geoEvents) {
      const iso = String(ev.date || ev.timestamp || "").slice(0, 10);
      const b = byDate.get(iso);
      if (!b) continue;
      const color = eventDotColor(ev);
      b.dots.push(color);
      if (b.events.length < 6) b.events.push({ label: String(ev.label || ev.headline || ev.location || ev.type || "Event").slice(0, 40), color });
    }
    for (const me of MARKET_EVENTS_STATIC) {
      const b = byDate.get(me.date);
      if (!b) continue;
      b.dots.push("gold");
      if (b.events.length < 6) b.events.push({ label: me.label, color: "gold" });
    }
    return out;
  }, [geoEvents, days, todayIso]);

  const hovered = hoverDay ? buckets.find((b) => b.date === hoverDay) : null;

  return (
    <div
      className="absolute inset-x-0 bottom-0 z-30"
      style={{ background: "rgba(8,9,12,0.92)", borderTop: "1px solid rgba(212,175,55,0.28)", backdropFilter: "blur(4px)" }}
    >
      {/* Hover tooltip */}
      {hovered && hovered.events.length > 0 && (
        <div
          className="absolute bottom-[34px] z-40 w-[210px] -translate-x-1/2 rounded-[8px] px-2.5 py-2"
          style={{
            left: `${((buckets.indexOf(hovered) + 0.5) / buckets.length) * 100}%`,
            background: "rgba(12,13,17,0.97)",
            border: "1px solid rgba(255,255,255,0.12)",
            boxShadow: "0 6px 20px rgba(0,0,0,0.5)",
          }}
        >
          <div className="mb-1 text-[9px] font-bold uppercase tracking-wide text-white/45">{hovered.date}</div>
          {hovered.events.map((e, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[10px] leading-tight text-white/75">
              <span className="inline-block h-[6px] w-[6px] shrink-0 rounded-full" style={{ background: dotHex(e.color) }} />
              <span className="truncate">{e.label}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-1 px-2" style={{ height: 30 }}>
        <span className="shrink-0 text-[8px] font-semibold uppercase tracking-[0.08em] text-[#C9A84C]/80">⏱</span>
        <div className="relative flex h-full min-w-0 flex-1 items-end">
          {buckets.map((b) => {
            const isSel = selectedDay === b.date;
            const red = b.dots.filter((d) => d === "red").length;
            const orange = b.dots.filter((d) => d === "orange").length;
            const gold = b.dots.filter((d) => d === "gold").length;
            return (
              <button
                key={b.date}
                type="button"
                onMouseEnter={() => setHoverDay(b.date)}
                onMouseLeave={() => setHoverDay((d) => (d === b.date ? null : d))}
                onClick={() => onSelectDay(isSel ? null : b.date)}
                className="group relative flex h-full flex-1 flex-col items-center justify-end pb-1.5"
                style={{ minWidth: 0 }}
                title={b.date}
              >
                {/* dots stacked */}
                <div className="flex flex-col-reverse items-center gap-[1px]">
                  {Array.from({ length: Math.min(red, 2) }).map((_, i) => (
                    <span key={`r${i}`} className="h-[3px] w-[3px] rounded-full" style={{ background: dotHex("red") }} />
                  ))}
                  {Array.from({ length: Math.min(orange, 2) }).map((_, i) => (
                    <span key={`o${i}`} className="h-[3px] w-[3px] rounded-full" style={{ background: dotHex("orange") }} />
                  ))}
                  {Array.from({ length: Math.min(gold, 1) }).map((_, i) => (
                    <span key={`g${i}`} className="h-[3px] w-[3px] rounded-full" style={{ background: dotHex("gold") }} />
                  ))}
                </div>
                {/* tick / day marker */}
                <div
                  className="absolute bottom-0 h-[5px] w-px"
                  style={{ background: isSel ? "#C9A84C" : "rgba(255,255,255,0.14)" }}
                />
                {isSel && (
                  <div className="absolute bottom-[7px] text-[7px] font-bold text-[#C9A84C]">{b.labelShort}</div>
                )}
                {b.isMonthStart && !isSel && (
                  <div className="absolute bottom-0 text-[7px] text-white/30">{b.monthLabel}</div>
                )}
              </button>
            );
          })}
        </div>
        {selectedDay && (
          <button
            type="button"
            onClick={() => onSelectDay(null)}
            className="shrink-0 rounded px-1.5 py-[2px] text-[8px] font-semibold text-[#C9A84C] transition hover:brightness-125"
            style={{ background: "rgba(212,175,55,0.12)" }}
          >
            {selectedDay} ✕
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 text-[12px] leading-none text-white/35 transition hover:text-white/80"
          aria-label="Close timeline"
        >
          ×
        </button>
      </div>
    </div>
  );
}
