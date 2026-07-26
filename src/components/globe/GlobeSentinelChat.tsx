"use client";

import { useCallback, useRef, useState } from "react";
import type { AssetItem, GeoEventItem, OverlayToggleState } from "@/lib/globe/globe-types";

const GLOBE_QUICK_QUESTIONS = [
  "Was passiert gerade am Red Sea und wie betrifft das unser Portfolio?",
  "Welche Assets sind durch aktuelle Konflikte gefährdet?",
  "Erkläre den aktuellen Gold-Move",
  "Gibt es kritische Ereignisse heute die wir im Auge behalten sollten?",
  "Wie korrelieren aktuelle Erdbeben mit unseren Forex-Positionen?",
];

type ChatMsg = { role: "user" | "assistant"; content: string };

type Props = {
  geoEvents: GeoEventItem[];
  overlayState: OverlayToggleState;
  assets: AssetItem[];
  enabledAssets: string[];
  prices: Record<string, number>;
  onClose: () => void;
};

function buildGlobeSystemPrompt(props: Omit<Props, "onClose">): string {
  const { geoEvents, overlayState, assets, enabledAssets, prices } = props;
  const conflicts = geoEvents
    .filter((e) => /conflict/i.test(String(e.type || e.event_type || "")))
    .slice(0, 12)
    .map((e) => ({ location: e.location, severity: e.severity, headline: e.headline }));
  const quakes = geoEvents
    .filter((e) => /earthquake/i.test(String(e.type || e.event_type || "")))
    .slice(0, 10)
    .map((e) => ({ location: e.location, severity: e.severity }));
  const enabledSet = new Set(enabledAssets);
  const portfolioAssets = assets.filter((a) => enabledSet.has(a.id)).map((a) => a.symbol || a.name);
  const activeOverlays = Object.entries(overlayState)
    .filter(([, v]) => Boolean(v))
    .map(([k]) => k);
  const currentPrices: Record<string, number> = {};
  for (const a of assets) {
    if (enabledSet.has(a.id) && prices[a.id] != null) currentPrices[a.symbol || a.id] = prices[a.id];
  }

  return `Du bist ein Geopolitik- und Markt-Intelligence-Analyst für das Capitalife Terminal.
Du hast Zugriff auf Live-Daten vom Globe-Dashboard:
- Aktive Konflikte: ${JSON.stringify(conflicts)}
- Erdbeben: ${JSON.stringify(quakes)}
- Aktive Overlays: ${JSON.stringify(activeOverlays)}
- Portfolio Assets: ${portfolioAssets.join(", ")}
- Aktuelle Preise: ${JSON.stringify(currentPrices)}

Beantworte Fragen präzise, kurz, handelsrelevant.
Fokus auf: Was bedeutet das für unsere Assets? Welches Risiko/Chance entsteht?
Keine langen Erklärungen — direkte Einschätzung wie ein erfahrener Trader.`;
}

export default function GlobeSentinelChat({ geoEvents, overlayState, assets, enabledAssets, prices, onClose }: Props) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const send = useCallback(
    async (text: string) => {
      const q = text.trim();
      if (!q || busy) return;
      setInput("");
      const history = [...messages, { role: "user" as const, content: q }];
      setMessages([...history, { role: "assistant", content: "" }]);
      setBusy(true);

      const systemPrompt = buildGlobeSystemPrompt({ geoEvents, overlayState, assets, enabledAssets, prices });
      try {
        const res = await fetch("/api/sentinel/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [{ role: "system", content: systemPrompt }, ...history],
            stream: true,
            source: "globe",
            pageContext: { page: "globe", visibleTitle: "Globe Intel" },
          }),
        });

        if (!res.ok || !res.body) {
          const fallback =
            res.status === 503
              ? "Sentinel ist in der Cloud-Preview offline. Lokal (mit Brain/Provider) beantwortet Sentinel diese Frage mit dem obigen Globe-Kontext."
              : `Sentinel nicht erreichbar (${res.status}).`;
          setMessages((prev) => {
            const next = [...prev];
            next[next.length - 1] = { role: "assistant", content: fallback };
            return next;
          });
          setBusy(false);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let acc = "";
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += decoder.decode(value, { stream: true });
          setMessages((prev) => {
            const next = [...prev];
            next[next.length - 1] = { role: "assistant", content: acc };
            return next;
          });
          scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
        }
      } catch {
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { role: "assistant", content: "Verbindung zu Sentinel fehlgeschlagen." };
          return next;
        });
      } finally {
        setBusy(false);
      }
    },
    [busy, messages, geoEvents, overlayState, assets, enabledAssets, prices],
  );

  return (
    <div
      className="absolute right-2 top-12 z-40 flex flex-col overflow-hidden rounded-[10px] backdrop-blur-md"
      style={{
        width: 300,
        height: 400,
        background: "rgba(9,10,14,0.96)",
        border: "1px solid rgba(212,175,55,0.4)",
        boxShadow: "0 10px 32px rgba(0,0,0,0.6)",
      }}
    >
      <div className="flex items-center gap-1.5 px-2.5 py-2" style={{ borderBottom: "1px solid rgba(212,175,55,0.2)" }}>
        <span className="text-[12px]">🛰</span>
        <span className="text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: "#D4AF37" }}>
          Sentinel Globe Intel
        </span>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto text-[13px] leading-none text-white/40 transition hover:text-white/80"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      {/* Quick-question chips */}
      <div className="flex gap-1 overflow-x-auto no-scrollbar px-2 py-1.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        {GLOBE_QUICK_QUESTIONS.map((qq, i) => (
          <button
            key={i}
            type="button"
            onClick={() => send(qq)}
            disabled={busy}
            className="shrink-0 rounded-[6px] px-1.5 py-[3px] text-[8.5px] font-medium transition hover:brightness-125 disabled:opacity-40"
            style={{ background: "rgba(212,175,55,0.1)", color: "#e5d9a8", maxWidth: 140 }}
            title={qq}
          >
            {qq.length > 26 ? `${qq.slice(0, 24)}…` : qq}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="no-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto px-2.5 py-2">
        {messages.length === 0 && (
          <div className="pt-6 text-center text-[10px] leading-relaxed text-white/30">
            Frag Sentinel zu aktuellen Ereignissen auf dem Globe.<br />
            Kontext (Konflikte, Beben, Portfolio, Preise) wird automatisch mitgesendet.
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className="max-w-[85%] whitespace-pre-wrap rounded-[8px] px-2 py-1.5 text-[10.5px] leading-snug"
              style={
                m.role === "user"
                  ? { background: "rgba(212,175,55,0.16)", color: "#f0e4b8" }
                  : { background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.82)" }
              }
            >
              {m.content || (busy ? "…" : "")}
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="flex items-center gap-1 px-2 py-2" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") send(input); }}
          placeholder="Frage zu Globe-Events…"
          disabled={busy}
          className="min-w-0 flex-1 rounded-[6px] bg-white/[0.06] px-2 py-1.5 text-[10.5px] text-white/85 outline-none placeholder:text-white/25 disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => send(input)}
          disabled={busy || !input.trim()}
          className="shrink-0 rounded-[6px] px-2.5 py-1.5 text-[10px] font-semibold transition disabled:opacity-40"
          style={{ background: "rgba(212,175,55,0.2)", color: "#D4AF37" }}
        >
          ➤
        </button>
      </div>
    </div>
  );
}
