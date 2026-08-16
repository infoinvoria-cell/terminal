"use client";

// The real Brain globe (same canvas/data as the /brain page), reused here at
// a smaller size next to Sentinel's Aurum mark — a looping animation, no
// interactivity. Purely visual: appears while the user is engaging Sentinel.

import useSWR from "swr";
import { BrainGlobeCanvas, brainGraphFetcher } from "@/components/brain-graph/BrainGlobeCanvas";
import type { NetworkData } from "@/components/brain-graph/BrainGlobeCanvas";

export function SentinelBrainGlobe({ size = 260, active = false }: { size?: number; active?: boolean }) {
  const { data: network, error, isLoading } = useSWR<NetworkData>(
    "/api/brain-graph/network",
    brainGraphFetcher,
    { refreshInterval: 3_600_000 },
  );

  const hasGraph = Array.isArray(network?.nodes) && network.nodes.length > 0;

  return (
    <div className="sbg-wrap" style={{ width: size, height: size }}>
      {hasGraph && !error && !isLoading ? (
        <BrainGlobeCanvas
          data={network!}
          spinning={active}
          onSelect={() => {}}
          selected={null}
          interactive={false}
          dotScale={0.6}
          spinSpeed={2.2}
        />
      ) : null}
      <style jsx>{`
        .sbg-wrap { position:relative;flex-shrink:0; }
      `}</style>
    </div>
  );
}

export function BrainConnector({ active = false }: { active?: boolean }) {
  return (
    <div className={`sbc-wrap${active ? " sbc-active" : ""}`}>
      <svg className="sbc-svg" viewBox="0 0 64 24" preserveAspectRatio="none" fill="none" xmlns="http://www.w3.org/2000/svg">
        <line x1="0" y1="12" x2="64" y2="12" stroke="rgba(190,196,206,0.45)" strokeWidth="1" />
        <circle cx="0" cy="12" r="1.6" className="sbc-dot sbc-dot-1" />
        <circle cx="0" cy="12" r="1.6" className="sbc-dot sbc-dot-2" />
        <circle cx="0" cy="12" r="1.6" className="sbc-dot sbc-dot-3" />
      </svg>
      <style jsx>{`
        .sbc-wrap { position:relative;flex-shrink:0;width:100%;height:100%; }
        .sbc-svg { width:100%;height:100%;display:block; }
        .sbc-dot { opacity:0;transform-box:fill-box;transform-origin:center; }
        .sbc-active .sbc-dot-1 { animation:sbc-travel 1.5s linear infinite; }
        .sbc-active .sbc-dot-2 { animation:sbc-travel 1.5s linear infinite -0.5s; }
        .sbc-active .sbc-dot-3 { animation:sbc-travel 1.5s linear infinite -1s; }
        @keyframes sbc-travel {
          0%   { opacity:0;    transform:translateX(0)     scale(0.5); fill:#C9A84C; filter:drop-shadow(0 0 3px rgba(214,184,108,0.9)); }
          8%   { opacity:1; }
          50%  { fill:#f4efe6; filter:drop-shadow(0 0 5px rgba(244,239,230,0.85)); }
          92%  { opacity:1; }
          100% { opacity:0;    transform:translateX(64px) scale(1.7); fill:#ffffff; filter:drop-shadow(0 0 6px rgba(255,255,255,0.95)); }
        }
        @media (prefers-reduced-motion:reduce) {
          .sbc-dot-1,.sbc-dot-2,.sbc-dot-3 { animation:none;opacity:0.6;fill:#C9A84C; }
        }
      `}</style>
    </div>
  );
}
