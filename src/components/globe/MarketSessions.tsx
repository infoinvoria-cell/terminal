"use client";

import { useEffect, useState } from "react";

// Major exchange sessions. Hours are local to each tz; DST handled by Intl.
const SESSIONS = [
  { code: "SYD", name: "Sydney", tz: "Australia/Sydney", open: 10 * 60, close: 16 * 60 },
  { code: "TYO", name: "Tokyo", tz: "Asia/Tokyo", open: 9 * 60, close: 15 * 60 },
  { code: "FRA", name: "Frankfurt", tz: "Europe/Berlin", open: 9 * 60, close: 17 * 60 + 30 },
  { code: "LON", name: "London", tz: "Europe/London", open: 8 * 60, close: 16 * 60 + 30 },
  { code: "NY", name: "New York", tz: "America/New_York", open: 9 * 60 + 30, close: 16 * 60 },
] as const;

type SessionState = { code: string; name: string; open: boolean; minsToEvent: number };

function localMinutesAndDay(tz: string): { mins: number; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const hour = Number(get("hour")) % 24;
  const minute = Number(get("minute"));
  const wdMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { mins: hour * 60 + minute, weekday: wdMap[get("weekday")] ?? 1 };
}

function computeSessions(): SessionState[] {
  return SESSIONS.map((s) => {
    const { mins, weekday } = localMinutesAndDay(s.tz);
    const weekday_ok = weekday >= 1 && weekday <= 5;
    const open = weekday_ok && mins >= s.open && mins < s.close;
    const minsToEvent = open ? s.close - mins : s.open - mins;
    return { code: s.code, name: s.name, open, minsToEvent };
  });
}

function fmtCountdown(mins: number): string {
  if (mins <= 0 || !Number.isFinite(mins)) return "";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h${m.toString().padStart(2, "0")}` : `${m}m`;
}

export default function MarketSessions() {
  const [sessions, setSessions] = useState<SessionState[]>([]);

  useEffect(() => {
    const tick = () => setSessions(computeSessions());
    tick();
    const iv = window.setInterval(tick, 30_000);
    return () => window.clearInterval(iv);
  }, []);

  if (!sessions.length) return null;
  const openCount = sessions.filter((s) => s.open).length;

  return (
    <div
      className="absolute bottom-3 left-3 z-30 flex items-center gap-2 rounded-md px-2 py-1 backdrop-blur-sm"
      style={{ background: "rgba(8,9,12,0.7)", border: "1px solid rgba(255,255,255,0.07)" }}
      title={`${openCount} von ${sessions.length} Börsen offen`}
    >
      {sessions.map((s) => (
        <div key={s.code} className="flex items-center gap-1" title={`${s.name} · ${s.open ? `schließt in ${fmtCountdown(s.minsToEvent)}` : `öffnet in ${fmtCountdown(s.minsToEvent)}`}`}>
          <span
            className="inline-block h-[6px] w-[6px] rounded-full"
            style={{
              background: s.open ? "#22C55E" : "rgba(255,255,255,0.18)",
              boxShadow: s.open ? "0 0 5px rgba(74,222,128,0.7)" : "none",
            }}
          />
          <span className="text-[8.5px] font-semibold tracking-[0.04em]" style={{ color: s.open ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.32)" }}>
            {s.code}
          </span>
        </div>
      ))}
    </div>
  );
}
