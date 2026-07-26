"use client";

import { useEffect, useRef, useState } from "react";
import type { CountryGeoSnapshot } from "@/app/api/geo/country/[iso]/route";
import type { WorldCity } from "@/data/globe/world-cities";
import { COUNTRY_BY_ISO } from "@/data/globe/country-data";

export interface SelectedGeoEntity {
  kind: "country" | "city" | "continent";
  id: string;        // ISO for country, city.id for city, continent name for continent
  name: string;
  iso?: string;      // country ISO (for both country and city entities)
  lat: number;
  lng: number;
}

interface Props {
  entity: SelectedGeoEntity | null;
  onClose: () => void;
  onZoomTo: (lat: number, lng: number, altitude: number) => void;
}

function fmt(n: number | null, decimals = 2): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 10000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (Math.abs(n) >= 100) return n.toFixed(1);
  return n.toFixed(decimals);
}

function fmtChange(n: number | null): { text: string; color: string } {
  if (n == null || !Number.isFinite(n)) return { text: "—", color: "text-white/40" };
  const sign = n >= 0 ? "+" : "";
  return {
    text: `${sign}${n.toFixed(2)}%`,
    color: n > 0 ? "text-[#39ff64]" : n < 0 ? "text-[#FF3333]" : "text-white/40",
  };
}

function timeAgo(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const h = Math.floor(diff / 3600000);
    if (h < 1) return `${Math.floor(diff / 60000)}m ago`;
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  } catch {
    return "";
  }
}

export function GeoContextPanel({ entity, onClose, onZoomTo }: Props) {
  const [snapshot, setSnapshot] = useState<CountryGeoSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"markets" | "news">("markets");
  const abortRef = useRef<AbortController | null>(null);

  const iso = entity?.iso ?? (entity?.kind === "country" ? entity.id : null);
  const country = iso ? COUNTRY_BY_ISO.get(iso) : null;

  useEffect(() => {
    if (!iso) { setSnapshot(null); return; }
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setSnapshot(null);
    fetch(`/api/geo/country/${iso}`, { signal: ctrl.signal })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (!ctrl.signal.aborted) setSnapshot(data); })
      .catch(() => {})
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false); });
    return () => ctrl.abort();
  }, [iso]);

  if (!entity) return null;

  const idxChange = fmtChange(snapshot?.index?.changePercent ?? null);
  const fxChange = fmtChange(snapshot?.currency?.changePercent ?? null);

  const zoomAltitudes: Record<string, number> = {
    country: 0.55,
    city: 0.14,
    continent: 1.6,
  };

  return (
    <div
      className="absolute right-2 top-2 z-40 flex flex-col"
      style={{
        width: 260,
        maxHeight: "calc(100% - 16px)",
        background: "rgba(10,10,14,0.93)",
        border: "1px solid rgba(200,200,200,0.28)",
        borderRadius: 10,
        boxShadow: "0 8px 40px rgba(0,0,0,0.65), 0 0 0 1px rgba(200,200,200,0.06)",
        backdropFilter: "blur(14px)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-white/[0.07] px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          {country && (
            <span className="text-lg leading-none">{country.flag}</span>
          )}
          <div className="min-w-0">
            <div className="truncate text-[12px] font-semibold tracking-[0.04em] text-white">
              {entity.name}
            </div>
            {country && (
              <div className="text-[9px] text-white/35 uppercase tracking-[0.08em]">
                {country.region}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => onZoomTo(entity.lat, entity.lng, zoomAltitudes[entity.kind] ?? 0.55)}
            className="flex items-center gap-1 rounded border border-[#c8c8c8]/40 px-1.5 py-0.5 text-[9px] font-medium text-[#c8c8c8] transition hover:border-[#c8c8c8]/70 hover:bg-[#c8c8c8]/10"
            title="Zoom to"
          >
            <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
              <circle cx="4" cy="4" r="3" stroke="currentColor" strokeWidth="1.2"/>
              <line x1="6.5" y1="6.5" x2="8.5" y2="8.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
            Zoom
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex h-5 w-5 items-center justify-center rounded border border-white/10 text-white/40 transition hover:border-white/30 hover:text-white/80"
          >
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
              <line x1="1" y1="1" x2="7" y2="7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              <line x1="7" y1="1" x2="1" y2="7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/[0.06]">
        {(["markets", "news"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 py-1.5 text-[9px] font-semibold uppercase tracking-[0.08em] transition ${
              tab === t
                ? "border-b border-[#c8c8c8] text-[#c8c8c8]"
                : "text-white/30 hover:text-white/60"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div
              className="h-5 w-5 animate-spin rounded-full border-2"
              style={{ borderColor: "rgba(200,200,200,0.2)", borderTopColor: "#c8c8c8" }}
            />
          </div>
        )}

        {!loading && tab === "markets" && (
          <div className="px-3 py-3 flex flex-col gap-3">
            {/* Index */}
            {snapshot?.index ? (
              <div>
                <div className="mb-1 text-[8px] uppercase tracking-[0.1em] text-white/30">Stock Index</div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-white/60 truncate">{snapshot.index.symbol}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-white tabular-nums">{fmt(snapshot.index.price)}</span>
                    <span className={`text-[10px] font-medium tabular-nums ${idxChange.color}`}>{idxChange.text}</span>
                  </div>
                </div>
                {snapshot.index.price != null && (
                  <div className="mt-1 h-[2px] w-full rounded-full bg-white/[0.06]">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(100, Math.max(2, 50 + (snapshot.index.changePercent ?? 0) * 10))}%`,
                        background: (snapshot.index.changePercent ?? 0) >= 0 ? "#39ff64" : "#FF3333",
                        opacity: 0.7,
                      }}
                    />
                  </div>
                )}
              </div>
            ) : !loading && (
              <div className="text-[10px] text-white/25 text-center py-2">No index data</div>
            )}

            {/* Currency */}
            {snapshot?.currency && (
              <div>
                <div className="mb-1 text-[8px] uppercase tracking-[0.1em] text-white/30">Currency vs USD</div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-white/60 truncate">{snapshot.currency.pair.replace("=X", "").replace("USD", "/USD")}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-white tabular-nums">{fmt(snapshot.currency.price, 4)}</span>
                    <span className={`text-[10px] font-medium tabular-nums ${fxChange.color}`}>{fxChange.text}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Geo coords */}
            <div className="border-t border-white/[0.06] pt-2">
              <div className="grid grid-cols-2 gap-1">
                <div>
                  <div className="text-[8px] text-white/25 uppercase tracking-[0.08em]">Latitude</div>
                  <div className="text-[10px] tabular-nums text-white/60">{entity.lat.toFixed(2)}°</div>
                </div>
                <div>
                  <div className="text-[8px] text-white/25 uppercase tracking-[0.08em]">Longitude</div>
                  <div className="text-[10px] tabular-nums text-white/60">{entity.lng.toFixed(2)}°</div>
                </div>
                {entity.kind !== "country" && (
                  <div className="col-span-2">
                    <div className="text-[8px] text-white/25 uppercase tracking-[0.08em]">Type</div>
                    <div className="text-[10px] text-white/60 capitalize">{entity.kind}</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {!loading && tab === "news" && (
          <div className="px-3 py-2 flex flex-col gap-2">
            {(snapshot?.news ?? []).length === 0 ? (
              <div className="py-6 text-center text-[10px] text-white/25">No news available</div>
            ) : (
              snapshot!.news.map((item, i) => (
                <div key={i} className="border-b border-white/[0.05] pb-2 last:border-0 last:pb-0">
                  <a
                    href={item.url || undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-[10px] leading-snug text-white/80 hover:text-[#c8c8c8] transition"
                  >
                    {item.title}
                  </a>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[8px] text-white/30">
                    <span>{item.source}</span>
                    <span>·</span>
                    <span>{timeAgo(item.publishedAt)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Footer: entity kind badge */}
      <div className="border-t border-white/[0.05] px-3 py-1.5">
        <div className="flex items-center gap-1.5">
          <div
            className="h-1.5 w-1.5 rounded-full animate-pulse"
            style={{ background: "#c8c8c8" }}
          />
          <span className="text-[8px] uppercase tracking-[0.1em] text-white/30">
            {entity.kind === "city" ? "City View" : entity.kind === "country" ? "Country View" : "Continental View"}
          </span>
        </div>
      </div>
    </div>
  );
}
