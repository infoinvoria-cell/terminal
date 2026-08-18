"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AssetItem, GeoEventItem, GlobeCameraState, NewsItem, OverlayToggleState } from "@/lib/globe/globe-types";
import type { PhysicalRegionOverlay } from "@/lib/globe/physical-intelligence";

const GLOBE_QUICK_QUESTIONS = [
  "Warum ist diese Region markiert?",
  "Was ist für das ausgewählte Asset wichtig?",
  "Ist diese Information live oder stale?",
  "Welche globalen Events sind relevant?",
];

type ChatMsg = { role: "user" | "assistant"; content: string };

type Props = {
  geoEvents: GeoEventItem[];
  overlayState: OverlayToggleState;
  assets: AssetItem[];
  enabledAssets: string[];
  prices: Record<string, number>;
  selectedAsset?: AssetItem | null;
  physicalRegion?: PhysicalRegionOverlay | null;
  news?: NewsItem[];
  camera?: GlobeCameraState;
  onClose: () => void;
};

function buildGlobeSystemPrompt(props: Omit<Props, "onClose">): string {
  const { geoEvents, overlayState, assets, enabledAssets, prices, selectedAsset, physicalRegion, news, camera } = props;
  const enabledSet = new Set(enabledAssets);
  const activeOverlays = Object.entries(overlayState).filter(([, value]) => Boolean(value)).map(([key]) => key);
  const selectedPrice = selectedAsset ? prices[selectedAsset.id] ?? null : null;
  const events = geoEvents.slice(0, 12).map((event) => ({
    type: event.type,
    location: event.location,
    severity: event.severity,
    timestamp: event.timestamp ?? event.date,
    headline: event.headline,
  }));
  const contextNews = (news ?? []).slice(0, 8).map((item) => ({
    title: item.title,
    category: item.category,
    publishedAt: item.publishedAt ?? item.timestamp,
    source: item.sourceDomain ?? item.source,
  }));
  const physical = physicalRegion ? {
    commodity: physicalRegion.commodity,
    region: physicalRegion.label,
    score: physicalRegion.score,
    officialScore: physicalRegion.officialScore,
    vhiScore: physicalRegion.vhiScore,
    state: physicalRegion.state,
    source: physicalRegion.source,
    freshnessHours: physicalRegion.freshnessHours,
    updatedAt: physicalRegion.updatedAt,
  } : null;

  return `Du bist Sentinel, der read-only Globe-Kontextanalyst im Capitalife Terminal.
Arbeite ausschließlich mit dem übergebenen Kontext und kennzeichne Unsicherheit.
Keine Order, keine Broker-Aktion, keine Trading-Multiplikatoren und keine erfundenen Daten.

Globe-Kontext:
- Ausgewähltes Asset: ${JSON.stringify(selectedAsset ? { id: selectedAsset.id, name: selectedAsset.name, symbol: selectedAsset.symbol, category: selectedAsset.category, country: selectedAsset.country, price: selectedPrice } : null)}
- Aktive Assets: ${JSON.stringify(assets.filter((asset) => enabledSet.has(asset.id)).map((asset) => asset.symbol || asset.name).slice(0, 24))}
- Aktive Overlays: ${JSON.stringify(activeOverlays)}
- Kamera/Region: ${JSON.stringify(camera ?? null)}
- Physical Intelligence (shadow-only): ${JSON.stringify(physical)}
- Relevante News: ${JSON.stringify(contextNews)}
- Globale Events: ${JSON.stringify(events)}

Antworte präzise und kompakt. Trenne REAL/RECENT von STALE/UNAVAILABLE und erwähne bei Physical Intelligence immer: observation-only, canonical multiplier 1.00x.`;
}

export default function GlobeSentinelChat({ onClose, ...context }: Props) {
  const { physicalRegion, selectedAsset } = context;
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => () => requestRef.current?.abort(), []);

  const send = useCallback(async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    const history = [...messages, { role: "user" as const, content: q }];
    setInput("");
    setMessages([...history, { role: "assistant", content: "" }]);
    setBusy(true);
    const controller = new AbortController();
    requestRef.current?.abort();
    requestRef.current = controller;

    try {
      const res = await fetch("/api/sentinel/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "system", content: buildGlobeSystemPrompt(context) }, ...history],
          mode: "auto",
          stream: true,
        }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const fallback = res.status === 503
          ? "Sentinel ist aktuell nicht verfügbar. Der Globe bleibt read-only und unverändert."
          : `Sentinel nicht erreichbar (${res.status}).`;
        setMessages((prev) => [...prev.slice(0, -1), { role: "assistant", content: fallback }]);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let answer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        answer += decoder.decode(value, { stream: true });
        setMessages((prev) => [...prev.slice(0, -1), { role: "assistant", content: answer }]);
        requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }));
      }
    } catch (error) {
      if ((error as Error)?.name !== "AbortError") {
        setMessages((prev) => [...prev.slice(0, -1), { role: "assistant", content: "Verbindung zu Sentinel fehlgeschlagen." }]);
      }
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
      setBusy(false);
    }
  }, [busy, context, messages]);

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-[10px]" style={{ background: "rgba(9,10,14,0.96)", border: "1px solid rgba(212,175,55,0.32)" }}>
      <div className="flex shrink-0 items-center gap-2 border-b border-white/[0.07] px-3 py-2">
        <img src="/sentinel-logo.png" alt="" width={16} height={16} className="object-contain" />
        <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#d7c27a]">Sentinel · Globe Context</span>
        <span className="ml-auto text-[8px] uppercase tracking-[0.12em] text-white/35">Read-only</span>
        <button type="button" onClick={onClose} aria-label="Close Sentinel" className="ml-1 text-[14px] leading-none text-white/40 hover:text-white">×</button>
      </div>
      <div className="no-scrollbar flex shrink-0 gap-1 overflow-x-auto border-b border-white/[0.05] px-2 py-1.5">
        {GLOBE_QUICK_QUESTIONS.map((question) => (
          <button key={question} type="button" onClick={() => send(question)} disabled={busy} title={question} className="shrink-0 rounded-[6px] border border-[#c9a84c]/20 bg-[#c9a84c]/[0.08] px-2 py-1 text-[8px] text-[#e5d9a8] disabled:opacity-40">
            {question.length > 25 ? `${question.slice(0, 23)}…` : question}
          </button>
        ))}
      </div>
      <div className="flex shrink-0 items-center gap-2 border-b border-white/[0.05] px-3 py-1 text-[8px] uppercase tracking-[0.08em] text-white/35">
        <span>Context</span>
        <span className="truncate text-white/65">
          {physicalRegion ? `${physicalRegion.commodity} · ${physicalRegion.label}` : selectedAsset?.symbol || selectedAsset?.name || "Globe viewport"}
        </span>
        {physicalRegion && <span className="ml-auto shrink-0 text-[#d7c27a]">{Number(physicalRegion.score).toFixed(1)}</span>}
      </div>
      <div ref={scrollRef} className="no-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-2">
        {messages.length === 0 && <div className="pt-4 text-center text-[10px] leading-relaxed text-white/30">Frage Sentinel zum sichtbaren Globe-Kontext.<br />Physical Intelligence bleibt shadow-only.</div>}
        {messages.map((message, index) => (
          <div key={`${message.role}-${index}`} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className="max-w-[92%] whitespace-pre-wrap rounded-[7px] px-2.5 py-1.5 text-[10px] leading-snug" style={message.role === "user" ? { background: "rgba(212,175,55,0.14)", color: "#f0e4b8" } : { background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.82)" }}>
              {message.content || (busy ? "…" : "")}
            </div>
          </div>
        ))}
      </div>
      <div className="flex shrink-0 items-center gap-1 border-t border-white/[0.06] px-2 py-2">
        <input value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void send(input); }} placeholder="Frage zu Globe-Events…" disabled={busy} aria-label="Sentinel question" className="min-w-0 flex-1 rounded-[6px] bg-white/[0.06] px-2 py-1.5 text-[10px] text-white/85 outline-none placeholder:text-white/25 disabled:opacity-50" />
        <button type="button" onClick={() => void send(input)} disabled={busy || !input.trim()} aria-label="Send Sentinel question" className="shrink-0 rounded-[6px] bg-[#c9a84c]/20 px-2.5 py-1.5 text-[10px] font-semibold text-[#c9a84c] disabled:opacity-40">➤</button>
      </div>
    </div>
  );
}
