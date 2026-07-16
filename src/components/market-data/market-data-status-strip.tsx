"use client";

import { useEffect, useState } from "react";

type MarketDataSymbol = {
  status: "ok" | "stale" | "error" | "missing";
  last_fetch?: string | null;
};

type MarketDataStatusResponse = {
  updatedAt: string | null;
  authMode: "login" | "nologin" | "unavailable";
  overallStatus?: "ok" | "stale" | "error" | "missing";
  pollSeconds?: number;
  symbols: Record<string, MarketDataSymbol>;
};

function formatTime(value: string | null | undefined) {
  if (!value) return "n/a";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "n/a";
  return date.toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "Europe/Berlin",
  });
}

function summarizeSymbols(symbols: Record<string, MarketDataSymbol>) {
  const rows = Object.entries(symbols).slice(0, 5);
  if (!rows.length) return "Keine Cache-Daten";
  return rows.map(([symbol, item]) => `${symbol} ${item.status}`).join(" · ");
}

export function MarketDataStatusStrip() {
  const [data, setData] = useState<MarketDataStatusResponse | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const response = await fetch("/api/market-data/status", { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as MarketDataStatusResponse;
        if (active) setData(payload);
      } catch {
        if (active) setData(null);
      }
    }

    void load();
    const interval = window.setInterval(load, 60000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  const status = data?.overallStatus ?? "missing";
  const dotColor =
    status === "ok" ? "#6dd19b" : status === "stale" ? "#e5b567" : status === "error" ? "#ef7373" : "#666a73";

  return (
    <div
      className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-[14px] border px-4 py-2 text-[11px] text-[#b5b8c2]"
      style={{ borderColor: "rgba(255,255,255,0.07)", background: "rgba(18,19,24,0.76)" }}
    >
      <span className="flex items-center gap-2 text-white">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: dotColor }} />
        Market Data: TradingView delayed / latest bar
      </span>
      <span>Last Update {formatTime(data?.updatedAt)}</span>
      <span>Status {status}</span>
      <span>Auth {data?.authMode ?? "unavailable"}</span>
      <span>{summarizeSymbols(data?.symbols ?? {})}</span>
    </div>
  );
}
