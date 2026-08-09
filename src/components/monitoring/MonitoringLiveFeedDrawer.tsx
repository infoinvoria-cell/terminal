"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Rows3 } from "lucide-react";
import { getMonitoringAssetIconUrl } from "@/lib/monitoring/monitoringAssetIcons";
import type {
  MonitoringLiveFeedResponse,
  MonitoringLiveFeedRow,
  MonitoringLiveFeedStatus,
} from "@/lib/monitoring/live-feed-types";

type SignalState = "active" | "potential" | "pending" | "none";
type PriceDirection = "up" | "down" | "flat" | "unknown";

type Props = {
  signalStateBySymbol: Record<string, SignalState>;
  /** Symbols currently visible in the chart grid — shown pinned at top with highlight */
  pinnedSymbols?: string[];
};

const FALLBACK_POLLING_SECONDS = 30;
const FULL_DATA_STORAGE_KEY = "monitoring_live_feed_full_data";
const FULL_DATA_EVENT = "monitoring-live-feed-full-data-change";

function readStoredFullData(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(FULL_DATA_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function formatPrice(value: number | null, precision: number | null): string {
  if (value == null || !Number.isFinite(value)) return "-";
  if (precision != null && Number.isFinite(precision)) {
    return value.toLocaleString("en-US", {
      minimumFractionDigits: precision,
      maximumFractionDigits: precision,
    });
  }
  if (Math.abs(value) >= 1000) {
    return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
  if (Math.abs(value) >= 100) {
    return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
  return value.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

function formatDelay(delaySeconds: number | null): string {
  if (delaySeconds == null || delaySeconds <= 0) return "LIVE";
  const minutes = Math.round(delaySeconds / 60);
  return `${minutes}m`;
}

function formatCoverage(
  startUtc: string | null,
  endUtc: string | null,
  lastUpdateUtc: string | null,
  provider: string | null,
): string {
  if (!startUtc && !endUtc) return "No data";
  if (startUtc && endUtc) {
    if (startUtc.slice(0, 10) === endUtc.slice(0, 10)) return endUtc.slice(0, 10);
    return `${startUtc.slice(0, 10)} -> ${endUtc.slice(0, 10)}`;
  }
  const single = endUtc ?? startUtc;
  if (single) return single.slice(0, 10);
  if (lastUpdateUtc) return `${provider === "live_quotes" || provider === "tv_cache" ? "Live" : "Tick"} ${lastUpdateUtc.slice(0, 10)}`;
  return "No data";
}

function getPriceColor(status: MonitoringLiveFeedStatus, direction: PriceDirection): string {
  if (direction === "up") return "#f3f4f6";
  if (direction === "down") return "#c9a84c";
  if (status === "unavailable") return "rgba(255,255,255,0.3)";
  return "rgba(241,245,249,0.76)";
}

function FeedStatusBadge({
  status,
  delaySeconds,
}: {
  status: MonitoringLiveFeedStatus;
  delaySeconds: number | null;
}) {
  if (status === "realtime") {
    return (
      <span
        aria-label="No delay"
        title="No delay"
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.28)",
          boxShadow: "0 0 0 1px rgba(255,255,255,0.08)",
          display: "inline-block",
        }}
      />
    );
  }

  if (status === "delayed") {
    return (
      <span
        title={`Delayed | ${formatDelay(delaySeconds)}`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          minWidth: 28,
          height: 15,
          padding: "0 6px",
          borderRadius: 999,
          background: "rgba(201,168,76,0.16)",
          color: "#c9a84c",
          fontSize: 8,
          fontWeight: 700,
          letterSpacing: "0.03em",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {formatDelay(delaySeconds)}
      </span>
    );
  }

  return (
    <span
      title={status}
      style={{
        width: 7,
        height: 7,
        borderRadius: "50%",
        background: status === "stale" ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.16)",
        display: "inline-block",
      }}
    />
  );
}

function AssetIcon({ row }: { row: MonitoringLiveFeedRow }) {
  const url = getMonitoringAssetIconUrl({
    code: row.ticker,
    name: row.name,
    source: row.source,
    displaySymbol: row.ticker,
  });

  if (!url) {
    return (
      <span
        style={{
          width: 15,
          height: 15,
          borderRadius: 4,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(255,255,255,0.07)",
          color: "rgba(255,255,255,0.58)",
          fontSize: 8,
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        {row.ticker.slice(0, 1)}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      width={15}
      height={15}
      style={{ width: 15, height: 15, borderRadius: 4, objectFit: "contain", flexShrink: 0 }}
    />
  );
}

export default function MonitoringLiveFeedDrawer({ signalStateBySymbol, pinnedSymbols = [] }: Props) {
  const [items, setItems] = useState<MonitoringLiveFeedRow[]>([]);
  const [fullData, setFullData] = useState<boolean>(readStoredFullData);
  const [pollingSeconds, setPollingSeconds] = useState(FALLBACK_POLLING_SECONDS);
  const [countdownMode, setCountdownMode] = useState<"polling" | "live">("polling");
  const [lastAsOf, setLastAsOf] = useState<string | null>(null);
  const [ageLabel, setAgeLabel] = useState<string>("—");
  const [priceDirectionBySymbol, setPriceDirectionBySymbol] = useState<Record<string, PriceDirection>>({});
  const [canScrollMore, setCanScrollMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const prevPricesRef = useRef<Record<string, number | null>>({});

  useEffect(() => {
    try {
      window.localStorage.setItem(FULL_DATA_STORAGE_KEY, fullData ? "1" : "0");
      window.dispatchEvent(new CustomEvent(FULL_DATA_EVENT, { detail: { fullData } }));
    } catch {
      // ignore
    }
  }, [fullData]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const syncFade = () => {
      setCanScrollMore(node.scrollTop + node.clientHeight < node.scrollHeight - 2);
    };
    syncFade();
    node.addEventListener("scroll", syncFade);
    const resizeObserver = new ResizeObserver(syncFade);
    resizeObserver.observe(node);
    return () => {
      node.removeEventListener("scroll", syncFade);
      resizeObserver.disconnect();
    };
  }, [items, fullData]);

  useEffect(() => {
    let mounted = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const controller = new AbortController();

    const load = async () => {
      try {
        const res = await fetch("/api/monitoring/live-feed", {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!res.ok) return;

        const payload = (await res.json()) as MonitoringLiveFeedResponse;
        if (!mounted) return;

        const nextDirections: Record<string, PriceDirection> = {};
        for (const row of payload.items) {
          const prev = prevPricesRef.current[row.ticker];
          const next = row.price;

          if (prev == null || next == null) nextDirections[row.ticker] = "unknown";
          else if (next > prev) nextDirections[row.ticker] = "up";
          else if (next < prev) nextDirections[row.ticker] = "down";
          else nextDirections[row.ticker] = "flat";

          prevPricesRef.current[row.ticker] = next;
        }

        const nextPollingSeconds = payload.pollingSeconds || FALLBACK_POLLING_SECONDS;
        setItems(payload.items);
        setPriceDirectionBySymbol(nextDirections);
        setPollingSeconds(nextPollingSeconds);
        setCountdownMode(payload.countdownMode);
        if (payload.asOf) setLastAsOf(payload.asOf);
        setLoading(false);

        const nextPollMs =
          payload.countdownMode === "live"
            ? 5_000
            : Math.max(5, nextPollingSeconds) * 1000;
        timer = setTimeout(load, nextPollMs);
      } catch {
        if (!mounted) return;
        setLoading(false);
        timer = setTimeout(load, Math.max(5, pollingSeconds) * 1000);
      }
    };

    void load();

    return () => {
      mounted = false;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [pollingSeconds]);

  useEffect(() => {
    const format = (asOf: string | null): string => {
      if (!asOf) return "—";
      const ageMs = Date.now() - new Date(asOf).getTime();
      if (!Number.isFinite(ageMs) || ageMs < 0) return "—";
      const secs = Math.floor(ageMs / 1000);
      if (secs < 60) return `${secs}s`;
      const mins = Math.floor(secs / 60);
      if (mins < 60) return `${mins}m`;
      return `${Math.floor(mins / 60)}h`;
    };
    setAgeLabel(format(lastAsOf));
    const id = setInterval(() => setAgeLabel(format(lastAsOf)), 1000);
    return () => clearInterval(id);
  }, [lastAsOf]);

  const columns = fullData ? "28px minmax(0,1fr) 72px 40px 144px" : "28px minmax(0,1fr) 72px 40px";

  const pinnedSet = useMemo(() => new Set(pinnedSymbols), [pinnedSymbols]);

  const rows = useMemo(() => {
    const mapped = items.map((row) => ({
      ...row,
      signalState: signalStateBySymbol[row.ticker] ?? "none",
      priceDirection: priceDirectionBySymbol[row.ticker] ?? "unknown",
      isPinned: pinnedSet.has(row.ticker),
    }));
    // Pinned rows first, preserve original order within each group
    return [
      ...mapped.filter((r) => r.isPinned),
      ...mapped.filter((r) => !r.isPinned),
    ];
  }, [items, priceDirectionBySymbol, signalStateBySymbol, pinnedSet]);

  return (
    <aside
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
        width: "100%",
        marginLeft: 0,
        background: "#090b0f",
        borderLeft: "1px solid rgba(255,255,255,0.05)",
        boxShadow: "-14px 0 34px rgba(0,0,0,0.34)",
        overflow: "hidden",
        zIndex: 3,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "11px 12px 9px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          flexShrink: 0,
        }}
      >
        <Rows3 size={14} strokeWidth={1.9} color="rgba(255,255,255,0.72)" />
        <span style={{ fontSize: 13, fontWeight: 700, color: "#f3f4f6", letterSpacing: "0.01em" }}>
          Live Feed
        </span>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.52)", fontVariantNumeric: "tabular-nums" }}>
          {countdownMode === "live" ? "LIVE" : ageLabel}
        </span>
        <button
          type="button"
          aria-pressed={fullData}
          onClick={() => setFullData((prev) => !prev)}
          style={{
            marginLeft: "auto",
            height: 24,
            padding: "0 10px",
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.10)",
            background: fullData ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.04)",
            color: fullData ? "#f3f4f6" : "rgba(255,255,255,0.56)",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.03em",
            cursor: "pointer",
          }}
        >
          Full Data
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: columns,
          gap: 8,
          alignItems: "center",
          padding: "8px 12px 7px",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
          color: "rgba(255,255,255,0.42)",
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: "0.07em",
          textTransform: "uppercase",
          flexShrink: 0,
        }}
      >
        <span />
        <span>Symbol</span>
        <span style={{ textAlign: "right" }}>Price</span>
        <span style={{ textAlign: "right" }}>Signal</span>
        {fullData ? <span style={{ textAlign: "right" }}>Data</span> : null}
      </div>

      <div
        ref={scrollRef}
        style={{
          position: "relative",
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          overflowX: "hidden",
          padding: "4px 6px 18px",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        }}
      >
        {loading && rows.length === 0 ? (
          <div style={{ padding: "24px 10px", fontSize: 12, color: "rgba(255,255,255,0.42)" }}>Laden...</div>
        ) : null}

        {rows.map((row) => (
          <div
            key={row.instrumentId}
            title={`${row.provider ?? "unknown"}${row.lastUpdateUtc ? ` | ${row.lastUpdateUtc}` : ""}`}
            data-pinned={row.isPinned ? "1" : undefined}
            style={{
              display: "grid",
              gridTemplateColumns: columns,
              gap: 8,
              alignItems: "center",
              padding: "8px 6px",
              borderRadius: 8,
              borderBottom: "1px solid rgba(255,255,255,0.03)",
              background: row.isPinned ? "rgba(255,255,255,0.055)" : "transparent",
              transition: "background 140ms ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = row.isPinned
                ? "rgba(255,255,255,0.08)"
                : "rgba(255,255,255,0.03)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = row.isPinned
                ? "rgba(255,255,255,0.055)"
                : "transparent";
            }}
          >
            <div style={{ display: "flex", justifyContent: "center" }}>
              <FeedStatusBadge status={row.feedStatus} delaySeconds={row.delaySeconds} />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
              <AssetIcon row={row} />
              <div
                style={{
                  minWidth: 0,
                  display: "flex",
                  alignItems: "baseline",
                  gap: 6,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#f8fafc",
                    flexShrink: 0,
                  }}
                >
                  {row.ticker}
                </span>
                <span
                  style={{
                    fontSize: 9,
                    color: "rgba(255,255,255,0.5)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {row.name}
                  {row.venue ? ` | ${row.venue}` : ""}
                </span>
              </div>
            </div>

            <div
              style={{
                textAlign: "right",
                fontSize: 11,
                fontWeight: 700,
                fontVariantNumeric: "tabular-nums",
                color: getPriceColor(row.feedStatus, row.priceDirection),
                whiteSpace: "nowrap",
                transition: "color 180ms ease",
              }}
            >
              {formatPrice(row.price, row.pricePrecision)}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", color: "rgba(255,255,255,0.28)" }}>
              {row.signalState === "active" ? (
                <Check size={14} strokeWidth={2.2} color="#c9a84c" />
              ) : row.signalState === "potential" || row.signalState === "pending" ? (
                <Check size={14} strokeWidth={2.2} color="rgba(255,255,255,0.4)" />
              ) : (
                <span style={{ fontSize: 12 }}>-</span>
              )}
            </div>

            {fullData ? (
              <div
                style={{
                  textAlign: "right",
                  fontSize: 9,
                  color: "rgba(255,255,255,0.44)",
                  fontVariantNumeric: "tabular-nums",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {formatCoverage(row.dataStartUtc, row.dataEndUtc, row.lastUpdateUtc, row.provider)}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {canScrollMore ? (
        <div
          style={{
            pointerEvents: "none",
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: 34,
            background: "linear-gradient(180deg, rgba(9,11,15,0) 0%, rgba(9,11,15,0.94) 100%)",
          }}
        />
      ) : null}
    </aside>
  );
}
